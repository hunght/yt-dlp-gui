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
	`view_count` integer DEFAULT 0,
	`last_viewed_at` integer,
	`current_video_index` integer DEFAULT 0,
	`total_watch_time_seconds` integer DEFAULT 0,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`last_fetched_at` integer,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`channel_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `channel_playlists_playlist_id_unique` ON `channel_playlists` (`playlist_id`);--> statement-breakpoint
CREATE INDEX `channel_playlists_channel_id_idx` ON `channel_playlists` (`channel_id`);--> statement-breakpoint
CREATE INDEX `channel_playlists_updated_at_idx` ON `channel_playlists` (`updated_at`);--> statement-breakpoint
CREATE INDEX `channel_playlists_last_viewed_at_idx` ON `channel_playlists` (`last_viewed_at`);--> statement-breakpoint
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
CREATE TABLE `playlist_items` (
	`id` text PRIMARY KEY NOT NULL,
	`playlist_id` text NOT NULL,
	`video_id` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`playlist_id`) REFERENCES `channel_playlists`(`playlist_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`video_id`) REFERENCES `youtube_videos`(`video_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `playlist_items_playlist_id_idx` ON `playlist_items` (`playlist_id`);--> statement-breakpoint
CREATE INDEX `playlist_items_video_id_idx` ON `playlist_items` (`video_id`);--> statement-breakpoint
CREATE INDEX `playlist_items_position_idx` ON `playlist_items` (`playlist_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `playlist_items_playlist_id_video_id_unique` ON `playlist_items` (`playlist_id`,`video_id`);--> statement-breakpoint
CREATE TABLE `saved_words` (
	`id` text PRIMARY KEY NOT NULL,
	`translation_id` text NOT NULL,
	`notes` text,
	`review_count` integer DEFAULT 0 NOT NULL,
	`last_reviewed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`translation_id`) REFERENCES `translation_cache`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `saved_words_translation_id_idx` ON `saved_words` (`translation_id`);--> statement-breakpoint
CREATE INDEX `saved_words_last_reviewed_idx` ON `saved_words` (`last_reviewed_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `saved_words_translation_id_unique` ON `saved_words` (`translation_id`);--> statement-breakpoint
CREATE TABLE `translation_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`source_text` text NOT NULL,
	`source_lang` text NOT NULL,
	`target_lang` text NOT NULL,
	`translated_text` text NOT NULL,
	`detected_lang` text,
	`query_count` integer DEFAULT 1 NOT NULL,
	`first_queried_at` integer NOT NULL,
	`last_queried_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `translation_cache_lookup_idx` ON `translation_cache` (`source_text`,`source_lang`,`target_lang`);--> statement-breakpoint
CREATE INDEX `translation_cache_query_count_idx` ON `translation_cache` (`query_count`);--> statement-breakpoint
CREATE INDEX `translation_cache_last_queried_idx` ON `translation_cache` (`last_queried_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `translation_cache_source_text_source_lang_target_lang_unique` ON `translation_cache` (`source_text`,`source_lang`,`target_lang`);--> statement-breakpoint
CREATE TABLE `translation_contexts` (
	`id` text PRIMARY KEY NOT NULL,
	`translation_id` text NOT NULL,
	`video_id` text NOT NULL,
	`timestamp_seconds` integer NOT NULL,
	`context_text` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`translation_id`) REFERENCES `translation_cache`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `translation_contexts_translation_id_idx` ON `translation_contexts` (`translation_id`);--> statement-breakpoint
CREATE INDEX `translation_contexts_video_id_idx` ON `translation_contexts` (`video_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `translation_contexts_translation_id_video_id_timestamp_seconds_unique` ON `translation_contexts` (`translation_id`,`video_id`,`timestamp_seconds`);--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`preferred_languages` text DEFAULT '[]' NOT NULL,
	`system_language` text,
	`created_at` integer NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `video_annotations` (
	`id` text PRIMARY KEY NOT NULL,
	`video_id` text NOT NULL,
	`timestamp_seconds` integer NOT NULL,
	`selected_text` text,
	`note` text NOT NULL,
	`emoji` text,
	`created_at` integer NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `video_annotations_video_id_idx` ON `video_annotations` (`video_id`);--> statement-breakpoint
CREATE INDEX `video_annotations_timestamp_idx` ON `video_annotations` (`timestamp_seconds`);--> statement-breakpoint
CREATE TABLE `video_transcripts` (
	`id` text PRIMARY KEY NOT NULL,
	`video_id` text NOT NULL,
	`language` text,
	`is_auto_generated` integer DEFAULT false,
	`source` text,
	`text` text,
	`raw_vtt` text,
	`segments_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `video_transcripts_video_id_idx` ON `video_transcripts` (`video_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `video_transcripts_video_id_language_unique` ON `video_transcripts` (`video_id`,`language`);--> statement-breakpoint
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
CREATE INDEX `video_watch_stats_last_watched_at_idx` ON `video_watch_stats` (`last_watched_at`);--> statement-breakpoint
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