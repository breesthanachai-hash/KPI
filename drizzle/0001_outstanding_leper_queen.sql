CREATE TABLE `hr_profiles` (
	`employee_id` text PRIMARY KEY NOT NULL,
	`current_salary` real DEFAULT 0 NOT NULL,
	`salary_review_month` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `talent_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`score` real,
	`due_date` text NOT NULL,
	`target_role_id` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `talent_actions_employee_idx` ON `talent_actions` (`employee_id`);--> statement-breakpoint
CREATE INDEX `talent_actions_status_due_idx` ON `talent_actions` (`status`,`due_date`);