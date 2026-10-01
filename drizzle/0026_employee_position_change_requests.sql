CREATE TABLE `employee_position_change_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`previous_role_id` text NOT NULL,
	`previous_position_title` text NOT NULL,
	`expected_employee_updated_at` text NOT NULL,
	`requested_role_id` text NOT NULL,
	`requested_position_title` text NOT NULL,
	`reason` text NOT NULL,
	`requested_by` text NOT NULL,
	`requested_by_name` text NOT NULL,
	`created_at` text NOT NULL,
	`source_fingerprint` text NOT NULL,
	`imported_by` text,
	`imported_at` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`reviewed_by` text,
	`reviewed_by_name` text,
	`approved_at` text,
	`rejected_at` text,
	`review_note` text DEFAULT '' NOT NULL,
	CONSTRAINT "position_requests_state" CHECK(("employee_position_change_requests"."status"='pending' AND "employee_position_change_requests"."reviewed_by" IS NULL AND "employee_position_change_requests"."approved_at" IS NULL AND "employee_position_change_requests"."rejected_at" IS NULL) OR ("employee_position_change_requests"."status"='approved' AND "employee_position_change_requests"."reviewed_by" IS NOT NULL AND "employee_position_change_requests"."reviewed_by_name" IS NOT NULL AND "employee_position_change_requests"."approved_at" IS NOT NULL AND "employee_position_change_requests"."rejected_at" IS NULL) OR ("employee_position_change_requests"."status"='rejected' AND "employee_position_change_requests"."reviewed_by" IS NOT NULL AND "employee_position_change_requests"."reviewed_by_name" IS NOT NULL AND "employee_position_change_requests"."rejected_at" IS NOT NULL AND "employee_position_change_requests"."approved_at" IS NULL))
);
--> statement-breakpoint
CREATE INDEX `position_requests_status_created_idx` ON `employee_position_change_requests` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `position_requests_employee_created_idx` ON `employee_position_change_requests` (`employee_id`,`created_at`);