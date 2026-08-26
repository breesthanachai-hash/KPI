import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { ensureDatabase } from "../../../db/initialize";
import { applicationDocuments, attendanceRecords, employeeProfiles, employees, employmentContracts, evaluations, hrProfiles, notificationReads, pointEvents, pointLedger, projects, rewardRedemptions, rewards, skillAchievements, talentActions, userAccounts, workItems, workSubmissions } from "../../../db/schema";
import { authenticateRequest, authenticatedIdentity, canAccessEmployee, ensureBootstrapAccounts } from "../../../lib/access-control";
import {
  clampScore,
  clampSkillLevel,
  calculateSkillScore,
  getRole,
  makeInitials,
  monthlyEvaluationPoints,
  periods,
  pointEconomyPolicy,
  pointEventRules,
  roleSalaryBands,
  roles,
  seedAttendanceRecords,
  seedEmployees,
  seedApplicationDocuments,
  seedEmployeeProfiles,
  seedEmployeeLegacyRoleIds,
  seedEmploymentContracts,
  seedHrProfiles,
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

  const [existingPointEntry] = await db.select({ id: pointLedger.id }).from(pointLedger).limit(1);
  if (!existingPointEntry) await db.insert(pointLedger).values(seedPointLedger).onConflictDoNothing();

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

export async function GET(request: Request) {
  try {
    await ensureSeedData();
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      const identity = authenticatedIdentity(request);
      return Response.json({ error: "บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้งาน", accessDenied: true, identity: identity ? { email: identity.email, name: identity.name } : null }, { status: 403 });
    }
    const url = new URL(request.url);
    const period = url.searchParams.get("period") ?? periods[0];
    const db = getDb();
    const [employeeRows, evaluationRows, hrProfileRows, attendanceRows, skillAchievementRows, talentActionRows, projectRows, workItemRows, workSubmissionRows, rewardRows, pointRows, pointEventRows, redemptionRows, employeeProfileRows, applicationDocumentRows, employmentContractRows, userAccountRows, notificationReadRows] = await Promise.all([
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
      currentUser.role === "admin" ? db.select().from(userAccounts) : Promise.resolve([]),
      db.select().from(notificationReads).where(eq(notificationReads.userKey, currentUser.id)),
    ]);
    const visibleEmployeeIds = new Set(employeeRows.filter((employee) => {
      if (currentUser.role === "admin") return true;
      if (employee.id === currentUser.employeeId) return true;
      return currentUser.role === "manager" && Boolean(currentUser.departmentId) && getRole(employee.roleId).departmentId === currentUser.departmentId;
    }).map((employee) => employee.id));
    const scopedEmployees = employeeRows.filter((employee) => visibleEmployeeIds.has(employee.id));
    const scopedWorkItems = workItemRows
      .filter((item) => visibleEmployeeIds.has(item.assigneeEmployeeId))
      .map((item) => ({ ...item, points: workPointValue(item.kind, item.priority) }));
    const visibleProjectIds = new Set(scopedWorkItems.map((item) => item.projectId));
    projectRows.filter((project) => visibleEmployeeIds.has(project.ownerEmployeeId)).forEach((project) => visibleProjectIds.add(project.id));
    const permissions = {
      canManageAccounts: currentUser.role === "admin",
      canManagePeople: currentUser.role === "admin",
      canManageWork: currentUser.role !== "employee",
      canReviewWork: currentUser.role !== "employee",
      canViewTeam: currentUser.role !== "employee",
    };
    const visibleProfileImages = employeeProfileRows
      .filter((row) => visibleEmployeeIds.has(row.employeeId))
      .map((row) => ({ employeeId: row.employeeId, profileImageKey: row.profileImageKey, profileImageUpdatedAt: row.profileImageUpdatedAt, updatedAt: row.updatedAt }));
    return Response.json({
      currentUser,
      permissions,
      employees: scopedEmployees,
      evaluations: evaluationRows.filter((row) => visibleEmployeeIds.has(row.employeeId)),
      hrProfiles: currentUser.role === "admin" ? hrProfileRows.filter((row) => visibleEmployeeIds.has(row.employeeId)) : [],
      attendanceRecords: currentUser.role === "admin" ? attendanceRows.filter((row) => visibleEmployeeIds.has(row.employeeId)) : [],
      skillAchievements: currentUser.role === "admin" ? skillAchievementRows.filter((row) => visibleEmployeeIds.has(row.employeeId)) : [],
      talentActions: currentUser.role === "admin" ? talentActionRows.filter((row) => visibleEmployeeIds.has(row.employeeId)) : [],
      projects: projectRows.filter((row) => visibleProjectIds.has(row.id)),
      workItems: scopedWorkItems,
      workSubmissions: workSubmissionRows.filter((row) => visibleEmployeeIds.has(row.employeeId)),
      rewards: rewardRows,
      pointLedger: pointRows.filter((row) => visibleEmployeeIds.has(row.employeeId)),
      pointEvents: pointEventRows.filter((row) => visibleEmployeeIds.has(row.employeeId)),
      rewardRedemptions: redemptionRows.filter((row) => visibleEmployeeIds.has(row.employeeId)),
      employeeProfiles: currentUser.role === "admin" ? employeeProfileRows.filter((row) => visibleEmployeeIds.has(row.employeeId)) : visibleProfileImages,
      applicationDocuments: currentUser.role === "admin" ? applicationDocumentRows.filter((row) => visibleEmployeeIds.has(row.employeeId)) : [],
      employmentContracts: currentUser.role === "admin" ? employmentContractRows.filter((row) => visibleEmployeeIds.has(row.employeeId)) : [],
      userAccounts: userAccountRows,
      notificationReads: notificationReadRows,
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

export async function POST(request: Request) {
  try {
    await ensureSeedData();
    const payload = await request.json() as EmployeePayload | EvaluationPayload | HrPlanPayload | CompleteTalentActionPayload | AttendancePayload | AttendanceApprovalPayload | SkillAchievementPayload | ProjectPayload | WorkItemPayload | ReviewWorkSubmissionPayload | RecordPointEventPayload | RunMonthlyPointCyclePayload | RedeemRewardPayload | EmployeeProfilePayload | DocumentStatusPayload | ContractPayload | SignContractPayload | SendContractPayload | UserAccountPayload | MarkNotificationsReadPayload;
    const db = getDb();
    const currentUser = await authenticateRequest(request);
    if (!currentUser) return Response.json({ error: "บัญชีนี้ไม่มีสิทธิ์ดำเนินการ" }, { status: 403 });
    const adminOnlyActions = new Set(["createEmployee", "saveHrPlan", "verifySkillAchievement", "runMonthlyPointCycle", "saveEmployeeProfile", "updateDocumentStatus", "createContract", "sendContract", "saveUserAccount"]);
    const teamActions = new Set(["saveEvaluation", "completeTalentAction", "approveAttendance", "saveProject", "reviewWorkSubmission", "recordPointEvent"]);
    if (adminOnlyActions.has(payload.action) && currentUser.role !== "admin") return Response.json({ error: "เฉพาะ HR หรือผู้ดูแลระบบเท่านั้น" }, { status: 403 });
    if (teamActions.has(payload.action) && currentUser.role === "employee") return Response.json({ error: "รายการนี้ต้องดำเนินการโดยหัวหน้าทีมหรือ HR" }, { status: 403 });

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
      const period = payload.period ?? periods[0];
      const [employee] = await db.select().from(employees).where(eq(employees.id, employeeId)).limit(1);
      if (!employee) return Response.json({ error: "ไม่พบพนักงานที่เลือก" }, { status: 404 });

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

      await db.insert(evaluations).values(evaluation).onConflictDoUpdate({
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
        await db.update(employees).set({
          latestScore: evaluation.totalScore,
          latestSkillScore: evaluation.skillScore,
          latestPeriod: period,
          updatedAt: now,
        }).where(and(eq(employees.id, employeeId), eq(employees.status, "active")));
      }

      const month = now.slice(0, 7);
      const monthlyPoints = Math.min(1000, Math.max(0, Math.round(evaluation.totalScore * 10)));
      const monthlySourceId = `monthly-evaluation-${month}:${employeeId}`;
      const pointEvent = {
        id: `point-event-${monthlySourceId}`,
        employeeId,
        eventType: "monthly_evaluation" as const,
        points: monthlyPoints,
        eventDate: now.slice(0, 10),
        note: `แต้มประเมินประจำเดือน ${month} จาก ${period} · คะแนนรวม ${evaluation.totalScore}`,
        evidenceUrl: "",
        recordedBy: evaluation.evaluator,
        createdAt: now,
      };
      const pointEntry = {
        id: `points-${monthlySourceId}`,
        employeeId,
        sourceType: "evaluation" as const,
        sourceId: monthlySourceId,
        points: monthlyPoints,
        note: pointEvent.note,
        createdAt: now,
      };
      await db.insert(pointEvents).values(pointEvent).onConflictDoUpdate({
        target: pointEvents.id,
        set: { points: monthlyPoints, eventDate: pointEvent.eventDate, note: pointEvent.note, recordedBy: pointEvent.recordedBy, createdAt: now },
      });
      await db.insert(pointLedger).values(pointEntry).onConflictDoUpdate({
        target: pointLedger.id,
        set: { points: monthlyPoints, note: pointEntry.note, createdAt: now },
      });

      return Response.json({ evaluation, pointEntry, pointEvent });
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
        const status = payload.status === "in_progress" || payload.status === "todo" ? payload.status : assignedWorkItem.status;
        const progress = Math.min(90, Math.max(0, Math.round(Number(payload.progress) || assignedWorkItem.progress)));
        const now = new Date().toISOString();
        await db.update(workItems).set({ status, progress, updatedAt: now }).where(eq(workItems.id, workItemId));
        return Response.json({ workItem: { ...assignedWorkItem, status, progress, points: workPointValue(assignedWorkItem.kind, assignedWorkItem.priority), updatedAt: now }, pointEntry: null });
      }
      const projectId = payload.projectId ?? "";
      const assigneeEmployeeId = payload.assigneeEmployeeId ?? "";
      const title = payload.title?.trim().slice(0, 180) ?? "";
      const [[project], [assignee]] = await Promise.all([
        db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).limit(1),
        db.select({ id: employees.id }).from(employees).where(eq(employees.id, assigneeEmployeeId)).limit(1),
      ]);
      if (!title || !project || !assignee) return Response.json({ error: "กรุณาระบุชื่องาน โปรเจกต์ และผู้รับผิดชอบ" }, { status: 400 });
      if (!(await canAccessEmployee(currentUser, assigneeEmployeeId))) return Response.json({ error: "ไม่มีสิทธิ์มอบหมายงานให้พนักงานคนนี้" }, { status: 403 });
      const now = new Date().toISOString();
      const workItemId = payload.workItemId?.trim() || `work-${crypto.randomUUID()}`;
      const [existingWorkItem] = payload.workItemId ? await db.select().from(workItems).where(eq(workItems.id, workItemId)).limit(1) : [];
      if (existingWorkItem && !(await canAccessEmployee(currentUser, existingWorkItem.assigneeEmployeeId))) return Response.json({ error: "ไม่มีสิทธิ์แก้ไขงานนี้" }, { status: 403 });
      const status = payload.status ?? existingWorkItem?.status ?? "todo";
      const progress = status === "done" ? 100 : Math.min(99, Math.max(0, Math.round(Number(payload.progress) || 0)));
      const kind = payload.kind === "request" || payload.kind === "mission" ? payload.kind : "task";
      const priority = payload.priority === "low" || payload.priority === "high" || payload.priority === "urgent" ? payload.priority : "medium";
      const workItem = {
        id: existingWorkItem?.id ?? workItemId,
        projectId,
        assigneeEmployeeId,
        kind,
        title,
        description: payload.description?.trim().slice(0, 1200) ?? "",
        priority,
        status,
        progress,
        points: workPointValue(kind, priority),
        dueDate: /^\d{4}-\d{2}-\d{2}$/.test(payload.dueDate ?? "") ? payload.dueDate as string : now.slice(0, 10),
        createdAt: existingWorkItem?.createdAt ?? now,
        updatedAt: now,
      };
      await db.insert(workItems).values(workItem).onConflictDoUpdate({
        target: workItems.id,
        set: { projectId: workItem.projectId, assigneeEmployeeId: workItem.assigneeEmployeeId, kind: workItem.kind, title: workItem.title, description: workItem.description, priority: workItem.priority, status: workItem.status, progress: workItem.progress, points: workItem.points, dueDate: workItem.dueDate, updatedAt: now },
      });

      return Response.json({ workItem, pointEntry: null, pointPolicy: "award_after_approved_evidence" });
    }

    if (payload.action === "reviewWorkSubmission") {
      const submissionId = payload.submissionId ?? "";
      const status = payload.status;
      if (status !== "approved" && status !== "revision") return Response.json({ error: "สถานะตรวจหลักฐานไม่ถูกต้อง" }, { status: 400 });
      const [submission] = await db.select().from(workSubmissions).where(eq(workSubmissions.id, submissionId)).limit(1);
      if (!submission) return Response.json({ error: "ไม่พบหลักฐานงานที่เลือก" }, { status: 404 });
      const [workItem] = await db.select().from(workItems).where(eq(workItems.id, submission.workItemId)).limit(1);
      if (!workItem) return Response.json({ error: "ไม่พบงานของหลักฐานรายการนี้" }, { status: 404 });
      if (!(await canAccessEmployee(currentUser, workItem.assigneeEmployeeId))) return Response.json({ error: "ไม่มีสิทธิ์ตรวจผลงานนี้" }, { status: 403 });
      const now = new Date().toISOString();
      const actor = authenticatedActor(request);
      const reviewerNote = payload.reviewerNote?.trim().slice(0, 1000) ?? "";
      const reviewedSubmission = { ...submission, status, reviewedBy: actor.name, reviewedAt: now, reviewerNote };
      await db.update(workSubmissions).set({ status, reviewedBy: actor.name, reviewedAt: now, reviewerNote }).where(eq(workSubmissions.id, submissionId));

      const balancedWorkPoints = workPointValue(workItem.kind, workItem.priority);
      const updatedWorkItem = status === "approved"
        ? { ...workItem, points: balancedWorkPoints, status: "done" as const, progress: 100, updatedAt: now }
        : { ...workItem, points: balancedWorkPoints, status: "in_progress" as const, progress: Math.min(90, workItem.progress), updatedAt: now };
      await db.update(workItems).set({ status: updatedWorkItem.status, progress: updatedWorkItem.progress, points: balancedWorkPoints, updatedAt: now }).where(eq(workItems.id, workItem.id));

      let pointEntry = null;
      let deadlinePointEntry = null;
      let deadlinePointEvent = null;
      const approvedWorkPoints = balancedWorkPoints;
      if (status === "approved" && approvedWorkPoints > 0) {
        const sourceType = workItem.kind === "mission" ? "mission" as const : "task" as const;
        const pointId = `points-${workItem.id}`;
        await db.insert(pointLedger).values({ id: pointId, employeeId: workItem.assigneeEmployeeId, sourceType, sourceId: workItem.id, points: approvedWorkPoints, note: `อนุมัติหลักฐานและปิด${workItem.kind === "mission" ? "ภารกิจ" : "งาน"}: ${workItem.title}`, createdAt: now }).onConflictDoNothing();
        [pointEntry] = await db.select().from(pointLedger).where(eq(pointLedger.id, pointId)).limit(1);
      }
      const completionDate = now.slice(0, 10);
      if (status === "approved" && completionDate <= workItem.dueDate) {
        const eventType = completionDate < workItem.dueDate ? "early_finish" as const : "on_time_finish" as const;
        const rule = pointEventRules[eventType];
        const eventId = `point-event-deadline-${workItem.id}`;
        const event = { id: eventId, employeeId: workItem.assigneeEmployeeId, eventType, points: rule.points ?? 0, eventDate: completionDate, note: `${rule.label}: ${workItem.title}`, evidenceUrl: submission.linkUrl, recordedBy: actor.name, createdAt: now };
        const entry = { id: `points-deadline-${workItem.id}`, employeeId: workItem.assigneeEmployeeId, sourceType: "deadline" as const, sourceId: `deadline-${workItem.id}`, points: rule.points ?? 0, note: event.note, createdAt: now };
        await db.insert(pointEvents).values(event).onConflictDoNothing();
        await db.insert(pointLedger).values(entry).onConflictDoNothing();
        [deadlinePointEvent] = await db.select().from(pointEvents).where(eq(pointEvents.id, eventId)).limit(1);
        [deadlinePointEntry] = await db.select().from(pointLedger).where(eq(pointLedger.id, entry.id)).limit(1);
      }
      return Response.json({ workSubmission: reviewedSubmission, workItem: updatedWorkItem, pointEntry, deadlinePointEntry, deadlinePointEvent });
    }

    if (payload.action === "recordPointEvent") {
      const employeeId = payload.employeeId ?? "";
      if (!(await canAccessEmployee(currentUser, employeeId))) return Response.json({ error: "ไม่มีสิทธิ์บันทึกแต้มให้พนักงานคนนี้" }, { status: 403 });
      const eventType = payload.eventType;
      const eventDate = /^\d{4}-\d{2}-\d{2}$/.test(payload.eventDate ?? "") ? payload.eventDate as string : "";
      const note = payload.note?.trim().slice(0, 1000) ?? "";
      const evidenceUrl = payload.evidenceUrl?.trim().slice(0, 1200) ?? "";
      if (!eventType || !(eventType in pointEventRules) || eventType === "monthly_evaluation") return Response.json({ error: "ประเภทเหตุการณ์แต้มไม่ถูกต้อง" }, { status: 400 });
      if (!eventDate || !note) return Response.json({ error: "กรุณาระบุวันที่และเหตุผลของรายการแต้ม" }, { status: 400 });
      if (!isSafeOptionalUrl(evidenceUrl)) return Response.json({ error: "ลิงก์หลักฐานต้องขึ้นต้นด้วย http:// หรือ https://" }, { status: 400 });
      const [employee] = await db.select({ id: employees.id }).from(employees).where(and(eq(employees.id, employeeId), eq(employees.status, "active"))).limit(1);
      if (!employee) return Response.json({ error: "ไม่พบพนักงานที่เลือก" }, { status: 404 });
      const rule = pointEventRules[eventType];
      if (rule.points === null) return Response.json({ error: "รายการนี้ต้องประมวลผลจากรอบประเมิน" }, { status: 400 });
      if ((eventType === "bonus" || eventType === "quest") && !evidenceUrl) return Response.json({ error: "โบนัสและเควสต์ต้องแนบลิงก์หลักฐานก่อนให้แต้ม" }, { status: 400 });
      const employeeEventRows = await db.select().from(pointEvents).where(eq(pointEvents.employeeId, employeeId));
      const attendanceTypes: PointEventType[] = ["attendance_on_time", "attendance_late", "absence", "approved_leave"];
      if (attendanceTypes.includes(eventType) && employeeEventRows.some((event) => attendanceTypes.includes(event.eventType) && event.eventDate === eventDate)) {
        return Response.json({ error: "วันนี้มีรายการเวลาเข้างานของพนักงานคนนี้แล้ว จึงไม่สามารถรับหรือหักแต้มซ้ำได้" }, { status: 409 });
      }
      if ((eventType === "bonus" || eventType === "quest") && employeeEventRows.filter((event) => event.eventType === eventType && event.eventDate.startsWith(eventDate.slice(0, 7))).length >= pointEconomyPolicy.positiveManualEventsPerMonth) {
        return Response.json({ error: `${rule.label} ให้ได้สูงสุด ${pointEconomyPolicy.positiveManualEventsPerMonth} ครั้งต่อเดือน` }, { status: 409 });
      }
      const actor = authenticatedActor(request);
      const now = new Date().toISOString();
      const eventId = `point-event-${crypto.randomUUID()}`;
      const pointEvent = { id: eventId, employeeId, eventType, points: rule.points, eventDate, note, evidenceUrl, recordedBy: actor.name, createdAt: now };
      const pointEntry = { id: `points-${eventId}`, employeeId, sourceType: rule.sourceType, sourceId: eventId, points: rule.points, note: `${rule.label}: ${note}`, createdAt: now };
      await db.insert(pointEvents).values(pointEvent);
      await db.insert(pointLedger).values(pointEntry);
      return Response.json({ pointEvent, pointEntry }, { status: 201 });
    }

    if (payload.action === "runMonthlyPointCycle") {
      const month = /^\d{4}-\d{2}$/.test(payload.month ?? "") ? payload.month as string : new Date().toISOString().slice(0, 7);
      const selectedPeriod = payload.period ?? periods[0];
      const [evaluationRows, activeEmployeeRows] = await Promise.all([
        db.select().from(evaluations).where(eq(evaluations.period, selectedPeriod)),
        db.select({ id: employees.id }).from(employees).where(eq(employees.status, "active")),
      ]);
      const activeIds = new Set(activeEmployeeRows.map((employee) => employee.id));
      const eligible = evaluationRows.filter((evaluation) => activeIds.has(evaluation.employeeId) && evaluation.totalScore >= pointEconomyPolicy.monthlyEvaluationMinimumScore);
      if (!eligible.length) return Response.json({ error: `ยังไม่มีผลประเมินที่ผ่านเกณฑ์ ${pointEconomyPolicy.monthlyEvaluationMinimumScore} คะแนน` }, { status: 409 });
      const existingMonthlyEvents = await db.select({ id: pointEvents.id }).from(pointEvents).where(and(eq(pointEvents.eventDate, `${month}-01`), eq(pointEvents.eventType, "monthly_evaluation")));
      if (existingMonthlyEvents.length) return Response.json({ error: "เดือนนี้ประมวลผลแต้มประเมินแล้ว ไม่สามารถบันทึกซ้ำได้" }, { status: 409 });
      const actor = authenticatedActor(request);
      const now = new Date().toISOString();
      const pointEntryRows: PointLedgerRecord[] = [];
      const pointEventRows: PointEventRecord[] = [];
      for (const evaluation of eligible) {
        const monthlyPoints = monthlyEvaluationPoints(evaluation.totalScore);
        const monthlySourceId = `monthly-evaluation-${month}:${evaluation.employeeId}`;
        const event = {
          id: `point-event-${monthlySourceId}`,
          employeeId: evaluation.employeeId,
          eventType: "monthly_evaluation" as const,
          points: monthlyPoints,
          eventDate: `${month}-01`,
          note: `แต้มประเมินประจำเดือน ${month} จาก ${selectedPeriod} · คะแนนรวม ${evaluation.totalScore}`,
          evidenceUrl: "",
          recordedBy: actor.name,
          createdAt: now,
        };
        const entry = {
          id: `points-${monthlySourceId}`,
          employeeId: evaluation.employeeId,
          sourceType: "evaluation" as const,
          sourceId: monthlySourceId,
          points: monthlyPoints,
          note: event.note,
          createdAt: now,
        };
        await db.insert(pointEvents).values(event).onConflictDoUpdate({ target: pointEvents.id, set: { points: monthlyPoints, note: event.note, recordedBy: actor.name, createdAt: now } });
        await db.insert(pointLedger).values(entry).onConflictDoUpdate({ target: pointLedger.id, set: { points: monthlyPoints, note: entry.note, createdAt: now } });
        pointEventRows.push(event);
        pointEntryRows.push(entry);
      }
      return Response.json({ pointEvents: pointEventRows, pointEntries: pointEntryRows, month, count: pointEntryRows.length });
    }

    if (payload.action === "redeemReward") {
      const employeeId = payload.employeeId ?? "";
      if (currentUser.role === "employee" && employeeId !== currentUser.employeeId) return Response.json({ error: "ใช้แต้มได้เฉพาะบัญชีของตนเอง" }, { status: 403 });
      if (!(await canAccessEmployee(currentUser, employeeId))) return Response.json({ error: "ไม่มีสิทธิ์ใช้แต้มของพนักงานคนนี้" }, { status: 403 });
      const rewardId = payload.rewardId ?? "";
      const [[employee], [reward], ledgerRows] = await Promise.all([
        db.select({ id: employees.id }).from(employees).where(eq(employees.id, employeeId)).limit(1),
        db.select().from(rewards).where(eq(rewards.id, rewardId)).limit(1),
        db.select({ points: pointLedger.points }).from(pointLedger).where(eq(pointLedger.employeeId, employeeId)),
      ]);
      if (!employee || !reward || !reward.isActive) return Response.json({ error: "ไม่พบพนักงานหรือรางวัลที่เลือก" }, { status: 404 });
      if (reward.stock <= 0) return Response.json({ error: "รางวัลนี้หมดแล้ว" }, { status: 409 });
      const balance = ledgerRows.reduce((sum, row) => sum + row.points, 0);
      if (balance < reward.costPoints) return Response.json({ error: `แต้มไม่เพียงพอ ต้องการอีก ${reward.costPoints - balance} แต้ม` }, { status: 409 });

      const now = new Date().toISOString();
      const redemptionId = `redemption-${crypto.randomUUID()}`;
      const redemption = { id: redemptionId, employeeId, rewardId, pointsSpent: reward.costPoints, status: "requested" as const, createdAt: now, updatedAt: now };
      const pointEntry = { id: `points-${redemptionId}`, employeeId, sourceType: "redemption" as const, sourceId: redemptionId, points: -reward.costPoints, note: `แลกรางวัล: ${reward.title}`, createdAt: now };
      await db.insert(rewardRedemptions).values(redemption);
      await db.insert(pointLedger).values(pointEntry);
      await db.update(rewards).set({ stock: reward.stock - 1, updatedAt: now }).where(eq(rewards.id, rewardId));
      return Response.json({ redemption, pointEntry, reward: { ...reward, stock: reward.stock - 1, updatedAt: now } });
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
      if (!(await canAccessEmployee(currentUser, contract.employeeId)) || (currentUser.role === "employee" && currentUser.employeeId !== contract.employeeId)) return Response.json({ error: "ไม่มีสิทธิ์ลงนามสัญญานี้" }, { status: 403 });
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
