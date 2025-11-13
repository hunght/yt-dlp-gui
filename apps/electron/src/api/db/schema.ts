// Re-export everything from the @learnifytube/database package
export * from "@learnifytube/database/schema";

// Local extension tables (ensure types available even if package dist not updated)
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const videoWatchStats = sqliteTable(
  "video_watch_stats",
  {
    id: text("id").primaryKey(),
    videoId: text("video_id").notNull().unique(),
    totalWatchSeconds: integer("total_watch_seconds").default(0),
    lastPositionSeconds: integer("last_position_seconds").default(0),
    lastWatchedAt: integer("last_watched_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at"),
  },
  (table) => [
    index("video_watch_stats_video_id_idx").on(table.videoId),
    index("video_watch_stats_last_watched_at_idx").on(table.lastWatchedAt),
  ]
);
