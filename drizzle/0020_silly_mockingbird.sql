CREATE TABLE `employee_self_assessments` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`period` text NOT NULL,
	`kpi_scores` text NOT NULL,
	`skill_scores` text NOT NULL,
	`kpi_score` real NOT NULL,
	`skill_score` real NOT NULL,
	`total_score` real NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`submitted_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employee_self_assessments_employee_period_unique` ON `employee_self_assessments` (`employee_id`,`period`);--> statement-breakpoint
CREATE INDEX `employee_self_assessments_period_idx` ON `employee_self_assessments` (`period`);--> statement-breakpoint
CREATE TABLE `people_pulse_schema_v20_ready` (
	`schema_version` integer PRIMARY KEY NOT NULL CHECK (`schema_version` = 20)
);
