CREATE TABLE `channel_playlists` (
	`id` text PRIMARY KEY NOT NULL,
	`playlist_id` text NOT NULL,
	`channel_id` text,
	`title` text NOT NULL,
	`description` text,
	`thumbnail_url` text,
	`thumbnail_path` text,
	`item_count` integer,
	`url` text,
	`raw_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`last_fetched_at` integer,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`channel_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `channel_playlists_playlist_id_unique` ON `channel_playlists` (`playlist_id`);--> statement-breakpoint
CREATE INDEX `channel_playlists_channel_id_idx` ON `channel_playlists` (`channel_id`);--> statement-breakpoint
CREATE INDEX `channel_playlists_updated_at_idx` ON `channel_playlists` (`updated_at`);