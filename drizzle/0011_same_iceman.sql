CREATE TABLE `organization_policy_publish_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`policy_id` text NOT NULL,
	`code` text NOT NULL,
	`predecessor_version` integer NOT NULL,
	`published_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`policy_id`) REFERENCES `organization_policies`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_policy_publish_claim_policy_unique` ON `organization_policy_publish_claims` (`policy_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `organization_policy_publish_claim_head_unique` ON `organization_policy_publish_claims` (`code`,`predecessor_version`);--> statement-breakpoint
CREATE TABLE `point_mutation_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`point_event_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`predecessor_event_count` integer NOT NULL,
	`employee_sequence_key` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`point_event_id`) REFERENCES `point_events`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `point_mutation_claim_event_unique` ON `point_mutation_claims` (`point_event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `point_mutation_claim_employee_sequence_unique` ON `point_mutation_claims` (`employee_sequence_key`);--> statement-breakpoint
CREATE INDEX `point_mutation_claim_employee_created_idx` ON `point_mutation_claims` (`employee_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `reward_redemption_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`redemption_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`reward_id` text NOT NULL,
	`employee_request_key` text NOT NULL,
	`reward_inventory_key` text NOT NULL,
	`expected_inventory_version` integer NOT NULL,
	`required_balance` integer NOT NULL,
	`max_redemptions_per_month` integer NOT NULL,
	`cooldown_days` integer NOT NULL,
	`request_month` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`redemption_id`) REFERENCES `reward_redemptions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reward_id`) REFERENCES `rewards`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reward_redemption_claim_redemption_unique` ON `reward_redemption_claims` (`redemption_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `reward_redemption_claim_employee_request_unique` ON `reward_redemption_claims` (`employee_request_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `reward_redemption_claim_inventory_unique` ON `reward_redemption_claims` (`reward_inventory_key`);--> statement-breakpoint
CREATE INDEX `reward_redemption_claim_employee_created_idx` ON `reward_redemption_claims` (`employee_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `point_events` ADD `policy_id` text REFERENCES organization_policies(id);--> statement-breakpoint
ALTER TABLE `point_events` ADD `policy_version` integer;--> statement-breakpoint
ALTER TABLE `point_events` ADD `policy_content_hash` text;--> statement-breakpoint
CREATE INDEX `point_events_policy_idx` ON `point_events` (`policy_id`,`policy_version`);--> statement-breakpoint
ALTER TABLE `point_ledger` ADD `policy_id` text REFERENCES organization_policies(id);--> statement-breakpoint
ALTER TABLE `point_ledger` ADD `policy_version` integer;--> statement-breakpoint
ALTER TABLE `point_ledger` ADD `policy_content_hash` text;--> statement-breakpoint
CREATE INDEX `point_ledger_policy_idx` ON `point_ledger` (`policy_id`,`policy_version`);--> statement-breakpoint
ALTER TABLE `rewards` ADD `inventory_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `organization_policies_published_code_effective_unique` ON `organization_policies` (`code`,`effective_date`) WHERE "organization_policies"."status" = 'published';
