import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { ensureDatabase } from "../../../db/initialize";
import { employees, evaluations, hrProfiles, talentActions } from "../../../db/schema";
import {
  clampScore,
  clampSkillLevel,
  getRole,
  makeInitials,
  periods,
  roleSalaryBands,
  roles,
  seedEmployees,
  seedHrProfiles,
  seedTalentActions,
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
}

function evaluatorName(request: Request) {
  const encodedName = request.headers.get("oai-authenticated-user-full-name");
  if (encodedName) {
    try {
      return decodeURIComponent(encodedName);
    } catch {
      // Fall back to the authenticated email when the optional name is malformed.
    }
  }
  return request.headers.get("oai-authenticated-user-email") ?? "ฝ่ายทรัพยากรบุคคล";
}

export async function GET(request: Request) {
  try {
    await ensureSeedData();
    const url = new URL(request.url);
    const period = url.searchParams.get("period") ?? periods[0];
    const db = getDb();
    const [employeeRows, evaluationRows, hrProfileRows, talentActionRows] = await Promise.all([
      db.select().from(employees),
      db.select().from(evaluations).where(eq(evaluations.period, period)),
      db.select().from(hrProfiles),
      db.select().from(talentActions),
    ]);

    return Response.json({ employees: employeeRows, evaluations: evaluationRows, hrProfiles: hrProfileRows, talentActions: talentActionRows, period });
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

export async function POST(request: Request) {
  try {
    await ensureSeedData();
    const payload = await request.json() as EmployeePayload | EvaluationPayload | HrPlanPayload | CompleteTalentActionPayload;
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
      return Response.json({ employee, hrProfile }, { status: 201 });
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

    return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 400 });
  } catch (error) {
    return apiError(error);
  }
}
