-- Create video_transcripts table
CREATE TABLE IF NOT EXISTS `video_transcripts` (
  `id` text PRIMARY KEY NOT NULL,
  `video_id` text NOT NULL,
  `language` text,
  `is_auto_generated` integer DEFAULT 0,
  `source` text,
  `text` text,
  `created_at` integer NOT NULL,
  `updated_at` integer
);

CREATE INDEX IF NOT EXISTS `video_transcripts_video_id_idx` ON `video_transcripts` (`video_id`);
CREATE UNIQUE INDEX IF NOT EXISTS `video_transcripts_video_language_unique` ON `video_transcripts` (`video_id`,`language`);

-- Create FTS5 virtual table for searching titles and transcripts
-- We store `video_id` UNINDEXED to join back to metadata when searching
CREATE VIRTUAL TABLE IF NOT EXISTS `video_search_fts` USING fts5(
  `title`,
  `transcript`,
  `video_id` UNINDEXED,
  tokenize='porter'
);

-- Optional: create an auxiliary table to track existence (no triggers here); we will manage updates in app code.
