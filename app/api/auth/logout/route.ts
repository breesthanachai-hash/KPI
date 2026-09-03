import { ensureDatabase } from "../../../../db/initialize";
import {
  authenticateRequest,
  clearSessionCookie,
  ensureBootstrapAccounts,
  privateNoStoreHeaders,
  recordAuthEvent,
  revokeAllSessionsForAccount,
  revokeRequestSession,
  sameOriginRequiredResponse,
  unsafeRequestIsSameOrigin,
} from "../../../../lib/access-control";
import { requestSourceHash } from "../../../../lib/auth-service";
import { internalApiError } from "../../../../lib/api-errors";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!unsafeRequestIsSameOrigin(request)) return sameOriginRequiredResponse();
  try {
    await ensureDatabase();
    await ensureBootstrapAccounts();
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      const headers = new Headers(privateNoStoreHeaders);
      headers.append("set-cookie", clearSessionCookie(request));
      return Response.json({ loggedOut: true }, { headers });
    }
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > 2048) return Response.json({ error: "ข้อมูลคำขอไม่ถูกต้อง" }, { status: 400, headers: privateNoStoreHeaders });
    const payload = await request.json().catch(() => ({})) as { allDevices?: unknown };
    if (payload.allDevices === true) await revokeAllSessionsForAccount(currentUser.id, "logout-all-devices");
    else await revokeRequestSession(request, "logout");
    await recordAuthEvent("logout", currentUser.id, await requestSourceHash(request), payload.allDevices === true ? "all-devices" : "current-session");
    const headers = new Headers(privateNoStoreHeaders);
    headers.append("set-cookie", clearSessionCookie(request));
    return Response.json({ loggedOut: true }, { headers });
  } catch (error) {
    return internalApiError(error, "ออกจากระบบไม่สำเร็จ", "auth-logout");
  }
}
