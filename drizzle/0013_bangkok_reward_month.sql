DROP TRIGGER IF EXISTS `reward_redemption_claim_guard`;--> statement-breakpoint
CREATE TRIGGER `reward_redemption_claim_guard`
BEFORE INSERT ON `reward_redemption_claims`
BEGIN
	SELECT CASE WHEN substr(datetime(NEW.`created_at`, '+7 hours'), 1, 7) IS NOT NEW.`request_month`
		THEN RAISE(ABORT, 'REDEMPTION_INVALID_MONTH') END;
	SELECT CASE WHEN NOT EXISTS (
		SELECT 1 FROM `rewards`
		WHERE `id` = NEW.`reward_id` AND `is_active` = 1 AND `stock` > 0 AND `inventory_version` = NEW.`expected_inventory_version`
	) THEN RAISE(ABORT, 'REDEMPTION_STALE_INVENTORY') END;
	SELECT CASE WHEN COALESCE((SELECT SUM(`points`) FROM `point_ledger` WHERE `employee_id` = NEW.`employee_id`), 0) < NEW.`required_balance`
		THEN RAISE(ABORT, 'REDEMPTION_INSUFFICIENT_BALANCE') END;
	SELECT CASE WHEN (SELECT COUNT(*) FROM `reward_redemptions`
		WHERE `employee_id` = NEW.`employee_id` AND `status` IN ('requested', 'approved', 'fulfilled')
			AND substr(datetime(`created_at`, '+7 hours'), 1, 7) = NEW.`request_month`
	) > NEW.`max_redemptions_per_month` THEN RAISE(ABORT, 'REDEMPTION_MONTHLY_LIMIT') END;
	SELECT CASE WHEN NEW.`cooldown_days` > 0 AND EXISTS (
		SELECT 1 FROM `reward_redemptions`
		WHERE `employee_id` = NEW.`employee_id` AND `id` <> NEW.`redemption_id` AND `status` IN ('requested', 'approved', 'fulfilled')
			AND julianday(NEW.`created_at`) - julianday(`created_at`) < NEW.`cooldown_days`
	) THEN RAISE(ABORT, 'REDEMPTION_COOLDOWN') END;
END;
