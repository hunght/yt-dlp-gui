-- Create user_preferences table for storing user language preferences and settings
CREATE TABLE IF NOT EXISTS `user_preferences` (
  `id` text PRIMARY KEY NOT NULL DEFAULT 'default',
  `preferred_languages` text NOT NULL DEFAULT '[]',
  `system_language` text,
  `created_at` integer NOT NULL,
  `updated_at` integer
);

-- Insert default row
INSERT OR IGNORE INTO `user_preferences` (`id`, `preferred_languages`, `created_at`)
VALUES ('default', '[]', unixepoch() * 1000);
