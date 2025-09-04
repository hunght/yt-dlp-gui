ALTER TABLE `downloads` ADD `video_id` text REFERENCES youtube_videos(video_id);--> statement-breakpoint
CREATE INDEX `downloads_video_id_idx` ON `downloads` (`video_id`);--> statement-breakpoint
ALTER TABLE `downloads` DROP COLUMN `title`;--> statement-breakpoint
ALTER TABLE `downloads` DROP COLUMN `metadata`;--> statement-breakpoint
ALTER TABLE `youtube_videos` ADD `thumbnail_path` text;