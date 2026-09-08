import { ensureDatabase } from "../../../../db/initialize";
import { privateNoStoreHeaders, sameOriginRequiredResponse, unsafeRequestIsSameOrigin } from "../../../../lib/access-control";
import { internalApiError } from "../../../../lib/api-errors";
import { RegistrationInputError, submitEmployeeRegistration } from "../../../../lib/registration-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!unsafeRequestIsSameOrigin(request)) return sameOriginRequiredResponse();
  try {
    await ensureDatabase();
    const payload = await readBoundedRegistrationPayload(request);
    if (!payload) return Response.json({ error: "ข้อมูลสมัครสมาชิกไม่ถูกต้อง" }, { status: 400, headers: privateNoStoreHeaders });
    const registrationRequest = await submitEmployeeRegistration(request, payload);
    return Response.json({ submitted: true, registrationRequest }, { status: 201, headers: privateNoStoreHeaders });
  } catch (error) {
    if (error instanceof RegistrationInputError) {
      const headers = new Headers(privateNoStoreHeaders);
      if (error.retryAfterSeconds) headers.set("retry-after", String(error.retryAfterSeconds));
      return Response.json({ error: error.message }, { status: error.status, headers });
    }
    if (error instanceof Error && /UNIQUE constraint failed/i.test(error.message)) {
      return Response.json({ error: "ชื่อผู้ใช้หรืออีเมลนี้มีคำขออยู่แล้ว" }, { status: 409, headers: privateNoStoreHeaders });
    }
    return internalApiError(error, "ส่งคำขอสมัครสมาชิกไม่สำเร็จ", "auth-register");
  }
}

async function readBoundedRegistrationPayload(request: Request) {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > 8192) {
        await reader.cancel("registration payload too large");
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
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}
