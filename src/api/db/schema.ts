import { sqliteTable, text, integer, index, unique } from "drizzle-orm/sqlite-core";

export const youtubeVideos = sqliteTable(
  "youtube_videos",
  {
    id: text("id").primaryKey(),
    videoId: text("video_id").notNull(), // YouTube video ID
    title: text("title").notNull(),
    description: text("description"),
    channelId: text("channel_id"),
    channelTitle: text("channel_title"),
    durationSeconds: integer("duration_seconds"),
    viewCount: integer("view_count"),
    likeCount: integer("like_count"),
    thumbnailUrl: text("thumbnail_url"),
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
    title: text("title"),
    status: text("status", { enum: ["pending", "downloading", "completed", "failed", "cancelled"] })
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
    metadata: text("metadata"), // JSON string of video metadata

    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at"),
    completedAt: integer("completed_at"),
  },
  (table) => [
    index("downloads_status_idx").on(table.status),
    index("downloads_created_at_idx").on(table.createdAt),
  ]
);
