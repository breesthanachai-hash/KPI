import { and, eq } from "drizzle-orm";
import { getDb, getFilesBucket } from "../../../db";
import { applicationDocuments, employees, employmentContracts } from "../../../db/schema";
import type { ApplicationDocumentRecord } from "../../../lib/kpi-data";
import { authenticatedRequestGate, canAccessEmployee } from "../../../lib/access-control";
import { internalApiError } from "../../../lib/api-errors";

export const dynamic = "force-dynamic";

const allowedDocumentTypes: ApplicationDocumentRecord["documentType"][] = [
  "resume",
  "id_card",
  "house_registration",
  "transcript",
  "portfolio",
  "bank_account",
  "medical_certificate",
  "contract",
  "other",
];

const documentTitles: Record<ApplicationDocumentRecord["documentType"], string> = {
  resume: "ประวัติย่อ (Resume)",
  id_card: "สำเนาบัตรประชาชน",
  house_registration: "สำเนาทะเบียนบ้าน",
  transcript: "วุฒิการศึกษา / Transcript",
  portfolio: "Portfolio / ผลงาน",
  bank_account: "สำเนาบัญชีธนาคาร",
  medical_certificate: "ใบรับรองแพทย์",
  contract: "เอกสารสัญญาจ้าง",
  other: "เอกสารอื่น",
};

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

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

async function validFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (file.size <= 0 || file.size > 10 * 1024 * 1024 || !allowedContentTypes.has(file.type) || !allowedExtensions[file.type]?.has(extension)) return false;
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (file.type === "application/pdf") return startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
  if (file.type === "application/msword") return startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06]) || startsWith(bytes, [0x50, 0x4b, 0x07, 0x08]);
  }
  if (file.type === "image/jpeg") return startsWith(bytes, [0xff, 0xd8, 0xff]);
  if (file.type === "image/png") return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return false;
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "จัดการเอกสารไม่สำเร็จ";
  if (message.includes("R2 binding")) return Response.json({ error: "พื้นที่เก็บเอกสารยังไม่พร้อม กรุณาเผยแพร่ระบบอีกครั้ง" }, { status: 503 });
  return internalApiError(error, "จัดการเอกสารไม่สำเร็จ", "employee-documents");
}

export async function POST(request: Request) {
  let uploadedStorageKey = "";
  let committed = false;
  try {
    const authentication = await authenticatedRequestGate(request);
    if (authentication.response) return authentication.response;
    const { currentUser } = authentication;
    if (currentUser.role !== "admin") return Response.json({ error: "เฉพาะ HR หรือผู้ดูแลระบบเท่านั้นที่จัดการเอกสารพนักงานได้" }, { status: 403 });
    const formData = await request.formData();
    const employeeId = String(formData.get("employeeId") ?? "");
    const documentType = String(formData.get("documentType") ?? "") as ApplicationDocumentRecord["documentType"];
    const file = formData.get("file");
    if (!employeeId || !allowedDocumentTypes.includes(documentType) || !(file instanceof File)) {
      return Response.json({ error: "กรุณาเลือกพนักงาน ประเภทเอกสาร และไฟล์ให้ครบ" }, { status: 400 });
    }
    if (!(await validFile(file))) return Response.json({ error: "ไฟล์ต้องไม่เกิน 10 MB เป็น PDF, Word, JPG หรือ PNG และมีเนื้อไฟล์ตรงกับประเภท" }, { status: 400 });

    const db = getDb();
    const [employee] = await db.select({ id: employees.id }).from(employees).where(eq(employees.id, employeeId)).limit(1);
    if (!employee) return Response.json({ error: "ไม่พบพนักงานที่เลือก" }, { status: 404 });
    if (!(await canAccessEmployee(currentUser, employeeId))) return Response.json({ error: "ไม่มีสิทธิ์อัปโหลดเอกสารของพนักงานคนนี้" }, { status: 403 });
    const allowsMultiple = documentType === "contract" || documentType === "other";
    const [existing] = allowsMultiple ? [] : await db.select().from(applicationDocuments).where(and(eq(applicationDocuments.employeeId, employeeId), eq(applicationDocuments.documentType, documentType))).limit(1);
    const safeName = file.name.normalize("NFKC").replace(/[^\p{L}\p{N}._-]+/gu, "-").slice(-140) || "document";
    const storageKey = `employee-documents/${employeeId}/${documentType}/${crypto.randomUUID()}-${safeName}`;
    const bucket = getFilesBucket();
    await bucket.put(storageKey, file.stream(), {
      httpMetadata: { contentType: file.type },
      customMetadata: { employeeId, documentType, originalName: file.name.slice(0, 180) },
    });
    uploadedStorageKey = storageKey;

    const now = new Date().toISOString();
    const document = {
      id: existing?.id ?? `doc-${crypto.randomUUID()}`,
      employeeId,
      documentType,
      title: documentTitles[documentType],
      fileName: file.name.replace(/[\r\n]/g, "").slice(0, 180),
      storageKey,
      contentType: file.type,
      sizeBytes: file.size,
      status: "pending" as const,
      note: "",
      uploadedBy: currentUser.authenticatedName,
      uploadedAt: now,
      verifiedBy: null,
      verifiedAt: null,
    };
    let savedDocument: ApplicationDocumentRecord = document;
    if (existing) {
      const [updated] = await db.update(applicationDocuments).set({
        title: document.title,
        fileName: document.fileName,
        storageKey,
        contentType: document.contentType,
        sizeBytes: document.sizeBytes,
        status: "pending",
        note: "",
        uploadedBy: document.uploadedBy,
        uploadedAt: now,
        verifiedBy: null,
        verifiedAt: null,
      }).where(and(
        eq(applicationDocuments.id, existing.id),
        eq(applicationDocuments.storageKey, existing.storageKey),
        eq(applicationDocuments.status, existing.status),
        eq(applicationDocuments.uploadedAt, existing.uploadedAt),
      )).returning();
      if (!updated) {
        try { await bucket.delete(uploadedStorageKey); } catch { /* Best-effort stale-write cleanup. */ }
        uploadedStorageKey = "";
        return Response.json({ error: "เอกสารนี้ถูกแก้ไขหรือตรวจสอบจากอีกหน้าจอ กรุณาโหลดข้อมูลล่าสุด" }, { status: 409 });
      }
      savedDocument = updated;
    } else {
      await db.insert(applicationDocuments).values(document);
    }
    committed = true;
    if (existing?.storageKey && existing.storageKey !== storageKey) {
      try { await bucket.delete(existing.storageKey); } catch { /* The newly committed file remains authoritative. */ }
    }
    return Response.json({ applicationDocument: savedDocument }, { status: 201 });
  } catch (error) {
    if (uploadedStorageKey && !committed) {
      try { await getFilesBucket().delete(uploadedStorageKey); } catch { /* Preserve the primary error. */ }
    }
    return errorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    const authentication = await authenticatedRequestGate(request);
    if (authentication.response) return authentication.response;
    const { currentUser } = authentication;
    const documentId = new URL(request.url).searchParams.get("id") ?? "";
    const db = getDb();
    const [document] = await db.select().from(applicationDocuments).where(eq(applicationDocuments.id, documentId)).limit(1);
    if (!document) return Response.json({ error: "ไม่พบเอกสารที่เลือก" }, { status: 404 });
    if (currentUser.role === "admin") {
      if (!(await canAccessEmployee(currentUser, document.employeeId))) return Response.json({ error: "ไม่มีสิทธิ์ดาวน์โหลดเอกสารนี้" }, { status: 403 });
    } else {
      if (currentUser.role !== "employee" || !currentUser.employeeId || currentUser.employeeId !== document.employeeId || document.documentType !== "contract") {
        return Response.json({ error: "ดาวน์โหลดได้เฉพาะสัญญาของตนเอง" }, { status: 403 });
      }
      const [linkedContract] = await db.select({ id: employmentContracts.id, status: employmentContracts.status }).from(employmentContracts).where(and(
        eq(employmentContracts.employeeId, currentUser.employeeId),
        eq(employmentContracts.documentId, document.id),
      )).limit(1);
      if (!linkedContract || linkedContract.status === "draft") return Response.json({ error: "เอกสารนี้ยังไม่ได้ส่งให้คุณลงนาม" }, { status: 403 });
    }
    if (!document.storageKey) return Response.json({ error: "รายการนี้นำเข้าจากแฟ้มเดิมและไม่มีไฟล์ต้นฉบับในระบบ" }, { status: 404 });
    const object = await getFilesBucket().get(document.storageKey);
    if (!object) return Response.json({ error: "ไม่พบไฟล์ต้นฉบับ" }, { status: 404 });
    return new Response(object.body, {
      headers: {
        "content-type": document.contentType || "application/octet-stream",
        "content-length": String(object.size),
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(document.fileName)}`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
