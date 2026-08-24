"use client";

import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import type { Office3DPerson } from "./office-3d";
import {
  type ApplicationDocumentRecord,
  type AttendanceRecord,
  type EmployeeRecord,
  type EmployeeProfileRecord,
  type EmploymentContractRecord,
  type EvaluationRecord,
  type HrProfileRecord,
  type PointEventRecord,
  type PointEventType,
  type PointLedgerRecord,
  type ProjectRecord,
  type RewardRecord,
  type RewardRedemptionRecord,
  type SkillAchievementRecord,
  type TalentActionRecord,
  type UserAccountRecord,
  type WorkItemRecord,
  type WorkSubmissionRecord,
  getRole,
  makeInitials,
  periods,
  pointEventRules,
  roleSalaryBands,
  roles,
  scoreStatus,
  skillAllowanceFor,
} from "../lib/kpi-data";

const Office3D = lazy(() => import("./office-3d"));

type View = "overview" | "employees" | "profiles" | "skills" | "power" | "peopleOps" | "hr" | "portfolio" | "work" | "office" | "access";

type CurrentUser = UserAccountRecord & { authenticatedName: string };

type AppPermissions = { canManageAccounts: boolean; canManagePeople: boolean; canManageWork: boolean; canReviewWork: boolean; canViewTeam: boolean };

type OfficeLoadLevel = "available" | "steady" | "busy" | "overloaded";

type OfficeLoadFilter = "all" | OfficeLoadLevel;

type OfficeScene = "sales" | "campaign" | "service" | "code" | "edit" | "people";

type OfficeBehavior = "rush" | "work" | "chill" | "walk" | "nap" | "chat";

type OfficePersonModel = {
  employee: EmployeeRecord;
  role: ReturnType<typeof getRole>;
  scene: OfficeScene;
  openItems: WorkItemRecord[];
  doneItems: WorkItemRecord[];
  currentTask: WorkItemRecord | null;
  capacity: number;
  loadUnits: number;
  loadRatio: number;
  level: OfficeLoadLevel;
  averageProgress: number;
  overdueCount: number;
};

type PortfolioStatusFilter = "all" | "approved" | "submitted" | "revision" | "missing";

type WorkDueFilter = "all" | "today" | "overdue" | "week";

type WorkViewMode = "list" | "board";

type TalentDimensionId = "analysis" | "communication" | "problemSolving" | "leadership" | "execution";

type PowerStatId = "speed" | "technique" | "vision" | "teamwork" | "problemSolving" | "leadership";

type PowerTierId = "legend" | "elite" | "gold" | "silver" | "bronze";

type EmployeePowerProfile = {
  employee: EmployeeRecord;
  role: ReturnType<typeof getRole>;
  overall: number | null;
  potential: number | null;
  stats: Record<PowerStatId, number>;
  workRate: number;
  tier: { id: PowerTierId; label: string };
};

const powerStats: { id: PowerStatId; code: string; label: string; description: string }[] = [
  { id: "speed", code: "SPD", label: "ความเร็วงาน", description: "การลงมือทำและความคืบหน้างาน" },
  { id: "technique", code: "TEC", label: "ความเชี่ยวชาญ", description: "คะแนนสกิลรวมตามบทบาท" },
  { id: "vision", code: "VIS", label: "วิสัยทัศน์", description: "การวิเคราะห์และมองภาพรวม" },
  { id: "teamwork", code: "TWK", label: "ทีมเวิร์ก", description: "การสื่อสารและทำงานร่วมกัน" },
  { id: "problemSolving", code: "PRB", label: "แก้ปัญหา", description: "การตัดสินใจและแก้โจทย์" },
  { id: "leadership", code: "LDR", label: "ภาวะผู้นำ", description: "การนำทีมและพัฒนาผู้อื่น" },
];

function clampPower(value: number) {
  return Math.max(1, Math.min(99, Math.round(value)));
}

function getPowerTier(overall: number | null): EmployeePowerProfile["tier"] {
  if (overall === null || overall < 70) return { id: "bronze", label: "BRONZE" };
  if (overall < 80) return { id: "silver", label: "SILVER" };
  if (overall < 85) return { id: "gold", label: "GOLD" };
  if (overall < 90) return { id: "elite", label: "ELITE" };
  return { id: "legend", label: "LEGEND" };
}

function buildEmployeePower(employee: EmployeeRecord, evaluation: EvaluationRecord | null, assignedWork: WorkItemRecord[]): EmployeePowerProfile {
  const role = getRole(employee.roleId);
  const emptyStats = Object.fromEntries(powerStats.map(({ id }) => [id, 0])) as Record<PowerStatId, number>;
  if (!evaluation) return { employee, role, overall: null, potential: null, stats: emptyStats, workRate: 0, tier: getPowerTier(null) };

  const talent = buildTalentProfile(employee.roleId, evaluation);
  const workRate = assignedWork.length
    ? assignedWork.reduce((sum, item) => sum + item.progress, 0) / assignedWork.length
    : evaluation.totalScore;
  const stats: Record<PowerStatId, number> = {
    speed: clampPower(talent.execution * 14 + workRate * .3),
    technique: clampPower(evaluation.skillScore),
    vision: clampPower(talent.analysis * 20),
    teamwork: clampPower(talent.communication * 20),
    problemSolving: clampPower(talent.problemSolving * 20),
    leadership: clampPower(talent.leadership * 20),
  };
  const statAverage = Object.values(stats).reduce((sum, value) => sum + value, 0) / powerStats.length;
  const overall = clampPower(statAverage * .7 + evaluation.kpiScore * .3);
  const potential = clampPower(overall + Math.max(2, (100 - evaluation.skillScore) * .08));
  return { employee, role, overall, potential, stats, workRate, tier: getPowerTier(overall) };
}

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
  "video-editor": { analysis: 4, communication: 4, problemSolving: 4, leadership: 3, execution: 5 },
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
  "video-editing": { execution: .6, analysis: .25, communication: .15 },
  "motion-graphics": { execution: .6, problemSolving: .4 },
  "sound-design": { analysis: .4, execution: .6 },
  "creative-collaboration": { communication: .7, leadership: .3 },
  "people-analytics": { analysis: .8, problemSolving: .2 },
  "labor-practice": { execution: .7, analysis: .3 },
  facilitation: { communication: .7, leadership: .3 },
  "talent-development": { leadership: .6, communication: .4 },
};

const submissionTypeLabels: Record<WorkSubmissionRecord["submissionType"], string> = {
  video: "วิดีโอ / Showreel",
  drive: "Drive / Cloud Storage",
  social: "โพสต์ Social Media",
  document: "เอกสาร / รายงาน",
  design: "งานออกแบบ / Artwork",
  code: "โค้ด / Pull Request / Deploy",
  sales: "ยอดขาย / CRM / ใบเสนอราคา",
  service: "Ticket / หลักฐานบริการลูกค้า",
  hr: "เอกสาร HR / การอบรม",
  other: "หลักฐานประเภทอื่น",
};

const attendanceStatusMeta: Record<AttendanceRecord["status"], { label: string; tone: string }> = {
  present: { label: "ตรงเวลา", tone: "positive" },
  late: { label: "มาสาย", tone: "warning" },
  absent: { label: "ขาดงาน", tone: "negative" },
  leave: { label: "ลา", tone: "leave" },
};

const leaveTypeLabels: Record<NonNullable<AttendanceRecord["leaveType"]>, string> = {
  sick: "ลาป่วย",
  personal: "ลากิจ",
  vacation: "ลาพักร้อน",
  other: "ลาอื่น ๆ",
};

const growthRoleNames: Record<string, string> = {
  "sales-manager": "ผู้อำนวยการฝ่ายขาย",
  marketing: "นักกลยุทธ์การตลาดอาวุโส",
  "customer-service": "หัวหน้าทีมบริการลูกค้า",
  developer: "Senior Software Developer",
  "video-editor": "Senior Video Editor",
  hr: "People Development Lead",
};

const roleProofGuides: Record<string, { defaultType: WorkSubmissionRecord["submissionType"]; headline: string; examples: string[] }> = {
  "video-editor": { defaultType: "video", headline: "งานตัดต่อและโปรดักชัน", examples: ["ลิงก์วิดีโอฉบับ Final", "โฟลเดอร์ Drive ที่เก็บไฟล์ต้นฉบับ", "ลิงก์โพสต์ Social Media ที่เผยแพร่แล้ว"] },
  marketing: { defaultType: "social", headline: "งานการตลาดและคอนเทนต์", examples: ["ลิงก์โพสต์หรือหน้าแคมเปญ", "รายงานผลโฆษณา / Dashboard", "ไฟล์ Artwork, Copy หรือแผนคอนเทนต์"] },
  developer: { defaultType: "code", headline: "งานพัฒนาซอฟต์แวร์", examples: ["ลิงก์ Pull Request หรือ Commit", "ลิงก์ระบบที่ Deploy แล้ว", "Test report, Screenshot หรือคู่มือใช้งาน"] },
  "sales-manager": { defaultType: "sales", headline: "งานขายและบริหารลูกค้า", examples: ["เลขดีลหรือรายงานจาก CRM", "ใบเสนอราคา / PO / หลักฐานปิดการขาย", "บันทึกประชุมหรือการยืนยันจากลูกค้า"] },
  "customer-service": { defaultType: "service", headline: "งานบริการลูกค้า", examples: ["เลข Ticket หรือ Case ที่ปิดแล้ว", "บทสนทนาที่ปกปิดข้อมูลอ่อนไหว", "ผล CSAT หรือรายงานการแก้ปัญหา"] },
  hr: { defaultType: "hr", headline: "งานทรัพยากรบุคคล", examples: ["แบบฟอร์มหรือเอกสารที่อนุมัติแล้ว", "รายชื่อผู้เข้าอบรม / ผลประเมิน", "รายงานสรรหา Onboarding หรือนโยบาย"] },
};

const defaultProofGuide = { defaultType: "document" as const, headline: "หลักฐานการส่งมอบงาน", examples: ["ลิงก์ผลงานหรือระบบที่ใช้งานจริง", "ไฟล์รายงาน รูปภาพ หรือเอกสารยืนยัน", "ข้อความสรุปผลลัพธ์และเกณฑ์ที่ทำสำเร็จ"] };

const manualPointEventTypes: PointEventType[] = ["attendance_on_time", "attendance_late", "absence", "approved_leave", "early_finish", "on_time_finish", "work_error", "warning", "rule_violation", "bonus", "quest"];

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

function bangkokIsoDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function addIsoDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00+07:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return bangkokIsoDate(date);
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
  return { task: "งาน", request: "รีเควสต์", mission: "ภารกิจ / เควสต์" }[kind];
}

function workStatusLabel(status: WorkItemRecord["status"]) {
  return { todo: "ต้องทำ", in_progress: "กำลังทำ", review: "รอตรวจ", done: "เสร็จแล้ว" }[status];
}

function workSubmissionStatusLabel(status: WorkSubmissionRecord["status"]) {
  return { submitted: "รอตรวจหลักฐาน", approved: "อนุมัติแล้ว", revision: "ส่งกลับให้แก้ไข" }[status];
}

function portfolioStatusLabel(status: Exclude<PortfolioStatusFilter, "all">) {
  return { approved: "ตรวจและจัดเก็บแล้ว", submitted: "รอผู้ตรวจอนุมัติ", revision: "รอแก้ไขผลงาน", missing: "ยังไม่มีหลักฐาน" }[status];
}

function workPriorityLabel(priority: WorkItemRecord["priority"]) {
  return { low: "ทั่วไป", medium: "ปานกลาง", high: "สำคัญ", urgent: "เร่งด่วน" }[priority];
}

function projectStatusLabel(status: ProjectRecord["status"]) {
  return { planned: "เตรียมเริ่ม", active: "กำลังดำเนินการ", on_hold: "พักไว้", completed: "เสร็จแล้ว" }[status];
}

const requiredDocumentTypes: ApplicationDocumentRecord["documentType"][] = ["resume", "id_card", "house_registration", "transcript", "bank_account"];

const documentTypeLabels: Record<ApplicationDocumentRecord["documentType"], string> = {
  resume: "ประวัติย่อ (Resume)",
  id_card: "สำเนาบัตรประชาชน",
  house_registration: "สำเนาทะเบียนบ้าน",
  transcript: "วุฒิการศึกษา / Transcript",
  portfolio: "Portfolio / ผลงาน",
  bank_account: "สำเนาบัญชีธนาคาร",
  medical_certificate: "ใบรับรองแพทย์",
  contract: "เอกสารสัญญาจ้าง",
  other: "เอกสารอื่น",
};

function documentStatusLabel(status: ApplicationDocumentRecord["status"]) {
  return { pending: "รอตรวจ", verified: "ตรวจแล้ว", rejected: "ต้องแก้ไข" }[status];
}

function employmentTypeLabel(type: EmployeeProfileRecord["employmentType"]) {
  return { permanent: "พนักงานประจำ", contract: "พนักงานสัญญาจ้าง", probation: "ทดลองงาน", intern: "ฝึกงาน" }[type];
}

function contractStatusLabel(status: EmploymentContractRecord["status"]) {
  return { draft: "ฉบับร่าง", sent: "ส่งให้ลงนาม", viewed: "เปิดอ่านแล้ว", signed: "ลงนามแล้ว", cancelled: "ยกเลิก" }[status];
}

function formatFileSize(bytes: number) {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const officeCapacityByRole: Record<string, number> = {
  "sales-manager": 4.5,
  marketing: 4,
  "customer-service": 5,
  developer: 4.5,
  "video-editor": 4,
  hr: 4.5,
};

const officeLevelMeta: Record<OfficeLoadLevel, { label: string; copy: string }> = {
  available: { label: "พร้อมรับงาน", copy: "มีพื้นที่สำหรับงานใหม่" },
  steady: { label: "สมดุล", copy: "กำลังทำงานตามแผน" },
  busy: { label: "งานแน่น", copy: "กำลังเร่งหลายรายการ" },
  overloaded: { label: "งานล้น", copy: "ควรช่วยแบ่งหรือเลื่อนงาน" },
};

function officeSceneForRole(roleId: string): OfficeScene {
  if (roleId === "sales-manager") return "sales";
  if (roleId === "customer-service") return "service";
  if (roleId === "developer") return "code";
  if (roleId === "video-editor") return "edit";
  if (roleId === "hr") return "people";
  return "campaign";
}

function officeLevelFor(loadRatio: number, openCount: number): OfficeLoadLevel {
  if (openCount === 0 || loadRatio < .22) return "available";
  if (loadRatio < .65) return "steady";
  if (loadRatio < 1) return "busy";
  return "overloaded";
}

function officeBehaviorFor(level: OfficeLoadLevel, index: number): OfficeBehavior {
  if (level === "overloaded") return "rush";
  if (level === "busy") return "work";
  if (level === "steady") return "chill";
  return (["walk", "nap", "walk", "chat"] as OfficeBehavior[])[index % 4];
}

const viewMeta: Record<View, { eyebrow: string; title: string; description: string }> = {
  overview: { eyebrow: "ภาพรวมองค์กร", title: "ภาพรวม KPI พนักงาน", description: "ติดตามเป้าหมาย ประเมินผลงาน และวางแผนพัฒนาทีมในที่เดียว" },
  employees: { eyebrow: "ทะเบียนและการประเมิน", title: "พนักงานและผลประเมิน", description: "ค้นหา เพิ่มพนักงาน และบันทึกผล KPI พร้อมระดับสกิลรายบุคคล" },
  profiles: { eyebrow: "EMPLOYEE DIGITAL DOSSIER", title: "แฟ้มประวัติพนักงาน", description: "รวมข้อมูลส่วนตัว เอกสารสมัครงาน การตรวจเอกสาร และสัญญาจ้างพร้อมลายเซ็นอิเล็กทรอนิกส์" },
  skills: { eyebrow: "COMPETENCY MATRIX", title: "ภาพรวมสกิลของทีม", description: "มองเห็นจุดแข็ง ช่องว่าง และความพร้อมของแต่ละสายงาน" },
  power: { eyebrow: "TEAM POWER RATINGS", title: "ค่าพลังพนักงาน", description: "ดูค่าพลังรวมและ 6 สกิลหลักในรูปแบบการ์ด พร้อมเปรียบเทียบจุดเด่นของพนักงานแบบตัวต่อตัว" },
  peopleOps: { eyebrow: "PEOPLE OPERATING SYSTEM", title: "เวลาเข้างานและเส้นทางเติบโต", description: "ลงเวลา อนุมัติวันลา ยืนยันสกิล เพิ่มค่าตอบแทน และเห็นความพร้อมเลื่อนตำแหน่งในระบบเดียว" },
  hr: { eyebrow: "WORKFORCE MANAGEMENT", title: "บริหารทรัพยากรบุคคล", description: "เชื่อมผลงาน สกิล การทดสอบ แผนพัฒนา ตำแหน่งที่เหมาะสม และค่าตอบแทน เพื่อการตัดสินใจที่รอบด้าน" },
  portfolio: { eyebrow: "EMPLOYEE WORK PORTFOLIO", title: "แฟ้มผลงานพนักงาน", description: "ค้นหางานที่ส่งมอบแล้ว ไฟล์ ลิงก์ ผู้ตรวจ และผลประเมินของแต่ละคนได้จากที่เดียว" },
  work: { eyebrow: "SMART TO-DO WORKSPACE", title: "ทูดูลิสงานและโปรเจกต์", description: "เห็นงานที่ต้องทำวันนี้ งานค้าง ผู้รับผิดชอบ กำหนดส่ง และความคืบหน้าของทีมเป็นอันดับแรก" },
  office: { eyebrow: "INTERACTIVE 3D OFFICE WORLD", title: "ออฟฟิศ 3D แบบเกม", description: "หมุนและซูมฉากได้ ตัวละครทำงานหรือเลือกเส้นทางเดินเองตามภาระงานจากทูดูลิส" },
  access: { eyebrow: "ACCESS & PERMISSIONS", title: "ผู้ใช้งานและสิทธิ์เข้าถึง", description: "ผูกอีเมลเข้าสู่ระบบกับพนักงาน และกำหนดว่าใครเป็น HR หัวหน้าทีม หรือพนักงาน" },
};

export default function Home() {
  const [view, setView] = useState<View>("work");
  const [activeDepartment, setActiveDepartment] = useState("all");
  const [period, setPeriod] = useState(periods[0]);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [evaluations, setEvaluations] = useState<EvaluationRecord[]>([]);
  const [hrProfiles, setHrProfiles] = useState<HrProfileRecord[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [skillAchievements, setSkillAchievements] = useState<SkillAchievementRecord[]>([]);
  const [talentActions, setTalentActions] = useState<TalentActionRecord[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [workItems, setWorkItems] = useState<WorkItemRecord[]>([]);
  const [workSubmissions, setWorkSubmissions] = useState<WorkSubmissionRecord[]>([]);
  const [rewards, setRewards] = useState<RewardRecord[]>([]);
  const [pointLedger, setPointLedger] = useState<PointLedgerRecord[]>([]);
  const [pointEvents, setPointEvents] = useState<PointEventRecord[]>([]);
  const [rewardRedemptions, setRewardRedemptions] = useState<RewardRedemptionRecord[]>([]);
  const [employeeProfiles, setEmployeeProfiles] = useState<EmployeeProfileRecord[]>([]);
  const [applicationDocuments, setApplicationDocuments] = useState<ApplicationDocumentRecord[]>([]);
  const [employmentContracts, setEmploymentContracts] = useState<EmploymentContractRecord[]>([]);
  const [userAccounts, setUserAccounts] = useState<UserAccountRecord[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [permissions, setPermissions] = useState<AppPermissions>({ canManageAccounts: false, canManagePeople: false, canManageWork: false, canReviewWork: false, canViewTeam: false });
  const [accessDenied, setAccessDenied] = useState<{ email: string; name: string } | null>(null);
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
  const [submissionWorkItem, setSubmissionWorkItem] = useState<WorkItemRecord | null>(null);
  const [submissionFile, setSubmissionFile] = useState<File | null>(null);
  const [reviewerNote, setReviewerNote] = useState("");
  const [rewardToRedeem, setRewardToRedeem] = useState<RewardRecord | null>(null);
  const [profileEmployeeId, setProfileEmployeeId] = useState("");
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [showContractForm, setShowContractForm] = useState(false);
  const [contractToSign, setContractToSign] = useState<EmploymentContractRecord | null>(null);
  const [uploadingDocumentType, setUploadingDocumentType] = useState<ApplicationDocumentRecord["documentType"] | null>(null);
  const [uploadingProfileImage, setUploadingProfileImage] = useState(false);
  const [powerLeftId, setPowerLeftId] = useState("");
  const [powerRightId, setPowerRightId] = useState("");
  const [workFilter, setWorkFilter] = useState<"all" | WorkItemRecord["kind"]>("all");
  const [workSearch, setWorkSearch] = useState("");
  const [workDueFilter, setWorkDueFilter] = useState<WorkDueFilter>("all");
  const [workAssigneeFilter, setWorkAssigneeFilter] = useState("all");
  const [workViewMode, setWorkViewMode] = useState<WorkViewMode>("list");
  const [officeLoadFilter, setOfficeLoadFilter] = useState<OfficeLoadFilter>("all");
  const [quickUpdatingWorkId, setQuickUpdatingWorkId] = useState("");
  const [portfolioSearch, setPortfolioSearch] = useState("");
  const [portfolioEmployeeId, setPortfolioEmployeeId] = useState("all");
  const [portfolioProjectId, setPortfolioProjectId] = useState("all");
  const [portfolioStatus, setPortfolioStatus] = useState<PortfolioStatusFilter>("all");
  const [monthlyPointMonth, setMonthlyPointMonth] = useState(new Date().toISOString().slice(0, 7));
  const [pointHistoryEmployeeId, setPointHistoryEmployeeId] = useState("all");
  const [peopleOpsEmployeeId, setPeopleOpsEmployeeId] = useState("");
  const [attendanceDate, setAttendanceDate] = useState(bangkokIsoDate());
  const [officeClock, setOfficeClock] = useState("--:--");
  const [employeeForm, setEmployeeForm] = useState({ name: "", email: "", roleId: roles[0].id, manager: "" });
  const [hrForm, setHrForm] = useState({ actionId: "", currentSalary: 0, salaryReviewMonth: "มกราคม 2570", planType: "upskill" as TalentActionRecord["type"], title: "", dueDate: "2026-09-30", targetRoleId: roles[0].id });
  const [workForm, setWorkForm] = useState({ projectId: "", assigneeEmployeeId: "", kind: "task" as WorkItemRecord["kind"], title: "", description: "", priority: "medium" as WorkItemRecord["priority"], status: "todo" as WorkItemRecord["status"], progress: 0, points: 100, dueDate: "2026-09-05" });
  const [submissionForm, setSubmissionForm] = useState({ submissionType: "document" as WorkSubmissionRecord["submissionType"], title: "", linkUrl: "", note: "" });
  const [projectForm, setProjectForm] = useState({ name: "", description: "", ownerEmployeeId: "", status: "active" as ProjectRecord["status"], dueDate: "2026-10-30", color: "forest" });
  const [rewardEmployeeId, setRewardEmployeeId] = useState("");
  const [profileForm, setProfileForm] = useState<Omit<EmployeeProfileRecord, "employeeId" | "updatedAt">>({ personalEmail: "", phone: "", birthDate: "", nationalIdLast4: "", address: "", emergencyName: "", emergencyPhone: "", startDate: "", employmentType: "permanent", education: "", experienceYears: 0, applicationSource: "" });
  const [contractForm, setContractForm] = useState({ title: "สัญญาจ้างพนักงาน", version: "1.0", status: "sent" as "draft" | "sent", effectiveDate: "2026-09-01", expiryDate: "", documentId: "" });
  const [signatureForm, setSignatureForm] = useState({ signedName: "", consent: false });
  const [pointEventForm, setPointEventForm] = useState({ employeeId: "", eventType: "attendance_on_time" as PointEventType, eventDate: new Date().toISOString().slice(0, 10), note: "", evidenceUrl: "" });
  const [attendanceForm, setAttendanceForm] = useState({ employeeId: "", workDate: bangkokIsoDate(), status: "present" as AttendanceRecord["status"], clockIn: "09:00", clockOut: "", leaveType: "personal" as NonNullable<AttendanceRecord["leaveType"]>, note: "" });
  const [skillAchievementForm, setSkillAchievementForm] = useState({ skillId: "", level: 2, evidenceUrl: "", note: "" });
  const [userAccountForm, setUserAccountForm] = useState({ accountId: "", email: "", displayName: "", role: "employee" as UserAccountRecord["role"], employeeId: "", departmentId: "", status: "active" as UserAccountRecord["status"] });

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/dashboard?period=${encodeURIComponent(period)}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as { currentUser?: CurrentUser; permissions?: AppPermissions; userAccounts?: UserAccountRecord[]; employees?: EmployeeRecord[]; evaluations?: EvaluationRecord[]; hrProfiles?: HrProfileRecord[]; attendanceRecords?: AttendanceRecord[]; skillAchievements?: SkillAchievementRecord[]; talentActions?: TalentActionRecord[]; projects?: ProjectRecord[]; workItems?: WorkItemRecord[]; workSubmissions?: WorkSubmissionRecord[]; rewards?: RewardRecord[]; pointLedger?: PointLedgerRecord[]; pointEvents?: PointEventRecord[]; rewardRedemptions?: RewardRedemptionRecord[]; employeeProfiles?: EmployeeProfileRecord[]; applicationDocuments?: ApplicationDocumentRecord[]; employmentContracts?: EmploymentContractRecord[]; accessDenied?: boolean; identity?: { email: string; name: string } | null; error?: string };
        if (response.status === 403 && body.accessDenied) {
          setAccessDenied(body.identity ?? { email: "ไม่พบอีเมล", name: "ผู้ใช้งาน" });
          setCurrentUser(null);
          setEmployees([]);
          setWorkItems([]);
          return;
        }
        if (!response.ok) throw new Error(body.error ?? "โหลดข้อมูลไม่สำเร็จ");
        setCurrentUser(body.currentUser ?? null);
        setPermissions(body.permissions ?? { canManageAccounts: false, canManagePeople: false, canManageWork: false, canReviewWork: false, canViewTeam: false });
        setUserAccounts(body.userAccounts ?? []);
        setAccessDenied(null);
        setEmployees(body.employees ?? []);
        setEvaluations(body.evaluations ?? []);
        setHrProfiles(body.hrProfiles ?? []);
        setAttendanceRecords(body.attendanceRecords ?? []);
        setSkillAchievements(body.skillAchievements ?? []);
        setTalentActions(body.talentActions ?? []);
        setProjects(body.projects ?? []);
        setWorkItems(body.workItems ?? []);
        setWorkSubmissions(body.workSubmissions ?? []);
        setRewards(body.rewards ?? []);
        setPointLedger(body.pointLedger ?? []);
        setPointEvents(body.pointEvents ?? []);
        setRewardRedemptions(body.rewardRedemptions ?? []);
        setEmployeeProfiles(body.employeeProfiles ?? []);
        setApplicationDocuments(body.applicationDocuments ?? []);
        setEmploymentContracts(body.employmentContracts ?? []);
        setDataWarning("");
        const firstEmployeeId = body.employees?.[0]?.id ?? "";
        const secondEmployeeId = body.employees?.[1]?.id ?? firstEmployeeId;
        const firstProjectId = body.projects?.[0]?.id ?? "";
        if (firstEmployeeId) {
          setProfileEmployeeId((value) => value || firstEmployeeId);
          setPowerLeftId((value) => value || firstEmployeeId);
          setPowerRightId((value) => value || secondEmployeeId);
          setPeopleOpsEmployeeId((value) => value || firstEmployeeId);
          setRewardEmployeeId((value) => value || firstEmployeeId);
          setPointEventForm((form) => ({ ...form, employeeId: form.employeeId || firstEmployeeId }));
          setAttendanceForm((form) => ({ ...form, employeeId: form.employeeId || firstEmployeeId }));
          setProjectForm((form) => ({ ...form, ownerEmployeeId: form.ownerEmployeeId || firstEmployeeId }));
          setWorkForm((form) => ({ ...form, projectId: form.projectId || firstProjectId, assigneeEmployeeId: form.assigneeEmployeeId || firstEmployeeId }));
        }
        if (body.currentUser?.role === "employee") {
          setView("work");
          setWorkAssigneeFilter(body.currentUser.employeeId ?? "all");
          setPortfolioEmployeeId(body.currentUser.employeeId ?? "all");
          setRewardEmployeeId(body.currentUser.employeeId ?? "");
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setDataWarning(error instanceof Error ? error.message : "โหลดข้อมูลไม่สำเร็จ");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [period]);

  useEffect(() => {
    const updateClock = () => setOfficeClock(new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()));
    updateClock();
    const timer = window.setInterval(updateClock, 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedEmployee && !skillProfileEmployee && !hrEmployee && !showAddEmployee && !showWorkForm && !showProjectForm && !submissionWorkItem && !rewardToRedeem && !showProfileEditor && !showContractForm && !contractToSign) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedEmployee(null);
        setSkillProfileEmployee(null);
        setHrEmployee(null);
        setShowAddEmployee(false);
        setShowWorkForm(false);
        setShowProjectForm(false);
        setSubmissionWorkItem(null);
        setRewardToRedeem(null);
        setShowProfileEditor(false);
        setShowContractForm(false);
        setContractToSign(null);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedEmployee, skillProfileEmployee, hrEmployee, showAddEmployee, showWorkForm, showProjectForm, submissionWorkItem, rewardToRedeem, showProfileEditor, showContractForm, contractToSign]);

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
  const employeeProfilesById = useMemo(() => new Map(employeeProfiles.map((profile) => [profile.employeeId, profile])), [employeeProfiles]);
  const profileEmployee = employeesById.get(profileEmployeeId) ?? employees[0] ?? null;
  const profileRecord = profileEmployee ? employeeProfilesById.get(profileEmployee.id) ?? null : null;
  const profileDocuments = profileEmployee ? applicationDocuments.filter((document) => document.employeeId === profileEmployee.id) : [];
  const profileContractDocuments = profileDocuments.filter((document) => document.documentType === "contract").sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  const profileContracts = profileEmployee ? employmentContracts.filter((contract) => contract.employeeId === profileEmployee.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [];
  const verifiedRequiredDocuments = requiredDocumentTypes.filter((type) => profileDocuments.some((document) => document.documentType === type && document.status === "verified")).length;
  const profileFilledFields = profileRecord ? [profileRecord.personalEmail, profileRecord.phone, profileRecord.birthDate, profileRecord.nationalIdLast4, profileRecord.address, profileRecord.emergencyName, profileRecord.emergencyPhone, profileRecord.startDate, profileRecord.education, profileRecord.applicationSource].filter(Boolean).length : 0;
  const dossierCompleteness = Math.round((profileFilledFields / 10 * .45 + verifiedRequiredDocuments / requiredDocumentTypes.length * .4 + (profileContracts.some((contract) => contract.status === "signed") ? .15 : 0)) * 100);
  const hrEmployeeInsight = hrEmployee ? workforceInsights.find(({ employee }) => employee.id === hrEmployee.id) ?? null : null;
  const projectsById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const pointBalances = useMemo(() => {
    const balances = new Map<string, number>();
    pointLedger.forEach((entry) => balances.set(entry.employeeId, (balances.get(entry.employeeId) ?? 0) + entry.points));
    return balances;
  }, [pointLedger]);
  const pointsEarned = pointLedger.filter((entry) => entry.points > 0).reduce((sum, entry) => sum + entry.points, 0);
  const pointsDeducted = Math.abs(pointLedger.filter((entry) => entry.points < 0).reduce((sum, entry) => sum + entry.points, 0));
  const monthlyPointRecipients = new Set(pointEvents.filter((event) => event.eventType === "monthly_evaluation" && event.eventDate.startsWith(monthlyPointMonth)).map((event) => event.employeeId)).size;
  const visiblePointLedger = pointLedger
    .filter((entry) => pointHistoryEmployeeId === "all" || entry.employeeId === pointHistoryEmployeeId)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const selectedPointEventRule = pointEventRules[pointEventForm.eventType];
  const leaderboard = useMemo(() => employees.filter((employee) => employee.status === "active").map((employee) => ({ employee, points: pointBalances.get(employee.id) ?? 0 })).sort((a, b) => b.points - a.points), [employees, pointBalances]);
  const projectInsights = useMemo(() => projects.map((project) => {
    const items = workItems.filter((item) => item.projectId === project.id);
    const progress = items.length ? items.reduce((sum, item) => sum + item.progress, 0) / items.length : 0;
    const completed = items.filter((item) => item.status === "done").length;
    return { project, items, progress, completed };
  }), [projects, workItems]);
  const todayDate = bangkokIsoDate();
  const weekEndDate = addIsoDays(todayDate, 7);
  const activeEmployees = employees.filter((employee) => employee.status === "active");
  const attendanceForDate = attendanceRecords.filter((record) => record.workDate === attendanceDate);
  const attendanceOnTimeCount = attendanceForDate.filter((record) => record.status === "present").length;
  const attendanceLateCount = attendanceForDate.filter((record) => record.status === "late").length;
  const attendanceAbsentCount = attendanceForDate.filter((record) => record.status === "absent").length;
  const attendanceLeaveCount = attendanceForDate.filter((record) => record.status === "leave" && record.approvalStatus !== "rejected").length;
  const attendanceUnrecordedCount = Math.max(0, activeEmployees.length - new Set(attendanceForDate.map((record) => record.employeeId)).size);
  const attendanceOnTimeRate = attendanceOnTimeCount + attendanceLateCount ? attendanceOnTimeCount / (attendanceOnTimeCount + attendanceLateCount) * 100 : 0;
  const pendingLeaveRecords = attendanceRecords.filter((record) => record.status === "leave" && record.approvalStatus === "pending").sort((a, b) => a.workDate.localeCompare(b.workDate));
  const peopleOpsEmployee = employeesById.get(peopleOpsEmployeeId) ?? activeEmployees[0] ?? null;
  const peopleOpsRole = peopleOpsEmployee ? getRole(peopleOpsEmployee.roleId) : null;
  const peopleOpsEvaluation = peopleOpsEmployee ? evaluationsByEmployee.get(peopleOpsEmployee.id) ?? null : null;
  const peopleOpsHrProfile = peopleOpsEmployee ? hrProfilesByEmployee.get(peopleOpsEmployee.id) ?? null : null;
  const peopleOpsAchievements = peopleOpsEmployee ? skillAchievements.filter((achievement) => achievement.employeeId === peopleOpsEmployee.id).sort((a, b) => b.verifiedAt.localeCompare(a.verifiedAt)) : [];
  const peopleOpsSkillUplift = peopleOpsAchievements.reduce((sum, achievement) => sum + achievement.monthlyAllowance, 0);
  const peopleOpsWork = peopleOpsEmployee ? workItems.filter((item) => item.assigneeEmployeeId === peopleOpsEmployee.id) : [];
  const peopleOpsMissions = peopleOpsWork.filter((item) => item.kind === "mission");
  const missionGrowthScore = peopleOpsMissions.length ? peopleOpsMissions.filter((item) => item.status === "done").length / peopleOpsMissions.length * 100 : 0;
  const peopleOpsAttendanceHistory = peopleOpsEmployee ? attendanceRecords.filter((record) => record.employeeId === peopleOpsEmployee.id).sort((a, b) => b.workDate.localeCompare(a.workDate)) : [];
  const attendanceReliabilityRecords = peopleOpsAttendanceHistory.filter((record) => !(record.status === "leave" && record.approvalStatus === "approved"));
  const attendanceReliability = attendanceReliabilityRecords.length ? attendanceReliabilityRecords.reduce((sum, record) => sum + (record.status === "present" ? 100 : record.status === "late" ? 70 : record.status === "leave" ? 100 : 0), 0) / attendanceReliabilityRecords.length : 100;
  const promotionReadiness = Math.round((peopleOpsEvaluation?.kpiScore ?? 0) * .4 + (peopleOpsEvaluation?.skillScore ?? 0) * .4 + missionGrowthScore * .15 + attendanceReliability * .05);
  const nextSkillOpportunities = peopleOpsRole ? peopleOpsRole.skills.map((skill) => {
    const currentLevel = peopleOpsEvaluation?.skillScores[skill.id] ?? 0;
    const highestVerifiedLevel = peopleOpsAchievements.filter((achievement) => achievement.skillId === skill.id).reduce((highest, achievement) => Math.max(highest, achievement.level), 0);
    return { skill, currentLevel, highestVerifiedLevel, allowance: skillAllowanceFor(peopleOpsRole.id, currentLevel), canVerify: currentLevel >= 2 && currentLevel > highestVerifiedLevel };
  }) : [];
  const growthTeam = activeEmployees.map((employee) => {
    const role = getRole(employee.roleId);
    const evaluation = evaluationsByEmployee.get(employee.id) ?? null;
    const openWork = workItems.filter((item) => item.assigneeEmployeeId === employee.id && item.status !== "done").length;
    const strength = evaluation ? role.skills.slice().sort((a, b) => (evaluation.skillScores[b.id] ?? 0) - (evaluation.skillScores[a.id] ?? 0))[0]?.name ?? role.shortName : role.shortName;
    return { employee, role, evaluation, openWork, strength };
  }).sort((a, b) => a.openWork - b.openWork || (b.evaluation?.skillScore ?? 0) - (a.evaluation?.skillScore ?? 0)).filter((candidate, index, all) => all.findIndex((item) => item.role.departmentId === candidate.role.departmentId) === index).slice(0, 4);
  const todayWorkItems = workItems.filter((item) => item.status !== "done" && item.dueDate === todayDate);
  const overdueWorkItems = workItems.filter((item) => item.status !== "done" && item.dueDate < todayDate);
  const dueThisWeekWorkItems = workItems.filter((item) => item.status !== "done" && item.dueDate >= todayDate && item.dueDate <= weekEndDate);
  const reviewQueueWorkItems = workItems.filter((item) => item.status === "review");
  const officePeople = useMemo<OfficePersonModel[]>(() => {
    const priorityWeight: Record<WorkItemRecord["priority"], number> = { low: .7, medium: 1, high: 1.4, urgent: 1.8 };
    const statusWeight: Record<Exclude<WorkItemRecord["status"], "done">, number> = { todo: 0, in_progress: .4, review: .2 };
    return employees
      .filter((employee) => employee.status === "active")
      .map((employee) => {
        const role = getRole(employee.roleId);
        const assignedItems = workItems.filter((item) => item.assigneeEmployeeId === employee.id);
        const openItems = assignedItems.filter((item) => item.status !== "done");
        const doneItems = assignedItems.filter((item) => item.status === "done");
        const loadUnits = openItems.reduce((sum, item) => sum + priorityWeight[item.priority] + statusWeight[item.status as Exclude<WorkItemRecord["status"], "done">] + (item.dueDate < todayDate ? .7 : 0), 0);
        const capacity = officeCapacityByRole[role.id] ?? 4;
        const loadRatio = loadUnits / capacity;
        const priorityRank: Record<WorkItemRecord["priority"], number> = { urgent: 0, high: 1, medium: 2, low: 3 };
        const currentTask = openItems.slice().sort((a, b) => {
          if (a.status === "in_progress" && b.status !== "in_progress") return -1;
          if (a.status !== "in_progress" && b.status === "in_progress") return 1;
          return a.dueDate.localeCompare(b.dueDate) || priorityRank[a.priority] - priorityRank[b.priority];
        })[0] ?? null;
        return {
          employee,
          role,
          scene: officeSceneForRole(role.id),
          openItems,
          doneItems,
          currentTask,
          capacity,
          loadUnits,
          loadRatio,
          level: officeLevelFor(loadRatio, openItems.length),
          averageProgress: openItems.length ? Math.round(openItems.reduce((sum, item) => sum + item.progress, 0) / openItems.length) : 0,
          overdueCount: openItems.filter((item) => item.dueDate < todayDate).length,
        };
      })
      .sort((a, b) => b.loadRatio - a.loadRatio || b.openItems.length - a.openItems.length);
  }, [employees, todayDate, workItems]);
  const visibleOfficePeople = officePeople.filter((person) => {
    const departmentMatches = activeDepartment === "all" || person.role.departmentId === activeDepartment;
    const loadMatches = officeLoadFilter === "all" || person.level === officeLoadFilter;
    return departmentMatches && loadMatches;
  });
  const office3DPeople: Office3DPerson[] = visibleOfficePeople.map((person, index) => ({
    id: person.employee.id,
    name: person.employee.name,
    role: person.role.name,
    initials: person.employee.initials,
    level: person.level,
    behavior: officeBehaviorFor(person.level, index),
    openCount: person.openItems.length,
    loadPercent: Math.round(person.loadRatio * 100),
    currentTask: person.currentTask?.title ?? "พร้อมรับงานใหม่",
    scene: person.scene,
  }));
  const officeAvailableCount = officePeople.filter((person) => person.level === "available").length;
  const officePressureCount = officePeople.filter((person) => person.level === "busy" || person.level === "overloaded").length;
  const officeOverdueCount = officePeople.reduce((sum, person) => sum + person.overdueCount, 0);
  const officeMostLoaded = officePeople[0] ?? null;
  const visibleWorkItems = useMemo(() => {
    const query = workSearch.trim().toLocaleLowerCase("th");
    const priorityRank: Record<WorkItemRecord["priority"], number> = { urgent: 0, high: 1, medium: 2, low: 3 };
    return workItems.filter((item) => {
      const project = projectsById.get(item.projectId);
      const assignee = employeesById.get(item.assigneeEmployeeId);
      const departmentMatches = activeDepartment === "all" || project?.departmentId === activeDepartment;
      const kindMatches = workFilter === "all" || item.kind === workFilter;
      const assigneeMatches = workAssigneeFilter === "all" || item.assigneeEmployeeId === workAssigneeFilter;
      const dueMatches = workDueFilter === "all"
        || (workDueFilter === "today" && item.dueDate === todayDate)
        || (workDueFilter === "overdue" && item.status !== "done" && item.dueDate < todayDate)
        || (workDueFilter === "week" && item.status !== "done" && item.dueDate >= todayDate && item.dueDate <= weekEndDate);
      const queryMatches = !query || `${item.title} ${item.description} ${project?.name ?? ""} ${assignee?.name ?? ""}`.toLocaleLowerCase("th").includes(query);
      return departmentMatches && kindMatches && assigneeMatches && dueMatches && queryMatches;
    }).sort((a, b) => {
      if (a.status === "done" && b.status !== "done") return 1;
      if (a.status !== "done" && b.status === "done") return -1;
      const dueOrder = a.dueDate.localeCompare(b.dueDate);
      return dueOrder || priorityRank[a.priority] - priorityRank[b.priority];
    });
  }, [activeDepartment, employeesById, projectsById, todayDate, weekEndDate, workAssigneeFilter, workDueFilter, workFilter, workItems, workSearch]);
  const workCompletion = workItems.length ? workItems.filter((item) => item.status === "done").length / workItems.length * 100 : 0;
  const workSubmissionsByItem = useMemo(() => {
    const grouped = new Map<string, WorkSubmissionRecord[]>();
    workSubmissions.slice().sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)).forEach((submission) => {
      grouped.set(submission.workItemId, [...(grouped.get(submission.workItemId) ?? []), submission]);
    });
    return grouped;
  }, [workSubmissions]);
  const pendingSubmissionCount = workSubmissions.filter((submission) => submission.status === "submitted").length;
  const portfolioEntries = useMemo(() => workItems
    .map((item) => {
      const submissions = workSubmissionsByItem.get(item.id) ?? [];
      const approvedSubmission = submissions.find((submission) => submission.status === "approved") ?? null;
      const latestSubmission = submissions[0] ?? null;
      const status: Exclude<PortfolioStatusFilter, "all"> = approvedSubmission
        ? "approved"
        : latestSubmission?.status ?? "missing";
      return {
        item,
        employee: employeesById.get(item.assigneeEmployeeId) ?? null,
        project: projectsById.get(item.projectId) ?? null,
        evaluation: evaluationsByEmployee.get(item.assigneeEmployeeId) ?? null,
        submissions,
        approvedSubmission,
        latestSubmission,
        status,
        sortDate: approvedSubmission?.reviewedAt ?? latestSubmission?.submittedAt ?? item.updatedAt,
      };
    })
    .filter((entry) => entry.item.status === "done" || entry.submissions.length > 0)
    .sort((a, b) => b.sortDate.localeCompare(a.sortDate)), [employeesById, evaluationsByEmployee, projectsById, workItems, workSubmissionsByItem]);
  const visiblePortfolioEntries = useMemo(() => {
    const query = portfolioSearch.trim().toLocaleLowerCase("th");
    return portfolioEntries.filter((entry) => {
      const departmentMatches = activeDepartment === "all" || entry.project?.departmentId === activeDepartment;
      const employeeMatches = portfolioEmployeeId === "all" || entry.item.assigneeEmployeeId === portfolioEmployeeId;
      const projectMatches = portfolioProjectId === "all" || entry.item.projectId === portfolioProjectId;
      const statusMatches = portfolioStatus === "all" || entry.status === portfolioStatus;
      const evidenceText = entry.submissions.map((submission) => `${submission.title} ${submission.fileName} ${submission.linkUrl} ${submission.note} ${submission.submittedBy} ${submission.reviewedBy ?? ""}`).join(" ");
      const queryMatches = !query || `${entry.item.title} ${entry.item.description} ${entry.employee?.name ?? ""} ${getRole(entry.employee?.roleId ?? "").name} ${entry.project?.name ?? ""} ${evidenceText}`.toLocaleLowerCase("th").includes(query);
      return departmentMatches && employeeMatches && projectMatches && statusMatches && queryMatches;
    });
  }, [activeDepartment, portfolioEmployeeId, portfolioEntries, portfolioProjectId, portfolioSearch, portfolioStatus]);
  const portfolioPeople = new Set(portfolioEntries.map((entry) => entry.item.assigneeEmployeeId)).size;
  const portfolioApprovedCount = portfolioEntries.filter((entry) => entry.status === "approved").length;
  const portfolioAssetCount = workSubmissions.reduce((sum, submission) => sum + Number(Boolean(submission.linkUrl)) + Number(Boolean(submission.storageKey)), 0);
  const portfolioEvaluations = [...new Set(portfolioEntries.map((entry) => entry.item.assigneeEmployeeId))]
    .map((employeeId) => evaluationsByEmployee.get(employeeId))
    .filter((evaluation): evaluation is EvaluationRecord => Boolean(evaluation));
  const portfolioAverageScore = portfolioEvaluations.length ? portfolioEvaluations.reduce((sum, evaluation) => sum + evaluation.totalScore, 0) / portfolioEvaluations.length : 0;
  const focusedPortfolioEmployee = portfolioEmployeeId === "all" ? null : employeesById.get(portfolioEmployeeId) ?? null;
  const focusedPortfolioEvaluation = focusedPortfolioEmployee ? evaluationsByEmployee.get(focusedPortfolioEmployee.id) ?? null : null;
  const activeWorkSubmissions = submissionWorkItem ? workSubmissionsByItem.get(submissionWorkItem.id) ?? [] : [];
  const submissionAssignee = submissionWorkItem ? employeesById.get(submissionWorkItem.assigneeEmployeeId) ?? null : null;
  const activeProofGuide = submissionAssignee ? roleProofGuides[submissionAssignee.roleId] ?? defaultProofGuide : defaultProofGuide;
  const totalPoints = [...pointBalances.values()].reduce((sum, points) => sum + points, 0);
  const allPowerProfiles = useMemo(
    () => employees
      .filter((employee) => employee.status === "active")
      .map((employee) => buildEmployeePower(
        employee,
        evaluationsByEmployee.get(employee.id) ?? null,
        workItems.filter((item) => item.assigneeEmployeeId === employee.id),
      ))
      .sort((a, b) => (b.overall ?? -1) - (a.overall ?? -1)),
    [employees, evaluationsByEmployee, workItems],
  );
  const visiblePowerProfiles = allPowerProfiles.filter(({ employee }) => filteredEmployees.some((item) => item.id === employee.id));
  const ratedPowerProfiles = allPowerProfiles.filter((profile) => profile.overall !== null);
  const averagePower = ratedPowerProfiles.length
    ? ratedPowerProfiles.reduce((sum, profile) => sum + (profile.overall ?? 0), 0) / ratedPowerProfiles.length
    : 0;
  const topPowerProfile = ratedPowerProfiles[0] ?? null;
  const powerLeft = allPowerProfiles.find((profile) => profile.employee.id === powerLeftId) ?? allPowerProfiles[0] ?? null;
  const powerRight = allPowerProfiles.find((profile) => profile.employee.id === powerRightId) ?? allPowerProfiles[1] ?? allPowerProfiles[0] ?? null;
  const powerDifference = powerLeft?.overall !== null && powerLeft?.overall !== undefined && powerRight?.overall !== null && powerRight?.overall !== undefined
    ? powerLeft.overall - powerRight.overall
    : null;

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

  const comparePowerProfile = (employeeId: string) => {
    if (!powerLeft) {
      setPowerLeftId(employeeId);
    } else if (powerLeft.employee.id === employeeId) {
      showToast("พนักงานคนนี้อยู่ในการ์ดฝั่ง A แล้ว");
      return;
    } else {
      setPowerRightId(employeeId);
    }
    window.setTimeout(() => document.getElementById("power-arena")?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
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

  const selectPeopleOpsEmployee = (employeeId: string) => {
    const employee = employeesById.get(employeeId);
    setPeopleOpsEmployeeId(employeeId);
    setAttendanceForm((form) => ({ ...form, employeeId }));
    if (!employee) return;
    const role = getRole(employee.roleId);
    const evaluation = evaluationsByEmployee.get(employeeId);
    const firstSkill = role.skills[0];
    setSkillAchievementForm({ skillId: firstSkill?.id ?? "", level: Math.max(2, evaluation?.skillScores[firstSkill?.id ?? ""] ?? 2), evidenceUrl: "", note: "" });
  };

  const saveAttendanceRecord = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      const response = await fetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "saveAttendance", ...attendanceForm }) });
      const body = await response.json() as { attendanceRecord?: AttendanceRecord; error?: string };
      if (!response.ok || !body.attendanceRecord) throw new Error(body.error ?? "บันทึกเวลาไม่สำเร็จ");
      setAttendanceRecords((items) => [...items.filter((item) => item.id !== body.attendanceRecord?.id && !(item.employeeId === body.attendanceRecord?.employeeId && item.workDate === body.attendanceRecord?.workDate)), body.attendanceRecord as AttendanceRecord]);
      setAttendanceDate(body.attendanceRecord.workDate);
      setAttendanceForm((form) => ({ ...form, note: "" }));
      showToast(body.attendanceRecord.status === "leave" ? "ส่งคำขอลาเข้าคิวอนุมัติแล้ว" : `บันทึกเวลาของ ${employeesById.get(body.attendanceRecord.employeeId)?.name ?? "พนักงาน"} แล้ว`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "บันทึกเวลาไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const quickClock = async () => {
    if (!peopleOpsEmployee) return;
    const nowTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
    const existing = attendanceRecords.find((record) => record.employeeId === peopleOpsEmployee.id && record.workDate === todayDate);
    const payload = existing?.clockIn
      ? { action: "saveAttendance", employeeId: peopleOpsEmployee.id, workDate: todayDate, status: existing.status === "late" ? "late" : "present", clockIn: existing.clockIn, clockOut: nowTime, note: existing.note }
      : { action: "saveAttendance", employeeId: peopleOpsEmployee.id, workDate: todayDate, status: "present", clockIn: nowTime, clockOut: "", note: "ลงเวลาจากปุ่มด่วน" };
    setIsSaving(true);
    try {
      const response = await fetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json() as { attendanceRecord?: AttendanceRecord; error?: string };
      if (!response.ok || !body.attendanceRecord) throw new Error(body.error ?? "ลงเวลาไม่สำเร็จ");
      setAttendanceRecords((items) => [...items.filter((item) => item.id !== body.attendanceRecord?.id && !(item.employeeId === body.attendanceRecord?.employeeId && item.workDate === body.attendanceRecord?.workDate)), body.attendanceRecord as AttendanceRecord]);
      setAttendanceDate(todayDate);
      showToast(existing?.clockIn ? `ลงเวลาออก ${nowTime} แล้ว` : `ลงเวลาเข้า ${nowTime} แล้ว`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "ลงเวลาไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const approveAttendance = async (attendanceRecord: AttendanceRecord, approvalStatus: "approved" | "rejected") => {
    try {
      const response = await fetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "approveAttendance", attendanceId: attendanceRecord.id, approvalStatus }) });
      const body = await response.json() as { attendanceRecord?: AttendanceRecord; error?: string };
      if (!response.ok || !body.attendanceRecord) throw new Error(body.error ?? "อัปเดตคำขอลาไม่สำเร็จ");
      setAttendanceRecords((items) => items.map((item) => item.id === attendanceRecord.id ? body.attendanceRecord as AttendanceRecord : item));
      showToast(approvalStatus === "approved" ? "อนุมัติวันลาแล้ว โดยไม่หักคะแนนความน่าเชื่อถือ" : "ไม่อนุมัติคำขอลาแล้ว");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "อัปเดตคำขอลาไม่สำเร็จ");
    }
  };

  const verifySkillAchievement = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!peopleOpsEmployee) return;
    setIsSaving(true);
    try {
      const response = await fetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "verifySkillAchievement", employeeId: peopleOpsEmployee.id, ...skillAchievementForm }) });
      const body = await response.json() as { skillAchievement?: SkillAchievementRecord; hrProfile?: HrProfileRecord; talentAction?: TalentActionRecord; error?: string };
      if (!response.ok || !body.skillAchievement || !body.hrProfile || !body.talentAction) throw new Error(body.error ?? "ยืนยันสกิลไม่สำเร็จ");
      setSkillAchievements((items) => [body.skillAchievement as SkillAchievementRecord, ...items]);
      setHrProfiles((items) => [...items.filter((item) => item.employeeId !== body.hrProfile?.employeeId), body.hrProfile as HrProfileRecord]);
      setTalentActions((items) => [body.talentAction as TalentActionRecord, ...items]);
      setSkillAchievementForm((form) => ({ ...form, evidenceUrl: "", note: "" }));
      showToast(`ยืนยันสกิลแล้ว เพิ่มค่าตอบแทน ฿${formatMoney(body.skillAchievement.monthlyAllowance)}/เดือน`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "ยืนยันสกิลไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const buildGrowthTeam = () => {
    const lead = growthTeam[0]?.employee;
    setProjectForm({ name: "Growth Quest Squad", description: `ทีมข้ามสายงานเพื่อทำเควสต์ใหม่ · ${growthTeam.map(({ employee, role }) => `${employee.name} (${role.shortName})`).join(" · ")}`, ownerEmployeeId: lead?.id ?? activeEmployees[0]?.id ?? "", status: "planned", dueDate: addIsoDays(todayDate, 30), color: "mustard" });
    setShowProjectForm(true);
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

  const startWorkItem = async (item: WorkItemRecord) => {
    setQuickUpdatingWorkId(item.id);
    try {
      const response = await fetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "saveWorkItem",
          workItemId: item.id,
          projectId: item.projectId,
          assigneeEmployeeId: item.assigneeEmployeeId,
          kind: item.kind,
          title: item.title,
          description: item.description,
          priority: item.priority,
          status: "in_progress",
          progress: Math.max(10, item.progress),
          points: item.points,
          dueDate: item.dueDate,
        }),
      });
      const body = await response.json() as { workItem?: WorkItemRecord; error?: string };
      if (!response.ok || !body.workItem) throw new Error(body.error ?? "เริ่มงานไม่สำเร็จ");
      setWorkItems((items) => items.map((workItem) => workItem.id === body.workItem?.id ? body.workItem as WorkItemRecord : workItem));
      showToast(`เริ่มงาน “${item.title}” แล้ว`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "เริ่มงานไม่สำเร็จ");
    } finally {
      setQuickUpdatingWorkId("");
    }
  };

  const openSubmissionCenter = (item: WorkItemRecord) => {
    const assignee = employeesById.get(item.assigneeEmployeeId);
    const guide = assignee ? roleProofGuides[assignee.roleId] ?? defaultProofGuide : defaultProofGuide;
    setSubmissionWorkItem(item);
    setSubmissionForm({ submissionType: guide.defaultType, title: item.title, linkUrl: "", note: "" });
    setSubmissionFile(null);
    setReviewerNote("");
  };

  const submitWorkProof = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!submissionWorkItem) return;
    setIsSaving(true);
    try {
      const formData = new FormData();
      formData.set("workItemId", submissionWorkItem.id);
      formData.set("submissionType", submissionForm.submissionType);
      formData.set("title", submissionForm.title);
      formData.set("linkUrl", submissionForm.linkUrl);
      formData.set("note", submissionForm.note);
      if (submissionFile) formData.set("file", submissionFile);
      const response = await fetch("/api/work-submissions", { method: "POST", body: formData });
      const body = await response.json() as { workSubmission?: WorkSubmissionRecord; workItem?: WorkItemRecord; error?: string };
      if (!response.ok || !body.workSubmission || !body.workItem) throw new Error(body.error ?? "ส่งหลักฐานงานไม่สำเร็จ");
      setWorkSubmissions((items) => [body.workSubmission as WorkSubmissionRecord, ...items]);
      setWorkItems((items) => items.map((item) => item.id === body.workItem?.id ? body.workItem as WorkItemRecord : item));
      setSubmissionWorkItem(body.workItem);
      setSubmissionForm((form) => ({ ...form, title: submissionWorkItem.title, linkUrl: "", note: "" }));
      setSubmissionFile(null);
      showToast("ส่งหลักฐานแล้ว งานถูกย้ายไปรอตรวจ");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "ส่งหลักฐานงานไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const reviewWorkProof = async (submission: WorkSubmissionRecord, status: "approved" | "revision") => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "reviewWorkSubmission", submissionId: submission.id, status, reviewerNote }) });
      const body = await response.json() as { workSubmission?: WorkSubmissionRecord; workItem?: WorkItemRecord; pointEntry?: PointLedgerRecord | null; deadlinePointEntry?: PointLedgerRecord | null; deadlinePointEvent?: PointEventRecord | null; error?: string };
      if (!response.ok || !body.workSubmission || !body.workItem) throw new Error(body.error ?? "ตรวจหลักฐานไม่สำเร็จ");
      setWorkSubmissions((items) => items.map((item) => item.id === body.workSubmission?.id ? body.workSubmission as WorkSubmissionRecord : item));
      setWorkItems((items) => items.map((item) => item.id === body.workItem?.id ? body.workItem as WorkItemRecord : item));
      if (body.pointEntry) setPointLedger((items) => [...items.filter((item) => item.id !== body.pointEntry?.id), body.pointEntry as PointLedgerRecord]);
      if (body.deadlinePointEntry) setPointLedger((items) => [...items.filter((item) => item.id !== body.deadlinePointEntry?.id), body.deadlinePointEntry as PointLedgerRecord]);
      if (body.deadlinePointEvent) setPointEvents((items) => [...items.filter((item) => item.id !== body.deadlinePointEvent?.id), body.deadlinePointEvent as PointEventRecord]);
      setSubmissionWorkItem(body.workItem);
      setReviewerNote("");
      showToast(status === "approved" ? `อนุมัติหลักฐานและมอบ ${body.workItem.points + (body.deadlinePointEntry?.points ?? 0)} แต้มแล้ว` : "ส่งงานกลับให้แก้ไขแล้ว");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "ตรวจหลักฐานไม่สำเร็จ");
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

  const recordPointEvent = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      const response = await fetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "recordPointEvent", ...pointEventForm }) });
      const body = await response.json() as { pointEvent?: PointEventRecord; pointEntry?: PointLedgerRecord; error?: string };
      if (!response.ok || !body.pointEvent || !body.pointEntry) throw new Error(body.error ?? "บันทึกรายการแต้มไม่สำเร็จ");
      setPointEvents((items) => [body.pointEvent as PointEventRecord, ...items]);
      setPointLedger((items) => [body.pointEntry as PointLedgerRecord, ...items]);
      setPointEventForm((form) => ({ ...form, note: "", evidenceUrl: "" }));
      showToast(`${body.pointEvent.points >= 0 ? "เพิ่ม" : "หัก"} ${Math.abs(body.pointEvent.points)} แต้มเรียบร้อยแล้ว`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "บันทึกรายการแต้มไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const runMonthlyPointCycle = async () => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "runMonthlyPointCycle", month: monthlyPointMonth, period }) });
      const body = await response.json() as { pointEvents?: PointEventRecord[]; pointEntries?: PointLedgerRecord[]; count?: number; error?: string };
      if (!response.ok || !body.pointEvents || !body.pointEntries) throw new Error(body.error ?? "ประมวลผลแต้มรายเดือนไม่สำเร็จ");
      const eventIds = new Set(body.pointEvents.map((item) => item.id));
      const entryIds = new Set(body.pointEntries.map((item) => item.id));
      setPointEvents((items) => [...body.pointEvents as PointEventRecord[], ...items.filter((item) => !eventIds.has(item.id))]);
      setPointLedger((items) => [...body.pointEntries as PointLedgerRecord[], ...items.filter((item) => !entryIds.has(item.id))]);
      showToast(`ประมวลผลแต้มรายเดือนให้ ${body.count ?? body.pointEntries.length} คนแล้ว`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "ประมวลผลแต้มรายเดือนไม่สำเร็จ");
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

  const openProfileEditor = () => {
    if (!profileEmployee) return;
    setProfileForm(profileRecord ? {
      personalEmail: profileRecord.personalEmail,
      phone: profileRecord.phone,
      birthDate: profileRecord.birthDate,
      nationalIdLast4: profileRecord.nationalIdLast4,
      address: profileRecord.address,
      emergencyName: profileRecord.emergencyName,
      emergencyPhone: profileRecord.emergencyPhone,
      startDate: profileRecord.startDate,
      employmentType: profileRecord.employmentType,
      education: profileRecord.education,
      experienceYears: profileRecord.experienceYears,
      applicationSource: profileRecord.applicationSource,
    } : { personalEmail: "", phone: "", birthDate: "", nationalIdLast4: "", address: "", emergencyName: "", emergencyPhone: "", startDate: new Date().toISOString().slice(0, 10), employmentType: "probation", education: "", experienceYears: 0, applicationSource: "" });
    setShowProfileEditor(true);
  };

  const saveEmployeeProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profileEmployee) return;
    setIsSaving(true);
    try {
      const response = await fetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "saveEmployeeProfile", employeeId: profileEmployee.id, ...profileForm }) });
      const body = await response.json() as { employeeProfile?: EmployeeProfileRecord; error?: string };
      if (!response.ok || !body.employeeProfile) throw new Error(body.error ?? "บันทึกโปรไฟล์ไม่สำเร็จ");
      setEmployeeProfiles((items) => [...items.filter((item) => item.employeeId !== body.employeeProfile?.employeeId), body.employeeProfile as EmployeeProfileRecord]);
      setShowProfileEditor(false);
      showToast(`อัปเดตแฟ้มประวัติของ ${profileEmployee.name} แล้ว`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "บันทึกโปรไฟล์ไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const uploadProfileImage = async (file?: File) => {
    if (!profileEmployee || !file) return;
    setUploadingProfileImage(true);
    try {
      const formData = new FormData();
      formData.set("employeeId", profileEmployee.id);
      formData.set("file", file);
      const response = await fetch("/api/profile-image", { method: "POST", body: formData });
      const body = await response.json() as { employeeProfile?: EmployeeProfileRecord; error?: string };
      if (!response.ok || !body.employeeProfile) throw new Error(body.error ?? "อัปโหลดรูปโปรไฟล์ไม่สำเร็จ");
      setEmployeeProfiles((items) => [...items.filter((item) => item.employeeId !== body.employeeProfile?.employeeId), body.employeeProfile as EmployeeProfileRecord]);
      showToast(`อัปเดตรูปโปรไฟล์ของ ${profileEmployee.name} แล้ว`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "อัปโหลดรูปโปรไฟล์ไม่สำเร็จ");
    } finally {
      setUploadingProfileImage(false);
    }
  };

  const uploadEmployeeDocument = async (documentType: ApplicationDocumentRecord["documentType"], file?: File) => {
    if (!profileEmployee || !file) return;
    setUploadingDocumentType(documentType);
    try {
      const formData = new FormData();
      formData.set("employeeId", profileEmployee.id);
      formData.set("documentType", documentType);
      formData.set("file", file);
      const response = await fetch("/api/documents", { method: "POST", body: formData });
      const body = await response.json() as { applicationDocument?: ApplicationDocumentRecord; error?: string };
      if (!response.ok || !body.applicationDocument) throw new Error(body.error ?? "อัปโหลดเอกสารไม่สำเร็จ");
      const allowsMultiple = documentType === "contract" || documentType === "other";
      setApplicationDocuments((items) => [...items.filter((item) => item.id !== body.applicationDocument?.id && (allowsMultiple || !(item.employeeId === profileEmployee.id && item.documentType === documentType))), body.applicationDocument as ApplicationDocumentRecord]);
      showToast(`อัปโหลด ${documentTypeLabels[documentType]} แล้ว รอตรวจเอกสาร`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "อัปโหลดเอกสารไม่สำเร็จ");
    } finally {
      setUploadingDocumentType(null);
    }
  };

  const reviewEmployeeDocument = async (document: ApplicationDocumentRecord, status: "verified" | "rejected") => {
    try {
      const note = status === "rejected" ? "เอกสารไม่ผ่านการตรวจ กรุณาอัปโหลดไฟล์ใหม่" : "ตรวจสอบข้อมูลเรียบร้อย";
      const response = await fetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "updateDocumentStatus", documentId: document.id, status, note }) });
      const body = await response.json() as { applicationDocument?: ApplicationDocumentRecord; error?: string };
      if (!response.ok || !body.applicationDocument) throw new Error(body.error ?? "อัปเดตสถานะเอกสารไม่สำเร็จ");
      setApplicationDocuments((items) => items.map((item) => item.id === document.id ? body.applicationDocument as ApplicationDocumentRecord : item));
      showToast(status === "verified" ? "ตรวจเอกสารผ่านแล้ว" : "ส่งเอกสารกลับให้แก้ไขแล้ว");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "อัปเดตสถานะเอกสารไม่สำเร็จ");
    }
  };

  const openContractCreator = () => {
    if (!profileEmployee) return;
    const contractDocument = profileContractDocuments[0];
    setContractForm({ title: profileRecord?.employmentType === "probation" ? "สัญญาจ้างและเงื่อนไขทดลองงาน" : "สัญญาจ้างพนักงาน", version: "1.0", status: "sent", effectiveDate: profileRecord?.startDate || new Date().toISOString().slice(0, 10), expiryDate: "", documentId: contractDocument?.id ?? "" });
    setShowContractForm(true);
  };

  const createEmploymentContract = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profileEmployee) return;
    setIsSaving(true);
    try {
      const response = await fetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "createContract", employeeId: profileEmployee.id, ...contractForm }) });
      const body = await response.json() as { employmentContract?: EmploymentContractRecord; error?: string };
      if (!response.ok || !body.employmentContract) throw new Error(body.error ?? "สร้างสัญญาไม่สำเร็จ");
      setEmploymentContracts((items) => [...items, body.employmentContract as EmploymentContractRecord]);
      setShowContractForm(false);
      showToast(contractForm.status === "sent" ? "สร้างและส่งสัญญาให้ลงนามแล้ว" : "บันทึกฉบับร่างสัญญาแล้ว");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "สร้างสัญญาไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const openContractSignature = (contract: EmploymentContractRecord) => {
    setContractToSign(contract);
    setSignatureForm({ signedName: profileEmployee?.name ?? "", consent: false });
  };

  const sendEmploymentContract = async (contract: EmploymentContractRecord) => {
    try {
      const response = await fetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "sendContract", contractId: contract.id }) });
      const body = await response.json() as { employmentContract?: EmploymentContractRecord; error?: string };
      if (!response.ok || !body.employmentContract) throw new Error(body.error ?? "ส่งสัญญาไม่สำเร็จ");
      setEmploymentContracts((items) => items.map((item) => item.id === contract.id ? body.employmentContract as EmploymentContractRecord : item));
      showToast("ส่งสัญญาให้พนักงานลงนามแล้ว");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "ส่งสัญญาไม่สำเร็จ");
    }
  };

  const signEmploymentContract = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!contractToSign) return;
    setIsSaving(true);
    try {
      const response = await fetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "signContract", contractId: contractToSign.id, ...signatureForm }) });
      const body = await response.json() as { employmentContract?: EmploymentContractRecord; error?: string };
      if (!response.ok || !body.employmentContract) throw new Error(body.error ?? "ลงนามสัญญาไม่สำเร็จ");
      setEmploymentContracts((items) => items.map((item) => item.id === contractToSign.id ? body.employmentContract as EmploymentContractRecord : item));
      setContractToSign(null);
      showToast("ลงนามสัญญาและบันทึกหลักฐานเรียบร้อยแล้ว");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "ลงนามสัญญาไม่สำเร็จ");
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
      const body = await response.json() as { evaluation?: EvaluationRecord; pointEntry?: PointLedgerRecord; pointEvent?: PointEventRecord; error?: string };
      if (!response.ok || !body.evaluation) throw new Error(body.error ?? "บันทึกผลประเมินไม่สำเร็จ");
      const saved = body.evaluation;
      setEvaluations((items) => [...items.filter((item) => !(item.employeeId === saved.employeeId && item.period === saved.period)), saved]);
      if (body.pointEntry) setPointLedger((items) => [...items.filter((item) => item.id !== body.pointEntry?.id), body.pointEntry as PointLedgerRecord]);
      if (body.pointEvent) setPointEvents((items) => [...items.filter((item) => item.id !== body.pointEvent?.id), body.pointEvent as PointEventRecord]);
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
      showToast(`บันทึกผลประเมิน ${selectedEmployee.name} และมอบ ${body.pointEntry?.points ?? 0} แต้มประจำเดือนแล้ว`);
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
      const body = await response.json() as { employee?: EmployeeRecord; hrProfile?: HrProfileRecord; employeeProfile?: EmployeeProfileRecord; error?: string };
      if (!response.ok || !body.employee) throw new Error(body.error ?? "เพิ่มพนักงานไม่สำเร็จ");
      setEmployees((items) => [...items, body.employee as EmployeeRecord]);
      if (body.hrProfile) setHrProfiles((items) => [...items, body.hrProfile as HrProfileRecord]);
      if (body.employeeProfile) setEmployeeProfiles((items) => [...items, body.employeeProfile as EmployeeProfileRecord]);
      setShowAddEmployee(false);
      setEmployeeForm({ name: "", email: "", roleId: roles[0].id, manager: "" });
      showToast(`เพิ่ม ${body.employee.name} ในระบบแล้ว`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "เพิ่มพนักงานไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const editUserAccount = (account: UserAccountRecord) => {
    setUserAccountForm({ accountId: account.id, email: account.email, displayName: account.displayName, role: account.role, employeeId: account.employeeId ?? "", departmentId: account.departmentId, status: account.status });
    document.getElementById("user-access-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const saveUserAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      const response = await fetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "saveUserAccount", ...userAccountForm }) });
      const body = await response.json() as { userAccount?: UserAccountRecord; error?: string };
      if (!response.ok || !body.userAccount) throw new Error(body.error ?? "บันทึกบัญชีผู้ใช้ไม่สำเร็จ");
      setUserAccounts((items) => [...items.filter((item) => item.id !== body.userAccount?.id), body.userAccount as UserAccountRecord].sort((a, b) => a.displayName.localeCompare(b.displayName, "th")));
      setUserAccountForm({ accountId: "", email: "", displayName: "", role: "employee", employeeId: "", departmentId: "", status: "active" });
      showToast("บันทึกสิทธิ์ของ " + body.userAccount.displayName + " แล้ว");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "บันทึกบัญชีผู้ใช้ไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleUserAccount = async (account: UserAccountRecord) => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "saveUserAccount", accountId: account.id, email: account.email, displayName: account.displayName, role: account.role, employeeId: account.employeeId ?? "", departmentId: account.departmentId, status: account.status === "active" ? "inactive" : "active" }) });
      const body = await response.json() as { userAccount?: UserAccountRecord; error?: string };
      if (!response.ok || !body.userAccount) throw new Error(body.error ?? "อัปเดตบัญชีไม่สำเร็จ");
      setUserAccounts((items) => items.map((item) => item.id === account.id ? body.userAccount as UserAccountRecord : item));
      showToast(body.userAccount.status === "active" ? "เปิดสิทธิ์ใช้งานแล้ว" : "พักสิทธิ์ใช้งานแล้ว");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "อัปเดตบัญชีไม่สำเร็จ");
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

  const exportPortfolioReport = () => {
    const rows = visiblePortfolioEntries.flatMap((entry) => {
      const role = entry.employee ? getRole(entry.employee.roleId) : null;
      const proofRows = entry.submissions.length ? entry.submissions : [null];
      return proofRows.map((submission) => [
        entry.employee?.name ?? "",
        role?.department ?? "",
        role?.name ?? "",
        entry.project?.name ?? "",
        entry.item.title,
        workKindLabel(entry.item.kind),
        portfolioStatusLabel(entry.status),
        submission ? submissionTypeLabels[submission.submissionType] : "",
        submission?.title ?? "",
        submission?.fileName ?? "",
        submission?.linkUrl ?? "",
        submission?.reviewedBy ?? "",
        submission?.reviewedAt ? formatUpdatedAt(submission.reviewedAt) : "",
        submission?.reviewerNote ?? "",
        entry.evaluation?.kpiScore ?? null,
        entry.evaluation?.skillScore ?? null,
        entry.evaluation?.totalScore ?? null,
        entry.item.points,
        entry.item.updatedAt,
      ]);
    });
    const content = [
      ["พนักงาน", "แผนก", "ตำแหน่ง", "โปรเจกต์", "ผลงาน", "ประเภทงาน", "สถานะแฟ้ม", "ประเภทหลักฐาน", "ชื่อหลักฐาน", "ชื่อไฟล์", "ลิงก์", "ผู้ตรวจ", "วันที่ตรวจ", "หมายเหตุผู้ตรวจ", "คะแนน KPI", "คะแนนสกิล", "คะแนนรวม", "แต้มผลงาน", "อัปเดตล่าสุด"],
      ...rows,
    ].map((row) => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `people-pulse-work-portfolio-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast(`ส่งออกแฟ้มผลงาน ${visiblePortfolioEntries.length} รายการแล้ว`);
  };

  const isAdmin = currentUser?.role === "admin";
  const isEmployeeUser = currentUser?.role === "employee";
  const currentUserRoleLabel = currentUser?.role === "admin" ? "HR / Admin" : currentUser?.role === "manager" ? "หัวหน้าทีม" : "พนักงาน";
  const activeViewTitle = isEmployeeUser && view === "work" ? "งานและภารกิจของฉัน" : isEmployeeUser && view === "portfolio" ? "แฟ้มผลงานของฉัน" : viewMeta[view].title;
  const activeViewDescription = isEmployeeUser && view === "work" ? "ดูงานที่ได้รับมอบหมาย เริ่มงาน ส่งหลักฐาน สะสมแต้ม และแลกรางวัลได้ในหน้าเดียว" : isEmployeeUser && view === "portfolio" ? "ดูงานและหลักฐานที่ส่งไว้ พร้อมสถานะตรวจผลงานของคุณ" : viewMeta[view].description;

  if (accessDenied) {
    return (
      <main className="access-denied-page">
        <section>
          <span className="access-lock">PP</span>
          <p className="eyebrow">PEOPLE PULSE ACCESS</p>
          <h1>บัญชีนี้ยังไม่ได้รับสิทธิ์</h1>
          <p>ส่งอีเมลด้านล่างให้ HR เพื่อผูกบัญชีกับโปรไฟล์พนักงาน แล้วเปิดหน้านี้อีกครั้ง</p>
          <div><small>อีเมลที่เข้าสู่ระบบ</small><strong>{accessDenied.email}</strong></div>
          <a href="/signout-with-chatgpt?return_to=/">เปลี่ยนบัญชี</a>
        </section>
      </main>
    );
  }

  if (isLoading && !currentUser) {
    return <main className="access-loading-page"><span /><strong>กำลังตรวจสอบสิทธิ์ใช้งาน...</strong></main>;
  }

  return (
    <main className="app-shell future-shell">
      <div className="future-ambient" aria-hidden="true"><i className="future-orb orb-one" /><i className="future-orb orb-two" /><i className="future-grid-plane" /><i className="future-scan-beam" /></div>
      <header className="topbar">
        <button className="brand" onClick={() => setView("work")} aria-label="ไปที่ทูดูลิส">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span><strong>PEOPLE PULSE</strong><small>QUANTUM PEOPLE OS · 3000</small></span>
        </button>
        <div className="future-core-status"><i /><span>NEURAL CORE</span><b>ONLINE</b></div>
        <nav aria-label="เมนูหลัก">
          <span className="nav-section-label">พื้นที่ทำงาน</span>
          <button className={view === "work" ? "active" : ""} onClick={() => setView("work")}><span aria-hidden="true">✓</span><b>ทูดูลิส</b><em>{workItems.filter((item) => item.status !== "done").length}</em></button>
          <button className={view === "portfolio" ? "active" : ""} onClick={() => setView("portfolio")}><span aria-hidden="true">◇</span><b>แฟ้มผลงาน</b></button>
          {!isEmployeeUser && <>
            <button className={view === "office" ? "active" : ""} onClick={() => setView("office")}><span aria-hidden="true">⌂</span><b>สำนักงานจำลอง</b><em>{officePressureCount}</em></button>
            <button className={view === "overview" ? "active" : ""} onClick={() => setView("overview")}><span aria-hidden="true">◫</span><b>ภาพรวมทีม</b></button>
            <span className="nav-section-label">ทีมและผลงาน</span>
            <button className={view === "employees" ? "active" : ""} onClick={() => setView("employees")}><span aria-hidden="true">♙</span><b>พนักงาน</b></button>
            <button className={view === "skills" ? "active" : ""} onClick={() => setView("skills")}><span aria-hidden="true">✦</span><b>สกิลทีม</b></button>
            <button className={view === "power" ? "active" : ""} onClick={() => setView("power")}><span aria-hidden="true">◆</span><b>ค่าพลัง</b></button>
          </>}
          {isAdmin && <>
            <span className="nav-section-label">HR และระบบ</span>
            <button className={view === "peopleOps" ? "active" : ""} onClick={() => setView("peopleOps")}><span aria-hidden="true">◷</span><b>เวลา &amp; เติบโต</b><em>{pendingLeaveRecords.length}</em></button>
            <button className={view === "profiles" ? "active" : ""} onClick={() => setView("profiles")}><span aria-hidden="true">▣</span><b>แฟ้มพนักงาน</b></button>
            <button className={view === "hr" ? "active" : ""} onClick={() => setView("hr")}><span aria-hidden="true">⬡</span><b>บริหารบุคลากร</b></button>
            <button className={view === "access" ? "active" : ""} onClick={() => setView("access")}><span aria-hidden="true">◎</span><b>ผู้ใช้งานและสิทธิ์</b><em>{userAccounts.filter((account) => account.status === "active").length}</em></button>
          </>}
        </nav>
        <div className="header-actions">
          {!isEmployeeUser && <label className="period-select">
            <span className="period-label">รอบประเมิน</span>
            <select value={period} onChange={(event) => { setIsLoading(true); setPeriod(event.target.value); }}>{periods.map((item) => <option key={item}>{item}</option>)}</select>
          </label>}
          {!isEmployeeUser && <button className="icon-button" onClick={() => pendingEmployees.length ? setView("employees") : showToast("ไม่มีรายการรอประเมิน")} aria-label={`${pendingEmployees.length} รายการรอประเมิน`}>
            <span aria-hidden="true">●</span>{pendingEmployees.length > 0 && <i />}
          </button>}
          <div className="current-user-chip"><span>{currentUser?.displayName ? makeInitials(currentUser.displayName) : "PP"}</span><p><strong>{currentUser?.displayName ?? "ผู้ใช้งาน"}</strong><small>{currentUserRoleLabel}</small></p></div>
          <a className="profile-button" href="/signout-with-chatgpt?return_to=/" aria-label="ออกจากระบบ">↗</a>
        </div>
      </header>

      <section className="dashboard">
        {dataWarning && <div className="data-warning" role="status"><span>!</span>{dataWarning}</div>}
        <div className="page-heading">
          <div>
            <p className="eyebrow">{viewMeta[view].eyebrow}</p>
            <h1>{activeViewTitle}</h1>
            <p>{activeViewDescription}</p>
            <div className="future-heading-meta"><span><i /> LIVE DATA STREAM</span><span>SECTOR / {view.toUpperCase()}</span><span>ERA 3000</span></div>
          </div>
          {!isEmployeeUser && view !== "access" && <div className="heading-actions">
            <button className="secondary-button" onClick={() => view === "work" ? setShowProjectForm(true) : view === "office" ? setView("work") : view === "peopleOps" ? buildGrowthTeam() : view === "profiles" ? showToast(`${requiredDocumentTypes.length - verifiedRequiredDocuments} เอกสารจำเป็นยังตรวจไม่ครบ`) : view === "power" ? showToast("ค่าพลังรวมมาจากค่าสกิล 70% และ KPI 30%") : view === "portfolio" ? exportPortfolioReport() : exportReport()}><span aria-hidden="true">{view === "work" ? "◇" : view === "office" ? "✓" : view === "peopleOps" ? "♙" : view === "profiles" ? "▣" : view === "power" ? "i" : "↓"}</span> {view === "work" ? "สร้างโปรเจกต์" : view === "office" ? "เปิดทูดูลิส" : view === "peopleOps" ? "สร้างทีมจากสกิล" : view === "profiles" ? "เช็กเอกสารที่ขาด" : view === "power" ? "วิธีคำนวณ" : view === "portfolio" ? "ส่งออกแฟ้ม CSV" : "ส่งออกรายงาน"}</button>
            <button className="primary-button" onClick={() => {
              if (view === "work") {
                openWorkItemForm();
                return;
              }
              if (view === "office") {
                setOfficeLoadFilter("available");
                window.setTimeout(() => document.getElementById("office-team-floor")?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
                return;
              }
              if (view === "peopleOps") {
                quickClock();
                return;
              }
              if (view === "profiles") {
                openProfileEditor();
                return;
              }
              if (view === "hr") {
                if (workforceInsights[0]) openHrManagement(workforceInsights[0].employee);
                else showToast("ยังไม่มีพนักงานสำหรับวางแผน");
                return;
              }
              if (view === "power") {
                document.getElementById("power-arena")?.scrollIntoView({ behavior: "smooth", block: "start" });
                return;
              }
              if (view === "portfolio") {
                const workWithoutProof = portfolioEntries.find((entry) => entry.submissions.length === 0)?.item;
                if (workWithoutProof) openSubmissionCenter(workWithoutProof);
                else showToast("งานที่เสร็จแล้วมีหลักฐานอยู่ในแฟ้มครบแล้ว");
                return;
              }
              if (pendingEmployees[0]) openEvaluation(pendingEmployees[0]);
              else setView("employees");
            }}><span aria-hidden="true">{view === "power" ? "VS" : view === "office" ? "⌁" : view === "peopleOps" ? "◷" : "＋"}</span> {view === "work" ? "เพิ่มงานหรือภารกิจ" : view === "office" ? "หาคนพร้อมรับงาน" : view === "peopleOps" ? "ลงเวลาตอนนี้" : view === "hr" ? "เพิ่มแผนบุคลากร" : view === "profiles" ? "แก้ไขโปรไฟล์" : view === "power" ? "เปรียบเทียบค่าพลัง" : view === "portfolio" ? "เติมหลักฐานที่ขาด" : "เริ่มประเมิน"}</button>
          </div>}
        </div>

        {!isEmployeeUser && view !== "access" && <div className="filter-row" aria-label="กรองตามแผนก">
          {departmentFilters.map((filter) => (
            <button key={filter.id} className={activeDepartment === filter.id ? "active" : ""} onClick={() => setActiveDepartment(filter.id)}>{filter.label}</button>
          ))}
        </div>}

        {view === "office" && (
          <section className="office-simulation-layout">
            <section className="office-command-center">
              <div className="office-command-copy">
                <span className="office-live-label"><i /> 3D OFFICE WORLD</span>
                <h2>ออฟฟิศจำลอง 3D<br />ที่ขยับได้เหมือนในเกม</h2>
                <p>ตัวละครเลือกเส้นทางเดินในออฟฟิศได้อย่างอิสระ ส่วนคนที่มีงานจะทำงานประจำโต๊ะด้วยความเร็วตามภาระ พร้อมกล้องที่หมุน ซูม และเลื่อนได้</p>
                <div className="office-legend" aria-label="คำอธิบายสีภาระงาน">
                  {(Object.entries(officeLevelMeta) as [OfficeLoadLevel, (typeof officeLevelMeta)[OfficeLoadLevel]][]).map(([level, meta]) => <span key={level} className={level}><i />{meta.label}</span>)}
                </div>
              </div>
              <div className="office-command-focus">
                <span>ภาระงานสูงสุดตอนนี้</span>
                {officeMostLoaded ? <><strong>{officeMostLoaded.employee.name}</strong><small>{officeMostLoaded.role.name} · {officeMostLoaded.openItems.length} งานเปิดอยู่</small><div><i><b style={{ width: `${Math.min(100, Math.round(officeMostLoaded.loadRatio * 100))}%` }} /></i><em>{Math.round(officeMostLoaded.loadRatio * 100)}%</em></div></> : <strong>ยังไม่มีข้อมูล</strong>}
              </div>
              <div className="office-command-stats">
                <span><b>{officePeople.length}</b><small>คนในสำนักงาน</small></span>
                <span><b>{officePressureCount}</b><small>งานแน่น/งานล้น</small></span>
                <span className="positive"><b>{officeAvailableCount}</b><small>พร้อมรับงาน</small></span>
                <span className={officeOverdueCount ? "negative" : ""}><b>{officeOverdueCount}</b><small>งานเกินกำหนด</small></span>
              </div>
            </section>

            <div className="office-floor-toolbar" id="office-team-floor">
              <div><p className="eyebrow">INTERACTIVE 3D WORLD</p><h2>ทุกคนอยู่ในออฟฟิศ 3D เดียวกัน</h2><small>ลากเพื่อหมุนกล้อง ซูมเข้าออก และกดตัวละครเพื่อเปิดทูดูลิสของคนนั้น</small></div>
              <div className="office-load-filters" aria-label="กรองตามภาระงาน">
                {([
                  ["all", "ทั้งหมด"],
                  ["overloaded", "งานล้น"],
                  ["busy", "งานแน่น"],
                  ["steady", "สมดุล"],
                  ["available", "พร้อมรับงาน"],
                ] as [OfficeLoadFilter, string][]).map(([value, label]) => <button key={value} className={officeLoadFilter === value ? "active" : ""} onClick={() => setOfficeLoadFilter(value)}>{label}</button>)}
              </div>
            </div>

            {office3DPeople.length ? <Suspense fallback={<div className="office-3d-loading"><span /><strong>กำลังสร้างโลกออฟฟิศ 3D...</strong><small>จัดโต๊ะ เฟอร์นิเจอร์ และตัวละครตามภาระงาน</small></div>}><Office3D people={office3DPeople} onSelect={(employeeId) => {
              setWorkAssigneeFilter(employeeId);
              setWorkDueFilter("all");
              setWorkSearch("");
              setView("work");
            }} /></Suspense> : <div className="office-empty"><span>⌂</span><strong>ไม่มีพนักงานในกลุ่มนี้</strong><p>ลองเลือกสถานะหรือแผนกอื่นเพื่อเรียกทุกคนกลับเข้าฉาก 3D</p><button onClick={() => { setOfficeLoadFilter("all"); setActiveDepartment("all"); }}>แสดงทุกคน</button></div>}
          </section>
        )}

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
                    <span className="employee-identity"><EmployeeAvatar employee={employee} profile={employeeProfilesById.get(employee.id)} className="avatar-table" /><span><strong>{employee.name}</strong><small>{employee.email}</small></span></span>
                    <span><strong>{role.name}</strong><small>{role.department} · ผู้จัดการ {employee.manager || "—"}</small></span>
                    <ScoreCell value={evaluation?.kpiScore ?? null} />
                    <ScoreCell value={evaluation?.skillScore ?? null} />
                    <span><b className={`status-pill ${status === "ควรติดตาม" ? "alert" : status === "รอประเมิน" ? "pending" : ""}`}>{status}</b><small>{evaluation ? `อัปเดต ${formatUpdatedAt(evaluation.evaluatedAt)}` : "ยังไม่มีผลรอบนี้"}</small></span>
                    <span className="table-actions">
                      <button className="dossier-button" onClick={() => { setProfileEmployeeId(employee.id); setView("profiles"); }}>ดูแฟ้ม</button>
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

        {view === "profiles" && (
          <section className="dossier-layout">
            <aside className="dossier-roster">
              <div className="dossier-roster-heading"><div><p className="eyebrow">EMPLOYEE FILES</p><h2>เลือกพนักงาน</h2></div><span>{filteredEmployees.length}</span></div>
              <label className="dossier-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาชื่อหรือตำแหน่ง" /></label>
              <div className="dossier-people">
                {filteredEmployees.map((employee) => {
                  const employeeDocuments = applicationDocuments.filter((document) => document.employeeId === employee.id);
                  const verified = requiredDocumentTypes.filter((type) => employeeDocuments.some((document) => document.documentType === type && document.status === "verified")).length;
                  const signed = employmentContracts.some((contract) => contract.employeeId === employee.id && contract.status === "signed");
                  return <button key={employee.id} className={profileEmployee?.id === employee.id ? "active" : ""} onClick={() => setProfileEmployeeId(employee.id)}><EmployeeAvatar employee={employee} profile={employeeProfilesById.get(employee.id)} className="avatar-roster" /><span><strong>{employee.name}</strong><small>{getRole(employee.roleId).shortName} · เอกสาร {verified}/{requiredDocumentTypes.length}</small></span><b className={signed ? "signed" : ""}>{signed ? "✓" : "!"}</b></button>;
                })}
              </div>
            </aside>

            {profileEmployee ? (
              <section className="dossier-main">
                <header className="dossier-hero">
                  <div className="dossier-person"><div className="profile-photo-control"><EmployeeAvatar employee={profileEmployee} profile={profileRecord} className="avatar-dossier" /><label>{uploadingProfileImage ? "กำลังอัปโหลด" : "เปลี่ยนรูป"}<input type="file" accept=".jpg,.jpeg,.png,.webp" disabled={uploadingProfileImage} onChange={(event) => { const file = event.target.files?.[0]; void uploadProfileImage(file); event.currentTarget.value = ""; }} /></label></div><div><p className="eyebrow">DIGITAL EMPLOYEE FILE</p><h2>{profileEmployee.name}</h2><small>{getRole(profileEmployee.roleId).name} · {getRole(profileEmployee.roleId).department}</small></div></div>
                  <div className="dossier-completeness"><span style={{ "--dossier-score": `${dossierCompleteness}%` } as React.CSSProperties}><b>{dossierCompleteness}%</b></span><div><strong>ความสมบูรณ์ของแฟ้ม</strong><small>{dossierCompleteness >= 85 ? "ข้อมูลพร้อมใช้งาน" : "ยังมีข้อมูลหรือเอกสารที่ต้องเติม"}</small></div></div>
                  <button onClick={openProfileEditor}>แก้ไขข้อมูล</button>
                </header>

                <div className="dossier-metrics">
                  <article><span>▣</span><div><small>เอกสารจำเป็น</small><strong>{verifiedRequiredDocuments}/{requiredDocumentTypes.length}</strong><em>{verifiedRequiredDocuments === requiredDocumentTypes.length ? "ตรวจครบแล้ว" : `ขาด ${requiredDocumentTypes.length - verifiedRequiredDocuments} รายการ`}</em></div></article>
                  <article><span>✎</span><div><small>สถานะสัญญา</small><strong>{profileContracts[0] ? contractStatusLabel(profileContracts[0].status) : "ยังไม่มีสัญญา"}</strong><em>{profileContracts[0]?.signedAt ? `ลงนาม ${formatUpdatedAt(profileContracts[0].signedAt)}` : "ติดตามในแฟ้มนี้"}</em></div></article>
                  <article><span>◷</span><div><small>วันเริ่มงาน</small><strong>{profileRecord?.startDate ? new Date(`${profileRecord.startDate}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : "ยังไม่ระบุ"}</strong><em>{profileRecord ? employmentTypeLabel(profileRecord.employmentType) : "กรอกข้อมูลการจ้าง"}</em></div></article>
                </div>

                <div className="dossier-content-grid">
                  <section className="profile-detail-card">
                    <div className="dossier-section-heading"><div><p className="eyebrow">PERSONAL & EMPLOYMENT</p><h3>ข้อมูลพนักงานแบบละเอียด</h3></div><button onClick={openProfileEditor}>แก้ไข</button></div>
                    <div className="profile-facts">
                      <span><small>อีเมลบริษัท</small><strong>{profileEmployee.email}</strong></span>
                      <span><small>อีเมลส่วนตัว</small><strong>{profileRecord?.personalEmail || "—"}</strong></span>
                      <span><small>โทรศัพท์</small><strong>{profileRecord?.phone || "—"}</strong></span>
                      <span><small>เลขบัตรประชาชน</small><strong>{profileRecord?.nationalIdLast4 ? `X-XXXX-XXXXX-${profileRecord.nationalIdLast4}` : "—"}</strong></span>
                      <span className="wide"><small>ที่อยู่ปัจจุบัน</small><strong>{profileRecord?.address || "—"}</strong></span>
                      <span><small>ผู้ติดต่อฉุกเฉิน</small><strong>{profileRecord?.emergencyName || "—"}</strong></span>
                      <span><small>เบอร์ฉุกเฉิน</small><strong>{profileRecord?.emergencyPhone || "—"}</strong></span>
                      <span className="wide"><small>การศึกษา</small><strong>{profileRecord?.education || "—"}</strong></span>
                      <span><small>ประสบการณ์</small><strong>{profileRecord ? `${profileRecord.experienceYears} ปี` : "—"}</strong></span>
                      <span><small>ช่องทางสมัครงาน</small><strong>{profileRecord?.applicationSource || "—"}</strong></span>
                    </div>
                    <div className="privacy-note"><span>⌁</span><p>แสดงเลขบัตรประชาชนเพียง 4 หลักท้าย เพื่อลดการเปิดเผยข้อมูลส่วนบุคคลเกินความจำเป็น</p></div>
                  </section>

                  <section className="application-documents-card">
                    <div className="dossier-section-heading"><div><p className="eyebrow">APPLICATION DOCUMENTS</p><h3>เอกสารสมัครงาน</h3></div><span>{verifiedRequiredDocuments}/{requiredDocumentTypes.length} ผ่าน</span></div>
                    <div className="application-document-list">
                      {requiredDocumentTypes.map((documentType) => {
                        const document = profileDocuments.find((item) => item.documentType === documentType);
                        return <article key={documentType} className={document ? document.status : "missing"}>
                          <span className="document-mark">{document?.status === "verified" ? "✓" : document?.status === "rejected" ? "!" : document ? "◷" : "＋"}</span>
                          <div><strong>{documentTypeLabels[documentType]}</strong><small>{document ? `${document.fileName} · ${formatFileSize(document.sizeBytes)}` : "ยังไม่ได้อัปโหลด"}</small>{document?.note && <em>{document.note}</em>}</div>
                          <b>{document ? documentStatusLabel(document.status) : "ขาดเอกสาร"}</b>
                          <div className="document-actions">
                            {document?.storageKey && <a href={`/api/documents?id=${encodeURIComponent(document.id)}`}>ดาวน์โหลด</a>}
                            {document?.status === "pending" && <><button onClick={() => reviewEmployeeDocument(document, "verified")}>ตรวจผ่าน</button><button className="reject" onClick={() => reviewEmployeeDocument(document, "rejected")}>ให้แก้ไข</button></>}
                            <label className="upload-document-button">{uploadingDocumentType === documentType ? "กำลังอัปโหลด..." : document ? "อัปโหลดใหม่" : "อัปโหลด"}<input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" disabled={uploadingDocumentType !== null} onChange={(event) => { const file = event.target.files?.[0]; void uploadEmployeeDocument(documentType, file); event.currentTarget.value = ""; }} /></label>
                          </div>
                        </article>;
                      })}
                    </div>
                    <p className="document-help">รองรับ PDF, Word, JPG และ PNG ขนาดไม่เกิน 10 MB ต่อไฟล์</p>
                  </section>

                  <section className="contracts-card">
                    <div className="dossier-section-heading"><div><p className="eyebrow">EMPLOYMENT CONTRACTS</p><h3>สัญญาจ้างและการลงนาม</h3></div><button className="contract-create-button" onClick={openContractCreator}>＋ สร้างสัญญา</button></div>
                    <div className="contract-file-strip">
                      <span>▤</span><div><strong>ไฟล์ต้นฉบับสัญญา</strong><small>{profileContractDocuments[0]?.fileName ?? "อัปโหลด PDF หรือ Word ก่อนผูกกับสัญญา"}</small></div>
                      {profileContractDocuments[0]?.storageKey && <a href={`/api/documents?id=${encodeURIComponent(profileContractDocuments[0].id)}`}>ดาวน์โหลด</a>}
                      <label>{uploadingDocumentType === "contract" ? "กำลังอัปโหลด..." : "อัปโหลดไฟล์"}<input type="file" accept=".pdf,.doc,.docx" disabled={uploadingDocumentType !== null} onChange={(event) => { const file = event.target.files?.[0]; void uploadEmployeeDocument("contract", file); event.currentTarget.value = ""; }} /></label>
                    </div>
                    <div className="contract-list">
                      {profileContracts.map((contract, index) => {
                        const linkedDocument = applicationDocuments.find((document) => document.id === contract.documentId);
                        return <article key={contract.id} className={contract.status}>
                          <span className="contract-sequence">{String(profileContracts.length - index).padStart(2, "0")}</span>
                          <div className="contract-copy"><span><b className={`contract-status ${contract.status}`}>{contractStatusLabel(contract.status)}</b><small>เวอร์ชัน {contract.version}</small></span><strong>{contract.title}</strong><p>มีผล {new Date(`${contract.effectiveDate}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}{contract.expiryDate ? ` ถึง ${new Date(`${contract.expiryDate}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}` : " · ไม่มีกำหนด"}</p>{contract.status === "signed" && <em>ลงนามโดย {contract.signedName} · {formatUpdatedAt(contract.signedAt ?? contract.updatedAt)} · {contract.signerEmail}</em>}</div>
                          <div className="contract-actions">{linkedDocument?.storageKey && <a href={`/api/documents?id=${encodeURIComponent(linkedDocument.id)}`}>เปิดไฟล์</a>}{contract.status === "draft" && <button onClick={() => void sendEmploymentContract(contract)}>ส่งให้ลงนาม</button>}{(contract.status === "sent" || contract.status === "viewed") && <button onClick={() => openContractSignature(contract)}>ลงนามสัญญา</button>}{contract.status === "signed" && <span>✓ หลักฐานครบ</span>}</div>
                        </article>;
                      })}
                      {!profileContracts.length && <div className="contract-empty"><span>✎</span><div><strong>ยังไม่มีสัญญาจ้าง</strong><p>อัปโหลดไฟล์ต้นฉบับ แล้วสร้างสัญญาเพื่อส่งให้พนักงานลงนาม</p></div><button onClick={openContractCreator}>เริ่มสร้างสัญญา</button></div>}
                    </div>
                    <div className="signature-trust-note"><span>i</span><p>การลงนามจะเก็บชื่อผู้ลงนาม คำยินยอม บัญชีผู้ใช้งาน และวันเวลาไว้เป็นหลักฐานอิเล็กทรอนิกส์</p></div>
                  </section>
                </div>
              </section>
            ) : <div className="empty-state">ยังไม่มีพนักงานในระบบ</div>}
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
                        <EmployeeAvatar employee={employee} profile={employeeProfilesById.get(employee.id)} className="avatar-skill" />
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

        {view === "power" && (
          <section className="power-layout">
            <div className="power-summary-grid">
              <article className="power-hero-card">
                <div className="power-hero-copy">
                  <p className="eyebrow">POWER INDEX · {period}</p>
                  <h2>เห็นศักยภาพของคน<br />เพื่อจัดทีมได้ตรงจุด</h2>
                  <p>ค่าพลัง 6 ด้านถูกแปลงจาก KPI สกิล และความคืบหน้างานจริง เพื่อให้หัวหน้าทีมวางแผนพัฒนาและจัดคนให้เหมาะกับงานได้ง่ายขึ้น</p>
                  <div className="power-formula"><span><b>70%</b> ค่าพลังสกิล</span><i>+</i><span><b>30%</b> ผลงาน KPI</span></div>
                </div>
                <div className="power-hero-score"><small>TEAM OVR</small><strong>{averagePower ? averagePower.toFixed(0) : "—"}</strong><span>ค่าพลังเฉลี่ยของทีม</span></div>
              </article>
              <MetricCard label="มีค่าพลังแล้ว" value={`${ratedPowerProfiles.length} คน`} copy={`${allPowerProfiles.length - ratedPowerProfiles.length} คนรอประเมิน`} tone="positive" progress={allPowerProfiles.length ? ratedPowerProfiles.length / allPowerProfiles.length * 100 : 0} icon="◎" />
              <MetricCard label="ค่าพลังสูงสุด" value={topPowerProfile?.overall?.toString() ?? "—"} copy={topPowerProfile?.employee.name ?? "ยังไม่มีข้อมูล"} tone="positive" icon="★" />
            </div>

            <section className="power-roster-card">
              <div className="power-section-heading">
                <div><p className="eyebrow">EMPLOYEE POWER CARDS</p><h2>การ์ดค่าพลังรายบุคคล</h2><p>เลือก “เทียบการ์ดนี้” เพื่อส่งพนักงานไปยังสนามเปรียบเทียบด้านล่าง</p></div>
                <label className="search-field"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาชื่อ ตำแหน่ง หรือแผนก" /><span className="sr-only">ค้นหาการ์ดค่าพลัง</span></label>
              </div>
              <div className="power-card-grid">
                {visiblePowerProfiles.map((profile, index) => (
                  <EmployeePowerCard key={profile.employee.id} profile={profile} employeeProfile={employeeProfilesById.get(profile.employee.id)} rank={index + 1} onCompare={() => comparePowerProfile(profile.employee.id)} />
                ))}
                {!visiblePowerProfiles.length && <div className="empty-state">ไม่พบการ์ดค่าพลังตามเงื่อนไขที่เลือก</div>}
              </div>
            </section>

            <section className="power-arena" id="power-arena">
              <div className="power-arena-heading">
                <div><p className="eyebrow">POWER ARENA</p><h2>เปรียบเทียบค่าพลัง</h2><p>เลือกพนักงานสองคนเพื่อดูความต่างรายด้าน และหาจุดแข็งที่เสริมกันในทีม</p></div>
                <span>HEAD TO HEAD</span>
              </div>
              {powerLeft && powerRight ? (
                <>
                  <div className="power-selectors">
                    <label><span>การ์ด A</span><select value={powerLeft.employee.id} onChange={(event) => setPowerLeftId(event.target.value)}>{allPowerProfiles.filter((profile) => profile.employee.id !== powerRight.employee.id).map((profile) => <option key={profile.employee.id} value={profile.employee.id}>{profile.employee.name} · {profile.role.shortName}</option>)}</select></label>
                    <i aria-hidden="true">VS</i>
                    <label><span>การ์ด B</span><select value={powerRight.employee.id} onChange={(event) => setPowerRightId(event.target.value)}>{allPowerProfiles.filter((profile) => profile.employee.id !== powerLeft.employee.id).map((profile) => <option key={profile.employee.id} value={profile.employee.id}>{profile.employee.name} · {profile.role.shortName}</option>)}</select></label>
                  </div>
                  <div className="power-matchup">
                    <div className={`matchup-person ${powerDifference !== null && powerDifference > 0 ? "winner" : ""}`}>
                      <EmployeeAvatar employee={powerLeft.employee} profile={employeeProfilesById.get(powerLeft.employee.id)} className="avatar-matchup" />
                      <div><small>{powerLeft.role.department}</small><strong>{powerLeft.employee.name}</strong><p>{powerLeft.role.name}</p></div>
                      <b>{powerLeft.overall ?? "—"}<small>OVR</small></b>
                    </div>
                    <div className="matchup-verdict">
                      <span>{powerDifference === null ? "รอข้อมูล" : powerDifference === 0 ? "สูสี" : `ต่าง ${Math.abs(powerDifference)} แต้ม`}</span>
                      <strong>{powerDifference === null ? "ประเมินทั้งสองคนก่อนเริ่มเปรียบเทียบ" : powerDifference === 0 ? "ค่าพลังรวมใกล้เคียงกัน" : powerDifference > 0 ? `${powerLeft.employee.name} มี OVR สูงกว่า` : `${powerRight.employee.name} มี OVR สูงกว่า`}</strong>
                    </div>
                    <div className={`matchup-person right ${powerDifference !== null && powerDifference < 0 ? "winner" : ""}`}>
                      <b>{powerRight.overall ?? "—"}<small>OVR</small></b>
                      <div><small>{powerRight.role.department}</small><strong>{powerRight.employee.name}</strong><p>{powerRight.role.name}</p></div>
                      <EmployeeAvatar employee={powerRight.employee} profile={employeeProfilesById.get(powerRight.employee.id)} className="avatar-matchup" />
                    </div>
                  </div>
                  <div className="power-comparison-list">
                    {powerStats.map((stat) => {
                      const leftValue = powerLeft.stats[stat.id];
                      const rightValue = powerRight.stats[stat.id];
                      return (
                        <article key={stat.id}>
                          <strong className={leftValue > rightValue ? "higher" : ""}>{powerLeft.overall === null ? "—" : leftValue}</strong>
                          <i className="left"><b style={{ width: `${leftValue}%` }} /></i>
                          <span><em>{stat.code}</em><b>{stat.label}</b><small>{stat.description}</small></span>
                          <i className="right"><b style={{ width: `${rightValue}%` }} /></i>
                          <strong className={rightValue > leftValue ? "higher" : ""}>{powerRight.overall === null ? "—" : rightValue}</strong>
                        </article>
                      );
                    })}
                  </div>
                  <div className="power-coach-note"><span>i</span><p><strong>ใช้เพื่อโค้ชทีม ไม่ใช่ตัดสินคนด้วยตัวเลขเดียว</strong> ควรดูประสบการณ์ ความสนใจ ศักยภาพเฉพาะทาง และบริบทงานจริงร่วมกับค่าพลังเสมอ</p></div>
                </>
              ) : <div className="empty-state">ต้องมีพนักงานอย่างน้อย 2 คนเพื่อเปรียบเทียบค่าพลัง</div>}
            </section>
          </section>
        )}

        {view === "peopleOps" && (
          <section className="people-ops-layout">
            <section className="people-ops-hero">
              <div className="people-ops-hero-copy">
                <span className="people-ops-live"><i /> HR OS · LIVE</span>
                <h2>เริ่มจากเวลาเข้างาน<br />ไปจนถึงวันที่เติบโต</h2>
                <p>ข้อมูลเวลา งาน KPI สกิล เควสต์ ค่าตอบแทน และการเลื่อนตำแหน่งเชื่อมเป็นเส้นทางเดียวที่พนักงานและ HR ตรวจสอบได้</p>
                <div className="people-ops-principles"><span>✓ วันลาอนุมัติไม่ถูกลงโทษ</span><span>✓ เงินเพิ่มมีหลักฐาน</span><span>✓ เห็นเป้าหมายขั้นถัดไป</span></div>
              </div>
              <div className="people-ops-clock">
                <small>เวลาสำนักงาน · กรุงเทพฯ</small><strong>{officeClock}</strong><span>{new Date(todayDate + "T00:00:00").toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
                <label><small>ลงเวลาในชื่อ</small><select value={peopleOpsEmployeeId} onChange={(event) => selectPeopleOpsEmployee(event.target.value)}>{activeEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>
                <button onClick={() => void quickClock()} disabled={isSaving || !peopleOpsEmployee}>{attendanceRecords.find((record) => record.employeeId === peopleOpsEmployeeId && record.workDate === todayDate)?.clockIn ? "ลงเวลาออกตอนนี้" : "ลงเวลาเข้าตอนนี้"}</button>
              </div>
              <div className="people-ops-summary">
                <span><b>{attendanceOnTimeRate ? attendanceOnTimeRate.toFixed(0) : "—"}%</b><small>มาตรงเวลา</small></span>
                <span className="warning"><b>{attendanceLateCount}</b><small>มาสาย</small></span>
                <span className="negative"><b>{attendanceAbsentCount}</b><small>ขาดงาน</small></span>
                <span><b>{attendanceLeaveCount}</b><small>ลา</small></span>
                <span className="pending"><b>{pendingLeaveRecords.length}</b><small>รออนุมัติ</small></span>
              </div>
            </section>

            <div className="people-ops-grid">
              <section className="attendance-center">
                <div className="people-ops-section-heading"><div><p className="eyebrow">TIME &amp; ATTENDANCE</p><h2>เวลาเข้างาน ขาด ลา มาสาย</h2><p>บันทึกเวลาและเห็นสถานะของทีมรายวัน พร้อมประวัติผู้อนุมัติ</p></div><label><span>วันที่แสดง</span><input type="date" value={attendanceDate} onChange={(event) => setAttendanceDate(event.target.value)} /></label></div>
                <form className="attendance-form" onSubmit={saveAttendanceRecord}>
                  <label><span>พนักงาน</span><select value={attendanceForm.employeeId} onChange={(event) => { setAttendanceForm((form) => ({ ...form, employeeId: event.target.value })); setPeopleOpsEmployeeId(event.target.value); }}>{activeEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>
                  <label><span>วันที่</span><input required type="date" value={attendanceForm.workDate} onChange={(event) => setAttendanceForm((form) => ({ ...form, workDate: event.target.value }))} /></label>
                  <label><span>สถานะ</span><select value={attendanceForm.status} onChange={(event) => setAttendanceForm((form) => ({ ...form, status: event.target.value as AttendanceRecord["status"] }))}><option value="present">มาทำงาน</option><option value="late">มาสาย</option><option value="absent">ขาดงาน</option><option value="leave">ลา</option></select></label>
                  {attendanceForm.status === "leave" ? <label><span>ประเภทการลา</span><select value={attendanceForm.leaveType} onChange={(event) => setAttendanceForm((form) => ({ ...form, leaveType: event.target.value as NonNullable<AttendanceRecord["leaveType"]> }))}>{(Object.entries(leaveTypeLabels) as [NonNullable<AttendanceRecord["leaveType"]>, string][]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label> : <><label><span>เวลาเข้า</span><input type="time" value={attendanceForm.clockIn} onChange={(event) => setAttendanceForm((form) => ({ ...form, clockIn: event.target.value }))} /></label><label><span>เวลาออก</span><input type="time" value={attendanceForm.clockOut} onChange={(event) => setAttendanceForm((form) => ({ ...form, clockOut: event.target.value }))} /></label></>}
                  <label className="wide"><span>หมายเหตุ</span><input value={attendanceForm.note} onChange={(event) => setAttendanceForm((form) => ({ ...form, note: event.target.value }))} placeholder={attendanceForm.status === "leave" ? "เหตุผลการลา หรืออ้างอิงเอกสาร" : "รายละเอียดเพิ่มเติม (ถ้ามี)"} /></label>
                  <button disabled={isSaving}>{isSaving ? "กำลังบันทึก..." : attendanceForm.status === "leave" ? "ส่งคำขอลา" : "บันทึกเวลา"}</button>
                </form>
                <div className="attendance-day-strip"><span><b>{attendanceForDate.length}</b> มีรายการ</span><span><b>{attendanceUnrecordedCount}</b> ยังไม่ลงเวลา</span><small>เวลาเริ่มมาตรฐาน 09:00 · ระบบคำนวณนาทีมาสายอัตโนมัติ</small></div>
                <div className="attendance-roster">
                  {activeEmployees.map((employee) => {
                    const record = attendanceForDate.find((item) => item.employeeId === employee.id);
                    const meta = record ? attendanceStatusMeta[record.status] : null;
                    return <article key={employee.id} className={record ? meta?.tone : "missing"}>
                      <EmployeeAvatar employee={employee} profile={employeeProfilesById.get(employee.id)} className="avatar-sm" />
                      <div><strong>{employee.name}</strong><small>{getRole(employee.roleId).name}</small></div>
                      <span className="attendance-times"><b>{record?.clockIn ?? "—"}</b><i>→</i><b>{record?.clockOut ?? "—"}</b></span>
                      <span className={"attendance-status " + (meta?.tone ?? "missing")}>{record ? record.status === "leave" && record.leaveType ? leaveTypeLabels[record.leaveType] : meta?.label : "ยังไม่ลงเวลา"}</span>
                      <small className="attendance-detail">{record?.status === "late" ? "สาย " + record.minutesLate + " นาที" : record?.status === "leave" ? record.approvalStatus === "approved" ? "อนุมัติแล้ว" : record.approvalStatus === "rejected" ? "ไม่อนุมัติ" : "รออนุมัติ" : record?.note || "—"}</small>
                      {record?.approvalStatus === "pending" && <div className="attendance-row-actions"><button onClick={() => void approveAttendance(record, "approved")}>อนุมัติ</button><button className="reject" onClick={() => void approveAttendance(record, "rejected")}>ไม่อนุมัติ</button></div>}
                    </article>;
                  })}
                </div>
              </section>

              <aside className="leave-approval-card">
                <div className="people-ops-section-heading compact"><div><p className="eyebrow">APPROVAL INBOX</p><h2>คำขอลารออนุมัติ</h2></div><span>{pendingLeaveRecords.length}</span></div>
                <div className="leave-approval-list">
                  {pendingLeaveRecords.map((record) => {
                    const employee = employeesById.get(record.employeeId);
                    return <article key={record.id}><span className="leave-date"><b>{record.workDate.slice(8, 10)}</b><small>{new Date(record.workDate + "T00:00:00").toLocaleDateString("th-TH", { month: "short" })}</small></span><div><strong>{employee?.name ?? "ไม่พบพนักงาน"}</strong><small>{record.leaveType ? leaveTypeLabels[record.leaveType] : "วันลา"} · {record.note || "ไม่ระบุเหตุผล"}</small></div><div><button onClick={() => void approveAttendance(record, "approved")}>✓ อนุมัติ</button><button className="reject" onClick={() => void approveAttendance(record, "rejected")}>×</button></div></article>;
                  })}
                  {!pendingLeaveRecords.length && <div className="people-ops-empty"><span>✓</span><strong>ไม่มีคำขอค้าง</strong><p>รายการอนุมัติวันลาครบแล้ว</p></div>}
                </div>
                <div className="fairness-note"><span>i</span><p><strong>หลักความเป็นธรรม</strong> วันลาที่อนุมัติจะไม่ถูกนับเป็นขาดงานและไม่ลดคะแนนความพร้อมเลื่อนตำแหน่ง</p></div>
              </aside>
            </div>

            {peopleOpsEmployee && peopleOpsRole && (
              <section className="growth-command-center">
                <div className="growth-heading">
                  <div className="growth-person"><EmployeeAvatar employee={peopleOpsEmployee} profile={employeeProfilesById.get(peopleOpsEmployee.id)} className="avatar-growth" /><div><p className="eyebrow">GROWTH &amp; REWARD PATH</p><h2>เส้นทางเติบโตของ {peopleOpsEmployee.name}</h2><p>{peopleOpsRole.name} · ทุกขั้นเชื่อมจากหลักฐานผลงานและสกิล</p></div></div>
                  <label><span>เลือกพนักงาน</span><select value={peopleOpsEmployeeId} onChange={(event) => selectPeopleOpsEmployee(event.target.value)}>{activeEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} · {getRole(employee.roleId).shortName}</option>)}</select></label>
                </div>
                <div className="growth-summary-grid">
                  <article><small>เงินเดือนปัจจุบัน</small><strong>฿{formatMoney(peopleOpsHrProfile?.currentSalary ?? 0)}</strong><span>อัปเดตล่าสุด {peopleOpsHrProfile ? formatUpdatedAt(peopleOpsHrProfile.updatedAt) : "—"}</span></article>
                  <article className="positive"><small>เงินเพิ่มจากสกิลสะสม</small><strong>+฿{formatMoney(peopleOpsSkillUplift)}</strong><span>ต่อเดือน · {peopleOpsAchievements.length} ระดับที่ยืนยันแล้ว</span></article>
                  <article><small>เป้าหมายตำแหน่งถัดไป</small><strong>{growthRoleNames[peopleOpsRole.id] ?? "หัวหน้าทีม" + peopleOpsRole.department}</strong><span>วัดจาก KPI สกิล เควสต์ และความสม่ำเสมอ</span></article>
                  <article className={promotionReadiness >= 80 ? "positive" : "warning"}><small>ความพร้อมเลื่อนตำแหน่ง</small><strong>{promotionReadiness}%</strong><i><b style={{ width: promotionReadiness + "%" }} /></i></article>
                </div>

                <div className="growth-roadmap">
                  <article className="done"><span>01</span><div><small>ตำแหน่งปัจจุบัน</small><strong>{peopleOpsRole.name}</strong><p>KPI {peopleOpsEvaluation?.kpiScore.toFixed(0) ?? "—"} · สกิล {peopleOpsEvaluation?.skillScore.toFixed(0) ?? "—"}</p></div><b>กำลังทำอยู่</b></article>
                  <i>→</i>
                  <article className={promotionReadiness >= 65 ? "active" : "locked"}><span>02</span><div><small>ด่านความพร้อม</small><strong>รับงานและเควสต์ระดับถัดไป</strong><p>{peopleOpsMissions.filter((item) => item.status === "done").length}/{peopleOpsMissions.length} เควสต์สำเร็จ · งานเปิด {peopleOpsWork.filter((item) => item.status !== "done").length}</p></div><b>{promotionReadiness >= 65 ? "ปลดล็อกแล้ว" : "กำลังพัฒนา"}</b></article>
                  <i>→</i>
                  <article className={promotionReadiness >= 80 ? "active" : "locked"}><span>03</span><div><small>ตำแหน่งเป้าหมาย</small><strong>{growthRoleNames[peopleOpsRole.id] ?? "หัวหน้าทีม" + peopleOpsRole.department}</strong><p>พร้อมเสนอพิจารณาเมื่อคะแนนรวมถึง 80%</p></div><b>{promotionReadiness >= 80 ? "พร้อมเสนอ" : "อีก " + (80 - promotionReadiness) + "%"}</b></article>
                </div>

                <div className="growth-detail-grid">
                  <section className="skill-pay-card">
                    <div className="people-ops-section-heading"><div><p className="eyebrow">SKILL-BASED PAY</p><h2>เงินเพิ่มตามสกิลที่ยืนยันแล้ว</h2><p>ระดับใหม่เพิ่มค่าตอบแทนและความรับผิดชอบ โดยไม่จำกัดเส้นทางเติบโตไว้ที่อายุงาน</p></div><button onClick={() => setView("skills")}>ดูกราฟสกิล →</button></div>
                    <div className="skill-opportunity-list">
                      {nextSkillOpportunities.map(({ skill, currentLevel, highestVerifiedLevel, allowance, canVerify }) => <article key={skill.id} className={canVerify ? "ready" : ""}>
                        <div><strong>{skill.name}</strong><small>ปัจจุบันระดับ {currentLevel || "—"} · ยืนยันสูงสุด {highestVerifiedLevel || "ยังไม่ยืนยัน"}</small></div>
                        <span className="skill-level-dots">{[1, 2, 3, 4, 5].map((level) => <i key={level} className={level <= currentLevel ? "filled" : ""} />)}</span>
                        <div className="skill-pay-value"><small>เงินเพิ่มระดับนี้</small><strong>+฿{formatMoney(allowance)}/เดือน</strong></div>
                        <button disabled={!canVerify} onClick={() => { setSkillAchievementForm({ skillId: skill.id, level: currentLevel, evidenceUrl: "", note: "" }); document.getElementById("skill-verification-form")?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>{canVerify ? "ตรวจและยืนยัน" : currentLevel ? "ยืนยันแล้ว" : "รอประเมิน"}</button>
                      </article>)}
                    </div>
                    <form id="skill-verification-form" className="skill-verification-form" onSubmit={verifySkillAchievement}>
                      <div><p className="eyebrow">VERIFICATION</p><h3>ยืนยันสกิลและเพิ่มค่าตอบแทน</h3><small>ระบบตรวจระดับจากผลประเมินล่าสุดและป้องกันการเพิ่มซ้ำอัตโนมัติ</small></div>
                      <label><span>สกิล</span><select required value={skillAchievementForm.skillId} onChange={(event) => { const skillId = event.target.value; setSkillAchievementForm((form) => ({ ...form, skillId, level: Math.max(2, peopleOpsEvaluation?.skillScores[skillId] ?? 2) })); }}><option value="">เลือกสกิล</option>{peopleOpsRole.skills.map((skill) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}</select></label>
                      <label><span>ระดับที่ยืนยัน</span><input required type="number" min="2" max="5" value={skillAchievementForm.level} onChange={(event) => setSkillAchievementForm((form) => ({ ...form, level: Number(event.target.value) }))} /></label>
                      <label className="wide"><span>ลิงก์หลักฐานการทดสอบ / ผลงาน</span><input type="url" value={skillAchievementForm.evidenceUrl} onChange={(event) => setSkillAchievementForm((form) => ({ ...form, evidenceUrl: event.target.value }))} placeholder="https://... (ถ้ามี)" /></label>
                      <label className="wide"><span>เหตุผลที่ผ่านเกณฑ์</span><input value={skillAchievementForm.note} onChange={(event) => setSkillAchievementForm((form) => ({ ...form, note: event.target.value }))} placeholder="เช่น ผ่าน Skill Test 86% และมีผลงานจริง 2 ชิ้น" /></label>
                      <div className="skill-verification-value"><span>เงินเพิ่มเมื่อยืนยัน</span><strong>+฿{formatMoney(skillAllowanceFor(peopleOpsRole.id, skillAchievementForm.level))}/เดือน</strong></div>
                      <button disabled={isSaving || !skillAchievementForm.skillId}>{isSaving ? "กำลังยืนยัน..." : "ยืนยันและอัปเดตเงินเดือน"}</button>
                    </form>
                  </section>

                  <aside className="promotion-score-card">
                    <div><p className="eyebrow">PROMOTION SCORE</p><h2>สูตรความพร้อมที่ตรวจสอบได้</h2><p>ไม่มีการใช้ตัวเลขเดียวตัดสิน และ HR เป็นผู้อนุมัติขั้นสุดท้าย</p></div>
                    {([
                      ["ผลงาน KPI", peopleOpsEvaluation?.kpiScore ?? 0, 40],
                      ["ระดับสกิล", peopleOpsEvaluation?.skillScore ?? 0, 40],
                      ["เควสต์พัฒนา", missionGrowthScore, 15],
                      ["ความสม่ำเสมอ", attendanceReliability, 5],
                    ] as [string, number, number][]).map(([label, score, weight]) => <article key={label}><span><strong>{label}</strong><small>น้ำหนัก {weight}%</small></span><i><b style={{ width: score + "%" }} /></i><em>{score.toFixed(0)}</em></article>)}
                    <div className="promotion-score-total"><span><small>คะแนนรวม</small><strong>{promotionReadiness}/100</strong></span><b>{promotionReadiness >= 80 ? "พร้อมเสนอเลื่อนตำแหน่ง" : promotionReadiness >= 65 ? "พร้อมรับงานระดับถัดไป" : "เดินหน้าพัฒนาตามแผน"}</b></div>
                    <button onClick={() => openHrManagement(peopleOpsEmployee, "role_review")}>เปิดแผนเลื่อนตำแหน่ง</button>
                    <p className="promotion-policy">ผลนี้เป็นคำแนะนำเพื่อการพูดคุย ไม่ใช่การอนุมัติอัตโนมัติ ควรพิจารณาคุณภาพงาน ความสนใจ และโอกาสขององค์กรร่วมด้วย</p>
                  </aside>
                </div>

                <section className="team-builder-card">
                  <div><p className="eyebrow">SMART TEAM BUILDER</p><h2>สร้างทีมจากจุดแข็งและภาระงาน</h2><p>แนะนำทีมข้ามสายงานจากคนที่มีงานเปิดน้อย พร้อมระบุสกิลเด่นก่อนสร้างโปรเจกต์และเควสต์</p></div>
                  <div className="growth-team-list">{growthTeam.map(({ employee, role, openWork, strength }, index) => <article key={employee.id}><span className="team-slot">{String(index + 1).padStart(2, "0")}</span><EmployeeAvatar employee={employee} profile={employeeProfilesById.get(employee.id)} className="avatar-sm" /><div><strong>{employee.name}</strong><small>{role.name}</small></div><span><small>จุดแข็ง</small><b>{strength}</b></span><em>{openWork} งานเปิด</em></article>)}</div>
                  <button onClick={buildGrowthTeam}>สร้างโปรเจกต์ให้ทีมนี้</button>
                </section>
              </section>
            )}
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
                        <span className="workforce-person"><EmployeeAvatar employee={employee} profile={employeeProfilesById.get(employee.id)} className="avatar-workforce" /><span><strong>{employee.name}</strong><small>{role.name} · {role.department}</small></span></span>
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

        {view === "access" && isAdmin && (
          <section className="access-layout">
            <div className="access-summary-grid">
              <article className="access-hero-card"><span>◎</span><div><p className="eyebrow">SECURE TEAM ACCESS</p><h2>ให้แต่ละคนเห็นเฉพาะสิ่งที่ควรเห็น</h2><p>ผูกอีเมลที่ใช้เข้าสู่ระบบกับโปรไฟล์พนักงานหนึ่งคน จากนั้นระบบจะกรองงาน ภารกิจ แฟ้มผลงาน แต้ม และรางวัลให้อัตโนมัติ</p></div></article>
              <MetricCard label="บัญชีใช้งาน" value={`${userAccounts.filter((account) => account.status === "active").length} บัญชี`} copy={`${userAccounts.filter((account) => account.status === "inactive").length} บัญชีพักสิทธิ์`} tone="positive" icon="✓" />
              <MetricCard label="พนักงาน" value={`${userAccounts.filter((account) => account.role === "employee").length} บัญชี`} copy="เห็นข้อมูลของตัวเองเท่านั้น" icon="♙" />
              <MetricCard label="หัวหน้าทีม" value={`${userAccounts.filter((account) => account.role === "manager").length} บัญชี`} copy="เห็นงานและผลงานของทีม" icon="◇" />
            </div>

            <div className="access-main-grid">
              <form className="access-form-card" id="user-access-form" onSubmit={saveUserAccount}>
                <div className="access-card-heading"><div><p className="eyebrow">ACCOUNT SETUP</p><h2>{userAccountForm.accountId ? "แก้ไขสิทธิ์ผู้ใช้งาน" : "เพิ่มผู้ใช้งาน"}</h2><p>ใช้อีเมลเดียวกับบัญชีที่พนักงานจะใช้เข้าสู่เว็บไซต์</p></div><span>{userAccountForm.accountId ? "แก้ไข" : "ใหม่"}</span></div>
                <div className="form-grid access-form-grid">
                  <label className="wide"><span>ชื่อที่แสดง</span><input required value={userAccountForm.displayName} onChange={(event) => setUserAccountForm((form) => ({ ...form, displayName: event.target.value }))} placeholder="ชื่อ–นามสกุล" /></label>
                  <label className="wide"><span>อีเมลที่ใช้เข้าสู่ระบบ</span><input required type="email" value={userAccountForm.email} onChange={(event) => setUserAccountForm((form) => ({ ...form, email: event.target.value }))} placeholder="name@company.com" /></label>
                  <label><span>ระดับสิทธิ์</span><select value={userAccountForm.role} onChange={(event) => setUserAccountForm((form) => ({ ...form, role: event.target.value as UserAccountRecord["role"] }))}><option value="employee">พนักงาน</option><option value="manager">หัวหน้าทีม</option><option value="admin">HR / Admin</option></select></label>
                  <label><span>สถานะ</span><select value={userAccountForm.status} onChange={(event) => setUserAccountForm((form) => ({ ...form, status: event.target.value as UserAccountRecord["status"] }))}><option value="active">ใช้งาน</option><option value="inactive">พักสิทธิ์</option></select></label>
                  {userAccountForm.role !== "admin" && <label className="wide"><span>ผูกกับโปรไฟล์พนักงาน</span><select required value={userAccountForm.employeeId} onChange={(event) => setUserAccountForm((form) => ({ ...form, employeeId: event.target.value }))}><option value="">เลือกพนักงาน</option>{employees.filter((employee) => employee.status === "active" && (!userAccounts.some((account) => account.employeeId === employee.id && account.id !== userAccountForm.accountId))).map((employee) => <option key={employee.id} value={employee.id}>{employee.name} · {getRole(employee.roleId).name}</option>)}</select></label>}
                  {userAccountForm.role === "manager" && <label className="wide"><span>ทีมที่ดูแล</span><select value={userAccountForm.departmentId} onChange={(event) => setUserAccountForm((form) => ({ ...form, departmentId: event.target.value }))}><option value="">ใช้แผนกตามโปรไฟล์พนักงาน</option>{Array.from(new Map(roles.map((role) => [role.departmentId, role.department])).entries()).map(([departmentId, department]) => <option key={departmentId} value={departmentId}>{department}</option>)}</select></label>}
                </div>
                <div className="access-form-actions">{userAccountForm.accountId && <button type="button" onClick={() => setUserAccountForm({ accountId: "", email: "", displayName: "", role: "employee", employeeId: "", departmentId: "", status: "active" })}>ยกเลิกการแก้ไข</button>}<button className="primary" disabled={isSaving}>{isSaving ? "กำลังบันทึก..." : userAccountForm.accountId ? "บันทึกการแก้ไข" : "เพิ่มผู้ใช้งาน"}</button></div>
              </form>

              <aside className="access-rights-card">
                <div className="access-card-heading"><div><p className="eyebrow">ROLE GUIDE</p><h2>แต่ละสิทธิ์ทำอะไรได้</h2></div></div>
                <article className="admin"><span>01</span><div><strong>HR / Admin</strong><p>จัดการพนักงาน เอกสาร เงินเดือน การประเมิน งาน แต้ม และบัญชีผู้ใช้ทั้งหมด</p></div></article>
                <article className="manager"><span>02</span><div><strong>หัวหน้าทีม</strong><p>เห็นคนในทีม มอบหมายงาน ติดตามโปรเจกต์ ตรวจผลงาน และประเมินผล โดยไม่เห็นข้อมูลเงินเดือนหรือเอกสารส่วนตัว</p></div></article>
                <article className="employee"><span>03</span><div><strong>พนักงาน</strong><p>เห็นเฉพาะทูดูลิส ภารกิจ แฟ้มผลงาน แต้ม และของรางวัลของตัวเอง พร้อมส่งหลักฐานงานได้</p></div></article>
                <div className="access-invite-note"><span>i</span><p><strong>ขั้นสุดท้ายก่อนใช้งานจริง</strong> หลังเพิ่มบัญชีในหน้านี้ ให้เจ้าของเว็บไซต์เชิญอีเมลเดียวกันเข้าถึงเว็บไซต์ด้วย เพื่อให้พนักงานเปิดระบบได้</p></div>
              </aside>
            </div>

            <section className="access-account-card">
              <div className="access-card-heading"><div><p className="eyebrow">TEAM ACCOUNTS</p><h2>บัญชีผู้ใช้งานทั้งหมด</h2><p>บัญชีจะผูกอัตโนมัติเมื่ออีเมลนั้นเข้าสู่ระบบครั้งแรก</p></div><span>{userAccounts.length} บัญชี</span></div>
              <div className="access-account-list">
                {userAccounts.map((account) => {
                  const employee = account.employeeId ? employeesById.get(account.employeeId) : null;
                  const roleName = account.role === "admin" ? "HR / Admin" : account.role === "manager" ? "หัวหน้าทีม" : "พนักงาน";
                  return <article key={account.id} className={account.status}>
                    <span className="access-account-avatar">{makeInitials(account.displayName)}</span>
                    <div className="access-account-person"><strong>{account.displayName}</strong><small>{account.email}</small></div>
                    <span className={`access-role-pill ${account.role}`}>{roleName}</span>
                    <div className="access-account-link"><strong>{employee?.name ?? (account.role === "admin" ? "สิทธิ์ระดับองค์กร" : "ยังไม่ผูกโปรไฟล์")}</strong><small>{employee ? getRole(employee.roleId).name : account.lastLoginAt ? `เข้าใช้ล่าสุด ${formatUpdatedAt(account.lastLoginAt)}` : "ยังไม่เคยเข้าสู่ระบบ"}</small></div>
                    <b className={`access-status ${account.status}`}>{account.status === "active" ? "ใช้งาน" : "พักสิทธิ์"}</b>
                    <span className="access-account-actions"><button onClick={() => editUserAccount(account)}>แก้ไข</button><button disabled={isSaving || account.id === currentUser?.id} onClick={() => void toggleUserAccount(account)}>{account.status === "active" ? "พักสิทธิ์" : "เปิดสิทธิ์"}</button></span>
                  </article>;
                })}
                {!userAccounts.length && <div className="empty-state">ยังไม่มีบัญชีผู้ใช้งาน</div>}
              </div>
            </section>
          </section>
        )}

        {view === "portfolio" && (
          <section className="portfolio-layout">
            <div className="portfolio-summary-grid">
              <article className="portfolio-hero-card">
                <div><p className="eyebrow">WORK ARCHIVE · {period}</p><h2>ผลงานที่หาเจอ<br />และตรวจสอบย้อนหลังได้</h2><p>ทุกงานที่เสร็จหรือส่งตรวจจะถูกจัดเข้ากับพนักงาน โปรเจกต์ หลักฐาน และผลประเมินโดยอัตโนมัติ</p></div>
                <span><strong>{portfolioPeople}</strong><small>แฟ้มรายบุคคล</small></span>
              </article>
              <MetricCard label="ผลงานในแฟ้ม" value={`${portfolioEntries.length} รายการ`} copy={`${portfolioApprovedCount} รายการผ่านการตรวจแล้ว`} tone="positive" icon="▣" />
              <MetricCard label="ไฟล์และลิงก์ค้นหาได้" value={`${portfolioAssetCount} รายการ`} copy={`${workSubmissions.filter((submission) => submission.storageKey).length} ไฟล์ · ${workSubmissions.filter((submission) => submission.linkUrl).length} ลิงก์`} icon="⌕" />
              <MetricCard label="คะแนนประเมินเฉลี่ย" value={portfolioAverageScore ? portfolioAverageScore.toFixed(1) : "—"} copy={`${portfolioEvaluations.length} คนมีผลประเมินในรอบนี้`} tone="positive" progress={portfolioAverageScore} icon="◎" />
            </div>

            <section className="portfolio-finder-card">
              <div className="portfolio-finder-heading"><div><p className="eyebrow">PORTFOLIO FINDER</p><h2>ค้นหาแฟ้มและไฟล์ผลงาน</h2><p>ค้นจากชื่อพนักงาน โปรเจกต์ ชื่องาน ชื่อไฟล์ ลิงก์ หรือข้อความในหลักฐาน</p></div><span>{visiblePortfolioEntries.length} รายการ</span></div>
              <div className="portfolio-filters">
                <label className="portfolio-search"><span aria-hidden="true">⌕</span><input value={portfolioSearch} onChange={(event) => setPortfolioSearch(event.target.value)} placeholder="พิมพ์ชื่อคน งาน โปรเจกต์ หรือชื่อไฟล์..." /><small>ค้นหาทุกข้อมูลในแฟ้ม</small></label>
                <label><span>พนักงาน</span><select value={portfolioEmployeeId} onChange={(event) => setPortfolioEmployeeId(event.target.value)}><option value="all">พนักงานทั้งหมด</option>{employees.filter((employee) => employee.status === "active").map((employee) => <option key={employee.id} value={employee.id}>{employee.name} · {getRole(employee.roleId).shortName}</option>)}</select></label>
                <label><span>โปรเจกต์</span><select value={portfolioProjectId} onChange={(event) => setPortfolioProjectId(event.target.value)}><option value="all">ทุกโปรเจกต์</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
                <label><span>สถานะแฟ้ม</span><select value={portfolioStatus} onChange={(event) => setPortfolioStatus(event.target.value as PortfolioStatusFilter)}><option value="all">ทุกสถานะ</option><option value="approved">ตรวจและจัดเก็บแล้ว</option><option value="submitted">รอผู้ตรวจอนุมัติ</option><option value="revision">รอแก้ไขผลงาน</option><option value="missing">ยังไม่มีหลักฐาน</option></select></label>
              </div>

              {focusedPortfolioEmployee && (
                <article className="portfolio-owner-banner">
                  <EmployeeAvatar employee={focusedPortfolioEmployee} profile={employeeProfilesById.get(focusedPortfolioEmployee.id)} className="avatar-portfolio" />
                  <div><p className="eyebrow">INDIVIDUAL PORTFOLIO</p><h3>{focusedPortfolioEmployee.name}</h3><small>{getRole(focusedPortfolioEmployee.roleId).name} · {getRole(focusedPortfolioEmployee.roleId).department}</small></div>
                  <span><small>ผลงาน</small><strong>{portfolioEntries.filter((entry) => entry.item.assigneeEmployeeId === focusedPortfolioEmployee.id).length}</strong></span>
                  <span><small>KPI</small><strong>{focusedPortfolioEvaluation?.kpiScore.toFixed(0) ?? "—"}</strong></span>
                  <span><small>สกิล</small><strong>{focusedPortfolioEvaluation?.skillScore.toFixed(0) ?? "—"}</strong></span>
                  {!isEmployeeUser && <button onClick={() => openEvaluation(focusedPortfolioEmployee)}>{focusedPortfolioEvaluation ? "ทบทวนผลประเมิน" : "เริ่มประเมิน"} →</button>}
                </article>
              )}

              <div className="portfolio-archive" role="table" aria-label="แฟ้มผลงานพนักงาน">
                <div className="portfolio-archive-head" role="row"><span>เจ้าของผลงาน</span><span>งานและโปรเจกต์</span><span>หลักฐานที่ค้นพบ</span><span>ข้อมูลประเมิน</span><span>สถานะ</span></div>
                {visiblePortfolioEntries.map((entry) => {
                  const linkEvidence = entry.submissions.find((submission) => submission.linkUrl);
                  const fileEvidence = entry.submissions.find((submission) => submission.storageKey);
                  const role = entry.employee ? getRole(entry.employee.roleId) : null;
                  return (
                    <article className="portfolio-archive-row" role="row" key={entry.item.id}>
                      <span className="portfolio-person">{entry.employee ? <EmployeeAvatar employee={entry.employee} profile={employeeProfilesById.get(entry.employee.id)} className="avatar-portfolio-row" /> : <i className="avatar-media avatar-portfolio-row">PP</i>}<span><strong>{entry.employee?.name ?? "ไม่ระบุพนักงาน"}</strong><small>{role?.name ?? "ไม่ระบุตำแหน่ง"}</small></span></span>
                      <span className="portfolio-work"><b>{workKindLabel(entry.item.kind)} · {entry.project?.name ?? "ไม่ระบุโปรเจกต์"}</b><strong>{entry.item.title}</strong><small>{entry.item.description}</small></span>
                      <span className="portfolio-assets">{linkEvidence && <a href={linkEvidence.linkUrl} target="_blank" rel="noreferrer"><b>↗</b><span>เปิดลิงก์<small>{submissionTypeLabels[linkEvidence.submissionType]}</small></span></a>}{fileEvidence && <a href={`/api/work-submissions?id=${encodeURIComponent(fileEvidence.id)}`}><b>↓</b><span>{fileEvidence.fileName}<small>{formatFileSize(fileEvidence.sizeBytes)}</small></span></a>}{!linkEvidence && !fileEvidence && <button onClick={() => openSubmissionCenter(entry.item)}><b>＋</b><span>เพิ่มหลักฐาน<small>ไฟล์หรือลิงก์ผลงาน</small></span></button>}</span>
                      <span className="portfolio-evaluation"><b>{entry.evaluation?.totalScore.toFixed(0) ?? "—"}<small>คะแนนรวม</small></b><span><small>KPI {entry.evaluation?.kpiScore.toFixed(0) ?? "—"}</small><small>สกิล {entry.evaluation?.skillScore.toFixed(0) ?? "—"}</small><small>★ {entry.item.points} แต้ม</small></span></span>
                      <span className="portfolio-state"><b className={entry.status}>{portfolioStatusLabel(entry.status)}</b><small>{entry.approvedSubmission?.reviewedBy ? `ตรวจโดย ${entry.approvedSubmission.reviewedBy}` : entry.latestSubmission ? `ส่ง ${formatUpdatedAt(entry.latestSubmission.submittedAt)}` : `เสร็จ ${formatUpdatedAt(entry.item.updatedAt)}`}</small><button onClick={() => openSubmissionCenter(entry.item)}>{entry.submissions.length ? `ดูหลักฐาน ${entry.submissions.length} รายการ` : "จัดเก็บผลงาน"}</button></span>
                    </article>
                  );
                })}
                {!visiblePortfolioEntries.length && <div className="portfolio-empty"><span>⌕</span><strong>ไม่พบผลงานตามเงื่อนไข</strong><p>ลองเปลี่ยนคำค้นหา พนักงาน โปรเจกต์ หรือสถานะแฟ้ม</p><button onClick={() => { setPortfolioSearch(""); setPortfolioEmployeeId("all"); setPortfolioProjectId("all"); setPortfolioStatus("all"); }}>ล้างตัวกรอง</button></div>}
              </div>
              <div className="portfolio-audit-note"><span>i</span><p><strong>ข้อมูลพร้อมใช้ประกอบการประเมิน</strong> ตรวจสอบเนื้องาน หลักฐาน ผู้อนุมัติ KPI สกิล และหมายเหตุร่วมกัน ไม่ควรตัดสินพนักงานจากจำนวนไฟล์หรือคะแนนเพียงอย่างเดียว</p></div>
            </section>
          </section>
        )}

        {view === "work" && (
          <section className="mission-layout">
            <div className="mission-summary-grid">
              <MetricCard label="ต้องทำวันนี้" value={`${todayWorkItems.length} งาน`} copy={`${dueThisWeekWorkItems.length} งานครบกำหนดภายใน 7 วัน`} tone="warning" icon="●" />
              <MetricCard label="เกินกำหนด" value={`${overdueWorkItems.length} งาน`} copy={overdueWorkItems.length ? "ต้องจัดลำดับและติดตามทันที" : "ไม่มีงานค้างเกินกำหนด"} tone={overdueWorkItems.length ? "warning" : "positive"} icon="!" />
              <MetricCard label="รอตรวจผลงาน" value={`${reviewQueueWorkItems.length} งาน`} copy={`${pendingSubmissionCount} หลักฐานรอการอนุมัติ`} icon="⌕" />
              <MetricCard label="งานเสร็จทั้งหมด" value={`${workCompletion.toFixed(0)}%`} copy={`${workItems.filter((item) => item.status === "done").length} จาก ${workItems.length} รายการ`} tone="positive" progress={workCompletion} icon="✓" />
            </div>

            <section className="todo-focus-card">
              <div className="todo-focus-heading">
                <div><p className="eyebrow">TODAY&apos;S FOCUS</p><h2>{isEmployeeUser ? "งานที่ฉันควรลงมือทำต่อ" : "งานที่ทีมควรลงมือทำต่อ"}</h2><p>เรียงจากกำหนดส่งและความสำคัญ เพื่อให้เห็นสิ่งที่ต้องทำก่อนโดยไม่ต้องไล่เปิดทุกโปรเจกต์</p></div>
                {permissions.canManageWork && <button onClick={() => openWorkItemForm()}><span>＋</span> เพิ่มงานด่วน</button>}
              </div>
              <div className="todo-focus-layout">
                <div className="todo-agenda">
                  {visibleWorkItems.filter((item) => item.status !== "done").slice(0, 6).map((item) => {
                    const project = projectsById.get(item.projectId);
                    const assignee = employeesById.get(item.assigneeEmployeeId);
                    const dueState = item.dueDate < todayDate ? "overdue" : item.dueDate === todayDate ? "today" : "upcoming";
                    const actionLabel = item.status === "todo" ? "เริ่มงาน" : item.status === "in_progress" ? "ส่งงาน" : item.status === "review" && isEmployeeUser ? "รอตรวจ" : item.status === "review" ? "ตรวจงาน" : "ดูผลงาน";
                    return (
                      <article key={item.id} className={`todo-agenda-row ${dueState}`}>
                        <button className={`todo-state-mark ${item.status}`} onClick={() => item.status === "todo" ? void startWorkItem(item) : isEmployeeUser ? openSubmissionCenter(item) : openWorkItemForm(item)} aria-label={item.status === "todo" ? `เริ่มงาน ${item.title}` : `เปิดงาน ${item.title}`}><span>{item.status === "todo" ? "" : item.status === "review" ? "⌕" : "→"}</span></button>
                        <div className="todo-agenda-copy"><span><b className={`work-priority ${item.priority}`}>{workPriorityLabel(item.priority)}</b><small>{project?.name ?? "ไม่ระบุโปรเจกต์"}</small></span><strong>{item.title}</strong><p>{item.description || "ยังไม่มีรายละเอียดเพิ่มเติม"}</p></div>
                        <div className="todo-agenda-owner">{assignee ? <EmployeeAvatar employee={assignee} profile={employeeProfilesById.get(assignee.id)} className="avatar-todo-focus" /> : <i className="avatar-media avatar-todo-focus">PP</i>}<span><strong>{assignee?.name ?? "ยังไม่ระบุ"}</strong><small>{item.progress}% · {workStatusLabel(item.status)}</small></span></div>
                        <div className={`todo-agenda-due ${dueState}`}><small>{dueState === "overdue" ? "เกินกำหนด" : dueState === "today" ? "วันนี้" : "กำหนดส่ง"}</small><strong>{formatDueDate(item.dueDate)}</strong></div>
                        <button className="todo-row-action" disabled={quickUpdatingWorkId === item.id} onClick={() => item.status === "todo" ? void startWorkItem(item) : openSubmissionCenter(item)}>{quickUpdatingWorkId === item.id ? "กำลังเริ่ม..." : actionLabel}</button>
                      </article>
                    );
                  })}
                  {!visibleWorkItems.some((item) => item.status !== "done") && <div className="todo-agenda-empty"><span>✓</span><strong>เคลียร์งานครบแล้ว</strong><p>เพิ่มงานใหม่ หรือเปลี่ยนตัวกรองเพื่อดูงานของทีมอื่น</p></div>}
                </div>
                <aside className="todo-priority-panel">
                  <p className="eyebrow">QUICK FILTER</p><h3>เลือกงานที่ต้องโฟกัส</h3>
                  <button className={workDueFilter === "today" ? "active" : ""} onClick={() => setWorkDueFilter(workDueFilter === "today" ? "all" : "today")}><span className="today">●</span><p><strong>ครบกำหนดวันนี้</strong><small>ลงมือทำก่อนจบวัน</small></p><b>{todayWorkItems.length}</b></button>
                  <button className={workDueFilter === "overdue" ? "active" : ""} onClick={() => setWorkDueFilter(workDueFilter === "overdue" ? "all" : "overdue")}><span className="overdue">!</span><p><strong>งานเกินกำหนด</strong><small>ติดตามผู้รับผิดชอบ</small></p><b>{overdueWorkItems.length}</b></button>
                  <button className={workDueFilter === "week" ? "active" : ""} onClick={() => setWorkDueFilter(workDueFilter === "week" ? "all" : "week")}><span>7</span><p><strong>7 วันข้างหน้า</strong><small>วางแผนล่วงหน้าของทีม</small></p><b>{dueThisWeekWorkItems.length}</b></button>
                  <button className="clear" onClick={() => { setWorkDueFilter("all"); setWorkAssigneeFilter("all"); setWorkFilter("all"); setWorkSearch(""); }}>ล้างตัวกรองทั้งหมด</button>
                </aside>
              </div>
            </section>

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
                        <div className="project-owner">{owner ? <EmployeeAvatar employee={owner} profile={employeeProfilesById.get(owner.id)} className="avatar-project" /> : <i className="avatar-media avatar-project">PP</i>}<span><small>เจ้าของโปรเจกต์</small><strong>{owner?.name ?? "People Pulse"}</strong></span></div>
                        <div className="project-progress"><span><small>ความคืบหน้า</small><strong>{progress.toFixed(0)}%</strong></span><i><b style={{ width: `${progress}%` }} /></i><small>{completed}/{items.length} งานเสร็จแล้ว</small></div>
                      </article>
                    );
                  })}
                </div>
              </section>

              <aside className="points-leaderboard-card">
                <div className="section-heading compact"><div><p className="eyebrow">POINTS {isEmployeeUser ? "BALANCE" : "LEADERBOARD"}</p><h2>{isEmployeeUser ? "แต้มสะสมของฉัน" : "อันดับสะสมแต้ม"}</h2></div><span className="points-crown">★</span></div>
                <div className="points-leaderboard-list">
                  {leaderboard.slice(0, 6).map(({ employee, points }, index) => <article key={employee.id} className={index === 0 ? "champion" : ""}><span className="leader-rank">{index + 1}</span><EmployeeAvatar employee={employee} profile={employeeProfilesById.get(employee.id)} className="avatar-leader" /><p><strong>{employee.name}</strong><small>{getRole(employee.roleId).name}</small></p><b>{formatMoney(points)}<small> แต้ม</small></b></article>)}
                </div>
                <p className="points-note">ยอดคงเหลือรวมแต้มประเมิน งาน เควสต์ เวลาเข้างาน โบนัส รายการหัก และแต้มที่ใช้แลกรางวัล</p>
              </aside>
            </div>

            <section className="work-board-card" id="todo-board">
              <div className="work-board-heading">
                <div><p className="eyebrow">MASTER TO-DO LIST</p><h2>{isEmployeeUser ? "รายการงานและภารกิจของฉัน" : "รายการงานทั้งหมดของทีม"}</h2><p>กรองตามกำหนดส่ง ผู้รับผิดชอบ และประเภทงาน แล้วเริ่มงานหรือส่งหลักฐานได้จากรายการเดียว</p></div>
                <div className="work-view-switch" aria-label="เลือกรูปแบบการแสดงงาน"><button className={workViewMode === "list" ? "active" : ""} onClick={() => setWorkViewMode("list")}><span>☷</span> รายการ</button><button className={workViewMode === "board" ? "active" : ""} onClick={() => setWorkViewMode("board")}><span>▦</span> บอร์ด</button></div>
              </div>
              <div className="todo-control-bar">
                <label className="search-field todo-search"><span aria-hidden="true">⌕</span><input value={workSearch} onChange={(event) => setWorkSearch(event.target.value)} placeholder="ค้นหาชื่องาน โปรเจกต์ หรือผู้รับผิดชอบ..." /><span className="sr-only">ค้นหางานและภารกิจ</span></label>
                {!isEmployeeUser && <label className="todo-select"><span>ผู้รับผิดชอบ</span><select value={workAssigneeFilter} onChange={(event) => setWorkAssigneeFilter(event.target.value)}><option value="all">ทุกคนในทีม</option>{employees.filter((employee) => employee.status === "active").map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>}
                <div className="work-due-filter" aria-label="กรองตามกำหนดส่ง">{([{ id: "all", label: "ทุกกำหนด" }, { id: "today", label: "วันนี้" }, { id: "overdue", label: "เกินกำหนด" }, { id: "week", label: "7 วัน" }] as const).map((filter) => <button key={filter.id} className={workDueFilter === filter.id ? "active" : ""} onClick={() => setWorkDueFilter(filter.id)}>{filter.label}</button>)}</div>
                <div className="work-kind-filter" aria-label="กรองประเภทงาน">{([{ id: "all", label: "ทุกประเภท" }, { id: "task", label: "งาน" }, { id: "request", label: "รีเควสต์" }, { id: "mission", label: "เควสต์" }] as const).map((filter) => <button key={filter.id} className={workFilter === filter.id ? "active" : ""} onClick={() => setWorkFilter(filter.id)}>{filter.label}</button>)}</div>
              </div>
              <div className="todo-result-line"><span>แสดง <strong>{visibleWorkItems.length}</strong> จาก {workItems.length} งาน</span>{(workSearch || workFilter !== "all" || workDueFilter !== "all" || workAssigneeFilter !== "all") && <button onClick={() => { setWorkSearch(""); setWorkFilter("all"); setWorkDueFilter("all"); setWorkAssigneeFilter("all"); }}>ล้างตัวกรอง</button>}</div>
              {workViewMode === "list" ? (
                <div className="todo-table" role="table" aria-label="รายการทูดูลิสของทีม">
                  <div className="todo-table-head" role="row"><span>สถานะและงาน</span><span>ผู้รับผิดชอบ</span><span>กำหนดส่ง</span><span>ความคืบหน้า</span><span>จัดการ</span></div>
                  {visibleWorkItems.map((item) => {
                    const project = projectsById.get(item.projectId);
                    const assignee = employeesById.get(item.assigneeEmployeeId);
                    const submissions = workSubmissionsByItem.get(item.id) ?? [];
                    const dueState = item.status === "done" ? "done" : item.dueDate < todayDate ? "overdue" : item.dueDate === todayDate ? "today" : "upcoming";
                    return (
                      <article className={`todo-table-row ${dueState}`} role="row" key={item.id}>
                        <span className="todo-table-task"><button className={`todo-table-check ${item.status}`} disabled={item.status === "done" || quickUpdatingWorkId === item.id} onClick={() => item.status === "todo" ? void startWorkItem(item) : isEmployeeUser ? openSubmissionCenter(item) : openWorkItemForm(item)} aria-label={`${workStatusLabel(item.status)}: ${item.title}`}>{item.status === "done" ? "✓" : item.status === "review" ? "⌕" : item.status === "in_progress" ? "→" : ""}</button><span><small><b className={`work-kind ${item.kind}`}>{workKindLabel(item.kind)}</b><i className={`work-priority ${item.priority}`}>{workPriorityLabel(item.priority)}</i>{project?.name ?? "ไม่ระบุโปรเจกต์"}</small><strong>{item.title}</strong><p>{item.description || "ยังไม่มีรายละเอียดเพิ่มเติม"}</p></span></span>
                        <span className="todo-table-owner">{assignee ? <EmployeeAvatar employee={assignee} profile={employeeProfilesById.get(assignee.id)} className="avatar-todo-row" /> : <i className="avatar-media avatar-todo-row">PP</i>}<span><strong>{assignee?.name ?? "ยังไม่ระบุ"}</strong><small>{assignee ? getRole(assignee.roleId).shortName : "—"}</small></span></span>
                        <span className={`todo-table-due ${dueState}`}><strong>{dueState === "overdue" ? "เกินกำหนด" : dueState === "today" ? "วันนี้" : dueState === "done" ? "ปิดงานแล้ว" : formatDueDate(item.dueDate)}</strong><small>{dueState === "overdue" || dueState === "today" ? formatDueDate(item.dueDate) : workStatusLabel(item.status)}</small></span>
                        <span className="todo-table-progress"><span><i><b style={{ width: `${item.progress}%` }} /></i><strong>{item.progress}%</strong></span><small>★ {formatMoney(item.points)} แต้ม · {submissions.length} หลักฐาน</small></span>
                        <span className="todo-table-actions"><button onClick={() => isEmployeeUser ? openSubmissionCenter(item) : openWorkItemForm(item)}>รายละเอียด</button>{item.status === "todo" ? <button className="primary" disabled={quickUpdatingWorkId === item.id} onClick={() => void startWorkItem(item)}>{quickUpdatingWorkId === item.id ? "กำลังเริ่ม" : "เริ่มงาน"}</button> : <button className="primary" onClick={() => openSubmissionCenter(item)}>{item.status === "review" && isEmployeeUser ? "รอตรวจ" : item.status === "review" ? "ตรวจงาน" : item.status === "done" ? "ดูผลงาน" : "ส่งงาน"}</button>}</span>
                      </article>
                    );
                  })}
                  {!visibleWorkItems.length && <div className="todo-table-empty"><span>⌕</span><strong>ไม่พบงานตามตัวกรอง</strong><p>ลองเปลี่ยนกำหนดส่ง ผู้รับผิดชอบ ประเภทงาน หรือคำค้นหา</p><button onClick={() => { setWorkSearch(""); setWorkFilter("all"); setWorkDueFilter("all"); setWorkAssigneeFilter("all"); }}>แสดงงานทั้งหมด</button></div>}
                </div>
              ) : (
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
                            const submissions = workSubmissionsByItem.get(item.id) ?? [];
                            const latestSubmission = submissions[0];
                            return (
                              <article key={item.id} className="work-ticket">
                                <button className="work-ticket-main" onClick={() => isEmployeeUser ? openSubmissionCenter(item) : openWorkItemForm(item)}><span className="work-ticket-meta"><b className={`work-kind ${item.kind}`}>{workKindLabel(item.kind)}</b><i className={`work-priority ${item.priority}`}>{workPriorityLabel(item.priority)}</i></span><strong>{item.title}</strong><small>{project?.name ?? "ไม่ระบุโปรเจกต์"}</small>{latestSubmission && <span className={`proof-status ${latestSubmission.status}`}>{workSubmissionStatusLabel(latestSubmission.status)} · {submissions.length} รายการ</span>}<span className="ticket-progress"><i><b style={{ width: `${item.progress}%` }} /></i><em>{item.progress}%</em></span><span className="work-ticket-foot">{assignee ? <EmployeeAvatar employee={assignee} profile={employeeProfilesById.get(assignee.id)} className="avatar-ticket" /> : <i className="avatar-media avatar-ticket">PP</i>}<small>{formatDueDate(item.dueDate)}</small><b>★ {item.points}</b></span></button>
                                <div className="work-ticket-actions"><button onClick={() => isEmployeeUser ? openSubmissionCenter(item) : openWorkItemForm(item)}>รายละเอียด</button><button className="proof" onClick={() => item.status === "todo" ? void startWorkItem(item) : openSubmissionCenter(item)}>{item.status === "todo" ? "เริ่มงาน" : submissions.length ? `หลักฐาน (${submissions.length})` : "ส่งหลักฐาน"}</button></div>
                              </article>
                            );
                          })}
                          {!items.length && <div className="kanban-empty">ไม่มีรายการ</div>}
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="points-operations-card">
              <div className="points-operations-heading">
                <div><p className="eyebrow">{isEmployeeUser ? "MY POINTS" : "POINTS OPERATIONS"}</p><h2>{isEmployeeUser ? "แต้มและประวัติของฉัน" : "ศูนย์จัดการแต้มพนักงาน"}</h2><p>{isEmployeeUser ? "ดูแต้มที่ได้รับ แต้มที่ใช้ และเหตุผลของแต่ละรายการได้อย่างโปร่งใส" : "ประมวลผลแต้มจากการประเมิน งาน การเข้า–ออกงาน และเหตุการณ์ด้านวินัย พร้อมประวัติผู้บันทึก"}</p></div>
                <div className="points-flow-summary"><span><small>แต้มที่ได้รับ</small><strong>+{formatMoney(pointsEarned)}</strong></span><span className="negative"><small>แต้มที่หัก/ใช้</small><strong>-{formatMoney(pointsDeducted)}</strong></span></div>
              </div>

              {!isEmployeeUser && <div className="monthly-points-panel">
                <div><span>◎</span><p><strong>แต้มประเมินประจำเดือน</strong><small>ใช้คะแนนรวม × 10 สูงสุด 1,000 แต้มต่อคน และบันทึกซ้ำเดือนเดิมไม่ได้</small></p></div>
                <label><span>เดือนที่ประมวลผล</span><input type="month" value={monthlyPointMonth} onChange={(event) => setMonthlyPointMonth(event.target.value)} /></label>
                <span className="monthly-run-status"><strong>{monthlyPointRecipients}</strong><small>คนได้รับแต้มแล้ว</small></span>
                <button disabled={isSaving} onClick={() => void runMonthlyPointCycle()}>{isSaving ? "กำลังประมวลผล..." : "ประมวลผลจากผลประเมิน"}</button>
              </div>}

              {!isEmployeeUser && <div className="point-rules-section">
                <div className="point-rules-heading"><div><p className="eyebrow">POINT RULES</p><h3>กติกาการได้และเสียแต้ม</h3></div><small>ค่าตั้งต้นขององค์กร</small></div>
                <div className="point-rule-grid">
                  {(Object.entries(pointEventRules) as [PointEventType, (typeof pointEventRules)[PointEventType]][]).map(([eventType, rule]) => (
                    <article key={eventType} className={rule.points === null || rule.points >= 0 ? "positive" : "negative"}>
                      <span>{rule.points === null ? "×10" : `${rule.points > 0 ? "+" : ""}${formatMoney(rule.points)}`}</span>
                      <div><strong>{rule.label}</strong><p>{rule.description}</p></div>
                    </article>
                  ))}
                </div>
              </div>}

              <div className="point-admin-grid">
                {!isEmployeeUser && <form className="point-event-form" onSubmit={recordPointEvent}>
                  <div><p className="eyebrow">NEW POINT EVENT</p><h3>บันทึกแต้ม หรือบทลงโทษ</h3><small>รายการหักแต้มต้องมีเหตุผลเพื่อให้ตรวจสอบย้อนหลังได้</small></div>
                  <div className={`point-event-preview ${selectedPointEventRule.points !== null && selectedPointEventRule.points < 0 ? "negative" : "positive"}`}><span>{selectedPointEventRule.points === null ? "—" : `${selectedPointEventRule.points >= 0 ? "+" : ""}${selectedPointEventRule.points}`}</span><p><strong>{selectedPointEventRule.label}</strong><small>{selectedPointEventRule.description}</small></p></div>
                  <div className="point-event-form-grid">
                    <label><span>พนักงาน</span><select required value={pointEventForm.employeeId} onChange={(event) => setPointEventForm((form) => ({ ...form, employeeId: event.target.value }))}>{employees.filter((employee) => employee.status === "active").map((employee) => <option key={employee.id} value={employee.id}>{employee.name} · {getRole(employee.roleId).shortName}</option>)}</select></label>
                    <label><span>ประเภทเหตุการณ์</span><select value={pointEventForm.eventType} onChange={(event) => setPointEventForm((form) => ({ ...form, eventType: event.target.value as PointEventType }))}>{manualPointEventTypes.map((eventType) => <option key={eventType} value={eventType}>{pointEventRules[eventType].label} ({(pointEventRules[eventType].points ?? 0) > 0 ? "+" : ""}{pointEventRules[eventType].points ?? 0})</option>)}</select></label>
                    <label><span>วันที่เกิดเหตุการณ์</span><input required type="date" value={pointEventForm.eventDate} onChange={(event) => setPointEventForm((form) => ({ ...form, eventDate: event.target.value }))} /></label>
                    <label><span>ลิงก์หลักฐาน (ถ้ามี)</span><input type="url" value={pointEventForm.evidenceUrl} onChange={(event) => setPointEventForm((form) => ({ ...form, evidenceUrl: event.target.value }))} placeholder="https://..." /></label>
                    <label className="wide"><span>เหตุผล / รายละเอียด</span><textarea required value={pointEventForm.note} onChange={(event) => setPointEventForm((form) => ({ ...form, note: event.target.value }))} placeholder="ระบุข้อเท็จจริง ผลกระทบ และเอกสารอ้างอิง โดยหลีกเลี่ยงข้อมูลส่วนบุคคลที่ไม่จำเป็น" /></label>
                  </div>
                  <button className={selectedPointEventRule.points !== null && selectedPointEventRule.points < 0 ? "penalty" : ""} disabled={isSaving}>{isSaving ? "กำลังบันทึก..." : selectedPointEventRule.points !== null && selectedPointEventRule.points < 0 ? `ยืนยันหัก ${Math.abs(selectedPointEventRule.points)} แต้ม` : `บันทึก ${selectedPointEventRule.points ?? 0} แต้ม`}</button>
                </form>}

                <section className="point-ledger-panel">
                  <div className="point-ledger-heading"><div><p className="eyebrow">AUDIT LEDGER</p><h3>ประวัติแต้มล่าสุด</h3></div>{!isEmployeeUser && <label><span className="sr-only">กรองประวัติแต้มตามพนักงาน</span><select value={pointHistoryEmployeeId} onChange={(event) => setPointHistoryEmployeeId(event.target.value)}><option value="all">พนักงานทั้งหมด</option>{employees.filter((employee) => employee.status === "active").map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>}</div>
                  <div className="point-ledger-list">
                    {visiblePointLedger.slice(0, 12).map((entry) => {
                      const employee = employeesById.get(entry.employeeId);
                      return <article key={entry.id}><span className={entry.points >= 0 ? "positive" : "negative"}>{entry.points >= 0 ? "+" : ""}{formatMoney(entry.points)}</span><p><strong>{entry.note}</strong><small>{employee?.name ?? "พนักงาน"} · {formatUpdatedAt(entry.createdAt)}</small></p><b>{entry.sourceType === "evaluation" ? "ประเมิน" : entry.sourceType === "attendance" ? "เวลาเข้างาน" : entry.sourceType === "deadline" ? "กำหนดส่ง" : entry.sourceType === "quality" ? "คุณภาพงาน" : entry.sourceType === "discipline" ? "วินัย" : entry.sourceType === "redemption" ? "แลกรางวัล" : entry.sourceType === "quest" || entry.sourceType === "mission" ? "เควสต์" : "ผลงาน"}</b></article>;
                    })}
                    {!visiblePointLedger.length && <div className="point-ledger-empty"><span>★</span><strong>ยังไม่มีประวัติแต้ม</strong><p>บันทึกเหตุการณ์หรือประมวลผลแต้มรายเดือนเพื่อเริ่มต้น</p></div>}
                  </div>
                </section>
              </div>
              {!isEmployeeUser && <div className="points-policy-note"><span>!</span><p><strong>บทลงโทษต้องเป็นธรรมและตรวจสอบได้</strong> การลาที่อนุมัติแล้วไม่หักแต้ม ส่วนการมาสาย ขาดงาน งานผิดพลาด ใบเตือน และการผิดระเบียบควรบันทึกหลังตรวจสอบข้อเท็จจริง เปิดโอกาสให้พนักงานชี้แจง และใช้ตามนโยบายบริษัท</p></div>}
            </section>

            <section className="reward-center-card">
              <div className="reward-center-heading"><div><p className="eyebrow">REWARD STORE</p><h2>สะสมแต้ม แลกกิฟต์วอเชอร์และรางวัล</h2><p>มีตั้งแต่คูปองเงินสด 100 บาท ราคา 1,000 แต้ม ไปจนถึง iPhone 18 ราคา 500,000 แต้ม</p></div><span><strong>{formatMoney(totalPoints)}</strong> แต้มในระบบ</span></div>
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

      <footer><span>PEOPLE PULSE // 3000</span><p>NEURAL WORKFORCE CORE · SMART TO-DO · KPI · SKILL MATRIX · REWARD GRID</p></footer>

      {showProfileEditor && profileEmployee && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowProfileEditor(false)}>
          <form className="employee-profile-modal" onSubmit={saveEmployeeProfile} role="dialog" aria-modal="true" aria-labelledby="employee-profile-title">
            <div className="profile-editor-hero"><div className="profile-identity"><EmployeeAvatar employee={profileEmployee} profile={profileRecord} className="avatar-modal" /><div><p className="eyebrow">EMPLOYEE PROFILE</p><h2 id="employee-profile-title">ข้อมูลของ {profileEmployee.name}</h2><small>{getRole(profileEmployee.roleId).name} · เก็บเฉพาะข้อมูลที่จำเป็นต่อการจ้างงาน</small></div></div><button type="button" className="modal-close dark" onClick={() => setShowProfileEditor(false)} aria-label="ปิดหน้าต่าง">×</button></div>
            <div className="profile-editor-body">
              <div className="form-grid profile-editor-grid">
                <label><span>อีเมลส่วนตัว</span><input type="email" value={profileForm.personalEmail} onChange={(event) => setProfileForm((form) => ({ ...form, personalEmail: event.target.value }))} placeholder="name@example.com" /></label>
                <label><span>เบอร์โทรศัพท์</span><input value={profileForm.phone} onChange={(event) => setProfileForm((form) => ({ ...form, phone: event.target.value }))} placeholder="08X-XXX-XXXX" /></label>
                <label><span>วันเกิด</span><input type="date" value={profileForm.birthDate} onChange={(event) => setProfileForm((form) => ({ ...form, birthDate: event.target.value }))} /></label>
                <label><span>เลขบัตรประชาชน 4 หลักท้าย</span><input inputMode="numeric" pattern="[0-9]{0,4}" maxLength={4} value={profileForm.nationalIdLast4} onChange={(event) => setProfileForm((form) => ({ ...form, nationalIdLast4: event.target.value.replace(/\D/g, "").slice(0, 4) }))} placeholder="XXXX" /></label>
                <label className="wide"><span>ที่อยู่ปัจจุบัน</span><textarea value={profileForm.address} onChange={(event) => setProfileForm((form) => ({ ...form, address: event.target.value }))} placeholder="ที่อยู่สำหรับติดต่อและจัดส่งเอกสาร" /></label>
                <label><span>ผู้ติดต่อฉุกเฉิน</span><input value={profileForm.emergencyName} onChange={(event) => setProfileForm((form) => ({ ...form, emergencyName: event.target.value }))} /></label>
                <label><span>เบอร์โทรฉุกเฉิน</span><input value={profileForm.emergencyPhone} onChange={(event) => setProfileForm((form) => ({ ...form, emergencyPhone: event.target.value }))} /></label>
                <label><span>วันเริ่มงาน</span><input required type="date" value={profileForm.startDate} onChange={(event) => setProfileForm((form) => ({ ...form, startDate: event.target.value }))} /></label>
                <label><span>ประเภทการจ้าง</span><select value={profileForm.employmentType} onChange={(event) => setProfileForm((form) => ({ ...form, employmentType: event.target.value as EmployeeProfileRecord["employmentType"] }))}><option value="permanent">พนักงานประจำ</option><option value="contract">พนักงานสัญญาจ้าง</option><option value="probation">ทดลองงาน</option><option value="intern">ฝึกงาน</option></select></label>
                <label className="wide"><span>การศึกษาสูงสุด</span><input value={profileForm.education} onChange={(event) => setProfileForm((form) => ({ ...form, education: event.target.value }))} placeholder="วุฒิการศึกษา สาขา และสถาบัน" /></label>
                <label><span>ประสบการณ์รวม (ปี)</span><input type="number" min="0" max="60" value={profileForm.experienceYears} onChange={(event) => setProfileForm((form) => ({ ...form, experienceYears: Number(event.target.value) }))} /></label>
                <label><span>ช่องทางสมัครงาน</span><input value={profileForm.applicationSource} onChange={(event) => setProfileForm((form) => ({ ...form, applicationSource: event.target.value }))} placeholder="เช่น Career Page, Referral" /></label>
              </div>
              <div className="privacy-note"><span>⌁</span><p>ข้อมูลส่วนบุคคลและเอกสารพนักงานควรให้เฉพาะผู้มีหน้าที่ด้าน HR เข้าถึง และใช้ตามวัตถุประสงค์การจ้างงานเท่านั้น</p></div>
            </div>
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowProfileEditor(false)}>ยกเลิก</button><button className="primary-button" disabled={isSaving}>{isSaving ? "กำลังบันทึก..." : "บันทึกโปรไฟล์"}</button></div>
          </form>
        </div>
      )}

      {showContractForm && profileEmployee && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowContractForm(false)}>
          <form className="contract-form-modal" onSubmit={createEmploymentContract} role="dialog" aria-modal="true" aria-labelledby="contract-form-title">
            <div className="contract-form-hero"><div><p className="eyebrow">NEW EMPLOYMENT CONTRACT</p><h2 id="contract-form-title">สร้างสัญญาของ {profileEmployee.name}</h2><p>ผูกไฟล์ต้นฉบับ กำหนดวันที่มีผล และส่งเข้าสู่ขั้นตอนลงนาม</p></div><button type="button" className="modal-close dark" onClick={() => setShowContractForm(false)} aria-label="ปิดหน้าต่าง">×</button></div>
            <div className="contract-form-body">
              <div className="form-grid contract-form-grid">
                <label className="wide"><span>ชื่อสัญญา</span><input required value={contractForm.title} onChange={(event) => setContractForm((form) => ({ ...form, title: event.target.value }))} /></label>
                <label><span>เวอร์ชัน</span><input required value={contractForm.version} onChange={(event) => setContractForm((form) => ({ ...form, version: event.target.value }))} /></label>
                <label><span>สถานะเริ่มต้น</span><select value={contractForm.status} onChange={(event) => setContractForm((form) => ({ ...form, status: event.target.value as "draft" | "sent" }))}><option value="sent">ส่งให้ลงนาม</option><option value="draft">เก็บเป็นฉบับร่าง</option></select></label>
                <label><span>วันที่มีผล</span><input required type="date" value={contractForm.effectiveDate} onChange={(event) => setContractForm((form) => ({ ...form, effectiveDate: event.target.value }))} /></label>
                <label><span>วันสิ้นสุด (ถ้ามี)</span><input type="date" value={contractForm.expiryDate} onChange={(event) => setContractForm((form) => ({ ...form, expiryDate: event.target.value }))} /></label>
                <label className="wide"><span>ไฟล์ต้นฉบับสัญญา</span><select required value={contractForm.documentId} onChange={(event) => setContractForm((form) => ({ ...form, documentId: event.target.value }))}><option value="">เลือกไฟล์สัญญา</option>{profileContractDocuments.map((document) => <option key={document.id} value={document.id}>{document.fileName} · อัปโหลด {formatUpdatedAt(document.uploadedAt)}</option>)}</select></label>
              </div>
              {!profileContractDocuments.length && <div className="contract-file-warning"><span>!</span><p><strong>ยังไม่มีไฟล์สัญญา</strong> ปิดหน้าต่างนี้แล้วอัปโหลดไฟล์สัญญาในส่วน “สัญญาจ้างและการลงนาม” ก่อน</p></div>}
            </div>
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowContractForm(false)}>ยกเลิก</button><button className="primary-button" disabled={isSaving || !contractForm.documentId}>{isSaving ? "กำลังสร้าง..." : contractForm.status === "sent" ? "สร้างและส่งให้ลงนาม" : "บันทึกฉบับร่าง"}</button></div>
          </form>
        </div>
      )}

      {contractToSign && profileEmployee && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setContractToSign(null)}>
          <form className="signature-modal" onSubmit={signEmploymentContract} role="dialog" aria-modal="true" aria-labelledby="signature-title">
            <div className="signature-hero"><span>✎</span><div><p className="eyebrow">ELECTRONIC SIGNATURE</p><h2 id="signature-title">ลงนามสัญญาอิเล็กทรอนิกส์</h2><p>{contractToSign.title} · เวอร์ชัน {contractToSign.version}</p></div><button type="button" className="modal-close dark" onClick={() => setContractToSign(null)} aria-label="ปิดหน้าต่าง">×</button></div>
            <div className="signature-body">
              <div className="contract-sign-summary"><span><small>ผู้ลงนาม</small><strong>{profileEmployee.name}</strong></span><span><small>วันที่มีผล</small><strong>{new Date(`${contractToSign.effectiveDate}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })}</strong></span></div>
              <label className="signature-name-field"><span>พิมพ์ชื่อ–นามสกุลให้ตรงกับโปรไฟล์</span><input required value={signatureForm.signedName} onChange={(event) => setSignatureForm((form) => ({ ...form, signedName: event.target.value }))} /><em>{signatureForm.signedName || "ชื่อผู้ลงนาม"}</em></label>
              <label className="signature-consent"><input type="checkbox" checked={signatureForm.consent} onChange={(event) => setSignatureForm((form) => ({ ...form, consent: event.target.checked }))} /><span><strong>ยืนยันการลงนาม</strong> ข้าพเจ้าได้อ่าน เข้าใจ และยอมรับข้อกำหนดในสัญญาจ้างฉบับนี้ และยืนยันใช้ชื่อที่พิมพ์เป็นลายเซ็นอิเล็กทรอนิกส์</span></label>
              <div className="signature-audit"><span>⌁</span><p>ระบบจะบันทึกบัญชีผู้ใช้งาน ชื่อผู้ลงนาม คำยินยอม และวันเวลาที่ลงนามไว้ในประวัติสัญญา</p></div>
            </div>
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setContractToSign(null)}>ยกเลิก</button><button className="primary-button" disabled={isSaving || !signatureForm.consent || signatureForm.signedName.trim() !== profileEmployee.name.trim()}>{isSaving ? "กำลังลงนาม..." : "ยืนยันและลงนามสัญญา"}</button></div>
          </form>
        </div>
      )}

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

      {submissionWorkItem && submissionAssignee && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSubmissionWorkItem(null)}>
          <section className="work-submission-modal" role="dialog" aria-modal="true" aria-labelledby="work-submission-title">
            <div className="submission-hero">
              <EmployeeAvatar employee={submissionAssignee} profile={employeeProfilesById.get(submissionAssignee.id)} className="avatar-submission" />
              <div><p className="eyebrow">WORK PROOF CENTER</p><h2 id="work-submission-title">ส่งหลักฐานงาน</h2><p>{submissionWorkItem.title} · {submissionAssignee.name}</p></div>
              <button className="modal-close dark" onClick={() => setSubmissionWorkItem(null)} aria-label="ปิดหน้าต่าง">×</button>
            </div>
            <div className="submission-body">
              <aside className="proof-guide">
                <p className="eyebrow">หลักฐานแนะนำตามตำแหน่ง</p>
                <h3>{activeProofGuide.headline}</h3>
                <ul>{activeProofGuide.examples.map((example) => <li key={example}>{example}</li>)}</ul>
                <div><span>i</span><p>ลิงก์ต้องเปิดให้ผู้ตรวจเข้าถึงได้ และไม่ควรมีข้อมูลลูกค้าหรือข้อมูลส่วนบุคคลที่ไม่จำเป็น</p></div>
              </aside>
              <div className="submission-workspace">
                <section className="submission-history">
                  <div className="submission-section-heading"><div><p className="eyebrow">SUBMISSION HISTORY</p><h3>หลักฐานที่ส่งแล้ว</h3></div><span>{activeWorkSubmissions.length}</span></div>
                  <div className="submission-list">
                    {activeWorkSubmissions.map((submission) => (
                      <article key={submission.id} className={submission.status}>
                        <div className="submission-list-top"><b>{submissionTypeLabels[submission.submissionType]}</b><span>{workSubmissionStatusLabel(submission.status)}</span></div>
                        <strong>{submission.title}</strong>
                        {submission.note && <p>{submission.note}</p>}
                        <div className="submission-links">{submission.linkUrl && <a href={submission.linkUrl} target="_blank" rel="noreferrer">เปิดลิงก์ผลงาน ↗</a>}{submission.storageKey && <a href={`/api/work-submissions?id=${encodeURIComponent(submission.id)}`}>ดาวน์โหลด {submission.fileName}</a>}</div>
                        <small>ส่งโดย {submission.submittedBy} · {formatUpdatedAt(submission.submittedAt)}</small>
                        {submission.reviewerNote && <em>หมายเหตุผู้ตรวจ: {submission.reviewerNote}</em>}
                        {submission.status === "submitted" && permissions.canReviewWork && <div className="submission-review"><input value={reviewerNote} onChange={(event) => setReviewerNote(event.target.value)} placeholder="หมายเหตุจากผู้ตรวจ (ถ้ามี)" /><button disabled={isSaving} onClick={() => void reviewWorkProof(submission, "revision")}>ส่งกลับแก้ไข</button><button className="approve" disabled={isSaving} onClick={() => void reviewWorkProof(submission, "approved")}>อนุมัติและปิดงาน ✓</button></div>}
                      </article>
                    ))}
                    {!activeWorkSubmissions.length && <div className="submission-empty"><span>↗</span><strong>ยังไม่มีหลักฐานงาน</strong><p>เพิ่มลิงก์หรือแนบไฟล์ด้วยแบบฟอร์มด้านล่าง</p></div>}
                  </div>
                </section>
                <form className="submission-form" onSubmit={submitWorkProof}>
                  <div className="submission-section-heading"><div><p className="eyebrow">NEW SUBMISSION</p><h3>เพิ่มหลักฐาน</h3></div><span>รอตรวจ</span></div>
                  <div className="submission-form-grid">
                    <label><span>ประเภทหลักฐาน</span><select value={submissionForm.submissionType} onChange={(event) => setSubmissionForm((form) => ({ ...form, submissionType: event.target.value as WorkSubmissionRecord["submissionType"] }))}>{(Object.entries(submissionTypeLabels) as [WorkSubmissionRecord["submissionType"], string][]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                    <label><span>ชื่อผลงาน / เวอร์ชัน</span><input required value={submissionForm.title} onChange={(event) => setSubmissionForm((form) => ({ ...form, title: event.target.value }))} placeholder="เช่น Final V3 / Campaign Live" /></label>
                    <label className="wide"><span>ลิงก์ผลงาน</span><input type="url" value={submissionForm.linkUrl} onChange={(event) => setSubmissionForm((form) => ({ ...form, linkUrl: event.target.value }))} placeholder="https://drive.google.com/... หรือ URL ผลงาน" /></label>
                    <label className="wide submission-file"><span>ไฟล์แนบ (ถ้ามี)</span><input type="file" accept=".pdf,.doc,.docx,.xlsx,.csv,.txt,.jpg,.jpeg,.png,.webp,.mp4,.zip" onChange={(event) => setSubmissionFile(event.target.files?.[0] ?? null)} /><small>{submissionFile ? `${submissionFile.name} · ${formatFileSize(submissionFile.size)}` : "ไม่เกิน 25 MB — วิดีโอขนาดใหญ่ควรส่งเป็นลิงก์ Drive หรือ YouTube"}</small></label>
                    <label className="wide"><span>สรุปสิ่งที่ส่งมอบ</span><textarea value={submissionForm.note} onChange={(event) => setSubmissionForm((form) => ({ ...form, note: event.target.value }))} placeholder="อธิบายผลลัพธ์ จุดที่ต้องการให้ตรวจ และรหัสผ่านหากมี" /></label>
                  </div>
                  <div className="submission-form-actions"><span>ต้องมีลิงก์หรือไฟล์อย่างน้อย 1 รายการ</span><button disabled={isSaving || (!submissionForm.linkUrl.trim() && !submissionFile)}>{isSaving ? "กำลังส่ง..." : "ส่งหลักฐานเพื่อตรวจ"}</button></div>
                </form>
              </div>
            </div>
          </section>
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
                <EmployeeAvatar employee={skillProfileEmployee} profile={employeeProfilesById.get(skillProfileEmployee.id)} className="avatar-modal" />
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
              <div className="profile-identity"><EmployeeAvatar employee={hrEmployee} profile={employeeProfilesById.get(hrEmployee.id)} className="avatar-modal" /><div><p className="eyebrow">WORKFORCE PLAN</p><h2 id="hr-plan-title">จัดการแผนของ {hrEmployee.name}</h2><small>{hrEmployeeInsight.role.name} · {hrEmployeeInsight.role.department}</small></div></div>
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
              <div className="modal-person"><EmployeeAvatar employee={selectedEmployee} profile={employeeProfilesById.get(selectedEmployee.id)} className="avatar-modal" /><div><p className="eyebrow">แบบประเมินรายบุคคล</p><h2 id="evaluation-title">{selectedEmployee.name}</h2><small>{selectedRole.name} · {period}</small></div></div>
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

function EmployeeAvatar({ employee, profile, className = "avatar-md" }: { employee: EmployeeRecord; profile?: EmployeeProfileRecord | null; className?: string }) {
  const imageVersion = profile?.profileImageUpdatedAt ? encodeURIComponent(profile.profileImageUpdatedAt) : "1";
  return (
    <i className={`avatar-media ${className}`} aria-hidden="true">
      {profile?.profileImageKey
        // The authenticated R2 route serves private employee images and is not compatible with public image optimization.
        ? <img src={`/api/profile-image?employeeId=${encodeURIComponent(employee.id)}&v=${imageVersion}`} alt="" loading="lazy" /> // eslint-disable-line @next/next/no-img-element
        : employee.initials || makeInitials(employee.name)}
    </i>
  );
}

function EmployeePowerCard({ profile, employeeProfile, rank, onCompare }: { profile: EmployeePowerProfile; employeeProfile?: EmployeeProfileRecord | null; rank: number; onCompare: () => void }) {
  const { employee, role, overall, potential, stats, tier } = profile;
  return (
    <article className={`employee-power-card ${tier.id}`}>
      <div className="power-card-field" aria-hidden="true"><i /><i /></div>
      <header>
        <div className="power-card-rating"><strong>{overall ?? "—"}</strong><span>OVR</span><small>{tier.label}</small></div>
        <div className="power-card-rank"><span>#{String(rank).padStart(2, "0")}</span><small>LIVE CARD</small></div>
      </header>
      <div className="power-card-person">
        <EmployeeAvatar employee={employee} profile={employeeProfile} className="avatar-power" />
        <div><small>{role.department}</small><h3>{employee.name}</h3><p>{role.name}</p></div>
      </div>
      {overall === null ? (
        <div className="power-card-empty"><strong>รอประเมินค่าพลัง</strong><p>บันทึก KPI และสกิลเพื่อสร้างการ์ดใบแรก</p></div>
      ) : (
        <div className="power-stat-grid">
          {powerStats.map((stat) => <span key={stat.id}><b>{stats[stat.id]}</b><small>{stat.code}</small></span>)}
        </div>
      )}
      <footer>
        <span><small>ศักยภาพ</small><strong>{potential ?? "—"} POT</strong></span>
        <button onClick={onCompare}>เทียบการ์ดนี้ <i>→</i></button>
      </footer>
    </article>
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
