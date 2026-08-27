CREATE TABLE `point_cap_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`claim_month` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`employee_month_sequence_key` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `point_cap_claim_employee_month_sequence_unique` ON `point_cap_claims` (`employee_month_sequence_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `point_cap_claim_source_unique` ON `point_cap_claims` (`source_type`,`source_id`);--> statement-breakpoint
CREATE INDEX `point_cap_claim_employee_month_idx` ON `point_cap_claims` (`employee_id`,`claim_month`);--> statement-breakpoint
ALTER TABLE `organization_policy_publish_claims` ADD `expected_content_hash` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `work_submissions_one_submitted_per_work_unique` ON `work_submissions` (`work_item_id`) WHERE "work_submissions"."status" = 'submitted';--> statement-breakpoint
CREATE TRIGGER `organization_policy_publish_claim_guard`
BEFORE INSERT ON `organization_policy_publish_claims`
BEGIN
	SELECT CASE WHEN NOT EXISTS (
		SELECT 1 FROM `organization_policies`
		WHERE `id` = NEW.`policy_id`
			AND `status` = 'draft'
			AND `content_hash` = NEW.`expected_content_hash`
	) THEN RAISE(ABORT, 'POLICY_PUBLISH_STALE_DRAFT') END;
END;--> statement-breakpoint
CREATE TRIGGER `work_submission_insert_guard`
BEFORE INSERT ON `work_submissions`
WHEN NEW.`status` = 'submitted'
BEGIN
	SELECT CASE WHEN NOT EXISTS (
		SELECT 1 FROM `work_items`
		WHERE `id` = NEW.`work_item_id`
			AND `assignee_employee_id` = NEW.`employee_id`
			AND `status` IN ('todo', 'in_progress')
	) THEN RAISE(ABORT, 'WORK_SUBMISSION_INVALID_STATE') END;
END;--> statement-breakpoint
CREATE TRIGGER `work_item_submission_terms_lock`
BEFORE UPDATE OF `project_id`, `assignee_employee_id`, `kind`, `priority`, `due_date` ON `work_items`
WHEN EXISTS (
	SELECT 1 FROM `work_submissions` WHERE `work_item_id` = OLD.`id`
) AND (
	NEW.`project_id` IS NOT OLD.`project_id`
	OR NEW.`assignee_employee_id` IS NOT OLD.`assignee_employee_id`
	OR NEW.`kind` IS NOT OLD.`kind`
	OR NEW.`priority` IS NOT OLD.`priority`
	OR NEW.`due_date` IS NOT OLD.`due_date`
)
BEGIN
	SELECT RAISE(ABORT, 'WORK_ITEM_TERMS_LOCKED');
END;
