import { getD1 } from "../db";
import { decimal, label, type PayrollInput } from "./payroll-calculation";
import { attendanceEntitlement, previousMonth, type AttendanceEvidence } from "./payroll-attendance";

type Award = { id: string; employee_id: string; kind: "skill" | "quest"; source_id: string; label: string; amount: number; start_month: string; end_month: string };
export type BenefitContext = { awards: Award[]; attendance: (AttendanceEvidence & { employee_id: string })[]; profiles: { employee_id: string; start_date: string | null }[]; attendanceClaims: { id: string }[] };
export async function benefitContext(period: string, employeeIds: string[]): Promise<BenefitContext> {
  const db = getD1(), ids = JSON.stringify(employeeIds), source = previousMonth(period);
  const [awards, attendance, profiles, claims] = await Promise.all([
    db.prepare("SELECT a.* FROM payroll_awards a WHERE a.employee_id IN (SELECT value FROM json_each(?)) AND a.start_month<=? AND a.end_month>=? AND NOT EXISTS (SELECT 1 FROM payroll_pay_claims c WHERE c.id=json_array(a.kind,a.id,?)) ORDER BY a.id").bind(ids, period, period, period).all<Award>(),
    db.prepare("SELECT employee_id,work_date,status,minutes_late,clock_in,updated_at FROM attendance_records WHERE employee_id IN (SELECT value FROM json_each(?)) AND work_date>=? AND work_date<? ORDER BY work_date").bind(ids, `${source}-01`, `${period}-01`).all<AttendanceEvidence & { employee_id: string }>(),
    db.prepare("SELECT employee_id,start_date FROM employee_profiles WHERE employee_id IN (SELECT value FROM json_each(?))").bind(ids).all<{ employee_id: string; start_date: string | null }>(),
    db.prepare("SELECT id FROM payroll_pay_claims WHERE kind='attendance' AND employee_id IN (SELECT value FROM json_each(?))").bind(ids).all<{ id: string }>(),
  ]);
  return { awards: awards.results ?? [], attendance: attendance.results ?? [], profiles: profiles.results ?? [], attendanceClaims: claims.results ?? [] };
}
export async function applyMonthlyBenefits(input: PayrollInput, period: string, context?: BenefitContext) {
  input.skillBonus = "0"; input.questBonus = "0"; input.attendanceBonus = "0"; input.awardIds = [];
  input.attendanceReview = "ยังไม่เลือกรับเงินเพิ่มประจำเดือนในวิคนี้";
  if (!input.includeMonthlyExtras) return input;
  const sourceData = context ?? await benefitContext(period, [input.employeeId]);
  const awards = sourceData.awards.filter(a => a.employee_id === input.employeeId);
  let skill = 0, quest = 0;
  for (const award of awards) {
    input.awardIds.push(award.id); if (award.kind === "skill") skill += award.amount; else quest += award.amount;
  }
  input.skillBonus = (skill / 100).toFixed(2); input.questBonus = (quest / 100).toFixed(2);
  const source = previousMonth(period), rows = sourceData.attendance.filter(r => r.employee_id === input.employeeId);
  const profile = sourceData.profiles.find(p => p.employee_id === input.employeeId);
  const claimed = sourceData.attendanceClaims.some(c => c.id === JSON.stringify(["attendance", input.employeeId, source]));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const review = attendanceEntitlement(period, input.restDays, profile?.start_date ?? null, rows, today);
  input.attendanceBonus = claimed ? "0" : (review.amount / 100).toFixed(2);
  input.attendanceReview = JSON.stringify({ ...review, message: claimed ? "เบี้ยขยันเดือนอ้างอิงนี้ออกสลิปไปแล้ว" : review.message, amount: claimed ? 0 : review.amount });
  return input;
}
export async function listAwards() {
  return (await getD1().prepare("SELECT a.*,e.name employee_name FROM payroll_awards a JOIN employees e ON e.id=a.employee_id ORDER BY a.created_at DESC LIMIT 300").all()).results;
}
export async function awardSources() {
  const db = getD1();
  const [skills, quests] = await Promise.all([
    db.prepare("SELECT s.id,s.employee_id,s.skill_name label FROM skill_achievements s JOIN employees e ON e.id=s.employee_id WHERE e.status='active' AND s.monthly_allowance=0 ORDER BY s.verified_at DESC LIMIT 500").all(),
    db.prepare("SELECT q.id,q.employee_id,q.quest_title_snapshot label FROM quest_completions q JOIN employees e ON e.id=q.employee_id WHERE e.status='active' ORDER BY q.completed_at DESC LIMIT 500").all(),
  ]);
  return { skills: skills.results, quests: quests.results };
}
export async function createAward(p: Record<string, unknown>, actorId: string) {
  const db = getD1(), employeeId = label(p.employeeId, "พนักงาน", 120, true), sourceId = label(p.sourceId, "สกิล/เควสที่ยืนยันแล้ว", 120, true);
  const kind = p.kind; if (kind !== "skill" && kind !== "quest") throw new Error("เลือกเงินเพิ่มสกิลหรือโบนัสเควส");
  const amount = decimal(p.amount, "เงินเพิ่ม"); if (!amount) throw new Error("เงินเพิ่มต้องมากกว่าศูนย์");
  const startMonth = label(p.startMonth, "เดือนเริ่ม", 7, true), endMonth = label(p.endMonth, "เดือนสิ้นสุด", 7, true);
  if (![startMonth, endMonth].every(v => /^20\d{2}-(0[1-9]|1[0-2])$/.test(v)) || startMonth > endMonth || (kind === "quest" && startMonth !== endMonth)) throw new Error("ช่วงเดือนเงินเพิ่มไม่ถูกต้อง โบนัสเควสจ่ายได้เดือนเดียว");
  const months = (+endMonth.slice(0, 4) - +startMonth.slice(0, 4)) * 12 + +endMonth.slice(5) - +startMonth.slice(5) + 1;
  if (months > 36) throw new Error("กำหนดเงินเพิ่มได้ไม่เกิน 36 เดือนต่อรายการ");
  const source = kind === "skill" ? await db.prepare("SELECT skill_name label FROM skill_achievements WHERE id=? AND employee_id=? AND monthly_allowance=0").bind(sourceId, employeeId).first<{ label: string }>() : await db.prepare("SELECT quest_title_snapshot label FROM quest_completions WHERE id=? AND employee_id=?").bind(sourceId, employeeId).first<{ label: string }>();
  if (!source) throw new Error("ต้องเลือกสกิลที่ยืนยันแล้วหรือเควสที่สำเร็จจริงของพนักงานคนนี้");
  await db.prepare("INSERT INTO payroll_awards(id,employee_id,kind,source_id,label,amount,start_month,end_month,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), employeeId, kind, sourceId, source.label, amount, startMonth, endMonth, actorId, new Date().toISOString()).run();
}
