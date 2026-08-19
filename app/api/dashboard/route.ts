import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { ensureDatabase } from "../../../db/initialize";
import { applicationDocuments, employeeProfiles, employees, employmentContracts, evaluations, hrProfiles, pointLedger, projects, rewardRedemptions, rewards, talentActions, workItems, workSubmissions } from "../../../db/schema";
import {
  clampScore,
  clampSkillLevel,
  getRole,
  makeInitials,
  periods,
  roleSalaryBands,
  roles,
  seedEmployees,
  seedApplicationDocuments,
  seedEmployeeProfiles,
  seedEmploymentContracts,
  seedHrProfiles,
  seedPointLedger,
  seedProjects,
  seedRewardRedemptions,
  seedRewards,
  seedTalentActions,
  seedWorkItems,
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

async function ensureSeedData() {
  await ensureDatabase();
  const db = getDb();
  const [existingEmployee] = await db.select({ id: employees.id }).from(employees).limit(1);
  if (!existingEmployee) {
    await db.insert(employees).values(seedEmployees.map((employee) => ({
      ...employee,
      createdAt: employee.updatedAt,
    }))).onConflictDoNothing();
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

  const [existingTalentAction] = await db.select({ id: talentActions.id }).from(talentActions).limit(1);
  if (!existingTalentAction) await db.insert(talentActions).values(seedTalentActions).onConflictDoNothing();

  const [existingProject] = await db.select({ id: projects.id }).from(projects).limit(1);
  if (!existingProject) await db.insert(projects).values(seedProjects).onConflictDoNothing();

  const [existingWorkItem] = await db.select({ id: workItems.id }).from(workItems).limit(1);
  if (!existingWorkItem) {
    // Keep each seed statement below D1's bound-parameter ceiling.
    for (const workItem of seedWorkItems) {
      await db.insert(workItems).values(workItem).onConflictDoNothing();
    }
  }

  const [existingReward] = await db.select({ id: rewards.id }).from(rewards).limit(1);
  if (!existingReward) await db.insert(rewards).values(seedRewards).onConflictDoNothing();

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

export async function GET(request: Request) {
  try {
    await ensureSeedData();
    const url = new URL(request.url);
    const period = url.searchParams.get("period") ?? periods[0];
    const db = getDb();
    const [employeeRows, evaluationRows, hrProfileRows, talentActionRows, projectRows, workItemRows, workSubmissionRows, rewardRows, pointRows, redemptionRows, employeeProfileRows, applicationDocumentRows, employmentContractRows] = await Promise.all([
      db.select().from(employees),
      db.select().from(evaluations).where(eq(evaluations.period, period)),
      db.select().from(hrProfiles),
      db.select().from(talentActions),
      db.select().from(projects),
      db.select().from(workItems),
      db.select().from(workSubmissions),
      db.select().from(rewards),
      db.select().from(pointLedger),
      db.select().from(rewardRedemptions),
      db.select().from(employeeProfiles),
      db.select().from(applicationDocuments),
      db.select().from(employmentContracts),
    ]);

    return Response.json({ employees: employeeRows, evaluations: evaluationRows, hrProfiles: hrProfileRows, talentActions: talentActionRows, projects: projectRows, workItems: workItemRows, workSubmissions: workSubmissionRows, rewards: rewardRows, pointLedger: pointRows, rewardRedemptions: redemptionRows, employeeProfiles: employeeProfileRows, applicationDocuments: applicationDocumentRows, employmentContracts: employmentContractRows, period });
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

export async function POST(request: Request) {
  try {
    await ensureSeedData();
    const payload = await request.json() as EmployeePayload | EvaluationPayload | HrPlanPayload | CompleteTalentActionPayload | ProjectPayload | WorkItemPayload | ReviewWorkSubmissionPayload | RedeemRewardPayload | EmployeeProfilePayload | DocumentStatusPayload | ContractPayload | SignContractPayload | SendContractPayload;
    const db = getDb();

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
      const period = payload.period ?? periods[0];
      const [employee] = await db.select().from(employees).where(eq(employees.id, employeeId)).limit(1);
      if (!employee) return Response.json({ error: "ไม่พบพนักงานที่เลือก" }, { status: 404 });

      const role = getRole(employee.roleId);
      const kpiScores = Object.fromEntries(role.kpis.map((kpi) => [kpi.id, clampScore(payload.kpiScores?.[kpi.id])]));
      const skillScores = Object.fromEntries(role.skills.map((skill) => [skill.id, clampSkillLevel(payload.skillScores?.[skill.id])]));
      const kpiScore = role.kpis.reduce((sum, kpi) => sum + kpiScores[kpi.id] * kpi.weight / 100, 0);
      const skillScore = role.skills.reduce((sum, skill) => sum + skillScores[skill.id], 0) / role.skills.length / 5 * 100;
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

      return Response.json({ evaluation });
    }

    if (payload.action === "saveHrPlan") {
      const employeeId = payload.employeeId ?? "";
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
      const score = payload.score === undefined ? null : Math.min(100, Math.max(0, Math.round(Number(payload.score) || 0)));
      const now = new Date().toISOString();
      await db.update(talentActions).set({ status: "completed", score, updatedAt: now }).where(eq(talentActions.id, actionId));
      const [talentAction] = await db.select().from(talentActions).where(eq(talentActions.id, actionId)).limit(1);
      if (!talentAction) return Response.json({ error: "ไม่พบแผนที่เลือก" }, { status: 404 });
      return Response.json({ talentAction });
    }

    if (payload.action === "saveProject") {
      const name = payload.name?.trim().slice(0, 120) ?? "";
      const ownerEmployeeId = payload.ownerEmployeeId ?? "";
      const [owner] = await db.select().from(employees).where(eq(employees.id, ownerEmployeeId)).limit(1);
      if (!name || !owner) return Response.json({ error: "กรุณาระบุชื่อโปรเจกต์และเจ้าของโปรเจกต์" }, { status: 400 });
      const now = new Date().toISOString();
      const projectId = payload.projectId?.trim() || `project-${crypto.randomUUID()}`;
      const [existingProject] = payload.projectId ? await db.select().from(projects).where(eq(projects.id, projectId)).limit(1) : [];
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
      const projectId = payload.projectId ?? "";
      const assigneeEmployeeId = payload.assigneeEmployeeId ?? "";
      const title = payload.title?.trim().slice(0, 180) ?? "";
      const [[project], [assignee]] = await Promise.all([
        db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).limit(1),
        db.select({ id: employees.id }).from(employees).where(eq(employees.id, assigneeEmployeeId)).limit(1),
      ]);
      if (!title || !project || !assignee) return Response.json({ error: "กรุณาระบุชื่องาน โปรเจกต์ และผู้รับผิดชอบ" }, { status: 400 });
      const now = new Date().toISOString();
      const workItemId = payload.workItemId?.trim() || `work-${crypto.randomUUID()}`;
      const [existingWorkItem] = payload.workItemId ? await db.select().from(workItems).where(eq(workItems.id, workItemId)).limit(1) : [];
      const status = payload.status ?? existingWorkItem?.status ?? "todo";
      const progress = status === "done" ? 100 : Math.min(99, Math.max(0, Math.round(Number(payload.progress) || 0)));
      const workItem = {
        id: existingWorkItem?.id ?? workItemId,
        projectId,
        assigneeEmployeeId,
        kind: payload.kind ?? "task" as const,
        title,
        description: payload.description?.trim().slice(0, 1200) ?? "",
        priority: payload.priority ?? "medium" as const,
        status,
        progress,
        points: Math.min(5000, Math.max(0, Math.round(Number(payload.points) || 0))),
        dueDate: /^\d{4}-\d{2}-\d{2}$/.test(payload.dueDate ?? "") ? payload.dueDate as string : now.slice(0, 10),
        createdAt: existingWorkItem?.createdAt ?? now,
        updatedAt: now,
      };
      await db.insert(workItems).values(workItem).onConflictDoUpdate({
        target: workItems.id,
        set: { projectId: workItem.projectId, assigneeEmployeeId: workItem.assigneeEmployeeId, kind: workItem.kind, title: workItem.title, description: workItem.description, priority: workItem.priority, status: workItem.status, progress: workItem.progress, points: workItem.points, dueDate: workItem.dueDate, updatedAt: now },
      });

      let pointEntry = null;
      if (status === "done" && workItem.points > 0) {
        const sourceType = workItem.kind === "mission" ? "mission" as const : "task" as const;
        const pointId = `points-${workItem.id}`;
        await db.insert(pointLedger).values({ id: pointId, employeeId: assigneeEmployeeId, sourceType, sourceId: workItem.id, points: workItem.points, note: `สำเร็จ${workItem.kind === "mission" ? "ภารกิจ" : "งาน"}: ${workItem.title}`, createdAt: now }).onConflictDoNothing();
        [pointEntry] = await db.select().from(pointLedger).where(eq(pointLedger.id, pointId)).limit(1);
      }
      return Response.json({ workItem, pointEntry });
    }

    if (payload.action === "reviewWorkSubmission") {
      const submissionId = payload.submissionId ?? "";
      const status = payload.status;
      if (status !== "approved" && status !== "revision") return Response.json({ error: "สถานะตรวจหลักฐานไม่ถูกต้อง" }, { status: 400 });
      const [submission] = await db.select().from(workSubmissions).where(eq(workSubmissions.id, submissionId)).limit(1);
      if (!submission) return Response.json({ error: "ไม่พบหลักฐานงานที่เลือก" }, { status: 404 });
      const [workItem] = await db.select().from(workItems).where(eq(workItems.id, submission.workItemId)).limit(1);
      if (!workItem) return Response.json({ error: "ไม่พบงานของหลักฐานรายการนี้" }, { status: 404 });
      const now = new Date().toISOString();
      const actor = authenticatedActor(request);
      const reviewerNote = payload.reviewerNote?.trim().slice(0, 1000) ?? "";
      const reviewedSubmission = { ...submission, status, reviewedBy: actor.name, reviewedAt: now, reviewerNote };
      await db.update(workSubmissions).set({ status, reviewedBy: actor.name, reviewedAt: now, reviewerNote }).where(eq(workSubmissions.id, submissionId));

      const updatedWorkItem = status === "approved"
        ? { ...workItem, status: "done" as const, progress: 100, updatedAt: now }
        : { ...workItem, status: "in_progress" as const, progress: Math.min(90, workItem.progress), updatedAt: now };
      await db.update(workItems).set({ status: updatedWorkItem.status, progress: updatedWorkItem.progress, updatedAt: now }).where(eq(workItems.id, workItem.id));

      let pointEntry = null;
      if (status === "approved" && workItem.points > 0) {
        const sourceType = workItem.kind === "mission" ? "mission" as const : "task" as const;
        const pointId = `points-${workItem.id}`;
        await db.insert(pointLedger).values({ id: pointId, employeeId: workItem.assigneeEmployeeId, sourceType, sourceId: workItem.id, points: workItem.points, note: `อนุมัติหลักฐานและปิด${workItem.kind === "mission" ? "ภารกิจ" : "งาน"}: ${workItem.title}`, createdAt: now }).onConflictDoNothing();
        [pointEntry] = await db.select().from(pointLedger).where(eq(pointLedger.id, pointId)).limit(1);
      }
      return Response.json({ workSubmission: reviewedSubmission, workItem: updatedWorkItem, pointEntry });
    }

    if (payload.action === "redeemReward") {
      const employeeId = payload.employeeId ?? "";
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
