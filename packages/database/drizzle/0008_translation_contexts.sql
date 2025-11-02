-- Create translation_contexts table to link translations to videos and timestamps
CREATE TABLE IF NOT EXISTS `translation_contexts` (
  `id` text PRIMARY KEY NOT NULL,
  `translation_id` text NOT NULL,
  `video_id` text NOT NULL,
  `timestamp_seconds` integer NOT NULL,
  `context_text` text,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`translation_id`) REFERENCES `translation_cache`(`id`) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS `translation_contexts_translation_id_idx` ON `translation_contexts` (`translation_id`);
CREATE INDEX IF NOT EXISTS `translation_contexts_video_id_idx` ON `translation_contexts` (`video_id`);
CREATE UNIQUE INDEX IF NOT EXISTS `translation_contexts_translation_id_video_id_timestamp_seconds_unique` ON `translation_contexts` (`translation_id`,`video_id`,`timestamp_seconds`);

