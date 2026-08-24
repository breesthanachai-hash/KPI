import { and, eq } from "drizzle-orm";
import { getDb, getFilesBucket } from "../../../db";
import { ensureDatabase } from "../../../db/initialize";
import { applicationDocuments, employees } from "../../../db/schema";
import type { ApplicationDocumentRecord } from "../../../lib/kpi-data";
import { authenticateRequest, canAccessEmployee, ensureBootstrapAccounts } from "../../../lib/access-control";

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

function actorName(request: Request) {
  const encodedName = request.headers.get("oai-authenticated-user-full-name");
  const encoding = request.headers.get("oai-authenticated-user-full-name-encoding");
  if (encodedName && encoding === "percent-encoded-utf-8") {
    try {
      return decodeURIComponent(encodedName);
    } catch {
      // Fall back to email.
    }
  }
  return request.headers.get("oai-authenticated-user-email") ?? "ฝ่ายทรัพยากรบุคคล";
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "จัดการเอกสารไม่สำเร็จ";
  if (message.includes("R2 binding")) return Response.json({ error: "พื้นที่เก็บเอกสารยังไม่พร้อม กรุณาเผยแพร่ระบบอีกครั้ง" }, { status: 503 });
  return Response.json({ error: message }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    await ensureDatabase();
    await ensureBootstrapAccounts();
    const currentUser = await authenticateRequest(request);
    if (!currentUser) return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์ใช้งาน" }, { status: 403 });
    if (currentUser.role !== "admin") return Response.json({ error: "เฉพาะ HR หรือผู้ดูแลระบบเท่านั้นที่จัดการเอกสารพนักงานได้" }, { status: 403 });
    const formData = await request.formData();
    const employeeId = String(formData.get("employeeId") ?? "");
    const documentType = String(formData.get("documentType") ?? "") as ApplicationDocumentRecord["documentType"];
    const file = formData.get("file");
    if (!employeeId || !allowedDocumentTypes.includes(documentType) || !(file instanceof File)) {
      return Response.json({ error: "กรุณาเลือกพนักงาน ประเภทเอกสาร และไฟล์ให้ครบ" }, { status: 400 });
    }
    if (file.size <= 0 || file.size > 10 * 1024 * 1024) return Response.json({ error: "ไฟล์ต้องมีขนาดไม่เกิน 10 MB" }, { status: 400 });
    if (!allowedContentTypes.has(file.type)) return Response.json({ error: "รองรับไฟล์ PDF, Word, JPG และ PNG เท่านั้น" }, { status: 400 });

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

    const now = new Date().toISOString();
    const document = {
      id: existing?.id ?? `doc-${crypto.randomUUID()}`,
      employeeId,
      documentType,
      title: documentTitles[documentType],
      fileName: file.name.slice(0, 180),
      storageKey,
      contentType: file.type,
      sizeBytes: file.size,
      status: "pending" as const,
      note: "",
      uploadedBy: actorName(request),
      uploadedAt: now,
      verifiedBy: null,
      verifiedAt: null,
    };
    if (existing) {
      await db.update(applicationDocuments).set({
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
      }).where(eq(applicationDocuments.id, existing.id));
    } else {
      await db.insert(applicationDocuments).values(document);
    }
    if (existing?.storageKey && existing.storageKey !== storageKey) await bucket.delete(existing.storageKey);
    return Response.json({ applicationDocument: document }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    await ensureDatabase();
    await ensureBootstrapAccounts();
    const currentUser = await authenticateRequest(request);
    if (!currentUser) return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์ใช้งาน" }, { status: 403 });
    if (currentUser.role !== "admin") return Response.json({ error: "เฉพาะ HR หรือผู้ดูแลระบบเท่านั้นที่ดาวน์โหลดเอกสารพนักงานได้" }, { status: 403 });
    const documentId = new URL(request.url).searchParams.get("id") ?? "";
    const db = getDb();
    const [document] = await db.select().from(applicationDocuments).where(eq(applicationDocuments.id, documentId)).limit(1);
    if (!document) return Response.json({ error: "ไม่พบเอกสารที่เลือก" }, { status: 404 });
    if (!(await canAccessEmployee(currentUser, document.employeeId))) return Response.json({ error: "ไม่มีสิทธิ์ดาวน์โหลดเอกสารนี้" }, { status: 403 });
    if (!document.storageKey) return Response.json({ error: "รายการนี้นำเข้าจากแฟ้มเดิมและไม่มีไฟล์ต้นฉบับในระบบ" }, { status: 404 });
    const object = await getFilesBucket().get(document.storageKey);
    if (!object) return Response.json({ error: "ไม่พบไฟล์ต้นฉบับ" }, { status: 404 });
    return new Response(object.body, {
      headers: {
        "content-type": document.contentType || "application/octet-stream",
        "content-length": String(object.size),
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(document.fileName)}`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
