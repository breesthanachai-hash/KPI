import { getD1 } from "./index";

// Schema is migration-owned. Runtime installs single-statement guards because the
// hosting migration splitter does not preserve compound SQLite trigger bodies.
export const payrollGuardStatements = [
  `CREATE TRIGGER IF NOT EXISTS payroll_event_claim BEFORE INSERT ON payroll_events BEGIN
    SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM user_accounts WHERE id=NEW.actor_id AND role='admin' AND status='active') THEN RAISE(ABORT,'PAYROLL_FORBIDDEN') END;
    SELECT CASE WHEN NEW.action IN ('approve','paid','void') AND NEW.actor_id <> 'user-owner' THEN RAISE(ABORT,'PAYROLL_FORBIDDEN') END;
    SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM payroll_runs WHERE id=NEW.run_id AND
      ((NEW.action='create' AND revision=0 AND NEW.revision=0 AND status='draft') OR
       (NEW.revision=revision+1 AND ((NEW.action IN ('save','approve','void') AND status='draft') OR (NEW.action='paid' AND status='approved'))))) THEN RAISE(ABORT,'PAYROLL_STALE') END;
    SELECT CASE WHEN NEW.action='approve' AND NEW.reason<>'additional-run-confirmed' AND EXISTS (SELECT 1 FROM payroll_slips s JOIN payroll_runs r ON r.id=s.run_id WHERE s.employee_id IN (SELECT json_extract(value,'$.employeeId') FROM json_each(NEW.document,'$.entries')) AND (s.period=json_extract(NEW.document,'$.period') OR (json_extract(r.document,'$.startDate')<=json_extract(NEW.document,'$.endDate') AND json_extract(r.document,'$.endDate')>=json_extract(NEW.document,'$.startDate')))) THEN RAISE(ABORT,'PAYROLL_OVERLAP') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS payroll_run_guard BEFORE UPDATE ON payroll_runs BEGIN
    SELECT CASE WHEN NEW.id<>OLD.id OR NEW.period<>OLD.period OR NEW.created_at<>OLD.created_at OR NEW.created_by<>OLD.created_by OR NEW.revision<>OLD.revision+1 THEN RAISE(ABORT,'PAYROLL_STALE') END;
    SELECT CASE WHEN OLD.status<>'draft' AND NEW.document<>OLD.document THEN RAISE(ABORT,'PAYROLL_IMMUTABLE') END;
    SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM payroll_events e WHERE e.run_id=NEW.id AND e.revision=NEW.revision AND e.document=NEW.document AND
      ((e.action='save' AND OLD.status='draft' AND NEW.status='draft') OR
       (e.action='approve' AND OLD.status='draft' AND NEW.status='approved') OR
       (e.action='void' AND OLD.status='draft' AND NEW.status='void') OR
       (e.action='paid' AND OLD.status='approved' AND NEW.status='paid' AND length(NEW.payment_reference)>0))) THEN RAISE(ABORT,'PAYROLL_AUDIT_REQUIRED') END;
    SELECT CASE WHEN NEW.status IN ('approved','paid') AND (SELECT count(*) FROM payroll_slips WHERE run_id=NEW.id) <> json_array_length(NEW.document,'$.entries') THEN RAISE(ABORT,'PAYROLL_INCOMPLETE') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS payroll_slip_guard BEFORE INSERT ON payroll_slips BEGIN
    SELECT CASE WHEN json_extract(NEW.snapshot,'$.entry.totals.attendanceBonus')>0 AND (
      (SELECT start_date FROM employee_profiles WHERE employee_id=NEW.employee_id) IS NOT json_extract(json_extract(NEW.snapshot,'$.entry.attendanceReview'),'$.startDate') OR
      (SELECT count(*) FROM attendance_records WHERE employee_id=NEW.employee_id AND substr(work_date,1,7)=json_extract(json_extract(NEW.snapshot,'$.entry.attendanceReview'),'$.sourceMonth')) <> json_array_length(json_extract(NEW.snapshot,'$.entry.attendanceReview'),'$.evidence') OR
      EXISTS (SELECT 1 FROM json_each(json_extract(NEW.snapshot,'$.entry.attendanceReview'),'$.evidence') j WHERE NOT EXISTS (SELECT 1 FROM attendance_records a WHERE a.employee_id=NEW.employee_id AND a.work_date=json_extract(j.value,'$.work_date') AND a.status=json_extract(j.value,'$.status') AND a.minutes_late=json_extract(j.value,'$.minutes_late') AND a.clock_in IS json_extract(j.value,'$.clock_in') AND a.updated_at=json_extract(j.value,'$.updated_at')))
    ) THEN RAISE(ABORT,'PAYROLL_ATTENDANCE_CHANGED') END;
    SELECT CASE WHEN json_extract(NEW.snapshot,'$.entry.wageType')='monthly' AND EXISTS (SELECT 1 FROM payroll_slips s WHERE s.employee_id=NEW.employee_id AND s.period=NEW.period AND json_extract(s.snapshot,'$.entry.wageType')='monthly' AND (json_extract(s.snapshot,'$.entry.rate')<>json_extract(NEW.snapshot,'$.entry.rate') OR json_extract(s.snapshot,'$.entry.installments')<>json_extract(NEW.snapshot,'$.entry.installments'))) THEN RAISE(ABORT,'PAYROLL_MONTHLY_BASIS_CHANGED') END;
    SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM payroll_runs r JOIN payroll_events e ON e.run_id=r.id AND e.revision=r.revision+1 AND e.action='approve' WHERE r.id=NEW.run_id AND r.status='draft' AND NEW.period=r.period
      AND EXISTS (SELECT 1 FROM json_each(r.document,'$.entries') j WHERE json_extract(j.value,'$.employeeId')=NEW.employee_id AND json_extract(j.value,'$.recipientEmail')=NEW.recipient_email AND json_extract(j.value,'$.totals.net')=NEW.net AND json_extract(j.value,'$.totals.gross')=NEW.gross AND json_extract(j.value,'$.totals.deductions')=NEW.deductions)) THEN RAISE(ABORT,'PAYROLL_SLIP_INVALID') END;
    SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM employees WHERE id=NEW.employee_id AND status='active') THEN RAISE(ABORT,'PAYROLL_EMPLOYEE_INACTIVE') END;
  END`,
  `CREATE TRIGGER IF NOT EXISTS payroll_award_owner BEFORE INSERT ON payroll_awards BEGIN
    SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM user_accounts WHERE id=NEW.created_by AND id='user-owner' AND role='admin' AND status='active') THEN RAISE(ABORT,'PAYROLL_FORBIDDEN') END;
    SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM employees WHERE id=NEW.employee_id AND status='active') THEN RAISE(ABORT,'PAYROLL_EMPLOYEE_INACTIVE') END;
    SELECT CASE WHEN (NEW.kind='skill' AND NOT EXISTS (SELECT 1 FROM skill_achievements WHERE id=NEW.source_id AND employee_id=NEW.employee_id AND monthly_allowance=0)) OR (NEW.kind='quest' AND NOT EXISTS (SELECT 1 FROM quest_completions WHERE id=NEW.source_id AND employee_id=NEW.employee_id)) THEN RAISE(ABORT,'PAYROLL_SOURCE_CHANGED') END;
  END`,
  ...["payroll_events", "payroll_slips", "payroll_awards", "payroll_pay_claims"].flatMap((table) => [
    `CREATE TRIGGER IF NOT EXISTS ${table}_immutable_update BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT,'PAYROLL_IMMUTABLE'); END`,
    `CREATE TRIGGER IF NOT EXISTS ${table}_immutable_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT,'PAYROLL_IMMUTABLE'); END`,
  ]),
  `CREATE TRIGGER IF NOT EXISTS payroll_runs_no_delete BEFORE DELETE ON payroll_runs BEGIN SELECT RAISE(ABORT,'PAYROLL_IMMUTABLE'); END`,
];
let initialization: Promise<void> | undefined;
export function ensurePayrollGuards() {
  return initialization ??= (async () => {
    const db = getD1();
    for (const sql of payrollGuardStatements) await db.prepare(sql).run();
  })().catch((error) => { initialization = undefined; throw error; });
}
