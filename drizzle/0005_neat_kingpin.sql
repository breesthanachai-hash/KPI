CREATE TABLE `work_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`work_item_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`submission_type` text DEFAULT 'other' NOT NULL,
	`title` text NOT NULL,
	`link_url` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`file_name` text DEFAULT '' NOT NULL,
	`storage_key` text DEFAULT '' NOT NULL,
	`content_type` text DEFAULT 'application/octet-stream' NOT NULL,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`submitted_by` text DEFAULT '' NOT NULL,
	`submitted_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`reviewed_by` text,
	`reviewed_at` text,
	`reviewer_note` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`work_item_id`) REFERENCES `work_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `work_submissions_work_status_idx` ON `work_submissions` (`work_item_id`,`status`);--> statement-breakpoint
CREATE INDEX `work_submissions_employee_submitted_idx` ON `work_submissions` (`employee_id`,`submitted_at`);--> statement-breakpoint
ALTER TABLE `employee_profiles` ADD `profile_image_key` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `employee_profiles` ADD `profile_image_content_type` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `employee_profiles` ADD `profile_image_updated_at` text;