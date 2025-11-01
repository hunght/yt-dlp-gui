ALTER TABLE `translation_cache` ADD `query_count` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `translation_cache` ADD `first_queried_at` integer NOT NULL;--> statement-breakpoint
ALTER TABLE `translation_cache` ADD `last_queried_at` integer NOT NULL;--> statement-breakpoint
CREATE INDEX `translation_cache_query_count_idx` ON `translation_cache` (`query_count`);--> statement-breakpoint
CREATE INDEX `translation_cache_last_queried_idx` ON `translation_cache` (`last_queried_at`);