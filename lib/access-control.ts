import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { employees, userAccounts } from "../db/schema";
import { getRole, type UserAccountRecord } from "./kpi-data";

export type AuthenticatedIdentity = {
  userId: string;
  email: string;
  name: string;
};

export type CurrentUser = UserAccountRecord & {
  authenticatedName: string;
};

const accountRoles = new Set(["admin", "manager", "employee"]);
const accountStatuses = new Set(["active", "inactive"]);

export function authenticatedIdentity(request: Request): AuthenticatedIdentity | null {
  const userId = request.headers.get("oai-authenticated-user-id");
  const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  if (!userId || !email) {
    const hostname = new URL(request.url).hostname;
    if (hostname !== "localhost" && hostname !== "127.0.0.1") return null;
    return { userId: "local-admin", email: "hr@peoplepulse.local", name: "ฝ่ายทรัพยากรบุคคล" };
  }
  const encodedName = request.headers.get("oai-authenticated-user-full-name");
  const encoding = request.headers.get("oai-authenticated-user-full-name-encoding");
  let name = email;
  if (encodedName && encoding === "percent-encoded-utf-8") {
    try {
      name = decodeURIComponent(encodedName);
    } catch {
      // The verified email remains a safe display fallback.
    }
  }
  return { userId, email, name };
}

export async function ensureBootstrapAccounts() {
  const db = getDb();
  const now = new Date().toISOString();
  const configuredEmail = process.env.PEOPLE_PULSE_BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase() ?? "";
  const bootstrapEmail = configuredEmail && configuredEmail.includes("@") ? configuredEmail : "breesthanachai@gmail.com";
  const bootstrapName = process.env.PEOPLE_PULSE_BOOTSTRAP_ADMIN_NAME?.trim().slice(0, 120) || "ธนชัย ใจแสน";
  const bootstrap = [
    { id: "user-owner", authUserId: "", email: bootstrapEmail, displayName: bootstrapName, role: "admin" as const, employeeId: null, departmentId: "", status: "active" as const, lastLoginAt: null, createdBy: "ระบบเริ่มต้น", createdAt: now, updatedAt: now },
  ];
  for (const account of bootstrap) await db.insert(userAccounts).values(account).onConflictDoNothing();
}

export async function authenticateRequest(request: Request): Promise<CurrentUser | null> {
  const identity = authenticatedIdentity(request);
  if (!identity) return null;
  if (identity.userId === "local-admin" && ["localhost", "127.0.0.1"].includes(new URL(request.url).hostname)) {
    const now = new Date().toISOString();
    return { id: "user-local-admin", authUserId: identity.userId, email: identity.email, displayName: identity.name, role: "admin", employeeId: null, departmentId: "", status: "active", lastLoginAt: now, createdBy: "ระบบในเครื่อง", createdAt: now, updatedAt: now, authenticatedName: identity.name };
  }
  const db = getDb();
  let [account] = await db.select().from(userAccounts).where(eq(userAccounts.authUserId, identity.userId)).limit(1);
  if (!account) [account] = await db.select().from(userAccounts).where(eq(userAccounts.email, identity.email)).limit(1);
  if (!account || !accountRoles.has(account.role) || !accountStatuses.has(account.status) || account.status !== "active") return null;
  if (account.authUserId && account.authUserId !== identity.userId) return null;
  const now = new Date().toISOString();
  if (!account.authUserId) {
    const [claimedAccount] = await db.update(userAccounts)
      .set({ authUserId: identity.userId, lastLoginAt: now, updatedAt: now })
      .where(and(eq(userAccounts.id, account.id), eq(userAccounts.authUserId, "")))
      .returning();
    if (claimedAccount) {
      account = claimedAccount;
    } else {
      const [latestAccount] = await db.select().from(userAccounts).where(eq(userAccounts.id, account.id)).limit(1);
      if (!latestAccount || latestAccount.status !== "active" || latestAccount.authUserId !== identity.userId) return null;
      account = latestAccount;
    }
  }
  if (!accountRoles.has(account.role) || !accountStatuses.has(account.status) || account.status !== "active") return null;
  if (account.role !== "admin") {
    if (!account.employeeId) return null;
    const [linkedEmployee] = await db.select({ status: employees.status, roleId: employees.roleId })
      .from(employees)
      .where(eq(employees.id, account.employeeId))
      .limit(1);
    if (!linkedEmployee || linkedEmployee.status !== "active") return null;
    const liveDepartmentId = getRole(linkedEmployee.roleId).departmentId;
    if (!liveDepartmentId) return null;
    account = { ...account, departmentId: liveDepartmentId };
  }
  return { ...account, authenticatedName: identity.name || account.displayName };
}

export async function canAccessEmployee(account: CurrentUser, employeeId: string) {
  if (account.role === "admin") return true;
  const db = getDb();
  if (account.employeeId === employeeId) {
    const [employee] = await db.select({ status: employees.status }).from(employees).where(eq(employees.id, employeeId)).limit(1);
    return employee?.status === "active";
  }
  if (account.role !== "manager" || !account.departmentId) return false;
  const [employee] = await db.select({ roleId: employees.roleId, status: employees.status }).from(employees).where(eq(employees.id, employeeId)).limit(1);
  return Boolean(employee?.status === "active" && getRole(employee.roleId).departmentId === account.departmentId);
}

export function roleLabel(role: CurrentUser["role"]) {
  return role === "admin" ? "HR / ผู้ดูแลระบบ" : role === "manager" ? "หัวหน้าทีม" : "พนักงาน";
}
