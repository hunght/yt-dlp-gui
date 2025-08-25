CREATE TABLE `youtube_videos` (
	`id` text PRIMARY KEY NOT NULL,
	`video_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`channel_id` text,
	`channel_title` text,
	`duration_seconds` integer,
	`view_count` integer,
	`like_count` integer,
	`thumbnail_url` text,
	`published_at` integer,
	`tags` text,
	`raw_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `youtube_videos_video_id_idx` ON `youtube_videos` (`video_id`);--> statement-breakpoint
CREATE INDEX `youtube_videos_published_at_idx` ON `youtube_videos` (`published_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `youtube_videos_video_id_unique` ON `youtube_videos` (`video_id`);