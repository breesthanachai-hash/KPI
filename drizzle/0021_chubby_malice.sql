CREATE TABLE `employee_registration_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`email_canonical` text NOT NULL,
	`login_id` text NOT NULL,
	`login_id_canonical` text NOT NULL,
	`password_hash` text NOT NULL,
	`password_salt` text NOT NULL,
	`password_algorithm` text DEFAULT 'pbkdf2-sha256-chain-v1' NOT NULL,
	`password_iterations` integer DEFAULT 600000 NOT NULL,
	`pepper_version` integer DEFAULT 1 NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`nickname` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`source_hash` text DEFAULT '' NOT NULL,
	`submitted_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`reviewed_by_user_id` text,
	`reviewed_by_name` text DEFAULT '' NOT NULL,
	`reviewed_at` text,
	`rejection_reason` text DEFAULT '' NOT NULL,
	`approved_user_account_id` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `user_accounts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`approved_user_account_id`) REFERENCES `user_accounts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employee_registration_pending_login_unique` ON `employee_registration_requests` (`login_id_canonical`) WHERE "employee_registration_requests"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX `employee_registration_pending_email_unique` ON `employee_registration_requests` (`email_canonical`) WHERE "employee_registration_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX `employee_registration_status_submitted_idx` ON `employee_registration_requests` (`status`,`submitted_at`);--> statement-breakpoint
CREATE INDEX `employee_registration_source_submitted_idx` ON `employee_registration_requests` (`source_hash`,`submitted_at`);--> statement-breakpoint
CREATE TABLE `employee_registration_review_claims` (
	`request_id` text PRIMARY KEY NOT NULL,
	`decision` text NOT NULL,
	`reviewer_user_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `employee_registration_requests`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewer_user_id`) REFERENCES `user_accounts`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `employee_registration_review_claims_reviewer_idx` ON `employee_registration_review_claims` (`reviewer_user_id`,`created_at`);--> statement-breakpoint
CREATE TRIGGER `employee_registration_review_claim_validate`
BEFORE INSERT ON `employee_registration_review_claims`
WHEN NOT EXISTS (
	SELECT 1 FROM `employee_registration_requests`
	WHERE `id` = NEW.`request_id` AND `status` = 'pending'
)
BEGIN
	SELECT RAISE(ABORT, 'REGISTRATION_ALREADY_REVIEWED');
END;--> statement-breakpoint
CREATE TRIGGER `employee_registration_status_review_guard`
BEFORE UPDATE OF `status` ON `employee_registration_requests`
WHEN (
	OLD.`status` != 'pending'
	AND NEW.`status` != OLD.`status`
) OR (
	OLD.`status` = 'pending'
	AND NEW.`status` IN ('approved', 'rejected')
	AND (
		NEW.`password_hash` != ''
		OR NEW.`password_salt` != ''
		OR NOT EXISTS (
			SELECT 1 FROM `employee_registration_review_claims`
			WHERE `request_id` = OLD.`id` AND `decision` = NEW.`status`
		)
	)
)
BEGIN
	SELECT RAISE(ABORT, 'REGISTRATION_REVIEW_REQUIRED');
END;--> statement-breakpoint
ALTER TABLE `user_accounts` ADD `nickname` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE TABLE `people_pulse_schema_v21_ready` (
	`schema_version` integer PRIMARY KEY NOT NULL CHECK (`schema_version` = 21)
);
