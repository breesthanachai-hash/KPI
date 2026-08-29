import { and, eq } from "drizzle-orm";
import { getDb, getFilesBucket } from "../../../db";
import { ensureDatabase } from "../../../db/initialize";
import { employeeProfiles, employees } from "../../../db/schema";
import { authenticateRequest, authenticatedIdentity, canAccessEmployee, ensureBootstrapAccounts } from "../../../lib/access-control";
import { internalApiError } from "../../../lib/api-errors";

export const dynamic = "force-dynamic";

const allowedContentTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const allowedExtensions: Record<string, Set<string>> = {
  "image/jpeg": new Set(["jpg", "jpeg"]),
  "image/png": new Set(["png"]),
  "image/webp": new Set(["webp"]),
};

function startsWith(bytes: Uint8Array, signature: number[], offset = 0) {
  return signature.every((value, index) => bytes[offset + index] === value);
}

async function validImage(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (file.size <= 0 || file.size > 5 * 1024 * 1024 || !allowedContentTypes.has(file.type) || !allowedExtensions[file.type]?.has(extension)) return false;
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (file.type === "image/jpeg") return startsWith(bytes, [0xff, 0xd8, 0xff]);
  if (file.type === "image/png") return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (file.type === "image/webp") return startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8);
  return false;
}

function validStorageKey(employeeId: string, storageKey: string) {
  const prefix = `employee-profile-images/${employeeId}/`;
  return storageKey.startsWith(prefix) && storageKey.length > prefix.length;
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "จัดการรูปโปรไฟล์ไม่สำเร็จ";
  if (message.includes("R2 binding")) return Response.json({ error: "พื้นที่เก็บรูปยังไม่พร้อม กรุณาเผยแพร่ระบบอีกครั้ง" }, { status: 503 });
  if (message.includes("UNIQUE constraint failed")) return Response.json({ error: "โปรไฟล์ถูกสร้างหรือแก้ไขพร้อมกัน กรุณาโหลดข้อมูลล่าสุด" }, { status: 409 });
  return internalApiError(error, "จัดการรูปโปรไฟล์ไม่สำเร็จ", "profile-image");
}

export async function POST(request: Request) {
  let uploadedStorageKey = "";
  let committed = false;
  try {
    if (!authenticatedIdentity(request)) return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์ใช้งาน" }, { status: 403 });
    await ensureDatabase();
    await ensureBootstrapAccounts();
    const currentUser = await authenticateRequest(request);
    if (!currentUser) return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์ใช้งาน" }, { status: 403 });
    const formData = await request.formData();
    const employeeId = String(formData.get("employeeId") ?? "");
    const file = formData.get("file");
    if (!employeeId || !(file instanceof File)) return Response.json({ error: "กรุณาเลือกพนักงานและรูปโปรไฟล์" }, { status: 400 });
    if (!(await validImage(file))) return Response.json({ error: "รูปต้องไม่เกิน 5 MB เป็น JPG, PNG หรือ WebP และมีเนื้อไฟล์ตรงกับประเภท" }, { status: 400 });

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
    uploadedStorageKey = storageKey;

    const now = new Date().toISOString();
    if (existingProfile) {
      const [updated] = await db.update(employeeProfiles).set({
        profileImageKey: storageKey,
        profileImageContentType: file.type,
        profileImageUpdatedAt: now,
        updatedAt: now,
      }).where(and(
        eq(employeeProfiles.employeeId, employeeId),
        eq(employeeProfiles.profileImageKey, existingProfile.profileImageKey),
        eq(employeeProfiles.updatedAt, existingProfile.updatedAt),
      )).returning();
      if (!updated) {
        try { await bucket.delete(uploadedStorageKey); } catch { /* Best-effort stale-write cleanup. */ }
        uploadedStorageKey = "";
        return Response.json({ error: "รูปหรือโปรไฟล์ถูกแก้ไขจากอีกหน้าจอ กรุณาโหลดข้อมูลล่าสุด" }, { status: 409 });
      }
    } else {
      await db.insert(employeeProfiles).values({
        employeeId,
        profileImageKey: storageKey,
        profileImageContentType: file.type,
        profileImageUpdatedAt: now,
        updatedAt: now,
      });
    }
    committed = true;
    if (existingProfile?.profileImageKey && existingProfile.profileImageKey !== storageKey && validStorageKey(employeeId, existingProfile.profileImageKey)) {
      try { await bucket.delete(existingProfile.profileImageKey); } catch { /* The newly committed image remains authoritative. */ }
    }
    const [employeeProfile] = await db.select().from(employeeProfiles).where(eq(employeeProfiles.employeeId, employeeId)).limit(1);
    return Response.json({ employeeProfile }, { status: 201 });
  } catch (error) {
    if (uploadedStorageKey && !committed) {
      try { await getFilesBucket().delete(uploadedStorageKey); } catch { /* Preserve the primary error. */ }
    }
    return errorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    if (!authenticatedIdentity(request)) return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์ใช้งาน" }, { status: 403 });
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
    if (!profile?.storageKey || !validStorageKey(employeeId, profile.storageKey)) return Response.json({ error: "พนักงานคนนี้ยังไม่มีรูปโปรไฟล์" }, { status: 404 });
    const object = await getFilesBucket().get(profile.storageKey);
    if (!object) return Response.json({ error: "ไม่พบไฟล์รูปโปรไฟล์" }, { status: 404 });
    return new Response(object.body, {
      headers: {
        "content-type": profile.contentType || "image/jpeg",
        "content-length": String(object.size),
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
