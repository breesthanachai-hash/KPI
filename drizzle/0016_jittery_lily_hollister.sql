CREATE TABLE `auth_credentials` (
	`user_account_id` text PRIMARY KEY NOT NULL,
	`login_id` text NOT NULL,
	`login_id_canonical` text NOT NULL,
	`password_hash` text DEFAULT '' NOT NULL,
	`password_salt` text DEFAULT '' NOT NULL,
	`password_algorithm` text DEFAULT 'pbkdf2-sha256' NOT NULL,
	`password_iterations` integer DEFAULT 600000 NOT NULL,
	`pepper_version` integer DEFAULT 1 NOT NULL,
	`credential_version` integer DEFAULT 1 NOT NULL,
	`must_change_password` integer DEFAULT true NOT NULL,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` text,
	`password_changed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_account_id`) REFERENCES `user_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_credentials_login_id_canonical_unique` ON `auth_credentials` (`login_id_canonical`);--> statement-breakpoint
CREATE INDEX `auth_credentials_locked_until_idx` ON `auth_credentials` (`locked_until`);--> statement-breakpoint
CREATE TABLE `auth_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_account_id` text,
	`event_type` text NOT NULL,
	`source_hash` text DEFAULT '' NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_account_id`) REFERENCES `user_accounts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `auth_events_user_created_idx` ON `auth_events` (`user_account_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `auth_events_type_created_idx` ON `auth_events` (`event_type`,`created_at`);--> statement-breakpoint
CREATE TABLE `auth_rate_limits` (
	`key_hash` text PRIMARY KEY NOT NULL,
	`bucket_type` text NOT NULL,
	`window_started_at` text NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`blocked_until` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auth_rate_limits_blocked_until_idx` ON `auth_rate_limits` (`blocked_until`);--> statement-breakpoint
CREATE INDEX `auth_rate_limits_bucket_updated_idx` ON `auth_rate_limits` (`bucket_type`,`updated_at`);--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`user_account_id` text NOT NULL,
	`credential_version` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`authenticated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`idle_expires_at` text NOT NULL,
	`absolute_expires_at` text NOT NULL,
	`revoked_at` text,
	`revoke_reason` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`user_account_id`) REFERENCES `user_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_sessions_token_hash_unique` ON `auth_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `auth_sessions_user_active_idx` ON `auth_sessions` (`user_account_id`,`revoked_at`,`absolute_expires_at`);--> statement-breakpoint
CREATE INDEX `auth_sessions_expiry_idx` ON `auth_sessions` (`idle_expires_at`,`absolute_expires_at`);
--> statement-breakpoint
CREATE TRIGGER `user_accounts_preserve_last_active_admin_update`
BEFORE UPDATE OF role, status ON `user_accounts`
WHEN OLD.role = 'admin' AND OLD.status = 'active'
  AND (NEW.role != 'admin' OR NEW.status != 'active')
  AND NOT EXISTS (
    SELECT 1 FROM `user_accounts`
    WHERE id != OLD.id AND role = 'admin' AND status = 'active'
  )
BEGIN
  SELECT RAISE(ABORT, 'LAST_ACTIVE_ADMIN_REQUIRED');
END;
--> statement-breakpoint
CREATE TRIGGER `user_accounts_preserve_last_active_admin_delete`
BEFORE DELETE ON `user_accounts`
WHEN OLD.role = 'admin' AND OLD.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM `user_accounts`
    WHERE id != OLD.id AND role = 'admin' AND status = 'active'
  )
BEGIN
  SELECT RAISE(ABORT, 'LAST_ACTIVE_ADMIN_REQUIRED');
END;
--> statement-breakpoint
CREATE TRIGGER `auth_events_validate_credential_mutation_claim`
BEFORE INSERT ON `auth_events`
WHEN NEW.id LIKE 'credential-mutation:%'
  AND (
    NEW.user_account_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM `auth_credentials`
      WHERE user_account_id = NEW.user_account_id
        AND credential_version = CAST(NEW.detail AS INTEGER)
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'STALE_CREDENTIAL_VERSION');
END;
