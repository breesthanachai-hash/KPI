import { and, eq, notExists, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { ensureDatabase } from "../../../db/initialize";
import { applicationDocuments, attendanceRecords, employeeProfiles, employees, employmentContracts, evaluations, hrProfiles, notificationReads, organizationPolicies, organizationPolicyPublishClaims, pointCapClaims, pointEvents, pointLedger, pointMutationClaims, policyAcknowledgements, projects, rewardRedemptionClaims, rewardRedemptions, rewards, skillAchievements, talentActions, userAccounts, workItems, workSubmissions } from "../../../db/schema";
import { authenticateRequest, authenticatedIdentity, canAccessEmployee, ensureBootstrapAccounts } from "../../../lib/access-control";
import {
  clampScore,
  clampSkillLevel,
  calculateSkillScore,
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
  skillAllowanceFor,
  workPointValue,
  type PointEventRecord,
  type PointEventType,
  type PointLedgerRecord,
  type UserAccountRecord,
} from "../../../lib/kpi-data";

export const dynamic = "force-dynamic";

function apiError(error: unknown) {
  const message = error instanceof Error ? error.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ";
  if (message.includes("no such table")) {
    return Response.json({ error: "ฐานข้อมูลยังไม่พร้อม กรุณาเผยแพร่เวอร์ชันที่มี migration ล่าสุด" }, { status: 503 });
  }
  if (message.includes("UNIQUE constraint failed")) {
    return Response.json({ error: "อีเมลนี้มีอยู่ในระบบแล้ว" }, { status: 409 });
  }
  return Response.json({ error: message }, { status: 500 });
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

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

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

function isUniqueConstraintError(error: unknown) {
  return error instanceof Error && error.message.includes("UNIQUE constraint failed");
}

function isRedemptionConflictError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return isUniqueConstraintError(error) || error.message.includes("REDEMPTION_");
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

function authenticatedActor(request: Request) {
  const userId = request.headers.get("oai-authenticated-user-id") ?? "local-admin";
  const email = request.headers.get("oai-authenticated-user-email") ?? "hr@peoplepulse.local";
  const encodedName = request.headers.get("oai-authenticated-user-full-name");
  const encoding = request.headers.get("oai-authenticated-user-full-name-encoding");
  if (encodedName && encoding === "percent-encoded-utf-8") {
    try {
      return { userId, email, name: decodeURIComponent(encodedName) };
    } catch {
      // Fall back to the authenticated email when the optional name is malformed.
    }
  }
  return { userId, email, name: email === "hr@peoplepulse.local" ? "ฝ่ายทรัพยากรบุคคล" : email };
}

function evaluatorName(request: Request) {
  return authenticatedActor(request).name;
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

function isPolicyEffective(policy: OrganizationPolicyRow, day: string) {
  return policy.status === "published" && policy.effectiveDate <= day && (!policy.effectiveTo || policy.effectiveTo >= day);
}

function pointPolicyFromRows(policyRows: OrganizationPolicyRow[], day = bangkokIsoDay()) {
  const policy = policyRows
    .filter((row) => row.code === "points-and-rewards" && row.category === "points_rewards" && row.scopeType === "all" && isPolicyEffective(row, day))
    .sort((a, b) => b.version - a.version)[0] ?? null;
  return { policy, rules: resolvePointPolicyRules(policy?.rules ?? defaultPointPolicyRules) };
}

function policyAppliesToEmployee(
  policy: OrganizationPolicyRow,
  employee: typeof employees.$inferSelect | null,
  employeeProfile: typeof employeeProfiles.$inferSelect | null,
) {
  if (policy.scopeType === "all") return true;
  if (!employee) return false;
  if (policy.scopeType === "department") return policy.scopeValues.includes(getRole(employee.roleId).departmentId);
  if (policy.scopeType === "role") return policy.scopeValues.includes(employee.roleId);
  return Boolean(employeeProfile && policy.scopeValues.includes(employeeProfile.employmentType));
}

function previousIsoDay(day: string) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  try {
    await ensureSeedData();
    const authenticatedUser = await authenticateRequest(request);
    if (!authenticatedUser) {
      const identity = authenticatedIdentity(request);
      return Response.json({ error: "บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้งาน", accessDenied: true, identity: identity ? { email: identity.email, name: identity.name } : null }, { status: 403 });
    }
    const url = new URL(request.url);
    const period = url.searchParams.get("period") ?? periods[0];
    const requestedPreviewEmployeeId = url.searchParams.get("previewEmployeeId")?.trim() ?? "";
    const isEmployeePreviewRequest = authenticatedUser.role === "admin" && Boolean(requestedPreviewEmployeeId);
    const db = getDb();
    const [employeeRows, evaluationRows, hrProfileRows, attendanceRows, skillAchievementRows, talentActionRows, projectRows, workItemRows, workSubmissionRows, rewardRows, pointRows, pointEventRows, redemptionRows, employeeProfileRows, applicationDocumentRows, employmentContractRows, organizationPolicyRows, policyAcknowledgementRows, userAccountRows, notificationReadRows] = await Promise.all([
      db.select().from(employees),
      db.select().from(evaluations).where(eq(evaluations.period, period)),
      db.select().from(hrProfiles),
      db.select().from(attendanceRecords),
      db.select().from(skillAchievements),
      db.select().from(talentActions),
      db.select().from(projects),
      db.select().from(workItems),
      db.select().from(workSubmissions),
      db.select().from(rewards),
      db.select().from(pointLedger),
      db.select().from(pointEvents),
      db.select().from(rewardRedemptions),
      db.select().from(employeeProfiles),
      db.select().from(applicationDocuments),
      db.select().from(employmentContracts),
      db.select().from(organizationPolicies),
      db.select().from(policyAcknowledgements),
      authenticatedUser.role === "admin" && !isEmployeePreviewRequest ? db.select().from(userAccounts) : Promise.resolve([]),
      isEmployeePreviewRequest ? Promise.resolve([]) : db.select().from(notificationReads).where(eq(notificationReads.userKey, authenticatedUser.id)),
    ]);
    let currentUser = authenticatedUser;
    let employeePreview: { employeeId: string; readOnly: true; launchedBy: string } | null = null;
    if (isEmployeePreviewRequest) {
      const previewEmployee = employeeRows.find((employee) => employee.id === requestedPreviewEmployeeId && employee.status === "active");
      if (!previewEmployee) {
        return Response.json({ error: "ไม่พบโปรไฟล์พนักงานที่ใช้งานอยู่สำหรับโหมดทดลอง" }, { status: 404 });
      }
      currentUser = {
        id: `employee-preview:${previewEmployee.id}`,
        authUserId: "",
        email: previewEmployee.email,
        displayName: previewEmployee.name,
        role: "employee",
        employeeId: previewEmployee.id,
        departmentId: getRole(previewEmployee.roleId).departmentId,
        status: "active",
        lastLoginAt: null,
        createdBy: "โหมดทดลอง",
        createdAt: previewEmployee.createdAt,
        updatedAt: previewEmployee.updatedAt,
        authenticatedName: previewEmployee.name,
      };
      employeePreview = {
        employeeId: previewEmployee.id,
        readOnly: true,
        launchedBy: authenticatedUser.displayName,
      };
    }
    const visibleEmployeeIds = new Set(employeeRows.filter((employee) => {
      if (currentUser.role === "admin") return true;
      if (employee.id === currentUser.employeeId) return true;
      return currentUser.role === "manager" && Boolean(currentUser.departmentId) && getRole(employee.roleId).departmentId === currentUser.departmentId;
    }).map((employee) => employee.id));
    const signedInEmployee = currentUser.employeeId ? employeeRows.find((employee) => employee.id === currentUser.employeeId) ?? null : null;
    const signedInEmployeeProfile = signedInEmployee ? employeeProfileRows.find((profile) => profile.employeeId === signedInEmployee.id) ?? null : null;
    if (currentUser.role === "employee" && (!signedInEmployee || signedInEmployee.status !== "active")) {
      return Response.json({ error: "บัญชีพนักงานยังไม่ได้ผูกกับโปรไฟล์ที่ใช้งานอยู่", accessDenied: true, identity: { email: currentUser.email, name: currentUser.displayName } }, { status: 403 });
    }
    const employeeDepartmentId = currentUser.departmentId || (signedInEmployee ? getRole(signedInEmployee.roleId).departmentId : "");
    const teamOverviewEmployeeIds = new Set(employeeRows.filter((employee) => {
      if (currentUser.role !== "employee") return visibleEmployeeIds.has(employee.id);
      return employee.status === "active" && Boolean(employeeDepartmentId) && getRole(employee.roleId).departmentId === employeeDepartmentId;
    }).map((employee) => employee.id));
    const scopedEmployees = employeeRows.filter((employee) => visibleEmployeeIds.has(employee.id));
    const policyDay = bangkokIsoDay();
    const { policy: activePointPolicy, rules: activePointRules } = pointPolicyFromRows(organizationPolicyRows, policyDay);
    const visibleOrganizationPolicies = organizationPolicyRows
      .filter((policy) => currentUser.role === "admin" || (isPolicyEffective(policy, policyDay) && policyAppliesToEmployee(policy, signedInEmployee, signedInEmployeeProfile)))
      .sort((a, b) => a.category.localeCompare(b.category) || b.version - a.version);
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
      .filter((item) => visibleEmployeeIds.has(item.assigneeEmployeeId))
      .map((item) => ({ ...item, points: workPointValue(item.kind, item.priority, activePointRules) }));
    const visibleProjectIds = new Set(scopedWorkItems.map((item) => item.projectId));
    projectRows.filter((project) => visibleEmployeeIds.has(project.ownerEmployeeId)).forEach((project) => visibleProjectIds.add(project.id));
    const permissions = {
      canManageAccounts: currentUser.role === "admin",
      canManagePeople: currentUser.role === "admin",
      canManageWork: currentUser.role !== "employee",
      canReviewWork: currentUser.role !== "employee",
      canViewTeam: currentUser.role !== "employee",
      canViewTeamOverview: currentUser.role !== "employee" || Boolean(currentUser.employeeId),
      canViewOwnGrowth: currentUser.role !== "employee" || Boolean(currentUser.employeeId),
      canViewOwnRewards: currentUser.role !== "employee" || Boolean(currentUser.employeeId),
      canManagePolicies: currentUser.role === "admin",
      canAcknowledgePolicies: Boolean(currentUser.employeeId) && !employeePreview,
    };
    const visibleProfileImages = employeeProfileRows
      .filter((row) => visibleEmployeeIds.has(row.employeeId))
      .map((row) => ({ employeeId: row.employeeId, profileImageKey: row.profileImageKey, profileImageUpdatedAt: row.profileImageUpdatedAt, updatedAt: row.updatedAt }));
    const teamOverviewDate = new Date().toISOString().slice(0, 10);
    const employeePortalTeamOverview = currentUser.role === "employee" ? {
      employees: employeeRows
        .filter((employee) => teamOverviewEmployeeIds.has(employee.id))
        .map((employee) => ({ ...employee, email: "", manager: "" })),
      evaluations: evaluationRows
        .filter((row) => teamOverviewEmployeeIds.has(row.employeeId))
        .map((row) => ({ ...row, id: `team-power:${row.employeeId}:${row.period}`, kpiScores: {}, note: "", evaluator: "" })),
      workItems: workItemRows
        .filter((item) => teamOverviewEmployeeIds.has(item.assigneeEmployeeId))
        .map((item, index) => ({
          ...item,
          id: `team-load:${item.assigneeEmployeeId}:${index}`,
          projectId: "team-overview",
          title: item.kind === "mission" ? "ภารกิจของทีม" : item.kind === "request" ? "คำขอของทีม" : "งานของทีม",
          description: "",
          points: 0,
          dueDate: item.dueDate < teamOverviewDate ? "2000-01-01" : item.dueDate === teamOverviewDate ? teamOverviewDate : "2999-12-31",
          createdAt: "",
          updatedAt: "",
        })),
    } : { employees: [], evaluations: [], workItems: [] };
    return Response.json({
      currentUser,
      employeePreview,
      permissions,
      teamOverview: employeePortalTeamOverview,
      employees: scopedEmployees,
      evaluations: evaluationRows.filter((row) => visibleEmployeeIds.has(row.employeeId)),
      hrProfiles: currentUser.role === "admin" || currentUser.role === "employee" ? hrProfileRows.filter((row) => visibleEmployeeIds.has(row.employeeId)) : [],
      attendanceRecords: currentUser.role === "admin" || currentUser.role === "employee" ? attendanceRows.filter((row) => visibleEmployeeIds.has(row.employeeId)) : [],
      skillAchievements: currentUser.role === "admin" || currentUser.role === "employee" ? skillAchievementRows.filter((row) => visibleEmployeeIds.has(row.employeeId)) : [],
      talentActions: currentUser.role === "admin" || currentUser.role === "employee" ? talentActionRows.filter((row) => visibleEmployeeIds.has(row.employeeId)) : [],
      projects: projectRows.filter((row) => visibleProjectIds.has(row.id)),
      workItems: scopedWorkItems,
      workSubmissions: workSubmissionRows.filter((row) => visibleEmployeeIds.has(row.employeeId)),
      rewards: rewardRows,
      pointLedger: pointRows.filter((row) => visibleEmployeeIds.has(row.employeeId)),
      pointEvents: pointEventRows.filter((row) => visibleEmployeeIds.has(row.employeeId)),
      rewardRedemptions: redemptionRows.filter((row) => visibleEmployeeIds.has(row.employeeId)),
      employeeProfiles: currentUser.role === "admin" ? employeeProfileRows.filter((row) => visibleEmployeeIds.has(row.employeeId)) : visibleProfileImages,
      applicationDocuments: visibleApplicationDocuments,
      employmentContracts: visibleEmploymentContracts,
      userAccounts: currentUser.role === "admin" ? userAccountRows : [],
      notificationReads: employeePreview ? [] : notificationReadRows,
      organizationPolicies: visibleOrganizationPolicies,
      policyAcknowledgements: visiblePolicyAcknowledgements,
      launchReadiness,
      activePointPolicyId: activePointPolicy?.id ?? null,
      pointPolicyRules: activePointRules,
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
  manager?: string;
};

type EvaluationPayload = {
  action: "saveEvaluation";
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

type EmployeeProfilePayload = {
  action: "saveEmployeeProfile";
  employeeId?: string;
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
  email?: string;
  displayName?: string;
  role?: "admin" | "manager" | "employee";
  employeeId?: string;
  departmentId?: string;
  status?: "active" | "inactive";
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
    await ensureSeedData();
    const payload = await request.json() as EmployeePayload | EvaluationPayload | HrPlanPayload | CompleteTalentActionPayload | AttendancePayload | AttendanceApprovalPayload | SkillAchievementPayload | ProjectPayload | WorkItemPayload | ReviewWorkSubmissionPayload | RecordPointEventPayload | RunMonthlyPointCyclePayload | RedeemRewardPayload | UpdateRewardRedemptionPayload | EmployeeProfilePayload | DocumentStatusPayload | ContractPayload | SignContractPayload | SendContractPayload | UserAccountPayload | MarkNotificationsReadPayload | SaveOrganizationPolicyPayload | PublishOrganizationPolicyPayload | AcknowledgeOrganizationPolicyPayload;
    const db = getDb();
    const currentUser = await authenticateRequest(request);
    if (!currentUser) return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์ดำเนินการ" }, { status: 403 });
    const pointPolicyRows = await db.select().from(organizationPolicies);
    const { policy: activePointPolicy, rules: activePointRules } = pointPolicyFromRows(pointPolicyRows);
    const adminOnlyActions = new Set(["createEmployee", "saveHrPlan", "verifySkillAchievement", "runMonthlyPointCycle", "saveEmployeeProfile", "updateDocumentStatus", "createContract", "sendContract", "saveUserAccount", "saveOrganizationPolicy", "publishOrganizationPolicy", "updateRewardRedemption"]);
    const teamActions = new Set(["saveEvaluation", "completeTalentAction", "approveAttendance", "saveProject", "reviewWorkSubmission", "recordPointEvent"]);
    const employeePortalActions = new Set(["markNotificationsRead", "saveWorkItem", "redeemReward", "acknowledgeOrganizationPolicy", "signContract"]);
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
      const actor = authenticatedActor(request);
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
        return Response.json({ error: "กติกาแต้มและรางวัลต้องใช้กับพนักงานทุกคนเท่านั้น กรุณาบันทึกร่างใหม่เป็นขอบเขตทั้งองค์กร" }, { status: 409 });
      }
      if (draft.category === "points_rewards" && !draft.acknowledgementRequired) {
        return Response.json({ error: "กติกาแต้มและรางวัลต้องกำหนดให้พนักงานกดรับทราบก่อนประกาศ กรุณาบันทึกร่างใหม่" }, { status: 409 });
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
      const actor = authenticatedActor(request);
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
      const actor = authenticatedActor(request);
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

    if (payload.action === "saveUserAccount") {
      const email = payload.email?.trim().toLowerCase() ?? "";
      const displayName = payload.displayName?.trim().slice(0, 120) ?? "";
      const role = payload.role ?? "employee";
      const status = payload.status ?? "active";
      const employeeId = role === "admin" ? null : payload.employeeId?.trim() || null;
      if (!email || !email.includes("@") || !displayName) return Response.json({ error: "กรุณากรอกชื่อและอีเมลสำหรับเข้าสู่ระบบ" }, { status: 400 });
      if (role !== "admin" && !employeeId) return Response.json({ error: "บัญชีพนักงานและหัวหน้าทีมต้องผูกกับโปรไฟล์พนักงาน" }, { status: 400 });
      const [linkedEmployee] = employeeId ? await db.select().from(employees).where(eq(employees.id, employeeId)).limit(1) : [];
      if (employeeId && !linkedEmployee) return Response.json({ error: "ไม่พบโปรไฟล์พนักงานที่เลือก" }, { status: 404 });
      const accountId = payload.accountId?.trim() || `user-${crypto.randomUUID()}`;
      const [existing] = payload.accountId ? await db.select().from(userAccounts).where(eq(userAccounts.id, accountId)).limit(1) : [];
      if (existing?.id === currentUser.id && (status !== "active" || role !== "admin")) return Response.json({ error: "ไม่สามารถปิดหรือเปลี่ยนสิทธิ์บัญชีที่กำลังใช้งานอยู่" }, { status: 409 });
      const now = new Date().toISOString();
      const departmentId = role === "manager" ? payload.departmentId?.trim() || (linkedEmployee ? getRole(linkedEmployee.roleId).departmentId : "") : "";
      const userAccount: UserAccountRecord = {
        id: existing?.id ?? accountId,
        authUserId: existing && existing.email === email ? existing.authUserId : "",
        email,
        displayName,
        role,
        employeeId,
        departmentId,
        status,
        lastLoginAt: existing?.lastLoginAt ?? null,
        createdBy: existing?.createdBy ?? currentUser.authenticatedName,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await db.insert(userAccounts).values(userAccount).onConflictDoUpdate({ target: userAccounts.id, set: { authUserId: userAccount.authUserId, email, displayName, role, employeeId, departmentId, status, updatedAt: now } });
      return Response.json({ userAccount }, { status: existing ? 200 : 201 });
    }

    if (payload.action === "createEmployee") {
      const name = payload.name?.trim() ?? "";
      const email = payload.email?.trim().toLowerCase() ?? "";
      const roleId = payload.roleId ?? "";
      const manager = payload.manager?.trim() ?? "";
      if (!name || !email || !email.includes("@") || !roles.some((role) => role.id === roleId)) {
        return Response.json({ error: "กรุณากรอกชื่อ อีเมล และตำแหน่งให้ครบถ้วน" }, { status: 400 });
      }

      const now = new Date().toISOString();
      const employee = {
        id: `emp-${crypto.randomUUID()}`,
        initials: makeInitials(name),
        name,
        email,
        roleId,
        manager,
        status: "active" as const,
        latestScore: null,
        latestSkillScore: null,
        latestPeriod: null,
        createdAt: now,
        updatedAt: now,
      };
      await db.insert(employees).values(employee);
      const hrProfile = {
        employeeId: employee.id,
        currentSalary: roleSalaryBands[roleId].mid,
        salaryReviewMonth: "มกราคม 2570",
        updatedAt: now,
      };
      await db.insert(hrProfiles).values(hrProfile);
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
      await db.insert(employeeProfiles).values(employeeProfile);
      return Response.json({ employee, hrProfile, employeeProfile }, { status: 201 });
    }

    if (payload.action === "saveEvaluation") {
      const employeeId = payload.employeeId ?? "";
      if (!(await canAccessEmployee(currentUser, employeeId))) return Response.json({ error: "ไม่มีสิทธิ์ประเมินพนักงานคนนี้" }, { status: 403 });
      if (currentUser.employeeId === employeeId) return Response.json({ error: "ผู้ใช้ไม่สามารถประเมินตนเองหรือให้แต้มจากผลประเมินตนเองได้ กรุณาให้ HR คนอื่นเป็นผู้ประเมิน" }, { status: 403 });
      const period = payload.period ?? periods[0];
      const [employee] = await db.select().from(employees).where(and(eq(employees.id, employeeId), eq(employees.status, "active"))).limit(1);
      if (!employee) return Response.json({ error: "ไม่พบพนักงานที่กำลังใช้งานอยู่ จึงไม่สามารถบันทึกผลประเมินได้" }, { status: 404 });

      const role = getRole(employee.roleId);
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
        evaluator: evaluatorName(request),
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

      return Response.json({ evaluation, pointEntry: null, pointEvent: null, pointWarning: "บันทึกผลประเมินแล้ว แต้มจะถูกคำนวณแบบครั้งเดียวเมื่อ HR ประมวลผลรอบแต้มรายเดือน" });
    }

    if (payload.action === "saveHrPlan") {
      const employeeId = payload.employeeId ?? "";
      if (!(await canAccessEmployee(currentUser, employeeId))) return Response.json({ error: "ไม่มีสิทธิ์เข้าถึงข้อมูลพนักงานคนนี้" }, { status: 403 });
      const [employee] = await db.select().from(employees).where(eq(employees.id, employeeId)).limit(1);
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
      const actor = evaluatorName(request);
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
      await db.update(attendanceRecords).set({ approvalStatus, approvedBy: evaluatorName(request), approvedAt: now, updatedAt: now }).where(eq(attendanceRecords.id, attendanceId));
      const [attendanceRecord] = await db.select().from(attendanceRecords).where(eq(attendanceRecords.id, attendanceId)).limit(1);
      return Response.json({ attendanceRecord });
    }

    if (payload.action === "verifySkillAchievement") {
      const employeeId = payload.employeeId ?? "";
      const [employee] = await db.select().from(employees).where(eq(employees.id, employeeId)).limit(1);
      if (!employee) return Response.json({ error: "ไม่พบพนักงานที่เลือก" }, { status: 404 });
      const role = getRole(employee.roleId);
      const skill = role.skills.find((item) => item.id === payload.skillId);
      const level = Math.max(1, Math.min(5, Math.round(Number(payload.level) || 0)));
      if (!skill || level < 2) return Response.json({ error: "กรุณาเลือกสกิลและระดับที่ผ่านการยืนยัน" }, { status: 400 });
      if (skill.eligibleForAllowance === false) return Response.json({ error: "สมรรถนะพฤติกรรมใช้ประกอบการประเมินและแผนพัฒนา แต่ไม่เพิ่มเงินเดือนโดยอัตโนมัติ" }, { status: 400 });
      if (!isSafeOptionalUrl(payload.evidenceUrl?.trim() ?? "")) return Response.json({ error: "ลิงก์หลักฐานต้องขึ้นต้นด้วย http หรือ https" }, { status: 400 });
      const [evaluation] = await db.select().from(evaluations).where(and(eq(evaluations.employeeId, employeeId), eq(evaluations.period, periods[0]))).limit(1);
      const evaluatedLevel = Number(evaluation?.skillScores?.[skill.id] ?? 0);
      if (evaluatedLevel < level) return Response.json({ error: `ผลประเมินล่าสุดของ ${skill.name} ยังไม่ถึงระดับ ${level}` }, { status: 400 });
      const [duplicate] = await db.select().from(skillAchievements).where(and(eq(skillAchievements.employeeId, employeeId), and(eq(skillAchievements.skillId, skill.id), eq(skillAchievements.level, level)))).limit(1);
      if (duplicate) return Response.json({ error: "ระดับสกิลนี้ได้รับเงินเพิ่มแล้ว ระบบไม่เพิ่มซ้ำ" }, { status: 409 });
      const now = new Date().toISOString();
      const allowance = skillAllowanceFor(role.id, level);
      const verifier = evaluatorName(request);
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
      const [profile] = await db.select().from(hrProfiles).where(eq(hrProfiles.employeeId, employeeId)).limit(1);
      const hrProfile = {
        employeeId,
        currentSalary: Math.round((profile?.currentSalary ?? roleSalaryBands[role.id].mid) + allowance),
        salaryReviewMonth: profile?.salaryReviewMonth || "รอบถัดไปตามนโยบายบริษัท",
        updatedAt: now,
      };
      const talentAction = {
        id: `action-${crypto.randomUUID()}`,
        employeeId,
        type: "salary_review" as const,
        title: `ยืนยัน ${skill.name} ระดับ ${level} · เพิ่ม ฿${allowance.toLocaleString("th-TH")}/เดือน`,
        status: "completed" as const,
        score: level * 20,
        dueDate: now.slice(0, 10),
        targetRoleId: role.id,
        createdAt: now,
        updatedAt: now,
      };
      await db.batch([
        db.insert(skillAchievements).values(achievement),
        db.insert(hrProfiles).values(hrProfile).onConflictDoUpdate({ target: hrProfiles.employeeId, set: { currentSalary: hrProfile.currentSalary, updatedAt: now } }),
        db.insert(talentActions).values(talentAction),
      ]);
      return Response.json({ skillAchievement: achievement, hrProfile, talentAction });
    }

    if (payload.action === "saveProject") {
      const name = payload.name?.trim().slice(0, 120) ?? "";
      const ownerEmployeeId = payload.ownerEmployeeId ?? "";
      const [owner] = await db.select().from(employees).where(eq(employees.id, ownerEmployeeId)).limit(1);
      if (!name || !owner) return Response.json({ error: "กรุณาระบุชื่อโปรเจกต์และเจ้าของโปรเจกต์" }, { status: 400 });
      if (!(await canAccessEmployee(currentUser, ownerEmployeeId))) return Response.json({ error: "ไม่มีสิทธิ์สร้างโปรเจกต์ให้พนักงานคนนี้" }, { status: 403 });
      const now = new Date().toISOString();
      const projectId = payload.projectId?.trim() || `project-${crypto.randomUUID()}`;
      const [existingProject] = payload.projectId ? await db.select().from(projects).where(eq(projects.id, projectId)).limit(1) : [];
      if (existingProject && !(await canAccessEmployee(currentUser, existingProject.ownerEmployeeId))) return Response.json({ error: "ไม่มีสิทธิ์แก้ไขโปรเจกต์นี้" }, { status: 403 });
      const project = {
        id: existingProject?.id ?? projectId,
        name,
        description: payload.description?.trim().slice(0, 1000) ?? "",
        ownerEmployeeId,
        departmentId: payload.departmentId?.trim().slice(0, 80) || getRole(owner.roleId).departmentId,
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
        const workItemId = payload.workItemId?.trim() ?? "";
        const [assignedWorkItem] = workItemId ? await db.select().from(workItems).where(eq(workItems.id, workItemId)).limit(1) : [];
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
        return Response.json({ workItem: { ...savedWorkItem, points: workPointValue(savedWorkItem.kind, savedWorkItem.priority, activePointRules) }, pointEntry: null });
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
        db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).limit(1),
        db.select({ id: employees.id }).from(employees).where(and(eq(employees.id, assigneeEmployeeId), eq(employees.status, "active"))).limit(1),
      ]);
      if (!title || !project || !assignee) return Response.json({ error: "กรุณาระบุชื่องาน โปรเจกต์ และผู้รับผิดชอบที่กำลังใช้งานอยู่" }, { status: 400 });
      if (!(await canAccessEmployee(currentUser, assigneeEmployeeId))) return Response.json({ error: "ไม่มีสิทธิ์มอบหมายงานให้พนักงานคนนี้" }, { status: 403 });
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
        kind,
        title,
        description: payload.description === undefined ? existingWorkItem?.description ?? "" : payload.description.trim().slice(0, 1200),
        priority,
        status,
        progress,
        points: workPointValue(kind, priority, activePointRules),
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
      if (submission.status !== "submitted") return Response.json({ error: "หลักฐานรายการนี้ถูกตรวจแล้ว ไม่สามารถเปลี่ยนผลตรวจหรือให้แต้มซ้ำได้" }, { status: 409 });
      const [workItem] = await db.select().from(workItems).where(eq(workItems.id, submission.workItemId)).limit(1);
      if (!workItem) return Response.json({ error: "ไม่พบงานของหลักฐานรายการนี้" }, { status: 404 });
      if (submission.employeeId !== workItem.assigneeEmployeeId) return Response.json({ error: "ข้อมูลผู้ส่งหลักฐานไม่ตรงกับผู้รับผิดชอบงาน กรุณาให้ HR ตรวจสอบ" }, { status: 409 });
      if (workItem.status !== "review") return Response.json({ error: "งานนี้ไม่ได้อยู่ในสถานะรอตรวจ จึงยังตรวจหลักฐานไม่ได้" }, { status: 409 });
      if (!(await canAccessEmployee(currentUser, workItem.assigneeEmployeeId))) return Response.json({ error: "ไม่มีสิทธิ์ตรวจผลงานนี้" }, { status: 403 });
      if (currentUser.employeeId === workItem.assigneeEmployeeId) return Response.json({ error: "ผู้รับผิดชอบงานไม่สามารถตรวจหรืออนุมัติผลงานของตนเองได้ กรุณาให้ผู้ตรวจคนอื่นหรือ HR ดำเนินการ" }, { status: 403 });
      const submissionDate = bangkokIsoDayFromTimestamp(submission.submittedAt) ?? bangkokIsoDay();
      const { policy: workPointPolicy, rules: workPointPolicyRules } = pointPolicyFromRows(pointPolicyRows, submissionDate);
      if (status === "approved" && !workPointPolicy) return Response.json({ error: "ไม่มีกติกาแต้มที่ประกาศใช้ในวันที่ส่งงาน จึงยังอนุมัติผลงานไม่ได้" }, { status: 409 });
      if (status === "approved" && workPointPolicy && (!workPointPolicy.contentHash || workPointPolicy.contentHash !== await policyIntegrityHash(workPointPolicy))) {
        return Response.json({ error: "ตรวจสอบความถูกต้องของกติกาแต้มที่ใช้ในวันที่ส่งงานไม่ผ่าน กรุณาให้ HR ประกาศฉบับแก้ไขก่อนอนุมัติ" }, { status: 409 });
      }
      const now = new Date().toISOString();
      const actor = authenticatedActor(request);
      const reviewerNote = payload.reviewerNote?.trim().slice(0, 1000) ?? "";
      const completionMonth = submissionDate.slice(0, 7);
      const [employeeLedgerRows, employeePointEventRows, employeeCapClaimRows] = await Promise.all([
        db.select().from(pointLedger).where(eq(pointLedger.employeeId, workItem.assigneeEmployeeId)),
        status === "approved" ? db.select().from(pointEvents).where(eq(pointEvents.employeeId, workItem.assigneeEmployeeId)) : Promise.resolve([]),
        db.select({ id: pointCapClaims.id }).from(pointCapClaims).where(and(eq(pointCapClaims.employeeId, workItem.assigneeEmployeeId), eq(pointCapClaims.claimMonth, completionMonth))),
      ]);
      const reviewedSubmission = { ...submission, status, reviewedBy: actor.name, reviewedAt: now, reviewerNote };
      const balancedWorkPoints = status === "approved" ? workPointValue(workItem.kind, workItem.priority, workPointPolicyRules) : workItem.points;
      const updatedWorkItem = status === "approved"
        ? { ...workItem, points: balancedWorkPoints, status: "done" as const, progress: 100, updatedAt: now }
        : { ...workItem, points: balancedWorkPoints, status: "in_progress" as const, progress: Math.min(90, workItem.progress), updatedAt: now };

      let pointEntry = null;
      let deadlinePointEntry = null;
      let deadlinePointEvent = null;
      let pointCapMessage: string | null = null;
      const policyMetadata = pointPolicyMetadata(workPointPolicy);
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
      const approvedWorkPoints = existingWorkPoint ? existingWorkPoint.points : balancedWorkPoints <= workCapRemaining && balancedWorkPoints <= standardCapRemaining ? balancedWorkPoints : 0;
      if (!existingWorkPoint && approvedWorkPoints < balancedWorkPoints) {
        pointCapMessage = `งานผ่านแล้ว แต่พักแต้มรายการนี้ไว้เพราะครบเพดานแต้มงาน ${workPointEconomyPolicy.workAwardsMonthlyCap} แต้มต่อเดือน หรือเพดานแต้มบวกมาตรฐาน ${workPointEconomyPolicy.standardEarnMonthlyCap} แต้ม ระบบไม่ตัดเป็นแต้มเศษ`;
      }
      const sourceType = workItem.kind === "mission" ? "mission" as const : "task" as const;
      const pointId = `points-${workItem.id}`;
      const newWorkPointEntry = !existingWorkPoint && approvedWorkPoints > 0 ? { id: pointId, employeeId: workItem.assigneeEmployeeId, sourceType, sourceId: workItem.id, points: approvedWorkPoints, note: `อนุมัติหลักฐานและปิด${workItem.kind === "mission" ? "ภารกิจ" : "งาน"}: ${workItem.title}`, ...policyMetadata, createdAt: submission.submittedAt } : null;

      let newDeadlineEvent: typeof pointEvents.$inferInsert | null = null;
      let newDeadlinePointEntry: typeof pointLedger.$inferInsert | null = null;
      if (submissionDate <= workItem.dueDate) {
        const eventType = submissionDate < workItem.dueDate ? "early_finish" as const : "on_time_finish" as const;
        const rule = workPointPolicyRules.events[eventType];
        const eventId = `point-event-deadline-${workItem.id}`;
        const existingDeadlineEvent = employeePointEventRows.find((event) => event.id === eventId);
        const existingDeadlinePointEntry = employeeLedgerRows.find((entry) => entry.id === `points-deadline-${workItem.id}`);
        const deadlinePointsThisMonth = employeePointEventRows.filter((event) => (event.eventType === "early_finish" || event.eventType === "on_time_finish") && event.eventDate.startsWith(completionMonth) && event.points > 0).reduce((sum, event) => sum + event.points, 0);
        const deadlinePoints = rule.points ?? 0;
        const mayAwardDeadline = Boolean(existingDeadlineEvent || existingDeadlinePointEntry) || (deadlinePointsThisMonth + deadlinePoints <= workPointEconomyPolicy.deadlineBonusMonthlyCap && workPointsThisMonth + positiveEventsThisMonth + approvedWorkPoints + deadlinePoints <= workPointEconomyPolicy.standardEarnMonthlyCap);
        if (mayAwardDeadline) {
          const event = { id: eventId, employeeId: workItem.assigneeEmployeeId, eventType, points: deadlinePoints, eventDate: submissionDate, note: `${rule.label}: ${workItem.title}`, evidenceUrl: submission.linkUrl, recordedBy: actor.name, ...policyMetadata, createdAt: now };
          const entry = { id: `points-deadline-${workItem.id}`, employeeId: workItem.assigneeEmployeeId, sourceType: "deadline" as const, sourceId: `deadline-${workItem.id}`, points: deadlinePoints, note: event.note, ...policyMetadata, createdAt: now };
          newDeadlineEvent = existingDeadlineEvent ? null : event;
          newDeadlinePointEntry = existingDeadlinePointEntry ? null : entry;
        } else {
          pointCapMessage = [pointCapMessage, `งานผ่านแล้ว แต่ไม่ได้โบนัสกำหนดส่งเพิ่ม เพราะครบเพดาน ${workPointEconomyPolicy.deadlineBonusMonthlyCap} แต้มต่อเดือน`].filter(Boolean).join(" · ");
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
        if (isUniqueConstraintError(error)) return Response.json({ error: "มีการตรวจงานหรือคำนวณเพดานแต้มของพนักงานคนนี้พร้อมกัน กรุณาโหลดข้อมูลล่าสุดแล้วลองใหม่" }, { status: 409 });
        throw error;
      }
      [pointEntry] = await db.select().from(pointLedger).where(eq(pointLedger.id, pointId)).limit(1);
      [deadlinePointEvent] = await db.select().from(pointEvents).where(eq(pointEvents.id, `point-event-deadline-${workItem.id}`)).limit(1);
      [deadlinePointEntry] = await db.select().from(pointLedger).where(eq(pointLedger.id, `points-deadline-${workItem.id}`)).limit(1);
      return Response.json({ workSubmission: reviewedSubmission, workItem: updatedWorkItem, pointEntry, deadlinePointEntry, deadlinePointEvent, pointCapMessage });
    }

    if (payload.action === "recordPointEvent") {
      const employeeId = payload.employeeId ?? "";
      if (!(await canAccessEmployee(currentUser, employeeId))) return Response.json({ error: "ไม่มีสิทธิ์บันทึกแต้มให้พนักงานคนนี้" }, { status: 403 });
      if (currentUser.employeeId === employeeId) return Response.json({ error: "ผู้ใช้ไม่สามารถให้หรือหักแต้มของตนเองได้ กรุณาให้ HR คนอื่นเป็นผู้ตรวจสอบ" }, { status: 403 });
      const eventType = payload.eventType;
      const eventDate = /^\d{4}-\d{2}-\d{2}$/.test(payload.eventDate ?? "") ? payload.eventDate as string : "";
      const note = payload.note?.trim().slice(0, 1000) ?? "";
      const evidenceUrl = payload.evidenceUrl?.trim().slice(0, 1200) ?? "";
      if (!eventDate || !note) return Response.json({ error: "กรุณาระบุวันที่และเหตุผลของรายการแต้ม" }, { status: 400 });
      const today = bangkokIsoDay();
      if (eventDate > today) return Response.json({ error: "ไม่สามารถบันทึกเหตุการณ์แต้มล่วงหน้าได้" }, { status: 400 });
      const maximumBackdateDays = currentUser.role === "admin" ? 90 : 7;
      if (isoDayDistance(eventDate, today) > maximumBackdateDays) return Response.json({ error: `${currentUser.role === "admin" ? "HR" : "หัวหน้าทีม"} บันทึกย้อนหลังได้ไม่เกิน ${maximumBackdateDays} วัน` }, { status: 409 });
      if (!isSafeOptionalUrl(evidenceUrl)) return Response.json({ error: "ลิงก์หลักฐานต้องขึ้นต้นด้วย http:// หรือ https://" }, { status: 400 });
      const [employee] = await db.select({ id: employees.id }).from(employees).where(and(eq(employees.id, employeeId), eq(employees.status, "active"))).limit(1);
      if (!employee) return Response.json({ error: "ไม่พบพนักงานที่เลือก" }, { status: 404 });
      const { policy: eventPointPolicy, rules: eventPointPolicyRules } = pointPolicyFromRows(pointPolicyRows, eventDate);
      if (!eventPointPolicy) return Response.json({ error: "ไม่มีกติกาแต้มที่ประกาศใช้สำหรับวันที่เกิดเหตุการณ์ จึงยังบันทึกแต้มไม่ได้" }, { status: 409 });
      if (!eventPointPolicy.contentHash || eventPointPolicy.contentHash !== await policyIntegrityHash(eventPointPolicy)) return Response.json({ error: "ตรวจสอบความถูกต้องของกติกาแต้มในวันที่เกิดเหตุการณ์ไม่ผ่าน กรุณาให้ HR ตรวจสอบก่อนบันทึก" }, { status: 409 });
      const historicalPointEventRules = eventPointPolicyRules.events;
      const eventPointEconomyPolicy = eventPointPolicyRules.economy;
      const eventMonth = eventDate.slice(0, 7);
      if (!eventType || !(eventType in historicalPointEventRules) || eventType === "monthly_evaluation") return Response.json({ error: "ประเภทเหตุการณ์แต้มไม่ถูกต้อง" }, { status: 400 });
      const rule = historicalPointEventRules[eventType];
      if (rule.points === null) return Response.json({ error: "รายการนี้ต้องประมวลผลจากรอบประเมิน" }, { status: 400 });
      if (rule.entryMode !== "manual") return Response.json({ error: `${rule.label} เป็นรายการอัตโนมัติ ระบบจะบันทึกหลังตรวจหลักฐานหรือประมวลผลรอบเท่านั้น` }, { status: 409 });
      if (currentUser.role === "employee" || !rule.authorizedRoles.includes(currentUser.role)) return Response.json({ error: `${rule.label} ต้องดำเนินการโดย ${rule.authorizedRoles.includes("admin") && rule.authorizedRoles.length === 1 ? "HR เท่านั้น" : "หัวหน้าทีมหรือ HR"}` }, { status: 403 });
      if (rule.requiresEvidence && !evidenceUrl) return Response.json({ error: `${rule.label} ต้องแนบลิงก์หลักฐานก่อนบันทึกแต้ม` }, { status: 400 });
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
          return Response.json({ error: "รายการแต้มเวลาเข้างานต้องตรงกับข้อมูลลงเวลาและสถานะอนุมัติของวันนั้น" }, { status: 409 });
        }
      }
      if (attendanceTypes.includes(eventType) && employeeEventRows.some((event) => attendanceTypes.includes(event.eventType) && event.eventDate === eventDate)) {
        return Response.json({ error: "วันนี้มีรายการเวลาเข้างานของพนักงานคนนี้แล้ว จึงไม่สามารถรับหรือหักแต้มซ้ำได้" }, { status: 409 });
      }
      if (eventType === "attendance_on_time" && employeeEventRows.filter((event) => event.eventType === "attendance_on_time" && event.eventDate.startsWith(eventMonth)).length >= eventPointEconomyPolicy.attendanceDaysPerMonth) {
        return Response.json({ error: `แต้มเข้างานตรงเวลาครบเพดาน ${eventPointEconomyPolicy.attendanceDaysPerMonth} วันของเดือนนี้แล้ว` }, { status: 409 });
      }
      const disciplineTypes: PointEventType[] = ["warning", "rule_violation"];
      if (disciplineTypes.includes(eventType) && employeeEventRows.some((event) => disciplineTypes.includes(event.eventType) && event.eventDate === eventDate)) {
        return Response.json({ error: "วันนี้มีรายการวินัยแล้ว ไม่สามารถหักแต้มวินัยซ้ำในวันเดียวกันได้" }, { status: 409 });
      }
      if ((eventType === "bonus" || eventType === "quest") && employeeEventRows.filter((event) => event.eventType === eventType && event.eventDate.startsWith(eventDate.slice(0, 7))).length >= eventPointEconomyPolicy.positiveManualEventsPerMonth) {
        return Response.json({ error: `${rule.label} ให้ได้สูงสุด ${eventPointEconomyPolicy.positiveManualEventsPerMonth} ครั้งต่อเดือน` }, { status: 409 });
      }
      const negativePointsThisMonth = employeeEventRows.filter((event) => event.eventDate.startsWith(eventMonth) && event.points < 0).reduce((sum, event) => sum + Math.abs(event.points), 0);
      if (rule.points < 0 && negativePointsThisMonth + Math.abs(rule.points) > eventPointEconomyPolicy.negativePointsPerMonthCap) {
        return Response.json({ error: `แต้มลบเดือนนี้ถึงเพดาน ${eventPointEconomyPolicy.negativePointsPerMonthCap} แต้มแล้ว ให้ใช้กระบวนการ HR และการอุทธรณ์แทนการหักเพิ่ม` }, { status: 409 });
      }
      const positiveEventsThisMonth = employeeEventRows.filter((event) => event.eventDate.startsWith(eventMonth) && event.eventType !== "monthly_evaluation" && event.points > 0).reduce((sum, event) => sum + event.points, 0);
      const workAwardsThisMonth = employeeLedgerRows.filter((entry) => (entry.sourceType === "task" || entry.sourceType === "mission") && bangkokMonthFromTimestamp(entry.createdAt) === eventMonth && entry.points > 0).reduce((sum, entry) => sum + entry.points, 0);
      if (rule.points > 0 && positiveEventsThisMonth + workAwardsThisMonth + rule.points > eventPointEconomyPolicy.standardEarnMonthlyCap) {
        return Response.json({ error: `แต้มบวกมาตรฐานเดือนนี้ถึงเพดาน ${eventPointEconomyPolicy.standardEarnMonthlyCap} แต้มแล้ว` }, { status: 409 });
      }
      const actor = authenticatedActor(request);
      const now = new Date().toISOString();
      const eventId = `point-event-${crypto.randomUUID()}`;
      const policyMetadata = pointPolicyMetadata(eventPointPolicy);
      const pointEvent = { id: eventId, employeeId, eventType, points: rule.points, eventDate, note, evidenceUrl, recordedBy: actor.name, ...policyMetadata, createdAt: now };
      const pointEntry = { id: `points-${eventId}`, employeeId, sourceType: rule.sourceType, sourceId: eventId, points: rule.points, note: `${rule.label}: ${note}`, ...policyMetadata, createdAt: now };
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
        if (isUniqueConstraintError(error)) return Response.json({ error: "มีการบันทึกแต้มของพนักงานคนนี้พร้อมกัน กรุณาโหลดข้อมูลล่าสุดเพื่อตรวจเพดานแล้วลองใหม่" }, { status: 409 });
        throw error;
      }
      return Response.json({ pointEvent, pointEntry }, { status: 201 });
    }

    if (payload.action === "runMonthlyPointCycle") {
      const month = /^\d{4}-\d{2}$/.test(payload.month ?? "") ? payload.month as string : bangkokIsoDay().slice(0, 7);
      const selectedPeriod = payload.period ?? periods[0];
      const monthlyEventDate = `${month}-01`;
      const { policy: monthlyPointPolicy, rules: monthlyPointPolicyRules } = pointPolicyFromRows(pointPolicyRows, monthlyEventDate);
      if (!monthlyPointPolicy) return Response.json({ error: "ไม่มีกติกาแต้มที่ประกาศใช้สำหรับเดือนนี้ จึงยังประมวลผลแต้มไม่ได้" }, { status: 409 });
      if (!monthlyPointPolicy.contentHash || monthlyPointPolicy.contentHash !== await policyIntegrityHash(monthlyPointPolicy)) return Response.json({ error: "ตรวจสอบความถูกต้องของกติกาแต้มสำหรับรอบเดือนนี้ไม่ผ่าน กรุณาให้ HR ตรวจสอบก่อนประมวลผล" }, { status: 409 });
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
        return Response.json({ error: "เดือนนี้ประมวลผลแต้มประเมินครบแล้ว ไม่สามารถบันทึกซ้ำได้" }, { status: 409 });
      }
      const actor = authenticatedActor(request);
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
          note: `แต้มประเมินประจำเดือน ${month} จาก ${selectedPeriod} · คะแนนรวม ${evaluation.totalScore}`,
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
        return Response.json({ error: "ข้อมูลการหักแต้มของคำขอนี้ไม่สมบูรณ์ จึงยังเปลี่ยนสถานะไม่ได้" }, { status: 409 });
      }
      if (!spendEntry.policyId || spendEntry.policyVersion === null || !spendEntry.policyContentHash) {
        return Response.json({ error: "คำขอนี้ไม่มีข้อมูลกติกาแต้มอ้างอิง กรุณาให้ HR ตรวจสอบก่อนดำเนินการ" }, { status: 409 });
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
        note: `คืนแต้มจากการยกเลิกคำขอแลกรางวัล: ${reward.title}`,
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
      if (currentUser.role === "employee" && employeeId !== currentUser.employeeId) return Response.json({ error: "ใช้แต้มได้เฉพาะบัญชีของตนเอง" }, { status: 403 });
      if (currentUser.role === "manager" && employeeId !== currentUser.employeeId) return Response.json({ error: "หัวหน้าไม่สามารถใช้แต้มแทนสมาชิกในทีมได้" }, { status: 403 });
      if (!(await canAccessEmployee(currentUser, employeeId))) return Response.json({ error: "ไม่มีสิทธิ์ใช้แต้มของพนักงานคนนี้" }, { status: 403 });
      if (!activePointPolicy) return Response.json({ error: "ยังไม่มีกติกาแต้มที่ประกาศใช้ จึงยังแลกรางวัลไม่ได้" }, { status: 409 });
      const activePointPolicyHash = await policyIntegrityHash(activePointPolicy);
      if (!activePointPolicy.contentHash || activePointPolicy.contentHash !== activePointPolicyHash) return Response.json({ error: "ตรวจสอบความถูกต้องของกติกาแต้มฉบับปัจจุบันไม่ผ่าน กรุณาแจ้ง HR" }, { status: 409 });
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
      if ((activePointPolicy.acknowledgementRequired || activePointRules.redemption.acknowledgementRequired) && !hasCurrentAcknowledgement) return Response.json({ error: "กรุณาอ่านและกดรับทราบกติกาการใช้แต้มฉบับปัจจุบันก่อนแลกรางวัล" }, { status: 409 });
      if (reward.stock <= 0) return Response.json({ error: "รางวัลนี้หมดแล้ว" }, { status: 409 });
      const balance = ledgerRows.reduce((sum, row) => sum + row.points, 0);
      const requiredBalance = reward.costPoints + activePointRules.redemption.minimumBalanceAfterRedemption;
      if (balance < requiredBalance) return Response.json({ error: `แต้มไม่เพียงพอ ต้องมีอย่างน้อย ${requiredBalance.toLocaleString("th-TH")} แต้มเพื่อรักษายอดคงเหลือตามกติกา` }, { status: 409 });

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
        ]);
      } catch (error) {
        if (isRedemptionConflictError(error)) return Response.json({ error: "สิทธิ์ แต้ม หรือสต็อกมีการเปลี่ยนแปลงพร้อมกัน กรุณาโหลดข้อมูลล่าสุดแล้วลองใหม่" }, { status: 409 });
        throw error;
      }
      return Response.json({ redemption, pointEntry, reward: { ...reward, stock: reward.stock - 1, inventoryVersion: reward.inventoryVersion + 1, updatedAt: now } });
    }

    if (payload.action === "saveEmployeeProfile") {
      const employeeId = payload.employeeId ?? "";
      const [employee] = await db.select({ id: employees.id }).from(employees).where(eq(employees.id, employeeId)).limit(1);
      if (!employee) return Response.json({ error: "ไม่พบพนักงานที่เลือก" }, { status: 404 });
      const personalEmail = payload.personalEmail?.trim().toLowerCase().slice(0, 160) ?? "";
      if (personalEmail && !personalEmail.includes("@")) return Response.json({ error: "รูปแบบอีเมลส่วนตัวไม่ถูกต้อง" }, { status: 400 });
      const now = new Date().toISOString();
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
      await db.insert(employeeProfiles).values(profile).onConflictDoUpdate({
        target: employeeProfiles.employeeId,
        set: { ...profile, employeeId: undefined },
      });
      return Response.json({ employeeProfile: profile });
    }

    if (payload.action === "updateDocumentStatus") {
      const documentId = payload.documentId ?? "";
      const status = payload.status;
      if (status !== "verified" && status !== "rejected") return Response.json({ error: "สถานะเอกสารไม่ถูกต้อง" }, { status: 400 });
      const [document] = await db.select().from(applicationDocuments).where(eq(applicationDocuments.id, documentId)).limit(1);
      if (!document) return Response.json({ error: "ไม่พบเอกสารที่เลือก" }, { status: 404 });
      const actor = authenticatedActor(request);
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
      const actor = authenticatedActor(request);
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
      const actor = authenticatedActor(request);
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
