import { and, eq } from "drizzle-orm";
import { getDb, getFilesBucket } from "../../../db";
import { employees, employeeRecognitions } from "../../../db/schema";
import type { EmployeeRecognitionRecord } from "../../../lib/kpi-data";
import { authenticatedRequestGate, type CurrentUser } from "../../../lib/access-control";
import { internalApiError } from "../../../lib/api-errors";

export const dynamic = "force-dynamic";

const recognitionTypes: EmployeeRecognitionRecord["recognitionType"][] = ["certificate", "award", "honor", "training", "license", "other"];
const statuses: EmployeeRecognitionRecord["status"][] = ["active", "expired", "revoked"];
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

function isSafeOptionalUrl(value: string) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
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

function actor(currentUser: CurrentUser) {
  return { userId: currentUser.id, name: currentUser.authenticatedName };
}

function publicRecognition(recognition: typeof employeeRecognitions.$inferSelect) {
  const { storageKey, ...safe } = recognition;
  return { ...safe, hasFile: Boolean(storageKey) };
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "จัดการเกียรติบัตรหรือรางวัลไม่สำเร็จ";
  if (message.includes("R2 binding")) return Response.json({ error: "พื้นที่เก็บเอกสารรางวัลยังไม่พร้อม" }, { status: 503 });
  if (message.includes("EMPLOYEE_RECOGNITION_STALE_REVISION")) return Response.json({ error: "รายการนี้ถูกแก้ไขจากอีกหน้าจอ กรุณาโหลดข้อมูลล่าสุด" }, { status: 409 });
  if (message.includes("UNIQUE constraint failed")) return Response.json({ error: "ไฟล์หรือรายการนี้ซ้ำกับข้อมูลเดิม" }, { status: 409 });
  return internalApiError(error, "จัดการเกียรติบัตรหรือรางวัลไม่สำเร็จ", "employee-recognitions");
}

async function requireAdmin(request: Request) {
  return authenticatedRequestGate(request);
}

export async function GET(request: Request) {
  try {
    const authentication = await requireAdmin(request);
    if (authentication.response) return authentication.response;
    const { currentUser } = authentication;
    if (currentUser.role !== "admin") return Response.json({ error: "เฉพาะ HR หรือผู้ดูแลระบบเท่านั้นที่ดาวน์โหลดเอกสารรางวัลได้" }, { status: 403 });
    const recognitionId = new URL(request.url).searchParams.get("id")?.trim() ?? "";
    if (!recognitionId) return Response.json({ error: "กรุณาเลือกเกียรติบัตรหรือรางวัล" }, { status: 400 });
    const [recognition] = await getDb().select().from(employeeRecognitions).where(eq(employeeRecognitions.id, recognitionId)).limit(1);
    if (!recognition?.storageKey) return Response.json({ error: "รายการนี้ไม่มีไฟล์แนบ" }, { status: 404 });
    const object = await getFilesBucket().get(recognition.storageKey);
    if (!object) return Response.json({ error: "ไม่พบไฟล์ต้นฉบับ" }, { status: 404 });
    return new Response(object.body, {
      headers: {
        "content-type": recognition.contentType || "application/octet-stream",
        "content-length": String(object.size),
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(recognition.fileName)}`,
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
    const authentication = await requireAdmin(request);
    if (authentication.response) return authentication.response;
    const { currentUser } = authentication;
    if (currentUser.role !== "admin") return Response.json({ error: "เฉพาะ HR หรือผู้ดูแลระบบเท่านั้นที่จัดการรางวัลได้" }, { status: 403 });
    const formData = await request.formData();
    const recognitionId = cleanText(formData.get("recognitionId"), 100);
    const employeeId = cleanText(formData.get("employeeId"), 100);
    const recognitionType = cleanText(formData.get("recognitionType"), 30) as EmployeeRecognitionRecord["recognitionType"];
    const title = cleanText(formData.get("title"), 220);
    const issuer = cleanText(formData.get("issuer"), 220);
    const issuedDate = cleanText(formData.get("issuedDate"), 10);
    const expiryDateInput = cleanText(formData.get("expiryDate"), 10);
    const credentialId = cleanText(formData.get("credentialId"), 160);
    const verificationUrl = cleanText(formData.get("verificationUrl"), 1200);
    const description = cleanText(formData.get("description"), 4000);
    const expectedRevision = Number(formData.get("expectedRevision"));
    const fileValue = formData.get("file");
    const file = fileValue instanceof File && fileValue.size > 0 ? fileValue : null;
    if (!employeeId || !recognitionTypes.includes(recognitionType) || !title || !issuer || !isIsoDay(issuedDate)) return Response.json({ error: "กรุณากรอกพนักงาน ประเภท ชื่อ ผู้ออก และวันที่ได้รับให้ครบ" }, { status: 400 });
    if (expiryDateInput && (!isIsoDay(expiryDateInput) || expiryDateInput < issuedDate)) return Response.json({ error: "วันหมดอายุต้องไม่ก่อนวันที่ได้รับ" }, { status: 400 });
    if (!isSafeOptionalUrl(verificationUrl)) return Response.json({ error: "ลิงก์ตรวจสอบต้องขึ้นต้นด้วย http:// หรือ https://" }, { status: 400 });
    if (file && !(await validFile(file))) return Response.json({ error: "ไฟล์ต้องไม่เกิน 10 MB เป็น PDF, Word, JPG หรือ PNG และมีเนื้อไฟล์ตรงกับประเภท" }, { status: 400 });

    const db = getDb();
    const [[employee], [existing]] = await Promise.all([
      db.select({ id: employees.id }).from(employees).where(eq(employees.id, employeeId)).limit(1),
      recognitionId ? db.select().from(employeeRecognitions).where(eq(employeeRecognitions.id, recognitionId)).limit(1) : Promise.resolve([]),
    ]);
    if (!employee) return Response.json({ error: "ไม่พบพนักงานที่เลือก" }, { status: 404 });
    if (recognitionId && !existing) return Response.json({ error: "ไม่พบรายการรางวัลที่เลือก" }, { status: 404 });
    if (existing && existing.employeeId !== employeeId) return Response.json({ error: "รายการรางวัลไม่ตรงกับพนักงานที่เลือก" }, { status: 400 });
    if (existing?.status === "revoked") return Response.json({ error: "รายการที่เพิกถอนแล้วไม่สามารถแก้ไขเนื้อหาได้" }, { status: 409 });
    if (existing && (!Number.isInteger(expectedRevision) || expectedRevision < 0)) return Response.json({ error: "ขาด revision สำหรับป้องกันการแก้ไขชนกัน" }, { status: 400 });

    const id = existing?.id ?? `employee-recognition-${crypto.randomUUID()}`;
    let fileName = existing?.fileName ?? "";
    let storageKey = existing?.storageKey ?? "";
    let contentType = existing?.contentType ?? "application/octet-stream";
    let sizeBytes = existing?.sizeBytes ?? 0;
    if (file) {
      const safeName = file.name.normalize("NFKC").replace(/[^\p{L}\p{N}._-]+/gu, "-").slice(-140) || "employee-recognition";
      storageKey = `employee-recognitions/${employeeId}/${id}/${crypto.randomUUID()}-${safeName}`;
      fileName = file.name.replace(/[\r\n]/g, "").slice(0, 180);
      contentType = file.type;
      sizeBytes = file.size;
      await getFilesBucket().put(storageKey, file.stream(), {
        httpMetadata: { contentType: file.type },
        customMetadata: { recognitionId: id, employeeId, originalName: fileName },
      });
      uploadedStorageKey = storageKey;
    }

    const now = new Date().toISOString();
    const acting = actor(currentUser);
    if (!existing) {
      const recognition = {
        id, employeeId, recognitionType, title, issuer, issuedDate, expiryDate: expiryDateInput || null,
        credentialId, verificationUrl, description, status: "active" as const,
        fileName, storageKey, contentType, sizeBytes, revision: 0,
        createdByUserId: acting.userId, createdBy: acting.name, createdAt: now,
        updatedByUserId: acting.userId, updatedBy: acting.name, updatedAt: now,
      };
      await db.insert(employeeRecognitions).values(recognition);
      committed = true;
      return Response.json({ employeeRecognition: publicRecognition(recognition) }, { status: 201 });
    }

    const [updated] = await db.update(employeeRecognitions).set({
      recognitionType, title, issuer, issuedDate, expiryDate: expiryDateInput || null,
      credentialId, verificationUrl, description, fileName, storageKey, contentType, sizeBytes,
      revision: expectedRevision + 1, updatedByUserId: acting.userId, updatedBy: acting.name, updatedAt: now,
    }).where(and(eq(employeeRecognitions.id, existing.id), eq(employeeRecognitions.revision, expectedRevision))).returning();
    if (!updated) {
      if (uploadedStorageKey) {
        try { await getFilesBucket().delete(uploadedStorageKey); } catch { /* Best-effort cleanup after a stale write. */ }
        uploadedStorageKey = "";
      }
      return Response.json({ error: "รายการนี้ถูกแก้ไขจากอีกหน้าจอ กรุณาโหลดข้อมูลล่าสุด" }, { status: 409 });
    }
    committed = true;
    if (uploadedStorageKey && existing.storageKey && existing.storageKey !== uploadedStorageKey) {
      try { await getFilesBucket().delete(existing.storageKey); } catch { /* New committed file remains authoritative. */ }
    }
    return Response.json({ employeeRecognition: publicRecognition(updated) });
  } catch (error) {
    if (uploadedStorageKey && !committed) {
      try { await getFilesBucket().delete(uploadedStorageKey); } catch { /* Preserve the primary error. */ }
    }
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const authentication = await requireAdmin(request);
    if (authentication.response) return authentication.response;
    const { currentUser } = authentication;
    if (currentUser.role !== "admin") return Response.json({ error: "เฉพาะ HR หรือผู้ดูแลระบบเท่านั้นที่เปลี่ยนสถานะรางวัลได้" }, { status: 403 });
    const payload = await request.json() as { id?: unknown; recognitionId?: unknown; status?: unknown; expectedRevision?: unknown };
    const rawRecognitionId = typeof payload.recognitionId === "string" ? payload.recognitionId : typeof payload.id === "string" ? payload.id : "";
    const recognitionId = rawRecognitionId.trim().slice(0, 100);
    const status = typeof payload.status === "string" ? payload.status as EmployeeRecognitionRecord["status"] : "" as EmployeeRecognitionRecord["status"];
    const expectedRevision = Number(payload.expectedRevision);
    if (!recognitionId || !statuses.includes(status) || !Number.isInteger(expectedRevision) || expectedRevision < 0) return Response.json({ error: "คำขอเปลี่ยนสถานะไม่ถูกต้อง" }, { status: 400 });
    const db = getDb();
    const [recognition] = await db.select().from(employeeRecognitions).where(eq(employeeRecognitions.id, recognitionId)).limit(1);
    if (!recognition) return Response.json({ error: "ไม่พบรายการรางวัลที่เลือก" }, { status: 404 });
    if (recognition.revision !== expectedRevision) return Response.json({ error: "รายการนี้ถูกแก้ไขจากอีกหน้าจอ กรุณาโหลดข้อมูลล่าสุด" }, { status: 409 });
    if (status === recognition.status) return Response.json({ employeeRecognition: publicRecognition(recognition) });
    const allowedTransitions: Record<EmployeeRecognitionRecord["status"], EmployeeRecognitionRecord["status"][]> = {
      active: ["expired", "revoked"], expired: ["active", "revoked"], revoked: [],
    };
    if (!allowedTransitions[recognition.status].includes(status)) return Response.json({ error: "ไม่สามารถเปลี่ยนสถานะตามลำดับนี้ได้" }, { status: 409 });
    const acting = actor(currentUser);
    const [updated] = await db.update(employeeRecognitions).set({
      status, revision: expectedRevision + 1, updatedByUserId: acting.userId, updatedBy: acting.name, updatedAt: new Date().toISOString(),
    }).where(and(eq(employeeRecognitions.id, recognitionId), eq(employeeRecognitions.revision, expectedRevision))).returning();
    if (!updated) return Response.json({ error: "รายการนี้ถูกแก้ไขจากอีกหน้าจอ กรุณาโหลดข้อมูลล่าสุด" }, { status: 409 });
    return Response.json({ employeeRecognition: publicRecognition(updated) });
  } catch (error) {
    return errorResponse(error);
  }
}
