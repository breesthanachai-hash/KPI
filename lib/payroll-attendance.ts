export type AttendanceEvidence = { work_date: string; status: string; minutes_late: number; clock_in: string | null; updated_at: string };
export function previousMonth(period: string): string {
  const [year, month] = period.split("-").map(Number);
  return `${month === 1 ? year - 1 : year}-${String(month === 1 ? 12 : month - 1).padStart(2, "0")}`;
}
export function attendanceEntitlement(period: string, restDays: string, startDate: string | null, rows: AttendanceEvidence[], today: string) {
  const sourceMonth = previousMonth(period), firstDate = `${sourceMonth}-01`;
  const [year, month] = sourceMonth.split("-").map(Number), dayCount = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const endDate = `${sourceMonth}-${dayCount}`;
  const result = (status: string, amount: number, message: string) => ({ status, amount, message, sourceMonth, startDate, restDates: restDays.split(",").map(d => d.trim()).filter(Boolean), evidence: rows });
  if (today <= endDate) return result("incomplete", 0, "เดือนอ้างอิงยังไม่สิ้นสุด จึงยังประเมินเบี้ยขยันไม่ได้");
  if (!startDate || !/^(19|20)\d{2}-\d{2}-\d{2}$/.test(startDate) || !Number.isFinite(Date.parse(startDate)) || new Date(startDate).toISOString().slice(0,10) !== startDate || startDate > firstDate) return result("incomplete", 0, "ต้องระบุวันเริ่มงานที่ถูกต้อง และทำงานครบเดือนอ้างอิงก่อนรับเบี้ยขยัน");
  const rest = new Set(restDays.split(",").map(d => d.trim()).filter(Boolean));
  if (rest.size !== 4 || [...rest].some(d => !d.startsWith(`${sourceMonth}-`) || !/^\d{4}-\d{2}-\d{2}$/.test(d) || Number(d.slice(8)) < 1 || Number(d.slice(8)) > dayCount)) return result("incomplete", 0, `ระบุวันหยุดจริง 4 วันของ ${sourceMonth} ก่อนตรวจเบี้ยขยัน`);
  if (rows.some(r => r.status !== "present" || r.minutes_late > 0)) return result("ineligible", 0, "เดือนก่อนมีขาด/ลา/สาย จึงไม่ได้เบี้ยขยันรอบนี้ เริ่มตรวจใหม่เดือนถัดไป");
  const byDate = new Map(rows.map(row => [row.work_date, row]));
  for (let day = 1; day <= dayCount; day++) {
    const date = `${sourceMonth}-${String(day).padStart(2, "0")}`, row = byDate.get(date);
    if (!rest.has(date) && (!row || !row.clock_in || !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.clock_in) || row.status !== "present" || row.minutes_late !== 0)) return result("incomplete", 0, `ข้อมูลลงเวลายังไม่ครบ เช่น ${date} จึงยังไม่ให้เบี้ยขยันอัตโนมัติ`);
  }
  return result("eligible", 30000, `ผ่านครบเดือน ${sourceMonth} — เสนอเบี้ยขยัน 300 บาท จ่ายได้ครั้งเดียวในเดือน ${period}`);
}
