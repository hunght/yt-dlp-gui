import { logger } from "@/helpers/logger";

export const mapYtDlpMetadata = (meta: any) => {
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

export const extractChannelData = (meta: any) => {
  const channelId = meta?.channel_id || meta?.channelId || null;

  logger.debug("[metadata] Processing channel data", {
    hasChannelId: !!channelId,
    channelId,
    channel_id: meta?.channel_id,
    channelIdAlt: meta?.channelId,
    uploader_id: meta?.uploader_id,
    channel: meta?.channel,
    uploader: meta?.uploader,
    hasChannelThumbnails: Array.isArray(meta?.channel_thumbnails)
      ? meta.channel_thumbnails.length
      : 0,
    hasThumbnails: Array.isArray(meta?.thumbnails) ? meta.thumbnails.length : 0,
    uploader_avatar: meta?.uploader_avatar,
    channel_avatar: meta?.channel_avatar,
  });

  if (!channelId) {
    logger.warn("[metadata] No channel_id found in metadata");
    return null;
  }

  // Extract channel thumbnail (profile photo)
  let channelThumbnail = null;
  if (
    meta?.channel_thumbnails &&
    Array.isArray(meta.channel_thumbnails) &&
    meta.channel_thumbnails.length > 0
  ) {
    // Get the highest quality thumbnail
    channelThumbnail = meta.channel_thumbnails[meta.channel_thumbnails.length - 1]?.url ?? null;
  } else if (meta?.uploader_avatar || meta?.channel_avatar) {
    channelThumbnail = meta.uploader_avatar || meta.channel_avatar;
  }

  logger.debug("[metadata] thumbnail selection", {
    selected: channelThumbnail,
    channel_thumbnails_last: Array.isArray(meta?.channel_thumbnails)
      ? meta.channel_thumbnails[meta.channel_thumbnails.length - 1]?.url
      : undefined,
  });

  return {
    channelId,
    channelTitle: meta?.channel || meta?.uploader || meta?.channel_title || "Unknown Channel",
    channelDescription: meta?.channel_description ?? null,
    channelUrl: meta?.channel_url || (channelId ? `https://www.youtube.com/channel/${channelId}` : null),
    thumbnailUrl: channelThumbnail,
    subscriberCount: meta?.channel_follower_count ?? null,
    videoCount: null, // Not typically in video metadata
    viewCount: null, // Not typically in video metadata
    customUrl: meta?.uploader_url?.includes("@") ? meta.uploader_url.split("@")[1] : null,
    raw: JSON.stringify(meta),
  } as const;
};
