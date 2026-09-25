import { and, eq, isNull, notExists, or, sql } from "drizzle-orm";
import { getD1, getDb, getFilesBucket } from "../../../db";
import { ensureDatabase } from "../../../db/initialize";
import { ensureEmployeeProfileAudit } from "../../../lib/employee-profile-audit";
import { applicationDocuments, attendanceRecords, authCredentials, authEvents, authSessions, employeePositionEvents, employeeProfiles, employeeRecognitions, employeeRegistrationRequests, employeeSelfAssessments, employees, employeeWarningEvents, employeeWarnings, employmentContracts, evaluations, hrProfiles, notificationReads, organizationDocuments, organizationPolicies, organizationPolicyPublishClaims, pointCapClaims, pointEvents, pointLedger, pointMutationClaims, policyAcknowledgements, projects, questCompletions, quests, questTargets, rewardRedemptionClaims, rewardRedemptions, rewards, skillAchievements, talentActions, userAccounts, workItems, workSubmissions } from "../../../db/schema";
import { authenticatedRequestGate, canAccessEmployee, ensureBootstrapAccounts, recordAuthEvent, revokeAllSessionsForAccount, type CurrentUser } from "../../../lib/access-control";
import { AuthInputError, credentialMutationValues, getAccountCredential, publicUserAccountDto, publicUserAccountDtos, requestSourceHash } from "../../../lib/auth-service";
import { internalApiError } from "../../../lib/api-errors";
import { approveEmployeeRegistration, employeeRegistrationRequestDtos, RegistrationInputError, rejectEmployeeRegistration } from "../../../lib/registration-service";
import { canManageSystemSettings, getPublicSystemSettings, getSystemSettingsRow } from "../../../lib/system-settings";
import {
  clampScore,
  clampSkillLevel,
  calculateSkillScore,
  findRole,
  getRole,
  makeInitials,
  monthlyEvaluationPoints,
  periods,
  defaultPointPolicyRules,
  resolvePointPolicyRules,
  roleSalaryBands,
  roles,
  seedAttendanceRecords,
  seedEmployees,
  seedApplicationDocuments,
  seedEmployeeProfiles,
  seedEmployeeLegacyRoleIds,
  seedEmploymentContracts,
  seedHrProfiles,
  seedOrganizationPolicies,
  seedPointLedger,
  seedProjects,
  seedRewardRedemptions,
  seedRewards,
  seedSkillAchievements,
  seedTalentActions,
  seedWorkItems,
  workPointValue,
  type PointEventRecord,
  type PointEventType,
  type PointLedgerRecord,
  type UserAccountRecord,
} from "../../../lib/kpi-data";

export const dynamic = "force-dynamic";

function normalizedPositionTitle(value: unknown) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.includes("\0")) return null;
  return value.normalize("NFC").trim().replace(/\s+/g, " ");
}

function roleDepartmentId(roleId: string) {
  return findRole(roleId)?.departmentId ?? "";
}

function apiError(error: unknown) {
  const message = error instanceof Error ? error.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ";
  if (error instanceof AuthInputError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof RegistrationInputError) return Response.json({ error: error.message }, { status: error.status });
  if (message.includes("no such table")) {
    return Response.json({ error: "ฐานข้อมูลยังไม่พร้อม กรุณาเผยแพร่เวอร์ชันที่มี migration ล่าสุด" }, { status: 503 });
  }
  if (message.includes("STALE_CREDENTIAL_VERSION") || message.includes("auth_events.id")) {
    return Response.json({ error: "ข้อมูลบัญชีถูกแก้ไขจากอีกหน้าจอ กรุณาโหลดข้อมูลล่าสุด" }, { status: 409 });
  }
  if (message.includes("employee_registration_review_claims.request_id") || message.includes("REGISTRATION_ALREADY_REVIEWED") || message.includes("REGISTRATION_REVIEW_REQUIRED")) {
    return Response.json({ error: "คำขอนี้ได้รับการตรวจแล้ว กรุณาโหลดข้อมูลล่าสุด" }, { status: 409 });
  }
  if (message.includes("auth_credentials.login_id_canonical")) {
    return Response.json({ error: "ชื่อผู้ใช้นี้มีผู้ใช้งานแล้ว กรุณาเลือกชื่ออื่น" }, { status: 409 });
  }
  if (message.includes("UNIQUE constraint failed")) {
    return Response.json({ error: "อีเมลนี้มีอยู่ในระบบแล้ว" }, { status: 409 });
  }
  if (message.includes("LAST_ACTIVE_ADMIN_REQUIRED")) {
    return Response.json({ error: "ต้องมีบัญชี HR / Admin ที่ใช้งานอยู่อย่างน้อย 1 บัญชี" }, { status: 409 });
  }
  if (message.includes("SYSTEM_OWNER_REQUIRED")) {
    return Response.json({ error: "บัญชีเจ้าของระบบต้องคงสถานะผู้ดูแลที่ใช้งานอยู่" }, { status: 403 });
  }
  if (message.includes("QUEST_REWARD_LINKING_DISABLED")) {
    return Response.json({ error: "เจ้าของระบบปิดการผูกรางวัลใหม่กับเควสไว้ กรุณาแก้การตั้งค่าระบบก่อน" }, { status: 409 });
  }
  return internalApiError(error, "ระบบไม่สามารถดำเนินการได้ในขณะนี้", "dashboard");
}

let seedInitialization: Promise<void> | null = null;
const demoDataEnabled = process.env.PEOPLE_PULSE_ENABLE_DEMO_DATA === "true";

type OrganizationPolicyRow = typeof organizationPolicies.$inferSelect;

type PolicyHashInput = Pick<OrganizationPolicyRow, "code" | "title" | "summary" | "content" | "category" | "version" | "effectiveDate" | "scopeType" | "scopeValues" | "acknowledgementRequired" | "acknowledgementDueDays" | "rules">;

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => [key, stableJsonValue((value as Record<string, unknown>)[key])]));
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function policyIntegrityHash(policy: PolicyHashInput) {
  return sha256Hex(JSON.stringify(stableJsonValue({
    code: policy.code,
    title: policy.title,
    summary: policy.summary,
    content: policy.content,
    category: policy.category,
    version: policy.version,
    effectiveDate: policy.effectiveDate,
    scopeType: policy.scopeType,
    scopeValues: [...policy.scopeValues].sort(),
    acknowledgementRequired: policy.acknowledgementRequired,
    acknowledgementDueDays: policy.acknowledgementDueDays,
    rules: policy.rules ?? null,
  })));
}

function pointPolicyMetadata(policy: OrganizationPolicyRow | null) {
  return {
    policyId: policy?.id ?? null,
    policyVersion: policy?.version ?? null,
    policyContentHash: policy?.contentHash || null,
  };
}

function publicPolicyAcknowledgement(acknowledgement: typeof policyAcknowledgements.$inferSelect) {
  const { id, policyId, employeeId, policyVersion, contentHash, acknowledgedAt } = acknowledgement;
  return { id, policyId, employeeId, policyVersion, contentHash, acknowledgedAt };
}

function privateFileDto<T extends { storageKey: string }>(record: T): Omit<T, "storageKey"> & { hasFile: boolean } {
  const { storageKey, ...safe } = record;
  return { ...safe, hasFile: Boolean(storageKey) };
}

function validProfileImageKey(employeeId: string, storageKey: string) {
  return storageKey.startsWith(`employee-profile-images/${employeeId}/`) && storageKey.length > `employee-profile-images/${employeeId}/`.length;
}

function employeeProfileWithValidImage(profile: typeof employeeProfiles.$inferSelect) {
  const profileImageKey = validProfileImageKey(profile.employeeId, profile.profileImageKey) ? profile.profileImageKey : "";
  return { ...profile, profileImageKey, profileImageUpdatedAt: profileImageKey ? profile.profileImageUpdatedAt : null };
}

const LEGACY_POINTS_TERM = "\u0e41\u0e15\u0e49\u0e21";

function withPointsDisplayTerminology<T>(value: T): T {
  if (typeof value === "string") {
    return value
      .replaceAll(LEGACY_POINTS_TERM, " Points ")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/[ \t]+([,.;:!?])/g, "$1")
      .replace(/[ \t]*\n[ \t]*/g, "\n")
      .trim() as T;
  }
  if (Array.isArray(value)) return value.map(withPointsDisplayTerminology) as T;
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [key, withPointsDisplayTerminology(nestedValue)]),
  ) as T;
}

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const EMPLOYEE_COORDINATION_OPEN_CREATOR_LIMIT = 12;
const EMPLOYEE_COORDINATION_OPEN_PAIR_LIMIT = 5;
const EMPLOYEE_COORDINATION_OPEN_RECIPIENT_LIMIT = 12;

function bangkokIsoDayFromTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp + BANGKOK_OFFSET_MS).toISOString().slice(0, 10) : null;
}

function bangkokMonthFromTimestamp(value: string) {
  return bangkokIsoDayFromTimestamp(value)?.slice(0, 7) ?? null;
}

function bangkokIsoDay() {
  return new Date(Date.now() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

function isoDayDistance(earlierDay: string, laterDay: string) {
  return Math.floor((Date.parse(`${laterDay}T00:00:00.000Z`) - Date.parse(`${earlierDay}T00:00:00.000Z`)) / 86_400_000);
}

function isValidIsoDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Error && error.message.includes("UNIQUE constraint failed");
}

function isRedemptionConflictError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return isUniqueConstraintError(error)
    || error.message.includes("REDEMPTION_")
    || error.message.includes("NOT NULL constraint failed: rewards.title");
}

async function initializeSeedData() {
  await ensureDatabase();
  const db = getDb();
  for (const employee of seedEmployees) {
    const [existingEmployee] = await db.select().from(employees).where(eq(employees.id, employee.id)).limit(1);
    if (!existingEmployee) {
      await db.insert(employees).values({ ...employee, createdAt: employee.updatedAt }).onConflictDoNothing();
      continue;
    }

    const legacyRoleId = seedEmployeeLegacyRoleIds[employee.id];
    const isUnmodifiedDemoEmployee = Boolean(
      legacyRoleId
      && existingEmployee.roleId === legacyRoleId
      && existingEmployee.name === employee.name
      && existingEmployee.email === employee.email,
    );
    if (!isUnmodifiedDemoEmployee) continue;

    await db.update(employees).set({
      roleId: employee.roleId,
      manager: employee.manager,
      updatedAt: employee.updatedAt,
    }).where(eq(employees.id, employee.id));

    if (existingEmployee.latestPeriod && existingEmployee.latestScore !== null) {
      const [seededEvaluation] = await db.select().from(evaluations).where(and(
        eq(evaluations.employeeId, employee.id),
        eq(evaluations.period, existingEmployee.latestPeriod),
      )).limit(1);
      if (seededEvaluation?.note === "ข้อมูลตั้งต้นสำหรับรอบประเมิน" && seededEvaluation.evaluator === "ฝ่ายทรัพยากรบุคคล") {
        const role = getRole(employee.roleId);
        const skillLevel = Math.max(1, Math.min(5, Math.round((existingEmployee.latestSkillScore ?? 80) / 20)));
        await db.update(evaluations).set({
          kpiScores: Object.fromEntries(role.kpis.map((kpi) => [kpi.id, existingEmployee.latestScore ?? 80])),
          skillScores: Object.fromEntries(role.skills.map((skill) => [skill.id, skillLevel])),
        }).where(eq(evaluations.id, seededEvaluation.id));
      }
    }
  }

  const [existingEvaluation] = await db.select({ id: evaluations.id }).from(evaluations).limit(1);
  if (!existingEvaluation) {
    const initialEvaluations = seedEmployees.flatMap((employee) => {
      if (employee.latestScore === null || employee.latestPeriod === null) return [];
      const role = getRole(employee.roleId);
      const skillLevel = Math.max(1, Math.min(5, Math.round((employee.latestSkillScore ?? 80) / 20)));
      return [{
        id: `${employee.id}:${employee.latestPeriod}`,
        employeeId: employee.id,
        period: employee.latestPeriod,
        kpiScores: Object.fromEntries(role.kpis.map((kpi) => [kpi.id, employee.latestScore ?? 80])),
        skillScores: Object.fromEntries(role.skills.map((skill) => [skill.id, skillLevel])),
        kpiScore: employee.latestScore,
        skillScore: employee.latestSkillScore ?? skillLevel * 20,
        totalScore: employee.latestScore,
        note: "ข้อมูลตั้งต้นสำหรับรอบประเมิน",
        evaluator: "ฝ่ายทรัพยากรบุคคล",
        evaluatedAt: employee.updatedAt,
      }];
    });
    if (initialEvaluations.length) await db.insert(evaluations).values(initialEvaluations).onConflictDoNothing();
  }

  const [existingHrProfile] = await db.select({ employeeId: hrProfiles.employeeId }).from(hrProfiles).limit(1);
  if (!existingHrProfile) await db.insert(hrProfiles).values(seedHrProfiles).onConflictDoNothing();

  for (const action of seedTalentActions) await db.insert(talentActions).values(action).onConflictDoNothing();
  const legacyTalentActionRoles: Record<string, string> = {
    "action-thanawat-test": "customer-service",
    "action-nattapong-upskill": "sales-manager",
    "action-pim-role": "hr",
    "action-narin-salary": "sales-manager",
  };
  for (const action of seedTalentActions) {
    const [existingAction] = await db.select().from(talentActions).where(eq(talentActions.id, action.id)).limit(1);
    if (existingAction?.targetRoleId !== legacyTalentActionRoles[action.id]) continue;
    await db.update(talentActions).set({
      title: action.title,
      targetRoleId: action.targetRoleId,
      updatedAt: action.updatedAt,
    }).where(eq(talentActions.id, action.id));
  }

  const [existingAttendanceRecord] = await db.select({ id: attendanceRecords.id }).from(attendanceRecords).limit(1);
  if (!existingAttendanceRecord) await db.insert(attendanceRecords).values(seedAttendanceRecords).onConflictDoNothing();

  for (const achievement of seedSkillAchievements) await db.insert(skillAchievements).values(achievement).onConflictDoNothing();
  const legacyAchievementSkills: Record<string, string> = {
    "achievement-narin-negotiation-4": "negotiation",
    "achievement-supakorn-engineering-4": "engineering",
  };
  for (const achievement of seedSkillAchievements) {
    const [existingAchievement] = await db.select().from(skillAchievements).where(eq(skillAchievements.id, achievement.id)).limit(1);
    if (existingAchievement?.skillId !== legacyAchievementSkills[achievement.id]) continue;
    await db.update(skillAchievements).set({
      roleId: achievement.roleId,
      skillId: achievement.skillId,
      skillName: achievement.skillName,
      monthlyAllowance: achievement.monthlyAllowance,
      note: achievement.note,
    }).where(eq(skillAchievements.id, achievement.id));
  }

  const [existingProject] = await db.select({ id: projects.id }).from(projects).limit(1);
  if (!existingProject) await db.insert(projects).values(seedProjects).onConflictDoNothing();

  const [existingWorkItem] = await db.select({ id: workItems.id }).from(workItems).limit(1);
  if (!existingWorkItem) {
    // Keep each seed statement below D1's bound-parameter ceiling.
    for (const workItem of seedWorkItems) {
      await db.insert(workItems).values(workItem).onConflictDoNothing();
    }
  }

  for (const reward of seedRewards) await db.insert(rewards).values(reward).onConflictDoNothing();
  const legacyRewardCosts: Record<string, number> = {
    "reward-coffee": 120,
    "reward-half-day": 500,
    "reward-learning": 850,
    "reward-lunch": 350,
  };
  for (const reward of seedRewards) {
    const legacyCost = legacyRewardCosts[reward.id];
    if (legacyCost === undefined) continue;
    const [existingReward] = await db.select().from(rewards).where(eq(rewards.id, reward.id)).limit(1);
    if (!existingReward || existingReward.costPoints !== legacyCost || existingReward.title !== reward.title) continue;
    await db.update(rewards).set({ costPoints: reward.costPoints, updatedAt: reward.updatedAt }).where(eq(rewards.id, reward.id));
  }

  for (const policy of seedOrganizationPolicies) {
    const normalizedPolicy = {
      ...policy,
      scopeType: policy.category === "points_rewards" ? "all" as const : policy.scopeType,
      scopeValues: policy.category === "points_rewards" ? [] : policy.scopeValues,
      contentHash: policy.status === "published" ? await policyIntegrityHash({ ...policy, scopeType: policy.category === "points_rewards" ? "all" : policy.scopeType, scopeValues: policy.category === "points_rewards" ? [] : policy.scopeValues }) : "",
    };
    await db.insert(organizationPolicies).values(normalizedPolicy).onConflictDoNothing();
  }
  const publishedPolicyRows = await db.select().from(organizationPolicies).where(eq(organizationPolicies.status, "published"));
  for (const policy of publishedPolicyRows) {
    const canonicalHash = await policyIntegrityHash(policy);
    const legacyContentHash = await sha256Hex(policy.content);
    if (policy.contentHash === canonicalHash || (/^[a-f0-9]{64}$/.test(policy.contentHash) && policy.contentHash !== legacyContentHash)) continue;
    await db.update(organizationPolicies).set({ contentHash: canonicalHash }).where(eq(organizationPolicies.id, policy.id));
  }

  for (const entry of seedPointLedger) await db.insert(pointLedger).values(entry).onConflictDoNothing();
  const legacySeedPointValues: Record<string, number> = {
    "points-work-growth-key-account": 180,
    "points-work-tech-runbook": 140,
    "points-bonus-pim": 420,
    "points-bonus-thanawat": 260,
    "points-bonus-kanyarat": 310,
    "points-bonus-nattapong": 290,
    "points-bonus-sirilak": 180,
    "points-bonus-pattarapon": 230,
  };
  for (const entry of seedPointLedger) {
    const legacyPoints = legacySeedPointValues[entry.id];
    if (legacyPoints === undefined) continue;
    const [existingEntry] = await db.select().from(pointLedger).where(eq(pointLedger.id, entry.id)).limit(1);
    if (!existingEntry || existingEntry.points !== legacyPoints || existingEntry.employeeId !== entry.employeeId || existingEntry.sourceId !== entry.sourceId) continue;
    await db.update(pointLedger).set({ points: entry.points, note: entry.note }).where(eq(pointLedger.id, entry.id));
  }

  const [existingRedemption] = await db.select({ id: rewardRedemptions.id }).from(rewardRedemptions).limit(1);
  if (!existingRedemption && seedRewardRedemptions.length) await db.insert(rewardRedemptions).values(seedRewardRedemptions).onConflictDoNothing();

  const [existingEmployeeProfile] = await db.select({ employeeId: employeeProfiles.employeeId }).from(employeeProfiles).limit(1);
  if (!existingEmployeeProfile) {
    for (const profile of seedEmployeeProfiles) await db.insert(employeeProfiles).values(profile).onConflictDoNothing();
  }

  const [existingApplicationDocument] = await db.select({ id: applicationDocuments.id }).from(applicationDocuments).limit(1);
  if (!existingApplicationDocument) {
    for (const document of seedApplicationDocuments) await db.insert(applicationDocuments).values(document).onConflictDoNothing();
  }

  const [existingEmploymentContract] = await db.select({ id: employmentContracts.id }).from(employmentContracts).limit(1);
  if (!existingEmploymentContract) {
    for (const contract of seedEmploymentContracts) await db.insert(employmentContracts).values(contract).onConflictDoNothing();
  }
  await ensureBootstrapAccounts();
}

async function ensureSeedData() {
  if (!demoDataEnabled) {
    await ensureDatabase();
    await ensureBootstrapAccounts();
    return;
  }
  if (seedInitialization) return seedInitialization;
  seedInitialization = initializeSeedData().catch((error) => {
    seedInitialization = null;
    throw error;
  });
  return seedInitialization;
}

function authenticatedActor(currentUser: CurrentUser) {
  return { userId: currentUser.id, email: currentUser.email, name: currentUser.authenticatedName };
}

function evaluatorName(currentUser: CurrentUser) {
  return currentUser.authenticatedName;
}

function isSafeOptionalUrl(value: string) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isSafeHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isPolicyEffective(policy: OrganizationPolicyRow, day: string) {
  return policy.status === "published" && policy.effectiveDate <= day && (!policy.effectiveTo || policy.effectiveTo >= day);
}

function pointPolicyFromRows(policyRows: OrganizationPolicyRow[], day = bangkokIsoDay()) {
  const policy = policyRows
    .filter((row) => row.code === "points-and-rewards" && row.category === "points_rewards" && row.scopeType === "all" && isPolicyEffective(row, day))
    .sort((a, b) => b.version - a.version)[0] ?? null;
  return { policy, rules: resolvePointPolicyRules(policy?.rules ?? defaultPointPolicyRules) };
}

type QuestRow = typeof quests.$inferSelect;
type QuestTargetRow = typeof questTargets.$inferSelect;
type QuestCompletionRow = typeof questCompletions.$inferSelect;

function questDto(quest: QuestRow, targetRows: QuestTargetRow[], includeAdminMetadata = false) {
  const ownTargets = targetRows.filter((target) => target.questId === quest.id);
  const targetEmployees = ownTargets
    .filter((target) => target.targetType === "employee")
    .map((target) => ({ id: target.targetKey, label: target.targetLabelSnapshot || target.targetKey }))
    .sort((a, b) => a.label.localeCompare(b.label, "th"));
  const targetDepartments = ownTargets
    .filter((target) => target.targetType === "department")
    .map((target) => ({ id: target.targetKey, label: target.targetLabelSnapshot || target.targetKey }))
    .sort((a, b) => a.label.localeCompare(b.label, "th"));
  const { createdByUserId, createdByName, updatedByUserId, updatedByName, ...publicQuest } = quest;
  return {
    ...publicQuest,
    ...(includeAdminMetadata ? { createdByUserId, createdByName, updatedByUserId, updatedByName } : {}),
    targetEmployeeIds: targetEmployees.map((target) => target.id),
    targetDepartmentIds: targetDepartments.map((target) => target.id),
    targetEmployees,
    targetDepartments,
    pointsAwardMode: "admin_verified_completion" as const,
    rewardFulfillmentMode: quest.rewardId ? "admin_verified_completion" as const : "none" as const,
    fulfillmentNotice: quest.rewardId
      ? "HR / Admin ต้องตรวจหลักฐานแล้วใช้ “ตรวจผลและมอบสิทธิ์” ระบบจึงจะบันทึก Points และตัดสต็อกรางวัลพร้อมกันเพียงครั้งเดียว"
      : "HR / Admin ต้องตรวจหลักฐานแล้วใช้ “ตรวจผลและมอบสิทธิ์” ระบบจึงจะบันทึก Points เพียงครั้งเดียว",
  };
}

function questCompletionDto(completion: QuestCompletionRow, includeAdminMetadata = false) {
  const { completedByUserId, ...publicCompletion } = completion;
  return {
    ...publicCompletion,
    ...(includeAdminMetadata ? { completedByUserId } : {}),
  };
}

function policyAppliesToEmployee(
  policy: OrganizationPolicyRow,
  employee: typeof employees.$inferSelect | null,
  employeeProfile: typeof employeeProfiles.$inferSelect | null,
) {
  if (policy.scopeType === "all") return true;
  if (!employee) return false;
  const employeeRole = findRole(employee.roleId);
  if (policy.scopeType === "department") return Boolean(employeeRole && policy.scopeValues.includes(employeeRole.departmentId));
  if (policy.scopeType === "role") return Boolean(employeeRole && policy.scopeValues.includes(employeeRole.id));
  return Boolean(employeeProfile && policy.scopeValues.includes(employeeProfile.employmentType));
}

function previousIsoDay(day: string) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  try {
    const authentication = await authenticatedRequestGate(request);
    if (authentication.response) return authentication.response;
    const authenticatedUser = authentication.currentUser;
    await ensureSeedData();
    const url = new URL(request.url);
    const period = url.searchParams.get("period") ?? periods[0];
    const requestedPreviewEmployeeId = url.searchParams.get("previewEmployeeId")?.trim() ?? "";
    const isEmployeePreviewRequest = authenticatedUser.role === "admin" && Boolean(requestedPreviewEmployeeId);
    const db = getDb();
    const publicSystemSettings = await getPublicSystemSettings();
    const [employeeRows, employeePositionEventRows, evaluationRows, selfAssessmentRows, hrProfileRows, attendanceRows, skillAchievementRows, talentActionRows, projectRows, workItemRows, workSubmissionRows, questRows, questTargetRows, questCompletionRows, rewardRows, pointRows, pointEventRows, redemptionRows, employeeProfileRows, applicationDocumentRows, employmentContractRows, organizationPolicyRows, policyAcknowledgementRows, organizationDocumentRows, employeeWarningRows, employeeWarningEventRows, employeeRecognitionRows, userAccountRows, registrationRequestRows, notificationReadRows] = await Promise.all([
      db.select().from(employees),
      authenticatedUser.role === "admin" && !isEmployeePreviewRequest ? db.select().from(employeePositionEvents) : Promise.resolve([]),
      db.select().from(evaluations).where(eq(evaluations.period, period)),
      db.select().from(employeeSelfAssessments).where(eq(employeeSelfAssessments.period, period)),
      db.select().from(hrProfiles),
      db.select().from(attendanceRecords),
      db.select().from(skillAchievements),
      db.select().from(talentActions),
      db.select().from(projects),
      db.select().from(workItems),
      db.select().from(workSubmissions),
      db.select().from(quests),
      db.select().from(questTargets),
      db.select().from(questCompletions),
      db.select().from(rewards),
      db.select().from(pointLedger),
      db.select().from(pointEvents),
      db.select().from(rewardRedemptions),
      db.select().from(employeeProfiles),
      db.select().from(applicationDocuments),
      db.select().from(employmentContracts),
      db.select().from(organizationPolicies),
      db.select().from(policyAcknowledgements),
      authenticatedUser.role === "admin" && !isEmployeePreviewRequest ? db.select().from(organizationDocuments) : Promise.resolve([]),
      authenticatedUser.role === "admin" && !isEmployeePreviewRequest ? db.select().from(employeeWarnings) : Promise.resolve([]),
      authenticatedUser.role === "admin" && !isEmployeePreviewRequest ? db.select().from(employeeWarningEvents) : Promise.resolve([]),
      authenticatedUser.role === "admin" && !isEmployeePreviewRequest ? db.select().from(employeeRecognitions) : Promise.resolve([]),
      authenticatedUser.role === "admin" && !isEmployeePreviewRequest ? db.select().from(userAccounts) : Promise.resolve([]),
      authenticatedUser.role === "admin" && !isEmployeePreviewRequest ? db.select().from(employeeRegistrationRequests) : Promise.resolve([]),
      isEmployeePreviewRequest ? Promise.resolve([]) : db.select().from(notificationReads).where(eq(notificationReads.userKey, authenticatedUser.id)),
    ]);
    let currentUser = authenticatedUser;
    let employeePreview: { employeeId: string; readOnly: true; launchedBy: string } | null = null;
    if (isEmployeePreviewRequest) {
      const previewEmployee = employeeRows.find((employee) => employee.id === requestedPreviewEmployeeId && employee.status === "active");
      if (!previewEmployee) {
        return Response.json({ error: "ไม่พบโปรไฟล์พนักงานที่ใช้งานอยู่สำหรับโหมดทดลอง" }, { status: 404 });
      }
      const previewRole = findRole(previewEmployee.roleId);
      if (!previewRole) {
        return Response.json({ error: "โปรไฟล์พนักงานไม่มีกรอบ KPI มาตรฐาน กรุณาให้ HR แก้ไขก่อนเปิดมุมมองพนักงาน" }, { status: 409 });
      }
      currentUser = {
        id: `employee-preview:${previewEmployee.id}`,
        authUserId: "",
        email: previewEmployee.email,
        displayName: previewEmployee.name,
        nickname: "",
        role: "employee",
        employeeId: previewEmployee.id,
        departmentId: previewRole.departmentId,
        status: "active",
        lastLoginAt: null,
        createdBy: "โหมดทดลอง",
        createdAt: previewEmployee.createdAt,
        updatedAt: previewEmployee.updatedAt,
        authenticatedName: previewEmployee.name,
        loginId: "employee-preview",
        mustChangePassword: false,
      };
      employeePreview = {
        employeeId: previewEmployee.id,
        readOnly: true,
        launchedBy: authenticatedUser.displayName,
      };
    }
    const visibleEmployeeIds = new Set(employeeRows.filter((employee) => {
      if (currentUser.role === "admin") return true;
      if (employee.id === currentUser.employeeId) return employee.status === "active";
      return employee.status === "active" && currentUser.role === "manager" && Boolean(currentUser.departmentId) && roleDepartmentId(employee.roleId) === currentUser.departmentId;
    }).map((employee) => employee.id));
    const visibleRewardRedemptions = redemptionRows.filter((redemption) => visibleEmployeeIds.has(redemption.employeeId));
    const visibleRewards = currentUser.role === "admin"
      ? rewardRows
      : rewardRows.filter((reward) => reward.isActive);
    const signedInEmployee = currentUser.employeeId ? employeeRows.find((employee) => employee.id === currentUser.employeeId) ?? null : null;
    const signedInEmployeeProfile = signedInEmployee ? employeeProfileRows.find((profile) => profile.employeeId === signedInEmployee.id) ?? null : null;
    if (currentUser.role === "employee" && (!signedInEmployee || signedInEmployee.status !== "active")) {
      return Response.json({ error: "บัญชีพนักงานยังไม่ได้ผูกกับโปรไฟล์ที่ใช้งานอยู่", accessDenied: true }, { status: 403 });
    }
    const employeeDepartmentId = currentUser.departmentId || (signedInEmployee ? roleDepartmentId(signedInEmployee.roleId) : "");
    const visibleQuests = questRows
      .filter((quest) => {
        if (currentUser.role === "admin") return true;
        if (quest.status !== "active") return false;
        if (quest.type === "activity") return true;
        const ownTargets = questTargetRows.filter((target) => target.questId === quest.id);
        if (quest.type === "team") {
          return Boolean(employeeDepartmentId) && ownTargets.some((target) => target.targetType === "department" && target.targetKey === employeeDepartmentId);
        }
        if (currentUser.role === "manager") {
          return ownTargets.some((target) => target.targetType === "employee" && visibleEmployeeIds.has(target.targetKey));
        }
        return Boolean(currentUser.employeeId)
          && ownTargets.some((target) => target.targetType === "employee" && target.targetKey === currentUser.employeeId);
      })
      .sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured) || a.endDate.localeCompare(b.endDate) || b.updatedAt.localeCompare(a.updatedAt))
      .map((quest) => questDto(quest, questTargetRows, currentUser.role === "admin"));
    const visibleQuestCompletions = questCompletionRows
      .filter((completion) => currentUser.role === "admin" || visibleEmployeeIds.has(completion.employeeId))
      .sort((a, b) => b.completionDate.localeCompare(a.completionDate) || b.completedAt.localeCompare(a.completedAt))
      .map((completion) => questCompletionDto(completion, currentUser.role === "admin"));
    const teamOverviewEmployeeIds = new Set(employeeRows.filter((employee) => {
      if (currentUser.role !== "employee") return visibleEmployeeIds.has(employee.id);
      return employee.status === "active" && Boolean(employeeDepartmentId) && roleDepartmentId(employee.roleId) === employeeDepartmentId;
    }).map((employee) => employee.id));
    const scopedEmployees = employeeRows.filter((employee) => visibleEmployeeIds.has(employee.id));
    const policyDay = bangkokIsoDay();
    const { policy: activePointPolicy, rules: activePointRules } = pointPolicyFromRows(organizationPolicyRows, policyDay);
    const visibleOrganizationPolicies = organizationPolicyRows
      .filter((policy) => currentUser.role === "admin" || (isPolicyEffective(policy, policyDay) && policyAppliesToEmployee(policy, signedInEmployee, signedInEmployeeProfile)))
      .sort((a, b) => a.category.localeCompare(b.category) || b.version - a.version);
    const visibleOrganizationPoliciesForDisplay = visibleOrganizationPolicies.map((policy) => ({
      ...policy,
      title: withPointsDisplayTerminology(policy.title),
      summary: withPointsDisplayTerminology(policy.summary),
      content: withPointsDisplayTerminology(policy.content),
      rules: withPointsDisplayTerminology(policy.rules),
    }));
    const visiblePolicyIds = new Set(visibleOrganizationPolicies.map((policy) => policy.id));
    const visiblePolicyAcknowledgementRows = policyAcknowledgementRows.filter((acknowledgement) => {
      if (!visiblePolicyIds.has(acknowledgement.policyId)) return false;
      if (currentUser.role !== "admin") return Boolean(currentUser.employeeId) && acknowledgement.employeeId === currentUser.employeeId;
      return visibleEmployeeIds.has(acknowledgement.employeeId);
    });
    const visiblePolicyAcknowledgements = currentUser.role === "admin"
      ? visiblePolicyAcknowledgementRows
      : visiblePolicyAcknowledgementRows.map(publicPolicyAcknowledgement);
    const visibleEmploymentContracts = currentUser.role === "admin"
      ? employmentContractRows.filter((row) => visibleEmployeeIds.has(row.employeeId))
      : currentUser.role === "employee" && currentUser.employeeId
        ? employmentContractRows.filter((row) => row.employeeId === currentUser.employeeId && row.status !== "draft")
        : [];
    const visibleEmployeeContractDocumentIds = new Set(visibleEmploymentContracts.map((contract) => contract.documentId));
    const visibleApplicationDocuments = currentUser.role === "admin"
      ? applicationDocumentRows.filter((row) => visibleEmployeeIds.has(row.employeeId))
      : currentUser.role === "employee" && currentUser.employeeId
        ? applicationDocumentRows
          .filter((row) => row.employeeId === currentUser.employeeId && row.documentType === "contract" && visibleEmployeeContractDocumentIds.has(row.id))
          .map((row) => ({ ...row, storageKey: row.storageKey ? "available" : "" }))
        : [];
    const launchReadiness = currentUser.role === "admin" && !employeePreview ? (() => {
      const activeEmployeeRows = employeeRows.filter((employee) => employee.status === "active");
      const activeEmployeeIds = new Set(activeEmployeeRows.map((employee) => employee.id));
      const activeEmployeeAccounts = userAccountRows.filter((account) => account.status === "active" && account.role !== "admin" && Boolean(account.employeeId) && activeEmployeeIds.has(account.employeeId ?? ""));
      const demoEmployeeCount = employeeRows.filter((employee) => seedEmployees.some((seed) => seed.id === employee.id && seed.name === employee.name && seed.email === employee.email)).length;
      const templatePolicyCount = organizationPolicyRows.filter((policy) => policy.status === "published" && /แม่แบบ|ระบบทดลอง/.test(`${policy.title} ${policy.summary} ${policy.content}`)).length;
      return {
        demoDataEnabled,
        demoEmployeeCount,
        templatePolicyCount,
        activeEmployeeCount: activeEmployeeRows.length,
        activeLinkedAccountCount: activeEmployeeAccounts.length,
        loggedInEmployeeAccountCount: activeEmployeeAccounts.filter((account) => Boolean(account.lastLoginAt)).length,
        publishedPolicyCount: organizationPolicyRows.filter((policy) => isPolicyEffective(policy, policyDay)).length,
        realDocumentCount: applicationDocumentRows.filter((document) => Boolean(document.storageKey)).length,
        submittedWorkCount: workSubmissionRows.length,
      };
    })() : null;
    const scopedWorkItems = workItemRows
      .filter((item) => currentUser.role === "employee"
        ? item.assigneeEmployeeId === currentUser.employeeId || item.createdByEmployeeId === currentUser.employeeId
        : visibleEmployeeIds.has(item.assigneeEmployeeId))
      .map((item) => ({ ...item, points: item.points === 0 ? 0 : workPointValue(item.kind, item.priority, activePointRules) }));
    const visibleProjectIds = new Set(scopedWorkItems.map((item) => item.projectId));
    projectRows.filter((project) => visibleEmployeeIds.has(project.ownerEmployeeId)).forEach((project) => visibleProjectIds.add(project.id));
    const permissions = {
      canManageAccounts: currentUser.role === "admin",
      canManagePeople: currentUser.role === "admin",
      canManageWork: currentUser.role !== "employee",
      canAssignTeamWork: !employeePreview && (currentUser.role !== "employee" || signedInEmployee?.status === "active"),
      canReviewWork: currentUser.role !== "employee",
      canViewTeam: currentUser.role !== "employee",
      canViewTeamOverview: currentUser.role !== "employee" || Boolean(currentUser.employeeId),
      canViewOwnGrowth: currentUser.role !== "employee" || Boolean(currentUser.employeeId),
      canViewOwnRewards: currentUser.role !== "employee" || Boolean(currentUser.employeeId),
      canManagePolicies: currentUser.role === "admin",
      canManageOrganizationDocuments: currentUser.role === "admin",
      canManageEmployeeWarnings: currentUser.role === "admin",
      canManageEmployeeRecognitions: currentUser.role === "admin",
      canManageQuests: currentUser.role === "admin",
      canManageSystemSettings: canManageSystemSettings(currentUser) && !employeePreview,
      canAcknowledgePolicies: Boolean(currentUser.employeeId) && !employeePreview,
    };
    const visibleProfileImages = employeeProfileRows
      .filter((row) => visibleEmployeeIds.has(row.employeeId))
      .map((row) => {
        const profileImageKey = validProfileImageKey(row.employeeId, row.profileImageKey) ? row.profileImageKey : "";
        return { employeeId: row.employeeId, profileImageKey, profileImageUpdatedAt: profileImageKey ? row.profileImageUpdatedAt : null, updatedAt: row.updatedAt };
      });
    const teamOverviewDate = new Date().toISOString().slice(0, 10);
    const employeePortalTeamOverview = currentUser.role === "employee" ? {
      employees: employeeRows
        .filter((employee) => teamOverviewEmployeeIds.has(employee.id))
        .map((employee) => ({ ...employee, email: "", manager: "" })),
      evaluations: evaluationRows
        .filter((row) => teamOverviewEmployeeIds.has(row.employeeId))
        .map((row) => ({ ...row, id: `team-power:${row.employeeId}:${row.period}`, kpiScores: {}, note: "", evaluator: "" })),
      workItems: workItemRows
        .filter((item) => teamOverviewEmployeeIds.has(item.assigneeEmployeeId) && !(item.createdByEmployeeId !== null && item.points === 0))
        .map((item, index) => ({
          ...item,
          id: `team-load:${item.assigneeEmployeeId}:${index}`,
          projectId: "team-overview",
          title: item.kind === "mission" ? "ภารกิจของทีม" : item.kind === "request" ? "คำขอของทีม" : "งานของทีม",
          description: "",
          createdByEmployeeId: null,
          points: 0,
          dueDate: item.dueDate < teamOverviewDate ? "2000-01-01" : item.dueDate === teamOverviewDate ? teamOverviewDate : "2999-12-31",
          createdAt: "",
          updatedAt: "",
        })),
    } : { employees: [], evaluations: [], workItems: [] };
    const currentUserDto = { ...currentUser };
    delete (currentUserDto as Partial<CurrentUser>).authUserId;
    return Response.json({
      currentUser: currentUserDto,
      employeePreview,
      permissions,
      teamOverview: employeePortalTeamOverview,
      employees: scopedEmployees,
      employeePositionEvents: currentUser.role === "admin" ? employeePositionEventRows : [],
      evaluations: evaluationRows.filter((row) => visibleEmployeeIds.has(row.employeeId)),
      selfAssessments: currentUser.role === "employee" && currentUser.employeeId
        ? selfAssessmentRows.filter((row) => row.employeeId === currentUser.employeeId)
        : [],
      hrProfiles: currentUser.role === "admin" || currentUser.role === "employee" ? hrProfileRows.filter((row) => visibleEmployeeIds.has(row.employeeId)) : [],
      attendanceRecords: currentUser.role === "admin" || currentUser.role === "employee" ? attendanceRows.filter((row) => visibleEmployeeIds.has(row.employeeId)) : [],
      skillAchievements: currentUser.role === "admin" || currentUser.role === "employee" ? skillAchievementRows.filter((row) => visibleEmployeeIds.has(row.employeeId)) : [],
      talentActions: currentUser.role === "admin" || currentUser.role === "employee" ? talentActionRows.filter((row) => visibleEmployeeIds.has(row.employeeId)) : [],
      projects: projectRows.filter((row) => visibleProjectIds.has(row.id)),
      workItems: scopedWorkItems,
      workSubmissions: workSubmissionRows.filter((row) => visibleEmployeeIds.has(row.employeeId)),
      quests: visibleQuests,
      questCompletions: visibleQuestCompletions,
      rewards: visibleRewards,
      pointLedger: pointRows
        .filter((row) => visibleEmployeeIds.has(row.employeeId))
        .map((row) => ({ ...row, note: withPointsDisplayTerminology(row.note) })),
      pointEvents: pointEventRows
        .filter((row) => visibleEmployeeIds.has(row.employeeId))
        .map((row) => ({ ...row, note: withPointsDisplayTerminology(row.note) })),
      rewardRedemptions: visibleRewardRedemptions,
      employeeProfiles: currentUser.role === "admin" ? employeeProfileRows.filter((row) => visibleEmployeeIds.has(row.employeeId)).map(employeeProfileWithValidImage) : visibleProfileImages,
      applicationDocuments: visibleApplicationDocuments,
      employmentContracts: visibleEmploymentContracts,
      organizationDocuments: currentUser.role === "admin" ? organizationDocumentRows.map(privateFileDto) : [],
      employeeWarnings: currentUser.role === "admin" ? employeeWarningRows.map(privateFileDto) : [],
      employeeWarningEvents: currentUser.role === "admin" ? employeeWarningEventRows : [],
      employeeRecognitions: currentUser.role === "admin" ? employeeRecognitionRows.map(privateFileDto) : [],
      userAccounts: currentUser.role === "admin" ? await publicUserAccountDtos(userAccountRows) : [],
      employeeRegistrationRequests: currentUser.role === "admin" ? employeeRegistrationRequestDtos(registrationRequestRows) : [],
      notificationReads: employeePreview ? [] : notificationReadRows,
      organizationPolicies: visibleOrganizationPoliciesForDisplay,
      policyAcknowledgements: visiblePolicyAcknowledgements,
      launchReadiness,
      activePointPolicyId: activePointPolicy?.id ?? null,
      pointPolicyRules: withPointsDisplayTerminology(activePointRules),
      publicSystemSettings,
      period,
    });
  } catch (error) {
    return apiError(error);
  }
}

type EmployeePayload = {
  action: "createEmployee";
  name?: string;
  email?: string;
  roleId?: string;
  positionTitle?: string;
  manager?: string;
};

type UpdateEmployeeStatusPayload = {
  action: "updateEmployeeStatus" | "archiveEmployee";
  employeeId?: string;
  status?: "active" | "resigned";
  expectedUpdatedAt?: string;
};

type DeleteEmployeePermanentlyPayload = {
  action: "deleteEmployeePermanently";
  employeeId?: string;
  expectedUpdatedAt?: string;
  confirmation?: string;
};

type EvaluationPayload = {
  action: "saveEvaluation";
  employeeId?: string;
  period?: string;
  kpiScores?: Record<string, number>;
  skillScores?: Record<string, number>;
  note?: string;
};

type SelfAssessmentPayload = {
  action: "saveSelfAssessment";
  employeeId?: string;
  period?: string;
  kpiScores?: Record<string, number>;
  skillScores?: Record<string, number>;
  note?: string;
};

type HrPlanPayload = {
  action: "saveHrPlan";
  actionId?: string;
  employeeId?: string;
  currentSalary?: number;
  salaryReviewMonth?: string;
  planType?: "skill_test" | "upskill" | "role_review" | "salary_review";
  title?: string;
  dueDate?: string;
  targetRoleId?: string;
};

type CompleteTalentActionPayload = {
  action: "completeTalentAction";
  actionId?: string;
  score?: number;
};

type AttendancePayload = {
  action: "saveAttendance";
  employeeId?: string;
  workDate?: string;
  status?: "present" | "late" | "absent" | "leave";
  clockIn?: string;
  clockOut?: string;
  leaveType?: "sick" | "personal" | "vacation" | "other";
  note?: string;
};

type AttendanceApprovalPayload = {
  action: "approveAttendance";
  attendanceId?: string;
  approvalStatus?: "approved" | "rejected";
};

type SkillAchievementPayload = {
  action: "verifySkillAchievement";
  employeeId?: string;
  skillId?: string;
  level?: number;
  evidenceUrl?: string;
  note?: string;
};

type ProjectPayload = {
  action: "saveProject";
  projectId?: string;
  name?: string;
  description?: string;
  ownerEmployeeId?: string;
  departmentId?: string;
  status?: "planned" | "active" | "on_hold" | "completed";
  dueDate?: string;
  color?: string;
};

type WorkItemPayload = {
  action: "saveWorkItem";
  workItemId?: string;
  projectId?: string;
  assigneeEmployeeId?: string;
  kind?: "task" | "request" | "mission";
  title?: string;
  description?: string;
  priority?: "low" | "medium" | "high" | "urgent";
  status?: "todo" | "in_progress" | "review" | "done";
  progress?: number;
  points?: number;
  dueDate?: string;
};

type ReviewWorkSubmissionPayload = {
  action: "reviewWorkSubmission";
  submissionId?: string;
  status?: "approved" | "revision";
  reviewerNote?: string;
};

type RecordPointEventPayload = {
  action: "recordPointEvent";
  employeeId?: string;
  eventType?: PointEventType;
  eventDate?: string;
  note?: string;
  evidenceUrl?: string;
};

type RunMonthlyPointCyclePayload = {
  action: "runMonthlyPointCycle";
  month?: string;
  period?: string;
};

type RedeemRewardPayload = {
  action: "redeemReward";
  employeeId?: string;
  rewardId?: string;
};

type UpdateRewardRedemptionPayload = {
  action: "updateRewardRedemption";
  redemptionId?: string;
  status?: "approved" | "fulfilled" | "cancelled";
};

type SaveRewardPayload = {
  action: "saveReward";
  rewardId?: string;
  title?: string;
  description?: string;
  category?: "perk" | "learning" | "wellbeing" | "recognition";
  costPoints?: number;
  stock?: number;
  icon?: string;
  isActive?: boolean;
  expectedInventoryVersion?: number;
  expectedUpdatedAt?: string;
};

type DeleteRewardPayload = {
  action: "deleteReward";
  rewardId?: string;
  confirmation?: string;
  expectedInventoryVersion?: number;
  expectedUpdatedAt?: string;
};

type SaveQuestPayload = {
  action: "saveQuest";
  questId?: string;
  type?: "individual" | "team" | "activity";
  title?: string;
  description?: string;
  status?: "draft" | "active" | "completed";
  progress?: number;
  pointsReward?: number;
  rewardId?: string | null;
  isFeatured?: boolean;
  startDate?: string;
  endDate?: string;
  targetEmployeeIds?: string[];
  targetDepartmentIds?: string[];
  expectedRevision?: number;
  expectedUpdatedAt?: string;
};

type DeleteQuestPayload = {
  action: "deleteQuest";
  questId?: string;
  confirmation?: string;
  expectedRevision?: number;
  expectedUpdatedAt?: string;
};

type CompleteQuestForEmployeePayload = {
  action: "completeQuestForEmployee";
  questId?: string;
  employeeId?: string;
  completionDate?: string;
  evidenceUrl?: string;
  note?: string;
  expectedRevision?: number;
  expectedUpdatedAt?: string;
};

type EmployeeProfilePayload = {
  action: "saveEmployeeProfile";
  employeeId?: string;
  expectedEmployeeUpdatedAt?: string;
  positionTitle?: string;
  personalEmail?: string;
  phone?: string;
  birthDate?: string;
  nationalIdLast4?: string;
  address?: string;
  emergencyName?: string;
  emergencyPhone?: string;
  startDate?: string;
  employmentType?: "permanent" | "contract" | "probation" | "intern";
  education?: string;
  experienceYears?: number;
  applicationSource?: string;
};

type DocumentStatusPayload = {
  action: "updateDocumentStatus";
  documentId?: string;
  status?: "verified" | "rejected";
  note?: string;
};

type ContractPayload = {
  action: "createContract";
  employeeId?: string;
  documentId?: string;
  title?: string;
  version?: string;
  status?: "draft" | "sent";
  effectiveDate?: string;
  expiryDate?: string;
};

type SignContractPayload = {
  action: "signContract";
  contractId?: string;
  signedName?: string;
  consent?: boolean;
};

type SendContractPayload = {
  action: "sendContract";
  contractId?: string;
};

type UserAccountPayload = {
  action: "saveUserAccount";
  accountId?: string;
  loginId?: string;
  temporaryPassword?: string;
  displayName?: string;
  nickname?: string;
  role?: "admin" | "manager" | "employee";
  employeeId?: string;
  departmentId?: string;
  status?: "active" | "inactive";
};

type DeleteUserAccountPayload = {
  action: "deleteUserAccount";
  accountId?: string;
};

type ReviewEmployeeRegistrationPayload = {
  action: "approveEmployeeRegistration" | "rejectEmployeeRegistration";
  requestId?: string;
  employeeId?: string;
  role?: "admin" | "manager" | "employee";
  rejectionReason?: string;
};

type MarkNotificationsReadPayload = {
  action: "markNotificationsRead";
  notificationIds?: string[];
};

type SaveOrganizationPolicyPayload = {
  action: "saveOrganizationPolicy";
  policyId?: string;
  code?: string;
  title?: string;
  summary?: string;
  content?: string;
  category?: "work_rules" | "points_rewards" | "ai_data" | "other" | "points" | "general";
  effectiveDate?: string;
  effectiveTo?: string;
  scopeType?: "all" | "department" | "role" | "employment_type";
  scopeValues?: string[];
  acknowledgementRequired?: boolean;
  acknowledgementDueDays?: number;
  rules?: unknown;
};

type PublishOrganizationPolicyPayload = {
  action: "publishOrganizationPolicy";
  policyId?: string;
  legalReviewConfirmed?: boolean;
  complianceChecklist?: string[];
};

type AcknowledgeOrganizationPolicyPayload = {
  action: "acknowledgeOrganizationPolicy";
  policyId?: string;
};

export async function POST(request: Request) {
  try {
    const authentication = await authenticatedRequestGate(request);
    if (authentication.response) return authentication.response;
    const currentUser = authentication.currentUser;
    await ensureSeedData();
    const db = getDb();
    const payload = await request.json() as EmployeePayload | UpdateEmployeeStatusPayload | DeleteEmployeePermanentlyPayload | EvaluationPayload | SelfAssessmentPayload | HrPlanPayload | CompleteTalentActionPayload | AttendancePayload | AttendanceApprovalPayload | SkillAchievementPayload | ProjectPayload | WorkItemPayload | ReviewWorkSubmissionPayload | RecordPointEventPayload | RunMonthlyPointCyclePayload | RedeemRewardPayload | UpdateRewardRedemptionPayload | SaveRewardPayload | DeleteRewardPayload | SaveQuestPayload | DeleteQuestPayload | CompleteQuestForEmployeePayload | EmployeeProfilePayload | DocumentStatusPayload | ContractPayload | SignContractPayload | SendContractPayload | UserAccountPayload | DeleteUserAccountPayload | ReviewEmployeeRegistrationPayload | MarkNotificationsReadPayload | SaveOrganizationPolicyPayload | PublishOrganizationPolicyPayload | AcknowledgeOrganizationPolicyPayload;
    const pointPolicyRows = await db.select().from(organizationPolicies);
    const { policy: activePointPolicy, rules: activePointRules } = pointPolicyFromRows(pointPolicyRows);
    const adminOnlyActions = new Set(["createEmployee", "updateEmployeeStatus", "archiveEmployee", "deleteEmployeePermanently", "saveHrPlan", "verifySkillAchievement", "runMonthlyPointCycle", "saveEmployeeProfile", "updateDocumentStatus", "createContract", "sendContract", "saveUserAccount", "deleteUserAccount", "approveEmployeeRegistration", "rejectEmployeeRegistration", "saveOrganizationPolicy", "publishOrganizationPolicy", "saveReward", "deleteReward", "saveQuest", "deleteQuest", "completeQuestForEmployee", "updateRewardRedemption"]);
    const teamActions = new Set(["saveEvaluation", "completeTalentAction", "approveAttendance", "saveProject", "reviewWorkSubmission", "recordPointEvent"]);
    const employeePortalActions = new Set(["markNotificationsRead", "saveWorkItem", "saveSelfAssessment", "redeemReward", "acknowledgeOrganizationPolicy", "signContract"]);
    if (currentUser.role === "employee" && !employeePortalActions.has(payload.action)) return Response.json({ error: "สิทธิ์พนักงานใช้ได้เฉพาะงานของฉัน การแจ้งเตือน การแลกรางวัล การรับทราบกฎองค์กร และการลงนามสัญญาของตนเอง" }, { status: 403 });
    if (adminOnlyActions.has(payload.action) && currentUser.role !== "admin") return Response.json({ error: "เฉพาะ HR หรือผู้ดูแลระบบเท่านั้น" }, { status: 403 });
    if (teamActions.has(payload.action) && currentUser.role === "employee") return Response.json({ error: "รายการนี้ต้องดำเนินการโดยหัวหน้าทีมหรือ HR" }, { status: 403 });

    if (payload.action === "saveOrganizationPolicy") {
      const policyId = payload.policyId?.trim() ?? "";
      const [sourcePolicy] = policyId ? await db.select().from(organizationPolicies).where(eq(organizationPolicies.id, policyId)).limit(1) : [];
      if (policyId && !sourcePolicy) return Response.json({ error: "ไม่พบนโยบายองค์กรที่เลือก" }, { status: 404 });
      const title = payload.title?.trim().slice(0, 220) || sourcePolicy?.title || "";
      const summary = payload.summary?.trim().slice(0, 1000) ?? sourcePolicy?.summary ?? "";
      const content = payload.content?.trim().slice(0, 30000) || sourcePolicy?.content || "";
      if (!title || content.length < 40) return Response.json({ error: "กรุณาระบุชื่อนโยบายและรายละเอียดอย่างน้อย 40 ตัวอักษร" }, { status: 400 });
      const categoryInput = payload.category ?? sourcePolicy?.category ?? "other";
      const requestedCategory = categoryInput === "points" ? "points_rewards" as const : categoryInput === "general" ? "other" as const : categoryInput;
      if (sourcePolicy && requestedCategory !== sourcePolicy.category) {
        return Response.json({ error: "ไม่สามารถเปลี่ยนหมวดของนโยบายในสายเวอร์ชันเดิมได้ กรุณาสร้างนโยบายรหัสใหม่" }, { status: 409 });
      }
      const requestedCode = payload.code?.trim().toLowerCase() ?? "";
      if (sourcePolicy && requestedCode && requestedCode !== sourcePolicy.code) {
        return Response.json({ error: "ไม่สามารถเปลี่ยนรหัสนโยบายในสายเวอร์ชันเดิมได้ กรุณาสร้างนโยบายรหัสใหม่" }, { status: 409 });
      }
      const category = sourcePolicy?.category ?? requestedCategory;
      const effectiveDateCandidate = payload.effectiveDate ?? sourcePolicy?.effectiveDate ?? "";
      const effectiveDate = /^\d{4}-\d{2}-\d{2}$/.test(effectiveDateCandidate) ? effectiveDateCandidate : "";
      if (!effectiveDate) return Response.json({ error: "กรุณาระบุวันที่เริ่มใช้ในรูปแบบ YYYY-MM-DD" }, { status: 400 });
      const effectiveToCandidate = payload.effectiveTo?.trim() || sourcePolicy?.effectiveTo || null;
      const effectiveTo = effectiveToCandidate && /^\d{4}-\d{2}-\d{2}$/.test(effectiveToCandidate) ? effectiveToCandidate : null;
      if (effectiveTo && effectiveTo < effectiveDate) return Response.json({ error: "วันที่สิ้นสุดต้องไม่อยู่ก่อนวันที่เริ่มใช้" }, { status: 400 });
      const requestedScopeType = payload.scopeType ?? sourcePolicy?.scopeType ?? "all";
      const scopeType = category === "points_rewards" ? "all" as const : requestedScopeType;
      const scopeValues = scopeType === "all" ? [] : [...new Set(payload.scopeValues ?? sourcePolicy?.scopeValues ?? [])].map((value) => value.trim()).filter(Boolean).slice(0, 100);
      if (scopeType !== "all" && !scopeValues.length) return Response.json({ error: "นโยบายแบบจำกัดกลุ่มต้องระบุกลุ่มเป้าหมายอย่างน้อย 1 รายการ" }, { status: 400 });
      const acknowledgementRequired = category === "points_rewards" ? true : payload.acknowledgementRequired ?? sourcePolicy?.acknowledgementRequired ?? true;
      const acknowledgementDueDays = Math.round(Math.min(365, Math.max(0, Number(payload.acknowledgementDueDays ?? sourcePolicy?.acknowledgementDueDays ?? 7))));
      const now = new Date().toISOString();
      const actor = authenticatedActor(currentUser);
      const codeInput = sourcePolicy?.code || (category === "points_rewards" ? "points-and-rewards" : requestedCode) || `custom-${crypto.randomUUID()}`;
      const code = /^[a-z0-9][a-z0-9-]{1,79}$/.test(codeInput) ? codeInput : sourcePolicy?.code || `custom-${crypto.randomUUID()}`;
      const sameCodeRows = await db.select().from(organizationPolicies).where(eq(organizationPolicies.code, code));
      if (sameCodeRows.some((row) => row.category !== category)) {
        return Response.json({ error: "รหัสนโยบายนี้อยู่ในหมวดอื่นแล้ว ไม่สามารถรวมคนละหมวดไว้ในสายเวอร์ชันเดียวกันได้" }, { status: 409 });
      }
      const createsNewVersion = !sourcePolicy || sourcePolicy.status === "published";
      const version = createsNewVersion ? Math.max(0, ...sameCodeRows.map((row) => row.version)) + 1 : sourcePolicy.version;
      const id = createsNewVersion ? `policy-${crypto.randomUUID()}` : sourcePolicy.id;
      const inheritedRules = payload.rules ?? sourcePolicy?.rules ?? (category === "points_rewards" ? defaultPointPolicyRules : null);
      const rules = category === "points_rewards" ? resolvePointPolicyRules(inheritedRules) : null;
      const draftPolicy = {
        id,
        code,
        title,
        summary,
        content,
        category,
        status: "draft" as const,
        version,
        effectiveDate,
        effectiveTo,
        scopeType,
        scopeValues,
        acknowledgementRequired,
        acknowledgementDueDays,
        rules,
        contentHash: "",
        publishedAt: null,
        publishedBy: null,
        createdAt: createsNewVersion ? now : sourcePolicy.createdAt,
        updatedAt: now,
        updatedBy: actor.name,
      };
      const organizationPolicy = { ...draftPolicy, contentHash: await policyIntegrityHash(draftPolicy) };
      if (createsNewVersion) {
        try {
          await db.insert(organizationPolicies).values(organizationPolicy);
        } catch (error) {
          if (isUniqueConstraintError(error)) return Response.json({ error: "มีผู้สร้างร่างในสายเวอร์ชันนี้พร้อมกัน กรุณาโหลดข้อมูลล่าสุดก่อนแก้ไขต่อ" }, { status: 409 });
          throw error;
        }
        return Response.json({ organizationPolicy }, { status: 201 });
      }
      if (!sourcePolicy) return Response.json({ error: "ไม่พบร่างนโยบายที่ต้องการแก้ไข" }, { status: 404 });
      if (organizationPolicy.contentHash === sourcePolicy.contentHash) return Response.json({ organizationPolicy: sourcePolicy });
      const [savedPolicy] = await db.update(organizationPolicies).set({
        title,
        summary,
        content,
        effectiveDate,
        effectiveTo,
        scopeType,
        scopeValues,
        acknowledgementRequired,
        acknowledgementDueDays,
        rules,
        contentHash: organizationPolicy.contentHash,
        updatedAt: now,
        updatedBy: actor.name,
      }).where(and(
        eq(organizationPolicies.id, sourcePolicy.id),
        eq(organizationPolicies.status, "draft"),
        eq(organizationPolicies.contentHash, sourcePolicy.contentHash),
        eq(organizationPolicies.updatedAt, sourcePolicy.updatedAt),
      )).returning();
      if (!savedPolicy) return Response.json({ error: "ร่างนี้มีการแก้ไขหรือประกาศโดยผู้อื่นแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึกอีกครั้ง" }, { status: 409 });
      return Response.json({ organizationPolicy: savedPolicy });
    }

    if (payload.action === "publishOrganizationPolicy") {
      const policyId = payload.policyId?.trim() ?? "";
      const [draft] = await db.select().from(organizationPolicies).where(eq(organizationPolicies.id, policyId)).limit(1);
      if (!draft) return Response.json({ error: "ไม่พบนโยบายองค์กรที่เลือก" }, { status: 404 });
      if (draft.status !== "draft") return Response.json({ error: "นโยบายที่ประกาศแล้วแก้ไขตรง ๆ ไม่ได้ กรุณาสร้างฉบับใหม่" }, { status: 409 });
      if (payload.legalReviewConfirmed !== true) return Response.json({ error: "กรุณายืนยันว่า HR หรือที่ปรึกษากฎหมายทบทวนร่างก่อนประกาศ" }, { status: 409 });
      if (draft.category === "work_rules") {
        const requiredChecklist = ["working-hours", "holidays", "overtime", "wages", "leave", "discipline", "grievance", "termination"];
        const confirmedChecklist = new Set(payload.complianceChecklist ?? []);
        const missingChecklist = requiredChecklist.filter((item) => !confirmedChecklist.has(item));
        if (missingChecklist.length) return Response.json({ error: `ตรวจข้อบังคับการทำงานยังไม่ครบ ${missingChecklist.length} หัวข้อ กรุณาตรวจรายการก่อนประกาศ` }, { status: 409 });
      }
      if (draft.category === "points_rewards" && (draft.scopeType !== "all" || draft.scopeValues.length > 0)) {
        return Response.json({ error: "กติกา Points และรางวัลต้องใช้กับพนักงานทุกคนเท่านั้น กรุณาบันทึกร่างใหม่เป็นขอบเขตทั้งองค์กร" }, { status: 409 });
      }
      if (draft.category === "points_rewards" && !draft.acknowledgementRequired) {
        return Response.json({ error: "กติกา Points และรางวัลต้องกำหนดให้พนักงานกดรับทราบก่อนประกาศ กรุณาบันทึกร่างใหม่" }, { status: 409 });
      }
      const hash = await policyIntegrityHash(draft);
      if (!draft.contentHash || draft.contentHash !== hash) {
        return Response.json({ error: "เนื้อหาร่างไม่ตรงกับลายเซ็นความถูกต้อง กรุณาบันทึกร่างล่าสุดอีกครั้งก่อนประกาศ" }, { status: 409 });
      }
      const sameCodeRows = await db.select().from(organizationPolicies).where(eq(organizationPolicies.code, draft.code));
      const publishedRows = sameCodeRows.filter((row) => row.status === "published");
      if (publishedRows.some((row) => row.effectiveDate >= draft.effectiveDate)) {
        return Response.json({ error: "วันที่เริ่มใช้ต้องอยู่หลังฉบับที่ประกาศแล้วและห้ามซ้ำวันเดิม" }, { status: 409 });
      }
      if (publishedRows.some((row) => row.version >= draft.version)) {
        return Response.json({ error: "ลำดับเวอร์ชันล้าสมัย กรุณาสร้างร่างใหม่จากฉบับล่าสุด" }, { status: 409 });
      }
      const now = new Date().toISOString();
      const actor = authenticatedActor(currentUser);
      const endPreviousAt = previousIsoDay(draft.effectiveDate);
      const overlappingPreviousRows = publishedRows.filter((row) => row.version < draft.version && (!row.effectiveTo || row.effectiveTo >= draft.effectiveDate));
      const previousUpdates = overlappingPreviousRows.map((previous) => db.update(organizationPolicies).set({ effectiveTo: endPreviousAt, updatedAt: now, updatedBy: actor.name }).where(eq(organizationPolicies.id, previous.id)));
      const predecessorVersion = Math.max(0, ...publishedRows.map((row) => row.version));
      const publishClaim = {
        id: `policy-publish-claim-${crypto.randomUUID()}`,
        policyId: draft.id,
        code: draft.code,
        predecessorVersion,
        expectedContentHash: draft.contentHash,
        publishedAt: now,
      };
      try {
        await db.batch([
          db.insert(organizationPolicyPublishClaims).values(publishClaim),
          ...previousUpdates,
          db.update(organizationPolicies).set({ status: "published", contentHash: hash, publishedAt: now, publishedBy: actor.name, updatedAt: now, updatedBy: actor.name }).where(and(eq(organizationPolicies.id, draft.id), eq(organizationPolicies.status, "draft"), eq(organizationPolicies.contentHash, draft.contentHash))),
        ]);
      } catch (error) {
        if (isUniqueConstraintError(error) || (error instanceof Error && error.message.includes("POLICY_PUBLISH_"))) return Response.json({ error: "มีการแก้ไขหรือประกาศนโยบายพร้อมกัน กรุณาโหลดข้อมูลล่าสุดและตรวจเนื้อหากับวันเริ่มใช้อีกครั้ง" }, { status: 409 });
        throw error;
      }
      const [organizationPolicy] = await db.select().from(organizationPolicies).where(eq(organizationPolicies.id, draft.id)).limit(1);
      return Response.json({ organizationPolicy });
    }

    if (payload.action === "acknowledgeOrganizationPolicy") {
      if (!currentUser.employeeId) return Response.json({ error: "บัญชีนี้ยังไม่ได้ผูกกับโปรไฟล์พนักงาน จึงไม่สามารถรับทราบนโยบายได้" }, { status: 403 });
      const policyId = payload.policyId?.trim() ?? "";
      const [[policy], [employee], [profile]] = await Promise.all([
        db.select().from(organizationPolicies).where(eq(organizationPolicies.id, policyId)).limit(1),
        db.select().from(employees).where(and(eq(employees.id, currentUser.employeeId), eq(employees.status, "active"))).limit(1),
        db.select().from(employeeProfiles).where(eq(employeeProfiles.employeeId, currentUser.employeeId)).limit(1),
      ]);
      const day = bangkokIsoDay();
      if (!policy || !isPolicyEffective(policy, day)) return Response.json({ error: "นโยบายนี้ยังไม่ประกาศใช้หรือสิ้นสุดการใช้แล้ว" }, { status: 409 });
      if (!employee || !policyAppliesToEmployee(policy, employee, profile ?? null)) return Response.json({ error: "นโยบายนี้ไม่อยู่ในขอบเขตของบัญชีพนักงานนี้" }, { status: 403 });
      const currentPolicyHash = await policyIntegrityHash(policy);
      if (policy.contentHash !== currentPolicyHash) return Response.json({ error: "ตรวจสอบความถูกต้องของนโยบายไม่ผ่าน กรุณาแจ้ง HR ให้ประกาศฉบับใหม่" }, { status: 409 });
      const [existingAcknowledgement] = await db.select().from(policyAcknowledgements).where(and(eq(policyAcknowledgements.policyId, policy.id), eq(policyAcknowledgements.policyVersion, policy.version), eq(policyAcknowledgements.employeeId, employee.id))).limit(1);
      if (existingAcknowledgement) return Response.json({ policyAcknowledgement: currentUser.role === "admin" ? existingAcknowledgement : publicPolicyAcknowledgement(existingAcknowledgement) });
      const actor = authenticatedActor(currentUser);
      const acknowledgedAt = new Date().toISOString();
      const policyAcknowledgement = {
        id: `policy-ack-${crypto.randomUUID()}`,
        policyId: policy.id,
        employeeId: employee.id,
        userAccountId: currentUser.id,
        policyVersion: policy.version,
        contentHash: currentPolicyHash,
        acknowledgementText: `ข้าพเจ้าได้อ่านและรับทราบ ${policy.title} เวอร์ชัน ${policy.version}`,
        acknowledgedName: actor.name,
        acknowledgedEmail: actor.email,
        authenticatedUserId: actor.userId,
        acknowledgedAt,
      };
      await db.insert(policyAcknowledgements).values(policyAcknowledgement).onConflictDoNothing();
      const [savedAcknowledgement] = await db.select().from(policyAcknowledgements).where(and(eq(policyAcknowledgements.policyId, policy.id), eq(policyAcknowledgements.policyVersion, policy.version), eq(policyAcknowledgements.employeeId, employee.id))).limit(1);
      const acknowledgementResponse = savedAcknowledgement ?? policyAcknowledgement;
      return Response.json({ policyAcknowledgement: currentUser.role === "admin" ? acknowledgementResponse : publicPolicyAcknowledgement(acknowledgementResponse) }, { status: 201 });
    }

    if (payload.action === "markNotificationsRead") {
      const notificationIds = [...new Set(payload.notificationIds ?? [])]
        .filter((id) => /^[a-z0-9:_-]{1,240}$/i.test(id))
        .slice(0, 100);
      if (!notificationIds.length) return Response.json({ notificationReads: [] });
      const readAt = new Date().toISOString();
      const savedReads = [];
      for (const notificationId of notificationIds) {
        const record = {
          id: `${currentUser.id}:${notificationId}`,
          userKey: currentUser.id,
          notificationId,
          readAt,
        };
        await db.insert(notificationReads).values(record).onConflictDoUpdate({ target: notificationReads.id, set: { readAt } });
        savedReads.push(record);
      }
      return Response.json({ notificationReads: savedReads });
    }

    if (payload.action === "deleteUserAccount") {
      const accountId = typeof payload.accountId === "string" ? payload.accountId.trim().slice(0, 100) : "";
      if (!accountId) return Response.json({ error: "กรุณาเลือกบัญชีที่ต้องการลบ" }, { status: 400 });
      if (accountId === currentUser.id) return Response.json({ error: "ไม่สามารถลบบัญชีที่กำลังใช้งานอยู่" }, { status: 409 });
      if (accountId === "user-owner") return Response.json({ error: "บัญชีเจ้าของระบบลบไม่ได้ สามารถพักสิทธิ์บัญชีอื่นแทนได้" }, { status: 409 });
      const [account] = await db.select().from(userAccounts).where(eq(userAccounts.id, accountId)).limit(1);
      if (!account) return Response.json({ error: "ไม่พบบัญชีผู้ใช้ที่เลือก" }, { status: 404 });
      if (account.role === "admin" && account.status === "active") {
        const activeAdmins = await db.select({ id: userAccounts.id }).from(userAccounts).where(and(eq(userAccounts.role, "admin"), eq(userAccounts.status, "active")));
        if (activeAdmins.length <= 1) return Response.json({ error: "ต้องมีบัญชี HR / Admin ที่ใช้งานอยู่อย่างน้อย 1 บัญชี" }, { status: 409 });
      }
      const now = new Date().toISOString();
      await db.batch([
        db.insert(authEvents).values({
          id: `auth-event-${crypto.randomUUID()}`,
          userAccountId: accountId,
          eventType: "account_deleted",
          sourceHash: await requestSourceHash(request),
          detail: `target:${accountId};actor:${currentUser.id}`,
          createdAt: now,
        }),
        db.delete(userAccounts).where(eq(userAccounts.id, accountId)),
      ]);
      return Response.json({ deletedUserAccountId: accountId });
    }

    if (payload.action === "approveEmployeeRegistration") {
      const result = await approveEmployeeRegistration(payload.requestId, payload.employeeId, payload.role, currentUser);
      return Response.json(result);
    }

    if (payload.action === "rejectEmployeeRegistration") {
      const registrationRequest = await rejectEmployeeRegistration(payload.requestId, payload.rejectionReason, currentUser);
      return Response.json({ registrationRequest });
    }

    if (payload.action === "saveUserAccount") {
      const role = payload.role === "admin" || payload.role === "manager" || payload.role === "employee" ? payload.role : payload.role === undefined ? "employee" as const : null;
      const status = payload.status === "active" || payload.status === "inactive" ? payload.status : payload.status === undefined ? "active" as const : null;
      if (!role || !status) return Response.json({ error: "สิทธิ์หรือสถานะบัญชีไม่ถูกต้อง" }, { status: 400 });
      const suppliedAccountId = typeof payload.accountId === "string" ? payload.accountId.trim().slice(0, 100) : "";
      if (suppliedAccountId === currentUser.id) {
        return Response.json({ error: "ไม่สามารถแก้ไขบัญชีที่กำลังใช้งานจากหน้าจัดการผู้ใช้ได้ หากต้องการเปลี่ยนรหัสผ่านให้ใช้เมนูความปลอดภัย" }, { status: 409 });
      }
      if (suppliedAccountId === "user-owner") {
        return Response.json({ error: "บัญชีเจ้าของระบบเป็นสิทธิ์สูงสุดและแก้ไขจากหน้าจัดการผู้ใช้ไม่ได้" }, { status: 403 });
      }
      const accountId = suppliedAccountId || `user-${crypto.randomUUID()}`;
      const [existing] = suppliedAccountId ? await db.select().from(userAccounts).where(eq(userAccounts.id, accountId)).limit(1) : [];
      if (suppliedAccountId && !existing) return Response.json({ error: "ไม่พบบัญชีผู้ใช้ที่เลือก" }, { status: 404 });
      if (existing?.role === "admin" && existing.status === "active" && (role !== "admin" || status !== "active")) {
        const activeAdmins = await db.select({ id: userAccounts.id }).from(userAccounts).where(and(eq(userAccounts.role, "admin"), eq(userAccounts.status, "active")));
        if (activeAdmins.length <= 1) return Response.json({ error: "ต้องมีบัญชี HR / Admin ที่ใช้งานอยู่อย่างน้อย 1 บัญชี" }, { status: 409 });
      }
      const employeeIdInput = typeof payload.employeeId === "string" ? payload.employeeId.trim().slice(0, 100) : "";
      const employeeId = role === "admin" ? null : employeeIdInput || null;
      if (role !== "admin" && !employeeId) return Response.json({ error: "บัญชีพนักงานและหัวหน้าทีมต้องผูกกับโปรไฟล์พนักงาน" }, { status: 400 });
      const [linkedEmployee] = employeeId ? await db.select().from(employees).where(eq(employees.id, employeeId)).limit(1) : [];
      if (employeeId && !linkedEmployee) return Response.json({ error: "ไม่พบโปรไฟล์พนักงานที่เลือก" }, { status: 404 });
      if (status === "active" && employeeId && linkedEmployee?.status !== "active") return Response.json({ error: "ไม่สามารถเปิดใช้บัญชีที่ผูกกับพนักงานที่ลาออกหรือถูกลบจากรายชื่อแล้ว" }, { status: 409 });
      const linkedEmployeeRole = linkedEmployee ? findRole(linkedEmployee.roleId) : undefined;
      if (role !== "admin" && !linkedEmployeeRole) return Response.json({ error: "โปรไฟล์พนักงานไม่มีกรอบ KPI มาตรฐาน กรุณาให้ HR แก้ไขก่อนผูกบัญชี" }, { status: 409 });
      const existingCredential = existing ? await getAccountCredential(existing.id) : null;
      const credentialChange = await credentialMutationValues(accountId, payload.loginId, payload.temporaryPassword, existingCredential);
      const [loginOwner] = await db.select({ userAccountId: authCredentials.userAccountId }).from(authCredentials).where(eq(authCredentials.loginIdCanonical, credentialChange.values.loginIdCanonical)).limit(1);
      if (loginOwner && loginOwner.userAccountId !== accountId) return Response.json({ error: "ชื่อผู้ใช้นี้มีผู้ใช้งานแล้ว กรุณาเลือกชื่ออื่น" }, { status: 409 });
      const requestedDisplayName = typeof payload.displayName === "string" ? payload.displayName.trim().slice(0, 120) : "";
      const displayName = requestedDisplayName || linkedEmployee?.name || existing?.displayName || "";
      if (!displayName) return Response.json({ error: "กรุณาระบุชื่อที่แสดง" }, { status: 400 });
      const nickname = typeof payload.nickname === "string" ? payload.nickname.trim().replace(/\s+/g, " ").slice(0, 40) : existing?.nickname ?? "";
      const now = new Date().toISOString();
      const linkedDepartmentId = linkedEmployeeRole?.departmentId ?? "";
      const requestedDepartmentId = typeof payload.departmentId === "string" ? payload.departmentId.trim().slice(0, 80) : "";
      if (role === "manager" && requestedDepartmentId && requestedDepartmentId !== linkedDepartmentId) return Response.json({ error: "หัวหน้าทีมต้องใช้แผนกจากตำแหน่งพนักงานที่ผูกไว้" }, { status: 400 });
      const departmentId = role === "manager" ? linkedDepartmentId : "";
      const email = linkedEmployee && existing?.employeeId !== linkedEmployee.id
        ? linkedEmployee.email
        : existing?.email || linkedEmployee?.email || `${credentialChange.values.loginIdCanonical}@accounts.peoplepulse.internal`;
      const [emailOwner] = await db.select({ id: userAccounts.id }).from(userAccounts).where(eq(userAccounts.email, email)).limit(1);
      if (emailOwner && emailOwner.id !== accountId) return Response.json({ error: "โปรไฟล์พนักงานนี้มีบัญชีผู้ใช้งานแล้ว" }, { status: 409 });
      const userAccount: UserAccountRecord = {
        id: existing?.id ?? accountId,
        authUserId: "",
        email,
        displayName,
        nickname,
        role,
        employeeId,
        departmentId,
        status,
        lastLoginAt: existing?.lastLoginAt ?? null,
        createdBy: existing?.createdBy ?? currentUser.authenticatedName,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      const accountMutation = db.insert(userAccounts).values(userAccount).onConflictDoUpdate({ target: userAccounts.id, set: { authUserId: "", email, displayName, nickname, role, employeeId, departmentId, status, updatedAt: now } });
      if (!existingCredential) {
        if (credentialChange.mode !== "create") return Response.json({ error: "บัญชีใหม่ต้องมีรหัสผ่านชั่วคราว" }, { status: 400 });
        await db.batch([
          accountMutation,
          db.insert(authCredentials).values({ ...credentialChange.values, createdAt: now, updatedAt: now }),
        ]);
      } else if (credentialChange.mode === "metadata" && !credentialChange.loginChanged) {
        await accountMutation;
      } else {
        const mutationClaim = {
          id: `credential-mutation:${accountId}:${existingCredential.credentialVersion}`,
          userAccountId: accountId,
          eventType: credentialChange.mode === "reset" ? "credential_reset" as const : "credential_updated" as const,
          sourceHash: await requestSourceHash(request),
          detail: String(existingCredential.credentialVersion),
          createdAt: now,
        };
        const credentialUpdate = credentialChange.mode === "reset"
          ? db.update(authCredentials).set({ ...credentialChange.values, updatedAt: now }).where(and(
            eq(authCredentials.userAccountId, accountId),
            eq(authCredentials.credentialVersion, existingCredential.credentialVersion),
          ))
          : db.update(authCredentials).set(credentialChange.values).where(and(
            eq(authCredentials.userAccountId, accountId),
            eq(authCredentials.credentialVersion, existingCredential.credentialVersion),
          ));
        await db.batch([
          db.insert(authEvents).values(mutationClaim),
          credentialUpdate,
          accountMutation,
        ]);
      }
      const accessChanged = Boolean(existing && (existing.role !== role || existing.status !== status || existing.employeeId !== employeeId || existing.departmentId !== departmentId));
      if (existing && (accessChanged || credentialChange.loginChanged || credentialChange.mode === "reset")) {
        await revokeAllSessionsForAccount(accountId, credentialChange.mode === "reset" ? "credential-reset" : accessChanged ? "account-access-changed" : "login-id-changed");
      }
      if (credentialChange.mode === "create") {
        await recordAuthEvent("credential_created", accountId, await requestSourceHash(request), currentUser.id);
      }
      const savedCredential = await getAccountCredential(accountId);
      return Response.json({ userAccount: publicUserAccountDto(userAccount, savedCredential) }, { status: existing ? 200 : 201 });
    }

    if (payload.action === "updateEmployeeStatus" || payload.action === "archiveEmployee") {
      const employeeId = payload.employeeId?.trim().slice(0, 120) ?? "";
      const expectedUpdatedAt = payload.expectedUpdatedAt?.trim() ?? "";
      const nextStatus = payload.action === "archiveEmployee" ? "archived" as const : payload.status;
      if (!employeeId || !expectedUpdatedAt || (nextStatus !== "active" && nextStatus !== "resigned" && nextStatus !== "archived")) {
        return Response.json({ error: "ข้อมูลสถานะพนักงานไม่ครบ กรุณาโหลดแฟ้มใหม่แล้วลองอีกครั้ง" }, { status: 400 });
      }
      if (currentUser.employeeId === employeeId) {
        return Response.json({ error: "ไม่สามารถเปลี่ยนสถานะหรือลบแฟ้มของบัญชีที่กำลังใช้งานอยู่" }, { status: 409 });
      }

      const [employee] = await db.select().from(employees).where(eq(employees.id, employeeId)).limit(1);
      if (!employee) return Response.json({ error: "ไม่พบแฟ้มพนักงานที่เลือก" }, { status: 404 });
      if (employee.updatedAt !== expectedUpdatedAt) {
        return Response.json({ error: "แฟ้มนี้ถูกแก้ไขจากอีกหน้าจอ กรุณาโหลดข้อมูลล่าสุด" }, { status: 409 });
      }
      if (payload.action === "archiveEmployee" && employee.status === "active") {
        return Response.json({ error: "กรุณาเปลี่ยนสถานะเป็น “ลาออกแล้ว” ก่อนลบออกจากรายชื่อ" }, { status: 409 });
      }

      const now = new Date(Math.max(Date.now(), Date.parse(employee.updatedAt) + 1)).toISOString();
      const employeeMutation = db.update(employees)
        .set({ status: nextStatus, updatedAt: now })
        .where(and(eq(employees.id, employeeId), eq(employees.updatedAt, expectedUpdatedAt)));
      const [linkedAccount] = await db.select({ id: userAccounts.id }).from(userAccounts).where(eq(userAccounts.employeeId, employeeId)).limit(1);
      const disablesAccess = nextStatus !== "active";

      if (disablesAccess && linkedAccount) {
        await db.batch([
          employeeMutation,
          db.update(userAccounts).set({ status: "inactive", updatedAt: now }).where(eq(userAccounts.id, linkedAccount.id)),
          db.update(authSessions).set({ revokedAt: now, revokeReason: `employee-${nextStatus}` }).where(and(eq(authSessions.userAccountId, linkedAccount.id), isNull(authSessions.revokedAt))),
          db.insert(authEvents).values({
            id: `auth-event-${crypto.randomUUID()}`,
            userAccountId: linkedAccount.id,
            eventType: "sessions_revoked",
            sourceHash: await requestSourceHash(request),
            detail: `employee:${employeeId};status:${nextStatus};actor:${currentUser.id}`,
            createdAt: now,
          }),
        ]);
      } else {
        await employeeMutation;
      }

      const [savedEmployee] = await db.select().from(employees).where(eq(employees.id, employeeId)).limit(1);
      if (!savedEmployee || savedEmployee.updatedAt !== now || savedEmployee.status !== nextStatus) {
        return Response.json({ error: "แฟ้มนี้ถูกแก้ไขจากอีกหน้าจอ กรุณาโหลดข้อมูลล่าสุด" }, { status: 409 });
      }
      return Response.json({
        employee: savedEmployee,
        disabledUserAccountIds: disablesAccess && linkedAccount ? [linkedAccount.id] : [],
        archived: nextStatus === "archived",
      });
    }

    if (payload.action === "deleteEmployeePermanently") {
      const employeeId = payload.employeeId?.trim().slice(0, 120) ?? "";
      const expectedUpdatedAt = payload.expectedUpdatedAt?.trim() ?? "";
      if (!employeeId || !expectedUpdatedAt) {
        return Response.json({ error: "ข้อมูลแฟ้มพนักงานไม่ครบ กรุณาโหลดข้อมูลล่าสุดแล้วลองอีกครั้ง" }, { status: 400 });
      }
      if (currentUser.employeeId === employeeId) {
        return Response.json({ error: "ไม่สามารถลบแฟ้มของบัญชีที่กำลังใช้งานอยู่" }, { status: 409 });
      }

      const [employee] = await db.select().from(employees).where(eq(employees.id, employeeId)).limit(1);
      if (!employee) return Response.json({ error: "ไม่พบแฟ้มพนักงานที่เลือก" }, { status: 404 });
      if (employee.status !== "archived") {
        return Response.json({ error: "ต้องลบพนักงานออกจากรายชื่อก่อน จึงจะลบแฟ้มถาวรได้" }, { status: 409 });
      }
      if (employee.updatedAt !== expectedUpdatedAt) {
        return Response.json({ error: "แฟ้มนี้ถูกแก้ไขจากอีกหน้าจอ กรุณาโหลดข้อมูลล่าสุด" }, { status: 409 });
      }
      const requiredConfirmation = `ลบถาวร ${employee.name}`;
      const payrollHistory = await getD1().prepare("SELECT 1 FROM payroll_slips WHERE employee_id=? UNION ALL SELECT 1 FROM payroll_awards WHERE employee_id=? LIMIT 1").bind(employeeId, employeeId).first();
      if (payrollHistory) return Response.json({ error: "มีประวัติเงินเดือนหรือสิทธิ์เงินเพิ่ม ต้องเก็บแฟ้มไว้เพื่อการตรวจสอบ ใช้สถานะลาออก/เก็บถาวรแทนการลบข้อมูล" }, { status: 409 });
      if (payload.confirmation !== requiredConfirmation) {
        return Response.json({ error: `พิมพ์ “${requiredConfirmation}” ให้ตรงเพื่อยืนยันการลบถาวร` }, { status: 400 });
      }

      const employeeDepartmentId = roleDepartmentId(employee.roleId);
      const [ownedProjectRows, activeEmployeeRows, linkedAccountRows, profileFileRows, documentFileRows, warningFileRows, recognitionFileRows, submissionFileRows] = await Promise.all([
        db.select({ id: projects.id }).from(projects).where(eq(projects.ownerEmployeeId, employeeId)),
        db.select({ id: employees.id, name: employees.name, roleId: employees.roleId }).from(employees).where(and(eq(employees.status, "active"), sql`${employees.id} <> ${employeeId}`)),
        db.select({ id: userAccounts.id }).from(userAccounts).where(eq(userAccounts.employeeId, employeeId)),
        db.select({ storageKey: employeeProfiles.profileImageKey }).from(employeeProfiles).where(eq(employeeProfiles.employeeId, employeeId)),
        db.select({ storageKey: applicationDocuments.storageKey }).from(applicationDocuments).where(eq(applicationDocuments.employeeId, employeeId)),
        db.select({ storageKey: employeeWarnings.storageKey }).from(employeeWarnings).where(eq(employeeWarnings.employeeId, employeeId)),
        db.select({ storageKey: employeeRecognitions.storageKey }).from(employeeRecognitions).where(eq(employeeRecognitions.employeeId, employeeId)),
        db.select({ storageKey: workSubmissions.storageKey })
          .from(workSubmissions)
          .leftJoin(workItems, eq(workSubmissions.workItemId, workItems.id))
          .where(or(eq(workSubmissions.employeeId, employeeId), eq(workItems.assigneeEmployeeId, employeeId))),
      ]);
      const replacementEmployee = employeeDepartmentId ? activeEmployeeRows
        .filter((candidate) => roleDepartmentId(candidate.roleId) === employeeDepartmentId)
        .sort((a, b) => a.name.localeCompare(b.name, "th") || a.id.localeCompare(b.id))[0] : undefined;
      if (ownedProjectRows.length && !replacementEmployee) {
        return Response.json({ error: `ยังลบถาวรไม่ได้ เพราะ ${employee.name} เป็นเจ้าของ ${ownedProjectRows.length} โปรเจกต์ และไม่มีพนักงานที่ทำงานอยู่ในแผนกเดียวกันให้รับช่วง กรุณาเพิ่มหรือคืนสถานะพนักงานในแผนกนี้ก่อน` }, { status: 409 });
      }

      const fileKeys = [...new Set([
        ...profileFileRows,
        ...documentFileRows,
        ...warningFileRows,
        ...recognitionFileRows,
        ...submissionFileRows,
      ].map((row) => row.storageKey).filter((key): key is string => Boolean(key)))];
      const filesBucket = fileKeys.length ? getFilesBucket() : null;
      const now = new Date().toISOString();
      const d1 = getD1();
      const employeeGuard = "EXISTS (SELECT 1 FROM employees WHERE id = ? AND status = 'archived' AND updated_at = ?)";
      const statements: D1PreparedStatement[] = [
        d1.prepare(`DELETE FROM auth_sessions WHERE user_account_id IN (SELECT id FROM user_accounts WHERE employee_id = ?) AND ${employeeGuard}`).bind(employeeId, employeeId, expectedUpdatedAt),
        d1.prepare(`DELETE FROM auth_credentials WHERE user_account_id IN (SELECT id FROM user_accounts WHERE employee_id = ?) AND ${employeeGuard}`).bind(employeeId, employeeId, expectedUpdatedAt),
        d1.prepare(`DELETE FROM notification_reads WHERE user_key IN (SELECT id FROM user_accounts WHERE employee_id = ?) AND ${employeeGuard}`).bind(employeeId, employeeId, expectedUpdatedAt),
        d1.prepare(`UPDATE user_accounts SET auth_user_id = '', email = 'deleted-' || id || '@deleted.invalid', display_name = 'ผู้ใช้ที่ลบแล้ว', nickname = '', status = 'inactive', employee_id = NULL, department_id = '', updated_at = ? WHERE employee_id = ? AND ${employeeGuard}`).bind(now, employeeId, employeeId, expectedUpdatedAt),
      ];
      if (ownedProjectRows.length && replacementEmployee) {
        statements.push(d1.prepare(`UPDATE projects SET owner_employee_id = ?, updated_at = ? WHERE owner_employee_id = ? AND ${employeeGuard}`).bind(replacementEmployee.id, now, employeeId, employeeId, expectedUpdatedAt));
      }
      statements.push(
        d1.prepare(`DELETE FROM policy_acknowledgements WHERE employee_id = ? AND ${employeeGuard}`).bind(employeeId, employeeId, expectedUpdatedAt),
        d1.prepare(`DELETE FROM point_mutation_claims WHERE employee_id = ? AND ${employeeGuard}`).bind(employeeId, employeeId, expectedUpdatedAt),
        d1.prepare(`DELETE FROM point_cap_claims WHERE employee_id = ? AND ${employeeGuard}`).bind(employeeId, employeeId, expectedUpdatedAt),
        d1.prepare(`DELETE FROM reward_redemption_claims WHERE employee_id = ? AND ${employeeGuard}`).bind(employeeId, employeeId, expectedUpdatedAt),
        // The immutable warning-event guard is suspended only inside this atomic purge batch.
        // If any later statement fails, D1 rolls the whole batch back and restores the guard.
        d1.prepare("DROP TRIGGER IF EXISTS employee_warning_event_delete_guard"),
        d1.prepare(`DELETE FROM employee_warning_events WHERE warning_id IN (SELECT id FROM employee_warnings WHERE employee_id = ?) AND ${employeeGuard}`).bind(employeeId, employeeId, expectedUpdatedAt),
        d1.prepare(`CREATE TRIGGER employee_warning_event_delete_guard
          BEFORE DELETE ON employee_warning_events
          BEGIN
            SELECT RAISE(ABORT, 'EMPLOYEE_WARNING_EVENT_IMMUTABLE');
          END`),
        d1.prepare(`DELETE FROM employee_warnings WHERE employee_id = ? AND ${employeeGuard}`).bind(employeeId, employeeId, expectedUpdatedAt),
        d1.prepare(`DELETE FROM employee_recognitions WHERE employee_id = ? AND ${employeeGuard}`).bind(employeeId, employeeId, expectedUpdatedAt),
        d1.prepare(`INSERT INTO auth_events (id, user_account_id, event_type, source_hash, detail, created_at) SELECT ?, ?, 'employee_purged', ?, ?, ? WHERE ${employeeGuard}`).bind(
          `auth-event-${crypto.randomUUID()}`,
          currentUser.id,
          await requestSourceHash(request),
          `employee:${employeeId};projects-reassigned:${ownedProjectRows.length};actor:${currentUser.id}`,
          now,
          employeeId,
          expectedUpdatedAt,
        ),
      );
      const employeeDeleteResultIndex = statements.length;
      statements.push(d1.prepare("DELETE FROM employees WHERE id = ? AND status = 'archived' AND updated_at = ?").bind(employeeId, expectedUpdatedAt));

      const deletionResults = await d1.batch(statements);
      if ((deletionResults[employeeDeleteResultIndex]?.meta.changes ?? 0) !== 1) {
        return Response.json({ error: "แฟ้มนี้ถูกแก้ไขจากอีกหน้าจอ กรุณาโหลดข้อมูลล่าสุด" }, { status: 409 });
      }

      let fileCleanupPending = false;
      if (filesBucket) {
        for (let index = 0; index < fileKeys.length; index += 25) {
          const results = await Promise.allSettled(fileKeys.slice(index, index + 25).map((fileKey) => filesBucket.delete(fileKey)));
          if (results.some((result) => result.status === "rejected")) fileCleanupPending = true;
        }
      }
      return Response.json({
        deletedEmployeeId: employeeId,
        disabledUserAccountIds: linkedAccountRows.map((account) => account.id),
        reassignedProjectCount: ownedProjectRows.length,
        replacementEmployeeName: replacementEmployee?.name ?? "",
        deletedFileCount: fileKeys.length,
        fileCleanupPending,
      });
    }

    if (payload.action === "createEmployee") {
      const name = payload.name?.trim() ?? "";
      const email = payload.email?.trim().toLowerCase() ?? "";
      const roleId = payload.roleId ?? "";
      const positionTitle = normalizedPositionTitle(payload.positionTitle);
      const manager = payload.manager?.trim() ?? "";
      if (!name || !email || !email.includes("@") || !roles.some((role) => role.id === roleId)) {
        return Response.json({ error: "กรุณากรอกชื่อ อีเมล และตำแหน่งให้ครบถ้วน" }, { status: 400 });
      }
      if (positionTitle === null || Array.from(positionTitle).length > 120) {
        return Response.json({ error: "ชื่อตำแหน่งกำหนดเองต้องไม่เกิน 120 ตัวอักษร" }, { status: 400 });
      }

      const now = new Date().toISOString();
      const employee = {
        id: `emp-${crypto.randomUUID()}`,
        initials: makeInitials(name),
        name,
        email,
        roleId,
        positionTitle,
        manager,
        status: "active" as const,
        latestScore: null,
        latestSkillScore: null,
        latestPeriod: null,
        createdAt: now,
        updatedAt: now,
      };
      const hrProfile = {
        employeeId: employee.id,
        currentSalary: roleSalaryBands[roleId].mid,
        salaryReviewMonth: "มกราคม 2570",
        updatedAt: now,
      };
      const employeeProfile = {
        employeeId: employee.id,
        personalEmail: "",
        phone: "",
        birthDate: "",
        nationalIdLast4: "",
        address: "",
        emergencyName: "",
        emergencyPhone: "",
        startDate: now.slice(0, 10),
        employmentType: "probation" as const,
        education: "",
        experienceYears: 0,
        applicationSource: "",
        updatedAt: now,
      };
      await db.batch([
        db.insert(employees).values(employee),
        db.insert(hrProfiles).values(hrProfile),
        db.insert(employeeProfiles).values(employeeProfile),
      ]);
      return Response.json({ employee, hrProfile, employeeProfile }, { status: 201 });
    }

    if (payload.action === "saveEvaluation") {
      const employeeId = payload.employeeId ?? "";
      if (!(await canAccessEmployee(currentUser, employeeId))) return Response.json({ error: "ไม่มีสิทธิ์ประเมินพนักงานคนนี้" }, { status: 403 });
      if (currentUser.employeeId === employeeId) return Response.json({ error: "ผู้ใช้ไม่สามารถประเมินตนเองหรือให้ Points จากผลประเมินตนเองได้ กรุณาให้ HR คนอื่นเป็นผู้ประเมิน" }, { status: 403 });
      const period = payload.period ?? periods[0];
      const [employee] = await db.select().from(employees).where(and(eq(employees.id, employeeId), eq(employees.status, "active"))).limit(1);
      if (!employee) return Response.json({ error: "ไม่พบพนักงานที่กำลังใช้งานอยู่ จึงไม่สามารถบันทึกผลประเมินได้" }, { status: 404 });

      const role = findRole(employee.roleId);
      if (!role) return Response.json({ error: "โปรไฟล์พนักงานไม่มีกรอบ KPI มาตรฐาน กรุณาให้ HR แก้ไขก่อนประเมิน" }, { status: 409 });
      const hasCompleteSkillAssessment = role.skills.every((skill) => {
        const level = payload.skillScores?.[skill.id];
        return typeof level === "number" && Number.isFinite(level) && level >= 1 && level <= 5;
      });
      if (!hasCompleteSkillAssessment) return Response.json({ error: `กรุณาประเมินสมรรถนะให้ครบทั้ง ${role.skills.length} ด้านก่อนบันทึก` }, { status: 400 });
      const kpiScores = Object.fromEntries(role.kpis.map((kpi) => [kpi.id, clampScore(payload.kpiScores?.[kpi.id])]));
      const skillScores = Object.fromEntries(role.skills.map((skill) => [skill.id, clampSkillLevel(payload.skillScores?.[skill.id])]));
      const kpiScore = role.kpis.reduce((sum, kpi) => sum + kpiScores[kpi.id] * kpi.weight / 100, 0);
      const skillScore = calculateSkillScore(role, skillScores);
      const totalScore = kpiScore * 0.7 + skillScore * 0.3;
      const now = new Date().toISOString();
      const evaluation = {
        id: `${employeeId}:${period}`,
        employeeId,
        period,
        kpiScores,
        skillScores,
        kpiScore: Number(kpiScore.toFixed(1)),
        skillScore: Number(skillScore.toFixed(1)),
        totalScore: Number(totalScore.toFixed(1)),
        note: payload.note?.trim().slice(0, 2000) ?? "",
        evaluator: evaluatorName(currentUser),
        evaluatedAt: now,
      };

      const evaluationMutation = db.insert(evaluations).values(evaluation).onConflictDoUpdate({
        target: [evaluations.employeeId, evaluations.period],
        set: {
          kpiScores: evaluation.kpiScores,
          skillScores: evaluation.skillScores,
          kpiScore: evaluation.kpiScore,
          skillScore: evaluation.skillScore,
          totalScore: evaluation.totalScore,
          note: evaluation.note,
          evaluator: evaluation.evaluator,
          evaluatedAt: evaluation.evaluatedAt,
        },
      });

      const oldPeriodIndex = employee.latestPeriod ? periods.indexOf(employee.latestPeriod) : Number.POSITIVE_INFINITY;
      const newPeriodIndex = periods.indexOf(period);
      if (employee.latestPeriod === null || (newPeriodIndex >= 0 && newPeriodIndex <= oldPeriodIndex)) {
        await db.batch([
          evaluationMutation,
          db.update(employees).set({
            latestScore: evaluation.totalScore,
            latestSkillScore: evaluation.skillScore,
            latestPeriod: period,
            updatedAt: now,
          }).where(and(eq(employees.id, employeeId), eq(employees.status, "active"))),
        ]);
      } else {
        await db.batch([evaluationMutation]);
      }

      return Response.json({ evaluation, pointEntry: null, pointEvent: null, pointWarning: "บันทึกผลประเมินแล้ว Points จะถูกคำนวณแบบครั้งเดียวเมื่อ HR ประมวลผล Points รายเดือน" });
    }

    if (payload.action === "saveSelfAssessment") {
      const employeeId = payload.employeeId?.trim() ?? "";
      if (currentUser.role !== "employee" || !currentUser.employeeId || currentUser.employeeId !== employeeId) {
        return Response.json({ error: "บันทึกแบบประเมินตนเองได้เฉพาะโปรไฟล์ของคุณ" }, { status: 403 });
      }
      const period = payload.period ?? periods[0];
      const [employee] = await db.select().from(employees).where(and(eq(employees.id, employeeId), eq(employees.status, "active"))).limit(1);
      if (!employee) return Response.json({ error: "ไม่พบโปรไฟล์พนักงานที่ใช้งานอยู่" }, { status: 404 });
      const role = findRole(employee.roleId);
      if (!role) return Response.json({ error: "โปรไฟล์พนักงานไม่มีกรอบ KPI มาตรฐาน กรุณาให้ HR แก้ไขก่อนประเมิน" }, { status: 409 });
      const hasCompleteSkillAssessment = role.skills.every((skill) => {
        const level = payload.skillScores?.[skill.id];
        return typeof level === "number" && Number.isFinite(level) && level >= 1 && level <= 5;
      });
      if (!hasCompleteSkillAssessment) return Response.json({ error: `กรุณาประเมินสมรรถนะให้ครบทั้ง ${role.skills.length} ด้านก่อนบันทึก` }, { status: 400 });
      const kpiScores = Object.fromEntries(role.kpis.map((kpi) => [kpi.id, clampScore(payload.kpiScores?.[kpi.id])]));
      const skillScores = Object.fromEntries(role.skills.map((skill) => [skill.id, clampSkillLevel(payload.skillScores?.[skill.id])]));
      const kpiScore = role.kpis.reduce((sum, kpi) => sum + kpiScores[kpi.id] * kpi.weight / 100, 0);
      const skillScore = calculateSkillScore(role, skillScores);
      const totalScore = kpiScore * 0.7 + skillScore * 0.3;
      const now = new Date().toISOString();
      const selfAssessment = {
        id: `${employeeId}:${period}`,
        employeeId,
        period,
        kpiScores,
        skillScores,
        kpiScore: Number(kpiScore.toFixed(1)),
        skillScore: Number(skillScore.toFixed(1)),
        totalScore: Number(totalScore.toFixed(1)),
        note: payload.note?.trim().slice(0, 2000) ?? "",
        submittedAt: now,
        updatedAt: now,
      };
      await db.insert(employeeSelfAssessments).values(selfAssessment).onConflictDoUpdate({
        target: [employeeSelfAssessments.employeeId, employeeSelfAssessments.period],
        set: {
          kpiScores: selfAssessment.kpiScores,
          skillScores: selfAssessment.skillScores,
          kpiScore: selfAssessment.kpiScore,
          skillScore: selfAssessment.skillScore,
          totalScore: selfAssessment.totalScore,
          note: selfAssessment.note,
          submittedAt: selfAssessment.submittedAt,
          updatedAt: selfAssessment.updatedAt,
        },
      });
      return Response.json({
        selfAssessment,
        pointEntry: null,
        pointEvent: null,
        message: "บันทึกแบบประเมินตนเองแล้ว โดยไม่เปลี่ยนผลประเมินทางการหรือ Points",
      });
    }

    if (payload.action === "saveHrPlan") {
      const employeeId = payload.employeeId ?? "";
      if (!(await canAccessEmployee(currentUser, employeeId))) return Response.json({ error: "ไม่มีสิทธิ์เข้าถึงข้อมูลพนักงานคนนี้" }, { status: 403 });
      const [employee] = await db.select().from(employees).where(and(eq(employees.id, employeeId), eq(employees.status, "active"))).limit(1);
      if (!employee) return Response.json({ error: "ไม่พบพนักงานที่เลือก" }, { status: 404 });
      const salary = Math.min(1000000, Math.max(0, Math.round(Number(payload.currentSalary) || 0)));
      const salaryReviewMonth = payload.salaryReviewMonth?.trim().slice(0, 80) || "มกราคม 2570";
      const now = new Date().toISOString();
      const hrProfile = { employeeId, currentSalary: salary, salaryReviewMonth, updatedAt: now };
      await db.insert(hrProfiles).values(hrProfile).onConflictDoUpdate({
        target: hrProfiles.employeeId,
        set: { currentSalary: salary, salaryReviewMonth, updatedAt: now },
      });

      const title = payload.title?.trim().slice(0, 200) ?? "";
      let talentAction = null;
      if (title) {
        const type = payload.planType ?? "upskill";
        const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(payload.dueDate ?? "") ? payload.dueDate as string : now.slice(0, 10);
        const targetRoleId = roles.some((role) => role.id === payload.targetRoleId) ? payload.targetRoleId as string : employee.roleId;
        const actionId = payload.actionId?.trim() || `action-${crypto.randomUUID()}`;
        const [existingAction] = payload.actionId
          ? await db.select().from(talentActions).where(and(eq(talentActions.id, actionId), eq(talentActions.employeeId, employeeId))).limit(1)
          : [];
        talentAction = {
          id: existingAction?.id ?? actionId,
          employeeId,
          type,
          title,
          status: existingAction?.status ?? "planned" as const,
          score: existingAction?.score ?? null,
          dueDate,
          targetRoleId,
          createdAt: existingAction?.createdAt ?? now,
          updatedAt: now,
        };
        await db.insert(talentActions).values(talentAction).onConflictDoUpdate({
          target: talentActions.id,
          set: { type, title, dueDate, targetRoleId, updatedAt: now },
        });
      }
      return Response.json({ hrProfile, talentAction });
    }

    if (payload.action === "completeTalentAction") {
      const actionId = payload.actionId ?? "";
      const [existingTalentAction] = await db.select().from(talentActions).where(eq(talentActions.id, actionId)).limit(1);
      if (!existingTalentAction) return Response.json({ error: "ไม่พบแผนที่เลือก" }, { status: 404 });
      if (!(await canAccessEmployee(currentUser, existingTalentAction.employeeId))) return Response.json({ error: "ไม่มีสิทธิ์จัดการแผนนี้" }, { status: 403 });
      const score = payload.score === undefined ? null : Math.min(100, Math.max(0, Math.round(Number(payload.score) || 0)));
      const now = new Date().toISOString();
      await db.update(talentActions).set({ status: "completed", score, updatedAt: now }).where(eq(talentActions.id, actionId));
      const [talentAction] = await db.select().from(talentActions).where(eq(talentActions.id, actionId)).limit(1);
      if (!talentAction) return Response.json({ error: "ไม่พบแผนที่เลือก" }, { status: 404 });
      return Response.json({ talentAction });
    }

    if (payload.action === "saveAttendance") {
      if (currentUser.role !== "admin" && payload.status !== "leave") return Response.json({ error: "กรุณาลงเวลาด้วยกล้องและพิกัดในห้องทำงาน หรือให้ HR บันทึกแก้ไข" }, { status: 403 });
      const employeeId = payload.employeeId ?? "";
      if (!(await canAccessEmployee(currentUser, employeeId))) return Response.json({ error: "ลงเวลาได้เฉพาะบัญชีของตนเองหรือทีมที่ได้รับสิทธิ์" }, { status: 403 });
      const [employee] = await db.select().from(employees).where(eq(employees.id, employeeId)).limit(1);
      if (!employee) return Response.json({ error: "ไม่พบพนักงานที่เลือก" }, { status: 404 });
      const workDate = /^\d{4}-\d{2}-\d{2}$/.test(payload.workDate ?? "") ? payload.workDate as string : "";
      const status = payload.status ?? "present";
      if (!workDate) return Response.json({ error: "กรุณาระบุวันที่ทำงาน" }, { status: 400 });
      const isTime = (value?: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value ?? "");
      const clockIn = isTime(payload.clockIn) ? payload.clockIn as string : null;
      const clockOut = isTime(payload.clockOut) ? payload.clockOut as string : null;
      const startMinutes = 9 * 60;
      const clockInMinutes = clockIn ? Number(clockIn.slice(0, 2)) * 60 + Number(clockIn.slice(3, 5)) : 0;
      const minutesLate = status === "leave" || status === "absent" || !clockIn ? 0 : Math.max(0, clockInMinutes - startMinutes);
      const resolvedStatus = status === "present" && minutesLate > 0 ? "late" as const : status;
      const now = new Date().toISOString();
      const actor = evaluatorName(currentUser);
      const [existing] = await db.select().from(attendanceRecords).where(and(eq(attendanceRecords.employeeId, employeeId), eq(attendanceRecords.workDate, workDate))).limit(1);
      const attendanceRecord = {
        id: existing?.id ?? `attendance-${crypto.randomUUID()}`,
        employeeId,
        workDate,
        status: resolvedStatus,
        clockIn: resolvedStatus === "leave" || resolvedStatus === "absent" ? null : clockIn,
        clockOut: resolvedStatus === "leave" || resolvedStatus === "absent" ? null : clockOut,
        minutesLate,
        leaveType: resolvedStatus === "leave" ? payload.leaveType ?? "personal" as const : null,
        note: payload.note?.trim().slice(0, 1000) ?? "",
        approvalStatus: resolvedStatus === "leave" ? "pending" as const : "not_required" as const,
        approvedBy: null,
        approvedAt: null,
        createdBy: existing?.createdBy ?? actor,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await db.insert(attendanceRecords).values(attendanceRecord).onConflictDoUpdate({
        target: [attendanceRecords.employeeId, attendanceRecords.workDate],
        set: { status: attendanceRecord.status, clockIn: attendanceRecord.clockIn, clockOut: attendanceRecord.clockOut, minutesLate, leaveType: attendanceRecord.leaveType, note: attendanceRecord.note, approvalStatus: attendanceRecord.approvalStatus, approvedBy: null, approvedAt: null, updatedAt: now },
      });
      return Response.json({ attendanceRecord });
    }

    if (payload.action === "approveAttendance") {
      const attendanceId = payload.attendanceId ?? "";
      const approvalStatus = payload.approvalStatus;
      if (!approvalStatus) return Response.json({ error: "กรุณาเลือกผลการอนุมัติ" }, { status: 400 });
      const [existing] = await db.select().from(attendanceRecords).where(eq(attendanceRecords.id, attendanceId)).limit(1);
      if (!existing || existing.status !== "leave") return Response.json({ error: "ไม่พบคำขอลาที่เลือก" }, { status: 404 });
      if (!(await canAccessEmployee(currentUser, existing.employeeId))) return Response.json({ error: "ไม่มีสิทธิ์อนุมัติคำขอนี้" }, { status: 403 });
      const now = new Date().toISOString();
      await db.update(attendanceRecords).set({ approvalStatus, approvedBy: evaluatorName(currentUser), approvedAt: now, updatedAt: now }).where(eq(attendanceRecords.id, attendanceId));
      const [attendanceRecord] = await db.select().from(attendanceRecords).where(eq(attendanceRecords.id, attendanceId)).limit(1);
      return Response.json({ attendanceRecord });
    }

    if (payload.action === "verifySkillAchievement") {
      const employeeId = payload.employeeId ?? "";
      const [employee] = await db.select().from(employees).where(and(eq(employees.id, employeeId), eq(employees.status, "active"))).limit(1);
      if (!employee) return Response.json({ error: "ไม่พบพนักงานที่เลือก" }, { status: 404 });
      const role = findRole(employee.roleId);
      if (!role) return Response.json({ error: "โปรไฟล์พนักงานไม่มีกรอบ KPI มาตรฐาน กรุณาให้ HR แก้ไขก่อนรับรองสกิล" }, { status: 409 });
      const skill = role.skills.find((item) => item.id === payload.skillId);
      const level = Math.max(1, Math.min(5, Math.round(Number(payload.level) || 0)));
      if (!skill || level < 2) return Response.json({ error: "กรุณาเลือกสกิลและระดับที่ผ่านการยืนยัน" }, { status: 400 });
      if (skill.eligibleForAllowance === false) return Response.json({ error: "สมรรถนะพฤติกรรมใช้ประกอบการประเมินและแผนพัฒนา แต่ไม่เพิ่มเงินเดือนโดยอัตโนมัติ" }, { status: 400 });
      if (!isSafeOptionalUrl(payload.evidenceUrl?.trim() ?? "")) return Response.json({ error: "ลิงก์หลักฐานต้องขึ้นต้นด้วย http หรือ https" }, { status: 400 });
      const [evaluation] = await db.select().from(evaluations).where(and(eq(evaluations.employeeId, employeeId), eq(evaluations.period, periods[0]))).limit(1);
      const evaluatedLevel = Number(evaluation?.skillScores?.[skill.id] ?? 0);
      if (evaluatedLevel < level) return Response.json({ error: `ผลประเมินล่าสุดของ ${skill.name} ยังไม่ถึงระดับ ${level}` }, { status: 400 });
      const [duplicate] = await db.select().from(skillAchievements).where(and(eq(skillAchievements.employeeId, employeeId), and(eq(skillAchievements.skillId, skill.id), eq(skillAchievements.level, level)))).limit(1);
      if (duplicate) return Response.json({ error: "ระดับสกิลนี้ได้รับการยืนยันแล้ว ระบบไม่บันทึกซ้ำ" }, { status: 409 });
      const now = new Date().toISOString();
      // New certifications no longer silently increase permanent base salary.
      // The owner grants finite cash awards through the payroll module instead.
      const allowance = 0;
      const verifier = evaluatorName(currentUser);
      const achievement = {
        id: `achievement-${crypto.randomUUID()}`,
        employeeId,
        roleId: role.id,
        skillId: skill.id,
        skillName: skill.name,
        level,
        monthlyAllowance: allowance,
        verifiedBy: verifier,
        verifiedAt: now,
        evidenceUrl: payload.evidenceUrl?.trim().slice(0, 1000) ?? "",
        note: payload.note?.trim().slice(0, 1000) ?? "",
        createdAt: now,
      };
      const initialHrProfile = {
        employeeId,
        currentSalary: 0,
        salaryReviewMonth: "รอบถัดไปตามนโยบายบริษัท",
        updatedAt: now,
      };
      const talentAction = {
        id: `action-${crypto.randomUUID()}`,
        employeeId,
        type: "salary_review" as const,
        title: `ยืนยัน ${skill.name} ระดับ ${level} · รอเจ้าของกำหนดเงินเพิ่มตามช่วงเวลา`,
        status: "completed" as const,
        score: level * 20,
        dueDate: now.slice(0, 10),
        targetRoleId: role.id,
        createdAt: now,
        updatedAt: now,
      };
      try {
        await db.batch([
          db.insert(skillAchievements).values(achievement),
          db.insert(hrProfiles).values(initialHrProfile).onConflictDoNothing({ target: hrProfiles.employeeId }),
          db.insert(talentActions).values(talentAction),
        ]);
      } catch (error) {
        if (isUniqueConstraintError(error)) return Response.json({ error: "ระดับสกิลนี้ถูกยืนยันพร้อมกันจากอีกหน้าจอ ระบบไม่เพิ่มเงินซ้ำ" }, { status: 409 });
        throw error;
      }
      const [hrProfile] = await db.select().from(hrProfiles).where(eq(hrProfiles.employeeId, employeeId)).limit(1);
      if (!hrProfile) throw new Error("Skill allowance committed without an HR profile");
      return Response.json({ skillAchievement: achievement, hrProfile, talentAction });
    }

    if (payload.action === "saveProject") {
      const name = payload.name?.trim().slice(0, 120) ?? "";
      const ownerEmployeeId = payload.ownerEmployeeId ?? "";
      const [owner] = await db.select().from(employees).where(and(eq(employees.id, ownerEmployeeId), eq(employees.status, "active"))).limit(1);
      if (!name || !owner) return Response.json({ error: "กรุณาระบุชื่อโปรเจกต์และเจ้าของโปรเจกต์" }, { status: 400 });
      if (!(await canAccessEmployee(currentUser, ownerEmployeeId))) return Response.json({ error: "ไม่มีสิทธิ์สร้างโปรเจกต์ให้พนักงานคนนี้" }, { status: 403 });
      const now = new Date().toISOString();
      const projectId = payload.projectId?.trim() || `project-${crypto.randomUUID()}`;
      const [existingProject] = payload.projectId ? await db.select().from(projects).where(eq(projects.id, projectId)).limit(1) : [];
      if (existingProject && !(await canAccessEmployee(currentUser, existingProject.ownerEmployeeId))) return Response.json({ error: "ไม่มีสิทธิ์แก้ไขโปรเจกต์นี้" }, { status: 403 });
      const ownerRole = findRole(owner.roleId);
      if (!ownerRole) return Response.json({ error: "โปรไฟล์เจ้าของโปรเจกต์ไม่มีกรอบ KPI มาตรฐาน กรุณาให้ HR แก้ไขก่อน" }, { status: 409 });
      const ownerDepartmentId = ownerRole.departmentId;
      const requestedDepartmentId = typeof payload.departmentId === "string" ? payload.departmentId.trim().slice(0, 80) : "";
      const departmentId = requestedDepartmentId || ownerDepartmentId;
      if (!departmentId || !roles.some((role) => role.departmentId === departmentId)) return Response.json({ error: "แผนกของโปรเจกต์ไม่ถูกต้อง" }, { status: 400 });
      if (currentUser.role === "manager" && (ownerDepartmentId !== currentUser.departmentId || departmentId !== currentUser.departmentId || (existingProject && existingProject.departmentId !== currentUser.departmentId))) {
        return Response.json({ error: "หัวหน้าทีมจัดการได้เฉพาะโปรเจกต์ในแผนกของตนเอง" }, { status: 403 });
      }
      const project = {
        id: existingProject?.id ?? projectId,
        name,
        description: payload.description?.trim().slice(0, 1000) ?? "",
        ownerEmployeeId,
        departmentId,
        status: payload.status ?? "active" as const,
        dueDate: /^\d{4}-\d{2}-\d{2}$/.test(payload.dueDate ?? "") ? payload.dueDate as string : now.slice(0, 10),
        color: payload.color?.trim().slice(0, 30) || "forest",
        createdAt: existingProject?.createdAt ?? now,
        updatedAt: now,
      };
      await db.insert(projects).values(project).onConflictDoUpdate({
        target: projects.id,
        set: { name: project.name, description: project.description, ownerEmployeeId: project.ownerEmployeeId, departmentId: project.departmentId, status: project.status, dueDate: project.dueDate, color: project.color, updatedAt: now },
      });
      return Response.json({ project });
    }

    if (payload.action === "saveWorkItem") {
      if (currentUser.role === "employee") {
        if (payload.workItemId !== undefined && typeof payload.workItemId !== "string") return Response.json({ error: "รหัสงานไม่ถูกต้อง" }, { status: 400 });
        const workItemId = typeof payload.workItemId === "string" ? payload.workItemId.trim() : "";
        if (workItemId) {
          const [assignedWorkItem] = await db.select().from(workItems).where(eq(workItems.id, workItemId)).limit(1);
          if (!assignedWorkItem || assignedWorkItem.assigneeEmployeeId !== currentUser.employeeId) return Response.json({ error: "แก้ไขได้เฉพาะงานที่มอบหมายให้คุณ" }, { status: 403 });
          if (assignedWorkItem.status === "review" || assignedWorkItem.status === "done") return Response.json({ error: "งานที่ส่งตรวจหรือปิดแล้วไม่สามารถแก้ความคืบหน้าได้" }, { status: 409 });
          const status = assignedWorkItem.status === "todo" && payload.status === "in_progress" ? "in_progress" as const : assignedWorkItem.status;
          const progress = status === "todo" ? 0 : Math.min(90, Math.max(1, Math.round(Number(payload.progress) || assignedWorkItem.progress || 10)));
          const now = new Date().toISOString();
          const submittedEvidence = db.select({ id: workSubmissions.id }).from(workSubmissions).where(and(eq(workSubmissions.workItemId, workItemId), eq(workSubmissions.status, "submitted")));
          const [savedWorkItem] = await db.update(workItems).set({ status, progress, updatedAt: now }).where(and(
            eq(workItems.id, workItemId),
            eq(workItems.assigneeEmployeeId, assignedWorkItem.assigneeEmployeeId),
            eq(workItems.status, assignedWorkItem.status),
            eq(workItems.updatedAt, assignedWorkItem.updatedAt),
            notExists(submittedEvidence),
          )).returning();
          if (!savedWorkItem) return Response.json({ error: "งานนี้ถูกส่งตรวจหรือมีหลักฐานรอตรวจแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนแก้ความคืบหน้า" }, { status: 409 });
          return Response.json({ workItem: { ...savedWorkItem, points: savedWorkItem.points === 0 ? 0 : workPointValue(savedWorkItem.kind, savedWorkItem.priority, activePointRules) }, pointEntry: null });
        }

        const actorEmployeeId = currentUser.employeeId ?? "";
        const [actorEmployee] = actorEmployeeId ? await db.select().from(employees).where(and(eq(employees.id, actorEmployeeId), eq(employees.status, "active"))).limit(1) : [];
        if (!actorEmployee) return Response.json({ error: "บัญชีนี้ยังไม่ได้ผูกกับโปรไฟล์พนักงานที่ใช้งานอยู่" }, { status: 403 });
        const actorRole = findRole(actorEmployee.roleId);
        if (!actorRole) return Response.json({ error: "ไม่พบกรอบ KPI ที่ผูกกับพนักงาน กรุณาให้ HR ตรวจสอบ" }, { status: 409 });
        const actorDepartmentId = actorRole.departmentId;
        if (!actorDepartmentId) return Response.json({ error: "ไม่พบแผนกจากตำแหน่งพนักงาน กรุณาให้ HR ตรวจสอบ" }, { status: 409 });

        const rawTitle = typeof payload.title === "string" ? payload.title.trim() : "";
        if (payload.description !== undefined && typeof payload.description !== "string") return Response.json({ error: "รายละเอียดงานไม่ถูกต้อง" }, { status: 400 });
        const rawDescription = typeof payload.description === "string" ? payload.description.trim() : "";
        if (!rawTitle) return Response.json({ error: "กรุณาระบุชื่องาน" }, { status: 400 });
        if (rawTitle.length > 180) return Response.json({ error: "ชื่องานต้องไม่เกิน 180 ตัวอักษร" }, { status: 400 });
        if (rawDescription.length > 1200) return Response.json({ error: "รายละเอียดงานต้องไม่เกิน 1,200 ตัวอักษร" }, { status: 400 });
        const requestedPriority = payload.priority;
        if (requestedPriority !== undefined && requestedPriority !== "low" && requestedPriority !== "medium" && requestedPriority !== "high" && requestedPriority !== "urgent") {
          return Response.json({ error: "ระดับความสำคัญของงานไม่ถูกต้อง" }, { status: 400 });
        }
        const priority = requestedPriority ?? "medium" as const;
        const dueDate = typeof payload.dueDate === "string" ? payload.dueDate.trim() : "";
        const today = bangkokIsoDay();
        if (!isValidIsoDay(dueDate)) return Response.json({ error: "กรุณาระบุกำหนดส่งในรูปแบบ YYYY-MM-DD" }, { status: 400 });
        if (dueDate < today) return Response.json({ error: "กำหนดส่งต้องเป็นวันนี้หรือวันในอนาคต" }, { status: 400 });
        if (isoDayDistance(today, dueDate) > 180) return Response.json({ error: "กำหนดส่งงานได้ล่วงหน้าไม่เกิน 180 วัน" }, { status: 400 });

        const assigneeEmployeeId = typeof payload.assigneeEmployeeId === "string" ? payload.assigneeEmployeeId.trim() : "";
        const [assignee] = assigneeEmployeeId ? await db.select().from(employees).where(and(eq(employees.id, assigneeEmployeeId), eq(employees.status, "active"))).limit(1) : [];
        if (!assignee) return Response.json({ error: "กรุณาเลือกผู้รับผิดชอบที่กำลังใช้งานอยู่" }, { status: 400 });
        const assigneeRole = findRole(assignee.roleId);
        if (!assigneeRole) return Response.json({ error: "ไม่พบกรอบ KPI ของผู้รับผิดชอบ กรุณาให้ HR ตรวจสอบ" }, { status: 409 });
        if (assigneeRole.departmentId !== actorDepartmentId) return Response.json({ error: "พนักงานมอบหมายงานได้เฉพาะตนเองหรือเพื่อนร่วมแผนกเดียวกัน" }, { status: 403 });

        const [[creatorCoordinationQuota], [recipientCoordinationQuota]] = await Promise.all([
          db.select({
            creatorOpenCount: sql<number>`count(*)`,
            pairOpenCount: sql<number>`coalesce(sum(CASE WHEN ${workItems.assigneeEmployeeId} = ${assigneeEmployeeId} THEN 1 ELSE 0 END), 0)`,
          }).from(workItems).where(and(
            eq(workItems.createdByEmployeeId, actorEmployee.id),
            eq(workItems.points, 0),
            eq(workItems.kind, "request"),
            sql`${workItems.status} <> 'done'`,
          )),
          db.select({ recipientOpenCount: sql<number>`count(*)` }).from(workItems).where(and(
            eq(workItems.assigneeEmployeeId, assigneeEmployeeId),
            sql`${workItems.createdByEmployeeId} IS NOT NULL`,
            eq(workItems.points, 0),
            eq(workItems.kind, "request"),
            sql`${workItems.status} <> 'done'`,
          )),
        ]);
        if (Number(creatorCoordinationQuota?.creatorOpenCount ?? 0) >= EMPLOYEE_COORDINATION_OPEN_CREATOR_LIMIT) {
          return Response.json({ error: `คุณมีงานประสานที่ยังไม่เสร็จครบ ${EMPLOYEE_COORDINATION_OPEN_CREATOR_LIMIT} งานแล้ว กรุณาปิดงานเดิมก่อนสร้างงานใหม่` }, { status: 409 });
        }
        if (Number(creatorCoordinationQuota?.pairOpenCount ?? 0) >= EMPLOYEE_COORDINATION_OPEN_PAIR_LIMIT) {
          return Response.json({ error: `คุณมีงานประสานที่ยังไม่เสร็จให้พนักงานคนนี้ครบ ${EMPLOYEE_COORDINATION_OPEN_PAIR_LIMIT} งานแล้ว กรุณาปิดงานเดิมก่อนมอบหมายเพิ่ม` }, { status: 409 });
        }
        if (Number(recipientCoordinationQuota?.recipientOpenCount ?? 0) >= EMPLOYEE_COORDINATION_OPEN_RECIPIENT_LIMIT) {
          return Response.json({ error: `พนักงานคนนี้มีงานประสานที่ยังไม่เสร็จจากทุกคนครบ ${EMPLOYEE_COORDINATION_OPEN_RECIPIENT_LIMIT} งานแล้ว กรุณารอให้ปิดงานเดิมก่อนมอบหมายเพิ่ม` }, { status: 409 });
        }

        const now = new Date().toISOString();
        if (payload.projectId !== undefined && typeof payload.projectId !== "string") return Response.json({ error: "รหัสโปรเจกต์ไม่ถูกต้อง" }, { status: 400 });
        const requestedProjectId = typeof payload.projectId === "string" ? payload.projectId.trim() : "";
        let projectId = requestedProjectId;
        let teamProject: typeof projects.$inferInsert | null = null;
        if (requestedProjectId) {
          const [requestedProject] = await db.select().from(projects).where(eq(projects.id, requestedProjectId)).limit(1);
          if (!requestedProject) return Response.json({ error: "ไม่พบโปรเจกต์ที่เลือก" }, { status: 404 });
          if (requestedProject.departmentId !== actorDepartmentId) return Response.json({ error: "เลือกได้เฉพาะโปรเจกต์ของแผนกตนเอง" }, { status: 403 });
          if (requestedProject.status !== "planned" && requestedProject.status !== "active") return Response.json({ error: "โปรเจกต์ที่พักไว้หรือปิดแล้วไม่สามารถรับงานใหม่ได้" }, { status: 409 });
        } else {
          projectId = `project-team-${actorDepartmentId}`;
          const [existingTeamProject] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
          if (existingTeamProject && existingTeamProject.departmentId !== actorDepartmentId) return Response.json({ error: "โปรเจกต์งานภายในทีมมีข้อมูลแผนกไม่ตรงกัน กรุณาให้ HR ตรวจสอบ" }, { status: 409 });
          teamProject = {
            id: projectId,
            name: "งานภายในทีม",
            description: "งานและคำขอที่สมาชิกในแผนกมอบหมายให้กัน",
            ownerEmployeeId: existingTeamProject?.ownerEmployeeId ?? actorEmployee.id,
            departmentId: actorDepartmentId,
            status: "active",
            dueDate: existingTeamProject && existingTeamProject.dueDate > dueDate ? existingTeamProject.dueDate : dueDate,
            color: existingTeamProject?.color || "forest",
            createdAt: existingTeamProject?.createdAt ?? now,
            updatedAt: now,
          };
        }

        const workItem = {
          id: `work-${crypto.randomUUID()}`,
          projectId,
          assigneeEmployeeId,
          createdByEmployeeId: actorEmployee.id,
          kind: "request" as const,
          title: rawTitle,
          description: rawDescription,
          priority,
          status: "todo" as const,
          progress: 0,
          points: 0,
          dueDate,
          createdAt: now,
          updatedAt: now,
        };
        try {
          if (teamProject) {
            await db.batch([
              db.insert(projects).values(teamProject).onConflictDoUpdate({
                target: projects.id,
                set: { name: teamProject.name, description: teamProject.description, status: "active", dueDate: sql`CASE WHEN ${projects.dueDate} > ${teamProject.dueDate} THEN ${projects.dueDate} ELSE ${teamProject.dueDate} END`, color: teamProject.color, updatedAt: now },
              }),
              db.insert(workItems).values(workItem),
            ]);
          } else {
            await db.insert(workItems).values(workItem);
          }
        } catch (error) {
          if (error instanceof Error && error.message.includes("EMPLOYEE_WORK_OPEN_CREATOR_LIMIT")) return Response.json({ error: `คุณมีงานประสานที่ยังไม่เสร็จครบ ${EMPLOYEE_COORDINATION_OPEN_CREATOR_LIMIT} งานแล้ว กรุณาปิดงานเดิมก่อนสร้างงานใหม่` }, { status: 409 });
          if (error instanceof Error && error.message.includes("EMPLOYEE_WORK_OPEN_ASSIGNEE_LIMIT")) return Response.json({ error: `คุณมีงานประสานที่ยังไม่เสร็จให้พนักงานคนนี้ครบ ${EMPLOYEE_COORDINATION_OPEN_PAIR_LIMIT} งานแล้ว กรุณาปิดงานเดิมก่อนมอบหมายเพิ่ม` }, { status: 409 });
          if (error instanceof Error && error.message.includes("EMPLOYEE_WORK_OPEN_RECIPIENT_LIMIT")) return Response.json({ error: `พนักงานคนนี้มีงานประสานที่ยังไม่เสร็จจากทุกคนครบ ${EMPLOYEE_COORDINATION_OPEN_RECIPIENT_LIMIT} งานแล้ว กรุณารอให้ปิดงานเดิมก่อนมอบหมายเพิ่ม` }, { status: 409 });
          if (isUniqueConstraintError(error)) return Response.json({ error: "มีการสร้างงานนี้พร้อมกัน กรุณาลองใหม่" }, { status: 409 });
          throw error;
        }
        const [[savedWorkItem], [savedProject]] = await Promise.all([
          db.select().from(workItems).where(eq(workItems.id, workItem.id)).limit(1),
          db.select().from(projects).where(eq(projects.id, projectId)).limit(1),
        ]);
        if (!savedWorkItem || !savedProject) return internalApiError(new Error("Committed employee coordination work could not be reloaded"), "สร้างงานไม่สำเร็จ", "dashboard:employee-coordination");
        return Response.json({ workItem: savedWorkItem, project: savedProject, pointEntry: null, pointPolicy: "employee_request_no_points" });
      }
      const now = new Date().toISOString();
      const workItemId = payload.workItemId?.trim() || `work-${crypto.randomUUID()}`;
      const [existingWorkItem] = payload.workItemId ? await db.select().from(workItems).where(eq(workItems.id, workItemId)).limit(1) : [];
      if (payload.workItemId && !existingWorkItem) return Response.json({ error: "ไม่พบงานที่ต้องการแก้ไข" }, { status: 404 });
      if (existingWorkItem && !(await canAccessEmployee(currentUser, existingWorkItem.assigneeEmployeeId))) return Response.json({ error: "ไม่มีสิทธิ์แก้ไขงานนี้" }, { status: 403 });
      if (existingWorkItem && (existingWorkItem.status === "review" || existingWorkItem.status === "done")) return Response.json({ error: "งานที่ส่งตรวจหรือปิดแล้วไม่สามารถแก้ไขได้" }, { status: 409 });
      const projectId = payload.projectId ?? existingWorkItem?.projectId ?? "";
      const assigneeEmployeeId = payload.assigneeEmployeeId ?? existingWorkItem?.assigneeEmployeeId ?? "";
      const title = payload.title?.trim().slice(0, 180) || existingWorkItem?.title || "";
      const kind: "task" | "request" | "mission" = payload.kind === "request" || payload.kind === "mission" || payload.kind === "task" ? payload.kind : existingWorkItem?.kind ?? "task";
      const priority: "low" | "medium" | "high" | "urgent" = payload.priority === "low" || payload.priority === "medium" || payload.priority === "high" || payload.priority === "urgent" ? payload.priority : existingWorkItem?.priority ?? "medium";
      const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(payload.dueDate ?? "") ? payload.dueDate as string : existingWorkItem?.dueDate ?? now.slice(0, 10);
      if (existingWorkItem) {
        const [existingSubmission] = await db.select({ id: workSubmissions.id }).from(workSubmissions).where(eq(workSubmissions.workItemId, existingWorkItem.id)).limit(1);
        const changesFrozenTerms = projectId !== existingWorkItem.projectId
          || assigneeEmployeeId !== existingWorkItem.assigneeEmployeeId
          || kind !== existingWorkItem.kind
          || priority !== existingWorkItem.priority
          || dueDate !== existingWorkItem.dueDate;
        if (existingSubmission && changesFrozenTerms) return Response.json({ error: "งานที่เคยส่งหลักฐานแล้วห้ามเปลี่ยนโปรเจกต์ ผู้รับผิดชอบ ประเภทงาน ความสำคัญ หรือกำหนดส่ง" }, { status: 409 });
      }
      const [[project], [assignee]] = await Promise.all([
        db.select().from(projects).where(eq(projects.id, projectId)).limit(1),
        db.select({ id: employees.id, roleId: employees.roleId }).from(employees).where(and(eq(employees.id, assigneeEmployeeId), eq(employees.status, "active"))).limit(1),
      ]);
      if (!title || !project || !assignee) return Response.json({ error: "กรุณาระบุชื่องาน โปรเจกต์ และผู้รับผิดชอบที่กำลังใช้งานอยู่" }, { status: 400 });
      if (!(await canAccessEmployee(currentUser, assigneeEmployeeId))) return Response.json({ error: "ไม่มีสิทธิ์มอบหมายงานให้พนักงานคนนี้" }, { status: 403 });
      if (currentUser.role === "manager") {
        const assigneeDepartmentId = findRole(assignee.roleId)?.departmentId ?? "";
        if (project.departmentId !== currentUser.departmentId || assigneeDepartmentId !== currentUser.departmentId || !(await canAccessEmployee(currentUser, project.ownerEmployeeId))) {
          return Response.json({ error: "หัวหน้าทีมมอบหมายงานได้เฉพาะในโปรเจกต์และแผนกของตนเอง" }, { status: 403 });
        }
      }
      if ((!existingWorkItem || projectId !== existingWorkItem.projectId) && project.status !== "planned" && project.status !== "active") {
        return Response.json({ error: "โปรเจกต์ที่พักหรือปิดแล้วไม่สามารถรับงานใหม่ได้" }, { status: 409 });
      }
      const requestedStatus = payload.status ?? existingWorkItem?.status ?? "todo";
      if (requestedStatus !== "todo" && requestedStatus !== "in_progress") {
        return Response.json({ error: "สถานะรอตรวจเกิดจากการส่งหลักฐาน และสถานะเสร็จแล้วเกิดจากผู้ตรวจอนุมัติเท่านั้น" }, { status: 400 });
      }
      const status = requestedStatus;
      const requestedProgress = payload.progress === undefined ? existingWorkItem?.progress ?? 0 : Number(payload.progress);
      const progress = status === "todo"
        ? Math.min(20, Math.max(0, Math.round(Number.isFinite(requestedProgress) ? requestedProgress : 0)))
        : Math.min(90, Math.max(1, Math.round(Number.isFinite(requestedProgress) ? requestedProgress : 1)));
      const workItem = {
        id: existingWorkItem?.id ?? workItemId,
        projectId,
        assigneeEmployeeId,
        createdByEmployeeId: existingWorkItem?.createdByEmployeeId ?? currentUser.employeeId ?? null,
        kind,
        title,
        description: payload.description === undefined ? existingWorkItem?.description ?? "" : payload.description.trim().slice(0, 1200),
        priority,
        status,
        progress,
        points: existingWorkItem?.points === 0 ? 0 : workPointValue(kind, priority, activePointRules),
        dueDate,
        createdAt: existingWorkItem?.createdAt ?? now,
        updatedAt: now,
      };
      try {
        if (existingWorkItem) {
          const submittedEvidence = db.select({ id: workSubmissions.id }).from(workSubmissions).where(and(eq(workSubmissions.workItemId, existingWorkItem.id), eq(workSubmissions.status, "submitted")));
          const [savedWorkItem] = await db.update(workItems).set({ projectId: workItem.projectId, assigneeEmployeeId: workItem.assigneeEmployeeId, kind: workItem.kind, title: workItem.title, description: workItem.description, priority: workItem.priority, status: workItem.status, progress: workItem.progress, points: workItem.points, dueDate: workItem.dueDate, updatedAt: now }).where(and(
            eq(workItems.id, existingWorkItem.id),
            eq(workItems.status, existingWorkItem.status),
            eq(workItems.updatedAt, existingWorkItem.updatedAt),
            notExists(submittedEvidence),
          )).returning();
          if (!savedWorkItem) return Response.json({ error: "งานนี้ถูกส่งตรวจหรือมีหลักฐานรอตรวจแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนแก้ไข" }, { status: 409 });
          return Response.json({ workItem: savedWorkItem, pointEntry: null, pointPolicy: "award_after_approved_evidence" });
        }
        await db.insert(workItems).values(workItem);
      } catch (error) {
        if (error instanceof Error && error.message.includes("WORK_ITEM_TERMS_LOCKED")) return Response.json({ error: "มีการส่งหลักฐานระหว่างแก้ไขงาน เงื่อนไขงานจึงถูกล็อกแล้ว กรุณาโหลดข้อมูลล่าสุด" }, { status: 409 });
        if (isUniqueConstraintError(error)) return Response.json({ error: "มีการสร้างหรือแก้ไขงานรหัสนี้พร้อมกัน กรุณาโหลดข้อมูลล่าสุด" }, { status: 409 });
        throw error;
      }

      return Response.json({ workItem, pointEntry: null, pointPolicy: "award_after_approved_evidence" });
    }

    if (payload.action === "reviewWorkSubmission") {
      const submissionId = payload.submissionId ?? "";
      const status = payload.status;
      if (status !== "approved" && status !== "revision") return Response.json({ error: "สถานะตรวจหลักฐานไม่ถูกต้อง" }, { status: 400 });
      const [submission] = await db.select().from(workSubmissions).where(eq(workSubmissions.id, submissionId)).limit(1);
      if (!submission) return Response.json({ error: "ไม่พบหลักฐานงานที่เลือก" }, { status: 404 });
      if (submission.status !== "submitted") return Response.json({ error: "หลักฐานรายการนี้ถูกตรวจแล้ว ไม่สามารถเปลี่ยนผลตรวจหรือให้ Points ซ้ำได้" }, { status: 409 });
      const [workItem] = await db.select().from(workItems).where(eq(workItems.id, submission.workItemId)).limit(1);
      if (!workItem) return Response.json({ error: "ไม่พบงานของหลักฐานรายการนี้" }, { status: 404 });
      if (submission.employeeId !== workItem.assigneeEmployeeId) return Response.json({ error: "ข้อมูลผู้ส่งหลักฐานไม่ตรงกับผู้รับผิดชอบงาน กรุณาให้ HR ตรวจสอบ" }, { status: 409 });
      if (workItem.status !== "review") return Response.json({ error: "งานนี้ไม่ได้อยู่ในสถานะรอตรวจ จึงยังตรวจหลักฐานไม่ได้" }, { status: 409 });
      if (!(await canAccessEmployee(currentUser, workItem.assigneeEmployeeId))) return Response.json({ error: "ไม่มีสิทธิ์ตรวจผลงานนี้" }, { status: 403 });
      if (currentUser.employeeId === workItem.assigneeEmployeeId) return Response.json({ error: "ผู้รับผิดชอบงานไม่สามารถตรวจหรืออนุมัติผลงานของตนเองได้ กรุณาให้ผู้ตรวจคนอื่นหรือ HR ดำเนินการ" }, { status: 403 });
      const submissionDate = bangkokIsoDayFromTimestamp(submission.submittedAt) ?? bangkokIsoDay();
      const awardsPoints = status === "approved" && workItem.points > 0;
      const { policy: workPointPolicy, rules: workPointPolicyRules } = pointPolicyFromRows(pointPolicyRows, submissionDate);
      if (awardsPoints && !workPointPolicy) return Response.json({ error: "ไม่มีกติกา Points ที่ประกาศใช้ในวันที่ส่งงาน จึงยังอนุมัติผลงานไม่ได้" }, { status: 409 });
      if (awardsPoints && workPointPolicy && (!workPointPolicy.contentHash || workPointPolicy.contentHash !== await policyIntegrityHash(workPointPolicy))) {
        return Response.json({ error: "ตรวจสอบความถูกต้องของกติกา Points ที่ใช้ในวันที่ส่งงานไม่ผ่าน กรุณาให้ HR ประกาศฉบับแก้ไขก่อนอนุมัติ" }, { status: 409 });
      }
      const now = new Date().toISOString();
      const actor = authenticatedActor(currentUser);
      const reviewerNote = payload.reviewerNote?.trim().slice(0, 1000) ?? "";
      const completionMonth = submissionDate.slice(0, 7);
      const [employeeLedgerRows, employeePointEventRows, employeeCapClaimRows] = await Promise.all([
        awardsPoints ? db.select().from(pointLedger).where(eq(pointLedger.employeeId, workItem.assigneeEmployeeId)) : Promise.resolve([]),
        awardsPoints ? db.select().from(pointEvents).where(eq(pointEvents.employeeId, workItem.assigneeEmployeeId)) : Promise.resolve([]),
        db.select({ id: pointCapClaims.id }).from(pointCapClaims).where(and(eq(pointCapClaims.employeeId, workItem.assigneeEmployeeId), eq(pointCapClaims.claimMonth, completionMonth))),
      ]);
      const reviewedSubmission = { ...submission, status, reviewedBy: actor.name, reviewedAt: now, reviewerNote };
      const balancedWorkPoints = status === "approved" ? awardsPoints ? workPointValue(workItem.kind, workItem.priority, workPointPolicyRules) : 0 : workItem.points;
      const updatedWorkItem = status === "approved"
        ? { ...workItem, points: balancedWorkPoints, status: "done" as const, progress: 100, updatedAt: now }
        : { ...workItem, points: balancedWorkPoints, status: "in_progress" as const, progress: Math.min(90, workItem.progress), updatedAt: now };

      let pointEntry = null;
      let deadlinePointEntry = null;
      let deadlinePointEvent = null;
      let pointCapMessage: string | null = null;
      const policyMetadata = pointPolicyMetadata(awardsPoints ? workPointPolicy : null);
      const pointCapClaim = {
        id: `point-cap-claim-${crypto.randomUUID()}`,
        employeeId: workItem.assigneeEmployeeId,
        claimMonth: completionMonth,
        sourceType: status === "approved" ? "work_approval" : "work_revision",
        sourceId: status === "approved" ? workItem.id : submission.id,
        employeeMonthSequenceKey: `${workItem.assigneeEmployeeId}:${completionMonth}:${employeeCapClaimRows.length}`,
        createdAt: now,
      };

      if (status === "revision") {
        try {
          await db.batch([
            db.insert(pointCapClaims).values(pointCapClaim),
            db.update(workSubmissions).set({ status, reviewedBy: actor.name, reviewedAt: now, reviewerNote }).where(and(eq(workSubmissions.id, submissionId), eq(workSubmissions.status, "submitted"))),
            db.update(workItems).set({ status: updatedWorkItem.status, progress: updatedWorkItem.progress, points: balancedWorkPoints, updatedAt: now }).where(and(eq(workItems.id, workItem.id), eq(workItems.status, "review"))),
          ]);
        } catch (error) {
          if (isUniqueConstraintError(error)) return Response.json({ error: "มีการตรวจงานของพนักงานคนนี้พร้อมกัน กรุณาโหลดข้อมูลล่าสุดแล้วลองใหม่" }, { status: 409 });
          throw error;
        }
        return Response.json({ workSubmission: reviewedSubmission, workItem: updatedWorkItem, pointEntry, deadlinePointEntry, deadlinePointEvent, pointCapMessage });
      }

      const workPointEconomyPolicy = workPointPolicyRules.economy;
      const existingWorkPoint = employeeLedgerRows.find((entry) => (entry.sourceType === "task" || entry.sourceType === "mission") && entry.sourceId === workItem.id);
      const workPointsThisMonth = employeeLedgerRows.filter((entry) => (entry.sourceType === "task" || entry.sourceType === "mission") && bangkokMonthFromTimestamp(entry.createdAt) === completionMonth && entry.points > 0).reduce((sum, entry) => sum + entry.points, 0);
      const positiveEventsThisMonth = employeePointEventRows.filter((event) => event.eventDate.startsWith(completionMonth) && event.eventType !== "monthly_evaluation" && event.points > 0).reduce((sum, event) => sum + event.points, 0);
      const workCapRemaining = Math.max(0, workPointEconomyPolicy.workAwardsMonthlyCap - workPointsThisMonth);
      const standardCapRemaining = Math.max(0, workPointEconomyPolicy.standardEarnMonthlyCap - workPointsThisMonth - positiveEventsThisMonth);
      const approvedWorkPoints = awardsPoints ? existingWorkPoint ? existingWorkPoint.points : balancedWorkPoints <= workCapRemaining && balancedWorkPoints <= standardCapRemaining ? balancedWorkPoints : 0 : 0;
      if (awardsPoints && !existingWorkPoint && approvedWorkPoints < balancedWorkPoints) {
        pointCapMessage = `งานผ่านแล้ว แต่พักการมอบ Points สำหรับรายการนี้ไว้ เพราะครบเพดาน Points จากงาน ${workPointEconomyPolicy.workAwardsMonthlyCap} Points ต่อเดือน หรือเพดาน Points บวกมาตรฐาน ${workPointEconomyPolicy.standardEarnMonthlyCap} Points ระบบไม่ให้ Points บางส่วน`;
      }
      const sourceType = workItem.kind === "mission" ? "mission" as const : "task" as const;
      const pointId = `points-${workItem.id}`;
      const newWorkPointEntry = !existingWorkPoint && approvedWorkPoints > 0 ? { id: pointId, employeeId: workItem.assigneeEmployeeId, sourceType, sourceId: workItem.id, points: approvedWorkPoints, note: `อนุมัติหลักฐานและปิด${workItem.kind === "mission" ? "ภารกิจ" : "งาน"}: ${workItem.title}`, ...policyMetadata, createdAt: submission.submittedAt } : null;

      let newDeadlineEvent: typeof pointEvents.$inferInsert | null = null;
      let newDeadlinePointEntry: typeof pointLedger.$inferInsert | null = null;
      if (awardsPoints && submissionDate <= workItem.dueDate) {
        const eventType = submissionDate < workItem.dueDate ? "early_finish" as const : "on_time_finish" as const;
        const rule = workPointPolicyRules.events[eventType];
        const eventId = `point-event-deadline-${workItem.id}`;
        const existingDeadlineEvent = employeePointEventRows.find((event) => event.id === eventId);
        const existingDeadlinePointEntry = employeeLedgerRows.find((entry) => entry.id === `points-deadline-${workItem.id}`);
        const deadlinePointsThisMonth = employeePointEventRows.filter((event) => (event.eventType === "early_finish" || event.eventType === "on_time_finish") && event.eventDate.startsWith(completionMonth) && event.points > 0).reduce((sum, event) => sum + event.points, 0);
        const deadlinePoints = rule.points ?? 0;
        const mayAwardDeadline = Boolean(existingDeadlineEvent || existingDeadlinePointEntry) || (deadlinePointsThisMonth + deadlinePoints <= workPointEconomyPolicy.deadlineBonusMonthlyCap && workPointsThisMonth + positiveEventsThisMonth + approvedWorkPoints + deadlinePoints <= workPointEconomyPolicy.standardEarnMonthlyCap);
        if (mayAwardDeadline) {
          const event = { id: eventId, employeeId: workItem.assigneeEmployeeId, eventType, points: deadlinePoints, eventDate: submissionDate, note: `${withPointsDisplayTerminology(rule.label)}: ${workItem.title}`, evidenceUrl: submission.linkUrl, recordedBy: actor.name, ...policyMetadata, createdAt: now };
          const entry = { id: `points-deadline-${workItem.id}`, employeeId: workItem.assigneeEmployeeId, sourceType: "deadline" as const, sourceId: `deadline-${workItem.id}`, points: deadlinePoints, note: event.note, ...policyMetadata, createdAt: now };
          newDeadlineEvent = existingDeadlineEvent ? null : event;
          newDeadlinePointEntry = existingDeadlinePointEntry ? null : entry;
        } else {
          pointCapMessage = [pointCapMessage, `งานผ่านแล้ว แต่ไม่ได้โบนัสกำหนดส่งเพิ่ม เพราะครบเพดาน ${workPointEconomyPolicy.deadlineBonusMonthlyCap} Points ต่อเดือน`].filter(Boolean).join(" · ");
        }
      }

      try {
        await db.batch([
          db.insert(pointCapClaims).values(pointCapClaim),
          db.update(workSubmissions).set({ status, reviewedBy: actor.name, reviewedAt: now, reviewerNote }).where(and(eq(workSubmissions.id, submissionId), eq(workSubmissions.status, "submitted"))),
          db.update(workItems).set({ status: updatedWorkItem.status, progress: updatedWorkItem.progress, points: balancedWorkPoints, updatedAt: now }).where(and(eq(workItems.id, workItem.id), eq(workItems.status, "review"))),
          ...(newWorkPointEntry ? [db.insert(pointLedger).values(newWorkPointEntry)] : []),
          ...(newDeadlineEvent ? [db.insert(pointEvents).values(newDeadlineEvent)] : []),
          ...(newDeadlinePointEntry ? [db.insert(pointLedger).values(newDeadlinePointEntry)] : []),
        ]);
      } catch (error) {
        if (isUniqueConstraintError(error)) return Response.json({ error: "มีการตรวจงานหรือคำนวณเพดาน Points ของพนักงานคนนี้พร้อมกัน กรุณาโหลดข้อมูลล่าสุดแล้วลองใหม่" }, { status: 409 });
        throw error;
      }
      if (awardsPoints) {
        pointEntry = (await db.select().from(pointLedger).where(eq(pointLedger.id, pointId)).limit(1))[0] ?? null;
        deadlinePointEvent = (await db.select().from(pointEvents).where(eq(pointEvents.id, `point-event-deadline-${workItem.id}`)).limit(1))[0] ?? null;
        deadlinePointEntry = (await db.select().from(pointLedger).where(eq(pointLedger.id, `points-deadline-${workItem.id}`)).limit(1))[0] ?? null;
      }
      return Response.json({ workSubmission: reviewedSubmission, workItem: updatedWorkItem, pointEntry, deadlinePointEntry, deadlinePointEvent, pointCapMessage });
    }

    if (payload.action === "recordPointEvent") {
      const employeeId = payload.employeeId ?? "";
      if (!(await canAccessEmployee(currentUser, employeeId))) return Response.json({ error: "ไม่มีสิทธิ์บันทึก Points ให้พนักงานคนนี้" }, { status: 403 });
      if (currentUser.employeeId === employeeId) return Response.json({ error: "ผู้ใช้ไม่สามารถให้หรือหัก Points ของตนเองได้ กรุณาให้ HR คนอื่นเป็นผู้ตรวจสอบ" }, { status: 403 });
      const eventType = payload.eventType;
      const eventDate = /^\d{4}-\d{2}-\d{2}$/.test(payload.eventDate ?? "") ? payload.eventDate as string : "";
      const note = payload.note?.trim().slice(0, 1000) ?? "";
      const evidenceUrl = payload.evidenceUrl?.trim().slice(0, 1200) ?? "";
      if (!eventDate || !note) return Response.json({ error: "กรุณาระบุวันที่และเหตุผลของรายการ Points" }, { status: 400 });
      const today = bangkokIsoDay();
      if (eventDate > today) return Response.json({ error: "ไม่สามารถบันทึกเหตุการณ์ Points ล่วงหน้าได้" }, { status: 400 });
      const maximumBackdateDays = currentUser.role === "admin" ? 90 : 7;
      if (isoDayDistance(eventDate, today) > maximumBackdateDays) return Response.json({ error: `${currentUser.role === "admin" ? "HR" : "หัวหน้าทีม"} บันทึกย้อนหลังได้ไม่เกิน ${maximumBackdateDays} วัน` }, { status: 409 });
      if (!isSafeOptionalUrl(evidenceUrl)) return Response.json({ error: "ลิงก์หลักฐานต้องขึ้นต้นด้วย http:// หรือ https://" }, { status: 400 });
      const [employee] = await db.select({ id: employees.id }).from(employees).where(and(eq(employees.id, employeeId), eq(employees.status, "active"))).limit(1);
      if (!employee) return Response.json({ error: "ไม่พบพนักงานที่เลือก" }, { status: 404 });
      const { policy: eventPointPolicy, rules: eventPointPolicyRules } = pointPolicyFromRows(pointPolicyRows, eventDate);
      if (!eventPointPolicy) return Response.json({ error: "ไม่มีกติกา Points ที่ประกาศใช้สำหรับวันที่เกิดเหตุการณ์ จึงยังบันทึก Points ไม่ได้" }, { status: 409 });
      if (!eventPointPolicy.contentHash || eventPointPolicy.contentHash !== await policyIntegrityHash(eventPointPolicy)) return Response.json({ error: "ตรวจสอบความถูกต้องของกติกา Points ในวันที่เกิดเหตุการณ์ไม่ผ่าน กรุณาให้ HR ตรวจสอบก่อนบันทึก" }, { status: 409 });
      const historicalPointEventRules = eventPointPolicyRules.events;
      const eventPointEconomyPolicy = eventPointPolicyRules.economy;
      const eventMonth = eventDate.slice(0, 7);
      if (!eventType || !(eventType in historicalPointEventRules) || eventType === "monthly_evaluation") return Response.json({ error: "ประเภทเหตุการณ์ Points ไม่ถูกต้อง" }, { status: 400 });
      if (eventType === "quest") {
        return Response.json({ error: "Points จากเควสต้องตรวจหลักฐานและมอบสิทธิ์จากศูนย์เควสเท่านั้น" }, { status: 409 });
      }
      const rule = historicalPointEventRules[eventType];
      if (rule.points === null) return Response.json({ error: "รายการนี้ต้องประมวลผลจากรอบประเมิน" }, { status: 400 });
      const ruleLabel = withPointsDisplayTerminology(rule.label);
      if (rule.entryMode !== "manual") return Response.json({ error: `${ruleLabel} เป็นรายการอัตโนมัติ ระบบจะบันทึกหลังตรวจหลักฐานหรือประมวลผลรอบเท่านั้น` }, { status: 409 });
      if (currentUser.role === "employee" || !rule.authorizedRoles.includes(currentUser.role)) return Response.json({ error: `${ruleLabel} ต้องดำเนินการโดย ${rule.authorizedRoles.includes("admin") && rule.authorizedRoles.length === 1 ? "HR เท่านั้น" : "หัวหน้าทีมหรือ HR"}` }, { status: 403 });
      if (rule.requiresEvidence && !evidenceUrl) return Response.json({ error: `${ruleLabel} ต้องแนบลิงก์หลักฐานก่อนบันทึก Points` }, { status: 400 });
      const [employeeEventRows, employeeLedgerRows, employeeCapClaimRows] = await Promise.all([
        db.select().from(pointEvents).where(eq(pointEvents.employeeId, employeeId)),
        db.select().from(pointLedger).where(eq(pointLedger.employeeId, employeeId)),
        db.select({ id: pointCapClaims.id }).from(pointCapClaims).where(and(eq(pointCapClaims.employeeId, employeeId), eq(pointCapClaims.claimMonth, eventMonth))),
      ]);
      const attendanceTypes: PointEventType[] = ["attendance_on_time", "attendance_late", "absence", "approved_leave"];
      if (attendanceTypes.includes(eventType)) {
        const [attendanceRecord] = await db.select().from(attendanceRecords).where(and(eq(attendanceRecords.employeeId, employeeId), eq(attendanceRecords.workDate, eventDate))).limit(1);
        const expectedAttendanceStatus = eventType === "attendance_on_time" ? "present" : eventType === "attendance_late" ? "late" : eventType === "absence" ? "absent" : "leave";
        const approvalMatches = eventType === "approved_leave" ? attendanceRecord?.approvalStatus === "approved" : attendanceRecord?.approvalStatus === "not_required" || attendanceRecord?.approvalStatus === "approved";
        if (!attendanceRecord || attendanceRecord.status !== expectedAttendanceStatus || !approvalMatches) {
          return Response.json({ error: "รายการ Points เวลาเข้างานต้องตรงกับข้อมูลลงเวลาและสถานะอนุมัติของวันนั้น" }, { status: 409 });
        }
      }
      if (attendanceTypes.includes(eventType) && employeeEventRows.some((event) => attendanceTypes.includes(event.eventType) && event.eventDate === eventDate)) {
        return Response.json({ error: "วันนี้มีรายการเวลาเข้างานของพนักงานคนนี้แล้ว จึงไม่สามารถรับหรือหัก Points ซ้ำได้" }, { status: 409 });
      }
      if (eventType === "attendance_on_time" && employeeEventRows.filter((event) => event.eventType === "attendance_on_time" && event.eventDate.startsWith(eventMonth)).length >= eventPointEconomyPolicy.attendanceDaysPerMonth) {
        return Response.json({ error: `Points จากการเข้างานตรงเวลาครบเพดาน ${eventPointEconomyPolicy.attendanceDaysPerMonth} วันของเดือนนี้แล้ว` }, { status: 409 });
      }
      const disciplineTypes: PointEventType[] = ["warning", "rule_violation"];
      if (disciplineTypes.includes(eventType) && employeeEventRows.some((event) => disciplineTypes.includes(event.eventType) && event.eventDate === eventDate)) {
        return Response.json({ error: "วันนี้มีรายการวินัยแล้ว ไม่สามารถหัก Points ด้านวินัยซ้ำในวันเดียวกันได้" }, { status: 409 });
      }
      if (eventType === "bonus" && employeeEventRows.filter((event) => event.eventType === eventType && event.eventDate.startsWith(eventDate.slice(0, 7))).length >= eventPointEconomyPolicy.positiveManualEventsPerMonth) {
        return Response.json({ error: `${ruleLabel} ให้ได้สูงสุด ${eventPointEconomyPolicy.positiveManualEventsPerMonth} ครั้งต่อเดือน` }, { status: 409 });
      }
      const negativePointsThisMonth = employeeEventRows.filter((event) => event.eventDate.startsWith(eventMonth) && event.points < 0).reduce((sum, event) => sum + Math.abs(event.points), 0);
      if (rule.points < 0 && negativePointsThisMonth + Math.abs(rule.points) > eventPointEconomyPolicy.negativePointsPerMonthCap) {
        return Response.json({ error: `Points ลบเดือนนี้ถึงเพดาน ${eventPointEconomyPolicy.negativePointsPerMonthCap} Points แล้ว ให้ใช้กระบวนการ HR และการอุทธรณ์แทนการหักเพิ่ม` }, { status: 409 });
      }
      const positiveEventsThisMonth = employeeEventRows.filter((event) => event.eventDate.startsWith(eventMonth) && event.eventType !== "monthly_evaluation" && event.points > 0).reduce((sum, event) => sum + event.points, 0);
      const workAwardsThisMonth = employeeLedgerRows.filter((entry) => (entry.sourceType === "task" || entry.sourceType === "mission") && bangkokMonthFromTimestamp(entry.createdAt) === eventMonth && entry.points > 0).reduce((sum, entry) => sum + entry.points, 0);
      if (rule.points > 0 && positiveEventsThisMonth + workAwardsThisMonth + rule.points > eventPointEconomyPolicy.standardEarnMonthlyCap) {
        return Response.json({ error: `Points บวกมาตรฐานเดือนนี้ถึงเพดาน ${eventPointEconomyPolicy.standardEarnMonthlyCap} Points แล้ว` }, { status: 409 });
      }
      const actor = authenticatedActor(currentUser);
      const now = new Date().toISOString();
      const eventId = `point-event-${crypto.randomUUID()}`;
      const policyMetadata = pointPolicyMetadata(eventPointPolicy);
      const pointEvent = { id: eventId, employeeId, eventType, points: rule.points, eventDate, note, evidenceUrl, recordedBy: actor.name, ...policyMetadata, createdAt: now };
      const pointEntry = { id: `points-${eventId}`, employeeId, sourceType: rule.sourceType, sourceId: eventId, points: rule.points, note: `${ruleLabel}: ${note}`, ...policyMetadata, createdAt: now };
      const mutationClaim = {
        id: `point-mutation-claim-${crypto.randomUUID()}`,
        pointEventId: eventId,
        employeeId,
        predecessorEventCount: employeeEventRows.length,
        employeeSequenceKey: `${employeeId}:event-count:${employeeEventRows.length}`,
        createdAt: now,
      };
      const capClaim = {
        id: `point-cap-claim-${crypto.randomUUID()}`,
        employeeId,
        claimMonth: eventMonth,
        sourceType: "manual_point_event",
        sourceId: eventId,
        employeeMonthSequenceKey: `${employeeId}:${eventMonth}:${employeeCapClaimRows.length}`,
        createdAt: now,
      };
      try {
        await db.batch([
          db.insert(pointEvents).values(pointEvent),
          db.insert(pointMutationClaims).values(mutationClaim),
          db.insert(pointCapClaims).values(capClaim),
          db.insert(pointLedger).values(pointEntry),
        ]);
      } catch (error) {
        if (isUniqueConstraintError(error)) return Response.json({ error: "มีการบันทึก Points ของพนักงานคนนี้พร้อมกัน กรุณาโหลดข้อมูลล่าสุดเพื่อตรวจเพดานแล้วลองใหม่" }, { status: 409 });
        throw error;
      }
      return Response.json({ pointEvent, pointEntry }, { status: 201 });
    }

    if (payload.action === "runMonthlyPointCycle") {
      const month = /^\d{4}-\d{2}$/.test(payload.month ?? "") ? payload.month as string : bangkokIsoDay().slice(0, 7);
      const selectedPeriod = payload.period ?? periods[0];
      const monthlyEventDate = `${month}-01`;
      const { policy: monthlyPointPolicy, rules: monthlyPointPolicyRules } = pointPolicyFromRows(pointPolicyRows, monthlyEventDate);
      if (!monthlyPointPolicy) return Response.json({ error: "ไม่มีกติกา Points ที่ประกาศใช้สำหรับเดือนนี้ จึงยังประมวลผล Points ไม่ได้" }, { status: 409 });
      if (!monthlyPointPolicy.contentHash || monthlyPointPolicy.contentHash !== await policyIntegrityHash(monthlyPointPolicy)) return Response.json({ error: "ตรวจสอบความถูกต้องของกติกา Points สำหรับรอบเดือนนี้ไม่ผ่าน กรุณาให้ HR ตรวจสอบก่อนประมวลผล" }, { status: 409 });
      const monthlyPointEconomyPolicy = monthlyPointPolicyRules.economy;
      const [evaluationRows, activeEmployeeRows] = await Promise.all([
        db.select().from(evaluations).where(eq(evaluations.period, selectedPeriod)),
        db.select({ id: employees.id }).from(employees).where(eq(employees.status, "active")),
      ]);
      const activeIds = new Set(activeEmployeeRows.map((employee) => employee.id));
      const eligible = evaluationRows.filter((evaluation) => activeIds.has(evaluation.employeeId) && evaluation.totalScore >= monthlyPointEconomyPolicy.monthlyEvaluationMinimumScore);
      if (!eligible.length) return Response.json({ error: `ยังไม่มีผลประเมินที่ผ่านเกณฑ์ ${monthlyPointEconomyPolicy.monthlyEvaluationMinimumScore} คะแนน` }, { status: 409 });
      const [existingMonthlyEvents, existingEvaluationLedger] = await Promise.all([
        db.select({ id: pointEvents.id }).from(pointEvents).where(and(eq(pointEvents.eventDate, monthlyEventDate), eq(pointEvents.eventType, "monthly_evaluation"))),
        db.select({ id: pointLedger.id }).from(pointLedger).where(eq(pointLedger.sourceType, "evaluation")),
      ]);
      const existingEventIds = new Set(existingMonthlyEvents.map((event) => event.id));
      const existingLedgerIds = new Set(existingEvaluationLedger.map((entry) => entry.id));
      const pendingEligible = eligible.filter((evaluation) => !existingEventIds.has(`point-event-monthly-evaluation-${month}:${evaluation.employeeId}`) || !existingLedgerIds.has(`points-monthly-evaluation-${month}:${evaluation.employeeId}`));
      if (!pendingEligible.length) {
        return Response.json({ error: "เดือนนี้ประมวลผล Points จากผลประเมินครบแล้ว ไม่สามารถบันทึกซ้ำได้" }, { status: 409 });
      }
      const actor = authenticatedActor(currentUser);
      const now = new Date().toISOString();
      const pointEntryRows: PointLedgerRecord[] = [];
      const pointEventRows: PointEventRecord[] = [];
      const policyMetadata = pointPolicyMetadata(monthlyPointPolicy);
      for (const evaluation of pendingEligible) {
        const monthlyPoints = monthlyEvaluationPoints(evaluation.totalScore, monthlyPointPolicyRules);
        const monthlySourceId = `monthly-evaluation-${month}:${evaluation.employeeId}`;
        const event = {
          id: `point-event-${monthlySourceId}`,
          employeeId: evaluation.employeeId,
          eventType: "monthly_evaluation" as const,
          points: monthlyPoints,
          eventDate: monthlyEventDate,
          note: `Points จากผลประเมินประจำเดือน ${month} จาก ${selectedPeriod} · คะแนนรวม ${evaluation.totalScore}`,
          evidenceUrl: "",
          recordedBy: actor.name,
          ...policyMetadata,
          createdAt: now,
        };
        const entry = {
          id: `points-${monthlySourceId}`,
          employeeId: evaluation.employeeId,
          sourceType: "evaluation" as const,
          sourceId: monthlySourceId,
          points: monthlyPoints,
          note: event.note,
          ...policyMetadata,
          createdAt: now,
        };
        await db.batch([
          db.insert(pointEvents).values(event).onConflictDoNothing(),
          db.insert(pointLedger).values(entry).onConflictDoNothing(),
        ]);
        pointEventRows.push(event);
        pointEntryRows.push(entry);
      }
      return Response.json({ pointEvents: pointEventRows, pointEntries: pointEntryRows, month, count: pendingEligible.length });
    }

    if (payload.action === "saveQuest") {
      const questId = typeof payload.questId === "string" ? payload.questId.trim().slice(0, 160) : "";
      const [sourceQuest] = questId
        ? await db.select().from(quests).where(eq(quests.id, questId)).limit(1)
        : [];
      if (questId && !sourceQuest) return Response.json({ error: "ไม่พบเควสที่เลือก" }, { status: 404 });
      if (sourceQuest?.status === "archived") return Response.json({ error: "เควสที่ลบแล้วเป็นประวัติถาวรและไม่สามารถแก้ไขได้" }, { status: 409 });

      const sourceTargetRows = sourceQuest
        ? await db.select().from(questTargets).where(eq(questTargets.questId, sourceQuest.id))
        : [];
      const title = typeof payload.title === "string" ? payload.title.trim() : sourceQuest?.title ?? "";
      const description = typeof payload.description === "string" ? payload.description.trim() : sourceQuest?.description ?? "";
      const type = payload.type ?? sourceQuest?.type;
      const requestedStatus = payload.status ?? sourceQuest?.status ?? "draft";
      const status = requestedStatus === "draft" || requestedStatus === "active" || requestedStatus === "completed" ? requestedStatus : null;
      if (!title || Array.from(title).length > 180) return Response.json({ error: "กรุณาระบุชื่อเควสไม่เกิน 180 ตัวอักษร" }, { status: 400 });
      if (!description || Array.from(description).length > 4_000) return Response.json({ error: "กรุณาระบุรายละเอียดเควสไม่เกิน 4,000 ตัวอักษร" }, { status: 400 });
      if (type !== "individual" && type !== "team" && type !== "activity") return Response.json({ error: "กรุณาเลือกประเภทเควสที่ถูกต้อง" }, { status: 400 });
      if (!status) return Response.json({ error: "สถานะเควสไม่ถูกต้อง" }, { status: 400 });
      if (!sourceQuest && status === "completed") return Response.json({ error: "เควสใหม่ต้องเริ่มเป็นฉบับร่างหรือเปิดใช้งานก่อน จึงยังตั้งเป็นเสร็จสิ้นไม่ได้" }, { status: 400 });
      if (sourceQuest) {
        const validTransition = (sourceQuest.status === "draft" && (status === "draft" || status === "active"))
          || (sourceQuest.status === "active" && (status === "active" || status === "completed"))
          || (sourceQuest.status === "completed" && status === "completed");
        if (!validTransition) return Response.json({ error: `ไม่สามารถเปลี่ยนสถานะเควสจาก ${sourceQuest.status} เป็น ${status} ได้` }, { status: 409 });
      }

      const requestedProgress = payload.progress ?? sourceQuest?.progress ?? 0;
      if (typeof requestedProgress !== "number" || !Number.isSafeInteger(requestedProgress) || requestedProgress < 0 || requestedProgress > 100) {
        return Response.json({ error: "ความคืบหน้าต้องเป็นจำนวนเต็มตั้งแต่ 0 ถึง 100" }, { status: 400 });
      }
      const progress = status === "completed" ? 100 : requestedProgress;
      const pointsReward = payload.pointsReward ?? sourceQuest?.pointsReward ?? 0;
      if (typeof pointsReward !== "number" || !Number.isSafeInteger(pointsReward) || pointsReward < 0 || pointsReward > 10_000_000) {
        return Response.json({ error: "Points ของเควสต้องเป็นจำนวนเต็มตั้งแต่ 0 ถึง 10,000,000" }, { status: 400 });
      }
      const startDate = typeof payload.startDate === "string" ? payload.startDate.trim() : sourceQuest?.startDate ?? "";
      const endDate = typeof payload.endDate === "string" ? payload.endDate.trim() : sourceQuest?.endDate ?? "";
      if (!isValidIsoDay(startDate) || !isValidIsoDay(endDate) || endDate < startDate) {
        return Response.json({ error: "กรุณาระบุวันเริ่มและวันสิ้นสุดให้ถูกต้อง โดยวันสิ้นสุดต้องไม่อยู่ก่อนวันเริ่ม" }, { status: 400 });
      }
      const isFeatured = payload.isFeatured ?? sourceQuest?.isFeatured ?? true;
      if (typeof isFeatured !== "boolean") return Response.json({ error: "กรุณาระบุสถานะการแสดงเควสเด่น" }, { status: 400 });
      if (status === "active" || status === "completed") {
        const questRule = activePointRules.events.quest;
        const questPointLimit = questRule.points;
        const standardEarnMonthlyCap = activePointRules.economy.standardEarnMonthlyCap;
        if (!activePointPolicy || !activePointPolicy.contentHash || activePointPolicy.contentHash !== await policyIntegrityHash(activePointPolicy)) {
          return Response.json({ error: "ยังไม่มีกติกา Points ที่ประกาศใช้และตรวจสอบความถูกต้องได้ จึงยังเปิดเควสไม่ได้" }, { status: 409 });
        }
        if (questRule.entryMode !== "manual" || !questRule.authorizedRoles.includes("admin")) {
          return Response.json({ error: "กติกาปัจจุบันไม่อนุญาตให้ HR / Admin มอบ Points จากเควส จึงยังเปิดเควสไม่ได้" }, { status: 409 });
        }
        if (questPointLimit === null || questPointLimit < 0 || pointsReward > questPointLimit || pointsReward > standardEarnMonthlyCap) {
          const effectiveLimit = Math.max(0, Math.min(questPointLimit ?? 0, standardEarnMonthlyCap));
          return Response.json({ error: `เควสนี้ประกาศได้ไม่เกิน ${effectiveLimit.toLocaleString("th-TH")} Points ตามเพดานต่อเควสและเพดานรวมรายเดือนของกติกาปัจจุบัน` }, { status: 409 });
        }
        if (activePointRules.economy.positiveManualEventsPerMonth < 1) {
          return Response.json({ error: "กติกาปัจจุบันปิดการมอบ Points จากเควส จึงยังเปิดเควสไม่ได้" }, { status: 409 });
        }
      }

      if (payload.targetEmployeeIds !== undefined && !Array.isArray(payload.targetEmployeeIds)) return Response.json({ error: "รายชื่อผู้รับเควสไม่ถูกต้อง" }, { status: 400 });
      if (payload.targetDepartmentIds !== undefined && !Array.isArray(payload.targetDepartmentIds)) return Response.json({ error: "รายชื่อทีมไม่ถูกต้อง" }, { status: 400 });
      const rawEmployeeTargets = payload.targetEmployeeIds ?? sourceTargetRows.filter((target) => target.targetType === "employee").map((target) => target.targetKey);
      const rawDepartmentTargets = payload.targetDepartmentIds ?? sourceTargetRows.filter((target) => target.targetType === "department").map((target) => target.targetKey);
      if (rawEmployeeTargets.some((value) => typeof value !== "string" || !value.trim() || value.trim().length > 120)
        || rawDepartmentTargets.some((value) => typeof value !== "string" || !value.trim() || value.trim().length > 120)) {
        return Response.json({ error: "กลุ่มเป้าหมายเควสไม่ถูกต้อง" }, { status: 400 });
      }
      const targetEmployeeIds = [...new Set(rawEmployeeTargets.map((value) => value.trim()))];
      const targetDepartmentIds = [...new Set(rawDepartmentTargets.map((value) => value.trim()))];
      if (type === "individual" && (targetEmployeeIds.length !== 1 || targetDepartmentIds.length !== 0)) {
        return Response.json({ error: "เควสรายบุคคลต้องเลือกพนักงานที่กำลังใช้งานอยู่ 1 คนเท่านั้น" }, { status: 400 });
      }
      if (type === "team" && (targetDepartmentIds.length < 1 || targetDepartmentIds.length > 50 || targetEmployeeIds.length !== 0)) {
        return Response.json({ error: "เควสทีมต้องเลือกอย่างน้อย 1 ทีม และไม่ระบุพนักงานรายบุคคล" }, { status: 400 });
      }
      if (type === "activity" && (targetEmployeeIds.length !== 0 || targetDepartmentIds.length !== 0)) {
        return Response.json({ error: "เควสกิจกรรมเปิดให้ทั้งองค์กร จึงไม่ต้องระบุพนักงานหรือทีม" }, { status: 400 });
      }

      const activeEmployeeRows = await db.select({ id: employees.id, name: employees.name, roleId: employees.roleId }).from(employees).where(eq(employees.status, "active"));
      const activeEmployeesById = new Map(activeEmployeeRows.map((employee) => [employee.id, employee]));
      if (targetEmployeeIds.some((employeeId) => !activeEmployeesById.has(employeeId))) {
        return Response.json({ error: "เควสรายบุคคลเลือกได้เฉพาะพนักงานที่กำลังใช้งานอยู่" }, { status: 400 });
      }
      const departmentsById = new Map<string, string>();
      for (const role of roles) departmentsById.set(role.departmentId, role.department);
      for (const employee of activeEmployeeRows) {
        const role = findRole(employee.roleId);
        if (role) departmentsById.set(role.departmentId, role.department);
      }
      if (targetDepartmentIds.some((departmentId) => !departmentsById.has(departmentId))) {
        return Response.json({ error: "พบทีมเป้าหมายที่ไม่มีอยู่ในโครงสร้างองค์กร" }, { status: 400 });
      }

      const rewardIdInput = payload.rewardId === undefined ? sourceQuest?.rewardId ?? null : payload.rewardId;
      if (rewardIdInput !== null && typeof rewardIdInput !== "string") return Response.json({ error: "ข้อมูลรางวัลของเควสไม่ถูกต้อง" }, { status: 400 });
      const rewardId = typeof rewardIdInput === "string" ? rewardIdInput.trim().slice(0, 160) || null : null;
      const [linkedReward] = rewardId ? await db.select().from(rewards).where(eq(rewards.id, rewardId)).limit(1) : [];
      if (rewardId && !linkedReward) return Response.json({ error: "ไม่พบรางวัลที่ผูกกับเควส กรุณาเลือกรางวัลใหม่" }, { status: 400 });
      const preservesExistingReward = Boolean(rewardId && sourceQuest?.rewardId === rewardId);
      if (rewardId && !preservesExistingReward && !(await getSystemSettingsRow()).questRewardLinkingEnabled) {
        return Response.json({ error: "เจ้าของระบบปิดการผูกรางวัลใหม่กับเควสไว้ รางวัลเดิมและประวัติที่มีอยู่จะยังคงเดิม" }, { status: 409 });
      }
      const activatesDraftQuest = sourceQuest?.status === "draft" && status === "active";
      if (rewardId && linkedReward && !linkedReward.isActive && (!preservesExistingReward || activatesDraftQuest)) {
        return Response.json({ error: "รางวัลที่ผูกใหม่หรือใช้เปิดเควสต้องเป็นรางวัลที่เปิดใช้งานอยู่" }, { status: 400 });
      }
      const rewardTitleSnapshot = preservesExistingReward
        ? sourceQuest?.rewardTitleSnapshot || linkedReward?.title || ""
        : linkedReward?.title ?? "";
      const rewardIconSnapshot = preservesExistingReward
        ? sourceQuest?.rewardIconSnapshot || linkedReward?.icon || ""
        : linkedReward?.icon ?? "";

      const normalizedTargetSignature = (employeeIds: string[], departmentIds: string[]) => JSON.stringify({
        employeeIds: [...employeeIds].sort(),
        departmentIds: [...departmentIds].sort(),
      });
      const sourceEmployeeTargetIds = sourceTargetRows.filter((target) => target.targetType === "employee").map((target) => target.targetKey);
      const sourceDepartmentTargetIds = sourceTargetRows.filter((target) => target.targetType === "department").map((target) => target.targetKey);
      const targetsChanged = Boolean(sourceQuest) && normalizedTargetSignature(targetEmployeeIds, targetDepartmentIds) !== normalizedTargetSignature(sourceEmployeeTargetIds, sourceDepartmentTargetIds);
      const [existingCompletion] = sourceQuest
        ? await db.select({ id: questCompletions.id }).from(questCompletions).where(eq(questCompletions.questId, sourceQuest.id)).limit(1)
        : [];
      if (sourceQuest && existingCompletion) {
        const fulfilledTermsChanged = sourceQuest.type !== type
          || sourceQuest.title !== title
          || sourceQuest.description !== description
          || sourceQuest.pointsReward !== pointsReward
          || sourceQuest.rewardId !== rewardId
          || sourceQuest.startDate !== startDate
          || sourceQuest.endDate !== endDate
          || targetsChanged;
        if (fulfilledTermsChanged) return Response.json({ error: "เควสนี้เคยมอบสิทธิ์แล้ว จึงแก้ประเภท เป้าหมาย เงื่อนไข Points รางวัล หรือช่วงเวลาไม่ได้" }, { status: 409 });
      }

      const expectedUpdatedAt = typeof payload.expectedUpdatedAt === "string" ? payload.expectedUpdatedAt : "";
      const expectedRevision = payload.expectedRevision;
      if (sourceQuest && (!expectedUpdatedAt || typeof expectedRevision !== "number" || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0)) {
        return Response.json({ error: "ข้อมูลเวอร์ชันเควสไม่ครบ กรุณาโหลดข้อมูลล่าสุดแล้วลองใหม่" }, { status: 400 });
      }
      if (sourceQuest && (sourceQuest.updatedAt !== expectedUpdatedAt || sourceQuest.revision !== expectedRevision)) {
        return Response.json({ error: "เควสนี้ถูกแก้ไขจากอีกหน้าจอ กรุณาโหลดข้อมูลล่าสุด" }, { status: 409 });
      }

      const actor = authenticatedActor(currentUser);
      const sourceTimestamp = sourceQuest ? Date.parse(sourceQuest.updatedAt) : Number.NaN;
      const now = new Date(Math.max(Date.now(), Number.isFinite(sourceTimestamp) ? sourceTimestamp + 1 : 0)).toISOString();
      const revision = sourceQuest ? sourceQuest.revision + 1 : 0;
      const savedQuest: QuestRow = {
        id: sourceQuest?.id ?? `quest-${crypto.randomUUID()}`,
        type,
        title,
        description,
        status,
        progress,
        pointsReward,
        rewardId,
        rewardTitleSnapshot,
        rewardIconSnapshot,
        isFeatured,
        startDate,
        endDate,
        revision,
        createdByUserId: sourceQuest?.createdByUserId ?? actor.userId,
        createdByName: sourceQuest?.createdByName ?? actor.name,
        updatedByUserId: actor.userId,
        updatedByName: actor.name,
        createdAt: sourceQuest?.createdAt ?? now,
        updatedAt: now,
      };
      const candidateTargets: QuestTargetRow[] = [
        ...targetEmployeeIds.map((employeeId) => ({
          id: `quest-target-${crypto.randomUUID()}`,
          questId: savedQuest.id,
          targetType: "employee" as const,
          targetKey: employeeId,
          targetLabelSnapshot: sourceTargetRows.find((target) => target.targetType === "employee" && target.targetKey === employeeId)?.targetLabelSnapshot
            || activeEmployeesById.get(employeeId)?.name
            || employeeId,
          createdAt: now,
        })),
        ...targetDepartmentIds.map((departmentId) => ({
          id: `quest-target-${crypto.randomUUID()}`,
          questId: savedQuest.id,
          targetType: "department" as const,
          targetKey: departmentId,
          targetLabelSnapshot: sourceTargetRows.find((target) => target.targetType === "department" && target.targetKey === departmentId)?.targetLabelSnapshot
            || departmentsById.get(departmentId)
            || departmentId,
          createdAt: now,
        })),
      ];
      const savedTargets = sourceQuest && !targetsChanged ? sourceTargetRows : candidateTargets;
      const targetEmployees = savedTargets.filter((target) => target.targetType === "employee").map((target) => ({ id: target.targetKey, label: target.targetLabelSnapshot }));
      const targetDepartments = savedTargets.filter((target) => target.targetType === "department").map((target) => ({ id: target.targetKey, label: target.targetLabelSnapshot }));
      const snapshotJson = JSON.stringify({ ...savedQuest, targetEmployeeIds, targetDepartmentIds, targetEmployees, targetDepartments });
      const d1 = getD1();
      const insertQuestStatement = d1.prepare(`INSERT INTO quests (
        id, type, title, description, status, progress, points_reward, reward_id, reward_title_snapshot, reward_icon_snapshot,
        is_featured, start_date, end_date, revision, created_by_user_id, created_by_name, updated_by_user_id, updated_by_name, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(savedQuest.id, savedQuest.type, savedQuest.title, savedQuest.description, savedQuest.status, savedQuest.progress, savedQuest.pointsReward, savedQuest.rewardId, savedQuest.rewardTitleSnapshot, savedQuest.rewardIconSnapshot, savedQuest.isFeatured ? 1 : 0, savedQuest.startDate, savedQuest.endDate, savedQuest.revision, savedQuest.createdByUserId, savedQuest.createdByName, savedQuest.updatedByUserId, savedQuest.updatedByName, savedQuest.createdAt, savedQuest.updatedAt);
      const updateQuestStatement = d1.prepare(`UPDATE quests SET
        type = ?, title = ?, description = ?, status = ?, progress = ?, points_reward = ?, reward_id = ?, reward_title_snapshot = ?, reward_icon_snapshot = ?,
        is_featured = ?, start_date = ?, end_date = ?, revision = ?, updated_by_user_id = ?, updated_by_name = ?, updated_at = ?
        WHERE id = ? AND revision = ? AND updated_at = ?`)
        .bind(savedQuest.type, savedQuest.title, savedQuest.description, savedQuest.status, savedQuest.progress, savedQuest.pointsReward, savedQuest.rewardId, savedQuest.rewardTitleSnapshot, savedQuest.rewardIconSnapshot, savedQuest.isFeatured ? 1 : 0, savedQuest.startDate, savedQuest.endDate, savedQuest.revision, savedQuest.updatedByUserId, savedQuest.updatedByName, savedQuest.updatedAt, savedQuest.id, sourceQuest?.revision ?? -1, sourceQuest?.updatedAt ?? "");
      const targetStatements = candidateTargets.map((target) => d1.prepare(`INSERT INTO quest_targets (
        id, quest_id, target_type, target_key, target_label_snapshot, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(target.id, target.questId, target.targetType, target.targetKey, target.targetLabelSnapshot, target.createdAt));
      const mutationEventStatement = d1.prepare(`INSERT INTO quest_mutation_events (
        id, quest_id, event_type, expected_revision, expected_updated_at, revision, actor_user_id, actor_name, snapshot_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(`quest-event-${crypto.randomUUID()}`, savedQuest.id, sourceQuest ? "updated" : "created", sourceQuest?.revision ?? -1, sourceQuest?.updatedAt ?? now, savedQuest.revision, actor.userId, actor.name, snapshotJson, now);
      try {
        if (sourceQuest) {
          await d1.batch([
            mutationEventStatement,
            updateQuestStatement,
            ...(targetsChanged ? [d1.prepare("DELETE FROM quest_targets WHERE quest_id = ?").bind(savedQuest.id), ...targetStatements] : []),
          ]);
        } else {
          await d1.batch([insertQuestStatement, ...targetStatements, mutationEventStatement]);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message.includes("QUEST_") || message.includes("quest_mutation_events.quest_id, quest_mutation_events.revision")) {
          return Response.json({ error: "เควสนี้ถูกแก้ไขจากอีกหน้าจอ กรุณาโหลดข้อมูลล่าสุด" }, { status: 409 });
        }
        throw error;
      }
      return Response.json({ quest: questDto(savedQuest, savedTargets, true) }, { status: sourceQuest ? 200 : 201 });
    }

    if (payload.action === "completeQuestForEmployee") {
      const questId = typeof payload.questId === "string" ? payload.questId.trim().slice(0, 160) : "";
      const employeeId = typeof payload.employeeId === "string" ? payload.employeeId.trim().slice(0, 120) : "";
      if (!questId || !employeeId) return Response.json({ error: "กรุณาเลือกเควสและพนักงานที่ต้องการมอบสิทธิ์" }, { status: 400 });
      if (currentUser.employeeId === employeeId) return Response.json({ error: "HR / Admin ไม่สามารถตรวจและมอบ Points หรือรางวัลให้ตนเองได้" }, { status: 403 });

      const completionResponse = async (completion: QuestCompletionRow, idempotentReplay: boolean, status = 200) => {
        const [[pointEvent], [pointEntry], [reward]] = await Promise.all([
          db.select().from(pointEvents).where(eq(pointEvents.id, completion.pointEventId)).limit(1),
          db.select().from(pointLedger).where(eq(pointLedger.id, completion.pointLedgerId)).limit(1),
          completion.rewardId ? db.select().from(rewards).where(eq(rewards.id, completion.rewardId)).limit(1) : Promise.resolve([]),
        ]);
        return Response.json({
          questCompletion: questCompletionDto(completion, true),
          pointEvent: pointEvent ?? null,
          pointEntry: pointEntry ?? null,
          reward: reward ?? null,
          idempotentReplay,
        }, { status });
      };

      const [priorCompletion] = await db.select().from(questCompletions).where(and(
        eq(questCompletions.questId, questId),
        eq(questCompletions.employeeId, employeeId),
      )).limit(1);
      if (priorCompletion) return completionResponse(priorCompletion, true);

      const [[quest], targetRows, [employee]] = await Promise.all([
        db.select().from(quests).where(eq(quests.id, questId)).limit(1),
        db.select().from(questTargets).where(eq(questTargets.questId, questId)),
        db.select({ id: employees.id, name: employees.name, roleId: employees.roleId }).from(employees).where(and(eq(employees.id, employeeId), eq(employees.status, "active"))).limit(1),
      ]);
      if (!quest) return Response.json({ error: "ไม่พบเควสที่เลือก" }, { status: 404 });
      if (!employee) return Response.json({ error: "ไม่พบพนักงานที่กำลังใช้งานอยู่" }, { status: 404 });
      if (quest.status !== "active" && quest.status !== "completed") return Response.json({ error: "มอบสิทธิ์ได้เฉพาะเควสที่เปิดใช้งานหรือปิดสำเร็จแล้ว" }, { status: 409 });

      const expectedUpdatedAt = typeof payload.expectedUpdatedAt === "string" ? payload.expectedUpdatedAt : "";
      const expectedRevision = payload.expectedRevision;
      if (!expectedUpdatedAt || typeof expectedRevision !== "number" || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
        return Response.json({ error: "ข้อมูลเวอร์ชันเควสไม่ครบ กรุณาโหลดข้อมูลล่าสุดแล้วลองใหม่" }, { status: 400 });
      }
      if (quest.updatedAt !== expectedUpdatedAt || quest.revision !== expectedRevision) {
        return Response.json({ error: "เควสนี้ถูกแก้ไขจากอีกหน้าจอ กรุณาโหลดข้อมูลล่าสุด" }, { status: 409 });
      }

      const employeeRole = findRole(employee.roleId);
      if (!employeeRole) return Response.json({ error: "โปรไฟล์พนักงานไม่มีกรอบตำแหน่งมาตรฐาน กรุณาให้ HR แก้ไขก่อนมอบสิทธิ์" }, { status: 409 });
      const employeeDepartmentId = employeeRole.departmentId;
      const eligible = quest.type === "activity"
        || (quest.type === "individual" && targetRows.some((target) => target.targetType === "employee" && target.targetKey === employee.id))
        || (quest.type === "team" && targetRows.some((target) => target.targetType === "department" && target.targetKey === employeeDepartmentId));
      if (!eligible) return Response.json({ error: "พนักงานคนนี้ไม่อยู่ในกลุ่มเป้าหมายของเควส" }, { status: 403 });

      const completionDate = typeof payload.completionDate === "string" ? payload.completionDate.trim() : "";
      const today = bangkokIsoDay();
      if (!isValidIsoDay(completionDate) || completionDate > today) return Response.json({ error: "วันที่ทำเควสสำเร็จต้องเป็นวันที่ถูกต้องและไม่อยู่ในอนาคต" }, { status: 400 });
      if (completionDate < quest.startDate || completionDate > quest.endDate) return Response.json({ error: "วันที่ทำสำเร็จต้องอยู่ภายในช่วงเวลาของเควส" }, { status: 400 });
      if (isoDayDistance(completionDate, today) > 90) return Response.json({ error: "HR / Admin บันทึกผลเควสย้อนหลังได้ไม่เกิน 90 วัน" }, { status: 409 });
      const evidenceUrl = typeof payload.evidenceUrl === "string" ? payload.evidenceUrl.trim() : "";
      const note = typeof payload.note === "string" ? payload.note.trim() : "";
      if (!evidenceUrl || evidenceUrl.length > 1_200 || !isSafeHttpsUrl(evidenceUrl)) return Response.json({ error: "กรุณาแนบลิงก์หลักฐาน https:// ที่ถูกต้อง" }, { status: 400 });
      if (!note || Array.from(note).length > 1_000) return Response.json({ error: "กรุณาระบุผลการตรวจไม่เกิน 1,000 ตัวอักษร" }, { status: 400 });

      const { policy: completionPolicy, rules: completionRules } = pointPolicyFromRows(pointPolicyRows, completionDate);
      if (!completionPolicy || !completionPolicy.contentHash || completionPolicy.contentHash !== await policyIntegrityHash(completionPolicy)) {
        return Response.json({ error: "ไม่มีกติกา Points ที่ประกาศใช้และตรวจสอบได้ในวันที่ทำเควสสำเร็จ" }, { status: 409 });
      }
      const questRule = completionRules.events.quest;
      const questPointPolicyLimit = questRule.points;
      if (questRule.entryMode !== "manual" || !questRule.authorizedRoles.includes("admin") || questPointPolicyLimit === null || questPointPolicyLimit < 0) {
        return Response.json({ error: "กติกา Points ในวันที่เลือกไม่อนุญาตให้ HR มอบ Points จากเควส" }, { status: 409 });
      }
      if (quest.pointsReward > questPointPolicyLimit) {
        return Response.json({ error: `เควสนี้ประกาศ ${quest.pointsReward.toLocaleString("th-TH")} Points แต่กติกาในวันที่เลือกอนุญาตสูงสุด ${questPointPolicyLimit.toLocaleString("th-TH")} Points กรุณาแก้กติกาหรือเควสก่อนมอบสิทธิ์` }, { status: 409 });
      }
      const maxManualQuestCompletions = completionRules.economy.positiveManualEventsPerMonth;
      if (maxManualQuestCompletions < 1) return Response.json({ error: "กติกาในวันที่เลือกปิดการมอบ Points จากเควส" }, { status: 409 });

      const [[linkedReward], employeeEventRows, employeeLedgerRows, employeeCapClaimRows] = await Promise.all([
        quest.rewardId ? db.select().from(rewards).where(eq(rewards.id, quest.rewardId)).limit(1) : Promise.resolve([]),
        db.select().from(pointEvents).where(eq(pointEvents.employeeId, employee.id)),
        db.select().from(pointLedger).where(eq(pointLedger.employeeId, employee.id)),
        db.select({ id: pointCapClaims.id }).from(pointCapClaims).where(and(eq(pointCapClaims.employeeId, employee.id), eq(pointCapClaims.claimMonth, completionDate.slice(0, 7)))),
      ]);
      if (quest.rewardId && (!linkedReward || !linkedReward.isActive || linkedReward.stock <= 0)) {
        return Response.json({ error: "รางวัลที่ประกาศไว้ถูกปิดหรือหมดสต็อก จึงยังมอบสิทธิ์เควสไม่ได้" }, { status: 409 });
      }
      const completionMonth = completionDate.slice(0, 7);
      const questCompletionsThisMonth = employeeEventRows.filter((event) => event.eventType === "quest" && event.eventDate.startsWith(completionMonth)).length;
      if (questCompletionsThisMonth >= maxManualQuestCompletions) {
        return Response.json({ error: `พนักงานได้รับ Points จากเควสครบ ${maxManualQuestCompletions} ครั้งของเดือนนี้แล้ว` }, { status: 409 });
      }
      const positiveEventsThisMonth = employeeEventRows.filter((event) => event.eventDate.startsWith(completionMonth) && event.eventType !== "monthly_evaluation" && event.points > 0).reduce((sum, event) => sum + event.points, 0);
      const workAwardsThisMonth = employeeLedgerRows.filter((entry) => (entry.sourceType === "task" || entry.sourceType === "mission") && bangkokMonthFromTimestamp(entry.createdAt) === completionMonth && entry.points > 0).reduce((sum, entry) => sum + entry.points, 0);
      const standardEarnMonthlyCap = completionRules.economy.standardEarnMonthlyCap;
      if (positiveEventsThisMonth + workAwardsThisMonth + quest.pointsReward > standardEarnMonthlyCap) {
        return Response.json({ error: `หากมอบเควสนี้ Points บวกมาตรฐานจะเกินเพดาน ${standardEarnMonthlyCap.toLocaleString("th-TH")} Points ของเดือน จึงไม่มีการมอบบางส่วน` }, { status: 409 });
      }

      const actor = authenticatedActor(currentUser);
      const now = new Date().toISOString();
      const completionId = `quest-completion-${crypto.randomUUID()}`;
      const pointEventId = `point-event-${completionId}`;
      const pointLedgerId = `points-${completionId}`;
      const policyMetadata = pointPolicyMetadata(completionPolicy);
      if (!policyMetadata.policyId || policyMetadata.policyVersion === null || !policyMetadata.policyContentHash) {
        return Response.json({ error: "ข้อมูลอ้างอิงกติกา Points ไม่ครบ จึงยังมอบสิทธิ์ไม่ได้" }, { status: 409 });
      }
      const pointNote = `เควสสำเร็จ: ${quest.title} — ${note}`;
      const pointEvent = {
        id: pointEventId,
        employeeId: employee.id,
        eventType: "quest" as const,
        points: quest.pointsReward,
        eventDate: completionDate,
        note: pointNote,
        evidenceUrl,
        recordedBy: actor.name,
        policyId: policyMetadata.policyId,
        policyVersion: policyMetadata.policyVersion,
        policyContentHash: policyMetadata.policyContentHash,
        createdAt: now,
      };
      const pointEntry = {
        id: pointLedgerId,
        employeeId: employee.id,
        sourceType: "quest" as const,
        sourceId: completionId,
        points: quest.pointsReward,
        note: pointNote,
        policyId: policyMetadata.policyId,
        policyVersion: policyMetadata.policyVersion,
        policyContentHash: policyMetadata.policyContentHash,
        createdAt: now,
      };
      const mutationClaim = {
        id: `point-mutation-claim-${crypto.randomUUID()}`,
        pointEventId,
        employeeId: employee.id,
        predecessorEventCount: employeeEventRows.length,
        employeeSequenceKey: `${employee.id}:event-count:${employeeEventRows.length}`,
        createdAt: now,
      };
      const capClaim = {
        id: `point-cap-claim-${crypto.randomUUID()}`,
        employeeId: employee.id,
        claimMonth: completionMonth,
        sourceType: "quest_completion",
        sourceId: completionId,
        employeeMonthSequenceKey: `${employee.id}:${completionMonth}:${employeeCapClaimRows.length}`,
        createdAt: now,
      };
      const questCompletion: QuestCompletionRow = {
        id: completionId,
        questId: quest.id,
        employeeId: employee.id,
        completionDate,
        questRevision: quest.revision,
        questUpdatedAt: quest.updatedAt,
        questTypeSnapshot: quest.type,
        questTitleSnapshot: quest.title,
        questDescriptionSnapshot: quest.description,
        questStartDateSnapshot: quest.startDate,
        questEndDateSnapshot: quest.endDate,
        pointsAwarded: quest.pointsReward,
        rewardId: quest.rewardId,
        rewardTitleSnapshot: quest.rewardTitleSnapshot,
        rewardIconSnapshot: quest.rewardIconSnapshot,
        rewardInventoryVersion: linkedReward?.inventoryVersion ?? null,
        employeeNameSnapshot: employee.name,
        employeeRoleIdSnapshot: employee.roleId,
        employeeDepartmentIdSnapshot: employeeDepartmentId,
        employeeDepartmentNameSnapshot: employeeRole.department,
        evidenceUrl,
        note,
        pointEventId,
        pointLedgerId,
        policyId: policyMetadata.policyId,
        policyVersion: policyMetadata.policyVersion,
        policyContentHash: policyMetadata.policyContentHash,
        questPointPolicyLimit,
        maxManualQuestCompletions,
        standardEarnMonthlyCap,
        completedByUserId: actor.userId,
        completedByName: actor.name,
        completedAt: now,
      };

      const d1 = getD1();
      const statements = [
        d1.prepare(`INSERT INTO point_events (
          id, employee_id, event_type, points, event_date, note, evidence_url, recorded_by, policy_id, policy_version, policy_content_hash, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(pointEvent.id, pointEvent.employeeId, pointEvent.eventType, pointEvent.points, pointEvent.eventDate, pointEvent.note, pointEvent.evidenceUrl, pointEvent.recordedBy, pointEvent.policyId, pointEvent.policyVersion, pointEvent.policyContentHash, pointEvent.createdAt),
        d1.prepare(`INSERT INTO point_mutation_claims (
          id, point_event_id, employee_id, predecessor_event_count, employee_sequence_key, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`)
          .bind(mutationClaim.id, mutationClaim.pointEventId, mutationClaim.employeeId, mutationClaim.predecessorEventCount, mutationClaim.employeeSequenceKey, mutationClaim.createdAt),
        d1.prepare(`INSERT INTO point_cap_claims (
          id, employee_id, claim_month, source_type, source_id, employee_month_sequence_key, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .bind(capClaim.id, capClaim.employeeId, capClaim.claimMonth, capClaim.sourceType, capClaim.sourceId, capClaim.employeeMonthSequenceKey, capClaim.createdAt),
        d1.prepare(`INSERT INTO point_ledger (
          id, employee_id, source_type, source_id, points, note, policy_id, policy_version, policy_content_hash, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(pointEntry.id, pointEntry.employeeId, pointEntry.sourceType, pointEntry.sourceId, pointEntry.points, pointEntry.note, pointEntry.policyId, pointEntry.policyVersion, pointEntry.policyContentHash, pointEntry.createdAt),
        d1.prepare(`INSERT INTO quest_completions (
          id, quest_id, employee_id, completion_date, quest_revision, quest_updated_at, quest_type_snapshot, quest_title_snapshot,
          quest_description_snapshot, quest_start_date_snapshot, quest_end_date_snapshot, points_awarded, reward_id, reward_title_snapshot,
          reward_icon_snapshot, reward_inventory_version, employee_name_snapshot, employee_role_id_snapshot, employee_department_id_snapshot, employee_department_name_snapshot,
          evidence_url, note, point_event_id, point_ledger_id, policy_id, policy_version, policy_content_hash, quest_point_policy_limit,
          max_manual_quest_completions, standard_earn_monthly_cap, completed_by_user_id, completed_by_name, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(questCompletion.id, questCompletion.questId, questCompletion.employeeId, questCompletion.completionDate, questCompletion.questRevision, questCompletion.questUpdatedAt, questCompletion.questTypeSnapshot, questCompletion.questTitleSnapshot, questCompletion.questDescriptionSnapshot, questCompletion.questStartDateSnapshot, questCompletion.questEndDateSnapshot, questCompletion.pointsAwarded, questCompletion.rewardId, questCompletion.rewardTitleSnapshot, questCompletion.rewardIconSnapshot, questCompletion.rewardInventoryVersion, questCompletion.employeeNameSnapshot, questCompletion.employeeRoleIdSnapshot, questCompletion.employeeDepartmentIdSnapshot, questCompletion.employeeDepartmentNameSnapshot, questCompletion.evidenceUrl, questCompletion.note, questCompletion.pointEventId, questCompletion.pointLedgerId, questCompletion.policyId, questCompletion.policyVersion, questCompletion.policyContentHash, questCompletion.questPointPolicyLimit, questCompletion.maxManualQuestCompletions, questCompletion.standardEarnMonthlyCap, questCompletion.completedByUserId, questCompletion.completedByName, questCompletion.completedAt),
      ];
      if (linkedReward) {
        statements.push(
          d1.prepare(`UPDATE rewards SET stock = stock - 1, inventory_version = inventory_version + 1, updated_at = ?
            WHERE id = ? AND is_active = 1 AND stock > 0 AND inventory_version = ?`)
            .bind(now, linkedReward.id, linkedReward.inventoryVersion),
          d1.prepare("UPDATE rewards SET title = CASE WHEN changes() = 1 THEN title ELSE NULL END WHERE id = ?").bind(linkedReward.id),
        );
      }
      try {
        await d1.batch(statements);
      } catch (error) {
        const [racedCompletion] = await db.select().from(questCompletions).where(and(
          eq(questCompletions.questId, quest.id),
          eq(questCompletions.employeeId, employee.id),
        )).limit(1);
        if (racedCompletion) return completionResponse(racedCompletion, true);
        const message = error instanceof Error ? error.message : "";
        if (message.includes("QUEST_COMPLETION_") || message.includes("UNIQUE constraint failed") || message.includes("NOT NULL constraint failed: rewards.title")) {
          return Response.json({ error: "ข้อมูลเควส Points หรือสต็อกเปลี่ยนแปลงพร้อมกัน กรุณาโหลดข้อมูลล่าสุดและตรวจเพดานก่อนลองใหม่" }, { status: 409 });
        }
        throw error;
      }
      const reward = linkedReward ? { ...linkedReward, stock: linkedReward.stock - 1, inventoryVersion: linkedReward.inventoryVersion + 1, updatedAt: now } : null;
      return Response.json({ questCompletion: questCompletionDto(questCompletion, true), pointEvent, pointEntry, reward, idempotentReplay: false }, { status: 201 });
    }

    if (payload.action === "deleteQuest") {
      const questId = typeof payload.questId === "string" ? payload.questId.trim().slice(0, 160) : "";
      if (!questId) return Response.json({ error: "กรุณาเลือกเควสที่ต้องการลบ" }, { status: 400 });
      const [sourceQuest] = await db.select().from(quests).where(eq(quests.id, questId)).limit(1);
      if (!sourceQuest) return Response.json({ error: "ไม่พบเควสที่เลือก" }, { status: 404 });
      const sourceTargets = await db.select().from(questTargets).where(eq(questTargets.questId, sourceQuest.id));
      const expectedUpdatedAt = typeof payload.expectedUpdatedAt === "string" ? payload.expectedUpdatedAt : "";
      const expectedRevision = payload.expectedRevision;
      if (!expectedUpdatedAt || typeof expectedRevision !== "number" || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
        return Response.json({ error: "ข้อมูลเวอร์ชันเควสไม่ครบ กรุณาโหลดข้อมูลล่าสุดแล้วลองใหม่" }, { status: 400 });
      }
      if (sourceQuest.updatedAt !== expectedUpdatedAt || sourceQuest.revision !== expectedRevision) {
        return Response.json({ error: "เควสนี้ถูกแก้ไขจากอีกหน้าจอ กรุณาโหลดข้อมูลล่าสุด" }, { status: 409 });
      }
      const requiredConfirmation = `ลบเควส ${sourceQuest.title}`;
      if (typeof payload.confirmation !== "string" || payload.confirmation !== requiredConfirmation) {
        return Response.json({ error: `กรุณาพิมพ์ “${requiredConfirmation}” ให้ถูกต้อง` }, { status: 400 });
      }
      if (sourceQuest.status === "archived") {
        return Response.json({ quest: questDto(sourceQuest, sourceTargets, true), disposition: "archived", deleted: false, archived: true });
      }
      const actor = authenticatedActor(currentUser);
      const sourceTimestamp = Date.parse(sourceQuest.updatedAt);
      const now = new Date(Math.max(Date.now(), Number.isFinite(sourceTimestamp) ? sourceTimestamp + 1 : 0)).toISOString();
      const archivedQuest: QuestRow = {
        ...sourceQuest,
        status: "archived",
        revision: sourceQuest.revision + 1,
        updatedByUserId: actor.userId,
        updatedByName: actor.name,
        updatedAt: now,
      };
      const snapshotJson = JSON.stringify({
        ...archivedQuest,
        targetEmployeeIds: sourceTargets.filter((target) => target.targetType === "employee").map((target) => target.targetKey),
        targetDepartmentIds: sourceTargets.filter((target) => target.targetType === "department").map((target) => target.targetKey),
        targetEmployees: sourceTargets.filter((target) => target.targetType === "employee").map((target) => ({ id: target.targetKey, label: target.targetLabelSnapshot })),
        targetDepartments: sourceTargets.filter((target) => target.targetType === "department").map((target) => ({ id: target.targetKey, label: target.targetLabelSnapshot })),
      });
      const d1 = getD1();
      try {
        await d1.batch([
          d1.prepare(`INSERT INTO quest_mutation_events (
            id, quest_id, event_type, expected_revision, expected_updated_at, revision, actor_user_id, actor_name, snapshot_json, created_at
          ) VALUES (?, ?, 'archived', ?, ?, ?, ?, ?, ?, ?)`)
            .bind(`quest-event-${crypto.randomUUID()}`, sourceQuest.id, sourceQuest.revision, sourceQuest.updatedAt, archivedQuest.revision, actor.userId, actor.name, snapshotJson, now),
          d1.prepare(`UPDATE quests SET status = 'archived', revision = ?, updated_by_user_id = ?, updated_by_name = ?, updated_at = ?
            WHERE id = ? AND revision = ? AND updated_at = ?`)
            .bind(archivedQuest.revision, actor.userId, actor.name, now, sourceQuest.id, sourceQuest.revision, sourceQuest.updatedAt),
        ]);
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message.includes("QUEST_") || message.includes("quest_mutation_events.quest_id, quest_mutation_events.revision")) {
          return Response.json({ error: "เควสนี้ถูกแก้ไขจากอีกหน้าจอ กรุณาโหลดข้อมูลล่าสุด" }, { status: 409 });
        }
        throw error;
      }
      return Response.json({ quest: questDto(archivedQuest, sourceTargets, true), disposition: "archived", deleted: false, archived: true });
    }

    if (payload.action === "saveReward") {
      const rewardId = typeof payload.rewardId === "string" ? payload.rewardId.trim().slice(0, 160) : "";
      const [sourceReward] = rewardId
        ? await db.select().from(rewards).where(eq(rewards.id, rewardId)).limit(1)
        : [];
      if (rewardId && !sourceReward) return Response.json({ error: "ไม่พบรางวัลที่เลือก" }, { status: 404 });

      const title = typeof payload.title === "string" ? payload.title.trim() : "";
      const description = typeof payload.description === "string" ? payload.description.trim() : "";
      const category = payload.category;
      const icon = typeof payload.icon === "string" ? payload.icon.trim() || "★" : "★";
      const costPoints = payload.costPoints;
      const stock = payload.stock;
      const rewardCategories = new Set(["perk", "learning", "wellbeing", "recognition"]);
      if (!title || Array.from(title).length > 160) {
        return Response.json({ error: "กรุณาระบุชื่อรางวัลไม่เกิน 160 ตัวอักษร" }, { status: 400 });
      }
      if (Array.from(description).length > 2_000) {
        return Response.json({ error: "รายละเอียดรางวัลต้องไม่เกิน 2,000 ตัวอักษร" }, { status: 400 });
      }
      if (!category || !rewardCategories.has(category)) {
        return Response.json({ error: "กรุณาเลือกหมวดรางวัลที่ถูกต้อง" }, { status: 400 });
      }
      if (Array.from(icon).length > 16) {
        return Response.json({ error: "สัญลักษณ์รางวัลต้องไม่เกิน 16 ตัวอักษร" }, { status: 400 });
      }
      if (typeof costPoints !== "number" || !Number.isInteger(costPoints) || costPoints < 1 || costPoints > 10_000_000) {
        return Response.json({ error: "Points ที่ใช้แลกต้องเป็นจำนวนเต็มตั้งแต่ 1 ถึง 10,000,000" }, { status: 400 });
      }
      if (typeof stock !== "number" || !Number.isInteger(stock) || stock < 0 || stock > 1_000_000) {
        return Response.json({ error: "จำนวนสิทธิ์ต้องเป็นจำนวนเต็มตั้งแต่ 0 ถึง 1,000,000" }, { status: 400 });
      }
      if (typeof payload.isActive !== "boolean") {
        return Response.json({ error: "กรุณาระบุสถานะการแสดงรางวัล" }, { status: 400 });
      }

      if (!sourceReward) {
        const now = new Date().toISOString();
        const reward = {
          id: `reward-${crypto.randomUUID()}`,
          title,
          description,
          category,
          costPoints,
          stock,
          inventoryVersion: 0,
          icon,
          isActive: payload.isActive,
          createdAt: now,
          updatedAt: now,
        };
        const [createdReward] = await db.insert(rewards).values(reward).returning();
        return Response.json({ reward: createdReward }, { status: 201 });
      }

      const expectedUpdatedAt = typeof payload.expectedUpdatedAt === "string" ? payload.expectedUpdatedAt : "";
      const expectedInventoryVersion = payload.expectedInventoryVersion;
      if (!expectedUpdatedAt || typeof expectedInventoryVersion !== "number" || !Number.isInteger(expectedInventoryVersion) || expectedInventoryVersion < 0) {
        return Response.json({ error: "ข้อมูลเวอร์ชันรางวัลไม่ครบ กรุณาโหลดข้อมูลล่าสุดแล้วลองใหม่" }, { status: 400 });
      }
      if (sourceReward.updatedAt !== expectedUpdatedAt || sourceReward.inventoryVersion !== expectedInventoryVersion) {
        return Response.json({ error: "รางวัลหรือจำนวนคงเหลือถูกแก้ไขจากอีกหน้าจอ กรุณาโหลดข้อมูลล่าสุด" }, { status: 409 });
      }
      const sourceUpdatedAt = Date.parse(sourceReward.updatedAt);
      const now = new Date(Math.max(Date.now(), Number.isFinite(sourceUpdatedAt) ? sourceUpdatedAt + 1 : 0)).toISOString();
      const [savedReward] = await db.update(rewards).set({
        title,
        description,
        category,
        costPoints,
        stock,
        inventoryVersion: sourceReward.inventoryVersion + 1,
        icon,
        isActive: payload.isActive,
        updatedAt: now,
      }).where(and(
        eq(rewards.id, sourceReward.id),
        eq(rewards.updatedAt, expectedUpdatedAt),
        eq(rewards.inventoryVersion, expectedInventoryVersion),
      )).returning();
      if (!savedReward) {
        return Response.json({ error: "รางวัลหรือจำนวนคงเหลือถูกแก้ไขจากอีกหน้าจอ กรุณาโหลดข้อมูลล่าสุด" }, { status: 409 });
      }
      return Response.json({ reward: savedReward });
    }

    if (payload.action === "deleteReward") {
      const rewardId = typeof payload.rewardId === "string" ? payload.rewardId.trim().slice(0, 160) : "";
      if (!rewardId) return Response.json({ error: "กรุณาเลือกรางวัลที่ต้องการลบ" }, { status: 400 });
      const [sourceReward] = await db.select().from(rewards).where(eq(rewards.id, rewardId)).limit(1);
      if (!sourceReward) return Response.json({ error: "ไม่พบรางวัลที่เลือก" }, { status: 404 });

      const expectedUpdatedAt = typeof payload.expectedUpdatedAt === "string" ? payload.expectedUpdatedAt : "";
      const expectedInventoryVersion = payload.expectedInventoryVersion;
      if (!expectedUpdatedAt || typeof expectedInventoryVersion !== "number" || !Number.isInteger(expectedInventoryVersion) || expectedInventoryVersion < 0) {
        return Response.json({ error: "ข้อมูลเวอร์ชันรางวัลไม่ครบ กรุณาโหลดข้อมูลล่าสุดแล้วลองใหม่" }, { status: 400 });
      }
      if (sourceReward.updatedAt !== expectedUpdatedAt || sourceReward.inventoryVersion !== expectedInventoryVersion) {
        return Response.json({ error: "รางวัลหรือจำนวนคงเหลือถูกแก้ไขจากอีกหน้าจอ กรุณาโหลดข้อมูลล่าสุด" }, { status: 409 });
      }
      const requiredConfirmation = `ลบรางวัล ${sourceReward.title}`;
      if (typeof payload.confirmation !== "string" || payload.confirmation !== requiredConfirmation) {
        return Response.json({ error: `กรุณาพิมพ์ “${requiredConfirmation}” ให้ถูกต้อง` }, { status: 400 });
      }

      const sourceUpdatedAt = Date.parse(sourceReward.updatedAt);
      const now = new Date(Math.max(Date.now(), Number.isFinite(sourceUpdatedAt) ? sourceUpdatedAt + 1 : 0)).toISOString();
      const [deactivatedReward] = await db.update(rewards).set({
        isActive: false,
        inventoryVersion: sourceReward.inventoryVersion + 1,
        updatedAt: now,
      }).where(and(
        eq(rewards.id, sourceReward.id),
        eq(rewards.updatedAt, expectedUpdatedAt),
        eq(rewards.inventoryVersion, expectedInventoryVersion),
      )).returning();
      if (!deactivatedReward) {
        return Response.json({ error: "รางวัลหรือจำนวนคงเหลือถูกแก้ไขจากอีกหน้าจอ กรุณาโหลดข้อมูลล่าสุด" }, { status: 409 });
      }
      return Response.json({
        deletedRewardId: sourceReward.id,
        reward: deactivatedReward,
        disposition: "deactivated",
        deleted: false,
        deactivated: true,
      });
    }

    if (payload.action === "updateRewardRedemption") {
      const redemptionId = payload.redemptionId?.trim() ?? "";
      const targetStatus = payload.status;
      if (!redemptionId || (targetStatus !== "approved" && targetStatus !== "fulfilled" && targetStatus !== "cancelled")) {
        return Response.json({ error: "กรุณาระบุรายการแลกรางวัลและสถานะที่ถูกต้อง" }, { status: 400 });
      }
      const [redemption] = await db.select().from(rewardRedemptions).where(eq(rewardRedemptions.id, redemptionId)).limit(1);
      if (!redemption) return Response.json({ error: "ไม่พบคำขอแลกรางวัลที่เลือก" }, { status: 404 });
      const [reward] = await db.select().from(rewards).where(eq(rewards.id, redemption.rewardId)).limit(1);
      if (!reward) return Response.json({ error: "ไม่พบรางวัลของคำขอนี้ กรุณาให้ผู้ดูแลตรวจสอบข้อมูล" }, { status: 409 });
      const [spendEntry] = await db.select().from(pointLedger).where(and(eq(pointLedger.sourceType, "redemption"), eq(pointLedger.sourceId, redemption.id))).limit(1);
      if (!spendEntry || spendEntry.employeeId !== redemption.employeeId || spendEntry.points !== -redemption.pointsSpent) {
        return Response.json({ error: "ข้อมูลการหัก Points ของคำขอนี้ไม่สมบูรณ์ จึงยังเปลี่ยนสถานะไม่ได้" }, { status: 409 });
      }
      if (!spendEntry.policyId || spendEntry.policyVersion === null || !spendEntry.policyContentHash) {
        return Response.json({ error: "คำขอนี้ไม่มีข้อมูลกติกา Points อ้างอิง กรุณาให้ HR ตรวจสอบก่อนดำเนินการ" }, { status: 409 });
      }

      const reversalId = `points-redemption-reversal-${redemption.id}`;
      const readReversal = () => db.select().from(pointLedger).where(eq(pointLedger.id, reversalId)).limit(1);
      if (redemption.status === targetStatus) {
        const [pointEntry] = targetStatus === "cancelled" ? await readReversal() : [];
        return Response.json({ redemption, pointEntry: pointEntry ?? null, reward });
      }
      const transitionAllowed = (redemption.status === "requested" && (targetStatus === "approved" || targetStatus === "cancelled"))
        || (redemption.status === "approved" && (targetStatus === "fulfilled" || targetStatus === "cancelled"));
      if (!transitionAllowed) {
        return Response.json({ error: `ไม่สามารถเปลี่ยนสถานะจาก ${redemption.status} เป็น ${targetStatus} ได้ รายการที่ส่งมอบหรือยกเลิกแล้วเป็นสถานะสิ้นสุด` }, { status: 409 });
      }

      const now = new Date().toISOString();
      const policyMetadata = {
        policyId: spendEntry.policyId,
        policyVersion: spendEntry.policyVersion,
        policyContentHash: spendEntry.policyContentHash,
      };
      const transitionClaim = {
        id: `points-redemption-transition-${redemption.id}-${redemption.status}`,
        employeeId: redemption.employeeId,
        sourceType: "redemption" as const,
        sourceId: `redemption-transition:${redemption.id}:${redemption.status}`,
        points: 0,
        note: `บันทึกควบคุมสถานะคำขอแลกรางวัล ${redemption.status} → ${targetStatus}`,
        ...policyMetadata,
        createdAt: now,
      };
      const reversalEntry = targetStatus === "cancelled" ? {
        id: reversalId,
        employeeId: redemption.employeeId,
        sourceType: "redemption" as const,
        sourceId: `redemption-reversal:${redemption.id}`,
        points: redemption.pointsSpent,
        note: `คืน Points จากการยกเลิกคำขอแลกรางวัล: ${reward.title}`,
        ...policyMetadata,
        createdAt: now,
      } : null;

      try {
        if (reversalEntry) {
          await db.batch([
            db.insert(pointLedger).values(transitionClaim),
            db.update(rewardRedemptions).set({ status: targetStatus, updatedAt: now }).where(and(eq(rewardRedemptions.id, redemption.id), eq(rewardRedemptions.status, redemption.status))),
            db.insert(pointLedger).values(reversalEntry),
            db.update(rewards).set({ stock: sql`${rewards.stock} + 1`, inventoryVersion: sql`${rewards.inventoryVersion} + 1`, updatedAt: now }).where(eq(rewards.id, reward.id)),
          ]);
        } else {
          await db.batch([
            db.insert(pointLedger).values(transitionClaim),
            db.update(rewardRedemptions).set({ status: targetStatus, updatedAt: now }).where(and(eq(rewardRedemptions.id, redemption.id), eq(rewardRedemptions.status, redemption.status))),
          ]);
        }
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          const [latestRedemption] = await db.select().from(rewardRedemptions).where(eq(rewardRedemptions.id, redemption.id)).limit(1);
          if (latestRedemption?.status === targetStatus) {
            const [pointEntry] = targetStatus === "cancelled" ? await readReversal() : [];
            const [latestReward] = await db.select().from(rewards).where(eq(rewards.id, reward.id)).limit(1);
            return Response.json({ redemption: latestRedemption, pointEntry: pointEntry ?? null, reward: latestReward ?? reward });
          }
          return Response.json({ error: "มีผู้เปลี่ยนสถานะคำขอนี้พร้อมกัน กรุณาโหลดข้อมูลล่าสุดก่อนดำเนินการต่อ" }, { status: 409 });
        }
        throw error;
      }
      const [[updatedRedemption], [updatedReward], [pointEntry]] = await Promise.all([
        db.select().from(rewardRedemptions).where(eq(rewardRedemptions.id, redemption.id)).limit(1),
        db.select().from(rewards).where(eq(rewards.id, reward.id)).limit(1),
        targetStatus === "cancelled" ? readReversal() : Promise.resolve([]),
      ]);
      return Response.json({ redemption: updatedRedemption, pointEntry: pointEntry ?? null, reward: updatedReward });
    }

    if (payload.action === "redeemReward") {
      const employeeId = payload.employeeId ?? "";
      if (currentUser.role === "employee" && employeeId !== currentUser.employeeId) return Response.json({ error: "ใช้ Points ได้เฉพาะบัญชีของตนเอง" }, { status: 403 });
      if (currentUser.role === "manager" && employeeId !== currentUser.employeeId) return Response.json({ error: "หัวหน้าไม่สามารถใช้ Points แทนสมาชิกในทีมได้" }, { status: 403 });
      if (!(await canAccessEmployee(currentUser, employeeId))) return Response.json({ error: "ไม่มีสิทธิ์ใช้ Points ของพนักงานคนนี้" }, { status: 403 });
      if (!activePointPolicy) return Response.json({ error: "ยังไม่มีกติกา Points ที่ประกาศใช้ จึงยังแลกรางวัลไม่ได้" }, { status: 409 });
      const activePointPolicyHash = await policyIntegrityHash(activePointPolicy);
      if (!activePointPolicy.contentHash || activePointPolicy.contentHash !== activePointPolicyHash) return Response.json({ error: "ตรวจสอบความถูกต้องของกติกา Points ฉบับปัจจุบันไม่ผ่าน กรุณาแจ้ง HR" }, { status: 409 });
      const rewardId = payload.rewardId ?? "";
      const [[employee], [reward], ledgerRows, redemptionRows, acknowledgementRows, employeeClaimRows] = await Promise.all([
        db.select({ id: employees.id }).from(employees).where(and(eq(employees.id, employeeId), eq(employees.status, "active"))).limit(1),
        db.select().from(rewards).where(eq(rewards.id, rewardId)).limit(1),
        db.select({ points: pointLedger.points }).from(pointLedger).where(eq(pointLedger.employeeId, employeeId)),
        db.select().from(rewardRedemptions).where(eq(rewardRedemptions.employeeId, employeeId)),
        activePointPolicy ? db.select().from(policyAcknowledgements).where(and(eq(policyAcknowledgements.policyId, activePointPolicy.id), eq(policyAcknowledgements.policyVersion, activePointPolicy.version), eq(policyAcknowledgements.employeeId, employeeId))) : Promise.resolve([]),
        db.select({ id: rewardRedemptionClaims.id }).from(rewardRedemptionClaims).where(eq(rewardRedemptionClaims.employeeId, employeeId)),
      ]);
      if (!employee || !reward || !reward.isActive) return Response.json({ error: "ไม่พบพนักงานหรือรางวัลที่เลือก" }, { status: 404 });
      const hasCurrentAcknowledgement = acknowledgementRows.some((acknowledgement) => acknowledgement.contentHash === activePointPolicyHash);
      if ((activePointPolicy.acknowledgementRequired || activePointRules.redemption.acknowledgementRequired) && !hasCurrentAcknowledgement) return Response.json({ error: "กรุณาอ่านและกดรับทราบกติกาการใช้ Points ฉบับปัจจุบันก่อนแลกรางวัล" }, { status: 409 });
      if (reward.stock <= 0) return Response.json({ error: "รางวัลนี้หมดแล้ว" }, { status: 409 });
      const balance = ledgerRows.reduce((sum, row) => sum + row.points, 0);
      const requiredBalance = reward.costPoints + activePointRules.redemption.minimumBalanceAfterRedemption;
      if (balance < requiredBalance) return Response.json({ error: `Points ไม่เพียงพอ ต้องมีอย่างน้อย ${requiredBalance.toLocaleString("th-TH")} Points เพื่อรักษายอดคงเหลือตามกติกา` }, { status: 409 });

      const now = new Date().toISOString();
      const activeStatuses = new Set(["requested", "approved", "fulfilled"]);
      const activeRedemptions = redemptionRows.filter((redemption) => activeStatuses.has(redemption.status));
      const month = bangkokMonthFromTimestamp(now) ?? bangkokIsoDay().slice(0, 7);
      const monthlyRedemptions = activeRedemptions.filter((redemption) => bangkokMonthFromTimestamp(redemption.createdAt) === month);
      if (monthlyRedemptions.length >= activePointRules.redemption.maxRedemptionsPerMonth) return Response.json({ error: `เดือนนี้ใช้สิทธิ์แลกรางวัลครบ ${activePointRules.redemption.maxRedemptionsPerMonth} ครั้งแล้ว` }, { status: 409 });
      const latestRedemption = activeRedemptions.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      if (latestRedemption && activePointRules.redemption.cooldownDays > 0) {
        const nextAllowedAt = new Date(latestRedemption.createdAt);
        nextAllowedAt.setUTCDate(nextAllowedAt.getUTCDate() + activePointRules.redemption.cooldownDays);
        if (nextAllowedAt.getTime() > Date.now()) return Response.json({ error: `ต้องเว้น ${activePointRules.redemption.cooldownDays} วันระหว่างการแลกรางวัล ครั้งถัดไปแลกได้วันที่ ${nextAllowedAt.toISOString().slice(0, 10)}` }, { status: 409 });
      }
      const redemptionId = `redemption-${crypto.randomUUID()}`;
      const redemption = { id: redemptionId, employeeId, rewardId, pointsSpent: reward.costPoints, status: "requested" as const, createdAt: now, updatedAt: now };
      const pointEntry = { id: `points-${redemptionId}`, employeeId, sourceType: "redemption" as const, sourceId: redemptionId, points: -reward.costPoints, note: `แลกรางวัล: ${reward.title}`, ...pointPolicyMetadata(activePointPolicy), createdAt: now };
      const redemptionClaim = {
        id: `redemption-claim-${crypto.randomUUID()}`,
        redemptionId,
        employeeId,
        rewardId,
        employeeRequestKey: `${employeeId}:request:${employeeClaimRows.length + 1}`,
        rewardInventoryKey: `${rewardId}:inventory:${reward.inventoryVersion}`,
        expectedInventoryVersion: reward.inventoryVersion,
        requiredBalance,
        maxRedemptionsPerMonth: activePointRules.redemption.maxRedemptionsPerMonth,
        cooldownDays: activePointRules.redemption.cooldownDays,
        requestMonth: month,
        createdAt: now,
      };
      try {
        await db.batch([
          db.insert(rewardRedemptions).values(redemption),
          db.insert(rewardRedemptionClaims).values(redemptionClaim),
          db.insert(pointLedger).values(pointEntry),
          db.update(rewards).set({ stock: reward.stock - 1, inventoryVersion: reward.inventoryVersion + 1, updatedAt: now }).where(and(eq(rewards.id, rewardId), eq(rewards.inventoryVersion, reward.inventoryVersion), eq(rewards.stock, reward.stock))),
          // Abort and roll back the whole D1 batch when the inventory CAS above matched no row.
          // This closes the race where HR edits/deactivates a reward after the employee loaded it.
          db.update(rewards).set({
            title: sql<string>`CASE WHEN changes() = 1 THEN ${rewards.title} ELSE NULL END`,
          }).where(eq(rewards.id, rewardId)),
        ]);
      } catch (error) {
        if (isRedemptionConflictError(error)) return Response.json({ error: "สิทธิ์ ยอด Points หรือสต็อกมีการเปลี่ยนแปลงพร้อมกัน กรุณาโหลดข้อมูลล่าสุดแล้วลองใหม่" }, { status: 409 });
        throw error;
      }
      return Response.json({ redemption, pointEntry, reward: { ...reward, stock: reward.stock - 1, inventoryVersion: reward.inventoryVersion + 1, updatedAt: now } });
    }

    if (payload.action === "saveEmployeeProfile") {
      await ensureEmployeeProfileAudit();
      const employeeId = payload.employeeId ?? "";
      const expectedEmployeeUpdatedAt = payload.expectedEmployeeUpdatedAt?.trim() ?? "";
      const requestedPositionTitle = payload.positionTitle === undefined ? undefined : normalizedPositionTitle(payload.positionTitle);
      const [employee] = await db.select().from(employees).where(eq(employees.id, employeeId)).limit(1);
      if (!employee) return Response.json({ error: "ไม่พบพนักงานที่เลือก" }, { status: 404 });
      if (employee.status === "archived") return Response.json({ error: "แฟ้มที่ลบออกจากรายชื่อแล้วเปิดดูได้อย่างเดียว" }, { status: 409 });
      if (!findRole(employee.roleId)) return Response.json({ error: "โปรไฟล์พนักงานไม่มีกรอบ KPI มาตรฐาน กรุณาให้ HR แก้ไขกรอบตำแหน่งก่อน" }, { status: 409 });
      if (!expectedEmployeeUpdatedAt || employee.updatedAt !== expectedEmployeeUpdatedAt) {
        return Response.json({ error: "แฟ้มนี้ถูกแก้ไขจากอีกหน้าจอ กรุณาโหลดข้อมูลล่าสุด" }, { status: 409 });
      }
      if (requestedPositionTitle === null || (requestedPositionTitle !== undefined && Array.from(requestedPositionTitle).length > 120)) return Response.json({ error: "ชื่อตำแหน่งกำหนดเองต้องไม่เกิน 120 ตัวอักษร" }, { status: 400 });
      const positionTitle = requestedPositionTitle ?? employee.positionTitle;
      const personalEmail = payload.personalEmail?.trim().toLowerCase().slice(0, 160) ?? "";
      if (personalEmail && !personalEmail.includes("@")) return Response.json({ error: "รูปแบบอีเมลส่วนตัวไม่ถูกต้อง" }, { status: 400 });
      const now = new Date(Math.max(Date.now(), Date.parse(employee.updatedAt) + 1)).toISOString();
      const profile = {
        employeeId,
        personalEmail,
        phone: payload.phone?.trim().slice(0, 40) ?? "",
        birthDate: /^\d{4}-\d{2}-\d{2}$/.test(payload.birthDate ?? "") ? payload.birthDate as string : "",
        nationalIdLast4: (payload.nationalIdLast4 ?? "").replace(/\D/g, "").slice(-4),
        address: payload.address?.trim().slice(0, 1000) ?? "",
        emergencyName: payload.emergencyName?.trim().slice(0, 160) ?? "",
        emergencyPhone: payload.emergencyPhone?.trim().slice(0, 40) ?? "",
        startDate: /^\d{4}-\d{2}-\d{2}$/.test(payload.startDate ?? "") ? payload.startDate as string : "",
        employmentType: payload.employmentType ?? "permanent" as const,
        education: payload.education?.trim().slice(0, 500) ?? "",
        experienceYears: Math.min(60, Math.max(0, Math.round(Number(payload.experienceYears) || 0))),
        applicationSource: payload.applicationSource?.trim().slice(0, 160) ?? "",
        updatedAt: now,
      };
      const d1 = getD1();
      const positionChanged = positionTitle !== employee.positionTitle;
      const [previousProfile] = await db.select().from(employeeProfiles).where(eq(employeeProfiles.employeeId, employeeId)).limit(1);
      const positionEvent = positionChanged ? {
        id: `employee-position-${crypto.randomUUID()}`,
        employeeId,
        employeeNameSnapshot: employee.name,
        roleIdSnapshot: employee.roleId,
        previousPositionTitle: employee.positionTitle,
        nextPositionTitle: positionTitle,
        expectedUpdatedAt: expectedEmployeeUpdatedAt,
        resultingUpdatedAt: now,
        actorUserId: currentUser.id,
        actorName: currentUser.displayName,
        createdAt: now,
      } : null;
      try {
        const statements: D1PreparedStatement[] = [
          d1.prepare(`INSERT INTO employee_profiles (
            employee_id, personal_email, phone, birth_date, national_id_last4, address,
            emergency_name, emergency_phone, start_date, employment_type, education,
            experience_years, application_source, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(employee_id) DO UPDATE SET
            personal_email = excluded.personal_email,
            phone = excluded.phone,
            birth_date = excluded.birth_date,
            national_id_last4 = excluded.national_id_last4,
            address = excluded.address,
            emergency_name = excluded.emergency_name,
            emergency_phone = excluded.emergency_phone,
            start_date = excluded.start_date,
            employment_type = excluded.employment_type,
            education = excluded.education,
            experience_years = excluded.experience_years,
            application_source = excluded.application_source,
            updated_at = excluded.updated_at`).bind(
            profile.employeeId,
            profile.personalEmail,
            profile.phone,
            profile.birthDate,
            profile.nationalIdLast4,
            profile.address,
            profile.emergencyName,
            profile.emergencyPhone,
            profile.startDate,
            profile.employmentType,
            profile.education,
            profile.experienceYears,
            profile.applicationSource,
            profile.updatedAt,
          ),
        ];
        if (positionEvent) {
          // The guarded audit insert applies the position change from its AFTER INSERT
          // trigger. A stale employee, invalid actor or missing audit contract aborts
          // and rolls back the profile upsert in the same D1 transaction.
          statements.push(d1.prepare(`INSERT INTO employee_position_events (
            id, employee_id, employee_name_snapshot, role_id_snapshot,
            previous_position_title, next_position_title, expected_updated_at,
            resulting_updated_at, actor_user_id, actor_name, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
            positionEvent.id,
            positionEvent.employeeId,
            positionEvent.employeeNameSnapshot,
            positionEvent.roleIdSnapshot,
            positionEvent.previousPositionTitle,
            positionEvent.nextPositionTitle,
            positionEvent.expectedUpdatedAt,
            positionEvent.resultingUpdatedAt,
            positionEvent.actorUserId,
            positionEvent.actorName,
            positionEvent.createdAt,
          ));
        } else {
          statements.push(
            d1.prepare("UPDATE employees SET updated_at = ? WHERE id = ? AND updated_at = ? AND role_id = ? AND position_title = ? AND status <> 'archived'")
              .bind(now, employeeId, expectedEmployeeUpdatedAt, employee.roleId, employee.positionTitle),
            // The preceding employee CAS must change exactly one row. A stale or
            // archived record violates the NOT NULL name constraint and rolls the
            // profile upsert back with it.
            d1.prepare("UPDATE employees SET name = CASE WHEN changes() = 1 THEN name ELSE NULL END WHERE id = ?")
              .bind(employeeId),
          );
        }
        statements.push(d1.prepare(`INSERT INTO employee_profile_audit
          (id, employee_id, actor_id, actor_name, created_at, before_json, after_json)
          VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(
          crypto.randomUUID(), employeeId, currentUser.id, currentUser.displayName, now,
          JSON.stringify({ ...previousProfile, positionTitle: employee.positionTitle }),
          JSON.stringify({ ...profile, positionTitle }),
        ));
        await d1.batch(statements);
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message.includes("EMPLOYEE_POSITION_") || message.includes("employee_position_events") || message.includes("employees.name") || message.includes("NOT NULL constraint failed") || message.includes("FOREIGN KEY constraint failed")) {
          return Response.json({ error: "แฟ้มนี้ถูกแก้ไขจากอีกหน้าจอ กรุณาโหลดข้อมูลล่าสุด" }, { status: 409 });
        }
        throw error;
      }
      const [savedProfile] = await db.select().from(employeeProfiles).where(eq(employeeProfiles.employeeId, employeeId)).limit(1);
      if (!savedProfile) throw new Error("Employee profile committed without a readable profile row");
      return Response.json({ employeeProfile: employeeProfileWithValidImage(savedProfile), employee: { ...employee, positionTitle, updatedAt: now }, positionEvent });
    }

    if (payload.action === "updateDocumentStatus") {
      const documentId = payload.documentId ?? "";
      const status = payload.status;
      if (status !== "verified" && status !== "rejected") return Response.json({ error: "สถานะเอกสารไม่ถูกต้อง" }, { status: 400 });
      const [document] = await db.select().from(applicationDocuments).where(eq(applicationDocuments.id, documentId)).limit(1);
      if (!document) return Response.json({ error: "ไม่พบเอกสารที่เลือก" }, { status: 404 });
      const actor = authenticatedActor(currentUser);
      const now = new Date().toISOString();
      await db.update(applicationDocuments).set({ status, note: payload.note?.trim().slice(0, 500) ?? "", verifiedBy: actor.name, verifiedAt: now }).where(eq(applicationDocuments.id, documentId));
      return Response.json({ applicationDocument: { ...document, status, note: payload.note?.trim().slice(0, 500) ?? "", verifiedBy: actor.name, verifiedAt: now } });
    }

    if (payload.action === "createContract") {
      const employeeId = payload.employeeId ?? "";
      const [employee] = await db.select({ id: employees.id }).from(employees).where(eq(employees.id, employeeId)).limit(1);
      if (!employee) return Response.json({ error: "ไม่พบพนักงานที่เลือก" }, { status: 404 });
      const title = payload.title?.trim().slice(0, 200) ?? "";
      if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(payload.effectiveDate ?? "")) return Response.json({ error: "กรุณาระบุชื่อสัญญาและวันที่มีผล" }, { status: 400 });
      const documentId = payload.documentId?.trim() || null;
      if (!documentId) return Response.json({ error: "กรุณาอัปโหลดและเลือกไฟล์สัญญาก่อนส่งให้ลงนาม" }, { status: 400 });
      const [document] = await db.select().from(applicationDocuments).where(and(eq(applicationDocuments.id, documentId), eq(applicationDocuments.employeeId, employeeId))).limit(1);
      if (!document || document.documentType !== "contract") return Response.json({ error: "ไฟล์สัญญาไม่ตรงกับพนักงานที่เลือก" }, { status: 400 });
      const actor = authenticatedActor(currentUser);
      const now = new Date().toISOString();
      const status = payload.status ?? "sent";
      const contract = {
        id: `contract-${crypto.randomUUID()}`,
        employeeId,
        documentId,
        title,
        version: payload.version?.trim().slice(0, 30) || "1.0",
        status,
        effectiveDate: payload.effectiveDate as string,
        expiryDate: /^\d{4}-\d{2}-\d{2}$/.test(payload.expiryDate ?? "") ? payload.expiryDate as string : null,
        sentAt: status === "sent" ? now : null,
        signedName: null,
        signedAt: null,
        consentText: "",
        signerUserId: null,
        signerEmail: null,
        createdBy: actor.name,
        createdAt: now,
        updatedAt: now,
      };
      await db.insert(employmentContracts).values(contract);
      return Response.json({ employmentContract: contract }, { status: 201 });
    }

    if (payload.action === "signContract") {
      const contractId = payload.contractId ?? "";
      const [contract] = await db.select().from(employmentContracts).where(eq(employmentContracts.id, contractId)).limit(1);
      if (!contract) return Response.json({ error: "ไม่พบสัญญาที่เลือก" }, { status: 404 });
      if (currentUser.role !== "employee" || !currentUser.employeeId || currentUser.employeeId !== contract.employeeId) return Response.json({ error: "เฉพาะพนักงานเจ้าของสัญญาเท่านั้นที่ลงนามได้ HR และหัวหน้าทีมไม่สามารถลงนามแทน" }, { status: 403 });
      const [employee] = await db.select().from(employees).where(eq(employees.id, contract.employeeId)).limit(1);
      if (!employee) return Response.json({ error: "ไม่พบข้อมูลพนักงานของสัญญา" }, { status: 404 });
      if (contract.status === "signed") return Response.json({ employmentContract: contract });
      if (contract.status !== "sent" && contract.status !== "viewed") return Response.json({ error: "สัญญานี้ยังไม่อยู่ในขั้นตอนลงนาม" }, { status: 409 });
      const signedName = payload.signedName?.replace(/\s+/g, " ").trim() ?? "";
      const expectedName = employee.name.replace(/\s+/g, " ").trim();
      if (!payload.consent || signedName !== expectedName) return Response.json({ error: "กรุณาพิมพ์ชื่อ–นามสกุลให้ตรงกับโปรไฟล์ และยืนยันความยินยอม" }, { status: 400 });
      const actor = authenticatedActor(currentUser);
      const now = new Date().toISOString();
      const consentText = "ข้าพเจ้าได้อ่าน เข้าใจ และยอมรับข้อกำหนดในสัญญาจ้างฉบับนี้ และยืนยันใช้ชื่อที่พิมพ์เป็นลายเซ็นอิเล็กทรอนิกส์";
      await db.update(employmentContracts).set({ status: "signed", signedName, signedAt: now, consentText, signerUserId: actor.userId, signerEmail: actor.email, updatedAt: now }).where(eq(employmentContracts.id, contractId));
      return Response.json({ employmentContract: { ...contract, status: "signed", signedName, signedAt: now, consentText, signerUserId: actor.userId, signerEmail: actor.email, updatedAt: now } });
    }

    if (payload.action === "sendContract") {
      const contractId = payload.contractId ?? "";
      const [contract] = await db.select().from(employmentContracts).where(eq(employmentContracts.id, contractId)).limit(1);
      if (!contract) return Response.json({ error: "ไม่พบสัญญาที่เลือก" }, { status: 404 });
      if (contract.status !== "draft") return Response.json({ error: "ส่งได้เฉพาะสัญญาฉบับร่าง" }, { status: 409 });
      const now = new Date().toISOString();
      await db.update(employmentContracts).set({ status: "sent", sentAt: now, updatedAt: now }).where(eq(employmentContracts.id, contractId));
      return Response.json({ employmentContract: { ...contract, status: "sent", sentAt: now, updatedAt: now } });
    }

    return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 400 });
  } catch (error) {
    return apiError(error);
  }
}
