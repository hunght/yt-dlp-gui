CREATE TABLE `video_watch_stats` (
	`id` text PRIMARY KEY NOT NULL,
	`video_id` text NOT NULL,
	`total_watch_seconds` integer DEFAULT 0,
	`last_position_seconds` integer DEFAULT 0,
	`last_watched_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `video_watch_stats_video_id_unique` ON `video_watch_stats` (`video_id`);--> statement-breakpoint
CREATE INDEX `video_watch_stats_video_id_idx` ON `video_watch_stats` (`video_id`);--> statement-breakpoint
CREATE INDEX `video_watch_stats_last_watched_at_idx` ON `video_watch_stats` (`last_watched_at`);