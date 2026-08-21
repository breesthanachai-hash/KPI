CREATE TABLE `point_events` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`event_type` text NOT NULL,
	`points` integer NOT NULL,
	`event_date` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`evidence_url` text DEFAULT '' NOT NULL,
	`recorded_by` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `point_events_employee_date_idx` ON `point_events` (`employee_id`,`event_date`);--> statement-breakpoint
CREATE INDEX `point_events_type_date_idx` ON `point_events` (`event_type`,`event_date`);