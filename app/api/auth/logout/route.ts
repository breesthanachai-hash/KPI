import { ensureDatabase } from "../../../../db/initialize";
import {
  authenticatedRequestSession,
  clearSessionCookie,
  completeLogout,
  privateNoStoreHeaders,
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
    const sessionContext = await authenticatedRequestSession(request);
    if (!sessionContext) {
      const headers = new Headers(privateNoStoreHeaders);
      headers.append("set-cookie", clearSessionCookie(request));
      return Response.json({ loggedOut: true }, { headers });
    }
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > 2048) return Response.json({ error: "ข้อมูลคำขอไม่ถูกต้อง" }, { status: 400, headers: privateNoStoreHeaders });
    const payload = await request.json().catch(() => ({})) as { allDevices?: unknown };
    await completeLogout(
      sessionContext.sessionId,
      sessionContext.currentUser.id,
      await requestSourceHash(request),
      payload.allDevices === true,
    );
    const headers = new Headers(privateNoStoreHeaders);
    headers.append("set-cookie", clearSessionCookie(request));
    return Response.json({ loggedOut: true }, { headers });
  } catch (error) {
    return internalApiError(error, "ออกจากระบบไม่สำเร็จ", "auth-logout");
  }
}
