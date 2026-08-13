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
  ]).catch((error) => {
    initialization = null;
    throw error;
  });
  return initialization;
}
