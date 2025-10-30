import { z } from "zod";
import { publicProcedure, t } from "@/api/trpc";
import { logger } from "@/helpers/logger";
import { app, net } from "electron";
import fs from "fs";
import path from "path";
import os from "os";
import { getDirectLatestDownloadUrl, getLatestReleaseApiUrl, getYtDlpAssetName } from "./utils";
import { spawn } from "child_process";
import { eq, desc, inArray } from "drizzle-orm";
import { youtubeVideos, channels, channelPlaylists } from "@/api/db/schema";
import defaultDb from "@/api/db";

const getBinDir = () => path.join(app.getPath("userData"), "bin");
const getVersionFilePath = () => path.join(getBinDir(), "yt-dlp-version.txt");
const getBinaryFilePath = () => path.join(getBinDir(), getYtDlpAssetName(process.platform));

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

// Helper to map yt-dlp JSON to our schema with better fidelity
const mapYtDlpMetadata = (meta: any) => {
  return {
    videoId: meta?.id || meta?.video_id || "",
    title: meta?.fulltitle || meta?.title || "Untitled",
    description: meta?.description ?? null,
    channelId: meta?.channel_id || meta?.channelId || null,
    channelTitle: meta?.channel || meta?.uploader || meta?.channel_title || null,
    durationSeconds: meta?.duration ? Math.round(meta.duration) : null,
    viewCount: meta?.view_count ?? null,
    likeCount: meta?.like_count ?? null,
    thumbnailUrl: Array.isArray(meta?.thumbnails)
      ? meta.thumbnails[meta.thumbnails.length - 1]?.url ?? null
      : meta?.thumbnail ?? null,
    publishedAt: meta?.upload_date
      ? Date.parse(
          `${meta.upload_date.slice(0, 4)}-${meta.upload_date.slice(4, 6)}-${meta.upload_date.slice(6, 8)}`
        )
      : null,
    tags: Array.isArray(meta?.tags) ? JSON.stringify(meta.tags) : null,
    raw: JSON.stringify(meta),
  } as const;
};

async function runYtDlpJson(binPath: string, url: string): Promise<any> {
  const metaJson = await new Promise<string>((resolve, reject) => {
    const proc = spawn(binPath, ["-J", url], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.stderr.on("data", (d) => (err += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(err || `yt-dlp -J exited with code ${code}`));
    });
  });
  return JSON.parse(metaJson);
}

async function upsertVideoFromMeta(db: any, mapped: ReturnType<typeof mapYtDlpMetadata>) {
  if (!mapped.videoId) return;
  const now = Date.now();
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
      thumbnailPath: null,
      publishedAt: mapped.publishedAt,
      tags: mapped.tags,
      raw: mapped.raw,
      createdAt: now,
      updatedAt: now,
    });
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
        publishedAt: mapped.publishedAt,
        tags: mapped.tags,
        raw: mapped.raw,
        updatedAt: now,
      })
      .where(eq(youtubeVideos.videoId, mapped.videoId));
  }
}

// Helper to extract channel data from yt-dlp metadata
const extractChannelData = (meta: any) => {
  const channelId = meta?.channel_id || meta?.channelId || null;

  logger.debug("[extractChannelData] Processing metadata", {
    hasChannelId: !!channelId,
    channelId,
    channel_id: meta?.channel_id,
    channelIdAlt: meta?.channelId,
    uploader_id: meta?.uploader_id,
    channel: meta?.channel,
    uploader: meta?.uploader,
  });

  if (!channelId) {
    logger.warn("[extractChannelData] No channel_id found in metadata");
    return null;
  }

  // Extract channel thumbnail (profile photo)
  let channelThumbnail = null;
  if (meta?.channel_thumbnails && Array.isArray(meta.channel_thumbnails) && meta.channel_thumbnails.length > 0) {
    // Get the highest quality thumbnail
    channelThumbnail = meta.channel_thumbnails[meta.channel_thumbnails.length - 1]?.url ?? null;
  } else if (meta?.uploader_avatar || meta?.channel_avatar) {
    channelThumbnail = meta.uploader_avatar || meta.channel_avatar;
  }

  return {
    channelId,
    channelTitle: meta?.channel || meta?.uploader || meta?.channel_title || "Unknown Channel",
    channelDescription: meta?.channel_description ?? null,
    channelUrl: meta?.channel_url || (channelId ? `https://www.youtube.com/channel/${channelId}` : null),
    thumbnailUrl: channelThumbnail,
    subscriberCount: meta?.channel_follower_count ?? null,
    videoCount: null, // Not typically in video metadata
    viewCount: null, // Not typically in video metadata
    customUrl: meta?.uploader_url?.includes('@') ? meta.uploader_url.split('@')[1] : null,
    raw: JSON.stringify(meta),
  } as const;
};

// Helper to upsert channel data into database
const upsertChannelData = async (db: any, channelData: ReturnType<typeof extractChannelData>) => {
  if (!channelData || !channelData.channelId) return;

  const now = Date.now();
  try {
    const existing = await db
      .select()
      .from(channels)
      .where(eq(channels.channelId, channelData.channelId))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(channels).values({
        id: crypto.randomUUID(),
        channelId: channelData.channelId,
        channelTitle: channelData.channelTitle,
        channelDescription: channelData.channelDescription,
        channelUrl: channelData.channelUrl,
        thumbnailUrl: channelData.thumbnailUrl,
        thumbnailPath: null,
        bannerUrl: null,
        subscriberCount: channelData.subscriberCount,
        videoCount: channelData.videoCount,
        viewCount: channelData.viewCount,
        customUrl: channelData.customUrl,
        raw: channelData.raw,
        createdAt: now,
        updatedAt: now,
      });
      logger.info("[ytdlp] Created new channel", { channelId: channelData.channelId, channelTitle: channelData.channelTitle });
    } else {
      // Update existing channel data
      await db
        .update(channels)
        .set({
          channelTitle: channelData.channelTitle,
          channelDescription: channelData.channelDescription,
          channelUrl: channelData.channelUrl,
          thumbnailUrl: channelData.thumbnailUrl,
          subscriberCount: channelData.subscriberCount,
          customUrl: channelData.customUrl,
          raw: channelData.raw,
          updatedAt: now,
        })
        .where(eq(channels.channelId, channelData.channelId));
      logger.debug("[ytdlp] Updated channel", { channelId: channelData.channelId });
    }
  } catch (e) {
    logger.error("[ytdlp] Failed to upsert channel", e as Error);
  }
};

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
          return { success: true as const, info: mapped } as const;
        }
      }

      // Run yt-dlp -J to fetch metadata (cache miss or store=false)
      logger.info("[ytdlp] fetchVideoInfo fetching from yt-dlp", { url: input.url });
      let meta: any | null = null;
      try {
        const metaJson = await new Promise<string>((resolve, reject) => {
          const proc = spawn(binPath, ["-J", input.url], { stdio: ["ignore", "pipe", "pipe"] });
          let out = "";
          let err = "";
          proc.stdout.on("data", (d) => (out += d.toString()));
          proc.stderr.on("data", (d) => (err += d.toString()));
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
              thumbnailPath: null,
              publishedAt: mapped.publishedAt,
              tags: mapped.tags,
              raw: mapped.raw,
              createdAt: now,
              updatedAt: now,
            });
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
                publishedAt: mapped.publishedAt,
                tags: mapped.tags,
                raw: mapped.raw,
                updatedAt: now,
              })
              .where(eq(youtubeVideos.videoId, mapped.videoId));
          }
        } catch (e) {
          logger.error("[ytdlp] DB upsert in fetchVideoInfo failed", e as Error);
        }
      }

      return { success: true as const, info: mapped } as const;
    }),

  // Start a YouTube download using the installed yt-dlp binary and persist to DB
  startVideoDownload: publicProcedure
    .input(
      z.object({
        url: z.string().url(),
        format: z.string().optional(), // yt-dlp format string
        outputDir: z.string().optional(), // custom output dir, default app downloads dir
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = ctx.db ?? defaultDb;
      const startedAt = Date.now();

      // Ensure binary exists (do not auto-install here to keep responsibilities clear)
      const binPath = getBinaryFilePath();
      if (!fs.existsSync(binPath)) {
        return {
          success: false as const,
          message: "yt-dlp binary not installed. Please install first.",
        } as const;
      }

      const downloadsRoot = input.outputDir || path.join(app.getPath("downloads"), "yt-dlp-gui");
      if (!fs.existsSync(downloadsRoot)) fs.mkdirSync(downloadsRoot, { recursive: true });

      // Extract video ID from URL to check if we already have metadata
      const videoIdMatch = input.url.match(/[?&]v=([^&]+)/);
      const urlVideoId = videoIdMatch ? videoIdMatch[1] : null;

      // Try to get existing metadata from DB first
      let meta: any | null = null;
      let videoId = "";
      let title = "Untitled";
      let description: string | null = null;
      let channelId: string | null = null;
      let channelTitle: string | null = null;
      let durationSeconds: number | null = null;
      let viewCount: number | null = null;
      let likeCount: number | null = null;
      let thumbnailUrl: string | null = null;
      let publishedAt: number | null = null;
      let tags: string | null = null;
      let raw = "{}";

      if (urlVideoId) {
        const existingVideo = await db
          .select()
          .from(youtubeVideos)
          .where(eq(youtubeVideos.videoId, urlVideoId))
          .limit(1);

        if (existingVideo.length > 0) {
          // Use existing metadata from DB
          logger.info("[ytdlp] Using cached video metadata from DB", { videoId: urlVideoId });
          const existing = existingVideo[0];
          videoId = existing.videoId;
          title = existing.title;
          description = existing.description;
          channelId = existing.channelId;
          channelTitle = existing.channelTitle;
          durationSeconds = existing.durationSeconds;
          viewCount = existing.viewCount;
          likeCount = existing.likeCount;
          thumbnailUrl = existing.thumbnailUrl;
          publishedAt = existing.publishedAt;
          tags = existing.tags;
          raw = existing.raw ?? "{}";
          meta = JSON.parse(raw);
        }
      }

      // 1) Fetch metadata via yt-dlp -J only if not in DB
      if (!meta) {
        logger.info("[ytdlp] Fetching video metadata from yt-dlp", { url: input.url });
        try {
          const metaJson = await new Promise<string>((resolve, reject) => {
            const proc = spawn(binPath, ["-J", input.url], { stdio: ["ignore", "pipe", "pipe"] });
            let out = "";
            let err = "";
            proc.stdout.on("data", (d) => (out += d.toString()));
            proc.stderr.on("data", (d) => (err += d.toString()));
            proc.on("error", reject);
            proc.on("close", (code) => {
              if (code === 0) resolve(out);
              else reject(new Error(err || `yt-dlp -J exited with code ${code}`));
            });
          });
          meta = JSON.parse(metaJson);
        } catch (e) {
          logger.error("[ytdlp] Failed to fetch video metadata", e as Error);
          return { success: false as const, message: `Metadata error: ${String(e)}` } as const;
        }

        // Extract minimal fields with better fidelity (use fulltitle etc.)
        const mapped = mapYtDlpMetadata(meta);
        videoId = mapped.videoId;
        title = mapped.title;
        description = mapped.description;
        channelId = mapped.channelId;
        channelTitle = mapped.channelTitle;
        durationSeconds = mapped.durationSeconds;
        viewCount = mapped.viewCount;
        likeCount = mapped.likeCount;
        thumbnailUrl = mapped.thumbnailUrl;
        publishedAt = mapped.publishedAt;
        tags = mapped.tags;
        raw = mapped.raw;

        // Extract and upsert channel data
        const channelData = extractChannelData(meta);
        if (channelData) {
          await upsertChannelData(db, channelData);
        }
      }

      // 2) Upsert video into youtubeVideos (only if we fetched new data)
      if (!urlVideoId || urlVideoId !== videoId) {
        try {
          const now = Date.now();
          // Check if exists
          const existing = await db
            .select()
            .from(youtubeVideos)
            .where(eq(youtubeVideos.videoId, videoId))
            .limit(1);

          if (existing.length === 0) {
            await db.insert(youtubeVideos).values({
              id: crypto.randomUUID(),
              videoId,
              title,
              description,
              channelId,
              channelTitle,
              durationSeconds,
              viewCount,
              likeCount,
              thumbnailUrl,
              thumbnailPath: null,
              publishedAt,
              tags,
              raw,
              createdAt: now,
              updatedAt: now,
            });
          } else {
            await db
              .update(youtubeVideos)
              .set({
                title,
                description,
                channelId,
                channelTitle,
                durationSeconds,
                viewCount,
                likeCount,
                thumbnailUrl,
                publishedAt,
                tags,
                raw,
                updatedAt: now,
              })
              .where(eq(youtubeVideos.videoId, videoId));
          }
        } catch (e) {
          logger.error("[ytdlp] DB upsert video failed", e as Error);
        }
      }

      // 3) Initialize state (no downloads table, update youtube_videos)
      const downloadId = crypto.randomUUID();
      const outputTemplate = path.join(downloadsRoot, "%(fulltitle)s [%(id)s].%(ext)s");
      try {
        await db
          .update(youtubeVideos)
          .set({
            downloadStatus: "downloading",
            downloadProgress: 0,
            updatedAt: startedAt,
          })
          .where(eq(youtubeVideos.videoId, videoId));
      } catch (e) {
        logger.error("[ytdlp] Failed to initialize download state", e as Error);
      }

      // 4) Spawn yt-dlp download in background
      const args = [
        "-o",
        outputTemplate,
        "--newline",
        "--no-simulate",
      ];
      if (input.format) {
        args.push("-f", input.format);
      }
      args.push(input.url);

      logger.info("[ytdlp] Spawning download", { args });

      const proc = spawn(binPath, args, { stdio: ["ignore", "pipe", "pipe"] });

  const onProgress = async (line: string) => {
        // Typical line: "[download]  12.3% of ..."
        const match = line.match(/(\d+(?:\.\d+)?)%/);
        if (match) {
          const pct = Math.min(100, Math.max(0, Math.round(parseFloat(match[1]))));
          try {
            await db
              .update(youtubeVideos)
              .set({ downloadProgress: pct, updatedAt: Date.now(), downloadStatus: "downloading" })
              .where(eq(youtubeVideos.videoId, videoId));
          } catch (e) {
            logger.error("[ytdlp] Failed to update progress", e as Error);
          }
        }
      };

      let mergedFilePath: string | null = null;

      proc.stdout.on("data", (chunk) => {
        const text = chunk.toString();
        text.split("\n").forEach((line: string) => {
          if (!line.trim()) return;
          onProgress(line).catch(() => undefined);
          // Capture final file path if available in merger line
          const m = line.match(/Merging formats into \"(.+?)\"/);
          if (m) mergedFilePath = m[1];
        });
      });
      proc.stderr.on("data", (chunk) => {
        const text = chunk.toString();
        text.split("\n").forEach((line: string) => {
          if (!line.trim()) return;
          onProgress(line).catch(() => undefined);
          const m = line.match(/Merging formats into \"(.+?)\"/);
          if (m) mergedFilePath = m[1];
        });
      });

      proc.on("close", async (code) => {
        const finishedAt = Date.now();
        if (code === 0) {
          // Try to resolve final file path if not captured
          let finalPath = mergedFilePath;
          if (!finalPath) {
            try {
              // Attempt to find the file by id in output directory
              const files = fs.readdirSync(downloadsRoot);
              const match = files.find((f) => f.includes(`[${videoId}]`));
              if (match) finalPath = path.join(downloadsRoot, match);
            } catch {}
          }
          try {
            await db
              .update(youtubeVideos)
              .set({
                downloadStatus: "completed",
                downloadProgress: 100,
                downloadFilePath: finalPath ?? null,
                lastDownloadedAt: finishedAt,
                updatedAt: finishedAt,
              })
              .where(eq(youtubeVideos.videoId, videoId));
            logger.info("[ytdlp] Download completed", {
              downloadId,
              videoId,
              filePath: finalPath ?? null,
              durationMs: finishedAt - startedAt,
            });
          } catch (e) {
            logger.error("[ytdlp] Failed to mark completed", e as Error);
          }
        } else {
          try {
            await db
              .update(youtubeVideos)
              .set({
                downloadStatus: "failed",
                lastErrorMessage: `yt-dlp exited with code ${code}`,
                errorType: "unknown",
                updatedAt: finishedAt,
              })
              .where(eq(youtubeVideos.videoId, videoId));
            logger.error("[ytdlp] Download failed", { downloadId, videoId, code });
          } catch (e) {
            logger.error("[ytdlp] Failed to mark failed", e as Error);
          }
        }
      });

      return { success: true as const, id: downloadId } as const;
    }),

  // Legacy getDownload endpoint removed in favor of getVideoPlayback

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

      // Get channel info
      const channelRows = await db
        .select()
        .from(channels)
        .where(eq(channels.channelId, input.channelId))
        .limit(1);

      if (channelRows.length === 0) {
        return null;
      }

      const channel = channelRows[0];

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
      return {
        videoId: v.videoId,
        title: v.title,
        filePath: v.downloadFilePath,
        status: v.downloadStatus,
        progress: v.downloadProgress,
      } as const;
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
        const proc = spawn(binPath, ["-J", "--flat-playlist", url], { stdio: ["ignore", "pipe", "pipe"] });
        let out = ""; let err = "";
        proc.stdout.on("data", (d) => (out += d.toString()));
        proc.stderr.on("data", (d) => (err += d.toString()));
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
              thumbnailPath: null,
              createdAt: now,
            });
          } else {
            // Update existing video metadata (preserve download status)
            await db
              .update(youtubeVideos)
              .set(videoData)
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
        const proc = spawn(binPath, ["-J", "--flat-playlist", url], { stdio: ["ignore", "pipe", "pipe"] });
        let out = ""; let err = "";
        proc.stdout.on("data", (d) => (out += d.toString()));
        proc.stderr.on("data", (d) => (err += d.toString()));
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
              thumbnailPath: null,
              createdAt: now,
            });
          } else {
            // Update existing video metadata (preserve download status)
            await db
              .update(youtubeVideos)
              .set(videoData)
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
        const proc = spawn(binPath, ["-J", "--flat-playlist", url], { stdio: ["ignore", "pipe", "pipe"] });
        let out = ""; let err = "";
        proc.stdout.on("data", (d) => (out += d.toString()));
        proc.stderr.on("data", (d) => (err += d.toString()));
        proc.on("error", reject);
        proc.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(err || `yt-dlp exited ${code}`))));
      });
      const data = JSON.parse(json);
      const entries = (Array.isArray(data?.entries) ? data.entries : []).slice(0, limit);
      const now = Date.now();

      for (const e of entries) {
        const pid = e?.id || e?.playlist_id;
        if (!pid) continue;
        const title = e?.title || "Untitled";
        const thumb = e?.thumbnails?.[0]?.url || e?.thumbnail || null;
        const url = e?.url || e?.webpage_url || `https://www.youtube.com/playlist?list=${pid}`;
        const itemCount = e?.playlist_count || e?.n_entries || null;

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
              thumbnailPath: null,
              itemCount,
              url,
              raw: JSON.stringify(e),
              createdAt: now,
              updatedAt: now,
              lastFetchedAt: now,
            });
          } else {
            await db
              .update(channelPlaylists)
              .set({
                channelId: input.channelId,
                title,
                thumbnailUrl: thumb,
                itemCount,
                url,
                raw: JSON.stringify(e),
                updatedAt: now,
                lastFetchedAt: now,
              })
              .where(eq(channelPlaylists.playlistId, pid));
          }
        } catch {}
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
});

export type YtDlpRouter = typeof ytdlpRouter;
