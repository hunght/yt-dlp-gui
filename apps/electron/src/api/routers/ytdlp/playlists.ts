import { z } from "zod";
import { publicProcedure, t } from "@/api/trpc";
import { logger } from "@/helpers/logger";
import { app } from "electron";
import fs from "fs";
import path from "path";
import { eq, desc, inArray, and } from "drizzle-orm";
import { channelPlaylists, playlistItems, youtubeVideos, channels } from "@/api/db/schema";
import defaultDb from "@/api/db";
import { spawnYtDlpWithLogging } from "./utils/ytdlp";
import { downloadImageToCache } from "./utils/cache";

async function ensureDir(p: string) {
  try {
    fs.mkdirSync(p, { recursive: true });
  } catch {}
}

export const playlistsRouter = t.router({
  // Get detailed playlist information with videos
  getDetails: publicProcedure
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

      const { getBinaryFilePath } = await import("./binary");
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
      } catch {}

      // If we have cached data and not forcing refresh, return from DB
      if (playlistMeta && !input.forceRefresh) {
        try {
          const items = await db
            .select({
              position: playlistItems.position,
              videoId: playlistItems.videoId,
              video: youtubeVideos,
            })
            .from(playlistItems)
            .leftJoin(youtubeVideos, eq(playlistItems.videoId, youtubeVideos.videoId))
            .where(eq(playlistItems.playlistId, input.playlistId))
            .orderBy(playlistItems.position)
            .limit(limit);

          if (items.length > 0) {
            const videos = items
              .filter((item) => item.video)
              .map((item) => ({
                id: item.video!.id,
                videoId: item.video!.videoId,
                title: item.video!.title,
                description: item.video!.description,
                thumbnailUrl: item.video!.thumbnailUrl,
                thumbnailPath: item.video!.thumbnailPath,
                durationSeconds: item.video!.durationSeconds,
                viewCount: item.video!.viewCount,
                publishedAt: item.video!.publishedAt,
                url: `https://www.youtube.com/watch?v=${item.video!.videoId}`,
                downloadStatus: item.video!.downloadStatus,
                downloadProgress: item.video!.downloadProgress,
                downloadFilePath: item.video!.downloadFilePath,
              }));

            return {
              playlistId: playlistMeta.playlistId,
              title: playlistMeta.title,
              description: playlistMeta.description,
              thumbnailUrl: playlistMeta.thumbnailUrl,
              thumbnailPath: playlistMeta.thumbnailPath,
              itemCount: playlistMeta.itemCount,
              currentVideoIndex: playlistMeta.currentVideoIndex ?? 0,
              url: playlistMeta.url ?? `https://www.youtube.com/playlist?list=${playlistMeta.playlistId}`,
              lastFetchedAt: playlistMeta.lastFetchedAt,
              videos,
            };
          }
        } catch (err) {
          logger.error("[playlists] Failed to load cached items", { playlistId: input.playlistId });
        }
      }

      // If no binary and no force refresh, return what we have or null
      if (!fs.existsSync(binPath)) {
        return playlistMeta
          ? {
              playlistId: playlistMeta.playlistId,
              title: playlistMeta.title,
              description: playlistMeta.description,
              thumbnailUrl: playlistMeta.thumbnailUrl,
              thumbnailPath: playlistMeta.thumbnailPath,
              itemCount: playlistMeta.itemCount,
              currentVideoIndex: playlistMeta.currentVideoIndex ?? 0,
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
        logger.warn("[playlists] failed to upsert meta", { playlistId: input.playlistId });
      }

      // Upsert videos and playlist items
      const videoIds: string[] = [];
      for (let idx = 0; idx < entries.length; idx++) {
        const e = entries[idx];
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

          // Upsert playlist item
          try {
            const existingItem = await db
              .select()
              .from(playlistItems)
              .where(and(eq(playlistItems.playlistId, input.playlistId), eq(playlistItems.videoId, vid)))
              .limit(1);

            if (existingItem.length === 0) {
              await db.insert(playlistItems).values({
                id: crypto.randomUUID(),
                playlistId: input.playlistId,
                videoId: vid,
                position: idx,
                createdAt: now,
                updatedAt: now,
              });
            } else {
              await db
                .update(playlistItems)
                .set({ position: idx, updatedAt: now })
                .where(eq(playlistItems.id, existingItem[0].id));
            }
          } catch (err) {
            logger.error("[playlists] Failed to upsert item", { playlistId: input.playlistId, videoId: vid });
          }
        } catch (e) {
          logger.error("[playlists] Failed to upsert video", { videoId: vid });
        }
      }

      // Fetch full videos with download status
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
        thumbnailPath: playlistMeta?.thumbnailPath || null,
        itemCount: Array.isArray(data?.entries) ? data.entries.length : playlistMeta?.itemCount ?? null,
        currentVideoIndex: playlistMeta?.currentVideoIndex ?? 0,
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

  // List all playlists
  listAll: publicProcedure
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
        logger.error("[playlists] listAll failed", e as Error);
        return [];
      }
    }),

  // Update playlist view stats
  updateView: publicProcedure
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
        logger.error("[playlists] updateView failed", e as Error);
        return { success: false, message: "Failed to update view stats" };
      }
    }),

  // Update playlist playback position
  updatePlayback: publicProcedure
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
        logger.error("[playlists] updatePlayback failed", e as Error);
        return { success: false, message: "Failed to update playback position" };
      }
    }),
});

export type PlaylistsRouter = typeof playlistsRouter;

