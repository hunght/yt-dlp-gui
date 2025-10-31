-- Add raw VTT and segments JSON columns to video_transcripts for caching
ALTER TABLE `video_transcripts` ADD COLUMN `raw_vtt` text;
ALTER TABLE `video_transcripts` ADD COLUMN `segments_json` text;
