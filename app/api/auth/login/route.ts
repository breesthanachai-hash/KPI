import { ensureDatabase } from "../../../../db/initialize";
import { ensureBootstrapAccounts, ensureLocalMockAdminCredential, ensureOwnerRecoveryCredential, privateNoStoreHeaders, sameOriginRequiredResponse, unsafeRequestIsSameOrigin } from "../../../../lib/access-control";
import { authenticateLogin } from "../../../../lib/auth-service";
import { internalApiError } from "../../../../lib/api-errors";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!unsafeRequestIsSameOrigin(request)) return sameOriginRequiredResponse();
  try {
    await ensureDatabase();
    await ensureBootstrapAccounts();
    await ensureLocalMockAdminCredential(request);
    await ensureOwnerRecoveryCredential();
    const payload = await readBoundedLoginPayload(request);
    const result = await authenticateLogin(request, payload?.loginId, payload?.password);
    if (!result.ok) {
      const headers = new Headers(privateNoStoreHeaders);
      if (result.retryAfterSeconds) headers.set("retry-after", String(result.retryAfterSeconds));
      return Response.json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" }, { status: result.status, headers });
    }
    const headers = new Headers(privateNoStoreHeaders);
    headers.append("set-cookie", result.session.cookie);
    const body = {
      authenticated: true,
      mustChangePassword: result.currentUser.mustChangePassword,
      passwordChangeRequired: result.currentUser.mustChangePassword,
      displayName: result.currentUser.displayName,
      loginId: result.currentUser.loginId,
    };
    return Response.json(body, { status: result.currentUser.mustChangePassword ? 428 : 200, headers });
  } catch (error) {
    return internalApiError(error, "ระบบเข้าสู่ระบบยังไม่พร้อม", "auth-login");
  }
}

async function readBoundedLoginPayload(request: Request) {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > 4096) {
        await reader.cancel("login payload too large");
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
    return parsed && typeof parsed === "object" ? parsed as { loginId?: unknown; password?: unknown } : null;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}
