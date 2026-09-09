"use client";

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { Office3DPerson } from "./office-3d";
import AiAssistant, { type PeopleAiActionId, type PeopleAiContext } from "./ai-assistant";
import AiRobotMascot from "./ai-robot-mascot";
import { AuthScreen, ChangePasswordDialog } from "./auth-ui";
import { MAX_NEW_PASSWORD_LENGTH, MIN_GENERAL_PASSWORD_LENGTH, passwordMeetsMinimum } from "../lib/password-policy.js";
import {
  type ApplicationDocumentRecord,
  type AttendanceRecord,
  type EmployeeRecord,
  type EmployeeProfileRecord,
  type EmployeeRecognitionDto,
  type EmployeeSelfAssessmentRecord,
  type EmploymentContractRecord,
  type EmployeeWarningDto,
  type EvaluationRecord,
  type HrProfileRecord,
  type NotificationReadRecord,
  type OrganizationDocumentDto,
  type PointEventRecord,
  type PointEventType,
  type PointLedgerRecord,
  type PointPolicyRules,
  type ProjectRecord,
  type QuestCompletionRecord,
  type QuestRecord,
  type RewardRecord,
  type RewardRedemptionRecord,
  type SkillCategoryId,
  type SkillAchievementRecord,
  type TalentActionRecord,
  type UserAccountRecord,
  type WorkItemRecord,
  type WorkSubmissionRecord,
  aiSkillLevelGuide,
  calculateSkillScore,
  defaultPointPolicyRules,
  getRole,
  makeInitials,
  monthlyEvaluationPoints,
  periods,
  resolvePointPolicyRules,
  roleSalaryBands,
  roles,
  scoreStatus,
  skillCategories,
  skillAllowanceFor,
  workPointValue,
} from "../lib/kpi-data";

const Office3D = lazy(() => import("./office-3d"));
const AI_MASCOT_VISIBILITY_STORAGE_KEY = "people-pulse-ai-mascot-visible:v1";

type View = "overview" | "employees" | "profiles" | "organizationDocs" | "skills" | "power" | "peopleOps" | "hr" | "portfolio" | "work" | "office" | "access";

type PublicUserAccount = Omit<UserAccountRecord, "authUserId"> & {
  loginId?: string;
  hasPassword?: boolean;
  mustChangePassword?: boolean;
  lockedUntil?: string | null;
};

type CurrentUser = PublicUserAccount & { authenticatedName?: string };

type AuthGateState = {
  mode: "login" | "change";
  displayName?: string;
  loginId?: string;
};

type UserAccountFormState = {
  accountId: string;
  loginId: string;
  displayName: string;
  nickname: string;
  role: UserAccountRecord["role"];
  employeeId: string;
  departmentId: string;
  status: UserAccountRecord["status"];
  temporaryPassword: string;
};

type EmployeeRegistrationRequest = {
  id: string;
  email: string;
  loginId: string;
  firstName: string;
  lastName: string;
  nickname: string;
  status: "pending" | "approved" | "rejected";
  submittedAt: string;
  reviewedByName: string;
  reviewedAt: string | null;
  rejectionReason: string;
  approvedUserAccountId: string | null;
  updatedAt: string;
};

type AccessPanel = "users" | "requests" | "rights";
type DossierStatusFilter = "all" | "active" | "resigned" | "archived";

type CredentialResult = {
  displayName: string;
  loginId: string;
  temporaryPassword: string;
};

type AccountCredentialState = {
  id: "inactive" | "locked" | "no-password" | "must-change" | "ready" | "pending";
  label: string;
  detail: string;
};

type AppPermissions = {
  canManageAccounts: boolean;
  canManagePeople: boolean;
  canManageWork: boolean;
  canManageQuests: boolean;
  canAssignTeamWork: boolean;
  canReviewWork: boolean;
  canViewTeam: boolean;
  canViewTeamOverview: boolean;
  canViewOwnGrowth: boolean;
  canViewOwnRewards: boolean;
  canManageOrganizationDocuments: boolean;
  canManageEmployeeWarnings: boolean;
  canManageEmployeeRecognitions: boolean;
};
type EmployeeTeamOverview = { employees: EmployeeRecord[]; evaluations: EvaluationRecord[]; workItems: WorkItemRecord[] };

type EmployeePreview = {
  employeeId: string;
  readOnly: true;
  launchedBy: string;
};

type LaunchReadiness = {
  demoDataEnabled: boolean;
  demoEmployeeCount: number;
  templatePolicyCount: number;
  activeEmployeeCount: number;
  activeLinkedAccountCount: number;
  loggedInEmployeeAccountCount: number;
  publishedPolicyCount: number;
  realDocumentCount: number;
  submittedWorkCount: number;
};

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

type WorkDueFilter = "all" | "today" | "overdue" | "week" | "review" | "done";

type EmployeeTaskScope = "assigned" | "created";

type WorkSection = "quests" | "tasks" | "projects" | "points" | "rewards";

type QuestTypeFilter = "all" | QuestRecord["type"];
type QuestStatusFilter = "current" | "all" | "archived";

type QuestFormState = Pick<QuestRecord, "type" | "title" | "description" | "status" | "progress" | "pointsReward" | "rewardId" | "isFeatured" | "startDate" | "endDate" | "targetEmployeeIds" | "targetDepartmentIds">;

type QuestCompletionFormState = {
  employeeId: string;
  completionDate: string;
  evidenceUrl: string;
  note: string;
};

type PointPanel = "overview" | "policies" | "adjust" | "history";

type RewardFormState = Pick<RewardRecord, "title" | "description" | "category" | "icon" | "costPoints" | "stock" | "isActive">;

type OrganizationPolicyStatus = "draft" | "published";
type OrganizationPolicyCategory = "work_rules" | "points_rewards" | "ai_data" | "other";

type OrganizationPolicyRecord = {
  id: string;
  code?: string;
  title: string;
  summary: string;
  content: string;
  category?: OrganizationPolicyCategory;
  status: OrganizationPolicyStatus;
  version: number;
  effectiveDate: string;
  effectiveTo?: string | null;
  acknowledgementRequired: boolean;
  scopeType?: "all" | "department" | "role" | "employment_type";
  rules?: unknown;
  publishedAt: string;
  publishedBy: string;
  updatedAt: string;
  updatedBy: string;
};

type PolicyAcknowledgementRecord = {
  id: string;
  policyId: string;
  employeeId: string;
  policyVersion: number;
  acknowledgedAt: string;
};

type OrganizationPolicyDraft = Pick<OrganizationPolicyRecord, "title" | "summary" | "content" | "effectiveDate" | "acknowledgementRequired"> & { category: OrganizationPolicyCategory };

type OrganizationDocumentCategory = "lease" | "employment" | "hr" | "legal" | "finance" | "operations" | "other";
type OrganizationDocumentStatus = "draft" | "active" | "expired" | "archived";
type OrganizationDocumentRecord = OrganizationDocumentDto;

type EmployeeWarningLevel = "first" | "second" | "final";
type EmployeeWarningStatus = "draft" | "issued" | "acknowledged" | "resolved" | "withdrawn";
type EmployeeWarningRecord = EmployeeWarningDto;

type EmployeeRecognitionType = "certificate" | "award" | "honor" | "training" | "license" | "other";
type EmployeeRecognitionStatus = "active" | "expired" | "revoked";
type EmployeeRecognitionRecord = EmployeeRecognitionDto;

type OrganizationDocumentTab = "library" | "templates";

const organizationDocumentCategoryMeta: Record<OrganizationDocumentCategory, { label: string; icon: string }> = {
  lease: { label: "สัญญาเช่า", icon: "⌂" },
  employment: { label: "การจ้างงาน", icon: "✎" },
  hr: { label: "เอกสาร HR", icon: "HR" },
  legal: { label: "กฎหมาย", icon: "§" },
  finance: { label: "การเงิน", icon: "฿" },
  operations: { label: "การดำเนินงาน", icon: "▤" },
  other: { label: "อื่น ๆ", icon: "◇" },
};

const organizationDocumentStatusLabels: Record<OrganizationDocumentStatus, string> = {
  draft: "ฉบับร่าง",
  active: "ใช้งานอยู่",
  expired: "หมดอายุ",
  archived: "เก็บถาวร",
};

const organizationDocumentAllowedStatuses: Record<OrganizationDocumentStatus, OrganizationDocumentStatus[]> = {
  draft: ["active", "archived"],
  active: ["expired", "archived"],
  expired: ["active", "archived"],
  archived: [],
};

const employeeWarningLevelLabels: Record<EmployeeWarningLevel, string> = {
  first: "ครั้งที่ 1",
  second: "ครั้งที่ 2",
  final: "ครั้งสุดท้าย",
};

const employeeWarningStatusLabels: Record<EmployeeWarningStatus, string> = {
  draft: "ฉบับร่าง",
  issued: "ออกเอกสารแล้ว",
  acknowledged: "HR บันทึกรับทราบ",
  resolved: "ปิดเรื่องแล้ว",
  withdrawn: "เพิกถอนแล้ว",
};

const employeeRecognitionTypeLabels: Record<EmployeeRecognitionType, string> = {
  certificate: "เกียรติบัตร",
  award: "รางวัล",
  honor: "เกียรติยศ",
  training: "ใบรับรองการอบรม",
  license: "ใบอนุญาตวิชาชีพ",
  other: "อื่น ๆ",
};

const employeeRecognitionStatusLabels: Record<EmployeeRecognitionStatus, string> = {
  active: "ใช้งานอยู่",
  expired: "หมดอายุ",
  revoked: "เพิกถอนแล้ว",
};

const organizationDocumentTemplates: { id: string; title: string; category: OrganizationDocumentCategory; description: string; href: string }[] = [
  { id: "office-lease", title: "แม่แบบสัญญาเช่าสำนักงาน / พื้นที่", category: "lease", description: "โครงสร้างสัญญาเช่าสำหรับกรอกคู่สัญญา พื้นที่ ระยะเวลา และค่าใช้จ่าย", href: "/templates/office-lease-agreement-template.docx" },
  { id: "employment-agreement", title: "แม่แบบสัญญาจ้างพนักงาน", category: "employment", description: "แบบร่างเงื่อนไขการจ้าง หน้าที่ ค่าตอบแทน และการลงนาม", href: "/templates/employment-agreement-template.docx" },
  { id: "confidentiality-nda", title: "แม่แบบสัญญารักษาความลับ (NDA)", category: "legal", description: "ใช้เป็นจุดเริ่มต้นสำหรับกำหนดข้อมูลลับและหน้าที่รักษาความลับ", href: "/templates/confidentiality-nda-template.docx" },
  { id: "employee-warning", title: "แม่แบบหนังสือเตือนพนักงาน", category: "hr", description: "แบบร่างบันทึกข้อเท็จจริง สิ่งที่ต้องปรับปรุง และวันติดตามผล", href: "/templates/employee-warning-letter-template.docx" },
  { id: "asset-handover", title: "แม่แบบรับ–คืนทรัพย์สินบริษัท", category: "operations", description: "บันทึกรายการอุปกรณ์ ผู้รับมอบ สภาพ และการส่งคืน", href: "/templates/asset-handover-return-template.docx" },
];

type NotificationKind = "quest" | "deadline" | "review" | "reward";

type NotificationFilter = "all" | "unread" | "quest";

type AppNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  message: string;
  createdAt: string;
  questId?: string;
  workItemId?: string;
  dueFilter?: WorkDueFilter;
  actionLabel: string;
};

const notificationKindMeta: Record<NotificationKind, { label: string; icon: string }> = {
  quest: { label: "เควส", icon: "Q" },
  deadline: { label: "กำหนดส่ง", icon: "!" },
  review: { label: "รอตรวจ", icon: "✓" },
  reward: { label: "รางวัล", icon: "★" },
};

const rewardCategoryMeta: Record<RewardRecord["category"], { label: string; defaultIcon: string }> = {
  perk: { label: "สิทธิพิเศษ", defaultIcon: "🎁" },
  learning: { label: "การเรียนรู้", defaultIcon: "📚" },
  wellbeing: { label: "สุขภาพและความเป็นอยู่", defaultIcon: "♥" },
  recognition: { label: "การยกย่อง", defaultIcon: "★" },
};

const questTypeMeta: Record<QuestRecord["type"], { label: string; shortLabel: string; icon: string; description: string }> = {
  individual: { label: "เควสรายบุคคล", shortLabel: "รายบุคคล", icon: "●", description: "มอบหมายให้พนักงานหนึ่งคนโดยตรง" },
  team: { label: "เควสแบบทีม", shortLabel: "ทีม", icon: "◆", description: "ชวนหลายคนหรือทั้งแผนกร่วมเป้าหมาย" },
  activity: { label: "เควสกิจกรรม", shortLabel: "กิจกรรม", icon: "✦", description: "กิจกรรมเปิดให้ทุกคนในองค์กรเข้าร่วม" },
};

const questStatusMeta: Record<QuestRecord["status"], { label: string; description: string }> = {
  draft: { label: "ฉบับร่าง", description: "เห็นเฉพาะ HR / Admin" },
  active: { label: "เปิดรับภารกิจ", description: "แสดงแก่ผู้เข้าร่วมตามขอบเขต" },
  completed: { label: "สำเร็จแล้ว", description: "ปิดผลสำเร็จและเก็บเป็นผลงาน" },
  archived: { label: "เก็บประวัติ", description: "ซ่อนจากผู้เข้าร่วม แต่ยังตรวจย้อนหลังได้" },
};

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

const aiSkillStages = [
  { label: "ขั้นพื้นฐาน", levels: "ระดับ 1–2", title: "ใช้ AI อย่างปลอดภัยและตรวจคำตอบ", description: `${aiSkillLevelGuide[1]} ${aiSkillLevelGuide[2]}` },
  { label: "ขั้นเชิงลึก", levels: "ระดับ 3", title: "ใช้ AI ใน Workflow ของตำแหน่ง", description: aiSkillLevelGuide[3] },
  { label: "ขั้นสูง", levels: "ระดับ 4–5", title: "สร้างระบบใช้ซ้ำและยกระดับทีม", description: `${aiSkillLevelGuide[4]} ${aiSkillLevelGuide[5]}` },
] as const;

const roleTalentProfiles: Record<string, Record<TalentDimensionId, number>> = {
  "sales-manager": { analysis: 4, communication: 5, problemSolving: 4, leadership: 5, execution: 4 },
  marketing: { analysis: 5, communication: 4, problemSolving: 4, leadership: 3, execution: 4 },
  "customer-service": { analysis: 3, communication: 5, problemSolving: 5, leadership: 3, execution: 4 },
  developer: { analysis: 5, communication: 3, problemSolving: 5, leadership: 3, execution: 5 },
  "video-editor": { analysis: 4, communication: 4, problemSolving: 4, leadership: 3, execution: 5 },
  hr: { analysis: 4, communication: 5, problemSolving: 4, leadership: 5, execution: 4 },
  "growth-commerce-manager": { analysis: 5, communication: 4, problemSolving: 5, leadership: 5, execution: 4 },
  "customer-insight-marketer": { analysis: 5, communication: 5, problemSolving: 4, leadership: 3, execution: 4 },
  "offer-conversion-marketer": { analysis: 5, communication: 5, problemSolving: 5, leadership: 3, execution: 4 },
  "crm-retention-marketer": { analysis: 5, communication: 4, problemSolving: 4, leadership: 3, execution: 5 },
  "performance-video-editor": { analysis: 4, communication: 4, problemSolving: 4, leadership: 2, execution: 5 },
  "brand-content-video-editor": { analysis: 3, communication: 5, problemSolving: 4, leadership: 2, execution: 5 },
  "marketplace-commerce-specialist": { analysis: 5, communication: 4, problemSolving: 5, leadership: 3, execution: 5 },
  "facebook-media-buyer": { analysis: 5, communication: 3, problemSolving: 5, leadership: 3, execution: 5 },
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
  "growth-strategy": { analysis: .45, leadership: .35, execution: .2 },
  "funnel-management": { analysis: .5, problemSolving: .3, execution: .2 },
  "revenue-profit-analysis": { analysis: .8, problemSolving: .2 },
  "forecast-budget": { analysis: .6, execution: .4 },
  "experiment-management": { analysis: .35, problemSolving: .4, execution: .25 },
  "team-coaching": { leadership: .7, communication: .3 },
  "work-prioritization": { analysis: .3, leadership: .25, execution: .45 },
  "cross-functional-leadership": { leadership: .6, communication: .4 },
  "voice-of-customer-research": { analysis: .55, communication: .45 },
  "market-competitor-analysis": { analysis: .8, problemSolving: .2 },
  "customer-segmentation": { analysis: .7, problemSolving: .3 },
  "content-strategy": { analysis: .35, communication: .45, execution: .2 },
  "hook-storytelling": { communication: .7, problemSolving: .3 },
  "creative-briefing": { communication: .6, execution: .4 },
  "content-performance-analysis": { analysis: .75, problemSolving: .25 },
  "conversion-copywriting": { communication: .7, problemSolving: .3 },
  "offer-design": { analysis: .3, communication: .3, problemSolving: .4 },
  "bundle-upsell-strategy": { analysis: .5, problemSolving: .5 },
  "landing-page-cro": { analysis: .4, problemSolving: .4, execution: .2 },
  "funnel-conversion-analysis": { analysis: .7, problemSolving: .3 },
  "ab-testing": { analysis: .55, problemSolving: .3, execution: .15 },
  "pricing-margin": { analysis: .8, problemSolving: .2 },
  "sales-page-optimization": { communication: .35, problemSolving: .35, execution: .3 },
  "crm-segmentation": { analysis: .75, problemSolving: .25 },
  "customer-journey-design": { analysis: .35, communication: .35, problemSolving: .3 },
  "lifecycle-marketing": { analysis: .45, communication: .3, execution: .25 },
  "line-crm-operations": { communication: .3, problemSolving: .2, execution: .5 },
  "marketing-automation": { analysis: .3, problemSolving: .35, execution: .35 },
  "retention-campaign-design": { analysis: .35, communication: .4, problemSolving: .25 },
  "cohort-ltv-analysis": { analysis: .85, problemSolving: .15 },
  "customer-data-hygiene": { analysis: .25, problemSolving: .15, execution: .6 },
  "direct-response-editing": { analysis: .25, communication: .25, execution: .5 },
  "three-second-hook": { communication: .45, problemSolving: .3, execution: .25 },
  "short-form-pacing": { communication: .35, problemSolving: .2, execution: .45 },
  "platform-video-adaptation": { analysis: .2, problemSolving: .25, execution: .55 },
  "creative-variation-production": { problemSolving: .25, execution: .75 },
  "video-retention-analysis": { analysis: .75, problemSolving: .25 },
  "caption-sound-design": { communication: .25, problemSolving: .2, execution: .55 },
  "ai-assisted-video-editing": { problemSolving: .35, execution: .65 },
  "brand-storytelling": { communication: .7, problemSolving: .15, execution: .15 },
  "visual-composition": { communication: .3, problemSolving: .25, execution: .45 },
  "motion-graphics-brand": { problemSolving: .3, execution: .7 },
  "color-grading": { analysis: .25, problemSolving: .15, execution: .6 },
  "brand-sound-design": { communication: .25, problemSolving: .15, execution: .6 },
  "multi-platform-production": { problemSolving: .25, execution: .75 },
  "asset-version-management": { analysis: .15, problemSolving: .15, execution: .7 },
  "ai-assisted-content-production": { problemSolving: .4, execution: .6 },
  "marketplace-operations": { analysis: .2, problemSolving: .25, execution: .55 },
  "marketplace-seo-listing": { analysis: .35, communication: .25, execution: .4 },
  "marketplace-pricing-margin": { analysis: .75, problemSolving: .25 },
  "marketplace-promotion": { analysis: .35, communication: .25, execution: .4 },
  "marketplace-ads": { analysis: .55, problemSolving: .25, execution: .2 },
  "affiliate-live-commerce": { communication: .55, leadership: .2, execution: .25 },
  "stock-order-sync": { communication: .25, problemSolving: .25, execution: .5 },
  "marketplace-account-health-skill": { problemSolving: .35, execution: .65 },
  "marketplace-analytics": { analysis: .8, problemSolving: .2 },
  "meta-campaign-structure": { analysis: .35, problemSolving: .25, execution: .4 },
  "meta-audience-strategy": { analysis: .55, problemSolving: .3, execution: .15 },
  "meta-creative-testing": { analysis: .45, problemSolving: .35, execution: .2 },
  "meta-budget-scaling": { analysis: .5, problemSolving: .3, execution: .2 },
  "meta-pixel-capi": { analysis: .35, problemSolving: .4, execution: .25 },
  "meta-attribution": { analysis: .85, problemSolving: .15 },
  "meta-unit-economics": { analysis: .85, problemSolving: .15 },
  "meta-performance-forecast": { analysis: .65, problemSolving: .2, execution: .15 },
  "meta-policy-risk": { analysis: .25, problemSolving: .35, execution: .4 },
  "core-discipline": { execution: 1 },
  "core-responsibility": { execution: .6, leadership: .4 },
  "core-time-management": { execution: .7, analysis: .3 },
  "core-quality-mindset": { execution: .6, problemSolving: .4 },
  "core-professional-communication": { communication: 1 },
  "core-teamwork": { communication: .7, leadership: .3 },
  "core-respect-manners": { communication: .8, leadership: .2 },
  "core-service-mind": { communication: .7, problemSolving: .3 },
  "core-integrity": { leadership: .5, execution: .5 },
  "core-compliance": { execution: .8, analysis: .2 },
  "core-emotional-maturity": { leadership: .55, communication: .45 },
  "core-adaptability": { problemSolving: .55, execution: .45 },
  "core-learning": { analysis: .55, problemSolving: .45 },
  "core-initiative": { problemSolving: .55, leadership: .25, execution: .2 },
  "core-ai-work-mastery": { analysis: .3, communication: .1, problemSolving: .3, execution: .3 },
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
  "growth-commerce-manager": "Head of Growth & Commerce",
  "customer-insight-marketer": "Senior Customer Insight Strategist",
  "offer-conversion-marketer": "Senior Conversion Strategist",
  "crm-retention-marketer": "CRM & Retention Lead",
  "performance-video-editor": "Senior Performance Video Editor",
  "brand-content-video-editor": "Senior Brand Content Editor",
  "marketplace-commerce-specialist": "Marketplace Growth Lead",
  "facebook-media-buyer": "Senior Performance Marketing Specialist",
};

const roleProofGuides: Record<string, { defaultType: WorkSubmissionRecord["submissionType"]; headline: string; examples: string[] }> = {
  "video-editor": { defaultType: "video", headline: "งานตัดต่อและโปรดักชัน", examples: ["ลิงก์วิดีโอฉบับ Final", "โฟลเดอร์ Drive ที่เก็บไฟล์ต้นฉบับ", "ลิงก์โพสต์ Social Media ที่เผยแพร่แล้ว"] },
  marketing: { defaultType: "social", headline: "งานการตลาดและคอนเทนต์", examples: ["ลิงก์โพสต์หรือหน้าแคมเปญ", "รายงานผลโฆษณา / Dashboard", "ไฟล์ Artwork, Copy หรือแผนคอนเทนต์"] },
  developer: { defaultType: "code", headline: "งานพัฒนาซอฟต์แวร์", examples: ["ลิงก์ Pull Request หรือ Commit", "ลิงก์ระบบที่ Deploy แล้ว", "Test report, Screenshot หรือคู่มือใช้งาน"] },
  "sales-manager": { defaultType: "sales", headline: "งานขายและบริหารลูกค้า", examples: ["เลขดีลหรือรายงานจาก CRM", "ใบเสนอราคา / PO / หลักฐานปิดการขาย", "บันทึกประชุมหรือการยืนยันจากลูกค้า"] },
  "customer-service": { defaultType: "service", headline: "งานบริการลูกค้า", examples: ["เลข Ticket หรือ Case ที่ปิดแล้ว", "บทสนทนาที่ปกปิดข้อมูลอ่อนไหว", "ผล CSAT หรือรายงานการแก้ปัญหา"] },
  hr: { defaultType: "hr", headline: "งานทรัพยากรบุคคล", examples: ["แบบฟอร์มหรือเอกสารที่อนุมัติแล้ว", "รายชื่อผู้เข้าอบรม / ผลประเมิน", "รายงานสรรหา Onboarding หรือนโยบาย"] },
  "growth-commerce-manager": { defaultType: "document", headline: "กลยุทธ์และผลลัพธ์ Growth", examples: ["Growth Plan และเป้าหมายรายเดือน", "Dashboard รายได้ กำไร และ Funnel", "บันทึกผลทดลองพร้อมการตัดสินใจ"] },
  "customer-insight-marketer": { defaultType: "document", headline: "Customer Insight และ Creative Brief", examples: ["สรุปเสียงลูกค้าพร้อมหลักฐาน", "รายงานคู่แข่งและโอกาสทางการตลาด", "Creative Brief ที่นำไปผลิตจริง"] },
  "offer-conversion-marketer": { defaultType: "social", headline: "Offer และงานเพิ่ม Conversion", examples: ["หน้าขายหรือ Copy ที่เผยแพร่แล้ว", "ผล A/B Test ก่อนและหลัง", "สรุปราคา Bundle และกำไรต่อออเดอร์"] },
  "crm-retention-marketer": { defaultType: "document", headline: "CRM และการรักษาลูกค้า", examples: ["Customer Journey และ Segment", "Flow LINE OA / CRM Automation", "รายงานยอดซื้อซ้ำ Cohort หรือ LTV"] },
  "performance-video-editor": { defaultType: "video", headline: "วิดีโอเพื่อผลลัพธ์โฆษณา", examples: ["ลิงก์วิดีโอ Final และ Variation", "โฟลเดอร์ไฟล์ต้นฉบับ", "รายงาน Hook, Retention, CTR หรือผลโฆษณา"] },
  "brand-content-video-editor": { defaultType: "video", headline: "วิดีโอแบรนด์และคอนเทนต์", examples: ["ลิงก์วิดีโอ Final", "โฟลเดอร์ Project และ Asset", "ลิงก์โพสต์พร้อมผลหลังเผยแพร่"] },
  "marketplace-commerce-specialist": { defaultType: "social", headline: "ผลงาน TikTok Shop / Shopee / Lazada", examples: ["ลิงก์หน้าร้านหรือ Listing", "รายงานแคมเปญ ยอดขาย และกำไร", "หลักฐาน Account Health สต็อก หรือคำสั่งซื้อ"] },
  "facebook-media-buyer": { defaultType: "document", headline: "ผลลัพธ์ Facebook Ads", examples: ["รายงานจาก Ads Manager", "Dashboard CPA, CAC, ROAS, MER และกำไร", "ผล Creative Test และหลักฐาน Pixel / CAPI"] },
};

const defaultProofGuide = { defaultType: "document" as const, headline: "หลักฐานการส่งมอบงาน", examples: ["ลิงก์ผลงานหรือระบบที่ใช้งานจริง", "ไฟล์รายงาน รูปภาพ หรือเอกสารยืนยัน", "ข้อความสรุปผลลัพธ์และเกณฑ์ที่ทำสำเร็จ"] };

const complianceChecklistItems = [
  { id: "working-hours", title: "เวลาทำงานและเวลาพัก", detail: "ระบุเวลาเริ่ม–เลิกงาน ช่วงพัก และวิธีบันทึกเวลาให้ชัดเจน" },
  { id: "holidays", title: "วันหยุด", detail: "ตรวจวันหยุดประจำสัปดาห์ วันหยุดตามประเพณี และการแจ้งตาราง" },
  { id: "overtime", title: "การทำงานล่วงเวลา (OT)", detail: "ระบุผู้มีอำนาจอนุมัติ วิธีขออนุมัติ และหลักฐานเวลาทำงาน" },
  { id: "wages", title: "ค่าจ้างและรอบจ่าย", detail: "ตรวจองค์ประกอบค่าจ้าง รอบจ่าย ช่องทาง และรายการหักที่อธิบายได้" },
  { id: "leave", title: "วันลา", detail: "ระบุประเภทลา ขั้นตอนยื่นลา ผู้อนุมัติ และเอกสารประกอบเท่าที่จำเป็น" },
  { id: "discipline", title: "วินัยและการสอบข้อเท็จจริง", detail: "กำหนดขั้นตอนที่เป็นธรรม เปิดโอกาสให้ชี้แจง และไม่ลงโทษจากคะแนนอย่างเดียว" },
  { id: "grievance", title: "ช่องทางร้องทุกข์", detail: "มีช่องทางติดต่อ ผู้รับผิดชอบ ระยะเวลาตอบกลับ และการรักษาความลับ" },
  { id: "termination", title: "การสิ้นสุดการจ้าง", detail: "ให้ HR ตรวจขั้นตอน เอกสาร สิทธิประโยชน์ และการส่งมอบงานก่อนใช้จริง" },
] as const;

type ComplianceChecklistId = (typeof complianceChecklistItems)[number]["id"];

const blankOrganizationPolicyDraft = (): OrganizationPolicyDraft => ({
  title: "ข้อบังคับและแนวปฏิบัติของบริษัท",
  summary: "สรุปสิ่งที่พนักงานควรรู้ก่อนกดยืนยันรับทราบ",
  content: "",
  category: "work_rules",
  effectiveDate: bangkokIsoDate(),
  acknowledgementRequired: true,
});

const emptyTalentProfile = (): Record<TalentDimensionId, number> => ({ analysis: 0, communication: 0, problemSolving: 0, leadership: 0, execution: 0 });

type SkillScoreSource = Pick<EvaluationRecord, "skillScores">;

function buildTalentProfile(roleId: string, evaluation: SkillScoreSource | null) {
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

function skillCategorySummary(role: ReturnType<typeof getRole>, evaluation: SkillScoreSource | null, categoryId: SkillCategoryId) {
  const skills = role.skills.filter((skill) => (skill.category ?? "role") === categoryId);
  const recorded = skills.filter((skill) => {
    const level = evaluation?.skillScores[skill.id];
    return typeof level === "number" && level >= 1 && level <= 5;
  });
  const average = recorded.length
    ? recorded.reduce((sum, skill) => sum + (evaluation?.skillScores[skill.id] ?? 0), 0) / recorded.length / 5 * 100
    : null;
  return { skills, recorded: recorded.length, average };
}

function hasCompleteSkillAssessment(role: ReturnType<typeof getRole>, evaluation: SkillScoreSource | null) {
  return Boolean(evaluation && role.skills.every((skill) => {
    const level = evaluation.skillScores[skill.id];
    return typeof level === "number" && level >= 1 && level <= 5;
  }));
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
  ...Array.from(new Map(roles.map((role) => [role.departmentId, { id: role.departmentId, label: role.department }])).values()),
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
    skillScores: Object.fromEntries(role.skills.filter((skill) => (skill.category ?? "role") === "role").map((skill) => [skill.id, skillLevel])),
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

function formatNotificationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "ล่าสุด";
  const today = bangkokIsoDate();
  const itemDate = bangkokIsoDate(date);
  if (itemDate === today) return `วันนี้ ${new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" }).format(date)} น.`;
  if (itemDate === addIsoDays(today, -1)) return "เมื่อวาน";
  return formatUpdatedAt(value);
}

function formatDueDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "2-digit" }).format(new Date(`${value}T00:00:00`));
}

function bangkokIsoDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function bangkokIsoMonth(value: string | Date = new Date()) {
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? "" : bangkokIsoDate(date).slice(0, 7);
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

function workItemCreatorId(item: WorkItemRecord) {
  return item.createdByEmployeeId ?? "";
}

function workSubmissionStatusLabel(status: WorkSubmissionRecord["status"]) {
  return { submitted: "รอตรวจหลักฐาน", approved: "อนุมัติแล้ว", revision: "ส่งกลับให้แก้ไข" }[status];
}

function rewardRedemptionStatusLabel(status: RewardRedemptionRecord["status"]) {
  return { requested: "รออนุมัติ", approved: "อนุมัติแล้ว", fulfilled: "ส่งมอบรางวัลแล้ว", cancelled: "ยกเลิกและคืน Points แล้ว" }[status];
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

function employeeLifecycleLabel(status: EmployeeRecord["status"]) {
  if (status === "active") return "ทำงานอยู่";
  if (status === "archived") return "ลบออกจากรายชื่อแล้ว";
  return "ลาออกแล้ว";
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
  "growth-commerce-manager": 4.5,
  "customer-insight-marketer": 4,
  "offer-conversion-marketer": 4,
  "crm-retention-marketer": 4,
  "performance-video-editor": 4,
  "brand-content-video-editor": 4,
  "marketplace-commerce-specialist": 4.5,
  "facebook-media-buyer": 4.5,
};

const officeLevelMeta: Record<OfficeLoadLevel, { label: string; copy: string }> = {
  available: { label: "พร้อมรับงาน", copy: "มีพื้นที่สำหรับงานใหม่" },
  steady: { label: "สมดุล", copy: "กำลังทำงานตามแผน" },
  busy: { label: "งานแน่น", copy: "กำลังเร่งหลายรายการ" },
  overloaded: { label: "งานล้น", copy: "ควรช่วยแบ่งหรือเลื่อนงาน" },
};

function officeSceneForRole(roleId: string): OfficeScene {
  if (roleId === "performance-video-editor" || roleId === "brand-content-video-editor") return "edit";
  if (roleId === "marketplace-commerce-specialist") return "sales";
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
  profiles: { eyebrow: "EMPLOYEE DIGITAL DOSSIER", title: "แฟ้มประวัติพนักงาน", description: "รวมข้อมูลส่วนตัว เอกสารสมัครงาน การตรวจเอกสาร และสัญญาจ้างพร้อมขั้นตอนยืนยันใน Pilot" },
  organizationDocs: { eyebrow: "ORGANIZATION DOCUMENT CENTER", title: "เอกสารองค์กร", description: "จัดเก็บสัญญา เอกสาร HR และแม่แบบฉบับร่าง พร้อมค้นหาและดาวน์โหลดจากที่เดียว" },
  skills: { eyebrow: "COMPETENCY MATRIX", title: "ภาพรวมสกิลของทีม", description: "มองเห็นจุดแข็ง ช่องว่าง และความพร้อมของแต่ละสายงาน" },
  power: { eyebrow: "TEAM POWER RATINGS", title: "ค่าพลังพนักงาน", description: "ดูค่าพลังรวมและ 6 สกิลหลักในรูปแบบการ์ด พร้อมเปรียบเทียบจุดเด่นของพนักงานแบบตัวต่อตัว" },
  peopleOps: { eyebrow: "PEOPLE OPERATING SYSTEM", title: "เวลาเข้างานและเส้นทางเติบโต", description: "ลงเวลา อนุมัติวันลา ยืนยันสกิล เพิ่มค่าตอบแทน และเห็นความพร้อมเลื่อนตำแหน่งในระบบเดียว" },
  hr: { eyebrow: "WORKFORCE MANAGEMENT", title: "บริหารทรัพยากรบุคคล", description: "เชื่อมผลงาน สกิล การทดสอบ แผนพัฒนา ตำแหน่งที่เหมาะสม และค่าตอบแทน เพื่อการตัดสินใจที่รอบด้าน" },
  portfolio: { eyebrow: "EMPLOYEE WORK PORTFOLIO", title: "แฟ้มผลงานพนักงาน", description: "ค้นหางานที่ส่งมอบแล้ว ไฟล์ ลิงก์ ผู้ตรวจ และผลประเมินของแต่ละคนได้จากที่เดียว" },
  work: { eyebrow: "จัดการงาน", title: "งานของทีม", description: "เลือกงาน เริ่มทำ ส่งหลักฐาน และติดตามความคืบหน้าได้จากรายการเดียว" },
  office: { eyebrow: "สำนักงาน 3D ของทีม", title: "สำนักงานจำลอง 3D", description: "ดูตัวละครพนักงานเดิน เลือกห้อง และทำกิจกรรมตามภาระงานจริงในบรรยากาศสำนักงานสมัยใหม่" },
  access: { eyebrow: "ACCESS & PERMISSIONS", title: "ผู้ใช้งานและสิทธิ์เข้าถึง", description: "แยกคนสั่งงานและคนทำงานให้ชัดเจน พร้อมกำหนดข้อมูลที่แต่ละคนเห็นและจัดการได้" },
};

const temporaryPasswordAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";

function generateTemporaryPassword(length = 10) {
  const values = new Uint32Array(length);
  globalThis.crypto.getRandomValues(values);
  return Array.from(values, (value) => temporaryPasswordAlphabet[value % temporaryPasswordAlphabet.length]).join("");
}

function blankUserAccountForm(): UserAccountFormState {
  return {
    accountId: "",
    loginId: "",
    displayName: "",
    nickname: "",
    role: "employee",
    employeeId: "",
    departmentId: "",
    status: "active",
    temporaryPassword: generateTemporaryPassword(),
  };
}

function blankRewardForm(): RewardFormState {
  return {
    title: "",
    description: "",
    category: "perk",
    icon: rewardCategoryMeta.perk.defaultIcon,
    costPoints: 100,
    stock: 1,
    isActive: true,
  };
}

function blankQuestForm(pointsLimit = defaultPointPolicyRules.events.quest.points ?? 0): QuestFormState {
  const startDate = bangkokIsoDate();
  const safePointsLimit = Math.max(0, Math.round(pointsLimit));
  const safeDefaultPoints = Math.max(0, Math.round(defaultPointPolicyRules.events.quest.points ?? 0));
  return {
    type: "individual",
    title: "",
    description: "",
    status: "draft",
    progress: 0,
    pointsReward: Math.min(safePointsLimit, safeDefaultPoints),
    rewardId: null,
    isFeatured: true,
    startDate,
    endDate: addIsoDays(startDate, 14),
    targetEmployeeIds: [],
    targetDepartmentIds: [],
  };
}

function blankQuestCompletionForm(completionDate = bangkokIsoDate()): QuestCompletionFormState {
  return { employeeId: "", completionDate, evidenceUrl: "", note: "" };
}

function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function accountCredentialState(account: PublicUserAccount): AccountCredentialState {
  if (account.status !== "active") return { id: "inactive", label: "พักสิทธิ์", detail: "บัญชีถูกระงับการเข้าใช้" };
  const lockedUntilTime = account.lockedUntil ? Date.parse(account.lockedUntil) : Number.NaN;
  if (Number.isFinite(lockedUntilTime) && lockedUntilTime > Date.now()) {
    return { id: "locked", label: "ล็อกชั่วคราว", detail: `ลองใหม่ได้ ${formatUpdatedAt(account.lockedUntil as string)}` };
  }
  if (account.hasPassword === false) return { id: "no-password", label: "ยังไม่มีรหัสผ่าน", detail: "ผู้ดูแลต้องสร้างรหัสชั่วคราว" };
  if (account.mustChangePassword) return { id: "must-change", label: "ต้องเปลี่ยนรหัส", detail: "รอผู้ใช้ตั้งรหัสใหม่เมื่อเข้าใช้" };
  if (account.lastLoginAt) return { id: "ready", label: "พร้อมใช้งาน", detail: `เข้าใช้ล่าสุด ${formatUpdatedAt(account.lastLoginAt)}` };
  return { id: "pending", label: "รอเข้าใช้ครั้งแรก", detail: "มีรหัสแล้ว แต่ยังไม่เคยเข้าสู่ระบบ" };
}

export default function Home() {
  const [view, setView] = useState<View>("work");
  const [activeDepartment, setActiveDepartment] = useState("all");
  const [period, setPeriod] = useState(periods[0]);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [evaluations, setEvaluations] = useState<EvaluationRecord[]>([]);
  const [selfAssessments, setSelfAssessments] = useState<EmployeeSelfAssessmentRecord[]>([]);
  const [hrProfiles, setHrProfiles] = useState<HrProfileRecord[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [skillAchievements, setSkillAchievements] = useState<SkillAchievementRecord[]>([]);
  const [talentActions, setTalentActions] = useState<TalentActionRecord[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [workItems, setWorkItems] = useState<WorkItemRecord[]>([]);
  const [workSubmissions, setWorkSubmissions] = useState<WorkSubmissionRecord[]>([]);
  const [quests, setQuests] = useState<QuestRecord[]>([]);
  const [questCompletions, setQuestCompletions] = useState<QuestCompletionRecord[]>([]);
  const [rewards, setRewards] = useState<RewardRecord[]>([]);
  const [pointLedger, setPointLedger] = useState<PointLedgerRecord[]>([]);
  const [pointEvents, setPointEvents] = useState<PointEventRecord[]>([]);
  const [activePointPolicyRules, setActivePointPolicyRules] = useState<PointPolicyRules>(defaultPointPolicyRules);
  const [rewardRedemptions, setRewardRedemptions] = useState<RewardRedemptionRecord[]>([]);
  const [organizationPolicies, setOrganizationPolicies] = useState<OrganizationPolicyRecord[]>([]);
  const [policyAcknowledgements, setPolicyAcknowledgements] = useState<PolicyAcknowledgementRecord[]>([]);
  const [employeeProfiles, setEmployeeProfiles] = useState<EmployeeProfileRecord[]>([]);
  const [applicationDocuments, setApplicationDocuments] = useState<ApplicationDocumentRecord[]>([]);
  const [employmentContracts, setEmploymentContracts] = useState<EmploymentContractRecord[]>([]);
  const [organizationDocuments, setOrganizationDocuments] = useState<OrganizationDocumentRecord[]>([]);
  const [employeeWarnings, setEmployeeWarnings] = useState<EmployeeWarningRecord[]>([]);
  const [employeeRecognitions, setEmployeeRecognitions] = useState<EmployeeRecognitionRecord[]>([]);
  const [userAccounts, setUserAccounts] = useState<PublicUserAccount[]>([]);
  const [employeeRegistrationRequests, setEmployeeRegistrationRequests] = useState<EmployeeRegistrationRequest[]>([]);
  const [notificationReads, setNotificationReads] = useState<NotificationReadRecord[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [employeePreview, setEmployeePreview] = useState<EmployeePreview | null>(null);
  const isEmployeePreview = Boolean(employeePreview?.readOnly);
  const [permissions, setPermissions] = useState<AppPermissions>({ canManageAccounts: false, canManagePeople: false, canManageWork: false, canManageQuests: false, canAssignTeamWork: false, canReviewWork: false, canViewTeam: false, canViewTeamOverview: false, canViewOwnGrowth: false, canViewOwnRewards: false, canManageOrganizationDocuments: false, canManageEmployeeWarnings: false, canManageEmployeeRecognitions: false });
  const [teamOverview, setTeamOverview] = useState<EmployeeTeamOverview>({ employees: [], evaluations: [], workItems: [] });
  const [launchReadiness, setLaunchReadiness] = useState<LaunchReadiness | null>(null);
  const [authGate, setAuthGate] = useState<AuthGateState | null>(null);
  const [accessDenied, setAccessDenied] = useState<{ message: string } | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeRecord | null>(null);
  const [skillProfileEmployee, setSkillProfileEmployee] = useState<EmployeeRecord | null>(null);
  const [hrEmployee, setHrEmployee] = useState<EmployeeRecord | null>(null);
  const [kpiScores, setKpiScores] = useState<Record<string, number>>({});
  const [skillScores, setSkillScores] = useState<Record<string, number>>({});
  const [skillCategoryFilter, setSkillCategoryFilter] = useState<SkillCategoryId>("role");
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [dossierStatusFilter, setDossierStatusFilter] = useState<DossierStatusFilter>("all");
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);
  const [showAiAssistant, setShowAiAssistant] = useState(false);
  const [showAiMascot, setShowAiMascot] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [notificationFilter, setNotificationFilter] = useState<NotificationFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [dashboardReloadKey, setDashboardReloadKey] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [dataWarning, setDataWarning] = useState("");
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [showWorkForm, setShowWorkForm] = useState(false);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [editingWorkItem, setEditingWorkItem] = useState<WorkItemRecord | null>(null);
  const [showQuestForm, setShowQuestForm] = useState(false);
  const [editingQuest, setEditingQuest] = useState<QuestRecord | null>(null);
  const [questForm, setQuestForm] = useState<QuestFormState>(() => blankQuestForm());
  const [questToFulfill, setQuestToFulfill] = useState<QuestRecord | null>(null);
  const [questCompletionForm, setQuestCompletionForm] = useState<QuestCompletionFormState>(() => blankQuestCompletionForm());
  const [questTypeFilter, setQuestTypeFilter] = useState<QuestTypeFilter>("all");
  const [questStatusFilter, setQuestStatusFilter] = useState<QuestStatusFilter>("current");
  const [submissionWorkItem, setSubmissionWorkItem] = useState<WorkItemRecord | null>(null);
  const [submissionFile, setSubmissionFile] = useState<File | null>(null);
  const [reviewerNote, setReviewerNote] = useState("");
  const [rewardToRedeem, setRewardToRedeem] = useState<RewardRecord | null>(null);
  const [showRewardForm, setShowRewardForm] = useState(false);
  const [editingReward, setEditingReward] = useState<RewardRecord | null>(null);
  const [rewardForm, setRewardForm] = useState<RewardFormState>(() => blankRewardForm());
  const [profileEmployeeId, setProfileEmployeeId] = useState("");
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [showContractForm, setShowContractForm] = useState(false);
  const [contractToSign, setContractToSign] = useState<EmploymentContractRecord | null>(null);
  const [showOrganizationDocumentForm, setShowOrganizationDocumentForm] = useState(false);
  const [showEmployeeWarningForm, setShowEmployeeWarningForm] = useState(false);
  const [showEmployeeRecognitionForm, setShowEmployeeRecognitionForm] = useState(false);
  const [uploadingDocumentType, setUploadingDocumentType] = useState<ApplicationDocumentRecord["documentType"] | null>(null);
  const [uploadingProfileImage, setUploadingProfileImage] = useState(false);
  const [powerLeftId, setPowerLeftId] = useState("");
  const [powerRightId, setPowerRightId] = useState("");
  const [workFilter, setWorkFilter] = useState<"all" | WorkItemRecord["kind"]>("all");
  const [workSearch, setWorkSearch] = useState("");
  const [workDueFilter, setWorkDueFilter] = useState<WorkDueFilter>("all");
  const [employeeTaskScope, setEmployeeTaskScope] = useState<EmployeeTaskScope>("assigned");
  const [workSection, setWorkSection] = useState<WorkSection>("quests");
  const [pointPanel, setPointPanel] = useState<PointPanel>("overview");
  const [workAssigneeFilter, setWorkAssigneeFilter] = useState("all");
  const [officeLoadFilter, setOfficeLoadFilter] = useState<OfficeLoadFilter>("all");
  const [quickUpdatingWorkId, setQuickUpdatingWorkId] = useState("");
  const [portfolioSearch, setPortfolioSearch] = useState("");
  const [portfolioEmployeeId, setPortfolioEmployeeId] = useState("all");
  const [portfolioProjectId, setPortfolioProjectId] = useState("all");
  const [portfolioStatus, setPortfolioStatus] = useState<PortfolioStatusFilter>("all");
  const [monthlyPointMonth, setMonthlyPointMonth] = useState(bangkokIsoMonth());
  const [pointHistoryEmployeeId, setPointHistoryEmployeeId] = useState("all");
  const [organizationDocumentTab, setOrganizationDocumentTab] = useState<OrganizationDocumentTab>("library");
  const [organizationDocumentSearch, setOrganizationDocumentSearch] = useState("");
  const [organizationDocumentCategoryFilter, setOrganizationDocumentCategoryFilter] = useState<"all" | OrganizationDocumentCategory>("all");
  const [organizationDocumentStatusFilter, setOrganizationDocumentStatusFilter] = useState<"all" | OrganizationDocumentStatus>("all");
  const [selectedPolicyId, setSelectedPolicyId] = useState("");
  const [policyDraft, setPolicyDraft] = useState<OrganizationPolicyDraft>(blankOrganizationPolicyDraft);
  const [complianceChecklist, setComplianceChecklist] = useState<Record<ComplianceChecklistId, boolean>>(() => Object.fromEntries(complianceChecklistItems.map((item) => [item.id, false])) as Record<ComplianceChecklistId, boolean>);
  const [legalReviewConfirmed, setLegalReviewConfirmed] = useState(false);
  const [peopleOpsEmployeeId, setPeopleOpsEmployeeId] = useState("");
  const [attendanceDate, setAttendanceDate] = useState(bangkokIsoDate());
  const [officeClock, setOfficeClock] = useState("--:--");
  const [todayDate, setTodayDate] = useState(() => bangkokIsoDate());
  const [employeeForm, setEmployeeForm] = useState({ name: "", email: "", roleId: roles[0].id, manager: "" });
  const [hrForm, setHrForm] = useState({ actionId: "", currentSalary: 0, salaryReviewMonth: "มกราคม 2570", planType: "upskill" as TalentActionRecord["type"], title: "", dueDate: "2026-09-30", targetRoleId: roles[0].id });
  const [workForm, setWorkForm] = useState({ projectId: "", assigneeEmployeeId: "", kind: "task" as WorkItemRecord["kind"], title: "", description: "", priority: "medium" as WorkItemRecord["priority"], status: "todo" as WorkItemRecord["status"], progress: 0, points: workPointValue("task", "medium", defaultPointPolicyRules), dueDate: "2026-09-05" });
  const [submissionForm, setSubmissionForm] = useState({ submissionType: "document" as WorkSubmissionRecord["submissionType"], title: "", linkUrl: "", note: "" });
  const [projectForm, setProjectForm] = useState({ name: "", description: "", ownerEmployeeId: "", status: "active" as ProjectRecord["status"], dueDate: "2026-10-30", color: "forest" });
  const [rewardEmployeeId, setRewardEmployeeId] = useState("");
  const [profileForm, setProfileForm] = useState<Omit<EmployeeProfileRecord, "employeeId" | "updatedAt">>({ personalEmail: "", phone: "", birthDate: "", nationalIdLast4: "", address: "", emergencyName: "", emergencyPhone: "", startDate: "", employmentType: "permanent", education: "", experienceYears: 0, applicationSource: "" });
  const [contractForm, setContractForm] = useState({ title: "สัญญาจ้างพนักงาน", version: "1.0", status: "sent" as "draft" | "sent", effectiveDate: "2026-09-01", expiryDate: "", documentId: "" });
  const [signatureForm, setSignatureForm] = useState({ signedName: "", consent: false });
  const [organizationDocumentForm, setOrganizationDocumentForm] = useState({ title: "", category: "other" as OrganizationDocumentCategory, description: "", documentNumber: "", version: "1.0", owner: "ฝ่ายทรัพยากรบุคคล", effectiveDate: bangkokIsoDate(), expiryDate: "", note: "", status: "draft" as "draft" | "active" });
  const [organizationDocumentFile, setOrganizationDocumentFile] = useState<File | null>(null);
  const [employeeWarningForm, setEmployeeWarningForm] = useState({ warningNumber: "", level: "first" as EmployeeWarningLevel, subject: "", incidentDate: bangkokIsoDate(), issuedDate: bangkokIsoDate(), facts: "", correctiveAction: "", reviewDate: "", employeeStatement: "", status: "draft" as "draft" | "issued" });
  const [employeeWarningFile, setEmployeeWarningFile] = useState<File | null>(null);
  const [employeeRecognitionForm, setEmployeeRecognitionForm] = useState({ recognitionType: "certificate" as EmployeeRecognitionType, title: "", issuer: "", issuedDate: bangkokIsoDate(), expiryDate: "", credentialId: "", verificationUrl: "", description: "", status: "active" as const });
  const [employeeRecognitionFile, setEmployeeRecognitionFile] = useState<File | null>(null);
  const [pointEventForm, setPointEventForm] = useState({ employeeId: "", eventType: "attendance_on_time" as PointEventType, eventDate: bangkokIsoDate(), note: "", evidenceUrl: "" });
  const [attendanceForm, setAttendanceForm] = useState({ employeeId: "", workDate: bangkokIsoDate(), status: "present" as AttendanceRecord["status"], clockIn: "09:00", clockOut: "", leaveType: "personal" as NonNullable<AttendanceRecord["leaveType"]>, note: "" });
  const [skillAchievementForm, setSkillAchievementForm] = useState({ skillId: "", level: 2, evidenceUrl: "", note: "" });
  const [userAccountForm, setUserAccountForm] = useState<UserAccountFormState>(() => blankUserAccountForm());
  const [credentialResult, setCredentialResult] = useState<CredentialResult | null>(null);
  const [showTemporaryPassword, setShowTemporaryPassword] = useState(false);
  const [accessPanel, setAccessPanel] = useState<AccessPanel>("users");
  const [registrationEmployeeSelections, setRegistrationEmployeeSelections] = useState<Record<string, string>>({});
  const [registrationRoleSelections, setRegistrationRoleSelections] = useState<Record<string, UserAccountRecord["role"]>>({});
  const [registrationRejectionReasons, setRegistrationRejectionReasons] = useState<Record<string, string>>({});
  const canManageEmployeeFiles = currentUser?.role === "admin" && permissions.canManagePeople && !isEmployeePreview;

  useEffect(() => {
    const controller = new AbortController();
    const previewEmployeeId = new URLSearchParams(window.location.search).get("employee_preview")?.trim() ?? "";
    const dashboardParams = new URLSearchParams({ period });
    if (previewEmployeeId) dashboardParams.set("previewEmployeeId", previewEmployeeId);
    fetch(`/api/dashboard?${dashboardParams.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => ({})) as { currentUser?: CurrentUser; employeePreview?: EmployeePreview | null; permissions?: AppPermissions; teamOverview?: EmployeeTeamOverview; launchReadiness?: LaunchReadiness; userAccounts?: PublicUserAccount[]; employeeRegistrationRequests?: EmployeeRegistrationRequest[]; notificationReads?: NotificationReadRecord[]; employees?: EmployeeRecord[]; evaluations?: EvaluationRecord[]; selfAssessments?: EmployeeSelfAssessmentRecord[]; hrProfiles?: HrProfileRecord[]; attendanceRecords?: AttendanceRecord[]; skillAchievements?: SkillAchievementRecord[]; talentActions?: TalentActionRecord[]; projects?: ProjectRecord[]; workItems?: WorkItemRecord[]; workSubmissions?: WorkSubmissionRecord[]; quests?: QuestRecord[]; questCompletions?: QuestCompletionRecord[]; rewards?: RewardRecord[]; pointLedger?: PointLedgerRecord[]; pointEvents?: PointEventRecord[]; pointPolicyRules?: PointPolicyRules; rewardRedemptions?: RewardRedemptionRecord[]; organizationPolicies?: OrganizationPolicyRecord[]; policyAcknowledgements?: PolicyAcknowledgementRecord[]; employeeProfiles?: EmployeeProfileRecord[]; applicationDocuments?: ApplicationDocumentRecord[]; employmentContracts?: EmploymentContractRecord[]; organizationDocuments?: OrganizationDocumentRecord[]; employeeWarnings?: EmployeeWarningRecord[]; employeeRecognitions?: EmployeeRecognitionRecord[]; authRequired?: boolean; passwordChangeRequired?: boolean; accessDenied?: boolean; displayName?: string; loginId?: string; error?: string };
        if (response.status === 401 || body.authRequired) {
          setAuthGate({ mode: "login" });
          setAccessDenied(null);
          setCurrentUser(null);
          setEmployeePreview(null);
          setEmployees([]);
          setWorkItems([]);
          setQuests([]);
          setQuestCompletions([]);
          setOrganizationPolicies([]);
          setPolicyAcknowledgements([]);
          setTeamOverview({ employees: [], evaluations: [], workItems: [] });
          setLaunchReadiness(null);
          return;
        }
        if (response.status === 428 || body.passwordChangeRequired) {
          setAuthGate({ mode: "change", displayName: body.displayName, loginId: body.loginId });
          setAccessDenied(null);
          setCurrentUser(null);
          setEmployeePreview(null);
          setEmployees([]);
          setWorkItems([]);
          setQuests([]);
          setQuestCompletions([]);
          setOrganizationPolicies([]);
          setPolicyAcknowledgements([]);
          setTeamOverview({ employees: [], evaluations: [], workItems: [] });
          setLaunchReadiness(null);
          return;
        }
        if (response.status === 403 || body.accessDenied) {
          setAuthGate(null);
          setAccessDenied({ message: body.error || "บัญชีนี้ยังไม่พร้อมใช้งาน กรุณาติดต่อ HR หรือผู้ดูแลระบบ" });
          setCurrentUser(null);
          setEmployeePreview(null);
          setEmployees([]);
          setWorkItems([]);
          setQuests([]);
          setQuestCompletions([]);
          setOrganizationPolicies([]);
          setPolicyAcknowledgements([]);
          setTeamOverview({ employees: [], evaluations: [], workItems: [] });
          setLaunchReadiness(null);
          return;
        }
        if (!response.ok) throw new Error(body.error ?? "โหลดข้อมูลไม่สำเร็จ");
        if (!body.currentUser) throw new Error("ระบบไม่พบข้อมูลผู้ใช้งาน กรุณาลองโหลดใหม่");
        if (body.currentUser.mustChangePassword) {
          setAuthGate({ mode: "change", displayName: body.currentUser.displayName, loginId: body.currentUser.loginId });
          setCurrentUser(null);
          return;
        }
        setAuthGate(null);
        setCurrentUser(body.currentUser ?? null);
        setEmployeePreview(body.employeePreview ?? null);
        setPermissions(body.permissions ?? { canManageAccounts: false, canManagePeople: false, canManageWork: false, canManageQuests: false, canAssignTeamWork: false, canReviewWork: false, canViewTeam: false, canViewTeamOverview: false, canViewOwnGrowth: false, canViewOwnRewards: false, canManageOrganizationDocuments: false, canManageEmployeeWarnings: false, canManageEmployeeRecognitions: false });
        setTeamOverview(body.teamOverview ?? { employees: [], evaluations: [], workItems: [] });
        setLaunchReadiness(body.launchReadiness ?? null);
        setUserAccounts(body.userAccounts ?? []);
        setEmployeeRegistrationRequests(body.employeeRegistrationRequests ?? []);
        setNotificationReads(body.notificationReads ?? []);
        setAccessDenied(null);
        setEmployees(body.employees ?? []);
        setEvaluations(body.evaluations ?? []);
        setSelfAssessments(body.selfAssessments ?? []);
        setHrProfiles(body.hrProfiles ?? []);
        setAttendanceRecords(body.attendanceRecords ?? []);
        setSkillAchievements(body.skillAchievements ?? []);
        setTalentActions(body.talentActions ?? []);
        setProjects(body.projects ?? []);
        setWorkItems(body.workItems ?? []);
        setWorkSubmissions(body.workSubmissions ?? []);
        setQuests(body.quests ?? []);
        setQuestCompletions(body.questCompletions ?? []);
        setRewards(body.rewards ?? []);
        setPointLedger(body.pointLedger ?? []);
        setPointEvents(body.pointEvents ?? []);
        setActivePointPolicyRules(body.pointPolicyRules ?? defaultPointPolicyRules);
        setRewardRedemptions(body.rewardRedemptions ?? []);
        const loadedOrganizationPolicies = body.organizationPolicies ?? [];
        const firstAvailableOrganizationPolicy = (body.currentUser?.role === "admin" ? loadedOrganizationPolicies : loadedOrganizationPolicies.filter((policy) => policy.status === "published"))[0] ?? null;
        setOrganizationPolicies(loadedOrganizationPolicies);
        setSelectedPolicyId(firstAvailableOrganizationPolicy?.id ?? (body.currentUser?.role === "admin" ? "new" : ""));
        if (body.currentUser?.role === "admin" && firstAvailableOrganizationPolicy) {
          const category = firstAvailableOrganizationPolicy.category ?? "work_rules";
          setPolicyDraft({ title: firstAvailableOrganizationPolicy.title, summary: firstAvailableOrganizationPolicy.summary, content: firstAvailableOrganizationPolicy.content, category, effectiveDate: firstAvailableOrganizationPolicy.effectiveDate, acknowledgementRequired: category === "points_rewards" ? true : firstAvailableOrganizationPolicy.acknowledgementRequired });
        }
        setPolicyAcknowledgements(body.policyAcknowledgements ?? []);
        setEmployeeProfiles(body.employeeProfiles ?? []);
        setApplicationDocuments(body.applicationDocuments ?? []);
        setEmploymentContracts(body.employmentContracts ?? []);
        setOrganizationDocuments(body.organizationDocuments ?? []);
        setEmployeeWarnings(body.employeeWarnings ?? []);
        setEmployeeRecognitions(body.employeeRecognitions ?? []);
        setDataWarning("");
        const powerEmployees = body.currentUser?.role === "employee" && body.teamOverview?.employees.length ? body.teamOverview.employees : body.employees ?? [];
        const firstEmployeeId = body.employees?.find((employee) => employee.status === "active")?.id
          ?? body.employees?.find((employee) => employee.status !== "archived")?.id
          ?? "";
        const firstPowerEmployeeId = powerEmployees[0]?.id ?? firstEmployeeId;
        const secondEmployeeId = powerEmployees[1]?.id ?? firstPowerEmployeeId;
        const firstProjectId = body.projects?.[0]?.id ?? "";
        if (firstEmployeeId) {
          setProfileEmployeeId((value) => value || firstEmployeeId);
          setPowerLeftId((value) => value || firstPowerEmployeeId);
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
  }, [dashboardReloadKey, period]);

  useEffect(() => {
    const updateClock = () => {
      setOfficeClock(new Intl.DateTimeFormat("th-TH-u-nu-latn", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()));
      setTodayDate(bangkokIsoDate());
    };
    updateClock();
    const timer = window.setInterval(updateClock, 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (currentUser?.role !== "employee") return;
    const employeeViews: View[] = ["work", "portfolio", "office", "power", "peopleOps"];
    if (employeeViews.includes(view) && workSection !== "projects") return;
    const timer = window.setTimeout(() => {
      if (!employeeViews.includes(view)) setView("work");
      setWorkSection("tasks");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [currentUser?.role, view, workSection]);

  useEffect(() => {
    if (view !== "organizationDocs" || !currentUser) return;
    if (currentUser.role === "admin" && permissions.canManageOrganizationDocuments && !isEmployeePreview) return;
    const timer = window.setTimeout(() => setView("work"), 0);
    return () => window.clearTimeout(timer);
  }, [currentUser, isEmployeePreview, permissions.canManageOrganizationDocuments, view]);

  useEffect(() => {
    if (view !== "profiles" || canManageEmployeeFiles) return;
    const timer = window.setTimeout(() => setView("work"), 0);
    return () => window.clearTimeout(timer);
  }, [canManageEmployeeFiles, view]);

  const hasBlockingOverlay = Boolean(selectedEmployee || skillProfileEmployee || hrEmployee || showAddEmployee || showWorkForm || showQuestForm || questToFulfill || showProjectForm || submissionWorkItem || rewardToRedeem || showRewardForm || showProfileEditor || showContractForm || contractToSign || showOrganizationDocumentForm || showEmployeeWarningForm || showEmployeeRecognitionForm || showNotifications || showUserMenu || showChangePassword);

  useEffect(() => {
    let mascotShouldBeVisible = false;
    try {
      mascotShouldBeVisible = window.localStorage.getItem(AI_MASCOT_VISIBILITY_STORAGE_KEY) === "shown";
    } catch {}

    const visibilityTimer = window.setTimeout(() => setShowAiMascot(mascotShouldBeVisible), 0);
    return () => window.clearTimeout(visibilityTimer);
  }, []);

  useEffect(() => {
    const hasOpenOverlay = Boolean(hasBlockingOverlay || showAiAssistant);
    if (!hasOpenOverlay) return;
    if (!lastFocusedElementRef.current) lastFocusedElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => {
      const overlay = document.querySelector<HTMLElement>('[role="dialog"], .top-profile-menu');
      if (!overlay) return;
      const firstFocusable = overlay.querySelector<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
      (firstFocusable ?? overlay).focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      const overlay = document.querySelector<HTMLElement>('[role="dialog"], .top-profile-menu');
      if (event.key === "Tab" && overlay) {
        const focusable = [...overlay.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((element) => element.getClientRects().length > 0);
        if (!focusable.length) {
          event.preventDefault();
          overlay.focus();
        } else {
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
      }
      if (event.key === "Escape") {
        setSelectedEmployee(null);
        setSkillProfileEmployee(null);
        setHrEmployee(null);
        setShowAddEmployee(false);
        setShowWorkForm(false);
        setEditingWorkItem(null);
        setShowQuestForm(false);
        setEditingQuest(null);
        setQuestToFulfill(null);
        setQuestCompletionForm(blankQuestCompletionForm());
        setShowProjectForm(false);
        setSubmissionWorkItem(null);
        setRewardToRedeem(null);
        setShowRewardForm(false);
        setEditingReward(null);
        setShowProfileEditor(false);
        setShowContractForm(false);
        setContractToSign(null);
        setShowOrganizationDocumentForm(false);
        setShowEmployeeWarningForm(false);
        setShowEmployeeRecognitionForm(false);
        setShowNotifications(false);
        setShowUserMenu(false);
        setShowChangePassword(false);
        setShowAiAssistant(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      lastFocusedElementRef.current?.focus();
      lastFocusedElementRef.current = null;
    };
  }, [hasBlockingOverlay, selectedEmployee, skillProfileEmployee, hrEmployee, showAddEmployee, showWorkForm, showQuestForm, questToFulfill, showProjectForm, submissionWorkItem, rewardToRedeem, showRewardForm, showProfileEditor, showContractForm, contractToSign, showOrganizationDocumentForm, showEmployeeWarningForm, showEmployeeRecognitionForm, showNotifications, showUserMenu, showChangePassword, showAiAssistant]);

  const evaluationsByEmployee = useMemo(
    () => new Map(evaluations.filter((evaluation) => evaluation.period === period).map((evaluation) => [evaluation.employeeId, evaluation])),
    [evaluations, period],
  );
  const selfAssessmentsByEmployee = useMemo(
    () => new Map(selfAssessments.filter((assessment) => assessment.period === period).map((assessment) => [assessment.employeeId, assessment])),
    [period, selfAssessments],
  );
  const teamEvaluationsByEmployee = useMemo(
    () => new Map(teamOverview.evaluations.filter((evaluation) => evaluation.period === period).map((evaluation) => [evaluation.employeeId, evaluation])),
    [period, teamOverview.evaluations],
  );
  const officeSourceEmployees = currentUser?.role === "employee" ? teamOverview.employees : employees;
  const officeSourceWorkItems = useMemo(
    () => (currentUser?.role === "employee" ? teamOverview.workItems : workItems)
      .filter((item) => !(item.createdByEmployeeId && item.points === 0)),
    [currentUser, teamOverview.workItems, workItems],
  );
  const powerEvaluationsByEmployee = currentUser?.role === "employee" ? teamEvaluationsByEmployee : evaluationsByEmployee;

  const filteredEmployees = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("th");
    return employees.filter((employee) => {
      const role = getRole(employee.roleId);
      const departmentMatches = activeDepartment === "all" || role.departmentId === activeDepartment;
      const queryMatches = !query || `${employee.name} ${employee.email} ${role.name} ${role.department}`.toLocaleLowerCase("th").includes(query);
      return employee.status === "active" && departmentMatches && queryMatches;
    });
  }, [activeDepartment, employees, search]);

  const dossierEmployees = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("th");
    return employees.filter((employee) => {
      const role = getRole(employee.roleId);
      const departmentMatches = activeDepartment === "all" || role.departmentId === activeDepartment;
      const queryMatches = !query || `${employee.name} ${employee.email} ${role.name} ${role.department}`.toLocaleLowerCase("th").includes(query);
      const isResigned = employee.status === "resigned" || employee.status === "inactive";
      const statusMatches = dossierStatusFilter === "all"
        ? employee.status !== "archived"
        : dossierStatusFilter === "resigned"
          ? isResigned
          : employee.status === dossierStatusFilter;
      return departmentMatches && queryMatches && statusMatches;
    });
  }, [activeDepartment, dossierStatusFilter, employees, search]);

  const evaluatedEmployees = employees.filter((employee) => evaluationsByEmployee.has(employee.id));
  const averageScore = evaluatedEmployees.length
    ? evaluatedEmployees.reduce((sum, employee) => sum + (evaluationsByEmployee.get(employee.id)?.totalScore ?? 0), 0) / evaluatedEmployees.length
    : 0;
  const completelyAssessedEmployees = evaluatedEmployees.filter((employee) => hasCompleteSkillAssessment(getRole(employee.roleId), evaluationsByEmployee.get(employee.id) ?? null));
  const averageSkill = completelyAssessedEmployees.length
    ? completelyAssessedEmployees.reduce((sum, employee) => sum + calculateSkillScore(getRole(employee.roleId), evaluationsByEmployee.get(employee.id)?.skillScores ?? {}), 0) / completelyAssessedEmployees.length
    : 0;
  const completion = employees.length ? evaluatedEmployees.length / employees.length * 100 : 0;
  const pendingEmployees = employees.filter((employee) => !evaluationsByEmployee.has(employee.id));

  const roleStats = useMemo(() => roles.map((role) => {
    const people = employees.filter((employee) => employee.roleId === role.id && employee.status === "active");
    const roleEvaluations = people.map((employee) => evaluationsByEmployee.get(employee.id)).filter((item): item is EvaluationRecord => Boolean(item));
    const completeRoleEvaluations = roleEvaluations.filter((evaluation) => hasCompleteSkillAssessment(role, evaluation));
    const score = roleEvaluations.length ? roleEvaluations.reduce((sum, item) => sum + item.totalScore, 0) / roleEvaluations.length : 0;
    const skill = completeRoleEvaluations.length ? completeRoleEvaluations.reduce((sum, item) => sum + calculateSkillScore(role, item.skillScores), 0) / completeRoleEvaluations.length : 0;
    return { role, people: people.length, evaluated: roleEvaluations.length, skillEvaluated: completeRoleEvaluations.length, score, skill };
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
  const safeWorkRoster = useMemo(() => {
    const roster = new Map<string, EmployeeRecord>();
    const source = currentUser?.role === "employee" ? [...teamOverview.employees, ...employees] : employees;
    source.forEach((employee) => roster.set(employee.id, employee));
    return [...roster.values()];
  }, [currentUser?.role, employees, teamOverview.employees]);
  const safeWorkRosterById = useMemo(() => new Map(safeWorkRoster.map((employee) => [employee.id, employee])), [safeWorkRoster]);
  const activeSafeWorkRoster = safeWorkRoster.filter((employee) => employee.status === "active");
  const employeeProfilesById = useMemo(() => new Map(employeeProfiles.map((profile) => [profile.employeeId, profile])), [employeeProfiles]);
  const profileEmployee = employeesById.get(profileEmployeeId) ?? dossierEmployees[0] ?? employees.find((employee) => employee.status !== "archived") ?? null;
  const profileRecord = profileEmployee ? employeeProfilesById.get(profileEmployee.id) ?? null : null;
  const profileDocuments = profileEmployee ? applicationDocuments.filter((document) => document.employeeId === profileEmployee.id) : [];
  const profileContractDocuments = profileDocuments.filter((document) => document.documentType === "contract").sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  const profileContracts = profileEmployee ? employmentContracts.filter((contract) => contract.employeeId === profileEmployee.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [];
  const profileWarnings = profileEmployee ? employeeWarnings.filter((warning) => warning.employeeId === profileEmployee.id).slice().sort((a, b) => b.issuedDate.localeCompare(a.issuedDate) || b.updatedAt.localeCompare(a.updatedAt)) : [];
  const profileRecognitions = profileEmployee ? employeeRecognitions.filter((recognition) => recognition.employeeId === profileEmployee.id).slice().sort((a, b) => b.issuedDate.localeCompare(a.issuedDate) || b.updatedAt.localeCompare(a.updatedAt)) : [];
  const employeeRecordToday = bangkokIsoDate();
  const activeProfileWarningCount = profileWarnings.filter((warning) => warning.status === "issued" || warning.status === "acknowledged").length;
  const overdueActiveProfileRecognitionCount = profileRecognitions.filter((recognition) => recognition.status === "active" && Boolean(recognition.expiryDate) && recognition.expiryDate! < employeeRecordToday).length;
  const activeProfileRecognitionCount = profileRecognitions.filter((recognition) => recognition.status === "active" && (!recognition.expiryDate || recognition.expiryDate >= employeeRecordToday)).length;
  const employeeContracts = currentUser?.employeeId ? employmentContracts.filter((contract) => contract.employeeId === currentUser.employeeId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [];
  const contractSigningEmployee = contractToSign ? employeesById.get(contractToSign.employeeId) ?? null : null;
  const verifiedRequiredDocuments = requiredDocumentTypes.filter((type) => profileDocuments.some((document) => document.documentType === type && document.status === "verified")).length;
  const profileFilledFields = profileRecord ? [profileRecord.personalEmail, profileRecord.phone, profileRecord.birthDate, profileRecord.nationalIdLast4, profileRecord.address, profileRecord.emergencyName, profileRecord.emergencyPhone, profileRecord.startDate, profileRecord.education, profileRecord.applicationSource].filter(Boolean).length : 0;
  const dossierCompleteness = Math.round((profileFilledFields / 10 * .45 + verifiedRequiredDocuments / requiredDocumentTypes.length * .4 + (profileContracts.some((contract) => contract.status === "signed") ? .15 : 0)) * 100);
  const organizationDocumentToday = employeeRecordToday;
  const organizationDocumentExpiryWindow = addIsoDays(organizationDocumentToday, 30);
  const organizationDocumentQuery = organizationDocumentSearch.trim().toLocaleLowerCase("th");
  const visibleOrganizationDocuments = organizationDocuments
    .filter((document) => organizationDocumentCategoryFilter === "all" || document.category === organizationDocumentCategoryFilter)
    .filter((document) => organizationDocumentStatusFilter === "all" || document.status === organizationDocumentStatusFilter)
    .filter((document) => !organizationDocumentQuery || `${document.title} ${document.description} ${document.documentNumber} ${document.version} ${document.owner} ${document.note} ${organizationDocumentCategoryMeta[document.category].label}`.toLocaleLowerCase("th").includes(organizationDocumentQuery))
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const visibleOrganizationDocumentTemplates = organizationDocumentTemplates.filter((template) => {
    const categoryMatches = organizationDocumentCategoryFilter === "all" || template.category === organizationDocumentCategoryFilter;
    const queryMatches = !organizationDocumentQuery || `${template.title} ${template.description} ${organizationDocumentCategoryMeta[template.category].label}`.toLocaleLowerCase("th").includes(organizationDocumentQuery);
    return categoryMatches && queryMatches;
  });
  const overdueOrganizationDocumentCount = organizationDocuments.filter((document) => document.status === "active" && Boolean(document.expiryDate) && document.expiryDate! < organizationDocumentToday).length;
  const activeOrganizationDocumentCount = organizationDocuments.filter((document) => document.status === "active" && (!document.expiryDate || document.expiryDate >= organizationDocumentToday)).length;
  const draftOrganizationDocumentCount = organizationDocuments.filter((document) => document.status === "draft").length;
  const expiringOrganizationDocumentCount = organizationDocuments.filter((document) => document.status === "active" && Boolean(document.expiryDate) && document.expiryDate! >= organizationDocumentToday && document.expiryDate! <= organizationDocumentExpiryWindow).length;
  const warningIssueDateInvalid = employeeWarningForm.issuedDate < employeeWarningForm.incidentDate;
  const hrEmployeeInsight = hrEmployee ? workforceInsights.find(({ employee }) => employee.id === hrEmployee.id) ?? null : null;
  const projectsById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const accessiblePointLedger = useMemo(() => currentUser?.role === "employee" ? pointLedger.filter((entry) => entry.employeeId === currentUser.employeeId) : pointLedger, [currentUser, pointLedger]);
  const pointBalances = useMemo(() => {
    const balances = new Map<string, number>();
    accessiblePointLedger.forEach((entry) => balances.set(entry.employeeId, (balances.get(entry.employeeId) ?? 0) + entry.points));
    return balances;
  }, [accessiblePointLedger]);
  const pointsEarned = accessiblePointLedger.filter((entry) => entry.points > 0).reduce((sum, entry) => sum + entry.points, 0);
  const pointsDeducted = Math.abs(accessiblePointLedger.filter((entry) => entry.points < 0).reduce((sum, entry) => sum + entry.points, 0));
  const monthlyPointRecipients = new Set(pointEvents.filter((event) => event.eventType === "monthly_evaluation" && event.eventDate.startsWith(monthlyPointMonth)).map((event) => event.employeeId)).size;
  const visiblePointLedger = accessiblePointLedger
    .filter((entry) => entry.points !== 0)
    .filter((entry) => pointHistoryEmployeeId === "all" || entry.employeeId === pointHistoryEmployeeId)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const pointEconomyPolicy = activePointPolicyRules.economy;
  const pointEventRules = activePointPolicyRules.events;
  const workPointAwards = activePointPolicyRules.workAwards;
  const pointRedemptionPolicy = activePointPolicyRules.redemption;
  const manualPointEventTypes = (Object.keys(pointEventRules) as PointEventType[]).filter((eventType) => eventType !== "quest" && pointEventRules[eventType].entryMode === "manual");
  const pointOperatorRole = currentUser?.role === "admin" || currentUser?.role === "manager" ? currentUser.role : null;
  const availableManualPointEventTypes = manualPointEventTypes.filter((eventType) => pointOperatorRole ? pointEventRules[eventType].authorizedRoles.includes(pointOperatorRole) : false);
  const selectedPointEventType = availableManualPointEventTypes.includes(pointEventForm.eventType) ? pointEventForm.eventType : availableManualPointEventTypes[0] ?? pointEventForm.eventType;
  const selectedPointEventRule = pointEventRules[selectedPointEventType];
  const publishedOrganizationPolicies = organizationPolicies.filter((policy) => policy.status === "published").slice().sort((a, b) => b.version - a.version || b.updatedAt.localeCompare(a.updatedAt));
  const pointPolicyToday = bangkokIsoDate();
  const activePointPolicyRecord = publishedOrganizationPolicies
    .filter((policy) => policy.code === "points-and-rewards" && policy.category === "points_rewards" && policy.scopeType === "all" && policy.effectiveDate <= pointPolicyToday && (!policy.effectiveTo || policy.effectiveTo >= pointPolicyToday))
    .sort((a, b) => b.version - a.version)[0] ?? null;
  const activePointPolicyLabel = activePointPolicyRecord
    ? `${activePointPolicyRecord.title} · v${activePointPolicyRecord.version} · มีผล ${formatDueDate(activePointPolicyRecord.effectiveDate)}`
    : "ยังไม่มีกติกา Points ที่มีผลใช้";
  const monthlyPointFormulaLabel = `ต้องผ่าน ${pointEconomyPolicy.monthlyEvaluationMinimumScore} คะแนน · คำนวณ (คะแนน − ${pointEconomyPolicy.monthlyEvaluationBaseScore}) × ${pointEconomyPolicy.monthlyEvaluationMultiplier} · สูงสุด ${pointEconomyPolicy.monthlyEvaluationCap} Points`;
  const monthlyPointExampleScore = Math.min(100, Math.max(pointEconomyPolicy.monthlyEvaluationMinimumScore, pointEconomyPolicy.monthlyEvaluationBaseScore + 25));
  const visibleOrganizationPolicies = currentUser?.role === "admin" ? organizationPolicies.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : publishedOrganizationPolicies;
  const selectedOrganizationPolicy = visibleOrganizationPolicies.find((policy) => policy.id === selectedPolicyId) ?? visibleOrganizationPolicies[0] ?? null;
  const editingOrganizationPolicy = selectedPolicyId && selectedPolicyId !== "new" ? organizationPolicies.find((policy) => policy.id === selectedPolicyId) ?? null : null;
  const selectedPolicyAcknowledgements = selectedOrganizationPolicy ? policyAcknowledgements.filter((acknowledgement) => acknowledgement.policyId === selectedOrganizationPolicy.id && acknowledgement.policyVersion === selectedOrganizationPolicy.version) : [];
  const currentPolicyAcknowledgement = selectedPolicyAcknowledgements.find((acknowledgement) => acknowledgement.employeeId === currentUser?.employeeId) ?? null;
  const selectedPolicyAcknowledgedEmployeeCount = new Set(selectedPolicyAcknowledgements.map((acknowledgement) => acknowledgement.employeeId)).size;
  const activeEmployeeCount = employees.filter((employee) => employee.status === "active").length;
  const selectedPolicyAcknowledgementCoverage = activeEmployeeCount ? Math.min(100, Math.round(selectedPolicyAcknowledgedEmployeeCount / activeEmployeeCount * 100)) : 0;
  const pendingPolicyAcknowledgementCount = currentUser?.employeeId ? publishedOrganizationPolicies.filter((policy) => policy.acknowledgementRequired && !policyAcknowledgements.some((acknowledgement) => acknowledgement.policyId === policy.id && acknowledgement.policyVersion === policy.version && acknowledgement.employeeId === currentUser.employeeId)).length : 0;
  const complianceChecklistComplete = policyDraft.category !== "work_rules" || complianceChecklistItems.every((item) => complianceChecklist[item.id]);
  const leaderboard = useMemo(() => employees.filter((employee) => employee.status === "active").map((employee) => ({ employee, points: pointBalances.get(employee.id) ?? 0 })).sort((a, b) => b.points - a.points), [employees, pointBalances]);
  const projectInsights = useMemo(() => projects.map((project) => {
    const items = workItems.filter((item) => item.projectId === project.id);
    const progress = items.length ? items.reduce((sum, item) => sum + item.progress, 0) / items.length : 0;
    const completed = items.filter((item) => item.status === "done").length;
    return { project, items, progress, completed };
  }), [projects, workItems]);
  const weekEndDate = useMemo(() => addIsoDays(todayDate, 7), [todayDate]);
  const questPointLimit = Math.max(0, Math.min(Math.round(pointEventRules.quest.points ?? 0), Math.round(pointEconomyPolicy.standardEarnMonthlyCap)));
  const questPolicyAllowsAdminCompletion = Boolean(activePointPolicyRecord
    && pointEventRules.quest.entryMode === "manual"
    && pointEventRules.quest.authorizedRoles.includes("admin")
    && pointEconomyPolicy.positiveManualEventsPerMonth >= 1);
  const currentQuests = quests.filter((quest) => quest.status === "active");
  const filteredQuests = quests
    .filter((quest) => questTypeFilter === "all" || quest.type === questTypeFilter)
    .filter((quest) => !permissions.canManageQuests
      ? quest.status === "active"
      : questStatusFilter === "all"
        ? true
        : questStatusFilter === "archived"
          ? quest.status === "archived"
          : quest.status !== "archived")
    .slice()
    .sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured) || ({ active: 0, draft: 1, completed: 2, archived: 3 }[a.status] - { active: 0, draft: 1, completed: 2, archived: 3 }[b.status]) || a.endDate.localeCompare(b.endDate));
  const activeQuestPoints = currentQuests.reduce((sum, quest) => sum + quest.pointsReward, 0);
  const activeQuestRewards = currentQuests.filter((quest) => Boolean(quest.rewardId)).length;
  const questProgressAverage = currentQuests.length ? Math.round(currentQuests.reduce((sum, quest) => sum + quest.progress, 0) / currentQuests.length) : 0;
  const questSelectedReward = questForm.rewardId ? rewards.find((reward) => reward.id === questForm.rewardId) ?? null : null;
  const questPreservesInactiveReward = Boolean(editingQuest?.rewardId && editingQuest.rewardId === questForm.rewardId && !(editingQuest.status === "draft" && questForm.status === "active"));
  const questRewardUnavailable = Boolean(questForm.rewardId) && !questSelectedReward?.isActive && !questPreservesInactiveReward;
  const questPointsInvalid = !Number.isInteger(questForm.pointsReward) || questForm.pointsReward < 0 || questForm.pointsReward > questPointLimit;
  const questStatusRequiresPolicy = questForm.status === "active" || questForm.status === "completed";
  const questPolicyUnavailable = questStatusRequiresPolicy && !activePointPolicyRecord;
  const questPolicyDisablesCompletions = questStatusRequiresPolicy && Boolean(activePointPolicyRecord) && !questPolicyAllowsAdminCompletion;
  const editingQuestHasCompletions = Boolean(editingQuest && questCompletions.some((completion) => completion.questId === editingQuest.id));
  const questAllowedStatuses: QuestRecord["status"][] = !editingQuest
    ? ["draft", "active"]
    : editingQuest.status === "draft"
      ? ["draft", "active"]
      : editingQuest.status === "active"
        ? ["active", "completed"]
        : editingQuest.status === "completed"
          ? ["completed"]
          : [];
  const questTargetInvalid = questForm.type === "individual"
    ? questForm.targetEmployeeIds.length !== 1 || questForm.targetDepartmentIds.length !== 0
    : questForm.type === "team"
      ? questForm.targetDepartmentIds.length === 0 || questForm.targetEmployeeIds.length !== 0
      : questForm.targetEmployeeIds.length !== 0 || questForm.targetDepartmentIds.length !== 0;
  const questAudienceLabel = (quest: QuestRecord) => {
    if (quest.type === "activity") return "ทุกคนในองค์กร";
    if (quest.type === "individual") return quest.targetEmployeeIds.map((employeeId) => employeesById.get(employeeId)?.name ?? quest.targetEmployees?.find((target) => target.id === employeeId)?.label ?? "พนักงานที่กำหนด").join(", ");
    return quest.targetDepartmentIds.map((departmentId) => departmentFilters.find((department) => department.id === departmentId)?.label ?? quest.targetDepartments?.find((target) => target.id === departmentId)?.label ?? "ทีมที่กำหนด").join(", ");
  };
  const activeEmployees = employees.filter((employee) => employee.status === "active");
  const questCompletionsByQuest = new Map<string, QuestCompletionRecord[]>();
  questCompletions.forEach((completion) => questCompletionsByQuest.set(completion.questId, [...(questCompletionsByQuest.get(completion.questId) ?? []), completion]));
  questCompletionsByQuest.forEach((items) => items.sort((a, b) => b.completedAt.localeCompare(a.completedAt)));
  const eligibleEmployeesForQuest = (quest: QuestRecord, includeCompleted = false) => {
    const completedEmployeeIds = new Set((questCompletionsByQuest.get(quest.id) ?? []).map((completion) => completion.employeeId));
    return activeEmployees.filter((employee) => {
      const belongsToScope = quest.type === "activity"
        || (quest.type === "individual" && quest.targetEmployeeIds.includes(employee.id))
        || (quest.type === "team" && quest.targetDepartmentIds.includes(getRole(employee.roleId).departmentId));
      const canReceiveFromCurrentAdmin = employee.id !== currentUser?.employeeId;
      return belongsToScope && canReceiveFromCurrentAdmin && (includeCompleted || !completedEmployeeIds.has(employee.id));
    });
  };
  const selectedQuestCompletions = questToFulfill ? questCompletionsByQuest.get(questToFulfill.id) ?? [] : [];
  const selectedQuestEligibleEmployees = questToFulfill ? eligibleEmployeesForQuest(questToFulfill) : [];
  const questCompletionPolicyFloorDate = addIsoDays(todayDate, -90);
  const questCompletionMinDate = questToFulfill && questToFulfill.startDate > questCompletionPolicyFloorDate ? questToFulfill.startDate : questCompletionPolicyFloorDate;
  const questCompletionMaxDate = questToFulfill && questToFulfill.endDate < todayDate ? questToFulfill.endDate : todayDate;
  const questCompletionPolicy = publishedOrganizationPolicies
    .filter((policy) => policy.code === "points-and-rewards" && policy.category === "points_rewards" && policy.scopeType === "all" && policy.effectiveDate <= questCompletionForm.completionDate && (!policy.effectiveTo || policy.effectiveTo >= questCompletionForm.completionDate))
    .sort((a, b) => b.version - a.version)[0] ?? null;
  const questCompletionPolicyRules = resolvePointPolicyRules(questCompletionPolicy?.rules);
  const questCompletionPointLimit = Math.max(0, Math.min(Math.round(questCompletionPolicyRules.events.quest.points ?? 0), Math.round(questCompletionPolicyRules.economy.standardEarnMonthlyCap)));
  const questCompletionPolicyAllowsAdminCompletion = Boolean(questCompletionPolicy
    && questCompletionPolicyRules.events.quest.entryMode === "manual"
    && questCompletionPolicyRules.events.quest.authorizedRoles.includes("admin")
    && questCompletionPolicyRules.economy.positiveManualEventsPerMonth >= 1);
  const questCompletionPolicyLabel = questCompletionPolicy
    ? `${questCompletionPolicy.title} · v${questCompletionPolicy.version} · มีผล ${formatDueDate(questCompletionPolicy.effectiveDate)}`
    : "ไม่พบนโยบาย Points ที่มีผลในวันที่เลือก";
  const questCompletionMonth = questCompletionForm.completionDate.slice(0, 7);
  const questCompletionMonthlyLimit = questCompletionPolicyRules.economy.positiveManualEventsPerMonth;
  const questCompletionMonthlyCount = pointEvents.filter((event) => event.employeeId === questCompletionForm.employeeId && event.eventType === "quest" && event.eventDate.startsWith(questCompletionMonth)).length;
  const questCompletionMonthlyLimitReached = Boolean(questCompletionPolicyAllowsAdminCompletion && questCompletionForm.employeeId && questCompletionMonthlyCount >= questCompletionMonthlyLimit);
  const questCompletionPositiveEventPoints = pointEvents.filter((event) => event.employeeId === questCompletionForm.employeeId && event.eventDate.startsWith(questCompletionMonth) && event.eventType !== "monthly_evaluation" && event.points > 0).reduce((sum, event) => sum + event.points, 0);
  const questCompletionWorkAwardPoints = pointLedger.filter((entry) => entry.employeeId === questCompletionForm.employeeId && (entry.sourceType === "task" || entry.sourceType === "mission") && bangkokIsoMonth(entry.createdAt) === questCompletionMonth && entry.points > 0).reduce((sum, entry) => sum + entry.points, 0);
  const questCompletionProjectedStandardPoints = questCompletionPositiveEventPoints + questCompletionWorkAwardPoints + (questToFulfill?.pointsReward ?? 0);
  const questCompletionStandardCap = questCompletionPolicyRules.economy.standardEarnMonthlyCap;
  const questCompletionStandardCapExceeded = Boolean(questCompletionForm.employeeId && questCompletionProjectedStandardPoints > questCompletionStandardCap);
  const questCompletionReward = questToFulfill?.rewardId ? rewards.find((reward) => reward.id === questToFulfill.rewardId) ?? null : null;
  const questCompletionRewardUnavailable = Boolean(questToFulfill?.rewardId && (!questCompletionReward?.isActive || questCompletionReward.stock <= 0));
  const questCompletionDateInvalid = Boolean(questToFulfill && (questCompletionMinDate > questCompletionMaxDate || questCompletionForm.completionDate < questCompletionMinDate || questCompletionForm.completionDate > questCompletionMaxDate));
  const questCompletionEvidenceInvalid = !isHttpsUrl(questCompletionForm.evidenceUrl.trim());
  const questCompletionEmployeeInvalid = !selectedQuestEligibleEmployees.some((employee) => employee.id === questCompletionForm.employeeId);
  const questCompletionNoteInvalid = !questCompletionForm.note.trim() || Array.from(questCompletionForm.note.trim()).length > 1000;
  const questCompletionPointsInvalid = Boolean(questToFulfill && questToFulfill.pointsReward > questCompletionPointLimit);
  const questCompletionReady = Boolean(questToFulfill
    && (questToFulfill.status === "active" || questToFulfill.status === "completed")
    && questCompletionPolicyAllowsAdminCompletion
    && !questCompletionEmployeeInvalid
    && !questCompletionDateInvalid
    && !questCompletionEvidenceInvalid
    && !questCompletionPointsInvalid
    && !questCompletionMonthlyLimitReached
    && !questCompletionStandardCapExceeded
    && !questCompletionRewardUnavailable
    && !questCompletionNoteInvalid);
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
  const nextSkillOpportunities = peopleOpsRole ? peopleOpsRole.skills.filter((skill) => skill.eligibleForAllowance !== false).map((skill) => {
    const currentLevel = peopleOpsEvaluation?.skillScores[skill.id] ?? 0;
    const highestVerifiedLevel = peopleOpsAchievements.filter((achievement) => achievement.skillId === skill.id).reduce((highest, achievement) => Math.max(highest, achievement.level), 0);
    return { skill, currentLevel, highestVerifiedLevel, allowance: skillAllowanceFor(peopleOpsRole.id, currentLevel), canVerify: currentLevel >= 2 && currentLevel > highestVerifiedLevel };
  }) : [];
  const employeeGrowthSkills = peopleOpsRole ? peopleOpsRole.skills.map((skill) => ({
    skill,
    currentLevel: peopleOpsEvaluation?.skillScores[skill.id] ?? 0,
    gap: Math.max(0, skill.targetLevel - (peopleOpsEvaluation?.skillScores[skill.id] ?? 0)),
  })).sort((a, b) => b.gap - a.gap || b.skill.targetLevel - a.skill.targetLevel) : [];
  const growthTeam = activeEmployees.map((employee) => {
    const role = getRole(employee.roleId);
    const evaluation = evaluationsByEmployee.get(employee.id) ?? null;
    const openWork = workItems.filter((item) => item.assigneeEmployeeId === employee.id && item.status !== "done").length;
    const strength = evaluation ? role.skills.slice().sort((a, b) => (evaluation.skillScores[b.id] ?? 0) - (evaluation.skillScores[a.id] ?? 0))[0]?.name ?? role.shortName : role.shortName;
    return { employee, role, evaluation, openWork, strength };
  }).sort((a, b) => a.openWork - b.openWork || (b.evaluation?.skillScore ?? 0) - (a.evaluation?.skillScore ?? 0)).filter((candidate, index, all) => all.findIndex((item) => item.role.departmentId === candidate.role.departmentId) === index).slice(0, 4);
  const employeeAssignedWorkItems = useMemo(() => currentUser?.role === "employee" && currentUser.employeeId
    ? workItems.filter((item) => item.assigneeEmployeeId === currentUser.employeeId)
    : [], [currentUser, workItems]);
  const employeeCreatedWorkItems = useMemo(() => currentUser?.role === "employee" && currentUser.employeeId
    ? workItems.filter((item) => workItemCreatorId(item) === currentUser.employeeId)
    : [], [currentUser, workItems]);
  const workListScopeItems = useMemo(() => currentUser?.role === "employee"
    ? employeeTaskScope === "created" ? employeeCreatedWorkItems : employeeAssignedWorkItems
    : workItems, [currentUser, employeeAssignedWorkItems, employeeCreatedWorkItems, employeeTaskScope, workItems]);
  const todayWorkItems = workListScopeItems.filter((item) => item.status !== "done" && item.dueDate === todayDate);
  const overdueWorkItems = workListScopeItems.filter((item) => item.status !== "done" && item.dueDate < todayDate);
  const dueThisWeekWorkItems = workListScopeItems.filter((item) => item.status !== "done" && item.dueDate >= todayDate && item.dueDate <= weekEndDate);
  const reviewQueueWorkItems = workListScopeItems.filter((item) => item.status === "review");
  const employeeAssignedTodayCount = employeeAssignedWorkItems.filter((item) => item.status !== "done" && item.dueDate === todayDate).length;
  const employeeAssignedReviewCount = employeeAssignedWorkItems.filter((item) => item.status === "review").length;
  const notificationReadIds = useMemo(() => new Set(notificationReads.map((item) => item.notificationId)), [notificationReads]);
  const historicalRewardTitlesByRedemption = useMemo(() => {
    const titles = new Map<string, string>();
    const notePrefix = "แลกรางวัล: ";
    accessiblePointLedger.forEach((entry) => {
      if (entry.sourceType !== "redemption" || entry.points >= 0 || !entry.note.startsWith(notePrefix) || titles.has(entry.sourceId)) return;
      const historicalTitle = entry.note.slice(notePrefix.length).trim();
      if (historicalTitle) titles.set(entry.sourceId, historicalTitle);
    });
    return titles;
  }, [accessiblePointLedger]);
  const notifications = useMemo<AppNotification[]>(() => {
    const items: AppNotification[] = [];
    quests.filter((quest) => quest.status === "active").forEach((quest) => {
      items.push({
        id: `quest-center:${quest.id}:${quest.revision}`,
        kind: "quest",
        title: `${quest.isFeatured ? "เควสเด่น" : "มีเควสใหม่"}: ${quest.title}`,
        message: `${questTypeMeta[quest.type].shortLabel} · ประกาศสิทธิ์ ${formatMoney(quest.pointsReward)} Points${quest.rewardId ? ` + ${quest.rewardTitleSnapshot || "รางวัลพิเศษ"}` : ""}`,
        createdAt: quest.updatedAt,
        questId: quest.id,
        actionLabel: "เปิดศูนย์เควส",
      });
    });
    workItems.forEach((item) => {
      const employeeName = employeesById.get(item.assigneeEmployeeId)?.name ?? "พนักงาน";
      const projectName = projectsById.get(item.projectId)?.name ?? "งานทั่วไป";
      if (item.kind === "mission" && item.status !== "done") {
        items.push({
          id: `quest:${item.id}`,
          kind: "quest",
          title: `มีเควส: ${item.title}`,
          message: `${employeeName} · ${projectName} · รับ ${formatMoney(item.points)} Points เมื่อสำเร็จ`,
          createdAt: item.createdAt,
          workItemId: item.id,
          dueFilter: "all",
          actionLabel: "เปิดเควส",
        });
      }
      if (item.status !== "done" && item.dueDate === todayDate) {
        items.push({
          id: `deadline-today:${item.id}:${item.dueDate}`,
          kind: "deadline",
          title: `งานครบกำหนดวันนี้: ${item.title}`,
          message: `${employeeName} · ความคืบหน้า ${item.progress}%`,
          createdAt: item.updatedAt,
          workItemId: item.id,
          dueFilter: "today",
          actionLabel: "ดูงานวันนี้",
        });
      } else if (item.status !== "done" && item.dueDate < todayDate) {
        items.push({
          id: `deadline-overdue:${item.id}:${item.dueDate}`,
          kind: "deadline",
          title: `งานเกินกำหนด: ${item.title}`,
          message: `${employeeName} · กำหนดส่ง ${formatDueDate(item.dueDate)} · คืบหน้า ${item.progress}%`,
          createdAt: item.updatedAt,
          workItemId: item.id,
          dueFilter: "overdue",
          actionLabel: "จัดการงาน",
        });
      }
      if (item.status === "review" && permissions.canReviewWork) {
        const latestSubmission = workSubmissions
          .filter((submission) => submission.workItemId === item.id && submission.status === "submitted")
          .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0];
        items.push({
          id: `review:${item.id}:${latestSubmission?.id ?? item.updatedAt}`,
          kind: "review",
          title: `มีงานรอตรวจ: ${item.title}`,
          message: `${employeeName} ส่งหลักฐานแล้ว รอหัวหน้าตรวจและให้คะแนน`,
          createdAt: latestSubmission?.submittedAt ?? item.updatedAt,
          workItemId: item.id,
          dueFilter: "review",
          actionLabel: "ตรวจงาน",
        });
      }
    });
    rewardRedemptions
      .filter((redemption) => redemption.status === "requested" && (currentUser?.role === "admin" || redemption.employeeId === currentUser?.employeeId))
      .forEach((redemption) => {
        const employeeName = employeesById.get(redemption.employeeId)?.name ?? "พนักงาน";
        const reward = rewards.find((item) => item.id === redemption.rewardId);
        const historicalRewardTitle = historicalRewardTitlesByRedemption.get(redemption.id) ?? reward?.title ?? "รางวัล";
        items.push({
          id: `reward:${redemption.id}`,
          kind: "reward",
          title: currentUser?.role === "admin" ? `มีคำขอแลกรางวัลจาก ${employeeName}` : "คำขอแลกรางวัลกำลังรออนุมัติ",
          message: `${historicalRewardTitle} · ใช้ ${formatMoney(redemption.pointsSpent)} Points`,
          createdAt: redemption.createdAt,
          actionLabel: "ดูรางวัล",
        });
      });
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [currentUser?.employeeId, currentUser?.role, employeesById, historicalRewardTitlesByRedemption, permissions.canReviewWork, projectsById, quests, rewardRedemptions, rewards, todayDate, workItems, workSubmissions]);
  const unreadNotifications = notifications.filter((item) => !notificationReadIds.has(item.id));
  const questNotificationCount = notifications.filter((item) => item.kind === "quest").length;
  const visibleNotifications = notifications.filter((item) => notificationFilter === "all" || (notificationFilter === "unread" && !notificationReadIds.has(item.id)) || (notificationFilter === "quest" && item.kind === "quest"));
  const officePeople = useMemo<OfficePersonModel[]>(() => {
    const priorityWeight: Record<WorkItemRecord["priority"], number> = { low: .7, medium: 1, high: 1.4, urgent: 1.8 };
    const statusWeight: Record<Exclude<WorkItemRecord["status"], "done">, number> = { todo: 0, in_progress: .4, review: .2 };
    return officeSourceEmployees
      .filter((employee) => employee.status === "active")
      .map((employee) => {
        const role = getRole(employee.roleId);
        const assignedItems = officeSourceWorkItems.filter((item) => item.assigneeEmployeeId === employee.id);
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
  }, [officeSourceEmployees, officeSourceWorkItems, todayDate]);
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
    return workListScopeItems.filter((item) => {
      const project = projectsById.get(item.projectId);
      const assignee = safeWorkRosterById.get(item.assigneeEmployeeId);
      const creator = safeWorkRosterById.get(workItemCreatorId(item));
      const departmentMatches = activeDepartment === "all" || project?.departmentId === activeDepartment;
      const kindMatches = workFilter === "all" || item.kind === workFilter;
      const assigneeMatches = currentUser?.role === "employee" || workAssigneeFilter === "all" || item.assigneeEmployeeId === workAssigneeFilter;
      const dueMatches = (workDueFilter === "all" && item.status !== "done")
        || (workDueFilter === "today" && item.status !== "done" && item.dueDate === todayDate)
        || (workDueFilter === "overdue" && item.status !== "done" && item.dueDate < todayDate)
        || (workDueFilter === "week" && item.status !== "done" && item.dueDate >= todayDate && item.dueDate <= weekEndDate)
        || (workDueFilter === "review" && item.status === "review")
        || (workDueFilter === "done" && item.status === "done");
      const queryMatches = !query || `${item.title} ${item.description} ${project?.name ?? ""} ${assignee?.name ?? ""} ${creator?.name ?? ""}`.toLocaleLowerCase("th").includes(query);
      return departmentMatches && kindMatches && assigneeMatches && dueMatches && queryMatches;
    }).sort((a, b) => {
      if (a.status === "done" && b.status !== "done") return 1;
      if (a.status !== "done" && b.status === "done") return -1;
      const dueOrder = a.dueDate.localeCompare(b.dueDate);
      return dueOrder || priorityRank[a.priority] - priorityRank[b.priority];
    });
  }, [activeDepartment, currentUser?.role, projectsById, safeWorkRosterById, todayDate, weekEndDate, workAssigneeFilter, workDueFilter, workFilter, workListScopeItems, workSearch]);
  const workCompletion = workListScopeItems.length ? workListScopeItems.filter((item) => item.status === "done").length / workListScopeItems.length * 100 : 0;
  const workSubmissionsByItem = useMemo(() => {
    const grouped = new Map<string, WorkSubmissionRecord[]>();
    workSubmissions.slice().sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)).forEach((submission) => {
      grouped.set(submission.workItemId, [...(grouped.get(submission.workItemId) ?? []), submission]);
    });
    return grouped;
  }, [workSubmissions]);
  const portfolioEntries = useMemo(() => workItems
    .filter((item) => currentUser?.role !== "employee" || item.assigneeEmployeeId === currentUser.employeeId)
    .map((item) => {
      const submissions = workSubmissionsByItem.get(item.id) ?? [];
      const approvedSubmission = submissions.find((submission) => submission.status === "approved") ?? null;
      const latestSubmission = submissions[0] ?? null;
      let status: Exclude<PortfolioStatusFilter, "all"> = "missing";
      if (approvedSubmission) status = "approved";
      else if (latestSubmission) status = latestSubmission.status;
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
    .sort((a, b) => b.sortDate.localeCompare(a.sortDate)), [currentUser, employeesById, evaluationsByEmployee, projectsById, workItems, workSubmissionsByItem]);
  const portfolioFilterMatches = useMemo(() => {
    const query = portfolioSearch.trim().toLocaleLowerCase("th");
    return portfolioEntries.filter((entry) => {
      const departmentMatches = activeDepartment === "all" || entry.project?.departmentId === activeDepartment;
      const employeeMatches = portfolioEmployeeId === "all" || entry.item.assigneeEmployeeId === portfolioEmployeeId;
      const projectMatches = portfolioProjectId === "all" || entry.item.projectId === portfolioProjectId;
      const evidenceText = entry.submissions.map((submission) => `${submission.title} ${submission.fileName} ${submission.linkUrl} ${submission.note} ${submission.submittedBy} ${submission.reviewedBy ?? ""}`).join(" ");
      const queryMatches = !query || `${entry.item.title} ${entry.item.description} ${entry.employee?.name ?? ""} ${getRole(entry.employee?.roleId ?? "").name} ${entry.project?.name ?? ""} ${evidenceText}`.toLocaleLowerCase("th").includes(query);
      return departmentMatches && employeeMatches && projectMatches && queryMatches;
    });
  }, [activeDepartment, portfolioEmployeeId, portfolioEntries, portfolioProjectId, portfolioSearch]);
  const visiblePortfolioEntries = useMemo(() => portfolioStatus === "all"
    ? portfolioFilterMatches
    : portfolioFilterMatches.filter((entry) => entry.status === portfolioStatus), [portfolioFilterMatches, portfolioStatus]);
  const portfolioStatusCounts = useMemo(() => ({
    all: portfolioFilterMatches.length,
    approved: portfolioFilterMatches.filter((entry) => entry.status === "approved").length,
    submitted: portfolioFilterMatches.filter((entry) => entry.status === "submitted").length,
    revision: portfolioFilterMatches.filter((entry) => entry.status === "revision").length,
    missing: portfolioFilterMatches.filter((entry) => entry.status === "missing").length,
  }), [portfolioFilterMatches]);
  const portfolioPeople = new Set(portfolioEntries.map((entry) => entry.item.assigneeEmployeeId)).size;
  const portfolioApprovedCount = portfolioEntries.filter((entry) => entry.status === "approved").length;
  const portfolioAssetCount = workSubmissions.reduce((sum, submission) => sum + Number(Boolean(submission.linkUrl)) + Number(Boolean(submission.storageKey)), 0);
  const portfolioEvaluations = [...new Set(portfolioEntries.map((entry) => entry.item.assigneeEmployeeId))]
    .map((employeeId) => evaluationsByEmployee.get(employeeId))
    .filter((evaluation): evaluation is EvaluationRecord => Boolean(evaluation));
  const portfolioAverageScore = portfolioEvaluations.length ? portfolioEvaluations.reduce((sum, evaluation) => sum + evaluation.totalScore, 0) / portfolioEvaluations.length : 0;
  const focusedPortfolioEmployee = portfolioEmployeeId === "all" ? null : employeesById.get(portfolioEmployeeId) ?? null;
  const focusedPortfolioEvaluation = focusedPortfolioEmployee ? evaluationsByEmployee.get(focusedPortfolioEmployee.id) ?? null : null;
  const focusedPortfolioProject = portfolioProjectId === "all" ? null : projectsById.get(portfolioProjectId) ?? null;
  const focusedPortfolioDepartment = activeDepartment === "all" ? null : departmentFilters.find((department) => department.id === activeDepartment) ?? null;
  const hasPortfolioFilters = Boolean(portfolioSearch.trim() || activeDepartment !== "all" || portfolioProjectId !== "all" || portfolioStatus !== "all" || (currentUser?.role !== "employee" && portfolioEmployeeId !== "all"));
  const visiblePortfolioAssetCount = visiblePortfolioEntries.reduce((total, entry) => total + entry.submissions.reduce((count, submission) => count + Number(Boolean(submission.linkUrl)) + Number(Boolean(submission.storageKey)), 0), 0);
  const activeWorkSubmissions = submissionWorkItem ? workSubmissionsByItem.get(submissionWorkItem.id) ?? [] : [];
  const submissionAssignee = submissionWorkItem ? safeWorkRosterById.get(submissionWorkItem.assigneeEmployeeId) ?? null : null;
  const activeProofGuide = submissionAssignee ? roleProofGuides[submissionAssignee.roleId] ?? defaultProofGuide : defaultProofGuide;
  const canSubmitActiveWorkProof = Boolean(!isEmployeePreview && currentUser?.role === "employee" && currentUser.employeeId && currentUser.employeeId === submissionWorkItem?.assigneeEmployeeId);
  const totalPoints = [...pointBalances.values()].reduce((sum, points) => sum + points, 0);
  const allPowerProfiles = useMemo(
    () => officeSourceEmployees
      .filter((employee) => employee.status === "active")
      .map((employee) => buildEmployeePower(
        employee,
        powerEvaluationsByEmployee.get(employee.id) ?? null,
        officeSourceWorkItems.filter((item) => item.assigneeEmployeeId === employee.id),
      ))
      .sort((a, b) => (b.overall ?? -1) - (a.overall ?? -1)),
    [officeSourceEmployees, officeSourceWorkItems, powerEvaluationsByEmployee],
  );
  const visiblePowerProfiles = allPowerProfiles.filter(({ employee }) => {
    const role = getRole(employee.roleId);
    const query = search.trim().toLocaleLowerCase("th");
    const departmentMatches = activeDepartment === "all" || role.departmentId === activeDepartment;
    const queryMatches = !query || `${employee.name} ${role.name} ${role.department}`.toLocaleLowerCase("th").includes(query);
    return departmentMatches && queryMatches;
  });
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
  const skillProfileEvaluation = skillProfileEmployee
    ? (currentUser?.role === "employee" && currentUser.employeeId === skillProfileEmployee.id
      ? selfAssessmentsByEmployee.get(skillProfileEmployee.id) ?? evaluationsByEmployee.get(skillProfileEmployee.id) ?? null
      : evaluationsByEmployee.get(skillProfileEmployee.id) ?? null)
    : null;
  const skillProfileAssessedCount = skillProfileRole
    ? skillProfileRole.skills.filter((skill) => {
      const level = skillProfileEvaluation?.skillScores[skill.id];
      return typeof level === "number" && level >= 1 && level <= 5;
    }).length
    : 0;
  const skillProfileComplete = Boolean(skillProfileRole && skillProfileEvaluation && skillProfileAssessedCount === skillProfileRole.skills.length);
  const skillProfileScore = skillProfileComplete && skillProfileRole && skillProfileEvaluation
    ? calculateSkillScore(skillProfileRole, skillProfileEvaluation.skillScores)
    : null;
  const skillProfileTalent = skillProfileEmployee ? buildTalentProfile(skillProfileEmployee.roleId, skillProfileEvaluation) : emptyTalentProfile();
  const roleFitRecommendations = skillProfileEvaluation
    ? roles.map((role) => ({ role, score: calculateRoleFit(skillProfileTalent, role.id) })).sort((a, b) => b.score - a.score)
    : [];
  const kpiTotal = selectedRole
    ? selectedRole.kpis.reduce((sum, kpi) => sum + (kpiScores[kpi.id] ?? 0) * kpi.weight / 100, 0)
    : 0;
  const ratedSkillCount = selectedRole
    ? selectedRole.skills.filter((skill) => typeof skillScores[skill.id] === "number" && skillScores[skill.id] >= 1 && skillScores[skill.id] <= 5).length
    : 0;
  const skillAssessmentComplete = Boolean(selectedRole && ratedSkillCount === selectedRole.skills.length);
  const skillTotal = selectedRole ? calculateSkillScore(selectedRole, skillScores) : 0;
  const grandTotal = kpiTotal * 0.7 + skillTotal * 0.3;
  const selectedSkillCategory = skillCategories.find((category) => category.id === skillCategoryFilter) ?? skillCategories[0];
  const selectedCategorySkills = selectedRole?.skills.filter((skill) => (skill.category ?? "role") === selectedSkillCategory.id) ?? [];

  const showToast = (message: string, tone: "success" | "error" = "success") => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    setToast({ message, tone });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, tone === "error" ? 5200 : 2800);
  };

  const showErrorToast = (error: unknown, fallback: string) => {
    showToast(error instanceof Error ? error.message : fallback, "error");
  };

  const reloadAfterAuthentication = () => {
    setAuthGate(null);
    setAccessDenied(null);
    setDataWarning("");
    setIsLoading(true);
    setDashboardReloadKey((key) => key + 1);
  };

  const logout = async (allDevices = false) => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    setShowUserMenu(false);
    setShowNotifications(false);
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ allDevices }),
      });
      const body = await response.json().catch(() => ({})) as { loggedOut?: boolean; error?: string };
      if (!response.ok || !body.loggedOut) throw new Error(body.error || "ออกจากระบบไม่สำเร็จ กรุณาลองใหม่");
      window.location.replace("/");
    } catch (error) {
      setIsLoggingOut(false);
      showErrorToast(error, "ออกจากระบบไม่สำเร็จ กรุณาลองใหม่");
    }
  };

  const copyCredential = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      showToast(`คัดลอก${label}แล้ว`);
    } catch {
      showToast(`คัดลอก${label}ไม่สำเร็จ กรุณาเลือกข้อความแล้วคัดลอก`, "error");
    }
  };

  useEffect(() => () => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
  }, []);

  const guardEmployeePreviewMutation = (actionLabel: string) => {
    if (!isEmployeePreview) return false;
    showToast(`โหมดทดลองเป็นแบบอ่านอย่างเดียว จึงไม่สามารถ${actionLabel}ได้`, "error");
    return true;
  };

  const markNotificationsRead = async (notificationIds: string[]) => {
    if (isEmployeePreview) return;
    const unreadIds = [...new Set(notificationIds)].filter((id) => !notificationReadIds.has(id));
    if (!unreadIds.length || !currentUser) return;
    const previousReads = notificationReads;
    const readAt = new Date().toISOString();
    setNotificationReads((items) => [
      ...items,
      ...unreadIds.map((notificationId) => ({ id: `${currentUser.id}:${notificationId}`, userKey: currentUser.id, notificationId, readAt })),
    ]);
    try {
      const response = await fetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "markNotificationsRead", notificationIds: unreadIds }),
      });
      const body = await response.json() as { notificationReads?: NotificationReadRecord[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "บันทึกสถานะแจ้งเตือนไม่สำเร็จ");
      if (body.notificationReads?.length) {
        const savedById = new Map(body.notificationReads.map((item) => [item.notificationId, item]));
        setNotificationReads((items) => items.map((item) => savedById.get(item.notificationId) ?? item));
      }
    } catch (error) {
      setNotificationReads(previousReads);
      showErrorToast(error, "บันทึกสถานะแจ้งเตือนไม่สำเร็จ");
    }
  };

  const openNotification = (notification: AppNotification) => {
    void markNotificationsRead([notification.id]);
    setShowNotifications(false);
    if (notification.kind === "reward") {
      setView("work");
      setWorkSection("rewards");
      return;
    }
    if (notification.questId) {
      setView("work");
      setWorkSection("quests");
      setQuestTypeFilter("all");
      setQuestStatusFilter("current");
      window.setTimeout(() => document.querySelector<HTMLElement>(`.quest-card[data-quest-id="${CSS.escape(notification.questId ?? "")}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 40);
      return;
    }
    const notificationWorkItem = notification.workItemId ? workItems.find((item) => item.id === notification.workItemId) : null;
    if (currentUser?.role === "employee" && currentUser.employeeId && notificationWorkItem) {
      const isOutgoingTeamTask = workItemCreatorId(notificationWorkItem) === currentUser.employeeId && notificationWorkItem.assigneeEmployeeId !== currentUser.employeeId;
      setEmployeeTaskScope(isOutgoingTeamTask ? "created" : "assigned");
    }
    setView("work");
    setWorkSection("tasks");
    setWorkDueFilter(notification.dueFilter ?? "all");
    setWorkFilter(notification.kind === "quest" ? "mission" : "all");
    setWorkSearch(notificationWorkItem?.title ?? "");
  };

  const comparePowerProfile = (employeeId: string) => {
    if (!powerLeft) {
      setPowerLeftId(employeeId);
    } else if (powerLeft.employee.id === employeeId) {
      showToast("พนักงานคนนี้อยู่ในการ์ดฝั่ง A แล้ว", "error");
      return;
    } else {
      setPowerRightId(employeeId);
    }
    window.setTimeout(() => document.getElementById("power-arena")?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
  };

  const openEvaluation = (employee: EmployeeRecord) => {
    if (currentUser?.role === "employee" && currentUser.employeeId !== employee.id) {
      showToast("พนักงานประเมินตนเองได้เฉพาะโปรไฟล์ของตน", "error");
      return;
    }
    if (isEmployeePreview) {
      showToast("โหมดทดลองเป็นแบบอ่านอย่างเดียว จึงบันทึกแบบประเมินไม่ได้", "error");
      return;
    }
    const role = getRole(employee.roleId);
    const existing = currentUser?.role === "employee"
      ? selfAssessmentsByEmployee.get(employee.id) ?? null
      : evaluationsByEmployee.get(employee.id) ?? fallbackEvaluation(employee);
    setSelectedEmployee(employee);
    setKpiScores(Object.fromEntries(role.kpis.map((kpi) => [kpi.id, existing?.kpiScores[kpi.id] ?? 80])));
    setSkillScores(Object.fromEntries(role.skills.flatMap((skill) => {
      const level = existing?.skillScores[skill.id];
      return typeof level === "number" && level >= 1 && level <= 5 ? [[skill.id, level]] : [];
    })));
    setSkillCategoryFilter("role");
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
      showErrorToast(error, "บันทึกแผนบุคลากรไม่สำเร็จ");
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
      showErrorToast(error, "อัปเดตสถานะไม่สำเร็จ");
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
      showErrorToast(error, "บันทึกเวลาไม่สำเร็จ");
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
      showErrorToast(error, "ลงเวลาไม่สำเร็จ");
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
      showErrorToast(error, "อัปเดตคำขอลาไม่สำเร็จ");
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
      showErrorToast(error, "ยืนยันสกิลไม่สำเร็จ");
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
    const employeeCoordinationCreate = currentUser?.role === "employee" && !item;
    if (employeeCoordinationCreate && (!permissions.canAssignTeamWork || guardEmployeePreviewMutation("สร้างงานประสานทีม"))) return;
    const defaultEmployeeRecipient = currentUser?.employeeId && activeSafeWorkRoster.some((employee) => employee.id === currentUser.employeeId)
      ? currentUser.employeeId
      : activeSafeWorkRoster[0]?.id ?? "";
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
      projectId: employeeCoordinationCreate ? "" : projects[0]?.id ?? "",
      assigneeEmployeeId: employeeCoordinationCreate ? defaultEmployeeRecipient : employees[0]?.id ?? "",
      kind: employeeCoordinationCreate ? "request" : "task",
      title: "",
      description: "",
      priority: "medium",
      status: "todo",
      progress: 0,
      points: employeeCoordinationCreate ? 0 : workPointValue("task", "medium", activePointPolicyRules),
      dueDate: addIsoDays(todayDate, 7),
    });
    setShowWorkForm(true);
  };

  const saveWorkItem = async (event: React.FormEvent) => {
    event.preventDefault();
    const employeeCoordinationCreate = currentUser?.role === "employee" && !editingWorkItem;
    if (employeeCoordinationCreate && (!permissions.canAssignTeamWork || guardEmployeePreviewMutation("สร้างงานประสานทีม"))) return;
    setIsSaving(true);
    try {
      const requestBody = employeeCoordinationCreate
        ? { action: "saveWorkItem", projectId: workForm.projectId, assigneeEmployeeId: workForm.assigneeEmployeeId, kind: "request", title: workForm.title, description: workForm.description, priority: workForm.priority, status: "todo", progress: 0, points: 0, dueDate: workForm.dueDate }
        : { action: "saveWorkItem", workItemId: editingWorkItem?.id, ...workForm };
      const response = await fetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(requestBody) });
      const body = await response.json() as { workItem?: WorkItemRecord; project?: ProjectRecord; pointEntry?: PointLedgerRecord | null; error?: string };
      if (!response.ok || !body.workItem) throw new Error(body.error ?? "บันทึกงานไม่สำเร็จ");
      setWorkItems((items) => [...items.filter((item) => item.id !== body.workItem?.id), body.workItem as WorkItemRecord]);
      if (body.project) setProjects((items) => [...items.filter((project) => project.id !== body.project?.id), body.project as ProjectRecord]);
      if (body.pointEntry) setPointLedger((items) => [...items.filter((item) => item.id !== body.pointEntry?.id), body.pointEntry as PointLedgerRecord]);
      setShowWorkForm(false);
      setEditingWorkItem(null);
      if (employeeCoordinationCreate) {
        const recipient = safeWorkRosterById.get(body.workItem.assigneeEmployeeId);
        setEmployeeTaskScope("created");
        setWorkDueFilter("all");
        showToast(`ส่งงานประสานให้ ${recipient?.name ?? "ผู้รับงาน"} แล้ว · งานนี้ไม่มี Points`);
      } else {
        showToast(body.pointEntry ? `ทำภารกิจสำเร็จ รับ ${body.pointEntry.points} Points` : "บันทึกงานและความคืบหน้าแล้ว");
      }
    } catch (error) {
      showErrorToast(error, "บันทึกงานไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const openQuestEditor = (quest?: QuestRecord) => {
    if (!permissions.canManageQuests || isEmployeePreview) return;
    if (quest?.status === "archived") {
      showToast("เควสในประวัติเป็นข้อมูลอ่านอย่างเดียว ไม่สามารถแก้ไขหรือเปิดกลับได้", "error");
      return;
    }
    setEditingQuest(quest ?? null);
    setQuestForm(quest ? {
      type: quest.type,
      title: quest.title,
      description: quest.description,
      status: quest.status,
      progress: quest.progress,
      pointsReward: quest.pointsReward,
      rewardId: quest.rewardId,
      isFeatured: quest.isFeatured,
      startDate: quest.startDate,
      endDate: quest.endDate,
      targetEmployeeIds: [...quest.targetEmployeeIds],
      targetDepartmentIds: [...quest.targetDepartmentIds],
    } : blankQuestForm(questPointLimit));
    setShowQuestForm(true);
  };

  const closeQuestEditor = () => {
    setShowQuestForm(false);
    setEditingQuest(null);
    setQuestForm(blankQuestForm(questPointLimit));
  };

  const saveQuest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!permissions.canManageQuests || isEmployeePreview || editingQuest?.status === "archived" || !questAllowedStatuses.includes(questForm.status) || questTargetInvalid || questRewardUnavailable || questPointsInvalid || questPolicyUnavailable || questPolicyDisablesCompletions) return;
    const targetEmployeeIds = questForm.type === "individual" ? questForm.targetEmployeeIds.slice(0, 1) : [];
    const targetDepartmentIds = questForm.type === "team" ? [...new Set(questForm.targetDepartmentIds)] : [];
    const progress = questForm.status === "completed" ? 100 : Math.max(0, Math.min(100, questForm.progress));
    setIsSaving(true);
    try {
      const response = await fetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "saveQuest",
          questId: editingQuest?.id,
          expectedRevision: editingQuest?.revision,
          expectedUpdatedAt: editingQuest?.updatedAt,
          ...questForm,
          progress,
          targetEmployeeIds,
          targetDepartmentIds,
        }),
      });
      const body = await response.json() as { quest?: QuestRecord; error?: string };
      if (!response.ok || !body.quest) throw new Error(body.error ?? "บันทึกเควสไม่สำเร็จ");
      setQuests((items) => [...items.filter((item) => item.id !== body.quest?.id), body.quest as QuestRecord]);
      const savedTitle = body.quest.title;
      closeQuestEditor();
      showToast(editingQuest ? `บันทึกเควส “${savedTitle}” แล้ว` : `สร้างเควส “${savedTitle}” แล้ว`);
    } catch (error) {
      showErrorToast(error, "บันทึกเควสไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteQuest = async (quest: QuestRecord) => {
    if (!permissions.canManageQuests || isEmployeePreview || quest.status === "archived") return;
    const accepted = window.confirm(`ลบเควส “${quest.title}” ออกจากหน้าผู้เข้าร่วมใช่หรือไม่?\n\nระบบจะเก็บเควสเป็นประวัติ ไม่ลบข้อมูลเดิม และไม่เปลี่ยนรายการ Points หรือรางวัลย้อนหลัง`);
    if (!accepted) return;
    setIsSaving(true);
    try {
      const response = await fetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "deleteQuest", questId: quest.id, expectedRevision: quest.revision, expectedUpdatedAt: quest.updatedAt, confirmation: `ลบเควส ${quest.title}` }),
      });
      const body = await response.json() as { quest?: QuestRecord; archived?: boolean; error?: string };
      if (!response.ok || !body.quest || !body.archived) throw new Error(body.error ?? "ลบเควสไม่สำเร็จ");
      setQuests((items) => items.map((item) => item.id === body.quest?.id ? body.quest as QuestRecord : item));
      closeQuestEditor();
      setQuestStatusFilter("current");
      showToast(`นำเควส “${quest.title}” ออกจากหน้าผู้เข้าร่วมแล้ว และเก็บประวัติไว้`);
    } catch (error) {
      showErrorToast(error, "ลบเควสไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const openQuestFulfillment = (quest: QuestRecord) => {
    if (!permissions.canManageQuests || isEmployeePreview || (quest.status !== "active" && quest.status !== "completed")) return;
    const eligibleEmployees = eligibleEmployeesForQuest(quest);
    const maxDate = quest.endDate < todayDate ? quest.endDate : todayDate;
    setQuestToFulfill(quest);
    setQuestCompletionForm({
      employeeId: eligibleEmployees[0]?.id ?? "",
      completionDate: maxDate,
      evidenceUrl: "",
      note: "",
    });
  };

  const closeQuestFulfillment = () => {
    setQuestToFulfill(null);
    setQuestCompletionForm(blankQuestCompletionForm());
  };

  const completeQuestForEmployee = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!questToFulfill || !permissions.canManageQuests || isEmployeePreview || !questCompletionReady) return;
    setIsSaving(true);
    try {
      const response = await fetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "completeQuestForEmployee",
          questId: questToFulfill.id,
          employeeId: questCompletionForm.employeeId,
          completionDate: questCompletionForm.completionDate,
          expectedRevision: questToFulfill.revision,
          expectedUpdatedAt: questToFulfill.updatedAt,
          evidenceUrl: questCompletionForm.evidenceUrl.trim(),
          note: questCompletionForm.note.trim(),
        }),
      });
      const body = await response.json().catch(() => ({})) as { questCompletion?: QuestCompletionRecord; pointEvent?: PointEventRecord | null; pointEntry?: PointLedgerRecord | null; reward?: RewardRecord | null; idempotentReplay?: boolean; error?: string };
      if (!response.ok || !body.questCompletion) {
        if (response.status === 409) {
          closeQuestFulfillment();
          setDashboardReloadKey((value) => value + 1);
        }
        throw new Error(body.error ?? "บันทึกผลเควสไม่สำเร็จ");
      }
      setQuestCompletions((items) => [body.questCompletion as QuestCompletionRecord, ...items.filter((item) => item.id !== body.questCompletion?.id)]);
      if (body.pointEvent) setPointEvents((items) => [body.pointEvent as PointEventRecord, ...items.filter((item) => item.id !== body.pointEvent?.id)]);
      if (body.pointEntry) setPointLedger((items) => [body.pointEntry as PointLedgerRecord, ...items.filter((item) => item.id !== body.pointEntry?.id)]);
      if (body.reward) setRewards((items) => [body.reward as RewardRecord, ...items.filter((item) => item.id !== body.reward?.id)]);
      const employeeName = body.questCompletion.employeeNameSnapshot;
      const pointsAwarded = body.questCompletion.pointsAwarded;
      const rewardCopy = body.questCompletion.rewardId ? ` และรางวัล ${body.questCompletion.rewardTitleSnapshot}` : "";
      closeQuestFulfillment();
      showToast(body.idempotentReplay
        ? `รายการของ ${employeeName} ถูกบันทึกไว้แล้ว ระบบไม่มอบสิทธิ์ซ้ำ`
        : `มอบ ${formatMoney(pointsAwarded)} Points${rewardCopy} ให้ ${employeeName} แล้ว`);
    } catch (error) {
      showErrorToast(error, "บันทึกผลเควสไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const startWorkItem = async (item: WorkItemRecord) => {
    if (guardEmployeePreviewMutation("เริ่มหรืออัปเดตงาน")) return;
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
      showErrorToast(error, "เริ่มงานไม่สำเร็จ");
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
    if (guardEmployeePreviewMutation("ส่งหลักฐานใหม่")) return;
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
      showErrorToast(error, "ส่งหลักฐานงานไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const reviewWorkProof = async (submission: WorkSubmissionRecord, status: "approved" | "revision") => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "reviewWorkSubmission", submissionId: submission.id, status, reviewerNote }) });
      const body = await response.json() as { workSubmission?: WorkSubmissionRecord; workItem?: WorkItemRecord; pointEntry?: PointLedgerRecord | null; deadlinePointEntry?: PointLedgerRecord | null; deadlinePointEvent?: PointEventRecord | null; pointCapMessage?: string; error?: string };
      if (!response.ok || !body.workSubmission || !body.workItem) throw new Error(body.error ?? "ตรวจหลักฐานไม่สำเร็จ");
      setWorkSubmissions((items) => items.map((item) => item.id === body.workSubmission?.id ? body.workSubmission as WorkSubmissionRecord : item));
      setWorkItems((items) => items.map((item) => item.id === body.workItem?.id ? body.workItem as WorkItemRecord : item));
      if (body.pointEntry) setPointLedger((items) => [...items.filter((item) => item.id !== body.pointEntry?.id), body.pointEntry as PointLedgerRecord]);
      if (body.deadlinePointEntry) setPointLedger((items) => [...items.filter((item) => item.id !== body.deadlinePointEntry?.id), body.deadlinePointEntry as PointLedgerRecord]);
      if (body.deadlinePointEvent) setPointEvents((items) => [...items.filter((item) => item.id !== body.deadlinePointEvent?.id), body.deadlinePointEvent as PointEventRecord]);
      setSubmissionWorkItem(body.workItem);
      setReviewerNote("");
      showToast(body.pointCapMessage ?? (status === "approved" ? `อนุมัติหลักฐานและมอบ ${body.workItem.points + (body.deadlinePointEntry?.points ?? 0)} Points แล้ว` : "ส่งงานกลับให้แก้ไขแล้ว"));
    } catch (error) {
      showErrorToast(error, "ตรวจหลักฐานไม่สำเร็จ");
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
      showErrorToast(error, "สร้างโปรเจกต์ไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const recordPointEvent = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      const response = await fetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "recordPointEvent", ...pointEventForm, eventType: selectedPointEventType }) });
      const body = await response.json() as { pointEvent?: PointEventRecord; pointEntry?: PointLedgerRecord; error?: string };
      if (!response.ok || !body.pointEvent || !body.pointEntry) throw new Error(body.error ?? "บันทึกรายการ Points ไม่สำเร็จ");
      setPointEvents((items) => [body.pointEvent as PointEventRecord, ...items]);
      setPointLedger((items) => [body.pointEntry as PointLedgerRecord, ...items]);
      setPointEventForm((form) => ({ ...form, note: "", evidenceUrl: "" }));
      setPointHistoryEmployeeId(body.pointEvent.employeeId);
      setPointPanel("history");
      showToast(`${body.pointEvent.points >= 0 ? "เพิ่ม" : "หัก"} ${Math.abs(body.pointEvent.points)} Points เรียบร้อยแล้ว`);
    } catch (error) {
      showErrorToast(error, "บันทึกรายการ Points ไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const runMonthlyPointCycle = async () => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "runMonthlyPointCycle", month: monthlyPointMonth, period }) });
      const body = await response.json() as { pointEvents?: PointEventRecord[]; pointEntries?: PointLedgerRecord[]; count?: number; error?: string };
      if (!response.ok || !body.pointEvents || !body.pointEntries) throw new Error(body.error ?? "ประมวลผล Points รายเดือนไม่สำเร็จ");
      const eventIds = new Set(body.pointEvents.map((item) => item.id));
      const entryIds = new Set(body.pointEntries.map((item) => item.id));
      setPointEvents((items) => [...body.pointEvents as PointEventRecord[], ...items.filter((item) => !eventIds.has(item.id))]);
      setPointLedger((items) => [...body.pointEntries as PointLedgerRecord[], ...items.filter((item) => !entryIds.has(item.id))]);
      setPointPanel("history");
      showToast(`ประมวลผล Points รายเดือนให้ ${body.count ?? body.pointEntries.length} คนแล้ว`);
    } catch (error) {
      showErrorToast(error, "ประมวลผล Points รายเดือนไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const startNewOrganizationPolicy = () => {
    setSelectedPolicyId("new");
    setPolicyDraft(blankOrganizationPolicyDraft());
    setComplianceChecklist(Object.fromEntries(complianceChecklistItems.map((item) => [item.id, false])) as Record<ComplianceChecklistId, boolean>);
    setLegalReviewConfirmed(false);
  };

  const selectOrganizationPolicy = (policy: OrganizationPolicyRecord) => {
    setSelectedPolicyId(policy.id);
    if (currentUser?.role !== "admin") return;
    const category = policy.category ?? "work_rules";
    setPolicyDraft({ title: policy.title, summary: policy.summary, content: policy.content, category, effectiveDate: policy.effectiveDate, acknowledgementRequired: category === "points_rewards" ? true : policy.acknowledgementRequired });
    setComplianceChecklist(Object.fromEntries(complianceChecklistItems.map((item) => [item.id, false])) as Record<ComplianceChecklistId, boolean>);
    setLegalReviewConfirmed(false);
  };

  const persistOrganizationPolicyDraft = async () => {
    if (!policyDraft.title.trim() || !policyDraft.summary.trim() || !policyDraft.content.trim()) throw new Error("กรุณากรอกชื่อ สรุป และเนื้อหากฎองค์กรให้ครบ");
    const normalizedDraft = { ...policyDraft, acknowledgementRequired: policyDraft.category === "points_rewards" ? true : policyDraft.acknowledgementRequired };
    const response = await fetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "saveOrganizationPolicy", policyId: selectedPolicyId && selectedPolicyId !== "new" ? selectedPolicyId : undefined, ...normalizedDraft }) });
    const body = await response.json() as { organizationPolicy?: OrganizationPolicyRecord; error?: string };
    if (!response.ok || !body.organizationPolicy) throw new Error(body.error ?? "บันทึกร่างกฎองค์กรไม่สำเร็จ");
    const savedPolicy = body.organizationPolicy;
    setPolicyDraft(normalizedDraft);
    setOrganizationPolicies((items) => [savedPolicy, ...items.filter((item) => item.id !== savedPolicy.id)]);
    setSelectedPolicyId(savedPolicy.id);
    return savedPolicy;
  };

  const saveOrganizationPolicy = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      await persistOrganizationPolicyDraft();
      showToast("บันทึกร่างกฎองค์กรแล้ว");
    } catch (error) {
      showErrorToast(error, "บันทึกร่างกฎองค์กรไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const publishOrganizationPolicy = async () => {
    if (!complianceChecklistComplete || !legalReviewConfirmed) return showToast(policyDraft.category === "work_rules" ? "ตรวจเช็กรายการทั้ง 8 หัวข้อและยืนยันการทบทวนก่อนประกาศ" : "ยืนยันการทบทวนโดย HR หรือผู้รับผิดชอบก่อนประกาศ", "error");
    setIsSaving(true);
    try {
      const savedPolicy = await persistOrganizationPolicyDraft();
      const response = await fetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        action: "publishOrganizationPolicy",
        policyId: savedPolicy.id,
        legalReviewConfirmed: true,
        complianceChecklist: complianceChecklistItems.filter((item) => complianceChecklist[item.id]).map((item) => item.id),
      }) });
      const body = await response.json() as { organizationPolicy?: OrganizationPolicyRecord; error?: string };
      if (!response.ok || !body.organizationPolicy) throw new Error(body.error ?? "ประกาศกฎองค์กรไม่สำเร็จ");
      setOrganizationPolicies((items) => [body.organizationPolicy as OrganizationPolicyRecord, ...items.filter((item) => item.id !== body.organizationPolicy?.id)]);
      setSelectedPolicyId(body.organizationPolicy.id);
      if (body.organizationPolicy.category === "points_rewards" && body.organizationPolicy.effectiveDate <= bangkokIsoDate()) {
        setActivePointPolicyRules(resolvePointPolicyRules(body.organizationPolicy.rules));
      }
      showToast(`ประกาศ “${body.organizationPolicy.title}” เวอร์ชัน ${body.organizationPolicy.version} แล้ว`);
    } catch (error) {
      showErrorToast(error, "ประกาศกฎองค์กรไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const acknowledgeOrganizationPolicy = async () => {
    if (guardEmployeePreviewMutation("ยืนยันรับทราบกฎองค์กร")) return;
    if (!selectedOrganizationPolicy || !currentUser?.employeeId) return showToast("บัญชีนี้ยังไม่ได้ผูกกับพนักงาน", "error");
    setIsSaving(true);
    try {
      const response = await fetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "acknowledgeOrganizationPolicy", policyId: selectedOrganizationPolicy.id }) });
      const body = await response.json() as { policyAcknowledgement?: PolicyAcknowledgementRecord; error?: string };
      if (!response.ok || !body.policyAcknowledgement) throw new Error(body.error ?? "ยืนยันรับทราบกฎองค์กรไม่สำเร็จ");
      setPolicyAcknowledgements((items) => [body.policyAcknowledgement as PolicyAcknowledgementRecord, ...items.filter((item) => item.id !== body.policyAcknowledgement?.id)]);
      showToast("บันทึกการรับทราบกฎองค์กรแล้ว");
    } catch (error) {
      showErrorToast(error, "ยืนยันรับทราบกฎองค์กรไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const closeRewardEditor = () => {
    setShowRewardForm(false);
    setEditingReward(null);
    setRewardForm(blankRewardForm());
  };

  const openRewardEditor = (reward?: RewardRecord) => {
    if (currentUser?.role !== "admin" || isEmployeePreview) return;
    setSelectedEmployee(null);
    setSkillProfileEmployee(null);
    setHrEmployee(null);
    setShowAddEmployee(false);
    setShowWorkForm(false);
    setEditingWorkItem(null);
    setShowProjectForm(false);
    setSubmissionWorkItem(null);
    setRewardToRedeem(null);
    setShowProfileEditor(false);
    setShowContractForm(false);
    setContractToSign(null);
    setShowOrganizationDocumentForm(false);
    setShowEmployeeWarningForm(false);
    setShowEmployeeRecognitionForm(false);
    setShowNotifications(false);
    setShowUserMenu(false);
    setShowChangePassword(false);
    setShowAiAssistant(false);
    setEditingReward(reward ?? null);
    setRewardForm(reward ? {
      title: reward.title,
      description: reward.description,
      category: reward.category,
      icon: reward.icon,
      costPoints: reward.costPoints,
      stock: reward.stock,
      isActive: reward.isActive,
    } : blankRewardForm());
    setShowRewardForm(true);
  };

  const saveReward = async (event: React.FormEvent) => {
    event.preventDefault();
    if (currentUser?.role !== "admin" || isEmployeePreview) return showToast("เฉพาะ HR / Admin เท่านั้นที่จัดการรางวัลได้", "error");
    const normalizedReward = {
      ...rewardForm,
      title: rewardForm.title.trim(),
      description: rewardForm.description.trim(),
      icon: rewardForm.icon.trim(),
      costPoints: Math.trunc(Number(rewardForm.costPoints)),
      stock: Math.trunc(Number(rewardForm.stock)),
    };
    if (!normalizedReward.title || !normalizedReward.description || !normalizedReward.icon) return showToast("กรอกชื่อ รายละเอียด และไอคอนรางวัลให้ครบ", "error");
    if (!Number.isSafeInteger(normalizedReward.costPoints) || normalizedReward.costPoints < 1 || normalizedReward.costPoints > 10_000_000) return showToast("ราคา Points ต้องเป็นจำนวนเต็มตั้งแต่ 1 ถึง 10,000,000", "error");
    if (!Number.isSafeInteger(normalizedReward.stock) || normalizedReward.stock < 0 || normalizedReward.stock > 1_000_000) return showToast("สต็อกต้องเป็นจำนวนเต็มตั้งแต่ 0 ถึง 1,000,000", "error");
    setIsSaving(true);
    try {
      const response = await fetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "saveReward",
          rewardId: editingReward?.id,
          expectedUpdatedAt: editingReward?.updatedAt,
          expectedInventoryVersion: editingReward ? editingReward.inventoryVersion ?? 0 : undefined,
          ...normalizedReward,
        }),
      });
      const body = await response.json() as { reward?: RewardRecord; error?: string };
      if (!response.ok || !body.reward) throw new Error(body.error ?? "บันทึกรางวัลไม่สำเร็จ");
      const savedReward = body.reward;
      setRewards((items) => items.some((item) => item.id === savedReward.id)
        ? items.map((item) => item.id === savedReward.id ? savedReward : item)
        : [savedReward, ...items]);
      closeRewardEditor();
      showToast(editingReward ? `บันทึกการแก้ไข “${savedReward.title}” แล้ว` : `สร้างรางวัล “${savedReward.title}” แล้ว`);
    } catch (error) {
      showErrorToast(error, "บันทึกรางวัลไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteReward = async (reward: RewardRecord) => {
    if (currentUser?.role !== "admin" || isEmployeePreview || !reward.isActive) return;
    const confirmed = window.confirm(`ลบ “${reward.title}” ออกจากร้านรางวัลใช่หรือไม่?\n\nพนักงานจะแลกรางวัลนี้ไม่ได้อีก แต่ระบบจะเก็บประวัติคำขอเดิมไว้ตรวจสอบ`);
    if (!confirmed) return;
    setIsSaving(true);
    try {
      const response = await fetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "deleteReward",
          rewardId: reward.id,
          expectedUpdatedAt: reward.updatedAt,
          expectedInventoryVersion: reward.inventoryVersion ?? 0,
          confirmation: `ลบรางวัล ${reward.title}`,
        }),
      });
      const body = await response.json() as { reward?: RewardRecord; disposition?: "deactivated"; deactivated?: boolean; error?: string };
      if (!response.ok || !body.reward || body.disposition !== "deactivated" || body.deactivated !== true) throw new Error(body.error ?? "ลบรางวัลไม่สำเร็จ");
      const deactivatedReward = body.reward;
      setRewards((items) => items.map((item) => item.id === deactivatedReward.id ? deactivatedReward : item));
      if (editingReward?.id === deactivatedReward.id) closeRewardEditor();
      showToast(`นำ “${deactivatedReward.title}” ออกจากร้านแล้ว · เก็บประวัติการแลกเดิมไว้`);
    } catch (error) {
      showErrorToast(error, "ลบรางวัลไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const redeemReward = async (event: React.FormEvent) => {
    event.preventDefault();
    if (guardEmployeePreviewMutation("ส่งคำขอแลกรางวัล")) return;
    if (!rewardToRedeem) return;
    const redemptionEmployeeId = currentUser?.role === "admin" ? rewardEmployeeId : currentUser?.employeeId ?? "";
    if (!redemptionEmployeeId) return showToast("บัญชีนี้ยังไม่ได้ผูกกับพนักงาน", "error");
    if (!canSubmitRewardRedemption) return showToast("ยังไม่ผ่านเกณฑ์การแลกรางวัล กรุณาตรวจรายการในหน้าต่างนี้", "error");
    setIsSaving(true);
    try {
      const response = await fetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "redeemReward", employeeId: redemptionEmployeeId, rewardId: rewardToRedeem.id }) });
      const body = await response.json() as { redemption?: RewardRedemptionRecord; pointEntry?: PointLedgerRecord; reward?: RewardRecord; error?: string };
      if (!response.ok || !body.redemption || !body.pointEntry || !body.reward) throw new Error(body.error ?? "แลกรางวัลไม่สำเร็จ");
      setRewardRedemptions((items) => [...items, body.redemption as RewardRedemptionRecord]);
      setPointLedger((items) => [...items, body.pointEntry as PointLedgerRecord]);
      setRewards((items) => items.map((reward) => reward.id === body.reward?.id ? body.reward as RewardRecord : reward));
      setRewardToRedeem(null);
      showToast(`ส่งคำขอแลก “${body.reward.title}” แล้ว`);
    } catch (error) {
      showErrorToast(error, "แลกรางวัลไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const updateRewardRedemption = async (redemption: RewardRedemptionRecord, status: "approved" | "fulfilled" | "cancelled") => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "updateRewardRedemption", redemptionId: redemption.id, status }) });
      const body = await response.json() as { redemption?: RewardRedemptionRecord; pointEntry?: PointLedgerRecord; pointEntries?: PointLedgerRecord[]; reward?: RewardRecord; error?: string };
      if (!response.ok || !body.redemption) throw new Error(body.error ?? "อัปเดตสถานะคำขอแลกรางวัลไม่สำเร็จ");
      const savedRedemption = body.redemption;
      setRewardRedemptions((items) => items.map((item) => item.id === savedRedemption.id ? savedRedemption : item));
      const returnedEntries = [...(body.pointEntries ?? []), ...(body.pointEntry ? [body.pointEntry] : [])];
      if (returnedEntries.length) {
        const returnedEntryIds = new Set(returnedEntries.map((entry) => entry.id));
        setPointLedger((items) => [...returnedEntries, ...items.filter((entry) => !returnedEntryIds.has(entry.id))]);
      }
      if (body.reward) setRewards((items) => items.map((reward) => reward.id === body.reward?.id ? body.reward as RewardRecord : reward));
      showToast(`อัปเดตคำขอเป็น“${rewardRedemptionStatusLabel(status)}”แล้ว`);
    } catch (error) {
      showErrorToast(error, "อัปเดตสถานะคำขอแลกรางวัลไม่สำเร็จ");
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
    } : { personalEmail: "", phone: "", birthDate: "", nationalIdLast4: "", address: "", emergencyName: "", emergencyPhone: "", startDate: bangkokIsoDate(), employmentType: "probation", education: "", experienceYears: 0, applicationSource: "" });
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
      showErrorToast(error, "บันทึกโปรไฟล์ไม่สำเร็จ");
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
      showErrorToast(error, "อัปโหลดรูปโปรไฟล์ไม่สำเร็จ");
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
      showErrorToast(error, "อัปโหลดเอกสารไม่สำเร็จ");
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
      showErrorToast(error, "อัปเดตสถานะเอกสารไม่สำเร็จ");
    }
  };

  const openContractCreator = () => {
    if (!profileEmployee) return;
    const contractDocument = profileContractDocuments[0];
    setContractForm({ title: profileRecord?.employmentType === "probation" ? "สัญญาจ้างและเงื่อนไขทดลองงาน" : "สัญญาจ้างพนักงาน", version: "1.0", status: "sent", effectiveDate: profileRecord?.startDate || bangkokIsoDate(), expiryDate: "", documentId: contractDocument?.id ?? "" });
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
      showErrorToast(error, "สร้างสัญญาไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const openContractSignature = (contract: EmploymentContractRecord) => {
    setContractToSign(contract);
    setSignatureForm({ signedName: employeesById.get(contract.employeeId)?.name ?? "", consent: false });
  };

  const sendEmploymentContract = async (contract: EmploymentContractRecord) => {
    try {
      const response = await fetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "sendContract", contractId: contract.id }) });
      const body = await response.json() as { employmentContract?: EmploymentContractRecord; error?: string };
      if (!response.ok || !body.employmentContract) throw new Error(body.error ?? "ส่งสัญญาไม่สำเร็จ");
      setEmploymentContracts((items) => items.map((item) => item.id === contract.id ? body.employmentContract as EmploymentContractRecord : item));
      showToast("ส่งสัญญาให้พนักงานลงนามแล้ว");
    } catch (error) {
      showErrorToast(error, "ส่งสัญญาไม่สำเร็จ");
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
      showToast("บันทึกการทดสอบขั้นตอนยืนยันสัญญาแล้ว");
    } catch (error) {
      showErrorToast(error, "ลงนามสัญญาไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const openOrganizationDocumentCreator = () => {
    if (!permissions.canManageOrganizationDocuments || isEmployeePreview) return;
    setOrganizationDocumentForm({ title: "", category: "other", description: "", documentNumber: "", version: "1.0", owner: currentUser?.displayName || "ฝ่ายทรัพยากรบุคคล", effectiveDate: bangkokIsoDate(), expiryDate: "", note: "", status: "draft" });
    setOrganizationDocumentFile(null);
    setShowOrganizationDocumentForm(true);
  };

  const saveOrganizationDocument = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!organizationDocumentFile || !permissions.canManageOrganizationDocuments || isEmployeePreview) return;
    setIsSaving(true);
    try {
      const formData = new FormData();
      Object.entries(organizationDocumentForm).forEach(([key, value]) => formData.set(key, value));
      formData.set("file", organizationDocumentFile);
      const response = await fetch("/api/organization-documents", { method: "POST", body: formData });
      const body = await response.json() as { organizationDocument?: OrganizationDocumentRecord; error?: string };
      if (!response.ok || !body.organizationDocument) throw new Error(body.error ?? "เพิ่มเอกสารองค์กรไม่สำเร็จ");
      setOrganizationDocuments((items) => [body.organizationDocument as OrganizationDocumentRecord, ...items.filter((item) => item.id !== body.organizationDocument?.id)]);
      setShowOrganizationDocumentForm(false);
      setOrganizationDocumentFile(null);
      showToast(`เพิ่ม “${body.organizationDocument.title}” ในคลังเอกสารแล้ว`);
    } catch (error) {
      showErrorToast(error, "เพิ่มเอกสารองค์กรไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const updateOrganizationDocumentStatus = async (document: OrganizationDocumentRecord, status: OrganizationDocumentStatus) => {
    if (!permissions.canManageOrganizationDocuments || isEmployeePreview) return;
    if (status === "archived" && !window.confirm(`ยืนยันเก็บ “${document.title}” เข้าคลังถาวร?\n\nสถานะจะเปลี่ยนจาก “${organizationDocumentStatusLabels[document.status]}” เป็น “เก็บถาวร” และจะเปลี่ยนกลับจากหน้านี้ไม่ได้`)) return;
    setIsSaving(true);
    try {
      const response = await fetch("/api/organization-documents", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: document.id, expectedRevision: document.revision, status }) });
      const body = await response.json() as { organizationDocument?: OrganizationDocumentRecord; error?: string };
      if (!response.ok || !body.organizationDocument) throw new Error(body.error ?? "อัปเดตสถานะเอกสารไม่สำเร็จ");
      setOrganizationDocuments((items) => items.map((item) => item.id === body.organizationDocument?.id ? body.organizationDocument as OrganizationDocumentRecord : item));
      showToast(`อัปเดตเป็น “${organizationDocumentStatusLabels[status]}” แล้ว`);
    } catch (error) {
      showErrorToast(error, "อัปเดตสถานะเอกสารไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const openEmployeeWarningCreator = () => {
    if (!profileEmployee || !permissions.canManageEmployeeWarnings || isEmployeePreview) return;
    setEmployeeWarningForm({ warningNumber: "", level: "first", subject: "", incidentDate: bangkokIsoDate(), issuedDate: bangkokIsoDate(), facts: "", correctiveAction: "", reviewDate: "", employeeStatement: "", status: "draft" });
    setEmployeeWarningFile(null);
    setShowEmployeeWarningForm(true);
  };

  const saveEmployeeWarning = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profileEmployee || !permissions.canManageEmployeeWarnings || isEmployeePreview) return;
    if (employeeWarningForm.issuedDate < employeeWarningForm.incidentDate) return showToast("วันที่ออกเอกสารต้องไม่ก่อนวันที่เกิดเหตุ", "error");
    setIsSaving(true);
    try {
      const formData = new FormData();
      formData.set("employeeId", profileEmployee.id);
      Object.entries(employeeWarningForm).forEach(([key, value]) => formData.set(key, value));
      if (employeeWarningFile) formData.set("file", employeeWarningFile);
      const response = await fetch("/api/employee-warnings", { method: "POST", body: formData });
      const body = await response.json() as { employeeWarning?: EmployeeWarningRecord; error?: string };
      if (!response.ok || !body.employeeWarning) throw new Error(body.error ?? "บันทึกใบเตือนไม่สำเร็จ");
      setEmployeeWarnings((items) => [body.employeeWarning as EmployeeWarningRecord, ...items.filter((item) => item.id !== body.employeeWarning?.id)]);
      setShowEmployeeWarningForm(false);
      setEmployeeWarningFile(null);
      showToast(employeeWarningForm.status === "issued" ? "ออกหนังสือเตือนและบันทึกในแฟ้มแล้ว" : "บันทึกหนังสือเตือนเป็นฉบับร่างแล้ว");
    } catch (error) {
      showErrorToast(error, "บันทึกใบเตือนไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const updateEmployeeWarningStatus = async (warning: EmployeeWarningRecord, status: "issued" | "acknowledged" | "resolved" | "withdrawn") => {
    if (!permissions.canManageEmployeeWarnings || isEmployeePreview) return;
    if (status === "withdrawn" && !window.confirm(`ยืนยันเพิกถอนใบเตือน “${warning.subject}” ของ ${profileEmployee?.name ?? "พนักงาน"}?\n\nสถานะจะเปลี่ยนจาก “${employeeWarningStatusLabels[warning.status]}” เป็น “เพิกถอน” และจะเปลี่ยนกลับจากหน้านี้ไม่ได้`)) return;
    setIsSaving(true);
    try {
      const response = await fetch("/api/employee-warnings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: warning.id,
          expectedRevision: warning.revision,
          status,
          ...(status === "acknowledged" ? { employeeStatement: warning.employeeStatement } : {}),
        }),
      });
      const body = await response.json() as { employeeWarning?: EmployeeWarningRecord; error?: string };
      if (!response.ok || !body.employeeWarning) throw new Error(body.error ?? "อัปเดตสถานะใบเตือนไม่สำเร็จ");
      setEmployeeWarnings((items) => items.map((item) => item.id === body.employeeWarning?.id ? body.employeeWarning as EmployeeWarningRecord : item));
      showToast(`อัปเดตใบเตือนเป็น “${employeeWarningStatusLabels[status]}” แล้ว`);
    } catch (error) {
      showErrorToast(error, "อัปเดตสถานะใบเตือนไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const openEmployeeRecognitionCreator = () => {
    if (!profileEmployee || !permissions.canManageEmployeeRecognitions || isEmployeePreview) return;
    setEmployeeRecognitionForm({ recognitionType: "certificate", title: "", issuer: "", issuedDate: bangkokIsoDate(), expiryDate: "", credentialId: "", verificationUrl: "", description: "", status: "active" });
    setEmployeeRecognitionFile(null);
    setShowEmployeeRecognitionForm(true);
  };

  const saveEmployeeRecognition = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profileEmployee || !permissions.canManageEmployeeRecognitions || isEmployeePreview) return;
    setIsSaving(true);
    try {
      const formData = new FormData();
      formData.set("employeeId", profileEmployee.id);
      Object.entries(employeeRecognitionForm).forEach(([key, value]) => formData.set(key, value));
      if (employeeRecognitionFile) formData.set("file", employeeRecognitionFile);
      const response = await fetch("/api/employee-recognitions", { method: "POST", body: formData });
      const body = await response.json() as { employeeRecognition?: EmployeeRecognitionRecord; error?: string };
      if (!response.ok || !body.employeeRecognition) throw new Error(body.error ?? "เพิ่มเกียรติบัตรหรือรางวัลไม่สำเร็จ");
      setEmployeeRecognitions((items) => [body.employeeRecognition as EmployeeRecognitionRecord, ...items.filter((item) => item.id !== body.employeeRecognition?.id)]);
      setShowEmployeeRecognitionForm(false);
      setEmployeeRecognitionFile(null);
      showToast(`เพิ่ม “${body.employeeRecognition.title}” ในแฟ้มแล้ว`);
    } catch (error) {
      showErrorToast(error, "เพิ่มเกียรติบัตรหรือรางวัลไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const updateEmployeeRecognitionStatus = async (recognition: EmployeeRecognitionRecord, status: EmployeeRecognitionStatus) => {
    if (!permissions.canManageEmployeeRecognitions || isEmployeePreview) return;
    if (status === "revoked" && !window.confirm(`ยืนยันเพิกถอน “${recognition.title}” ของ ${profileEmployee?.name ?? "พนักงาน"}?\n\nสถานะจะเปลี่ยนจาก “${employeeRecognitionStatusLabels[recognition.status]}” เป็น “เพิกถอน” และจะเปลี่ยนกลับจากหน้านี้ไม่ได้`)) return;
    setIsSaving(true);
    try {
      const response = await fetch("/api/employee-recognitions", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: recognition.id, expectedRevision: recognition.revision, status }) });
      const body = await response.json() as { employeeRecognition?: EmployeeRecognitionRecord; error?: string };
      if (!response.ok || !body.employeeRecognition) throw new Error(body.error ?? "อัปเดตสถานะเกียรติบัตรหรือรางวัลไม่สำเร็จ");
      setEmployeeRecognitions((items) => items.map((item) => item.id === body.employeeRecognition?.id ? body.employeeRecognition as EmployeeRecognitionRecord : item));
      showToast(`อัปเดตเป็น “${employeeRecognitionStatusLabels[status]}” แล้ว`);
    } catch (error) {
      showErrorToast(error, "อัปเดตสถานะเกียรติบัตรหรือรางวัลไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const saveEvaluation = async () => {
    if (!selectedEmployee) return;
    if (!skillAssessmentComplete) {
      showToast(`กรุณาประเมินสมรรถนะให้ครบอีก ${(selectedRole?.skills.length ?? 0) - ratedSkillCount} ด้าน`, "error");
      return;
    }
    setIsSaving(true);
    try {
      const isSelfAssessment = currentUser?.role === "employee";
      const response = await fetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: isSelfAssessment ? "saveSelfAssessment" : "saveEvaluation", employeeId: selectedEmployee.id, period, kpiScores, skillScores, note }),
      });
      const body = await response.json() as { evaluation?: EvaluationRecord; selfAssessment?: EmployeeSelfAssessmentRecord; pointEntry?: PointLedgerRecord; pointEvent?: PointEventRecord; error?: string };
      if (isSelfAssessment) {
        if (!response.ok || !body.selfAssessment) throw new Error(body.error ?? "บันทึกแบบประเมินตนเองไม่สำเร็จ");
        const savedSelfAssessment = body.selfAssessment;
        setSelfAssessments((items) => [...items.filter((item) => !(item.employeeId === savedSelfAssessment.employeeId && item.period === savedSelfAssessment.period)), savedSelfAssessment]);
        setSelectedEmployee(null);
        showToast("บันทึกแบบประเมินตนเองแล้ว · ไม่เปลี่ยนผลประเมินทางการหรือ Points");
        return;
      }
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
      showToast(body.pointEntry
        ? `บันทึกผลประเมิน ${selectedEmployee.name} และมอบ ${body.pointEntry.points} Points ประจำเดือนแล้ว`
        : `บันทึกผลประเมิน ${selectedEmployee.name} แล้ว · รอประมวลผล Points ตามกติกาที่มีผลใช้`);
    } catch (error) {
      showErrorToast(error, currentUser?.role === "employee" ? "บันทึกแบบประเมินตนเองไม่สำเร็จ" : "บันทึกผลประเมินไม่สำเร็จ");
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
      showErrorToast(error, "เพิ่มพนักงานไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const updateEmployeeLifecycleStatus = async (employee: EmployeeRecord, status: "active" | "resigned") => {
    const currentStatus = employee.status === "inactive" ? "resigned" : employee.status;
    if (currentStatus === status) return;
    const message = status === "resigned"
      ? `ยืนยันว่า ${employee.name} ลาออกแล้ว?\n\nระบบจะเก็บประวัติในแฟ้มไว้ แต่จะนำออกจากรายชื่อพนักงานที่ทำงานอยู่ ปิดบัญชีที่ผูกไว้ และออกจากระบบทุกอุปกรณ์ทันที`
      : `ยืนยันคืน ${employee.name} เป็นพนักงานที่ทำงานอยู่?\n\nบัญชีเข้าสู่ระบบจะยังคงปิดอยู่จนกว่า HR จะคืนสิทธิ์ในหน้า “ผู้ใช้งานและสิทธิ์”`;
    if (!window.confirm(message)) return;
    setIsSaving(true);
    try {
      const response = await fetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "updateEmployeeStatus", employeeId: employee.id, status, expectedUpdatedAt: employee.updatedAt }),
      });
      const body = await response.json() as { employee?: EmployeeRecord; disabledUserAccountIds?: string[]; error?: string };
      if (!response.ok || !body.employee) throw new Error(body.error ?? "อัปเดตสถานะพนักงานไม่สำเร็จ");
      const savedEmployee = body.employee;
      setEmployees((items) => items.map((item) => item.id === savedEmployee.id ? savedEmployee : item));
      if (body.disabledUserAccountIds?.length) {
        const disabledIds = new Set(body.disabledUserAccountIds);
        setUserAccounts((items) => items.map((account) => disabledIds.has(account.id) ? { ...account, status: "inactive", updatedAt: savedEmployee.updatedAt } : account));
      }
      if (dossierStatusFilter === "archived") setDossierStatusFilter("all");
      showToast(status === "resigned" ? `บันทึก ${employee.name} เป็น “ลาออกแล้ว” และปิดสิทธิ์เข้าใช้แล้ว` : `คืน ${employee.name} เป็นพนักงานที่ทำงานอยู่แล้ว`);
    } catch (error) {
      showErrorToast(error, "อัปเดตสถานะพนักงานไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const archiveEmployeeRecord = async (employee: EmployeeRecord) => {
    if (employee.status === "active") {
      showToast("กรุณาเลือกสถานะ “ลาออกแล้ว” ก่อนลบพนักงานออกจากรายชื่อ", "error");
      return;
    }
    if (!window.confirm(`ยืนยันลบ ${employee.name} ออกจากรายชื่อพนักงาน?\n\nแฟ้มจะถูกซ่อนจากรายการใช้งาน แต่ระบบยังเก็บประวัติงาน การประเมิน สัญญา และเอกสารไว้เพื่อการตรวจสอบ สามารถกู้คืนได้ภายหลัง`)) return;
    setIsSaving(true);
    try {
      const response = await fetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "archiveEmployee", employeeId: employee.id, expectedUpdatedAt: employee.updatedAt }),
      });
      const body = await response.json() as { employee?: EmployeeRecord; disabledUserAccountIds?: string[]; error?: string };
      if (!response.ok || !body.employee) throw new Error(body.error ?? "ลบพนักงานออกจากรายชื่อไม่สำเร็จ");
      const savedEmployee = body.employee;
      setEmployees((items) => items.map((item) => item.id === savedEmployee.id ? savedEmployee : item));
      if (body.disabledUserAccountIds?.length) {
        const disabledIds = new Set(body.disabledUserAccountIds);
        setUserAccounts((items) => items.map((account) => disabledIds.has(account.id) ? { ...account, status: "inactive", updatedAt: savedEmployee.updatedAt } : account));
      }
      setDossierStatusFilter("archived");
      setProfileEmployeeId(savedEmployee.id);
      showToast(`ลบ ${employee.name} ออกจากรายชื่อแล้ว · ประวัติยังถูกเก็บไว้อย่างปลอดภัย`);
    } catch (error) {
      showErrorToast(error, "ลบพนักงานออกจากรายชื่อไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteEmployeePermanently = async (employee: EmployeeRecord) => {
    if (employee.status !== "archived") {
      showToast("ต้องลบพนักงานออกจากรายชื่อก่อน จึงจะลบแฟ้มถาวรได้", "error");
      return;
    }
    const confirmationPhrase = `ลบถาวร ${employee.name}`;
    const confirmation = window.prompt(`การลบถาวรจะลบข้อมูลส่วนบุคคล ประวัติงาน การประเมิน สัญญา เอกสาร และไฟล์แนบทั้งหมดของ ${employee.name}\n\nการดำเนินการนี้กู้คืนไม่ได้ หากยืนยันให้พิมพ์:\n${confirmationPhrase}`);
    if (confirmation === null) return;
    if (confirmation !== confirmationPhrase) {
      showToast(`ข้อความไม่ตรง กรุณาพิมพ์ “${confirmationPhrase}”`, "error");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "deleteEmployeePermanently", employeeId: employee.id, expectedUpdatedAt: employee.updatedAt, confirmation }),
      });
      const body = await response.json() as { deletedEmployeeId?: string; disabledUserAccountIds?: string[]; reassignedProjectCount?: number; replacementEmployeeName?: string; fileCleanupPending?: boolean; error?: string };
      if (!response.ok || body.deletedEmployeeId !== employee.id) throw new Error(body.error ?? "ลบแฟ้มพนักงานถาวรไม่สำเร็จ");
      setEmployees((items) => items.filter((item) => item.id !== employee.id));
      setProfileEmployeeId("");
      setDossierStatusFilter("all");
      setDashboardReloadKey((key) => key + 1);
      const reassignedCopy = body.reassignedProjectCount
        ? ` · โอน ${body.reassignedProjectCount} โปรเจกต์ให้ ${body.replacementEmployeeName}`
        : "";
      const cleanupCopy = body.fileCleanupPending ? " · มีไฟล์บางรายการรอล้างโดยระบบ" : "";
      showToast(`ลบแฟ้ม ${employee.name} ถาวรแล้ว${reassignedCopy}${cleanupCopy}`);
    } catch (error) {
      showErrorToast(error, "ลบแฟ้มพนักงานถาวรไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const editUserAccount = (account: PublicUserAccount) => {
    setCredentialResult(null);
    setShowTemporaryPassword(false);
    setUserAccountForm({ accountId: account.id, loginId: account.loginId ?? "", displayName: account.displayName, nickname: account.nickname ?? "", role: account.role, employeeId: account.employeeId ?? "", departmentId: account.departmentId, status: account.status, temporaryPassword: "" });
    document.getElementById("user-access-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const prepareUserAccountPasswordReset = (account: PublicUserAccount) => {
    setCredentialResult(null);
    setShowTemporaryPassword(true);
    setUserAccountForm({ accountId: account.id, loginId: account.loginId ?? "", displayName: account.displayName, nickname: account.nickname ?? "", role: account.role, employeeId: account.employeeId ?? "", departmentId: account.departmentId, status: account.status, temporaryPassword: generateTemporaryPassword() });
    document.getElementById("user-access-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const saveUserAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    const loginId = userAccountForm.loginId.trim();
    const temporaryPassword = userAccountForm.temporaryPassword;
    const existingAccount = userAccounts.find((account) => account.id === userAccountForm.accountId);
    const temporaryPasswordRequired = !userAccountForm.accountId || existingAccount?.hasPassword === false;
    if (!loginId) {
      showToast("กรุณากรอกชื่อผู้ใช้", "error");
      return;
    }
    if (temporaryPasswordRequired && !temporaryPassword) {
      showToast("บัญชีนี้ต้องมีรหัสผ่านชั่วคราวก่อนบันทึก", "error");
      return;
    }
    if (temporaryPassword && (!passwordMeetsMinimum(temporaryPassword) || [...temporaryPassword.normalize("NFC")].length > MAX_NEW_PASSWORD_LENGTH)) {
      showToast("รหัสผ่านต้องมี 6–15 ตัวอักษร", "error");
      return;
    }
    setIsSaving(true);
    try {
      const response = await fetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "saveUserAccount", ...userAccountForm, loginId, temporaryPassword }) });
      const body = await response.json() as { userAccount?: PublicUserAccount; error?: string };
      if (!response.ok || !body.userAccount) throw new Error(body.error ?? "บันทึกบัญชีผู้ใช้ไม่สำเร็จ");
      setUserAccounts((items) => [...items.filter((item) => item.id !== body.userAccount?.id), body.userAccount as PublicUserAccount].sort((a, b) => a.displayName.localeCompare(b.displayName, "th")));
      setCredentialResult(temporaryPassword ? { displayName: body.userAccount.displayName, loginId: body.userAccount.loginId || loginId, temporaryPassword } : null);
      setUserAccountForm(blankUserAccountForm());
      setShowTemporaryPassword(false);
      showToast(temporaryPassword ? `บันทึกบัญชี ${body.userAccount.displayName} และสร้างรหัสชั่วคราวแล้ว` : `บันทึกสิทธิ์ของ ${body.userAccount.displayName} แล้ว`);
    } catch (error) {
      showErrorToast(error, "บันทึกบัญชีผู้ใช้ไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleUserAccount = async (account: PublicUserAccount) => {
    const nextStatus = account.status === "active" ? "inactive" : "active";
    const actionLabel = nextStatus === "inactive" ? "เพิกถอนสิทธิ์" : "คืนสิทธิ์";
    const consequence = nextStatus === "inactive"
      ? "ผู้ใช้นี้จะออกจากระบบทุกอุปกรณ์ทันที และจะเข้าใช้งานไม่ได้จนกว่า HR / Admin จะคืนสิทธิ์"
      : "ผู้ใช้นี้จะกลับมาเข้าสู่ระบบได้ด้วยชื่อผู้ใช้และรหัสผ่านเดิม";
    if (!window.confirm(`${actionLabel}ของ “${account.displayName}” ใช่หรือไม่?\n\n${consequence}`)) return;
    setIsSaving(true);
    try {
      const response = await fetch("/api/dashboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "saveUserAccount", accountId: account.id, loginId: account.loginId ?? "", displayName: account.displayName, nickname: account.nickname ?? "", role: account.role, employeeId: account.employeeId ?? "", departmentId: account.departmentId, status: nextStatus, temporaryPassword: "" }) });
      const body = await response.json() as { userAccount?: PublicUserAccount; error?: string };
      if (!response.ok || !body.userAccount) throw new Error(body.error ?? "อัปเดตบัญชีไม่สำเร็จ");
      setUserAccounts((items) => items.map((item) => item.id === account.id ? body.userAccount as PublicUserAccount : item));
      showToast(body.userAccount.status === "active" ? `คืนสิทธิ์ให้ ${body.userAccount.displayName} แล้ว` : `เพิกถอนสิทธิ์ของ ${body.userAccount.displayName} แล้ว`);
    } catch (error) {
      showErrorToast(error, "อัปเดตบัญชีไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteUserAccount = async (account: PublicUserAccount) => {
    if (account.id === currentUser?.id || account.id === "user-owner") return;
    const confirmed = window.confirm(
      `ลบบัญชี “${account.displayName}” ใช่หรือไม่?\n\nบัญชี รหัสผ่าน และเซสชันจะถูกลบถาวร แต่โปรไฟล์พนักงานและประวัติงานจะยังอยู่`,
    );
    if (!confirmed) return;
    setIsSaving(true);
    try {
      const response = await fetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "deleteUserAccount", accountId: account.id }),
      });
      const body = await response.json() as { deletedUserAccountId?: string; error?: string };
      if (!response.ok || body.deletedUserAccountId !== account.id) throw new Error(body.error ?? "ลบบัญชีผู้ใช้ไม่สำเร็จ");
      setUserAccounts((items) => items.filter((item) => item.id !== account.id));
      if (userAccountForm.accountId === account.id) setUserAccountForm(blankUserAccountForm());
      showToast(`ลบบัญชี ${account.displayName} แล้ว`);
    } catch (error) {
      showErrorToast(error, "ลบบัญชีผู้ใช้ไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const approveRegistrationRequest = async (registrationRequest: EmployeeRegistrationRequest) => {
    const matchingEmployeeId = employees.find((employee) => employee.status === "active" && employee.email.toLowerCase() === registrationRequest.email.toLowerCase() && !userAccounts.some((account) => account.employeeId === employee.id))?.id ?? "";
    const employeeId = registrationEmployeeSelections[registrationRequest.id] || matchingEmployeeId;
    const role = registrationRoleSelections[registrationRequest.id] ?? "employee";
    if (!employeeId) {
      showToast("กรุณาเลือกโปรไฟล์พนักงานที่จะผูกก่อนอนุมัติ", "error");
      return;
    }
    const employee = employeesById.get(employeeId);
    const roleLabel = role === "admin" ? "HR / Admin" : role === "manager" ? "หัวหน้าทีม" : "พนักงาน";
    const elevatedAccessWarning = role === "admin" ? "\n\nบัญชี HR / Admin จะเข้าถึงและจัดการข้อมูลทั้งองค์กรได้" : role === "manager" ? "\n\nบัญชีหัวหน้าทีมจะเห็นและจัดการข้อมูลในทีมตามแผนกของโปรไฟล์ที่ผูก" : "";
    if (!window.confirm(`อนุมัติ ${registrationRequest.firstName} ${registrationRequest.lastName} เป็น “${roleLabel}” และผูกกับโปรไฟล์ “${employee?.name ?? employeeId}” ใช่หรือไม่?${elevatedAccessWarning}`)) return;
    setIsSaving(true);
    try {
      const response = await fetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "approveEmployeeRegistration", requestId: registrationRequest.id, employeeId, role }),
      });
      const body = await response.json() as { registrationRequest?: EmployeeRegistrationRequest; userAccount?: PublicUserAccount; error?: string };
      if (!response.ok || !body.registrationRequest || !body.userAccount) throw new Error(body.error || "อนุมัติคำขอไม่สำเร็จ");
      setEmployeeRegistrationRequests((items) => items.map((item) => item.id === registrationRequest.id ? body.registrationRequest as EmployeeRegistrationRequest : item));
      setUserAccounts((items) => [...items.filter((item) => item.id !== body.userAccount?.id), body.userAccount as PublicUserAccount].sort((a, b) => a.displayName.localeCompare(b.displayName, "th")));
      setRegistrationRoleSelections((items) => { const next = { ...items }; delete next[registrationRequest.id]; return next; });
      showToast(`อนุมัติบัญชี ${body.userAccount.displayName} เป็น ${roleLabel} แล้ว สามารถเข้าสู่ระบบด้วยรหัสที่สมัครไว้ได้`);
    } catch (error) {
      showErrorToast(error, "อนุมัติคำขอไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const rejectRegistrationRequest = async (registrationRequest: EmployeeRegistrationRequest) => {
    const rejectionReason = (registrationRejectionReasons[registrationRequest.id] ?? "").trim();
    if (rejectionReason.length < 3) {
      showToast("กรุณาระบุเหตุผลที่ปฏิเสธอย่างน้อย 3 ตัวอักษร", "error");
      return;
    }
    if (!window.confirm(`ปฏิเสธคำขอของ ${registrationRequest.firstName} ${registrationRequest.lastName} ใช่หรือไม่?`)) return;
    setIsSaving(true);
    try {
      const response = await fetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "rejectEmployeeRegistration", requestId: registrationRequest.id, rejectionReason }),
      });
      const body = await response.json() as { registrationRequest?: EmployeeRegistrationRequest; error?: string };
      if (!response.ok || !body.registrationRequest) throw new Error(body.error || "ปฏิเสธคำขอไม่สำเร็จ");
      setEmployeeRegistrationRequests((items) => items.map((item) => item.id === registrationRequest.id ? body.registrationRequest as EmployeeRegistrationRequest : item));
      setRegistrationRejectionReasons((items) => ({ ...items, [registrationRequest.id]: "" }));
      showToast("บันทึกการปฏิเสธคำขอแล้ว");
    } catch (error) {
      showErrorToast(error, "ปฏิเสธคำขอไม่สำเร็จ");
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
      ["พนักงาน", "แผนก", "ตำแหน่ง", "โปรเจกต์", "ผลงาน", "ประเภทงาน", "สถานะแฟ้ม", "ประเภทหลักฐาน", "ชื่อหลักฐาน", "ชื่อไฟล์", "ลิงก์", "ผู้ตรวจ", "วันที่ตรวจ", "หมายเหตุผู้ตรวจ", "คะแนน KPI", "คะแนนสกิล", "คะแนนรวม", "Points จากผลงาน", "อัปเดตล่าสุด"],
      ...rows,
    ].map((row) => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `people-pulse-work-portfolio-${bangkokIsoDate()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast(`ส่งออกแฟ้มผลงาน ${visiblePortfolioEntries.length} รายการแล้ว`);
  };

  const exportUserAccounts = () => {
    const rows = userAccounts.map((account) => {
      const employee = account.employeeId ? employeesById.get(account.employeeId) : null;
      const credentialState = accountCredentialState(account);
      return [
        account.loginId || "ยังไม่กำหนด",
        account.displayName,
        account.nickname || "",
        account.role === "admin" ? "HR / Admin" : account.role === "manager" ? "หัวหน้าทีม" : "พนักงาน",
        account.status === "active" ? "ใช้งาน" : "พักสิทธิ์",
        employee?.name ?? (account.role === "admin" ? "ระดับองค์กร" : "ยังไม่ผูก"),
        employee ? getRole(employee.roleId).name : "",
        account.email,
        account.hasPassword ? "มีรหัสผ่าน" : "ไม่มีรหัสผ่าน",
        account.mustChangePassword ? "ต้องเปลี่ยนรหัส" : "ไม่ต้องเปลี่ยนรหัส",
        credentialState.id === "locked" ? "ล็อก" : "ปกติ",
        account.lastLoginAt ?? "",
      ];
    });
    const content = [
      ["Username", "ชื่อ–นามสกุล", "ชื่อเล่น", "บทบาท", "สถานะ", "โปรไฟล์พนักงาน", "ตำแหน่ง", "อีเมล", "สถานะรหัสผ่าน", "การเปลี่ยนรหัส", "สถานะล็อก", "เข้าใช้ล่าสุด"],
      ...rows,
    ].map((row) => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `people-pulse-user-accounts-${bangkokIsoDate()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast(`ส่งออกข้อมูลผู้ใช้ ${userAccounts.length} บัญชีแล้ว`);
  };

  const isAdmin = currentUser?.role === "admin";
  const isEmployeeUser = currentUser?.role === "employee";
  const canManageRewardCatalog = Boolean(isAdmin && !isEmployeePreview);
  const rewardCatalog = canManageRewardCatalog ? rewards : rewards.filter((reward) => reward.isActive);
  const isEmployeeCoordinationCreate = Boolean(isEmployeeUser && !editingWorkItem);
  const assigningUserAccounts = userAccounts.filter((account) => account.role === "admin" || account.role === "manager");
  const workingUserAccounts = userAccounts.filter((account) => account.role === "employee");
  const activeAssigningUserCount = assigningUserAccounts.filter((account) => account.status === "active").length;
  const activeWorkingUserCount = workingUserAccounts.filter((account) => account.status === "active").length;
  const pendingRegistrationRequests = employeeRegistrationRequests.filter((request) => request.status === "pending").sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  const reviewedRegistrationRequests = employeeRegistrationRequests.filter((request) => request.status !== "pending").sort((a, b) => (b.reviewedAt ?? b.updatedAt).localeCompare(a.reviewedAt ?? a.updatedAt));
  const editingUserAccount = userAccounts.find((account) => account.id === userAccountForm.accountId);
  const userAccountRequiresTemporaryPassword = !userAccountForm.accountId || editingUserAccount?.hasPassword === false;
  const selectedUserKind = userAccountForm.role === "employee" ? "worker" : "assigner";
  const selectedUserKindLabel = selectedUserKind === "assigner" ? "คนสั่งงาน" : "คนทำงาน";
  const selectedUserRoleGuide = userAccountForm.role === "admin"
    ? "ดูแลทั้งองค์กร จัดการคน กฎ งาน การประเมิน ระบบ Points เงินเดือน และบัญชีผู้ใช้"
    : userAccountForm.role === "manager"
      ? "มอบหมายงาน ติดตามทีม ตรวจผลงาน และประเมินลูกทีม โดยไม่เห็นเงินเดือนหรือเอกสารส่วนตัว"
      : "รับงาน อัปเดตความคืบหน้า ส่งหลักฐาน และสร้างงานประสาน 0 Points ให้ตนเองหรือเพื่อนร่วมทีม โดยไม่มีสิทธิ์ตรวจอนุมัติ";
  const launchReadinessSteps = launchReadiness ? [
    {
      title: "ยืนยันล้างหรือเก็บข้อมูลตัวอย่างแยกจากงานจริง",
      detail: launchReadiness.demoEmployeeCount || launchReadiness.templatePolicyCount
        ? `ยังพบพนักงานตัวอย่าง ${launchReadiness.demoEmployeeCount} คน และนโยบายแม่แบบ ${launchReadiness.templatePolicyCount} ฉบับ`
        : launchReadiness.demoDataEnabled ? "โหมดข้อมูลตัวอย่างยังเปิดอยู่ กรุณายืนยันการตั้งค่าก่อนเริ่มงานจริง" : "ไม่พบข้อมูลตัวอย่างปะปนกับข้อมูลใช้งานจริง",
      ready: !launchReadiness.demoDataEnabled && launchReadiness.demoEmployeeCount === 0 && launchReadiness.templatePolicyCount === 0,
    },
    {
      title: "เพิ่มรายชื่อพนักงานจริง",
      detail: `พนักงานจริง ${Math.max(0, launchReadiness.activeEmployeeCount - launchReadiness.demoEmployeeCount)} คน · ข้อมูลตัวอย่าง ${launchReadiness.demoEmployeeCount} คน`,
      ready: launchReadiness.activeEmployeeCount - launchReadiness.demoEmployeeCount > 0,
    },
    {
      title: "ให้ HR/กฎหมายทบทวนและประกาศกฎองค์กร",
      detail: `ประกาศแล้ว ${launchReadiness.publishedPolicyCount} ฉบับ${launchReadiness.templatePolicyCount ? ` · ยังเป็นแม่แบบ ${launchReadiness.templatePolicyCount} ฉบับ` : ""}`,
      ready: launchReadiness.publishedPolicyCount > 0 && launchReadiness.templatePolicyCount === 0,
    },
    {
      title: "สร้างบัญชีให้ตรงกับพนักงานและตั้งรหัสชั่วคราว",
      detail: `ผูกบัญชีใช้งานแล้ว ${launchReadiness.activeLinkedAccountCount}/${launchReadiness.activeEmployeeCount} คน · ส่งชื่อผู้ใช้และรหัสชั่วคราวทางช่องทางส่วนตัว`,
      ready: launchReadiness.activeEmployeeCount > 0 && launchReadiness.activeLinkedAccountCount >= launchReadiness.activeEmployeeCount,
    },
    {
      title: "ให้พนักงานจริงเข้าสู่ระบบครั้งแรก",
      detail: `มีพนักงานเข้าสู่ระบบแล้ว ${launchReadiness.loggedInEmployeeAccountCount} คน`,
      ready: launchReadiness.loggedInEmployeeAccountCount > 0,
    },
    {
      title: "ทดสอบครบวงจร: รับงาน ส่งหลักฐาน และตรวจผลงาน",
      detail: `เอกสารจริง ${launchReadiness.realDocumentCount} รายการ · หลักฐานงาน ${launchReadiness.submittedWorkCount} รายการ`,
      ready: launchReadiness.realDocumentCount > 0 && launchReadiness.submittedWorkCount > 0,
    },
  ] : [];
  const launchReadinessScore = launchReadinessSteps.filter((step) => step.ready).length;
  const hasLaunchDemoWarning = Boolean(launchReadiness && (launchReadiness.demoEmployeeCount > 0 || launchReadiness.templatePolicyCount > 0));
  const launchReadinessStatus = !launchReadiness
    ? "กำลังรอข้อมูลตรวจสอบจากระบบ"
    : launchReadinessScore === launchReadinessSteps.length
      ? "ผ่านจุดตรวจหลัก พร้อมนัดทีมทดลองใช้งานจริง"
      : hasLaunchDemoWarning
        ? "ยังไม่ควรเปิดให้พนักงานใช้งานจริง"
        : "อยู่ระหว่างเตรียมความพร้อมก่อนเปิดใช้";
  const currentUserRoleLabel = currentUser?.role === "admin" ? "HR / Admin" : currentUser?.role === "manager" ? "หัวหน้าทีม" : "พนักงาน";
  const currentUserEmployee = currentUser?.employeeId ? safeWorkRosterById.get(currentUser.employeeId) ?? null : null;
  const activeRewardEmployeeId = isAdmin ? rewardEmployeeId : currentUser?.employeeId ?? "";
  const activeRewardBalance = pointBalances.get(activeRewardEmployeeId) ?? 0;
  const activeRewardRedemptions = rewardRedemptions
    .filter((redemption) => redemption.employeeId === activeRewardEmployeeId && redemption.status !== "cancelled")
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const rewardCurrentMoment = officeClock === "--:--" ? null : new Date(`${pointPolicyToday}T${officeClock}:00+07:00`);
  const rewardCurrentMonth = pointPolicyToday.slice(0, 7);
  const activeRewardMonthlyCount = activeRewardRedemptions.filter((redemption) => bangkokIsoMonth(redemption.createdAt) === rewardCurrentMonth).length;
  const latestRewardRedemption = activeRewardRedemptions[0] ?? null;
  const nextRewardRedemptionAt = latestRewardRedemption && pointRedemptionPolicy.cooldownDays > 0
    ? (() => {
        const date = new Date(latestRewardRedemption.createdAt);
        if (Number.isNaN(date.getTime())) return null;
        date.setUTCDate(date.getUTCDate() + pointRedemptionPolicy.cooldownDays);
        return date;
      })()
    : null;
  const rewardCooldownPassed = !nextRewardRedemptionAt || Boolean(rewardCurrentMoment && !Number.isNaN(rewardCurrentMoment.getTime()) && nextRewardRedemptionAt.getTime() <= rewardCurrentMoment.getTime());
  const hasCurrentPointPolicyAcknowledgement = !pointRedemptionPolicy.acknowledgementRequired || Boolean(activePointPolicyRecord && policyAcknowledgements.some((acknowledgement) => acknowledgement.policyId === activePointPolicyRecord.id && acknowledgement.policyVersion === activePointPolicyRecord.version && acknowledgement.employeeId === activeRewardEmployeeId));
  const rewardMinimumRequiredBalance = (rewardToRedeem?.costPoints ?? 0) + pointRedemptionPolicy.minimumBalanceAfterRedemption;
  const rewardPreflightChecks = rewardToRedeem ? [
    { id: "policy", passed: Boolean(activePointPolicyRecord), title: "กติกา Points มีผลใช้", detail: activePointPolicyLabel },
    { id: "acknowledgement", passed: hasCurrentPointPolicyAcknowledgement, title: "รับทราบกติกาฉบับปัจจุบัน", detail: pointRedemptionPolicy.acknowledgementRequired ? (hasCurrentPointPolicyAcknowledgement ? "บันทึกการรับทราบแล้ว" : "ต้องอ่านและกดรับทราบก่อนแลก") : "กติกาฉบับนี้ไม่บังคับกดรับทราบ" },
    { id: "balance", passed: activeRewardBalance >= rewardMinimumRequiredBalance, title: "Points เพียงพอและคงเหลือตามเกณฑ์", detail: `ต้องมีอย่างน้อย ${formatMoney(rewardMinimumRequiredBalance)} Points เพื่อให้เหลือ ${formatMoney(pointRedemptionPolicy.minimumBalanceAfterRedemption)} Points หลังแลก` },
    { id: "monthly-limit", passed: activeRewardMonthlyCount < pointRedemptionPolicy.maxRedemptionsPerMonth, title: "โควตาแลกรางวัลรายเดือน", detail: `ใช้แล้ว ${activeRewardMonthlyCount}/${pointRedemptionPolicy.maxRedemptionsPerMonth} ครั้งในเดือนนี้` },
    { id: "cooldown", passed: rewardCooldownPassed, title: `เว้นระยะ ${pointRedemptionPolicy.cooldownDays} วัน`, detail: rewardCooldownPassed ? "พ้นระยะรอแล้ว" : `แลกได้อีกครั้งวันที่ ${formatDueDate(nextRewardRedemptionAt!.toISOString().slice(0, 10))}` },
    { id: "stock", passed: rewardToRedeem.stock > 0, title: "รางวัลยังมีสิทธิ์คงเหลือ", detail: `เหลือ ${rewardToRedeem.stock} สิทธิ์` },
  ] : [];
  const canSubmitRewardRedemption = Boolean(activeRewardEmployeeId) && !isEmployeePreview && rewardPreflightChecks.every((check) => check.passed);
  const activeViewTitle = view === "work" && workSection === "quests" ? "ศูนย์เควส"
    : view === "work" && workSection === "points" && pointPanel === "policies" ? "กฎองค์กรและการรับทราบ"
    : isEmployeeUser && view === "work" && workSection === "points" ? "Points สะสมของฉัน"
    : isEmployeeUser && view === "work" && workSection === "rewards" ? "แลกรางวัล"
      : isEmployeeUser && view === "work" ? "งานของฉัน"
        : isEmployeeUser && view === "portfolio" ? "แฟ้มผลงานของฉัน"
          : isEmployeeUser && view === "office" ? "สำนักงานของทีม"
            : isEmployeeUser && view === "power" ? "ค่าพลังของฉันและทีม"
              : isEmployeeUser && view === "peopleOps" ? "การเติบโตและเงินเดือนของฉัน"
                : viewMeta[view].title;
  const activeViewDescription = view === "work" && workSection === "quests" ? (permissions.canManageQuests ? "สร้าง จัดกลุ่ม และประกาศเควสพร้อม Points และรางวัลให้ทีมเห็นอย่างชัดเจน" : "ดูเควสที่เปิดสำหรับคุณหรือทีม พร้อมเป้าหมาย กำหนดส่ง Points และรางวัลในที่เดียว")
    : view === "work" && workSection === "points" && pointPanel === "policies" ? (isAdmin ? "ร่าง ตรวจความครบถ้วน และประกาศกฎองค์กรให้พนักงานรับทราบอย่างตรวจสอบได้" : "อ่านกฎที่ประกาศใช้ เข้าใจกติกา Points และบันทึกการรับทราบของคุณ")
    : isEmployeeUser && view === "work" && workSection === "points" ? "ตรวจสอบยอด Points รายการได้–เสีย Points และที่มาทุกรายการของคุณ"
    : isEmployeeUser && view === "work" && workSection === "rewards" ? "ใช้ Points ของคุณแลกรางวัล และติดตามสถานะคำขอได้ในที่เดียว"
      : isEmployeeUser && view === "work" ? "ดูสิ่งที่ต้องทำ เริ่มงาน อัปเดตความคืบหน้า และส่งหลักฐานได้ในไม่กี่ขั้นตอน"
        : isEmployeeUser && view === "portfolio" ? "ค้นงานและหลักฐานของคุณ พร้อมติดตามสถานะการตรวจผลงาน"
          : isEmployeeUser && view === "office" ? "ดูสถานะภาระงานรวมของทีมโดยไม่เปิดเผยรายละเอียดงานส่วนบุคคล"
            : isEmployeeUser && view === "power" ? "เห็นจุดแข็งของตัวเอง เปรียบเทียบกับทีม และเลือกทักษะที่ควรพัฒนาต่อ"
              : isEmployeeUser && view === "peopleOps" ? "ดูเงินเดือน เงินเพิ่มตามสกิล เป้าหมายตำแหน่ง และแผนพัฒนาของคุณ"
                : viewMeta[view].description;
  const activeViewEyebrow = isEmployeeUser ? "EMPLOYEE PORTAL" : viewMeta[view].eyebrow;
  const peopleAiContext: PeopleAiContext = {
    userKey: currentUser?.id ?? currentUser?.email ?? "guest",
    userName: currentUser?.displayName ?? currentUser?.authenticatedName ?? "ผู้ใช้งาน",
    userRole: currentUserRoleLabel,
    period,
    currentView: activeViewTitle,
    canManagePeople: permissions.canManagePeople,
    canManageWork: permissions.canManageWork,
    employees: workforceInsights.map(({ employee, role, evaluation, bestFit }) => ({
      id: employee.id,
      name: employee.name,
      roleId: role.id,
      roleName: role.name,
      department: role.department,
      kpiScore: evaluation?.kpiScore ?? null,
      skillScore: evaluation?.skillScore ?? null,
      totalScore: evaluation?.totalScore ?? null,
      bestFitRole: bestFit?.role.name ?? "",
      bestFitScore: bestFit?.score ?? null,
      skills: role.skills.map((skill) => ({ name: skill.name, current: evaluation?.skillScores[skill.id] ?? null, target: skill.targetLevel })),
    })),
    tasks: workItems.map((item) => ({
      id: item.id,
      title: item.title,
      assigneeEmployeeId: item.assigneeEmployeeId,
      assigneeName: employeesById.get(item.assigneeEmployeeId)?.name ?? "ไม่ระบุผู้รับผิดชอบ",
      projectName: projectsById.get(item.projectId)?.name ?? "งานทั่วไป",
      status: item.status,
      priority: item.priority,
      progress: item.progress,
      dueDate: item.dueDate,
    })),
  };

  const openPeopleAi = () => {
    lastFocusedElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setShowNotifications(false);
    setShowUserMenu(false);
    setShowAiAssistant(true);
  };

  const updateAiMascotVisibility = (visible: boolean) => {
    setShowAiMascot(visible);
    try {
      window.localStorage.setItem(AI_MASCOT_VISIBILITY_STORAGE_KEY, visible ? "shown" : "hidden");
    } catch {
      // The preference is optional; hiding still works for the current page.
    }
  };

  const hideAiMascot = () => {
    updateAiMascotVisibility(false);
    showToast("ซ่อนหุ่น AI แล้ว เปิดกลับได้จากเมนูโปรไฟล์");
  };

  const handlePeopleAiAction = (action: PeopleAiActionId) => {
    if (action === "open_today") {
      setView("work");
      setWorkSection("tasks");
      setWorkDueFilter("today");
    } else if (action === "open_overdue") {
      setView("work");
      setWorkSection("tasks");
      setWorkDueFilter("overdue");
    } else if (action === "create_task" && permissions.canManageWork) {
      setView("work");
      setWorkSection("tasks");
      openWorkItemForm();
    } else if (action === "open_evaluations" && permissions.canManagePeople) {
      setView("employees");
    } else if (action === "open_skills" && permissions.canManagePeople) {
      setView("skills");
    } else if (action === "open_hr" && permissions.canManagePeople) {
      setView("hr");
    } else if (action === "open_portfolio") {
      setView("portfolio");
    }
    setShowAiAssistant(false);
  };

  if (authGate) {
    return <AuthScreen key={`${authGate.mode}:${authGate.loginId ?? ""}`} initialMode={authGate.mode} displayName={authGate.displayName} loginId={authGate.loginId} onAuthenticated={reloadAfterAuthentication} />;
  }

  if (accessDenied) {
    return (
      <main className="access-denied-page">
        <section role="alert" aria-labelledby="access-denied-title">
          <span className="access-lock">PP</span>
          <p className="eyebrow">PEOPLE PULSE ACCESS</p>
          <h1 id="access-denied-title">บัญชีนี้ยังไม่ได้รับสิทธิ์</h1>
          <p>{accessDenied.message}</p>
          <div><small>วิธีดำเนินการ</small><strong>ติดต่อ HR หรือผู้ดูแลระบบให้ตรวจสถานะบัญชีและบทบาท</strong></div>
          <button type="button" disabled={isLoggingOut} onClick={() => void logout(false)}>{isLoggingOut ? "กำลังออกจากระบบ..." : "กลับไปเข้าสู่ระบบด้วยบัญชีอื่น"}</button>
        </section>
        <div className={`toast ${toast ? `show ${toast.tone}` : ""}`} role={toast?.tone === "error" ? "alert" : "status"} aria-live={toast?.tone === "error" ? "assertive" : "polite"} aria-atomic="true"><span>{toast?.tone === "error" ? "!" : "✓"}</span>{toast?.message}</div>
      </main>
    );
  }

  if (isLoading && !currentUser) {
    return <main className="access-loading-page"><span /><strong>กำลังตรวจสอบสิทธิ์ใช้งาน...</strong></main>;
  }

  if (!currentUser && dataWarning) {
    return (
      <main className="access-denied-page access-load-error-page">
        <section role="alert" aria-labelledby="dashboard-load-error-title">
          <span className="access-lock" aria-hidden="true">!</span>
          <p className="eyebrow">เชื่อมต่อระบบไม่สำเร็จ</p>
          <h1 id="dashboard-load-error-title">ยังเปิดพื้นที่ทำงานไม่ได้</h1>
          <p>ข้อมูลผู้ใช้งานยังโหลดไม่ครบ ระบบจึงหยุดไว้ก่อนเพื่อไม่แสดงเมนูหรือข้อมูลผิดสิทธิ์</p>
          <div><small>รายละเอียด</small><strong>{dataWarning}</strong></div>
          <button type="button" onClick={() => { setDataWarning(""); setIsLoading(true); setDashboardReloadKey((key) => key + 1); }}>ลองเชื่อมต่ออีกครั้ง</button>
        </section>
      </main>
    );
  }

  return (
    <main className={`app-shell calm-shell ${isEmployeeUser ? "employee-portal-shell" : ""}`}>
      <header className="topbar">
        <button className="brand" onClick={() => { setActiveDepartment("all"); setWorkSection("quests"); setView("work"); }} aria-label="ไปที่ศูนย์เควส">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span><strong>{isEmployeeUser ? "MY PEOPLE PULSE" : "PEOPLE PULSE"}</strong><small>{isEmployeeUser ? "EMPLOYEE PORTAL" : "PEOPLE &amp; WORK OS"}</small></span>
        </button>
        <nav aria-label="เมนูหลัก">
          {isEmployeeUser ? <>
            <span className="nav-section-label">พื้นที่ของฉัน</span>
            <button className={view === "work" && workSection === "quests" ? "active quest-nav-button" : "quest-nav-button"} onClick={() => { setQuestTypeFilter("all"); setWorkSection("quests"); setView("work"); }}><span aria-hidden="true">Q</span><b>เควสของฉัน</b><em>{currentQuests.length}</em></button>
            <button className={view === "work" && workSection === "tasks" ? "active" : ""} onClick={() => { setActiveDepartment("all"); setEmployeeTaskScope("assigned"); setWorkSection("tasks"); setWorkAssigneeFilter(currentUser?.employeeId ?? "all"); setWorkDueFilter("all"); setWorkSearch(""); setView("work"); }}><span aria-hidden="true">✓</span><b>งานของฉัน</b><em>{employeeAssignedWorkItems.filter((item) => item.status !== "done").length}</em></button>
            <button className={view === "portfolio" ? "active" : ""} onClick={() => { setPortfolioEmployeeId(currentUser?.employeeId ?? "all"); setView("portfolio"); }}><span aria-hidden="true">◇</span><b>แฟ้มผลงานของฉัน</b></button>
            <span className="nav-section-label">ทีมของฉัน</span>
            <button className={view === "office" ? "active" : ""} onClick={() => setView("office")}><span aria-hidden="true">⌂</span><b>สำนักงานของทีม</b><em>{officePressureCount}</em></button>
            <button className={view === "power" ? "active" : ""} onClick={() => setView("power")}><span aria-hidden="true">◆</span><b>ค่าพลังทีม</b></button>
            <span className="nav-section-label">การเติบโต</span>
            <button className={view === "peopleOps" ? "active" : ""} onClick={() => setView("peopleOps")}><span aria-hidden="true">↗</span><b>เติบโต &amp; เงินเดือน</b></button>
            <button className={view === "work" && (workSection === "rewards" || (workSection === "points" && pointPanel !== "policies")) ? "active" : ""} onClick={() => { setPointPanel("overview"); setWorkSection("points"); setView("work"); }}><span aria-hidden="true">★</span><b>Points &amp; รางวัล</b><em>{formatMoney(currentUser?.employeeId ? pointBalances.get(currentUser.employeeId) ?? 0 : 0)}</em></button>
            <button className={view === "work" && workSection === "points" && pointPanel === "policies" ? "active" : ""} onClick={() => { setPointPanel("policies"); setWorkSection("points"); setView("work"); }}><span aria-hidden="true">§</span><b>กฎองค์กร</b>{pendingPolicyAcknowledgementCount > 0 && <em>{pendingPolicyAcknowledgementCount}</em>}</button>
          </> : <>
            <span className="nav-section-label">พื้นที่ทำงาน</span>
            <button className={view === "work" && workSection === "quests" ? "active quest-nav-button" : "quest-nav-button"} onClick={() => { setQuestTypeFilter("all"); setWorkSection("quests"); setView("work"); }}><span aria-hidden="true">Q</span><b>ศูนย์เควส</b><em>{currentQuests.length}</em></button>
            <button className={view === "work" && workSection !== "quests" && !(workSection === "points" && pointPanel === "policies") ? "active" : ""} onClick={() => { setActiveDepartment("all"); setWorkSection("tasks"); setWorkDueFilter("all"); setWorkSearch(""); setView("work"); }}><span aria-hidden="true">✓</span><b>งาน</b><em>{workItems.filter((item) => item.status !== "done").length}</em></button>
            <button className={view === "portfolio" ? "active" : ""} onClick={() => setView("portfolio")}><span aria-hidden="true">◇</span><b>แฟ้มผลงาน</b></button>
            <button className={showAiAssistant ? "active" : ""} onClick={openPeopleAi}><span aria-hidden="true">AI</span><b>ผู้ช่วย AI</b><em>ใหม่</em></button>
            <button className={view === "office" ? "active" : ""} onClick={() => setView("office")}><span aria-hidden="true">⌂</span><b>สำนักงานจำลอง</b><em>{officePressureCount}</em></button>
            <button className={view === "overview" ? "active" : ""} onClick={() => setView("overview")}><span aria-hidden="true">◫</span><b>ภาพรวมทีม</b></button>
            <span className="nav-section-label">ทีมและผลงาน</span>
            <button className={view === "employees" ? "active" : ""} onClick={() => setView("employees")}><span aria-hidden="true">♙</span><b>พนักงาน</b></button>
            <button className={view === "skills" ? "active" : ""} onClick={() => setView("skills")}><span aria-hidden="true">✦</span><b>สกิลทีม</b></button>
            <button className={view === "power" ? "active" : ""} onClick={() => setView("power")}><span aria-hidden="true">◆</span><b>ค่าพลัง</b></button>
            {isAdmin && <>
            <span className="nav-section-label">HR และระบบ</span>
            <button className={view === "peopleOps" ? "active" : ""} onClick={() => setView("peopleOps")}><span aria-hidden="true">◷</span><b>เวลา &amp; เติบโต</b><em>{pendingLeaveRecords.length}</em></button>
            <button className={view === "profiles" ? "active" : ""} onClick={() => setView("profiles")}><span aria-hidden="true">▣</span><b>แฟ้มพนักงาน</b></button>
            {permissions.canManageOrganizationDocuments && <button className={view === "organizationDocs" ? "active" : ""} onClick={() => setView("organizationDocs")}><span aria-hidden="true">▤</span><b>เอกสารองค์กร</b><em>{organizationDocuments.length}</em></button>}
            <button className={view === "hr" ? "active" : ""} onClick={() => setView("hr")}><span aria-hidden="true">⬡</span><b>บริหารบุคลากร</b></button>
            <button className={view === "work" && workSection === "points" && pointPanel === "policies" ? "active" : ""} onClick={() => { setPointPanel("policies"); setWorkSection("points"); setView("work"); }}><span aria-hidden="true">§</span><b>กฎองค์กร</b></button>
            <button className={view === "access" ? "active" : ""} onClick={() => setView("access")}><span aria-hidden="true">◎</span><b>ผู้ใช้งานและสิทธิ์</b><em>{userAccounts.filter((account) => account.status === "active").length}</em></button>
            </>}
          </>}
        </nav>
        <div className="header-actions">
          {!isEmployeeUser && <label className="period-select">
            <span className="period-label">รอบประเมิน</span>
            <select value={period} onChange={(event) => { setIsLoading(true); setPeriod(event.target.value); }}>{periods.map((item) => <option key={item}>{item}</option>)}</select>
          </label>}
          {!isEmployeeUser && <button className="icon-button evaluation-alert-button" onClick={() => pendingEmployees.length ? setView("employees") : showToast("ไม่มีรายการรอประเมิน")} aria-label={`${pendingEmployees.length} รายการรอประเมิน`}>
            <span aria-hidden="true">●</span>{pendingEmployees.length > 0 && <i />}
          </button>}
        </div>
      </header>

      {showUserMenu && <button type="button" className="user-menu-backdrop" onClick={() => setShowUserMenu(false)} aria-label="ปิดเมนูโปรไฟล์" />}
      <div className="top-right-utilities" aria-label="แจ้งเตือนและโปรไฟล์">
        <button
          className={`notification-bell-button ${showNotifications ? "active" : ""}`}
          onClick={() => { setShowAiAssistant(false); setShowUserMenu(false); setShowNotifications((open) => !open); }}
          aria-label={`กล่องข้อความและแจ้งเตือน มี ${unreadNotifications.length} รายการที่ยังไม่อ่าน`}
          aria-expanded={showNotifications}
          aria-controls="notification-center"
        >
          <span className="notification-bell-glyph" aria-hidden="true" />
          {unreadNotifications.length > 0 && <b>{unreadNotifications.length > 99 ? "99+" : unreadNotifications.length}</b>}
        </button>
        <button type="button" className={`top-profile-button ${showUserMenu ? "active" : ""}`} onClick={() => { setShowNotifications(false); setShowUserMenu((open) => !open); }} aria-label="เปิดเมนูจัดการโปรไฟล์" aria-expanded={showUserMenu}>
          <span className="top-profile-avatar">{currentUser?.displayName ? makeInitials(currentUser.displayName) : "PP"}</span>
          <span className="top-profile-copy"><strong>{currentUser?.displayName ?? "ผู้ใช้งาน"}</strong><small>{currentUserRoleLabel}</small></span>
          <i aria-hidden="true">⌄</i>
        </button>
        {showUserMenu && <aside className="top-profile-menu" aria-label="จัดการโปรไฟล์">
          <div className="top-profile-menu-head"><span>{currentUser?.displayName ? makeInitials(currentUser.displayName) : "PP"}</span><p><strong>{currentUser?.displayName ?? "ผู้ใช้งาน"}</strong><small>ชื่อผู้ใช้ {currentUser?.loginId || "—"}</small><b>{currentUserRoleLabel}</b></p></div>
          {currentUserEmployee && <div className="top-profile-work-summary"><span><small>ตำแหน่ง</small><strong>{getRole(currentUserEmployee.roleId).name}</strong></span><span><small>Points คงเหลือ</small><strong>{formatMoney(pointBalances.get(currentUserEmployee.id) ?? 0)}</strong></span></div>}
          <nav>
            <button type="button" onClick={() => { setShowUserMenu(false); if (isAdmin) { if (currentUser?.employeeId) setProfileEmployeeId(currentUser.employeeId); setView("profiles"); } else { setPortfolioEmployeeId(currentUser?.employeeId ?? "all"); setView("portfolio"); } }}><span>▣</span><p><strong>{isAdmin ? "จัดการโปรไฟล์" : "แฟ้มผลงานของฉัน"}</strong><small>{isAdmin ? "ข้อมูล เอกสาร และสัญญา" : "ดูผลงานและหลักฐานที่ส่งไว้"}</small></p></button>
            <button type="button" onClick={() => { setShowUserMenu(false); setView("work"); setWorkSection("tasks"); setWorkAssigneeFilter(currentUser?.employeeId ?? "all"); }}><span>✓</span><p><strong>งานของฉัน</strong><small>เปิดรายการสิ่งที่ต้องทำ</small></p></button>
            <button type="button" onClick={() => { setShowUserMenu(false); setView("work"); setWorkSection("points"); setPointPanel("policies"); }}><span>§</span><p><strong>กฎองค์กร</strong><small>{isAdmin ? "ร่าง ประกาศ และติดตามการรับทราบ" : "อ่านกฎที่ประกาศใช้และยืนยันรับทราบ"}</small></p></button>
            {isEmployeeUser && <button type="button" onClick={() => { setShowUserMenu(false); setView("peopleOps"); }}><span>↗</span><p><strong>การเติบโตและเงินเดือน</strong><small>ดูเป้าหมาย สกิล และค่าตอบแทนของฉัน</small></p></button>}
            {isEmployeeUser && <button type="button" onClick={() => { setShowUserMenu(false); setView("work"); setWorkSection("points"); setPointPanel("overview"); }}><span>★</span><p><strong>Points และรางวัล</strong><small>ดูยอด Points และเลือกรางวัล</small></p></button>}
            {!isEmployeeUser && <button type="button" className="profile-ai-toggle" role="switch" aria-checked={showAiMascot} onClick={() => updateAiMascotVisibility(!showAiMascot)}><span aria-hidden="true">AI</span><p><strong>แสดงหุ่น AI ผู้ช่วย</strong><small>{showAiMascot ? "เปิดอยู่ · กดเพื่อซ่อนจากหน้าเว็บ" : "ปิดอยู่ · กดเมื่อต้องการให้หุ่นกลับมา"}</small></p><i className="profile-ai-switch" aria-hidden="true" /></button>}
            {isEmployeePreview ? <button type="button" onClick={() => window.location.assign("/")}><span>←</span><p><strong>กลับมุมมองผู้ดูแล</strong><small>ออกจากโหมดทดลองพนักงาน</small></p></button> : <>
              <button type="button" onClick={() => { setShowUserMenu(false); setShowChangePassword(true); }}><span>⌁</span><p><strong>เปลี่ยนรหัสผ่าน</strong><small>ยืนยันรหัสปัจจุบันและตั้งรหัสใหม่</small></p></button>
              <button type="button" disabled={isLoggingOut} onClick={() => void logout(false)}><span>↗</span><p><strong>ออกจากระบบ</strong><small>ออกจากอุปกรณ์เครื่องนี้</small></p></button>
              <button type="button" disabled={isLoggingOut} onClick={() => { if (window.confirm("ต้องการออกจากระบบทุกอุปกรณ์ใช่หรือไม่?")) void logout(true); }}><span>⊘</span><p><strong>ออกจากระบบทุกอุปกรณ์</strong><small>ยกเลิกเซสชันที่เปิดอยู่ทั้งหมด</small></p></button>
            </>}
          </nav>
        </aside>}
      </div>

      {showNotifications && <div className="notification-layer" role="presentation" onMouseDown={() => setShowNotifications(false)}>
        <aside id="notification-center" className="notification-center" role="dialog" aria-modal="true" aria-labelledby="notification-center-title" onMouseDown={(event) => event.stopPropagation()}>
          <header className="notification-center-header">
            <div><span className="notification-center-mark"><i className="notification-bell-glyph" aria-hidden="true" /></span><p><small>MESSAGE CENTER</small><strong id="notification-center-title">กล่องข้อความและแจ้งเตือน</strong></p></div>
            <button type="button" onClick={() => setShowNotifications(false)} aria-label="ปิดกล่องแจ้งเตือน">×</button>
          </header>
          <section className="notification-summary" aria-label="สรุปการแจ้งเตือน">
            <article><span>ยังไม่อ่าน</span><strong>{unreadNotifications.length}</strong></article>
            <article className="quest"><span>เควสที่เปิดอยู่</span><strong>{questNotificationCount}</strong></article>
            <button type="button" disabled={isEmployeePreview || !unreadNotifications.length} onClick={() => void markNotificationsRead(unreadNotifications.map((item) => item.id))}>{isEmployeePreview ? "อ่านอย่างเดียว" : "อ่านทั้งหมด"}</button>
          </section>
          <nav className="notification-tabs" aria-label="กรองการแจ้งเตือน">
            <button type="button" className={notificationFilter === "all" ? "active" : ""} onClick={() => setNotificationFilter("all")}>ทั้งหมด <span>{notifications.length}</span></button>
            <button type="button" className={notificationFilter === "unread" ? "active" : ""} onClick={() => setNotificationFilter("unread")}>ยังไม่อ่าน <span>{unreadNotifications.length}</span></button>
            <button type="button" className={notificationFilter === "quest" ? "active" : ""} onClick={() => setNotificationFilter("quest")}>เควส <span>{questNotificationCount}</span></button>
          </nav>
          <div className="notification-list">
            {visibleNotifications.length ? visibleNotifications.map((notification) => {
              const meta = notificationKindMeta[notification.kind];
              const isUnread = !notificationReadIds.has(notification.id);
              return <button type="button" key={notification.id} className={`notification-card ${notification.kind} ${isUnread ? "unread" : ""}`} onClick={() => openNotification(notification)}>
                <span className="notification-kind-icon" aria-hidden="true">{meta.icon}</span>
                <span className="notification-card-copy">
                  <span><em>{meta.label}</em><time>{formatNotificationTime(notification.createdAt)}</time></span>
                  <strong>{notification.title}</strong>
                  <small>{notification.message}</small>
                  <b>{notification.actionLabel} →</b>
                </span>
                {isUnread && <i className="notification-unread-dot" aria-label="ยังไม่อ่าน" />}
              </button>;
            }) : <div className="notification-empty"><span>✓</span><strong>{notificationFilter === "quest" ? "ยังไม่มีเควสที่เปิดอยู่" : "อ่านครบแล้ว"}</strong><p>เมื่อมีเควส งานใกล้กำหนด หรืองานรอตรวจ ระบบจะแจ้งที่นี่</p></div>}
          </div>
          <footer className="notification-center-footer"><span className="live-dot" /> {isEmployeePreview ? "โหมดทดลองจะไม่บันทึกสถานะการอ่าน" : "แจ้งเตือนจากงานและเควสตามสิทธิ์ของคุณ"}</footer>
        </aside>
      </div>}

      <section className="dashboard">
        {dataWarning && <div className="data-warning" role="status"><span>!</span>{dataWarning}</div>}
        {employeePreview && (
          <section className="employee-preview-banner" role="status" aria-label="โหมดทดลองมุมมองพนักงาน">
            <span className="employee-preview-badge">TEST VIEW</span>
            <div>
              <strong>กำลังทดลองมุมมองของ {currentUserEmployee?.name ?? "พนักงาน"}</strong>
              <p>โหมดนี้อ่านอย่างเดียว · ดูงาน หลักฐาน Points และการเติบโตได้ โดยไม่เปลี่ยนข้อมูลจริง</p>
            </div>
            <button type="button" onClick={() => window.location.assign("/")}>กลับมุมมองผู้ดูแล <span aria-hidden="true">→</span></button>
          </section>
        )}
        {isEmployeeUser && currentUserEmployee && view === "work" && workSection === "tasks" && (
          <section className="employee-portal-welcome">
            <div className="employee-welcome-person">
              <EmployeeAvatar employee={currentUserEmployee} profile={employeeProfilesById.get(currentUserEmployee.id)} className="avatar-growth" />
              <div><p className="eyebrow">MY WORKSPACE</p><h2>สวัสดี {currentUserEmployee.name}</h2><p>{getRole(currentUserEmployee.roleId).name} · วันนี้จัดการงานและการเติบโตของคุณได้จากหน้าจอเดียว</p></div>
            </div>
            <div className="employee-welcome-stats">
              <button onClick={() => { setEmployeeTaskScope("assigned"); setWorkDueFilter("today"); setWorkSection("tasks"); }}><span>✓</span><p><small>งานวันนี้</small><strong>{employeeAssignedTodayCount}</strong></p></button>
              <button onClick={() => { setEmployeeTaskScope("assigned"); setWorkDueFilter("review"); setWorkSection("tasks"); }}><span>⌕</span><p><small>รอตรวจ</small><strong>{employeeAssignedReviewCount}</strong></p></button>
              <button onClick={() => setView("peopleOps")}><span>↗</span><p><small>พร้อมเติบโต</small><strong>{promotionReadiness}%</strong></p></button>
              <button onClick={() => { setPointPanel("overview"); setWorkSection("points"); }}><span>★</span><p><small>Points คงเหลือ</small><strong>{formatMoney(pointBalances.get(currentUserEmployee.id) ?? 0)}</strong></p></button>
            </div>
            <div className="employee-welcome-shortcuts">
              <button onClick={() => { setPortfolioEmployeeId(currentUserEmployee.id); setView("portfolio"); }}>แฟ้มผลงานของฉัน <span>→</span></button>
              <button onClick={() => setView("office")}>ดูสำนักงานทีม <span>→</span></button>
              <button onClick={() => setView("power")}>ดูค่าพลัง <span>→</span></button>
            </div>
          </section>
        )}
        <div className="page-heading">
          <div>
            <p className="eyebrow">{activeViewEyebrow}</p>
            <h1>{activeViewTitle}</h1>
            <p>{activeViewDescription}</p>
          </div>
          {!isEmployeeUser && view !== "access" && view !== "work" && view !== "organizationDocs" && <div className="heading-actions">
            <button className="secondary-button" onClick={() => view === "office" ? setView("work") : view === "peopleOps" ? buildGrowthTeam() : view === "profiles" ? showToast(`${requiredDocumentTypes.length - verifiedRequiredDocuments} เอกสารจำเป็นยังตรวจไม่ครบ`) : view === "power" ? showToast("ค่าพลังรวมมาจากค่าสกิล 70% และ KPI 30%") : view === "portfolio" ? exportPortfolioReport() : exportReport()}><span aria-hidden="true">{view === "office" ? "✓" : view === "peopleOps" ? "♙" : view === "profiles" ? "▣" : view === "power" ? "i" : "↓"}</span> {view === "office" ? "เปิดทูดูลิส" : view === "peopleOps" ? "สร้างทีมจากสกิล" : view === "profiles" ? "เช็กเอกสารที่ขาด" : view === "power" ? "วิธีคำนวณ" : view === "portfolio" ? "ส่งออกแฟ้ม CSV" : "ส่งออกรายงาน"}</button>
            <button className="primary-button" onClick={() => {
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
            }}><span aria-hidden="true">{view === "power" ? "VS" : view === "office" ? "⌁" : view === "peopleOps" ? "◷" : "＋"}</span> {view === "office" ? "หาคนพร้อมรับงาน" : view === "peopleOps" ? "ลงเวลาตอนนี้" : view === "hr" ? "เพิ่มแผนบุคลากร" : view === "profiles" ? "แก้ไขโปรไฟล์" : view === "power" ? "เปรียบเทียบค่าพลัง" : view === "portfolio" ? "เติมหลักฐานที่ขาด" : "เริ่มประเมิน"}</button>
          </div>}
        </div>

        {!isEmployeeUser && view !== "access" && view !== "work" && view !== "organizationDocs" && <div className="filter-row" aria-label="กรองตามแผนก">
          {departmentFilters.map((filter) => (
            <button key={filter.id} className={activeDepartment === filter.id ? "active" : ""} onClick={() => setActiveDepartment(filter.id)}>{filter.label}</button>
          ))}
        </div>}

        {view === "office" && (
          <section className="office-simulation-layout">
            <section className="office-command-center">
              <div className="office-command-copy">
                <span className="office-live-label"><i /> สำนักงาน 3D แบบเรียลไทม์</span>
                <h2>{isEmployeeUser ? <>เห็นจังหวะการทำงานของทีม<br />โดยไม่รบกวนกัน</> : <>โลกสำนักงาน 3D สร้างใหม่<br />หมุนดูได้และมีชีวิตจริง</>}</h2>
                <p>{isEmployeeUser ? "สถานะตัวละครแสดงเฉพาะภาระงานโดยรวม ไม่เปิดรายละเอียด กำหนดส่ง หรือลิงก์งานของเพื่อนร่วมทีม" : "ทุกห้อง เฟอร์นิเจอร์ แสงธรรมชาติ และตัวละครถูกสร้างเป็นวัตถุ 3D จริง ไม่มีภาพออฟฟิศเป็นพื้นหลัง พนักงานแต่ละคนเลือกเส้นทางและกิจกรรมตามภาระงาน"}</p>
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
              <div><p className="eyebrow">ISOMETRIC 3D OFFICE WORLD</p><h2>สำนักงานใหญ่ 3D หลายห้องในโลกเดียวกัน</h2><small>{isEmployeeUser ? "ลากเพื่อหมุน เลื่อนเพื่อซูม และกดตัวละครเพื่อดูสถานะภาระงานโดยรวม" : "ลากเพื่อหมุน เลื่อนเพื่อซูม ดูโมเดลเดินข้ามห้อง และกดตัวละครเพื่อเปิดงานของคนนั้น"}</small></div>
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

            {office3DPeople.length ? <Suspense fallback={<div className="office-3d-loading"><span /><strong>กำลังสร้างสำนักงาน 3D...</strong><small>ประกอบ 7 ห้อง พื้นที่สีเขียว และโมเดลตัวละครตามภาระงาน</small></div>}><Office3D people={office3DPeople} onSelect={(employeeId) => {
              if (isEmployeeUser) {
                const teammate = teamOverview.employees.find((employee) => employee.id === employeeId);
                showToast(`${teammate?.name ?? "เพื่อนร่วมทีม"} · แสดงเฉพาะสถานะภาระงานโดยรวม`);
                return;
              }
              setWorkAssigneeFilter(employeeId);
              setWorkDueFilter("all");
              setWorkSearch("");
              setWorkSection("tasks");
              setView("work");
            }} /></Suspense> : <div className="office-empty"><span>⌂</span><strong>ไม่มีพนักงานในกลุ่มนี้</strong><p>ลองเลือกสถานะหรือแผนกอื่นเพื่อเรียกทุกคนกลับเข้าสำนักงานจำลอง</p><button onClick={() => { setOfficeLoadFilter("all"); setActiveDepartment("all"); }}>แสดงทุกคน</button></div>}
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
              {canManageEmployeeFiles && <button className="primary-button" onClick={() => setShowAddEmployee(true)}>＋ เพิ่มพนักงาน</button>}
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
                      {canManageEmployeeFiles && <button className="dossier-button" onClick={() => { setProfileEmployeeId(employee.id); setView("profiles"); }}>ดูแฟ้ม</button>}
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

        {view === "profiles" && canManageEmployeeFiles && (
          <section className="dossier-layout">
            <aside className="dossier-roster">
              <div className="dossier-roster-heading"><div><p className="eyebrow">EMPLOYEE FILES</p><h2>เลือกพนักงาน</h2></div><span>{dossierEmployees.length}</span></div>
              <label className="dossier-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาชื่อหรือตำแหน่ง" /></label>
              <label className="dossier-status-filter"><span>สถานะ</span><select value={dossierStatusFilter} onChange={(event) => {
                const nextFilter = event.target.value as DossierStatusFilter;
                setDossierStatusFilter(nextFilter);
                const firstMatch = employees.find((employee) => nextFilter === "all"
                  ? employee.status !== "archived"
                  : nextFilter === "resigned"
                    ? employee.status === "resigned" || employee.status === "inactive"
                    : employee.status === nextFilter);
                setProfileEmployeeId(firstMatch?.id ?? "");
              }}><option value="all">ทั้งหมดที่ยังเก็บในแฟ้ม</option><option value="active">ทำงานอยู่</option><option value="resigned">ลาออกแล้ว</option><option value="archived">ลบออกจากรายชื่อแล้ว</option></select></label>
              <div className="dossier-people">
                {dossierEmployees.map((employee) => {
                  const employeeDocuments = applicationDocuments.filter((document) => document.employeeId === employee.id);
                  const verified = requiredDocumentTypes.filter((type) => employeeDocuments.some((document) => document.documentType === type && document.status === "verified")).length;
                  const signed = employmentContracts.some((contract) => contract.employeeId === employee.id && contract.status === "signed");
                  return <button key={employee.id} className={`${profileEmployee?.id === employee.id ? "active" : ""} status-${employee.status}`} onClick={() => setProfileEmployeeId(employee.id)}><EmployeeAvatar employee={employee} profile={employeeProfilesById.get(employee.id)} className="avatar-roster" /><span><strong>{employee.name}</strong><small>{employeeLifecycleLabel(employee.status)} · {getRole(employee.roleId).shortName} · เอกสาร {verified}/{requiredDocumentTypes.length}</small></span><b className={signed ? "signed" : ""}>{signed ? "✓" : "!"}</b></button>;
                })}
                {!dossierEmployees.length && <div className="dossier-roster-empty">ไม่พบพนักงานตามสถานะที่เลือก</div>}
              </div>
            </aside>

            {profileEmployee ? (
              <section className="dossier-main">
                <header className="dossier-hero">
                  <div className="dossier-person"><div className="profile-photo-control"><EmployeeAvatar employee={profileEmployee} profile={profileRecord} className="avatar-dossier" /><label>{uploadingProfileImage ? "กำลังอัปโหลด" : "เปลี่ยนรูป"}<input type="file" accept=".jpg,.jpeg,.png,.webp" disabled={uploadingProfileImage || profileEmployee.status === "archived"} onChange={(event) => { const file = event.target.files?.[0]; void uploadProfileImage(file); event.currentTarget.value = ""; }} /></label></div><div><p className="eyebrow">DIGITAL EMPLOYEE FILE</p><h2>{profileEmployee.name}</h2><small>{getRole(profileEmployee.roleId).name} · {getRole(profileEmployee.roleId).department}</small><em className={`employee-lifecycle-badge status-${profileEmployee.status}`}>{employeeLifecycleLabel(profileEmployee.status)}</em></div></div>
                  <div className="dossier-completeness"><span style={{ "--dossier-score": `${dossierCompleteness}%` } as React.CSSProperties}><b>{dossierCompleteness}%</b></span><div><strong>ความสมบูรณ์ของแฟ้ม</strong><small>{dossierCompleteness >= 85 ? "ข้อมูลพร้อมใช้งาน" : "ยังมีข้อมูลหรือเอกสารที่ต้องเติม"}</small></div></div>
                  <div className="dossier-lifecycle-actions">
                    {profileEmployee.status === "archived" ? <><button type="button" className="restore-employee" disabled={isSaving} onClick={() => void updateEmployeeLifecycleStatus(profileEmployee, "resigned")}>กู้คืนแฟ้ม</button><button type="button" className="purge-employee" disabled={isSaving} title="ลบข้อมูลและไฟล์ทั้งหมดถาวร กู้คืนไม่ได้" onClick={() => void deleteEmployeePermanently(profileEmployee)}>ลบถาวร</button></> : <>
                      <label><span>สถานะการจ้าง</span><select value={profileEmployee.status === "active" ? "active" : "resigned"} disabled={isSaving} onChange={(event) => void updateEmployeeLifecycleStatus(profileEmployee, event.target.value as "active" | "resigned")}><option value="active">ทำงานอยู่</option><option value="resigned">ลาออกแล้ว</option></select></label>
                      <button type="button" onClick={openProfileEditor}>แก้ไขข้อมูล</button>
                      <button type="button" className="archive-employee" disabled={isSaving || profileEmployee.status === "active"} title={profileEmployee.status === "active" ? "เลือก “ลาออกแล้ว” ก่อนลบออกจากรายชื่อ" : "ซ่อนจากรายชื่อโดยเก็บประวัติไว้"} onClick={() => void archiveEmployeeRecord(profileEmployee)}>ลบออกจากรายชื่อ</button>
                    </>}
                  </div>
                </header>

                <div className="dossier-metrics">
                  <article><span>▣</span><div><small>เอกสารจำเป็น</small><strong>{verifiedRequiredDocuments}/{requiredDocumentTypes.length}</strong><em>{verifiedRequiredDocuments === requiredDocumentTypes.length ? "ตรวจครบแล้ว" : `ขาด ${requiredDocumentTypes.length - verifiedRequiredDocuments} รายการ`}</em></div></article>
                  <article><span>✎</span><div><small>สถานะสัญญา</small><strong>{profileContracts[0] ? contractStatusLabel(profileContracts[0].status) : "ยังไม่มีสัญญา"}</strong><em>{profileContracts[0]?.signedAt ? `ลงนาม ${formatUpdatedAt(profileContracts[0].signedAt)}` : "ติดตามในแฟ้มนี้"}</em></div></article>
                  <article><span>◷</span><div><small>วันเริ่มงาน</small><strong>{profileRecord?.startDate ? new Date(`${profileRecord.startDate}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : "ยังไม่ระบุ"}</strong><em>{profileRecord ? employmentTypeLabel(profileRecord.employmentType) : "กรอกข้อมูลการจ้าง"}</em></div></article>
                  <article className={activeProfileWarningCount ? "metric-warning" : ""}><span>!</span><div><small>ใบเตือนที่ยังไม่ปิดเรื่อง</small><strong>{activeProfileWarningCount}</strong><em>{profileWarnings.length ? `ทั้งหมด ${profileWarnings.length} รายการ` : "ยังไม่มีประวัติ"}</em></div></article>
                  <article className={overdueActiveProfileRecognitionCount ? "metric-recognition metric-overdue" : "metric-recognition"}><span>★</span><div><small>เกียรติบัตร / รางวัลที่ใช้ได้</small><strong>{activeProfileRecognitionCount}</strong><em>{overdueActiveProfileRecognitionCount ? `เลยวันหมดอายุ ${overdueActiveProfileRecognitionCount} รายการ` : profileRecognitions.length ? `ทั้งหมด ${profileRecognitions.length} รายการ` : "ยังไม่มีรายการ"}</em></div></article>
                </div>

                <div className="dossier-content-grid">
                  <section className="profile-detail-card">
                    <div className="dossier-section-heading"><div><p className="eyebrow">PERSONAL & EMPLOYMENT</p><h3>ข้อมูลพนักงานแบบละเอียด</h3></div>{profileEmployee.status !== "archived" && <button onClick={openProfileEditor}>แก้ไข</button>}</div>
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
                            {profileEmployee.status !== "archived" && document?.status === "pending" && <><button onClick={() => reviewEmployeeDocument(document, "verified")}>ตรวจผ่าน</button><button className="reject" onClick={() => reviewEmployeeDocument(document, "rejected")}>ให้แก้ไข</button></>}
                            {profileEmployee.status !== "archived" && <label className="upload-document-button">{uploadingDocumentType === documentType ? "กำลังอัปโหลด..." : document ? "อัปโหลดใหม่" : "อัปโหลด"}<input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" disabled={uploadingDocumentType !== null} onChange={(event) => { const file = event.target.files?.[0]; void uploadEmployeeDocument(documentType, file); event.currentTarget.value = ""; }} /></label>}
                          </div>
                        </article>;
                      })}
                    </div>
                    <p className="document-help">รองรับ PDF, Word, JPG และ PNG ขนาดไม่เกิน 10 MB ต่อไฟล์</p>
                  </section>

                  {permissions.canManageEmployeeWarnings && <section className="employee-warning-card">
                    <div className="dossier-section-heading"><div><p className="eyebrow">DISCIPLINARY RECORD</p><h3>ประวัติใบเตือน</h3></div>{profileEmployee.status !== "archived" && <button type="button" className="warning-create-button" onClick={openEmployeeWarningCreator}>＋ เพิ่มใบเตือน</button>}</div>
                    <div className="employee-warning-list">
                      {profileWarnings.map((warning) => <article key={warning.id} className={`status-${warning.status}`}>
                        <span className="employee-file-record-mark" aria-hidden="true">!</span>
                        <div className="employee-file-record-copy"><span><b>{employeeWarningLevelLabels[warning.level]}</b><em className={warning.status}>{employeeWarningStatusLabels[warning.status]}</em></span><strong>{warning.subject}</strong><p>{warning.warningNumber} · ออกวันที่ {formatDueDate(warning.issuedDate)} · เหตุเกิด {formatDueDate(warning.incidentDate)}</p>{warning.correctiveAction && <small>แนวทางปรับปรุง: {warning.correctiveAction}</small>}</div>
                        <div className="employee-file-record-actions">
                          {warning.hasFile && <a href={`/api/employee-warnings?id=${encodeURIComponent(warning.id)}`}>ดาวน์โหลด</a>}
                          {profileEmployee.status !== "archived" && <>{warning.status === "draft" && <button type="button" disabled={isSaving} onClick={() => void updateEmployeeWarningStatus(warning, "issued")}>ออกใบเตือน</button>}{warning.status === "issued" && <button type="button" disabled={isSaving} onClick={() => void updateEmployeeWarningStatus(warning, "acknowledged")}>HR บันทึกรับทราบ</button>}{(warning.status === "issued" || warning.status === "acknowledged") && <button type="button" disabled={isSaving} onClick={() => void updateEmployeeWarningStatus(warning, "resolved")}>ปิดเรื่อง</button>}{warning.status !== "withdrawn" && warning.status !== "resolved" && <button type="button" className="withdraw" disabled={isSaving} onClick={() => void updateEmployeeWarningStatus(warning, "withdrawn")}>เพิกถอน</button>}</>}
                        </div>
                      </article>)}
                      {!profileWarnings.length && <div className="employee-file-record-empty"><span>✓</span><strong>ยังไม่มีประวัติใบเตือน</strong><p>เมื่อ HR บันทึกฉบับร่างหรือออกเอกสาร รายการจะอยู่ในแฟ้มนี้</p></div>}
                    </div>
                    <div className="warning-fairness-note" role="note"><span>i</span><p><strong>การรับทราบไม่เท่ากับการยอมรับผิด</strong> ใบเตือนในแฟ้มนี้ไม่หัก Points อัตโนมัติ การบันทึกรายการวินัยต้องตรวจข้อเท็จจริงและดำเนินการแยกต่างหาก</p></div>
                  </section>}

                  {permissions.canManageEmployeeRecognitions && <section className="employee-recognition-card">
                    <div className="dossier-section-heading"><div><p className="eyebrow">RECOGNITION &amp; CREDENTIALS</p><h3>เกียรติบัตรและรางวัลจากผลงาน</h3></div>{profileEmployee.status !== "archived" && <button type="button" className="recognition-create-button" onClick={openEmployeeRecognitionCreator}>＋ เพิ่มรายการ</button>}</div>
                    <div className="employee-recognition-list">
                      {profileRecognitions.map((recognition) => {
                        const isOverdue = recognition.status === "active" && Boolean(recognition.expiryDate) && recognition.expiryDate! < organizationDocumentToday;
                        return <article key={recognition.id} className={`status-${recognition.status}${isOverdue ? " is-overdue" : ""}`}>
                          <span className="employee-file-record-mark" aria-hidden="true">★</span>
                          <div className="employee-file-record-copy"><span><b>{employeeRecognitionTypeLabels[recognition.recognitionType]}</b><em className={recognition.status}>{employeeRecognitionStatusLabels[recognition.status]}</em>{isOverdue && <em className="overdue">เลยวันหมดอายุ</em>}</span><strong>{recognition.title}</strong><p>{recognition.issuer || "ไม่ระบุผู้ออก"} · ได้รับ {formatDueDate(recognition.issuedDate)} · หมดอายุ {recognition.expiryDate ? formatDueDate(recognition.expiryDate) : "ไม่กำหนด"}</p>{recognition.credentialId && <small>Credential ID: {recognition.credentialId}</small>}</div>
                          <div className="employee-file-record-actions">
                            {recognition.hasFile && <a href={`/api/employee-recognitions?id=${encodeURIComponent(recognition.id)}`}>ดาวน์โหลด</a>}
                            {recognition.verificationUrl && <a href={recognition.verificationUrl} target="_blank" rel="noreferrer">ตรวจสอบลิงก์</a>}
                            {profileEmployee.status !== "archived" && <>{recognition.status === "active" && recognition.expiryDate && recognition.expiryDate < organizationDocumentToday && <button type="button" disabled={isSaving} onClick={() => void updateEmployeeRecognitionStatus(recognition, "expired")}>ทำเครื่องหมายหมดอายุ</button>}{recognition.status === "expired" && <button type="button" disabled={isSaving} onClick={() => void updateEmployeeRecognitionStatus(recognition, "active")}>เปิดใช้งานอีกครั้ง</button>}{recognition.status !== "revoked" && <button type="button" className="withdraw" disabled={isSaving} onClick={() => void updateEmployeeRecognitionStatus(recognition, "revoked")}>เพิกถอน</button>}</>}
                          </div>
                        </article>;
                      })}
                      {!profileRecognitions.length && <div className="employee-file-record-empty recognition"><span>★</span><strong>ยังไม่มีเกียรติบัตรหรือรางวัล</strong><p>เพิ่มหลักฐานความสำเร็จ ใบรับรองการอบรม หรือใบอนุญาตวิชาชีพได้ที่นี่</p></div>}
                    </div>
                  </section>}

                  <section className="contracts-card">
                    <div className="dossier-section-heading"><div><p className="eyebrow">EMPLOYMENT CONTRACTS</p><h3>สัญญาจ้างและการลงนาม</h3></div>{profileEmployee.status !== "archived" && <button className="contract-create-button" onClick={openContractCreator}>＋ สร้างสัญญา</button>}</div>
                    <div className="contract-file-strip">
                      <span>▤</span><div><strong>ไฟล์ต้นฉบับสัญญา</strong><small>{profileContractDocuments[0]?.fileName ?? "อัปโหลด PDF หรือ Word ก่อนผูกกับสัญญา"}</small></div>
                      {profileContractDocuments[0]?.storageKey && <a href={`/api/documents?id=${encodeURIComponent(profileContractDocuments[0].id)}`}>ดาวน์โหลด</a>}
                      {profileEmployee.status !== "archived" && <label>{uploadingDocumentType === "contract" ? "กำลังอัปโหลด..." : "อัปโหลดไฟล์"}<input type="file" accept=".pdf,.doc,.docx" disabled={uploadingDocumentType !== null} onChange={(event) => { const file = event.target.files?.[0]; void uploadEmployeeDocument("contract", file); event.currentTarget.value = ""; }} /></label>}
                    </div>
                    <div className="contract-list">
                      {profileContracts.map((contract, index) => {
                        const linkedDocument = applicationDocuments.find((document) => document.id === contract.documentId);
                        return <article key={contract.id} className={contract.status}>
                          <span className="contract-sequence">{String(profileContracts.length - index).padStart(2, "0")}</span>
                          <div className="contract-copy"><span><b className={`contract-status ${contract.status}`}>{contractStatusLabel(contract.status)}</b><small>เวอร์ชัน {contract.version}</small></span><strong>{contract.title}</strong><p>มีผล {new Date(`${contract.effectiveDate}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}{contract.expiryDate ? ` ถึง ${new Date(`${contract.expiryDate}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}` : " · ไม่มีกำหนด"}</p>{contract.status === "signed" && <em>ลงนามโดย {contract.signedName} · {formatUpdatedAt(contract.signedAt ?? contract.updatedAt)} · {contract.signerEmail}</em>}</div>
                          <div className="contract-actions">{linkedDocument?.storageKey && <a href={`/api/documents?id=${encodeURIComponent(linkedDocument.id)}`}>เปิดไฟล์</a>}{profileEmployee.status !== "archived" && contract.status === "draft" && <button onClick={() => void sendEmploymentContract(contract)}>ส่งให้ลงนาม</button>}{(contract.status === "sent" || contract.status === "viewed") && <span>รอพนักงานลงนาม</span>}{contract.status === "signed" && <span>✓ หลักฐานครบ</span>}</div>
                        </article>;
                      })}
                      {!profileContracts.length && <div className="contract-empty"><span>✎</span><div><strong>ยังไม่มีสัญญาจ้าง</strong><p>{profileEmployee.status === "archived" ? "แฟ้มนี้ถูกลบออกจากรายชื่อและเปิดดูได้แบบอ่านอย่างเดียว" : "อัปโหลดไฟล์ต้นฉบับ แล้วสร้างสัญญาเพื่อส่งให้พนักงานลงนาม"}</p></div>{profileEmployee.status !== "archived" && <button onClick={openContractCreator}>เริ่มสร้างสัญญา</button>}</div>}
                    </div>
                    <div className="signature-trust-note"><span>i</span><p><strong>ขอบเขต Pilot:</strong> ขั้นตอนนี้ใช้ทดสอบ workflow และเก็บชื่อ บัญชี คำยินยอม และเวลาเท่านั้น ยังไม่ผูก hash กับไฟล์เอกสาร และยังไม่ใช่ลายเซ็นอิเล็กทรอนิกส์สำหรับใช้ยืนยันผลทางกฎหมาย</p></div>
                  </section>
                </div>
              </section>
            ) : <div className="empty-state">ยังไม่มีพนักงานในระบบ</div>}
          </section>
        )}

        {view === "organizationDocs" && isAdmin && permissions.canManageOrganizationDocuments && !isEmployeePreview && (
          <section className="organization-documents-page" aria-labelledby="organization-documents-title">
            <header className="organization-documents-hero">
              <div className="organization-documents-hero-copy">
                <span className="organization-documents-kicker"><i /> คลังเอกสารสำหรับ HR และผู้ดูแลระบบ</span>
                <h2 id="organization-documents-title">หาเอกสารสำคัญได้เร็ว<br />เริ่มใช้แม่แบบได้อย่างรอบคอบ</h2>
                <p>รวมสัญญา เอกสาร HR และไฟล์ใช้งานภายใน พร้อมเลขที่เอกสาร เวอร์ชัน เจ้าของ และวันหมดอายุที่ตรวจสอบได้</p>
                <div><span>✓ ไฟล์จริงเก็บแยกตามสิทธิ์</span><span>✓ ไม่มีการลบถาวรจากหน้านี้</span></div>
              </div>
              <button type="button" onClick={openOrganizationDocumentCreator}><span aria-hidden="true">＋</span><strong>เพิ่มเอกสาร</strong><small>อัปโหลดไฟล์เข้าคลัง</small></button>
            </header>

            <div className="organization-document-metrics" aria-label="สรุปเอกสารองค์กร">
              <article><span>▤</span><p><small>เอกสารทั้งหมด</small><strong>{organizationDocuments.length}</strong><em>รายการในคลัง</em></p></article>
              <article className="active"><span>✓</span><p><small>ใช้งานอยู่</small><strong>{activeOrganizationDocumentCount}</strong><em>ฉบับที่ยังไม่หมดอายุ</em></p></article>
              <article className="draft"><span>✎</span><p><small>ฉบับร่าง</small><strong>{draftOrganizationDocumentCount}</strong><em>รอตรวจทาน</em></p></article>
              <article className="expiring"><span>◷</span><p><small>หมดอายุใน 30 วัน</small><strong>{expiringOrganizationDocumentCount}</strong><em>ควรตรวจต่ออายุ</em></p></article>
              <article className="overdue"><span>!</span><p><small>เลยวันหมดอายุ</small><strong>{overdueOrganizationDocumentCount}</strong><em>สถานะยังเป็นใช้งานอยู่</em></p></article>
            </div>

            <section className="organization-document-library">
              <nav className="organization-document-tabs" aria-label="เลือกส่วนเอกสารองค์กร">
                <button type="button" className={organizationDocumentTab === "library" ? "active" : ""} onClick={() => setOrganizationDocumentTab("library")}><span>▤</span><p><strong>คลังเอกสาร</strong><small>ไฟล์ที่องค์กรอัปโหลด</small></p><b>{organizationDocuments.length}</b></button>
                <button type="button" className={organizationDocumentTab === "templates" ? "active" : ""} onClick={() => setOrganizationDocumentTab("templates")}><span>↓</span><p><strong>แม่แบบพร้อมใช้</strong><small>ไฟล์ DOCX สำหรับเริ่มร่าง</small></p><b>{organizationDocumentTemplates.length}</b></button>
              </nav>

              <div className="organization-document-toolbar">
                <label className="organization-document-search"><span aria-hidden="true">⌕</span><input value={organizationDocumentSearch} onChange={(event) => setOrganizationDocumentSearch(event.target.value)} placeholder={organizationDocumentTab === "library" ? "ค้นหาชื่อ เลขที่เอกสาร เจ้าของ..." : "ค้นหาแม่แบบ..."} /><span className="sr-only">ค้นหาเอกสารองค์กร</span></label>
                <label><span>หมวดเอกสาร</span><select value={organizationDocumentCategoryFilter} onChange={(event) => setOrganizationDocumentCategoryFilter(event.target.value as "all" | OrganizationDocumentCategory)}><option value="all">ทุกหมวด</option>{(Object.entries(organizationDocumentCategoryMeta) as [OrganizationDocumentCategory, (typeof organizationDocumentCategoryMeta)[OrganizationDocumentCategory]][]).map(([category, meta]) => <option key={category} value={category}>{meta.label}</option>)}</select></label>
                {organizationDocumentTab === "library" && <label><span>สถานะ</span><select value={organizationDocumentStatusFilter} onChange={(event) => setOrganizationDocumentStatusFilter(event.target.value as "all" | OrganizationDocumentStatus)}><option value="all">ทุกสถานะ</option>{(Object.entries(organizationDocumentStatusLabels) as [OrganizationDocumentStatus, string][]).map(([status, label]) => <option key={status} value={status}>{label}</option>)}</select></label>}
                <button type="button" className="organization-document-reset" onClick={() => { setOrganizationDocumentSearch(""); setOrganizationDocumentCategoryFilter("all"); setOrganizationDocumentStatusFilter("all"); }}>ล้างตัวกรอง</button>
              </div>

              {organizationDocumentTab === "library" ? <div className="organization-document-list" aria-live="polite">
                {visibleOrganizationDocuments.map((document) => {
                  const categoryMeta = organizationDocumentCategoryMeta[document.category];
                  const availableStatuses = [document.status, ...organizationDocumentAllowedStatuses[document.status]];
                  const isOverdue = document.status === "active" && Boolean(document.expiryDate) && document.expiryDate! < organizationDocumentToday;
                  return <article key={document.id} className={`organization-document-card status-${document.status}${isOverdue ? " is-overdue" : ""}`}>
                    <span className="organization-document-icon" aria-hidden="true">{categoryMeta.icon}</span>
                    <div className="organization-document-copy">
                      <span><b>{categoryMeta.label}</b><em className={document.status}>{organizationDocumentStatusLabels[document.status]}</em>{isOverdue && <em className="overdue">เลยวันหมดอายุ</em>}</span>
                      <h3>{document.title}</h3>
                      <p>{[document.description, document.note].filter(Boolean).join(" · ") || "ไม่มีคำอธิบายเพิ่มเติม"}</p>
                      <div><span><small>เลขที่เอกสาร</small><strong>{document.documentNumber || "—"}</strong></span><span><small>เวอร์ชัน</small><strong>{document.version || "—"}</strong></span><span><small>เจ้าของ</small><strong>{document.owner || "—"}</strong></span><span><small>วันที่มีผล</small><strong>{document.effectiveDate ? formatDueDate(document.effectiveDate) : "—"}</strong></span><span><small>วันหมดอายุ</small><strong className={isOverdue ? "overdue-date" : ""}>{document.expiryDate ? formatDueDate(document.expiryDate) : "ไม่กำหนด"}</strong></span></div>
                    </div>
                    <aside className="organization-document-file">
                      <p><small>ไฟล์เอกสาร</small><strong>{document.fileName || "ไม่มีไฟล์"}</strong><span>{document.hasFile ? formatFileSize(document.sizeBytes) : "ไม่พบไฟล์ต้นฉบับ"}</span></p>
                      <div>{document.hasFile && <a href={`/api/organization-documents?id=${encodeURIComponent(document.id)}`}>ดาวน์โหลด</a>}<label><span className="sr-only">เปลี่ยนสถานะ {document.title}</span><select aria-label={`เปลี่ยนสถานะ ${document.title}`} disabled={isSaving || organizationDocumentAllowedStatuses[document.status].length === 0} value={document.status} onChange={(event) => void updateOrganizationDocumentStatus(document, event.target.value as OrganizationDocumentStatus)}>{availableStatuses.map((status) => <option key={status} value={status}>{organizationDocumentStatusLabels[status]}</option>)}</select></label></div>
                      <small>อัปเดต {formatUpdatedAt(document.updatedAt)} · revision {document.revision}</small>
                    </aside>
                  </article>;
                })}
                {!visibleOrganizationDocuments.length && <div className="organization-document-empty"><span>▤</span><strong>{organizationDocuments.length ? "ไม่พบเอกสารตามตัวกรอง" : "ยังไม่มีเอกสารในคลัง"}</strong><p>{organizationDocuments.length ? "ลองล้างตัวกรองหรือใช้คำค้นอื่น" : "กด “เพิ่มเอกสาร” เพื่ออัปโหลดไฟล์แรกขององค์กร"}</p>{!organizationDocuments.length && <button type="button" onClick={openOrganizationDocumentCreator}>เพิ่มเอกสารแรก</button>}</div>}
              </div> : <div className="organization-template-grid" aria-live="polite">
                {visibleOrganizationDocumentTemplates.map((template) => <article key={template.id}>
                  <span className="organization-template-icon" aria-hidden="true">{organizationDocumentCategoryMeta[template.category].icon}</span>
                  <div><span><b>{organizationDocumentCategoryMeta[template.category].label}</b><em>DOCX</em></span><h3>{template.title}</h3><p>{template.description}</p></div>
                  <div className="organization-template-warning"><span>!</span><p><strong>ฉบับร่าง</strong><small>แม่แบบนี้เป็นฉบับร่าง ไม่ใช่คำปรึกษากฎหมาย ต้องให้ HR หรือที่ปรึกษากฎหมายตรวจทานก่อนใช้จริง</small></p></div>
                  <a href={template.href} download>ดาวน์โหลดแม่แบบ <span aria-hidden="true">↓</span></a>
                </article>)}
                {!visibleOrganizationDocumentTemplates.length && <div className="organization-document-empty"><span>⌕</span><strong>ไม่พบแม่แบบที่ค้นหา</strong><p>ลองเลือกทุกหมวดหรือล้างคำค้น</p></div>}
              </div>}
            </section>

            <div className="organization-document-legal-note" role="note"><span>i</span><p><strong>เอกสารแม่แบบเป็นเพียงจุดเริ่มต้น</strong> ต้องกรอกข้อมูล ตรวจข้อเท็จจริง และให้ HR หรือฝ่ายกฎหมายขององค์กรตรวจทานก่อนลงนามหรือประกาศใช้ทุกครั้ง</p></div>
          </section>
        )}

        {view === "skills" && (
          <section className="skills-layout">
            <div className="skill-summary-card">
              <p className="eyebrow">ภาพรวมทั้งองค์กร</p>
              <div className="skill-summary-score"><strong>{averageSkill ? averageSkill.toFixed(1) : "—"}</strong><span>คะแนนสมรรถนะเฉลี่ย<br />จากเต็ม 100</span></div>
              <div className="skill-legend"><span><i className="ready" />พร้อมใช้งาน ≥ 80</span><span><i className="develop" />ควรพัฒนา &lt; 80</span></div>
            </div>
            <div className="skill-matrix-card">
              <div className="section-heading"><div><p className="eyebrow">แยกตามสายงาน</p><h2>Skill Readiness</h2></div><span className="matrix-period">{period}</span></div>
              <div className="skill-matrix">
                {roleStats.filter(({ role }) => activeDepartment === "all" || role.departmentId === activeDepartment).map(({ role, people, skill }) => (
                  <button key={role.id} className="skill-role" onClick={() => { setActiveDepartment(role.departmentId); setView("employees"); }}>
                    <span className="skill-role-title"><i>{role.shortName.slice(0, 2)}</i><span><strong>{role.name}</strong><small>{people} คน · {role.skills.length} สมรรถนะ · 6 หมวด</small></span></span>
                    <span className="skill-bar"><i><b className={skill > 0 && skill < 80 ? "develop" : ""} style={{ width: `${skill}%` }} /></i><em>{skill ? skill.toFixed(0) : "—"}</em></span>
                    <span className={`skill-readiness ${skill > 0 && skill < 80 ? "develop" : ""}`}>{skill >= 80 ? "พร้อมใช้งาน" : skill > 0 ? "ควรพัฒนา" : "รอข้อมูล"}</span>
                  </button>
                ))}
              </div>
            </div>
            <section className="competency-framework-card">
              <div className="competency-framework-heading">
                <div><p className="eyebrow">COMPETENCY FRAMEWORK</p><h2>ประเมินรอบด้าน 22–24 สมรรถนะ</h2><p>ครอบคลุมความสามารถเฉพาะตำแหน่ง การใช้ AI วิธีทำงาน การร่วมงาน ความเป็นมืออาชีพ และการเติบโต</p></div>
                <span>6 หมวดมาตรฐาน</span>
              </div>
              <div className="competency-category-grid">
                {skillCategories.map((category, index) => {
                  const skillCount = roles[0].skills.filter((skill) => (skill.category ?? "role") === category.id).length;
                  return (
                    <article key={category.id} className={category.id}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <div><strong>{category.label}</strong><p>{category.description}</p></div>
                      <b>{skillCount}<small> ด้าน</small></b>
                      <em>น้ำหนัก {category.weight}%</em>
                    </article>
                  );
                })}
              </div>
              <div className="ai-skill-path">
                <div className="ai-skill-path-heading"><div><p className="eyebrow">AI SKILL PATH · ทุกตำแหน่ง</p><h3>เส้นทางการใช้ AI จากพื้นฐานสู่ขั้นสูง</h3><p>ทุกคนเริ่มจากการใช้อย่างปลอดภัย ก่อนพัฒนาเป็น Workflow ที่ใช้ซ้ำได้ และต่อยอดสู่ระบบอัตโนมัติที่วัดผลทางธุรกิจได้</p></div><span>น้ำหนักรวม 10%</span></div>
                <div className="ai-skill-stage-grid">
                  {aiSkillStages.map((stage, index) => (
                    <article key={stage.label} className={`stage-${index + 1}`}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <div><small>{stage.label}</small><strong>{stage.title}</strong><p>{stage.description}</p></div>
                      <b>{stage.levels}</b>
                    </article>
                  ))}
                </div>
              </div>
              <div className="competency-fairness-note"><span>i</span><p><strong>ประเมินจากพฤติกรรมที่สังเกตได้และหลักฐานการทำงาน</strong> ใช้ตัวอย่างเหตุการณ์จริง ไม่ตัดสินนิสัยส่วนตัวหรือความชอบของผู้ประเมิน</p></div>
            </section>
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
                <div><p className="eyebrow">INDIVIDUAL SKILL PROFILE</p><h2>สมรรถนะและสกิลรายบุคคล</h2><p>ดูคะแนน 6 หมวดในบัตรเดียว รวมเส้นทาง AI 3 ขั้น แล้วเปิดรายละเอียดครบทุกด้านตามตำแหน่งเพื่อวางแผนพัฒนา</p></div>
                <label className="search-field"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาพนักงานหรือตำแหน่ง" /><span className="sr-only">ค้นหาโปรไฟล์สกิล</span></label>
              </div>
              <div className="individual-skill-grid">
                {filteredEmployees.map((employee) => {
                  const role = getRole(employee.roleId);
                  const evaluation = evaluationsByEmployee.get(employee.id);
                  const assessedSkills = role.skills.filter((skill) => {
                    const level = evaluation?.skillScores[skill.id];
                    return typeof level === "number" && level >= 1 && level <= 5;
                  });
                  const assessmentComplete = assessedSkills.length === role.skills.length;
                  const competencyScore = assessmentComplete && evaluation ? calculateSkillScore(role, evaluation.skillScores) : null;
                  const readiness = assessedSkills.filter((skill) => (evaluation?.skillScores[skill.id] ?? 0) >= skill.targetLevel).length;
                  const biggestGap = role.skills
                    .filter((skill) => typeof evaluation?.skillScores[skill.id] === "number")
                    .map((skill) => ({ skill, gap: skill.targetLevel - (evaluation?.skillScores[skill.id] ?? 0) }))
                    .sort((a, b) => b.gap - a.gap)[0];
                  return (
                    <article className="individual-skill-card" key={employee.id}>
                      <div className="person-skill-head">
                        <EmployeeAvatar employee={employee} profile={employeeProfilesById.get(employee.id)} className="avatar-skill" />
                        <span><strong>{employee.name}</strong><small>{role.name}</small></span>
                        <b className={competencyScore !== null && competencyScore < 80 ? "develop" : ""}>{competencyScore !== null ? competencyScore.toFixed(0) : "—"}<small>/100</small></b>
                      </div>
                      <div className="person-competency-summary">
                        {skillCategories.map((category) => {
                          const summary = skillCategorySummary(role, evaluation ?? null, category.id);
                          return (
                            <div key={category.id}>
                              <span><strong>{category.shortLabel}</strong><small>{summary.recorded}/{summary.skills.length} ด้าน</small></span>
                              <i aria-label={`${category.label} ${summary.average === null ? "รอประเมิน" : `${summary.average.toFixed(0)} เปอร์เซ็นต์`}`}><b style={{ width: `${summary.average ?? 0}%` }} /></i>
                              <em>{summary.average === null ? "—" : summary.average.toFixed(0)}</em>
                            </div>
                          );
                        })}
                      </div>
                      <div className="person-skill-foot">
                        <span className={assessmentComplete ? "ready" : "develop"}>ประเมินแล้ว {assessedSkills.length}/{role.skills.length} ด้าน</span>
                        <small>{!assessmentComplete ? `รอประเมินเพิ่ม ${role.skills.length - assessedSkills.length} ด้าน` : biggestGap?.gap > 0 ? `เน้นพัฒนา: ${biggestGap.skill.name}` : `ถึงเป้าหมาย ${readiness}/${role.skills.length} ด้าน`}</small>
                        <button onClick={() => setSkillProfileEmployee(employee)}>ดูกราฟและรายละเอียดทั้งหมด →</button>
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
                  <h2>{isEmployeeUser ? <>เห็นจุดแข็งของตัวเอง<br />และเรียนรู้จากทีม</> : <>เห็นศักยภาพของคน<br />เพื่อจัดทีมได้ตรงจุด</>}</h2>
                  <p>{isEmployeeUser ? "ค่าพลัง 6 ด้านช่วยให้คุณเห็นทักษะเด่น ช่องว่างที่ควรพัฒนา และจุดแข็งที่ทำงานร่วมกับเพื่อนในทีมได้ดี" : "ค่าพลัง 6 ด้านถูกแปลงจาก KPI สกิล และความคืบหน้างานจริง เพื่อให้หัวหน้าทีมวางแผนพัฒนาและจัดคนให้เหมาะกับงานได้ง่ายขึ้น"}</p>
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
                      <span>{powerDifference === null ? "รอข้อมูล" : powerDifference === 0 ? "สูสี" : `ต่าง ${Math.abs(powerDifference)} Points`}</span>
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

        {view === "peopleOps" && (isEmployeeUser ? (peopleOpsEmployee && peopleOpsRole ? (
          <section className="employee-growth-portal">
            <section className="employee-growth-hero">
              <div className="employee-growth-identity">
                <EmployeeAvatar employee={peopleOpsEmployee} profile={employeeProfilesById.get(peopleOpsEmployee.id)} className="avatar-growth" />
                <div><p className="eyebrow">MY GROWTH PATH</p><h2>เส้นทางของ {peopleOpsEmployee.name}</h2><p>{peopleOpsRole.name} · ข้อมูลส่วนนี้เห็นได้เฉพาะคุณและ HR</p></div>
              </div>
              <div className="employee-growth-readiness"><small>ความพร้อมก้าวต่อไป</small><strong>{promotionReadiness}</strong><span>/100</span><i><b style={{ width: `${promotionReadiness}%` }} /></i><em>{promotionReadiness >= 80 ? "พร้อมเสนอพิจารณา" : promotionReadiness >= 65 ? "พร้อมรับงานระดับถัดไป" : "กำลังสะสมทักษะและผลงาน"}</em></div>
            </section>

            <div className="employee-growth-summary">
              <article className="salary"><span>฿</span><div><small>เงินเดือนปัจจุบัน</small><strong>{peopleOpsHrProfile ? `฿${formatMoney(peopleOpsHrProfile.currentSalary)}` : "รอ HR อัปเดต"}</strong><p>{peopleOpsHrProfile ? `ทบทวนรอบถัดไป ${peopleOpsHrProfile.salaryReviewMonth || "ตามนโยบายบริษัท"}` : "ติดต่อ HR หากข้อมูลยังไม่ครบ"}</p></div></article>
              <article className="allowance"><span>＋</span><div><small>เงินเพิ่มจากสกิลสะสม</small><strong>+฿{formatMoney(peopleOpsSkillUplift)} / เดือน</strong><p>{peopleOpsAchievements.length} ระดับสกิลที่ผ่านการยืนยัน</p></div></article>
              <article><span>↗</span><div><small>ตำแหน่งเป้าหมาย</small><strong>{growthRoleNames[peopleOpsRole.id] ?? `หัวหน้าทีม${peopleOpsRole.department}`}</strong><p>ใช้ผลงาน สกิล เควสต์ และความสม่ำเสมอร่วมกัน</p></div></article>
              <article><span>★</span><div><small>เควสต์พัฒนาสำเร็จ</small><strong>{peopleOpsMissions.filter((item) => item.status === "done").length} / {peopleOpsMissions.length}</strong><p>งานเปิดอยู่ {peopleOpsWork.filter((item) => item.status !== "done").length} รายการ</p></div></article>
            </div>

            <section className="employee-growth-roadmap">
              <div className="employee-growth-section-heading"><div><p className="eyebrow">CAREER ROADMAP</p><h2>ฉันอยู่ตรงไหน และต้องทำอะไรต่อ</h2></div><button onClick={() => { setPortfolioEmployeeId(peopleOpsEmployee.id); setView("portfolio"); }}>ดูหลักฐานผลงาน →</button></div>
              <div>
                <article className="done"><span>01</span><div><small>ตำแหน่งปัจจุบัน</small><strong>{peopleOpsRole.name}</strong><p>KPI {peopleOpsEvaluation?.kpiScore.toFixed(0) ?? "รอประเมิน"} · สกิล {peopleOpsEvaluation?.skillScore.toFixed(0) ?? "รอประเมิน"}</p></div><b>ปัจจุบัน</b></article>
                <i>→</i>
                <article className={promotionReadiness >= 65 ? "active" : "locked"}><span>02</span><div><small>ด่านถัดไป</small><strong>รับงานและเควสต์ระดับสูงขึ้น</strong><p>ปลดล็อกเมื่อความพร้อมถึง 65%</p></div><b>{promotionReadiness >= 65 ? "ปลดล็อกแล้ว" : `อีก ${Math.max(0, 65 - promotionReadiness)}%`}</b></article>
                <i>→</i>
                <article className={promotionReadiness >= 80 ? "active" : "locked"}><span>03</span><div><small>เป้าหมาย</small><strong>{growthRoleNames[peopleOpsRole.id] ?? `หัวหน้าทีม${peopleOpsRole.department}`}</strong><p>HR และหัวหน้าพิจารณาร่วมกับหลักฐานจริง</p></div><b>{promotionReadiness >= 80 ? "พร้อมเสนอ" : `อีก ${Math.max(0, 80 - promotionReadiness)}%`}</b></article>
              </div>
            </section>

            <div className="employee-growth-detail-grid">
              <section className="employee-growth-skills">
                <div className="employee-growth-section-heading"><div><p className="eyebrow">NEXT SKILLS</p><h2>สกิลที่ควรพัฒนาต่อ</h2><p>เรียงจากช่องว่างของระดับปัจจุบันเทียบกับเป้าหมายตำแหน่ง</p></div></div>
                <div className="employee-growth-skill-list">
                  {employeeGrowthSkills.slice(0, 10).map(({ skill, currentLevel, gap }) => <article key={skill.id} className={gap ? "gap" : "ready"}>
                    <div><strong>{skill.name}</strong><small>{skill.id === "core-ai-work-mastery" ? "เส้นทาง AI พื้นฐาน → เชิงลึก → ผู้เชี่ยวชาญ" : skillCategories.find((category) => category.id === (skill.category ?? "role"))?.label ?? "ทักษะสำหรับตำแหน่ง"}</small></div>
                    <span>{[1, 2, 3, 4, 5].map((level) => <i key={level} className={level <= currentLevel ? "filled" : level <= skill.targetLevel ? "target" : ""} />)}</span>
                    <b>ระดับ {currentLevel || "—"}<small>เป้าหมาย {skill.targetLevel}</small></b>
                  </article>)}
                </div>
              </section>

              <aside className="employee-growth-side">
                <section className="employee-salary-band">
                  <p className="eyebrow">SALARY PATH</p><h2>ช่วงค่าตอบแทนของตำแหน่ง</h2>
                  <div><span><small>เริ่มต้น</small><strong>฿{formatMoney(roleSalaryBands[peopleOpsRole.id].min)}</strong></span><span><small>ค่ากลาง</small><strong>฿{formatMoney(roleSalaryBands[peopleOpsRole.id].mid)}</strong></span><span><small>ระดับสูง</small><strong>฿{formatMoney(roleSalaryBands[peopleOpsRole.id].max)}</strong></span></div>
                  <i><b style={{ width: `${peopleOpsHrProfile ? Math.min(100, Math.max(0, (peopleOpsHrProfile.currentSalary - roleSalaryBands[peopleOpsRole.id].min) / Math.max(1, roleSalaryBands[peopleOpsRole.id].max - roleSalaryBands[peopleOpsRole.id].min) * 100)) : 0}%` }} /></i>
                  <p>เงินเดือนจริงขึ้นกับระดับสกิล ผลงาน ความรับผิดชอบ และนโยบายบริษัท ไม่เพิ่มอัตโนมัติจากคะแนนเพียงอย่างเดียว</p>
                </section>
                <section className="employee-development-plan">
                  <p className="eyebrow">MY DEVELOPMENT PLAN</p><h2>แผนพัฒนาของฉัน</h2>
                  <div>{talentActions.slice().sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 5).map((action) => <article key={action.id}><span className={action.status}>{action.status === "completed" ? "✓" : action.status === "in_progress" ? "→" : "○"}</span><div><strong>{action.title}</strong><small>กำหนด {formatDueDate(action.dueDate)} · {action.status === "completed" ? "เสร็จแล้ว" : action.status === "in_progress" ? "กำลังทำ" : "วางแผนแล้ว"}</small></div></article>)}{!talentActions.length && <div className="employee-growth-empty"><span>↗</span><strong>ยังไม่มีแผนพัฒนา</strong><p>HR จะเพิ่ม Skill Test, Upskill หรือแผนเลื่อนตำแหน่งให้ที่นี่</p></div>}</div>
                </section>
                <section className="employee-contract-center">
                  <div className="employee-contract-heading"><div><p className="eyebrow">MY CONTRACT</p><h2>สัญญาจ้างของฉัน</h2></div><span>{employeeContracts.length}</span></div>
                  <div className="employee-contract-list">
                    {employeeContracts.map((contract) => {
                      const linkedDocument = applicationDocuments.find((document) => document.id === contract.documentId);
                      const canSign = contract.status === "sent" || contract.status === "viewed";
                      return <article key={contract.id} className={contract.status}>
                        <span className="employee-contract-mark">{contract.status === "signed" ? "✓" : "✎"}</span>
                        <div><span><b className={`contract-status ${contract.status}`}>{contractStatusLabel(contract.status)}</b><small>เวอร์ชัน {contract.version}</small></span><strong>{contract.title}</strong><p>มีผล {new Date(`${contract.effectiveDate}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}</p></div>
                        <div className="employee-contract-actions">{linkedDocument?.storageKey && <a href={`/api/documents?id=${encodeURIComponent(linkedDocument.id)}`}>อ่านสัญญา</a>}{canSign && <button type="button" disabled={isEmployeePreview} onClick={() => openContractSignature(contract)}>{isEmployeePreview ? "โหมดทดลอง" : "ลงนาม"}</button>}{contract.status === "signed" && <span>ลงนาม {formatUpdatedAt(contract.signedAt ?? contract.updatedAt)}</span>}</div>
                      </article>;
                    })}
                    {!employeeContracts.length && <div className="employee-growth-empty"><span>✎</span><strong>ยังไม่มีสัญญาที่ส่งถึงคุณ</strong><p>เมื่อ HR ส่งสัญญาแล้ว คุณจะอ่าน ดาวน์โหลด และลงนามได้จากส่วนนี้</p></div>}
                  </div>
                  <p className="employee-contract-note"><strong>โหมด Pilot:</strong> อ่านไฟล์ให้ครบก่อนยืนยัน ขั้นตอนนี้ใช้ทดสอบ workflow และยังไม่ใช่ลายเซ็นอิเล็กทรอนิกส์ที่ผูก hash เอกสารหรือใช้ยืนยันผลทางกฎหมาย</p>
                </section>
              </aside>
            </div>
            <div className="employee-growth-privacy"><span>⌁</span><p><strong>ข้อมูลส่วนตัวของคุณ</strong> เงินเดือน เงินเพิ่ม และแผนพัฒนาไม่ถูกส่งไปยังหน้าสำนักงานหรือค่าพลังของเพื่อนร่วมทีม</p></div>
          </section>
        ) : <div className="empty-state">ยังไม่พบข้อมูลพนักงานที่เชื่อมกับบัญชีนี้</div>) : (
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
                      <label><span>สกิลวิชาชีพที่มีเงินเพิ่ม</span><select required value={skillAchievementForm.skillId} onChange={(event) => { const skillId = event.target.value; setSkillAchievementForm((form) => ({ ...form, skillId, level: Math.max(2, peopleOpsEvaluation?.skillScores[skillId] ?? 2) })); }}><option value="">เลือกสกิล</option>{peopleOpsRole.skills.filter((skill) => skill.eligibleForAllowance !== false).map((skill) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}</select></label>
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
        ))}

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
            <nav className="access-panel-tabs" aria-label="เลือกข้อมูลผู้ใช้งาน">
              <button type="button" className={accessPanel === "users" ? "active" : ""} aria-pressed={accessPanel === "users"} onClick={() => setAccessPanel("users")}><span aria-hidden="true">▤</span><b>จัดการสมาชิก</b><em>{userAccounts.length}</em></button>
              <button type="button" className={accessPanel === "requests" ? "active" : ""} aria-pressed={accessPanel === "requests"} onClick={() => setAccessPanel("requests")}><span aria-hidden="true">＋</span><b>อนุมัติสมาชิก</b><em className={pendingRegistrationRequests.length ? "attention" : ""}>{pendingRegistrationRequests.length}</em></button>
              <button type="button" className={accessPanel === "rights" ? "active" : ""} aria-pressed={accessPanel === "rights"} onClick={() => setAccessPanel("rights")}><span aria-hidden="true">◎</span><b>กฎและสิทธิ์</b><em>3</em></button>
            </nav>
            <section hidden={accessPanel !== "rights"} className={`launch-readiness-center ${hasLaunchDemoWarning ? "has-demo-warning" : launchReadinessScore === 6 ? "is-ready" : ""}`} aria-labelledby="launch-readiness-title">
              <header className="launch-readiness-heading">
                <div className="launch-readiness-title"><span aria-hidden="true">✓</span><div><p className="eyebrow">LAUNCH READINESS</p><h2 id="launch-readiness-title">ศูนย์ตรวจความพร้อมก่อนเปิดใช้จริง</h2><p>ตรวจข้อมูล คน กฎ สิทธิ์ และเส้นทางส่งงานให้ครบก่อนเชิญพนักงานทั้งองค์กร</p></div></div>
                <div className="launch-readiness-score" aria-label={`ความพร้อม ${launchReadinessScore} จาก 6 ขั้น`}><strong>{launchReadinessScore}<small>/6</small></strong><span>ขั้นพร้อมใช้งาน</span></div>
              </header>

              <div className="launch-readiness-progress" role="progressbar" aria-label="ความพร้อมก่อนเปิดใช้จริง" aria-valuemin={0} aria-valuemax={6} aria-valuenow={launchReadinessScore}><span style={{ width: `${launchReadinessScore / 6 * 100}%` }} /></div>
              <div className="launch-readiness-status"><span aria-hidden="true">{launchReadinessScore === 6 ? "✓" : hasLaunchDemoWarning ? "!" : "i"}</span><div><strong>{launchReadinessStatus}</strong><p>{launchReadiness ? `ระบบตรวจล่าสุดจากข้อมูลปัจจุบัน ${launchReadinessScore} จาก 6 ขั้น` : "ยังไม่พบผลตรวจความพร้อม กรุณาโหลดหน้าใหม่หลังระบบหลังบ้านพร้อมใช้งาน"}</p></div></div>

              {hasLaunchDemoWarning && launchReadiness && <div className="launch-demo-warning" role="alert"><span aria-hidden="true">!</span><div><strong>พบข้อมูลสาธิตปะปนอยู่ — ห้ามใช้ตัดสินใจเรื่องพนักงานจริง</strong><p>พนักงานตัวอย่าง {launchReadiness.demoEmployeeCount} คน · นโยบายแม่แบบ {launchReadiness.templatePolicyCount} ฉบับ กรุณายืนยันว่าจะล้างข้อมูลหรือเก็บแยกเพื่อทดลองก่อนเปิดบัญชีให้ทีม</p></div></div>}

              <div className="launch-readiness-metrics" aria-label="ตัวเลขประกอบการตรวจความพร้อม">
                <article><span>01</span><div><strong>{launchReadiness?.activeEmployeeCount ?? "—"}</strong><small>พนักงานใช้งาน</small></div></article>
                <article><span>02</span><div><strong>{launchReadiness?.activeLinkedAccountCount ?? "—"}</strong><small>บัญชีผูกโปรไฟล์</small></div></article>
                <article><span>03</span><div><strong>{launchReadiness?.loggedInEmployeeAccountCount ?? "—"}</strong><small>พนักงานเข้าใช้แล้ว</small></div></article>
                <article><span>04</span><div><strong>{launchReadiness?.publishedPolicyCount ?? "—"}</strong><small>กฎที่ประกาศ</small></div></article>
                <article><span>05</span><div><strong>{launchReadiness?.realDocumentCount ?? "—"}</strong><small>เอกสารจริง</small></div></article>
                <article><span>06</span><div><strong>{launchReadiness?.submittedWorkCount ?? "—"}</strong><small>หลักฐานงาน</small></div></article>
              </div>

              <ol className="launch-readiness-steps">
                {launchReadinessSteps.map((step, index) => <li key={step.title} className={step.ready ? "ready" : "pending"}><span>{step.ready ? "✓" : index + 1}</span><div><strong>{step.title}</strong><p>{step.detail}</p></div><b>{step.ready ? "ผ่านแล้ว" : "ต้องทำต่อ"}</b></li>)}
                {!launchReadinessSteps.length && <li className="pending"><span>i</span><div><strong>รอข้อมูลจากระบบหลังบ้าน</strong><p>ศูนย์ตรวจความพร้อมจะแสดงรายการตรวจอัตโนมัติเมื่อได้รับข้อมูลล่าสุด</p></div><b>รอตรวจ</b></li>}
              </ol>
              <footer className="launch-readiness-note"><span aria-hidden="true">i</span><p><strong>ศูนย์นี้ไม่ลบหรือแก้ข้อมูลให้อัตโนมัติ</strong> HR ต้องตรวจข้อมูลจริง ทบทวนกฎหมาย สร้างบัญชีและรหัสชั่วคราว แล้วทดสอบกับพนักงานกลุ่มเล็กก่อนเปิดใช้ทั้งองค์กร</p></footer>
            </section>

            <section hidden={accessPanel !== "rights"} className="access-operating-model" aria-labelledby="access-operating-title">
              <header>
                <div><p className="eyebrow">ACCESS WORKFLOW</p><h2 id="access-operating-title">สิทธิ์ 3 ระดับในขั้นตอนทำงานเดียว</h2><p>ชื่อ “คนสั่งงาน” และ “คนทำงาน” ช่วยอธิบายวิธีใช้ระบบ ส่วนสิทธิ์จริงยังคงเป็น admin, manager และ employee</p></div>
                <div className="access-model-counts" aria-label="สรุปบัญชีตามกลุ่ม"><span><strong>{activeAssigningUserCount}</strong><small>คนสั่งงานใช้งาน</small></span><span><strong>{activeWorkingUserCount}</strong><small>คนทำงานใช้งาน</small></span><span><strong>{userAccounts.filter((account) => account.status === "inactive").length}</strong><small>บัญชีพักสิทธิ์</small></span></div>
              </header>
              <ol className="access-workflow-list">
                <li><span>1</span><div><strong>วางแผนและมอบหมาย</strong><small>HR / Admin หรือหัวหน้าทีมสร้างงานหลัก</small></div><b>admin · manager</b></li>
                <li><span>2</span><div><strong>รับงานและประสานทีม</strong><small>พนักงานรับงาน หรือสร้างรีเควสต์ 0 Points ให้ทีม</small></div><b>employee</b></li>
                <li><span>3</span><div><strong>ลงมือทำและส่งหลักฐาน</strong><small>ผู้รับงานอัปเดตความคืบหน้าและส่งผลงาน</small></div><b>employee</b></li>
                <li><span>4</span><div><strong>ตรวจและอนุมัติ</strong><small>แยกผู้ทำงานออกจากผู้ตรวจเพื่อความเป็นธรรม</small></div><b>admin · manager</b></li>
              </ol>
              <p className="access-review-boundary" role="note"><span aria-hidden="true">i</span><strong>พนักงานสร้างงานประสานได้ แต่ตรวจอนุมัติเองไม่ได้</strong> งานที่พนักงานสร้างถูกกำหนดเป็นรีเควสต์ 0 Points ผู้รับงานเป็นผู้อัปเดต และเฉพาะหัวหน้าทีมหรือ HR เท่านั้นที่ตรวจผลงาน</p>
            </section>

            <div hidden={accessPanel !== "users"} className="access-main-grid">
              <form className="access-form-card" id="user-access-form" aria-labelledby="user-access-form-title" onSubmit={saveUserAccount}>
                <div className="access-card-heading"><div><p className="eyebrow">ACCOUNT SETUP</p><h2 id="user-access-form-title">{userAccountForm.accountId ? "แก้ไขบัญชีและสิทธิ์" : "สร้างบัญชีผู้ใช้งาน"}</h2><p>กำหนดชื่อผู้ใช้ บทบาท และรหัสชั่วคราวจากหน้านี้ได้เลย</p></div><span>{userAccountForm.accountId ? "แก้ไข" : "ใหม่"}</span></div>
                <div className="form-grid access-form-grid">
                  <label className="wide"><span>ชื่อที่แสดง</span><input required name="displayName" autoComplete="name" value={userAccountForm.displayName} onChange={(event) => setUserAccountForm((form) => ({ ...form, displayName: event.target.value }))} placeholder="ชื่อ–นามสกุล" /></label>
                  <label className="wide"><span>ชื่อเล่น (ไม่บังคับ)</span><input name="nickname" autoComplete="nickname" maxLength={40} value={userAccountForm.nickname} onChange={(event) => setUserAccountForm((form) => ({ ...form, nickname: event.target.value }))} placeholder="เช่น นัท" /></label>
                  <label className="wide"><span>ชื่อผู้ใช้สำหรับเข้าสู่ระบบ</span><input required name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={64} value={userAccountForm.loginId} onChange={(event) => setUserAccountForm((form) => ({ ...form, loginId: event.target.value }))} placeholder="เช่น EMP001 หรือ niran.k" /><small>ต้องไม่ซ้ำกับผู้อื่น และไม่ต้องตรงกับอีเมล</small></label>
                  <div className="access-temporary-password wide">
                    <label htmlFor="temporary-password"><span>{userAccountRequiresTemporaryPassword ? "รหัสผ่านชั่วคราว" : "ตั้งรหัสผ่านชั่วคราวใหม่ (ไม่บังคับ)"}</span></label>
                    <div className="temporary-password-input">
                      <input id="temporary-password" name="new-password" type={showTemporaryPassword ? "text" : "password"} autoComplete="new-password" minLength={userAccountForm.temporaryPassword ? MIN_GENERAL_PASSWORD_LENGTH : undefined} maxLength={MAX_NEW_PASSWORD_LENGTH} required={userAccountRequiresTemporaryPassword} value={userAccountForm.temporaryPassword} onChange={(event) => setUserAccountForm((form) => ({ ...form, temporaryPassword: event.target.value }))} placeholder={userAccountRequiresTemporaryPassword ? "รหัสผ่าน 6–15 ตัวอักษร" : "เว้นว่างเพื่อใช้รหัสเดิม"} />
                      <button type="button" aria-label={`${showTemporaryPassword ? "ซ่อน" : "แสดง"}รหัสผ่านชั่วคราว`} aria-pressed={showTemporaryPassword} onClick={() => setShowTemporaryPassword((visible) => !visible)}>{showTemporaryPassword ? "ซ่อน" : "แสดง"}</button>
                    </div>
                    <div className="temporary-password-tools"><small>{userAccountRequiresTemporaryPassword ? "ผู้ใช้ต้องเปลี่ยนรหัสนี้ทันทีเมื่อเข้าสู่ระบบครั้งแรก" : "หากกรอกใหม่ ระบบจะยกเลิกรหัสเดิมและบังคับให้ผู้ใช้เปลี่ยนอีกครั้ง"}</small><button type="button" onClick={() => { setUserAccountForm((form) => ({ ...form, temporaryPassword: generateTemporaryPassword() })); setShowTemporaryPassword(true); }}>สร้างรหัส 10 ตัว</button></div>
                  </div>
                  <fieldset className="access-exact-role-selector wide" aria-describedby="access-role-help"><legend>เลือกบทบาทและขอบเขตสิทธิ์</legend>{([
                    { role: "admin", label: "HR / Admin", group: "คนสั่งงาน", scope: "ทั้งองค์กร", icon: "HR" },
                    { role: "manager", label: "หัวหน้าทีม", group: "คนสั่งงาน", scope: "เฉพาะทีม", icon: "ทีม" },
                    { role: "employee", label: "พนักงาน", group: "คนทำงาน", scope: "ข้อมูลตนเอง", icon: "คน" },
                  ] as const).map((option) => <label key={option.role} className={`${option.role} ${userAccountForm.role === option.role ? "selected" : ""}`}><input type="radio" name="access-role" value={option.role} checked={userAccountForm.role === option.role} onChange={() => setUserAccountForm((form) => ({ ...form, role: option.role }))} /><span aria-hidden="true">{option.icon}</span><div><strong>{option.label}</strong><small>{option.group} · {option.scope}</small></div><code>{option.role}</code></label>)}<p id="access-role-help">เลือกจากข้อมูลที่ต้องเห็นและงานที่ต้องทำ ระบบยังคงใช้บทบาทจริง admin, manager และ employee</p></fieldset>
                  <label className="wide"><span>สถานะบัญชี</span><select value={userAccountForm.status} onChange={(event) => setUserAccountForm((form) => ({ ...form, status: event.target.value as UserAccountRecord["status"] }))}><option value="active">ใช้งาน</option><option value="inactive">เพิกถอนสิทธิ์</option></select></label>
                  <div className={`access-selected-role-note wide ${selectedUserKind}`} aria-live="polite"><strong>{selectedUserKindLabel} · {userAccountForm.role === "admin" ? "HR / Admin" : userAccountForm.role === "manager" ? "หัวหน้าทีม" : "พนักงาน"}</strong><span>{selectedUserRoleGuide}</span></div>
                  {userAccountForm.role !== "admin" && <label className="wide"><span>ผูกกับโปรไฟล์พนักงาน</span><select required value={userAccountForm.employeeId} onChange={(event) => setUserAccountForm((form) => ({ ...form, employeeId: event.target.value }))}><option value="">เลือกพนักงาน</option>{employees.filter((employee) => employee.status === "active" && (!userAccounts.some((account) => account.employeeId === employee.id && account.id !== userAccountForm.accountId))).map((employee) => <option key={employee.id} value={employee.id}>{employee.name} · {getRole(employee.roleId).name}</option>)}</select></label>}
                  {userAccountForm.role === "manager" && <label className="wide"><span>ทีมที่ดูแล</span><select value={userAccountForm.departmentId} onChange={(event) => setUserAccountForm((form) => ({ ...form, departmentId: event.target.value }))}><option value="">ใช้แผนกตามโปรไฟล์พนักงาน</option>{Array.from(new Map(roles.map((role) => [role.departmentId, role.department])).entries()).map(([departmentId, department]) => <option key={departmentId} value={departmentId}>{department}</option>)}</select></label>}
                </div>
                <div className="access-form-actions">{userAccountForm.accountId && <button type="button" onClick={() => { setUserAccountForm(blankUserAccountForm()); setShowTemporaryPassword(false); }}>ยกเลิกการแก้ไข</button>}<button className="primary" disabled={isSaving}>{isSaving ? "กำลังบันทึก..." : userAccountForm.accountId ? "บันทึกบัญชี" : "สร้างบัญชีและรหัสชั่วคราว"}</button></div>
                {credentialResult && <section className="credential-result-panel" role="status" aria-live="polite" aria-labelledby="credential-result-title">
                  <header><span aria-hidden="true">✓</span><div><strong id="credential-result-title">สร้างข้อมูลเข้าใช้เรียบร้อย</strong><small>แสดงรหัสผ่านครั้งนี้ครั้งเดียว กรุณาส่งให้ {credentialResult.displayName} ทางช่องทางส่วนตัว</small></div><button type="button" onClick={() => setCredentialResult(null)} aria-label="ปิดข้อมูลรหัสชั่วคราว">×</button></header>
                  <dl><div><dt>ชื่อผู้ใช้</dt><dd><code>{credentialResult.loginId}</code><button type="button" onClick={() => void copyCredential(credentialResult.loginId, "ชื่อผู้ใช้")}>คัดลอก</button></dd></div><div><dt>รหัสผ่านชั่วคราว</dt><dd><code>{credentialResult.temporaryPassword}</code><button type="button" onClick={() => void copyCredential(credentialResult.temporaryPassword, "รหัสผ่านชั่วคราว")}>คัดลอก</button></dd></div></dl>
                  <p><b>สำคัญ:</b> อย่าส่งรหัสผ่านในกลุ่มแชท ผู้ใช้จะถูกบังคับให้ตั้งรหัสใหม่ก่อนเห็นข้อมูลในระบบ</p>
                </section>}
              </form>

              <aside className="access-role-matrix-card" aria-labelledby="access-role-matrix-title">
                <div className="access-card-heading"><div><p className="eyebrow">ROLE COMPARISON</p><h2 id="access-role-matrix-title">เทียบสิทธิ์ตามบทบาทจริง</h2><p>เลือกบทบาทตามขอบเขตข้อมูลและหน้าที่ ไม่ใช่ตามชื่อตำแหน่งงานอย่างเดียว</p></div></div>
                <div className="access-role-table-wrap" tabIndex={0} aria-label="เลื่อนเพื่อดูตารางสิทธิ์ทั้งหมด">
                  <table className="access-role-table">
                    <caption className="sr-only">ตารางเปรียบเทียบสิทธิ์ admin manager และ employee</caption>
                    <thead><tr><th scope="col">บทบาท</th><th scope="col">กลุ่ม</th><th scope="col">ขอบเขตหลัก</th></tr></thead>
                    <tbody>
                      <tr><th scope="row"><strong>HR / Admin</strong><code>admin</code></th><td><span className="assigner">คนสั่งงาน</span></td><td>จัดการทั้งองค์กร ข้อมูล HR บัญชี งาน และตรวจอนุมัติ</td></tr>
                      <tr><th scope="row"><strong>หัวหน้าทีม</strong><code>manager</code></th><td><span className="assigner">คนสั่งงาน</span></td><td>มอบหมายและตรวจงานเฉพาะทีม โดยไม่เห็นเงินเดือนหรือเอกสารส่วนตัว</td></tr>
                      <tr><th scope="row"><strong>พนักงาน</strong><code>employee</code></th><td><span className="worker">คนทำงาน</span></td><td>ดูข้อมูลตนเอง รับ–ส่งงาน และสร้างงานประสาน 0 Points โดยไม่มีสิทธิ์ตรวจ</td></tr>
                    </tbody>
                  </table>
                </div>
                <div className="access-invite-note"><span>i</span><p><strong>ส่งข้อมูลเข้าใช้อย่างปลอดภัย</strong> ส่งชื่อผู้ใช้และรหัสชั่วคราวให้เจ้าของบัญชีทางช่องทางส่วนตัว จากนั้นให้ทดลองเข้าใช้และตั้งรหัสใหม่ทันที</p></div>
              </aside>
            </div>

            <section hidden={accessPanel !== "requests"} className="access-registration-card" aria-labelledby="registration-requests-title">
              <div className="access-card-heading"><div><p className="eyebrow">EMPLOYEE REGISTRATION</p><h2 id="registration-requests-title">อนุมัติสมาชิกพนักงาน</h2><p>เฉพาะ HR / Admin เท่านั้นที่อนุมัติได้ ตรวจตัวตน เลือกโปรไฟล์ และกำหนดบทบาทก่อนเปิดบัญชี</p></div><span>{pendingRegistrationRequests.length} รอตรวจ</span></div>
              <div className="registration-request-list">
                {pendingRegistrationRequests.map((registrationRequest) => {
                  const matchingEmployeeId = employees.find((employee) => employee.status === "active" && employee.email.toLowerCase() === registrationRequest.email.toLowerCase() && !userAccounts.some((account) => account.employeeId === employee.id))?.id ?? "";
                  const selectedEmployeeId = registrationEmployeeSelections[registrationRequest.id] || matchingEmployeeId;
                  const selectedRole = registrationRoleSelections[registrationRequest.id] ?? "employee";
                  const availableEmployees = employees.filter((employee) => employee.status === "active" && !userAccounts.some((account) => account.employeeId === employee.id));
                  return <article key={registrationRequest.id} className="registration-request-item">
                    <header><span className="access-account-avatar">{makeInitials(`${registrationRequest.firstName} ${registrationRequest.lastName}`)}</span><div><strong>{registrationRequest.firstName} {registrationRequest.lastName}</strong><small>ชื่อเล่น {registrationRequest.nickname} · ส่งเมื่อ {formatUpdatedAt(registrationRequest.submittedAt)}</small></div><b>รออนุมัติ</b></header>
                    <dl><div><dt>ชื่อผู้ใช้</dt><dd><code>{registrationRequest.loginId}</code></dd></div><div><dt>อีเมล</dt><dd>{registrationRequest.email}</dd></div><div><dt>รหัสผ่าน</dt><dd>ตั้งแล้ว · ไม่แสดงข้อมูลลับ</dd></div></dl>
                    <label><span>สิทธิ์หลังอนุมัติ</span><select value={selectedRole} onChange={(event) => setRegistrationRoleSelections((items) => ({ ...items, [registrationRequest.id]: event.target.value as UserAccountRecord["role"] }))}><option value="employee">พนักงาน — ดูและจัดการข้อมูลของตนเอง</option><option value="manager">หัวหน้าทีม — จัดการงานและประเมินทีม</option><option value="admin">HR / Admin — จัดการข้อมูลทั้งองค์กร</option></select><small>{selectedRole === "admin" ? "สิทธิ์ระดับสูง: เข้าถึงบัญชี ข้อมูล HR และการตั้งค่าทั้งองค์กร" : selectedRole === "manager" ? "ขอบเขตทีมจะยึดตามแผนกของโปรไฟล์พนักงานที่เลือก" : "เหมาะสำหรับสมาชิกทั่วไปและไม่มีสิทธิ์อนุมัติงานของตนเอง"}</small></label>
                    <label><span>ผูกกับโปรไฟล์พนักงาน</span><select value={selectedEmployeeId} onChange={(event) => setRegistrationEmployeeSelections((items) => ({ ...items, [registrationRequest.id]: event.target.value }))}><option value="">เลือกโปรไฟล์พนักงาน</option>{availableEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} · {getRole(employee.roleId).name}{employee.email.toLowerCase() === registrationRequest.email.toLowerCase() ? " · อีเมลตรงกัน" : ""}</option>)}</select><small>หากยังไม่มีโปรไฟล์ ให้เพิ่มพนักงานในทะเบียนก่อน แล้วกลับมาอนุมัติ</small></label>
                    <label><span>เหตุผลกรณีปฏิเสธ</span><input maxLength={500} value={registrationRejectionReasons[registrationRequest.id] ?? ""} onChange={(event) => setRegistrationRejectionReasons((items) => ({ ...items, [registrationRequest.id]: event.target.value }))} placeholder="เช่น ข้อมูลไม่ตรงกับทะเบียนพนักงาน" /></label>
                    <footer><button type="button" className="reject" disabled={isSaving} onClick={() => void rejectRegistrationRequest(registrationRequest)}>ปฏิเสธ</button><button type="button" className="approve" disabled={isSaving || !selectedEmployeeId} onClick={() => void approveRegistrationRequest(registrationRequest)}>อนุมัติและเปิดบัญชี</button></footer>
                  </article>;
                })}
                {!pendingRegistrationRequests.length && <div className="registration-empty"><span aria-hidden="true">✓</span><strong>ตรวจครบแล้ว</strong><p>ยังไม่มีคำขอสมัครสมาชิกใหม่ที่รออนุมัติ</p></div>}
              </div>
              {reviewedRegistrationRequests.length > 0 && <div className="registration-history"><h3>ประวัติคำขอที่ตรวจแล้ว</h3><div className="access-user-table-wrap"><table className="access-user-table"><thead><tr><th>ผู้สมัคร</th><th>ชื่อผู้ใช้</th><th>บทบาทที่อนุมัติ</th><th>ผลตรวจ</th><th>ผู้ตรวจ</th><th>วันที่ตรวจ</th></tr></thead><tbody>{reviewedRegistrationRequests.map((registrationRequest) => { const approvedAccount = registrationRequest.approvedUserAccountId ? userAccounts.find((account) => account.id === registrationRequest.approvedUserAccountId) : null; return <tr key={registrationRequest.id}><td><strong>{registrationRequest.firstName} {registrationRequest.lastName}</strong><small>{registrationRequest.email}</small></td><td><code>{registrationRequest.loginId}</code></td><td>{approvedAccount ? <span className={`access-role-pill ${approvedAccount.role}`}>{approvedAccount.role === "admin" ? "HR / Admin" : approvedAccount.role === "manager" ? "หัวหน้าทีม" : "พนักงาน"}</span> : "—"}</td><td><span className={`registration-status ${registrationRequest.status}`}>{registrationRequest.status === "approved" ? "อนุมัติแล้ว" : "ปฏิเสธ"}</span>{registrationRequest.rejectionReason && <small>{registrationRequest.rejectionReason}</small>}</td><td>{registrationRequest.reviewedByName || "—"}</td><td>{registrationRequest.reviewedAt ? formatUpdatedAt(registrationRequest.reviewedAt) : "—"}</td></tr>; })}</tbody></table></div></div>}
            </section>

            <section hidden={accessPanel !== "users"} className="access-account-card">
              <div className="access-card-heading"><div><p className="eyebrow">MEMBER ACCESS</p><h2>สมาชิกที่อนุมัติแล้ว</h2><p>HR / Admin แก้ไขบทบาท รีเซ็ตรหัสผ่าน เพิกถอนหรือคืนสิทธิ์ได้ และส่งออกไปเปิดใน Excel โดยไม่เปิดเผย Password Hash, Salt, Session Token หรือข้อมูลลับ</p></div><div className="access-user-heading-actions"><span>{userAccounts.length} บัญชี</span><button type="button" onClick={exportUserAccounts}>↓ ส่งออก Excel (.csv)</button></div></div>
              <div className="access-user-table-wrap" tabIndex={0} aria-label="เลื่อนเพื่อดูข้อมูลผู้ใช้งานทั้งหมด">
                <table className="access-user-table">
                  <caption className="sr-only">ฐานข้อมูลผู้ใช้งานสำหรับผู้ดูแลระบบ</caption>
                  <thead><tr><th>Username</th><th>ชื่อผู้ใช้งาน</th><th>บทบาท</th><th>สถานะ</th><th>โปรไฟล์พนักงาน</th><th>อีเมล</th><th>รหัสผ่าน</th><th>เปลี่ยนรหัส</th><th>ล็อก</th><th>เข้าใช้ล่าสุด</th><th>จัดการ</th></tr></thead>
                  <tbody>{userAccounts.map((account) => {
                    const employee = account.employeeId ? employeesById.get(account.employeeId) : null;
                    const credentialState = accountCredentialState(account);
                    const roleName = account.role === "admin" ? "HR / Admin" : account.role === "manager" ? "หัวหน้าทีม" : "พนักงาน";
                    const locked = credentialState.id === "locked";
                    return <tr key={account.id} className={account.status}><td><code>{account.loginId || "ยังไม่กำหนด"}</code></td><td><strong>{account.displayName}</strong><small>{account.nickname ? `ชื่อเล่น ${account.nickname}` : "ไม่ระบุชื่อเล่น"}</small></td><td><span className={`access-role-pill ${account.role}`}>{roleName}</span></td><td><span className={`access-status ${account.status}`}>{account.status === "active" ? "ใช้งาน" : "เพิกถอนสิทธิ์"}</span></td><td><strong>{employee?.name ?? (account.role === "admin" ? "ระดับองค์กร" : "ยังไม่ผูก")}</strong><small>{employee ? getRole(employee.roleId).name : "—"}</small></td><td>{account.email}</td><td>{account.hasPassword ? "มี" : "ไม่มี"}</td><td>{account.mustChangePassword ? "ต้องเปลี่ยน" : "ไม่ต้องเปลี่ยน"}</td><td>{locked ? "ล็อก" : "ปกติ"}</td><td>{account.lastLoginAt ? formatUpdatedAt(account.lastLoginAt) : credentialState.label}</td><td><span className="access-account-actions"><button aria-label={`แก้ไขบัญชีของ ${account.displayName}`} disabled={isSaving || account.id === currentUser?.id} onClick={() => editUserAccount(account)}>แก้ไข</button><button aria-label={`สร้างรหัสผ่านชั่วคราวใหม่ให้ ${account.displayName}`} disabled={isSaving || account.id === currentUser?.id} onClick={() => prepareUserAccountPasswordReset(account)}>รีเซ็ต</button><button className={account.status === "active" ? "revoke-account" : "restore-account"} aria-label={`${account.status === "active" ? "เพิกถอนสิทธิ์" : "คืนสิทธิ์"}ของ ${account.displayName}`} disabled={isSaving || account.id === currentUser?.id} onClick={() => void toggleUserAccount(account)}>{account.status === "active" ? "เพิกถอน" : "คืนสิทธิ์"}</button><button className="delete-account" aria-label={`ลบบัญชีของ ${account.displayName}`} disabled={isSaving || account.id === currentUser?.id || account.id === "user-owner"} onClick={() => void deleteUserAccount(account)}>ลบ</button></span></td></tr>;
                  })}</tbody>
                </table>
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

            <section className="portfolio-finder-card" aria-labelledby="portfolio-finder-title">
              <div className="portfolio-finder-heading">
                <div className="portfolio-finder-title"><span className="portfolio-finder-icon" aria-hidden="true">⌕</span><div><p className="eyebrow">PORTFOLIO FINDER</p><h2 id="portfolio-finder-title">ค้นหาแฟ้มและไฟล์ผลงาน</h2><p>ค้นจากชื่อพนักงาน โปรเจกต์ ชื่องาน ชื่อไฟล์ ลิงก์ หรือข้อความในหลักฐาน</p></div></div>
                <div className="portfolio-finder-result"><small>ผลการค้นหา</small><strong>{visiblePortfolioEntries.length}</strong><span>จาก {portfolioEntries.length} ผลงาน</span></div>
              </div>

              <div className="portfolio-command-panel" role="search" aria-label="ค้นหาและกรองแฟ้มผลงาน">
                <div className="portfolio-search">
                  <label htmlFor="portfolio-search-input">ค้นหาทุกข้อมูลในแฟ้ม</label>
                  <div className="portfolio-search-input"><span aria-hidden="true">⌕</span><input id="portfolio-search-input" type="search" value={portfolioSearch} onChange={(event) => setPortfolioSearch(event.target.value)} placeholder="ค้นหาชื่อคน งาน โปรเจกต์ ชื่อไฟล์ หรือลิงก์..." />{portfolioSearch && <button type="button" onClick={() => setPortfolioSearch("")} aria-label="ล้างคำค้นหา">×</button>}</div>
                  <small>ระบบค้นหาทั้งชื่องาน รายละเอียด หลักฐาน ผู้ส่ง และผู้ตรวจในครั้งเดียว</small>
                </div>
                <div className="portfolio-filter-grid">
                  {!isEmployeeUser && <label><span>พนักงาน</span><select value={portfolioEmployeeId} onChange={(event) => setPortfolioEmployeeId(event.target.value)}><option value="all">พนักงานทั้งหมด</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} · {getRole(employee.roleId).shortName}{employee.status !== "active" ? " · พ้นสภาพ" : ""}</option>)}</select></label>}
                  <label><span>โปรเจกต์</span><select value={portfolioProjectId} onChange={(event) => setPortfolioProjectId(event.target.value)}><option value="all">ทุกโปรเจกต์</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
                  <button type="button" className="portfolio-reset-button" disabled={!hasPortfolioFilters} onClick={() => { setPortfolioSearch(""); setPortfolioEmployeeId(isEmployeeUser ? currentUser?.employeeId ?? "all" : "all"); setPortfolioProjectId("all"); setPortfolioStatus("all"); setActiveDepartment("all"); }}><span aria-hidden="true">↺</span> ล้างตัวกรองทั้งหมด</button>
                </div>
              </div>

              <div className="portfolio-status-tabs" role="group" aria-label="กรองแฟ้มตามสถานะ">
                {([
                  { id: "all", icon: "☷", label: "ทั้งหมด", count: portfolioStatusCounts.all },
                  { id: "approved", icon: "✓", label: "ตรวจแล้ว", count: portfolioStatusCounts.approved },
                  { id: "submitted", icon: "⌕", label: "รอตรวจ", count: portfolioStatusCounts.submitted },
                  { id: "revision", icon: "↺", label: "ต้องแก้ไข", count: portfolioStatusCounts.revision },
                  { id: "missing", icon: "＋", label: "ไม่มีหลักฐาน", count: portfolioStatusCounts.missing },
                ] as const).map((status) => <button type="button" key={status.id} className={portfolioStatus === status.id ? "active" : ""} onClick={() => setPortfolioStatus(status.id)} aria-pressed={portfolioStatus === status.id}><span aria-hidden="true">{status.icon}</span><strong>{status.label}</strong><b>{status.count}</b></button>)}
              </div>

              {hasPortfolioFilters && <div className="portfolio-active-filters"><strong>ตัวกรองที่ใช้</strong>{portfolioSearch.trim() && <button type="button" onClick={() => setPortfolioSearch("")}>คำค้น “{portfolioSearch.trim().slice(0, 24)}” <span aria-hidden="true">×</span></button>}{focusedPortfolioDepartment && <button type="button" onClick={() => setActiveDepartment("all")}>แผนก {focusedPortfolioDepartment.label} <span aria-hidden="true">×</span></button>}{!isEmployeeUser && focusedPortfolioEmployee && <button type="button" onClick={() => setPortfolioEmployeeId("all")}>{focusedPortfolioEmployee.name} <span aria-hidden="true">×</span></button>}{focusedPortfolioProject && <button type="button" onClick={() => setPortfolioProjectId("all")}>{focusedPortfolioProject.name} <span aria-hidden="true">×</span></button>}{portfolioStatus !== "all" && <button type="button" onClick={() => setPortfolioStatus("all")}>{portfolioStatusLabel(portfolioStatus)} <span aria-hidden="true">×</span></button>}</div>}

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

              <div className="portfolio-results-heading"><div><p className="eyebrow">SEARCH RESULTS</p><h3>ผลงานและหลักฐานที่ค้นพบ</h3><span aria-live="polite">แสดง {visiblePortfolioEntries.length} ผลงาน · {visiblePortfolioAssetCount} ไฟล์และลิงก์</span></div><small><span aria-hidden="true">↓</span> เรียงผลงานล่าสุดก่อน</small></div>
              <div className="portfolio-archive" role="region" aria-label="แฟ้มผลงานพนักงาน">
                <div className="portfolio-archive-head" aria-hidden="true"><span>เจ้าของผลงาน</span><span>งานและโปรเจกต์</span><span>หลักฐานที่ค้นพบ</span><span>ข้อมูลประเมิน</span><span>สถานะ</span></div>
                {visiblePortfolioEntries.map((entry) => {
                  const linkEvidence = entry.submissions.find((submission) => submission.linkUrl);
                  const fileEvidence = entry.submissions.find((submission) => submission.storageKey);
                  const evidenceAssetCount = entry.submissions.reduce((count, submission) => count + Number(Boolean(submission.linkUrl)) + Number(Boolean(submission.storageKey)), 0);
                  const additionalEvidenceCount = Math.max(0, evidenceAssetCount - Number(Boolean(linkEvidence)) - Number(Boolean(fileEvidence)));
                  const role = entry.employee ? getRole(entry.employee.roleId) : null;
                  return (
                    <article className="portfolio-archive-row" aria-label={`${entry.item.title} โดย ${entry.employee?.name ?? "ไม่ระบุพนักงาน"}`} key={entry.item.id}>
                      <span className="portfolio-person">{entry.employee ? <EmployeeAvatar employee={entry.employee} profile={employeeProfilesById.get(entry.employee.id)} className="avatar-portfolio-row" /> : <i className="avatar-media avatar-portfolio-row">PP</i>}<span><strong>{entry.employee?.name ?? "ไม่ระบุพนักงาน"}</strong><small>{role?.name ?? "ไม่ระบุตำแหน่ง"}</small></span></span>
                      <span className="portfolio-work"><b>{workKindLabel(entry.item.kind)} · {entry.project?.name ?? "ไม่ระบุโปรเจกต์"}</b><strong>{entry.item.title}</strong><small>{entry.item.description}</small></span>
                      <span className="portfolio-assets">{linkEvidence && <a href={linkEvidence.linkUrl} target="_blank" rel="noreferrer"><b>↗</b><span>เปิดลิงก์<small>{submissionTypeLabels[linkEvidence.submissionType]}</small></span></a>}{fileEvidence && <a href={`/api/work-submissions?id=${encodeURIComponent(fileEvidence.id)}`}><b>↓</b><span>{fileEvidence.fileName}<small>{formatFileSize(fileEvidence.sizeBytes)}</small></span></a>}{additionalEvidenceCount > 0 && <button type="button" className="portfolio-more-assets" onClick={() => openSubmissionCenter(entry.item)}><b>＋</b><span>อีก {additionalEvidenceCount} รายการ<small>เปิดดูหลักฐานทั้งหมด</small></span></button>}{!linkEvidence && !fileEvidence && <button type="button" onClick={() => openSubmissionCenter(entry.item)}><b>{isEmployeeUser && !isEmployeePreview ? "＋" : "⌕"}</b><span>{isEmployeeUser && !isEmployeePreview ? "เพิ่มหลักฐาน" : "ดูรายละเอียด"}<small>{isEmployeeUser && !isEmployeePreview ? "ไฟล์หรือลิงก์ผลงาน" : "ยังไม่มีหลักฐาน"}</small></span></button>}</span>
                      <span className="portfolio-evaluation"><b>{entry.evaluation?.totalScore.toFixed(0) ?? "—"}<small>คะแนนรวม</small></b><span><small>KPI {entry.evaluation?.kpiScore.toFixed(0) ?? "—"}</small><small>สกิล {entry.evaluation?.skillScore.toFixed(0) ?? "—"}</small><small>★ {entry.item.points} Points</small></span></span>
                      <span className="portfolio-state"><b className={entry.status}>{portfolioStatusLabel(entry.status)}</b><small>{entry.approvedSubmission?.reviewedBy ? `ตรวจโดย ${entry.approvedSubmission.reviewedBy}` : entry.latestSubmission ? `ส่ง ${formatUpdatedAt(entry.latestSubmission.submittedAt)}` : `เสร็จ ${formatUpdatedAt(entry.item.updatedAt)}`}</small><button type="button" onClick={() => openSubmissionCenter(entry.item)}>{entry.submissions.length ? `ดูหลักฐาน ${entry.submissions.length} รายการ` : isEmployeeUser && !isEmployeePreview ? "จัดเก็บผลงาน" : "ดูรายละเอียด"}</button></span>
                    </article>
                  );
                })}
                {!visiblePortfolioEntries.length && <div className="portfolio-empty" role="status"><span>⌕</span><strong>ไม่พบผลงานตามเงื่อนไข</strong><p>ลองเปลี่ยนคำค้นหา พนักงาน โปรเจกต์ หรือสถานะแฟ้ม</p><button onClick={() => { setPortfolioSearch(""); setPortfolioEmployeeId(isEmployeeUser ? currentUser?.employeeId ?? "all" : "all"); setPortfolioProjectId("all"); setPortfolioStatus("all"); setActiveDepartment("all"); }}>ล้างตัวกรองทั้งหมด</button></div>}
              </div>
              <div className="portfolio-audit-note"><span>i</span><p><strong>ข้อมูลพร้อมใช้ประกอบการประเมิน</strong> ตรวจสอบเนื้องาน หลักฐาน ผู้อนุมัติ KPI สกิล และหมายเหตุร่วมกัน ไม่ควรตัดสินพนักงานจากจำนวนไฟล์หรือคะแนนเพียงอย่างเดียว</p></div>
            </section>
          </section>
        )}

        {view === "work" && (
          <section className="mission-layout">
            <nav className="work-section-tabs" aria-label="เลือกส่วนจัดการงาน">
              {([
                { id: "quests", icon: "Q", label: "ศูนย์เควส", copy: isEmployeeUser ? "เควสสำหรับฉัน" : "สร้างและจัดการ", value: currentQuests.length },
                { id: "tasks", icon: "✓", label: "รายการงาน", copy: "งานที่ต้องทำ", value: (isEmployeeUser ? employeeAssignedWorkItems : workItems).filter((item) => item.status !== "done").length },
                { id: "projects", icon: "◇", label: "โปรเจกต์", copy: "ติดตามภาพรวม", value: projects.length },
                { id: "points", icon: "★", label: isEmployeeUser ? "Points ของฉัน" : "จัดการ Points", copy: isEmployeeUser ? "ยอด กฎ ประวัติ" : "รอบ กฎ ประวัติ", value: totalPoints },
                { id: "rewards", icon: "♢", label: isEmployeeUser ? "ร้านรางวัล" : "รางวัล", copy: "ใช้ Points แลกของ", value: rewards.filter((reward) => reward.isActive).length },
              ] as const).filter((section) => !isEmployeeUser || section.id !== "projects").map((section) => (
                <button key={section.id} className={workSection === section.id ? "active" : ""} onClick={() => { if (section.id === "points") setPointPanel("overview"); setWorkSection(section.id); }} aria-current={workSection === section.id ? "page" : undefined}>
                  <span aria-hidden="true">{section.icon}</span>
                  <p><strong>{section.label}</strong><small>{section.copy}</small></p>
                  <b>{formatMoney(section.value)}</b>
                </button>
              ))}
            </nav>

            {workSection === "quests" && <section className="quest-center" aria-labelledby="quest-center-title">
              <header className="quest-center-hero">
                <div className="quest-center-copy">
                  <p className="eyebrow">QUEST CENTER</p>
                  <h2 id="quest-center-title">ภารกิจเด่นของคนและทีม</h2>
                  <p>{permissions.canManageQuests ? "สร้างเควสรายบุคคล เควสทีม และกิจกรรม พร้อมกำหนด Points และรางวัลให้เห็นชัดตั้งแต่เริ่ม" : "เลือกดูเป้าหมายที่เปิดสำหรับคุณ อ่านเงื่อนไข และติดตามความคืบหน้าได้จากที่เดียว"}</p>
                  {permissions.canManageQuests && !isEmployeePreview && <button type="button" onClick={() => openQuestEditor()}><span aria-hidden="true">＋</span> สร้างเควสใหม่</button>}
                </div>
                <div className="quest-hero-orbit" aria-hidden="true"><span>Q</span><i /><i /><i /></div>
                <div className="quest-hero-stats" aria-label="ภาพรวมเควส">
                  <article><small>เปิดอยู่</small><strong>{currentQuests.length}</strong><span>เควส</span></article>
                  <article><small>Points ที่ประกาศ</small><strong>{formatMoney(activeQuestPoints)}</strong><span>Points</span></article>
                  <article><small>รางวัลพิเศษ</small><strong>{activeQuestRewards}</strong><span>รายการ</span></article>
                  <article><small>ความคืบหน้าเฉลี่ย</small><strong>{questProgressAverage}%</strong><span>จากเควสเปิด</span></article>
                </div>
              </header>

              <div className="quest-control-bar">
                <div className="quest-type-filters" role="group" aria-label="กรองประเภทเควส">
                  {([{ id: "all", label: "ทุกเควส", icon: "Q" }, ...Object.entries(questTypeMeta).map(([id, meta]) => ({ id, label: meta.shortLabel, icon: meta.icon }))] as { id: QuestTypeFilter; label: string; icon: string }[]).map((filter) => <button type="button" key={filter.id} className={questTypeFilter === filter.id ? "active" : ""} aria-pressed={questTypeFilter === filter.id} onClick={() => setQuestTypeFilter(filter.id)}><span aria-hidden="true">{filter.icon}</span>{filter.label}<b>{filter.id === "all" ? quests.length : quests.filter((quest) => quest.type === filter.id).length}</b></button>)}
                </div>
                {permissions.canManageQuests && <div className="quest-status-filters" role="group" aria-label="กรองสถานะเควส">
                  {([{ id: "current", label: "กำลังจัดการ" }, { id: "archived", label: "ประวัติ" }, { id: "all", label: "ทั้งหมด" }] as { id: QuestStatusFilter; label: string }[]).map((filter) => <button type="button" key={filter.id} className={questStatusFilter === filter.id ? "active" : ""} aria-pressed={questStatusFilter === filter.id} onClick={() => setQuestStatusFilter(filter.id)}>{filter.label}</button>)}
                </div>}
              </div>

              <div className="quest-card-grid" aria-live="polite">
                {filteredQuests.map((quest) => {
                  const typeMeta = questTypeMeta[quest.type];
                  const statusMeta = questStatusMeta[quest.status];
                  const deadlineState = quest.status === "completed" ? "completed" : quest.endDate < todayDate ? "overdue" : quest.endDate === todayDate ? "today" : "upcoming";
                  const completions = questCompletionsByQuest.get(quest.id) ?? [];
                  const ownCompletion = currentUser?.role === "employee" && currentUser.employeeId ? completions.find((completion) => completion.employeeId === currentUser.employeeId) ?? null : null;
                  return <article key={quest.id} data-quest-id={quest.id} className={`quest-card type-${quest.type} status-${quest.status} ${quest.isFeatured ? "featured" : ""}`}>
                    {quest.isFeatured && <span className="quest-featured-ribbon"><i aria-hidden="true">✦</i> เควสเด่น</span>}
                    <header>
                      <span className={`quest-type-icon ${quest.type}`} aria-hidden="true">{typeMeta.icon}</span>
                      <div><span className={`quest-type-badge ${quest.type}`}>{typeMeta.label}</span><h3>{quest.title}</h3></div>
                      <span className={`quest-status-badge ${quest.status}`}>{statusMeta.label}</span>
                    </header>
                    <p className="quest-description">{quest.description || "ยังไม่มีรายละเอียดเพิ่มเติม"}</p>
                    <div className="quest-audience"><span aria-hidden="true">◎</span><p><small>ผู้เข้าร่วม</small><strong>{questAudienceLabel(quest)}</strong></p></div>
                    <div className="quest-benefits">
                      <span className="quest-points-benefit"><small>สิทธิ์ที่ประกาศเมื่อสำเร็จ</small><strong>★ {formatMoney(quest.pointsReward)} Points</strong></span>
                      {quest.rewardId && <span className="quest-reward-benefit"><i aria-hidden="true">{quest.rewardIconSnapshot || "♢"}</i><span><small>รางวัลพิเศษ</small><strong>{quest.rewardTitleSnapshot || "รางวัลที่กำหนด"}</strong></span></span>}
                    </div>
                    <div className="quest-progress-block">
                      <div><span><small>ความคืบหน้า</small><strong>{quest.progress}%</strong></span><span className={`quest-deadline ${deadlineState}`}><small>{deadlineState === "overdue" ? "เลยกำหนด" : deadlineState === "today" ? "สิ้นสุดวันนี้" : deadlineState === "completed" ? "ปิดสำเร็จ" : "สิ้นสุด"}</small><strong>{formatDueDate(quest.endDate)}</strong></span></div>
                      <i role="progressbar" aria-label={`ความคืบหน้าเควส ${quest.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={quest.progress}><b style={{ width: `${quest.progress}%` }} /></i>
                      <small>{formatDueDate(quest.startDate)} – {formatDueDate(quest.endDate)}</small>
                    </div>
                    {ownCompletion ? <div className="quest-own-fulfillment" role="status"><span aria-hidden="true">✓</span><p><strong>ได้รับสิทธิ์แล้ว</strong><small>{formatMoney(ownCompletion.pointsAwarded)} Points{ownCompletion.rewardId ? ` + ${ownCompletion.rewardIconSnapshot || "♢"} ${ownCompletion.rewardTitleSnapshot}` : ""} · ยืนยัน {formatDueDate(ownCompletion.completionDate)}</small></p></div>
                      : currentUser?.role === "employee" ? <div className="quest-own-fulfillment pending"><span aria-hidden="true">○</span><p><strong>ยังไม่ได้รับสิทธิ์</strong><small>ทำตามเกณฑ์และส่งหลักฐานให้ HR ตรวจ ก่อนระบบมอบ Points และรางวัล</small></p></div>
                        : <div className="quest-fulfillment-count"><span aria-hidden="true">✓</span><p><small>{permissions.canManageQuests ? "มอบสิทธิ์แล้ว" : "ทีมที่ได้รับสิทธิ์แล้ว"}</small><strong>{completions.length} คน</strong></p></div>}
                    {permissions.canManageQuests && completions.length > 0 && <details className="quest-fulfillment-history"><summary>ดูรายชื่อและประวัติการมอบสิทธิ์ <b>{completions.length}</b></summary><div>{completions.map((completion) => <article key={completion.id}><span aria-hidden="true">{completion.rewardIconSnapshot || "★"}</span><p><strong>{completion.employeeNameSnapshot} · {completion.employeeDepartmentNameSnapshot}</strong><small>{formatDueDate(completion.completionDate)} · {formatMoney(completion.pointsAwarded)} Points{completion.rewardId ? ` · ${completion.rewardTitleSnapshot}` : ""}</small><small>{completion.note}</small><small>ตรวจโดย {completion.completedByName} · {formatUpdatedAt(completion.completedAt)}</small></p><a href={completion.evidenceUrl} target="_blank" rel="noreferrer" aria-label={`เปิดหลักฐานของ ${completion.employeeNameSnapshot}`}>หลักฐาน ↗</a></article>)}</div></details>}
                    <footer>
                      <p><span aria-hidden="true">i</span><small>{quest.fulfillmentNotice}</small></p>
                      {permissions.canManageQuests && !isEmployeePreview && quest.status !== "archived" && <div className="quest-card-actions">{(quest.status === "active" || quest.status === "completed") && <button type="button" className="fulfill" onClick={() => openQuestFulfillment(quest)}>ตรวจผลและมอบสิทธิ์</button>}<button type="button" onClick={() => openQuestEditor(quest)}>แก้ไขเควส</button><button type="button" className="danger" disabled={isSaving} onClick={() => void deleteQuest(quest)}>ลบ</button></div>}
                    </footer>
                  </article>;
                })}
                {!filteredQuests.length && <div className="quest-empty" role="status"><span aria-hidden="true">Q</span><strong>{questStatusFilter === "archived" ? "ยังไม่มีเควสในประวัติ" : "ยังไม่มีเควสในหมวดนี้"}</strong><p>{permissions.canManageQuests ? "สร้างเควสใหม่ หรือเลือกตัวกรองอื่นเพื่อดูรายการที่มีอยู่" : "เมื่อ HR เปิดเควสที่ตรงกับคุณ ทีม หรือกิจกรรมองค์กร เควสจะปรากฏที่นี่"}</p>{permissions.canManageQuests && !isEmployeePreview && <button type="button" onClick={() => openQuestEditor()}>＋ สร้างเควสแรก</button>}</div>}
              </div>

              <div className="quest-review-note" role="note"><span aria-hidden="true">✓</span><p><strong>มอบสิทธิ์หลัง HR / Admin ตรวจหลักฐานเท่านั้น</strong><small>เมื่อยืนยันผล ระบบจะเพิ่ม Points ตามจำนวนที่ประกาศและตัดสต็อกรางวัลในรายการเดียว พร้อมเก็บผู้ตรวจ นโยบาย และหลักฐานเพื่อป้องกันการมอบซ้ำ</small></p></div>
            </section>}

            {workSection === "tasks" && <section className="simple-todo-card" aria-labelledby="simple-todo-title">
              <div className="simple-todo-heading">
                <div><p className="eyebrow">งานของวันนี้</p><h2 id="simple-todo-title">{isEmployeeUser ? "ฉันต้องทำอะไรต่อ?" : "ทีมต้องทำอะไรต่อ?"}</h2><p>รายการเดียวจบ เรียงงานเร่งด่วนและกำหนดส่งให้แล้ว</p></div>
                {(permissions.canManageWork || (isEmployeeUser && permissions.canAssignTeamWork && !isEmployeePreview)) && <div className="simple-todo-create">{permissions.canManageWork && <button type="button" className="secondary-button" onClick={() => setShowProjectForm(true)}>สร้างโปรเจกต์</button>}<button type="button" className="primary-button" onClick={() => openWorkItemForm()}><span aria-hidden="true">＋</span> {isEmployeeUser ? "สร้างงานประสาน" : "เพิ่มงาน"}</button></div>}
              </div>

              {isEmployeeUser && <div className="employee-task-scope" aria-label="เลือกขอบเขตรายการงาน">
                <button type="button" aria-pressed={employeeTaskScope === "assigned"} className={employeeTaskScope === "assigned" ? "active" : ""} onClick={() => { setEmployeeTaskScope("assigned"); setWorkDueFilter("all"); }}><span aria-hidden="true">✓</span><p><strong>งานที่ต้องทำ</strong><small>งานที่ฉันเป็นผู้รับผิดชอบ</small></p><b>{employeeAssignedWorkItems.filter((item) => item.status !== "done").length}</b></button>
                <button type="button" aria-pressed={employeeTaskScope === "created"} className={employeeTaskScope === "created" ? "active" : ""} onClick={() => { setEmployeeTaskScope("created"); setWorkDueFilter("all"); }}><span aria-hidden="true">→</span><p><strong>งานที่ฉันส่งต่อ</strong><small>งานประสานที่ฉันสร้างให้ตนเองหรือเพื่อนร่วมทีม</small></p><b>{employeeCreatedWorkItems.filter((item) => item.status !== "done").length}</b></button>
                <p className="employee-task-scope-note"><span aria-hidden="true">i</span> งานประสานจากพนักงานมี 0 Points ไม่นับเป็น KPI หรือภาระงานทางการ ผู้รับงานเป็นผู้อัปเดต และเฉพาะหัวหน้าหรือ HR เท่านั้นที่ตรวจอนุมัติได้</p>
              </div>}

              <div className="simple-todo-overview" aria-label="เลือกดูงานแบบรวดเร็ว">
                {([
                  { id: "all", label: employeeTaskScope === "created" && isEmployeeUser ? "กำลังติดตาม" : "งานที่ต้องทำ", value: workListScopeItems.filter((item) => item.status !== "done").length, icon: "☷" },
                  { id: "today", label: "กำหนดวันนี้", value: todayWorkItems.length, icon: "●" },
                  { id: "overdue", label: "เกินกำหนด", value: overdueWorkItems.length, icon: "!" },
                  { id: "review", label: "รอตรวจ", value: reviewQueueWorkItems.length, icon: "⌕" },
                  { id: "done", label: "เสร็จแล้ว", value: workListScopeItems.filter((item) => item.status === "done").length, icon: "✓" },
                ] as const).map((filter) => <button key={filter.id} className={`${workDueFilter === filter.id ? "active" : ""} ${filter.id}`} onClick={() => setWorkDueFilter(filter.id)}><span>{filter.icon}</span><strong>{filter.value}</strong><small>{filter.label}</small></button>)}
              </div>

              <div className="simple-todo-toolbar">
                <label className="search-field simple-todo-search"><span aria-hidden="true">⌕</span><input value={workSearch} onChange={(event) => setWorkSearch(event.target.value)} placeholder="ค้นหาชื่องานหรือโปรเจกต์" /><span className="sr-only">ค้นหางานและภารกิจ</span></label>
                <details className="simple-todo-more">
                  <summary>ตัวกรองเพิ่มเติม <span>⌄</span></summary>
                  <div>
                    {!isEmployeeUser && <label><span>ผู้รับผิดชอบ</span><select value={workAssigneeFilter} onChange={(event) => setWorkAssigneeFilter(event.target.value)}><option value="all">ทุกคนในทีม</option>{employees.filter((employee) => employee.status === "active").map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>}
                    <label><span>ประเภทงาน</span><select value={workFilter} onChange={(event) => setWorkFilter(event.target.value as typeof workFilter)}><option value="all">ทุกประเภท</option><option value="task">งานทั่วไป</option><option value="request">รีเควสต์</option><option value="mission">ภารกิจ / เควสต์</option></select></label>
                    <button className={workDueFilter === "week" ? "active" : ""} onClick={() => setWorkDueFilter(workDueFilter === "week" ? "all" : "week")}>งานภายใน 7 วัน ({dueThisWeekWorkItems.length})</button>
                  </div>
                </details>
                {(workSearch || workFilter !== "all" || workDueFilter !== "all" || (!isEmployeeUser && workAssigneeFilter !== "all")) && <button className="simple-reset-filter" onClick={() => { setWorkSearch(""); setWorkFilter("all"); setWorkDueFilter("all"); setWorkAssigneeFilter(isEmployeeUser ? currentUser?.employeeId ?? "all" : "all"); }}>ล้างตัวกรอง</button>}
              </div>

              <div className="simple-todo-result"><span>พบ <strong>{visibleWorkItems.length}</strong> งาน</span><span>ทำเสร็จแล้ว <strong>{workCompletion.toFixed(0)}%</strong></span></div>
              <div className="simple-task-list">
                {visibleWorkItems.map((item) => {
                  const project = projectsById.get(item.projectId);
                  const assignee = safeWorkRosterById.get(item.assigneeEmployeeId);
                  const creatorId = workItemCreatorId(item);
                  const creator = creatorId ? safeWorkRosterById.get(creatorId) : null;
                  const isCurrentEmployeeAssignee = Boolean(isEmployeeUser && currentUser?.employeeId === item.assigneeEmployeeId);
                  const submissions = workSubmissionsByItem.get(item.id) ?? [];
                  const dueState = item.status === "done" ? "done" : item.dueDate < todayDate ? "overdue" : item.dueDate === todayDate ? "today" : "upcoming";
                  const actionLabel = item.status === "todo" ? "เริ่มงาน" : item.status === "in_progress" && isEmployeeUser ? "ส่งงาน" : item.status === "in_progress" ? "ดูรายละเอียด" : item.status === "review" && isEmployeeUser ? "ดูงานที่ส่ง" : item.status === "review" ? "ตรวจงาน" : "ดูผลงาน";
                  const visibleActionLabel = isEmployeePreview ? (submissions.length ? `ดูหลักฐาน ${submissions.length}` : "ดูรายละเอียด") : actionLabel;
                  return (
                    <article className={`simple-task-row ${dueState}`} key={item.id}>
                      <span className={`simple-task-check ${item.status}`} aria-hidden="true">{item.status === "done" ? "✓" : item.status === "review" ? "⌕" : item.status === "in_progress" ? "→" : ""}</span>
                      <div className="simple-task-main">
                        <div className="simple-task-labels"><span className={`simple-task-status ${item.status}`}>{workStatusLabel(item.status)}</span><span className={`work-priority ${item.priority}`}>{workPriorityLabel(item.priority)}</span><small>{project?.name ?? "งานทั่วไป · ไม่ผูกโปรเจกต์"}</small></div>
                        <h3>{item.title}</h3>
                        <p>{item.description || "ยังไม่มีรายละเอียดเพิ่มเติม"}</p>
                        <div className="simple-task-meta">
                          <span className={`simple-task-due ${dueState}`}><b>{dueState === "overdue" ? "เกินกำหนด" : dueState === "today" ? "ส่งวันนี้" : dueState === "done" ? "ปิดงานแล้ว" : `ส่ง ${formatDueDate(item.dueDate)}`}</b></span>
                          <span>★ {formatMoney(item.points)} Points</span>
                          <span>{submissions.length} หลักฐาน</span>
                        </div>
                      </div>
                      <div className="simple-task-side">
                        <div className="simple-task-people">
                          <div className="simple-task-owner">{assignee ? <EmployeeAvatar employee={assignee} profile={employeeProfilesById.get(assignee.id)} className="avatar-simple-task" /> : <i className="avatar-media avatar-simple-task">PP</i>}<span><small>ผู้รับงาน</small><strong>{assignee?.name ?? "สมาชิกทีม"}</strong></span></div>
                          <div className="simple-task-creator"><span aria-hidden="true">→</span><p><small>ผู้สร้างงาน</small><strong>{creator?.name ?? (creatorId ? "สมาชิกทีม" : "HR / หัวหน้าทีม")}</strong></p></div>
                        </div>
                        <div className="simple-task-progress"><span><small>ความคืบหน้า</small><strong>{item.progress}%</strong></span><i><b style={{ width: `${item.progress}%` }} /></i></div>
                      </div>
                      <div className="simple-task-actions">{!isEmployeeUser && <button onClick={() => openWorkItemForm(item)}>แก้ไขงาน</button>}{isEmployeeUser && !isCurrentEmployeeAssignee ? <span className="delegated-task-status">ผู้รับงานเป็นผู้อัปเดต</span> : <button className="primary" disabled={quickUpdatingWorkId === item.id} onClick={() => isEmployeePreview ? openSubmissionCenter(item) : item.status === "todo" ? void startWorkItem(item) : openSubmissionCenter(item)}>{quickUpdatingWorkId === item.id ? "กำลังเริ่ม..." : visibleActionLabel}</button>}</div>
                    </article>
                  );
                })}
                {!visibleWorkItems.length && <div className="simple-task-empty"><span>✓</span><strong>{isEmployeeUser && employeeTaskScope === "created" ? "ยังไม่มีงานที่คุณส่งต่อ" : "ไม่พบงานในรายการนี้"}</strong><p>{isEmployeeUser && employeeTaskScope === "created" ? "สร้างงานประสานให้ตนเองหรือเพื่อนร่วมทีมได้จากปุ่มด้านบน" : "ลองเลือก “งานที่ต้องทำ” หรือล้างตัวกรองเพื่อดูงานอีกครั้ง"}</p><button onClick={() => { setEmployeeTaskScope("assigned"); setWorkSearch(""); setWorkFilter("all"); setWorkDueFilter("all"); setWorkAssigneeFilter(isEmployeeUser ? currentUser?.employeeId ?? "all" : "all"); }}>แสดงงานที่ต้องทำ</button></div>}
              </div>
            </section>}

            {workSection === "projects" && <div className="mission-command-grid work-projects-only">
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
                <div className="section-heading compact"><div><p className="eyebrow">POINTS {isEmployeeUser ? "BALANCE" : "LEADERBOARD"}</p><h2>{isEmployeeUser ? "Points สะสมของฉัน" : "อันดับ Points สะสม"}</h2></div><span className="points-crown">★</span></div>
                <div className="points-leaderboard-list">
                  {leaderboard.slice(0, 6).map(({ employee, points }, index) => <article key={employee.id} className={index === 0 ? "champion" : ""}><span className="leader-rank">{index + 1}</span><EmployeeAvatar employee={employee} profile={employeeProfilesById.get(employee.id)} className="avatar-leader" /><p><strong>{employee.name}</strong><small>{getRole(employee.roleId).name}</small></p><b>{formatMoney(points)}<small> Points</small></b></article>)}
                </div>
                <p className="points-note">ยอดคงเหลือรวม Points จากการประเมิน งาน เควสต์ เวลาเข้างาน โบนัส รายการหัก และการแลกรางวัล</p>
              </aside>
            </div>}

            {workSection === "points" && <section className="points-operations-card">
              <div className="points-operations-heading">
                <div><p className="eyebrow">{isEmployeeUser ? "MY POINTS" : "POINTS OPERATIONS"}</p><h2>{isEmployeeUser ? "Points และประวัติของฉัน" : "ศูนย์จัดการ Points ของพนักงาน"}</h2><p>{isEmployeeUser ? "ดู Points ที่ได้รับและใช้ พร้อมเหตุผลของแต่ละรายการได้อย่างโปร่งใส" : "ประมวลผล Points จากการประเมิน งาน การเข้า–ออกงาน และเหตุการณ์ด้านวินัย พร้อมประวัติผู้บันทึก"}</p></div>
                <div className="points-flow-summary">{isEmployeeUser && <span className="balance"><small>Points คงเหลือของฉัน</small><strong>{formatMoney(totalPoints)}</strong></span>}<span><small>Points ที่ได้รับ</small><strong>+{formatMoney(pointsEarned)}</strong></span><span className="negative"><small>Points ที่หัก/ใช้</small><strong>-{formatMoney(pointsDeducted)}</strong></span></div>
              </div>

              <nav className="point-panel-tabs" role="tablist" aria-label="เลือกหน้าจัดการ Points และกฎองค์กร">
                {([
                  { id: "overview", icon: "◎", label: isEmployeeUser ? "ยอด Points" : "ภาพรวม", copy: isEmployeeUser ? "สรุปของฉัน" : "รอบประเมิน" },
                  { id: "policies", icon: "§", label: "กฎองค์กร", copy: isEmployeeUser ? "อ่านและรับทราบ" : "ร่างและประกาศ" },
                  { id: "adjust", icon: "±", label: "เพิ่ม / หัก", copy: "บันทึกเหตุการณ์" },
                  { id: "history", icon: "⌕", label: isEmployeeUser ? "ประวัติของฉัน" : "ประวัติ", copy: "ตรวจสอบย้อนหลัง" },
                ] as const).filter((panel) => panel.id !== "adjust" || permissions.canReviewWork).map((panel) => <button key={panel.id} type="button" role="tab" aria-selected={pointPanel === panel.id} className={pointPanel === panel.id ? "active" : ""} onClick={() => setPointPanel(panel.id)}><span>{panel.icon}</span><p><strong>{panel.label}</strong><small>{panel.copy}</small></p></button>)}
              </nav>

              {pointPanel === "overview" && <div className="point-overview-grid">
                <article><span>★</span><p><small>{isEmployeeUser ? "ยอดใช้ได้ตอนนี้" : "Points คงเหลือทั้งระบบ"}</small><strong>{formatMoney(totalPoints)} Points</strong><button type="button" onClick={() => setWorkSection("rewards")}>ไปร้านรางวัล →</button></p></article>
                <article><span>§</span><p><small>กฎที่ประกาศใช้</small><strong>{publishedOrganizationPolicies.length} ฉบับ</strong><button type="button" onClick={() => setPointPanel("policies")}>{isEmployeeUser && publishedOrganizationPolicies.some((policy) => policy.acknowledgementRequired && !policyAcknowledgements.some((item) => item.policyId === policy.id && item.policyVersion === policy.version && item.employeeId === currentUser?.employeeId)) ? "มีรายการรอรับทราบ" : "เปิดดูกฎองค์กร"} →</button></p></article>
                <article><span>⌕</span><p><small>รายการ Points</small><strong>{visiblePointLedger.length} รายการ</strong><button type="button" onClick={() => setPointPanel("history")}>ตรวจสอบประวัติ →</button></p></article>
              </div>}

              {pointPanel === "overview" && isAdmin && <div className="monthly-points-panel">
                <div><span>◎</span><p><strong>Points จากการประเมินประจำเดือน</strong><small>{monthlyPointFormulaLabel} · บันทึกซ้ำไม่ได้</small><em>{activePointPolicyLabel}</em></p></div>
                <label><span>เดือนที่ประมวลผล</span><input type="month" value={monthlyPointMonth} onChange={(event) => setMonthlyPointMonth(event.target.value)} /></label>
                <span className="monthly-run-status"><strong>{monthlyPointRecipients}</strong><small>คนได้รับ Points แล้ว</small></span>
                <button disabled={isSaving} onClick={() => void runMonthlyPointCycle()}>{isSaving ? "กำลังประมวลผล..." : "ประมวลผลจากผลประเมิน"}</button>
              </div>}

              {pointPanel === "policies" && <>
              <section className={`organization-policy-center ${isAdmin ? "admin" : "employee"}`}>
                <aside className="organization-policy-list">
                  <div><p><span>§</span><strong>กฎองค์กร</strong><small>{isAdmin ? "ร่างและฉบับที่ประกาศ" : "เฉพาะฉบับที่ประกาศใช้"}</small></p>{isAdmin && <button type="button" onClick={startNewOrganizationPolicy}>+ร่างใหม่</button>}</div>
                  <nav aria-label="รายการกฎองค์กร">
                    {selectedPolicyId === "new" && <button type="button" className="active"><span className="draft">ร่างใหม่</span><strong>{policyDraft.title}</strong><small>ยังไม่บันทึก</small></button>}
                    {visibleOrganizationPolicies.map((policy) => <button type="button" key={policy.id} className={selectedPolicyId !== "new" && selectedOrganizationPolicy?.id === policy.id ? "active" : ""} onClick={() => selectOrganizationPolicy(policy)}><span className={policy.status}>{policy.status === "published" ? "ประกาศแล้ว" : "ฉบับร่าง"}</span><strong>{policy.title}</strong><small>v{policy.version} · {policy.effectiveDate ? `มีผล ${formatDueDate(policy.effectiveDate)}` : "ยังไม่กำหนดวัน"}</small></button>)}
                    {!visibleOrganizationPolicies.length && selectedPolicyId !== "new" && <div className="organization-policy-empty"><span>§</span><strong>{isAdmin ? "ยังไม่มีร่างกฎองค์กร" : "ยังไม่มีกฎที่ประกาศใช้"}</strong><small>{isAdmin ? "เริ่มจากร่างใหม่และใช้แม่แบบตรวจความครบถ้วน" : "HR จะแจ้งเมื่อมีฉบับใหม่"}</small></div>}
                  </nav>
                </aside>

                {isAdmin ? <form className="organization-policy-editor" onSubmit={saveOrganizationPolicy}>
                  <header><div><p className="eyebrow">POLICY WORKSPACE</p><h3>{editingOrganizationPolicy ? `แก้ไข ${editingOrganizationPolicy.title}` : "สร้างร่างกฎองค์กร"}</h3><p>บันทึกเป็นร่างได้ก่อน พนักงานจะเห็นเฉพาะฉบับที่ประกาศแล้ว</p></div>{editingOrganizationPolicy && <span className={editingOrganizationPolicy.status}>{editingOrganizationPolicy.status === "published" ? `ประกาศแล้ว v${editingOrganizationPolicy.version}` : `ฉบับร่าง v${editingOrganizationPolicy.version}`}</span>}</header>
                  {editingOrganizationPolicy?.status === "published" && editingOrganizationPolicy.acknowledgementRequired && <section className="policy-acknowledgement-coverage" aria-label="สถานะการรับทราบกฎองค์กร"><div><p><strong>รับทราบแล้ว {selectedPolicyAcknowledgedEmployeeCount} / พนักงาน active {activeEmployeeCount} คน</strong><small>เวอร์ชัน {editingOrganizationPolicy.version} · {selectedPolicyAcknowledgementCoverage}%</small></p><b>{selectedPolicyAcknowledgementCoverage}%</b></div><span role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={selectedPolicyAcknowledgementCoverage}><i style={{ width: `${selectedPolicyAcknowledgementCoverage}%` }} /></span></section>}
                  <div className="organization-policy-fields">
                    <label className="wide"><span>ชื่อกฎ / ประกาศ</span><input required value={policyDraft.title} onChange={(event) => setPolicyDraft((draft) => ({ ...draft, title: event.target.value }))} /></label>
                    <label className="wide"><span>สรุปสั้นให้พนักงานเข้าใจ</span><input required value={policyDraft.summary} onChange={(event) => setPolicyDraft((draft) => ({ ...draft, summary: event.target.value }))} /></label>
                    <label className="wide"><span>เนื้อหารายละเอียด</span><textarea required value={policyDraft.content} onChange={(event) => setPolicyDraft((draft) => ({ ...draft, content: event.target.value }))} placeholder="ใช้หัวข้อสั้น ภาษาตรงไปตรงมา และระบุช่องทางถามหรือร้องทุกข์" /></label>
                    <label><span>หมวดกฎองค์กร</span><select value={policyDraft.category} disabled={Boolean(editingOrganizationPolicy)} onChange={(event) => { const category = event.target.value as OrganizationPolicyCategory; setPolicyDraft((draft) => ({ ...draft, category, acknowledgementRequired: category === "points_rewards" ? true : draft.acknowledgementRequired })); }}><option value="work_rules">ข้อบังคับการทำงาน</option><option value="points_rewards">Points และรางวัล</option><option value="ai_data">AI และการใช้ข้อมูล</option><option value="other">ประกาศทั่วไป</option></select><small>{editingOrganizationPolicy ? "หมวดถูกล็อกตามสายฉบับ หากต้องการหมวดอื่นให้สร้างร่างใหม่" : "เลือกหมวดก่อนบันทึกครั้งแรก"}</small></label>
                    <label><span>วันที่มีผล</span><input required type="date" value={policyDraft.effectiveDate} onChange={(event) => setPolicyDraft((draft) => ({ ...draft, effectiveDate: event.target.value }))} /></label>
                    <label className={`policy-ack-option ${policyDraft.category === "points_rewards" ? "required" : ""}`}><input type="checkbox" disabled={policyDraft.category === "points_rewards"} checked={policyDraft.category === "points_rewards" || policyDraft.acknowledgementRequired} onChange={(event) => setPolicyDraft((draft) => ({ ...draft, acknowledgementRequired: event.target.checked }))} /><span><strong>ให้พนักงานกดยืนยันรับทราบ</strong><small>{policyDraft.category === "points_rewards" ? "บังคับสำหรับกติกา Points: พนักงานต้องรับทราบฉบับที่มีผลก่อนแลกรางวัล" : "บันทึกบุคคล เวอร์ชัน และเวลาที่รับทราบ"}</small></span></label>
                    <p className="policy-scope-note"><strong>ขอบเขตในหน้านี้:</strong> ร่างใหม่เผยแพร่สำหรับพนักงานทั้งองค์กร ยังไม่เปิดการจำกัดแผนกหรือตำแหน่งในหน้าจอนี้</p>
                  </div>
                  <section className="compliance-review-card">
                    <div><p className="eyebrow">PRE-PUBLISH CHECK</p><h4>{policyDraft.category === "work_rules" ? "แม่แบบตรวจข้อบังคับการทำงาน 8 หัวข้อ" : "ตรวจผู้รับผิดชอบและขอบเขตก่อนประกาศ"}</h4><p>{policyDraft.category === "work_rules" ? "ติ๊กเมื่อตรวจว่าร่างมีเนื้อหาที่จำเป็น รายการนี้ไม่ใช่คำรับรองว่าถูกต้องตามกฎหมาย" : "ตรวจชื่อ ขอบเขต วันที่มีผล ผู้รับผิดชอบ และผลกระทบต่อพนักงานให้ชัดเจนก่อนเผยแพร่"}</p></div>
                    {policyDraft.category === "work_rules" && <div className="compliance-checklist">{complianceChecklistItems.map((item) => <label key={item.id} className={complianceChecklist[item.id] ? "checked" : ""}><input type="checkbox" checked={complianceChecklist[item.id]} onChange={(event) => setComplianceChecklist((items) => ({ ...items, [item.id]: event.target.checked }))} /><span>{complianceChecklist[item.id] ? "✓" : ""}</span><p><strong>{item.title}</strong><small>{item.detail}</small></p></label>)}</div>}
                    <label className="legal-review-confirm"><input type="checkbox" checked={legalReviewConfirmed} onChange={(event) => setLegalReviewConfirmed(event.target.checked)} /><span><strong>ยืนยันว่าส่งให้ HR หรือที่ปรึกษากฎหมายทบทวนแล้ว</strong><small>ระบบช่วยตรวจความครบถ้วนเท่านั้น ไม่ได้รับรองความถูกต้องทางกฎหมาย</small></span></label>
                  </section>
                  <div className="organization-policy-actions"><button type="submit" className="secondary-button" disabled={isSaving}>{isSaving ? "กำลังบันทึก..." : "บันทึกร่าง"}</button><button type="button" className="primary-button" disabled={isSaving || !complianceChecklistComplete || !legalReviewConfirmed} onClick={() => void publishOrganizationPolicy()}>{isSaving ? "กำลังบันทึกและประกาศ..." : "บันทึกล่าสุดและประกาศ"}</button></div>
                </form> : selectedOrganizationPolicy ? <article className="published-policy-viewer">
                  <header><div><span>§</span><div className="policy-title-copy"><small>กฎองค์กร · เวอร์ชัน {selectedOrganizationPolicy.version}</small><h3>{selectedOrganizationPolicy.title}</h3><strong>{selectedOrganizationPolicy.summary}</strong></div></div><b>มีผล {formatDueDate(selectedOrganizationPolicy.effectiveDate)}</b></header>
                  <div className="published-policy-content">{selectedOrganizationPolicy.content}</div>
                  <div className={`policy-acknowledgement-card ${currentPolicyAcknowledgement ? "acknowledged" : "pending"}`}><span>{currentPolicyAcknowledgement ? "✓" : "!"}</span><p><strong>{currentPolicyAcknowledgement ? "คุณรับทราบฉบับนี้แล้ว" : selectedOrganizationPolicy.acknowledgementRequired ? "กฎฉบับนี้รอการรับทราบ" : "ฉบับนี้ไม่ต้องกดยืนยัน"}</strong><small>{currentPolicyAcknowledgement ? `บันทึกเมื่อ ${formatUpdatedAt(currentPolicyAcknowledgement.acknowledgedAt)}` : "การกดยืนยันหมายถึงรับทราบว่ามีเอกสารนี้ ไม่ใช่การสละสิทธิ์หรือยอมรับทุกข้อความ"}</small></p>{selectedOrganizationPolicy.acknowledgementRequired && !currentPolicyAcknowledgement && <button type="button" disabled={isSaving || isEmployeePreview} onClick={() => void acknowledgeOrganizationPolicy()}>{isEmployeePreview ? "โหมดทดลองอ่านอย่างเดียว" : isSaving ? "กำลังบันทึก..." : "ยืนยันว่าได้อ่านและรับทราบ"}</button>}</div>
                </article> : <div className="published-policy-empty"><span>§</span><strong>ยังไม่มีกฎองค์กรที่ประกาศใช้</strong><p>เมื่อ HR ประกาศฉบับใหม่ ระบบจะแสดงที่นี่พร้อมสถานะรับทราบ</p></div>}
              </section>

              <section className="point-balance-charter">
                <div className="point-balance-heading"><div><p className="eyebrow">FAIR POINT ECONOMY</p><h3>Points มีคุณค่า เพราะต้องพิสูจน์และตรวจสอบได้</h3><p>ระบบกำหนดเพดาน ป้องกันการให้ซ้ำ และมอบ Points จากงานหลังหัวหน้าอนุมัติหลักฐานเท่านั้น</p><small className="active-point-policy-label">ฉบับที่มีผล: {activePointPolicyLabel}</small></div><span><strong>{pointEconomyPolicy.monthlyEvaluationMinimumScore}+</strong><small>เกณฑ์รับ Points จากการประเมิน</small></span></div>
                <div className="point-policy-grid">
                  <article><span>01</span><p><strong>มีหลักฐานก่อนรับ Points</strong><small>งาน เควสต์ และโบนัสต้องมีลิงก์หรือไฟล์ แล้วผ่านการตรวจ</small></p></article>
                  <article><span>02</span><p><strong>ไม่มีการรับ Points ซ้ำ</strong><small>งานหนึ่งรายการรับได้ครั้งเดียว เวลาเข้างานบันทึกได้วันละครั้ง</small></p></article>
                  <article><span>03</span><p><strong>มีเพดานที่สมดุล</strong><small>ประเมินสูงสุด {pointEconomyPolicy.monthlyEvaluationCap} Points โบนัสและเควสต์อย่างละ {pointEconomyPolicy.positiveManualEventsPerMonth} ครั้ง/เดือน</small></p></article>
                  <article><span>04</span><p><strong>หัก Points อย่างเป็นธรรม</strong><small>ต้องระบุเหตุผล ผู้บันทึก และเปิดให้ตรวจสอบย้อนหลังได้</small></p></article>
                </div>
                <div className="work-point-matrix">
                  <div><strong>Points มาตรฐานของงาน</strong><small>ระบบคำนวณอัตโนมัติตามประเภทและความสำคัญ</small></div>
                  <div className="work-point-table-scroll"><div className="work-point-table" role="table" aria-label="อัตรา Points มาตรฐานของงาน">
                    <span className="table-head">ประเภท</span><span className="table-head">ทั่วไป</span><span className="table-head">ปานกลาง</span><span className="table-head">สำคัญ</span><span className="table-head">เร่งด่วน</span>
                    {(["task", "request", "mission"] as WorkItemRecord["kind"][]).map((kind) => <div className="work-point-row" role="row" key={kind}><strong>{workKindLabel(kind)}</strong>{(["low", "medium", "high", "urgent"] as WorkItemRecord["priority"][]).map((priority) => <span key={priority}>+{workPointAwards[kind][priority]}</span>)}</div>)}
                  </div></div>
                </div>
                <p className="point-example-line">ตัวอย่างผลประเมิน {monthlyPointExampleScore} คะแนน ได้ {monthlyEvaluationPoints(monthlyPointExampleScore, activePointPolicyRules)} Points · ส่งภารกิจสำคัญพร้อมหลักฐาน ได้ {workPointValue("mission", "high", activePointPolicyRules)} Points · ส่งก่อนกำหนดเพิ่ม {pointEventRules.early_finish.points} Points</p>
              </section>

              <div className="point-rules-section">
                <div className="point-rules-heading"><div><p className="eyebrow">POINT RULES</p><h3>กติกาการได้และเสีย Points</h3></div><small>{activePointPolicyLabel}</small></div>
                <details className="point-rule-group" open><summary><span>+รับ Points และรายการไม่หัก</span><small>เปิดดูรายละเอียด</small></summary><div className="point-rule-grid">
                  {(Object.entries(pointEventRules) as [PointEventType, (typeof pointEventRules)[PointEventType]][]).filter(([, rule]) => rule.points === null || rule.points >= 0).map(([eventType, rule]) => (
                    <article key={eventType} className={rule.points === null || rule.points >= 0 ? "positive" : "negative"}>
                      <span>{rule.points === null ? `${pointEconomyPolicy.monthlyEvaluationMinimumScore}+` : `${rule.points > 0 ? "+" : ""}${formatMoney(rule.points)}`}</span>
                      <div><strong>{rule.label}</strong><p>{eventType === "monthly_evaluation" ? monthlyPointFormulaLabel : rule.description}</p></div>
                    </article>
                  ))}
                </div></details>
                <details className="point-rule-group"><summary><span>−รายการหัก Points</span><small>ต้องมีเหตุผลและตรวจสอบได้</small></summary><div className="point-rule-grid">
                  {(Object.entries(pointEventRules) as [PointEventType, (typeof pointEventRules)[PointEventType]][]).filter(([, rule]) => rule.points !== null && rule.points < 0).map(([eventType, rule]) => <article key={eventType} className="negative"><span>{formatMoney(rule.points ?? 0)}</span><div><strong>{rule.label}</strong><p>{rule.description}</p></div></article>)}
                </div></details>
              </div>
              <div className="points-policy-note"><span>!</span><p><strong>บทลงโทษต้องเป็นธรรมและตรวจสอบได้</strong> การลาที่อนุมัติแล้วไม่หัก Points ส่วนการมาสาย ขาดงาน งานผิดพลาด ใบเตือน และการผิดระเบียบควรบันทึกหลังตรวจสอบข้อเท็จจริง เปิดโอกาสให้พนักงานชี้แจง และใช้ตามนโยบายบริษัท</p></div>
              </>}

              {pointPanel === "adjust" && permissions.canReviewWork && <div className="point-admin-grid single-panel">
                <form className="point-event-form" onSubmit={recordPointEvent}>
                  <div><p className="eyebrow">NEW POINT EVENT</p><h3>บันทึก Points หรือบทลงโทษ</h3><small>รายการหัก Points ต้องมีเหตุผลเพื่อให้ตรวจสอบย้อนหลังได้</small></div>
                  <div className={`point-event-preview ${selectedPointEventRule.points !== null && selectedPointEventRule.points < 0 ? "negative" : "positive"}`}><span>{selectedPointEventRule.points === null ? "—" : `${selectedPointEventRule.points >= 0 ? "+" : ""}${selectedPointEventRule.points}`}</span><p><strong>{selectedPointEventRule.label}</strong><small>{selectedPointEventRule.description}</small></p></div>
                  <div className="point-event-form-grid">
                    <label><span>พนักงาน</span><select required value={pointEventForm.employeeId} onChange={(event) => setPointEventForm((form) => ({ ...form, employeeId: event.target.value }))}>{employees.filter((employee) => employee.status === "active").map((employee) => <option key={employee.id} value={employee.id}>{employee.name} · {getRole(employee.roleId).shortName}</option>)}</select></label>
                    <label><span>ประเภทเหตุการณ์</span><select value={selectedPointEventType} onChange={(event) => setPointEventForm((form) => ({ ...form, eventType: event.target.value as PointEventType }))}>{availableManualPointEventTypes.map((eventType) => <option key={eventType} value={eventType}>{pointEventRules[eventType].label} ({(pointEventRules[eventType].points ?? 0) > 0 ? "+" : ""}{pointEventRules[eventType].points ?? 0})</option>)}</select></label>
                    <label><span>วันที่เกิดเหตุการณ์</span><input required type="date" value={pointEventForm.eventDate} onChange={(event) => setPointEventForm((form) => ({ ...form, eventDate: event.target.value }))} /></label>
                    <label><span>ลิงก์หลักฐาน {selectedPointEventRule.requiresEvidence ? "(จำเป็น)" : "(ถ้ามี)"}</span><input required={selectedPointEventRule.requiresEvidence} type="url" value={pointEventForm.evidenceUrl} onChange={(event) => setPointEventForm((form) => ({ ...form, evidenceUrl: event.target.value }))} placeholder="https://..." /></label>
                    <label className="wide"><span>เหตุผล / รายละเอียด</span><textarea required value={pointEventForm.note} onChange={(event) => setPointEventForm((form) => ({ ...form, note: event.target.value }))} placeholder="ระบุข้อเท็จจริง ผลกระทบ และเอกสารอ้างอิง โดยหลีกเลี่ยงข้อมูลส่วนบุคคลที่ไม่จำเป็น" /></label>
                  </div>
                  <button className={selectedPointEventRule.points !== null && selectedPointEventRule.points < 0 ? "penalty" : ""} disabled={isSaving}>{isSaving ? "กำลังบันทึก..." : selectedPointEventRule.points !== null && selectedPointEventRule.points < 0 ? `ยืนยันหัก ${Math.abs(selectedPointEventRule.points)} Points` : `บันทึก ${selectedPointEventRule.points ?? 0} Points`}</button>
                </form>
              </div>}

              {pointPanel === "history" && <div className="point-admin-grid single-panel">
                <section className="point-ledger-panel">
                  <div className="point-ledger-heading"><div><p className="eyebrow">AUDIT LEDGER</p><h3>ประวัติ Points ล่าสุด</h3></div>{!isEmployeeUser && <label><span className="sr-only">กรองประวัติ Points ตามพนักงาน</span><select value={pointHistoryEmployeeId} onChange={(event) => setPointHistoryEmployeeId(event.target.value)}><option value="all">พนักงานทั้งหมด</option>{employees.filter((employee) => employee.status === "active").map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>}</div>
                  <div className="point-ledger-list">
                    {visiblePointLedger.slice(0, 12).map((entry) => {
                      const employee = employeesById.get(entry.employeeId);
                      return <article key={entry.id}><span className={entry.points >= 0 ? "positive" : "negative"}>{entry.points >= 0 ? "+" : ""}{formatMoney(entry.points)}</span><p><strong>{entry.note}</strong><small>{employee?.name ?? "พนักงาน"} · {formatUpdatedAt(entry.createdAt)}</small></p><b>{entry.sourceType === "evaluation" ? "ประเมิน" : entry.sourceType === "attendance" ? "เวลาเข้างาน" : entry.sourceType === "deadline" ? "กำหนดส่ง" : entry.sourceType === "quality" ? "คุณภาพงาน" : entry.sourceType === "discipline" ? "วินัย" : entry.sourceType === "redemption" ? "แลกรางวัล" : entry.sourceType === "quest" || entry.sourceType === "mission" ? "เควสต์" : "ผลงาน"}</b></article>;
                    })}
                    {!visiblePointLedger.length && <div className="point-ledger-empty"><span>★</span><strong>ยังไม่มีประวัติ Points</strong><p>บันทึกเหตุการณ์หรือประมวลผล Points รายเดือนเพื่อเริ่มต้น</p></div>}
                  </div>
                </section>
              </div>}
            </section>}

            {workSection === "rewards" && <section className="reward-center-card">
              <div className="reward-center-heading">
                <div><p className="eyebrow">REWARD STORE</p><h2>{canManageRewardCatalog ? "จัดการรางวัลขององค์กร" : "สะสม Points แลกกิฟต์วอเชอร์และรางวัล"}</h2><p>{canManageRewardCatalog ? "สร้างและกำหนดราคา Points จำนวนสิทธิ์ หมวด และสถานะของรางวัล ส่วนรายการที่นำออกจะยังเก็บประวัติคำขอเดิมไว้" : "ราคา สต็อก โควตารายเดือน ระยะเว้น และยอดคงเหลือจะตรวจตามกติกาฉบับที่มีผลก่อนส่งคำขอ"}</p></div>
                <div className="reward-center-heading-actions"><span><strong>{formatMoney(totalPoints)}</strong> Points ในระบบ</span>{canManageRewardCatalog && <button type="button" onClick={() => openRewardEditor()}><span aria-hidden="true">＋</span> สร้างรางวัล</button>}</div>
              </div>
              <div className="reward-center-grid">
                <div className="reward-catalog">
                  {rewardCatalog.map((reward) => <article key={reward.id} className={reward.isActive ? "" : "inactive"}>
                    <span className={`reward-icon ${reward.category}`}>{reward.icon}</span>
                    <div><b>{reward.title}</b><p>{reward.description}</p><small>{reward.isActive ? `เหลือ ${reward.stock} สิทธิ์` : "นำออกจากร้านแล้ว"}{canManageRewardCatalog ? ` · ${rewardCategoryMeta[reward.category].label}` : ""}</small></div>
                    <div className="reward-cost"><strong>{formatMoney(reward.costPoints)}</strong><small>Points</small><button type="button" disabled={isEmployeePreview || !reward.isActive || reward.stock <= 0} onClick={() => { setRewardToRedeem(reward); setRewardEmployeeId(isAdmin ? leaderboard[0]?.employee.id ?? employees[0]?.id ?? "" : currentUser?.employeeId ?? ""); }}>{isEmployeePreview ? "ทดลองดู" : !reward.isActive ? "ปิดใช้งาน" : reward.stock > 0 ? "แลกรางวัล" : "หมดแล้ว"}</button></div>
                    {canManageRewardCatalog && <div className="reward-admin-actions" aria-label={`จัดการรางวัล ${reward.title}`}><button type="button" onClick={() => openRewardEditor(reward)}>แก้ไข</button><button type="button" className="delete" disabled={isSaving || !reward.isActive} onClick={() => void deleteReward(reward)}>{reward.isActive ? "ลบรางวัล" : "นำออกแล้ว"}</button></div>}
                  </article>)}
                  {!rewardCatalog.length && <div className="reward-catalog-empty"><span aria-hidden="true">★</span><strong>{canManageRewardCatalog ? "ยังไม่มีรางวัลในระบบ" : "ยังไม่มีรางวัลที่เปิดให้แลก"}</strong><p>{canManageRewardCatalog ? "กด “สร้างรางวัล” เพื่อกำหนดราคา Points และจำนวนสิทธิ์" : "HR / Admin จะประกาศรางวัลใหม่ในหน้านี้"}</p></div>}
                </div>
                <aside className="redemption-history">
                  <div><p className="eyebrow">REDEMPTION REQUESTS</p><h3>{isAdmin ? "ตรวจและอัปเดตคำขอ" : "สถานะคำขอของฉัน"}</h3><small>{isAdmin ? "ยกเลิกแล้วระบบจะคืน Points และสต็อกตามกติกา" : "ติดตามตั้งแต่รออนุมัติจนส่งมอบรางวัล"}</small></div>
                  {rewardRedemptions.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8).map((redemption) => {
                    const employee = employeesById.get(redemption.employeeId);
                    const reward = rewards.find((item) => item.id === redemption.rewardId);
                    const historicalRewardTitle = historicalRewardTitlesByRedemption.get(redemption.id) ?? reward?.title ?? "รางวัล";
                    return <article key={redemption.id} className={`redemption-request status-${redemption.status}`}><span>★</span><p><strong>{historicalRewardTitle}</strong><small>{employee?.name ?? "พนักงาน"} · {formatUpdatedAt(redemption.createdAt)}</small></p><div className="redemption-request-state"><b>{redemption.status === "cancelled" ? `คืน +${formatMoney(redemption.pointsSpent)}` : `-${formatMoney(redemption.pointsSpent)}`}</b><em>{rewardRedemptionStatusLabel(redemption.status)}</em></div>{isAdmin && (redemption.status === "requested" || redemption.status === "approved") && <div className="redemption-request-actions">{redemption.status === "requested" && <button type="button" disabled={isSaving} onClick={() => void updateRewardRedemption(redemption, "approved")}>อนุมัติคำขอ</button>}{redemption.status === "approved" && <button type="button" disabled={isSaving} onClick={() => void updateRewardRedemption(redemption, "fulfilled")}>ยืนยันส่งมอบแล้ว</button>}<button type="button" className="cancel" disabled={isSaving} onClick={() => void updateRewardRedemption(redemption, "cancelled")}>ยกเลิก / คืน Points</button></div>}</article>;
                  })}
                  {!rewardRedemptions.length && <div className="reward-empty"><span>★</span><strong>ยังไม่มีคำขอแลก</strong><p>เลือกรางวัล แล้วระบุพนักงานที่ต้องการใช้ Points</p></div>}
                </aside>
              </div>
            </section>}
          </section>
        )}
      </section>

      <footer><span>PEOPLE PULSE</span><p>งาน · KPI · สกิล · เวลาเข้างาน · แฟ้มผลงาน · Points และรางวัล</p></footer>

      {showOrganizationDocumentForm && permissions.canManageOrganizationDocuments && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowOrganizationDocumentForm(false)}>
          <form className="organization-document-modal" onSubmit={saveOrganizationDocument} role="dialog" aria-modal="true" aria-labelledby="organization-document-form-title" aria-describedby="organization-document-form-description">
            <header className="organization-record-modal-hero"><span aria-hidden="true">▤</span><div><p className="eyebrow">NEW ORGANIZATION DOCUMENT</p><h2 id="organization-document-form-title">เพิ่มเอกสารเข้าคลังองค์กร</h2><p id="organization-document-form-description">บันทึกข้อมูลกำกับและอัปโหลดไฟล์จริง เพื่อให้ค้นหาเวอร์ชันและผู้รับผิดชอบได้ง่าย</p></div><button type="button" className="modal-close dark" onClick={() => setShowOrganizationDocumentForm(false)} aria-label="ปิดหน้าต่างเพิ่มเอกสาร">×</button></header>
            <div className="organization-record-modal-body">
              <div className="organization-record-form-grid">
                <label className="wide"><span>ชื่อเอกสาร</span><input autoFocus required value={organizationDocumentForm.title} onChange={(event) => setOrganizationDocumentForm((form) => ({ ...form, title: event.target.value }))} placeholder="เช่น สัญญาเช่าสำนักงานใหญ่" /></label>
                <label className="wide"><span>คำอธิบาย <em>ไม่บังคับ</em></span><textarea value={organizationDocumentForm.description} onChange={(event) => setOrganizationDocumentForm((form) => ({ ...form, description: event.target.value }))} placeholder="สรุปว่าเอกสารนี้ใช้กับใคร เรื่องใด และเมื่อใด" /></label>
                <label><span>หมวดเอกสาร</span><select value={organizationDocumentForm.category} onChange={(event) => setOrganizationDocumentForm((form) => ({ ...form, category: event.target.value as OrganizationDocumentCategory }))}>{(Object.entries(organizationDocumentCategoryMeta) as [OrganizationDocumentCategory, (typeof organizationDocumentCategoryMeta)[OrganizationDocumentCategory]][]).map(([category, meta]) => <option key={category} value={category}>{meta.label}</option>)}</select></label>
                <label><span>สถานะเริ่มต้น</span><select value={organizationDocumentForm.status} onChange={(event) => setOrganizationDocumentForm((form) => ({ ...form, status: event.target.value as "draft" | "active" }))}><option value="draft">{organizationDocumentStatusLabels.draft}</option><option value="active">{organizationDocumentStatusLabels.active}</option></select></label>
                <label><span>เลขที่เอกสาร</span><input required value={organizationDocumentForm.documentNumber} onChange={(event) => setOrganizationDocumentForm((form) => ({ ...form, documentNumber: event.target.value }))} placeholder="เช่น LEG-LEASE-001" /></label>
                <label><span>เวอร์ชัน</span><input required value={organizationDocumentForm.version} onChange={(event) => setOrganizationDocumentForm((form) => ({ ...form, version: event.target.value }))} placeholder="1.0" /></label>
                <label className="wide"><span>เจ้าของเอกสาร / ผู้รับผิดชอบ</span><input required value={organizationDocumentForm.owner} onChange={(event) => setOrganizationDocumentForm((form) => ({ ...form, owner: event.target.value }))} /></label>
                <label><span>วันที่มีผล</span><input required type="date" value={organizationDocumentForm.effectiveDate} onChange={(event) => setOrganizationDocumentForm((form) => ({ ...form, effectiveDate: event.target.value }))} /></label>
                <label><span>วันหมดอายุ <em>ไม่บังคับ</em></span><input type="date" min={organizationDocumentForm.effectiveDate} value={organizationDocumentForm.expiryDate} onChange={(event) => setOrganizationDocumentForm((form) => ({ ...form, expiryDate: event.target.value }))} /></label>
                <label className="wide"><span>หมายเหตุ</span><textarea value={organizationDocumentForm.note} onChange={(event) => setOrganizationDocumentForm((form) => ({ ...form, note: event.target.value }))} placeholder="ขอบเขตการใช้ คู่สัญญา หรือสิ่งที่ต้องตรวจในรอบถัดไป" /></label>
                <label className="wide organization-record-file"><span>ไฟล์เอกสาร</span><input required type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={(event) => setOrganizationDocumentFile(event.target.files?.[0] ?? null)} /><small>{organizationDocumentFile ? `${organizationDocumentFile.name} · ${formatFileSize(organizationDocumentFile.size)}` : "รองรับ PDF, Word, JPG และ PNG ขนาดไม่เกิน 10 MB"}</small></label>
              </div>
              <div className="organization-record-review-note"><span>!</span><p><strong>ตรวจไฟล์และเวอร์ชันก่อนเปิดใช้งาน</strong><small>ระบบไม่มีปุ่มลบถาวร หากยังตรวจไม่ครบให้บันทึกเป็น “ฉบับร่าง” แล้วเปลี่ยนสถานะภายหลัง</small></p></div>
            </div>
            <div className="modal-actions organization-record-modal-actions"><button type="button" className="secondary-button" onClick={() => setShowOrganizationDocumentForm(false)}>ยกเลิก</button><button className="primary-button" disabled={isSaving || !organizationDocumentFile}>{isSaving ? "กำลังอัปโหลด..." : "เพิ่มเอกสาร"}</button></div>
          </form>
        </div>
      )}

      {showEmployeeWarningForm && profileEmployee && permissions.canManageEmployeeWarnings && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowEmployeeWarningForm(false)}>
          <form className="employee-warning-modal" onSubmit={saveEmployeeWarning} role="dialog" aria-modal="true" aria-labelledby="employee-warning-form-title" aria-describedby="employee-warning-form-description">
            <header className="organization-record-modal-hero warning"><span aria-hidden="true">!</span><div><p className="eyebrow">EMPLOYEE WARNING RECORD</p><h2 id="employee-warning-form-title">บันทึกใบเตือนของ {profileEmployee.name}</h2><p id="employee-warning-form-description">บันทึกข้อเท็จจริง แนวทางปรับปรุง และเอกสารประกอบอย่างตรวจสอบได้</p></div><button type="button" className="modal-close dark" onClick={() => setShowEmployeeWarningForm(false)} aria-label="ปิดหน้าต่างเพิ่มใบเตือน">×</button></header>
            <div className="organization-record-modal-body">
              <div className="organization-record-form-grid">
                <label><span>ระดับใบเตือน</span><select value={employeeWarningForm.level} onChange={(event) => setEmployeeWarningForm((form) => ({ ...form, level: event.target.value as EmployeeWarningLevel }))}>{(Object.entries(employeeWarningLevelLabels) as [EmployeeWarningLevel, string][]).map(([level, label]) => <option key={level} value={level}>{label}</option>)}</select></label>
                <label><span>สถานะเริ่มต้น</span><select value={employeeWarningForm.status} onChange={(event) => setEmployeeWarningForm((form) => ({ ...form, status: event.target.value as "draft" | "issued" }))}><option value="draft">เก็บเป็นฉบับร่าง</option><option value="issued">ออกเอกสารแล้ว</option></select></label>
                <label className="wide"><span>เลขที่ใบเตือน <em>ไม่บังคับ</em></span><input maxLength={80} value={employeeWarningForm.warningNumber} onChange={(event) => setEmployeeWarningForm((form) => ({ ...form, warningNumber: event.target.value }))} placeholder="เว้นว่างเพื่อให้ระบบสร้างเลขที่อัตโนมัติ" /></label>
                <label className="wide"><span>หัวข้อ</span><input autoFocus required value={employeeWarningForm.subject} onChange={(event) => setEmployeeWarningForm((form) => ({ ...form, subject: event.target.value }))} placeholder="ระบุเรื่องให้สั้นและตรงกับข้อเท็จจริง" /></label>
                <label><span>วันที่เกิดเหตุ</span><input required type="date" value={employeeWarningForm.incidentDate} onChange={(event) => setEmployeeWarningForm((form) => ({ ...form, incidentDate: event.target.value }))} /></label>
                <label><span>วันที่ออกเอกสาร</span><input required type="date" min={employeeWarningForm.incidentDate} aria-invalid={warningIssueDateInvalid} aria-describedby={warningIssueDateInvalid ? "warning-issued-date-error" : undefined} value={employeeWarningForm.issuedDate} onChange={(event) => setEmployeeWarningForm((form) => ({ ...form, issuedDate: event.target.value }))} />{warningIssueDateInvalid && <small id="warning-issued-date-error" className="form-error-message" role="alert">วันที่ออกเอกสารต้องไม่ก่อนวันที่เกิดเหตุ</small>}</label>
                <label className="wide"><span>รายละเอียดข้อเท็จจริง</span><textarea required value={employeeWarningForm.facts} onChange={(event) => setEmployeeWarningForm((form) => ({ ...form, facts: event.target.value }))} placeholder="บันทึกเหตุการณ์ วันเวลา และข้อมูลอ้างอิงโดยใช้ภาษาที่เป็นกลาง" /></label>
                <label className="wide"><span>สิ่งที่ต้องปรับปรุง / แนวทางแก้ไข</span><textarea required value={employeeWarningForm.correctiveAction} onChange={(event) => setEmployeeWarningForm((form) => ({ ...form, correctiveAction: event.target.value }))} placeholder="ระบุพฤติกรรมหรือผลลัพธ์ที่คาดหวังให้ชัดเจน" /></label>
                <label><span>วันติดตามผล <em>ไม่บังคับ</em></span><input type="date" min={employeeWarningForm.issuedDate} value={employeeWarningForm.reviewDate} onChange={(event) => setEmployeeWarningForm((form) => ({ ...form, reviewDate: event.target.value }))} /></label>
                <label><span>ไฟล์หนังสือ <em>ไม่บังคับ</em></span><input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={(event) => setEmployeeWarningFile(event.target.files?.[0] ?? null)} /></label>
                <label className="wide"><span>คำชี้แจงของพนักงาน <em>ไม่บังคับ</em></span><textarea value={employeeWarningForm.employeeStatement} onChange={(event) => setEmployeeWarningForm((form) => ({ ...form, employeeStatement: event.target.value }))} placeholder="บันทึกตามคำชี้แจง โดยไม่ตีความแทนพนักงาน" /></label>
              </div>
              <div className="warning-consent-note"><span>i</span><p><strong>การรับทราบไม่เท่ากับการยอมรับผิด</strong><small>การสร้างใบเตือนไม่หัก Points อัตโนมัติ และควรเปิดโอกาสให้พนักงานชี้แจงก่อนดำเนินการตามระเบียบ</small></p></div>
            </div>
            <div className="modal-actions organization-record-modal-actions"><button type="button" className="secondary-button" onClick={() => setShowEmployeeWarningForm(false)}>ยกเลิก</button><button className="primary-button" disabled={isSaving || warningIssueDateInvalid}>{isSaving ? "กำลังบันทึก..." : employeeWarningForm.status === "issued" ? "บันทึกและออกเอกสาร" : "บันทึกฉบับร่าง"}</button></div>
          </form>
        </div>
      )}

      {showEmployeeRecognitionForm && profileEmployee && permissions.canManageEmployeeRecognitions && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowEmployeeRecognitionForm(false)}>
          <form className="employee-recognition-modal" onSubmit={saveEmployeeRecognition} role="dialog" aria-modal="true" aria-labelledby="employee-recognition-form-title" aria-describedby="employee-recognition-form-description">
            <header className="organization-record-modal-hero recognition"><span aria-hidden="true">★</span><div><p className="eyebrow">RECOGNITION &amp; CREDENTIAL</p><h2 id="employee-recognition-form-title">เพิ่มผลงานเด่นของ {profileEmployee.name}</h2><p id="employee-recognition-form-description">เก็บเกียรติบัตร รางวัล ใบรับรอง และข้อมูลตรวจสอบไว้ในแฟ้มเดียว</p></div><button type="button" className="modal-close dark" onClick={() => setShowEmployeeRecognitionForm(false)} aria-label="ปิดหน้าต่างเพิ่มเกียรติบัตรหรือรางวัล">×</button></header>
            <div className="organization-record-modal-body">
              <div className="organization-record-form-grid">
                <label><span>ประเภท</span><select value={employeeRecognitionForm.recognitionType} onChange={(event) => setEmployeeRecognitionForm((form) => ({ ...form, recognitionType: event.target.value as EmployeeRecognitionType }))}>{(Object.entries(employeeRecognitionTypeLabels) as [EmployeeRecognitionType, string][]).map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select></label>
                <label><span>วันที่ได้รับ</span><input required type="date" value={employeeRecognitionForm.issuedDate} onChange={(event) => setEmployeeRecognitionForm((form) => ({ ...form, issuedDate: event.target.value }))} /></label>
                <label className="wide"><span>ชื่อเกียรติบัตร / รางวัล</span><input autoFocus required value={employeeRecognitionForm.title} onChange={(event) => setEmployeeRecognitionForm((form) => ({ ...form, title: event.target.value }))} /></label>
                <label className="wide"><span>องค์กรหรือผู้ออก</span><input required value={employeeRecognitionForm.issuer} onChange={(event) => setEmployeeRecognitionForm((form) => ({ ...form, issuer: event.target.value }))} /></label>
                <label><span>วันหมดอายุ <em>ไม่บังคับ</em></span><input type="date" min={employeeRecognitionForm.issuedDate} value={employeeRecognitionForm.expiryDate} onChange={(event) => setEmployeeRecognitionForm((form) => ({ ...form, expiryDate: event.target.value }))} /></label>
                <label><span>Credential ID <em>ไม่บังคับ</em></span><input value={employeeRecognitionForm.credentialId} onChange={(event) => setEmployeeRecognitionForm((form) => ({ ...form, credentialId: event.target.value }))} /></label>
                <label className="wide"><span>ลิงก์ตรวจสอบ <em>ไม่บังคับ</em></span><input type="url" value={employeeRecognitionForm.verificationUrl} onChange={(event) => setEmployeeRecognitionForm((form) => ({ ...form, verificationUrl: event.target.value }))} placeholder="https://..." /></label>
                <label className="wide"><span>รายละเอียด</span><textarea value={employeeRecognitionForm.description} onChange={(event) => setEmployeeRecognitionForm((form) => ({ ...form, description: event.target.value }))} placeholder="ผลงานหรือเกณฑ์ที่ได้รับการยอมรับ" /></label>
                <label className="wide"><span>ไฟล์หลักฐาน <em>ไม่บังคับ</em></span><input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(event) => setEmployeeRecognitionFile(event.target.files?.[0] ?? null)} /><small>{employeeRecognitionFile ? `${employeeRecognitionFile.name} · ${formatFileSize(employeeRecognitionFile.size)}` : "รองรับ PDF, JPG และ PNG"}</small></label>
              </div>
            </div>
            <div className="modal-actions organization-record-modal-actions"><button type="button" className="secondary-button" onClick={() => setShowEmployeeRecognitionForm(false)}>ยกเลิก</button><button className="primary-button" disabled={isSaving}>{isSaving ? "กำลังบันทึก..." : "เพิ่มในแฟ้มพนักงาน"}</button></div>
          </form>
        </div>
      )}

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

      {contractToSign && contractSigningEmployee && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setContractToSign(null)}>
          <form className="signature-modal" onSubmit={signEmploymentContract} role="dialog" aria-modal="true" aria-labelledby="signature-title">
            <div className="signature-hero"><span>✎</span><div><p className="eyebrow">PILOT CONTRACT WORKFLOW</p><h2 id="signature-title">ทดสอบขั้นตอนยืนยันสัญญา</h2><p>{contractToSign.title} · เวอร์ชัน {contractToSign.version}</p></div><button type="button" className="modal-close dark" onClick={() => setContractToSign(null)} aria-label="ปิดหน้าต่าง">×</button></div>
            <div className="signature-body">
              <div className="contract-sign-summary"><span><small>ผู้ลงนาม</small><strong>{contractSigningEmployee.name}</strong></span><span><small>วันที่มีผล</small><strong>{new Date(`${contractToSign.effectiveDate}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })}</strong></span></div>
              <label className="signature-name-field"><span>พิมพ์ชื่อ–นามสกุลให้ตรงกับโปรไฟล์</span><input required value={signatureForm.signedName} onChange={(event) => setSignatureForm((form) => ({ ...form, signedName: event.target.value }))} /><em>{signatureForm.signedName || "ชื่อผู้ลงนาม"}</em></label>
              <label className="signature-consent"><input type="checkbox" checked={signatureForm.consent} onChange={(event) => setSignatureForm((form) => ({ ...form, consent: event.target.checked }))} /><span><strong>ยืนยันการทดสอบขั้นตอน</strong> ข้าพเจ้าได้อ่านเอกสารและยืนยันใช้ชื่อที่พิมพ์เพื่อทดสอบ workflow ใน Pilot โดยรับทราบว่ายังไม่ใช่ลายเซ็นอิเล็กทรอนิกส์สำหรับยืนยันผลทางกฎหมาย</span></label>
              <div className="signature-audit"><span>⌁</span><p><strong>ข้อจำกัด:</strong> ระบบจะบันทึกบัญชี ชื่อ คำยินยอม และเวลา แต่ยังไม่ผูก hash กับไฟล์เอกสาร จึงห้ามใช้รายการนี้แทนบริการลงนามที่ผ่านการตรวจด้านกฎหมายและความน่าเชื่อถือ</p></div>
            </div>
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setContractToSign(null)}>ยกเลิก</button><button className="primary-button" disabled={isSaving || !signatureForm.consent || signatureForm.signedName.trim() !== contractSigningEmployee.name.trim()}>{isSaving ? "กำลังบันทึก..." : "ยืนยันขั้นตอน (Pilot)"}</button></div>
          </form>
        </div>
      )}

      {questToFulfill && permissions.canManageQuests && !isEmployeePreview && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeQuestFulfillment()}>
          <form className="quest-fulfillment-modal" onSubmit={completeQuestForEmployee} role="dialog" aria-modal="true" aria-labelledby="quest-fulfillment-title" aria-describedby="quest-fulfillment-description">
            <header className="quest-fulfillment-hero">
              <span className={`quest-form-icon ${questToFulfill.type}`} aria-hidden="true">{questTypeMeta[questToFulfill.type].icon}</span>
              <div><p className="eyebrow">VERIFIED QUEST RESULT</p><h2 id="quest-fulfillment-title">ตรวจผลและมอบสิทธิ์</h2><p id="quest-fulfillment-description">ยืนยันผู้สำเร็จเควส “{questToFulfill.title}” จากหลักฐานจริง ระบบจะมอบสิทธิ์หนึ่งครั้งต่อคน</p></div>
              <button type="button" className="modal-close dark" onClick={closeQuestFulfillment} aria-label="ปิดหน้าต่างตรวจผลเควส">×</button>
              <div className="quest-fulfillment-preview">
                <span><small>Points ที่มอบจริง</small><strong>★ {formatMoney(questToFulfill.pointsReward)}</strong></span>
                <span><small>รางวัลจาก snapshot</small><strong>{questToFulfill.rewardId ? `${questToFulfill.rewardIconSnapshot || "♢"} ${questToFulfill.rewardTitleSnapshot}` : "ไม่มีรางวัลพิเศษ"}</strong></span>
                <span><small>มอบแล้ว</small><strong>{selectedQuestCompletions.length} คน</strong></span>
              </div>
            </header>
            <div className="quest-fulfillment-body">
              <div className="quest-fulfillment-grid">
                <label className="wide"><span>พนักงานที่ผ่านเควส</span><select autoFocus required value={questCompletionForm.employeeId} onChange={(event) => setQuestCompletionForm((form) => ({ ...form, employeeId: event.target.value }))}><option value="">เลือกพนักงาน</option>{selectedQuestEligibleEmployees.map((employee) => { const role = getRole(employee.roleId); return <option key={employee.id} value={employee.id}>{employee.name} · {role.department} · {role.shortName}</option>; })}</select><small>แสดงเฉพาะพนักงานที่ทำงานอยู่ ตรงขอบเขตเควส ยังไม่เคยรับสิทธิ์ และไม่ใช่ผู้ตรวจเอง</small></label>
                <label><span>วันที่ทำสำเร็จ</span><input required type="date" min={questCompletionMinDate} max={questCompletionMaxDate} disabled={questCompletionMinDate > questCompletionMaxDate} value={questCompletionForm.completionDate} onChange={(event) => setQuestCompletionForm((form) => ({ ...form, completionDate: event.target.value }))} /><small>อยู่ในช่วงเควส ไม่เกินวันนี้ และย้อนหลังได้ไม่เกิน 90 วัน</small></label>
                <label><span>Points ที่ระบบจะเพิ่ม</span><input readOnly aria-readonly="true" value={`${formatMoney(questToFulfill.pointsReward)} Points`} /><small>ใช้จำนวนตามเควสแบบตรงตัว ระบบจะไม่ปรับลดให้อัตโนมัติ</small></label>
                <label className="wide"><span>ลิงก์หลักฐาน HTTPS</span><input required type="url" inputMode="url" pattern="https://.*" maxLength={1200} value={questCompletionForm.evidenceUrl} onChange={(event) => setQuestCompletionForm((form) => ({ ...form, evidenceUrl: event.target.value }))} placeholder="https://drive.google.com/..." aria-describedby="quest-fulfillment-evidence-help" /><small id="quest-fulfillment-evidence-help">ต้องเป็นลิงก์ https:// ที่ผู้ตรวจเปิดดูผลงานหรือหลักฐานได้</small>{questCompletionForm.evidenceUrl && questCompletionEvidenceInvalid && <small className="quest-form-error" role="alert">ลิงก์หลักฐานต้องขึ้นต้นด้วย https:// และเป็น URL ที่ถูกต้อง</small>}</label>
                <label className="wide"><span>บันทึกผลการตรวจ</span><textarea required maxLength={1000} value={questCompletionForm.note} onChange={(event) => setQuestCompletionForm((form) => ({ ...form, note: event.target.value }))} placeholder="ระบุเกณฑ์ที่ผ่าน สิ่งที่ตรวจพบ และเหตุผลที่อนุมัติสิทธิ์นี้" /><small>บันทึกนี้จะเก็บกับประวัติการมอบสิทธิ์เพื่อใช้อ้างอิงภายหลัง · ไม่เกิน 1,000 ตัวอักษร</small></label>
              </div>

              {!selectedQuestEligibleEmployees.length && <div className="quest-fulfillment-alert" role="status"><span aria-hidden="true">i</span><p><strong>ไม่มีพนักงานที่พร้อมรับสิทธิ์เพิ่ม</strong><small>ผู้เข้าร่วมอาจได้รับสิทธิ์ครบแล้ว ไม่มีพนักงานที่ยังทำงานในขอบเขต หรือบัญชีผู้ตรวจเป็นผู้เข้าร่วมเพียงคนเดียว</small></p></div>}
              {questCompletionDateInvalid && <div className="quest-fulfillment-alert error" role="alert"><span aria-hidden="true">!</span><p><strong>วันที่อยู่นอกช่วงที่อนุญาต</strong><small>เลือกวันที่ตั้งแต่ {formatDueDate(questCompletionMinDate)} ถึง {formatDueDate(questCompletionMaxDate)} หากเควสเก่ากว่า 90 วัน ระบบจะไม่อนุญาตให้บันทึกย้อนหลัง</small></p></div>}
              {!questCompletionPolicy && <div className="quest-fulfillment-alert error" role="alert"><span aria-hidden="true">!</span><p><strong>ไม่มีนโยบาย Points ที่ใช้กับวันที่ทำสำเร็จ</strong><small>ยังมอบสิทธิ์ไม่ได้ กรุณาเผยแพร่กฎ Points ที่ครอบคลุมวันที่ {formatDueDate(questCompletionForm.completionDate)} แล้วลองใหม่</small></p></div>}
              {questCompletionPolicy && !questCompletionPolicyAllowsAdminCompletion && <div className="quest-fulfillment-alert error" role="alert"><span aria-hidden="true">!</span><p><strong>นโยบายในวันที่เลือกไม่อนุญาตให้ Admin มอบสิทธิ์จากเควส</strong><small>กฎเควสต้องเป็นแบบ manual, ระบุ Admin เป็นผู้มีสิทธิ์ และกำหนดโควตา Points บวกแบบ manual อย่างน้อย 1 ครั้งต่อเดือน</small></p></div>}
              {questCompletionPolicy && questCompletionPointsInvalid && <div className="quest-fulfillment-alert error" role="alert"><span aria-hidden="true">!</span><p><strong>Points ของเควสเกินเพดานนโยบายในวันที่เลือก</strong><small>เควสกำหนด {formatMoney(questToFulfill.pointsReward)} Points แต่กฎอนุญาตสูงสุด {formatMoney(questCompletionPointLimit)} Points ระบบจะไม่ตัดคะแนนลงเอง กรุณาแก้จำนวนในเควสก่อนตรวจผล</small></p></div>}
              {questCompletionPolicy && questCompletionMonthlyLimitReached && <div className="quest-fulfillment-alert error" role="alert"><span aria-hidden="true">!</span><p><strong>พนักงานได้รับ Points จากเควสครบโควตาเดือนนี้แล้ว</strong><small>มีประวัติ {questCompletionMonthlyCount} ครั้ง จากเพดาน {questCompletionMonthlyLimit} ครั้งในเดือน {questCompletionMonth}</small></p></div>}
              {questCompletionPolicy && questCompletionStandardCapExceeded && <div className="quest-fulfillment-alert error" role="alert"><span aria-hidden="true">!</span><p><strong>การมอบครั้งนี้จะเกินเพดาน Points บวกมาตรฐานรายเดือน</strong><small>หลังมอบจะเป็น {formatMoney(questCompletionProjectedStandardPoints)} Points แต่กฎกำหนดสูงสุด {formatMoney(questCompletionStandardCap)} Points ระบบจะไม่มอบเพียงบางส่วน</small></p></div>}
              {questCompletionRewardUnavailable && <div className="quest-fulfillment-alert error" role="alert"><span aria-hidden="true">!</span><p><strong>รางวัลที่ประกาศปิดอยู่หรือหมดสต็อก</strong><small>เปิดรางวัลและเติมสต็อก “{questToFulfill.rewardTitleSnapshot}” ก่อน จึงจะมอบ Points และรางวัลพร้อมกันได้</small></p></div>}

              <div className="quest-fulfillment-policy" role="note"><span aria-hidden="true">i</span><p><strong>เพดานตามวันที่เลือก: ไม่เกิน {formatMoney(questCompletionPointLimit)} Points ต่อการสำเร็จเควส</strong><small>{questCompletionPolicyRules.events.quest.description} · {questCompletionPolicyLabel}</small><small>เมื่อยืนยัน ระบบจะบันทึกผล เพิ่ม Points และตัดสต็อกรางวัลในธุรกรรมเดียว ไม่เปลี่ยนสถานะหรือความคืบหน้าของเควส และจะไม่มอบซ้ำให้คนเดิม</small></p></div>
            </div>
            <div className="modal-actions quest-fulfillment-actions"><button type="button" className="secondary-button" onClick={closeQuestFulfillment}>ยกเลิก</button><button className="primary-button" disabled={isSaving || !questCompletionReady}>{isSaving ? "กำลังตรวจและบันทึก..." : `ยืนยันและมอบ ${formatMoney(questToFulfill.pointsReward)} Points`}</button></div>
          </form>
        </div>
      )}

      {showQuestForm && permissions.canManageQuests && !isEmployeePreview && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeQuestEditor()}>
          <form className="quest-form-modal" onSubmit={saveQuest} role="dialog" aria-modal="true" aria-labelledby="quest-form-title" aria-describedby="quest-form-description">
            <header className="quest-form-hero">
              <span className={`quest-form-icon ${questForm.type}`} aria-hidden="true">{questTypeMeta[questForm.type].icon}</span>
              <div><p className="eyebrow">QUEST BUILDER</p><h2 id="quest-form-title">{editingQuest ? "แก้ไขและจัดการเควส" : "สร้างเควสใหม่"}</h2><p id="quest-form-description">กำหนดกลุ่มเป้าหมาย ช่วงเวลา Points และรางวัลที่ประกาศให้ผู้เข้าร่วมเห็น</p></div>
              <button type="button" className="modal-close dark" onClick={closeQuestEditor} aria-label="ปิดหน้าต่างจัดการเควส">×</button>
              <div className="quest-form-preview"><span>{questStatusMeta[questForm.status].label}</span><strong>{questForm.title || "ชื่อเควสของคุณ"}</strong><small>{questTypeMeta[questForm.type].label} · ★ {formatMoney(questForm.pointsReward)} Points</small></div>
            </header>
            <div className="quest-form-body">
              <fieldset className="quest-type-picker"><legend>ประเภทเควส</legend>{(Object.entries(questTypeMeta) as [QuestRecord["type"], (typeof questTypeMeta)[QuestRecord["type"]]][]).map(([type, meta]) => <button type="button" key={type} disabled={editingQuestHasCompletions} className={questForm.type === type ? `active ${type}` : type} aria-pressed={questForm.type === type} onClick={() => setQuestForm((form) => ({ ...form, type, targetEmployeeIds: type === "individual" ? [form.targetEmployeeIds[0] ?? activeEmployees[0]?.id].filter(Boolean) as string[] : [], targetDepartmentIds: type === "team" ? form.targetDepartmentIds : [] }))}><span aria-hidden="true">{meta.icon}</span><p><strong>{meta.label}</strong><small>{meta.description}</small></p></button>)}</fieldset>

              <div className="quest-form-grid">
                <label className="wide"><span>ชื่อเควส</span><input autoFocus required disabled={editingQuestHasCompletions} maxLength={180} value={questForm.title} onChange={(event) => setQuestForm((form) => ({ ...form, title: event.target.value }))} placeholder="เช่น พิชิตเป้ายอดขายประจำสัปดาห์" /></label>
                <label className="wide"><span>รายละเอียดและเกณฑ์สำเร็จ</span><textarea required disabled={editingQuestHasCompletions} maxLength={4000} value={questForm.description} onChange={(event) => setQuestForm((form) => ({ ...form, description: event.target.value }))} placeholder="บอกเป้าหมาย สิ่งที่ต้องทำ และหลักฐานที่ HR จะใช้ตรวจผลให้ชัดเจน" /></label>

                {questForm.type === "individual" && <label className="wide quest-target-field"><span>พนักงานผู้รับเควส</span><select required disabled={editingQuestHasCompletions} value={questForm.targetEmployeeIds[0] ?? ""} onChange={(event) => setQuestForm((form) => ({ ...form, targetEmployeeIds: event.target.value ? [event.target.value] : [], targetDepartmentIds: [] }))}><option value="">เลือกพนักงาน 1 คน</option>{activeEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} · {getRole(employee.roleId).name}</option>)}</select><small>เควสนี้จะแสดงเฉพาะพนักงานที่เลือกและ HR / Admin</small></label>}
                {questForm.type === "team" && <fieldset className="wide quest-team-picker"><legend>ทีม / แผนกที่เข้าร่วม</legend><div>{departmentFilters.filter((department) => department.id !== "all").map((department) => { const selected = questForm.targetDepartmentIds.includes(department.id); return <button type="button" key={department.id} disabled={editingQuestHasCompletions} className={selected ? "active" : ""} aria-pressed={selected} onClick={() => setQuestForm((form) => ({ ...form, targetEmployeeIds: [], targetDepartmentIds: selected ? form.targetDepartmentIds.filter((id) => id !== department.id) : [...form.targetDepartmentIds, department.id] }))}><span aria-hidden="true">{selected ? "✓" : "＋"}</span>{department.label}</button>; })}</div><small>เลือกได้มากกว่า 1 แผนก สมาชิกและหัวหน้าของแผนกที่เลือกจะเห็นเควสนี้</small></fieldset>}
                {questForm.type === "activity" && <div className="wide quest-activity-scope" role="note"><span aria-hidden="true">✦</span><p><strong>กิจกรรมสำหรับทุกคนในองค์กร</strong><small>ไม่ต้องเลือกรายชื่อหรือแผนก เมื่อเปิดใช้งาน พนักงานและหัวหน้าทุกคนจะเห็นเควสนี้</small></p></div>}

                <label><span>วันเริ่ม</span><input required disabled={editingQuestHasCompletions} type="date" value={questForm.startDate} onChange={(event) => setQuestForm((form) => ({ ...form, startDate: event.target.value, endDate: form.endDate < event.target.value ? event.target.value : form.endDate }))} /></label>
                <label><span>วันสิ้นสุด</span><input required disabled={editingQuestHasCompletions} type="date" min={questForm.startDate} value={questForm.endDate} onChange={(event) => setQuestForm((form) => ({ ...form, endDate: event.target.value }))} /></label>
                <label><span>Points เมื่อสำเร็จ</span><input required disabled={editingQuestHasCompletions} type="number" inputMode="numeric" min={0} max={questPointLimit} step={1} value={questForm.pointsReward} onChange={(event) => setQuestForm((form) => ({ ...form, pointsReward: Number(event.target.value) }))} /><small>สูงสุด {formatMoney(questPointLimit)} Points จากค่าที่ต่ำกว่าระหว่างเพดานเควสกับเพดานบวกรายเดือน</small>{questPointsInvalid && <small className="quest-form-error" role="alert">กรอกจำนวนเต็มตั้งแต่ 0 ถึง {formatMoney(questPointLimit)} Points</small>}</label>
                <label><span>รางวัลพิเศษ <em>ไม่บังคับ</em></span><select disabled={editingQuestHasCompletions} value={questForm.rewardId ?? ""} onChange={(event) => setQuestForm((form) => ({ ...form, rewardId: event.target.value || null }))}><option value="">ไม่มีรางวัลพิเศษ</option>{rewards.filter((reward) => reward.isActive || reward.id === questForm.rewardId).map((reward) => <option key={reward.id} value={reward.id}>{reward.icon} {reward.title}{reward.isActive ? ` · เหลือ ${reward.stock}` : " · ปิดอยู่"}</option>)}</select>{questRewardUnavailable && <small className="quest-form-error" role="alert">รางวัลที่ผูกกับเควสต้องเปิดใช้งาน กรุณาเลือกรางวัลอื่นหรือนำรางวัลนี้ออก</small>}</label>
                <label><span>สถานะ</span><select value={questForm.status} onChange={(event) => { const status = event.target.value as QuestRecord["status"]; setQuestForm((form) => ({ ...form, status, progress: status === "completed" ? 100 : form.progress })); }}>{questAllowedStatuses.map((status) => <option key={status} value={status}>{status === "draft" ? "ฉบับร่าง · ยังไม่แสดง" : status === "active" ? "เปิดใช้งาน · แสดงตามขอบเขต" : "สำเร็จแล้ว · ปิดผล"}</option>)}</select><small>{questStatusMeta[questForm.status].description}</small></label>
                <label className="quest-feature-toggle"><input type="checkbox" checked={questForm.isFeatured} onChange={(event) => setQuestForm((form) => ({ ...form, isFeatured: event.target.checked }))} /><span><strong>แสดงเป็นเควสเด่น</strong><small>ปักไว้ก่อนเควสทั่วไปและติดป้ายเด่น</small></span></label>
                <label className="wide quest-progress-field"><span>ความคืบหน้า <b>{questForm.status === "completed" ? 100 : questForm.progress}%</b></span><input type="range" min={0} max={100} step={5} disabled={questForm.status === "completed"} value={questForm.status === "completed" ? 100 : questForm.progress} onChange={(event) => setQuestForm((form) => ({ ...form, progress: Number(event.target.value) }))} style={{ "--range-value": `${questForm.status === "completed" ? 100 : questForm.progress}%` } as React.CSSProperties} /><small>HR / Admin อัปเดตตามผลที่ตรวจสอบแล้ว สถานะสำเร็จจะตั้งเป็น 100%</small></label>
              </div>

              {questTargetInvalid && <div className="quest-form-validation" role="alert"><span aria-hidden="true">!</span><p><strong>ยังกำหนดผู้เข้าร่วมไม่ครบ</strong><small>{questForm.type === "individual" ? "เลือกพนักงาน 1 คนสำหรับเควสรายบุคคล" : questForm.type === "team" ? "เลือกอย่างน้อย 1 แผนกสำหรับเควสทีม" : "กิจกรรมองค์กรไม่ต้องกำหนดผู้เข้าร่วม"}</small></p></div>}
              {editingQuestHasCompletions && <div className="quest-form-validation locked" role="status"><span aria-hidden="true">⌁</span><p><strong>เงื่อนไขเควสถูกล็อกหลังมอบสิทธิ์ครั้งแรก</strong><small>เพื่อรักษาประวัติเดิม จะแก้ประเภท ชื่อ รายละเอียด ผู้เข้าร่วม ช่วงเวลา Points หรือรางวัลไม่ได้ แต่ยังอัปเดตสถานะ ความคืบหน้า และการแสดงเควสเด่นได้</small></p></div>}
              {questPolicyUnavailable && <div className="quest-form-validation" role="alert"><span aria-hidden="true">!</span><p><strong>ยังบันทึกสถานะนี้ไม่ได้ เพราะไม่มีกฎ Points ที่มีผลอยู่</strong><small>บันทึกเควสใหม่เป็นฉบับร่างได้ หรือเผยแพร่นโยบายใน “จัดการ Points” → “กฎ Points” ก่อนเปิดหรือปิดสำเร็จ</small></p></div>}
              {questPolicyDisablesCompletions && <div className="quest-form-validation" role="alert"><span aria-hidden="true">!</span><p><strong>กฎ Points ไม่อนุญาตให้ Admin มอบสิทธิ์จากเควส</strong><small>ตั้งกฎเควสเป็น manual เพิ่ม Admin ในผู้มีสิทธิ์ และกำหนดจำนวนครั้งที่ให้ Points บวกแบบ manual ต่อเดือนอย่างน้อย 1 ก่อนเปิดหรือปิดเควส</small></p></div>}
              <div className="quest-form-policy" role="note"><span aria-hidden="true">i</span><p><strong>กำหนดได้ไม่เกิน {formatMoney(questPointLimit)} Points ต่อผู้สำเร็จหนึ่งคน</strong><small>ระบบใช้ค่าที่ต่ำกว่าระหว่างเพดานเควสกับเพดาน Points บวกมาตรฐานรายเดือน · {pointEventRules.quest.description} หากต้องการเปลี่ยนเพดาน ให้แก้ที่แท็บ “จัดการ Points” → “กฎ Points”</small></p></div>
            </div>
            <div className="modal-actions quest-form-actions"><div>{editingQuest && editingQuest.status !== "archived" && <button type="button" className="quest-delete-button" disabled={isSaving} onClick={() => void deleteQuest(editingQuest)}>ลบเควส</button>}</div><button type="button" className="secondary-button" onClick={closeQuestEditor}>ยกเลิก</button><button className="primary-button" disabled={isSaving || questTargetInvalid || questRewardUnavailable || questPointsInvalid || questPolicyUnavailable || questPolicyDisablesCompletions}>{isSaving ? "กำลังบันทึก..." : editingQuest ? "บันทึกการแก้ไข" : "สร้างเควส"}</button></div>
          </form>
        </div>
      )}

      {showWorkForm && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setShowWorkForm(false); setEditingWorkItem(null); } }}>
          <form className={`work-form-modal ${isEmployeeCoordinationCreate ? "employee-coordinate-modal" : ""}`} onSubmit={saveWorkItem} role="dialog" aria-modal="true" aria-labelledby="work-form-title" aria-describedby={isEmployeeCoordinationCreate ? "employee-coordinate-description" : undefined}>
            {isEmployeeCoordinationCreate ? <>
              <header className="employee-coordinate-hero">
                <span className="employee-coordinate-icon" aria-hidden="true">→</span>
                <div><p className="eyebrow">TEAM COORDINATION</p><h2 id="work-form-title">สร้างงานประสานให้ทีม</h2><p id="employee-coordinate-description">ส่งสิ่งที่ต้องการให้ตนเองหรือเพื่อนร่วมทีม โดยเห็นเฉพาะรายชื่อทีมที่ระบบอนุญาต</p></div>
                <button type="button" className="modal-close" onClick={() => { setShowWorkForm(false); setEditingWorkItem(null); }} aria-label="ปิดหน้าต่างสร้างงานประสาน">×</button>
              </header>
              <div className="employee-coordinate-body">
                <div className="employee-coordinate-recipient-preview" aria-live="polite"><span aria-hidden="true">ถึง</span><p><small>ผู้รับงาน</small><strong>{safeWorkRosterById.get(workForm.assigneeEmployeeId)?.name ?? "กรุณาเลือกผู้รับงาน"}</strong></p><b>{workForm.priority === "urgent" ? "เร่งด่วน" : workPriorityLabel(workForm.priority)}</b></div>
                <div className="form-grid employee-coordinate-grid">
                  <label className="wide"><span>ผู้รับงาน</span><select required value={workForm.assigneeEmployeeId} onChange={(event) => setWorkForm((form) => ({ ...form, assigneeEmployeeId: event.target.value }))}><option value="">เลือกตนเองหรือเพื่อนร่วมทีม</option>{activeSafeWorkRoster.map((employee) => <option key={employee.id} value={employee.id}>{employee.id === currentUser?.employeeId ? `ฉันเอง · ${employee.name}` : `${employee.name} · ${getRole(employee.roleId).shortName}`}</option>)}</select><small>รายชื่อนี้มาจากภาพรวมทีมที่แชร์ได้เท่านั้น</small></label>
                  <label className="wide"><span>ชื่องาน</span><input autoFocus required value={workForm.title} onChange={(event) => setWorkForm((form) => ({ ...form, title: event.target.value }))} placeholder="เช่น ขอข้อมูลยอดขายสำหรับสรุปรายสัปดาห์" /></label>
                  <label className="wide"><span>รายละเอียดและสิ่งที่ต้องส่งมอบ</span><textarea required value={workForm.description} onChange={(event) => setWorkForm((form) => ({ ...form, description: event.target.value }))} placeholder="บอกบริบท สิ่งที่ต้องการ และรูปแบบผลลัพธ์ให้ชัดเจน" /></label>
                  <label><span>กำหนดส่ง</span><input required min={todayDate} type="date" value={workForm.dueDate} onChange={(event) => setWorkForm((form) => ({ ...form, dueDate: event.target.value }))} /></label>
                  <label><span>ความสำคัญ</span><select value={workForm.priority} onChange={(event) => setWorkForm((form) => ({ ...form, priority: event.target.value as WorkItemRecord["priority"] }))}><option value="low">ทั่วไป</option><option value="medium">ปานกลาง</option><option value="high">สำคัญ</option><option value="urgent">เร่งด่วน</option></select></label>
                  <label className="wide"><span>โปรเจกต์ <em>ไม่บังคับ</em></span><select value={workForm.projectId} onChange={(event) => setWorkForm((form) => ({ ...form, projectId: event.target.value }))}><option value="">ไม่ผูกโปรเจกต์</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
                </div>
                <div className="employee-coordinate-policy" role="note"><span aria-hidden="true">0</span><p><strong>งานประสานนี้ไม่มี Points ไม่นับ KPI หรือภาระงานทางการ</strong><small>ระบบจะสร้างเป็นรีเควสต์สถานะ “ต้องทำ” ผู้รับงานเป็นผู้อัปเดตความคืบหน้า ผู้สร้างอนุมัติเองไม่ได้ และการตรวจเป็นสิทธิ์ของหัวหน้าทีมหรือ HR เท่านั้น</small></p></div>
              </div>
              <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => { setShowWorkForm(false); setEditingWorkItem(null); }}>ยกเลิก</button><button className="primary-button" disabled={isSaving || !workForm.assigneeEmployeeId}>{isSaving ? "กำลังส่งงาน..." : "ส่งงานประสาน"}</button></div>
            </> : <>
              <div className="work-form-hero">
                <div><p className="eyebrow">MISSION CONTROL</p><h2 id="work-form-title">{editingWorkItem ? "อัปเดตงานและความคืบหน้า" : "เพิ่มงานหรือภารกิจใหม่"}</h2><p>กำหนดผู้รับผิดชอบและเป้าหมาย ระบบจะคำนวณ Points มาตรฐานให้อัตโนมัติ</p></div>
                <button type="button" className="modal-close dark" onClick={() => { setShowWorkForm(false); setEditingWorkItem(null); }} aria-label="ปิดหน้าต่าง">×</button>
                <div className="work-form-preview"><span className={`work-kind ${workForm.kind}`}>{workKindLabel(workForm.kind)}</span><strong>{workForm.title || "ชื่องานหรือภารกิจ"}</strong><small>{projectsById.get(workForm.projectId)?.name ?? "เลือกโปรเจกต์"}</small><b>★ {workForm.points} Points</b></div>
              </div>
              <div className="work-form-body">
                <div className="form-grid work-form-grid">
                  <label className="wide"><span>ชื่องาน / รีเควสต์ / ภารกิจ</span><input required value={workForm.title} onChange={(event) => setWorkForm((form) => ({ ...form, title: event.target.value }))} placeholder="เช่น สรุปข้อมูลลูกค้าเพื่อส่งทีมขาย" /></label>
                  <label><span>ประเภท</span><select value={workForm.kind} onChange={(event) => { const kind = event.target.value as WorkItemRecord["kind"]; setWorkForm((form) => ({ ...form, kind, points: workPointValue(kind, form.priority, activePointPolicyRules) })); }}><option value="task">งาน</option><option value="request">รีเควสต์</option><option value="mission">ภารกิจ</option></select></label>
                  <label><span>ระดับความสำคัญ</span><select value={workForm.priority} onChange={(event) => { const priority = event.target.value as WorkItemRecord["priority"]; setWorkForm((form) => ({ ...form, priority, points: workPointValue(form.kind, priority, activePointPolicyRules) })); }}><option value="low">ทั่วไป</option><option value="medium">ปานกลาง</option><option value="high">สำคัญ</option><option value="urgent">เร่งด่วน</option></select></label>
                  <label><span>โปรเจกต์</span><select required value={workForm.projectId} onChange={(event) => setWorkForm((form) => ({ ...form, projectId: event.target.value }))}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
                  <label><span>ผู้รับผิดชอบ</span><select required value={workForm.assigneeEmployeeId} onChange={(event) => setWorkForm((form) => ({ ...form, assigneeEmployeeId: event.target.value }))}>{employees.filter((employee) => employee.status === "active").map((employee) => <option key={employee.id} value={employee.id}>{employee.name} · {getRole(employee.roleId).shortName}</option>)}</select></label>
                  <label><span>สถานะ</span><select value={workForm.status === "review" || workForm.status === "done" ? "in_progress" : workForm.status} onChange={(event) => { const status = event.target.value as "todo" | "in_progress"; setWorkForm((form) => ({ ...form, status, progress: status === "todo" ? Math.min(form.progress, 20) : Math.max(1, Math.min(form.progress, 90)) })); }}><option value="todo">ต้องทำ</option><option value="in_progress">กำลังทำ</option></select><small>รอตรวจจะเกิดเมื่อพนักงานส่งหลักฐาน และเสร็จแล้วเมื่อผู้ตรวจอนุมัติ</small></label>
                  <label><span>กำหนดเสร็จ</span><input required type="date" value={workForm.dueDate} onChange={(event) => setWorkForm((form) => ({ ...form, dueDate: event.target.value }))} /></label>
                  <label className="auto-point-field"><span>Points มาตรฐาน (อัตโนมัติ)</span><input readOnly value={`${workForm.points} Points`} /><small>แก้เองไม่ได้ เพื่อให้ทุกคนได้รับ Points ตามกติกาเดียวกัน</small></label>
                  <label className="wide work-progress-field"><span>ความคืบหน้า <b>{Math.min(workForm.progress, 90)}%</b></span><input type="range" min="0" max="90" step="5" value={Math.min(workForm.progress, 90)} onChange={(event) => { const progress = Number(event.target.value); setWorkForm((form) => ({ ...form, progress, status: progress > 0 ? "in_progress" : "todo" })); }} style={{ "--range-value": `${Math.min(workForm.progress, 90)}%` } as React.CSSProperties} /></label>
                  <label className="wide"><span>รายละเอียดและเกณฑ์สำเร็จ</span><textarea value={workForm.description} onChange={(event) => setWorkForm((form) => ({ ...form, description: event.target.value }))} placeholder="อธิบายสิ่งที่ต้องส่งมอบ หรือเงื่อนไขที่ถือว่าภารกิจสำเร็จ" /></label>
                </div>
                <div className="mission-point-note"><span>★</span><p><strong>ระบบจะมอบ Points หลังส่งหลักฐานและหัวหน้าอนุมัติ</strong> การเปลี่ยนสถานะเป็น “เสร็จแล้ว” อย่างเดียวจะยังไม่ได้ Points และงานเดิมรับ Points ได้เพียงครั้งเดียว</p></div>
              </div>
              <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => { setShowWorkForm(false); setEditingWorkItem(null); }}>ยกเลิก</button><button className="primary-button" disabled={isSaving}>{isSaving ? "กำลังบันทึก..." : editingWorkItem ? "บันทึกความคืบหน้า" : "สร้างรายการ"}</button></div>
            </>}
          </form>
        </div>
      )}

      {submissionWorkItem && submissionAssignee && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSubmissionWorkItem(null)}>
          <section className="work-submission-modal" role="dialog" aria-modal="true" aria-labelledby="work-submission-title">
            <div className="submission-hero">
              <EmployeeAvatar employee={submissionAssignee} profile={employeeProfilesById.get(submissionAssignee.id)} className="avatar-submission" />
              <div><p className="eyebrow">WORK PROOF CENTER</p><h2 id="work-submission-title">{canSubmitActiveWorkProof ? "ส่งหลักฐานงาน" : "ตรวจและดูหลักฐานงาน"}</h2><p>{submissionWorkItem.title} · {submissionAssignee.name}</p></div>
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
                    {!activeWorkSubmissions.length && <div className="submission-empty"><span>↗</span><strong>ยังไม่มีหลักฐานงาน</strong><p>{isEmployeePreview ? "บัญชีพนักงานจริงจะสามารถเพิ่มลิงก์หรือแนบไฟล์ได้จากหน้านี้" : canSubmitActiveWorkProof ? "เพิ่มลิงก์หรือแนบไฟล์ด้วยแบบฟอร์มด้านล่าง" : "รอพนักงานผู้รับผิดชอบส่งหลักฐานจากบัญชีของตนเอง"}</p></div>}
                  </div>
                </section>
                {isEmployeePreview || !canSubmitActiveWorkProof || submissionWorkItem.status === "review" || submissionWorkItem.status === "done" ? <div className={`submission-locked ${isEmployeePreview ? "preview-read-only" : ""}`}><span>{isEmployeePreview ? "◉" : submissionWorkItem.status === "done" ? "✓" : submissionWorkItem.status === "review" ? "⌕" : "⊘"}</span><div><strong>{isEmployeePreview ? "โหมดทดลองเป็นแบบอ่านอย่างเดียว" : submissionWorkItem.status === "done" ? "งานนี้ปิดเรียบร้อยแล้ว" : submissionWorkItem.status === "review" ? "หลักฐานกำลังรอตรวจ" : "เฉพาะผู้รับผิดชอบงานเป็นผู้ส่งหลักฐาน"}</strong><p>{isEmployeePreview ? "เปิดดูลิงก์และดาวน์โหลดหลักฐานเดิมได้ แต่จะไม่สร้างหรือเปลี่ยนข้อมูลใดๆ" : submissionWorkItem.status === "done" ? "ดูหรือดาวน์โหลดหลักฐานเดิมได้จากประวัติด้านบน" : submissionWorkItem.status === "review" ? "หากผู้ตรวจส่งกลับแก้ไข ระบบจะเปิดแบบฟอร์มให้ส่งเวอร์ชันใหม่อีกครั้ง" : "HR และหัวหน้าเปิดดูหลักฐานและตรวจผลงานได้ แต่ส่งแทนพนักงานไม่ได้"}</p></div></div> : <form className="submission-form" onSubmit={submitWorkProof}>
                  <div className="submission-section-heading"><div><p className="eyebrow">NEW SUBMISSION</p><h3>เพิ่มหลักฐาน</h3></div><span>รอตรวจ</span></div>
                  <div className="submission-form-grid">
                    <label><span>ประเภทหลักฐาน</span><select value={submissionForm.submissionType} onChange={(event) => setSubmissionForm((form) => ({ ...form, submissionType: event.target.value as WorkSubmissionRecord["submissionType"] }))}>{(Object.entries(submissionTypeLabels) as [WorkSubmissionRecord["submissionType"], string][]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                    <label><span>ชื่อผลงาน / เวอร์ชัน</span><input required value={submissionForm.title} onChange={(event) => setSubmissionForm((form) => ({ ...form, title: event.target.value }))} placeholder="เช่น Final V3 / Campaign Live" /></label>
                    <label className="wide"><span>ลิงก์ผลงาน</span><input type="url" value={submissionForm.linkUrl} onChange={(event) => setSubmissionForm((form) => ({ ...form, linkUrl: event.target.value }))} placeholder="https://drive.google.com/... หรือ URL ผลงาน" /></label>
                    <label className="wide submission-file"><span>ไฟล์แนบ (ถ้ามี)</span><input type="file" accept=".pdf,.doc,.docx,.xlsx,.csv,.txt,.jpg,.jpeg,.png,.webp,.mp4,.zip" onChange={(event) => setSubmissionFile(event.target.files?.[0] ?? null)} /><small>{submissionFile ? `${submissionFile.name} · ${formatFileSize(submissionFile.size)}` : "ไม่เกิน 25 MB — วิดีโอขนาดใหญ่ควรส่งเป็นลิงก์ Drive หรือ YouTube"}</small></label>
                    <label className="wide"><span>สรุปสิ่งที่ส่งมอบ</span><textarea value={submissionForm.note} onChange={(event) => setSubmissionForm((form) => ({ ...form, note: event.target.value }))} placeholder="อธิบายผลลัพธ์ จุดที่ต้องการให้ตรวจ และรหัสผ่านหากมี" /></label>
                  </div>
                  <div className="submission-form-actions"><span>ต้องมีลิงก์หรือไฟล์อย่างน้อย 1 รายการ</span><button disabled={isSaving || (!submissionForm.linkUrl.trim() && !submissionFile)}>{isSaving ? "กำลังส่ง..." : "ส่งหลักฐานเพื่อตรวจ"}</button></div>
                </form>}
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

      {showRewardForm && isAdmin && !isEmployeePreview && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeRewardEditor()}>
          <form className="reward-modal reward-management-modal" onSubmit={saveReward} role="dialog" aria-modal="true" aria-labelledby="reward-management-title" aria-describedby="reward-management-description">
            <div className="reward-modal-hero reward-management-hero">
              <span className={`reward-icon ${rewardForm.category}`} aria-hidden="true">{rewardForm.icon || "★"}</span>
              <div><p className="eyebrow">REWARD MANAGEMENT</p><h2 id="reward-management-title">{editingReward ? "แก้ไขรางวัล" : "สร้างรางวัลใหม่"}</h2><p id="reward-management-description">กำหนดรายละเอียด ราคา Points จำนวนสิทธิ์ และสถานะที่พนักงานจะเห็นในร้านรางวัล</p></div>
              <button type="button" className="modal-close dark" onClick={closeRewardEditor} aria-label="ปิดหน้าต่างจัดการรางวัล">×</button>
            </div>
            <div className="reward-modal-body reward-management-body">
              <div className="reward-management-grid">
                <label className="wide"><span>ชื่อรางวัล</span><input autoFocus required maxLength={160} value={rewardForm.title} onChange={(event) => setRewardForm((form) => ({ ...form, title: event.target.value }))} placeholder="เช่น บัตรของขวัญร้านอาหาร 500 บาท" /></label>
                <label className="wide"><span>รายละเอียด</span><textarea required maxLength={2000} value={rewardForm.description} onChange={(event) => setRewardForm((form) => ({ ...form, description: event.target.value }))} placeholder="อธิบายสิ่งที่จะได้รับ เงื่อนไข และวิธีรับรางวัลให้ชัดเจน" /></label>
                <label><span>หมวดรางวัล</span><select value={rewardForm.category} onChange={(event) => { const category = event.target.value as RewardRecord["category"]; setRewardForm((form) => ({ ...form, category, icon: form.icon === rewardCategoryMeta[form.category].defaultIcon ? rewardCategoryMeta[category].defaultIcon : form.icon })); }}>{(Object.entries(rewardCategoryMeta) as [RewardRecord["category"], (typeof rewardCategoryMeta)[RewardRecord["category"]]][]).map(([category, meta]) => <option key={category} value={category}>{meta.label}</option>)}</select></label>
                <label><span>ไอคอน</span><input required maxLength={16} value={rewardForm.icon} onChange={(event) => setRewardForm((form) => ({ ...form, icon: event.target.value }))} placeholder="เช่น 🎁 หรือ ★" aria-describedby="reward-icon-help" /><small id="reward-icon-help">ใช้อีโมจิหรืออักษรสั้น ๆ</small></label>
                <label><span>ราคา (Points)</span><input required type="number" inputMode="numeric" min={1} max={10000000} step={1} value={rewardForm.costPoints} onChange={(event) => setRewardForm((form) => ({ ...form, costPoints: Number(event.target.value) }))} /></label>
                <label><span>สต็อก (จำนวนสิทธิ์)</span><input required type="number" inputMode="numeric" min={0} max={1000000} step={1} value={rewardForm.stock} onChange={(event) => setRewardForm((form) => ({ ...form, stock: Number(event.target.value) }))} /><small>ตั้งเป็น 0 เมื่อรางวัลหมดชั่วคราว</small></label>
                <label className={`wide reward-active-toggle ${rewardForm.isActive ? "active" : "inactive"}`}><input type="checkbox" checked={rewardForm.isActive} onChange={(event) => setRewardForm((form) => ({ ...form, isActive: event.target.checked }))} /><span><strong>{rewardForm.isActive ? "เปิดให้แลกรางวัล" : "ปิดรางวัลไว้"}</strong><small>{rewardForm.isActive ? "พนักงานและหัวหน้าจะเห็นรางวัลนี้ในร้าน" : "มีเฉพาะ HR / Admin ที่เห็นและสามารถเปิดกลับมาได้"}</small></span></label>
              </div>
              <div className="reward-management-note" role="note"><span aria-hidden="true">i</span><p><strong>ประวัติการแลกจะไม่หาย</strong><small>ปุ่มลบรางวัลจะนำรายการออกจากร้าน แต่ยังเก็บคำขอเดิมไว้สำหรับตรวจสอบ Points และการส่งมอบย้อนหลัง</small></p></div>
            </div>
            <div className="modal-actions reward-management-actions">
              <div>{editingReward?.isActive && <button type="button" className="reward-delete-button" disabled={isSaving} onClick={() => void deleteReward(editingReward)}>ลบรางวัล</button>}</div>
              <button type="button" className="secondary-button" onClick={closeRewardEditor}>ยกเลิก</button>
              <button className="primary-button" disabled={isSaving}>{isSaving ? "กำลังบันทึก..." : editingReward ? "บันทึกการแก้ไข" : "สร้างรางวัล"}</button>
            </div>
          </form>
        </div>
      )}

      {rewardToRedeem && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setRewardToRedeem(null)}>
          <form className="reward-modal" onSubmit={redeemReward} role="dialog" aria-modal="true" aria-labelledby="reward-modal-title">
            <div className="reward-modal-hero"><span className={`reward-icon ${rewardToRedeem.category}`}>{rewardToRedeem.icon}</span><div><p className="eyebrow">REDEEM REWARD</p><h2 id="reward-modal-title">{rewardToRedeem.title}</h2><p>{rewardToRedeem.description}</p></div><button type="button" className="modal-close dark" onClick={() => setRewardToRedeem(null)} aria-label="ปิดหน้าต่าง">×</button></div>
            <div className="reward-modal-body">
              {!isAdmin ? <div className="reward-owner-lock"><span>★</span><p><small>บัญชีที่ใช้ Points</small><strong>{currentUserEmployee?.name ?? "พนักงาน"}</strong></p><b>{formatMoney(activeRewardBalance)} Points</b></div> : <label><span>พนักงานที่ใช้ Points</span><select value={rewardEmployeeId} onChange={(event) => setRewardEmployeeId(event.target.value)}>{leaderboard.map(({ employee, points }) => <option key={employee.id} value={employee.id}>{employee.name} · {formatMoney(points)} Points</option>)}</select></label>}
              <div className="reward-balance"><span><small>Points คงเหลือ</small><strong>{formatMoney(activeRewardBalance)}</strong></span><b>−</b><span><small>ใช้แลกรางวัล</small><strong>{formatMoney(rewardToRedeem.costPoints)}</strong></span><b>=</b><span className={activeRewardBalance - rewardToRedeem.costPoints < pointRedemptionPolicy.minimumBalanceAfterRedemption ? "insufficient" : ""}><small>คงเหลือหลังแลก</small><strong>{formatMoney(activeRewardBalance - rewardToRedeem.costPoints)}</strong></span></div>
              <section className="reward-preflight" aria-label="ตรวจสิทธิ์ก่อนแลกรางวัล"><header><div><strong>ตรวจสิทธิ์ก่อนแลก</strong><small>{activePointPolicyLabel}</small></div><b className={canSubmitRewardRedemption ? "ready" : "blocked"}>{canSubmitRewardRedemption ? "พร้อมแลก" : "ยังไม่ผ่าน"}</b></header><div>{rewardPreflightChecks.map((check) => <article key={check.id} className={check.passed ? "passed" : "failed"}><span>{check.passed ? "✓" : "!"}</span><p><strong>{check.title}</strong><small>{check.detail}</small></p></article>)}</div>{!hasCurrentPointPolicyAcknowledgement && !isAdmin && <button type="button" onClick={() => { setRewardToRedeem(null); setWorkSection("points"); setPointPanel("policies"); }}>ไปอ่านและรับทราบกติกา →</button>}</section>
              <p className="reward-approval-note">คำขอจะเข้าสู่สถานะ “รออนุมัติ” และตัด Points ทันที เพื่อป้องกันการใช้ Points ซ้ำ</p>
            </div>
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setRewardToRedeem(null)}>ยกเลิก</button><button className="primary-button" disabled={isSaving || !canSubmitRewardRedemption}>{isSaving ? "กำลังส่งคำขอ..." : canSubmitRewardRedemption ? `ยืนยันแลก ${formatMoney(rewardToRedeem.costPoints)} Points` : "ยังไม่ผ่านเกณฑ์การแลก"}</button></div>
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
                <div><small>คะแนนสมรรถนะรวม</small><strong>{skillProfileScore !== null ? skillProfileScore.toFixed(0) : "—"}</strong><span>/ 100</span></div>
                <div className="profile-score-copy"><b>{skillProfileScore !== null ? scoreStatus(skillProfileScore) : `ประเมินแล้ว ${skillProfileAssessedCount}/${skillProfileRole.skills.length}`}</b><p>{period}<br />ประเมินรอบด้าน {skillProfileRole.skills.length} สมรรถนะ · 6 หมวด</p></div>
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
                  <div className="talent-empty"><span>◎</span><div><strong>ยังสร้างกราฟไม่ได้</strong><p>เริ่มประเมินระดับสกิล 1–5 เพื่อดูกราฟความถนัดและตำแหน่งที่เหมาะสม</p></div>{(!isEmployeeUser || currentUser?.employeeId === skillProfileEmployee.id) && <button onClick={() => editSkillProfile(skillProfileEmployee)}>{isEmployeeUser ? "ประเมินตนเอง" : "เริ่มประเมินสกิล"}</button>}</div>
                )}
              </section>
              <div className="profile-section-heading"><div><p className="eyebrow">COMPETENCY DETAIL</p><h3>รายละเอียดสมรรถนะ 6 หมวด</h3></div><span><i />ระดับปัจจุบัน <i className="target" />เป้าหมาย</span></div>
              <div className="profile-skill-categories">
                {skillCategories.map((category) => {
                  const summary = skillCategorySummary(skillProfileRole, skillProfileEvaluation, category.id);
                  return (
                    <section className={`profile-skill-category ${category.id}`} key={category.id}>
                      <header><div><p>{category.shortLabel}</p><h4>{category.label}</h4></div><span>{summary.recorded}/{summary.skills.length} ด้าน · {summary.average === null ? "รอประเมิน" : `${summary.average.toFixed(0)}%`}</span></header>
                      <div className="profile-skill-list">
                        {summary.skills.map((skill) => {
                          const level = skillProfileEvaluation?.skillScores[skill.id] ?? null;
                          const gap = level === null ? null : skill.targetLevel - level;
                          return (
                            <article key={skill.id}>
                              <div className="profile-skill-name"><strong>{skill.name}</strong><small>{level === null ? "ยังไม่มีระดับในรอบนี้" : `${skillLevelLabel(level)} · ระดับ ${level} จาก 5`}</small>{skill.description && <p>{skill.description}</p>}</div>
                              <div className="profile-level-track" aria-label={`${skill.name}: ${level === null ? "รอประเมิน" : `ระดับ ${level}`} เป้าหมายระดับ ${skill.targetLevel}`}>
                                {[1, 2, 3, 4, 5].map((item) => <span key={item} className={`${level !== null && item <= level ? "filled" : ""} ${item === skill.targetLevel ? "target" : ""}`}><i />{item}</span>)}
                              </div>
                              <div className={`gap-pill ${gap !== null && gap <= 0 ? "ready" : ""}`}>{gap === null ? "รอประเมิน" : gap > 0 ? `ขาด ${gap} ระดับ` : gap === 0 ? "ตรงเป้าหมาย" : `เกิน ${Math.abs(gap)} ระดับ`}</div>
                              {skill.levelGuide && <div className="ai-level-guide profile-guide">{Object.entries(skill.levelGuide).map(([guideLevel, copy]) => <div key={guideLevel} className={`${Number(guideLevel) === level ? "current" : ""} ${Number(guideLevel) === skill.targetLevel ? "target" : ""}`}><b>{guideLevel}</b><span>{copy}</span></div>)}</div>}
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
              <div className="profile-insights">
                <article>
                  <span className="insight-icon strength">✓</span>
                  <div><strong>จุดแข็ง</strong><p>{skillProfileEvaluation ? (() => {
                    const strengths = skillProfileRole.skills.filter((skill) => typeof skillProfileEvaluation.skillScores[skill.id] === "number" && skillProfileEvaluation.skillScores[skill.id] >= skill.targetLevel);
                    return strengths.length ? strengths.map((skill) => skill.name).join(" · ") : "ยังไม่มีสกิลที่ถึงระดับเป้าหมาย";
                  })() : "ประเมินสกิลเพื่อค้นหาจุดแข็งของบุคคลนี้"}</p></div>
                </article>
                <article>
                  <span className="insight-icon focus">↗</span>
                  <div><strong>จุดเน้นพัฒนา</strong><p>{skillProfileEvaluation ? (() => {
                    const missing = skillProfileRole.skills.filter((skill) => typeof skillProfileEvaluation.skillScores[skill.id] !== "number");
                    if (missing.length) return `รอประเมินอีก ${missing.length} ด้าน: ${missing.slice(0, 2).map((skill) => skill.name).join(" · ")}`;
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
            <div className="modal-actions profile-actions"><button className="secondary-button" onClick={() => setSkillProfileEmployee(null)}>ปิด</button>{(!isEmployeeUser || currentUser?.employeeId === skillProfileEmployee.id) && <button className="primary-button" onClick={() => editSkillProfile(skillProfileEmployee)}>{isEmployeeUser ? (selfAssessmentsByEmployee.has(skillProfileEmployee.id) ? "แก้ไขแบบประเมินตนเอง" : "ประเมินตนเอง") : skillProfileEvaluation ? "แก้ไขระดับสกิล" : "เริ่มประเมินสกิล"}</button>}</div>
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
              <div className="modal-person"><EmployeeAvatar employee={selectedEmployee} profile={employeeProfilesById.get(selectedEmployee.id)} className="avatar-modal" /><div><p className="eyebrow">{isEmployeeUser ? "แบบประเมินตนเอง" : "แบบประเมินรายบุคคล"}</p><h2 id="evaluation-title">{selectedEmployee.name}</h2><small>{selectedRole.name} · {period}</small></div></div>
              <button className="modal-close" onClick={() => setSelectedEmployee(null)} aria-label="ปิดหน้าต่าง">×</button>
            </div>
            <div className="modal-score-summary">
              <div><small>{isEmployeeUser ? "คะแนนประเมินตนเอง" : "คะแนนรวม"}</small><strong>{skillAssessmentComplete ? grandTotal.toFixed(1) : "—"}</strong><span className={skillAssessmentComplete && grandTotal < 75 ? "low" : ""}>{skillAssessmentComplete ? scoreStatus(grandTotal) : `รอประเมินอีก ${selectedRole.skills.length - ratedSkillCount} ด้าน`}</span></div>
              <div className="score-formula"><span>KPI 70% <b>{kpiTotal.toFixed(1)}</b></span><span>สมรรถนะ 30% <b>{skillAssessmentComplete ? skillTotal.toFixed(1) : "—"}</b></span></div>
              <div className="modal-progress"><i style={{ width: `${skillAssessmentComplete ? grandTotal : 0}%` }} /></div>
            </div>
            <div className="evaluation-columns">
              <div className="evaluation-section">
                <div className="evaluation-section-title"><span>01</span><div><strong>ผลงานตาม KPI</strong><small>{isEmployeeUser ? "ประเมินผลลัพธ์ของตนจากหลักฐานจริง 0–100" : "ให้คะแนนจากผลลัพธ์จริง 0–100"}</small></div></div>
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
                <div className="evaluation-section-title"><span>02</span><div><strong>สมรรถนะรอบด้าน</strong><small>ประเมินแล้ว {ratedSkillCount}/{selectedRole.skills.length} ด้าน</small></div></div>
                <div className="skill-category-tabs" aria-label="เลือกหมวดสมรรถนะ">
                  {skillCategories.map((category) => {
                    const categorySkills = selectedRole.skills.filter((skill) => (skill.category ?? "role") === category.id);
                    const categoryRated = categorySkills.filter((skill) => typeof skillScores[skill.id] === "number").length;
                    return <button type="button" key={category.id} className={skillCategoryFilter === category.id ? "active" : ""} onClick={() => setSkillCategoryFilter(category.id)}><strong>{category.shortLabel}</strong><small>{categoryRated}/{categorySkills.length}</small></button>;
                  })}
                </div>
                <div className={`skill-category-context ${selectedSkillCategory.id}`}><div><strong>{selectedSkillCategory.label}</strong><p>{selectedSkillCategory.description}</p></div><span>น้ำหนัก {selectedSkillCategory.weight}%</span></div>
                <div className="skill-editor">
                  {selectedCategorySkills.map((skill) => (
                    <fieldset key={skill.id}><legend><strong>{skill.name}</strong><small>{skill.description}<br />หลักฐาน: {skill.evidence} · เป้าหมาย {skill.target}</small></legend><div className="level-picker">
                      {[1, 2, 3, 4, 5].map((level) => <button type="button" key={level} className={skillScores[skill.id] === level ? "active" : ""} onClick={() => setSkillScores((scores) => ({ ...scores, [skill.id]: level }))} aria-label={`${skill.name} ระดับ ${level}`}>{level}</button>)}
                    </div>{skill.levelGuide && <div className="ai-level-guide evaluation-guide">{Object.entries(skill.levelGuide).map(([guideLevel, copy]) => <button type="button" key={guideLevel} className={skillScores[skill.id] === Number(guideLevel) ? "current" : ""} onClick={() => setSkillScores((scores) => ({ ...scores, [skill.id]: Number(guideLevel) }))}><b>{guideLevel}</b><span>{copy}</span></button>)}</div>}</fieldset>
                  ))}
                </div>
                <div className="skill-evaluation-note"><span>i</span><p>ให้คะแนนจากหลักฐานและพฤติกรรมที่สังเกตได้ในการทำงาน ไม่ใช้ความชอบหรือความเห็นต่อนิสัยส่วนตัว</p></div>
              </div>
            </div>
            {isEmployeeUser && <div className="decision-note compact"><span>i</span><p><strong>นี่คือแบบประเมินตนเอง</strong> หัวหน้าหรือ HR จะใช้ประกอบการพูดคุยเท่านั้น ไม่แทนผลประเมินทางการ ไม่สร้าง Points และคุณไม่สามารถอนุมัติคะแนนของตนเองได้</p></div>}
            <label className="note-field"><span>{isEmployeeUser ? "ผลงานเด่นและสิ่งที่อยากพัฒนา" : "บันทึกและแผนพัฒนา"}</span><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={isEmployeeUser ? "ยกตัวอย่างผลงาน หลักฐาน สิ่งที่ทำได้ดี และเรื่องที่อยากให้หัวหน้าช่วยสนับสนุน..." : "ระบุผลงานเด่น จุดที่ควรพัฒนา และสิ่งที่องค์กรจะสนับสนุน..."} /></label>
            <div className="modal-actions"><button className="secondary-button" onClick={() => setSelectedEmployee(null)}>ยกเลิก</button><button className="primary-button" disabled={isSaving || !skillAssessmentComplete} onClick={saveEvaluation} title={skillAssessmentComplete ? (isEmployeeUser ? "บันทึกแบบประเมินตนเอง" : "บันทึกผลประเมิน") : `เหลือสมรรถนะที่ต้องประเมิน ${selectedRole.skills.length - ratedSkillCount} ด้าน`}>{isSaving ? "กำลังบันทึก..." : skillAssessmentComplete ? (isEmployeeUser ? "บันทึกแบบประเมินตนเอง" : "บันทึกผลประเมิน") : `ประเมินให้ครบอีก ${selectedRole.skills.length - ratedSkillCount} ด้าน`}</button></div>
          </section>
        </div>
      )}

      {showAddEmployee && canManageEmployeeFiles && (
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

      {showChangePassword && currentUser && !isEmployeePreview && (
        <ChangePasswordDialog
          displayName={currentUser.displayName}
          onClose={() => setShowChangePassword(false)}
          onSuccess={() => {
            setShowChangePassword(false);
            showToast("เปลี่ยนรหัสผ่านเรียบร้อยแล้ว");
          }}
        />
      )}

      {!isEmployeeUser && <>
        {showAiMascot && <AiRobotMascot open={showAiAssistant} suspended={hasBlockingOverlay} onOpen={openPeopleAi} onHide={hideAiMascot} />}
        <AiAssistant open={showAiAssistant} context={peopleAiContext} onClose={() => setShowAiAssistant(false)} onSystemAction={handlePeopleAiAction} />
      </>}
      <div className={`toast ${toast ? `show ${toast.tone}` : ""}`} role={toast?.tone === "error" ? "alert" : "status"} aria-live={toast?.tone === "error" ? "assertive" : "polite"} aria-atomic="true"><span>{toast?.tone === "error" ? "!" : "✓"}</span>{toast?.message}</div>
    </main>
  );
}

function EmployeeAvatar({ employee, profile, className = "avatar-md" }: { employee: EmployeeRecord; profile?: EmployeeProfileRecord | null; className?: string }) {
  const imageVersion = profile?.profileImageUpdatedAt ? encodeURIComponent(profile.profileImageUpdatedAt) : "1";
  const hasValidProfileImage = Boolean(profile?.profileImageKey?.startsWith(`employee-profile-images/${employee.id}/`));
  return (
    <i className={`avatar-media ${className}`} aria-hidden="true">
      <span className="avatar-initials">{employee.initials || makeInitials(employee.name)}</span>
      {hasValidProfileImage
        // The authenticated R2 route serves private employee images and is not compatible with public image optimization.
        ? <img src={`/api/profile-image?employeeId=${encodeURIComponent(employee.id)}&v=${imageVersion}`} alt="" loading="lazy" onError={(event) => event.currentTarget.remove()} /> // eslint-disable-line @next/next/no-img-element
        : null}
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
