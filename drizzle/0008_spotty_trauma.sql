CREATE TABLE `user_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`auth_user_id` text DEFAULT '' NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text DEFAULT 'employee' NOT NULL,
	`employee_id` text,
	`department_id` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`last_login_at` text,
	`created_by` text DEFAULT 'ระบบ' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_accounts_email_unique` ON `user_accounts` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_accounts_auth_user_unique` ON `user_accounts` (`auth_user_id`) WHERE "user_accounts"."auth_user_id" != '';--> statement-breakpoint
CREATE UNIQUE INDEX `user_accounts_employee_unique` ON `user_accounts` (`employee_id`) WHERE "user_accounts"."employee_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `user_accounts_role_status_idx` ON `user_accounts` (`role`,`status`);