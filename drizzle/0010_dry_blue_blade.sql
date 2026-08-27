CREATE TABLE `organization_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`content` text NOT NULL,
	`category` text DEFAULT 'other' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`effective_date` text NOT NULL,
	`effective_to` text,
	`scope_type` text DEFAULT 'all' NOT NULL,
	`scope_values` text NOT NULL,
	`acknowledgement_required` integer DEFAULT true NOT NULL,
	`acknowledgement_due_days` integer DEFAULT 7 NOT NULL,
	`rules` text,
	`content_hash` text DEFAULT '' NOT NULL,
	`published_at` text,
	`published_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text DEFAULT 'ระบบ' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_policies_code_version_unique` ON `organization_policies` (`code`,`version`);--> statement-breakpoint
CREATE INDEX `organization_policies_status_effective_idx` ON `organization_policies` (`status`,`effective_date`);--> statement-breakpoint
CREATE INDEX `organization_policies_category_status_idx` ON `organization_policies` (`category`,`status`);--> statement-breakpoint
CREATE TABLE `policy_acknowledgements` (
	`id` text PRIMARY KEY NOT NULL,
	`policy_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`user_account_id` text,
	`policy_version` integer NOT NULL,
	`content_hash` text NOT NULL,
	`acknowledgement_text` text NOT NULL,
	`acknowledged_name` text NOT NULL,
	`acknowledged_email` text NOT NULL,
	`authenticated_user_id` text NOT NULL,
	`acknowledged_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`policy_id`) REFERENCES `organization_policies`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_account_id`) REFERENCES `user_accounts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `policy_acknowledgements_policy_version_employee_unique` ON `policy_acknowledgements` (`policy_id`,`policy_version`,`employee_id`);--> statement-breakpoint
CREATE INDEX `policy_acknowledgements_employee_date_idx` ON `policy_acknowledgements` (`employee_id`,`acknowledged_at`);--> statement-breakpoint
CREATE INDEX `policy_acknowledgements_policy_date_idx` ON `policy_acknowledgements` (`policy_id`,`acknowledged_at`);