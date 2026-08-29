import { and, eq } from "drizzle-orm";
import { getDb, getFilesBucket } from "../../../db";
import { ensureDatabase } from "../../../db/initialize";
import { organizationDocuments } from "../../../db/schema";
import type { OrganizationDocumentRecord } from "../../../lib/kpi-data";
import { authenticateRequest, authenticatedIdentity, ensureBootstrapAccounts } from "../../../lib/access-control";
import { internalApiError } from "../../../lib/api-errors";

export const dynamic = "force-dynamic";

const categories: OrganizationDocumentRecord["category"][] = ["lease", "employment", "hr", "legal", "finance", "operations", "other"];
const statuses: OrganizationDocumentRecord["status"][] = ["draft", "active", "expired", "archived"];
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

function actor(currentUser: Awaited<ReturnType<typeof authenticateRequest>>) {
  if (!currentUser) return { userId: "", name: "ฝ่ายทรัพยากรบุคคล" };
  return { userId: currentUser.authUserId || currentUser.id, name: currentUser.authenticatedName || currentUser.displayName };
}

function publicDocument(document: typeof organizationDocuments.$inferSelect) {
  const { storageKey, ...safe } = document;
  return { ...safe, hasFile: Boolean(storageKey) };
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "จัดการเอกสารองค์กรไม่สำเร็จ";
  if (message.includes("R2 binding")) return Response.json({ error: "พื้นที่เก็บเอกสารยังไม่พร้อม" }, { status: 503 });
  if (message.includes("ORGANIZATION_DOCUMENT_STALE_REVISION")) return Response.json({ error: "เอกสารถูกแก้ไขจากอีกหน้าจอ กรุณาโหลดข้อมูลล่าสุด" }, { status: 409 });
  if (message.includes("UNIQUE constraint failed")) return Response.json({ error: "เลขที่เอกสารและเวอร์ชันนี้มีอยู่แล้ว" }, { status: 409 });
  return internalApiError(error, "จัดการเอกสารองค์กรไม่สำเร็จ", "organization-documents");
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
    if (!currentUser) return Response.json({ error: "เฉพาะ HR หรือผู้ดูแลระบบเท่านั้นที่ดาวน์โหลดเอกสารองค์กรได้" }, { status: 403 });
    const documentId = new URL(request.url).searchParams.get("id")?.trim() ?? "";
    if (!documentId) return Response.json({ error: "กรุณาเลือกเอกสาร" }, { status: 400 });
    const [document] = await getDb().select().from(organizationDocuments).where(eq(organizationDocuments.id, documentId)).limit(1);
    if (!document?.storageKey) return Response.json({ error: "เอกสารรายการนี้ไม่มีไฟล์แนบ" }, { status: 404 });
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

export async function POST(request: Request) {
  let uploadedStorageKey = "";
  let committed = false;
  try {
    const currentUser = await requireAdmin(request);
    if (!currentUser) return Response.json({ error: "เฉพาะ HR หรือผู้ดูแลระบบเท่านั้นที่จัดการเอกสารองค์กรได้" }, { status: 403 });
    const formData = await request.formData();
    const documentId = cleanText(formData.get("documentId"), 100);
    const title = cleanText(formData.get("title"), 220);
    const category = cleanText(formData.get("category"), 40) as OrganizationDocumentRecord["category"];
    const description = cleanText(formData.get("description"), 2000);
    const documentNumber = cleanText(formData.get("documentNumber"), 80);
    const version = cleanText(formData.get("version"), 30);
    const owner = cleanText(formData.get("owner"), 160);
    const effectiveDate = cleanText(formData.get("effectiveDate"), 10);
    const expiryDateInput = cleanText(formData.get("expiryDate"), 10);
    const note = cleanText(formData.get("note"), 2000);
    const requestedStatus = cleanText(formData.get("status"), 20) || "draft";
    const expectedRevision = Number(formData.get("expectedRevision"));
    const fileValue = formData.get("file");
    const file = fileValue instanceof File && fileValue.size > 0 ? fileValue : null;
    if (!title || !documentNumber || !version || !owner || !categories.includes(category)) return Response.json({ error: "กรุณาระบุชื่อ หมวด เลขที่ เวอร์ชัน และเจ้าของเอกสารให้ครบ" }, { status: 400 });
    if (requestedStatus !== "draft" && requestedStatus !== "active") return Response.json({ error: "เอกสารใหม่เลือกได้เฉพาะสถานะฉบับร่างหรือกำลังใช้งาน" }, { status: 400 });
    if ((effectiveDate && !isIsoDay(effectiveDate)) || (expiryDateInput && !isIsoDay(expiryDateInput))) return Response.json({ error: "รูปแบบวันที่ไม่ถูกต้อง" }, { status: 400 });
    if (effectiveDate && expiryDateInput && expiryDateInput < effectiveDate) return Response.json({ error: "วันหมดอายุต้องไม่ก่อนวันที่มีผล" }, { status: 400 });
    if (file && !(await validFile(file))) return Response.json({ error: "ไฟล์ต้องไม่เกิน 10 MB เป็น PDF, Word, JPG หรือ PNG และมีเนื้อไฟล์ตรงกับประเภท" }, { status: 400 });

    const db = getDb();
    const [existing] = documentId ? await db.select().from(organizationDocuments).where(eq(organizationDocuments.id, documentId)).limit(1) : [];
    if (documentId && !existing) return Response.json({ error: "ไม่พบเอกสารที่เลือก" }, { status: 404 });
    if (!existing && !file) return Response.json({ error: "กรุณาแนบไฟล์เอกสารก่อนบันทึก" }, { status: 400 });
    if (existing && existing.status !== "draft") return Response.json({ error: "แก้ไขเนื้อหาหรือไฟล์ได้เฉพาะเอกสารฉบับร่าง" }, { status: 409 });
    if (existing && (!Number.isInteger(expectedRevision) || expectedRevision < 0)) return Response.json({ error: "ขาด revision สำหรับป้องกันการแก้ไขชนกัน" }, { status: 400 });

    const id = existing?.id ?? `organization-document-${crypto.randomUUID()}`;
    let fileName = existing?.fileName ?? "";
    let storageKey = existing?.storageKey ?? "";
    let contentType = existing?.contentType ?? "application/octet-stream";
    let sizeBytes = existing?.sizeBytes ?? 0;
    if (file) {
      const safeName = file.name.normalize("NFKC").replace(/[^\p{L}\p{N}._-]+/gu, "-").slice(-140) || "organization-document";
      storageKey = `organization-documents/${id}/${crypto.randomUUID()}-${safeName}`;
      fileName = file.name.replace(/[\r\n]/g, "").slice(0, 180);
      contentType = file.type;
      sizeBytes = file.size;
      await getFilesBucket().put(storageKey, file.stream(), {
        httpMetadata: { contentType: file.type },
        customMetadata: { documentId: id, category, originalName: fileName },
      });
      uploadedStorageKey = storageKey;
    }

    const now = new Date().toISOString();
    const acting = actor(currentUser);
    if (!existing) {
      const document = {
        id, title, category, description, documentNumber, version, status: requestedStatus as "draft" | "active", owner,
        effectiveDate, expiryDate: expiryDateInput || null, note, fileName, storageKey, contentType, sizeBytes,
        revision: 0, createdByUserId: acting.userId, createdBy: acting.name, createdAt: now,
        updatedByUserId: acting.userId, updatedBy: acting.name, updatedAt: now,
      };
      await db.insert(organizationDocuments).values(document);
      committed = true;
      return Response.json({ organizationDocument: publicDocument(document) }, { status: 201 });
    }

    const [updated] = await db.update(organizationDocuments).set({
      title, category, description, documentNumber, version, owner, effectiveDate, expiryDate: expiryDateInput || null,
      note, fileName, storageKey, contentType, sizeBytes, revision: expectedRevision + 1,
      updatedByUserId: acting.userId, updatedBy: acting.name, updatedAt: now,
    }).where(and(eq(organizationDocuments.id, existing.id), eq(organizationDocuments.revision, expectedRevision))).returning();
    if (!updated) {
      if (uploadedStorageKey) {
        try { await getFilesBucket().delete(uploadedStorageKey); } catch { /* Best-effort cleanup after a stale write. */ }
        uploadedStorageKey = "";
      }
      return Response.json({ error: "เอกสารถูกแก้ไขจากอีกหน้าจอ กรุณาโหลดข้อมูลล่าสุด" }, { status: 409 });
    }
    committed = true;
    if (uploadedStorageKey && existing.storageKey && existing.storageKey !== uploadedStorageKey) {
      try { await getFilesBucket().delete(existing.storageKey); } catch { /* New committed file remains authoritative. */ }
    }
    return Response.json({ organizationDocument: publicDocument(updated) });
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
    if (!currentUser) return Response.json({ error: "เฉพาะ HR หรือผู้ดูแลระบบเท่านั้นที่เปลี่ยนสถานะเอกสารได้" }, { status: 403 });
    const payload = await request.json() as { id?: unknown; documentId?: unknown; status?: unknown; expectedRevision?: unknown };
    const rawDocumentId = typeof payload.documentId === "string" ? payload.documentId : typeof payload.id === "string" ? payload.id : "";
    const documentId = rawDocumentId.trim().slice(0, 100);
    const status = typeof payload.status === "string" ? payload.status as OrganizationDocumentRecord["status"] : "" as OrganizationDocumentRecord["status"];
    const expectedRevision = Number(payload.expectedRevision);
    if (!documentId || !statuses.includes(status) || !Number.isInteger(expectedRevision) || expectedRevision < 0) return Response.json({ error: "คำขอเปลี่ยนสถานะไม่ถูกต้อง" }, { status: 400 });
    const db = getDb();
    const [document] = await db.select().from(organizationDocuments).where(eq(organizationDocuments.id, documentId)).limit(1);
    if (!document) return Response.json({ error: "ไม่พบเอกสารที่เลือก" }, { status: 404 });
    if (document.revision !== expectedRevision) return Response.json({ error: "เอกสารถูกแก้ไขจากอีกหน้าจอ กรุณาโหลดข้อมูลล่าสุด" }, { status: 409 });
    if (status === document.status) return Response.json({ organizationDocument: publicDocument(document) });
    const allowedTransitions: Record<OrganizationDocumentRecord["status"], OrganizationDocumentRecord["status"][]> = {
      draft: ["active", "archived"], active: ["expired", "archived"], expired: ["active", "archived"], archived: [],
    };
    if (!allowedTransitions[document.status].includes(status)) return Response.json({ error: "ไม่สามารถเปลี่ยนสถานะตามลำดับนี้ได้" }, { status: 409 });
    if (status === "active" && !document.storageKey) return Response.json({ error: "กรุณาแนบไฟล์ก่อนเปิดใช้เอกสาร" }, { status: 400 });
    const acting = actor(currentUser);
    const [updated] = await db.update(organizationDocuments).set({
      status, revision: expectedRevision + 1, updatedByUserId: acting.userId, updatedBy: acting.name, updatedAt: new Date().toISOString(),
    }).where(and(eq(organizationDocuments.id, documentId), eq(organizationDocuments.revision, expectedRevision))).returning();
    if (!updated) return Response.json({ error: "เอกสารถูกแก้ไขจากอีกหน้าจอ กรุณาโหลดข้อมูลล่าสุด" }, { status: 409 });
    return Response.json({ organizationDocument: publicDocument(updated) });
  } catch (error) {
    return errorResponse(error);
  }
}
