CREATE TABLE `employees` (
	`id` text PRIMARY KEY NOT NULL,
	`initials` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`role_id` text NOT NULL,
	`manager` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`latest_score` real,
	`latest_skill_score` real,
	`latest_period` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employees_email_unique` ON `employees` (`email`);--> statement-breakpoint
CREATE INDEX `employees_role_idx` ON `employees` (`role_id`);--> statement-breakpoint
CREATE TABLE `evaluations` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`period` text NOT NULL,
	`kpi_scores` text NOT NULL,
	`skill_scores` text NOT NULL,
	`kpi_score` real NOT NULL,
	`skill_score` real NOT NULL,
	`total_score` real NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`evaluator` text DEFAULT 'ฝ่ายทรัพยากรบุคคล' NOT NULL,
	`evaluated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `evaluations_employee_period_unique` ON `evaluations` (`employee_id`,`period`);--> statement-breakpoint
CREATE INDEX `evaluations_period_idx` ON `evaluations` (`period`);