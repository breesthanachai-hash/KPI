/** Payroll v1: THB in integer satang, decimal inputs, round half up per component.
 * No statutory/company deductions are inferred. Monthly rate already includes skill raises.
 */
export const PAYROLL_CALCULATION_VERSION = "thb-satang-v1";
export const MAX_MONEY = 100_000_000_00; // 100 million THB per component/run
export type WageType = "monthly" | "daily" | "hourly";
export type PayrollInput = {
  employeeId: string; recipientEmail: string; wageType: WageType;
  rate: string; units: string; installments: string; installment: string; otHours: string; otRate: string;
  commissionBase: string; commissionPercent: string; commissionFixed: string; commissionReference: string;
  allowance: string; bonus: string; tax: string; socialSecurity: string; otherDeduction: string;
  deductionNote: string; note: string; includeMonthlyExtras: boolean; restDays: string;
  skillBonus: string; questBonus: string; attendanceBonus: string; attendanceReview: string; awardIds: string[];
};
export type PayrollTotals = { base: number; overtime: number; commission: number; allowance: number; bonus: number; skillBonus: number; questBonus: number; attendanceBonus: number; gross: number; tax: number; socialSecurity: number; otherDeduction: number; deductions: number; net: number };
export type PayrollEntry = PayrollInput & { employeeName: string; positionTitle: string; totals: PayrollTotals };
export type PayrollDocument = { label: string; period: string; startDate: string; endDate: string; payDate: string; policyNote: string; organization: string; calculationVersion: string; entries: PayrollEntry[]; totals: PayrollTotals };

export function decimal(value: unknown, label = "จำนวนเงิน", max = MAX_MONEY): number {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(value)) throw new Error(`${label}: ใช้ตัวเลขไม่ติดลบและทศนิยมไม่เกิน 2 ตำแหน่ง`);
  const [whole, fraction = ""] = value.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(result) || result > max) throw new Error(`${label}: เกินวงเงินที่รองรับ`);
  return result;
}
export function roundRatio(amount: number, multiplier: number, divisor: number): number {
  for (const value of [amount, multiplier, divisor]) if (!Number.isSafeInteger(value) || value < 0) throw new Error("ตัวเลขคำนวณไม่ถูกต้อง");
  if (divisor === 0) throw new Error("ตัวหารต้องไม่เป็นศูนย์");
  const result = Number((BigInt(amount) * BigInt(multiplier) + BigInt(divisor) / BigInt(2)) / BigInt(divisor));
  if (!Number.isSafeInteger(result) || result > MAX_MONEY) throw new Error("ยอดคำนวณเกินวงเงินที่รองรับ");
  return result;
}
export function validEmail(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value) && !/\.internal$/i.test(value);
}
export function label(value: unknown, name: string, max = 500, required = false): string {
  if (typeof value !== "string" || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value) || value.length > max || (required && !value.trim())) throw new Error(`${name}: กรุณากรอกให้ครบและไม่เกิน ${max} ตัวอักษร`);
  return value.trim();
}
export function validateDate(value: unknown): string {
  if (typeof value !== "string" || !/^20\d{2}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error("วันที่ไม่ถูกต้อง (ปี ค.ศ. 2000–2099)");
  return value;
}
export function normalizeInput(value: unknown): PayrollInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("ข้อมูลค่าแรงไม่ครบ");
  const p = value as Record<string, unknown>;
  if (!["monthly", "daily", "hourly"].includes(p.wageType as string)) throw new Error("เลือกรูปแบบค่าแรง");
  const result: PayrollInput = { ...emptyPayrollInput("", ""), employeeId: label(p.employeeId, "พนักงาน", 120, true), recipientEmail: label(p.recipientEmail, "อีเมล", 254, true), wageType: p.wageType as WageType,
    commissionReference: label(p.commissionReference, "หลักฐานค่าคอมมิชชัน", 200), deductionNote: label(p.deductionNote, "รายละเอียดการหัก", 500), note: label(p.note, "หมายเหตุ", 1000),
    installments: label(p.installments, "จำนวนวิค", 1, true), installment: label(p.installment, "วิคที่", 1, true), includeMonthlyExtras: p.includeMonthlyExtras === true, restDays: label(p.restDays, "วันหยุดเดือนก่อน", 100),
    skillBonus: "0", questBonus: "0", attendanceBonus: "0", attendanceReview: "ยังไม่ตรวจ", awardIds: [] };
  if (!validEmail(result.recipientEmail)) throw new Error("กรุณาระบุอีเมลจริงของพนักงานสำหรับสลิป");
  const fields = ["rate", "units", "otHours", "otRate", "commissionBase", "commissionPercent", "commissionFixed", "allowance", "bonus", "tax", "socialSecurity", "otherDeduction"] as const;
  for (const field of fields) { result[field] = (decimal(p[field], field) / 100).toFixed(2); }
  return result;
}
export function calculate(p: PayrollInput): PayrollTotals {
  const units = decimal(p.units, "จำนวนหน่วย", p.wageType === "monthly" ? 100 : p.wageType === "daily" ? 3100 : 74400);
  let base = roundRatio(decimal(p.rate), units, 100);
  if (p.wageType === "monthly") {
    if (units !== 100) throw new Error("รายเดือนใช้ฐานเต็มเดือนและแบ่งด้วยจำนวนวิค หน่วยต้องเป็น 1");
    if (!/^[1-5]$/.test(p.installments) || !/^[1-5]$/.test(p.installment) || +p.installment > +p.installments) throw new Error("เลือกจำนวนวิค 1–5 และวิคที่ให้ถูกต้อง");
    const salary = decimal(p.rate), installment = Math.floor(salary / +p.installments);
    base = +p.installment === +p.installments ? salary - installment * (+p.installments - 1) : installment;
  }
  const overtime = roundRatio(decimal(p.otRate), decimal(p.otHours, "ชั่วโมง OT", 74400), 100);
  const commission = roundRatio(decimal(p.commissionBase), decimal(p.commissionPercent, "% คอมมิชชัน", 10000), 10000) + decimal(p.commissionFixed);
  if (commission > 0 && !p.commissionReference.trim()) throw new Error("ค่าคอมมิชชันต้องระบุยอดอ้างอิงหรือเลขเอกสารที่ตรวจสอบแล้ว");
  const allowance = decimal(p.allowance), bonus = decimal(p.bonus), tax = decimal(p.tax), socialSecurity = decimal(p.socialSecurity), otherDeduction = decimal(p.otherDeduction);
  if (otherDeduction > 0 && !p.deductionNote.trim()) throw new Error("กรุณาระบุเหตุผลและความยินยอม/หลักฐานของรายการหักอื่น");
  const skillBonus = decimal(p.skillBonus), questBonus = decimal(p.questBonus), attendanceBonus = decimal(p.attendanceBonus);
  const gross = base + overtime + commission + allowance + bonus + skillBonus + questBonus + attendanceBonus;
  const deductions = tax + socialSecurity + otherDeduction;
  if (deductions > gross) throw new Error("ยอดหักเกินรายรับ กรุณาตรวจสอบ ไม่สามารถอนุมัติยอดสุทธิติดลบได้");
  if (gross > MAX_MONEY || deductions > MAX_MONEY) throw new Error("ยอดรวมเกินวงเงินที่รองรับ");
  return { base, overtime, commission, allowance, bonus, skillBonus, questBonus, attendanceBonus, gross, tax, socialSecurity, otherDeduction, deductions, net: gross - deductions };
}
export function sumTotals(entries: { totals: PayrollTotals }[]): PayrollTotals {
  const total: PayrollTotals = { base: 0, overtime: 0, commission: 0, allowance: 0, bonus: 0, skillBonus: 0, questBonus: 0, attendanceBonus: 0, gross: 0, tax: 0, socialSecurity: 0, otherDeduction: 0, deductions: 0, net: 0 };
  for (const entry of entries) for (const key of Object.keys(total) as (keyof PayrollTotals)[]) {
    total[key] += entry.totals[key];
    if (!Number.isSafeInteger(total[key]) || total[key] > MAX_MONEY) throw new Error("ยอดรวมรอบจ่ายเกินวงเงินที่รองรับ");
  }
  return total;
}
export const money = (satang: number) => (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function emptyPayrollInput(employeeId: string, email: string, salary = "0"): PayrollInput {
  return { employeeId, recipientEmail: email, wageType: "monthly", rate: salary, units: "1", installments: "1", installment: "1", otHours: "0", otRate: "0", commissionBase: "0", commissionPercent: "0", commissionFixed: "0", commissionReference: "", allowance: "0", bonus: "0", tax: "0", socialSecurity: "0", otherDeduction: "0", deductionNote: "", note: "", includeMonthlyExtras: false, restDays: "", skillBonus: "0", questBonus: "0", attendanceBonus: "0", attendanceReview: "ยังไม่ตรวจ", awardIds: [] };
}
