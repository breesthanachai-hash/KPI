ALTER TABLE `work_items` ADD `created_by_employee_id` text REFERENCES employees(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX `work_items_creator_status_idx` ON `work_items` (`created_by_employee_id`,`status`);
