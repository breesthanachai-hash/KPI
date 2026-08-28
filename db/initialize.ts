import { getD1 } from ".";

let initialization: Promise<unknown> | null = null;

async function ensureColumn(
  d1: ReturnType<typeof getD1>,
  table: "rewards" | "point_ledger" | "point_events" | "organization_policy_publish_claims" | "work_items",
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
    await d1.batch([
    d1.prepare(`CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY NOT NULL,
      initials TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      role_id TEXT NOT NULL,
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
    d1.prepare(`CREATE TABLE IF NOT EXISTS user_accounts (
      id TEXT PRIMARY KEY NOT NULL,
      auth_user_id TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL,
      display_name TEXT NOT NULL,
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
    ]);

    const compatibilityColumns = [
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
      d1.prepare("PRAGMA optimize"),
    ]);
  })().catch((error) => {
    initialization = null;
    throw error;
  });
  return initialization;
}
