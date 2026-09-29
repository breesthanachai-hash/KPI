import { authenticatedRequestGate, privateNoStoreHeaders } from "../../../lib/access-control";
import { getD1 } from "../../../db";
import { MAX_POSITION_REQUEST_FILE_BYTES, PositionRequestError, record } from "../../../lib/position-request-format";
import { createPositionRequest, exportPositionRequests, importPositionRequests, positionConflict, readyPositionRequests, requirePositionAdmin, reviewPositionRequest, type PositionEmployee, type PositionRequestRow } from "../../../lib/position-request-service";

export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: privateNoStoreHeaders });
const approvalEnabled = () => process.env.PEOPLE_PULSE_POSITION_REQUEST_APPROVAL_ENABLED === "true";

function failure(error: unknown) {
  if (error instanceof PositionRequestError) return json({ error: error.message },error.status);
  console.error("Position request operation failed", error instanceof Error ? error.name : "unknown");
  return json({ error: "ระบบคำขอยังไม่พร้อม กรุณาตรวจ migration หรือลองใหม่ ข้อมูลเดิมไม่ถูกเขียนทับ" },503);
}

async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new PositionRequestError("ไม่พบข้อมูลคำขอ");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_POSITION_REQUEST_FILE_BYTES) { await reader.cancel(); throw new PositionRequestError("ไฟล์ใหญ่เกิน 256 KB",413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.byteLength; }
  try { return record(JSON.parse(new TextDecoder("utf-8",{ fatal:true }).decode(bytes))); }
  catch (error) { if (error instanceof PositionRequestError) throw error; throw new PositionRequestError("ไฟล์ JSON ไม่ถูกต้อง"); }
}

export async function GET(request: Request) {
  try {
    const auth = await authenticatedRequestGate(request);
    if (auth.response) return auth.response;
    requirePositionAdmin(auth.currentUser);
    const db = getD1();
    await readyPositionRequests(db);
    const params = new URL(request.url).searchParams;
    if (params.get("export") === "1") {
      const after = params.get("after") ?? "";
      if (after.length > 160) throw new PositionRequestError("ตัวแบ่งชุดข้อมูลไม่ถูกต้อง");
      return json(await exportPositionRequests(db,auth.currentUser,after));
    }
    const offset = Number(params.get("offset") ?? "0");
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw new PositionRequestError("หน้าข้อมูลไม่ถูกต้อง");
    const employees = (await db.prepare("SELECT id,name,role_id,position_title,updated_at,status FROM employees WHERE status <> 'archived' ORDER BY name LIMIT 1001").all<PositionEmployee>()).results;
    if (!employees) throw new PositionRequestError("อ่านพนักงานไม่สำเร็จ",503);
    if (employees.length > 1000) throw new PositionRequestError("รายชื่อเกินขอบเขตที่รองรับ กรุณาติดต่อผู้ดูแล",503);
    const rows = (await db.prepare("SELECT * FROM employee_position_change_requests ORDER BY created_at DESC,id DESC LIMIT 101 OFFSET ?").bind(offset).all<PositionRequestRow>()).results;
    if (!rows) throw new PositionRequestError("อ่านคำขอไม่สำเร็จ",503);
    const requests = rows.slice(0,100).map(row => {
      const employee = employees.find(item => item.id === row.employee_id);
      // source_fingerprint is internal deduplication metadata, never an identity proof.
      const visible = { ...row, source_fingerprint: undefined };
      return { ...visible,employee_name:employee?.name ?? row.employee_id,conflict:row.status === "pending" ? positionConflict(row,employee) : "" };
    });
    return json({ requests,employees:employees.filter(employee=>employee.status === "active"),approvalEnabled:approvalEnabled(),nextOffset:rows.length > 100 ? offset + 100 : null });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const auth = await authenticatedRequestGate(request);
    if (auth.response) return auth.response;
    requirePositionAdmin(auth.currentUser);
    const body = await readBody(request);
    const db = getD1();
    await readyPositionRequests(db);
    if (body.action === "create") return json({ request:await createPositionRequest(db,auth.currentUser,body) },201);
    if (body.action === "previewImport" || body.action === "import") return json(await importPositionRequests(db,auth.currentUser,body.file,body.action === "previewImport"));
    if (body.action === "approve" || body.action === "reject") return json(await reviewPositionRequest(db,auth.currentUser,body,approvalEnabled()));
    throw new PositionRequestError("ไม่รองรับคำสั่งนี้");
  } catch (error) { return failure(error); }
}
