export function internalApiError(error: unknown, publicMessage: string, route: string) {
  const requestId = crypto.randomUUID();
  console.error(`[${route}] requestId=${requestId}`, error);
  return Response.json(
    { error: `${publicMessage} กรุณาแจ้งผู้ดูแลพร้อมรหัสคำขอ ${requestId}`, requestId },
    { status: 500, headers: { "cache-control": "private, no-store" } },
  );
}
