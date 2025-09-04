CREATE TABLE `downloads` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`title` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`progress` integer DEFAULT 0,
	`format` text,
	`quality` text,
	`file_path` text,
	`file_size` integer,
	`error_message` text,
	`metadata` text,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`completed_at` integer
);
--> statement-breakpoint
CREATE INDEX `downloads_status_idx` ON `downloads` (`status`);--> statement-breakpoint
CREATE INDEX `downloads_created_at_idx` ON `downloads` (`created_at`);