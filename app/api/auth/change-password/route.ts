import { ensureDatabase } from "../../../../db/initialize";
import {
  authenticateRequest,
  authRequiredResponse,
  ensureBootstrapAccounts,
  privateNoStoreHeaders,
  sameOriginRequiredResponse,
  unsafeRequestIsSameOrigin,
} from "../../../../lib/access-control";
import { AuthInputError, changePasswordForUser } from "../../../../lib/auth-service";
import { internalApiError } from "../../../../lib/api-errors";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!unsafeRequestIsSameOrigin(request)) return sameOriginRequiredResponse();
  try {
    await ensureDatabase();
    await ensureBootstrapAccounts();
    const currentUser = await authenticateRequest(request);
    if (!currentUser) return authRequiredResponse();
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > 4096) return Response.json({ error: "ข้อมูลคำขอมีขนาดใหญ่เกินไป" }, { status: 413, headers: privateNoStoreHeaders });
    const payload = await request.json().catch(() => null) as { newPassword?: unknown; currentPassword?: unknown } | null;
    const session = await changePasswordForUser(request, currentUser, payload?.newPassword, payload?.currentPassword);
    const headers = new Headers(privateNoStoreHeaders);
    headers.append("set-cookie", session.cookie);
    return Response.json({ authenticated: true, changed: true, mustChangePassword: false }, { headers });
  } catch (error) {
    if (error instanceof AuthInputError) return Response.json({ error: error.message }, { status: error.status, headers: privateNoStoreHeaders });
    return internalApiError(error, "เปลี่ยนรหัสผ่านไม่สำเร็จ", "auth-change-password");
  }
}
