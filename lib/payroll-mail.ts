import { getD1 } from "../db";
import { validEmail } from "./payroll-calculation";
import { PayrollError, type SlipSnapshot } from "./payroll-service";

export const escapeHtml = (value: unknown) => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const SENDER = "maechalao2333@gmail.com";
export function mailConfiguration() {
  const clientId = process.env.PEOPLE_PULSE_GMAIL_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.PEOPLE_PULSE_GMAIL_CLIENT_SECRET?.trim() ?? "";
  const refreshToken = process.env.PEOPLE_PULSE_GMAIL_REFRESH_TOKEN?.trim() ?? "";
  const origin = process.env.PEOPLE_PULSE_CANONICAL_ORIGIN?.trim() ?? "";
  let originReady = false;
  try { const url = new URL(origin); originReady = url.protocol === "https:" && !url.username && !url.password && url.origin === origin; } catch { /* not configured */ }
  return { ready: !!clientId && !!clientSecret && !!refreshToken && originReady, from: SENDER, clientId, clientSecret, refreshToken, origin, originReady };
}
export function mailStatus() {
  const c = mailConfiguration();
  return { ready: c.ready, provider: "Gmail API", sender: SENDER, missing: [!c.clientId && "PEOPLE_PULSE_GMAIL_CLIENT_ID", !c.clientSecret && "PEOPLE_PULSE_GMAIL_CLIENT_SECRET", !c.refreshToken && "PEOPLE_PULSE_GMAIL_REFRESH_TOKEN", !c.originReady && "PEOPLE_PULSE_CANONICAL_ORIGIN"].filter(Boolean) };
}
const base64 = (text: string) => btoa(Array.from(new TextEncoder().encode(text), byte => String.fromCharCode(byte)).join(""));
export function payslipMime(slip: SlipSnapshot, recipient: string, origin: string) {
  if (!validEmail(recipient)) throw new PayrollError("อีเมลผู้รับไม่ถูกต้อง");
  const subject = `สลิปค่าตอบแทน ${slip.period} พร้อมตรวจสอบ`;
  const html = `<div lang="th"><h2>สลิปค่าตอบแทนพร้อมแล้ว</h2><p>เรียน ${escapeHtml(slip.entry.employeeName)}</p><p>${escapeHtml(slip.label)} · รอบ ${escapeHtml(slip.period)}</p><p>เพื่อรักษาข้อมูลเงินเดือน กรุณาเข้าสู่ระบบด้วยบัญชีของคุณเพื่อเปิดสลิปและพิมพ์หรือบันทึกเป็น PDF</p><p><a href="${escapeHtml(origin)}/?payroll=1">เปิดสลิปของฉัน</a></p><p>การอนุมัติสลิปไม่ใช่หลักฐานการโอนเงิน หากมีข้อสงสัยให้ติดต่อ HR</p></div>`;
  const mime = [`From: ${SENDER}`, `To: ${recipient}`, `Subject: =?UTF-8?B?${base64(subject)}?=`, `Message-ID: <people-pulse-${slip.slipId}@peoplepulse.profaiprofit.com>`, "MIME-Version: 1.0", "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", base64(html).match(/.{1,76}/g)!.join("\r\n")].join("\r\n");
  return base64(mime).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
type Delivery = { slip_id: string; status: string; attempts: number; payload: string; provider_draft_id: string | null; send_started_at: string | null };
async function gmailToken() {
  const config = mailConfiguration();
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: config.refreshToken, grant_type: "refresh_token" }), signal: AbortSignal.timeout(15000) });
  const body = await response.json() as { access_token?: string };
  if (!response.ok || typeof body.access_token !== "string") throw new PayrollError("Gmail ยังไม่อนุญาตให้ส่ง ให้เจ้าของตรวจ OAuth และเชื่อมบัญชีบริษัทใหม่", 503);
  return body.access_token;
}
/** Durable draft + explicit uncertain-send quarantine. No automatic send retry:
 * Gmail has no idempotency key, and a missing draft does not prove delivery.
 */
export async function sendPayslip(slipId: string) {
  const config = mailConfiguration();
  if (!config.ready) throw new PayrollError("ยังไม่เชื่อม Gmail ของบริษัท ให้เจ้าของตั้งค่า OAuth ก่อนส่งจริง", 503);
  const db = getD1();
  const row = await db.prepare("SELECT s.snapshot,s.recipient_email,d.* FROM payroll_slips s JOIN payroll_runs r ON r.id=s.run_id JOIN payroll_deliveries d ON d.slip_id=s.id WHERE s.id=? AND r.status IN ('approved','paid')").bind(slipId).first<Delivery & { snapshot: string; recipient_email: string }>();
  if (!row) throw new PayrollError("ไม่พบสลิปที่อนุมัติ", 404);
  if (row.status === "accepted") return { status: "accepted", alreadyAccepted: true };
  if (row.send_started_at || row.status === "review") throw new PayrollError("ต้องตรวจ Sent/Drafts ใน Gmail ก่อน รายการนี้อาจส่งแล้ว ระบบจะไม่ส่งซ้ำเอง", 409);
  const token = crypto.randomUUID(), now = new Date(), nowIso = now.toISOString();
  const raw = payslipMime(JSON.parse(row.snapshot), row.recipient_email, config.origin);
  const claim = await db.prepare("UPDATE payroll_deliveries SET status='sending',lease_token=?,lease_until=?,attempts=attempts+1,first_attempt_at=COALESCE(first_attempt_at,?),payload=COALESCE(payload,?),updated_at=? WHERE slip_id=? AND status IN ('pending','failed','sending') AND attempts<5 AND send_started_at IS NULL AND (lease_until IS NULL OR lease_until<?) RETURNING payload,provider_draft_id").bind(token, new Date(now.getTime() + 180000).toISOString(), nowIso, raw, nowIso, slipId, nowIso).first<{ payload: string; provider_draft_id: string | null }>();
  if (!claim) throw new PayrollError("กำลังส่งจากอีกหน้าจอ หรือถึงจำนวนลองใหม่สูงสุด กรุณาโหลดสถานะล่าสุด", 409);
  let sendStarted = false;
  try {
    const accessToken = await gmailToken();
    const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
    const profileResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers, signal: AbortSignal.timeout(15000) });
    const profile = await profileResponse.json() as { emailAddress?: string };
    if (!profileResponse.ok || profile.emailAddress?.toLowerCase() !== SENDER) throw new PayrollError(`ต้องเชื่อม Gmail บัญชี ${SENDER} เท่านั้น`, 503);
    let draftId = claim.provider_draft_id;
    if (!draftId) {
      const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", { method: "POST", headers, body: JSON.stringify({ message: { raw: claim.payload } }), signal: AbortSignal.timeout(15000) });
      const draft = await response.json() as { id?: string };
      if (!response.ok || !draft.id) throw new PayrollError(`Gmail สร้างร่างไม่ได้ (HTTP ${response.status}) ตรวจสิทธิ์การเชื่อมต่อ`, 502);
      draftId = draft.id;
      const persisted = await db.prepare("UPDATE payroll_deliveries SET provider_draft_id=? WHERE slip_id=? AND lease_token=? RETURNING slip_id").bind(draftId, slipId, token).first();
      if (!persisted) throw new PayrollError("สิทธิ์การส่งรายการหมดอายุ ยังไม่ได้สั่งส่งอีเมล", 409);
    }
    // Persist before the network boundary. Any crash/timeout after this requires review.
    const authorized = await db.prepare("UPDATE payroll_deliveries SET send_started_at=? WHERE slip_id=? AND lease_token=? AND send_started_at IS NULL RETURNING slip_id").bind(new Date().toISOString(), slipId, token).first();
    if (!authorized) throw new PayrollError("รายการนี้เริ่มส่งไปแล้ว กรุณาตรวจผลใน Gmail", 409);
    sendStarted = true;
    // Replace the draft raw at send so a manual draft edit cannot change recipient/content.
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts/send", { method: "POST", headers, body: JSON.stringify({ id: draftId, message: { raw: claim.payload } }), signal: AbortSignal.timeout(15000) });
    const sent = await response.json() as { id?: string };
    if (!response.ok || !sent.id) throw new PayrollError(`Gmail ยังยืนยันการส่งไม่ได้ (HTTP ${response.status}) ตรวจ Sent/Drafts ก่อน ห้ามสร้างส่งซ้ำ`, 502);
    const accepted = await db.prepare("UPDATE payroll_deliveries SET status='accepted',provider_id=?,last_error=NULL,lease_token=NULL,lease_until=NULL,updated_at=? WHERE slip_id=? AND lease_token=? RETURNING slip_id").bind(sent.id, new Date().toISOString(), slipId, token).first();
    if (!accepted) throw new PayrollError("Gmail รับแล้ว แต่สถานะในระบบยังยืนยันไม่ได้ ให้เจ้าของตรวจประวัติการส่ง", 409);
    return { status: "accepted" };
  } catch (error) {
    const message = error instanceof PayrollError ? error.message : "การเชื่อมต่อ Gmail ขัดข้อง กรุณาตรวจสถานะก่อนลองใหม่";
    await db.prepare("UPDATE payroll_deliveries SET status=?,last_error=?,lease_token=NULL,lease_until=?,updated_at=? WHERE slip_id=? AND lease_token=?").bind(sendStarted ? "review" : "failed", message, sendStarted ? null : new Date(Date.now() + 60000).toISOString(), new Date().toISOString(), slipId, token).run();
    throw new PayrollError(message, 502);
  }
}
