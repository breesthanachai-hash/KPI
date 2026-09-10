import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { getDb } from "../db";
import { authCredentials, authEvents, authRateLimits, authSessions, employees, userAccounts } from "../db/schema";
import { findRole, type UserAccountRecord } from "./kpi-data";
import {
  canonicalizeLoginId,
  dummyVerifyPassword,
  hashPassword,
  passwordInputIsWithinLimit,
  passwordValidationError,
  privateLookupHash,
  validateLoginId,
  verifyPassword,
  type PasswordVerifier,
} from "./password-crypto";
import {
  createSession,
  prepareSession,
  recordAuthEvent,
  revokeAllSessionsForAccount,
  type CurrentUser,
  type SessionCreation,
} from "./access-control";

const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_BLOCK_MS = 15 * 60 * 1000;
const LOGIN_ID_FAILURE_LIMIT = 5;
const SOURCE_ATTEMPT_LIMIT = 40;
const ACCOUNT_FAILURE_LIMIT = 5;

type AuthCredential = typeof authCredentials.$inferSelect;

export type PublicUserAccountDto = Omit<UserAccountRecord, "authUserId"> & {
  loginId: string;
  hasPassword: boolean;
  mustChangePassword: boolean;
  lockedUntil: string | null;
};

export type LoginResult =
  | { ok: true; currentUser: CurrentUser; session: SessionCreation }
  | { ok: false; status: 401 | 429; retryAfterSeconds?: number };

export class AuthInputError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AuthInputError";
    this.status = status;
  }
}

export async function authenticateLogin(request: Request, loginIdInput: unknown, passwordInput: unknown): Promise<LoginResult> {
  const loginIdRaw = typeof loginIdInput === "string" ? loginIdInput : "";
  const password = typeof passwordInput === "string" ? passwordInput : "";
  const loginIdCanonical = validateLoginId(loginIdRaw);
  const lookupLoginId = (loginIdCanonical ?? canonicalizeLoginId(loginIdRaw).slice(0, 64)) || "invalid";
  const source = requestSource(request);
  const [loginKeyHash, sourceKeyHash, sourceHash] = await Promise.all([
    privateLookupHash("login-rate-login-id", lookupLoginId),
    privateLookupHash("login-rate-source", source),
    privateLookupHash("auth-event-source", source),
  ]);
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const rateBuckets = await getDb().select().from(authRateLimits)
    .where(inArray(authRateLimits.keyHash, [loginKeyHash, sourceKeyHash]));
  const rateBucketByKey = new Map(rateBuckets.map((bucket) => [bucket.keyHash, bucket]));
  const loginBucket = rateBucketByKey.get(loginKeyHash);
  const sourceBucket = rateBucketByKey.get(sourceKeyHash);
  const blockedUntil = latestFutureTimestamp(now, loginBucket?.blockedUntil, sourceBucket?.blockedUntil);
  if (blockedUntil) {
    return { ok: false, status: 429, retryAfterSeconds: Math.max(1, Math.ceil((Date.parse(blockedUntil) - nowDate.getTime()) / 1000)) };
  }

  const [loginReservations, sourceReservations] = await getDb().batch([
    rateReservationQuery(loginKeyHash, "login_id", LOGIN_ID_FAILURE_LIMIT, nowDate),
    rateReservationQuery(sourceKeyHash, "source", SOURCE_ATTEMPT_LIMIT, nowDate),
  ]);
  const loginReservation = loginReservations[0];
  const sourceReservation = sourceReservations[0];
  const reservationBlockedUntil = latestFutureTimestamp(now, loginReservation?.blockedUntil, sourceReservation?.blockedUntil);
  if (reservationBlockedUntil) {
    await Promise.all([
      loginReservation?.blockedUntil && loginReservation.blockedUntil > now
        ? recordRateLimitTransition("login_id", loginKeyHash, loginReservation.windowStartedAt, sourceHash)
        : Promise.resolve(),
      sourceReservation?.blockedUntil && sourceReservation.blockedUntil > now
        ? recordRateLimitTransition("source", sourceKeyHash, sourceReservation.windowStartedAt, sourceHash)
        : Promise.resolve(),
    ]);
    return { ok: false, status: 429, retryAfterSeconds: Math.max(1, Math.ceil((Date.parse(reservationBlockedUntil) - nowDate.getTime()) / 1000)) };
  }

  const db = getDb();
  const [loginContext] = loginIdCanonical
    ? await db.select({
      credential: authCredentials,
      account: userAccounts,
      employee: {
        status: employees.status,
        roleId: employees.roleId,
      },
    }).from(authCredentials)
      .innerJoin(userAccounts, eq(userAccounts.id, authCredentials.userAccountId))
      .leftJoin(employees, eq(employees.id, userAccounts.employeeId))
      .where(eq(authCredentials.loginIdCanonical, loginIdCanonical))
      .limit(1)
    : [];
  const credential = loginContext?.credential;
  const account = loginContext?.account;
  const locked = Boolean(credential?.lockedUntil && credential.lockedUntil > now);
  const passwordWithinLimit = passwordInputIsWithinLimit(password);
  let passwordMatches = false;
  if (credential && !locked && passwordWithinLimit) {
    passwordMatches = await verifyPassword(password, credentialVerifier(credential));
  } else {
    await dummyVerifyPassword(passwordWithinLimit ? password : "invalid-login-password");
  }

  const accountCanSignIn = accountIsEligible(account ?? null, loginContext?.employee ?? null);
  if (!loginIdCanonical || !passwordMatches || !accountCanSignIn || locked) {
    const failureEventQuery = db.insert(authEvents).values({
      id: `auth-event-${crypto.randomUUID()}`,
      userAccountId: account?.id ?? null,
      eventType: "login_failed",
      sourceHash,
      detail: "generic-credential-failure",
      createdAt: now,
    });
    if (credential && !locked) await db.batch([credentialFailureQuery(credential, nowDate), failureEventQuery]);
    else await failureEventQuery;
    return { ok: false, status: 401 };
  }

  const linkedRole = loginContext?.employee ? findRole(loginContext.employee.roleId) : undefined;
  const refreshedAccount = {
    ...account,
    departmentId: account.role === "admin" ? "" : linkedRole?.departmentId ?? "",
    lastLoginAt: now,
    updatedAt: now,
  };
  const preparedSession = await prepareSession(request, refreshedAccount, credential.credentialVersion);
  const cleanupQueries = cleanupExpiredAuthRecordQueries(nowDate);
  await db.batch([
    db.update(authCredentials).set({ failedAttempts: 0, lockedUntil: null, updatedAt: now }).where(and(
      eq(authCredentials.userAccountId, credential.userAccountId),
      eq(authCredentials.credentialVersion, credential.credentialVersion),
    )),
    db.delete(authRateLimits).where(eq(authRateLimits.keyHash, loginKeyHash)),
    releaseRateReservationQuery(sourceKeyHash, now),
    db.update(userAccounts).set({ lastLoginAt: now, updatedAt: now }).where(eq(userAccounts.id, account.id)),
    cleanupQueries.rateLimits,
    cleanupQueries.events,
    cleanupQueries.sessions,
    db.insert(authSessions).values(preparedSession.values),
    db.insert(authEvents).values({
      id: `auth-event-${crypto.randomUUID()}`,
      userAccountId: account.id,
      eventType: "login_succeeded",
      sourceHash,
      detail: "password",
      createdAt: now,
    }),
  ]);
  return {
    ok: true,
    session: preparedSession.creation,
    currentUser: {
      ...refreshedAccount,
      authenticatedName: refreshedAccount.displayName,
      loginId: credential.loginId,
      mustChangePassword: credential.mustChangePassword,
    },
  };
}

export async function publicUserAccountDtos(accounts: UserAccountRecord[]): Promise<PublicUserAccountDto[]> {
  if (!accounts.length) return [];
  const credentials = await getDb().select({
    userAccountId: authCredentials.userAccountId,
    loginId: authCredentials.loginId,
    passwordHash: authCredentials.passwordHash,
    mustChangePassword: authCredentials.mustChangePassword,
    lockedUntil: authCredentials.lockedUntil,
  }).from(authCredentials);
  const byAccountId = new Map(credentials.map((credential) => [credential.userAccountId, credential]));
  return accounts.map((account) => publicUserAccountDto(account, byAccountId.get(account.id) ?? null));
}

export function publicUserAccountDto(account: UserAccountRecord, credential: Pick<AuthCredential, "loginId" | "passwordHash" | "mustChangePassword" | "lockedUntil"> | null): PublicUserAccountDto {
  const safeAccount = { ...account };
  delete (safeAccount as Partial<UserAccountRecord>).authUserId;
  return {
    ...safeAccount,
    loginId: credential?.loginId ?? "",
    hasPassword: Boolean(credential?.passwordHash),
    mustChangePassword: credential?.mustChangePassword ?? true,
    lockedUntil: credential?.lockedUntil ?? null,
  };
}

export async function getAccountCredential(userAccountId: string) {
  const [credential] = await getDb().select().from(authCredentials).where(eq(authCredentials.userAccountId, userAccountId)).limit(1);
  return credential ?? null;
}

export async function credentialMutationValues(
  userAccountId: string,
  loginIdInput: unknown,
  temporaryPasswordInput: unknown,
  existingCredential: AuthCredential | null,
) {
  const loginId = typeof loginIdInput === "string" ? loginIdInput.trim() : "";
  const loginIdCanonical = validateLoginId(loginId);
  if (!loginIdCanonical) throw new AuthInputError("ชื่อผู้ใช้ต้องยาว 3–64 ตัว และใช้เฉพาะ a-z, 0-9, จุด, ขีดกลาง หรือขีดล่าง");
  const temporaryPassword = typeof temporaryPasswordInput === "string" ? temporaryPasswordInput : "";
  if (!existingCredential && !temporaryPassword) throw new AuthInputError("บัญชีใหม่ต้องกำหนดรหัสผ่านชั่วคราวอย่างน้อย 6 ตัวอักษร");
  if (temporaryPassword) {
    const validationError = passwordValidationError(temporaryPassword);
    if (validationError) throw new AuthInputError(validationError);
    const verifier = await hashPassword(temporaryPassword);
    return {
      mode: existingCredential ? "reset" as const : "create" as const,
      loginChanged: existingCredential?.loginIdCanonical !== loginIdCanonical,
      values: {
        userAccountId,
        loginId,
        loginIdCanonical,
        ...verifier,
        credentialVersion: (existingCredential?.credentialVersion ?? 0) + 1,
        mustChangePassword: true,
        failedAttempts: 0,
        lockedUntil: null,
        passwordChangedAt: new Date().toISOString(),
      },
    };
  }
  return {
    mode: "metadata" as const,
    loginChanged: existingCredential?.loginIdCanonical !== loginIdCanonical,
    values: {
      loginId,
      loginIdCanonical,
      credentialVersion: (existingCredential?.credentialVersion ?? 1) + (existingCredential?.loginIdCanonical !== loginIdCanonical ? 1 : 0),
      updatedAt: new Date().toISOString(),
    },
  };
}

export async function changePasswordForUser(
  request: Request,
  currentUser: CurrentUser,
  newPasswordInput: unknown,
  currentPasswordInput: unknown,
) {
  const newPassword = typeof newPasswordInput === "string" ? newPasswordInput : "";
  const currentPassword = typeof currentPasswordInput === "string" ? currentPasswordInput : "";
  const validationError = passwordValidationError(newPassword);
  if (validationError) throw new AuthInputError(validationError);
  const credential = await getAccountCredential(currentUser.id);
  if (!credential?.passwordHash) throw new AuthInputError("ไม่สามารถเปลี่ยนรหัสผ่านของบัญชีนี้ได้", 409);
  if (!currentUser.mustChangePassword) {
    if (!currentPassword) throw new AuthInputError("กรุณาระบุรหัสผ่านปัจจุบัน");
    const matches = await verifyPassword(currentPassword, credentialVerifier(credential));
    if (!matches) throw new AuthInputError("รหัสผ่านปัจจุบันไม่ถูกต้อง", 401);
  }
  const sameAsExisting = await verifyPassword(newPassword, credentialVerifier(credential));
  if (sameAsExisting) throw new AuthInputError("รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านปัจจุบัน");
  const verifier = await hashPassword(newPassword);
  const now = new Date().toISOString();
  const nextCredentialVersion = credential.credentialVersion + 1;
  const [updatedCredential] = await getDb().update(authCredentials).set({
    ...verifier,
    credentialVersion: nextCredentialVersion,
    mustChangePassword: false,
    failedAttempts: 0,
    lockedUntil: null,
    passwordChangedAt: now,
    updatedAt: now,
  }).where(and(
    eq(authCredentials.userAccountId, currentUser.id),
    eq(authCredentials.credentialVersion, credential.credentialVersion),
  )).returning({ credentialVersion: authCredentials.credentialVersion });
  if (!updatedCredential) throw new AuthInputError("ข้อมูลบัญชีมีการเปลี่ยนแปลง กรุณาเข้าสู่ระบบแล้วลองใหม่", 409);
  await revokeAllSessionsForAccount(currentUser.id, "password-changed");
  const session = await createSession(request, currentUser, nextCredentialVersion);
  await recordAuthEvent("password_changed", currentUser.id, await requestSourceHash(request), currentUser.mustChangePassword ? "forced-change" : "voluntary-change");
  return session;
}

export async function requestSourceHash(request: Request) {
  return privateLookupHash("auth-event-source", requestSource(request));
}

function credentialVerifier(credential: AuthCredential): PasswordVerifier {
  return {
    passwordHash: credential.passwordHash,
    passwordSalt: credential.passwordSalt,
    passwordAlgorithm: credential.passwordAlgorithm as PasswordVerifier["passwordAlgorithm"],
    passwordIterations: credential.passwordIterations,
    pepperVersion: credential.pepperVersion,
  };
}

function accountIsEligible(
  account: UserAccountRecord | null,
  linkedEmployee: { status: string; roleId: string } | null,
) {
  if (!account || account.status !== "active") return false;
  if (account.role === "admin") return true;
  if (!account.employeeId) return false;
  return linkedEmployee?.status === "active" && Boolean(findRole(linkedEmployee.roleId));
}

function requestSource(request: Request) {
  const url = new URL(request.url);
  const cloudflareAddress = request.headers.get("cf-connecting-ip")?.trim();
  if (cloudflareAddress) return cloudflareAddress.slice(0, 80);
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]") {
    return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 80) || "local-development";
  }
  return "cloudflare-address-unavailable";
}

function rateReservationQuery(keyHash: string, bucketType: "login_id" | "source", limit: number, nowDate: Date) {
  const db = getDb();
  const now = nowDate.toISOString();
  const windowCutoff = new Date(nowDate.getTime() - RATE_WINDOW_MS).toISOString();
  const blockedUntil = new Date(nowDate.getTime() + RATE_BLOCK_MS).toISOString();
  return db.insert(authRateLimits).values({
    keyHash,
    bucketType,
    windowStartedAt: now,
    attemptCount: 1,
    blockedUntil: limit <= 1 ? blockedUntil : null,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: authRateLimits.keyHash,
    set: {
      bucketType,
      windowStartedAt: sql`CASE WHEN ${authRateLimits.blockedUntil} > ${now} THEN ${authRateLimits.windowStartedAt} WHEN ${authRateLimits.windowStartedAt} <= ${windowCutoff} THEN ${now} ELSE ${authRateLimits.windowStartedAt} END`,
      attemptCount: sql`CASE WHEN ${authRateLimits.blockedUntil} > ${now} THEN ${authRateLimits.attemptCount} WHEN ${authRateLimits.windowStartedAt} <= ${windowCutoff} THEN 1 ELSE ${authRateLimits.attemptCount} + 1 END`,
      blockedUntil: sql`CASE WHEN ${authRateLimits.blockedUntil} > ${now} THEN ${authRateLimits.blockedUntil} WHEN ${authRateLimits.windowStartedAt} <= ${windowCutoff} THEN NULL WHEN ${authRateLimits.attemptCount} + 1 > ${limit} THEN ${blockedUntil} ELSE ${authRateLimits.blockedUntil} END`,
      updatedAt: now,
    },
  }).returning({ attemptCount: authRateLimits.attemptCount, blockedUntil: authRateLimits.blockedUntil, windowStartedAt: authRateLimits.windowStartedAt });
}

function releaseRateReservationQuery(keyHash: string, now: string) {
  return getDb().update(authRateLimits).set({
    attemptCount: sql`CASE WHEN ${authRateLimits.attemptCount} > 0 THEN ${authRateLimits.attemptCount} - 1 ELSE 0 END`,
    updatedAt: now,
  }).where(and(eq(authRateLimits.keyHash, keyHash), isNull(authRateLimits.blockedUntil)));
}

async function recordRateLimitTransition(bucketType: "login_id" | "source", keyHash: string, windowStartedAt: string, sourceHash: string) {
  await getDb().insert(authEvents).values({
    id: `auth-rate-limit:${bucketType}:${keyHash}:${windowStartedAt}`,
    userAccountId: null,
    eventType: "login_rate_limited",
    sourceHash,
    detail: bucketType,
    createdAt: new Date().toISOString(),
  }).onConflictDoNothing();
}

function cleanupExpiredAuthRecordQueries(nowDate: Date) {
  const rateLimitCutoff = new Date(nowDate.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const eventCutoff = new Date(nowDate.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString();
  const sessionCutoff = new Date(nowDate.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const db = getDb();
  const expiredRateKeys = db.select({ keyHash: authRateLimits.keyHash }).from(authRateLimits).where(lt(authRateLimits.updatedAt, rateLimitCutoff)).limit(100);
  const expiredEventIds = db.select({ id: authEvents.id }).from(authEvents).where(and(lt(authEvents.createdAt, eventCutoff), sql`${authEvents.id} NOT LIKE 'credential-mutation:%'`)).limit(100);
  const expiredSessionIds = db.select({ id: authSessions.id }).from(authSessions).where(lt(authSessions.idleExpiresAt, sessionCutoff)).limit(100);
  return {
    rateLimits: db.delete(authRateLimits).where(inArray(authRateLimits.keyHash, expiredRateKeys)),
    events: db.delete(authEvents).where(inArray(authEvents.id, expiredEventIds)),
    sessions: db.delete(authSessions).where(inArray(authSessions.id, expiredSessionIds)),
  };
}

function credentialFailureQuery(credential: AuthCredential, nowDate: Date) {
  const now = nowDate.toISOString();
  const lockedUntil = new Date(nowDate.getTime() + RATE_BLOCK_MS).toISOString();
  return getDb().update(authCredentials).set({
    failedAttempts: sql`${authCredentials.failedAttempts} + 1`,
    lockedUntil: sql`CASE WHEN ${authCredentials.failedAttempts} + 1 >= ${ACCOUNT_FAILURE_LIMIT} THEN ${lockedUntil} ELSE ${authCredentials.lockedUntil} END`,
    updatedAt: now,
  }).where(and(
    eq(authCredentials.userAccountId, credential.userAccountId),
    eq(authCredentials.credentialVersion, credential.credentialVersion),
  ));
}

function latestFutureTimestamp(now: string, ...timestamps: Array<string | null | undefined>) {
  return timestamps.filter((timestamp): timestamp is string => Boolean(timestamp && timestamp > now)).sort().at(-1) ?? null;
}
