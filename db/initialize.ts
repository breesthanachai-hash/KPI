import { getD1 } from ".";

let initialization: Promise<unknown> | null = null;

export function ensureDatabase() {
  if (initialization) return initialization;
  const d1 = getD1();
  initialization = d1.batch([
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
    d1.prepare(`CREATE TABLE IF NOT EXISTS rewards (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'perk',
      cost_points INTEGER NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
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
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS point_ledger_source_unique ON point_ledger (source_type, source_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS point_ledger_employee_created_idx ON point_ledger (employee_id, created_at)"),
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
    d1.prepare("PRAGMA optimize"),
  ]).catch((error) => {
    initialization = null;
    throw error;
  });
  return initialization;
}
