DROP TRIGGER IF EXISTS `auth_credentials_audit_bootstrap_iteration_repair`;
--> statement-breakpoint
CREATE TRIGGER `auth_credentials_audit_bootstrap_legacy_iteration_repair`
AFTER UPDATE OF password_hash, password_salt, password_iterations, credential_version ON `auth_credentials`
WHEN OLD.user_account_id = 'user-owner'
  AND OLD.password_algorithm = 'pbkdf2-sha256'
  AND OLD.password_iterations > 100000
  AND OLD.credential_version = 1
  AND OLD.must_change_password = 1
  AND OLD.failed_attempts BETWEEN 0 AND 1
  AND OLD.locked_until IS NULL
  AND OLD.password_changed_at = OLD.created_at
  AND NEW.password_algorithm = 'pbkdf2-sha256'
  AND NEW.password_iterations = 100000
  AND NEW.pepper_version = OLD.pepper_version
  AND NEW.credential_version = 2
  AND NEW.must_change_password = 1
  AND NEW.failed_attempts = 0
  AND NEW.locked_until IS NULL
  AND NEW.password_changed_at = NEW.updated_at
  AND EXISTS (
    SELECT 1 FROM `user_accounts`
    WHERE id = OLD.user_account_id
      AND role = 'admin'
      AND status = 'active'
      AND created_by = 'ระบบเริ่มต้น'
      AND (
        (auth_user_id = '' AND last_login_at IS NULL AND created_at = updated_at)
        OR
        (auth_user_id != '' AND last_login_at IS NOT NULL AND created_at < last_login_at AND last_login_at < OLD.created_at)
      )
  )
  AND NOT EXISTS (
    SELECT 1 FROM `auth_sessions`
    WHERE user_account_id = OLD.user_account_id
  )
  AND (
    SELECT COUNT(*) FROM `auth_events`
    WHERE user_account_id = OLD.user_account_id
      AND event_type = 'credential_created'
      AND source_hash = ''
      AND detail = 'bootstrap-prehashed'
      AND created_at >= OLD.created_at
  ) = 1
  AND NOT EXISTS (
    SELECT 1 FROM `auth_events`
    WHERE user_account_id = OLD.user_account_id
      AND NOT (
        (event_type = 'credential_created' AND source_hash = '' AND detail = 'bootstrap-prehashed' AND created_at >= OLD.created_at)
        OR (event_type = 'login_failed' AND detail = 'generic-credential-failure' AND created_at >= OLD.created_at)
      )
  )
  AND (
    SELECT COUNT(*) FROM `auth_events`
    WHERE user_account_id = OLD.user_account_id
      AND event_type = 'login_failed'
      AND detail = 'generic-credential-failure'
      AND created_at >= OLD.created_at
  ) = OLD.failed_attempts
BEGIN
  UPDATE `auth_sessions`
    SET revoked_at = NEW.updated_at, revoke_reason = 'bootstrap-iteration-repair'
    WHERE user_account_id = OLD.user_account_id AND revoked_at IS NULL;
  INSERT INTO `auth_events` (id, user_account_id, event_type, source_hash, detail, created_at)
    VALUES (
      'bootstrap-legacy-credential-repaired:user-owner:1',
      OLD.user_account_id,
      'bootstrap_credential_repaired',
      '',
      'iterations:' || OLD.password_iterations || '->100000',
      NEW.updated_at
    );
END;
