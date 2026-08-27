CREATE TABLE `point_cap_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`claim_month` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`employee_month_sequence_key` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `point_cap_claim_employee_month_sequence_unique` ON `point_cap_claims` (`employee_month_sequence_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `point_cap_claim_source_unique` ON `point_cap_claims` (`source_type`,`source_id`);--> statement-breakpoint
CREATE INDEX `point_cap_claim_employee_month_idx` ON `point_cap_claims` (`employee_id`,`claim_month`);--> statement-breakpoint
ALTER TABLE `organization_policy_publish_claims` ADD `expected_content_hash` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `work_submissions_one_submitted_per_work_unique` ON `work_submissions` (`work_item_id`) WHERE "work_submissions"."status" = 'submitted';
