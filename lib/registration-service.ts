import { and, eq, or, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  authCredentials,
  authEvents,
  authRateLimits,
  employeeRegistrationRequests,
  employeeRegistrationReviewClaims,
  employees,
  userAccounts,
} from "../db/schema";
import { type CurrentUser } from "./access-control";
import { publicUserAccountDto } from "./auth-service";
import { findRole } from "./kpi-data";
import {
  hashRegistrationPassword,
  privateLookupHash,
  registrationPasswordValidationError,
  validateLoginId,
} from "./password-crypto";

const REGISTRATION_WINDOW_MS = 15 * 60 * 1000;
const REGISTRATION_BLOCK_MS = 15 * 60 * 1000;
const REGISTRATION_LOGIN_LIMIT = 3;
const REGISTRATION_SOURCE_LIMIT = 8;

type RegistrationRecord = typeof employeeRegistrationRequests.$inferSelect;

export type EmployeeRegistrationRequestDto = Pick<RegistrationRecord,
  "id" | "email" | "loginId" | "firstName" | "lastName" | "nickname" | "status" |
  "submittedAt" | "reviewedByName" | "reviewedAt" | "rejectionReason" | "approvedUserAccountId" | "updatedAt"
>;

export class RegistrationInputError extends Error {
  status: number;
  retryAfterSeconds?: number;

  constructor(message: string, status = 400, retryAfterSeconds?: number) {
    super(message);
    this.name = "RegistrationInputError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function employeeRegistrationRequestDto(record: RegistrationRecord): EmployeeRegistrationRequestDto {
  return {
    id: record.id,
    email: record.email,
    loginId: record.loginId,
    firstName: record.firstName,
    lastName: record.lastName,
    nickname: record.nickname,
    status: record.status,
    submittedAt: record.submittedAt,
    reviewedByName: record.reviewedByName,
    reviewedAt: record.reviewedAt,
    rejectionReason: record.rejectionReason,
    approvedUserAccountId: record.approvedUserAccountId,
    updatedAt: record.updatedAt,
  };
}

export function employeeRegistrationRequestDtos(records: RegistrationRecord[]) {
  return records.map(employeeRegistrationRequestDto);
}

export async function submitEmployeeRegistration(request: Request, input: Record<string, unknown> | null) {
  const email = normalizeEmail(input?.email);
  const loginId = typeof input?.loginId === "string" ? input.loginId.trim() : "";
  const loginIdCanonical = validateLoginId(loginId);
  const password = typeof input?.password === "string" ? input.password : "";
  const firstName = normalizePersonName(input?.firstName, 80);
  const lastName = normalizePersonName(input?.lastName, 80);
  const nickname = normalizePersonName(input?.nickname, 40);

  if (!email) throw new RegistrationInputError("กรุณากรอกอีเมลที่ถูกต้อง");
  if (!loginIdCanonical) throw new RegistrationInputError("รหัสผู้ใช้ต้องยาว 3–64 ตัว และใช้เฉพาะ a-z, 0-9, จุด, ขีดกลาง หรือขีดล่าง");
  const passwordError = registrationPasswordValidationError(password);
  if (passwordError) throw new RegistrationInputError(passwordError);
  if (!firstName || !lastName || !nickname) throw new RegistrationInputError("กรุณากรอกชื่อ นามสกุล และชื่อเล่นให้ครบ");

  const sourceHash = await registrationSourceHash(request);
  await reserveRegistrationAttempt(sourceHash, loginIdCanonical);

  const db = getDb();
  const [existingLogin, existingEmail, pendingRequests] = await Promise.all([
    db.select({ userAccountId: authCredentials.userAccountId }).from(authCredentials)
      .where(eq(authCredentials.loginIdCanonical, loginIdCanonical)).limit(1),
    db.select({ id: userAccounts.id }).from(userAccounts).where(eq(userAccounts.email, email)).limit(1),
    db.select({ id: employeeRegistrationRequests.id, loginIdCanonical: employeeRegistrationRequests.loginIdCanonical, emailCanonical: employeeRegistrationRequests.emailCanonical })
      .from(employeeRegistrationRequests)
      .where(and(
        eq(employeeRegistrationRequests.status, "pending"),
        or(
          eq(employeeRegistrationRequests.loginIdCanonical, loginIdCanonical),
          eq(employeeRegistrationRequests.emailCanonical, email),
        ),
      )),
  ]);
  if (existingLogin.length || pendingRequests.some((item) => item.loginIdCanonical === loginIdCanonical)) {
    throw new RegistrationInputError("รหัสผู้ใช้หรืออีเมลนี้ถูกใช้ หรือมีคำขอรออนุมัติแล้ว", 409);
  }
  if (existingEmail.length || pendingRequests.some((item) => item.emailCanonical === email)) {
    throw new RegistrationInputError("รหัสผู้ใช้หรืออีเมลนี้ถูกใช้ หรือมีคำขอรออนุมัติแล้ว", 409);
  }

  const verifier = await hashRegistrationPassword(password);
  const now = new Date().toISOString();
  const record: typeof employeeRegistrationRequests.$inferInsert = {
    id: `registration-${crypto.randomUUID()}`,
    email,
    emailCanonical: email,
    loginId,
    loginIdCanonical,
    ...verifier,
    firstName,
    lastName,
    nickname,
    status: "pending",
    sourceHash,
    submittedAt: now,
    reviewedByUserId: null,
    reviewedByName: "",
    reviewedAt: null,
    rejectionReason: "",
    approvedUserAccountId: null,
    updatedAt: now,
  };
  await db.batch([
    db.insert(employeeRegistrationRequests).values(record),
    db.insert(authEvents).values({
      id: `auth-event-${crypto.randomUUID()}`,
      userAccountId: null,
      eventType: "registration_submitted",
      sourceHash,
      detail: record.id,
      createdAt: now,
    }),
  ]);
  return employeeRegistrationRequestDto(record as RegistrationRecord);
}

export async function approveEmployeeRegistration(requestIdInput: unknown, employeeIdInput: unknown, roleInput: unknown, reviewer: CurrentUser) {
  const requestId = textValue(requestIdInput, 120);
  const employeeId = textValue(employeeIdInput, 120);
  const role = roleInput === undefined ? "employee" : roleInput === "admin" || roleInput === "manager" || roleInput === "employee" ? roleInput : null;
  if (!requestId || !employeeId) throw new RegistrationInputError("กรุณาเลือกคำขอและโปรไฟล์พนักงานที่จะผูก");
  if (!role) throw new RegistrationInputError("กรุณาเลือกสิทธิ์บัญชีที่ถูกต้อง");
  const db = getDb();
  const [registrationRows, employeeRows] = await db.batch([
    db.select().from(employeeRegistrationRequests).where(eq(employeeRegistrationRequests.id, requestId)).limit(1),
    db.select().from(employees).where(eq(employees.id, employeeId)).limit(1),
  ]);
  const registration = registrationRows[0];
  const employee = employeeRows[0];
  if (!registration) throw new RegistrationInputError("ไม่พบคำขอสมัครสมาชิก", 404);
  if (registration.status !== "pending") throw new RegistrationInputError("คำขอนี้ได้รับการตรวจแล้ว", 409);
  if (!employee || employee.status !== "active") throw new RegistrationInputError("ต้องเลือกโปรไฟล์พนักงานที่ใช้งานอยู่", 409);
  if (!registration.passwordHash || !registration.passwordSalt) throw new RegistrationInputError("คำขอนี้ไม่มีข้อมูลรหัสผ่านที่พร้อมใช้งาน", 409);

  const [loginOwner, emailOwner, employeeOwner] = await db.batch([
    db.select({ id: authCredentials.userAccountId }).from(authCredentials).where(eq(authCredentials.loginIdCanonical, registration.loginIdCanonical)).limit(1),
    db.select({ id: userAccounts.id }).from(userAccounts).where(eq(userAccounts.email, registration.emailCanonical)).limit(1),
    db.select({ id: userAccounts.id }).from(userAccounts).where(eq(userAccounts.employeeId, employeeId)).limit(1),
  ]);
  if (loginOwner.length) throw new RegistrationInputError("รหัสผู้ใช้นี้ถูกใช้แล้ว", 409);
  if (emailOwner.length) throw new RegistrationInputError("อีเมลนี้ถูกใช้แล้ว", 409);
  if (employeeOwner.length) throw new RegistrationInputError("โปรไฟล์พนักงานนี้มีบัญชีอยู่แล้ว", 409);

  const now = new Date().toISOString();
  const accountId = `user-${crypto.randomUUID()}`;
  const displayName = `${registration.firstName} ${registration.lastName}`.trim();
  const employeeRole = findRole(employee.roleId);
  if (role !== "admin" && !employeeRole) throw new RegistrationInputError("โปรไฟล์พนักงานไม่มีกรอบตำแหน่งมาตรฐาน กรุณาให้ HR แก้ไขก่อนอนุมัติ", 409);
  const account: typeof userAccounts.$inferInsert = {
    id: accountId,
    authUserId: "",
    email: registration.emailCanonical,
    displayName,
    nickname: registration.nickname,
    role,
    employeeId,
    departmentId: role === "admin" ? "" : employeeRole?.departmentId ?? "",
    status: "active",
    lastLoginAt: null,
    createdBy: reviewer.displayName,
    createdAt: now,
    updatedAt: now,
  };
  await db.batch([
    db.insert(employeeRegistrationReviewClaims).values({ requestId, decision: "approved", reviewerUserId: reviewer.id, createdAt: now }),
    db.insert(userAccounts).values(account),
    db.insert(authCredentials).values({
      userAccountId: accountId,
      loginId: registration.loginId,
      loginIdCanonical: registration.loginIdCanonical,
      passwordHash: registration.passwordHash,
      passwordSalt: registration.passwordSalt,
      passwordAlgorithm: registration.passwordAlgorithm,
      passwordIterations: registration.passwordIterations,
      pepperVersion: registration.pepperVersion,
      credentialVersion: 1,
      mustChangePassword: false,
      failedAttempts: 0,
      lockedUntil: null,
      passwordChangedAt: now,
      createdAt: now,
      updatedAt: now,
    }),
    db.update(employeeRegistrationRequests).set({
      status: "approved",
      passwordHash: "",
      passwordSalt: "",
      reviewedByUserId: reviewer.id,
      reviewedByName: reviewer.displayName,
      reviewedAt: now,
      rejectionReason: "",
      approvedUserAccountId: accountId,
      updatedAt: now,
    }).where(and(eq(employeeRegistrationRequests.id, requestId), eq(employeeRegistrationRequests.status, "pending"))),
    db.insert(authEvents).values({
      id: `auth-event-${crypto.randomUUID()}`,
      userAccountId: accountId,
      eventType: "registration_approved",
      sourceHash: "",
      detail: `request:${requestId};reviewer:${reviewer.id};role:${role}`,
      createdAt: now,
    }),
  ]);
  const reviewed = { ...registration, status: "approved" as const, passwordHash: "", passwordSalt: "", reviewedByUserId: reviewer.id, reviewedByName: reviewer.displayName, reviewedAt: now, rejectionReason: "", approvedUserAccountId: accountId, updatedAt: now };
  return {
    registrationRequest: employeeRegistrationRequestDto(reviewed),
    userAccount: publicUserAccountDto(account as typeof userAccounts.$inferSelect, {
      loginId: registration.loginId,
      passwordHash: registration.passwordHash,
      mustChangePassword: false,
      lockedUntil: null,
    }),
  };
}

export async function rejectEmployeeRegistration(requestIdInput: unknown, reasonInput: unknown, reviewer: CurrentUser) {
  const requestId = textValue(requestIdInput, 120);
  const reason = textValue(reasonInput, 500);
  if (!requestId) throw new RegistrationInputError("กรุณาเลือกคำขอสมัครสมาชิก");
  if (reason.length < 3) throw new RegistrationInputError("กรุณาระบุเหตุผลที่ปฏิเสธอย่างน้อย 3 ตัวอักษร");
  const db = getDb();
  const [registration] = await db.select().from(employeeRegistrationRequests).where(eq(employeeRegistrationRequests.id, requestId)).limit(1);
  if (!registration) throw new RegistrationInputError("ไม่พบคำขอสมัครสมาชิก", 404);
  if (registration.status !== "pending") throw new RegistrationInputError("คำขอนี้ได้รับการตรวจแล้ว", 409);
  const now = new Date().toISOString();
  await db.batch([
    db.insert(employeeRegistrationReviewClaims).values({ requestId, decision: "rejected", reviewerUserId: reviewer.id, createdAt: now }),
    db.update(employeeRegistrationRequests).set({
      status: "rejected",
      passwordHash: "",
      passwordSalt: "",
      reviewedByUserId: reviewer.id,
      reviewedByName: reviewer.displayName,
      reviewedAt: now,
      rejectionReason: reason,
      updatedAt: now,
    }).where(and(eq(employeeRegistrationRequests.id, requestId), eq(employeeRegistrationRequests.status, "pending"))),
    db.insert(authEvents).values({
      id: `auth-event-${crypto.randomUUID()}`,
      userAccountId: null,
      eventType: "registration_rejected",
      sourceHash: "",
      detail: `request:${requestId};reviewer:${reviewer.id}`,
      createdAt: now,
    }),
  ]);
  return employeeRegistrationRequestDto({ ...registration, status: "rejected", passwordHash: "", passwordSalt: "", reviewedByUserId: reviewer.id, reviewedByName: reviewer.displayName, reviewedAt: now, rejectionReason: reason, updatedAt: now });
}

function normalizeEmail(value: unknown) {
  if (typeof value !== "string") return "";
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "";
  return email;
}

function normalizePersonName(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  const text = value.trim().replace(/\s+/g, " ").slice(0, maxLength);
  if (!text || /[\u0000-\u001f\u007f]/.test(text)) return "";
  return text;
}

function textValue(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

async function registrationSourceHash(request: Request) {
  const url = new URL(request.url);
  const cloudflareAddress = request.headers.get("cf-connecting-ip")?.trim();
  const source = cloudflareAddress
    ? cloudflareAddress.slice(0, 80)
    : url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]"
      ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 80) || "local-development"
      : "cloudflare-address-unavailable";
  return privateLookupHash("registration-source", source);
}

async function reserveRegistrationAttempt(sourceHash: string, loginIdCanonical: string) {
  const db = getDb();
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const loginKeyHash = await privateLookupHash("registration-login-id", loginIdCanonical);
  const sourceKeyHash = await privateLookupHash("registration-source-rate", sourceHash);
  const [loginRows, sourceRows] = await db.batch([
    registrationRateReservation(loginKeyHash, "login_id", REGISTRATION_LOGIN_LIMIT, nowDate),
    registrationRateReservation(sourceKeyHash, "source", REGISTRATION_SOURCE_LIMIT, nowDate),
  ]);
  const blockedUntil = [loginRows[0]?.blockedUntil, sourceRows[0]?.blockedUntil]
    .filter((value): value is string => Boolean(value && value > now))
    .sort()
    .at(-1);
  if (blockedUntil) {
    throw new RegistrationInputError(
      "ส่งคำขอหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่",
      429,
      Math.max(1, Math.ceil((Date.parse(blockedUntil) - nowDate.getTime()) / 1000)),
    );
  }
}

function registrationRateReservation(keyHash: string, bucketType: "login_id" | "source", limit: number, nowDate: Date) {
  const db = getDb();
  const now = nowDate.toISOString();
  const windowCutoff = new Date(nowDate.getTime() - REGISTRATION_WINDOW_MS).toISOString();
  const blockedUntil = new Date(nowDate.getTime() + REGISTRATION_BLOCK_MS).toISOString();
  return db.insert(authRateLimits).values({ keyHash, bucketType, windowStartedAt: now, attemptCount: 1, blockedUntil: null, updatedAt: now })
    .onConflictDoUpdate({
      target: authRateLimits.keyHash,
      set: {
        bucketType,
        windowStartedAt: sql`CASE WHEN ${authRateLimits.blockedUntil} > ${now} THEN ${authRateLimits.windowStartedAt} WHEN ${authRateLimits.windowStartedAt} <= ${windowCutoff} THEN ${now} ELSE ${authRateLimits.windowStartedAt} END`,
        attemptCount: sql`CASE WHEN ${authRateLimits.blockedUntil} > ${now} THEN ${authRateLimits.attemptCount} WHEN ${authRateLimits.windowStartedAt} <= ${windowCutoff} THEN 1 ELSE ${authRateLimits.attemptCount} + 1 END`,
        blockedUntil: sql`CASE WHEN ${authRateLimits.blockedUntil} > ${now} THEN ${authRateLimits.blockedUntil} WHEN ${authRateLimits.windowStartedAt} <= ${windowCutoff} THEN NULL WHEN ${authRateLimits.attemptCount} + 1 > ${limit} THEN ${blockedUntil} ELSE ${authRateLimits.blockedUntil} END`,
        updatedAt: now,
      },
    })
    .returning({ blockedUntil: authRateLimits.blockedUntil });
}
