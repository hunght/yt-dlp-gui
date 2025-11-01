CREATE TABLE `translation_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`source_text` text NOT NULL,
	`source_lang` text NOT NULL,
	`target_lang` text NOT NULL,
	`translated_text` text NOT NULL,
	`detected_lang` text,
	`created_at` integer NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `translation_cache_lookup_idx` ON `translation_cache` (`source_text`,`source_lang`,`target_lang`);--> statement-breakpoint
CREATE UNIQUE INDEX `translation_cache_source_text_source_lang_target_lang_unique` ON `translation_cache` (`source_text`,`source_lang`,`target_lang`);
