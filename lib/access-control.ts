import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../db";
import { ensureDatabase } from "../db/initialize";
import { authCredentials, authEvents, authSessions, employees, userAccounts } from "../db/schema";
import { getRole, type UserAccountRecord } from "./kpi-data";
import { hashOpaqueToken, parsePasswordVerifier, randomToken, validateLoginId } from "./password-crypto";

export type CurrentUser = UserAccountRecord & {
  authenticatedName: string;
  loginId: string;
  mustChangePassword: boolean;
};

export type SessionCreation = {
  cookie: string;
  absoluteExpiresAt: string;
  idleExpiresAt: string;
};

const accountRoles = new Set(["admin", "manager", "employee"]);
const accountStatuses = new Set(["active", "inactive"]);
const HTTPS_SESSION_COOKIE = "__Host-pp_session";
const HTTP_DEV_SESSION_COOKIE = "pp_session_dev";
const SESSION_TOKEN_BYTES = 32;
const SESSION_IDLE_MS = 8 * 60 * 60 * 1000;
const SESSION_ABSOLUTE_MS = 24 * 60 * 60 * 1000;
const SESSION_TOUCH_MS = 5 * 60 * 1000;

export const privateNoStoreHeaders = {
  "cache-control": "private, no-store, max-age=0",
  vary: "Cookie",
};

export type AuthenticatedRequestGate =
  | { currentUser: CurrentUser; response?: never }
  | { currentUser?: never; response: Response };

export async function authenticatedRequestGate(
  request: Request,
  options: { allowPasswordChange?: boolean } = {},
): Promise<AuthenticatedRequestGate> {
  if (!unsafeRequestIsSameOrigin(request)) return { response: sameOriginRequiredResponse() };
  await ensureDatabase();
  await ensureBootstrapAccounts();
  const currentUser = await authenticateRequest(request);
  if (!currentUser) return { response: authRequiredResponse() };
  if (currentUser.mustChangePassword && !options.allowPasswordChange) {
    return { response: passwordChangeRequiredResponse(currentUser) };
  }
  return { currentUser };
}

export async function ensureBootstrapAccounts() {
  const configuredLoginId = process.env.PEOPLE_PULSE_BOOTSTRAP_LOGIN_ID?.trim() ?? "";
  const configuredVerifier = process.env.PEOPLE_PULSE_BOOTSTRAP_PASSWORD_HASH?.trim() ?? "";
  const configuredEmail = process.env.PEOPLE_PULSE_BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase() ?? "";
  const configuredName = process.env.PEOPLE_PULSE_BOOTSTRAP_ADMIN_NAME?.trim().slice(0, 120) || "ผู้ดูแลระบบ";
  const hasAnyBootstrapConfig = Boolean(configuredLoginId || configuredVerifier || configuredEmail);
  if (!hasAnyBootstrapConfig) return;

  const loginIdCanonical = validateLoginId(configuredLoginId);
  const verifier = parsePasswordVerifier(configuredVerifier);
  if (!loginIdCanonical || !verifier || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(configuredEmail)) {
    throw new Error("First-party bootstrap configuration is incomplete or invalid.");
  }

  const db = getDb();
  const now = new Date().toISOString();
  const [existingOwner] = await db.select().from(userAccounts).where(eq(userAccounts.id, "user-owner")).limit(1);
  if (!existingOwner) {
    await db.insert(userAccounts).values({
      id: "user-owner",
      authUserId: "",
      email: configuredEmail,
      displayName: configuredName,
      role: "admin",
      employeeId: null,
      departmentId: "",
      status: "active",
      lastLoginAt: null,
      createdBy: "ระบบเริ่มต้น",
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing();
  } else if (existingOwner.role !== "admin" || existingOwner.status !== "active") {
    throw new Error("Bootstrap owner exists but is not an active administrator.");
  }

  const [existingCredential] = await db.select({ userAccountId: authCredentials.userAccountId }).from(authCredentials).where(eq(authCredentials.userAccountId, "user-owner")).limit(1);
  if (existingCredential) return;
  const insertedCredentials = await db.insert(authCredentials).values({
    userAccountId: "user-owner",
    loginId: configuredLoginId,
    loginIdCanonical,
    ...verifier,
    mustChangePassword: true,
    failedAttempts: 0,
    lockedUntil: null,
    passwordChangedAt: now,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing().returning({ userAccountId: authCredentials.userAccountId });
  if (insertedCredentials.length) await recordAuthEvent("credential_created", "user-owner", "", "bootstrap-prehashed");
}

export async function authenticateRequest(request: Request): Promise<CurrentUser | null> {
  const sessionContext = await authenticatedSession(request);
  return sessionContext?.currentUser ?? null;
}

export async function createSession(request: Request, account: UserAccountRecord, credentialVersion: number): Promise<SessionCreation> {
  const token = randomToken(SESSION_TOKEN_BYTES);
  const tokenHash = await hashOpaqueToken(token);
  const nowDate = new Date();
  const absoluteExpiresAt = new Date(nowDate.getTime() + SESSION_ABSOLUTE_MS).toISOString();
  const idleExpiresAt = new Date(Math.min(nowDate.getTime() + SESSION_IDLE_MS, Date.parse(absoluteExpiresAt))).toISOString();
  const now = nowDate.toISOString();
  await getDb().insert(authSessions).values({
    id: `session-${crypto.randomUUID()}`,
    tokenHash,
    userAccountId: account.id,
    credentialVersion,
    createdAt: now,
    authenticatedAt: now,
    lastSeenAt: now,
    idleExpiresAt,
    absoluteExpiresAt,
    revokedAt: null,
    revokeReason: "",
  });
  return { cookie: sessionCookie(request, token, absoluteExpiresAt), absoluteExpiresAt, idleExpiresAt };
}

export async function revokeRequestSession(request: Request, reason = "logout") {
  const token = sessionToken(request);
  if (!token) return null;
  const tokenHash = await hashOpaqueToken(token);
  const now = new Date().toISOString();
  const [session] = await getDb().select().from(authSessions).where(eq(authSessions.tokenHash, tokenHash)).limit(1);
  if (!session) return null;
  await getDb().update(authSessions).set({ revokedAt: now, revokeReason: reason }).where(and(eq(authSessions.id, session.id), isNull(authSessions.revokedAt)));
  return session;
}

export async function revokeAllSessionsForAccount(userAccountId: string, reason: string) {
  const now = new Date().toISOString();
  await getDb().update(authSessions).set({ revokedAt: now, revokeReason: reason }).where(and(eq(authSessions.userAccountId, userAccountId), isNull(authSessions.revokedAt)));
  await recordAuthEvent("sessions_revoked", userAccountId, "", reason);
}

export function clearSessionCookie(request: Request) {
  return `${sessionCookieName(request)}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${isHttpsRequest(request) ? "; Secure" : ""}`;
}

export function unsafeRequestIsSameOrigin(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) return true;
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  const configuredOrigin = normalizeOrigin(process.env.PEOPLE_PULSE_CANONICAL_ORIGIN ?? "");
  if (configuredOrigin && requestUrl.hostname === "people-pulse-th-kpi.brees2539.chatgpt.site") return false;
  if (!origin || (origin !== requestUrl.origin && origin !== configuredOrigin)) return false;
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "same-origin") return true;
  return !fetchSite && isLocalHostname(requestUrl.hostname);
}

export function authRequiredResponse(message = "กรุณาเข้าสู่ระบบเพื่อใช้งาน") {
  return Response.json({ authRequired: true, error: message }, { status: 401, headers: privateNoStoreHeaders });
}

export function passwordChangeRequiredResponse(currentUser: CurrentUser) {
  return Response.json({
    passwordChangeRequired: true,
    displayName: currentUser.displayName,
    loginId: currentUser.loginId,
    error: "กรุณาเปลี่ยนรหัสผ่านชั่วคราวก่อนใช้งาน",
  }, { status: 428, headers: privateNoStoreHeaders });
}

export function sameOriginRequiredResponse() {
  return Response.json({ error: "คำขอนี้ไม่ได้มาจากเว็บไซต์ People Pulse" }, { status: 403, headers: privateNoStoreHeaders });
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

export async function recordAuthEvent(
  eventType: typeof authEvents.$inferInsert.eventType,
  userAccountId: string | null,
  sourceHash = "",
  detail = "",
) {
  await getDb().insert(authEvents).values({
    id: `auth-event-${crypto.randomUUID()}`,
    userAccountId,
    eventType,
    sourceHash,
    detail: detail.slice(0, 240),
    createdAt: new Date().toISOString(),
  });
}

async function authenticatedSession(request: Request) {
  const token = sessionToken(request);
  if (!token) return null;
  const tokenHash = await hashOpaqueToken(token);
  const db = getDb();
  const [session] = await db.select().from(authSessions).where(eq(authSessions.tokenHash, tokenHash)).limit(1);
  if (!session || session.revokedAt) return null;
  const nowDate = new Date();
  const now = nowDate.toISOString();
  if (session.idleExpiresAt <= now || session.absoluteExpiresAt <= now) {
    await db.update(authSessions).set({ revokedAt: now, revokeReason: "expired" }).where(and(eq(authSessions.id, session.id), isNull(authSessions.revokedAt)));
    return null;
  }

  const [[account], [credential]] = await Promise.all([
    db.select().from(userAccounts).where(eq(userAccounts.id, session.userAccountId)).limit(1),
    db.select().from(authCredentials).where(eq(authCredentials.userAccountId, session.userAccountId)).limit(1),
  ]);
  if (!account || !credential?.passwordHash || credential.credentialVersion !== session.credentialVersion || !accountRoles.has(account.role) || !accountStatuses.has(account.status) || account.status !== "active") {
    await db.update(authSessions).set({ revokedAt: now, revokeReason: "account-unavailable" }).where(and(eq(authSessions.id, session.id), isNull(authSessions.revokedAt)));
    return null;
  }

  let resolvedAccount = account;
  if (account.role !== "admin") {
    if (!account.employeeId) {
      await db.update(authSessions).set({ revokedAt: now, revokeReason: "employee-link-unavailable" }).where(and(eq(authSessions.id, session.id), isNull(authSessions.revokedAt)));
      return null;
    }
    const [linkedEmployee] = await db.select({ status: employees.status, roleId: employees.roleId })
      .from(employees)
      .where(eq(employees.id, account.employeeId))
      .limit(1);
    if (!linkedEmployee || linkedEmployee.status !== "active") {
      await db.update(authSessions).set({ revokedAt: now, revokeReason: "employee-link-unavailable" }).where(and(eq(authSessions.id, session.id), isNull(authSessions.revokedAt)));
      return null;
    }
    const liveDepartmentId = getRole(linkedEmployee.roleId).departmentId;
    if (!liveDepartmentId) {
      await db.update(authSessions).set({ revokedAt: now, revokeReason: "employee-role-unavailable" }).where(and(eq(authSessions.id, session.id), isNull(authSessions.revokedAt)));
      return null;
    }
    resolvedAccount = { ...account, departmentId: liveDepartmentId };
  }

  if (nowDate.getTime() - Date.parse(session.lastSeenAt) >= SESSION_TOUCH_MS) {
    const idleExpiresAt = new Date(Math.min(nowDate.getTime() + SESSION_IDLE_MS, Date.parse(session.absoluteExpiresAt))).toISOString();
    await db.update(authSessions).set({ lastSeenAt: now, idleExpiresAt }).where(and(eq(authSessions.id, session.id), isNull(authSessions.revokedAt)));
  }

  const currentUser: CurrentUser = {
    ...resolvedAccount,
    authenticatedName: resolvedAccount.displayName,
    loginId: credential.loginId,
    mustChangePassword: credential.mustChangePassword,
  };
  return { currentUser, session };
}

function sessionToken(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const expectedName = sessionCookieName(request);
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== expectedName) continue;
    const value = part.slice(separator + 1).trim();
    if (/^[A-Za-z0-9_-]{43}$/.test(value)) return value;
  }
  return "";
}

function sessionCookie(request: Request, token: string, absoluteExpiresAt: string) {
  const secure = isHttpsRequest(request);
  const maxAge = Math.max(0, Math.floor((Date.parse(absoluteExpiresAt) - Date.now()) / 1000));
  return `${sessionCookieName(request)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

function sessionCookieName(request: Request) {
  return isHttpsRequest(request) ? HTTPS_SESSION_COOKIE : HTTP_DEV_SESSION_COOKIE;
}

function isHttpsRequest(request: Request) {
  return new URL(request.url).protocol === "https:";
}

function normalizeOrigin(value: string) {
  if (!value) return "";
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function isLocalHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}
