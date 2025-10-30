import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { youtubeVideos, channels } from "@yt-dlp-gui/database";
import { logger } from "@/helpers/logger";
import { mapYtDlpMetadata, extractChannelData } from "./metadata";
import { downloadImageToCache } from "./thumbnail";

export const upsertVideoFromMeta = async (
  db: any,
  mapped: ReturnType<typeof mapYtDlpMetadata>
) => {
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
};

export const upsertChannelData = async (
  db: any,
  channelData: ReturnType<typeof extractChannelData>
) => {
  if (!channelData || !channelData.channelId) return;

  const now = Date.now();
  try {
    // Cache channel avatar locally for offline use
    let channelThumbPath: string | null = null;
    if (channelData.thumbnailUrl) {
      channelThumbPath = await downloadImageToCache(
        channelData.thumbnailUrl,
        `channel_${channelData.channelId}`
      );
    }

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
        thumbnailPath: channelThumbPath,
        bannerUrl: null,
        subscriberCount: channelData.subscriberCount,
        videoCount: channelData.videoCount,
        viewCount: channelData.viewCount,
        customUrl: channelData.customUrl,
        raw: channelData.raw,
        createdAt: now,
        updatedAt: now,
      });
      logger.info("[database] Created new channel", {
        channelId: channelData.channelId,
        channelTitle: channelData.channelTitle,
      });
    } else {
      // Update existing channel data
      await db
        .update(channels)
        .set({
          channelTitle: channelData.channelTitle,
          channelDescription: channelData.channelDescription,
          channelUrl: channelData.channelUrl,
          thumbnailUrl: channelData.thumbnailUrl,
          thumbnailPath: channelThumbPath ?? existing[0]?.thumbnailPath ?? null,
          subscriberCount: channelData.subscriberCount,
          customUrl: channelData.customUrl,
          raw: channelData.raw,
          updatedAt: now,
        })
        .where(eq(channels.channelId, channelData.channelId));
      logger.debug("[database] Updated channel", { channelId: channelData.channelId });
    }
  } catch (e) {
    logger.error("[database] Failed to upsert channel", e as Error);
  }
};
