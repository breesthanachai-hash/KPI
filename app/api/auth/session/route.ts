import { ensureDatabase } from "../../../../db/initialize";
import { authenticateRequest, authRequiredResponse, ensureBootstrapAccounts, passwordChangeRequiredResponse, privateNoStoreHeaders } from "../../../../lib/access-control";
import { internalApiError } from "../../../../lib/api-errors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await ensureDatabase();
    await ensureBootstrapAccounts();
    const currentUser = await authenticateRequest(request);
    if (!currentUser) return authRequiredResponse();
    if (currentUser.mustChangePassword) return passwordChangeRequiredResponse(currentUser);
    return Response.json({
      authenticated: true,
      currentUser: {
        id: currentUser.id,
        displayName: currentUser.displayName,
        email: currentUser.email,
        role: currentUser.role,
        employeeId: currentUser.employeeId,
        departmentId: currentUser.departmentId,
        loginId: currentUser.loginId,
        mustChangePassword: false,
      },
    }, { headers: privateNoStoreHeaders });
  } catch (error) {
    return internalApiError(error, "ตรวจสอบเซสชันไม่สำเร็จ", "auth-session");
  }
}
