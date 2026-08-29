import { and, eq } from "drizzle-orm";
import { getDb, getFilesBucket } from "../../../db";
import { ensureDatabase } from "../../../db/initialize";
import { employees, employeeWarnings } from "../../../db/schema";
import type { EmployeeWarningRecord } from "../../../lib/kpi-data";
import { authenticateRequest, authenticatedIdentity, ensureBootstrapAccounts } from "../../../lib/access-control";

export const dynamic = "force-dynamic";

const levels: EmployeeWarningRecord["level"][] = ["first", "second", "final"];
const statuses: EmployeeWarningRecord["status"][] = ["draft", "issued", "acknowledged", "resolved", "withdrawn"];
const allowedContentTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
]);
const allowedExtensions: Record<string, Set<string>> = {
  "application/pdf": new Set(["pdf"]),
  "application/msword": new Set(["doc"]),
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": new Set(["docx"]),
  "image/jpeg": new Set(["jpg", "jpeg"]),
  "image/png": new Set(["png"]),
};

function isIsoDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function cleanText(value: FormDataEntryValue | null, maxLength: number) {
  return String(value ?? "").replace(/\0/g, "").trim().slice(0, maxLength);
}

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

async function validFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const metadataValid = file.size > 0
    && file.size <= 10 * 1024 * 1024
    && allowedContentTypes.has(file.type)
    && Boolean(allowedExtensions[file.type]?.has(extension));
  if (!metadataValid) return false;
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (file.type === "application/pdf") return startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
  if (file.type === "application/msword") return startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])
      || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06])
      || startsWith(bytes, [0x50, 0x4b, 0x07, 0x08]);
  }
  if (file.type === "image/jpeg") return startsWith(bytes, [0xff, 0xd8, 0xff]);
  if (file.type === "image/png") return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return false;
}

function actor(currentUser: NonNullable<Awaited<ReturnType<typeof authenticateRequest>>>) {
  return { userId: currentUser.authUserId || currentUser.id, name: currentUser.authenticatedName || currentUser.displayName };
}

function publicWarning(warning: typeof employeeWarnings.$inferSelect) {
  const { storageKey, ...safe } = warning;
  return { ...safe, hasFile: Boolean(storageKey) };
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "จัดการใบเตือนไม่สำเร็จ";
  if (message.includes("R2 binding")) return Response.json({ error: "พื้นที่เก็บใบเตือนยังไม่พร้อม" }, { status: 503 });
  if (message.includes("EMPLOYEE_WARNING_STALE_REVISION")) return Response.json({ error: "ใบเตือนถูกแก้ไขจากอีกหน้าจอ กรุณาโหลดข้อมูลล่าสุด" }, { status: 409 });
  if (message.includes("EMPLOYEE_WARNING_FIELDS_LOCKED")) return Response.json({ error: "ใบเตือนที่ออกแล้วห้ามแก้ไขข้อเท็จจริงหรือไฟล์ต้นฉบับ" }, { status: 409 });
  if (message.includes("EMPLOYEE_WARNING_INVALID_TRANSITION")) return Response.json({ error: "ไม่สามารถเปลี่ยนสถานะใบเตือนตามลำดับนี้ได้" }, { status: 409 });
  if (message.includes("UNIQUE constraint failed")) return Response.json({ error: "เลขที่ใบเตือนนี้มีอยู่แล้ว" }, { status: 409 });
  return Response.json({ error: message }, { status: 500 });
}

async function requireAdmin(request: Request) {
  if (!authenticatedIdentity(request)) return null;
  await ensureDatabase();
  await ensureBootstrapAccounts();
  const currentUser = await authenticateRequest(request);
  return currentUser?.role === "admin" ? currentUser : null;
}

export async function GET(request: Request) {
  try {
    const currentUser = await requireAdmin(request);
    if (!currentUser) return Response.json({ error: "เฉพาะ HR หรือผู้ดูแลระบบเท่านั้นที่ดาวน์โหลดใบเตือนได้" }, { status: 403 });
    const warningId = new URL(request.url).searchParams.get("id")?.trim() ?? "";
    if (!warningId) return Response.json({ error: "กรุณาเลือกใบเตือน" }, { status: 400 });
    const [warning] = await getDb().select().from(employeeWarnings).where(eq(employeeWarnings.id, warningId)).limit(1);
    if (!warning?.storageKey) return Response.json({ error: "ใบเตือนรายการนี้ไม่มีไฟล์แนบ" }, { status: 404 });
    const object = await getFilesBucket().get(warning.storageKey);
    if (!object) return Response.json({ error: "ไม่พบไฟล์ต้นฉบับ" }, { status: 404 });
    return new Response(object.body, {
      headers: {
        "content-type": warning.contentType || "application/octet-stream",
        "content-length": String(object.size),
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(warning.fileName)}`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  let uploadedStorageKey = "";
  let committed = false;
  try {
    const currentUser = await requireAdmin(request);
    if (!currentUser) return Response.json({ error: "เฉพาะ HR หรือผู้ดูแลระบบเท่านั้นที่จัดการใบเตือนได้" }, { status: 403 });
    const formData = await request.formData();
    const warningId = cleanText(formData.get("warningId"), 100);
    const employeeId = cleanText(formData.get("employeeId"), 100);
    const warningNumberInput = cleanText(formData.get("warningNumber"), 80);
    const level = cleanText(formData.get("level"), 20) as EmployeeWarningRecord["level"];
    const subject = cleanText(formData.get("subject"), 220);
    const incidentDate = cleanText(formData.get("incidentDate"), 10);
    const issuedDate = cleanText(formData.get("issuedDate"), 10);
    const facts = cleanText(formData.get("facts"), 8000);
    const correctiveAction = cleanText(formData.get("correctiveAction"), 4000);
    const reviewDateInput = cleanText(formData.get("reviewDate"), 10);
    const employeeStatement = cleanText(formData.get("employeeStatement"), 4000);
    const requestedStatus = cleanText(formData.get("status"), 20) || "draft";
    const expectedRevision = Number(formData.get("expectedRevision"));
    const fileValue = formData.get("file");
    const file = fileValue instanceof File && fileValue.size > 0 ? fileValue : null;
    if (!employeeId || !levels.includes(level) || !subject || !facts || !isIsoDay(incidentDate) || !isIsoDay(issuedDate)) return Response.json({ error: "กรุณากรอกพนักงาน ระดับ เรื่อง วันที่ และข้อเท็จจริงให้ครบ" }, { status: 400 });
    if (requestedStatus !== "draft" && requestedStatus !== "issued") return Response.json({ error: "ใบเตือนใหม่เลือกได้เฉพาะสถานะฉบับร่างหรือออกใบเตือน" }, { status: 400 });
    if (issuedDate < incidentDate) return Response.json({ error: "วันออกใบเตือนต้องไม่ก่อนวันที่เกิดเหตุ" }, { status: 400 });
    if (reviewDateInput && (!isIsoDay(reviewDateInput) || reviewDateInput < issuedDate)) return Response.json({ error: "วันทบทวนต้องไม่ก่อนวันออกใบเตือน" }, { status: 400 });
    if (file && !(await validFile(file))) return Response.json({ error: "ไฟล์ต้องไม่เกิน 10 MB เป็น PDF, Word, JPG หรือ PNG และมีเนื้อไฟล์ตรงกับประเภท" }, { status: 400 });

    const db = getDb();
    const [[employee], [existing]] = await Promise.all([
      db.select({ id: employees.id }).from(employees).where(eq(employees.id, employeeId)).limit(1),
      warningId ? db.select().from(employeeWarnings).where(eq(employeeWarnings.id, warningId)).limit(1) : Promise.resolve([]),
    ]);
    if (!employee) return Response.json({ error: "ไม่พบพนักงานที่เลือก" }, { status: 404 });
    if (warningId && !existing) return Response.json({ error: "ไม่พบใบเตือนที่เลือก" }, { status: 404 });
    if (existing && existing.employeeId !== employeeId) return Response.json({ error: "ใบเตือนไม่ตรงกับพนักงานที่เลือก" }, { status: 400 });
    if (existing && existing.status !== "draft") return Response.json({ error: "แก้ไขข้อเท็จจริงได้เฉพาะใบเตือนฉบับร่าง" }, { status: 409 });
    if (existing && (!Number.isInteger(expectedRevision) || expectedRevision < 0)) return Response.json({ error: "ขาด revision สำหรับป้องกันการแก้ไขชนกัน" }, { status: 400 });

    const id = existing?.id ?? `employee-warning-${crypto.randomUUID()}`;
    const warningNumber = warningNumberInput || existing?.warningNumber || `WRN-${issuedDate.replaceAll("-", "")}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    let fileName = existing?.fileName ?? "";
    let storageKey = existing?.storageKey ?? "";
    let contentType = existing?.contentType ?? "application/octet-stream";
    let sizeBytes = existing?.sizeBytes ?? 0;
    if (file) {
      const safeName = file.name.normalize("NFKC").replace(/[^\p{L}\p{N}._-]+/gu, "-").slice(-140) || "employee-warning";
      storageKey = `employee-warnings/${employeeId}/${id}/${crypto.randomUUID()}-${safeName}`;
      fileName = file.name.replace(/[\r\n]/g, "").slice(0, 180);
      contentType = file.type;
      sizeBytes = file.size;
      await getFilesBucket().put(storageKey, file.stream(), {
        httpMetadata: { contentType: file.type },
        customMetadata: { warningId: id, employeeId, originalName: fileName },
      });
      uploadedStorageKey = storageKey;
    }

    const now = new Date().toISOString();
    const acting = actor(currentUser);
    if (!existing) {
      const warning = {
        id, employeeId, warningNumber, level, subject, incidentDate, issuedDate, facts, correctiveAction,
        reviewDate: reviewDateInput || null, employeeStatement, status: requestedStatus as "draft" | "issued",
        fileName, storageKey, contentType, sizeBytes, revision: 0,
        issuedBy: requestedStatus === "issued" ? acting.name : null, issuedAt: requestedStatus === "issued" ? now : null,
        acknowledgedBy: null, acknowledgedAt: null,
        resolvedBy: null, resolvedAt: null, withdrawnBy: null, withdrawnAt: null,
        createdByUserId: acting.userId, createdBy: acting.name, createdAt: now,
        updatedByUserId: acting.userId, updatedBy: acting.name, updatedAt: now,
      };
      await db.insert(employeeWarnings).values(warning);
      committed = true;
      return Response.json({ employeeWarning: publicWarning(warning) }, { status: 201 });
    }

    const [updated] = await db.update(employeeWarnings).set({
      warningNumber, level, subject, incidentDate, issuedDate, facts, correctiveAction,
      reviewDate: reviewDateInput || null, employeeStatement, fileName, storageKey, contentType, sizeBytes,
      status: requestedStatus as "draft" | "issued",
      issuedBy: requestedStatus === "issued" ? acting.name : null,
      issuedAt: requestedStatus === "issued" ? now : null,
      revision: expectedRevision + 1, updatedByUserId: acting.userId, updatedBy: acting.name, updatedAt: now,
    }).where(and(eq(employeeWarnings.id, existing.id), eq(employeeWarnings.revision, expectedRevision))).returning();
    if (!updated) {
      if (uploadedStorageKey) {
        try { await getFilesBucket().delete(uploadedStorageKey); } catch { /* Best-effort cleanup after a stale write. */ }
        uploadedStorageKey = "";
      }
      return Response.json({ error: "ใบเตือนถูกแก้ไขจากอีกหน้าจอ กรุณาโหลดข้อมูลล่าสุด" }, { status: 409 });
    }
    committed = true;
    if (uploadedStorageKey && existing.storageKey && existing.storageKey !== uploadedStorageKey) {
      try { await getFilesBucket().delete(existing.storageKey); } catch { /* New committed file remains authoritative. */ }
    }
    return Response.json({ employeeWarning: publicWarning(updated) });
  } catch (error) {
    if (uploadedStorageKey && !committed) {
      try { await getFilesBucket().delete(uploadedStorageKey); } catch { /* Preserve the primary error. */ }
    }
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const currentUser = await requireAdmin(request);
    if (!currentUser) return Response.json({ error: "เฉพาะ HR หรือผู้ดูแลระบบเท่านั้นที่เปลี่ยนสถานะใบเตือนได้" }, { status: 403 });
    const payload = await request.json() as { id?: unknown; warningId?: unknown; status?: unknown; expectedRevision?: unknown; employeeStatement?: unknown };
    const rawWarningId = typeof payload.warningId === "string" ? payload.warningId : typeof payload.id === "string" ? payload.id : "";
    const warningId = rawWarningId.trim().slice(0, 100);
    const status = typeof payload.status === "string" ? payload.status as EmployeeWarningRecord["status"] : "" as EmployeeWarningRecord["status"];
    const expectedRevision = Number(payload.expectedRevision);
    const employeeStatement = typeof payload.employeeStatement === "string" ? payload.employeeStatement.replace(/\0/g, "").trim().slice(0, 4000) : undefined;
    if (!warningId || !statuses.includes(status) || !Number.isInteger(expectedRevision) || expectedRevision < 0) return Response.json({ error: "คำขอเปลี่ยนสถานะไม่ถูกต้อง" }, { status: 400 });
    const db = getDb();
    const [warning] = await db.select().from(employeeWarnings).where(eq(employeeWarnings.id, warningId)).limit(1);
    if (!warning) return Response.json({ error: "ไม่พบใบเตือนที่เลือก" }, { status: 404 });
    if (warning.revision !== expectedRevision) return Response.json({ error: "ใบเตือนถูกแก้ไขจากอีกหน้าจอ กรุณาโหลดข้อมูลล่าสุด" }, { status: 409 });
    if (status === warning.status) return Response.json({ employeeWarning: publicWarning(warning) });
    const allowedTransitions: Record<EmployeeWarningRecord["status"], EmployeeWarningRecord["status"][]> = {
      draft: ["issued", "withdrawn"], issued: ["acknowledged", "resolved", "withdrawn"],
      acknowledged: ["resolved", "withdrawn"], resolved: [], withdrawn: [],
    };
    if (!allowedTransitions[warning.status].includes(status)) return Response.json({ error: "ไม่สามารถเปลี่ยนสถานะใบเตือนตามลำดับนี้ได้" }, { status: 409 });
    const acting = actor(currentUser);
    const now = new Date().toISOString();
    const transitionAudit = status === "issued"
      ? { issuedBy: acting.name, issuedAt: now }
      : status === "acknowledged"
        ? { acknowledgedBy: acting.name, acknowledgedAt: now, employeeStatement: employeeStatement ?? warning.employeeStatement }
        : status === "resolved"
          ? { resolvedBy: acting.name, resolvedAt: now }
          : { withdrawnBy: acting.name, withdrawnAt: now };
    const [updated] = await db.update(employeeWarnings).set({
      status, ...transitionAudit, revision: expectedRevision + 1,
      updatedByUserId: acting.userId, updatedBy: acting.name, updatedAt: now,
    }).where(and(eq(employeeWarnings.id, warningId), eq(employeeWarnings.revision, expectedRevision))).returning();
    if (!updated) return Response.json({ error: "ใบเตือนถูกแก้ไขจากอีกหน้าจอ กรุณาโหลดข้อมูลล่าสุด" }, { status: 409 });
    return Response.json({
      employeeWarning: publicWarning(updated),
      acknowledgementNotice: status === "acknowledged" ? "การรับทราบเอกสารไม่ได้หมายถึงการยอมรับผิด" : null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
