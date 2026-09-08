import { and, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { getDb } from "../db";
import { ensureDatabase } from "../db/initialize";
import { authCredentials, authEvents, authRateLimits, authSessions, employees, userAccounts } from "../db/schema";
import { getRole, type UserAccountRecord } from "./kpi-data";
import {
  LEGACY_PASSWORD_ITERATIONS,
  PASSWORD_ALGORITHM,
  PASSWORD_ITERATIONS,
  hashPassword,
  hashTemporaryOwnerRecoveryPassword,
  hashOpaqueToken,
  parsePasswordVerifier,
  passwordValidationError,
  privateLookupHash,
  randomToken,
  validateLoginId,
} from "./password-crypto";

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

export type AuthenticatedSessionContext = {
  currentUser: CurrentUser;
  sessionId: string;
};

type PreparedSession = {
  creation: SessionCreation;
  values: typeof authSessions.$inferInsert;
};

const accountRoles = new Set(["admin", "manager", "employee"]);
const accountStatuses = new Set(["active", "inactive"]);
const HTTPS_SESSION_COOKIE = "__Host-pp_session";
const HTTP_DEV_SESSION_COOKIE = "pp_session_dev";
const SESSION_TOKEN_BYTES = 32;
const SESSION_IDLE_MS = 8 * 60 * 60 * 1000;
const SESSION_ABSOLUTE_MS = 24 * 60 * 60 * 1000;
const SESSION_TOUCH_MS = 5 * 60 * 1000;
let bootstrapInitialization: Promise<void> | null = null;

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

export function ensureBootstrapAccounts() {
  if (bootstrapInitialization) return bootstrapInitialization;
  bootstrapInitialization = initializeBootstrapAccounts().catch((error) => {
    bootstrapInitialization = null;
    throw error;
  });
  return bootstrapInitialization;
}

export async function ensureOwnerRecoveryCredential() {
  const recoveryId = process.env.PEOPLE_PULSE_OWNER_RECOVERY_ID?.trim() ?? "";
  const recoveryPassword = process.env.PEOPLE_PULSE_OWNER_RECOVERY_PASSWORD ?? "";
  const recoveryExpiresAt = process.env.PEOPLE_PULSE_OWNER_RECOVERY_EXPIRES_AT?.trim() ?? "";
  const purgeOtherUsersValue = process.env.PEOPLE_PULSE_OWNER_RECOVERY_PURGE_OTHER_USERS?.trim() ?? "";
  const purgeOtherUsers = purgeOtherUsersValue === "true";
  const hasAnyRecoveryConfig = Boolean(recoveryId || recoveryPassword || recoveryExpiresAt || purgeOtherUsersValue);
  if (!hasAnyRecoveryConfig) return;
  if (!/^[a-z0-9]{16,64}$/i.test(recoveryId) || !recoveryExpiresAt || (purgeOtherUsersValue && !purgeOtherUsers)) {
    return;
  }
  const expiresAtTime = Date.parse(recoveryExpiresAt);
  if (!Number.isFinite(expiresAtTime) || expiresAtTime <= Date.now()) {
    return;
  }
  const usesTemporaryFourDigitPin = /^\d{4}$/.test(recoveryPassword.normalize("NFC"));
  const validationError = usesTemporaryFourDigitPin ? "" : passwordValidationError(recoveryPassword);
  if (validationError) return;

  const db = getDb();
  const claimId = `credential-mutation:owner-recovery:${recoveryId}`;
  const [ownerRows, credentialRows, claimRows] = await db.batch([
    db.select().from(userAccounts).where(eq(userAccounts.id, "user-owner")).limit(1),
    db.select().from(authCredentials).where(eq(authCredentials.userAccountId, "user-owner")).limit(1),
    db.select({ id: authEvents.id }).from(authEvents).where(eq(authEvents.id, claimId)).limit(1),
  ]);
  if (claimRows.length) return;
  const owner = ownerRows[0];
  const credential = credentialRows[0];
  if (!owner || owner.role !== "admin" || owner.status !== "active" || !credential) {
    throw new Error("Owner recovery requires an active owner administrator credential.");
  }

  const verifier = usesTemporaryFourDigitPin
    ? await hashTemporaryOwnerRecoveryPassword(recoveryPassword)
    : await hashPassword(recoveryPassword);
  const now = new Date().toISOString();
  const loginRateKey = await privateLookupHash("login-rate-login-id", credential.loginIdCanonical);
  const ownerLoginId = purgeOtherUsers ? "admin" : credential.loginId;
  const ownerLoginIdCanonical = purgeOtherUsers ? "admin" : credential.loginIdCanonical;
  try {
    await db.batch([
      db.insert(authEvents).values({
        id: claimId,
        userAccountId: owner.id,
        eventType: "credential_reset",
        sourceHash: "",
        detail: String(credential.credentialVersion),
        createdAt: now,
      }),
      ...(purgeOtherUsers ? [
        db.delete(userAccounts).where(ne(userAccounts.id, owner.id)),
        db.update(userAccounts).set({
          authUserId: "",
          role: "admin",
          employeeId: null,
          departmentId: "",
          status: "active",
          updatedAt: now,
        }).where(eq(userAccounts.id, owner.id)),
      ] : []),
      db.update(authCredentials).set({
        ...verifier,
        loginId: ownerLoginId,
        loginIdCanonical: ownerLoginIdCanonical,
        credentialVersion: credential.credentialVersion + 1,
        mustChangePassword: true,
        failedAttempts: 0,
        lockedUntil: null,
        passwordChangedAt: now,
        updatedAt: now,
      }).where(and(
        eq(authCredentials.userAccountId, owner.id),
        eq(authCredentials.credentialVersion, credential.credentialVersion),
      )),
      db.update(authSessions).set({
        revokedAt: now,
        revokeReason: "owner-password-recovery",
      }).where(and(
        eq(authSessions.userAccountId, owner.id),
        isNull(authSessions.revokedAt),
      )),
      db.delete(authRateLimits).where(eq(authRateLimits.keyHash, loginRateKey)),
    ]);
  } catch (error) {
    const [completedClaim] = await db.select({ id: authEvents.id }).from(authEvents).where(eq(authEvents.id, claimId)).limit(1);
    if (completedClaim) return;
    throw error;
  }
}

async function initializeBootstrapAccounts() {
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
  const [ownerRows, credentialRows] = await db.batch([
    db.select().from(userAccounts).where(eq(userAccounts.id, "user-owner")).limit(1),
    db.select().from(authCredentials).where(eq(authCredentials.userAccountId, "user-owner")).limit(1),
  ]);
  const existingOwner = ownerRows[0];
  const existingCredential = credentialRows[0];
  if (
    !existingCredential
    && (verifier.passwordAlgorithm !== PASSWORD_ALGORITHM || verifier.passwordIterations !== PASSWORD_ITERATIONS)
  ) {
    throw new Error("A new bootstrap credential must use the current password work factor.");
  }
  if (!existingOwner) {
    await db.insert(userAccounts).values({
      id: "user-owner",
      authUserId: "",
      email: configuredEmail,
      displayName: configuredName,
      nickname: "",
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

  if (existingCredential) {
    const originalPasswordChangedAt = existingCredential.passwordChangedAt;
    const pristineBootstrapOwner = existingOwner
      && existingOwner.authUserId === ""
      && existingOwner.lastLoginAt === null
      && existingOwner.createdAt === existingOwner.updatedAt;
    const legacyOaiOwner = existingOwner
      && existingOwner.authUserId !== ""
      && existingOwner.lastLoginAt !== null
      && existingOwner.createdAt < existingOwner.lastLoginAt
      && existingOwner.lastLoginAt < existingCredential.createdAt;
    const untouchedBootstrapCredential = existingOwner
      && existingOwner.email === configuredEmail
      && existingOwner.role === "admin"
      && existingOwner.status === "active"
      && existingOwner.createdBy === "ระบบเริ่มต้น"
      && (pristineBootstrapOwner || legacyOaiOwner)
      && existingCredential.loginIdCanonical === loginIdCanonical
      && existingCredential.passwordAlgorithm === "pbkdf2-sha256"
      && verifier.passwordIterations === LEGACY_PASSWORD_ITERATIONS
      && existingCredential.passwordIterations > LEGACY_PASSWORD_ITERATIONS
      && existingCredential.pepperVersion === verifier.pepperVersion
      && existingCredential.credentialVersion === 1
      && existingCredential.mustChangePassword
      && existingCredential.failedAttempts >= 0
      && existingCredential.failedAttempts <= 1
      && existingCredential.lockedUntil === null
      && originalPasswordChangedAt !== null
      && originalPasswordChangedAt === existingCredential.createdAt;
    if (!untouchedBootstrapCredential || !originalPasswordChangedAt) return;
    const repairedAt = new Date().toISOString();
    const [repairedCredential] = await db.update(authCredentials).set({
      ...verifier,
      credentialVersion: 2,
      mustChangePassword: true,
      failedAttempts: 0,
      lockedUntil: null,
      passwordChangedAt: repairedAt,
      updatedAt: repairedAt,
    }).where(and(
      eq(authCredentials.userAccountId, "user-owner"),
      eq(authCredentials.loginIdCanonical, existingCredential.loginIdCanonical),
      eq(authCredentials.passwordAlgorithm, existingCredential.passwordAlgorithm),
      eq(authCredentials.passwordHash, existingCredential.passwordHash),
      eq(authCredentials.passwordSalt, existingCredential.passwordSalt),
      eq(authCredentials.passwordIterations, existingCredential.passwordIterations),
      gt(authCredentials.passwordIterations, LEGACY_PASSWORD_ITERATIONS),
      eq(authCredentials.pepperVersion, existingCredential.pepperVersion),
      eq(authCredentials.credentialVersion, 1),
      eq(authCredentials.mustChangePassword, true),
      eq(authCredentials.failedAttempts, existingCredential.failedAttempts),
      isNull(authCredentials.lockedUntil),
      eq(authCredentials.passwordChangedAt, originalPasswordChangedAt),
      eq(authCredentials.createdAt, existingCredential.createdAt),
      eq(authCredentials.updatedAt, existingCredential.updatedAt),
      sql`EXISTS (
        SELECT 1 FROM ${userAccounts}
        WHERE ${userAccounts.id} = 'user-owner'
          AND ${userAccounts.email} = ${configuredEmail}
          AND ${userAccounts.role} = 'admin'
          AND ${userAccounts.status} = 'active'
          AND ${userAccounts.createdBy} = 'ระบบเริ่มต้น'
          AND (
            (
              ${userAccounts.authUserId} = ''
              AND ${userAccounts.lastLoginAt} IS NULL
              AND ${userAccounts.createdAt} = ${userAccounts.updatedAt}
            )
            OR
            (
              ${userAccounts.authUserId} != ''
              AND ${userAccounts.lastLoginAt} IS NOT NULL
              AND ${userAccounts.createdAt} < ${userAccounts.lastLoginAt}
              AND ${userAccounts.lastLoginAt} < ${existingCredential.createdAt}
            )
          )
      )`,
      sql`NOT EXISTS (
        SELECT 1 FROM ${authSessions}
        WHERE ${authSessions.userAccountId} = 'user-owner'
      )`,
      sql`(
        SELECT COUNT(*) FROM ${authEvents}
        WHERE ${authEvents.userAccountId} = 'user-owner'
          AND ${authEvents.eventType} = 'credential_created'
          AND ${authEvents.sourceHash} = ''
          AND ${authEvents.detail} = 'bootstrap-prehashed'
          AND ${authEvents.createdAt} >= ${existingCredential.createdAt}
      ) = 1`,
      sql`NOT EXISTS (
        SELECT 1 FROM ${authEvents}
        WHERE ${authEvents.userAccountId} = 'user-owner'
          AND NOT (
            (${authEvents.eventType} = 'credential_created' AND ${authEvents.sourceHash} = '' AND ${authEvents.detail} = 'bootstrap-prehashed' AND ${authEvents.createdAt} >= ${existingCredential.createdAt})
            OR (${authEvents.eventType} = 'login_failed' AND ${authEvents.detail} = 'generic-credential-failure' AND ${authEvents.createdAt} >= ${existingCredential.createdAt})
          )
      )`,
      sql`(
        SELECT COUNT(*) FROM ${authEvents}
        WHERE ${authEvents.userAccountId} = 'user-owner'
          AND ${authEvents.eventType} = 'login_failed'
          AND ${authEvents.detail} = 'generic-credential-failure'
          AND ${authEvents.createdAt} >= ${existingCredential.createdAt}
      ) = ${existingCredential.failedAttempts}`,
    )).returning({ userAccountId: authCredentials.userAccountId });
    // The database trigger revokes version-1 sessions and records the repair in
    // the same transaction as this successful CAS update.
    void repairedCredential;
    return;
  }
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

export async function authenticatedRequestSession(request: Request): Promise<AuthenticatedSessionContext | null> {
  const sessionContext = await authenticatedSession(request);
  if (!sessionContext) return null;
  return { currentUser: sessionContext.currentUser, sessionId: sessionContext.session.id };
}

export async function createSession(request: Request, account: UserAccountRecord, credentialVersion: number): Promise<SessionCreation> {
  const prepared = await prepareSession(request, account, credentialVersion);
  await getDb().insert(authSessions).values(prepared.values);
  return prepared.creation;
}

export async function prepareSession(request: Request, account: UserAccountRecord, credentialVersion: number): Promise<PreparedSession> {
  const token = randomToken(SESSION_TOKEN_BYTES);
  const tokenHash = await hashOpaqueToken(token);
  const nowDate = new Date();
  const absoluteExpiresAt = new Date(nowDate.getTime() + SESSION_ABSOLUTE_MS).toISOString();
  const idleExpiresAt = new Date(Math.min(nowDate.getTime() + SESSION_IDLE_MS, Date.parse(absoluteExpiresAt))).toISOString();
  const now = nowDate.toISOString();
  const values: typeof authSessions.$inferInsert = {
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
  };
  return {
    creation: { cookie: sessionCookie(request, token, absoluteExpiresAt), absoluteExpiresAt, idleExpiresAt },
    values,
  };
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

export async function completeLogout(
  sessionId: string,
  userAccountId: string,
  sourceHash: string,
  allDevices: boolean,
) {
  const now = new Date().toISOString();
  const db = getDb();
  const revokeQuery = allDevices
    ? db.update(authSessions)
      .set({ revokedAt: now, revokeReason: "logout-all-devices" })
      .where(and(eq(authSessions.userAccountId, userAccountId), isNull(authSessions.revokedAt)))
    : db.update(authSessions)
      .set({ revokedAt: now, revokeReason: "logout" })
      .where(and(eq(authSessions.id, sessionId), isNull(authSessions.revokedAt)));
  const queries = [
    revokeQuery,
    ...(allDevices ? [db.insert(authEvents).values(authEventValues("sessions_revoked", userAccountId, "", "logout-all-devices", now))] : []),
    db.insert(authEvents).values(authEventValues("logout", userAccountId, sourceHash, allDevices ? "all-devices" : "current-session", now)),
  ] as const;
  await db.batch(queries);
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
  await getDb().insert(authEvents).values(authEventValues(
    eventType,
    userAccountId,
    sourceHash,
    detail,
  ));
}

function authEventValues(
  eventType: typeof authEvents.$inferInsert.eventType,
  userAccountId: string | null,
  sourceHash = "",
  detail = "",
  createdAt = new Date().toISOString(),
): typeof authEvents.$inferInsert {
  return {
    id: `auth-event-${crypto.randomUUID()}`,
    userAccountId,
    eventType,
    sourceHash,
    detail: detail.slice(0, 240),
    createdAt,
  };
}

async function authenticatedSession(request: Request) {
  const token = sessionToken(request);
  if (!token) return null;
  const tokenHash = await hashOpaqueToken(token);
  const db = getDb();
  const [sessionContext] = await db.select({
    session: authSessions,
    account: userAccounts,
    credential: authCredentials,
    employee: {
      status: employees.status,
      roleId: employees.roleId,
    },
  }).from(authSessions)
    .leftJoin(userAccounts, eq(userAccounts.id, authSessions.userAccountId))
    .leftJoin(authCredentials, eq(authCredentials.userAccountId, authSessions.userAccountId))
    .leftJoin(employees, eq(employees.id, userAccounts.employeeId))
    .where(eq(authSessions.tokenHash, tokenHash))
    .limit(1);
  const session = sessionContext?.session;
  if (!session || session.revokedAt) return null;
  const nowDate = new Date();
  const now = nowDate.toISOString();
  if (session.idleExpiresAt <= now || session.absoluteExpiresAt <= now) {
    await db.update(authSessions).set({ revokedAt: now, revokeReason: "expired" }).where(and(eq(authSessions.id, session.id), isNull(authSessions.revokedAt)));
    return null;
  }

  const account = sessionContext.account;
  const credential = sessionContext.credential;
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
    const linkedEmployee = sessionContext.employee;
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
