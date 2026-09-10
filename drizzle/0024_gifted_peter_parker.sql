CREATE TABLE `system_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_name` text DEFAULT 'People Pulse' NOT NULL,
	`organization_short_name` text DEFAULT 'People Pulse' NOT NULL,
	`navigation_mode` text DEFAULT 'simple' NOT NULL,
	`admin_home` text DEFAULT 'work' NOT NULL,
	`manager_home` text DEFAULT 'work' NOT NULL,
	`employee_home` text DEFAULT 'work' NOT NULL,
	`ai_assistant_enabled` integer DEFAULT true NOT NULL,
	`ai_mascot_enabled` integer DEFAULT true NOT NULL,
	`office_3d_enabled` integer DEFAULT true NOT NULL,
	`quest_reward_linking_enabled` integer DEFAULT true NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_by_user_id` text DEFAULT 'system' NOT NULL,
	`updated_by_name` text DEFAULT 'ระบบ' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `system_settings_events` (
	`id` text PRIMARY KEY NOT NULL,
	`settings_id` text NOT NULL,
	`previous_revision` integer NOT NULL,
	`next_revision` integer NOT NULL,
	`expected_updated_at` text NOT NULL,
	`resulting_updated_at` text NOT NULL,
	`previous_snapshot` text NOT NULL,
	`next_snapshot` text NOT NULL,
	`changed_keys` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`settings_id`) REFERENCES `system_settings`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `system_settings_events_revision_unique` ON `system_settings_events` (`settings_id`,`next_revision`);--> statement-breakpoint
CREATE INDEX `system_settings_events_created_idx` ON `system_settings_events` (`settings_id`,`created_at`);