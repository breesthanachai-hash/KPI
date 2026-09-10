import { getD1 } from ".";

let initialization: Promise<unknown> | null = null;
// Runtime initialization creates this object only after every schema object and
// compound trigger has been installed. Forward migrations intentionally omit it
// so Sites cannot skip runtime compatibility checks after applying split statements.
// Future schema versions must keep their readiness marker runtime-owned and last.
const LATEST_SCHEMA_MARKER = "people_pulse_schema_v24_ready";

async function latestSchemaIsReady(d1: ReturnType<typeof getD1>) {
  const marker = await d1.prepare(
    "SELECT 1 AS ready FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
  ).bind(LATEST_SCHEMA_MARKER).first<{ ready: number }>();
  return marker?.ready === 1;
}

async function ensureColumn(
  d1: ReturnType<typeof getD1>,
  table: "employees" | "rewards" | "point_ledger" | "point_events" | "organization_policy_publish_claims" | "work_items" | "user_accounts",
  column: string,
  definition: string,
) {
  const result = await d1.prepare(`PRAGMA table_info(${table})`).all();
  const columns = result.results as Array<{ name: string }>;
  if (columns.some((item) => item.name === column)) return;
  await d1.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
}

export function ensureDatabase() {
  if (initialization) return initialization;
  const d1 = getD1();
  initialization = (async () => {
    if (await latestSchemaIsReady(d1)) return;
    await d1.batch([
    d1.prepare(`CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY NOT NULL,
      initials TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      role_id TEXT NOT NULL,
      position_title TEXT NOT NULL DEFAULT '',
      manager TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      latest_score REAL,
      latest_skill_score REAL,
      latest_period TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS employees_email_unique ON employees (email)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS employees_role_idx ON employees (role_id)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS employee_position_events (
      id TEXT PRIMARY KEY NOT NULL,
      employee_id TEXT NOT NULL,
      employee_name_snapshot TEXT NOT NULL,
      role_id_snapshot TEXT NOT NULL,
      previous_position_title TEXT NOT NULL DEFAULT '',
      next_position_title TEXT NOT NULL DEFAULT '',
      expected_updated_at TEXT NOT NULL,
      resulting_updated_at TEXT NOT NULL,
      actor_user_id TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS employee_position_events_employee_result_unique ON employee_position_events (employee_id, resulting_updated_at)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS employee_position_events_employee_created_idx ON employee_position_events (employee_id, created_at)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS employee_position_events_actor_created_idx ON employee_position_events (actor_user_id, created_at)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS system_settings (
      id TEXT PRIMARY KEY NOT NULL,
      organization_name TEXT NOT NULL DEFAULT 'People Pulse',
      organization_short_name TEXT NOT NULL DEFAULT 'People Pulse',
      navigation_mode TEXT NOT NULL DEFAULT 'simple',
      admin_home TEXT NOT NULL DEFAULT 'work',
      manager_home TEXT NOT NULL DEFAULT 'work',
      employee_home TEXT NOT NULL DEFAULT 'work',
      ai_assistant_enabled INTEGER NOT NULL DEFAULT 1,
      ai_mascot_enabled INTEGER NOT NULL DEFAULT 1,
      office_3d_enabled INTEGER NOT NULL DEFAULT 1,
      quest_reward_linking_enabled INTEGER NOT NULL DEFAULT 1,
      revision INTEGER NOT NULL DEFAULT 0,
      updated_by_user_id TEXT NOT NULL DEFAULT 'system',
      updated_by_name TEXT NOT NULL DEFAULT 'ระบบ',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS system_settings_events (
      id TEXT PRIMARY KEY NOT NULL,
      settings_id TEXT NOT NULL REFERENCES system_settings(id) ON DELETE RESTRICT,
      previous_revision INTEGER NOT NULL,
      next_revision INTEGER NOT NULL,
      expected_updated_at TEXT NOT NULL,
      resulting_updated_at TEXT NOT NULL,
      previous_snapshot TEXT NOT NULL,
      next_snapshot TEXT NOT NULL,
      changed_keys TEXT NOT NULL,
      actor_user_id TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS system_settings_events_revision_unique ON system_settings_events (settings_id, next_revision)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS system_settings_events_created_idx ON system_settings_events (settings_id, created_at)"),
    d1.prepare(`INSERT INTO system_settings (
      id, organization_name, organization_short_name, navigation_mode,
      admin_home, manager_home, employee_home,
      ai_assistant_enabled, ai_mascot_enabled, office_3d_enabled, quest_reward_linking_enabled,
      revision, updated_by_user_id, updated_by_name
    ) SELECT 'global', 'People Pulse', 'People Pulse', 'simple', 'work', 'work', 'work', 1, 1, 1, 1, 0, 'system', 'ระบบ'
      WHERE NOT EXISTS (SELECT 1 FROM system_settings)`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS user_accounts (
      id TEXT PRIMARY KEY NOT NULL,
      auth_user_id TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL,
      display_name TEXT NOT NULL,
      nickname TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'employee',
      employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
      department_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      last_login_at TEXT,
      created_by TEXT NOT NULL DEFAULT 'ระบบ',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS user_accounts_email_unique ON user_accounts (email)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS user_accounts_auth_user_unique ON user_accounts (auth_user_id) WHERE auth_user_id != ''"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS user_accounts_employee_unique ON user_accounts (employee_id) WHERE employee_id IS NOT NULL"),
    d1.prepare("CREATE INDEX IF NOT EXISTS user_accounts_role_status_idx ON user_accounts (role, status)"),
    d1.prepare(`CREATE TRIGGER IF NOT EXISTS user_accounts_preserve_last_active_admin_update
      BEFORE UPDATE OF role, status ON user_accounts
      WHEN OLD.role = 'admin' AND OLD.status = 'active'
        AND (NEW.role != 'admin' OR NEW.status != 'active')
        AND NOT EXISTS (
          SELECT 1 FROM user_accounts
          WHERE id != OLD.id AND role = 'admin' AND status = 'active'
        )
      BEGIN
        SELECT RAISE(ABORT, 'LAST_ACTIVE_ADMIN_REQUIRED');
      END`),
    d1.prepare(`CREATE TRIGGER IF NOT EXISTS user_accounts_preserve_last_active_admin_delete
      BEFORE DELETE ON user_accounts
      WHEN OLD.role = 'admin' AND OLD.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM user_accounts
          WHERE id != OLD.id AND role = 'admin' AND status = 'active'
        )
      BEGIN
        SELECT RAISE(ABORT, 'LAST_ACTIVE_ADMIN_REQUIRED');
      END`),
    d1.prepare(`CREATE TRIGGER IF NOT EXISTS user_accounts_preserve_system_owner_update
      BEFORE UPDATE OF id, role, status ON user_accounts
      WHEN OLD.id = 'user-owner'
        AND (NEW.id != OLD.id OR NEW.role != 'admin' OR NEW.status != 'active')
      BEGIN
        SELECT RAISE(ABORT, 'SYSTEM_OWNER_REQUIRED');
      END`),
    d1.prepare(`CREATE TRIGGER IF NOT EXISTS user_accounts_preserve_system_owner_delete
      BEFORE DELETE ON user_accounts
      WHEN OLD.id = 'user-owner'
      BEGIN
        SELECT RAISE(ABORT, 'SYSTEM_OWNER_REQUIRED');
      END`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS auth_credentials (
      user_account_id TEXT PRIMARY KEY NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
      login_id TEXT NOT NULL,
      login_id_canonical TEXT NOT NULL,
      password_hash TEXT NOT NULL DEFAULT '',
      password_salt TEXT NOT NULL DEFAULT '',
      password_algorithm TEXT NOT NULL DEFAULT 'pbkdf2-sha256',
      password_iterations INTEGER NOT NULL DEFAULT 100000,
      pepper_version INTEGER NOT NULL DEFAULT 1,
      credential_version INTEGER NOT NULL DEFAULT 1,
      must_change_password INTEGER NOT NULL DEFAULT 1,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      password_changed_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS auth_credentials_login_id_canonical_unique ON auth_credentials (login_id_canonical)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS auth_credentials_locked_until_idx ON auth_credentials (locked_until)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      token_hash TEXT NOT NULL,
      user_account_id TEXT NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
      credential_version INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      authenticated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      idle_expires_at TEXT NOT NULL,
      absolute_expires_at TEXT NOT NULL,
      revoked_at TEXT,
      revoke_reason TEXT NOT NULL DEFAULT ''
    )`),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS auth_sessions_token_hash_unique ON auth_sessions (token_hash)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS auth_sessions_user_active_idx ON auth_sessions (user_account_id, revoked_at, absolute_expires_at)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS auth_sessions_expiry_idx ON auth_sessions (idle_expires_at, absolute_expires_at)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS auth_rate_limits (
      key_hash TEXT PRIMARY KEY NOT NULL,
      bucket_type TEXT NOT NULL,
      window_started_at TEXT NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      blocked_until TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare("CREATE INDEX IF NOT EXISTS auth_rate_limits_blocked_until_idx ON auth_rate_limits (blocked_until)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS auth_rate_limits_bucket_updated_idx ON auth_rate_limits (bucket_type, updated_at)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS auth_events (
      id TEXT PRIMARY KEY NOT NULL,
      user_account_id TEXT REFERENCES user_accounts(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      source_hash TEXT NOT NULL DEFAULT '',
      detail TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare("CREATE INDEX IF NOT EXISTS auth_events_user_created_idx ON auth_events (user_account_id, created_at)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS auth_events_type_created_idx ON auth_events (event_type, created_at)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS employee_registration_requests (
      id TEXT PRIMARY KEY NOT NULL,
      email TEXT NOT NULL,
      email_canonical TEXT NOT NULL,
      login_id TEXT NOT NULL,
      login_id_canonical TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      password_algorithm TEXT NOT NULL DEFAULT 'pbkdf2-sha256-chain-v1',
      password_iterations INTEGER NOT NULL DEFAULT 600000,
      pepper_version INTEGER NOT NULL DEFAULT 1,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      nickname TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      source_hash TEXT NOT NULL DEFAULT '',
      submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reviewed_by_user_id TEXT REFERENCES user_accounts(id) ON DELETE SET NULL,
      reviewed_by_name TEXT NOT NULL DEFAULT '',
      reviewed_at TEXT,
      rejection_reason TEXT NOT NULL DEFAULT '',
      approved_user_account_id TEXT REFERENCES user_accounts(id) ON DELETE SET NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS employee_registration_pending_login_unique ON employee_registration_requests (login_id_canonical) WHERE status = 'pending'"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS employee_registration_pending_email_unique ON employee_registration_requests (email_canonical) WHERE status = 'pending'"),
    d1.prepare("CREATE INDEX IF NOT EXISTS employee_registration_status_submitted_idx ON employee_registration_requests (status, submitted_at)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS employee_registration_source_submitted_idx ON employee_registration_requests (source_hash, submitted_at)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS employee_registration_review_claims (
      request_id TEXT PRIMARY KEY NOT NULL REFERENCES employee_registration_requests(id) ON DELETE RESTRICT,
      decision TEXT NOT NULL,
      reviewer_user_id TEXT NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare("CREATE INDEX IF NOT EXISTS employee_registration_review_claims_reviewer_idx ON employee_registration_review_claims (reviewer_user_id, created_at)"),
    d1.prepare(`CREATE TRIGGER IF NOT EXISTS employee_registration_review_claim_validate
      BEFORE INSERT ON employee_registration_review_claims
      WHEN NOT EXISTS (
        SELECT 1 FROM employee_registration_requests
        WHERE id = NEW.request_id AND status = 'pending'
      )
      BEGIN
        SELECT RAISE(ABORT, 'REGISTRATION_ALREADY_REVIEWED');
      END`),
    d1.prepare(`CREATE TRIGGER IF NOT EXISTS employee_registration_status_review_guard
      BEFORE UPDATE OF status ON employee_registration_requests
      WHEN (
        OLD.status != 'pending'
        AND NEW.status != OLD.status
      ) OR (
        OLD.status = 'pending'
        AND NEW.status IN ('approved', 'rejected')
        AND (
          NEW.password_hash != ''
          OR NEW.password_salt != ''
          OR NOT EXISTS (
            SELECT 1 FROM employee_registration_review_claims
            WHERE request_id = OLD.id AND decision = NEW.status
          )
        )
      )
      BEGIN
        SELECT RAISE(ABORT, 'REGISTRATION_REVIEW_REQUIRED');
      END`),
    d1.prepare(`CREATE TRIGGER IF NOT EXISTS auth_events_validate_credential_mutation_claim
      BEFORE INSERT ON auth_events
      WHEN NEW.id LIKE 'credential-mutation:%'
        AND (
          NEW.user_account_id IS NULL
          OR NOT EXISTS (
            SELECT 1 FROM auth_credentials
            WHERE user_account_id = NEW.user_account_id
              AND credential_version = CAST(NEW.detail AS INTEGER)
          )
        )
      BEGIN
        SELECT RAISE(ABORT, 'STALE_CREDENTIAL_VERSION');
      END`),
    d1.prepare("DROP TRIGGER IF EXISTS auth_credentials_audit_bootstrap_iteration_repair"),
    d1.prepare(`CREATE TRIGGER IF NOT EXISTS auth_credentials_audit_bootstrap_legacy_iteration_repair
      AFTER UPDATE OF password_hash, password_salt, password_iterations, credential_version ON auth_credentials
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
          SELECT 1 FROM user_accounts
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
          SELECT 1 FROM auth_sessions
          WHERE user_account_id = OLD.user_account_id
        )
        AND (
          SELECT COUNT(*) FROM auth_events
          WHERE user_account_id = OLD.user_account_id
            AND event_type = 'credential_created'
            AND source_hash = ''
            AND detail = 'bootstrap-prehashed'
            AND created_at >= OLD.created_at
        ) = 1
        AND NOT EXISTS (
          SELECT 1 FROM auth_events
          WHERE user_account_id = OLD.user_account_id
            AND NOT (
              (event_type = 'credential_created' AND source_hash = '' AND detail = 'bootstrap-prehashed' AND created_at >= OLD.created_at)
              OR (event_type = 'login_failed' AND detail = 'generic-credential-failure' AND created_at >= OLD.created_at)
            )
        )
        AND (
          SELECT COUNT(*) FROM auth_events
          WHERE user_account_id = OLD.user_account_id
            AND event_type = 'login_failed'
            AND detail = 'generic-credential-failure'
            AND created_at >= OLD.created_at
        ) = OLD.failed_attempts
      BEGIN
        UPDATE auth_sessions
          SET revoked_at = NEW.updated_at, revoke_reason = 'bootstrap-iteration-repair'
          WHERE user_account_id = OLD.user_account_id AND revoked_at IS NULL;
        INSERT INTO auth_events (id, user_account_id, event_type, source_hash, detail, created_at)
          VALUES (
            'bootstrap-legacy-credential-repaired:user-owner:1',
            OLD.user_account_id,
            'bootstrap_credential_repaired',
            '',
            'iterations:' || OLD.password_iterations || '->100000',
            NEW.updated_at
          );
      END`),
    d1.prepare("DROP TRIGGER IF EXISTS auth_sessions_validate_insert"),
    d1.prepare(`CREATE TRIGGER auth_sessions_validate_insert
      BEFORE INSERT ON auth_sessions
      WHEN NOT EXISTS (
        SELECT 1
        FROM user_accounts AS account
        INNER JOIN auth_credentials AS credential
          ON credential.user_account_id = account.id
        LEFT JOIN employees AS employee
          ON employee.id = account.employee_id
        WHERE account.id = NEW.user_account_id
          AND account.status = 'active'
          AND account.role IN ('admin', 'manager', 'employee')
          AND credential.password_hash <> ''
          AND credential.credential_version = NEW.credential_version
          AND (
            account.role = 'admin'
            OR (
              account.employee_id IS NOT NULL
              AND employee.status = 'active'
            )
          )
      )
      BEGIN
        SELECT RAISE(ABORT, 'AUTH_SESSION_ACCOUNT_UNAVAILABLE');
      END`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS notification_reads (
      id TEXT PRIMARY KEY NOT NULL,
      user_key TEXT NOT NULL,
      notification_id TEXT NOT NULL,
      read_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS notification_reads_user_notification_unique ON notification_reads (user_key, notification_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS notification_reads_user_read_idx ON notification_reads (user_key, read_at)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS organization_policies (
      id TEXT PRIMARY KEY NOT NULL,
      code TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'other',
      status TEXT NOT NULL DEFAULT 'draft',
      version INTEGER NOT NULL DEFAULT 1,
      effective_date TEXT NOT NULL,
      effective_to TEXT,
      scope_type TEXT NOT NULL DEFAULT 'all',
      scope_values TEXT NOT NULL,
      acknowledgement_required INTEGER NOT NULL DEFAULT 1,
      acknowledgement_due_days INTEGER NOT NULL DEFAULT 7,
      rules TEXT,
      content_hash TEXT NOT NULL DEFAULT '',
      published_at TEXT,
      published_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_by TEXT NOT NULL DEFAULT 'ระบบ'
    )`),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS organization_policies_code_version_unique ON organization_policies (code, version)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS organization_policies_published_code_effective_unique ON organization_policies (code, effective_date) WHERE status = 'published'"),
    d1.prepare("CREATE INDEX IF NOT EXISTS organization_policies_status_effective_idx ON organization_policies (status, effective_date)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS organization_policies_category_status_idx ON organization_policies (category, status)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS organization_policy_publish_claims (
      id TEXT PRIMARY KEY NOT NULL,
      policy_id TEXT NOT NULL REFERENCES organization_policies(id) ON DELETE RESTRICT,
      code TEXT NOT NULL,
      predecessor_version INTEGER NOT NULL,
      expected_content_hash TEXT NOT NULL DEFAULT '',
      published_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS organization_policy_publish_claim_policy_unique ON organization_policy_publish_claims (policy_id)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS organization_policy_publish_claim_head_unique ON organization_policy_publish_claims (code, predecessor_version)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS policy_acknowledgements (
      id TEXT PRIMARY KEY NOT NULL,
      policy_id TEXT NOT NULL REFERENCES organization_policies(id) ON DELETE RESTRICT,
      employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
      user_account_id TEXT REFERENCES user_accounts(id) ON DELETE SET NULL,
      policy_version INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      acknowledgement_text TEXT NOT NULL,
      acknowledged_name TEXT NOT NULL,
      acknowledged_email TEXT NOT NULL,
      authenticated_user_id TEXT NOT NULL,
      acknowledged_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS policy_acknowledgements_policy_version_employee_unique ON policy_acknowledgements (policy_id, policy_version, employee_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS policy_acknowledgements_employee_date_idx ON policy_acknowledgements (employee_id, acknowledged_at)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS policy_acknowledgements_policy_date_idx ON policy_acknowledgements (policy_id, acknowledged_at)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS evaluations (
      id TEXT PRIMARY KEY NOT NULL,
      employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      period TEXT NOT NULL,
      kpi_scores TEXT NOT NULL,
      skill_scores TEXT NOT NULL,
      kpi_score REAL NOT NULL,
      skill_score REAL NOT NULL,
      total_score REAL NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      evaluator TEXT NOT NULL DEFAULT 'ฝ่ายทรัพยากรบุคคล',
      evaluated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS evaluations_employee_period_unique ON evaluations (employee_id, period)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS evaluations_period_idx ON evaluations (period)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS employee_self_assessments (
      id TEXT PRIMARY KEY NOT NULL,
      employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      period TEXT NOT NULL,
      kpi_scores TEXT NOT NULL,
      skill_scores TEXT NOT NULL,
      kpi_score REAL NOT NULL,
      skill_score REAL NOT NULL,
      total_score REAL NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS employee_self_assessments_employee_period_unique ON employee_self_assessments (employee_id, period)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS employee_self_assessments_period_idx ON employee_self_assessments (period)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS hr_profiles (
      employee_id TEXT PRIMARY KEY NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      current_salary REAL NOT NULL DEFAULT 0,
      salary_review_month TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS attendance_records (
      id TEXT PRIMARY KEY NOT NULL,
      employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      work_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'present',
      clock_in TEXT,
      clock_out TEXT,
      minutes_late INTEGER NOT NULL DEFAULT 0,
      leave_type TEXT,
      note TEXT NOT NULL DEFAULT '',
      approval_status TEXT NOT NULL DEFAULT 'not_required',
      approved_by TEXT,
      approved_at TEXT,
      created_by TEXT NOT NULL DEFAULT 'ฝ่ายทรัพยากรบุคคล',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS attendance_employee_date_unique ON attendance_records (employee_id, work_date)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS attendance_work_date_idx ON attendance_records (work_date)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS attendance_approval_date_idx ON attendance_records (approval_status, work_date)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS skill_achievements (
      id TEXT PRIMARY KEY NOT NULL,
      employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      role_id TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      skill_name TEXT NOT NULL,
      level INTEGER NOT NULL,
      monthly_allowance INTEGER NOT NULL DEFAULT 0,
      verified_by TEXT NOT NULL,
      verified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      evidence_url TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS skill_achievement_milestone_unique ON skill_achievements (employee_id, skill_id, level)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS skill_achievement_employee_verified_idx ON skill_achievements (employee_id, verified_at)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS talent_actions (
      id TEXT PRIMARY KEY NOT NULL,
      employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'planned',
      score REAL,
      due_date TEXT NOT NULL,
      target_role_id TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare("CREATE INDEX IF NOT EXISTS talent_actions_employee_idx ON talent_actions (employee_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS talent_actions_status_due_idx ON talent_actions (status, due_date)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      owner_employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      department_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'planned',
      due_date TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT 'forest',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare("CREATE INDEX IF NOT EXISTS projects_status_due_idx ON projects (status, due_date)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS projects_owner_idx ON projects (owner_employee_id)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS work_items (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      assignee_employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      created_by_employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
      kind TEXT NOT NULL DEFAULT 'task',
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      priority TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'todo',
      progress INTEGER NOT NULL DEFAULT 0,
      points INTEGER NOT NULL DEFAULT 0,
      due_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare("CREATE INDEX IF NOT EXISTS work_items_project_status_idx ON work_items (project_id, status)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS work_items_assignee_status_idx ON work_items (assignee_employee_id, status)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS work_items_due_idx ON work_items (due_date)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS work_submissions (
      id TEXT PRIMARY KEY NOT NULL,
      work_item_id TEXT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
      employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      submission_type TEXT NOT NULL DEFAULT 'other',
      title TEXT NOT NULL,
      link_url TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      file_name TEXT NOT NULL DEFAULT '',
      storage_key TEXT NOT NULL DEFAULT '',
      content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      size_bytes INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'submitted',
      submitted_by TEXT NOT NULL DEFAULT '',
      submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reviewed_by TEXT,
      reviewed_at TEXT,
      reviewer_note TEXT NOT NULL DEFAULT ''
    )`),
    d1.prepare("CREATE INDEX IF NOT EXISTS work_submissions_work_status_idx ON work_submissions (work_item_id, status)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS work_submissions_employee_submitted_idx ON work_submissions (employee_id, submitted_at)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS rewards (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'perk',
      cost_points INTEGER NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      inventory_version INTEGER NOT NULL DEFAULT 0,
      icon TEXT NOT NULL DEFAULT '★',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare("CREATE INDEX IF NOT EXISTS rewards_active_cost_idx ON rewards (is_active, cost_points)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS quests (
      id TEXT PRIMARY KEY NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      progress INTEGER NOT NULL DEFAULT 0,
      points_reward INTEGER NOT NULL DEFAULT 0,
      reward_id TEXT REFERENCES rewards(id) ON DELETE RESTRICT,
      reward_title_snapshot TEXT NOT NULL DEFAULT '',
      reward_icon_snapshot TEXT NOT NULL DEFAULT '',
      is_featured INTEGER NOT NULL DEFAULT 1,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 0,
      created_by_user_id TEXT NOT NULL DEFAULT '',
      created_by_name TEXT NOT NULL DEFAULT '',
      updated_by_user_id TEXT NOT NULL DEFAULT '',
      updated_by_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare("CREATE INDEX IF NOT EXISTS quests_status_featured_dates_idx ON quests (status, is_featured, start_date, end_date)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS quests_type_status_idx ON quests (type, status)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS quests_reward_idx ON quests (reward_id)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS quest_targets (
      id TEXT PRIMARY KEY NOT NULL,
      quest_id TEXT NOT NULL REFERENCES quests(id) ON DELETE RESTRICT,
      target_type TEXT NOT NULL,
      target_key TEXT NOT NULL,
      target_label_snapshot TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS quest_targets_quest_type_key_unique ON quest_targets (quest_id, target_type, target_key)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS quest_targets_type_key_quest_idx ON quest_targets (target_type, target_key, quest_id)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS quest_mutation_events (
      id TEXT PRIMARY KEY NOT NULL,
      quest_id TEXT NOT NULL REFERENCES quests(id) ON DELETE RESTRICT,
      event_type TEXT NOT NULL,
      expected_revision INTEGER NOT NULL,
      expected_updated_at TEXT NOT NULL,
      revision INTEGER NOT NULL,
      actor_user_id TEXT NOT NULL DEFAULT '',
      actor_name TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS quest_mutation_events_quest_revision_unique ON quest_mutation_events (quest_id, revision)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS quest_mutation_events_actor_created_idx ON quest_mutation_events (actor_user_id, created_at)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS quest_completions (
      id TEXT PRIMARY KEY NOT NULL,
      quest_id TEXT NOT NULL REFERENCES quests(id) ON DELETE RESTRICT,
      employee_id TEXT NOT NULL,
      completion_date TEXT NOT NULL,
      quest_revision INTEGER NOT NULL,
      quest_updated_at TEXT NOT NULL,
      quest_type_snapshot TEXT NOT NULL,
      quest_title_snapshot TEXT NOT NULL,
      quest_description_snapshot TEXT NOT NULL DEFAULT '',
      quest_start_date_snapshot TEXT NOT NULL,
      quest_end_date_snapshot TEXT NOT NULL,
      points_awarded INTEGER NOT NULL,
      reward_id TEXT,
      reward_title_snapshot TEXT NOT NULL DEFAULT '',
      reward_icon_snapshot TEXT NOT NULL DEFAULT '',
      reward_inventory_version INTEGER,
      employee_name_snapshot TEXT NOT NULL,
      employee_role_id_snapshot TEXT NOT NULL,
      employee_department_id_snapshot TEXT NOT NULL,
      employee_department_name_snapshot TEXT NOT NULL,
      evidence_url TEXT NOT NULL,
      note TEXT NOT NULL,
      point_event_id TEXT NOT NULL,
      point_ledger_id TEXT NOT NULL,
      policy_id TEXT NOT NULL,
      policy_version INTEGER NOT NULL,
      policy_content_hash TEXT NOT NULL,
      quest_point_policy_limit INTEGER NOT NULL,
      max_manual_quest_completions INTEGER NOT NULL,
      standard_earn_monthly_cap INTEGER NOT NULL,
      completed_by_user_id TEXT NOT NULL DEFAULT '',
      completed_by_name TEXT NOT NULL,
      completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS quest_completions_quest_employee_unique ON quest_completions (quest_id, employee_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS quest_completions_employee_date_idx ON quest_completions (employee_id, completion_date)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS quest_completions_quest_date_idx ON quest_completions (quest_id, completion_date)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS point_ledger (
      id TEXT PRIMARY KEY NOT NULL,
      employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      points INTEGER NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      policy_id TEXT REFERENCES organization_policies(id) ON DELETE SET NULL,
      policy_version INTEGER,
      policy_content_hash TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS point_ledger_source_unique ON point_ledger (source_type, source_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS point_ledger_employee_created_idx ON point_ledger (employee_id, created_at)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS point_events (
      id TEXT PRIMARY KEY NOT NULL,
      employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      points INTEGER NOT NULL,
      event_date TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      evidence_url TEXT NOT NULL DEFAULT '',
      recorded_by TEXT NOT NULL DEFAULT '',
      policy_id TEXT REFERENCES organization_policies(id) ON DELETE SET NULL,
      policy_version INTEGER,
      policy_content_hash TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare("CREATE INDEX IF NOT EXISTS point_events_employee_date_idx ON point_events (employee_id, event_date)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS point_events_type_date_idx ON point_events (event_type, event_date)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS point_mutation_claims (
      id TEXT PRIMARY KEY NOT NULL,
      point_event_id TEXT NOT NULL REFERENCES point_events(id) ON DELETE RESTRICT,
      employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
      predecessor_event_count INTEGER NOT NULL,
      employee_sequence_key TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS point_mutation_claim_event_unique ON point_mutation_claims (point_event_id)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS point_mutation_claim_employee_sequence_unique ON point_mutation_claims (employee_sequence_key)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS point_mutation_claim_employee_created_idx ON point_mutation_claims (employee_id, created_at)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS reward_redemptions (
      id TEXT PRIMARY KEY NOT NULL,
      employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      reward_id TEXT NOT NULL REFERENCES rewards(id) ON DELETE CASCADE,
      points_spent INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'requested',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare("CREATE INDEX IF NOT EXISTS reward_redemptions_employee_created_idx ON reward_redemptions (employee_id, created_at)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS reward_redemptions_status_idx ON reward_redemptions (status)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS reward_redemption_claims (
      id TEXT PRIMARY KEY NOT NULL,
      redemption_id TEXT NOT NULL REFERENCES reward_redemptions(id) ON DELETE RESTRICT,
      employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
      reward_id TEXT NOT NULL REFERENCES rewards(id) ON DELETE RESTRICT,
      employee_request_key TEXT NOT NULL,
      reward_inventory_key TEXT NOT NULL,
      expected_inventory_version INTEGER NOT NULL,
      required_balance INTEGER NOT NULL,
      max_redemptions_per_month INTEGER NOT NULL,
      cooldown_days INTEGER NOT NULL,
      request_month TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS reward_redemption_claim_redemption_unique ON reward_redemption_claims (redemption_id)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS reward_redemption_claim_employee_request_unique ON reward_redemption_claims (employee_request_key)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS reward_redemption_claim_inventory_unique ON reward_redemption_claims (reward_inventory_key)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS reward_redemption_claim_employee_created_idx ON reward_redemption_claims (employee_id, created_at)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS employee_profiles (
      employee_id TEXT PRIMARY KEY NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      personal_email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      birth_date TEXT NOT NULL DEFAULT '',
      national_id_last4 TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      emergency_name TEXT NOT NULL DEFAULT '',
      emergency_phone TEXT NOT NULL DEFAULT '',
      start_date TEXT NOT NULL DEFAULT '',
      employment_type TEXT NOT NULL DEFAULT 'permanent',
      education TEXT NOT NULL DEFAULT '',
      experience_years INTEGER NOT NULL DEFAULT 0,
      application_source TEXT NOT NULL DEFAULT '',
      profile_image_key TEXT NOT NULL DEFAULT '',
      profile_image_content_type TEXT NOT NULL DEFAULT '',
      profile_image_updated_at TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS application_documents (
      id TEXT PRIMARY KEY NOT NULL,
      employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      document_type TEXT NOT NULL,
      title TEXT NOT NULL,
      file_name TEXT NOT NULL,
      storage_key TEXT NOT NULL DEFAULT '',
      content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      size_bytes INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      note TEXT NOT NULL DEFAULT '',
      uploaded_by TEXT NOT NULL DEFAULT '',
      uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      verified_by TEXT,
      verified_at TEXT
    )`),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS application_documents_required_type_unique ON application_documents (employee_id, document_type) WHERE document_type NOT IN ('contract', 'other')"),
    d1.prepare("CREATE INDEX IF NOT EXISTS application_documents_employee_status_idx ON application_documents (employee_id, status)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS employment_contracts (
      id TEXT PRIMARY KEY NOT NULL,
      employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      document_id TEXT REFERENCES application_documents(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      version TEXT NOT NULL DEFAULT '1.0',
      status TEXT NOT NULL DEFAULT 'draft',
      effective_date TEXT NOT NULL,
      expiry_date TEXT,
      sent_at TEXT,
      signed_name TEXT,
      signed_at TEXT,
      consent_text TEXT NOT NULL DEFAULT '',
      signer_user_id TEXT,
      signer_email TEXT,
      created_by TEXT NOT NULL DEFAULT 'ฝ่ายทรัพยากรบุคคล',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare("CREATE INDEX IF NOT EXISTS employment_contracts_employee_created_idx ON employment_contracts (employee_id, created_at)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS employment_contracts_status_idx ON employment_contracts (status)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS organization_documents (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'other',
      description TEXT NOT NULL DEFAULT '',
      document_number TEXT NOT NULL,
      version TEXT NOT NULL DEFAULT '1.0',
      status TEXT NOT NULL DEFAULT 'draft',
      owner TEXT NOT NULL,
      effective_date TEXT NOT NULL DEFAULT '',
      expiry_date TEXT,
      note TEXT NOT NULL DEFAULT '',
      file_name TEXT NOT NULL DEFAULT '',
      storage_key TEXT NOT NULL DEFAULT '',
      content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      size_bytes INTEGER NOT NULL DEFAULT 0,
      revision INTEGER NOT NULL DEFAULT 0,
      created_by_user_id TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL DEFAULT 'ฝ่ายทรัพยากรบุคคล',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_by_user_id TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL DEFAULT 'ฝ่ายทรัพยากรบุคคล',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS organization_documents_number_version_unique ON organization_documents (document_number, version)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS organization_documents_storage_key_unique ON organization_documents (storage_key) WHERE storage_key != ''"),
    d1.prepare("CREATE INDEX IF NOT EXISTS organization_documents_category_status_idx ON organization_documents (category, status)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS organization_documents_status_effective_idx ON organization_documents (status, effective_date)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS employee_warnings (
      id TEXT PRIMARY KEY NOT NULL,
      employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
      warning_number TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'first',
      subject TEXT NOT NULL,
      incident_date TEXT NOT NULL,
      issued_date TEXT NOT NULL,
      facts TEXT NOT NULL,
      corrective_action TEXT NOT NULL DEFAULT '',
      review_date TEXT,
      employee_statement TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      file_name TEXT NOT NULL DEFAULT '',
      storage_key TEXT NOT NULL DEFAULT '',
      content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      size_bytes INTEGER NOT NULL DEFAULT 0,
      revision INTEGER NOT NULL DEFAULT 0,
      issued_by TEXT,
      issued_at TEXT,
      acknowledged_by TEXT,
      acknowledged_at TEXT,
      resolved_by TEXT,
      resolved_at TEXT,
      withdrawn_by TEXT,
      withdrawn_at TEXT,
      created_by_user_id TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL DEFAULT 'ฝ่ายทรัพยากรบุคคล',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_by_user_id TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL DEFAULT 'ฝ่ายทรัพยากรบุคคล',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS employee_warnings_warning_number_unique ON employee_warnings (warning_number)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS employee_warnings_storage_key_unique ON employee_warnings (storage_key) WHERE storage_key != ''"),
    d1.prepare("CREATE INDEX IF NOT EXISTS employee_warnings_employee_issued_idx ON employee_warnings (employee_id, issued_date)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS employee_warnings_status_issued_idx ON employee_warnings (status, issued_date)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS employee_warning_events (
      id TEXT PRIMARY KEY NOT NULL,
      warning_id TEXT NOT NULL REFERENCES employee_warnings(id) ON DELETE RESTRICT,
      event_type TEXT NOT NULL,
      actor_user_id TEXT NOT NULL DEFAULT '',
      actor_name TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare("CREATE INDEX IF NOT EXISTS employee_warning_events_warning_created_idx ON employee_warning_events (warning_id, created_at)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS employee_recognitions (
      id TEXT PRIMARY KEY NOT NULL,
      employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
      recognition_type TEXT NOT NULL DEFAULT 'certificate',
      title TEXT NOT NULL,
      issuer TEXT NOT NULL,
      issued_date TEXT NOT NULL,
      expiry_date TEXT,
      credential_id TEXT NOT NULL DEFAULT '',
      verification_url TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      file_name TEXT NOT NULL DEFAULT '',
      storage_key TEXT NOT NULL DEFAULT '',
      content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      size_bytes INTEGER NOT NULL DEFAULT 0,
      revision INTEGER NOT NULL DEFAULT 0,
      created_by_user_id TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL DEFAULT 'ฝ่ายทรัพยากรบุคคล',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_by_user_id TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL DEFAULT 'ฝ่ายทรัพยากรบุคคล',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS employee_recognitions_storage_key_unique ON employee_recognitions (storage_key) WHERE storage_key != ''"),
    d1.prepare("CREATE INDEX IF NOT EXISTS employee_recognitions_employee_issued_idx ON employee_recognitions (employee_id, issued_date)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS employee_recognitions_status_expiry_idx ON employee_recognitions (status, expiry_date)"),
    ]);

    const compatibilityColumns = [
      ["employees", "position_title", "TEXT NOT NULL DEFAULT ''"],
      ["user_accounts", "nickname", "TEXT NOT NULL DEFAULT ''"],
      ["organization_policy_publish_claims", "expected_content_hash", "TEXT NOT NULL DEFAULT ''"],
      ["work_items", "created_by_employee_id", "TEXT REFERENCES employees(id) ON DELETE SET NULL"],
      ["rewards", "inventory_version", "INTEGER NOT NULL DEFAULT 0"],
      ["point_ledger", "policy_id", "TEXT REFERENCES organization_policies(id) ON DELETE SET NULL"],
      ["point_ledger", "policy_version", "INTEGER"],
      ["point_ledger", "policy_content_hash", "TEXT"],
      ["point_events", "policy_id", "TEXT REFERENCES organization_policies(id) ON DELETE SET NULL"],
      ["point_events", "policy_version", "INTEGER"],
      ["point_events", "policy_content_hash", "TEXT"],
    ] as const;
    for (const [table, column, definition] of compatibilityColumns) {
      await ensureColumn(d1, table, column, definition);
    }

    return d1.batch([
      d1.prepare(`CREATE TABLE IF NOT EXISTS point_cap_claims (
        id TEXT PRIMARY KEY NOT NULL,
        employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
        claim_month TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        employee_month_sequence_key TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`),
      d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS point_cap_claim_employee_month_sequence_unique ON point_cap_claims (employee_month_sequence_key)"),
      d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS point_cap_claim_source_unique ON point_cap_claims (source_type, source_id)"),
      d1.prepare("CREATE INDEX IF NOT EXISTS point_cap_claim_employee_month_idx ON point_cap_claims (employee_id, claim_month)"),
      d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS work_submissions_one_submitted_per_work_unique ON work_submissions (work_item_id) WHERE status = 'submitted'"),
      d1.prepare("CREATE INDEX IF NOT EXISTS work_items_creator_status_idx ON work_items (created_by_employee_id, status)"),
      d1.prepare("CREATE INDEX IF NOT EXISTS point_ledger_policy_idx ON point_ledger (policy_id, policy_version)"),
      d1.prepare("CREATE INDEX IF NOT EXISTS point_events_policy_idx ON point_events (policy_id, policy_version)"),
      d1.prepare(`CREATE TRIGGER IF NOT EXISTS organization_policy_publish_claim_guard
        BEFORE INSERT ON organization_policy_publish_claims
        BEGIN
          SELECT CASE WHEN NOT EXISTS (
            SELECT 1 FROM organization_policies
            WHERE id = NEW.policy_id
              AND status = 'draft'
              AND content_hash = NEW.expected_content_hash
          ) THEN RAISE(ABORT, 'POLICY_PUBLISH_STALE_DRAFT') END;
        END`),
      d1.prepare(`CREATE TRIGGER IF NOT EXISTS work_submission_insert_guard
        BEFORE INSERT ON work_submissions
        WHEN NEW.status = 'submitted'
        BEGIN
          SELECT CASE WHEN NOT EXISTS (
            SELECT 1 FROM work_items
            WHERE id = NEW.work_item_id
              AND assignee_employee_id = NEW.employee_id
              AND status IN ('todo', 'in_progress')
          ) THEN RAISE(ABORT, 'WORK_SUBMISSION_INVALID_STATE') END;
        END`),
      d1.prepare(`CREATE TRIGGER IF NOT EXISTS work_item_submission_terms_lock
        BEFORE UPDATE OF project_id, assignee_employee_id, kind, priority, due_date ON work_items
        WHEN EXISTS (
          SELECT 1 FROM work_submissions WHERE work_item_id = OLD.id
        ) AND (
          NEW.project_id IS NOT OLD.project_id
          OR NEW.assignee_employee_id IS NOT OLD.assignee_employee_id
          OR NEW.kind IS NOT OLD.kind
          OR NEW.priority IS NOT OLD.priority
          OR NEW.due_date IS NOT OLD.due_date
        )
        BEGIN
          SELECT RAISE(ABORT, 'WORK_ITEM_TERMS_LOCKED');
        END`),
      d1.prepare("DROP TRIGGER IF EXISTS employee_created_work_item_open_quota_guard"),
      d1.prepare(`CREATE TRIGGER employee_created_work_item_open_quota_guard
        BEFORE INSERT ON work_items
        WHEN NEW.created_by_employee_id IS NOT NULL
          AND NEW.points = 0
          AND NEW.kind = 'request'
          AND NEW.status <> 'done'
        BEGIN
          SELECT CASE WHEN (
            SELECT COUNT(*) FROM work_items
            WHERE created_by_employee_id = NEW.created_by_employee_id
              AND points = 0
              AND kind = 'request'
              AND status <> 'done'
          ) >= 12 THEN RAISE(ABORT, 'EMPLOYEE_WORK_OPEN_CREATOR_LIMIT') END;
          SELECT CASE WHEN (
            SELECT COUNT(*) FROM work_items
            WHERE created_by_employee_id = NEW.created_by_employee_id
              AND assignee_employee_id = NEW.assignee_employee_id
              AND points = 0
              AND kind = 'request'
              AND status <> 'done'
          ) >= 5 THEN RAISE(ABORT, 'EMPLOYEE_WORK_OPEN_ASSIGNEE_LIMIT') END;
          SELECT CASE WHEN (
            SELECT COUNT(*) FROM work_items
            WHERE assignee_employee_id = NEW.assignee_employee_id
              AND created_by_employee_id IS NOT NULL
              AND points = 0
              AND kind = 'request'
              AND status <> 'done'
          ) >= 12 THEN RAISE(ABORT, 'EMPLOYEE_WORK_OPEN_RECIPIENT_LIMIT') END;
        END`),
      d1.prepare("DROP TRIGGER IF EXISTS reward_redemption_claim_guard"),
      d1.prepare(`CREATE TRIGGER reward_redemption_claim_guard
        BEFORE INSERT ON reward_redemption_claims
        BEGIN
          SELECT CASE WHEN substr(datetime(NEW.created_at, '+7 hours'), 1, 7) IS NOT NEW.request_month
            THEN RAISE(ABORT, 'REDEMPTION_INVALID_MONTH') END;
          SELECT CASE WHEN NOT EXISTS (
            SELECT 1 FROM rewards
            WHERE id = NEW.reward_id AND is_active = 1 AND stock > 0 AND inventory_version = NEW.expected_inventory_version
          ) THEN RAISE(ABORT, 'REDEMPTION_STALE_INVENTORY') END;
          SELECT CASE WHEN COALESCE((SELECT SUM(points) FROM point_ledger WHERE employee_id = NEW.employee_id), 0) < NEW.required_balance
            THEN RAISE(ABORT, 'REDEMPTION_INSUFFICIENT_BALANCE') END;
          SELECT CASE WHEN (SELECT COUNT(*) FROM reward_redemptions
            WHERE employee_id = NEW.employee_id AND status IN ('requested', 'approved', 'fulfilled')
              AND substr(datetime(created_at, '+7 hours'), 1, 7) = NEW.request_month
          ) > NEW.max_redemptions_per_month THEN RAISE(ABORT, 'REDEMPTION_MONTHLY_LIMIT') END;
          SELECT CASE WHEN NEW.cooldown_days > 0 AND EXISTS (
            SELECT 1 FROM reward_redemptions
            WHERE employee_id = NEW.employee_id AND id <> NEW.redemption_id AND status IN ('requested', 'approved', 'fulfilled')
              AND julianday(NEW.created_at) - julianday(created_at) < NEW.cooldown_days
          ) THEN RAISE(ABORT, 'REDEMPTION_COOLDOWN') END;
        END`),
      d1.prepare(`CREATE TRIGGER IF NOT EXISTS organization_document_revision_guard
        BEFORE UPDATE ON organization_documents
        WHEN NEW.revision <> OLD.revision + 1
        BEGIN
          SELECT RAISE(ABORT, 'ORGANIZATION_DOCUMENT_STALE_REVISION');
        END`),
      d1.prepare(`CREATE TRIGGER IF NOT EXISTS employee_warning_revision_guard
        BEFORE UPDATE ON employee_warnings
        WHEN NEW.revision <> OLD.revision + 1
        BEGIN
          SELECT RAISE(ABORT, 'EMPLOYEE_WARNING_STALE_REVISION');
        END`),
      d1.prepare(`CREATE TRIGGER IF NOT EXISTS employee_warning_status_transition_guard
        BEFORE UPDATE OF status ON employee_warnings
        WHEN NOT (
          (OLD.status = 'draft' AND NEW.status IN ('draft', 'issued', 'withdrawn'))
          OR (OLD.status = 'issued' AND NEW.status IN ('issued', 'acknowledged', 'resolved', 'withdrawn'))
          OR (OLD.status = 'acknowledged' AND NEW.status IN ('acknowledged', 'resolved', 'withdrawn'))
          OR (OLD.status = 'resolved' AND NEW.status = 'resolved')
          OR (OLD.status = 'withdrawn' AND NEW.status = 'withdrawn')
        )
        BEGIN
          SELECT RAISE(ABORT, 'EMPLOYEE_WARNING_INVALID_TRANSITION');
        END`),
      d1.prepare(`CREATE TRIGGER IF NOT EXISTS employee_warning_substantive_fields_lock
        BEFORE UPDATE OF employee_id, warning_number, level, subject, incident_date, issued_date, facts, corrective_action, review_date, file_name, storage_key, content_type, size_bytes ON employee_warnings
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
        END`),
      d1.prepare(`CREATE TRIGGER IF NOT EXISTS employee_warning_created_audit
        AFTER INSERT ON employee_warnings
        BEGIN
          INSERT INTO employee_warning_events (id, warning_id, event_type, actor_user_id, actor_name, note, created_at)
          VALUES ('warning-event-' || lower(hex(randomblob(16))), NEW.id, 'created', NEW.created_by_user_id, NEW.created_by, 'สร้างร่างใบเตือน', NEW.created_at);
          INSERT INTO employee_warning_events (id, warning_id, event_type, actor_user_id, actor_name, note, created_at)
          SELECT 'warning-event-' || lower(hex(randomblob(16))), NEW.id, 'issued', NEW.created_by_user_id, NEW.created_by, 'ออกใบเตือนพร้อมการสร้างรายการ', NEW.created_at
          WHERE NEW.status = 'issued';
        END`),
      d1.prepare(`CREATE TRIGGER IF NOT EXISTS employee_warning_updated_audit
        AFTER UPDATE ON employee_warnings
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
        END`),
      d1.prepare(`CREATE TRIGGER IF NOT EXISTS employee_warning_event_update_guard
        BEFORE UPDATE ON employee_warning_events
        BEGIN
          SELECT RAISE(ABORT, 'EMPLOYEE_WARNING_EVENT_IMMUTABLE');
        END`),
      d1.prepare(`CREATE TRIGGER IF NOT EXISTS employee_warning_event_delete_guard
        BEFORE DELETE ON employee_warning_events
        BEGIN
          SELECT RAISE(ABORT, 'EMPLOYEE_WARNING_EVENT_IMMUTABLE');
        END`),
      d1.prepare(`CREATE TRIGGER IF NOT EXISTS employee_recognition_revision_guard
        BEFORE UPDATE ON employee_recognitions
        WHEN NEW.revision <> OLD.revision + 1
        BEGIN
          SELECT RAISE(ABORT, 'EMPLOYEE_RECOGNITION_STALE_REVISION');
        END`),
      d1.prepare(`CREATE TRIGGER IF NOT EXISTS employee_position_event_insert_guard
        BEFORE INSERT ON employee_position_events
        BEGIN
          SELECT CASE WHEN length(NEW.next_position_title) > 120
            OR trim(NEW.next_position_title) <> NEW.next_position_title
            OR instr(NEW.next_position_title, '  ') > 0
            OR instr(NEW.next_position_title, char(9)) > 0
            OR instr(NEW.next_position_title, char(10)) > 0
            OR instr(NEW.next_position_title, char(13)) > 0
            OR instr(NEW.next_position_title, char(0)) > 0
            THEN RAISE(ABORT, 'EMPLOYEE_POSITION_INVALID') END;
          SELECT CASE WHEN NEW.previous_position_title IS NEW.next_position_title
            OR NEW.resulting_updated_at <= NEW.expected_updated_at
            OR NEW.created_at IS NOT NEW.resulting_updated_at
            THEN RAISE(ABORT, 'EMPLOYEE_POSITION_INVALID_CHANGE') END;
          SELECT CASE WHEN NOT EXISTS (
            SELECT 1 FROM user_accounts
            WHERE id = NEW.actor_user_id AND role = 'admin' AND status = 'active'
          ) THEN RAISE(ABORT, 'EMPLOYEE_POSITION_ACTOR_INVALID') END;
          SELECT CASE WHEN NOT EXISTS (
            SELECT 1 FROM employees
            WHERE id = NEW.employee_id
              AND name = NEW.employee_name_snapshot
              AND role_id = NEW.role_id_snapshot
              AND position_title = NEW.previous_position_title
              AND updated_at = NEW.expected_updated_at
              AND status <> 'archived'
          ) THEN RAISE(ABORT, 'EMPLOYEE_POSITION_STALE') END;
        END`),
      d1.prepare(`CREATE TRIGGER IF NOT EXISTS employee_position_update_guard
        BEFORE UPDATE OF position_title ON employees
        WHEN NEW.position_title IS NOT OLD.position_title
          AND NOT EXISTS (
            SELECT 1 FROM employee_position_events
            WHERE employee_id = OLD.id
              AND employee_name_snapshot = OLD.name
              AND role_id_snapshot = OLD.role_id
              AND previous_position_title = OLD.position_title
              AND next_position_title = NEW.position_title
              AND expected_updated_at = OLD.updated_at
              AND resulting_updated_at = NEW.updated_at
          )
        BEGIN
          SELECT RAISE(ABORT, 'EMPLOYEE_POSITION_AUDIT_REQUIRED');
        END`),
      d1.prepare(`CREATE TRIGGER IF NOT EXISTS employee_position_event_apply
        AFTER INSERT ON employee_position_events
        BEGIN
          UPDATE employees
          SET position_title = NEW.next_position_title,
              updated_at = NEW.resulting_updated_at
          WHERE id = NEW.employee_id
            AND name = NEW.employee_name_snapshot
            AND role_id = NEW.role_id_snapshot
            AND position_title = NEW.previous_position_title
            AND updated_at = NEW.expected_updated_at
            AND status <> 'archived';
          SELECT CASE WHEN changes() <> 1
            THEN RAISE(ABORT, 'EMPLOYEE_POSITION_STALE') END;
        END`),
      d1.prepare(`CREATE TRIGGER IF NOT EXISTS employee_position_event_update_guard
        BEFORE UPDATE ON employee_position_events
        BEGIN
          SELECT RAISE(ABORT, 'EMPLOYEE_POSITION_EVENT_IMMUTABLE');
        END`),
      d1.prepare(`CREATE TRIGGER IF NOT EXISTS employee_position_event_delete_guard
        BEFORE DELETE ON employee_position_events
        BEGIN
          SELECT RAISE(ABORT, 'EMPLOYEE_POSITION_EVENT_IMMUTABLE');
        END`),
      d1.prepare(`CREATE TRIGGER IF NOT EXISTS quest_completion_insert_guard
        BEFORE INSERT ON quest_completions
        BEGIN
          SELECT CASE WHEN trim(NEW.note) = '' OR substr(lower(NEW.evidence_url), 1, 8) <> 'https://'
            THEN RAISE(ABORT, 'QUEST_COMPLETION_EVIDENCE_REQUIRED') END;
          SELECT CASE WHEN length(NEW.note) > 1000 OR length(NEW.evidence_url) > 1200
            THEN RAISE(ABORT, 'QUEST_COMPLETION_EVIDENCE_INVALID') END;
          SELECT CASE WHEN length(NEW.completion_date) <> 10
            OR date(NEW.completion_date) IS NULL
            OR date(NEW.completion_date) <> NEW.completion_date
            OR NEW.completion_date > date('now', '+7 hours')
            OR NEW.completion_date < date('now', '+7 hours', '-90 days')
            THEN RAISE(ABORT, 'QUEST_COMPLETION_DATE_INVALID') END;
          SELECT CASE WHEN NOT EXISTS (
            SELECT 1 FROM user_accounts
            WHERE id = NEW.completed_by_user_id
              AND role = 'admin'
              AND status = 'active'
              AND (employee_id IS NULL OR employee_id <> NEW.employee_id)
          ) THEN RAISE(ABORT, 'QUEST_COMPLETION_ACTOR_INVALID') END;
          SELECT CASE WHEN NEW.completion_date < NEW.quest_start_date_snapshot
            OR NEW.completion_date > NEW.quest_end_date_snapshot
            THEN RAISE(ABORT, 'QUEST_COMPLETION_DATE_OUTSIDE_QUEST') END;
          SELECT CASE WHEN NOT EXISTS (
            SELECT 1 FROM quests
            WHERE id = NEW.quest_id
              AND status IN ('active', 'completed')
              AND revision = NEW.quest_revision
              AND updated_at = NEW.quest_updated_at
              AND type = NEW.quest_type_snapshot
              AND title = NEW.quest_title_snapshot
              AND description = NEW.quest_description_snapshot
              AND start_date = NEW.quest_start_date_snapshot
              AND end_date = NEW.quest_end_date_snapshot
              AND points_reward = NEW.points_awarded
              AND reward_id IS NEW.reward_id
              AND reward_title_snapshot = NEW.reward_title_snapshot
              AND reward_icon_snapshot = NEW.reward_icon_snapshot
          ) THEN RAISE(ABORT, 'QUEST_COMPLETION_STALE_QUEST') END;
          SELECT CASE WHEN NOT EXISTS (
            SELECT 1 FROM employees
            WHERE id = NEW.employee_id
              AND status = 'active'
              AND name = NEW.employee_name_snapshot
              AND role_id = NEW.employee_role_id_snapshot
          ) THEN RAISE(ABORT, 'QUEST_COMPLETION_EMPLOYEE_UNAVAILABLE') END;
          SELECT CASE WHEN NOT EXISTS (
            SELECT 1 FROM quests AS quest
            WHERE quest.id = NEW.quest_id AND (
              quest.type = 'activity'
              OR (quest.type = 'individual' AND EXISTS (
                SELECT 1 FROM quest_targets
                WHERE quest_id = quest.id AND target_type = 'employee' AND target_key = NEW.employee_id
              ))
              OR (quest.type = 'team' AND EXISTS (
                SELECT 1 FROM quest_targets
                WHERE quest_id = quest.id AND target_type = 'department' AND target_key = NEW.employee_department_id_snapshot
              ))
            )
          ) THEN RAISE(ABORT, 'QUEST_COMPLETION_EMPLOYEE_NOT_ELIGIBLE') END;
          SELECT CASE WHEN NEW.points_awarded < 0 OR NEW.points_awarded > NEW.quest_point_policy_limit
            THEN RAISE(ABORT, 'QUEST_COMPLETION_POINT_LIMIT') END;
          SELECT CASE WHEN NOT EXISTS (
            SELECT 1 FROM organization_policies
            WHERE id = NEW.policy_id
              AND code = 'points-and-rewards'
              AND category = 'points_rewards'
              AND scope_type = 'all'
              AND status = 'published'
              AND version = NEW.policy_version
              AND content_hash = NEW.policy_content_hash
              AND effective_date <= NEW.completion_date
              AND (effective_to IS NULL OR effective_to >= NEW.completion_date)
          ) THEN RAISE(ABORT, 'QUEST_COMPLETION_POLICY_INVALID') END;
          SELECT CASE WHEN NOT EXISTS (
            SELECT 1 FROM point_events
            WHERE id = NEW.point_event_id
              AND employee_id = NEW.employee_id
              AND event_type = 'quest'
              AND points = NEW.points_awarded
              AND event_date = NEW.completion_date
              AND evidence_url = NEW.evidence_url
              AND policy_id = NEW.policy_id
              AND policy_version = NEW.policy_version
              AND policy_content_hash = NEW.policy_content_hash
          ) THEN RAISE(ABORT, 'QUEST_COMPLETION_POINT_EVENT_MISSING') END;
          SELECT CASE WHEN NOT EXISTS (
            SELECT 1 FROM point_ledger
            WHERE id = NEW.point_ledger_id
              AND employee_id = NEW.employee_id
              AND source_type = 'quest'
              AND source_id = NEW.id
              AND points = NEW.points_awarded
              AND policy_id = NEW.policy_id
              AND policy_version = NEW.policy_version
              AND policy_content_hash = NEW.policy_content_hash
          ) THEN RAISE(ABORT, 'QUEST_COMPLETION_POINT_LEDGER_MISSING') END;
          SELECT CASE WHEN NOT EXISTS (
            SELECT 1 FROM point_mutation_claims
            WHERE point_event_id = NEW.point_event_id AND employee_id = NEW.employee_id
          ) OR NOT EXISTS (
            SELECT 1 FROM point_cap_claims
            WHERE employee_id = NEW.employee_id
              AND claim_month = substr(NEW.completion_date, 1, 7)
              AND source_type = 'quest_completion'
              AND source_id = NEW.id
          ) THEN RAISE(ABORT, 'QUEST_COMPLETION_POINT_CLAIMS_MISSING') END;
          SELECT CASE WHEN (
            SELECT COUNT(*) FROM point_events
            WHERE employee_id = NEW.employee_id
              AND event_type = 'quest'
              AND substr(event_date, 1, 7) = substr(NEW.completion_date, 1, 7)
          ) > NEW.max_manual_quest_completions
            THEN RAISE(ABORT, 'QUEST_COMPLETION_MONTHLY_COUNT_LIMIT') END;
          SELECT CASE WHEN COALESCE((
            SELECT SUM(points) FROM point_events
            WHERE employee_id = NEW.employee_id
              AND event_type <> 'monthly_evaluation'
              AND points > 0
              AND substr(event_date, 1, 7) = substr(NEW.completion_date, 1, 7)
          ), 0) + COALESCE((
            SELECT SUM(points) FROM point_ledger
            WHERE employee_id = NEW.employee_id
              AND source_type IN ('task', 'mission')
              AND points > 0
              AND substr(datetime(created_at, '+7 hours'), 1, 7) = substr(NEW.completion_date, 1, 7)
          ), 0) > NEW.standard_earn_monthly_cap
            THEN RAISE(ABORT, 'QUEST_COMPLETION_MONTHLY_POINT_LIMIT') END;
          SELECT CASE WHEN NEW.reward_id IS NULL AND NEW.reward_inventory_version IS NOT NULL
            THEN RAISE(ABORT, 'QUEST_COMPLETION_REWARD_INVALID') END;
          SELECT CASE WHEN NEW.reward_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM rewards
            WHERE id = NEW.reward_id
              AND is_active = 1
              AND stock > 0
              AND inventory_version = NEW.reward_inventory_version
          ) THEN RAISE(ABORT, 'QUEST_COMPLETION_REWARD_UNAVAILABLE') END;
        END`),
      d1.prepare(`CREATE TRIGGER IF NOT EXISTS quest_completion_update_guard
        BEFORE UPDATE ON quest_completions
        BEGIN
          SELECT RAISE(ABORT, 'QUEST_COMPLETION_IMMUTABLE');
        END`),
      d1.prepare(`CREATE TRIGGER IF NOT EXISTS quest_completion_delete_guard
        BEFORE DELETE ON quest_completions
        BEGIN
          SELECT RAISE(ABORT, 'QUEST_COMPLETION_IMMUTABLE');
        END`),
      d1.prepare(`CREATE TRIGGER IF NOT EXISTS quest_fulfilled_terms_lock
        BEFORE UPDATE OF type, title, description, points_reward, reward_id, reward_title_snapshot, reward_icon_snapshot, start_date, end_date ON quests
        WHEN EXISTS (SELECT 1 FROM quest_completions WHERE quest_id = OLD.id) AND (
          NEW.type IS NOT OLD.type
          OR NEW.title IS NOT OLD.title
          OR NEW.description IS NOT OLD.description
          OR NEW.points_reward IS NOT OLD.points_reward
          OR NEW.reward_id IS NOT OLD.reward_id
          OR NEW.reward_title_snapshot IS NOT OLD.reward_title_snapshot
          OR NEW.reward_icon_snapshot IS NOT OLD.reward_icon_snapshot
          OR NEW.start_date IS NOT OLD.start_date
          OR NEW.end_date IS NOT OLD.end_date
        )
        BEGIN
          SELECT RAISE(ABORT, 'QUEST_FULFILLED_TERMS_LOCKED');
        END`),
      d1.prepare(`CREATE TRIGGER IF NOT EXISTS quest_target_fulfilled_insert_guard
        BEFORE INSERT ON quest_targets
        WHEN EXISTS (SELECT 1 FROM quest_completions WHERE quest_id = NEW.quest_id)
        BEGIN
          SELECT RAISE(ABORT, 'QUEST_FULFILLED_TARGETS_LOCKED');
        END`),
      d1.prepare(`CREATE TRIGGER IF NOT EXISTS quest_target_fulfilled_update_guard
        BEFORE UPDATE ON quest_targets
        WHEN EXISTS (SELECT 1 FROM quest_completions WHERE quest_id = OLD.quest_id)
        BEGIN
          SELECT RAISE(ABORT, 'QUEST_FULFILLED_TARGETS_LOCKED');
        END`),
      d1.prepare(`CREATE TRIGGER IF NOT EXISTS quest_target_fulfilled_delete_guard
        BEFORE DELETE ON quest_targets
        WHEN EXISTS (SELECT 1 FROM quest_completions WHERE quest_id = OLD.quest_id)
        BEGIN
          SELECT RAISE(ABORT, 'QUEST_FULFILLED_TARGETS_LOCKED');
        END`),
      d1.prepare(`CREATE TRIGGER IF NOT EXISTS quest_mutation_event_guard
        BEFORE INSERT ON quest_mutation_events
        BEGIN
          SELECT CASE WHEN NEW.event_type = 'created' AND NOT (
            NEW.expected_revision = -1
            AND NEW.revision = 0
            AND EXISTS (
              SELECT 1 FROM quests
              WHERE id = NEW.quest_id AND revision = 0 AND updated_at = NEW.expected_updated_at
            )
            AND NOT EXISTS (
              SELECT 1 FROM quest_mutation_events WHERE quest_id = NEW.quest_id
            )
          ) THEN RAISE(ABORT, 'QUEST_CREATE_INVALID_STATE') END;
          SELECT CASE WHEN NEW.event_type IN ('updated', 'archived') AND NOT (
            NEW.revision = NEW.expected_revision + 1
            AND EXISTS (
              SELECT 1 FROM quests
              WHERE id = NEW.quest_id
                AND revision = NEW.expected_revision
                AND updated_at = NEW.expected_updated_at
            )
          ) THEN RAISE(ABORT, 'QUEST_STALE_REVISION') END;
        END`),
      d1.prepare(`CREATE TRIGGER IF NOT EXISTS quest_mutation_event_update_guard
        BEFORE UPDATE ON quest_mutation_events
        BEGIN
          SELECT RAISE(ABORT, 'QUEST_MUTATION_EVENT_IMMUTABLE');
        END`),
      d1.prepare(`CREATE TRIGGER IF NOT EXISTS quest_mutation_event_delete_guard
        BEFORE DELETE ON quest_mutation_events
        BEGIN
          SELECT RAISE(ABORT, 'QUEST_MUTATION_EVENT_IMMUTABLE');
        END`),
      d1.prepare(`CREATE TRIGGER IF NOT EXISTS quest_reward_linking_insert_guard
        BEFORE INSERT ON quests
        WHEN NEW.reward_id IS NOT NULL AND (
          SELECT quest_reward_linking_enabled FROM system_settings WHERE id = 'global'
        ) IS NOT 1
        BEGIN
          SELECT RAISE(ABORT, 'QUEST_REWARD_LINKING_DISABLED');
        END`),
      d1.prepare(`CREATE TRIGGER IF NOT EXISTS quest_reward_linking_update_guard
        BEFORE UPDATE OF reward_id ON quests
        WHEN NEW.reward_id IS NOT NULL
          AND NEW.reward_id IS NOT OLD.reward_id
          AND (
            SELECT quest_reward_linking_enabled FROM system_settings WHERE id = 'global'
          ) IS NOT 1
        BEGIN
          SELECT RAISE(ABORT, 'QUEST_REWARD_LINKING_DISABLED');
        END`),
      d1.prepare(`CREATE TRIGGER IF NOT EXISTS system_settings_singleton_insert_guard
        BEFORE INSERT ON system_settings
        WHEN NEW.id != 'global' OR EXISTS (SELECT 1 FROM system_settings)
        BEGIN
          SELECT RAISE(ABORT, 'SYSTEM_SETTINGS_SINGLETON');
        END`),
      d1.prepare(`CREATE TRIGGER IF NOT EXISTS system_settings_update_guard
        BEFORE UPDATE ON system_settings
        BEGIN
          SELECT CASE WHEN OLD.id != 'global' OR NEW.id != OLD.id
            THEN RAISE(ABORT, 'SYSTEM_SETTINGS_SINGLETON') END;
          SELECT CASE WHEN NEW.revision != OLD.revision + 1
            THEN RAISE(ABORT, 'SYSTEM_SETTINGS_INVALID_REVISION') END;
          SELECT CASE WHEN NEW.updated_by_user_id != 'user-owner' OR NOT EXISTS (
            SELECT 1 FROM user_accounts
            WHERE id = NEW.updated_by_user_id AND role = 'admin' AND status = 'active'
          ) THEN RAISE(ABORT, 'SYSTEM_SETTINGS_OWNER_REQUIRED') END;
          SELECT CASE WHEN length(trim(NEW.organization_name)) < 2 OR length(NEW.organization_name) > 80
            OR length(trim(NEW.organization_short_name)) < 2 OR length(NEW.organization_short_name) > 30
            THEN RAISE(ABORT, 'SYSTEM_SETTINGS_INVALID_ORGANIZATION') END;
          SELECT CASE WHEN NEW.navigation_mode NOT IN ('simple', 'full')
            OR NEW.admin_home NOT IN ('overview', 'employees', 'work')
            OR NEW.manager_home NOT IN ('overview', 'employees', 'work')
            OR NEW.employee_home NOT IN ('work', 'portfolio', 'peopleOps')
            THEN RAISE(ABORT, 'SYSTEM_SETTINGS_INVALID_EXPERIENCE') END;
          SELECT CASE WHEN NEW.ai_assistant_enabled NOT IN (0, 1)
            OR NEW.ai_mascot_enabled NOT IN (0, 1)
            OR NEW.office_3d_enabled NOT IN (0, 1)
            OR NEW.quest_reward_linking_enabled NOT IN (0, 1)
            OR (NEW.ai_mascot_enabled = 1 AND NEW.ai_assistant_enabled = 0)
            THEN RAISE(ABORT, 'SYSTEM_SETTINGS_INVALID_FEATURES') END;
          SELECT CASE WHEN NEW.organization_name IS OLD.organization_name
            AND NEW.organization_short_name IS OLD.organization_short_name
            AND NEW.navigation_mode IS OLD.navigation_mode
            AND NEW.admin_home IS OLD.admin_home
            AND NEW.manager_home IS OLD.manager_home
            AND NEW.employee_home IS OLD.employee_home
            AND NEW.ai_assistant_enabled IS OLD.ai_assistant_enabled
            AND NEW.ai_mascot_enabled IS OLD.ai_mascot_enabled
            AND NEW.office_3d_enabled IS OLD.office_3d_enabled
            AND NEW.quest_reward_linking_enabled IS OLD.quest_reward_linking_enabled
            THEN RAISE(ABORT, 'SYSTEM_SETTINGS_NO_CHANGES') END;
          SELECT CASE WHEN NOT EXISTS (
            SELECT 1 FROM system_settings_events AS event
            WHERE event.settings_id = OLD.id
              AND event.previous_revision = OLD.revision
              AND event.next_revision = NEW.revision
              AND event.expected_updated_at = OLD.updated_at
              AND event.resulting_updated_at = NEW.updated_at
              AND event.actor_user_id = NEW.updated_by_user_id
              AND event.actor_name = NEW.updated_by_name
              AND json_extract(event.previous_snapshot, '$.id') IS OLD.id
              AND json_extract(event.previous_snapshot, '$.revision') IS OLD.revision
              AND json_extract(event.previous_snapshot, '$.organization.name') IS OLD.organization_name
              AND json_extract(event.previous_snapshot, '$.organization.shortName') IS OLD.organization_short_name
              AND json_extract(event.previous_snapshot, '$.experience.navigationMode') IS OLD.navigation_mode
              AND json_extract(event.previous_snapshot, '$.experience.adminHome') IS OLD.admin_home
              AND json_extract(event.previous_snapshot, '$.experience.managerHome') IS OLD.manager_home
              AND json_extract(event.previous_snapshot, '$.experience.employeeHome') IS OLD.employee_home
              AND json_extract(event.previous_snapshot, '$.features.aiAssistantEnabled') IS OLD.ai_assistant_enabled
              AND json_extract(event.previous_snapshot, '$.features.aiMascotEnabled') IS OLD.ai_mascot_enabled
              AND json_extract(event.previous_snapshot, '$.features.office3dEnabled') IS OLD.office_3d_enabled
              AND json_extract(event.previous_snapshot, '$.features.questRewardLinkingEnabled') IS OLD.quest_reward_linking_enabled
              AND json_extract(event.previous_snapshot, '$.updatedAt') IS OLD.updated_at
              AND json_extract(event.previous_snapshot, '$.updatedByName') IS OLD.updated_by_name
              AND json_extract(event.next_snapshot, '$.id') IS NEW.id
              AND json_extract(event.next_snapshot, '$.revision') IS NEW.revision
              AND json_extract(event.next_snapshot, '$.organization.name') IS NEW.organization_name
              AND json_extract(event.next_snapshot, '$.organization.shortName') IS NEW.organization_short_name
              AND json_extract(event.next_snapshot, '$.experience.navigationMode') IS NEW.navigation_mode
              AND json_extract(event.next_snapshot, '$.experience.adminHome') IS NEW.admin_home
              AND json_extract(event.next_snapshot, '$.experience.managerHome') IS NEW.manager_home
              AND json_extract(event.next_snapshot, '$.experience.employeeHome') IS NEW.employee_home
              AND json_extract(event.next_snapshot, '$.features.aiAssistantEnabled') IS NEW.ai_assistant_enabled
              AND json_extract(event.next_snapshot, '$.features.aiMascotEnabled') IS NEW.ai_mascot_enabled
              AND json_extract(event.next_snapshot, '$.features.office3dEnabled') IS NEW.office_3d_enabled
              AND json_extract(event.next_snapshot, '$.features.questRewardLinkingEnabled') IS NEW.quest_reward_linking_enabled
              AND json_extract(event.next_snapshot, '$.updatedAt') IS NEW.updated_at
              AND json_extract(event.next_snapshot, '$.updatedByName') IS NEW.updated_by_name
              AND NOT EXISTS (
                SELECT 1 FROM json_each(event.changed_keys)
                WHERE type != 'text' OR value NOT IN (
                  'organization.name', 'organization.shortName',
                  'experience.navigationMode', 'experience.adminHome', 'experience.managerHome', 'experience.employeeHome',
                  'features.aiAssistantEnabled', 'features.aiMascotEnabled',
                  'features.office3dEnabled', 'features.questRewardLinkingEnabled'
                )
              )
              AND json_array_length(event.changed_keys) = (
                (NEW.organization_name IS NOT OLD.organization_name)
                + (NEW.organization_short_name IS NOT OLD.organization_short_name)
                + (NEW.navigation_mode IS NOT OLD.navigation_mode)
                + (NEW.admin_home IS NOT OLD.admin_home)
                + (NEW.manager_home IS NOT OLD.manager_home)
                + (NEW.employee_home IS NOT OLD.employee_home)
                + (NEW.ai_assistant_enabled IS NOT OLD.ai_assistant_enabled)
                + (NEW.ai_mascot_enabled IS NOT OLD.ai_mascot_enabled)
                + (NEW.office_3d_enabled IS NOT OLD.office_3d_enabled)
                + (NEW.quest_reward_linking_enabled IS NOT OLD.quest_reward_linking_enabled)
              )
              AND json_array_length(event.changed_keys) = (
                SELECT COUNT(DISTINCT value) FROM json_each(event.changed_keys)
              )
              AND (NEW.organization_name IS OLD.organization_name OR EXISTS (
                SELECT 1 FROM json_each(event.changed_keys) WHERE value = 'organization.name'
              ))
              AND (NEW.organization_short_name IS OLD.organization_short_name OR EXISTS (
                SELECT 1 FROM json_each(event.changed_keys) WHERE value = 'organization.shortName'
              ))
              AND (NEW.navigation_mode IS OLD.navigation_mode OR EXISTS (
                SELECT 1 FROM json_each(event.changed_keys) WHERE value = 'experience.navigationMode'
              ))
              AND (NEW.admin_home IS OLD.admin_home OR EXISTS (
                SELECT 1 FROM json_each(event.changed_keys) WHERE value = 'experience.adminHome'
              ))
              AND (NEW.manager_home IS OLD.manager_home OR EXISTS (
                SELECT 1 FROM json_each(event.changed_keys) WHERE value = 'experience.managerHome'
              ))
              AND (NEW.employee_home IS OLD.employee_home OR EXISTS (
                SELECT 1 FROM json_each(event.changed_keys) WHERE value = 'experience.employeeHome'
              ))
              AND (NEW.ai_assistant_enabled IS OLD.ai_assistant_enabled OR EXISTS (
                SELECT 1 FROM json_each(event.changed_keys) WHERE value = 'features.aiAssistantEnabled'
              ))
              AND (NEW.ai_mascot_enabled IS OLD.ai_mascot_enabled OR EXISTS (
                SELECT 1 FROM json_each(event.changed_keys) WHERE value = 'features.aiMascotEnabled'
              ))
              AND (NEW.office_3d_enabled IS OLD.office_3d_enabled OR EXISTS (
                SELECT 1 FROM json_each(event.changed_keys) WHERE value = 'features.office3dEnabled'
              ))
              AND (NEW.quest_reward_linking_enabled IS OLD.quest_reward_linking_enabled OR EXISTS (
                SELECT 1 FROM json_each(event.changed_keys) WHERE value = 'features.questRewardLinkingEnabled'
              ))
          ) THEN RAISE(ABORT, 'SYSTEM_SETTINGS_AUDIT_REQUIRED') END;
        END`),
      d1.prepare(`CREATE TRIGGER IF NOT EXISTS system_settings_delete_guard
        BEFORE DELETE ON system_settings
        BEGIN
          SELECT RAISE(ABORT, 'SYSTEM_SETTINGS_IMMUTABLE_SINGLETON');
        END`),
      d1.prepare(`CREATE TRIGGER IF NOT EXISTS system_settings_event_insert_guard
        BEFORE INSERT ON system_settings_events
        BEGIN
          SELECT CASE WHEN NEW.settings_id != 'global'
            OR NEW.next_revision != NEW.previous_revision + 1
            OR NOT json_valid(NEW.previous_snapshot)
            OR NOT json_valid(NEW.next_snapshot)
            OR NOT json_valid(NEW.changed_keys)
            OR json_type(NEW.changed_keys) != 'array'
            OR json_array_length(NEW.changed_keys) < 1
            OR CAST(json_extract(NEW.previous_snapshot, '$.revision') AS INTEGER) != NEW.previous_revision
            OR CAST(json_extract(NEW.next_snapshot, '$.revision') AS INTEGER) != NEW.next_revision
            THEN RAISE(ABORT, 'SYSTEM_SETTINGS_EVENT_INVALID') END;
          SELECT CASE WHEN NEW.actor_user_id != 'user-owner' OR NOT EXISTS (
            SELECT 1 FROM user_accounts
            WHERE id = NEW.actor_user_id AND role = 'admin' AND status = 'active'
          ) THEN RAISE(ABORT, 'SYSTEM_SETTINGS_OWNER_REQUIRED') END;
          SELECT CASE WHEN NOT EXISTS (
            SELECT 1 FROM system_settings
            WHERE id = NEW.settings_id
              AND revision = NEW.previous_revision
              AND updated_at = NEW.expected_updated_at
          ) THEN RAISE(ABORT, 'SYSTEM_SETTINGS_STALE') END;
        END`),
      d1.prepare(`CREATE TRIGGER IF NOT EXISTS system_settings_event_update_guard
        BEFORE UPDATE ON system_settings_events
        BEGIN
          SELECT RAISE(ABORT, 'SYSTEM_SETTINGS_EVENT_IMMUTABLE');
        END`),
      d1.prepare(`CREATE TRIGGER IF NOT EXISTS system_settings_event_delete_guard
        BEFORE DELETE ON system_settings_events
        BEGIN
          SELECT RAISE(ABORT, 'SYSTEM_SETTINGS_EVENT_IMMUTABLE');
        END`),
      d1.prepare("PRAGMA optimize"),
      d1.prepare(`CREATE TABLE IF NOT EXISTS people_pulse_schema_v24_ready (
        schema_version INTEGER PRIMARY KEY NOT NULL CHECK (schema_version = 24)
      )`),
    ]);
  })().catch((error) => {
    initialization = null;
    throw error;
  });
  return initialization;
}
