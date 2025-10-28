import { sqliteTable, text, integer, index, unique } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

export const channels = sqliteTable(
  "channels",
  {
    id: text("id").primaryKey(),
    channelId: text("channel_id").notNull().unique(), // YouTube channel ID
    channelTitle: text("channel_title").notNull(),
    channelDescription: text("channel_description"),
    channelUrl: text("channel_url"),
    thumbnailUrl: text("thumbnail_url"), // Channel profile photo URL
    thumbnailPath: text("thumbnail_path"), // Local file path for channel photo
    bannerUrl: text("banner_url"), // Channel banner image URL
    subscriberCount: integer("subscriber_count"),
    videoCount: integer("video_count"),
    viewCount: integer("view_count"),
    customUrl: text("custom_url"), // e.g., @channelname
    raw: text("raw_json"), // Raw JSON metadata from YouTube

    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at"),
  },
  (table) => [
    index("channels_channel_id_idx").on(table.channelId),
    index("channels_updated_at_idx").on(table.updatedAt),
  ]
);

export const youtubeVideos = sqliteTable(
  "youtube_videos",
  {
    id: text("id").primaryKey(),
    videoId: text("video_id").notNull(), // YouTube video ID
    title: text("title").notNull(),
    description: text("description"),
    channelId: text("channel_id").references(() => channels.channelId), // Reference to channels table
    channelTitle: text("channel_title"), // Denormalized for backward compatibility
    durationSeconds: integer("duration_seconds"),
    viewCount: integer("view_count"),
    likeCount: integer("like_count"),
    thumbnailUrl: text("thumbnail_url"),
    thumbnailPath: text("thumbnail_path"), // local file path after download
    publishedAt: integer("published_at"),
    tags: text("tags"), // comma-separated or JSON
    raw: text("raw_json"), // raw JSON metadata string

    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at"),
  },
  (table) => [
    index("youtube_videos_video_id_idx").on(table.videoId),
    index("youtube_videos_published_at_idx").on(table.publishedAt),
    unique().on(table.videoId), // one entry per video
  ]
);

export const downloads = sqliteTable(
  "downloads",
  {
    id: text("id").primaryKey(),
    url: text("url").notNull(),
    videoId: text("video_id").references(() => youtubeVideos.videoId), // Reference to youtube_videos table
    status: text("status", { enum: ["pending", "downloading", "completed", "failed", "cancelled", "queued", "paused"] })
      .notNull()
      .default("pending"),
    progress: integer("progress").default(0), // 0-100
    format: text("format"), // video format (mp4, webm, etc.)
    quality: text("quality"), // video quality (720p, 1080p, etc.)
    filePath: text("file_path"), // local file path after download
    fileSize: integer("file_size"), // file size in bytes
    errorMessage: text("error_message"),
    errorType: text("error_type"), // 'restricted' | 'network' | 'format' | 'unknown'
    isRetryable: integer("is_retryable", { mode: "boolean" }).default(true), // whether the download can be retried

    // Queue management fields
    queuePosition: integer("queue_position"), // Order in queue (null if not queued)
    priority: integer("priority").default(0), // Higher = more important
    retryCount: integer("retry_count").default(0), // Number of retry attempts
    maxRetries: integer("max_retries").default(3), // Maximum retry attempts
    pausedAt: integer("paused_at"), // Timestamp when paused
    cancelledAt: integer("cancelled_at"), // Timestamp when cancelled

    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at"),
    completedAt: integer("completed_at"),
  },
  (table) => [
    index("downloads_status_idx").on(table.status),
    index("downloads_created_at_idx").on(table.createdAt),
    index("downloads_video_id_idx").on(table.videoId),
    index("downloads_queue_position_idx").on(table.queuePosition),
  ]
);

// Define relations
export const channelsRelations = relations(channels, ({ many }) => ({
  videos: many(youtubeVideos),
}));

export const youtubeVideosRelations = relations(youtubeVideos, ({ many, one }) => ({
  downloads: many(downloads),
  channel: one(channels, {
    fields: [youtubeVideos.channelId],
    references: [channels.channelId],
  }),
}));

export const downloadsRelations = relations(downloads, ({ one }) => ({
  video: one(youtubeVideos, {
    fields: [downloads.videoId],
    references: [youtubeVideos.videoId],
  }),
}));

// TypeScript types derived from Drizzle schema
export type Channel = typeof channels.$inferSelect;
export type NewChannel = typeof channels.$inferInsert;

export type YoutubeVideo = typeof youtubeVideos.$inferSelect;
export type NewYoutubeVideo = typeof youtubeVideos.$inferInsert;

export type Download = typeof downloads.$inferSelect;
export type NewDownload = typeof downloads.$inferInsert;
