CREATE TABLE `employee_recognitions` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`recognition_type` text DEFAULT 'certificate' NOT NULL,
	`title` text NOT NULL,
	`issuer` text NOT NULL,
	`issued_date` text NOT NULL,
	`expiry_date` text,
	`credential_id` text DEFAULT '' NOT NULL,
	`verification_url` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`file_name` text DEFAULT '' NOT NULL,
	`storage_key` text DEFAULT '' NOT NULL,
	`content_type` text DEFAULT 'application/octet-stream' NOT NULL,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_by_user_id` text DEFAULT '' NOT NULL,
	`created_by` text DEFAULT 'ฝ่ายทรัพยากรบุคคล' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by_user_id` text DEFAULT '' NOT NULL,
	`updated_by` text DEFAULT 'ฝ่ายทรัพยากรบุคคล' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employee_recognitions_storage_key_unique` ON `employee_recognitions` (`storage_key`) WHERE "employee_recognitions"."storage_key" != '';--> statement-breakpoint
CREATE INDEX `employee_recognitions_employee_issued_idx` ON `employee_recognitions` (`employee_id`,`issued_date`);--> statement-breakpoint
CREATE INDEX `employee_recognitions_status_expiry_idx` ON `employee_recognitions` (`status`,`expiry_date`);--> statement-breakpoint
CREATE TABLE `employee_warning_events` (
	`id` text PRIMARY KEY NOT NULL,
	`warning_id` text NOT NULL,
	`event_type` text NOT NULL,
	`actor_user_id` text DEFAULT '' NOT NULL,
	`actor_name` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`warning_id`) REFERENCES `employee_warnings`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `employee_warning_events_warning_created_idx` ON `employee_warning_events` (`warning_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `employee_warnings` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`warning_number` text NOT NULL,
	`level` text DEFAULT 'first' NOT NULL,
	`subject` text NOT NULL,
	`incident_date` text NOT NULL,
	`issued_date` text NOT NULL,
	`facts` text NOT NULL,
	`corrective_action` text DEFAULT '' NOT NULL,
	`review_date` text,
	`employee_statement` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`file_name` text DEFAULT '' NOT NULL,
	`storage_key` text DEFAULT '' NOT NULL,
	`content_type` text DEFAULT 'application/octet-stream' NOT NULL,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`issued_by` text,
	`issued_at` text,
	`acknowledged_by` text,
	`acknowledged_at` text,
	`resolved_by` text,
	`resolved_at` text,
	`withdrawn_by` text,
	`withdrawn_at` text,
	`created_by_user_id` text DEFAULT '' NOT NULL,
	`created_by` text DEFAULT 'ฝ่ายทรัพยากรบุคคล' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by_user_id` text DEFAULT '' NOT NULL,
	`updated_by` text DEFAULT 'ฝ่ายทรัพยากรบุคคล' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employee_warnings_warning_number_unique` ON `employee_warnings` (`warning_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `employee_warnings_storage_key_unique` ON `employee_warnings` (`storage_key`) WHERE "employee_warnings"."storage_key" != '';--> statement-breakpoint
CREATE INDEX `employee_warnings_employee_issued_idx` ON `employee_warnings` (`employee_id`,`issued_date`);--> statement-breakpoint
CREATE INDEX `employee_warnings_status_issued_idx` ON `employee_warnings` (`status`,`issued_date`);--> statement-breakpoint
CREATE TABLE `organization_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`category` text DEFAULT 'other' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`document_number` text NOT NULL,
	`version` text DEFAULT '1.0' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`owner` text NOT NULL,
	`effective_date` text DEFAULT '' NOT NULL,
	`expiry_date` text,
	`note` text DEFAULT '' NOT NULL,
	`file_name` text DEFAULT '' NOT NULL,
	`storage_key` text DEFAULT '' NOT NULL,
	`content_type` text DEFAULT 'application/octet-stream' NOT NULL,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_by_user_id` text DEFAULT '' NOT NULL,
	`created_by` text DEFAULT 'ฝ่ายทรัพยากรบุคคล' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by_user_id` text DEFAULT '' NOT NULL,
	`updated_by` text DEFAULT 'ฝ่ายทรัพยากรบุคคล' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_documents_number_version_unique` ON `organization_documents` (`document_number`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `organization_documents_storage_key_unique` ON `organization_documents` (`storage_key`) WHERE "organization_documents"."storage_key" != '';--> statement-breakpoint
CREATE INDEX `organization_documents_category_status_idx` ON `organization_documents` (`category`,`status`);--> statement-breakpoint
CREATE INDEX `organization_documents_status_effective_idx` ON `organization_documents` (`status`,`effective_date`);
--> statement-breakpoint
CREATE TRIGGER `organization_document_revision_guard`
BEFORE UPDATE ON `organization_documents`
WHEN NEW.revision <> OLD.revision + 1
BEGIN
	SELECT RAISE(ABORT, 'ORGANIZATION_DOCUMENT_STALE_REVISION');
END;
--> statement-breakpoint
CREATE TRIGGER `employee_warning_revision_guard`
BEFORE UPDATE ON `employee_warnings`
WHEN NEW.revision <> OLD.revision + 1
BEGIN
	SELECT RAISE(ABORT, 'EMPLOYEE_WARNING_STALE_REVISION');
END;
--> statement-breakpoint
CREATE TRIGGER `employee_warning_status_transition_guard`
BEFORE UPDATE OF status ON `employee_warnings`
WHEN NOT (
	(OLD.status = 'draft' AND NEW.status IN ('draft', 'issued', 'withdrawn'))
	OR (OLD.status = 'issued' AND NEW.status IN ('issued', 'acknowledged', 'resolved', 'withdrawn'))
	OR (OLD.status = 'acknowledged' AND NEW.status IN ('acknowledged', 'resolved', 'withdrawn'))
	OR (OLD.status = 'resolved' AND NEW.status = 'resolved')
	OR (OLD.status = 'withdrawn' AND NEW.status = 'withdrawn')
)
BEGIN
	SELECT RAISE(ABORT, 'EMPLOYEE_WARNING_INVALID_TRANSITION');
END;
--> statement-breakpoint
CREATE TRIGGER `employee_warning_substantive_fields_lock`
BEFORE UPDATE OF employee_id, warning_number, level, subject, incident_date, issued_date, facts, corrective_action, review_date, file_name, storage_key, content_type, size_bytes ON `employee_warnings`
WHEN OLD.status <> 'draft' AND (
	NEW.employee_id IS NOT OLD.employee_id
	OR NEW.warning_number IS NOT OLD.warning_number
	OR NEW.level IS NOT OLD.level
	OR NEW.subject IS NOT OLD.subject
	OR NEW.incident_date IS NOT OLD.incident_date
	OR NEW.issued_date IS NOT OLD.issued_date
	OR NEW.facts IS NOT OLD.facts
	OR NEW.corrective_action IS NOT OLD.corrective_action
	OR NEW.review_date IS NOT OLD.review_date
	OR NEW.file_name IS NOT OLD.file_name
	OR NEW.storage_key IS NOT OLD.storage_key
	OR NEW.content_type IS NOT OLD.content_type
	OR NEW.size_bytes IS NOT OLD.size_bytes
)
BEGIN
	SELECT RAISE(ABORT, 'EMPLOYEE_WARNING_FIELDS_LOCKED');
END;
--> statement-breakpoint
CREATE TRIGGER `employee_warning_created_audit`
AFTER INSERT ON `employee_warnings`
BEGIN
	INSERT INTO employee_warning_events (id, warning_id, event_type, actor_user_id, actor_name, note, created_at)
	VALUES ('warning-event-' || lower(hex(randomblob(16))), NEW.id, 'created', NEW.created_by_user_id, NEW.created_by, 'สร้างร่างใบเตือน', NEW.created_at);
	INSERT INTO employee_warning_events (id, warning_id, event_type, actor_user_id, actor_name, note, created_at)
	SELECT 'warning-event-' || lower(hex(randomblob(16))), NEW.id, 'issued', NEW.created_by_user_id, NEW.created_by, 'ออกใบเตือนพร้อมการสร้างรายการ', NEW.created_at
	WHERE NEW.status = 'issued';
END;
--> statement-breakpoint
CREATE TRIGGER `employee_warning_updated_audit`
AFTER UPDATE ON `employee_warnings`
BEGIN
	INSERT INTO employee_warning_events (id, warning_id, event_type, actor_user_id, actor_name, note, created_at)
	VALUES (
		'warning-event-' || lower(hex(randomblob(16))),
		NEW.id,
		CASE WHEN NEW.status <> OLD.status THEN NEW.status ELSE 'updated' END,
		NEW.updated_by_user_id,
		NEW.updated_by,
		CASE
			WHEN NEW.status = 'acknowledged' AND NEW.status <> OLD.status THEN 'บันทึกการรับทราบเอกสารเท่านั้น ไม่ได้หมายถึงการยอมรับผิด'
			WHEN NEW.status <> OLD.status THEN 'เปลี่ยนสถานะจาก ' || OLD.status || ' เป็น ' || NEW.status
			ELSE 'แก้ไขร่างใบเตือน'
		END,
		NEW.updated_at
	);
END;
--> statement-breakpoint
CREATE TRIGGER `employee_recognition_revision_guard`
BEFORE UPDATE ON `employee_recognitions`
WHEN NEW.revision <> OLD.revision + 1
BEGIN
	SELECT RAISE(ABORT, 'EMPLOYEE_RECOGNITION_STALE_REVISION');
END;
--> statement-breakpoint
CREATE TRIGGER `employee_warning_event_update_guard`
BEFORE UPDATE ON `employee_warning_events`
BEGIN
	SELECT RAISE(ABORT, 'EMPLOYEE_WARNING_EVENT_IMMUTABLE');
END;
--> statement-breakpoint
CREATE TRIGGER `employee_warning_event_delete_guard`
BEFORE DELETE ON `employee_warning_events`
BEGIN
	SELECT RAISE(ABORT, 'EMPLOYEE_WARNING_EVENT_IMMUTABLE');
END;
