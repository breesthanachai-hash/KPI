"use client";

import { useEffect, useMemo, useState } from "react";
import {
  type EmployeeRecord,
  type EvaluationRecord,
  type HrProfileRecord,
  type PointLedgerRecord,
  type ProjectRecord,
  type RewardRecord,
  type RewardRedemptionRecord,
  type TalentActionRecord,
  type WorkItemRecord,
  getRole,
  makeInitials,
  periods,
  roleSalaryBands,
  roles,
  scoreStatus,
  seedEmployees,
  seedHrProfiles,
  seedPointLedger,
  seedProjects,
  seedRewardRedemptions,
  seedRewards,
  seedTalentActions,
  seedWorkItems,
} from "../lib/kpi-data";

type View = "overview" | "employees" | "skills" | "hr" | "work";

type TalentDimensionId = "analysis" | "communication" | "problemSolving" | "leadership" | "execution";

const talentDimensions: { id: TalentDimensionId; label: string; shortLabel: string }[] = [
  { id: "analysis", label: "การวิเคราะห์", shortLabel: "วิเคราะห์" },
  { id: "communication", label: "การสื่อสาร", shortLabel: "สื่อสาร" },
  { id: "problemSolving", label: "การแก้ปัญหา", shortLabel: "แก้ปัญหา" },
  { id: "leadership", label: "ภาวะผู้นำ", shortLabel: "ผู้นำ" },
  { id: "execution", label: "การลงมือทำ", shortLabel: "ลงมือทำ" },
];

const roleTalentProfiles: Record<string, Record<TalentDimensionId, number>> = {
  "sales-manager": { analysis: 4, communication: 5, problemSolving: 4, leadership: 5, execution: 4 },
  marketing: { analysis: 5, communication: 4, problemSolving: 4, leadership: 3, execution: 4 },
  "customer-service": { analysis: 3, communication: 5, problemSolving: 5, leadership: 3, execution: 4 },
  developer: { analysis: 5, communication: 3, problemSolving: 5, leadership: 3, execution: 5 },
  hr: { analysis: 4, communication: 5, problemSolving: 4, leadership: 5, execution: 4 },
};

const skillDimensionWeights: Record<string, Partial<Record<TalentDimensionId, number>>> = {
  negotiation: { communication: .7, problemSolving: .3 },
  forecasting: { analysis: .6, execution: .4 },
  coaching: { leadership: .7, communication: .3 },
  "customer-insight": { analysis: .5, communication: .5 },
  "campaign-strategy": { analysis: .4, execution: .4, leadership: .2 },
  analytics: { analysis: .8, problemSolving: .2 },
  content: { communication: .8, execution: .2 },
  experimentation: { problemSolving: .6, analysis: .4 },
  empathy: { communication: .7, leadership: .3 },
  "problem-solving": { problemSolving: 1 },
  "product-knowledge": { execution: .7, analysis: .3 },
  communication: { communication: 1 },
  engineering: { execution: .5, problemSolving: .5 },
  "system-design": { analysis: .6, problemSolving: .4 },
  quality: { execution: .6, problemSolving: .4 },
  collaboration: { communication: .7, leadership: .3 },
  "people-analytics": { analysis: .8, problemSolving: .2 },
  "labor-practice": { execution: .7, analysis: .3 },
  facilitation: { communication: .7, leadership: .3 },
  "talent-development": { leadership: .6, communication: .4 },
};

const emptyTalentProfile = (): Record<TalentDimensionId, number> => ({ analysis: 0, communication: 0, problemSolving: 0, leadership: 0, execution: 0 });

function buildTalentProfile(roleId: string, evaluation: EvaluationRecord | null) {
  const profile = emptyTalentProfile();
  if (!evaluation) return profile;
  const weightTotals = emptyTalentProfile();
  const role = getRole(roleId);
  role.skills.forEach((skill) => {
    const level = evaluation.skillScores[skill.id] ?? 0;
    const weights = skillDimensionWeights[skill.id] ?? {};
    talentDimensions.forEach(({ id }) => {
      const weight = weights[id] ?? 0;
      profile[id] += level * weight;
      weightTotals[id] += weight;
    });
  });
  const measured = talentDimensions
    .filter(({ id }) => weightTotals[id] > 0)
    .map(({ id }) => profile[id] / weightTotals[id]);
  const fallback = measured.length ? measured.reduce((sum, value) => sum + value, 0) / measured.length : 0;
  talentDimensions.forEach(({ id }) => {
    profile[id] = Number((weightTotals[id] > 0 ? profile[id] / weightTotals[id] : fallback).toFixed(2));
  });
  return profile;
}

function calculateRoleFit(profile: Record<TalentDimensionId, number>, roleId: string) {
  const target = roleTalentProfiles[roleId];
  const fit = talentDimensions.reduce((sum, { id }) => sum + Math.min(profile[id] / target[id], 1), 0) / talentDimensions.length * 100;
  return Math.round(fit);
}

function radarPolygon(values: Record<TalentDimensionId, number>) {
  return talentDimensions.map(({ id }, index) => {
    const angle = (-90 + index * 72) * Math.PI / 180;
    const radius = Math.max(0, Math.min(5, values[id])) / 5 * 44;
    return `${(50 + Math.cos(angle) * radius).toFixed(2)}% ${(50 + Math.sin(angle) * radius).toFixed(2)}%`;
  }).join(", ");
}

const departmentFilters = [
  { id: "all", label: "ทุกแผนก" },
  ...roles.map((role) => ({ id: role.departmentId, label: role.department })),
];

function fallbackEvaluation(employee: EmployeeRecord): EvaluationRecord | null {
  if (employee.latestScore === null || employee.latestPeriod === null) return null;
  const role = getRole(employee.roleId);
  const skillLevel = Math.max(1, Math.min(5, Math.round((employee.latestSkillScore ?? 80) / 20)));
  return {
    id: `${employee.id}:${employee.latestPeriod}`,
    employeeId: employee.id,
    period: employee.latestPeriod,
    kpiScores: Object.fromEntries(role.kpis.map((kpi) => [kpi.id, employee.latestScore ?? 80])),
    skillScores: Object.fromEntries(role.skills.map((skill) => [skill.id, skillLevel])),
    kpiScore: employee.latestScore,
    skillScore: employee.latestSkillScore ?? skillLevel * 20,
    totalScore: employee.latestScore,
    note: "",
    evaluator: "ฝ่ายทรัพยากรบุคคล",
    evaluatedAt: employee.updatedAt,
  };
}

function csvCell(value: string | number | null) {
  const text = value === null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "2-digit" }).format(new Date(value));
}

function formatDueDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "2-digit" }).format(new Date(`${value}T00:00:00`));
}

function skillLevelLabel(level: number | null) {
  if (level === null) return "รอประเมิน";
  return ["", "พื้นฐาน", "กำลังพัฒนา", "ใช้งานได้", "ชำนาญ", "ผู้เชี่ยวชาญ"][level] ?? "รอประเมิน";
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 }).format(value);
}

function actionTypeLabel(type: TalentActionRecord["type"]) {
  return { skill_test: "ทดสอบสกิล", upskill: "อัปสกิล", role_review: "ทบทวนตำแหน่ง", salary_review: "ทบทวนเงินเดือน" }[type];
}

function actionStatusLabel(status: TalentActionRecord["status"]) {
  return { planned: "วางแผนแล้ว", in_progress: "กำลังดำเนินการ", completed: "เสร็จแล้ว" }[status];
}

function workKindLabel(kind: WorkItemRecord["kind"]) {
  return { task: "งาน", request: "รีเควสต์", mission: "ภารกิจ" }[kind];
}

function workStatusLabel(status: WorkItemRecord["status"]) {
  return { todo: "ต้องทำ", in_progress: "กำลังทำ", review: "รอตรวจ", done: "เสร็จแล้ว" }[status];
}

function workPriorityLabel(priority: WorkItemRecord["priority"]) {
  return { low: "ทั่วไป", medium: "ปานกลาง", high: "สำคัญ", urgent: "เร่งด่วน" }[priority];
}

function projectStatusLabel(status: ProjectRecord["status"]) {
  return { planned: "เตรียมเริ่ม", active: "กำลังดำเนินการ", on_hold: "พักไว้", completed: "เสร็จแล้ว" }[status];
}

export default function Home() {
  const [view, setView] = useState<View>("overview");
  const [activeDepartment, setActiveDepartment] = useState("all");
  const [period, setPeriod] = useState(periods[0]);
  const [employees, setEmployees] = useState<EmployeeRecord[]>(seedEmployees);
  const [evaluations, setEvaluations] = useState<EvaluationRecord[]>(
    seedEmployees.map(fallbackEvaluation).filter((item): item is EvaluationRecord => item !== null),
  );
  const [hrProfiles, setHrProfiles] = useState<HrProfileRecord[]>(seedHrProfiles);
  const [talentActions, setTalentActions] = useState<TalentActionRecord[]>(seedTalentActions);
  const [projects, setProjects] = useState<ProjectRecord[]>(seedProjects);
  const [workItems, setWorkItems] = useState<WorkItemRecord[]>(seedWorkItems);
  const [rewards, setRewards] = useState<RewardRecord[]>(seedRewards);
  const [pointLedger, setPointLedger] = useState<PointLedgerRecord[]>(seedPointLedger);
  const [rewardRedemptions, setRewardRedemptions] = useState<RewardRedemptionRecord[]>(seedRewardRedemptions);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeRecord | null>(null);
  const [skillProfileEmployee, setSkillProfileEmployee] = useState<EmployeeRecord | null>(null);
  const [hrEmployee, setHrEmployee] = useState<EmployeeRecord | null>(null);
  const [kpiScores, setKpiScores] = useState<Record<string, number>>({});
  const [skillScores, setSkillScores] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [dataWarning, setDataWarning] = useState("");
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [showWorkForm, setShowWorkForm] = useState(false);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [editingWorkItem, setEditingWorkItem] = useState<WorkItemRecord | null>(null);
  const [rewardToRedeem, setRewardToRedeem] = useState<RewardRecord | null>(null);
  const [workFilter, setWorkFilter] = useState<"all" | WorkItemRecord["kind"]>("all");
  const [workSearch, setWorkSearch] = useState("");
  const [employeeForm, setEmployeeForm] = useState({ name: "", email: "", roleId: roles[0].id, manager: "" });
  const [hrForm, setHrForm] = useState({ actionId: "", currentSalary: 0, salaryReviewMonth: "มกราคม 2570", planType: "upskill" as TalentActionRecord["type"], title: "", dueDate: "2026-09-30", targetRoleId: roles[0].id });
  const [workForm, setWorkForm] = useState({ projectId: seedProjects[0].id, assigneeEmployeeId: seedEmployees[0].id, kind: "task" as WorkItemRecord["kind"], title: "", description: "", priority: "medium" as WorkItemRecord["priority"], status: "todo" as WorkItemRecord["status"], progress: 0, points: 100, dueDate: "2026-09-05" });
  const [projectForm, setProjectForm] = useState({ name: "", description: "", ownerEmployeeId: seedEmployees[0].id, status: "active" as ProjectRecord["status"], dueDate: "2026-10-30", color: "forest" });
  const [rewardEmployeeId, setRewardEmployeeId] = useState(seedEmployees[0].id);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/dashboard?period=${encodeURIComponent(period)}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as { employees?: EmployeeRecord[]; evaluations?: EvaluationRecord[]; hrProfiles?: HrProfileRecord[]; talentActions?: TalentActionRecord[]; projects?: ProjectRecord[]; workItems?: WorkItemRecord[]; rewards?: RewardRecord[]; pointLedger?: PointLedgerRecord[]; rewardRedemptions?: RewardRedemptionRecord[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "โหลดข้อมูลไม่สำเร็จ");
        setEmployees(body.employees ?? []);
        setEvaluations(body.evaluations ?? []);
        setHrProfiles(body.hrProfiles ?? []);
        setTalentActions(body.talentActions ?? []);
        setProjects(body.projects ?? []);
        setWorkItems(body.workItems ?? []);
        setRewards(body.rewards ?? []);
        setPointLedger(body.pointLedger ?? []);
        setRewardRedemptions(body.rewardRedemptions ?? []);
        setDataWarning("");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setDataWarning("กำลังแสดงข้อมูลสำรอง ระบบจะบันทึกได้เมื่อฐานข้อมูลพร้อม");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [period]);

  useEffect(() => {
    if (!selectedEmployee && !skillProfileEmployee && !hrEmployee && !showAddEmployee && !showWorkForm && !showProjectForm && !rewardToRedeem) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedEmployee(null);
        setSkillProfileEmployee(null);
        setHrEmployee(null);
        setShowAddEmployee(false);
        setShowWorkForm(false);
        setShowProjectForm(false);
        setRewardToRedeem(null);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedEmployee, skillProfileEmployee, hrEmployee, showAddEmployee, showWorkForm, showProjectForm, rewardToRedeem]);

  const evaluationsByEmployee = useMemo(
    () => new Map(evaluations.filter((evaluation) => evaluation.period === period).map((evaluation) => [evaluation.employeeId, evaluation])),
    [evaluations, period],
  );

  const filteredEmployees = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("th");
    return employees.filter((employee) => {
      const role = getRole(employee.roleId);
      const departmentMatches = activeDepartment === "all" || role.departmentId === activeDepartment;
      const queryMatches = !query || `${employee.name} ${employee.email} ${role.name} ${role.department}`.toLocaleLowerCase("th").includes(query);
      return employee.status === "active" && departmentMatches && queryMatches;
    });
  }, [activeDepartment, employees, search]);

  const evaluatedEmployees = employees.filter((employee) => evaluationsByEmployee.has(employee.id));
  const averageScore = evaluatedEmployees.length
    ? evaluatedEmployees.reduce((sum, employee) => sum + (evaluationsByEmployee.get(employee.id)?.totalScore ?? 0), 0) / evaluatedEmployees.length
    : 0;
  const averageSkill = evaluatedEmployees.length
    ? evaluatedEmployees.reduce((sum, employee) => sum + (evaluationsByEmployee.get(employee.id)?.skillScore ?? 0), 0) / evaluatedEmployees.length
    : 0;
  const completion = employees.length ? evaluatedEmployees.length / employees.length * 100 : 0;
  const pendingEmployees = employees.filter((employee) => !evaluationsByEmployee.has(employee.id));

  const roleStats = useMemo(() => roles.map((role) => {
    const people = employees.filter((employee) => employee.roleId === role.id && employee.status === "active");
    const roleEvaluations = people.map((employee) => evaluationsByEmployee.get(employee.id)).filter((item): item is EvaluationRecord => Boolean(item));
    const score = roleEvaluations.length ? roleEvaluations.reduce((sum, item) => sum + item.totalScore, 0) / roleEvaluations.length : 0;
    const skill = roleEvaluations.length ? roleEvaluations.reduce((sum, item) => sum + item.skillScore, 0) / roleEvaluations.length : 0;
    return { role, people: people.length, evaluated: roleEvaluations.length, score, skill };
  }), [employees, evaluationsByEmployee]);

  const hrProfilesByEmployee = useMemo(() => new Map(hrProfiles.map((profile) => [profile.employeeId, profile])), [hrProfiles]);
  const openTalentActions = useMemo(() => talentActions.filter((action) => action.status !== "completed"), [talentActions]);
  const workforceInsights = useMemo(() => employees.filter((employee) => employee.status === "active").map((employee) => {
    const role = getRole(employee.roleId);
    const evaluation = evaluationsByEmployee.get(employee.id) ?? null;
    const talentProfile = buildTalentProfile(employee.roleId, evaluation);
    const fits = evaluation ? roles.map((fitRole) => ({ role: fitRole, score: calculateRoleFit(talentProfile, fitRole.id) })).sort((a, b) => b.score - a.score) : [];
    const bestFit = fits[0] ?? null;
    const hrProfile = hrProfilesByEmployee.get(employee.id) ?? null;
    const salaryBand = roleSalaryBands[role.id];
    const salaryPosition = hrProfile ? hrProfile.currentSalary / salaryBand.mid * 100 : 0;
    const actions = talentActions.filter((action) => action.employeeId === employee.id).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    return { employee, role, evaluation, talentProfile, bestFit, hrProfile, salaryBand, salaryPosition, actions };
  }), [employees, evaluationsByEmployee, hrProfilesByEmployee, talentActions]);
  const payroll = hrProfiles.reduce((sum, profile) => sum + profile.currentSalary, 0);
  const highPotentialCount = workforceInsights.filter(({ evaluation }) => (evaluation?.totalScore ?? 0) >= 85 && (evaluation?.skillScore ?? 0) >= 80).length;
  const skillGapCount = workforceInsights.filter(({ evaluation, role }) => evaluation && (evaluation.skillScore < 80 || role.skills.some((skill) => (evaluation.skillScores[skill.id] ?? 0) < skill.targetLevel))).length;
  const visibleWorkforce = workforceInsights.filter(({ employee }) => filteredEmployees.some((item) => item.id === employee.id));
  const employeesById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);
  const hrEmployeeInsight = hrEmployee ? workforceInsights.find(({ employee }) => employee.id === hrEmployee.id) ?? null : null;
  const projectsById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const pointBalances = useMemo(() => {
    const balances = new Map<string, number>();
    pointLedger.forEach((entry) => balances.set(entry.employeeId, (balances.get(entry.employeeId) ?? 0) + entry.points));
    return balances;
  }, [pointLedger]);
  const leaderboard = useMemo(() => employees.filter((employee) => employee.status === "active").map((employee) => ({ employee, points: pointBalances.get(employee.id) ?? 0 })).sort((a, b) => b.points - a.points), [employees, pointBalances]);
  const projectInsights = useMemo(() => projects.map((project) => {
    const items = workItems.filter((item) => item.projectId === project.id);
    const progress = items.length ? items.reduce((sum, item) => sum + item.progress, 0) / items.length : 0;
    const completed = items.filter((item) => item.status === "done").length;
    return { project, items, progress, completed };
  }), [projects, workItems]);
  const visibleWorkItems = useMemo(() => {
    const query = workSearch.trim().toLocaleLowerCase("th");
    return workItems.filter((item) => {
      const project = projectsById.get(item.projectId);
      const assignee = employeesById.get(item.assigneeEmployeeId);
      const departmentMatches = activeDepartment === "all" || project?.departmentId === activeDepartment;
      const kindMatches = workFilter === "all" || item.kind === workFilter;
      const queryMatches = !query || `${item.title} ${item.description} ${project?.name ?? ""} ${assignee?.name ?? ""}`.toLocaleLowerCase("th").includes(query);
      return departmentMatches && kindMatches && queryMatches;
    });
  }, [activeDepartment, employeesById, projectsById, workFilter, workItems, workSearch]);
  const openWorkItems = workItems.filter((item) => item.status !== "done");
  const workCompletion = workItems.length ? workItems.filter((item) => item.status === "done").length / workItems.length * 100 : 0;
  const totalPoints = [...pointBalances.values()].reduce((sum, points) => sum + points, 0);

  const selectedRole = selectedEmployee ? getRole(selectedEmployee.roleId) : null;
  const skillProfileRole = skillProfileEmployee ? getRole(skillProfileEmployee.roleId) : null;
  const skillProfileEvaluation = skillProfileEmployee ? evaluationsByEmployee.get(skillProfileEmployee.id) ?? null : null;
  const skillProfileTalent = useMemo(
    () => skillProfileEmployee ? buildTalentProfile(skillProfileEmployee.roleId, skillProfileEvaluation) : emptyTalentProfile(),
    [skillProfileEmployee, skillProfileEvaluation],
  );
  const roleFitRecommendations = useMemo(
    () => skillProfileEvaluation
      ? roles.map((role) => ({ role, score: calculateRoleFit(skillProfileTalent, role.id) })).sort((a, b) => b.score - a.score)
      : [],
    [skillProfileEvaluation, skillProfileTalent],
  );
  const kpiTotal = selectedRole
    ? selectedRole.kpis.reduce((sum, kpi) => sum + (kpiScores[kpi.id] ?? 0) * kpi.weight / 100, 0)
    : 0;
  const skillTotal = selectedRole
    ? selectedRole.skills.reduce((sum, skill) => sum + (skillScores[skill.id] ?? 1), 0) / selectedRole.skills.length / 5 * 100
    : 0;
  const grandTotal = kpiTotal * 0.7 + skillTotal * 0.3;

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  };

  const openEvaluation = (employee: EmployeeRecord) => {
    const role = getRole(employee.roleId);
    const existing = evaluationsByEmployee.get(employee.id) ?? fallbackEvaluation(employee);
    setSelectedEmployee(employee);
    setKpiScores(Object.fromEntries(role.kpis.map((kpi) => [kpi.id, existing?.kpiScores[kpi.id] ?? 80])));
    setSkillScores(Object.fromEntries(role.skills.map((skill) => [skill.id, existing?.skillScores[skill.id] ?? skill.targetLevel])));
    setNote(existing?.note ?? "");
  };

  const editSkillProfile = (employee: EmployeeRecord) => {
    setSkillProfileEmployee(null);
    openEvaluation(employee);
  };

  const openHrManagement = (employee: EmployeeRecord, planType: TalentActionRecord["type"] = "upskill", existingAction?: TalentActionRecord) => {
    const profile = hrProfilesByEmployee.get(employee.id);
    const role = getRole(employee.roleId);
    const defaultTitles: Record<TalentActionRecord["type"], string> = {
      skill_test: `ทดสอบสกิลหลักของ ${role.name}`,
      upskill: `แผนพัฒนาสกิลสำหรับ ${role.name}`,
      role_review: "ทบทวนตำแหน่งจาก Talent Fit",
      salary_review: "ทบทวนเงินเดือนตามผลงานและสกิล",
    };
    setHrEmployee(employee);
    setHrForm({
      actionId: existingAction?.id ?? "",
      currentSalary: profile?.currentSalary ?? roleSalaryBands[role.id].mid,
      salaryReviewMonth: profile?.salaryReviewMonth ?? "มกราคม 2570",
      planType: existingAction?.type ?? planType,
      title: existingAction?.title ?? defaultTitles[planType],
      dueDate: existingAction?.dueDate ?? "2026-09-30",
      targetRoleId: existingAction?.targetRoleId || employee.roleId,
    });
  };

  const saveHrPlan = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!hrEmployee) return;
    setIsSaving(true);
    try {
      const response = await fetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "saveHrPlan", employeeId: hrEmployee.id, ...hrForm }),
      });
      const body = await response.json() as { hrProfile?: HrProfileRecord; talentAction?: TalentActionRecord | null; error?: string };
      if (!response.ok || !body.hrProfile) throw new Error(body.error ?? "บันทึกแผนบุคลากรไม่สำเร็จ");
      setHrProfiles((items) => [...items.filter((item) => item.employeeId !== body.hrProfile?.employeeId), body.hrProfile as HrProfileRecord]);
      if (body.talentAction) setTalentActions((items) => [...items.filter((item) => item.id !== body.talentAction?.id), body.talentAction as TalentActionRecord]);
      const employeeName = hrEmployee.name;
      setHrEmployee(null);
      showToast(`บันทึกแผนบุคลากรของ ${employeeName} แล้ว`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "บันทึกแผนบุคลากรไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const completeTalentAction = async (action: TalentActionRecord) => {
    try {
      const response = await fetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "completeTalentAction", actionId: action.id }) });
      const body = await response.json() as { talentAction?: TalentActionRecord; error?: string };
      if (!response.ok || !body.talentAction) throw new Error(body.error ?? "อัปเดตสถานะไม่สำเร็จ");
      setTalentActions((items) => items.map((item) => item.id === action.id ? body.talentAction as TalentActionRecord : item));
      showToast(`ปิดงาน “${action.title}” แล้ว`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "อัปเดตสถานะไม่สำเร็จ");
    }
  };

  const openWorkItemForm = (item?: WorkItemRecord) => {
    setEditingWorkItem(item ?? null);
    setWorkForm(item ? {
      projectId: item.projectId,
      assigneeEmployeeId: item.assigneeEmployeeId,
      kind: item.kind,
      title: item.title,
      description: item.description,
      priority: item.priority,
      status: item.status,
      progress: item.progress,
      points: item.points,
      dueDate: item.dueDate,
    } : {
      projectId: projects[0]?.id ?? "",
      assigneeEmployeeId: employees[0]?.id ?? "",
      kind: "task",
      title: "",
      description: "",
      priority: "medium",
      status: "todo",
      progress: 0,
      points: 100,
      dueDate: "2026-09-05",
    });
    setShowWorkForm(true);
  };

  const saveWorkItem = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      const response = await fetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "saveWorkItem", workItemId: editingWorkItem?.id, ...workForm }) });
      const body = await response.json() as { workItem?: WorkItemRecord; pointEntry?: PointLedgerRecord | null; error?: string };
      if (!response.ok || !body.workItem) throw new Error(body.error ?? "บันทึกงานไม่สำเร็จ");
      setWorkItems((items) => [...items.filter((item) => item.id !== body.workItem?.id), body.workItem as WorkItemRecord]);
      if (body.pointEntry) setPointLedger((items) => [...items.filter((item) => item.id !== body.pointEntry?.id), body.pointEntry as PointLedgerRecord]);
      setShowWorkForm(false);
      setEditingWorkItem(null);
      showToast(body.pointEntry ? `ทำภารกิจสำเร็จ รับ ${body.pointEntry.points} แต้ม` : "บันทึกงานและความคืบหน้าแล้ว");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "บันทึกงานไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const saveProject = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      const owner = employeesById.get(projectForm.ownerEmployeeId);
      const response = await fetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "saveProject", ...projectForm, departmentId: owner ? getRole(owner.roleId).departmentId : "" }) });
      const body = await response.json() as { project?: ProjectRecord; error?: string };
      if (!response.ok || !body.project) throw new Error(body.error ?? "สร้างโปรเจกต์ไม่สำเร็จ");
      setProjects((items) => [...items, body.project as ProjectRecord]);
      setProjectForm({ name: "", description: "", ownerEmployeeId: employees[0]?.id ?? "", status: "active", dueDate: "2026-10-30", color: "forest" });
      setShowProjectForm(false);
      showToast(`สร้างโปรเจกต์ “${body.project.name}” แล้ว`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "สร้างโปรเจกต์ไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const redeemReward = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!rewardToRedeem) return;
    setIsSaving(true);
    try {
      const response = await fetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "redeemReward", employeeId: rewardEmployeeId, rewardId: rewardToRedeem.id }) });
      const body = await response.json() as { redemption?: RewardRedemptionRecord; pointEntry?: PointLedgerRecord; reward?: RewardRecord; error?: string };
      if (!response.ok || !body.redemption || !body.pointEntry || !body.reward) throw new Error(body.error ?? "แลกรางวัลไม่สำเร็จ");
      setRewardRedemptions((items) => [...items, body.redemption as RewardRedemptionRecord]);
      setPointLedger((items) => [...items, body.pointEntry as PointLedgerRecord]);
      setRewards((items) => items.map((reward) => reward.id === body.reward?.id ? body.reward as RewardRecord : reward));
      setRewardToRedeem(null);
      showToast(`ส่งคำขอแลก “${body.reward.title}” แล้ว`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "แลกรางวัลไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const saveEvaluation = async () => {
    if (!selectedEmployee) return;
    setIsSaving(true);
    try {
      const response = await fetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "saveEvaluation", employeeId: selectedEmployee.id, period, kpiScores, skillScores, note }),
      });
      const body = await response.json() as { evaluation?: EvaluationRecord; error?: string };
      if (!response.ok || !body.evaluation) throw new Error(body.error ?? "บันทึกผลประเมินไม่สำเร็จ");
      const saved = body.evaluation;
      setEvaluations((items) => [...items.filter((item) => !(item.employeeId === saved.employeeId && item.period === saved.period)), saved]);
      if (period === periods[0]) {
        setEmployees((items) => items.map((employee) => employee.id === saved.employeeId ? {
          ...employee,
          latestScore: saved.totalScore,
          latestSkillScore: saved.skillScore,
          latestPeriod: saved.period,
          updatedAt: saved.evaluatedAt,
        } : employee));
      }
      setSelectedEmployee(null);
      showToast(`บันทึกผลประเมิน ${selectedEmployee.name} แล้ว`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "บันทึกผลประเมินไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const addEmployee = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      const response = await fetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "createEmployee", ...employeeForm }),
      });
      const body = await response.json() as { employee?: EmployeeRecord; hrProfile?: HrProfileRecord; error?: string };
      if (!response.ok || !body.employee) throw new Error(body.error ?? "เพิ่มพนักงานไม่สำเร็จ");
      setEmployees((items) => [...items, body.employee as EmployeeRecord]);
      if (body.hrProfile) setHrProfiles((items) => [...items, body.hrProfile as HrProfileRecord]);
      setShowAddEmployee(false);
      setEmployeeForm({ name: "", email: "", roleId: roles[0].id, manager: "" });
      showToast(`เพิ่ม ${body.employee.name} ในระบบแล้ว`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "เพิ่มพนักงานไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const exportReport = () => {
    const rows = employees.map((employee) => {
      const role = getRole(employee.roleId);
      const evaluation = evaluationsByEmployee.get(employee.id);
      const profile = hrProfilesByEmployee.get(employee.id);
      const talentProfile = buildTalentProfile(employee.roleId, evaluation ?? null);
      const bestFit = evaluation ? roles.map((fitRole) => ({ role: fitRole, score: calculateRoleFit(talentProfile, fitRole.id) })).sort((a, b) => b.score - a.score)[0] : null;
      const nextAction = talentActions.filter((action) => action.employeeId === employee.id && action.status !== "completed").sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
      return [
        employee.name,
        employee.email,
        role.department,
        role.name,
        period,
        evaluation?.kpiScore ?? null,
        evaluation?.skillScore ?? null,
        evaluation?.totalScore ?? null,
        scoreStatus(evaluation?.totalScore ?? null),
        role.skills.map((skill) => `${skill.name}: ${evaluation?.skillScores[skill.id] ?? "รอประเมิน"}/${skill.targetLevel}`).join("; "),
        bestFit ? `${bestFit.role.name} (${bestFit.score}%)` : "รอประเมิน",
        profile?.currentSalary ?? null,
        `${formatMoney(roleSalaryBands[role.id].min)}-${formatMoney(roleSalaryBands[role.id].max)}`,
        nextAction ? `${actionTypeLabel(nextAction.type)}: ${nextAction.title} (${nextAction.dueDate})` : "",
        evaluation?.note ?? "",
      ];
    });
    const content = [
      ["ชื่อพนักงาน", "อีเมล", "แผนก", "ตำแหน่ง", "รอบประเมิน", "คะแนน KPI", "คะแนนสกิล", "คะแนนรวม", "สถานะ", "รายละเอียดสกิล (ปัจจุบัน/เป้าหมาย)", "ตำแหน่งที่เหมาะสม", "เงินเดือนปัจจุบัน", "กรอบเงินเดือน", "แผนถัดไป", "หมายเหตุ"],
      ...rows,
    ].map((row) => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `people-pulse-${period.replaceAll(" ", "-")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("ส่งออกรายงาน CSV แล้ว");
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setView("overview")} aria-label="ไปที่ภาพรวม">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span><strong>PEOPLE PULSE</strong><small>KPI &amp; SKILL SYSTEM</small></span>
        </button>
        <nav aria-label="เมนูหลัก">
          <button className={view === "overview" ? "active" : ""} onClick={() => setView("overview")}>ภาพรวม</button>
          <button className={view === "employees" ? "active" : ""} onClick={() => setView("employees")}>พนักงาน</button>
          <button className={view === "skills" ? "active" : ""} onClick={() => setView("skills")}>สกิลทีม</button>
          <button className={view === "hr" ? "active" : ""} onClick={() => setView("hr")}>บริหารบุคลากร</button>
          <button className={view === "work" ? "active" : ""} onClick={() => setView("work")}>งานและรางวัล</button>
        </nav>
        <div className="header-actions">
          <label className="period-select">
            <span className="sr-only">เลือกรอบประเมิน</span>
            <select value={period} onChange={(event) => { setIsLoading(true); setPeriod(event.target.value); }}>{periods.map((item) => <option key={item}>{item}</option>)}</select>
          </label>
          <button className="icon-button" onClick={() => pendingEmployees.length ? setView("employees") : showToast("ไม่มีรายการรอประเมิน")} aria-label={`${pendingEmployees.length} รายการรอประเมิน`}>
            <span aria-hidden="true">●</span>{pendingEmployees.length > 0 && <i />}
          </button>
          <button className="profile-button" onClick={() => showToast("ผู้ดูแลระบบ People Pulse")} aria-label="โปรไฟล์ผู้ใช้">วร</button>
        </div>
      </header>

      <section className="dashboard">
        {dataWarning && <div className="data-warning" role="status"><span>!</span>{dataWarning}</div>}
        <div className="page-heading">
          <div>
            <p className="eyebrow">{view === "overview" ? "ภาพรวมองค์กร" : view === "employees" ? "ทะเบียนและการประเมิน" : view === "skills" ? "COMPETENCY MATRIX" : view === "hr" ? "WORKFORCE MANAGEMENT" : "MISSION & REWARD CENTER"}</p>
            <h1>{view === "overview" ? "ภาพรวม KPI พนักงาน" : view === "employees" ? "พนักงานและผลประเมิน" : view === "skills" ? "ภาพรวมสกิลของทีม" : view === "hr" ? "บริหารทรัพยากรบุคคล" : "งาน โปรเจกต์ และภารกิจ"}</h1>
            <p>{view === "overview" ? "ติดตามเป้าหมาย ประเมินผลงาน และวางแผนพัฒนาทีมในที่เดียว" : view === "employees" ? "ค้นหา เพิ่มพนักงาน และบันทึกผล KPI พร้อมระดับสกิลรายบุคคล" : view === "skills" ? "มองเห็นจุดแข็ง ช่องว่าง และความพร้อมของแต่ละสายงาน" : view === "hr" ? "เชื่อมผลงาน สกิล การทดสอบ แผนพัฒนา ตำแหน่งที่เหมาะสม และค่าตอบแทน เพื่อการตัดสินใจที่รอบด้าน" : "จัดการ To-do รีเควสต์ และภารกิจ ติดตามความคืบหน้า รับแต้ม และแลกรางวัลในที่เดียว"}</p>
          </div>
          <div className="heading-actions">
            <button className="secondary-button" onClick={() => view === "work" ? setShowProjectForm(true) : exportReport()}><span aria-hidden="true">{view === "work" ? "◇" : "↓"}</span> {view === "work" ? "สร้างโปรเจกต์" : "ส่งออกรายงาน"}</button>
            <button className="primary-button" onClick={() => {
              if (view === "work") {
                openWorkItemForm();
                return;
              }
              if (view === "hr") {
                if (workforceInsights[0]) openHrManagement(workforceInsights[0].employee);
                else showToast("ยังไม่มีพนักงานสำหรับวางแผน");
                return;
              }
              if (pendingEmployees[0]) openEvaluation(pendingEmployees[0]);
              else setView("employees");
            }}><span aria-hidden="true">＋</span> {view === "work" ? "เพิ่มงานหรือภารกิจ" : view === "hr" ? "เพิ่มแผนบุคลากร" : "เริ่มประเมิน"}</button>
          </div>
        </div>

        <div className="filter-row" aria-label="กรองตามแผนก">
          {departmentFilters.map((filter) => (
            <button key={filter.id} className={activeDepartment === filter.id ? "active" : ""} onClick={() => setActiveDepartment(filter.id)}>{filter.label}</button>
          ))}
        </div>

        {view === "overview" && (
          <>
            <div className="summary-grid">
              <article className="hero-score">
                <div className="score-ring" style={{ "--score": `${averageScore}%` } as React.CSSProperties}>
                  <div><strong>{averageScore ? averageScore.toFixed(1) : "—"}</strong><span>คะแนนรวมเฉลี่ย</span></div>
                </div>
                <div className="hero-copy">
                  <span>{period}</span>
                  <h2>{averageScore >= 85 ? "ทีมทำผลงานโดดเด่น\nพร้อมรับเป้าหมายถัดไป" : "เห็นทั้งผลงานและสกิล\nเพื่อพัฒนาทีมอย่างตรงจุด"}</h2>
                  <p>สูตรคะแนนรวม <strong>KPI 70%</strong> และ <strong>สกิล 30%</strong></p>
                  <div className="trend-bars" aria-label="แนวโน้มคะแนนเติบโต">
                    {[46, 53, 49, 61, 58, 67, 72, 76, 82, Math.max(30, averageScore)].map((height, index) => <i key={index} className={index > 6 ? "highlight" : ""} style={{ height: `${height}%` }} />)}
                  </div>
                </div>
              </article>
              <MetricCard label="ประเมินแล้ว" value={`${completion.toFixed(0)}%`} copy={`${evaluatedEmployees.length} จาก ${employees.length} คน`} tone="positive" progress={completion} icon="✓" />
              <MetricCard label="พนักงานทั้งหมด" value={`${employees.length} คน`} copy={`${roles.length} กลุ่มตำแหน่ง`} icon="••" />
              <MetricCard label="รอประเมิน" value={`${pendingEmployees.length} คน`} copy={pendingEmployees.length ? "ควรดำเนินการในรอบนี้" : "ครบถ้วนแล้ว"} tone={pendingEmployees.length ? "warning" : "positive"} icon="◷" />
              <MetricCard label="คะแนนสกิลเฉลี่ย" value={averageSkill ? averageSkill.toFixed(1) : "—"} copy="เทียบจากระดับ 1–5" tone="positive" icon="↗" />
            </div>

            <div className="content-grid">
              <section className="role-card">
                <div className="section-heading">
                  <div><p className="eyebrow">{roles.length} กลุ่มตำแหน่ง</p><h2>ผลงานตามสายงาน</h2></div>
                  <button onClick={() => setView("skills")}>ดู Skill Matrix <span>→</span></button>
                </div>
                <div className="role-table" role="table" aria-label="ผลงานตามสายงาน">
                  <div className="role-header" role="row"><span>ตำแหน่ง</span><span>พนักงาน</span><span>คะแนนรวม</span><span>ประเมินแล้ว</span><span /></div>
                  {roleStats.filter(({ role }) => activeDepartment === "all" || role.departmentId === activeDepartment).map(({ role, people, evaluated, score }) => (
                    <button className="role-row" role="row" key={role.id} onClick={() => { setActiveDepartment(role.departmentId); setView("employees"); }}>
                      <span className="role-name"><i className={`status-dot ${score > 0 && score < 75 ? "alert" : ""}`} /><span><strong>{role.name}</strong><small>{role.department}</small></span></span>
                      <span>{people} คน</span>
                      <span className="role-score"><strong>{score ? score.toFixed(1) : "—"}</strong><small className="up">+{role.trend}</small></span>
                      <span className="progress-cell"><i><b style={{ width: `${people ? evaluated / people * 100 : 0}%` }} /></i><em>{evaluated}/{people}</em></span>
                      <span className="row-arrow" aria-hidden="true">›</span>
                    </button>
                  ))}
                </div>
              </section>

              <aside className="spotlight-card">
                <div className="section-heading compact"><div><p className="eyebrow">ACTION LIST</p><h2>รอประเมิน</h2></div><button className="round-button" onClick={() => setView("employees")} aria-label="ดูทั้งหมด">→</button></div>
                <div className="employee-list">
                  {pendingEmployees.slice(0, 4).map((employee) => <EmployeeCompact key={employee.id} employee={employee} onClick={() => openEvaluation(employee)} />)}
                  {!pendingEmployees.length && <div className="success-state"><span>✓</span><strong>ประเมินครบแล้ว</strong><p>ไม่มีรายการค้างในรอบนี้</p></div>}
                </div>
                <div className="insight-box"><span className="insight-mark">↗</span><div><strong>โอกาสพัฒนาทีม</strong><p>{roleStats.filter((item) => item.skill > 0 && item.skill < 80).length || 1} สายงานมีช่องว่างสกิลที่ควรวางแผนพัฒนา</p></div></div>
              </aside>
            </div>
          </>
        )}

        {view === "employees" && (
          <section className="directory-card">
            <div className="directory-toolbar">
              <label className="search-field"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาชื่อ อีเมล หรือตำแหน่ง" /><span className="sr-only">ค้นหาพนักงาน</span></label>
              <p>{isLoading ? "กำลังอัปเดต..." : `พบ ${filteredEmployees.length} คน`}</p>
              <button className="primary-button" onClick={() => setShowAddEmployee(true)}>＋ เพิ่มพนักงาน</button>
            </div>
            <div className="employee-table" role="table" aria-label="รายชื่อพนักงาน">
              <div className="employee-table-head" role="row"><span>พนักงาน</span><span>ตำแหน่ง / ผู้จัดการ</span><span>KPI</span><span>สกิล</span><span>สถานะ</span><span /></div>
              {filteredEmployees.map((employee) => {
                const role = getRole(employee.roleId);
                const evaluation = evaluationsByEmployee.get(employee.id);
                const status = scoreStatus(evaluation?.totalScore ?? null);
                return (
                  <div className="employee-table-row" role="row" key={employee.id}>
                    <span className="employee-identity"><i>{employee.initials || makeInitials(employee.name)}</i><span><strong>{employee.name}</strong><small>{employee.email}</small></span></span>
                    <span><strong>{role.name}</strong><small>{role.department} · ผู้จัดการ {employee.manager || "—"}</small></span>
                    <ScoreCell value={evaluation?.kpiScore ?? null} />
                    <ScoreCell value={evaluation?.skillScore ?? null} />
                    <span><b className={`status-pill ${status === "ควรติดตาม" ? "alert" : status === "รอประเมิน" ? "pending" : ""}`}>{status}</b><small>{evaluation ? `อัปเดต ${formatUpdatedAt(evaluation.evaluatedAt)}` : "ยังไม่มีผลรอบนี้"}</small></span>
                    <span className="table-actions">
                      <button className="skill-profile-button" onClick={() => setSkillProfileEmployee(employee)}>ดูสกิล</button>
                      <button className="evaluate-button" onClick={() => openEvaluation(employee)}>{evaluation ? "แก้ไขผล" : "ประเมิน"}</button>
                    </span>
                  </div>
                );
              })}
              {!filteredEmployees.length && <div className="empty-state">ไม่พบพนักงานตามเงื่อนไขที่เลือก</div>}
            </div>
          </section>
        )}

        {view === "skills" && (
          <section className="skills-layout">
            <div className="skill-summary-card">
              <p className="eyebrow">ภาพรวมทั้งองค์กร</p>
              <div className="skill-summary-score"><strong>{averageSkill ? averageSkill.toFixed(1) : "—"}</strong><span>คะแนนสกิลเฉลี่ย<br />จากเต็ม 100</span></div>
              <div className="skill-legend"><span><i className="ready" />พร้อมใช้งาน ≥ 80</span><span><i className="develop" />ควรพัฒนา &lt; 80</span></div>
            </div>
            <div className="skill-matrix-card">
              <div className="section-heading"><div><p className="eyebrow">แยกตามสายงาน</p><h2>Skill Readiness</h2></div><span className="matrix-period">{period}</span></div>
              <div className="skill-matrix">
                {roleStats.filter(({ role }) => activeDepartment === "all" || role.departmentId === activeDepartment).map(({ role, people, skill }) => (
                  <button key={role.id} className="skill-role" onClick={() => { setActiveDepartment(role.departmentId); setView("employees"); }}>
                    <span className="skill-role-title"><i>{role.shortName.slice(0, 2)}</i><span><strong>{role.name}</strong><small>{people} คน · {role.skills.length} สกิลหลัก</small></span></span>
                    <span className="skill-bar"><i><b className={skill > 0 && skill < 80 ? "develop" : ""} style={{ width: `${skill}%` }} /></i><em>{skill ? skill.toFixed(0) : "—"}</em></span>
                    <span className={`skill-readiness ${skill > 0 && skill < 80 ? "develop" : ""}`}>{skill >= 80 ? "พร้อมใช้งาน" : skill > 0 ? "ควรพัฒนา" : "รอข้อมูล"}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="development-card">
              <div><p className="eyebrow">แผนพัฒนาแนะนำ</p><h2>ช่องว่างที่ควรเร่งเติม</h2></div>
              <div className="development-list">
                {roleStats.filter((item) => item.skill > 0).sort((a, b) => a.skill - b.skill).slice(0, 3).map(({ role, skill }, index) => (
                  <article key={role.id}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{role.skills[index % role.skills.length].name}</strong><p>{role.department} · ความพร้อมเฉลี่ย {skill.toFixed(0)}%</p></div><button onClick={() => { setActiveDepartment(role.departmentId); setView("employees"); }}>ดูทีม →</button></article>
                ))}
              </div>
            </div>
            <div className="individual-skills-card">
              <div className="individual-skills-heading">
                <div><p className="eyebrow">INDIVIDUAL SKILL PROFILE</p><h2>สกิลรายบุคคล</h2><p>เปรียบเทียบระดับปัจจุบันกับเป้าหมายของตำแหน่ง เพื่อวางแผนพัฒนาได้ตรงจุด</p></div>
                <label className="search-field"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาพนักงานหรือตำแหน่ง" /><span className="sr-only">ค้นหาโปรไฟล์สกิล</span></label>
              </div>
              <div className="individual-skill-grid">
                {filteredEmployees.map((employee) => {
                  const role = getRole(employee.roleId);
                  const evaluation = evaluationsByEmployee.get(employee.id);
                  const readiness = role.skills.filter((skill) => (evaluation?.skillScores[skill.id] ?? 0) >= skill.targetLevel).length;
                  const biggestGap = role.skills
                    .map((skill) => ({ skill, gap: skill.targetLevel - (evaluation?.skillScores[skill.id] ?? 0) }))
                    .sort((a, b) => b.gap - a.gap)[0];
                  return (
                    <article className="individual-skill-card" key={employee.id}>
                      <div className="person-skill-head">
                        <span className="employee-avatar">{employee.initials || makeInitials(employee.name)}</span>
                        <span><strong>{employee.name}</strong><small>{role.name}</small></span>
                        <b className={evaluation && evaluation.skillScore < 80 ? "develop" : ""}>{evaluation ? evaluation.skillScore.toFixed(0) : "—"}<small>/100</small></b>
                      </div>
                      <div className="person-skill-list">
                        {role.skills.map((skill) => {
                          const level = evaluation?.skillScores[skill.id] ?? null;
                          return (
                            <div key={skill.id}>
                              <span><strong>{skill.name}</strong><small>{level === null ? "รอประเมิน" : `ระดับ ${level} · ${skillLevelLabel(level)}`}</small></span>
                              <span className="mini-levels" aria-label={`${skill.name} ${level === null ? "ยังไม่ประเมิน" : `ระดับ ${level} จาก 5`}`}>
                                {[1, 2, 3, 4, 5].map((item) => <i key={item} className={`${level !== null && item <= level ? "filled" : ""} ${item === skill.targetLevel ? "target" : ""}`} />)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="person-skill-foot">
                        <span className={readiness === role.skills.length ? "ready" : "develop"}>{evaluation ? `ถึงเป้าหมาย ${readiness}/${role.skills.length} สกิล` : "ยังไม่มีผลประเมิน"}</span>
                        <small>{evaluation && biggestGap?.gap > 0 ? `เน้นพัฒนา: ${biggestGap.skill.name}` : evaluation ? "สกิลพร้อมตามบทบาท" : "เริ่มประเมินเพื่อสร้างโปรไฟล์"}</small>
                        <button onClick={() => setSkillProfileEmployee(employee)}>ดูกราฟและ Talent Fit →</button>
                      </div>
                    </article>
                  );
                })}
                {!filteredEmployees.length && <div className="empty-state">ไม่พบโปรไฟล์สกิลตามเงื่อนไขที่เลือก</div>}
              </div>
            </div>
          </section>
        )}

        {view === "hr" && (
          <section className="hr-layout">
            <div className="hr-summary-grid">
              <MetricCard label="บุคลากรที่ดูแล" value={`${workforceInsights.length} คน`} copy={`${highPotentialCount} คนอยู่ในกลุ่มศักยภาพสูง`} tone="positive" icon="◎" />
              <MetricCard label="ช่องว่างสกิล" value={`${skillGapCount} คน`} copy="ควรวางแผนทดสอบหรืออัปสกิล" tone={skillGapCount ? "warning" : "positive"} icon="↗" />
              <MetricCard label="แผนที่กำลังติดตาม" value={`${openTalentActions.length} รายการ`} copy={`${talentActions.filter((action) => action.status === "completed").length} รายการเสร็จแล้ว`} icon="✓" />
              <MetricCard label="เงินเดือนรวมต่อเดือน" value={`฿${formatMoney(payroll)}`} copy="ข้อมูลเพื่อวางแผนกำลังคน" icon="฿" />
            </div>

            <div className="hr-command-grid">
              <section className="workforce-board">
                <div className="workforce-board-heading">
                  <div><p className="eyebrow">PEOPLE DECISION BOARD</p><h2>ภาพรวมรายบุคคลเพื่อการตัดสินใจ</h2><p>ดูผลงาน ความพร้อมด้านสกิล ตำแหน่งที่เหมาะสม และค่าตอบแทนในบรรทัดเดียว</p></div>
                  <label className="search-field"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาชื่อ ตำแหน่ง หรือแผนก" /><span className="sr-only">ค้นหาบุคลากร</span></label>
                </div>
                <div className="workforce-table" role="table" aria-label="ภาพรวมการบริหารบุคลากร">
                  <div className="workforce-table-head" role="row"><span>บุคลากร</span><span>KPI / สกิล</span><span>Talent Fit</span><span>เงินเดือน</span><span>แผนถัดไป</span><span /></div>
                  {visibleWorkforce.map(({ employee, role, evaluation, bestFit, hrProfile, salaryBand, actions }) => {
                    const nextAction = actions.find((action) => action.status !== "completed");
                    const salaryPoint = hrProfile ? Math.min(100, Math.max(0, (hrProfile.currentSalary - salaryBand.min) / (salaryBand.max - salaryBand.min) * 100)) : 0;
                    return (
                      <article className="workforce-row" role="row" key={employee.id}>
                        <span className="workforce-person"><i>{employee.initials || makeInitials(employee.name)}</i><span><strong>{employee.name}</strong><small>{role.name} · {role.department}</small></span></span>
                        <span className="workforce-scores"><b>{evaluation ? evaluation.totalScore.toFixed(0) : "—"}<small>KPI รวม</small></b><b className={evaluation && evaluation.skillScore < 80 ? "attention" : ""}>{evaluation ? evaluation.skillScore.toFixed(0) : "—"}<small>สกิล</small></b></span>
                        <span className="workforce-fit"><strong>{bestFit ? `${bestFit.score}%` : "รอประเมิน"}</strong><small>{bestFit?.role.name ?? "ยังไม่มีข้อมูลสกิล"}</small><i><b style={{ width: `${bestFit?.score ?? 0}%` }} /></i></span>
                        <span className="workforce-salary"><strong>{hrProfile ? `฿${formatMoney(hrProfile.currentSalary)}` : "—"}</strong><small>กรอบ ฿{formatMoney(salaryBand.min)}–{formatMoney(salaryBand.max)}</small><i><b style={{ left: `${salaryPoint}%` }} /></i></span>
                        <span className="workforce-action">{nextAction ? <><b className={`action-type ${nextAction.type}`}>{actionTypeLabel(nextAction.type)}</b><small>{nextAction.title}<br />ภายใน {formatDueDate(nextAction.dueDate)}</small></> : <><b className="action-type ready">พร้อมวางแผน</b><small>ยังไม่มีรายการติดตาม</small></>}</span>
                        <span className="workforce-buttons"><button onClick={() => setSkillProfileEmployee(employee)}>ดูโปรไฟล์</button><button className="manage" onClick={() => openHrManagement(employee)}>จัดการ</button></span>
                      </article>
                    );
                  })}
                  {!visibleWorkforce.length && <div className="empty-state">ไม่พบบุคลากรตามเงื่อนไขที่เลือก</div>}
                </div>
                <div className="decision-note"><span>i</span><p><strong>ใช้เป็นข้อมูลประกอบการตัดสินใจ</strong> Talent Fit และกรอบเงินเดือนเป็นแนวทางเบื้องต้น ควรพิจารณาประสบการณ์ ความสนใจ ความรับผิดชอบ และความเป็นธรรมภายในองค์กรร่วมด้วยเสมอ</p></div>
              </section>

              <aside className="talent-action-center">
                <div className="section-heading compact"><div><p className="eyebrow">ACTION CENTER</p><h2>แผนที่ต้องติดตาม</h2></div><span className="action-count">{openTalentActions.length}</span></div>
                <div className="talent-action-list">
                  {openTalentActions.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 6).map((action) => {
                    const employee = employeesById.get(action.employeeId);
                    if (!employee) return null;
                    const targetRole = getRole(action.targetRoleId || employee.roleId);
                    return (
                      <article key={action.id}>
                        <div className="talent-action-top"><b className={`action-type ${action.type}`}>{actionTypeLabel(action.type)}</b><span>{formatDueDate(action.dueDate)}</span></div>
                        <strong>{action.title}</strong>
                        <p>{employee.name} · {action.type === "role_review" ? `เป้าหมาย ${targetRole.name}` : actionStatusLabel(action.status)}</p>
                        <div><button onClick={() => openHrManagement(employee, action.type, action)}>เปิดแผน</button><button className="complete" onClick={() => completeTalentAction(action)}>ทำเสร็จแล้ว ✓</button></div>
                      </article>
                    );
                  })}
                  {!openTalentActions.length && <div className="success-state"><span>✓</span><strong>ติดตามครบแล้ว</strong><p>ไม่มีแผนบุคลากรค้างอยู่</p></div>}
                </div>
              </aside>
            </div>

            <section className="salary-band-card">
              <div className="section-heading"><div><p className="eyebrow">COMPENSATION PLANNING</p><h2>กรอบเงินเดือนตามตำแหน่ง</h2></div><span className="matrix-period">บาท / เดือน</span></div>
              <div className="salary-band-grid">
                {roles.map((role) => {
                  const band = roleSalaryBands[role.id];
                  const people = workforceInsights.filter((item) => item.role.id === role.id);
                  const average = people.length ? people.reduce((sum, item) => sum + (item.hrProfile?.currentSalary ?? 0), 0) / people.length : 0;
                  const point = Math.min(100, Math.max(0, (average - band.min) / (band.max - band.min) * 100));
                  return <article key={role.id}><div><span>{role.shortName.slice(0, 2)}</span><p><strong>{role.name}</strong><small>{people.length} คน · เฉลี่ย ฿{formatMoney(average)}</small></p></div><div className="salary-range"><i><b style={{ left: `${point}%` }} /></i><span><small>ต่ำสุด</small>฿{formatMoney(band.min)}</span><span><small>ค่ากลาง</small>฿{formatMoney(band.mid)}</span><span><small>สูงสุด</small>฿{formatMoney(band.max)}</span></div></article>;
                })}
              </div>
            </section>
          </section>
        )}

        {view === "work" && (
          <section className="mission-layout">
            <div className="mission-summary-grid">
              <MetricCard label="โปรเจกต์ที่กำลังเดิน" value={`${projects.filter((project) => project.status === "active").length} โปรเจกต์`} copy={`${projects.length} โปรเจกต์ทั้งหมด`} icon="◇" />
              <MetricCard label="งานที่ต้องจัดการ" value={`${openWorkItems.length} รายการ`} copy={`${workItems.filter((item) => item.priority === "urgent" && item.status !== "done").length} งานเร่งด่วน`} tone="warning" icon="✓" />
              <MetricCard label="ความสำเร็จรวม" value={`${workCompletion.toFixed(0)}%`} copy={`${workItems.filter((item) => item.status === "done").length} จาก ${workItems.length} รายการเสร็จแล้ว`} tone="positive" progress={workCompletion} icon="↗" />
              <MetricCard label="แต้มพร้อมใช้ในทีม" value={`${formatMoney(totalPoints)} แต้ม`} copy={`${rewardRedemptions.length} คำขอแลกรางวัล`} icon="★" />
            </div>

            <div className="mission-command-grid">
              <section className="project-pulse-card">
                <div className="section-heading"><div><p className="eyebrow">PROJECT PULSE</p><h2>ความคืบหน้าโปรเจกต์</h2></div><span className="matrix-period">อัปเดตล่าสุด</span></div>
                <div className="project-pulse-grid">
                  {projectInsights.filter(({ project }) => activeDepartment === "all" || project.departmentId === activeDepartment).map(({ project, items, progress, completed }) => {
                    const owner = employeesById.get(project.ownerEmployeeId);
                    return (
                      <article key={project.id} className={`project-pulse ${project.color}`}>
                        <div className="project-pulse-top"><b>{projectStatusLabel(project.status)}</b><span>{formatDueDate(project.dueDate)}</span></div>
                        <h3>{project.name}</h3><p>{project.description}</p>
                        <div className="project-owner"><i>{owner?.initials ?? "PP"}</i><span><small>เจ้าของโปรเจกต์</small><strong>{owner?.name ?? "People Pulse"}</strong></span></div>
                        <div className="project-progress"><span><small>ความคืบหน้า</small><strong>{progress.toFixed(0)}%</strong></span><i><b style={{ width: `${progress}%` }} /></i><small>{completed}/{items.length} งานเสร็จแล้ว</small></div>
                      </article>
                    );
                  })}
                </div>
              </section>

              <aside className="points-leaderboard-card">
                <div className="section-heading compact"><div><p className="eyebrow">POINTS LEADERBOARD</p><h2>อันดับสะสมแต้ม</h2></div><span className="points-crown">★</span></div>
                <div className="points-leaderboard-list">
                  {leaderboard.slice(0, 6).map(({ employee, points }, index) => <article key={employee.id} className={index === 0 ? "champion" : ""}><span className="leader-rank">{index + 1}</span><i>{employee.initials}</i><p><strong>{employee.name}</strong><small>{getRole(employee.roleId).name}</small></p><b>{formatMoney(points)}<small> แต้ม</small></b></article>)}
                </div>
                <p className="points-note">ทำงานหรือภารกิจสำเร็จ ระบบจะเพิ่มแต้มให้ครั้งเดียวโดยอัตโนมัติ</p>
              </aside>
            </div>

            <section className="work-board-card">
              <div className="work-board-heading">
                <div><p className="eyebrow">SMART TO-DO BOARD</p><h2>งาน รีเควสต์ และภารกิจ</h2><p>ทุกงานเชื่อมกับโปรเจกต์ ผู้รับผิดชอบ ความคืบหน้า และแต้มที่จะได้รับ</p></div>
                <div className="work-board-tools">
                  <div className="work-kind-filter" aria-label="กรองประเภทงาน">
                    {([{ id: "all", label: "ทั้งหมด" }, { id: "task", label: "งาน" }, { id: "request", label: "รีเควสต์" }, { id: "mission", label: "ภารกิจ" }] as const).map((filter) => <button key={filter.id} className={workFilter === filter.id ? "active" : ""} onClick={() => setWorkFilter(filter.id)}>{filter.label}</button>)}
                  </div>
                  <label className="search-field"><span aria-hidden="true">⌕</span><input value={workSearch} onChange={(event) => setWorkSearch(event.target.value)} placeholder="ค้นหางาน โปรเจกต์ หรือผู้รับผิดชอบ" /><span className="sr-only">ค้นหางานและภารกิจ</span></label>
                </div>
              </div>
              <div className="work-kanban">
                {(["todo", "in_progress", "review", "done"] as WorkItemRecord["status"][]).map((status) => {
                  const items = visibleWorkItems.filter((item) => item.status === status).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
                  return (
                    <section className={`kanban-column ${status}`} key={status}>
                      <div className="kanban-heading"><span><i />{workStatusLabel(status)}</span><b>{items.length}</b></div>
                      <div className="kanban-list">
                        {items.map((item) => {
                          const project = projectsById.get(item.projectId);
                          const assignee = employeesById.get(item.assigneeEmployeeId);
                          return (
                            <button key={item.id} className="work-ticket" onClick={() => openWorkItemForm(item)}>
                              <span className="work-ticket-meta"><b className={`work-kind ${item.kind}`}>{workKindLabel(item.kind)}</b><i className={`work-priority ${item.priority}`}>{workPriorityLabel(item.priority)}</i></span>
                              <strong>{item.title}</strong><small>{project?.name ?? "ไม่ระบุโปรเจกต์"}</small>
                              <span className="ticket-progress"><i><b style={{ width: `${item.progress}%` }} /></i><em>{item.progress}%</em></span>
                              <span className="work-ticket-foot"><i>{assignee?.initials ?? "PP"}</i><small>{formatDueDate(item.dueDate)}</small><b>★ {item.points}</b></span>
                            </button>
                          );
                        })}
                        {!items.length && <div className="kanban-empty">ไม่มีรายการ</div>}
                      </div>
                    </section>
                  );
                })}
              </div>
            </section>

            <section className="reward-center-card">
              <div className="reward-center-heading"><div><p className="eyebrow">REWARD STORE</p><h2>สะสมแต้ม แลกรางวัล</h2><p>เปลี่ยนความสำเร็จจากงานและภารกิจเป็นสิทธิประโยชน์ที่เลือกได้</p></div><span><strong>{formatMoney(totalPoints)}</strong> แต้มในระบบ</span></div>
              <div className="reward-center-grid">
                <div className="reward-catalog">
                  {rewards.filter((reward) => reward.isActive).map((reward) => <article key={reward.id}><span className={`reward-icon ${reward.category}`}>{reward.icon}</span><div><b>{reward.title}</b><p>{reward.description}</p><small>เหลือ {reward.stock} สิทธิ์</small></div><div className="reward-cost"><strong>{formatMoney(reward.costPoints)}</strong><small>แต้ม</small><button disabled={reward.stock <= 0} onClick={() => { setRewardToRedeem(reward); setRewardEmployeeId(leaderboard[0]?.employee.id ?? employees[0]?.id ?? ""); }}>{reward.stock > 0 ? "แลกรางวัล" : "หมดแล้ว"}</button></div></article>)}
                </div>
                <aside className="redemption-history">
                  <div><p className="eyebrow">RECENT REQUESTS</p><h3>คำขอแลกล่าสุด</h3></div>
                  {rewardRedemptions.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5).map((redemption) => {
                    const employee = employeesById.get(redemption.employeeId);
                    const reward = rewards.find((item) => item.id === redemption.rewardId);
                    return <article key={redemption.id}><span>{reward?.icon ?? "★"}</span><p><strong>{reward?.title ?? "รางวัล"}</strong><small>{employee?.name ?? "พนักงาน"} · {redemption.status === "requested" ? "รออนุมัติ" : redemption.status === "approved" ? "อนุมัติแล้ว" : redemption.status === "fulfilled" ? "รับรางวัลแล้ว" : "ยกเลิก"}</small></p><b>-{redemption.pointsSpent}</b></article>;
                  })}
                  {!rewardRedemptions.length && <div className="reward-empty"><span>★</span><strong>ยังไม่มีคำขอแลก</strong><p>เลือกรางวัล แล้วระบุพนักงานที่ต้องการใช้แต้ม</p></div>}
                </aside>
              </div>
            </section>
          </section>
        )}
      </section>

      <footer><span>PEOPLE PULSE</span><p>KPI · Skill · Work · Mission · Reward Management</p></footer>

      {showWorkForm && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowWorkForm(false)}>
          <form className="work-form-modal" onSubmit={saveWorkItem} role="dialog" aria-modal="true" aria-labelledby="work-form-title">
            <div className="work-form-hero">
              <div><p className="eyebrow">MISSION CONTROL</p><h2 id="work-form-title">{editingWorkItem ? "อัปเดตงานและความคืบหน้า" : "เพิ่มงานหรือภารกิจใหม่"}</h2><p>กำหนดผู้รับผิดชอบ เป้าหมาย และแต้มที่จะได้รับเมื่อทำสำเร็จ</p></div>
              <button type="button" className="modal-close dark" onClick={() => setShowWorkForm(false)} aria-label="ปิดหน้าต่าง">×</button>
              <div className="work-form-preview"><span className={`work-kind ${workForm.kind}`}>{workKindLabel(workForm.kind)}</span><strong>{workForm.title || "ชื่องานหรือภารกิจ"}</strong><small>{projectsById.get(workForm.projectId)?.name ?? "เลือกโปรเจกต์"}</small><b>★ {workForm.points} แต้ม</b></div>
            </div>
            <div className="work-form-body">
              <div className="form-grid work-form-grid">
                <label className="wide"><span>ชื่องาน / รีเควสต์ / ภารกิจ</span><input required value={workForm.title} onChange={(event) => setWorkForm((form) => ({ ...form, title: event.target.value }))} placeholder="เช่น สรุปข้อมูลลูกค้าเพื่อส่งทีมขาย" /></label>
                <label><span>ประเภท</span><select value={workForm.kind} onChange={(event) => setWorkForm((form) => ({ ...form, kind: event.target.value as WorkItemRecord["kind"] }))}><option value="task">งาน</option><option value="request">รีเควสต์</option><option value="mission">ภารกิจ</option></select></label>
                <label><span>ระดับความสำคัญ</span><select value={workForm.priority} onChange={(event) => setWorkForm((form) => ({ ...form, priority: event.target.value as WorkItemRecord["priority"] }))}><option value="low">ทั่วไป</option><option value="medium">ปานกลาง</option><option value="high">สำคัญ</option><option value="urgent">เร่งด่วน</option></select></label>
                <label><span>โปรเจกต์</span><select required value={workForm.projectId} onChange={(event) => setWorkForm((form) => ({ ...form, projectId: event.target.value }))}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
                <label><span>ผู้รับผิดชอบ</span><select required value={workForm.assigneeEmployeeId} onChange={(event) => setWorkForm((form) => ({ ...form, assigneeEmployeeId: event.target.value }))}>{employees.filter((employee) => employee.status === "active").map((employee) => <option key={employee.id} value={employee.id}>{employee.name} · {getRole(employee.roleId).shortName}</option>)}</select></label>
                <label><span>สถานะ</span><select value={workForm.status} onChange={(event) => { const status = event.target.value as WorkItemRecord["status"]; setWorkForm((form) => ({ ...form, status, progress: status === "done" ? 100 : status === "todo" ? Math.min(form.progress, 20) : form.progress })); }}><option value="todo">ต้องทำ</option><option value="in_progress">กำลังทำ</option><option value="review">รอตรวจ</option><option value="done">เสร็จแล้ว</option></select></label>
                <label><span>กำหนดเสร็จ</span><input required type="date" value={workForm.dueDate} onChange={(event) => setWorkForm((form) => ({ ...form, dueDate: event.target.value }))} /></label>
                <label><span>แต้มเมื่อสำเร็จ</span><input required type="number" min="0" max="5000" step="10" value={workForm.points} onChange={(event) => setWorkForm((form) => ({ ...form, points: Number(event.target.value) }))} /></label>
                <label className="wide work-progress-field"><span>ความคืบหน้า <b>{workForm.progress}%</b></span><input type="range" min="0" max="100" step="5" value={workForm.progress} onChange={(event) => { const progress = Number(event.target.value); setWorkForm((form) => ({ ...form, progress, status: progress === 100 ? "done" : form.status === "done" ? "in_progress" : form.status })); }} style={{ "--range-value": `${workForm.progress}%` } as React.CSSProperties} /></label>
                <label className="wide"><span>รายละเอียดและเกณฑ์สำเร็จ</span><textarea value={workForm.description} onChange={(event) => setWorkForm((form) => ({ ...form, description: event.target.value }))} placeholder="อธิบายสิ่งที่ต้องส่งมอบ หรือเงื่อนไขที่ถือว่าภารกิจสำเร็จ" /></label>
              </div>
              <div className="mission-point-note"><span>★</span><p><strong>แต้มจะมอบเมื่อสถานะเป็น “เสร็จแล้ว”</strong> งานเดิมจะได้รับแต้มเพียงครั้งเดียว แม้มีการแก้ไขภายหลัง</p></div>
            </div>
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowWorkForm(false)}>ยกเลิก</button><button className="primary-button" disabled={isSaving}>{isSaving ? "กำลังบันทึก..." : editingWorkItem ? "บันทึกความคืบหน้า" : "สร้างรายการ"}</button></div>
          </form>
        </div>
      )}

      {showProjectForm && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowProjectForm(false)}>
          <form className="employee-modal project-form-modal" onSubmit={saveProject} role="dialog" aria-modal="true" aria-labelledby="project-form-title">
            <div className="modal-header"><div><p className="eyebrow">NEW PROJECT</p><h2 id="project-form-title">สร้างโปรเจกต์ใหม่</h2><small>รวมงาน รีเควสต์ และภารกิจที่มีเป้าหมายเดียวกัน</small></div><button type="button" className="modal-close" onClick={() => setShowProjectForm(false)} aria-label="ปิดหน้าต่าง">×</button></div>
            <div className="form-grid project-form-grid">
              <label className="wide"><span>ชื่อโปรเจกต์</span><input required value={projectForm.name} onChange={(event) => setProjectForm((form) => ({ ...form, name: event.target.value }))} placeholder="เช่น Customer Experience 2027" /></label>
              <label className="wide"><span>เป้าหมายโปรเจกต์</span><textarea value={projectForm.description} onChange={(event) => setProjectForm((form) => ({ ...form, description: event.target.value }))} placeholder="อธิบายผลลัพธ์ที่ต้องการให้ทีมเข้าใจตรงกัน" /></label>
              <label><span>เจ้าของโปรเจกต์</span><select value={projectForm.ownerEmployeeId} onChange={(event) => setProjectForm((form) => ({ ...form, ownerEmployeeId: event.target.value }))}>{employees.filter((employee) => employee.status === "active").map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>
              <label><span>สถานะ</span><select value={projectForm.status} onChange={(event) => setProjectForm((form) => ({ ...form, status: event.target.value as ProjectRecord["status"] }))}><option value="planned">เตรียมเริ่ม</option><option value="active">กำลังดำเนินการ</option><option value="on_hold">พักไว้</option><option value="completed">เสร็จแล้ว</option></select></label>
              <label><span>กำหนดเสร็จ</span><input required type="date" value={projectForm.dueDate} onChange={(event) => setProjectForm((form) => ({ ...form, dueDate: event.target.value }))} /></label>
              <label><span>สีประจำโปรเจกต์</span><select value={projectForm.color} onChange={(event) => setProjectForm((form) => ({ ...form, color: event.target.value }))}><option value="forest">เขียวเข้ม</option><option value="mustard">ทอง</option><option value="terra">ส้มอิฐ</option><option value="sage">เขียวอ่อน</option></select></label>
            </div>
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowProjectForm(false)}>ยกเลิก</button><button className="primary-button" disabled={isSaving}>{isSaving ? "กำลังสร้าง..." : "สร้างโปรเจกต์"}</button></div>
          </form>
        </div>
      )}

      {rewardToRedeem && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setRewardToRedeem(null)}>
          <form className="reward-modal" onSubmit={redeemReward} role="dialog" aria-modal="true" aria-labelledby="reward-modal-title">
            <div className="reward-modal-hero"><span className={`reward-icon ${rewardToRedeem.category}`}>{rewardToRedeem.icon}</span><div><p className="eyebrow">REDEEM REWARD</p><h2 id="reward-modal-title">{rewardToRedeem.title}</h2><p>{rewardToRedeem.description}</p></div><button type="button" className="modal-close dark" onClick={() => setRewardToRedeem(null)} aria-label="ปิดหน้าต่าง">×</button></div>
            <div className="reward-modal-body">
              <label><span>พนักงานที่ใช้แต้ม</span><select value={rewardEmployeeId} onChange={(event) => setRewardEmployeeId(event.target.value)}>{leaderboard.map(({ employee, points }) => <option key={employee.id} value={employee.id}>{employee.name} · {formatMoney(points)} แต้ม</option>)}</select></label>
              <div className="reward-balance"><span><small>แต้มคงเหลือ</small><strong>{formatMoney(pointBalances.get(rewardEmployeeId) ?? 0)}</strong></span><b>−</b><span><small>ใช้แลกรางวัล</small><strong>{formatMoney(rewardToRedeem.costPoints)}</strong></span><b>=</b><span className={(pointBalances.get(rewardEmployeeId) ?? 0) < rewardToRedeem.costPoints ? "insufficient" : ""}><small>คงเหลือหลังแลก</small><strong>{formatMoney((pointBalances.get(rewardEmployeeId) ?? 0) - rewardToRedeem.costPoints)}</strong></span></div>
              <p className="reward-approval-note">คำขอจะเข้าสู่สถานะ “รออนุมัติ” และตัดแต้มทันที เพื่อป้องกันการใช้แต้มซ้ำ</p>
            </div>
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setRewardToRedeem(null)}>ยกเลิก</button><button className="primary-button" disabled={isSaving || (pointBalances.get(rewardEmployeeId) ?? 0) < rewardToRedeem.costPoints}>{isSaving ? "กำลังส่งคำขอ..." : `ยืนยันแลก ${formatMoney(rewardToRedeem.costPoints)} แต้ม`}</button></div>
          </form>
        </div>
      )}

      {skillProfileEmployee && skillProfileRole && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSkillProfileEmployee(null)}>
          <section className="skill-profile-modal" role="dialog" aria-modal="true" aria-labelledby="skill-profile-title">
            <div className="skill-profile-hero">
              <div className="profile-identity">
                <span>{skillProfileEmployee.initials || makeInitials(skillProfileEmployee.name)}</span>
                <div><p className="eyebrow">INDIVIDUAL SKILL PROFILE</p><h2 id="skill-profile-title">{skillProfileEmployee.name}</h2><small>{skillProfileRole.name} · {skillProfileRole.department}</small></div>
              </div>
              <button className="modal-close dark" onClick={() => setSkillProfileEmployee(null)} aria-label="ปิดหน้าต่าง">×</button>
              <div className="profile-score-block">
                <div><small>ความพร้อมด้านสกิล</small><strong>{skillProfileEvaluation ? skillProfileEvaluation.skillScore.toFixed(0) : "—"}</strong><span>/ 100</span></div>
                <div className="profile-score-copy"><b>{skillProfileEvaluation ? scoreStatus(skillProfileEvaluation.skillScore) : "รอประเมิน"}</b><p>{period}<br />เป้าหมายตามตำแหน่ง {skillProfileRole.skills.length} สกิล</p></div>
              </div>
            </div>
            <div className="skill-profile-body">
              <section className="talent-fit-section">
                <div className="talent-fit-heading">
                  <div><p className="eyebrow">TALENT FIT ANALYSIS</p><h3>กราฟสกิลที่ถนัด</h3><p>แปลงสกิลที่ประเมินแล้วเป็น 5 มิติ เพื่อมองเห็นรูปแบบความถนัดของบุคคล</p></div>
                  <div className="radar-legend"><span><i className="current" />ระดับปัจจุบัน</span><span><i className="target" />เป้าหมายตำแหน่งปัจจุบัน</span></div>
                </div>
                {skillProfileEvaluation ? (
                  <div className="talent-fit-grid">
                    <RadarChart values={skillProfileTalent} target={roleTalentProfiles[skillProfileRole.id]} employeeName={skillProfileEmployee.name} />
                    <div className="role-fit-panel">
                      <div className="role-fit-title"><span>ตำแหน่งที่เหมาะสม</span><small>เรียงจากรูปแบบสกิลที่ใกล้เคียงที่สุด</small></div>
                      <div className="role-fit-list">
                        {roleFitRecommendations.slice(0, 3).map(({ role, score }, index) => (
                          <article key={role.id} className={index === 0 ? "top" : ""}>
                            <span className="fit-rank">{String(index + 1).padStart(2, "0")}</span>
                            <div><strong>{role.name}</strong><small>{role.department}{role.id === skillProfileEmployee.roleId ? " · ตำแหน่งปัจจุบัน" : ""}</small></div>
                            <div className="fit-score"><strong>{score}%</strong><i><b style={{ width: `${score}%` }} /></i></div>
                          </article>
                        ))}
                      </div>
                      <p className="fit-disclaimer">ผลนี้เป็นคำแนะนำเบื้องต้นจากระดับสกิล 5 มิติ ควรพิจารณาประสบการณ์ ความสนใจ และผลงานร่วมด้วย</p>
                    </div>
                  </div>
                ) : (
                  <div className="talent-empty"><span>◎</span><div><strong>ยังสร้างกราฟไม่ได้</strong><p>เริ่มประเมินระดับสกิล 1–5 เพื่อดูกราฟความถนัดและตำแหน่งที่เหมาะสม</p></div><button onClick={() => editSkillProfile(skillProfileEmployee)}>เริ่มประเมินสกิล</button></div>
                )}
              </section>
              <div className="profile-section-heading"><div><p className="eyebrow">COMPETENCY DETAIL</p><h3>ระดับปัจจุบันเทียบเป้าหมาย</h3></div><span><i />ระดับปัจจุบัน <i className="target" />เป้าหมาย</span></div>
              <div className="profile-skill-list">
                {skillProfileRole.skills.map((skill) => {
                  const level = skillProfileEvaluation?.skillScores[skill.id] ?? null;
                  const gap = level === null ? null : skill.targetLevel - level;
                  return (
                    <article key={skill.id}>
                      <div className="profile-skill-name"><strong>{skill.name}</strong><small>{level === null ? "ยังไม่มีระดับในรอบนี้" : `${skillLevelLabel(level)} · ระดับ ${level} จาก 5`}</small></div>
                      <div className="profile-level-track" aria-label={`${skill.name}: ${level === null ? "รอประเมิน" : `ระดับ ${level}`} เป้าหมายระดับ ${skill.targetLevel}`}>
                        {[1, 2, 3, 4, 5].map((item) => <span key={item} className={`${level !== null && item <= level ? "filled" : ""} ${item === skill.targetLevel ? "target" : ""}`}><i />{item}</span>)}
                      </div>
                      <div className={`gap-pill ${gap !== null && gap <= 0 ? "ready" : ""}`}>{gap === null ? "รอประเมิน" : gap > 0 ? `ขาด ${gap} ระดับ` : gap === 0 ? "ตรงเป้าหมาย" : `เกิน ${Math.abs(gap)} ระดับ`}</div>
                    </article>
                  );
                })}
              </div>
              <div className="profile-insights">
                <article>
                  <span className="insight-icon strength">✓</span>
                  <div><strong>จุดแข็ง</strong><p>{skillProfileEvaluation ? (() => {
                    const strengths = skillProfileRole.skills.filter((skill) => (skillProfileEvaluation.skillScores[skill.id] ?? 0) >= skill.targetLevel);
                    return strengths.length ? strengths.map((skill) => skill.name).join(" · ") : "ยังไม่มีสกิลที่ถึงระดับเป้าหมาย";
                  })() : "ประเมินสกิลเพื่อค้นหาจุดแข็งของบุคคลนี้"}</p></div>
                </article>
                <article>
                  <span className="insight-icon focus">↗</span>
                  <div><strong>จุดเน้นพัฒนา</strong><p>{skillProfileEvaluation ? (() => {
                    const gaps = skillProfileRole.skills
                      .map((skill) => ({ skill, gap: skill.targetLevel - (skillProfileEvaluation.skillScores[skill.id] ?? 0) }))
                      .filter((item) => item.gap > 0)
                      .sort((a, b) => b.gap - a.gap);
                    return gaps.length ? gaps.slice(0, 2).map((item) => `${item.skill.name} (+${item.gap})`).join(" · ") : "พร้อมตามเป้าหมายของตำแหน่ง";
                  })() : "กำหนดระดับปัจจุบันเพื่อสร้างแผนพัฒนารายบุคคล"}</p></div>
                </article>
              </div>
              {skillProfileEvaluation?.note && <div className="profile-note"><span>บันทึกและแผนพัฒนา</span><p>{skillProfileEvaluation.note}</p></div>}
            </div>
            <div className="modal-actions profile-actions"><button className="secondary-button" onClick={() => setSkillProfileEmployee(null)}>ปิด</button><button className="primary-button" onClick={() => editSkillProfile(skillProfileEmployee)}>{skillProfileEvaluation ? "แก้ไขระดับสกิล" : "เริ่มประเมินสกิล"}</button></div>
          </section>
        </div>
      )}

      {hrEmployee && hrEmployeeInsight && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setHrEmployee(null)}>
          <form className="hr-plan-modal" onSubmit={saveHrPlan} role="dialog" aria-modal="true" aria-labelledby="hr-plan-title">
            <div className="hr-plan-hero">
              <div className="profile-identity"><span>{hrEmployee.initials || makeInitials(hrEmployee.name)}</span><div><p className="eyebrow">WORKFORCE PLAN</p><h2 id="hr-plan-title">จัดการแผนของ {hrEmployee.name}</h2><small>{hrEmployeeInsight.role.name} · {hrEmployeeInsight.role.department}</small></div></div>
              <button type="button" className="modal-close dark" onClick={() => setHrEmployee(null)} aria-label="ปิดหน้าต่าง">×</button>
              <div className="hr-plan-snapshot">
                <span><small>KPI รวม</small><strong>{hrEmployeeInsight.evaluation ? hrEmployeeInsight.evaluation.totalScore.toFixed(1) : "—"}</strong></span>
                <span><small>คะแนนสกิล</small><strong>{hrEmployeeInsight.evaluation ? hrEmployeeInsight.evaluation.skillScore.toFixed(1) : "—"}</strong></span>
                <span><small>Talent Fit สูงสุด</small><strong>{hrEmployeeInsight.bestFit ? `${hrEmployeeInsight.bestFit.score}%` : "—"}</strong><em>{hrEmployeeInsight.bestFit?.role.name ?? "รอประเมิน"}</em></span>
                <span><small>กรอบตำแหน่งปัจจุบัน</small><strong>฿{formatMoney(hrEmployeeInsight.salaryBand.min)}–{formatMoney(hrEmployeeInsight.salaryBand.max)}</strong></span>
              </div>
            </div>
            <div className="hr-plan-body">
              <section>
                <div className="hr-form-heading"><span>01</span><div><strong>ข้อมูลค่าตอบแทน</strong><small>เก็บเงินเดือนปัจจุบันและรอบทบทวนถัดไป</small></div></div>
                <div className="form-grid hr-form-grid">
                  <label><span>เงินเดือนปัจจุบัน (บาท/เดือน)</span><input required type="number" min="0" step="500" value={hrForm.currentSalary} onChange={(event) => setHrForm((form) => ({ ...form, currentSalary: Number(event.target.value) }))} /></label>
                  <label><span>รอบทบทวนเงินเดือน</span><input required value={hrForm.salaryReviewMonth} onChange={(event) => setHrForm((form) => ({ ...form, salaryReviewMonth: event.target.value }))} placeholder="เช่น มกราคม 2570" /></label>
                </div>
              </section>
              <section>
                <div className="hr-form-heading"><span>02</span><div><strong>สร้างแผนติดตาม</strong><small>เลือกได้ทั้งการทดสอบ อัปสกิล ทบทวนตำแหน่ง และเงินเดือน</small></div></div>
                <div className="form-grid hr-form-grid">
                  <label><span>ประเภทแผน</span><select value={hrForm.planType} onChange={(event) => setHrForm((form) => ({ ...form, planType: event.target.value as TalentActionRecord["type"] }))}><option value="skill_test">ทดสอบสกิล</option><option value="upskill">อัปสกิล</option><option value="role_review">ทบทวนตำแหน่ง</option><option value="salary_review">ทบทวนเงินเดือน</option></select></label>
                  <label><span>กำหนดเสร็จ</span><input required type="date" value={hrForm.dueDate} onChange={(event) => setHrForm((form) => ({ ...form, dueDate: event.target.value }))} /></label>
                  <label className="wide"><span>ชื่อแผน / กิจกรรม</span><input value={hrForm.title} onChange={(event) => setHrForm((form) => ({ ...form, title: event.target.value }))} placeholder="เว้นว่างได้ หากต้องการอัปเดตเงินเดือนอย่างเดียว" /></label>
                  <label className="wide"><span>ตำแหน่งเป้าหมาย</span><select value={hrForm.targetRoleId} onChange={(event) => setHrForm((form) => ({ ...form, targetRoleId: event.target.value }))}>{roles.map((role) => <option key={role.id} value={role.id}>{role.name} · กรอบ ฿{formatMoney(roleSalaryBands[role.id].min)}–{formatMoney(roleSalaryBands[role.id].max)}</option>)}</select></label>
                </div>
              </section>
              <div className="decision-note compact"><span>i</span><p>ข้อมูลเงินเดือนเป็นข้อมูลอ่อนไหว ควรกำหนดสิทธิ์การเข้าถึงและให้ผู้มีอำนาจอนุมัติตรวจสอบก่อนนำไปใช้จริง</p></div>
            </div>
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setHrEmployee(null)}>ยกเลิก</button><button className="primary-button" disabled={isSaving}>{isSaving ? "กำลังบันทึก..." : "บันทึกข้อมูลและแผน"}</button></div>
          </form>
        </div>
      )}

      {selectedEmployee && selectedRole && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSelectedEmployee(null)}>
          <section className="evaluation-modal" role="dialog" aria-modal="true" aria-labelledby="evaluation-title">
            <div className="modal-header">
              <div className="modal-person"><span>{selectedEmployee.initials}</span><div><p className="eyebrow">แบบประเมินรายบุคคล</p><h2 id="evaluation-title">{selectedEmployee.name}</h2><small>{selectedRole.name} · {period}</small></div></div>
              <button className="modal-close" onClick={() => setSelectedEmployee(null)} aria-label="ปิดหน้าต่าง">×</button>
            </div>
            <div className="modal-score-summary">
              <div><small>คะแนนรวม</small><strong>{grandTotal.toFixed(1)}</strong><span className={grandTotal < 75 ? "low" : ""}>{scoreStatus(grandTotal)}</span></div>
              <div className="score-formula"><span>KPI 70% <b>{kpiTotal.toFixed(1)}</b></span><span>สกิล 30% <b>{skillTotal.toFixed(1)}</b></span></div>
              <div className="modal-progress"><i style={{ width: `${grandTotal}%` }} /></div>
            </div>
            <div className="evaluation-columns">
              <div className="evaluation-section">
                <div className="evaluation-section-title"><span>01</span><div><strong>ผลงานตาม KPI</strong><small>ให้คะแนนจากผลลัพธ์จริง 0–100</small></div></div>
                <div className="kpi-editor">
                  {selectedRole.kpis.map((kpi) => (
                    <label key={kpi.id}>
                      <span className="kpi-label"><span><strong>{kpi.name}</strong><small>น้ำหนัก {kpi.weight}% · เป้าหมาย {kpi.target}</small></span><b>{kpiScores[kpi.id]}</b></span>
                      <input type="range" min="0" max="100" value={kpiScores[kpi.id] ?? 0} onChange={(event) => setKpiScores((scores) => ({ ...scores, [kpi.id]: Number(event.target.value) }))} style={{ "--range-value": `${kpiScores[kpi.id] ?? 0}%` } as React.CSSProperties} />
                    </label>
                  ))}
                </div>
              </div>
              <div className="evaluation-section">
                <div className="evaluation-section-title"><span>02</span><div><strong>ระดับสกิล</strong><small>เลือกระดับความสามารถ 1–5</small></div></div>
                <div className="skill-editor">
                  {selectedRole.skills.map((skill) => (
                    <fieldset key={skill.id}><legend><strong>{skill.name}</strong><small>เป้าหมาย {skill.target}</small></legend><div className="level-picker">
                      {[1, 2, 3, 4, 5].map((level) => <button type="button" key={level} className={(skillScores[skill.id] ?? 1) === level ? "active" : ""} onClick={() => setSkillScores((scores) => ({ ...scores, [skill.id]: level }))} aria-label={`${skill.name} ระดับ ${level}`}>{level}</button>)}
                    </div></fieldset>
                  ))}
                </div>
              </div>
            </div>
            <label className="note-field"><span>บันทึกและแผนพัฒนา</span><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="ระบุผลงานเด่น จุดที่ควรพัฒนา และสิ่งที่องค์กรจะสนับสนุน..." /></label>
            <div className="modal-actions"><button className="secondary-button" onClick={() => setSelectedEmployee(null)}>ยกเลิก</button><button className="primary-button" disabled={isSaving} onClick={saveEvaluation}>{isSaving ? "กำลังบันทึก..." : "บันทึกผลประเมิน"}</button></div>
          </section>
        </div>
      )}

      {showAddEmployee && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowAddEmployee(false)}>
          <form className="employee-modal" onSubmit={addEmployee} role="dialog" aria-modal="true" aria-labelledby="add-employee-title">
            <div className="modal-header"><div><p className="eyebrow">ทะเบียนพนักงาน</p><h2 id="add-employee-title">เพิ่มพนักงานใหม่</h2><small>ข้อมูลนี้จะพร้อมสำหรับการประเมินในทุกรอบ</small></div><button type="button" className="modal-close" onClick={() => setShowAddEmployee(false)} aria-label="ปิดหน้าต่าง">×</button></div>
            <div className="form-grid">
              <label className="wide"><span>ชื่อ–นามสกุล</span><input required value={employeeForm.name} onChange={(event) => setEmployeeForm((form) => ({ ...form, name: event.target.value }))} placeholder="เช่น อริสา ตั้งใจ" /></label>
              <label className="wide"><span>อีเมล</span><input required type="email" value={employeeForm.email} onChange={(event) => setEmployeeForm((form) => ({ ...form, email: event.target.value }))} placeholder="name@company.com" /></label>
              <label><span>ตำแหน่ง</span><select value={employeeForm.roleId} onChange={(event) => setEmployeeForm((form) => ({ ...form, roleId: event.target.value }))}>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
              <label><span>ผู้จัดการ</span><input value={employeeForm.manager} onChange={(event) => setEmployeeForm((form) => ({ ...form, manager: event.target.value }))} placeholder="ชื่อผู้จัดการ" /></label>
            </div>
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowAddEmployee(false)}>ยกเลิก</button><button className="primary-button" disabled={isSaving}>{isSaving ? "กำลังเพิ่ม..." : "เพิ่มพนักงาน"}</button></div>
          </form>
        </div>
      )}

      <div className={`toast ${toast ? "show" : ""}`} role="status"><span>✓</span>{toast}</div>
    </main>
  );
}

function MetricCard({ label, value, copy, icon, tone = "", progress }: { label: string; value: string; copy: string; icon: string; tone?: string; progress?: number }) {
  return <article className="metric-card"><div className="metric-top"><span>{label}</span><i className="metric-icon">{icon}</i></div><strong>{value}</strong><p className={tone}>{copy}</p>{progress !== undefined && <div className="mini-progress"><i style={{ width: `${progress}%` }} /></div>}</article>;
}

function EmployeeCompact({ employee, onClick }: { employee: EmployeeRecord; onClick: () => void }) {
  const role = getRole(employee.roleId);
  return <button className="employee-row" onClick={onClick}><span className="employee-avatar">{employee.initials}</span><span className="employee-copy"><strong>{employee.name}</strong><small>{role.name}</small><em>ยังไม่มีผลรอบนี้</em></span><span className="row-arrow" aria-hidden="true">›</span></button>;
}

function ScoreCell({ value }: { value: number | null }) {
  return <span className="table-score"><strong>{value === null ? "—" : value.toFixed(1)}</strong><i><b style={{ width: `${value ?? 0}%` }} /></i></span>;
}

function RadarChart({ values, target, employeeName }: { values: Record<TalentDimensionId, number>; target: Record<TalentDimensionId, number>; employeeName: string }) {
  const accessibleSummary = talentDimensions.map(({ id, label }) => `${label} ${values[id].toFixed(1)} จาก 5`).join(", ");
  return (
    <div className="radar-card">
      <div className="radar-chart" role="img" aria-label={`กราฟสกิลของ ${employeeName}: ${accessibleSummary}`}>
        <div className="radar-rings" aria-hidden="true">{[1, 2, 3, 4, 5].map((level) => <i key={level} style={{ width: `${level * 17.6}%`, height: `${level * 17.6}%` }} />)}</div>
        <div className="radar-axes" aria-hidden="true">{talentDimensions.map(({ id }, index) => <i key={id} style={{ transform: `translateX(-50%) rotate(${index * 72}deg)` }} />)}</div>
        <div className="radar-shape target" style={{ clipPath: `polygon(${radarPolygon(target)})` }} aria-hidden="true" />
        <div className="radar-shape current" style={{ clipPath: `polygon(${radarPolygon(values)})` }} aria-hidden="true" />
        {talentDimensions.map(({ id, shortLabel }, index) => <span key={id} className={`radar-label label-${index}`}><strong>{shortLabel}</strong><small>{values[id].toFixed(1)}</small></span>)}
      </div>
      <div className="talent-dimension-list">
        {talentDimensions.map(({ id, label }) => <span key={id}><small>{label}</small><strong>{values[id].toFixed(1)}</strong><i><b style={{ width: `${values[id] / 5 * 100}%` }} /></i></span>)}
      </div>
    </div>
  );
}
