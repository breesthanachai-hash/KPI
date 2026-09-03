-- Custom SQL migration file, put your code below! --
DROP TRIGGER IF EXISTS `auth_sessions_validate_insert`;
--> statement-breakpoint
CREATE TRIGGER `auth_sessions_validate_insert`
BEFORE INSERT ON `auth_sessions`
WHEN NOT EXISTS (
  SELECT 1
  FROM `user_accounts` AS `account`
  INNER JOIN `auth_credentials` AS `credential`
    ON `credential`.`user_account_id` = `account`.`id`
  LEFT JOIN `employees` AS `employee`
    ON `employee`.`id` = `account`.`employee_id`
  WHERE `account`.`id` = NEW.`user_account_id`
    AND `account`.`status` = 'active'
    AND `account`.`role` IN ('admin', 'manager', 'employee')
    AND `credential`.`password_hash` <> ''
    AND `credential`.`credential_version` = NEW.`credential_version`
    AND (
      `account`.`role` = 'admin'
      OR (
        `account`.`employee_id` IS NOT NULL
        AND `employee`.`status` = 'active'
      )
    )
)
BEGIN
  SELECT RAISE(ABORT, 'AUTH_SESSION_ACCOUNT_UNAVAILABLE');
END;
--> statement-breakpoint
CREATE TABLE `people_pulse_schema_v19_ready` (
	`schema_version` integer PRIMARY KEY NOT NULL CHECK (`schema_version` = 19)
);
