CREATE TABLE `notification_reads` (
	`id` text PRIMARY KEY NOT NULL,
	`user_key` text NOT NULL,
	`notification_id` text NOT NULL,
	`read_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_reads_user_notification_unique` ON `notification_reads` (`user_key`,`notification_id`);--> statement-breakpoint
CREATE INDEX `notification_reads_user_read_idx` ON `notification_reads` (`user_key`,`read_at`);