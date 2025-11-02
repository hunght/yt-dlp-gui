-- Add emoji field to video_annotations for quick categorization
ALTER TABLE `video_annotations` ADD COLUMN `emoji` text;

