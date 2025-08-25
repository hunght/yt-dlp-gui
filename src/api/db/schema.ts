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
