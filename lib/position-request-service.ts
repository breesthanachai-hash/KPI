import { findRole } from "./kpi-data";
import { ensureEmployeeProfileAudit } from "./employee-profile-audit";
import {
  exportTransfer, parseRequestFile, parseTransfer, PositionRequestError,
  POSITION_REQUEST_FORMAT, MAX_POSITION_REQUEST_FILE_BYTES, record, textField, type PositionRequestTransfer,
} from "./position-request-format";

export type PositionRequestActor = { id: string; displayName: string; role: string; status: string };
export type PositionEmployee = { id: string; name: string; role_id: string; position_title: string; updated_at: string; status: string };
export type PositionRequestRow = Omit<PositionRequestTransfer, "status"> & {
  status: "pending" | "approved" | "rejected"; source_fingerprint: string;
  imported_by: string | null; imported_at: string | null;
  reviewed_by: string | null; reviewed_by_name: string | null;
  approved_at: string | null; rejected_at: string | null; review_note: string;
};

export function requirePositionAdmin(actor: PositionRequestActor) {
  if (actor.role !== "admin" || actor.status !== "active") throw new PositionRequestError("เฉพาะ Admin / HR เท่านั้น", 403);
}

export function positionConflict(request: PositionRequestTransfer | PositionRequestRow, employee?: PositionEmployee | null) {
  if (!employee) return "ไม่พบพนักงานในระบบหลัก";
  if (employee.status !== "active") return "พนักงานไม่ได้อยู่ในสถานะทำงาน";
  if (employee.role_id !== request.previous_role_id || employee.position_title !== request.previous_position_title || employee.updated_at !== request.expected_employee_updated_at) return "ข้อมูลพนักงานเปลี่ยนหลังสร้างคำขอ ต้องสร้างคำขอใหม่";
  return "";
}

export async function readyPositionRequests(db: D1Database) {
  // No runtime CREATE/ALTER for the new table: migration 0026 must be applied.
  await db.prepare("SELECT id FROM employee_position_change_requests LIMIT 0").all();
  await ensureEmployeeProfileAudit();
  await db.batch([
    db.prepare(`CREATE TRIGGER IF NOT EXISTS position_request_insert_guard
      BEFORE INSERT ON employee_position_change_requests BEGIN
        SELECT CASE WHEN NEW.status <> 'pending' OR NOT EXISTS (
          SELECT 1 FROM user_accounts WHERE id=COALESCE(NEW.imported_by,NEW.requested_by) AND role='admin' AND status='active'
        ) THEN RAISE(ABORT, 'POSITION_REQUEST_FORBIDDEN') END;
      END`),
    db.prepare(`CREATE TRIGGER IF NOT EXISTS position_request_update_guard
      BEFORE UPDATE ON employee_position_change_requests BEGIN
        SELECT CASE WHEN OLD.status <> 'pending' OR NEW.status NOT IN ('approved','rejected')
          OR NEW.id IS NOT OLD.id OR NEW.employee_id IS NOT OLD.employee_id
          OR NEW.previous_role_id IS NOT OLD.previous_role_id
          OR NEW.previous_position_title IS NOT OLD.previous_position_title
          OR NEW.expected_employee_updated_at IS NOT OLD.expected_employee_updated_at
          OR NEW.requested_role_id IS NOT OLD.requested_role_id
          OR NEW.requested_position_title IS NOT OLD.requested_position_title
          OR NEW.reason IS NOT OLD.reason OR NEW.requested_by IS NOT OLD.requested_by
          OR NEW.requested_by_name IS NOT OLD.requested_by_name OR NEW.created_at IS NOT OLD.created_at
          OR NEW.source_fingerprint IS NOT OLD.source_fingerprint
          OR NEW.imported_by IS NOT OLD.imported_by OR NEW.imported_at IS NOT OLD.imported_at
          THEN RAISE(ABORT, 'POSITION_REQUEST_IMMUTABLE') END;
        SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM user_accounts WHERE id=NEW.reviewed_by AND role='admin' AND status='active')
          THEN RAISE(ABORT, 'POSITION_REQUEST_FORBIDDEN') END;
      END`),
    db.prepare("CREATE TRIGGER IF NOT EXISTS position_request_no_delete BEFORE DELETE ON employee_position_change_requests BEGIN SELECT RAISE(ABORT, 'POSITION_REQUEST_IMMUTABLE'); END"),
  ]);
}

async function fingerprint(row: PositionRequestTransfer) {
  const bytes = new TextEncoder().encode(JSON.stringify(exportTransfer(row)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function insertRequest(db: D1Database, row: PositionRequestTransfer, hash: string, importer: string | null) {
  return db.prepare(`INSERT INTO employee_position_change_requests
    (id,employee_id,previous_role_id,previous_position_title,expected_employee_updated_at,
     requested_role_id,requested_position_title,reason,requested_by,requested_by_name,created_at,
     source_fingerprint,imported_by,imported_at,status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending')`).bind(
    row.id,row.employee_id,row.previous_role_id,row.previous_position_title,row.expected_employee_updated_at,
    row.requested_role_id,row.requested_position_title,row.reason,row.requested_by,row.requested_by_name,row.created_at,
    hash,importer,importer ? new Date().toISOString() : null,
  );
}

export async function createPositionRequest(db: D1Database, actor: PositionRequestActor, input: unknown) {
  requirePositionAdmin(actor);
  const body = record(input);
  const employeeId = textField(body.employee_id, 160);
  const employee = await db.prepare("SELECT id,name,role_id,position_title,updated_at,status FROM employees WHERE id=?").bind(employeeId).first<PositionEmployee>();
  if (!employee || employee.status !== "active") throw new PositionRequestError("ไม่พบพนักงานที่ทำงานอยู่", 409);
  if (body.expected_employee_updated_at !== employee.updated_at) throw new PositionRequestError("ข้อมูลพนักงานเปลี่ยนแล้ว กรุณาโหลดล่าสุด", 409);
  const row = parseTransfer({
    id: crypto.randomUUID(), employee_id: employee.id,
    previous_role_id: employee.role_id, previous_position_title: employee.position_title,
    expected_employee_updated_at: employee.updated_at,
    requested_role_id: body.requested_role_id, requested_position_title: body.requested_position_title,
    reason: body.reason, requested_by: actor.id, requested_by_name: actor.displayName,
    created_at: new Date().toISOString(), status: "pending",
  });
  await insertRequest(db, row, await fingerprint(row), null).run();
  return row;
}

export async function importPositionRequests(db: D1Database, actor: PositionRequestActor, input: unknown, previewOnly: boolean) {
  requirePositionAdmin(actor);
  const file = parseRequestFile(input);
  const preview = [];
  const statements: D1PreparedStatement[] = [];
  for (const request of file.requests) {
    const hash = await fingerprint(request);
    const existing = await db.prepare("SELECT source_fingerprint,status FROM employee_position_change_requests WHERE id=?").bind(request.id).first<{source_fingerprint:string;status:string}>();
    if (existing && existing.source_fingerprint !== hash) throw new PositionRequestError("รหัสคำขอซ้ำแต่เนื้อหาต่างกัน ไม่ได้นำเข้าข้อมูล", 409);
    const employee = await db.prepare("SELECT id,name,role_id,position_title,updated_at,status FROM employees WHERE id=?").bind(request.employee_id).first<PositionEmployee>();
    preview.push({ request, employee_name: employee?.name ?? request.employee_id, conflict: positionConflict(request,employee), duplicate: !!existing, existing_status: existing?.status ?? null });
    if (!existing) statements.push(insertRequest(db,request,hash,actor.id));
  }
  // All or nothing; a duplicate inserted concurrently aborts rather than overwriting.
  if (!previewOnly && statements.length) {
    try { await db.batch(statements); }
    catch (error) {
      if (String(error).includes("UNIQUE")) throw new PositionRequestError("มีการนำเข้าพร้อมกัน กรุณาตรวจไฟล์อีกครั้ง",409);
      throw error;
    }
  }
  return { preview, imported: previewOnly ? 0 : statements.length, duplicates: file.requests.length - statements.length };
}

export async function exportPositionRequests(db: D1Database, actor: PositionRequestActor, after = "") {
  requirePositionAdmin(actor);
  const rows = (await db.prepare("SELECT * FROM employee_position_change_requests WHERE status='pending' AND id>? ORDER BY id LIMIT 101").bind(after).all<PositionRequestRow>()).results;
  if (!rows) throw new PositionRequestError("อ่านคำขอไม่สำเร็จ",503);
  const file = { format: POSITION_REQUEST_FORMAT, version: 1, requests: [] as PositionRequestTransfer[] };
  // Account for UTF-8 Thai text and the downloadable pretty JSON, leaving room
  // for the import API envelope. Every generated file must be importable.
  for (const row of rows.slice(0,100)) {
    const transfer = exportTransfer({ ...row, status: "pending" });
    file.requests.push(transfer);
    if (new TextEncoder().encode(JSON.stringify(file,null,2)).byteLength > MAX_POSITION_REQUEST_FILE_BYTES - 1024) {
      file.requests.pop(); break;
    }
  }
  return { file, nextCursor: rows.length > file.requests.length && file.requests.length ? file.requests.at(-1)!.id : null };
}

export async function reviewPositionRequest(db: D1Database, actor: PositionRequestActor, input: unknown, approvalEnabled: boolean) {
  requirePositionAdmin(actor);
  if (!approvalEnabled) throw new PositionRequestError("เครื่องนี้ใช้สร้างคำขอเท่านั้น ให้อนุมัติจากระบบหลัก",403);
  const body = record(input);
  const id = textField(body.id,160);
  const note = textField(body.review_note,1000,body.action === "approve");
  if (body.action !== "approve" && body.action !== "reject") throw new PositionRequestError("คำสั่งไม่ถูกต้อง");
  const request = await db.prepare("SELECT * FROM employee_position_change_requests WHERE id=?").bind(id).first<PositionRequestRow>();
  if (!request) throw new PositionRequestError("ไม่พบคำขอ",404);
  if (request.status !== "pending") throw new PositionRequestError("คำขอนี้ได้รับการพิจารณาแล้ว",409);
  const now = new Date(Math.max(Date.now(),Date.parse(request.expected_employee_updated_at)+1)).toISOString();
  if (body.action === "reject") {
    const result = await db.prepare("UPDATE employee_position_change_requests SET status='rejected',reviewed_by=?,reviewed_by_name=?,rejected_at=?,review_note=? WHERE id=? AND status='pending'")
      .bind(actor.id,actor.displayName,now,note,id).run();
    if (result.meta.changes !== 1) throw new PositionRequestError("คำขอนี้ได้รับการพิจารณาแล้ว",409);
    return { id, status: "rejected" };
  }
  if (body.confirmed !== true) throw new PositionRequestError("กรุณายืนยันการเปลี่ยนตำแหน่งจริง");
  if (!findRole(request.requested_role_id)) throw new PositionRequestError("ไม่พบตำแหน่งใหม่ในระบบหลัก",409);
  const employee = await db.prepare("SELECT id,name,role_id,position_title,updated_at,status FROM employees WHERE id=?").bind(request.employee_id).first<PositionEmployee>();
  const conflict = positionConflict(request,employee);
  if (conflict || !employee) throw new PositionRequestError(conflict,409);
  const auditId = `position-request:${id}`;
  const statements = [
    // Lock/check the pending request, active reviewer, and employee snapshot in
    // the SAME transaction as the mutation. NULL violates the existing audit's
    // NOT NULL constraint on any race, rolling back the complete batch.
    db.prepare(`INSERT INTO employee_profile_audit
      (id,employee_id,actor_id,actor_name,created_at,before_json,after_json)
      VALUES (?,?,?,?,?,CASE WHEN EXISTS (
        SELECT 1 FROM employee_position_change_requests r JOIN employees e ON e.id=r.employee_id
        JOIN user_accounts u ON u.id=?
        WHERE r.id=? AND r.status='pending' AND r.source_fingerprint=?
          AND e.status='active' AND e.role_id=r.previous_role_id
          AND e.position_title=r.previous_position_title AND e.updated_at=r.expected_employee_updated_at
          AND u.role='admin' AND u.status='active'
      ) THEN ? ELSE NULL END,?)`).bind(
      auditId,employee.id,actor.id,actor.displayName,now,actor.id,id,request.source_fingerprint,
      JSON.stringify({ positionTitle:employee.position_title,roleId:employee.role_id,positionRequestId:id }),
      JSON.stringify({ positionTitle:request.requested_position_title,roleId:request.requested_role_id,positionRequestId:id }),
    ),
  ];
  const titleChanged = employee.position_title !== request.requested_position_title;
  if (titleChanged) statements.push(db.prepare(`INSERT INTO employee_position_events (
    id,employee_id,employee_name_snapshot,role_id_snapshot,previous_position_title,next_position_title,
    expected_updated_at,resulting_updated_at,actor_user_id,actor_name,created_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(
    auditId,employee.id,employee.name,employee.role_id,employee.position_title,request.requested_position_title,
    employee.updated_at,now,actor.id,actor.displayName,now,
  ));
  // Keep user_accounts and all credentials untouched. Existing audit trigger
  // applies a display-title change before this role-only CAS.
  statements.push(db.prepare("UPDATE employees SET role_id=?,updated_at=? WHERE id=? AND role_id=? AND position_title=? AND updated_at=? AND status='active'")
    .bind(request.requested_role_id,now,employee.id,employee.role_id,request.requested_position_title,titleChanged ? now : employee.updated_at));
  statements.push(db.prepare(`UPDATE employee_position_change_requests SET
    status=CASE WHEN changes()=1 THEN 'approved' ELSE NULL END,
    reviewed_by=?,reviewed_by_name=?,approved_at=?,review_note=? WHERE id=? AND status='pending'`)
    .bind(actor.id,actor.displayName,now,note,id));
  try { await db.batch(statements); }
  catch (error) {
    if (/EMPLOYEE_POSITION_|POSITION_REQUEST_|NOT NULL|UNIQUE|CHECK constraint/.test(String(error))) throw new PositionRequestError("ข้อมูลหรือคำขอเปลี่ยนพร้อมกัน ไม่ได้เขียนทับ กรุณาโหลดล่าสุด",409);
    throw error;
  }
  return { id,status:"approved" };
}
