-- Create video_annotations table for storing user annotations tied to video timestamps
CREATE TABLE IF NOT EXISTS `video_annotations` (
  `id` text PRIMARY KEY NOT NULL,
  `video_id` text NOT NULL,
  `timestamp_seconds` integer NOT NULL,
  `selected_text` text,
  `note` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer
);

CREATE INDEX IF NOT EXISTS `video_annotations_video_id_idx` ON `video_annotations` (`video_id`);
CREATE INDEX IF NOT EXISTS `video_annotations_timestamp_idx` ON `video_annotations` (`timestamp_seconds`);
