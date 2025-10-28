import { z } from "zod";
import { publicProcedure, t } from "@/api/trpc";
import { logger } from "@/helpers/logger";
import { app, net } from "electron";
import fs from "fs";
import path from "path";
import os from "os";
import { getDirectLatestDownloadUrl, getLatestReleaseApiUrl, getYtDlpAssetName } from "./utils";
import { spawn } from "child_process";
import { eq, desc } from "drizzle-orm";
import { downloads, youtubeVideos } from "@/api/db/schema";
import defaultDb from "@/api/db";

const getBinDir = () => path.join(app.getPath("userData"), "bin");
const getVersionFilePath = () => path.join(getBinDir(), "yt-dlp-version.txt");
const getBinaryFilePath = () => path.join(getBinDir(), getYtDlpAssetName(process.platform));

async function fetchLatestRelease(): Promise<{ version: string; assetUrl: string } | null> {
  try {
    const releaseRes = await fetch(getLatestReleaseApiUrl());
    if (!releaseRes.ok) {
      logger.error("[ytdlp] Failed to fetch latest release", { status: releaseRes.status });
      // Fallback to direct latest download URL without version
      return { version: "unknown", assetUrl: getDirectLatestDownloadUrl(process.platform) };
    }
    const json = (await releaseRes.json()) as { tag_name?: string; assets?: Array<{ name: string; browser_download_url: string }>; };
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

const ensureBinDir = () => {
  const binDir = getBinDir();
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }
  return binDir;
};

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

      // 3) Create download record
      const downloadId = crypto.randomUUID();
      const outputTemplate = path.join(downloadsRoot, "%(fulltitle)s [%(id)s].%(ext)s");
      try {
        await db.insert(downloads).values({
          id: downloadId,
          url: input.url,
          videoId,
          status: "downloading",
          progress: 0,
          format: input.format ?? null,
          quality: null,
          filePath: null,
          fileSize: null,
          errorMessage: null,
          errorType: null,
          isRetryable: true,
          createdAt: startedAt,
          updatedAt: startedAt,
          completedAt: null,
        });
      } catch (e) {
        logger.error("[ytdlp] DB insert download failed", e as Error);
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
              .update(downloads)
              .set({ progress: pct, updatedAt: Date.now() })
              .where(eq(downloads.id, downloadId));
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
              .update(downloads)
              .set({
                status: "completed",
                progress: 100,
                filePath: finalPath ?? null,
                updatedAt: finishedAt,
                completedAt: finishedAt,
              })
              .where(eq(downloads.id, downloadId));
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
              .update(downloads)
              .set({ status: "failed", updatedAt: finishedAt, isRetryable: true })
              .where(eq(downloads.id, downloadId));
            logger.error("[ytdlp] Download failed", { downloadId, videoId, code });
          } catch (e) {
            logger.error("[ytdlp] Failed to mark failed", e as Error);
          }
        }
      });

      return { success: true as const, id: downloadId } as const;
    }),

  // Simple fetcher to get a download by id
  getDownload: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const db = ctx.db ?? defaultDb;
      const rows = await db.select().from(downloads).where(eq(downloads.id, input.id)).limit(1);
      return rows[0] ?? null;
    }),

  // List completed downloads with basic video info
  listCompletedDownloads: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(200).optional() }).optional())
    .query(async ({ input, ctx }) => {
      const db = ctx.db ?? defaultDb;
      const limit = input?.limit ?? 50;
      const rows = await db
        .select({
          id: downloads.id,
          url: downloads.url,
          videoId: downloads.videoId,
          filePath: downloads.filePath,
          createdAt: downloads.createdAt,
          completedAt: downloads.completedAt,
          title: youtubeVideos.title,
          thumbnailUrl: youtubeVideos.thumbnailUrl,
          thumbnailPath: youtubeVideos.thumbnailPath,
        })
        .from(downloads)
        .leftJoin(youtubeVideos, eq(downloads.videoId, youtubeVideos.videoId))
        .where(eq(downloads.status, "completed"))
        .orderBy(desc(downloads.completedAt))
        .limit(limit);
      return rows;
    }),
});

export type YtDlpRouter = typeof ytdlpRouter;
