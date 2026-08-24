import { eq } from "drizzle-orm";
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
  const bootstrap = [
    { id: "user-owner", authUserId: "", email: "breesthanachai@gmail.com", displayName: "ธนชัย ใจแสน", role: "admin" as const, employeeId: null, departmentId: "", status: "active" as const, lastLoginAt: null, createdBy: "ระบบเริ่มต้น", createdAt: now, updatedAt: now },
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
  if (!account || account.status !== "active") return null;
  if (account.authUserId && account.authUserId !== identity.userId) return null;
  const now = new Date().toISOString();
  if (!account.authUserId) {
    await db.update(userAccounts).set({ authUserId: identity.userId, lastLoginAt: now, updatedAt: now }).where(eq(userAccounts.id, account.id));
    account = { ...account, authUserId: identity.userId, lastLoginAt: now, updatedAt: now };
  }
  return { ...account, authenticatedName: identity.name || account.displayName };
}

export async function canAccessEmployee(account: CurrentUser, employeeId: string) {
  if (account.role === "admin") return true;
  if (account.employeeId === employeeId) return true;
  if (account.role !== "manager" || !account.departmentId) return false;
  const db = getDb();
  const [employee] = await db.select({ roleId: employees.roleId }).from(employees).where(eq(employees.id, employeeId)).limit(1);
  return Boolean(employee && getRole(employee.roleId).departmentId === account.departmentId);
}

export function roleLabel(role: CurrentUser["role"]) {
  return role === "admin" ? "HR / ผู้ดูแลระบบ" : role === "manager" ? "หัวหน้าทีม" : "พนักงาน";
}
