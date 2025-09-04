ALTER TABLE `downloads` ADD `error_type` text;--> statement-breakpoint
ALTER TABLE `downloads` ADD `is_retryable` integer DEFAULT true;