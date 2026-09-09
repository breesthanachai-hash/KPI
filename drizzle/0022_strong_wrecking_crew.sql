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
CREATE INDEX `quests_reward_idx` ON `quests` (`reward_id`);--> statement-breakpoint
CREATE TRIGGER `quest_completion_insert_guard`
BEFORE INSERT ON `quest_completions`
BEGIN
	SELECT CASE WHEN trim(NEW.`note`) = '' OR substr(lower(NEW.`evidence_url`), 1, 8) <> 'https://'
		THEN RAISE(ABORT, 'QUEST_COMPLETION_EVIDENCE_REQUIRED') END;
	SELECT CASE WHEN length(NEW.`note`) > 1000 OR length(NEW.`evidence_url`) > 1200
		THEN RAISE(ABORT, 'QUEST_COMPLETION_EVIDENCE_INVALID') END;
	SELECT CASE WHEN length(NEW.`completion_date`) <> 10
		OR date(NEW.`completion_date`) IS NULL
		OR date(NEW.`completion_date`) <> NEW.`completion_date`
		OR NEW.`completion_date` > date('now', '+7 hours')
		OR NEW.`completion_date` < date('now', '+7 hours', '-90 days')
		THEN RAISE(ABORT, 'QUEST_COMPLETION_DATE_INVALID') END;
	SELECT CASE WHEN NOT EXISTS (
		SELECT 1 FROM `user_accounts`
		WHERE `id` = NEW.`completed_by_user_id`
			AND `role` = 'admin'
			AND `status` = 'active'
			AND (`employee_id` IS NULL OR `employee_id` <> NEW.`employee_id`)
	) THEN RAISE(ABORT, 'QUEST_COMPLETION_ACTOR_INVALID') END;
	SELECT CASE WHEN NEW.`completion_date` < NEW.`quest_start_date_snapshot`
		OR NEW.`completion_date` > NEW.`quest_end_date_snapshot`
		THEN RAISE(ABORT, 'QUEST_COMPLETION_DATE_OUTSIDE_QUEST') END;
	SELECT CASE WHEN NOT EXISTS (
		SELECT 1 FROM `quests`
		WHERE `id` = NEW.`quest_id`
			AND `status` IN ('active', 'completed')
			AND `revision` = NEW.`quest_revision`
			AND `updated_at` = NEW.`quest_updated_at`
			AND `type` = NEW.`quest_type_snapshot`
			AND `title` = NEW.`quest_title_snapshot`
			AND `description` = NEW.`quest_description_snapshot`
			AND `start_date` = NEW.`quest_start_date_snapshot`
			AND `end_date` = NEW.`quest_end_date_snapshot`
			AND `points_reward` = NEW.`points_awarded`
			AND `reward_id` IS NEW.`reward_id`
			AND `reward_title_snapshot` = NEW.`reward_title_snapshot`
			AND `reward_icon_snapshot` = NEW.`reward_icon_snapshot`
	) THEN RAISE(ABORT, 'QUEST_COMPLETION_STALE_QUEST') END;
	SELECT CASE WHEN NOT EXISTS (
		SELECT 1 FROM `employees`
		WHERE `id` = NEW.`employee_id`
			AND `status` = 'active'
			AND `name` = NEW.`employee_name_snapshot`
			AND `role_id` = NEW.`employee_role_id_snapshot`
	) THEN RAISE(ABORT, 'QUEST_COMPLETION_EMPLOYEE_UNAVAILABLE') END;
	SELECT CASE WHEN NOT EXISTS (
		SELECT 1 FROM `quests` AS quest
		WHERE quest.`id` = NEW.`quest_id` AND (
			quest.`type` = 'activity'
			OR (quest.`type` = 'individual' AND EXISTS (
				SELECT 1 FROM `quest_targets`
				WHERE `quest_id` = quest.`id` AND `target_type` = 'employee' AND `target_key` = NEW.`employee_id`
			))
			OR (quest.`type` = 'team' AND EXISTS (
				SELECT 1 FROM `quest_targets`
				WHERE `quest_id` = quest.`id` AND `target_type` = 'department' AND `target_key` = NEW.`employee_department_id_snapshot`
			))
		)
	) THEN RAISE(ABORT, 'QUEST_COMPLETION_EMPLOYEE_NOT_ELIGIBLE') END;
	SELECT CASE WHEN NEW.`points_awarded` < 0 OR NEW.`points_awarded` > NEW.`quest_point_policy_limit`
		THEN RAISE(ABORT, 'QUEST_COMPLETION_POINT_LIMIT') END;
	SELECT CASE WHEN NOT EXISTS (
		SELECT 1 FROM `organization_policies`
		WHERE `id` = NEW.`policy_id`
			AND `code` = 'points-and-rewards'
			AND `category` = 'points_rewards'
			AND `scope_type` = 'all'
			AND `status` = 'published'
			AND `version` = NEW.`policy_version`
			AND `content_hash` = NEW.`policy_content_hash`
			AND `effective_date` <= NEW.`completion_date`
			AND (`effective_to` IS NULL OR `effective_to` >= NEW.`completion_date`)
	) THEN RAISE(ABORT, 'QUEST_COMPLETION_POLICY_INVALID') END;
	SELECT CASE WHEN NOT EXISTS (
		SELECT 1 FROM `point_events`
		WHERE `id` = NEW.`point_event_id`
			AND `employee_id` = NEW.`employee_id`
			AND `event_type` = 'quest'
			AND `points` = NEW.`points_awarded`
			AND `event_date` = NEW.`completion_date`
			AND `evidence_url` = NEW.`evidence_url`
			AND `policy_id` = NEW.`policy_id`
			AND `policy_version` = NEW.`policy_version`
			AND `policy_content_hash` = NEW.`policy_content_hash`
	) THEN RAISE(ABORT, 'QUEST_COMPLETION_POINT_EVENT_MISSING') END;
	SELECT CASE WHEN NOT EXISTS (
		SELECT 1 FROM `point_ledger`
		WHERE `id` = NEW.`point_ledger_id`
			AND `employee_id` = NEW.`employee_id`
			AND `source_type` = 'quest'
			AND `source_id` = NEW.`id`
			AND `points` = NEW.`points_awarded`
			AND `policy_id` = NEW.`policy_id`
			AND `policy_version` = NEW.`policy_version`
			AND `policy_content_hash` = NEW.`policy_content_hash`
	) THEN RAISE(ABORT, 'QUEST_COMPLETION_POINT_LEDGER_MISSING') END;
	SELECT CASE WHEN NOT EXISTS (
		SELECT 1 FROM `point_mutation_claims`
		WHERE `point_event_id` = NEW.`point_event_id` AND `employee_id` = NEW.`employee_id`
	) OR NOT EXISTS (
		SELECT 1 FROM `point_cap_claims`
		WHERE `employee_id` = NEW.`employee_id`
			AND `claim_month` = substr(NEW.`completion_date`, 1, 7)
			AND `source_type` = 'quest_completion'
			AND `source_id` = NEW.`id`
	) THEN RAISE(ABORT, 'QUEST_COMPLETION_POINT_CLAIMS_MISSING') END;
	SELECT CASE WHEN (
		SELECT COUNT(*) FROM `point_events`
		WHERE `employee_id` = NEW.`employee_id`
			AND `event_type` = 'quest'
			AND substr(`event_date`, 1, 7) = substr(NEW.`completion_date`, 1, 7)
	) > NEW.`max_manual_quest_completions`
		THEN RAISE(ABORT, 'QUEST_COMPLETION_MONTHLY_COUNT_LIMIT') END;
	SELECT CASE WHEN COALESCE((
		SELECT SUM(`points`) FROM `point_events`
		WHERE `employee_id` = NEW.`employee_id`
			AND `event_type` <> 'monthly_evaluation'
			AND `points` > 0
			AND substr(`event_date`, 1, 7) = substr(NEW.`completion_date`, 1, 7)
	), 0) + COALESCE((
		SELECT SUM(`points`) FROM `point_ledger`
		WHERE `employee_id` = NEW.`employee_id`
			AND `source_type` IN ('task', 'mission')
			AND `points` > 0
			AND substr(datetime(`created_at`, '+7 hours'), 1, 7) = substr(NEW.`completion_date`, 1, 7)
	), 0) > NEW.`standard_earn_monthly_cap`
		THEN RAISE(ABORT, 'QUEST_COMPLETION_MONTHLY_POINT_LIMIT') END;
	SELECT CASE WHEN NEW.`reward_id` IS NULL AND NEW.`reward_inventory_version` IS NOT NULL
		THEN RAISE(ABORT, 'QUEST_COMPLETION_REWARD_INVALID') END;
	SELECT CASE WHEN NEW.`reward_id` IS NOT NULL AND NOT EXISTS (
		SELECT 1 FROM `rewards`
		WHERE `id` = NEW.`reward_id`
			AND `is_active` = 1
			AND `stock` > 0
			AND `inventory_version` = NEW.`reward_inventory_version`
	) THEN RAISE(ABORT, 'QUEST_COMPLETION_REWARD_UNAVAILABLE') END;
END;--> statement-breakpoint
CREATE TRIGGER `quest_completion_update_guard`
BEFORE UPDATE ON `quest_completions`
BEGIN
	SELECT RAISE(ABORT, 'QUEST_COMPLETION_IMMUTABLE');
END;--> statement-breakpoint
CREATE TRIGGER `quest_completion_delete_guard`
BEFORE DELETE ON `quest_completions`
BEGIN
	SELECT RAISE(ABORT, 'QUEST_COMPLETION_IMMUTABLE');
END;--> statement-breakpoint
CREATE TRIGGER `quest_fulfilled_terms_lock`
BEFORE UPDATE OF `type`, `title`, `description`, `points_reward`, `reward_id`, `reward_title_snapshot`, `reward_icon_snapshot`, `start_date`, `end_date` ON `quests`
WHEN EXISTS (SELECT 1 FROM `quest_completions` WHERE `quest_id` = OLD.`id`) AND (
	NEW.`type` IS NOT OLD.`type`
	OR NEW.`title` IS NOT OLD.`title`
	OR NEW.`description` IS NOT OLD.`description`
	OR NEW.`points_reward` IS NOT OLD.`points_reward`
	OR NEW.`reward_id` IS NOT OLD.`reward_id`
	OR NEW.`reward_title_snapshot` IS NOT OLD.`reward_title_snapshot`
	OR NEW.`reward_icon_snapshot` IS NOT OLD.`reward_icon_snapshot`
	OR NEW.`start_date` IS NOT OLD.`start_date`
	OR NEW.`end_date` IS NOT OLD.`end_date`
)
BEGIN
	SELECT RAISE(ABORT, 'QUEST_FULFILLED_TERMS_LOCKED');
END;--> statement-breakpoint
CREATE TRIGGER `quest_target_fulfilled_insert_guard`
BEFORE INSERT ON `quest_targets`
WHEN EXISTS (SELECT 1 FROM `quest_completions` WHERE `quest_id` = NEW.`quest_id`)
BEGIN
	SELECT RAISE(ABORT, 'QUEST_FULFILLED_TARGETS_LOCKED');
END;--> statement-breakpoint
CREATE TRIGGER `quest_target_fulfilled_update_guard`
BEFORE UPDATE ON `quest_targets`
WHEN EXISTS (SELECT 1 FROM `quest_completions` WHERE `quest_id` = OLD.`quest_id`)
BEGIN
	SELECT RAISE(ABORT, 'QUEST_FULFILLED_TARGETS_LOCKED');
END;--> statement-breakpoint
CREATE TRIGGER `quest_target_fulfilled_delete_guard`
BEFORE DELETE ON `quest_targets`
WHEN EXISTS (SELECT 1 FROM `quest_completions` WHERE `quest_id` = OLD.`quest_id`)
BEGIN
	SELECT RAISE(ABORT, 'QUEST_FULFILLED_TARGETS_LOCKED');
END;--> statement-breakpoint
CREATE TRIGGER `quest_mutation_event_guard`
BEFORE INSERT ON `quest_mutation_events`
BEGIN
	SELECT CASE WHEN NEW.`event_type` = 'created' AND NOT (
		NEW.`expected_revision` = -1
		AND NEW.`revision` = 0
		AND EXISTS (
			SELECT 1 FROM `quests`
			WHERE `id` = NEW.`quest_id`
				AND `revision` = 0
				AND `updated_at` = NEW.`expected_updated_at`
		)
		AND NOT EXISTS (
			SELECT 1 FROM `quest_mutation_events` WHERE `quest_id` = NEW.`quest_id`
		)
	) THEN RAISE(ABORT, 'QUEST_CREATE_INVALID_STATE') END;
	SELECT CASE WHEN NEW.`event_type` IN ('updated', 'archived') AND NOT (
		NEW.`revision` = NEW.`expected_revision` + 1
		AND EXISTS (
			SELECT 1 FROM `quests`
			WHERE `id` = NEW.`quest_id`
				AND `revision` = NEW.`expected_revision`
				AND `updated_at` = NEW.`expected_updated_at`
		)
	) THEN RAISE(ABORT, 'QUEST_STALE_REVISION') END;
END;--> statement-breakpoint
CREATE TRIGGER `quest_mutation_event_update_guard`
BEFORE UPDATE ON `quest_mutation_events`
BEGIN
	SELECT RAISE(ABORT, 'QUEST_MUTATION_EVENT_IMMUTABLE');
END;--> statement-breakpoint
CREATE TRIGGER `quest_mutation_event_delete_guard`
BEFORE DELETE ON `quest_mutation_events`
BEGIN
	SELECT RAISE(ABORT, 'QUEST_MUTATION_EVENT_IMMUTABLE');
END;--> statement-breakpoint
PRAGMA optimize;--> statement-breakpoint
CREATE TABLE `people_pulse_schema_v22_ready` (
	`schema_version` integer PRIMARY KEY NOT NULL CHECK (`schema_version` = 22)
);
