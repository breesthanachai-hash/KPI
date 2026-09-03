import { and, eq } from "drizzle-orm";
import { getDb, getFilesBucket } from "../../../db";
import { employees, workItems, workSubmissions } from "../../../db/schema";
import type { WorkSubmissionRecord } from "../../../lib/kpi-data";
import { authenticatedRequestGate, canAccessEmployee } from "../../../lib/access-control";
import { internalApiError } from "../../../lib/api-errors";

export const dynamic = "force-dynamic";

const allowedSubmissionTypes: WorkSubmissionRecord["submissionType"][] = ["video", "drive", "social", "document", "design", "code", "sales", "service", "hr", "other"];
const allowedContentTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "application/zip",
]);
const allowedExtensions: Record<string, Set<string>> = {
  "application/pdf": new Set(["pdf"]),
  "application/msword": new Set(["doc"]),
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": new Set(["docx"]),
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": new Set(["xlsx"]),
  "text/csv": new Set(["csv"]),
  "text/plain": new Set(["txt"]),
  "image/jpeg": new Set(["jpg", "jpeg"]),
  "image/png": new Set(["png"]),
  "image/webp": new Set(["webp"]),
  "video/mp4": new Set(["mp4"]),
  "application/zip": new Set(["zip"]),
};

function startsWith(bytes: Uint8Array, signature: number[], offset = 0) {
  return signature.every((value, index) => bytes[offset + index] === value);
}

async function validSubmissionFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (file.size <= 0 || file.size > 25 * 1024 * 1024 || !allowedContentTypes.has(file.type) || !allowedExtensions[file.type]?.has(extension)) return false;
  const bytes = new Uint8Array(await file.slice(0, 512).arrayBuffer());
  if (file.type === "application/pdf") return startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
  if (file.type === "application/msword") return startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || file.type === "application/zip") {
    return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06]) || startsWith(bytes, [0x50, 0x4b, 0x07, 0x08]);
  }
  if (file.type === "image/jpeg") return startsWith(bytes, [0xff, 0xd8, 0xff]);
  if (file.type === "image/png") return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (file.type === "image/webp") return startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8);
  if (file.type === "video/mp4") return startsWith(bytes, [0x66, 0x74, 0x79, 0x70], 4);
  if (file.type === "text/csv" || file.type === "text/plain") {
    if (bytes.includes(0)) return false;
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

function isSafeWebUrl(value: string) {
  if (!value) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "ส่งหลักฐานงานไม่สำเร็จ";
  if (message.includes("R2 binding")) return Response.json({ error: "พื้นที่เก็บไฟล์หลักฐานยังไม่พร้อม กรุณาเผยแพร่ระบบอีกครั้ง" }, { status: 503 });
  if (message.includes("WORK_SUBMISSION_INVALID_STATE")) {
    return Response.json({ error: "งานนี้ถูกส่งตรวจ ปิดงาน หรือเปลี่ยนผู้รับผิดชอบแล้ว กรุณาโหลดข้อมูลล่าสุด" }, { status: 409 });
  }
  if (message.includes("UNIQUE constraint failed") && message.includes("work_submissions")) {
    return Response.json({ error: "งานนี้มีหลักฐานรอตรวจอยู่แล้ว กรุณาโหลดข้อมูลล่าสุด" }, { status: 409 });
  }
  return internalApiError(error, "ส่งหลักฐานงานไม่สำเร็จ", "work-submissions");
}

export async function POST(request: Request) {
  let uploadedStorageKey = "";
  let submissionCommitted = false;
  try {
    const authentication = await authenticatedRequestGate(request);
    if (authentication.response) return authentication.response;
    const { currentUser } = authentication;
    const formData = await request.formData();
    const workItemId = String(formData.get("workItemId") ?? "");
    const submissionType = String(formData.get("submissionType") ?? "other") as WorkSubmissionRecord["submissionType"];
    const title = String(formData.get("title") ?? "").trim().slice(0, 180);
    const linkUrl = String(formData.get("linkUrl") ?? "").trim().slice(0, 1200);
    const note = String(formData.get("note") ?? "").trim().slice(0, 2000);
    const fileValue = formData.get("file");
    const file = fileValue instanceof File && fileValue.size > 0 ? fileValue : null;
    if (!workItemId || !title || !allowedSubmissionTypes.includes(submissionType)) return Response.json({ error: "กรุณาระบุงาน ประเภทหลักฐาน และชื่อผลงาน" }, { status: 400 });
    if (!linkUrl && !file) return Response.json({ error: "กรุณาแนบลิงก์ผลงานหรือไฟล์หลักฐานอย่างน้อย 1 รายการ" }, { status: 400 });
    if (!isSafeWebUrl(linkUrl)) return Response.json({ error: "ลิงก์ผลงานต้องขึ้นต้นด้วย http:// หรือ https://" }, { status: 400 });
    if (file && !(await validSubmissionFile(file))) return Response.json({ error: "ไฟล์ต้องไม่เกิน 25 MB เป็น PDF, Word, Excel, CSV, รูปภาพ, MP4, TXT หรือ ZIP และมีเนื้อไฟล์ตรงกับประเภท" }, { status: 400 });

    const db = getDb();
    const [workItem] = await db.select().from(workItems).where(eq(workItems.id, workItemId)).limit(1);
    if (!workItem) return Response.json({ error: "ไม่พบงานที่เลือก" }, { status: 404 });
    if (currentUser.role !== "employee" || !currentUser.employeeId || currentUser.employeeId !== workItem.assigneeEmployeeId) return Response.json({ error: "เฉพาะพนักงานผู้รับผิดชอบงานเท่านั้นที่ส่งหลักฐานได้ HR และหัวหน้าทีมไม่สามารถส่งแทน" }, { status: 403 });
    if (workItem.status === "review" || workItem.status === "done") return Response.json({ error: "งานนี้ส่งตรวจหรือปิดแล้ว กรุณารอผลตรวจก่อนส่งใหม่" }, { status: 409 });
    const [pendingSubmission] = await db.select({ id: workSubmissions.id }).from(workSubmissions).where(and(eq(workSubmissions.workItemId, workItemId), eq(workSubmissions.status, "submitted"))).limit(1);
    if (pendingSubmission) return Response.json({ error: "งานนี้มีหลักฐานรอตรวจอยู่แล้ว" }, { status: 409 });
    const [employee] = await db.select({ id: employees.id }).from(employees).where(and(eq(employees.id, workItem.assigneeEmployeeId), eq(employees.status, "active"))).limit(1);
    if (!employee) return Response.json({ error: "ไม่พบพนักงานผู้รับผิดชอบ" }, { status: 404 });

    let storageKey = "";
    let fileName = "";
    let contentType = "application/octet-stream";
    let sizeBytes = 0;
    if (file) {
      const safeName = file.name.normalize("NFKC").replace(/[^\p{L}\p{N}._-]+/gu, "-").slice(-140) || "work-proof";
      storageKey = `work-submissions/${workItemId}/${crypto.randomUUID()}-${safeName}`;
      fileName = file.name.replace(/[\r\n]/g, "").slice(0, 180);
      contentType = file.type;
      sizeBytes = file.size;
      await getFilesBucket().put(storageKey, file.stream(), {
        httpMetadata: { contentType: file.type },
        customMetadata: { workItemId, employeeId: workItem.assigneeEmployeeId, originalName: file.name.slice(0, 180) },
      });
      uploadedStorageKey = storageKey;
    }

    const now = new Date().toISOString();
    const submission: WorkSubmissionRecord = {
      id: `submission-${crypto.randomUUID()}`,
      workItemId,
      employeeId: workItem.assigneeEmployeeId,
      submissionType,
      title,
      linkUrl,
      note,
      fileName,
      storageKey,
      contentType,
      sizeBytes,
      status: "submitted",
      submittedBy: currentUser.authenticatedName,
      submittedAt: now,
      reviewedBy: null,
      reviewedAt: null,
      reviewerNote: "",
    };
    const updatedWorkItem = { ...workItem, status: "review" as const, progress: Math.max(90, Math.min(99, workItem.progress)), updatedAt: now };
    await db.batch([
      db.insert(workSubmissions).values(submission),
      db.update(workItems).set({ status: updatedWorkItem.status, progress: updatedWorkItem.progress, updatedAt: now }).where(and(eq(workItems.id, workItemId), eq(workItems.assigneeEmployeeId, workItem.assigneeEmployeeId))),
    ]);
    submissionCommitted = true;
    return Response.json({ workSubmission: submission, workItem: updatedWorkItem }, { status: 201 });
  } catch (error) {
    if (uploadedStorageKey && !submissionCommitted) {
      try {
        await getFilesBucket().delete(uploadedStorageKey);
      } catch {
        // Preserve the database error; orphan cleanup is best effort.
      }
    }
    return errorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    const authentication = await authenticatedRequestGate(request);
    if (authentication.response) return authentication.response;
    const { currentUser } = authentication;
    const submissionId = new URL(request.url).searchParams.get("id") ?? "";
    const db = getDb();
    const [submission] = await db.select().from(workSubmissions).where(eq(workSubmissions.id, submissionId)).limit(1);
    if (!submission?.storageKey) return Response.json({ error: "หลักฐานรายการนี้ไม่มีไฟล์แนบ" }, { status: 404 });
    if (!(await canAccessEmployee(currentUser, submission.employeeId))) return Response.json({ error: "ไม่มีสิทธิ์ดาวน์โหลดหลักฐานนี้" }, { status: 403 });
    const object = await getFilesBucket().get(submission.storageKey);
    if (!object) return Response.json({ error: "ไม่พบไฟล์หลักฐาน" }, { status: 404 });
    return new Response(object.body, {
      headers: {
        "content-type": submission.contentType || "application/octet-stream",
        "content-length": String(object.size),
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(submission.fileName)}`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
