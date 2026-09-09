CREATE TABLE `quest_completions` (
	`id` text PRIMARY KEY NOT NULL,
	`quest_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`completion_date` text NOT NULL,
	`quest_revision` integer NOT NULL,
	`quest_updated_at` text NOT NULL,
	`quest_type_snapshot` text NOT NULL,
	`quest_title_snapshot` text NOT NULL,
	`quest_description_snapshot` text DEFAULT '' NOT NULL,
	`quest_start_date_snapshot` text NOT NULL,
	`quest_end_date_snapshot` text NOT NULL,
	`points_awarded` integer NOT NULL,
	`reward_id` text,
	`reward_title_snapshot` text DEFAULT '' NOT NULL,
	`reward_icon_snapshot` text DEFAULT '' NOT NULL,
	`reward_inventory_version` integer,
	`employee_name_snapshot` text NOT NULL,
	`employee_role_id_snapshot` text NOT NULL,
	`employee_department_id_snapshot` text NOT NULL,
	`employee_department_name_snapshot` text NOT NULL,
	`evidence_url` text NOT NULL,
	`note` text NOT NULL,
	`point_event_id` text NOT NULL,
	`point_ledger_id` text NOT NULL,
	`policy_id` text NOT NULL,
	`policy_version` integer NOT NULL,
	`policy_content_hash` text NOT NULL,
	`quest_point_policy_limit` integer NOT NULL,
	`max_manual_quest_completions` integer NOT NULL,
	`standard_earn_monthly_cap` integer NOT NULL,
	`completed_by_user_id` text DEFAULT '' NOT NULL,
	`completed_by_name` text NOT NULL,
	`completed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`quest_id`) REFERENCES `quests`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quest_completions_quest_employee_unique` ON `quest_completions` (`quest_id`,`employee_id`);--> statement-breakpoint
CREATE INDEX `quest_completions_employee_date_idx` ON `quest_completions` (`employee_id`,`completion_date`);--> statement-breakpoint
CREATE INDEX `quest_completions_quest_date_idx` ON `quest_completions` (`quest_id`,`completion_date`);--> statement-breakpoint
CREATE TABLE `quest_mutation_events` (
	`id` text PRIMARY KEY NOT NULL,
	`quest_id` text NOT NULL,
	`event_type` text NOT NULL,
	`expected_revision` integer NOT NULL,
	`expected_updated_at` text NOT NULL,
	`revision` integer NOT NULL,
	`actor_user_id` text DEFAULT '' NOT NULL,
	`actor_name` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`quest_id`) REFERENCES `quests`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quest_mutation_events_quest_revision_unique` ON `quest_mutation_events` (`quest_id`,`revision`);--> statement-breakpoint
CREATE INDEX `quest_mutation_events_actor_created_idx` ON `quest_mutation_events` (`actor_user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `quest_targets` (
	`id` text PRIMARY KEY NOT NULL,
	`quest_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_key` text NOT NULL,
	`target_label_snapshot` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`quest_id`) REFERENCES `quests`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quest_targets_quest_type_key_unique` ON `quest_targets` (`quest_id`,`target_type`,`target_key`);--> statement-breakpoint
CREATE INDEX `quest_targets_type_key_quest_idx` ON `quest_targets` (`target_type`,`target_key`,`quest_id`);--> statement-breakpoint
CREATE TABLE `quests` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`points_reward` integer DEFAULT 0 NOT NULL,
	`reward_id` text,
	`reward_title_snapshot` text DEFAULT '' NOT NULL,
	`reward_icon_snapshot` text DEFAULT '' NOT NULL,
	`is_featured` integer DEFAULT true NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_by_user_id` text DEFAULT '' NOT NULL,
	`created_by_name` text DEFAULT '' NOT NULL,
	`updated_by_user_id` text DEFAULT '' NOT NULL,
	`updated_by_name` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`reward_id`) REFERENCES `rewards`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `quests_status_featured_dates_idx` ON `quests` (`status`,`is_featured`,`start_date`,`end_date`);--> statement-breakpoint
CREATE INDEX `quests_type_status_idx` ON `quests` (`type`,`status`);--> statement-breakpoint
CREATE INDEX `quests_reward_idx` ON `quests` (`reward_id`);
