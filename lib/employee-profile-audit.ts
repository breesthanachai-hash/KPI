import { getD1 } from "../db";

export async function ensureEmployeeProfileAudit() {
  const db = getD1();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS employee_profile_audit (
      id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, actor_id TEXT NOT NULL,
      actor_name TEXT NOT NULL, created_at TEXT NOT NULL,
      before_json TEXT NOT NULL, after_json TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS employee_profile_audit_employee ON employee_profile_audit(employee_id, created_at)"),
    db.prepare("CREATE TRIGGER IF NOT EXISTS employee_profile_audit_no_update BEFORE UPDATE ON employee_profile_audit BEGIN SELECT RAISE(ABORT, 'AUDIT_IMMUTABLE'); END"),
    db.prepare("CREATE TRIGGER IF NOT EXISTS employee_profile_audit_no_delete BEFORE DELETE ON employee_profile_audit BEGIN SELECT RAISE(ABORT, 'AUDIT_IMMUTABLE'); END"),
  ]);
}
