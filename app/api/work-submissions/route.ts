import { and, eq } from "drizzle-orm";
import { getDb, getFilesBucket } from "../../../db";
import { ensureDatabase } from "../../../db/initialize";
import { employees, workItems, workSubmissions } from "../../../db/schema";
import type { WorkSubmissionRecord } from "../../../lib/kpi-data";
import { authenticateRequest, canAccessEmployee, ensureBootstrapAccounts } from "../../../lib/access-control";

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

function actorName(request: Request) {
  const encodedName = request.headers.get("oai-authenticated-user-full-name");
  if (encodedName && request.headers.get("oai-authenticated-user-full-name-encoding") === "percent-encoded-utf-8") {
    try {
      return decodeURIComponent(encodedName);
    } catch {
      // Fall back to email.
    }
  }
  return request.headers.get("oai-authenticated-user-email") ?? "พนักงาน People Pulse";
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
  return Response.json({ error: message }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    await ensureDatabase();
    await ensureBootstrapAccounts();
    const currentUser = await authenticateRequest(request);
    if (!currentUser) return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์ใช้งาน" }, { status: 403 });
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
    if (file && (file.size > 25 * 1024 * 1024 || !allowedContentTypes.has(file.type))) return Response.json({ error: "ไฟล์ต้องไม่เกิน 25 MB และเป็น PDF, Word, Excel, CSV, รูปภาพ, MP4, TXT หรือ ZIP" }, { status: 400 });

    const db = getDb();
    const [workItem] = await db.select().from(workItems).where(eq(workItems.id, workItemId)).limit(1);
    if (!workItem) return Response.json({ error: "ไม่พบงานที่เลือก" }, { status: 404 });
    if (!(await canAccessEmployee(currentUser, workItem.assigneeEmployeeId))) return Response.json({ error: "ส่งหลักฐานได้เฉพาะงานที่อยู่ในสิทธิ์ของคุณ" }, { status: 403 });
    if (workItem.status === "review" || workItem.status === "done") return Response.json({ error: "งานนี้ส่งตรวจหรือปิดแล้ว กรุณารอผลตรวจก่อนส่งใหม่" }, { status: 409 });
    const [pendingSubmission] = await db.select({ id: workSubmissions.id }).from(workSubmissions).where(and(eq(workSubmissions.workItemId, workItemId), eq(workSubmissions.status, "submitted"))).limit(1);
    if (pendingSubmission) return Response.json({ error: "งานนี้มีหลักฐานรอตรวจอยู่แล้ว" }, { status: 409 });
    const [employee] = await db.select({ id: employees.id }).from(employees).where(eq(employees.id, workItem.assigneeEmployeeId)).limit(1);
    if (!employee) return Response.json({ error: "ไม่พบพนักงานผู้รับผิดชอบ" }, { status: 404 });

    let storageKey = "";
    let fileName = "";
    let contentType = "application/octet-stream";
    let sizeBytes = 0;
    if (file) {
      const safeName = file.name.normalize("NFKC").replace(/[^\p{L}\p{N}._-]+/gu, "-").slice(-140) || "work-proof";
      storageKey = `work-submissions/${workItemId}/${crypto.randomUUID()}-${safeName}`;
      fileName = file.name.slice(0, 180);
      contentType = file.type;
      sizeBytes = file.size;
      await getFilesBucket().put(storageKey, file.stream(), {
        httpMetadata: { contentType: file.type },
        customMetadata: { workItemId, employeeId: workItem.assigneeEmployeeId, originalName: file.name.slice(0, 180) },
      });
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
      submittedBy: actorName(request),
      submittedAt: now,
      reviewedBy: null,
      reviewedAt: null,
      reviewerNote: "",
    };
    await db.insert(workSubmissions).values(submission);
    const updatedWorkItem = { ...workItem, status: "review" as const, progress: Math.max(90, Math.min(99, workItem.progress)), updatedAt: now };
    await db.update(workItems).set({ status: updatedWorkItem.status, progress: updatedWorkItem.progress, updatedAt: now }).where(eq(workItems.id, workItemId));
    return Response.json({ workSubmission: submission, workItem: updatedWorkItem }, { status: 201 });
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
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
