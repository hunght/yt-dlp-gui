import { z } from "zod";
import { publicProcedure, t } from "@/api/trpc";
import { logger } from "@/helpers/logger";
import { app, net } from "electron";
import fs from "fs";
import path from "path";
import os from "os";
import { getDirectLatestDownloadUrl, getLatestReleaseApiUrl, getYtDlpAssetName } from "./utils";
import { mapYtDlpMetadata, extractChannelData, extractSubtitleLanguages } from "./utils/metadata";
import { upsertVideoFromMeta, upsertChannelData } from "./utils/database";
import { spawnYtDlpWithLogging, extractVideoId, runYtDlpJson } from "./utils/ytdlp";
import { spawn } from "child_process";
import { eq, desc, inArray, sql } from "drizzle-orm";
import { youtubeVideos, channels, channelPlaylists, videoWatchStats, videoTranscripts, videoAnnotations } from "@/api/db/schema";
import defaultDb from "@/api/db";

const getBinDir = () => path.join(app.getPath("userData"), "bin");
const getVersionFilePath = () => path.join(getBinDir(), "yt-dlp-version.txt");
const getBinaryFilePath = () => path.join(getBinDir(), getYtDlpAssetName(process.platform));
const getThumbCacheDir = () => path.join(app.getPath("userData"), "cache", "thumbnails");
const getTranscriptsDir = () => path.join(app.getPath("userData"), "cache", "transcripts");

async function ensureDir(p: string) {
  try {
    fs.mkdirSync(p, { recursive: true });
  } catch {}
}

async function downloadImageToCache(url: string, filenameBase: string): Promise<string | null> {
  try {
    await ensureDir(getThumbCacheDir());
    const extMatch = url.match(/\.(jpg|jpeg|png|webp)(?:\?|$)/i);
    const ext = (extMatch?.[1] || "jpg").toLowerCase();
    const filePath = path.join(getThumbCacheDir(), `${filenameBase}.${ext}`);
    const res = await fetch(url);
    if (!res.ok) {
      logger.warn("[thumb] download failed", { url, status: res.status });
      return null;
    }
    const arrayBuffer = await res.arrayBuffer();
    fs.writeFileSync(filePath, Buffer.from(arrayBuffer));
    return filePath;
  } catch (err) {
    logger.warn("[thumb] download error", { url, error: String(err) });
    return null;
  }
}

function ensureDirSync(p: string) {
  try {
    fs.mkdirSync(p, { recursive: true });
  } catch {}
}

/**
 * Normalize language code to base 2-letter code
 * Examples: "en-orig" -> "en", "en-us" -> "en", "vi" -> "vi"
 */
function normalizeLangCode(lang: string | null | undefined): string {
  if (!lang) return "en";
  // Extract first 2 letters (base language code)
  const normalized = lang.toLowerCase().split(/[-_]/)[0].substring(0, 2);
  return normalized || "en";
}

// spawnYtDlpWithLogging and extractVideoId are imported from utils/ytdlp.ts

// VTT -> plain text converter: strips timing/headers, tags, and concatenates text lines
export function parseVttToText(content: string): string {
  // 1) Split and drop headers/timing/cue numbers
  const cleanedLines = content
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      // Skip webvtt header or timing lines
      if (/^WEBVTT/i.test(trimmed)) return false;
      if (/^NOTE/i.test(trimmed)) return false;
      if (/^Kind:/i.test(trimmed)) return false;
      if (/^Language:/i.test(trimmed)) return false;
      if (/^\d{2}:\d{2}:\d{2}\.\d{3}\s+--\>/.test(trimmed)) return false; // cue timing
      if (/^\d+$/.test(trimmed)) return false; // cue number
      return true;
    })
    .map((line) => {
      // Remove all VTT/HTML-like tags including timing tags <00:02:53.680> and cue tags <c>, </c>
      const withoutTags = line.replace(/<[^>]+>/g, "");
      return withoutTags.replace(/\s+/g, " ").trim();
    })
    .filter((line) => line.length > 0);

  // 2) Deduplicate aggressively: skip consecutive duplicates and lines that already
  //    appear in the recent output tail (common with YouTube auto-captions where
  //    a full line is repeated across adjacent cues).
  const out: string[] = [];
  const recent: string[] = [];

  for (const line of cleanedLines) {
    const lc = line.toLowerCase();
    // Skip if same as any of the last few lines (exact duplicate)
    const isRecentDup = recent.some((r) => r === lc);

    // Skip if this full line is already present in the tail of output
    const tail = out.join(" ");
    const tailSlice = tail.slice(Math.max(0, tail.length - 600)).toLowerCase();
    const isTailDup = lc.length > 10 && tailSlice.includes(lc);

    if (isRecentDup || isTailDup) {
      continue;
    }

    out.push(line);
    recent.push(lc);
    if (recent.length > 8) recent.shift();
  }

  return out.join(" ").replace(/\s+/g, " ").trim();
}

// VTT -> segments with timestamps
export function parseVttToSegments(content: string): Array<{ start: number; end: number; text: string }> {
  const lines = content.split(/\r?\n/);
  const segs: Array<{ start: number; end: number; text: string }> = [];
  let i = 0;
  const recent: string[] = [];

  const parseTime = (t: string): number => {
    const m = t.match(/(\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
    if (!m) return 0;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    const ss = Number(m[3]);
    const ms = Number(m[4]);
    return hh * 3600 + mm * 60 + ss + ms / 1000;
  };

  while (i < lines.length) {
    const line = lines[i].trim();
    i++;
    if (!line) continue;
    if (/^WEBVTT/i.test(line) || /^NOTE/i.test(line) || /^Kind:/i.test(line) || /^Language:/i.test(line)) {
      // skip headers/notes
      continue;
    }
    // cue number (optional)
    if (/^\d+$/.test(line)) {
      // read next line for timing
      if (i >= lines.length) break;
    }
    const timing = lines[i - 1].includes("-->") ? lines[i - 1] : lines[i]?.trim() ?? "";
    let timingLine = timing;
    if (!/\d{2}:\d{2}:\d{2}\.\d{3}\s+--\>/.test(timingLine)) {
      // Not a timing line; try current line
      if (!/\d{2}:\d{2}:\d{2}\.\d{3}\s+--\>/.test(line)) continue;
      timingLine = line;
    } else {
      // consumed one extra line for timing
      i++;
    }
    const tm = timingLine.match(/(\d{2}:\d{2}:\d{2}\.\d{3})\s+--\>\s+(\d{2}:\d{2}:\d{2}\.\d{3})/);
    if (!tm) continue;
    const start = parseTime(tm[1]);
    const end = parseTime(tm[2]);

    // collect text lines until blank
    const textLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== "") {
      const raw = lines[i];
      i++;
      // strip tags including <c> and timestamps embedded
      const withoutTags = raw.replace(/<[^>]+>/g, "");
      const cleaned = withoutTags.replace(/\s+/g, " ").trim();
      if (cleaned) textLines.push(cleaned);
    }

    const text = textLines.join(" ").trim();
    if (!text) continue;

    // Deduplicate against recent cue texts (lowercased)
    const lc = text.toLowerCase();
    const tail = recent.join(" ");
    const tailSlice = tail.slice(Math.max(0, tail.length - 600));
    const isDup = recent.includes(lc) || (lc.length > 10 && tailSlice.includes(lc));
    if (isDup) continue;

    segs.push({ start, end, text });
    recent.push(lc);
    if (recent.length > 16) recent.shift();
  }

  return segs;
}

async function upsertVideoSearchFts(db: any, videoId: string, title: string | null | undefined, transcript: string | null | undefined) {
  try {
    // REPLACE mimics UPSERT for FTS virtual tables
    await db.run(sql`INSERT INTO video_search_fts (video_id, title, transcript) VALUES (${videoId}, ${title ?? ""}, ${transcript ?? ""})`);
  } catch (e) {
    try {
      // If insert fails due to duplication, try delete then insert
      await db.run(sql`DELETE FROM video_search_fts WHERE video_id = ${videoId}`);
      await db.run(sql`INSERT INTO video_search_fts (video_id, title, transcript) VALUES (${videoId}, ${title ?? ""}, ${transcript ?? ""})`);
    } catch (err) {
      logger.warn("[fts] upsert failed", { videoId, error: String(err) });
    }
  }
}

const ensureBinDir = () => {
  const dir = getBinDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

async function fetchLatestRelease(): Promise<{ version: string; assetUrl: string } | null> {
  try {
    const releaseRes = await fetch(getLatestReleaseApiUrl());
    if (!releaseRes.ok) {
      logger.error("[ytdlp] Failed to fetch latest release", { status: releaseRes.status });
      // Fallback to direct latest download URL without version
      return { version: "unknown", assetUrl: getDirectLatestDownloadUrl(process.platform) };
    }
    const json = (await releaseRes.json()) as {
      tag_name?: string;
      assets?: Array<{ name: string; browser_download_url: string }>;
    };
    const tag = (json.tag_name ?? "").replace(/^v/, "");
    const desiredAsset = getYtDlpAssetName(process.platform);
    const asset = json.assets?.find((a) => a.name === desiredAsset);
    const assetUrl = asset?.browser_download_url ?? getDirectLatestDownloadUrl(process.platform);
    return { version: tag || "unknown", assetUrl };
  } catch (e) {
    logger.error("[ytdlp] Exception fetching latest release", e as Error);
    return { version: "unknown", assetUrl: getDirectLatestDownloadUrl(process.platform) };
  }
}

const setExecutableIfNeeded = (filePath: string) => {
  if (process.platform === "win32") return; // not needed
  try {
    fs.chmodSync(filePath, 0o755);
  } catch (e) {
    logger.error("[ytdlp] Failed to chmod binary", { error: String(e) });
  }
};

const readInstalledVersion = (): string | null => {
  try {
    const p = getVersionFilePath();
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, "utf8").trim() || null;
    }
    return null;
  } catch (e) {
    logger.error("[ytdlp] Failed to read version file", e as Error);
    return null;
  }
};

const writeInstalledVersion = (version: string) => {
  try {
    fs.writeFileSync(getVersionFilePath(), version, "utf8");
  } catch (e) {
    logger.error("[ytdlp] Failed to write version file", e as Error);
  }
};

// mapYtDlpMetadata and extractChannelData are imported from utils/metadata.ts

// runYtDlpJson, extractVideoId, and spawnYtDlpWithLogging are imported from utils/ytdlp.ts

// upsertVideoFromMeta and upsertChannelData are imported from utils/database.ts

export const ytdlpRouter = t.router({
  getInstallInfo: publicProcedure.query(async () => {
    try {
      const binPath = getBinaryFilePath();
      const installed = fs.existsSync(binPath);
      const version = readInstalledVersion();
      return { installed, version, path: installed ? binPath : null } as const;
    } catch (e) {
      logger.error("[ytdlp] getInstallInfo failed", e as Error);
      return { installed: false, version: null, path: null } as const;
    }
  }),

  resolveLatest: publicProcedure.query(async () => {
    const info = await fetchLatestRelease();
    return info;
  }),

  downloadLatest: publicProcedure
    .input(
      z
        .object({ force: z.boolean().optional() })
        .optional()
    )
    .mutation(async ({ input }) => {
      ensureBinDir();
      const binPath = getBinaryFilePath();
      if (fs.existsSync(binPath) && !input?.force) {
        const version = readInstalledVersion();
        logger.info("[ytdlp] Binary already installed", { binPath, version });
        return { success: true as const, path: binPath, version: version ?? "unknown", alreadyInstalled: true as const };
      }

      const latest = await fetchLatestRelease();
      if (!latest) {
        return { success: false as const, message: "Failed to resolve latest yt-dlp" } as const;
      }

      const tmpPath = path.join(os.tmpdir(), `yt-dlp-${Date.now()}`);

      logger.info("[ytdlp] Download starting", { url: latest.assetUrl });

      const result = await new Promise<{
        ok: boolean;
        error?: string;
      }>((resolve) => {
        let request: ReturnType<typeof net.request> | undefined;
        try {
          request = net.request({ method: "GET", url: latest.assetUrl });
        } catch (err) {
          logger.error("[ytdlp] net.request failed", err);
          return resolve({ ok: false, error: String(err) });
        }

        request.on("response", (response) => {
          const status = response.statusCode ?? 0;
          if (status >= 300 && status < 400) {
            const locationHeader = response.headers["location"] || response.headers["Location"];
            const location = Array.isArray(locationHeader) ? locationHeader[0] : locationHeader;
            if (location) {
              logger.info("[ytdlp] Redirecting", { to: location });
              response.on("data", () => {});
              response.on("end", () => {
                // Follow one redirect by reissuing request
                const follow = net.request({ method: "GET", url: location });
                follow.on("response", (res2) => {
                  if ((res2.statusCode ?? 0) >= 400) {
                    logger.error("[ytdlp] Download failed after redirect", { status: res2.statusCode });
                    res2.on("data", () => {});
                    res2.on("end", () => resolve({ ok: false, error: `HTTP ${res2.statusCode}` }));
                    return;
                  }
                  const ws = fs.createWriteStream(tmpPath);
                  res2.on("data", (chunk) => ws.write(chunk));
                  res2.on("end", () => {
                    ws.end();
                    resolve({ ok: true });
                  });
                  res2.on("error", (e) => {
                    ws.destroy();
                    resolve({ ok: false, error: String(e) });
                  });
                });
                follow.on("error", (e) => resolve({ ok: false, error: String(e) }));
                follow.end();
              });
              return;
            }
          }

          if (status >= 400) {
            logger.error("[ytdlp] Download failed", { status });
            response.on("data", () => {});
            response.on("end", () => resolve({ ok: false, error: `HTTP ${status}` }));
            return;
          }

          const ws = fs.createWriteStream(tmpPath);
          response.on("data", (chunk) => ws.write(chunk));
          response.on("end", () => {
            ws.end();
            resolve({ ok: true });
          });
          response.on("error", (e) => {
            ws.destroy();
            resolve({ ok: false, error: String(e) });
          });
        });

        request.on("error", (e) => resolve({ ok: false, error: String(e) }));
        request.end();
      });

      if (!result.ok) {
        logger.error("[ytdlp] Download failed", { error: result.error });
        return { success: false as const, message: result.error ?? "Download failed" } as const;
      }

      try {
        // Move tmp to bin path
        fs.copyFileSync(tmpPath, binPath);
        fs.unlinkSync(tmpPath);
        setExecutableIfNeeded(binPath);
        writeInstalledVersion(latest.version);
        logger.info("[ytdlp] Installed", { binPath, version: latest.version });
        return { success: true as const, path: binPath, version: latest.version, alreadyInstalled: false as const };
      } catch (e) {
        logger.error("[ytdlp] Failed to finalize installation", e as Error);
        return { success: false as const, message: `Install error: ${String(e)}` } as const;
      }
    }),

  // Fetch video metadata from URL (always stores in DB for caching)
  fetchVideoInfo: publicProcedure
    .input(z.object({ url: z.string().url() }))
    .mutation(async ({ input, ctx }) => {
      const db = ctx.db ?? defaultDb;
      const binPath = getBinaryFilePath();
      if (!fs.existsSync(binPath)) {
        return {
          success: false as const,
          message: "yt-dlp binary not installed",
        } as const;
      }

      // Extract video ID from URL to check cache
      const videoIdMatch = input.url.match(/[?&]v=([^&]+)/);
      const urlVideoId = videoIdMatch ? videoIdMatch[1] : null;

      // extractSubtitleLanguages is imported from utils/metadata.ts

      // Try to get existing metadata from DB first
      if (urlVideoId) {
        const existingVideo = await db
          .select()
          .from(youtubeVideos)
          .where(eq(youtubeVideos.videoId, urlVideoId))
          .limit(1);

        if (existingVideo.length > 0) {
          // Use cached metadata from DB
          logger.info("[ytdlp] fetchVideoInfo using cached metadata from DB", { videoId: urlVideoId });
          const existing = existingVideo[0];
          const mapped = {
            videoId: existing.videoId,
            title: existing.title,
            description: existing.description,
            channelId: existing.channelId,
            channelTitle: existing.channelTitle,
            durationSeconds: existing.durationSeconds,
            viewCount: existing.viewCount,
            likeCount: existing.likeCount,
            thumbnailUrl: existing.thumbnailUrl,
            publishedAt: existing.publishedAt,
            tags: existing.tags,
            raw: existing.raw ?? "{}",
          };

          // Extract subtitle languages from cached raw JSON
          let availableLanguages: Array<{ lang: string; hasManual: boolean; hasAuto: boolean; manualFormats: string[]; autoFormats: string[] }> = [];
          try {
            if (existing.raw) {
              const rawMeta = JSON.parse(existing.raw);
              availableLanguages = extractSubtitleLanguages(rawMeta);
            }
          } catch (e) {
            logger.warn("[ytdlp] Failed to parse cached raw JSON for subtitles", { videoId: urlVideoId, error: String(e) });
          }

          return {
            success: true as const,
            info: mapped,
            availableLanguages,
          } as const;
        }
      }

      // Run yt-dlp -J to fetch metadata (cache miss or store=false)
      logger.info("[ytdlp] fetchVideoInfo fetching from yt-dlp", { url: input.url });
      let meta: any | null = null;
      try {
        const metaJson = await new Promise<string>((resolve, reject) => {
          const proc = spawnYtDlpWithLogging(
            binPath,
            ["-J", input.url],
            { stdio: ["ignore", "pipe", "pipe"] },
            {
              operation: "fetch_video_info",
              url: input.url,
              videoId: extractVideoId(input.url),
            }
          );
          let out = "";
          let err = "";
          proc.stdout?.on("data", (d) => (out += d.toString()));
          proc.stderr?.on("data", (d) => (err += d.toString()));
          proc.on("error", reject);
          proc.on("close", (code) => {
            if (code === 0) resolve(out);
            else reject(new Error(err || `yt-dlp -J exited with code ${code}`));
          });
        });
        meta = JSON.parse(metaJson);
      } catch (e) {
        logger.error("[ytdlp] fetchVideoInfo failed", e as Error);
        return { success: false as const, message: String(e) } as const;
      }

      const mapped = mapYtDlpMetadata(meta);
      // Cache video thumbnail locally for offline use
      const mappedThumbPath = mapped.thumbnailUrl
        ? await downloadImageToCache(mapped.thumbnailUrl, `video_${mapped.videoId}`)
        : null;

      // Extract subtitle languages from metadata
      const availableLanguages = extractSubtitleLanguages(meta);

      // Extract and upsert channel data
      const channelData = extractChannelData(meta);
      logger.info("[ytdlp] Extracted channel data", {
        hasChannelData: !!channelData,
        channelId: channelData?.channelId,
        channelTitle: channelData?.channelTitle,
        metaKeys: Object.keys(meta || {}).filter(k => k.includes('channel') || k.includes('uploader'))
      });
      if (channelData) {
        await upsertChannelData(db, channelData);
      } else {
        logger.warn("[ytdlp] No channel data extracted from metadata");
      }

      // Always store in DB for caching
      if (mapped.videoId) {
        const now = Date.now();
        try {
          const existing = await db
            .select()
            .from(youtubeVideos)
            .where(eq(youtubeVideos.videoId, mapped.videoId))
            .limit(1);

          if (existing.length === 0) {
            await db.insert(youtubeVideos).values({
              id: crypto.randomUUID(),
              videoId: mapped.videoId,
              title: mapped.title,
              description: mapped.description,
              channelId: mapped.channelId,
              channelTitle: mapped.channelTitle,
              durationSeconds: mapped.durationSeconds,
              viewCount: mapped.viewCount,
              likeCount: mapped.likeCount,
              thumbnailUrl: mapped.thumbnailUrl,
              thumbnailPath: mappedThumbPath,
              publishedAt: mapped.publishedAt,
              tags: mapped.tags,
              raw: mapped.raw,
              createdAt: now,
              updatedAt: now,
            });
            // Seed FTS with title only (transcript may come later)
            await upsertVideoSearchFts(db, mapped.videoId, mapped.title, "");
          } else {
            await db
              .update(youtubeVideos)
              .set({
                title: mapped.title,
                description: mapped.description,
                channelId: mapped.channelId,
                channelTitle: mapped.channelTitle,
                durationSeconds: mapped.durationSeconds,
                viewCount: mapped.viewCount,
                likeCount: mapped.likeCount,
                thumbnailUrl: mapped.thumbnailUrl,
                thumbnailPath: mappedThumbPath ?? existing[0]?.thumbnailPath ?? null,
                publishedAt: mapped.publishedAt,
                tags: mapped.tags,
                raw: mapped.raw,
                updatedAt: now,
              })
              .where(eq(youtubeVideos.videoId, mapped.videoId));
            await upsertVideoSearchFts(db, mapped.videoId, mapped.title, undefined);
          }
        } catch (e) {
          logger.error("[ytdlp] DB upsert in fetchVideoInfo failed", e as Error);
        }
      }

      return {
        success: true as const,
        info: mapped,
        availableLanguages,
      } as const;
    }),
  // List completed downloads with basic video info
  listCompletedDownloads: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(200).optional() }).optional())
    .query(async ({ input, ctx }) => {
      const db = ctx.db ?? defaultDb;
      const limit = input?.limit ?? 50;
      try {
        // Primary: read from unified youtube_videos fields
        const rows = await db
          .select({
            videoId: youtubeVideos.videoId,
            title: youtubeVideos.title,
            thumbnailUrl: youtubeVideos.thumbnailUrl,
            thumbnailPath: youtubeVideos.thumbnailPath,
            filePath: youtubeVideos.downloadFilePath,
            completedAt: youtubeVideos.lastDownloadedAt,
          })
          .from(youtubeVideos)
          .where(eq(youtubeVideos.downloadStatus, "completed"))
          .orderBy(desc(youtubeVideos.lastDownloadedAt))
          .limit(limit);
        return rows;
      } catch (e) {
        // If unified columns missing, return empty list instead of falling back
        logger.error("[ytdlp] listCompletedDownloads failed", e as Error);
        return [];
      }
    }),

  // Get a single video/download by ID (for tracking download progress)
  getVideoById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const db = ctx.db ?? defaultDb;
      try {
        const result = await db
          .select()
          .from(youtubeVideos)
          .where(eq(youtubeVideos.id, input.id))
          .limit(1);

        if (result.length === 0) {
          return null;
        }

        const video = result[0];
        return {
          id: video.id,
          videoId: video.videoId,
          title: video.title,
          description: video.description,
          status: video.downloadStatus,
          progress: video.downloadProgress ?? 0,
          filePath: video.downloadFilePath,
          fileSize: video.downloadFileSize,
          thumbnailUrl: video.thumbnailUrl,
          thumbnailPath: video.thumbnailPath,
          durationSeconds: video.durationSeconds,
          channelTitle: video.channelTitle,
          errorMessage: video.lastErrorMessage,
          errorType: video.errorType,
          isRetryable: video.isRetryable,
          lastDownloadedAt: video.lastDownloadedAt,
          createdAt: video.createdAt,
          updatedAt: video.updatedAt,
        };
      } catch (e) {
        logger.error("[ytdlp] getVideoById failed", e as Error);
        return null;
      }
    }),

  // Get a single video by its YouTube videoId
  getVideoByVideoId: publicProcedure
    .input(z.object({ videoId: z.string() }))
    .query(async ({ input, ctx }) => {
      const db = ctx.db ?? defaultDb;
      try {
        const result = await db
          .select()
          .from(youtubeVideos)
          .where(eq(youtubeVideos.videoId, input.videoId))
          .limit(1);

        if (result.length === 0) return null;
        const v = result[0];
        return {
          id: v.id,
          videoId: v.videoId,
          title: v.title,
          description: v.description,
          channelId: v.channelId,
          channelTitle: v.channelTitle,
          thumbnailUrl: v.thumbnailUrl,
          thumbnailPath: v.thumbnailPath,
          durationSeconds: v.durationSeconds,
          viewCount: v.viewCount,
          publishedAt: v.publishedAt,
          url: `https://www.youtube.com/watch?v=${v.videoId}`,
          downloadStatus: v.downloadStatus,
          downloadProgress: v.downloadProgress,
          downloadFilePath: v.downloadFilePath,
          lastDownloadedAt: v.lastDownloadedAt,
          createdAt: v.createdAt,
          updatedAt: v.updatedAt,
        };
      } catch (e) {
        logger.error("[ytdlp] getVideoByVideoId failed", e as Error);
        return null;
      }
    }),

  // List unique channels from downloaded videos
  listChannels: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(200).optional() }).optional())
    .query(async ({ input, ctx }) => {
      const db = ctx.db ?? defaultDb;
      const limit = input?.limit ?? 50;

      // Get channels from channels table with video count
      const channelRows = await db
        .select()
        .from(channels)
        .orderBy(desc(channels.updatedAt))
        .limit(limit);

      // Count videos for each channel
      const channelsWithVideoCounts = await Promise.all(
        channelRows.map(async (channel) => {
          const videosCount = await db
            .select({ count: youtubeVideos.id })
            .from(youtubeVideos)
            .where(eq(youtubeVideos.channelId, channel.channelId));

          return {
            id: channel.id,
            channelId: channel.channelId,
            channelTitle: channel.channelTitle,
            channelDescription: channel.channelDescription,
            thumbnailUrl: channel.thumbnailUrl,
            thumbnailPath: channel.thumbnailPath,
            subscriberCount: channel.subscriberCount,
            videoCount: videosCount.length,
            customUrl: channel.customUrl,
            lastUpdated: channel.updatedAt,
          };
        })
      );

      // Sort by video count
      return channelsWithVideoCounts.sort((a, b) => b.videoCount - a.videoCount);
    }),

  // Get videos by channel ID
  getVideosByChannel: publicProcedure
    .input(z.object({ channelId: z.string(), limit: z.number().min(1).max(200).optional() }))
    .query(async ({ input, ctx }) => {
      const db = ctx.db ?? defaultDb;
      const limit = input?.limit ?? 50;

      const videos = await db
        .select()
        .from(youtubeVideos)
        .where(eq(youtubeVideos.channelId, input.channelId))
        .orderBy(desc(youtubeVideos.publishedAt))
        .limit(limit);

      return videos;
    }),

  // Get channel details with videos
  getChannelDetails: publicProcedure
    .input(z.object({ channelId: z.string() }))
    .query(async ({ input, ctx }) => {
      const db = ctx.db ?? defaultDb;
      const t0 = Date.now();
      logger.info("[getChannelDetails] start", { channelId: input.channelId });

      // Get channel info
      const channelRows = await db
        .select()
        .from(channels)
        .where(eq(channels.channelId, input.channelId))
        .limit(1);

      if (channelRows.length === 0) {
        logger.warn("[getChannelDetails] channel not found", { channelId: input.channelId, durationMs: Date.now() - t0 });
        return null;
      }

      const channel = channelRows[0];
      logger.debug("[getChannelDetails] channel row", {
        id: channel.id,
        channelId: channel.channelId,
        title: channel.channelTitle,
        thumbnailUrl: channel.thumbnailUrl,
        thumbnailPath: channel.thumbnailPath,
        hasDescription: !!channel.channelDescription,
      });

      // Get videos from this channel (unique list)
      const videoRows = await db
        .select()
        .from(youtubeVideos)
        .where(eq(youtubeVideos.channelId, input.channelId))
        .orderBy(desc(youtubeVideos.publishedAt))
        .limit(50);

      const videoIds = videoRows.map((v) => v.videoId).filter(Boolean) as string[];

      // No videos -> early return
      if (videoIds.length === 0) {
        return { channel, videos: [], totalVideos: 0 };
      }

      // Compose response with unified download summary from youtube_videos
      const videos = videoRows.map((v) => {
        return {
          id: v.id,
          videoId: v.videoId,
          title: v.title,
          description: v.description,
          channelId: v.channelId,
          channelTitle: v.channelTitle,
          durationSeconds: v.durationSeconds,
          viewCount: v.viewCount,
          likeCount: v.likeCount,
          thumbnailUrl: v.thumbnailUrl,
          thumbnailPath: v.thumbnailPath,
          publishedAt: v.publishedAt,
          tags: v.tags,
          raw: v.raw,
          createdAt: v.createdAt,
          updatedAt: v.updatedAt,
          downloadId: null,
          downloadStatus: v.downloadStatus ?? null,
          downloadProgress: v.downloadProgress ?? null,
          downloadFilePath: v.downloadFilePath ?? null,
          downloadCompletedAt: v.lastDownloadedAt ?? null,
        };
      });

      const durationMs = Date.now() - t0;
      logger.info("[getChannelDetails] done", { channelId: input.channelId, totalVideos: videos.length, durationMs });
      return { channel, videos, totalVideos: videos.length };
    }),

  // Get video playback info by videoId (for PlayerPage)
  getVideoPlayback: publicProcedure
    .input(z.object({ videoId: z.string() }))
    .query(async ({ input, ctx }) => {
      const db = ctx.db ?? defaultDb;
      const rows = await db
        .select()
        .from(youtubeVideos)
        .where(eq(youtubeVideos.videoId, input.videoId))
        .limit(1);
      const v = rows[0];
      if (!v) return null;

      // Extract subtitle languages from cached raw JSON
      let availableLanguages: Array<{ lang: string; hasManual: boolean; hasAuto: boolean; manualFormats: string[]; autoFormats: string[] }> = [];
      if (v.raw) {
        try {
          const meta = JSON.parse(v.raw);
          availableLanguages = extractSubtitleLanguages(meta);
        } catch (e) {
          // Silently fail - raw JSON might not exist or be malformed
        }
      }

      // Get watch progress (last position) if available
      let lastPositionSeconds: number | undefined = undefined;
      try {
        const watchStats = await db
          .select({ lastPositionSeconds: videoWatchStats.lastPositionSeconds })
          .from(videoWatchStats)
          .where(eq(videoWatchStats.videoId, input.videoId))
          .limit(1);
        if (watchStats.length > 0 && watchStats[0].lastPositionSeconds !== null) {
          lastPositionSeconds = watchStats[0].lastPositionSeconds;
        }
      } catch (e) {
        // Silently fail - watch stats might not exist
      }

      return {
        videoId: v.videoId,
        title: v.title,
        description: v.description,
        filePath: v.downloadFilePath,
        status: v.downloadStatus,
        progress: v.downloadProgress,
        availableLanguages,
        lastPositionSeconds,
      } as const;
    }),

  // Get transcript (if available) for a video (optionally by language)
  getTranscript: publicProcedure
    .input(z.object({ videoId: z.string(), lang: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const db = ctx.db ?? defaultDb;
      let rows;
      if (input.lang) {
        // Normalize language code for matching (e.g., "en" matches "en-orig", "en-us", etc.)
        const normalizedLang = normalizeLangCode(input.lang);
        // Get all transcripts for this video and filter by normalized language
        const allTranscripts = await db
          .select()
          .from(videoTranscripts)
          .where(eq(videoTranscripts.videoId, input.videoId));
        rows = allTranscripts.filter(t => normalizeLangCode(t.language) === normalizedLang);
      } else {
        rows = await db
          .select()
          .from(videoTranscripts)
          .where(eq(videoTranscripts.videoId, input.videoId))
          .limit(1);
      }
      if (rows.length === 0) return null;

  const row = rows[0] as { id: string; videoId: string; text: string | null; language?: string | null; updatedAt?: number | null; rawVtt?: string | null };

      // If the stored transcript still contains inline VTT tags (historic data), sanitize on read and persist fix
      const t = row.text ?? "";
      const looksLikeVttInline = /<\d{2}:\d{2}:\d{2}\.\d{3}>|<c>|<\/c>|WEBVTT|Kind:|Language:|--\>/i.test(t);
      if (looksLikeVttInline) {
        try {
          const cleaned = parseVttToText(t);
          if (cleaned && cleaned !== t) {
            const now = Date.now();
            await db
              .update(videoTranscripts)
              .set({ text: cleaned, updatedAt: now })
              .where(eq(videoTranscripts.id, row.id));

            // Also refresh FTS index so search uses the cleaned transcript
            try {
              const vid = await db
                .select({ title: youtubeVideos.title })
                .from(youtubeVideos)
                .where(eq(youtubeVideos.videoId, input.videoId))
                .limit(1);
              const title = vid[0]?.title ?? null;
              await upsertVideoSearchFts(db, input.videoId, title, cleaned);
            } catch (e) {
              logger.warn("[fts] update after transcript sanitize failed", { videoId: input.videoId, error: String(e) });
            }

            return { ...row, text: cleaned, updatedAt: now } as typeof row;
          }
        } catch (e) {
          logger.warn("[transcript] sanitize on read failed", { videoId: input.videoId, error: String(e) });
        }
      }

      // If text missing but rawVtt present, derive and persist
      if ((!row.text || row.text.trim().length === 0) && row.rawVtt) {
        try {
          const derived = parseVttToText(row.rawVtt);
          const now = Date.now();
          await db
            .update(videoTranscripts)
            .set({ text: derived, updatedAt: now })
            .where(eq(videoTranscripts.id, row.id));
          return { ...row, text: derived, updatedAt: now } as typeof row;
        } catch {}
      }

      return row;
    }),

  // Download transcript via yt-dlp and store it (for specific language)
  downloadTranscript: publicProcedure
    .input(z.object({ videoId: z.string(), lang: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = ctx.db ?? defaultDb;

      logger.info("[transcript] downloadTranscript called", { videoId: input.videoId, requestedLang: input.lang ?? "undefined (default)" });

      // Check DB first to avoid unnecessary yt-dlp calls
      try {
        let existing;
        if (input.lang) {
          // Normalize requested language code for matching
          const normalizedLang = normalizeLangCode(input.lang);
          logger.debug("[transcript] Checking DB for specific language", { videoId: input.videoId, requestedLang: input.lang, normalizedLang });

          // Query by matching normalized base language code (e.g., "en" matches "en-orig", "en-us", etc.)
          // Get all transcripts for this video and filter by normalized language
          const allTranscripts = await db
            .select()
            .from(videoTranscripts)
            .where(eq(videoTranscripts.videoId, input.videoId));

          existing = allTranscripts.filter(t => normalizeLangCode(t.language) === normalizedLang);
          logger.debug("[transcript] DB query result for specific language", {
            videoId: input.videoId,
            requestedLang: input.lang,
            normalizedLang,
            found: existing.length > 0,
            allStoredLangs: allTranscripts.map(t => ({ stored: t.language, normalized: normalizeLangCode(t.language) }))
          });
        } else {
          // If no language specified, check for ANY transcript (matches getTranscript behavior)
          logger.debug("[transcript] Checking DB for ANY transcript (no lang specified)", { videoId: input.videoId });
          existing = await db
            .select()
            .from(videoTranscripts)
            .where(eq(videoTranscripts.videoId, input.videoId))
            .limit(1);
          logger.debug("[transcript] DB query result for ANY transcript", { videoId: input.videoId, found: existing.length > 0 });
        }

        if (existing.length > 0) {
          const row = existing[0];
          const detectedLang = row.language ?? input.lang ?? "en";
          logger.debug("[transcript] Found transcript row in DB", {
            videoId: input.videoId,
            rowLanguage: row.language,
            detectedLang,
            hasText: !!row.text,
            textLength: row.text?.length ?? 0,
            hasRawVtt: !!row.rawVtt,
            rawVttLength: row.rawVtt?.length ?? 0
          });

          // If we have both text and rawVtt, we're good - return early
          if (row.text && row.rawVtt && row.text.trim().length > 0 && row.rawVtt.trim().length > 0) {
            logger.info("[transcript] downloadTranscript found existing transcript in DB - RETURNING EARLY", {
              videoId: input.videoId,
              language: detectedLang,
              textLength: row.text.length,
              rawVttLength: row.rawVtt.length
            });
            return {
              success: true as const,
              videoId: input.videoId,
              language: detectedLang,
              length: row.text.length,
              fromCache: true as const
            } as const;
          }
          // If we have rawVtt but missing text, derive it instead of re-downloading
          if (row.rawVtt && row.rawVtt.trim().length > 0) {
            logger.debug("[transcript] Has rawVtt but missing/incomplete text - will derive from rawVtt", {
              videoId: input.videoId,
              language: detectedLang
            });
            try {
              const derived = parseVttToText(row.rawVtt);
              const segs = parseVttToSegments(row.rawVtt);
              const segmentsJson = JSON.stringify(segs);
              const now = Date.now();
              await db
                .update(videoTranscripts)
                .set({ text: derived, segmentsJson, updatedAt: now })
                .where(sql`${videoTranscripts.videoId} = ${input.videoId} AND ${videoTranscripts.language} = ${detectedLang}`);

              // Update FTS index
              try {
                const vid = await db
                  .select({ title: youtubeVideos.title })
                  .from(youtubeVideos)
                  .where(eq(youtubeVideos.videoId, input.videoId))
                  .limit(1);
                const title = vid[0]?.title ?? null;
                await upsertVideoSearchFts(db, input.videoId, title, derived);
              } catch (e) {
                logger.warn("[fts] update after transcript derive failed", { videoId: input.videoId, error: String(e) });
              }

              logger.info("[transcript] downloadTranscript derived text from existing rawVtt - RETURNING EARLY", {
                videoId: input.videoId,
                language: detectedLang,
                derivedLength: derived.length
              });
              return {
                success: true as const,
                videoId: input.videoId,
                language: detectedLang,
                length: derived.length,
                fromCache: true as const
              } as const;
            } catch (e) {
              logger.warn("[transcript] derive from rawVtt failed, will re-download", { videoId: input.videoId, error: String(e) });
            }
          } else {
            logger.warn("[transcript] Found row but missing/incomplete rawVtt - will proceed to yt-dlp", {
              videoId: input.videoId,
              language: detectedLang,
              hasRawVtt: !!row.rawVtt,
              rawVttLength: row.rawVtt?.length ?? 0
            });
          }
        } else {
          // Log all transcripts for this video to debug language code mismatch
          try {
            const allTranscripts = await db
              .select({ language: videoTranscripts.language })
              .from(videoTranscripts)
              .where(eq(videoTranscripts.videoId, input.videoId));
            logger.info("[transcript] No transcript found in DB - will proceed to yt-dlp", {
              videoId: input.videoId,
              requestedLang: input.lang ?? "undefined (default)",
              existingLanguagesInDB: allTranscripts.map(t => t.language).filter(Boolean),
              existingCount: allTranscripts.length
            });
          } catch (e) {
            logger.warn("[transcript] Failed to query all transcripts for debugging", { videoId: input.videoId, error: String(e) });
            logger.info("[transcript] No transcript found in DB - will proceed to yt-dlp", {
              videoId: input.videoId,
              requestedLang: input.lang ?? "undefined (default)"
            });
          }
        }
      } catch (e) {
        logger.error("[transcript] DB check failed, proceeding with yt-dlp", { videoId: input.videoId, error: String(e), stack: (e as Error).stack });
      }

      logger.info("[transcript] Proceeding to yt-dlp call", { videoId: input.videoId, requestedLang: input.lang ?? "undefined (default)" });
      // If we get here, transcript doesn't exist in DB for the requested language
      const lang = input.lang ?? "en";

      // Only call yt-dlp if transcript not found in DB or incomplete
      const binPath = getBinaryFilePath();
      if (!fs.existsSync(binPath)) {
        return { success: false as const, message: "yt-dlp binary not installed" } as const;
      }

      const transcriptsDir = getTranscriptsDir();
      ensureDirSync(transcriptsDir);
      const url = `https://www.youtube.com/watch?v=${input.videoId}`;

      // Prepare args to fetch subs only (prefer manual, fallback auto), VTT for easy parsing
      const args = [
        "--skip-download",
        "--write-subs",
        "--write-auto-subs",
        "--no-warnings",
        // Be gentle to reduce 429s
        "--retries",
        "2",
        "--sleep-requests",
        "2.5",
        "--sub-format",
        "vtt",
        "--sub-langs",
        `${lang},${lang}-orig,${lang}.*`,
        "-o",
        path.join(transcriptsDir, "%(id)s.%(ext)s"),
        url,
      ];

      try {
        await new Promise<void>((resolve, reject) => {
          const proc = spawnYtDlpWithLogging(
            binPath,
            args,
            { stdio: ["ignore", "pipe", "pipe"] },
            {
              operation: "download_transcript",
              url,
              videoId: input.videoId,
              other: { language: lang },
            }
          );
          let err = "";
          proc.stderr?.on("data", (d) => (err += d.toString()));
          proc.on("error", reject);
          proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(err || `yt-dlp exited ${code}`))));
        });
      } catch (e) {
        const msg = String(e);
        logger.error("[transcript] yt-dlp failed", e as Error);
        const rateLimited = /429|Too Many Requests/i.test(msg);
        if (rateLimited) {
          return {
            success: false as const,
            code: "RATE_LIMITED" as const,
            retryAfterMs: 15 * 60 * 1000,
            message: msg,
          } as const;
        }
        return { success: false as const, message: msg } as const;
      }

      // Find resulting VTT file(s) for this videoId
      let vttPath: string | null = null;
      try {
        const files = fs.readdirSync(transcriptsDir).filter((f) => f.startsWith(input.videoId) && f.endsWith(".vtt"));
        if (files.length > 0) {
          // Pick the most recent
          const withStat = files.map((f) => ({ f, s: fs.statSync(path.join(transcriptsDir, f)) }));
          withStat.sort((a, b) => b.s.mtimeMs - a.s.mtimeMs);
          vttPath = path.join(transcriptsDir, withStat[0].f);
        }
      } catch {}
      if (!vttPath || !fs.existsSync(vttPath)) {
        return { success: false as const, message: "Transcript file not found after yt-dlp" } as const;
      }

      // Read + parse VTT
  const raw = fs.readFileSync(vttPath, "utf8");
  const text = parseVttToText(raw);
  const segs = parseVttToSegments(raw);
  const segmentsJson = JSON.stringify(segs);
      const now = Date.now();

  // Guess language from filename suffix like videoId.en.vtt
  const langMatch = path.basename(vttPath).match(/\.(\w[\w-]*)\.vtt$/i);
  const rawDetectedLang = (langMatch?.[1] ?? lang).toLowerCase();
  // Normalize to base language code (e.g., "en-orig" -> "en") to match query behavior
  const detectedLang = normalizeLangCode(rawDetectedLang);
  logger.debug("[transcript] Language detected and normalized when storing", {
    videoId: input.videoId,
    rawDetected: rawDetectedLang,
    normalized: detectedLang,
    filename: path.basename(vttPath)
  });

      // Upsert transcript row
      try {
        const existing = await db
          .select()
          .from(videoTranscripts)
          .where(sql`${videoTranscripts.videoId} = ${input.videoId} AND ${videoTranscripts.language} = ${detectedLang}`)
          .limit(1);

        if (existing.length === 0) {
          await db.insert(videoTranscripts).values({
            id: crypto.randomUUID(),
            videoId: input.videoId,
            language: detectedLang,
            isAutoGenerated: true,
            source: "yt-dlp",
            text,
            rawVtt: raw,
            segmentsJson,
            createdAt: now,
            updatedAt: now,
          });
        } else {
          await db
            .update(videoTranscripts)
            .set({
              isAutoGenerated: true,
              source: "yt-dlp",
              text,
              rawVtt: raw,
              segmentsJson,
              updatedAt: now,
            })
            .where(sql`${videoTranscripts.videoId} = ${input.videoId} AND ${videoTranscripts.language} = ${detectedLang}`);
        }
      } catch (e) {
        logger.error("[transcript] upsert failed", e as Error);
        return { success: false as const, message: "Failed to store transcript" } as const;
      }

      // Update FTS index with title + transcript
      try {
        const vid = await db
          .select({ title: youtubeVideos.title })
          .from(youtubeVideos)
          .where(eq(youtubeVideos.videoId, input.videoId))
          .limit(1);
        const title = vid[0]?.title ?? null;
        await upsertVideoSearchFts(db, input.videoId, title, text);
      } catch (e) {
        logger.warn("[fts] update after transcript save failed", { videoId: input.videoId, error: String(e) });
      }

      // Return success after downloading via yt-dlp and storing in DB
      return { success: true as const, videoId: input.videoId, language: detectedLang, length: text.length } as const;
    }),

  // Return transcript segments with timestamps for highlighting
  getTranscriptSegments: publicProcedure
    .input(z.object({ videoId: z.string(), lang: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const db = ctx.db ?? defaultDb;
      // 1) Try DB cache first by videoId + language (if provided), else any language
      try {
        let rows;
        if (input.lang) {
          // Normalize language code for matching (e.g., "en" matches "en-orig", "en-us", etc.)
          const normalizedLang = normalizeLangCode(input.lang);
          // Get all transcripts for this video and filter by normalized language
          const allTranscripts = await db
            .select()
            .from(videoTranscripts)
            .where(eq(videoTranscripts.videoId, input.videoId));
          rows = allTranscripts.filter(t => normalizeLangCode(t.language) === normalizedLang);
        } else {
          rows = await db
            .select()
            .from(videoTranscripts)
            .where(eq(videoTranscripts.videoId, input.videoId))
            .limit(1);
        }
        if (rows.length > 0) {
          const row = rows[0] as { id: string; rawVtt?: string | null; segmentsJson?: string | null; language?: string | null };
          if (row.segmentsJson) {
            try {
              const segs = JSON.parse(row.segmentsJson) as Array<{ start: number; end: number; text: string }>;
              return { segments: segs, language: (row as any).language ?? input.lang } as const;
            } catch {}
          }
          if (row.rawVtt) {
            // Derive segments from rawVtt, persist back to DB
            const segs = parseVttToSegments(row.rawVtt);
            try {
              await db
                .update(videoTranscripts)
                .set({ segmentsJson: JSON.stringify(segs), updatedAt: Date.now() })
                .where(eq(videoTranscripts.id, (row as any).id));
            } catch {}
            return { segments: segs, language: (row as any).language ?? input.lang } as const;
          }
        }
      } catch {}

      // 2) Fallback to reading cached VTT files on disk
      const transcriptsDir = getTranscriptsDir();
      try {
        const files = fs
          .readdirSync(transcriptsDir)
          .filter((f) => f.startsWith(input.videoId) && f.endsWith(".vtt"));
        if (files.length === 0) return { segments: [] as Array<{ start: number; end: number; text: string }>, language: input.lang } as const;

        const pickByLang = (lang: string, arr: string[]) => {
          const re = new RegExp(`\\.${lang}(?:[.-]|\\.vtt$)`, "i");
          const candidates = arr.filter((f) => re.test(f));
          if (candidates.length > 0) return candidates;
          return arr; // fallback to any
        };

        const candidates = input.lang ? pickByLang(input.lang, files) : files;
        const withStat = candidates.map((f) => ({ f, s: fs.statSync(path.join(transcriptsDir, f)) }));
        withStat.sort((a, b) => b.s.mtimeMs - a.s.mtimeMs);
        const vttPath = path.join(transcriptsDir, withStat[0].f);
        const raw = fs.readFileSync(vttPath, "utf8");
        const segments = parseVttToSegments(raw);
        return { segments, language: input.lang } as const;
      } catch {
        return { segments: [] as Array<{ start: number; end: number; text: string }>, language: input.lang } as const;
      }
    }),

  // Full-text search across video titles + transcripts
  searchVideosText: publicProcedure
    .input(z.object({ q: z.string().min(1), limit: z.number().min(1).max(100).optional() }))
    .query(async ({ input, ctx }) => {
      const db = ctx.db ?? defaultDb;
      const limit = input.limit ?? 20;
      try {
        const rows = await db.all(sql`SELECT video_id, title FROM video_search_fts WHERE video_search_fts MATCH ${input.q} LIMIT ${limit}`);
        // Join with youtube_videos to return richer info
        const ids = rows.map((r: any) => r.video_id);
        if (ids.length === 0) return [] as any[];
        const vids = await db
          .select()
          .from(youtubeVideos)
          .where(inArray(youtubeVideos.videoId, ids));
        const map = new Map(vids.map((v: any) => [v.videoId, v]));
        return ids
          .map((id) => map.get(id))
          .filter(Boolean)
          .slice(0, limit);
      } catch (e) {
        logger.error("[fts] search failed", e as Error);
        return [] as any[];
      }
    }),

  // Refresh channel information from YouTube (fetches fresh data including logo)
  refreshChannelInfo: publicProcedure
    .input(z.object({ channelId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = ctx.db ?? defaultDb;
      const binPath = getBinaryFilePath();

      try {
        // Fetch fresh channel data from YouTube
        const channelUrl = `https://www.youtube.com/channel/${input.channelId}`;
        logger.info("[ytdlp] Refreshing channel info from YouTube", { channelId: input.channelId });

        const meta = await runYtDlpJson(binPath, channelUrl);

        // Extract channel data from the response
        const channelData = extractChannelData(meta);

        if (!channelData || !channelData.channelId) {
          throw new Error("Failed to extract channel data from YouTube response");
        }

        // Update channel in database
        await upsertChannelData(db, channelData);

        logger.info("[ytdlp] Successfully refreshed channel info", {
          channelId: channelData.channelId,
          channelTitle: channelData.channelTitle,
          hasThumbnail: !!channelData.thumbnailUrl
        });

        // Fetch and return updated channel from DB
        const updatedChannel = await db
          .select()
          .from(channels)
          .where(eq(channels.channelId, input.channelId))
          .limit(1);

        return {
          success: true,
          channel: updatedChannel[0] || null,
        };
      } catch (error: any) {
        logger.error("[ytdlp] Failed to refresh channel info", {
          channelId: input.channelId,
          error: error.message
        });
        return {
          success: false,
          error: error.message || "Failed to refresh channel information",
          channel: null,
        };
      }
    }),

  // List latest videos from a channel via yt-dlp (metadata-only, fast)
  listChannelLatest: publicProcedure
    .input(z.object({ channelId: z.string(), limit: z.number().min(1).max(100).optional(), forceRefresh: z.boolean().optional() }))
    .query(async ({ input, ctx }) => {
      const db = ctx.db ?? defaultDb;
      const limit = input.limit ?? 24;

      // 1) Try DB first (offline-first)
      try {
        const cached = await db
          .select()
          .from(youtubeVideos)
          .where(eq(youtubeVideos.channelId, input.channelId))
          .orderBy(desc(youtubeVideos.publishedAt))
          .limit(limit);
        if (cached.length > 0 && !input.forceRefresh) {
          return cached.map((v: any) => ({
            id: v.id,
            videoId: v.videoId,
            title: v.title,
            description: v.description,
            thumbnailUrl: v.thumbnailUrl,
            thumbnailPath: v.thumbnailPath,
            durationSeconds: v.durationSeconds,
            viewCount: v.viewCount,
            publishedAt: v.publishedAt,
            url: `https://www.youtube.com/watch?v=${v.videoId}`,
            downloadStatus: v.downloadStatus,
            downloadProgress: v.downloadProgress,
            downloadFilePath: v.downloadFilePath,
          }));
        }
      } catch {}

      const binPath = getBinaryFilePath();
      if (!fs.existsSync(binPath)) {
        // No binary available -> return DB even if empty
        const fallback = await db
          .select()
          .from(youtubeVideos)
          .where(eq(youtubeVideos.channelId, input.channelId))
          .orderBy(desc(youtubeVideos.publishedAt))
          .limit(limit);
        return fallback.map((v: any) => ({
          id: v.id,
          videoId: v.videoId,
          title: v.title,
          description: v.description,
          thumbnailUrl: v.thumbnailUrl,
          thumbnailPath: v.thumbnailPath,
          durationSeconds: v.durationSeconds,
          viewCount: v.viewCount,
          publishedAt: v.publishedAt,
          url: `https://www.youtube.com/watch?v=${v.videoId}`,
          downloadStatus: v.downloadStatus,
          downloadProgress: v.downloadProgress,
          downloadFilePath: v.downloadFilePath,
        }));
      }

      const url = `https://www.youtube.com/channel/${input.channelId}/videos?view=0&sort=dd&flow=grid`;
      const listing = await new Promise<string>((resolve, reject) => {
        const proc = spawnYtDlpWithLogging(
          binPath,
          ["-J", "--flat-playlist", url],
          { stdio: ["ignore", "pipe", "pipe"] },
          {
            operation: "list_playlist_videos",
            url,
            channelId: input.channelId,
            other: { flatPlaylist: true, sort: "dd" },
          }
        );
        let out = ""; let err = "";
        proc.stdout?.on("data", (d) => (out += d.toString()));
        proc.stderr?.on("data", (d) => (err += d.toString()));
        proc.on("error", reject);
        proc.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(err || `yt-dlp exited ${code}`))));
      });
      const listData = JSON.parse(listing);

      // Log available fields from the first entry to understand the data structure
      if (listData?.entries?.[0]) {
        logger.info("[ytdlp] listChannelLatest flat-playlist entry fields", {
          sampleEntry: listData.entries[0],
          availableFields: Object.keys(listData.entries[0])
        });
      }

      const entries = (Array.isArray(listData?.entries) ? listData.entries : []).filter((e: any) => e?.id);
      // limit already computed above
      const now = Date.now();

      // Upsert lightweight metadata to DB for caching (avoid expensive individual fetches)
      const videoIds: string[] = [];
      for (const entry of entries.slice(0, limit)) {
        if (!entry.id) continue;
        videoIds.push(entry.id);

        try {
          // Check if video exists in DB
          const existing = await db
            .select()
            .from(youtubeVideos)
            .where(eq(youtubeVideos.videoId, entry.id))
            .limit(1);

          const thumbPath = (entry.thumbnails?.[0]?.url || entry.thumbnail)
            ? await downloadImageToCache(entry.thumbnails?.[0]?.url || entry.thumbnail, `video_${entry.id}`)
            : null;
          const videoData = {
            videoId: entry.id,
            title: entry.title || "Untitled",
            description: null,
            channelId: input.channelId,
            channelTitle: entry.channel || entry.uploader || null,
            durationSeconds: entry.duration || null,
            viewCount: entry.view_count || null,
            likeCount: null,
            thumbnailUrl: entry.thumbnails?.[0]?.url || entry.thumbnail || null,
            thumbnailPath: thumbPath,
            publishedAt: null,
            tags: null,
            raw: JSON.stringify(entry),
            updatedAt: now,
          };

          if (existing.length === 0) {
            // Insert new video
            await db.insert(youtubeVideos).values({
              id: crypto.randomUUID(),
              ...videoData,
              createdAt: now,
            });
          } else {
            // Update existing video metadata (preserve download status)
            await db
              .update(youtubeVideos)
              .set({ ...videoData, thumbnailPath: thumbPath ?? existing[0]?.thumbnailPath ?? null })
              .where(eq(youtubeVideos.videoId, entry.id));
          }
        } catch (e) {
          logger.error("[ytdlp] Failed to upsert video from flat-playlist", { videoId: entry.id, error: String(e) });
        }
      }

      // Fetch and return full video data from DB (includes download status)
      if (videoIds.length === 0) return [];

      const videos = await db
        .select()
        .from(youtubeVideos)
        .where(inArray(youtubeVideos.videoId, videoIds))
        .orderBy(desc(youtubeVideos.publishedAt));

      return videos.map((v) => ({
        id: v.id,
        videoId: v.videoId,
        title: v.title,
        description: v.description,
        thumbnailUrl: v.thumbnailUrl,
        thumbnailPath: v.thumbnailPath,
        durationSeconds: v.durationSeconds,
        viewCount: v.viewCount,
        publishedAt: v.publishedAt,
        url: `https://www.youtube.com/watch?v=${v.videoId}`,
        downloadStatus: v.downloadStatus,
        downloadProgress: v.downloadProgress,
        downloadFilePath: v.downloadFilePath,
      }));
    }),

  // List popular videos from a channel via yt-dlp (metadata-only, fast)
  listChannelPopular: publicProcedure
    .input(z.object({ channelId: z.string(), limit: z.number().min(1).max(100).optional(), forceRefresh: z.boolean().optional() }))
    .query(async ({ input, ctx }) => {
      const db = ctx.db ?? defaultDb;
      const limit = input.limit ?? 24;

      // 1) Try DB first (offline-first) – Use viewCount desc when available
      try {
        const cached = await db
          .select()
          .from(youtubeVideos)
          .where(eq(youtubeVideos.channelId, input.channelId))
          .limit(limit);
        if (cached.length > 0 && !input.forceRefresh) {
          // Sort by viewCount desc locally, fallback by updatedAt
          const sorted = [...cached].sort((a: any, b: any) => (b.viewCount ?? 0) - (a.viewCount ?? 0));
          return sorted.map((v: any) => ({
            id: v.id,
            videoId: v.videoId,
            title: v.title,
            description: v.description,
            thumbnailUrl: v.thumbnailUrl,
            thumbnailPath: v.thumbnailPath,
            durationSeconds: v.durationSeconds,
            viewCount: v.viewCount,
            publishedAt: v.publishedAt,
            url: `https://www.youtube.com/watch?v=${v.videoId}`,
            downloadStatus: v.downloadStatus,
            downloadProgress: v.downloadProgress,
            downloadFilePath: v.downloadFilePath,
          }));
        }
      } catch {}

      const binPath = getBinaryFilePath();
      if (!fs.existsSync(binPath)) {
        const fallback = await db
          .select()
          .from(youtubeVideos)
          .where(eq(youtubeVideos.channelId, input.channelId))
          .limit(limit);
        const sorted = [...fallback].sort((a: any, b: any) => (b.viewCount ?? 0) - (a.viewCount ?? 0));
        return sorted.map((v: any) => ({
          id: v.id,
          videoId: v.videoId,
          title: v.title,
          description: v.description,
          thumbnailUrl: v.thumbnailUrl,
          thumbnailPath: v.thumbnailPath,
          durationSeconds: v.durationSeconds,
          viewCount: v.viewCount,
          publishedAt: v.publishedAt,
          url: `https://www.youtube.com/watch?v=${v.videoId}`,
          downloadStatus: v.downloadStatus,
          downloadProgress: v.downloadProgress,
          downloadFilePath: v.downloadFilePath,
        }));
      }

      const url = `https://www.youtube.com/channel/${input.channelId}/videos?view=0&sort=p&flow=grid`;
      const listing = await new Promise<string>((resolve, reject) => {
        const proc = spawnYtDlpWithLogging(
          binPath,
          ["-J", "--flat-playlist", url],
          { stdio: ["ignore", "pipe", "pipe"] },
          {
            operation: "fetch_channel_videos",
            url,
            channelId: input.channelId,
            other: { flatPlaylist: true },
          }
        );
        let out = ""; let err = "";
        proc.stdout?.on("data", (d) => (out += d.toString()));
        proc.stderr?.on("data", (d) => (err += d.toString()));
        proc.on("error", reject);
        proc.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(err || `yt-dlp exited ${code}`))));
      });
      const listData = JSON.parse(listing);

      // Log available fields from the first entry to understand the data structure
      if (listData?.entries?.[0]) {
        logger.info("[ytdlp] listChannelPopular flat-playlist entry fields", {
          sampleEntry: listData.entries[0],
          availableFields: Object.keys(listData.entries[0])
        });
      }

      const entries = (Array.isArray(listData?.entries) ? listData.entries : []).filter((e: any) => e?.id);
      // limit already computed above
      const now = Date.now();

      // Upsert lightweight metadata to DB for caching (avoid expensive individual fetches)
      const videoIds: string[] = [];
      for (const entry of entries.slice(0, limit)) {
        if (!entry.id) continue;
        videoIds.push(entry.id);

        try {
          // Check if video exists in DB
          const existing = await db
            .select()
            .from(youtubeVideos)
            .where(eq(youtubeVideos.videoId, entry.id))
            .limit(1);

          const thumbPath = (entry.thumbnails?.[0]?.url || entry.thumbnail)
            ? await downloadImageToCache(entry.thumbnails?.[0]?.url || entry.thumbnail, `video_${entry.id}`)
            : null;
          const videoData = {
            videoId: entry.id,
            title: entry.title || "Untitled",
            description: null,
            channelId: input.channelId,
            channelTitle: entry.channel || entry.uploader || null,
            durationSeconds: entry.duration || null,
            viewCount: entry.view_count || null,
            likeCount: null,
            thumbnailUrl: entry.thumbnails?.[0]?.url || entry.thumbnail || null,
            thumbnailPath: thumbPath,
            publishedAt: null,
            tags: null,
            raw: JSON.stringify(entry),
            updatedAt: now,
          };

          if (existing.length === 0) {
            // Insert new video
            await db.insert(youtubeVideos).values({
              id: crypto.randomUUID(),
              ...videoData,
              createdAt: now,
            });
          } else {
            // Update existing video metadata (preserve download status)
            await db
              .update(youtubeVideos)
              .set({ ...videoData, thumbnailPath: thumbPath ?? existing[0]?.thumbnailPath ?? null })
              .where(eq(youtubeVideos.videoId, entry.id));
          }
        } catch (e) {
          logger.error("[ytdlp] Failed to upsert video from flat-playlist", { videoId: entry.id, error: String(e) });
        }
      }

      // Fetch and return full video data from DB (includes download status)
      if (videoIds.length === 0) return [];

      const videos = await db
        .select()
        .from(youtubeVideos)
        .where(inArray(youtubeVideos.videoId, videoIds))
        .orderBy(desc(youtubeVideos.publishedAt));

      return videos.map((v) => ({
        id: v.id,
        videoId: v.videoId,
        title: v.title,
        description: v.description,
        thumbnailUrl: v.thumbnailUrl,
        thumbnailPath: v.thumbnailPath,
        durationSeconds: v.durationSeconds,
        viewCount: v.viewCount,
        publishedAt: v.publishedAt,
        url: `https://www.youtube.com/watch?v=${v.videoId}`,
        downloadStatus: v.downloadStatus,
        downloadProgress: v.downloadProgress,
        downloadFilePath: v.downloadFilePath,
      }));
    }),

  // List playlists of a channel via yt-dlp (offline-first, cached in DB)
  listChannelPlaylists: publicProcedure
    .input(z.object({ channelId: z.string(), limit: z.number().min(1).max(200).optional(), forceRefresh: z.boolean().optional() }))
    .query(async ({ input, ctx }) => {
      const db = ctx.db ?? defaultDb;
      const limit = input.limit ?? 30;

      // 1) Try DB first (offline-first)
      try {
        const cached = await db
          .select()
          .from(channelPlaylists)
          .where(eq(channelPlaylists.channelId, input.channelId))
          .orderBy(desc(channelPlaylists.updatedAt))
          .limit(limit);
        if (cached.length > 0 && !input.forceRefresh) {
          return cached.map((p: any) => ({
            id: p.id,
            playlistId: p.playlistId,
            title: p.title,
            url: p.url ?? `https://www.youtube.com/playlist?list=${p.playlistId}`,
            thumbnailUrl: p.thumbnailUrl,
            thumbnailPath: p.thumbnailPath,
            itemCount: p.itemCount,
            lastFetchedAt: p.lastFetchedAt,
          }));
        }
      } catch {}

      const binPath = getBinaryFilePath();
      if (!fs.existsSync(binPath)) {
        // No binary -> return cached
        const fallback = await db
          .select()
          .from(channelPlaylists)
          .where(eq(channelPlaylists.channelId, input.channelId))
          .orderBy(desc(channelPlaylists.updatedAt))
          .limit(limit);
        return fallback.map((p: any) => ({
          id: p.id,
          playlistId: p.playlistId,
          title: p.title,
          url: p.url ?? `https://www.youtube.com/playlist?list=${p.playlistId}`,
          thumbnailUrl: p.thumbnailUrl,
          thumbnailPath: p.thumbnailPath,
          itemCount: p.itemCount,
          lastFetchedAt: p.lastFetchedAt,
        }));
      }

      // 2) Refresh from yt-dlp
      const url = `https://www.youtube.com/channel/${input.channelId}/playlists`;
      const json = await new Promise<string>((resolve, reject) => {
        const proc = spawnYtDlpWithLogging(
          binPath,
          ["-J", "--flat-playlist", url],
          { stdio: ["ignore", "pipe", "pipe"] },
          {
            operation: "fetch_channel_playlists",
            url,
            channelId: input.channelId,
            other: { flatPlaylist: true },
          }
        );
        let out = ""; let err = "";
        proc.stdout?.on("data", (d) => (out += d.toString()));
        proc.stderr?.on("data", (d) => (err += d.toString()));
        proc.on("error", reject);
        proc.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(err || `yt-dlp exited ${code}`))));
      });
      const data = JSON.parse(json);
      const entries = (Array.isArray(data?.entries) ? data.entries : []).slice(0, limit);
      const now = Date.now();

      if (entries[0]) {
        logger.info("[ytdlp] listChannelPlaylists flat entry sample", {
          keys: Object.keys(entries[0] || {}),
          id: entries[0]?.id || entries[0]?.playlist_id,
          title: entries[0]?.title,
          thumbTop: entries[0]?.thumbnails?.[0]?.url || entries[0]?.thumbnail || null,
        });
      }

      for (let idx = 0; idx < entries.length; idx++) {
        const e = entries[idx];
        const pid = e?.id || e?.playlist_id;
        if (!pid) continue;
        const title = e?.title || "Untitled";
        let thumb = e?.thumbnails?.[0]?.url || e?.thumbnail || null;
        const url = e?.url || e?.webpage_url || `https://www.youtube.com/playlist?list=${pid}`;
        const itemCount = e?.playlist_count || e?.n_entries || null;

        if (!thumb) {
          logger.debug("[ytdlp] playlist thumbnail missing, enriching", { playlistId: pid, url });
          try {
            const detailJson = await new Promise<string>((resolve, reject) => {
              const proc = spawnYtDlpWithLogging(
                binPath,
                ["-J", url],
                { stdio: ["ignore", "pipe", "pipe"] },
                {
                  operation: "fetch_playlist_metadata",
                  url,
                  playlistId: pid,
                  channelId: input.channelId,
                  other: { itemIndex: idx },
                }
              );
              let out = ""; let err = "";
              proc.stdout?.on("data", (d) => (out += d.toString()));
              proc.stderr?.on("data", (d) => (err += d.toString()));
              proc.on("error", reject);
              proc.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(err || `yt-dlp exited ${code}`))));
            });
            const detail = JSON.parse(detailJson);
            if (Array.isArray(detail?.thumbnails) && detail.thumbnails.length > 0) {
              thumb = detail.thumbnails[detail.thumbnails.length - 1]?.url || detail.thumbnails[0]?.url || null;
              logger.debug("[ytdlp] playlist thumbnail enriched", { playlistId: pid, thumb });
            } else {
              logger.warn("[ytdlp] playlist detail has no thumbnails", { playlistId: pid, detailKeys: Object.keys(detail || {}) });
            }
          } catch (err) {
            logger.warn("[ytdlp] playlist enrich failed", { playlistId: pid, error: String(err) });
          }
        }

        // Attempt to cache thumbnail locally (for offline)
        let thumbnailPathLocal: string | null = null;
        if (thumb) {
          thumbnailPathLocal = await downloadImageToCache(thumb, `playlist_${pid}`);
        }

        try {
          const existing = await db
            .select()
            .from(channelPlaylists)
            .where(eq(channelPlaylists.playlistId, pid))
            .limit(1);

          if (existing.length === 0) {
            await db.insert(channelPlaylists).values({
              id: crypto.randomUUID(),
              playlistId: pid,
              channelId: input.channelId,
              title,
              description: null,
              thumbnailUrl: thumb,
              thumbnailPath: thumbnailPathLocal,
              itemCount,
              url,
              raw: JSON.stringify(e),
              createdAt: now,
              updatedAt: now,
              lastFetchedAt: now,
            });
            logger.info("[ytdlp] playlist inserted", { playlistId: pid, hasThumb: !!thumb });
          } else {
            await db
              .update(channelPlaylists)
              .set({
                channelId: input.channelId,
                title,
                thumbnailUrl: thumb,
                thumbnailPath: thumbnailPathLocal ?? existing[0]?.thumbnailPath ?? null,
                itemCount,
                url,
                raw: JSON.stringify(e),
                updatedAt: now,
                lastFetchedAt: now,
              })
              .where(eq(channelPlaylists.playlistId, pid));
            logger.debug("[ytdlp] playlist updated", { playlistId: pid, hasThumb: !!thumb });
          }
        } catch (err) {
          logger.error("[ytdlp] playlist upsert failed", { playlistId: pid, error: String(err) });
        }
      }

      const cached = await db
        .select()
        .from(channelPlaylists)
        .where(eq(channelPlaylists.channelId, input.channelId))
        .orderBy(desc(channelPlaylists.updatedAt))
        .limit(limit);
      return cached.map((p: any) => ({
        id: p.id,
        playlistId: p.playlistId,
        title: p.title,
        url: p.url ?? `https://www.youtube.com/playlist?list=${p.playlistId}`,
        thumbnailUrl: p.thumbnailUrl,
        thumbnailPath: p.thumbnailPath,
        itemCount: p.itemCount,
        lastFetchedAt: p.lastFetchedAt,
      }));
    }),

  // Get playlist details and items (videos) via yt-dlp, enriching DB for offline
  getPlaylistDetails: publicProcedure
    .input(
      z.object({
        playlistId: z.string(),
        forceRefresh: z.boolean().optional(),
        limit: z.number().min(1).max(500).optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = ctx.db ?? defaultDb;
      const limit = input.limit ?? 200;

      const binPath = getBinaryFilePath();

      // Try to read basic playlist metadata from DB first
      let playlistMeta: any | null = null;
      try {
        const existing = await db
          .select()
          .from(channelPlaylists)
          .where(eq(channelPlaylists.playlistId, input.playlistId))
          .limit(1);
        playlistMeta = existing?.[0] ?? null;
        if (playlistMeta && !input.forceRefresh && !fs.existsSync(binPath)) {
          return {
            playlistId: playlistMeta.playlistId,
            title: playlistMeta.title,
            description: playlistMeta.description,
            thumbnailUrl: playlistMeta.thumbnailUrl,
            thumbnailPath: playlistMeta.thumbnailPath,
            itemCount: playlistMeta.itemCount,
            url: playlistMeta.url ?? `https://www.youtube.com/playlist?list=${playlistMeta.playlistId}`,
            lastFetchedAt: playlistMeta.lastFetchedAt,
            videos: [],
          };
        }
      } catch {}

      if (!fs.existsSync(binPath)) {
        // No binary and no force refresh; return minimal info from DB if available
        return playlistMeta
          ? {
              playlistId: playlistMeta.playlistId,
              title: playlistMeta.title,
              description: playlistMeta.description,
              thumbnailUrl: playlistMeta.thumbnailUrl,
              thumbnailPath: playlistMeta.thumbnailPath,
              itemCount: playlistMeta.itemCount,
              url: playlistMeta.url ?? `https://www.youtube.com/playlist?list=${playlistMeta.playlistId}`,
              lastFetchedAt: playlistMeta.lastFetchedAt,
              videos: [],
            }
          : null;
      }

      const url = `https://www.youtube.com/playlist?list=${input.playlistId}`;

      // Fetch playlist JSON
      const json = await new Promise<string>((resolve, reject) => {
        const proc = spawnYtDlpWithLogging(
          binPath,
          ["-J", "--flat-playlist", url],
          { stdio: ["ignore", "pipe", "pipe"] },
          {
            operation: "get_playlist_details",
            url,
            playlistId: input.playlistId,
            other: { flatPlaylist: true },
          }
        );
        let out = ""; let err = "";
        proc.stdout?.on("data", (d) => (out += d.toString()));
        proc.stderr?.on("data", (d) => (err += d.toString()));
        proc.on("error", reject);
        proc.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(err || `yt-dlp exited ${code}`))));
      });

      const data = JSON.parse(json);
      const entries = (Array.isArray(data?.entries) ? data.entries : []).slice(0, limit);
      const now = Date.now();

      // Update playlist meta in DB
      try {
        const thumbTop = data?.thumbnails?.[data.thumbnails.length - 1]?.url || data?.thumbnails?.[0]?.url || null;
        const downloadedThumb = thumbTop ? await downloadImageToCache(thumbTop, `playlist_${input.playlistId}`) : null;

        const existing = await db
          .select()
          .from(channelPlaylists)
          .where(eq(channelPlaylists.playlistId, input.playlistId))
          .limit(1);

        const metaUpdate = {
          title: data?.title || playlistMeta?.title || "Untitled",
          description: data?.description || playlistMeta?.description || null,
          thumbnailUrl: thumbTop || playlistMeta?.thumbnailUrl || null,
          thumbnailPath: downloadedThumb ?? playlistMeta?.thumbnailPath ?? null,
          itemCount: (Array.isArray(data?.entries) ? data.entries.length : playlistMeta?.itemCount) ?? null,
          url,
          raw: JSON.stringify(data),
          updatedAt: now,
          lastFetchedAt: now,
        };

        if (existing.length === 0) {
          await db.insert(channelPlaylists).values({
            id: crypto.randomUUID(),
            playlistId: input.playlistId,
            channelId: playlistMeta?.channelId ?? null,
            createdAt: now,
            ...metaUpdate,
          });
        } else {
          await db.update(channelPlaylists).set(metaUpdate).where(eq(channelPlaylists.playlistId, input.playlistId));
        }
      } catch (err) {
        logger.warn("[ytdlp] failed to upsert playlist meta from detail", { playlistId: input.playlistId, error: String(err) });
      }

      // Upsert lightweight video metadata to DB for each entry
      const videoIds: string[] = [];
      for (const e of entries) {
        const vid = e?.id;
        if (!vid) continue;
        videoIds.push(vid);
        try {
          const existing = await db.select().from(youtubeVideos).where(eq(youtubeVideos.videoId, vid)).limit(1);
          const thumb = e?.thumbnails?.[0]?.url || e?.thumbnail || null;
          const thumbPath = thumb ? await downloadImageToCache(thumb, `video_${vid}`) : null;

          const videoData = {
            videoId: vid,
            title: e?.title || "Untitled",
            description: null,
            channelId: playlistMeta?.channelId || null,
            channelTitle: e?.channel || e?.uploader || null,
            durationSeconds: e?.duration || null,
            viewCount: e?.view_count || null,
            likeCount: null,
            thumbnailUrl: thumb,
            thumbnailPath: thumbPath,
            publishedAt: null,
            tags: null,
            raw: JSON.stringify(e),
            updatedAt: now,
          } as any;

          if (existing.length === 0) {
            await db.insert(youtubeVideos).values({ id: crypto.randomUUID(), ...videoData, createdAt: now });
          } else {
            await db
              .update(youtubeVideos)
              .set({ ...videoData, thumbnailPath: thumbPath ?? existing[0]?.thumbnailPath ?? null })
              .where(eq(youtubeVideos.videoId, vid));
          }
        } catch (e) {
          logger.error("[ytdlp] Failed to upsert playlist item", { videoId: vid, error: String(e) });
        }
      }

      // Fetch full videos with download status from DB and preserve playlist order
      const videos = videoIds.length
        ? await db
            .select()
            .from(youtubeVideos)
            .where(inArray(youtubeVideos.videoId, videoIds))
        : [];

      const orderMap = new Map<string, number>();
      videoIds.forEach((id, idx) => orderMap.set(id, idx));
      videos.sort((a: any, b: any) => (orderMap.get(a.videoId)! - orderMap.get(b.videoId)!));

      return {
        playlistId: input.playlistId,
        title: data?.title || playlistMeta?.title || "Untitled",
        description: data?.description || playlistMeta?.description || null,
        thumbnailUrl:
          (Array.isArray(data?.thumbnails) && data.thumbnails.length > 0
            ? data.thumbnails[data.thumbnails.length - 1]?.url || data.thumbnails[0]?.url
            : null) || playlistMeta?.thumbnailUrl || null,
        // thumbnailPath can be resolved from DB on the client if needed
        itemCount: Array.isArray(data?.entries) ? data.entries.length : playlistMeta?.itemCount ?? null,
        url,
        lastFetchedAt: Date.now(),
        videos: videos.map((v: any) => ({
          id: v.id,
          videoId: v.videoId,
          title: v.title,
          description: v.description,
          thumbnailUrl: v.thumbnailUrl,
          thumbnailPath: v.thumbnailPath,
          durationSeconds: v.durationSeconds,
          viewCount: v.viewCount,
          publishedAt: v.publishedAt,
          url: `https://www.youtube.com/watch?v=${v.videoId}`,
          downloadStatus: v.downloadStatus,
          downloadProgress: v.downloadProgress,
          downloadFilePath: v.downloadFilePath,
        })),
      };
    }),

  // List recent videos across all known channels (visited/downloaded), newest first
  listRecentVideos: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(200).optional(),
        offset: z.number().min(0).optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = ctx.db ?? defaultDb;
      const limit = input.limit ?? 50;
      const offset = input.offset ?? 0;

      // Order by publishedAt desc, fallback to updatedAt/createdAt for missing values
      // Using SQLite: order by coalesce(publishedAt, updatedAt, createdAt) desc
      const vids = await db
        .select()
        .from(youtubeVideos)
        .orderBy(
          desc(
            sql`coalesce(${youtubeVideos.publishedAt}, coalesce(${youtubeVideos.updatedAt}, ${youtubeVideos.createdAt}))`
          )
        )
        .limit(limit)
        .offset(offset);

      return vids.map((v: any) => ({
        id: v.id,
        videoId: v.videoId,
        title: v.title,
        description: v.description,
        channelId: v.channelId,
        channelTitle: v.channelTitle,
        thumbnailUrl: v.thumbnailUrl,
        thumbnailPath: v.thumbnailPath,
        durationSeconds: v.durationSeconds,
        viewCount: v.viewCount,
        publishedAt: v.publishedAt,
        url: `https://www.youtube.com/watch?v=${v.videoId}`,
        downloadStatus: v.downloadStatus,
        downloadProgress: v.downloadProgress,
        downloadFilePath: v.downloadFilePath,
      }));
    }),

  // Record watch progress (accumulated seconds and last position)
  recordWatchProgress: publicProcedure
    .input(
      z.object({
        videoId: z.string(),
        deltaSeconds: z.number().min(0).max(3600),
        positionSeconds: z.number().min(0).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = ctx.db ?? defaultDb;
      const now = Date.now();
      try {
        const existing = await db
          .select()
          .from(videoWatchStats)
          .where(eq(videoWatchStats.videoId, input.videoId))
          .limit(1);

        if (existing.length === 0) {
          await db.insert(videoWatchStats).values({
            id: crypto.randomUUID(),
            videoId: input.videoId,
            totalWatchSeconds: Math.floor(input.deltaSeconds),
            lastPositionSeconds: Math.floor(input.positionSeconds ?? 0),
            lastWatchedAt: now,
            createdAt: now,
            updatedAt: now,
          });
        } else {
          const prev = existing[0];
          await db
            .update(videoWatchStats)
            .set({
              totalWatchSeconds: Math.max(0, (prev.totalWatchSeconds ?? 0) + Math.floor(input.deltaSeconds)),
              lastPositionSeconds: Math.floor(input.positionSeconds ?? prev.lastPositionSeconds ?? 0),
              lastWatchedAt: now,
              updatedAt: now,
            })
            .where(eq(videoWatchStats.videoId, input.videoId));
        }
        return { success: true };
      } catch (e) {
        logger.error("[ytdlp] recordWatchProgress failed", e as Error);
        return { success: false };
      }
    }),

  // List recently watched videos joined with metadata
  listRecentWatched: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(200).optional() }).optional())
    .query(async ({ input, ctx }) => {
      const db = ctx.db ?? defaultDb;
      const limit = input?.limit ?? 30;
      // Get recent watch stats
      const stats = await db
        .select()
        .from(videoWatchStats)
        .orderBy(desc(videoWatchStats.lastWatchedAt))
        .limit(limit);

      const videoIds = stats.map((s: any) => s.videoId);
      if (videoIds.length === 0) return [] as any[];

      const vids = await db
        .select()
        .from(youtubeVideos)
        .where(inArray(youtubeVideos.videoId, videoIds));

      const map = new Map<string, any>();
      vids.forEach((v: any) => map.set(v.videoId, v));
      return stats
        .map((s: any) => {
          const v = map.get(s.videoId);
          if (!v) return null;
          return {
            id: v.id,
            videoId: v.videoId,
            title: v.title,
            description: v.description,
            channelId: v.channelId,
            channelTitle: v.channelTitle,
            thumbnailUrl: v.thumbnailUrl,
            thumbnailPath: v.thumbnailPath,
            durationSeconds: v.durationSeconds,
            viewCount: v.viewCount,
            publishedAt: v.publishedAt,
            url: `https://www.youtube.com/watch?v=${v.videoId}`,
            downloadStatus: v.downloadStatus,
            downloadProgress: v.downloadProgress,
            downloadFilePath: v.downloadFilePath,
            totalWatchSeconds: s.totalWatchSeconds,
            lastPositionSeconds: s.lastPositionSeconds,
            lastWatchedAt: s.lastWatchedAt,
          };
        })
        .filter(Boolean);
    }),

  // List all playlists across all channels
  listAllPlaylists: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(500).optional() }).optional())
    .query(async ({ input, ctx }) => {
      const db = ctx.db ?? defaultDb;
      const limit = input?.limit ?? 100;

      try {
        const playlists = await db
          .select({
            id: channelPlaylists.id,
            playlistId: channelPlaylists.playlistId,
            channelId: channelPlaylists.channelId,
            title: channelPlaylists.title,
            description: channelPlaylists.description,
            thumbnailUrl: channelPlaylists.thumbnailUrl,
            thumbnailPath: channelPlaylists.thumbnailPath,
            itemCount: channelPlaylists.itemCount,
            url: channelPlaylists.url,
            viewCount: channelPlaylists.viewCount,
            lastViewedAt: channelPlaylists.lastViewedAt,
            currentVideoIndex: channelPlaylists.currentVideoIndex,
            totalWatchTimeSeconds: channelPlaylists.totalWatchTimeSeconds,
            createdAt: channelPlaylists.createdAt,
            updatedAt: channelPlaylists.updatedAt,
            lastFetchedAt: channelPlaylists.lastFetchedAt,
          })
          .from(channelPlaylists)
          .orderBy(desc(channelPlaylists.lastViewedAt), desc(channelPlaylists.updatedAt))
          .limit(limit);

        // Get channel info for each playlist
        const channelIds = [...new Set(playlists.map((p) => p.channelId).filter(Boolean))];
        const channelsData = channelIds.length > 0
          ? await db
              .select()
              .from(channels)
              .where(inArray(channels.channelId, channelIds as string[]))
          : [];

        const channelMap = new Map(channelsData.map((c) => [c.channelId, c]));

        return playlists.map((p) => {
          const channel = p.channelId ? channelMap.get(p.channelId) : null;
          return {
            ...p,
            channelTitle: channel?.channelTitle || null,
          };
        });
      } catch (e) {
        logger.error("[ytdlp] listAllPlaylists failed", e as Error);
        return [];
      }
    }),

  // Update playlist view stats
  updatePlaylistView: publicProcedure
    .input(z.object({ playlistId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = ctx.db ?? defaultDb;
      const now = Date.now();

      try {
        const existing = await db
          .select()
          .from(channelPlaylists)
          .where(eq(channelPlaylists.playlistId, input.playlistId))
          .limit(1);

        if (existing.length === 0) {
          return { success: false, message: "Playlist not found" };
        }

        const current = existing[0];
        const newViewCount = (current.viewCount || 0) + 1;

        await db
          .update(channelPlaylists)
          .set({
            viewCount: newViewCount,
            lastViewedAt: now,
            updatedAt: now,
          })
          .where(eq(channelPlaylists.playlistId, input.playlistId));

        return {
          success: true,
          viewCount: newViewCount,
          lastViewedAt: now,
        };
      } catch (e) {
        logger.error("[ytdlp] updatePlaylistView failed", e as Error);
        return { success: false, message: "Failed to update view stats" };
      }
    }),

  // Update playlist playback position
  updatePlaylistPlayback: publicProcedure
    .input(
      z.object({
        playlistId: z.string(),
        currentVideoIndex: z.number().min(0),
        watchTimeSeconds: z.number().min(0).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = ctx.db ?? defaultDb;
      const now = Date.now();

      try {
        const existing = await db
          .select()
          .from(channelPlaylists)
          .where(eq(channelPlaylists.playlistId, input.playlistId))
          .limit(1);

        if (existing.length === 0) {
          return { success: false, message: "Playlist not found" };
        }

        const current = existing[0];
        const newTotalWatchTime = (current.totalWatchTimeSeconds || 0) + (input.watchTimeSeconds || 0);

        await db
          .update(channelPlaylists)
          .set({
            currentVideoIndex: input.currentVideoIndex,
            totalWatchTimeSeconds: newTotalWatchTime,
            updatedAt: now,
          })
          .where(eq(channelPlaylists.playlistId, input.playlistId));

        return {
          success: true,
          currentVideoIndex: input.currentVideoIndex,
          totalWatchTimeSeconds: newTotalWatchTime,
        };
      } catch (e) {
        logger.error("[ytdlp] updatePlaylistPlayback failed", e as Error);
        return { success: false, message: "Failed to update playback position" };
      }
    }),

  // Create a new annotation/comment on a video at a specific timestamp
  createAnnotation: publicProcedure
    .input(
      z.object({
        videoId: z.string(),
        timestampSeconds: z.number().min(0),
        selectedText: z.string().optional(),
        note: z.string().min(1),
        emoji: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = ctx.db ?? defaultDb;
      const now = Date.now();
      try {
        const id = crypto.randomUUID();
        await db.insert(videoAnnotations).values({
          id,
          videoId: input.videoId,
          timestampSeconds: Math.floor(input.timestampSeconds),
          selectedText: input.selectedText ?? null,
          note: input.note,
          emoji: input.emoji ?? null,
          createdAt: now,
          updatedAt: now,
        });
        return { success: true as const, id, createdAt: now } as const;
      } catch (e) {
        logger.error("[ytdlp] createAnnotation failed", e as Error);
        return { success: false as const, message: String(e) } as const;
      }
    }),

  // Get all annotations for a video, sorted by timestamp
  getAnnotations: publicProcedure
    .input(z.object({ videoId: z.string() }))
    .query(async ({ input, ctx }) => {
      const db = ctx.db ?? defaultDb;
      try {
        const rows = await db
          .select()
          .from(videoAnnotations)
          .where(eq(videoAnnotations.videoId, input.videoId))
          .orderBy(videoAnnotations.timestampSeconds);
        return rows;
      } catch (e) {
        logger.error("[ytdlp] getAnnotations failed", e as Error);
        return [] as any[];
      }
    }),

  // Update an annotation
  updateAnnotation: publicProcedure
    .input(
      z.object({
        id: z.string(),
        note: z.string().min(1),
        selectedText: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = ctx.db ?? defaultDb;
      const now = Date.now();
      try {
        await db
          .update(videoAnnotations)
          .set({
            note: input.note,
            selectedText: input.selectedText ?? null,
            updatedAt: now,
          })
          .where(eq(videoAnnotations.id, input.id));
        return { success: true as const } as const;
      } catch (e) {
        logger.error("[ytdlp] updateAnnotation failed", e as Error);
        return { success: false as const, message: String(e) } as const;
      }
    }),

  // Delete an annotation
  deleteAnnotation: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = ctx.db ?? defaultDb;
      try {
        await db.delete(videoAnnotations).where(eq(videoAnnotations.id, input.id));
        return { success: true as const } as const;
      } catch (e) {
        logger.error("[ytdlp] deleteAnnotation failed", e as Error);
        return { success: false as const, message: String(e) } as const;
      }
    }),
});

export type YtDlpRouter = typeof ytdlpRouter;
