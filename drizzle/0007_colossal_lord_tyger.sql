CREATE TABLE `attendance_records` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`work_date` text NOT NULL,
	`status` text DEFAULT 'present' NOT NULL,
	`clock_in` text,
	`clock_out` text,
	`minutes_late` integer DEFAULT 0 NOT NULL,
	`leave_type` text,
	`note` text DEFAULT '' NOT NULL,
	`approval_status` text DEFAULT 'not_required' NOT NULL,
	`approved_by` text,
	`approved_at` text,
	`created_by` text DEFAULT 'ฝ่ายทรัพยากรบุคคล' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_employee_date_unique` ON `attendance_records` (`employee_id`,`work_date`);--> statement-breakpoint
CREATE INDEX `attendance_work_date_idx` ON `attendance_records` (`work_date`);--> statement-breakpoint
CREATE INDEX `attendance_approval_date_idx` ON `attendance_records` (`approval_status`,`work_date`);--> statement-breakpoint
CREATE TABLE `skill_achievements` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`role_id` text NOT NULL,
	`skill_id` text NOT NULL,
	`skill_name` text NOT NULL,
	`level` integer NOT NULL,
	`monthly_allowance` integer DEFAULT 0 NOT NULL,
	`verified_by` text NOT NULL,
	`verified_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`evidence_url` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `skill_achievement_milestone_unique` ON `skill_achievements` (`employee_id`,`skill_id`,`level`);--> statement-breakpoint
CREATE INDEX `skill_achievement_employee_verified_idx` ON `skill_achievements` (`employee_id`,`verified_at`);