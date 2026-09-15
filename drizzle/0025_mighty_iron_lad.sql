CREATE TABLE `payroll_awards` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`kind` text NOT NULL,
	`source_id` text NOT NULL,
	`label` text NOT NULL,
	`amount` integer NOT NULL,
	`start_month` text NOT NULL,
	`end_month` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "payroll_award_valid" CHECK("payroll_awards"."kind" IN ('skill','quest') AND typeof("payroll_awards"."amount")='integer' AND "payroll_awards"."amount" BETWEEN 1 AND 10000000000 AND "payroll_awards"."start_month"<="payroll_awards"."end_month")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payroll_award_source_unique` ON `payroll_awards` (`kind`,`source_id`);--> statement-breakpoint
CREATE TABLE `payroll_deliveries` (
	`slip_id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`lease_token` text,
	`lease_until` text,
	`first_attempt_at` text,
	`payload` text,
	`provider_id` text,
	`last_error` text,
	`updated_at` text NOT NULL,
	`provider_draft_id` text,
	`send_started_at` text,
	FOREIGN KEY (`slip_id`) REFERENCES `payroll_slips`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "payroll_delivery_state" CHECK("payroll_deliveries"."status" IN ('pending','sending','accepted','failed','review') AND typeof("payroll_deliveries"."attempts")='integer' AND "payroll_deliveries"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE `payroll_events` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`revision` integer NOT NULL,
	`action` text NOT NULL,
	`actor_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`document` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `payroll_runs`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payroll_event_revision_unique` ON `payroll_events` (`run_id`,`revision`);--> statement-breakpoint
CREATE TABLE `payroll_pay_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`slip_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`kind` text NOT NULL,
	`source` text NOT NULL,
	`amount` integer NOT NULL,
	FOREIGN KEY (`slip_id`) REFERENCES `payroll_slips`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `payroll_claim_employee_idx` ON `payroll_pay_claims` (`employee_id`);--> statement-breakpoint
CREATE TABLE `payroll_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`period` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`document` text NOT NULL,
	`approved_by` text,
	`approved_at` text,
	`payment_reference` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "payroll_run_state" CHECK("payroll_runs"."status" IN ('draft','approved','paid','void') AND typeof("payroll_runs"."revision")='integer' AND "payroll_runs"."revision" >= 0 AND json_valid("payroll_runs"."document") AND json_type("payroll_runs"."document")='object' AND ("payroll_runs"."status" NOT IN ('approved','paid') OR ("payroll_runs"."approved_by" IS NOT NULL AND "payroll_runs"."approved_at" IS NOT NULL)))
);
--> statement-breakpoint
CREATE INDEX `payroll_runs_period_idx` ON `payroll_runs` (`period`);--> statement-breakpoint
CREATE TABLE `payroll_slips` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`period` text NOT NULL,
	`snapshot` text NOT NULL,
	`recipient_email` text NOT NULL,
	`gross` integer NOT NULL,
	`deductions` integer NOT NULL,
	`net` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `payroll_runs`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "payroll_slip_money" CHECK(typeof("payroll_slips"."gross")='integer' AND typeof("payroll_slips"."deductions")='integer' AND typeof("payroll_slips"."net")='integer' AND "payroll_slips"."gross" BETWEEN 0 AND 10000000000 AND "payroll_slips"."deductions" BETWEEN 0 AND "payroll_slips"."gross" AND "payroll_slips"."net"="payroll_slips"."gross"-"payroll_slips"."deductions" AND json_valid("payroll_slips"."snapshot"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payroll_slip_employee_run_unique` ON `payroll_slips` (`run_id`,`employee_id`);--> statement-breakpoint
CREATE INDEX `payroll_slip_employee_idx` ON `payroll_slips` (`employee_id`,`period`);