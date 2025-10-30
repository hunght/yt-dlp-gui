ALTER TABLE `channel_playlists` ADD `view_count` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `channel_playlists` ADD `last_viewed_at` integer;--> statement-breakpoint
ALTER TABLE `channel_playlists` ADD `current_video_index` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `channel_playlists` ADD `total_watch_time_seconds` integer DEFAULT 0;--> statement-breakpoint
CREATE INDEX `channel_playlists_last_viewed_at_idx` ON `channel_playlists` (`last_viewed_at`);