CREATE TABLE `application_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`document_type` text NOT NULL,
	`title` text NOT NULL,
	`file_name` text NOT NULL,
	`storage_key` text DEFAULT '' NOT NULL,
	`content_type` text DEFAULT 'application/octet-stream' NOT NULL,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`uploaded_by` text DEFAULT '' NOT NULL,
	`uploaded_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`verified_by` text,
	`verified_at` text,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `application_documents_employee_type_unique` ON `application_documents` (`employee_id`,`document_type`);--> statement-breakpoint
CREATE INDEX `application_documents_employee_status_idx` ON `application_documents` (`employee_id`,`status`);--> statement-breakpoint
CREATE TABLE `employee_profiles` (
	`employee_id` text PRIMARY KEY NOT NULL,
	`personal_email` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`birth_date` text DEFAULT '' NOT NULL,
	`national_id_last4` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`emergency_name` text DEFAULT '' NOT NULL,
	`emergency_phone` text DEFAULT '' NOT NULL,
	`start_date` text DEFAULT '' NOT NULL,
	`employment_type` text DEFAULT 'permanent' NOT NULL,
	`education` text DEFAULT '' NOT NULL,
	`experience_years` integer DEFAULT 0 NOT NULL,
	`application_source` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `employment_contracts` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`document_id` text,
	`title` text NOT NULL,
	`version` text DEFAULT '1.0' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`effective_date` text NOT NULL,
	`expiry_date` text,
	`sent_at` text,
	`signed_name` text,
	`signed_at` text,
	`consent_text` text DEFAULT '' NOT NULL,
	`signer_user_id` text,
	`signer_email` text,
	`created_by` text DEFAULT 'ฝ่ายทรัพยากรบุคคล' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_id`) REFERENCES `application_documents`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `employment_contracts_employee_created_idx` ON `employment_contracts` (`employee_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `employment_contracts_status_idx` ON `employment_contracts` (`status`);