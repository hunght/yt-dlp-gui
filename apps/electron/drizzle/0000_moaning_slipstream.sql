CREATE TABLE `channels` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`channel_title` text NOT NULL,
	`channel_description` text,
	`channel_url` text,
	`thumbnail_url` text,
	`thumbnail_path` text,
	`banner_url` text,
	`subscriber_count` integer,
	`video_count` integer,
	`view_count` integer,
	`custom_url` text,
	`raw_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `channels_channel_id_unique` ON `channels` (`channel_id`);--> statement-breakpoint
CREATE INDEX `channels_channel_id_idx` ON `channels` (`channel_id`);--> statement-breakpoint
CREATE INDEX `channels_updated_at_idx` ON `channels` (`updated_at`);--> statement-breakpoint
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
	`thumbnail_path` text,
	`published_at` integer,
	`tags` text,
	`raw_json` text,
	`download_status` text,
	`download_progress` integer,
	`download_format` text,
	`download_quality` text,
	`download_file_path` text,
	`download_file_size` integer,
	`last_error_message` text,
	`error_type` text,
	`is_retryable` integer,
	`last_downloaded_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`channel_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `youtube_videos_video_id_idx` ON `youtube_videos` (`video_id`);--> statement-breakpoint
CREATE INDEX `youtube_videos_published_at_idx` ON `youtube_videos` (`published_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `youtube_videos_video_id_unique` ON `youtube_videos` (`video_id`);