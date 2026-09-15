import { getD1 } from "../../../db";
import { authenticatedRequestGate, privateNoStoreHeaders } from "../../../lib/access-control";
import { canManageSystemSettings } from "../../../lib/system-settings";
import { mailStatus, sendPayslip, escapeHtml } from "../../../lib/payroll-mail";
import { money } from "../../../lib/payroll-calculation";
import { awardSources, createAward, listAwards } from "../../../lib/payroll-benefits";
import { getRun, mutatePayroll, payrollAdmin, payrollEmployees, payrollSelf, PayrollError, readyPayroll, runDto, type SlipSnapshot } from "../../../lib/payroll-service";

export const dynamic = "force-dynamic";
function json(data: unknown, status = 200) { return Response.json(data, { status, headers: privateNoStoreHeaders }); }
async function readBody(request: Request) {
  if (Number(request.headers.get("content-length")) > 250000) throw new PayrollError("ข้อมูลเกินขนาดที่รองรับ", 413);
  const reader = request.body?.getReader(); if (!reader) throw new PayrollError("ไม่มีข้อมูลคำขอ");
  const decoder = new TextDecoder(); let size = 0, text = "";
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 250000) { await reader.cancel(); throw new PayrollError("ข้อมูลเกินขนาดที่รองรับ", 413); } text += decoder.decode(value, { stream: true }); } return text + decoder.decode(); }
  finally { reader.releaseLock(); }
}
function failure(error: unknown) {
  if (error instanceof PayrollError) return json({ error: error.message }, error.status);
  const message = error instanceof Error ? error.message : "";
  if (/PAYROLL_STALE|payroll_events.run_id|PAYROLL_AUDIT_REQUIRED/.test(message)) return json({ error: "รายการถูกแก้ไขจากอีกหน้าจอ กรุณาโหลดข้อมูลล่าสุด" }, 409);
  if (/payroll_pay_claims|PAYROLL_OVERLAP/.test(message)) return json({ error: "มีค่าแรงวิค/ค่าคอมมิชชัน/เงินเพิ่มรายการนี้อยู่แล้ว หรือช่วงจ่ายซ้อนกัน กรุณาโหลดข้อมูลและตรวจการจ่ายซ้ำ" }, 409);
  if (/payroll_awards.kind/.test(message)) return json({ error: "สกิลหรือเควสนี้กำหนดเงินเพิ่มไว้แล้ว ไม่สามารถให้ซ้ำได้" }, 409);
  if (/PAYROLL_MONTHLY_BASIS_CHANGED/.test(message)) return json({ error: "เงินเดือนเต็มเดือนหรือจำนวนวิคไม่ตรงกับวิคที่อนุมัติแล้ว ต้องใช้ฐานเดียวกันตลอดเดือน" }, 409);
  if (/PAYROLL_ATTENDANCE_CHANGED/.test(message)) return json({ error: "ข้อมูลลงเวลาหรือวันเริ่มงานเปลี่ยนระหว่างอนุมัติ กรุณาคำนวณร่างใหม่" }, 409);
  if (/PAYROLL_SOURCE_CHANGED/.test(message)) return json({ error: "ข้อมูลสกิลหรือเควสเปลี่ยนไป กรุณาโหลดรายการล่าสุด" }, 409);
  if (/PAYROLL_FORBIDDEN/.test(message)) return json({ error: "สิทธิ์เปลี่ยนไปแล้ว กรุณาเข้าสู่ระบบใหม่" }, 403);
  if (/PAYROLL_EMPLOYEE_INACTIVE|FOREIGN KEY/.test(message)) return json({ error: "สถานะพนักงานเปลี่ยนไปแล้ว กรุณาตรวจรายชื่อก่อนอนุมัติ" }, 409);
  if (/no such table/.test(message)) return json({ error: "ฐานข้อมูลเงินเดือนยังไม่พร้อม ต้องเผยแพร่ migration ล่าสุดก่อน" }, 503);
  // Do not log SQL bindings/documents (salary and email are confidential).
  const requestId = crypto.randomUUID();
  console.error(`[payroll] requestId=${requestId} failure`);
  return json({ error: `ทำรายการเงินเดือนไม่สำเร็จ ติดต่อผู้ดูแลพร้อมรหัส ${requestId}` }, 500);
}
async function gate(request: Request) {
  const auth = await authenticatedRequestGate(request);
  if (auth.response) return auth;
  if (!payrollAdmin(auth.currentUser) && !payrollSelf(auth.currentUser)) return { response: json({ error: "สิทธิ์นี้ไม่สามารถเข้าถึงเงินเดือน" }, 403) };
  if (new URL(request.url).searchParams.has("previewEmployeeId")) return { response: json({ error: "ไม่แสดงเงินเดือนในโหมดจำลองพนักงาน" }, 403) };
  await readyPayroll();
  return auth;
}
export async function GET(request: Request) {
  try {
    const auth = await gate(request); if (auth.response) return auth.response;
    const user = auth.currentUser, admin = payrollAdmin(user), url = new URL(request.url), db = getD1();
    const slipId = url.searchParams.get("slip");
    if (slipId) {
      const row = await db.prepare("SELECT s.snapshot FROM payroll_slips s JOIN payroll_runs r ON r.id=s.run_id WHERE s.id=? AND r.status IN ('approved','paid') AND (?=1 OR s.employee_id=?)").bind(slipId, admin ? 1 : 0, user.employeeId ?? "").first<{ snapshot: string }>();
      if (!row) return json({ error: "ไม่พบสลิปหรือไม่มีสิทธิ์เข้าถึง" }, 404);
      const slip: SlipSnapshot = JSON.parse(row.snapshot);
      if (url.searchParams.get("print") === "1") return printableSlip(slip);
      return json({ slip });
    }
    const runId = url.searchParams.get("run");
    if (runId) {
      if (!admin) return json({ error: "เฉพาะ HR/Admin" }, 403);
      const run = await getRun(runId); if (!run) return json({ error: "ไม่พบรอบจ่าย" }, 404);
      const [slips, events] = await Promise.all([
        db.prepare("SELECT s.id,s.employee_id,s.recipient_email,s.net,json_extract(s.snapshot,'$.entry.employeeName') employee_name,CASE WHEN d.status='sending' AND d.lease_until<? THEN CASE WHEN d.send_started_at IS NOT NULL THEN 'review' ELSE 'failed' END ELSE d.status END delivery_status,d.attempts,d.last_error,d.provider_id FROM payroll_slips s LEFT JOIN payroll_deliveries d ON d.slip_id=s.id WHERE s.run_id=? ORDER BY employee_name").bind(new Date().toISOString(), runId).all(),
        db.prepare("SELECT revision,action,actor_name,reason,created_at FROM payroll_events WHERE run_id=? ORDER BY revision DESC LIMIT 100").bind(runId).all(),
      ]);
      return json({ run: runDto(run), slips: slips.results, events: events.results });
    }
    if (!admin) {
      const slips = await db.prepare("SELECT s.id,s.period,s.net,s.created_at,json_extract(s.snapshot,'$.label') label,r.status FROM payroll_slips s JOIN payroll_runs r ON r.id=s.run_id WHERE s.employee_id=? AND r.status IN ('approved','paid') ORDER BY s.period DESC,s.created_at DESC LIMIT 120").bind(user.employeeId).all();
      return json({ mode: "employee", slips: slips.results });
    }
    const [runs, employees] = await Promise.all([
      db.prepare("SELECT id,period,status,revision,json_extract(document,'$.label') label,json_extract(document,'$.totals.net') net,json_array_length(document,'$.entries') employee_count,updated_at FROM payroll_runs ORDER BY created_at DESC LIMIT 120").all(), payrollEmployees(),
    ]);
    return json({ mode: "admin", owner: canManageSystemSettings(user), runs: runs.results, employees, awards: await listAwards(), sources: canManageSystemSettings(user) ? await awardSources() : undefined, mail: canManageSystemSettings(user) ? mailStatus() : { ready: mailStatus().ready } });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const auth = await gate(request); if (auth.response) return auth.response;
    if (!payrollAdmin(auth.currentUser)) return json({ error: "พนักงานดูได้เฉพาะสลิปของตัวเอง" }, 403);
    const raw = await readBody(request);
    let payload: Record<string, unknown>;
    try { payload = JSON.parse(raw); if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error(); } catch { return json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, 400); }
    if (payload.action === "createAward") {
      if (!canManageSystemSettings(auth.currentUser)) return json({ error: "เฉพาะเจ้าของระบบกำหนดเงินเพิ่ม" }, 403);
      try { await createAward(payload, auth.currentUser.id); return json({ ok: true }); }
      catch (error) { if (error instanceof Error && !/D1_|SQLITE_|constraint|database/i.test(error.message)) return json({ error: error.message }, 400); throw error; }
    }
    if (payload.action === "send") {
      if (!canManageSystemSettings(auth.currentUser)) return json({ error: "เฉพาะเจ้าของระบบส่งอีเมลสลิป" }, 403);
      if (typeof payload.slipId !== "string" || payload.slipId.length > 120) return json({ error: "ไม่พบรหัสสลิป" }, 400);
      return json(await sendPayslip(payload.slipId));
    }
    try { return json(await mutatePayroll(auth.currentUser, payload)); }
    catch (error) { if (error instanceof Error && !/D1_|SQLITE_|PAYROLL_|constraint|database|no such table/i.test(error.message) && !(error instanceof PayrollError)) return json({ error: error.message }, 400); throw error; }
  } catch (error) { return failure(error); }
}
function printableSlip(slip: SlipSnapshot) {
  const e = escapeHtml, t = slip.entry.totals;
  const rows: [string, number][] = [["ค่าแรงพื้นฐาน", t.base], ["ค่าล่วงเวลา", t.overtime], ["ค่าคอมมิชชันจากยอดขาย", t.commission], ["เงินเพิ่มสกิลตามช่วงเวลา", t.skillBonus], ["โบนัสเควส", t.questBonus], ["เบี้ยขยันเดือนก่อน", t.attendanceBonus], ["เงินเพิ่มอื่น", t.allowance], ["โบนัสอื่น", t.bonus], ["รายรับรวม", t.gross], ["ภาษี", -t.tax], ["ประกันสังคม", -t.socialSecurity], ["รายการหักอื่น", -t.otherDeduction]];
  const html = `<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>สลิป ${e(slip.period)} · ${e(slip.entry.employeeName)}</title><style>body{font:16px/1.6 system-ui,sans-serif;color:#172b46;background:#f1f5f9;margin:0;padding:24px}main{max-width:760px;margin:auto;background:white;padding:40px;border:1px solid #cbd5e1}h1{margin:0;color:#1e40af}small{font-size:12px}table{width:100%;border-collapse:collapse}td{padding:10px 0;border-bottom:1px solid #e2e8f0}td:last-child{text-align:right;font-variant-numeric:tabular-nums}.total{display:flex;justify-content:space-between;background:#eff6ff;padding:20px;margin-top:20px;font-size:24px;font-weight:700}.help{text-align:center;margin-bottom:20px}p{overflow-wrap:anywhere}@media print{body{padding:0;background:#fff}main{border:0;padding:20px}.help{display:none}@page{size:A4;margin:15mm}}</style><div class="help">กด Ctrl+P / ⌘P เพื่อพิมพ์หรือบันทึกเป็น PDF · เก็บเอกสารนี้เป็นความลับ</div><main><small>PAYSLIP · ${e(slip.organization)}</small><h1>สลิปค่าตอบแทน</h1><p>${e(slip.label)} · ${e(slip.period)}<br>ช่วงคำนวณ ${e(slip.startDate)} – ${e(slip.endDate)} · กำหนดจ่าย ${e(slip.payDate)}</p><h2>${e(slip.entry.employeeName)}</h2><p>รหัสพนักงาน ${e(slip.entry.employeeId)} · ${e(slip.entry.positionTitle || "ไม่ระบุตำแหน่ง")}</p><table><thead><tr><th style="text-align:left">รายการ</th><th style="text-align:right">บาท</th></tr></thead><tbody>${rows.map(([name, amount]) => `<tr><td>${e(name)}</td><td>${money(amount)}</td></tr>`).join("")}</tbody></table><div class="total"><span>สุทธิ</span><span>${money(t.net)} บาท</span></div><p>ค่าคอมมิชชันอ้างอิง: ${e(slip.entry.commissionReference || "ไม่มี")}<br>รายการหักอื่น: ${e(slip.entry.deductionNote || "ไม่มี")}<br>หมายเหตุ: ${e(slip.entry.note || "—")}</p><p>อนุมัติโดย ${e(slip.approvedBy)} · ${e(slip.approvedAt)}</p><small>รหัสสลิป ${e(slip.slipId)}<br>เอกสารนี้แสดงยอดที่อนุมัติ ไม่ใช่หลักฐานการโอนเงิน</small></main></html>`;
  return new Response(html, { headers: { ...privateNoStoreHeaders, "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'", "X-Content-Type-Options": "nosniff" } });
}
