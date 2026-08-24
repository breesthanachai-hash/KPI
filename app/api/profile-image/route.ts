import { eq } from "drizzle-orm";
import { getDb, getFilesBucket } from "../../../db";
import { ensureDatabase } from "../../../db/initialize";
import { employeeProfiles, employees } from "../../../db/schema";
import { authenticateRequest, canAccessEmployee, ensureBootstrapAccounts } from "../../../lib/access-control";

export const dynamic = "force-dynamic";

const allowedContentTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "จัดการรูปโปรไฟล์ไม่สำเร็จ";
  if (message.includes("R2 binding")) return Response.json({ error: "พื้นที่เก็บรูปยังไม่พร้อม กรุณาเผยแพร่ระบบอีกครั้ง" }, { status: 503 });
  return Response.json({ error: message }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    await ensureDatabase();
    await ensureBootstrapAccounts();
    const currentUser = await authenticateRequest(request);
    if (!currentUser) return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์ใช้งาน" }, { status: 403 });
    const formData = await request.formData();
    const employeeId = String(formData.get("employeeId") ?? "");
    const file = formData.get("file");
    if (!employeeId || !(file instanceof File)) return Response.json({ error: "กรุณาเลือกพนักงานและรูปโปรไฟล์" }, { status: 400 });
    if (file.size <= 0 || file.size > 5 * 1024 * 1024) return Response.json({ error: "รูปโปรไฟล์ต้องมีขนาดไม่เกิน 5 MB" }, { status: 400 });
    if (!allowedContentTypes.has(file.type)) return Response.json({ error: "รองรับรูป JPG, PNG และ WebP เท่านั้น" }, { status: 400 });

    const db = getDb();
    const [[employee], [existingProfile]] = await Promise.all([
      db.select({ id: employees.id }).from(employees).where(eq(employees.id, employeeId)).limit(1),
      db.select().from(employeeProfiles).where(eq(employeeProfiles.employeeId, employeeId)).limit(1),
    ]);
    if (!employee) return Response.json({ error: "ไม่พบพนักงานที่เลือก" }, { status: 404 });
    if (!(await canAccessEmployee(currentUser, employeeId))) return Response.json({ error: "ไม่มีสิทธิ์แก้ไขรูปของพนักงานคนนี้" }, { status: 403 });

    const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const storageKey = `employee-profile-images/${employeeId}/${crypto.randomUUID()}.${extension}`;
    const bucket = getFilesBucket();
    await bucket.put(storageKey, file.stream(), {
      httpMetadata: { contentType: file.type },
      customMetadata: { employeeId, originalName: file.name.slice(0, 180) },
    });

    const now = new Date().toISOString();
    await db.insert(employeeProfiles).values({
      employeeId,
      profileImageKey: storageKey,
      profileImageContentType: file.type,
      profileImageUpdatedAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: employeeProfiles.employeeId,
      set: { profileImageKey: storageKey, profileImageContentType: file.type, profileImageUpdatedAt: now, updatedAt: now },
    });
    if (existingProfile?.profileImageKey && existingProfile.profileImageKey !== storageKey) await bucket.delete(existingProfile.profileImageKey);
    const [employeeProfile] = await db.select().from(employeeProfiles).where(eq(employeeProfiles.employeeId, employeeId)).limit(1);
    return Response.json({ employeeProfile }, { status: 201 });
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
    const employeeId = new URL(request.url).searchParams.get("employeeId") ?? "";
    if (!(await canAccessEmployee(currentUser, employeeId))) return Response.json({ error: "ไม่มีสิทธิ์ดูรูปของพนักงานคนนี้" }, { status: 403 });
    const db = getDb();
    const [profile] = await db.select({
      storageKey: employeeProfiles.profileImageKey,
      contentType: employeeProfiles.profileImageContentType,
    }).from(employeeProfiles).where(eq(employeeProfiles.employeeId, employeeId)).limit(1);
    if (!profile?.storageKey) return Response.json({ error: "พนักงานคนนี้ยังไม่มีรูปโปรไฟล์" }, { status: 404 });
    const object = await getFilesBucket().get(profile.storageKey);
    if (!object) return Response.json({ error: "ไม่พบไฟล์รูปโปรไฟล์" }, { status: 404 });
    return new Response(object.body, {
      headers: {
        "content-type": profile.contentType || "image/jpeg",
        "content-length": String(object.size),
        "cache-control": "private, max-age=3600",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
