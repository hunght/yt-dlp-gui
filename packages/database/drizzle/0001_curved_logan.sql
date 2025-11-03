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
CREATE UNIQUE INDEX `saved_words_translation_id_unique` ON `saved_words` (`translation_id`);