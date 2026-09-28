import { authenticatedRequestGate } from "../../../lib/access-control";
import { ensureEmployeeProfileAudit } from "../../../lib/employee-profile-audit";
import { getD1 } from "../../../db";

export async function GET(request: Request) {
  const auth = await authenticatedRequestGate(request);
  if (auth.response) return auth.response;
  if (auth.currentUser.role !== "admin") return Response.json({ error: "เฉพาะ Admin / HR" }, { status: 403 });
  const employeeId = new URL(request.url).searchParams.get("employeeId");
  if (!employeeId) return Response.json({ error: "กรุณาเลือกพนักงาน" }, { status: 400 });
  await ensureEmployeeProfileAudit();
  const result = await getD1().prepare("SELECT * FROM employee_profile_audit WHERE employee_id = ? ORDER BY created_at DESC, id DESC LIMIT 100").bind(employeeId).all();
  return Response.json({ events: result.results }, { headers: { "Cache-Control": "no-store" } });
}
