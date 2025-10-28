ALTER TABLE `downloads` ADD `queue_position` integer;--> statement-breakpoint
ALTER TABLE `downloads` ADD `priority` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `downloads` ADD `retry_count` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `downloads` ADD `max_retries` integer DEFAULT 3;--> statement-breakpoint
ALTER TABLE `downloads` ADD `paused_at` integer;--> statement-breakpoint
ALTER TABLE `downloads` ADD `cancelled_at` integer;--> statement-breakpoint
CREATE INDEX `downloads_queue_position_idx` ON `downloads` (`queue_position`);