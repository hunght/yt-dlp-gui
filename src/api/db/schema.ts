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

    // Consolidated download fields (single-version per video)
    downloadStatus: text("download_status", {
      enum: [
        "pending",
        "downloading",
        "completed",
        "failed",
        "cancelled",
        "queued",
        "paused",
      ],
    }),
    downloadProgress: integer("download_progress"), // 0-100
    downloadFormat: text("download_format"),
    downloadQuality: text("download_quality"),
    downloadFilePath: text("download_file_path"),
    downloadFileSize: integer("download_file_size"),
    lastErrorMessage: text("last_error_message"),
    errorType: text("error_type"), // 'restricted' | 'network' | 'format' | 'unknown'
    isRetryable: integer("is_retryable", { mode: "boolean" }),
    lastDownloadedAt: integer("last_downloaded_at"),

    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at"),
  },
  (table) => [
    index("youtube_videos_video_id_idx").on(table.videoId),
    index("youtube_videos_published_at_idx").on(table.publishedAt),
    unique().on(table.videoId), // one entry per video
  ]
);

// Define relations
export const channelsRelations = relations(channels, ({ many }) => ({
  videos: many(youtubeVideos),
}));

export const youtubeVideosRelations = relations(youtubeVideos, ({ one }) => ({
  channel: one(channels, {
    fields: [youtubeVideos.channelId],
    references: [channels.channelId],
  }),
}));

// TypeScript types derived from Drizzle schema
export type Channel = typeof channels.$inferSelect;
export type NewChannel = typeof channels.$inferInsert;

export type YoutubeVideo = typeof youtubeVideos.$inferSelect;
export type NewYoutubeVideo = typeof youtubeVideos.$inferInsert;
