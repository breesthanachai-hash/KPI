import { getD1 } from "../db";
import { ensurePayrollGuards } from "../db/payroll-guards";
import { type CurrentUser } from "./access-control";
import { canManageSystemSettings, getSystemSettingsRow } from "./system-settings";
import { calculate, label, normalizeInput, PAYROLL_CALCULATION_VERSION, sumTotals, validateDate, type PayrollDocument, type PayrollEntry } from "./payroll-calculation";
import { applyMonthlyBenefits, benefitContext, type BenefitContext } from "./payroll-benefits";
import { previousMonth } from "./payroll-attendance";

export type PayrollRunRow = { id: string; period: string; status: "draft" | "approved" | "paid" | "void"; revision: number; document: string; approved_by: string | null; approved_at: string | null; payment_reference: string | null; created_by: string; created_at: string; updated_at: string };
export type SlipSnapshot = Omit<PayrollDocument, "entries" | "policyNote"> & { entry: PayrollEntry; runId: string; slipId: string; approvedBy: string; approvedAt: string };
export class PayrollError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function payrollAdmin(user: CurrentUser) { return user.status === "active" && user.role === "admin"; }
export function payrollSelf(user: CurrentUser) { return user.status === "active" && user.role === "employee" && !!user.employeeId; }
export async function readyPayroll() { await ensurePayrollGuards(); }
export async function getRun(id: string) { return getD1().prepare("SELECT * FROM payroll_runs WHERE id=?").bind(id).first<PayrollRunRow>(); }
export function runDto(run: PayrollRunRow) { return { ...run, document: JSON.parse(run.document) as PayrollDocument }; }
export async function payrollEmployees() {
  return (await getD1().prepare("SELECT e.id,e.name,e.email,e.position_title,COALESCE(h.current_salary,0) salary FROM employees e LEFT JOIN hr_profiles h ON h.employee_id=e.id WHERE e.status='active' ORDER BY e.name").all<{ id: string; name: string; email: string; position_title: string; salary: number }>()).results;
}
async function normalizeDocument(payload: Record<string, unknown>): Promise<PayrollDocument> {
  const startDate = validateDate(payload.startDate), endDate = validateDate(payload.endDate), payDate = validateDate(payload.payDate);
  if (startDate > endDate || (Date.parse(endDate) - Date.parse(startDate)) / 86400000 > 31) throw new PayrollError("ช่วงคำนวณต้องไม่เกิน 32 วัน และวันสิ้นสุดต้องไม่ก่อนวันเริ่ม");
  const period = label(payload.period, "รอบเดือน", 7, true);
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(period)) throw new PayrollError("รอบเดือนใช้ YYYY-MM");
  if (!Array.isArray(payload.entries) || !payload.entries.length || payload.entries.length > 80) throw new PayrollError("เลือกระหว่าง 1–80 คนต่อรอบจ่าย");
  const employees = new Map((await payrollEmployees() ?? []).map(e => [e.id, e]));
  const seen = new Set<string>();
  const entries: PayrollEntry[] = [];
  const inputs = payload.entries.map(normalizeInput);
  const benefits = await benefitContext(period, inputs.filter(i => i.includeMonthlyExtras).map(i => i.employeeId));
  for (const value of inputs) {
    const input = await applyMonthlyBenefits(value, period, benefits), employee = employees.get(input.employeeId);
    if (!employee || seen.has(input.employeeId)) throw new PayrollError("พนักงานซ้ำหรือพ้นสภาพแล้ว กรุณาตรวจสอบรายชื่อ");
    seen.add(input.employeeId);
    entries.push({ ...input, employeeName: employee.name, positionTitle: employee.position_title, totals: calculate(input) });
  }
  const settings = await getSystemSettingsRow();
  return { label: label(payload.label, "ชื่อรอบจ่าย", 120, true), period, startDate, endDate, payDate, policyNote: label(payload.policyNote, "กติกาและการตรวจสอบ", 2000, true), organization: settings.organizationName, calculationVersion: PAYROLL_CALCULATION_VERSION, entries, totals: sumTotals(entries) };
}
export async function mutatePayroll(user: CurrentUser, p: Record<string, unknown>) {
  if (!payrollAdmin(user)) throw new PayrollError("เฉพาะ HR/Admin จัดเตรียมเงินเดือน", 403);
  const db = getD1(), now = new Date().toISOString();
  const action = String(p.action);
  if (action === "create") {
    const document = await normalizeDocument(p), id = crypto.randomUUID(), serialized = JSON.stringify(document);
    await db.batch([
      db.prepare("INSERT INTO payroll_runs(id,period,status,revision,document,created_by,created_at,updated_at) VALUES (?,?,'draft',0,?,?,?,?)").bind(id, document.period, serialized, user.id, now, now),
      db.prepare("INSERT INTO payroll_events(id,run_id,revision,action,actor_id,actor_name,document,created_at) VALUES (?,?,0,'create',?,?,?,?)").bind(crypto.randomUUID(), id, user.id, user.displayName, serialized, now),
    ]);
    return { id };
  }
  if (!["save", "approve", "paid", "void"].includes(action)) throw new PayrollError("คำสั่งไม่ถูกต้อง");
  if (action !== "save" && !canManageSystemSettings(user)) throw new PayrollError("เฉพาะเจ้าของระบบอนุมัติหรือยืนยันการจ่าย", 403);
  const id = label(p.id, "รอบจ่าย", 120, true), run = await getRun(id);
  if (!run) throw new PayrollError("ไม่พบรอบจ่าย", 404);
  if (!Number.isSafeInteger(p.expectedRevision) || p.expectedRevision !== run.revision) throw new PayrollError("มีการแก้ไขจากอีกหน้าจอ โหลดข้อมูลล่าสุดก่อนทำรายการ", 409);
  if ((action === "paid" && run.status !== "approved") || (action !== "paid" && run.status !== "draft")) throw new PayrollError("สถานะเปลี่ยนไปแล้ว รายการอนุมัติไม่สามารถแก้ยอดย้อนหลัง", 409);
  const document: PayrollDocument = action === "save" ? await normalizeDocument(p) : JSON.parse(run.document);
  if (document.period !== run.period) throw new PayrollError("เปลี่ยนเดือนไม่ได้ ให้ยกเลิกร่างและสร้างรอบใหม่");
  const serialized = JSON.stringify(document), revision = run.revision + 1;
  const reason = action === "paid" || action === "void" ? label(p.reason, "เหตุผล/เลขอ้างอิงการจ่าย", 500, true) : action === "approve" && p.overlapConfirmed === true ? "additional-run-confirmed" : "";
  let benefits: BenefitContext | undefined;
  if (action === "approve") {
    if (p.confirmed !== true) throw new PayrollError("ต้องยืนยันว่าตรวจค่าแรง ภาษี รายการหัก อีเมล และค่าคอมมิชชันครบแล้ว");
    if (document.calculationVersion !== PAYROLL_CALCULATION_VERSION || !document.entries.length) throw new PayrollError("กรุณาคำนวณร่างด้วยเวอร์ชันล่าสุดอีกครั้ง", 409);
    benefits = await benefitContext(document.period, document.entries.filter(i => i.includeMonthlyExtras).map(i => i.employeeId));
    for (const e of document.entries) {
      const checked = await applyMonthlyBenefits(normalizeInput(e), document.period, benefits);
      if (JSON.stringify(calculate(checked)) !== JSON.stringify(e.totals) || JSON.stringify(checked.awardIds) !== JSON.stringify(e.awardIds) || checked.attendanceReview !== e.attendanceReview) throw new PayrollError("ยอดหรือหลักฐานเงินเพิ่มเปลี่ยนไป กรุณาบันทึกร่างคำนวณใหม่ก่อนอนุมัติ", 409);
    }
    if (JSON.stringify(sumTotals(document.entries)) !== JSON.stringify(document.totals)) throw new PayrollError("ยอดรวมไม่ตรง", 409);
    // An overlapping period is visible during review; require explicit acknowledgement.
    const overlap = await db.prepare("SELECT 1 FROM payroll_slips s JOIN payroll_runs r ON r.id=s.run_id WHERE s.period=? AND s.employee_id IN (SELECT json_extract(value,'$.employeeId') FROM json_each(?,'$.entries')) LIMIT 1").bind(document.period, serialized).first();
    if (overlap && p.overlapConfirmed !== true) throw new PayrollError("มีพนักงานได้รับสลิปเดือนนี้แล้ว ตรวจว่าเป็นรอบเพิ่มเติมจริง แล้วติ๊กยืนยันรอบเพิ่มเติม", 409);
  }
  const statements = [db.prepare("INSERT INTO payroll_events(id,run_id,revision,action,actor_id,actor_name,document,reason,created_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), id, revision, action, user.id, user.displayName, serialized, reason, now)];
  if (action === "approve") {
    for (const entry of document.entries) {
      const slipId = crypto.randomUUID();
      const { entries: _entries, policyNote: _policyNote, ...header } = document; void _entries; void _policyNote;
      const snapshot: SlipSnapshot = { ...header, totals: entry.totals, entry, runId: id, slipId, approvedBy: user.displayName, approvedAt: now };
      statements.push(db.prepare("INSERT INTO payroll_slips(id,run_id,employee_id,period,snapshot,recipient_email,gross,deductions,net,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(slipId, id, entry.employeeId, document.period, JSON.stringify(snapshot), entry.recipientEmail, entry.totals.gross, entry.totals.deductions, entry.totals.net, now));
      const claims: { id: string; kind: string; source: string; amount: number }[] = [];
      const claim = (key: string[], amount: number) => claims.push({ id: JSON.stringify(key), kind: key[0], source: key.slice(1).join(" / "), amount });
      if (entry.wageType === "monthly" && entry.totals.base > 0) claim(["salary", entry.employeeId, document.period, entry.installment], entry.totals.base);
      if (entry.totals.commission > 0) claim(["commission", entry.employeeId, entry.commissionReference], entry.totals.commission);
      if (entry.totals.attendanceBonus > 0) claim(["attendance", entry.employeeId, previousMonth(document.period)], entry.totals.attendanceBonus);
      for (const awardId of entry.awardIds) {
        const award = benefits?.awards.find(a => a.id === awardId && a.employee_id === entry.employeeId);
        if (!award) throw new PayrollError("เงินเพิ่มเปลี่ยนไป กรุณาคำนวณร่างใหม่", 409);
        claim([award.kind, awardId, document.period], award.amount);
      }
      if (claims.length) statements.push(db.prepare("INSERT INTO payroll_pay_claims(id,slip_id,employee_id,kind,source,amount) SELECT json_extract(value,'$.id'),?,?,json_extract(value,'$.kind'),json_extract(value,'$.source'),json_extract(value,'$.amount') FROM json_each(?)").bind(slipId, entry.employeeId, JSON.stringify(claims)));
      statements.push(db.prepare("INSERT INTO payroll_deliveries(slip_id,status,attempts,updated_at) VALUES (?,'pending',0,?)").bind(slipId, now));
    }
  }
  statements.push(db.prepare("UPDATE payroll_runs SET status=?,revision=?,document=?,approved_by=?,approved_at=?,payment_reference=?,updated_at=? WHERE id=? AND revision=?").bind(action === "approve" ? "approved" : action === "paid" ? "paid" : action === "void" ? "void" : "draft", revision, serialized, action === "approve" ? user.displayName : run.approved_by, action === "approve" ? now : run.approved_at, action === "paid" ? reason : run.payment_reference, now, id, run.revision));
  await db.batch(statements);
  return { id };
}
