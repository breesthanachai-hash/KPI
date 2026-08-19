CREATE TABLE `point_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`points` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `point_ledger_source_unique` ON `point_ledger` (`source_type`,`source_id`);--> statement-breakpoint
CREATE INDEX `point_ledger_employee_created_idx` ON `point_ledger` (`employee_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`owner_employee_id` text NOT NULL,
	`department_id` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`due_date` text NOT NULL,
	`color` text DEFAULT 'forest' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `projects_status_due_idx` ON `projects` (`status`,`due_date`);--> statement-breakpoint
CREATE INDEX `projects_owner_idx` ON `projects` (`owner_employee_id`);--> statement-breakpoint
CREATE TABLE `reward_redemptions` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`reward_id` text NOT NULL,
	`points_spent` integer NOT NULL,
	`status` text DEFAULT 'requested' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reward_id`) REFERENCES `rewards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reward_redemptions_employee_created_idx` ON `reward_redemptions` (`employee_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `reward_redemptions_status_idx` ON `reward_redemptions` (`status`);--> statement-breakpoint
CREATE TABLE `rewards` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`category` text DEFAULT 'perk' NOT NULL,
	`cost_points` integer NOT NULL,
	`stock` integer DEFAULT 0 NOT NULL,
	`icon` text DEFAULT '★' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rewards_active_cost_idx` ON `rewards` (`is_active`,`cost_points`);--> statement-breakpoint
CREATE TABLE `work_items` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`assignee_employee_id` text NOT NULL,
	`kind` text DEFAULT 'task' NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`status` text DEFAULT 'todo' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`points` integer DEFAULT 0 NOT NULL,
	`due_date` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignee_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `work_items_project_status_idx` ON `work_items` (`project_id`,`status`);--> statement-breakpoint
CREATE INDEX `work_items_assignee_status_idx` ON `work_items` (`assignee_employee_id`,`status`);--> statement-breakpoint
CREATE INDEX `work_items_due_idx` ON `work_items` (`due_date`);