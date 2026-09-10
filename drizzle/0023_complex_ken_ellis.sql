CREATE TABLE `employee_position_events` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`employee_name_snapshot` text NOT NULL,
	`role_id_snapshot` text NOT NULL,
	`previous_position_title` text DEFAULT '' NOT NULL,
	`next_position_title` text DEFAULT '' NOT NULL,
	`expected_updated_at` text NOT NULL,
	`resulting_updated_at` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employee_position_events_employee_result_unique` ON `employee_position_events` (`employee_id`,`resulting_updated_at`);--> statement-breakpoint
CREATE INDEX `employee_position_events_employee_created_idx` ON `employee_position_events` (`employee_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `employee_position_events_actor_created_idx` ON `employee_position_events` (`actor_user_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `employees` ADD `position_title` text DEFAULT '' NOT NULL;