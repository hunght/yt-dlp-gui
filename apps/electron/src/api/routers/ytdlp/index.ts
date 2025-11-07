import { z } from "zod";
import { publicProcedure, t } from "@/api/trpc";
import { logger } from "@/helpers/logger";
import { app } from "electron";
import fs from "fs";
import path from "path";

import { mapYtDlpMetadata, extractChannelData, extractSubtitleLanguages } from "@/api/utils/ytdlp-utils/metadata";
import { upsertChannelData } from "@/api/utils/ytdlp-utils/database";
import { spawnYtDlpWithLogging, extractVideoId, runYtDlpJson } from "@/api/utils/ytdlp-utils/ytdlp";
import { downloadImageToCache } from "@/api/utils/ytdlp-utils/cache";
import { eq, desc, inArray, sql } from "drizzle-orm";
import { youtubeVideos, channels, channelPlaylists, videoWatchStats } from "@/api/db/schema";
import defaultDb from "@/api/db";
import { getYtDlpAssetName } from "@/api/utils/ytdlp-utils/ytdlp-utils";

const getBinDir = () => path.join(app.getPath("userData"), "bin");
const getBinaryFilePath = () => path.join(getBinDir(), getYtDlpAssetName(process.platform));



async function upsertVideoSearchFts(db: any, videoId: string, title: string | null | undefined, transcript: string | null | undefined) {
  try {
    // FTS5 virtual tables with UNINDEXED columns don't support WHERE clauses on those columns
    // Since video_id is UNINDEXED (to save index space), we use INSERT OR REPLACE with rowid
    // The strategy: just INSERT and let FTS5 handle it (duplicates are acceptable for search)
    // We'll deduplicate results in search queries using GROUP BY
    await db.run(sql`INSERT INTO video_search_fts (video_id, title, transcript) VALUES (${videoId}, ${title ?? ""}, ${transcript ?? ""})`);
  } catch {
    // Silently ignore errors - FTS is a nice-to-have feature for search
    // If it fails, video metadata will still be accessible through regular queries
    logger.debug("[fts] insert skipped", { videoId, reason: "already exists or error" });
  }
}




export const ytdlpRouter = t.router({
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
        } catch {
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
      } catch {
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
  // Full-text search across video titles + transcripts
  searchVideosText: publicProcedure
    .input(z.object({ q: z.string().min(1), limit: z.number().min(1).max(100).optional() }))
    .query(async ({ input, ctx }) => {
      const db = ctx.db ?? defaultDb;
      const limit = input.limit ?? 20;
      try {
        const rows = await db.all(sql`SELECT video_id, title FROM video_search_fts WHERE video_search_fts MATCH ${input.q} LIMIT ${limit * 2}`);
        // Deduplicate video_ids (FTS may contain duplicates since video_id is UNINDEXED)
        const uniqueIds = [...new Set(rows.map((r: any) => r.video_id))].slice(0, limit);
        if (uniqueIds.length === 0) return [] as any[];

        // Join with youtube_videos to return richer info
        const vids = await db
          .select()
          .from(youtubeVideos)
          .where(inArray(youtubeVideos.videoId, uniqueIds));
        const map = new Map(vids.map((v: any) => [v.videoId, v]));
        return uniqueIds
          .map((id) => map.get(id))
          .filter(Boolean);
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
});

// Router type not exported (unused)
