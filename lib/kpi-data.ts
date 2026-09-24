export type ScoreStatus = "ดีเยี่ยม" | "ตามเป้าหมาย" | "ควรติดตาม";

export type MetricTemplate = {
  id: string;
  name: string;
  target: string;
};

export type KpiTemplate = MetricTemplate & {
  weight: number;
};

export type SkillCategoryId = "role" | "ai" | "execution" | "collaboration" | "professionalism" | "growth";

export type SkillTemplate = MetricTemplate & {
  targetLevel: number;
  category?: SkillCategoryId;
  description?: string;
  evidence?: string;
  eligibleForAllowance?: boolean;
  levelGuide?: Record<number, string>;
};

export const skillCategories: { id: SkillCategoryId; label: string; shortLabel: string; description: string; weight: number }[] = [
  { id: "role", label: "สกิลตามตำแหน่ง", shortLabel: "ตามตำแหน่ง", description: "ความรู้และความสามารถเฉพาะที่ต้องใช้เพื่อส่งมอบงานในบทบาทปัจจุบัน", weight: 35 },
  { id: "ai", label: "การใช้ AI ในการทำงาน", shortLabel: "AI", description: "ใช้ AI ตั้งแต่พื้นฐานไปถึงการออกแบบ Workflow และระบบขั้นสูงอย่างปลอดภัย ตรวจสอบได้ และสร้างผลลัพธ์จริง", weight: 10 },
  { id: "execution", label: "การทำงานและความรับผิดชอบ", shortLabel: "การทำงาน", description: "วินัย ความรับผิดชอบ การบริหารเวลา และมาตรฐานคุณภาพงาน", weight: 20 },
  { id: "collaboration", label: "การทำงานกับผู้อื่น", shortLabel: "การร่วมงาน", description: "การสื่อสาร ทีมเวิร์ก มารยาท และการใส่ใจผู้รับบริการ", weight: 15 },
  { id: "professionalism", label: "ความเป็นมืออาชีพ", shortLabel: "มืออาชีพ", description: "ความซื่อสัตย์ การรักษากฎและข้อมูล รวมถึงการจัดการอารมณ์", weight: 10 },
  { id: "growth", label: "การเติบโตและพัฒนาตน", shortLabel: "การเติบโต", description: "การปรับตัว เรียนรู้สิ่งใหม่ และริเริ่มแก้ปัญหาอย่างสร้างสรรค์", weight: 10 },
];

export const aiSkillLevelGuide: Record<number, string> = {
  1: "เริ่มต้น · ใช้ตามตัวอย่าง รู้ว่าห้ามใส่ข้อมูลลับ และขอให้ผู้มีประสบการณ์ตรวจผล",
  2: "พื้นฐาน · เขียน Prompt พร้อมบริบท ตรวจข้อเท็จจริง และแก้ผลลัพธ์ก่อนใช้งาน",
  3: "เชิงลึกตามตำแหน่ง · ใช้ AI ใน Workflow งานจริงครบขั้นและวัดเวลา คุณภาพ หรือผลลัพธ์ได้",
  4: "ขั้นสูง · สร้าง Prompt Template หรือ Automation ที่ใช้ซ้ำ ทดสอบคุณภาพ และควบคุมความเสี่ยง",
  5: "ผู้เชี่ยวชาญ · ออกแบบมาตรฐาน AI ของทีม โค้ชผู้อื่น และสร้างผลลัพธ์ทางธุรกิจที่ตรวจสอบได้",
};

function aiWorkMastery(targetLevel = 3, evidence = "ผลทดสอบ พร้อมตัวอย่าง Prompt หรือ Workflow ที่ปกปิดข้อมูลอ่อนไหว มีวิธีตรวจผล และผลก่อน–หลังที่วัดได้"): SkillTemplate {
  return {
    id: "core-ai-work-mastery",
    name: "การใช้ AI ในงาน: พื้นฐาน → เชิงลึก → ผู้เชี่ยวชาญ",
    target: `ระดับ ${targetLevel} จาก 5`,
    targetLevel,
    category: "ai",
    description: "ใช้ AI อย่างปลอดภัยและตรวจสอบได้ ตั้งแต่การเขียน Prompt ไปจนถึง Workflow, Automation และการตัดสินใจที่มีมนุษย์กำกับ",
    evidence,
    eligibleForAllowance: false,
    levelGuide: aiSkillLevelGuide,
  };
}

export const coreCompetencies: SkillTemplate[] = [
  { id: "core-discipline", name: "วินัยและความตรงต่อเวลา", target: "ระดับ 4 จาก 5", targetLevel: 4, category: "execution", description: "รักษาเวลา ข้อตกลง และขั้นตอนการทำงานอย่างสม่ำเสมอ", evidence: "เวลาเข้างาน การเข้าประชุม และประวัติทำตามข้อตกลง", eligibleForAllowance: false },
  { id: "core-responsibility", name: "ความรับผิดชอบและการเป็นเจ้าของงาน", target: "ระดับ 4 จาก 5", targetLevel: 4, category: "execution", description: "รับผิดชอบผลลัพธ์ ติดตามงาน และแจ้งความเสี่ยงก่อนเกิดปัญหา", evidence: "งานที่รับผิดชอบ การติดตาม และการแก้ไขเมื่อเกิดข้อผิดพลาด", eligibleForAllowance: false },
  { id: "core-time-management", name: "การบริหารเวลาและลำดับความสำคัญ", target: "ระดับ 4 จาก 5", targetLevel: 4, category: "execution", description: "วางแผนงาน เลือกสิ่งสำคัญ และส่งมอบตามเวลาที่ตกลง", evidence: "แผนงาน กำหนดส่ง และการจัดการงานเร่งด่วน", eligibleForAllowance: false },
  { id: "core-quality-mindset", name: "ความละเอียดรอบคอบและคุณภาพงาน", target: "ระดับ 4 จาก 5", targetLevel: 4, category: "execution", description: "ตรวจสอบความถูกต้องและรักษามาตรฐานก่อนส่งมอบ", evidence: "จำนวนรอบแก้ไข ข้อผิดพลาด และผลตรวจคุณภาพ", eligibleForAllowance: false },
  { id: "core-professional-communication", name: "การสื่อสารอย่างมืออาชีพ", target: "ระดับ 4 จาก 5", targetLevel: 4, category: "collaboration", description: "สื่อสารชัดเจน ตรงประเด็น เลือกช่องทางและน้ำเสียงเหมาะสม", evidence: "การประชุม ข้อความสรุปงาน และการส่งต่อข้อมูล", eligibleForAllowance: false },
  { id: "core-teamwork", name: "การทำงานเป็นทีมและให้ความร่วมมือ", target: "ระดับ 4 จาก 5", targetLevel: 4, category: "collaboration", description: "แบ่งปันข้อมูล ช่วยเหลือทีม และทำงานข้ามหน้าที่ได้", evidence: "ผลตอบรับจากทีม งานร่วม และการแบ่งปันความรู้", eligibleForAllowance: false },
  { id: "core-respect-manners", name: "มารยาท การให้เกียรติ และความเหมาะสม", target: "ระดับ 4 จาก 5", targetLevel: 4, category: "collaboration", description: "รับฟัง ให้เกียรติ และแสดงพฤติกรรมที่เหมาะสมกับสถานการณ์ทำงาน", evidence: "พฤติกรรมที่สังเกตได้ในการประชุม การสนทนา และการรับข้อเสนอแนะ", eligibleForAllowance: false },
  { id: "core-service-mind", name: "จิตบริการและความใส่ใจผู้อื่น", target: "ระดับ 4 จาก 5", targetLevel: 4, category: "collaboration", description: "เข้าใจความต้องการและช่วยให้ผู้รับงานหรือลูกค้าได้รับผลลัพธ์ที่ดี", evidence: "ผลตอบรับ การแก้ปัญหา และความครบถ้วนของการส่งมอบ", eligibleForAllowance: false },
  { id: "core-integrity", name: "ความซื่อสัตย์และจริยธรรม", target: "ระดับ 5 จาก 5", targetLevel: 5, category: "professionalism", description: "รายงานข้อเท็จจริง โปร่งใส และไม่ใช้ตำแหน่งหรือข้อมูลอย่างไม่เหมาะสม", evidence: "เหตุการณ์และการตัดสินใจที่ตรวจสอบได้ ไม่ใช้ความรู้สึกส่วนตัว", eligibleForAllowance: false },
  { id: "core-compliance", name: "การปฏิบัติตามกฎและรักษาความลับ", target: "ระดับ 4 จาก 5", targetLevel: 4, category: "professionalism", description: "ปฏิบัติตามนโยบาย ความปลอดภัย และคุ้มครองข้อมูลของบริษัทกับลูกค้า", evidence: "การผ่านอบรม เหตุการณ์ความปลอดภัย และการจัดการข้อมูล", eligibleForAllowance: false },
  { id: "core-emotional-maturity", name: "วุฒิภาวะและการจัดการอารมณ์", target: "ระดับ 4 จาก 5", targetLevel: 4, category: "professionalism", description: "รับมือความกดดัน รับฟังความเห็นต่าง และตอบสนองอย่างสร้างสรรค์", evidence: "พฤติกรรมที่สังเกตได้เมื่อมีความขัดแย้ง งานเร่งด่วน หรือข้อเสนอแนะ", eligibleForAllowance: false },
  { id: "core-adaptability", name: "การปรับตัวต่อการเปลี่ยนแปลง", target: "ระดับ 3 จาก 5", targetLevel: 3, category: "growth", description: "ปรับวิธีทำงานเมื่อเป้าหมาย เครื่องมือ หรือสถานการณ์เปลี่ยน", evidence: "การรับบทบาทใหม่ การใช้เครื่องมือใหม่ และผลลัพธ์หลังปรับแผน", eligibleForAllowance: false },
  { id: "core-learning", name: "การเรียนรู้และพัฒนาตนเอง", target: "ระดับ 3 จาก 5", targetLevel: 3, category: "growth", description: "ค้นหาความรู้ ฝึกฝน และนำสิ่งที่เรียนมาใช้กับงานจริง", evidence: "ผลทดสอบ หลักสูตร ผลงานก่อน–หลัง และการแบ่งปันความรู้", eligibleForAllowance: false },
  { id: "core-initiative", name: "ความคิดริเริ่มและการแก้ปัญหา", target: "ระดับ 3 จาก 5", targetLevel: 3, category: "growth", description: "มองเห็นปัญหา เสนอทางเลือก และลงมือปรับปรุงโดยไม่ต้องรอคำสั่งทุกขั้น", evidence: "ข้อเสนอปรับปรุง การทดลอง และผลลัพธ์ที่วัดได้", eligibleForAllowance: false },
];

function completeSkillFramework(roleSkills: SkillTemplate[], aiSkill = aiWorkMastery()) {
  return [
    ...roleSkills.map((skill) => ({
      ...skill,
      category: "role" as const,
      description: skill.description ?? "ประยุกต์ความรู้เฉพาะทางเพื่อส่งมอบผลงานตามมาตรฐานของตำแหน่ง",
      evidence: skill.evidence ?? "ผลทดสอบ ตัวอย่างผลงาน คุณภาพการส่งมอบ และผลตอบรับจากผู้ตรวจงาน",
      eligibleForAllowance: skill.eligibleForAllowance ?? true,
    })),
    ...coreCompetencies,
    aiSkill,
  ];
}

export function calculateSkillScore(role: RoleTemplate, scores: Record<string, number>) {
  return skillCategories.reduce((total, category) => {
    const skills = role.skills.filter((skill) => (skill.category ?? "role") === category.id);
    if (!skills.length) return total;
    const categoryScore = skills.reduce((sum, skill) => sum + Math.max(0, Math.min(5, Number(scores[skill.id]) || 0)), 0) / skills.length / 5 * 100;
    return total + categoryScore * category.weight / 100;
  }, 0);
}

export type RoleTemplate = {
  id: string;
  baseRoleId?: string;
  name: string;
  shortName: string;
  department: string;
  departmentId: string;
  trend: number;
  kpis: KpiTemplate[];
  skills: SkillTemplate[];
};

export type EmployeeRecord = {
  id: string;
  initials: string;
  name: string;
  email: string;
  roleId: string;
  positionTitle: string;
  manager: string;
  status: "active" | "inactive" | "resigned" | "archived";
  latestScore: number | null;
  latestSkillScore: number | null;
  latestPeriod: string | null;
  updatedAt: string;
};

export type EmployeePositionEventRecord = {
  id: string;
  employeeId: string;
  employeeNameSnapshot: string;
  roleIdSnapshot: string;
  previousPositionTitle: string;
  nextPositionTitle: string;
  expectedUpdatedAt: string;
  resultingUpdatedAt: string;
  actorUserId: string;
  actorName: string;
  createdAt: string;
};

export type UserAccountRecord = {
  id: string;
  authUserId: string;
  email: string;
  displayName: string;
  nickname: string;
  role: "admin" | "manager" | "employee";
  employeeId: string | null;
  departmentId: string;
  status: "active" | "inactive";
  lastLoginAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type HrProfileRecord = {
  employeeId: string;
  currentSalary: number;
  salaryReviewMonth: string;
  updatedAt: string;
};

export type AttendanceRecord = {
  id: string;
  employeeId: string;
  workDate: string;
  status: "present" | "late" | "absent" | "leave";
  clockIn: string | null;
  clockOut: string | null;
  minutesLate: number;
  leaveType: "sick" | "personal" | "vacation" | "other" | null;
  note: string;
  approvalStatus: "not_required" | "pending" | "approved" | "rejected";
  approvedBy: string | null;
  approvedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type SkillAchievementRecord = {
  id: string;
  employeeId: string;
  roleId: string;
  skillId: string;
  skillName: string;
  level: number;
  monthlyAllowance: number;
  verifiedBy: string;
  verifiedAt: string;
  evidenceUrl: string;
  note: string;
  createdAt: string;
};

export type TalentActionRecord = {
  id: string;
  employeeId: string;
  type: "skill_test" | "upskill" | "role_review" | "salary_review";
  title: string;
  status: "planned" | "in_progress" | "completed";
  score: number | null;
  dueDate: string;
  targetRoleId: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectRecord = {
  id: string;
  name: string;
  description: string;
  ownerEmployeeId: string;
  departmentId: string;
  status: "planned" | "active" | "on_hold" | "completed";
  dueDate: string;
  color: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkItemRecord = {
  id: string;
  projectId: string;
  assigneeEmployeeId: string;
  createdByEmployeeId: string | null;
  kind: "task" | "request" | "mission";
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "urgent";
  status: "todo" | "in_progress" | "review" | "done";
  progress: number;
  points: number;
  dueDate: string;
  createdAt: string;
  updatedAt: string;
};

export type NotificationReadRecord = {
  id: string;
  userKey: string;
  notificationId: string;
  readAt: string;
};

export type RewardRecord = {
  id: string;
  title: string;
  description: string;
  category: "perk" | "learning" | "wellbeing" | "recognition";
  costPoints: number;
  stock: number;
  inventoryVersion?: number;
  icon: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type QuestRecord = {
  id: string;
  type: "individual" | "team" | "activity";
  title: string;
  description: string;
  status: "draft" | "active" | "completed" | "archived";
  progress: number;
  pointsReward: number;
  rewardId: string | null;
  rewardTitleSnapshot: string;
  rewardIconSnapshot: string;
  isFeatured: boolean;
  startDate: string;
  endDate: string;
  revision: number;
  createdByUserId?: string;
  createdByName?: string;
  updatedByUserId?: string;
  updatedByName?: string;
  createdAt: string;
  updatedAt: string;
  targetEmployeeIds: string[];
  targetDepartmentIds: string[];
  targetEmployees: Array<{ id: string; label: string }>;
  targetDepartments: Array<{ id: string; label: string }>;
  pointsAwardMode: "admin_verified_completion";
  rewardFulfillmentMode: "admin_verified_completion" | "none";
  fulfillmentNotice: string;
};

export type QuestCompletionRecord = {
  id: string;
  questId: string;
  employeeId: string;
  completionDate: string;
  questRevision: number;
  questUpdatedAt: string;
  questTypeSnapshot: "individual" | "team" | "activity";
  questTitleSnapshot: string;
  questDescriptionSnapshot: string;
  questStartDateSnapshot: string;
  questEndDateSnapshot: string;
  pointsAwarded: number;
  rewardId: string | null;
  rewardTitleSnapshot: string;
  rewardIconSnapshot: string;
  rewardInventoryVersion: number | null;
  employeeNameSnapshot: string;
  employeeRoleIdSnapshot: string;
  employeeDepartmentIdSnapshot: string;
  employeeDepartmentNameSnapshot: string;
  evidenceUrl: string;
  note: string;
  pointEventId: string;
  pointLedgerId: string;
  policyId: string;
  policyVersion: number;
  policyContentHash: string;
  questPointPolicyLimit: number;
  maxManualQuestCompletions: number;
  standardEarnMonthlyCap: number;
  completedByUserId?: string;
  completedByName: string;
  completedAt: string;
};

export type PointLedgerRecord = {
  id: string;
  employeeId: string;
  sourceType: "task" | "mission" | "quest" | "evaluation" | "attendance" | "deadline" | "quality" | "discipline" | "bonus" | "redemption";
  sourceId: string;
  points: number;
  note: string;
  policyId?: string | null;
  policyVersion?: number | null;
  policyContentHash?: string | null;
  createdAt: string;
};

export type PointEventType = "monthly_evaluation" | "attendance_on_time" | "attendance_late" | "absence" | "approved_leave" | "early_finish" | "on_time_finish" | "work_error" | "warning" | "rule_violation" | "bonus" | "quest";

export type PointEventRecord = {
  id: string;
  employeeId: string;
  eventType: PointEventType;
  points: number;
  eventDate: string;
  note: string;
  evidenceUrl: string;
  recordedBy: string;
  policyId?: string | null;
  policyVersion?: number | null;
  policyContentHash?: string | null;
  createdAt: string;
};

export type PointEventRule = {
  label: string;
  points: number | null;
  description: string;
  sourceType: PointLedgerRecord["sourceType"];
  entryMode: "automatic" | "manual";
  requiresEvidence: boolean;
  authorizedRoles: ("admin" | "manager")[];
};

export type PointPolicyRules = {
  economy: {
    monthlyEvaluationMinimumScore: number;
    monthlyEvaluationBaseScore: number;
    monthlyEvaluationMultiplier: number;
    monthlyEvaluationCap: number;
    positiveManualEventsPerMonth: number;
    attendanceDaysPerMonth: number;
    negativePointsPerMonthCap: number;
    deadlineBonusMonthlyCap: number;
    workAwardsMonthlyCap: number;
    standardEarnMonthlyCap: number;
  };
  workAwards: Record<WorkItemRecord["kind"], Record<WorkItemRecord["priority"], number>>;
  events: Record<PointEventType, PointEventRule>;
  redemption: {
    maxRedemptionsPerMonth: number;
    cooldownDays: number;
    minimumBalanceAfterRedemption: number;
    acknowledgementRequired: boolean;
  };
};

export const defaultPointPolicyRules: PointPolicyRules = {
  economy: {
    monthlyEvaluationMinimumScore: 70,
    monthlyEvaluationBaseScore: 60,
    monthlyEvaluationMultiplier: 6,
    monthlyEvaluationCap: 240,
    positiveManualEventsPerMonth: 2,
    attendanceDaysPerMonth: 22,
    negativePointsPerMonthCap: 200,
    deadlineBonusMonthlyCap: 80,
    workAwardsMonthlyCap: 420,
    standardEarnMonthlyCap: 900,
  },
  workAwards: {
    task: { low: 10, medium: 20, high: 35, urgent: 50 },
    request: { low: 15, medium: 25, high: 40, urgent: 60 },
    mission: { low: 40, medium: 60, high: 90, urgent: 120 },
  },
  events: {
    monthly_evaluation: { label: "Points จากผลประเมินประจำเดือน", points: null, description: "ผ่านเกณฑ์ 70 คะแนน แล้วคำนวณ (คะแนน − 60) × 6 สูงสุด 240 Points", sourceType: "evaluation", entryMode: "automatic", requiresEvidence: false, authorizedRoles: ["admin"] },
    attendance_on_time: { label: "เข้างานตรงเวลา", points: 5, description: "ให้ได้วันละครั้ง สูงสุด 22 วัน หรือ 110 Points ต่อเดือน", sourceType: "attendance", entryMode: "manual", requiresEvidence: false, authorizedRoles: ["admin", "manager"] },
    attendance_late: { label: "มาสาย", points: -20, description: "หัก Points เมื่อมาสายตามข้อมูลลงเวลาที่ตรวจสอบแล้ว", sourceType: "attendance", entryMode: "manual", requiresEvidence: false, authorizedRoles: ["admin", "manager"] },
    absence: { label: "ขาดงานโดยไม่ได้รับอนุมัติ", points: -120, description: "ใช้เฉพาะกรณีขาดงานที่ตรวจสอบแล้ว", sourceType: "attendance", entryMode: "manual", requiresEvidence: true, authorizedRoles: ["admin", "manager"] },
    approved_leave: { label: "ลาที่ได้รับอนุมัติ", points: 0, description: "บันทึกไว้ตรวจสอบโดยไม่หัก Points", sourceType: "attendance", entryMode: "manual", requiresEvidence: false, authorizedRoles: ["admin", "manager"] },
    early_finish: { label: "ส่งงานก่อนกำหนด", points: 25, description: "โบนัสอัตโนมัติเมื่อหลักฐานผ่านการตรวจและเสร็จก่อนกำหนด", sourceType: "deadline", entryMode: "automatic", requiresEvidence: true, authorizedRoles: ["admin", "manager"] },
    on_time_finish: { label: "ส่งงานตรงกำหนด", points: 15, description: "โบนัสอัตโนมัติเมื่อหลักฐานผ่านการตรวจภายในวันกำหนด", sourceType: "deadline", entryMode: "automatic", requiresEvidence: true, authorizedRoles: ["admin", "manager"] },
    work_error: { label: "งานผิดพลาด", points: -40, description: "หัก Points พร้อมระบุข้อผิดพลาด ผลกระทบ แนวทางแก้ไข และหลักฐาน", sourceType: "quality", entryMode: "manual", requiresEvidence: true, authorizedRoles: ["admin", "manager"] },
    warning: { label: "ได้รับใบเตือน", points: -150, description: "ต้องผ่านการตรวจข้อเท็จจริงและแนบเอกสารอ้างอิงโดย HR", sourceType: "discipline", entryMode: "manual", requiresEvidence: true, authorizedRoles: ["admin"] },
    rule_violation: { label: "ผิดกฎระเบียบการทำงาน", points: -100, description: "บันทึกหลังตรวจสอบข้อเท็จจริงตามระเบียบบริษัทโดย HR", sourceType: "discipline", entryMode: "manual", requiresEvidence: true, authorizedRoles: ["admin"] },
    bonus: { label: "โบนัสพิเศษ", points: 50, description: "ต้องมีหลักฐาน และให้ได้ไม่เกิน 2 ครั้งต่อเดือน", sourceType: "bonus", entryMode: "manual", requiresEvidence: true, authorizedRoles: ["admin", "manager"] },
    quest: { label: "ทำเควสต์สำเร็จ", points: 75, description: "ต้องมีหลักฐาน ผ่านการตรวจ และให้ได้ไม่เกิน 2 ครั้งต่อเดือน", sourceType: "quest", entryMode: "manual", requiresEvidence: true, authorizedRoles: ["admin", "manager"] },
  },
  redemption: {
    maxRedemptionsPerMonth: 2,
    cooldownDays: 7,
    minimumBalanceAfterRedemption: 0,
    acknowledgementRequired: true,
  },
};

export const pointEconomyPolicy = defaultPointPolicyRules.economy;
export const workPointAwards = defaultPointPolicyRules.workAwards;
export const pointEventRules = defaultPointPolicyRules.events;

function finiteNumber(value: unknown, fallback: number, minimum: number, maximum: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}

export function resolvePointPolicyRules(value: unknown): PointPolicyRules {
  if (!value || typeof value !== "object") return defaultPointPolicyRules;
  const input = value as Partial<PointPolicyRules>;
  const economy = input.economy ?? defaultPointPolicyRules.economy;
  const redemption = input.redemption ?? defaultPointPolicyRules.redemption;
  const resolved: PointPolicyRules = structuredClone(defaultPointPolicyRules);
  resolved.economy = {
    monthlyEvaluationMinimumScore: finiteNumber(economy.monthlyEvaluationMinimumScore, resolved.economy.monthlyEvaluationMinimumScore, 0, 100),
    monthlyEvaluationBaseScore: finiteNumber(economy.monthlyEvaluationBaseScore, resolved.economy.monthlyEvaluationBaseScore, 0, 100),
    monthlyEvaluationMultiplier: finiteNumber(economy.monthlyEvaluationMultiplier, resolved.economy.monthlyEvaluationMultiplier, 0, 100),
    monthlyEvaluationCap: finiteNumber(economy.monthlyEvaluationCap, resolved.economy.monthlyEvaluationCap, 0, 10000),
    positiveManualEventsPerMonth: Math.round(finiteNumber(economy.positiveManualEventsPerMonth, resolved.economy.positiveManualEventsPerMonth, 0, 31)),
    attendanceDaysPerMonth: Math.round(finiteNumber(economy.attendanceDaysPerMonth, resolved.economy.attendanceDaysPerMonth, 0, 31)),
    negativePointsPerMonthCap: Math.round(finiteNumber(economy.negativePointsPerMonthCap, resolved.economy.negativePointsPerMonthCap, 0, 10000)),
    deadlineBonusMonthlyCap: Math.round(finiteNumber(economy.deadlineBonusMonthlyCap, resolved.economy.deadlineBonusMonthlyCap, 0, 10000)),
    workAwardsMonthlyCap: Math.round(finiteNumber(economy.workAwardsMonthlyCap, resolved.economy.workAwardsMonthlyCap, 0, 10000)),
    standardEarnMonthlyCap: Math.round(finiteNumber(economy.standardEarnMonthlyCap, resolved.economy.standardEarnMonthlyCap, 0, 10000)),
  };
  for (const kind of ["task", "request", "mission"] as const) {
    for (const priority of ["low", "medium", "high", "urgent"] as const) {
      resolved.workAwards[kind][priority] = Math.round(finiteNumber(input.workAwards?.[kind]?.[priority], resolved.workAwards[kind][priority], 0, 10000));
    }
  }
  for (const eventType of Object.keys(defaultPointPolicyRules.events) as PointEventType[]) {
    const candidate = input.events?.[eventType];
    if (!candidate) continue;
    resolved.events[eventType] = {
      ...resolved.events[eventType],
      label: typeof candidate.label === "string" ? candidate.label.slice(0, 160) : resolved.events[eventType].label,
      description: typeof candidate.description === "string" ? candidate.description.slice(0, 1000) : resolved.events[eventType].description,
      points: candidate.points === null && eventType === "monthly_evaluation" ? null : Math.round(finiteNumber(candidate.points, resolved.events[eventType].points ?? 0, -10000, 10000)),
    };
  }
  resolved.redemption = {
    maxRedemptionsPerMonth: Math.round(finiteNumber(redemption.maxRedemptionsPerMonth, resolved.redemption.maxRedemptionsPerMonth, 0, 31)),
    cooldownDays: Math.round(finiteNumber(redemption.cooldownDays, resolved.redemption.cooldownDays, 0, 365)),
    minimumBalanceAfterRedemption: Math.round(finiteNumber(redemption.minimumBalanceAfterRedemption, resolved.redemption.minimumBalanceAfterRedemption, 0, 1000000)),
    acknowledgementRequired: typeof redemption.acknowledgementRequired === "boolean" ? redemption.acknowledgementRequired : resolved.redemption.acknowledgementRequired,
  };
  return resolved;
}

export function workPointValue(kind: WorkItemRecord["kind"], priority: WorkItemRecord["priority"], rules: PointPolicyRules = defaultPointPolicyRules) {
  return rules.workAwards[kind]?.[priority] ?? rules.workAwards.task.medium;
}

export function monthlyEvaluationPoints(totalScore: number, rules: PointPolicyRules = defaultPointPolicyRules) {
  const policy = rules.economy;
  if (totalScore < policy.monthlyEvaluationMinimumScore) return 0;
  return Math.min(
    policy.monthlyEvaluationCap,
    Math.max(0, Math.round((totalScore - policy.monthlyEvaluationBaseScore) * policy.monthlyEvaluationMultiplier)),
  );
}

export type OrganizationPolicyRecord = {
  id: string;
  code: string;
  title: string;
  summary: string;
  content: string;
  category: "work_rules" | "points_rewards" | "ai_data" | "other";
  status: "draft" | "published";
  version: number;
  effectiveDate: string;
  effectiveTo: string | null;
  scopeType: "all" | "department" | "role" | "employment_type";
  scopeValues: string[];
  acknowledgementRequired: boolean;
  acknowledgementDueDays: number;
  rules: PointPolicyRules | null;
  contentHash: string;
  publishedAt: string | null;
  publishedBy: string | null;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
};

export type PolicyAcknowledgementRecord = {
  id: string;
  policyId: string;
  employeeId: string;
  userAccountId: string | null;
  policyVersion: number;
  contentHash: string;
  acknowledgementText: string;
  acknowledgedName: string;
  acknowledgedEmail: string;
  authenticatedUserId: string;
  acknowledgedAt: string;
};

export type RewardRedemptionRecord = {
  id: string;
  employeeId: string;
  rewardId: string;
  pointsSpent: number;
  status: "requested" | "approved" | "fulfilled" | "cancelled";
  createdAt: string;
  updatedAt: string;
};

export type EmployeeProfileRecord = {
  employeeId: string;
  personalEmail: string;
  phone: string;
  birthDate: string;
  nationalIdLast4: string;
  address: string;
  emergencyName: string;
  emergencyPhone: string;
  startDate: string;
  employmentType: "permanent" | "contract" | "probation" | "intern";
  education: string;
  experienceYears: number;
  applicationSource: string;
  profileImageKey?: string;
  profileImageContentType?: string;
  profileImageUpdatedAt?: string | null;
  updatedAt: string;
};

export type WorkSubmissionRecord = {
  id: string;
  workItemId: string;
  employeeId: string;
  submissionType: "video" | "drive" | "social" | "document" | "design" | "code" | "sales" | "service" | "hr" | "other";
  title: string;
  linkUrl: string;
  note: string;
  fileName: string;
  storageKey: string;
  contentType: string;
  sizeBytes: number;
  status: "submitted" | "approved" | "revision";
  submittedBy: string;
  submittedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewerNote: string;
};

export type ApplicationDocumentRecord = {
  id: string;
  employeeId: string;
  documentType: "resume" | "id_card" | "house_registration" | "transcript" | "portfolio" | "bank_account" | "medical_certificate" | "contract" | "other";
  title: string;
  fileName: string;
  storageKey: string;
  contentType: string;
  sizeBytes: number;
  status: "pending" | "verified" | "rejected";
  note: string;
  uploadedBy: string;
  uploadedAt: string;
  verifiedBy: string | null;
  verifiedAt: string | null;
};

export type EmploymentContractRecord = {
  id: string;
  employeeId: string;
  documentId: string | null;
  title: string;
  version: string;
  status: "draft" | "sent" | "viewed" | "signed" | "cancelled";
  effectiveDate: string;
  expiryDate: string | null;
  sentAt: string | null;
  signedName: string | null;
  signedAt: string | null;
  consentText: string;
  signerUserId: string | null;
  signerEmail: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type OrganizationDocumentRecord = {
  id: string;
  title: string;
  category: "lease" | "employment" | "hr" | "legal" | "finance" | "operations" | "other";
  description: string;
  documentNumber: string;
  version: string;
  status: "draft" | "active" | "expired" | "archived";
  owner: string;
  effectiveDate: string;
  expiryDate: string | null;
  note: string;
  fileName: string;
  storageKey: string;
  contentType: string;
  sizeBytes: number;
  revision: number;
  createdByUserId: string;
  createdBy: string;
  createdAt: string;
  updatedByUserId: string;
  updatedBy: string;
  updatedAt: string;
};

export type OrganizationDocumentDto = Omit<OrganizationDocumentRecord, "storageKey"> & { hasFile: boolean };

export type EmployeeWarningRecord = {
  id: string;
  employeeId: string;
  warningNumber: string;
  level: "first" | "second" | "final";
  subject: string;
  incidentDate: string;
  issuedDate: string;
  facts: string;
  correctiveAction: string;
  reviewDate: string | null;
  employeeStatement: string;
  status: "draft" | "issued" | "acknowledged" | "resolved" | "withdrawn";
  fileName: string;
  storageKey: string;
  contentType: string;
  sizeBytes: number;
  revision: number;
  issuedBy: string | null;
  issuedAt: string | null;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  withdrawnBy: string | null;
  withdrawnAt: string | null;
  createdByUserId: string;
  createdBy: string;
  createdAt: string;
  updatedByUserId: string;
  updatedBy: string;
  updatedAt: string;
};

export type EmployeeWarningDto = Omit<EmployeeWarningRecord, "storageKey"> & { hasFile: boolean };

export type EmployeeWarningEventRecord = {
  id: string;
  warningId: string;
  eventType: "created" | "updated" | "issued" | "acknowledged" | "resolved" | "withdrawn";
  actorUserId: string;
  actorName: string;
  note: string;
  createdAt: string;
};

export type EmployeeRecognitionRecord = {
  id: string;
  employeeId: string;
  recognitionType: "certificate" | "award" | "honor" | "training" | "license" | "other";
  title: string;
  issuer: string;
  issuedDate: string;
  expiryDate: string | null;
  credentialId: string;
  verificationUrl: string;
  description: string;
  status: "active" | "expired" | "revoked";
  fileName: string;
  storageKey: string;
  contentType: string;
  sizeBytes: number;
  revision: number;
  createdByUserId: string;
  createdBy: string;
  createdAt: string;
  updatedByUserId: string;
  updatedBy: string;
  updatedAt: string;
};

export type EmployeeRecognitionDto = Omit<EmployeeRecognitionRecord, "storageKey"> & { hasFile: boolean };

export type EvaluationRecord = {
  id: string;
  employeeId: string;
  period: string;
  kpiScores: Record<string, number>;
  skillScores: Record<string, number>;
  kpiScore: number;
  skillScore: number;
  totalScore: number;
  note: string;
  evaluator: string;
  evaluatedAt: string;
};

export type EmployeeSelfAssessmentRecord = {
  id: string;
  employeeId: string;
  period: string;
  kpiScores: Record<string, number>;
  skillScores: Record<string, number>;
  kpiScore: number;
  skillScore: number;
  totalScore: number;
  note: string;
  submittedAt: string;
  updatedAt: string;
};

export const periods = [
  "ไตรมาส 3 · ปี 2569",
  "ไตรมาส 2 · ปี 2569",
  "ไตรมาส 1 · ปี 2569",
];

const legacyRoles: RoleTemplate[] = [
  {
    id: "sales-manager",
    name: "ผู้จัดการฝ่ายขาย",
    shortName: "ฝ่ายขาย",
    department: "ฝ่ายขาย",
    departmentId: "sales",
    trend: 4.8,
    kpis: [
      { id: "sales-target", name: "ยอดขายเทียบเป้าหมาย", weight: 40, target: "≥ 100%" },
      { id: "close-rate", name: "อัตราปิดการขาย", weight: 25, target: "≥ 32%" },
      { id: "retention", name: "การรักษาลูกค้า", weight: 20, target: "≥ 90%" },
      { id: "team-growth", name: "การพัฒนาและบริหารทีม", weight: 15, target: "≥ 85%" },
    ],
    skills: completeSkillFramework([
      { id: "negotiation", name: "การเจรจาต่อรอง", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "forecasting", name: "การวางแผนยอดขาย", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "coaching", name: "การโค้ชทีม", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "customer-insight", name: "ความเข้าใจลูกค้า", target: "ระดับ 4 จาก 5", targetLevel: 4 },
    ]),
  },
  {
    id: "marketing",
    name: "เจ้าหน้าที่การตลาด",
    shortName: "การตลาด",
    department: "การตลาด",
    departmentId: "marketing",
    trend: 3.6,
    kpis: [
      { id: "qualified-leads", name: "จำนวนลีดคุณภาพ", weight: 35, target: "≥ 240 ราย" },
      { id: "cost-per-lead", name: "ต้นทุนต่อหนึ่งลีด", weight: 25, target: "≤ 420 บาท" },
      { id: "engagement", name: "อัตราการมีส่วนร่วม", weight: 20, target: "≥ 6.5%" },
      { id: "campaign-delivery", name: "แคมเปญเสร็จตามแผน", weight: 20, target: "≥ 90%" },
    ],
    skills: completeSkillFramework([
      { id: "campaign-strategy", name: "กลยุทธ์แคมเปญ", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "analytics", name: "การวิเคราะห์ข้อมูล", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "content", name: "การสื่อสารเนื้อหา", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "experimentation", name: "การทดลองและเรียนรู้", target: "ระดับ 3 จาก 5", targetLevel: 3 },
    ]),
  },
  {
    id: "customer-service",
    name: "เจ้าหน้าที่บริการลูกค้า",
    shortName: "ฝ่ายบริการ",
    department: "บริการลูกค้า",
    departmentId: "service",
    trend: 1.4,
    kpis: [
      { id: "csat", name: "คะแนนความพึงพอใจ", weight: 35, target: "≥ 4.6/5" },
      { id: "first-response", name: "เวลาตอบกลับครั้งแรก", weight: 25, target: "≤ 8 นาที" },
      { id: "first-contact", name: "แก้ปัญหาในการติดต่อครั้งแรก", weight: 25, target: "≥ 82%" },
      { id: "service-quality", name: "คุณภาพการให้บริการ", weight: 15, target: "≥ 88%" },
    ],
    skills: completeSkillFramework([
      { id: "empathy", name: "ความเข้าอกเข้าใจ", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "problem-solving", name: "การแก้ปัญหา", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "product-knowledge", name: "ความรู้ผลิตภัณฑ์", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "communication", name: "การสื่อสาร", target: "ระดับ 4 จาก 5", targetLevel: 4 },
    ]),
  },
  {
    id: "developer",
    name: "นักพัฒนาซอฟต์แวร์",
    shortName: "เทคโนโลยี",
    department: "เทคโนโลยี",
    departmentId: "technology",
    trend: 4.1,
    kpis: [
      { id: "delivery", name: "งานส่งมอบตรงรอบ", weight: 30, target: "≥ 90%" },
      { id: "code-quality", name: "คุณภาพโค้ด", weight: 30, target: "Defect ≤ 2%" },
      { id: "reliability", name: "ความเสถียรของระบบ", weight: 25, target: "≥ 99.9%" },
      { id: "knowledge-sharing", name: "การแบ่งปันความรู้", weight: 15, target: "≥ 2 ครั้ง/ไตรมาส" },
    ],
    skills: completeSkillFramework([
      { id: "engineering", name: "ทักษะวิศวกรรมซอฟต์แวร์", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "system-design", name: "การออกแบบระบบ", target: "ระดับ 3 จาก 5", targetLevel: 3 },
      { id: "quality", name: "การประกันคุณภาพ", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "collaboration", name: "การทำงานร่วมกัน", target: "ระดับ 4 จาก 5", targetLevel: 4 },
    ]),
  },
  {
    id: "video-editor",
    name: "นักตัดต่อวิดีโอ",
    shortName: "ครีเอทีฟ",
    department: "ครีเอทีฟและโปรดักชัน",
    departmentId: "creative",
    trend: 3.4,
    kpis: [
      { id: "edit-delivery", name: "ส่งงานตัดต่อตรงเวลา", weight: 30, target: "≥ 95%" },
      { id: "revision-rate", name: "จำนวนรอบแก้ไขเฉลี่ย", weight: 25, target: "≤ 2 รอบ" },
      { id: "quality-approval", name: "งานผ่านคุณภาพครั้งแรก", weight: 25, target: "≥ 85%" },
      { id: "content-performance", name: "ผลงานคอนเทนต์หลังเผยแพร่", weight: 20, target: "ตามเป้าแคมเปญ" },
    ],
    skills: completeSkillFramework([
      { id: "video-editing", name: "การตัดต่อและเล่าเรื่อง", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "motion-graphics", name: "โมชั่นกราฟิก", target: "ระดับ 3 จาก 5", targetLevel: 3 },
      { id: "sound-design", name: "การออกแบบเสียง", target: "ระดับ 3 จาก 5", targetLevel: 3 },
      { id: "creative-collaboration", name: "การทำงานร่วมกับทีมครีเอทีฟ", target: "ระดับ 4 จาก 5", targetLevel: 4 },
    ]),
  },
  {
    id: "hr",
    name: "เจ้าหน้าที่ทรัพยากรบุคคล",
    shortName: "บุคคล",
    department: "ทรัพยากรบุคคล",
    departmentId: "people",
    trend: 2.2,
    kpis: [
      { id: "time-to-hire", name: "ระยะเวลาสรรหาเฉลี่ย", weight: 30, target: "≤ 28 วัน" },
      { id: "retention", name: "อัตราคงอยู่ของพนักงาน", weight: 30, target: "≥ 92%" },
      { id: "engagement", name: "ความผูกพันต่อองค์กร", weight: 25, target: "≥ 80%" },
      { id: "development-plan", name: "แผนพัฒนาที่เสร็จตามกำหนด", weight: 15, target: "≥ 90%" },
    ],
    skills: completeSkillFramework([
      { id: "people-analytics", name: "การวิเคราะห์ข้อมูลบุคลากร", target: "ระดับ 3 จาก 5", targetLevel: 3 },
      { id: "labor-practice", name: "งานบุคคลและข้อกำหนด", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "facilitation", name: "การอำนวยความร่วมมือ", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "talent-development", name: "การพัฒนาบุคลากร", target: "ระดับ 4 จาก 5", targetLevel: 4 },
    ]),
  },
];

const previousRoles: RoleTemplate[] = [
  {
    id: "growth-commerce-manager",
    name: "ผู้จัดการทีมหน้าบ้านและการเติบโต",
    shortName: "Growth Lead",
    department: "ทีมหน้าบ้านและการเติบโต",
    departmentId: "growth-commerce",
    trend: 4.8,
    kpis: [
      { id: "growth-team-revenue", name: "รายได้สุทธิของทีมเทียบเป้าหมาย", weight: 30, target: "ตามเป้ารายเดือนที่อนุมัติ" },
      { id: "growth-contribution-margin", name: "กำไรส่วนเพิ่มหลังหักค่าโฆษณา", weight: 25, target: "ดีขึ้นจากฐานเดิม" },
      { id: "growth-experiment-velocity", name: "การทดลองที่สรุปผลและนำไปใช้", weight: 20, target: "≥ 4 การทดลอง/เดือน" },
      { id: "growth-team-readiness", name: "ความพร้อมและการพัฒนาสกิลทีม", weight: 25, target: "≥ 85%" },
    ],
    skills: completeSkillFramework([
      { id: "growth-strategy", name: "การวางกลยุทธ์ Growth", target: "ระดับ 5 จาก 5", targetLevel: 5, description: "แปลงเป้ารายได้เป็นกลยุทธ์ ช่องทาง และแผนลงมือทำของทีม" },
      { id: "funnel-management", name: "การบริหาร Funnel ตั้งแต่เข้าชมถึงซื้อซ้ำ", target: "ระดับ 4 จาก 5", targetLevel: 4, description: "มองเห็นคอขวดและเชื่อมงานคอนเทนต์ โฆษณา ร้านค้า และ CRM เข้าด้วยกัน" },
      { id: "revenue-profit-analysis", name: "การวิเคราะห์รายได้ กำไร และ Unit Economics", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "forecast-budget", name: "การพยากรณ์ยอดและจัดสรรงบ", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "experiment-management", name: "การออกแบบและบริหารการทดลอง", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "team-coaching", name: "การโค้ชและยกระดับคนในทีม", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "work-prioritization", name: "การจัดลำดับงานตามผลกระทบ", target: "ระดับ 5 จาก 5", targetLevel: 5 },
      { id: "cross-functional-leadership", name: "การนำทีมข้ามสายงาน", target: "ระดับ 4 จาก 5", targetLevel: 4 },
    ], aiWorkMastery(4, "AI Forecast, Funnel หรือ Experiment Decision Brief พร้อม SOP ของทีม จุดอนุมัติของมนุษย์ และผลต่อรายได้หรือกำไร")),
  },
  {
    id: "customer-insight-marketer",
    name: "นักการตลาดด้าน Customer Insight",
    shortName: "Insight",
    department: "ทีมหน้าบ้านและการเติบโต",
    departmentId: "growth-commerce",
    trend: 4.2,
    kpis: [
      { id: "insight-qualified-findings", name: "Insight ที่นำไปใช้กับแคมเปญได้", weight: 30, target: "≥ 4 ชุด/เดือน" },
      { id: "insight-content-win-rate", name: "อัตราคอนเทนต์จาก Insight ที่ผ่านเกณฑ์", weight: 25, target: "ดีขึ้นจากฐานเดิม" },
      { id: "insight-research-coverage", name: "ความครอบคลุมเสียงลูกค้าและคู่แข่ง", weight: 25, target: "ครบตามแผนรายเดือน" },
      { id: "insight-brief-delivery", name: "ส่ง Creative Brief ตรงเวลาและครบถ้วน", weight: 20, target: "≥ 95%" },
    ],
    skills: completeSkillFramework([
      { id: "voice-of-customer-research", name: "การวิจัยเสียงและปัญหาของลูกค้า", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "market-competitor-analysis", name: "การวิเคราะห์ตลาดและคู่แข่ง", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "customer-segmentation", name: "การแบ่งกลุ่มลูกค้าและ Persona", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "content-strategy", name: "กลยุทธ์คอนเทนต์ตาม Customer Journey", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "hook-storytelling", name: "การหา Hook และเล่าเรื่องให้ตรงกลุ่ม", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "creative-briefing", name: "การเขียน Creative Brief ที่นำไปผลิตได้", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "content-performance-analysis", name: "การอ่านผลคอนเทนต์และสรุปบทเรียน", target: "ระดับ 4 จาก 5", targetLevel: 4 },
    ], aiWorkMastery(3, "Workflow วิเคราะห์ VOC หรือจัดกลุ่ม Insight ที่ย้อนกลับไปหาแหล่งข้อมูลได้ พร้อม Creative Brief ที่ทีมได้นำไปใช้")),
  },
  {
    id: "offer-conversion-marketer",
    name: "นักการตลาดด้าน Offer & Conversion",
    shortName: "Conversion",
    department: "ทีมหน้าบ้านและการเติบโต",
    departmentId: "growth-commerce",
    trend: 4.5,
    kpis: [
      { id: "conversion-rate-lift", name: "อัตรา Conversion ดีขึ้นจากฐานเดิม", weight: 30, target: "ดีขึ้นต่อเนื่อง" },
      { id: "average-order-value", name: "มูลค่าคำสั่งซื้อเฉลี่ย", weight: 25, target: "ตามเป้ากำไร" },
      { id: "winning-offers", name: "ข้อเสนอที่ผ่านเกณฑ์และนำไปขยายผล", weight: 25, target: "≥ 2 ข้อเสนอ/เดือน" },
      { id: "conversion-test-delivery", name: "การทดลองที่สรุปผลตามกำหนด", weight: 20, target: "≥ 90%" },
    ],
    skills: completeSkillFramework([
      { id: "conversion-copywriting", name: "การเขียน Copy เพื่อสร้างยอดขาย", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "offer-design", name: "การออกแบบข้อเสนอ ราคา และคุณค่า", target: "ระดับ 5 จาก 5", targetLevel: 5 },
      { id: "bundle-upsell-strategy", name: "การวาง Bundle, Upsell และ Cross-sell", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "landing-page-cro", name: "การปรับ Landing Page และ CRO", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "funnel-conversion-analysis", name: "การวิเคราะห์ Conversion Funnel", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "ab-testing", name: "การออกแบบ A/B Test ที่สรุปผลได้", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "pricing-margin", name: "ความเข้าใจราคา ต้นทุน และกำไร", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "sales-page-optimization", name: "การปรับหน้าขายและเส้นทางสั่งซื้อ", target: "ระดับ 4 จาก 5", targetLevel: 4 },
    ], aiWorkMastery(3, "ชุด Copy หรือ Offer Variation ที่มี Human Review พร้อมผล A/B Test, Conversion และกำไรเปรียบเทียบก่อน–หลัง")),
  },
  {
    id: "crm-retention-marketer",
    name: "นักการตลาดด้าน CRM & Retention",
    shortName: "CRM",
    department: "ทีมหน้าบ้านและการเติบโต",
    departmentId: "growth-commerce",
    trend: 4.1,
    kpis: [
      { id: "crm-repeat-revenue", name: "รายได้จากลูกค้าเดิม", weight: 30, target: "ดีขึ้นจากฐานเดิม" },
      { id: "crm-repeat-purchase", name: "อัตราซื้อซ้ำและการรักษาลูกค้า", weight: 25, target: "ตามเป้ารายเดือน" },
      { id: "crm-campaign-conversion", name: "Conversion จาก LINE / CRM", weight: 25, target: "ดีขึ้นต่อเนื่อง" },
      { id: "crm-data-coverage", name: "ความครบถ้วนและคุณภาพข้อมูลลูกค้า", weight: 20, target: "≥ 95%" },
    ],
    skills: completeSkillFramework([
      { id: "crm-segmentation", name: "การแบ่งกลุ่มลูกค้าจากข้อมูลจริง", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "customer-journey-design", name: "การออกแบบ Customer Journey", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "lifecycle-marketing", name: "Lifecycle Marketing และการซื้อซ้ำ", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "line-crm-operations", name: "การบริหาร LINE OA และ CRM", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "marketing-automation", name: "การสร้าง Marketing Automation", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "retention-campaign-design", name: "การออกแบบแคมเปญรักษาลูกค้า", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "cohort-ltv-analysis", name: "การวิเคราะห์ Cohort และ LTV", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "customer-data-hygiene", name: "การดูแลคุณภาพและความยินยอมของข้อมูล", target: "ระดับ 4 จาก 5", targetLevel: 4 },
    ], aiWorkMastery(4, "Workflow แบ่ง Segment หรือ Lifecycle Automation ที่คุ้มครองข้อมูลและความยินยอม พร้อมผลต่อยอดซื้อซ้ำหรือ LTV")),
  },
  {
    id: "performance-video-editor",
    name: "นักตัดต่อวิดีโอสาย Performance",
    shortName: "Perf. Edit",
    department: "ทีมหน้าบ้านและการเติบโต",
    departmentId: "growth-commerce",
    trend: 4.4,
    kpis: [
      { id: "performance-creative-win-rate", name: "อัตราคลิปโฆษณาที่ผ่านเกณฑ์ชนะ", weight: 30, target: "ดีขึ้นจากฐานเดิม" },
      { id: "performance-hook-retention", name: "Retention ช่วง 1–3 วินาทีแรก", weight: 25, target: "ตามเกณฑ์แต่ละแพลตฟอร์ม" },
      { id: "performance-edit-delivery", name: "ส่งคลิปและ Variation ตรงเวลา", weight: 25, target: "≥ 95%" },
      { id: "performance-first-pass", name: "งานผ่านตรวจคุณภาพรอบแรก", weight: 20, target: "≥ 85%" },
    ],
    skills: completeSkillFramework([
      { id: "direct-response-editing", name: "การตัดต่อแบบ Direct Response", target: "ระดับ 5 จาก 5", targetLevel: 5 },
      { id: "three-second-hook", name: "การสร้าง Hook ใน 1–3 วินาทีแรก", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "short-form-pacing", name: "จังหวะการเล่าเรื่องสำหรับวิดีโอสั้น", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "platform-video-adaptation", name: "การปรับงานให้เหมาะกับแต่ละแพลตฟอร์ม", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "creative-variation-production", name: "การผลิต Creative Variation อย่างเป็นระบบ", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "video-retention-analysis", name: "การอ่าน Retention, CTR และผลโฆษณา", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "caption-sound-design", name: "ซับไตเติล Motion และ Sound Design", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "ai-assisted-video-editing", name: "เครื่องมือ AI สำหรับ Video Production", target: "ระดับ 3 จาก 5", targetLevel: 3 },
    ], aiWorkMastery(4, "Workflow AI สำหรับ Script, Hook, Caption หรือ Creative Variation พร้อมไฟล์ก่อน–หลังและผล Retention, CTR หรือ CPA")),
  },
  {
    id: "brand-content-video-editor",
    name: "นักตัดต่อวิดีโอสาย Brand & Content",
    shortName: "Brand Edit",
    department: "ทีมหน้าบ้านและการเติบโต",
    departmentId: "growth-commerce",
    trend: 3.9,
    kpis: [
      { id: "brand-content-performance", name: "ผลงานคอนเทนต์หลังเผยแพร่", weight: 30, target: "ตามเป้าแต่ละคอนเทนต์" },
      { id: "brand-consistency", name: "ความสม่ำเสมอของภาพและแบรนด์", weight: 25, target: "≥ 90%" },
      { id: "brand-edit-delivery", name: "ส่งงานตัดต่อตรงเวลา", weight: 25, target: "≥ 95%" },
      { id: "brand-first-pass", name: "งานผ่านคุณภาพรอบแรก", weight: 20, target: "≥ 85%" },
    ],
    skills: completeSkillFramework([
      { id: "brand-storytelling", name: "การเล่าเรื่องและถ่ายทอดตัวตนแบรนด์", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "visual-composition", name: "องค์ประกอบภาพและ Visual Language", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "motion-graphics-brand", name: "Motion Graphics สำหรับงานแบรนด์", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "color-grading", name: "Color Grading และความสม่ำเสมอของภาพ", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "brand-sound-design", name: "Sound Design และการเลือกดนตรี", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "multi-platform-production", name: "การผลิตหลายสัดส่วนและหลายแพลตฟอร์ม", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "asset-version-management", name: "การจัดการไฟล์ต้นฉบับและเวอร์ชัน", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "ai-assisted-content-production", name: "เครื่องมือ AI สำหรับ Creative Production", target: "ระดับ 3 จาก 5", targetLevel: 3 },
    ], aiWorkMastery(3, "Workflow AI สำหรับ Storyboard, Asset, Voice หรือ Color ที่ผ่าน Brand QA พร้อมไฟล์ก่อน–หลังและผลคอนเทนต์")),
  },
  {
    id: "marketplace-commerce-specialist",
    name: "ผู้ดูแล TikTok Shop / Shopee / Lazada",
    shortName: "Marketplace",
    department: "ทีมหน้าบ้านและการเติบโต",
    departmentId: "growth-commerce",
    trend: 4.6,
    kpis: [
      { id: "marketplace-net-sales", name: "ยอดขายสุทธิรวม Marketplace", weight: 30, target: "ตามเป้ารายเดือน" },
      { id: "marketplace-conversion", name: "อัตรา Conversion ของหน้าร้าน", weight: 25, target: "ดีขึ้นจากฐานเดิม" },
      { id: "marketplace-margin", name: "กำไรหลังหักค่าธรรมเนียมและโปรโมชัน", weight: 20, target: "ไม่ต่ำกว่าเป้ากำไร" },
      { id: "marketplace-account-health", name: "คุณภาพร้าน คำสั่งซื้อ และ Account Health", weight: 25, target: "≥ 95%" },
    ],
    skills: completeSkillFramework([
      { id: "marketplace-operations", name: "การบริหาร TikTok Shop, Shopee และ Lazada", target: "ระดับ 5 จาก 5", targetLevel: 5 },
      { id: "marketplace-seo-listing", name: "การทำ Listing, Keyword และ Marketplace SEO", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "marketplace-pricing-margin", name: "การตั้งราคา ค่าธรรมเนียม และกำไร", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "marketplace-promotion", name: "การวางโปรโมชัน Flash Sale และ Campaign", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "marketplace-ads", name: "การบริหารโฆษณาภายใน Marketplace", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "affiliate-live-commerce", name: "Affiliate, Creator และ Live Commerce", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "stock-order-sync", name: "การประสานสต็อก คำสั่งซื้อ และ Fulfillment", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "marketplace-account-health-skill", name: "การดูแลคะแนนร้านและ Account Health", target: "ระดับ 5 จาก 5", targetLevel: 5 },
      { id: "marketplace-analytics", name: "การวิเคราะห์ยอดขายและ Conversion ราย SKU", target: "ระดับ 4 จาก 5", targetLevel: 4 },
    ], aiWorkMastery(4, "Workflow AI สำหรับ Listing, Keyword, Demand หรือคำตอบลูกค้าที่ผ่าน Policy Check พร้อมผล Conversion และความแม่นยำของสต็อก")),
  },
  {
    id: "facebook-media-buyer",
    name: "ผู้เชี่ยวชาญโฆษณา Facebook",
    shortName: "Meta Ads",
    department: "ทีมหน้าบ้านและการเติบโต",
    departmentId: "growth-commerce",
    trend: 5.0,
    kpis: [
      { id: "meta-profitable-revenue", name: "รายได้และกำไรจาก Facebook Ads", weight: 30, target: "ตามเป้ากำไรที่อนุมัติ" },
      { id: "meta-acquisition-cost", name: "CPA / CAC เทียบเป้าหมาย", weight: 25, target: "ไม่เกินเพดานที่กำหนด" },
      { id: "meta-winning-tests", name: "จำนวน Creative / Audience Test ที่ชนะ", weight: 25, target: "≥ 4 ชุด/เดือน" },
      { id: "meta-tracking-budget-accuracy", name: "ความถูกต้องของ Tracking และงบ", weight: 20, target: "≥ 98%" },
    ],
    skills: completeSkillFramework([
      { id: "meta-campaign-structure", name: "การวางโครงสร้างแคมเปญ Meta Ads", target: "ระดับ 5 จาก 5", targetLevel: 5 },
      { id: "meta-audience-strategy", name: "Audience Strategy และ Retargeting", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "meta-creative-testing", name: "Creative Testing Framework", target: "ระดับ 5 จาก 5", targetLevel: 5 },
      { id: "meta-budget-scaling", name: "การจัดงบและ Scale อย่างควบคุมความเสี่ยง", target: "ระดับ 5 จาก 5", targetLevel: 5 },
      { id: "meta-pixel-capi", name: "Pixel, CAPI และ Event Tracking", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "meta-attribution", name: "Attribution และการอ่านข้อมูลข้ามช่องทาง", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "meta-unit-economics", name: "CAC, CPA, ROAS, MER และกำไรจริง", target: "ระดับ 5 จาก 5", targetLevel: 5 },
      { id: "meta-performance-forecast", name: "การพยากรณ์ผลและวางแผน Media", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "meta-policy-risk", name: "นโยบายโฆษณาและการจัดการความเสี่ยงบัญชี", target: "ระดับ 4 จาก 5", targetLevel: 4 },
    ], aiWorkMastery(4, "AI Creative Analysis, Brief หรือ Budget Scenario ที่ตรวจ Tracking แล้ว พร้อม CPA/MER และหลักฐานการอนุมัติก่อนเปลี่ยนงบจริง")),
  },
];

// New selectable templates; historical role IDs remain resolvable without migrating employees.
const positionDefinitions = [
  { id: "packing-shipping-officer", name: "เจ้าหน้าที่แพ็คและจัดส่งสินค้า", base: "customer-service", duties: ["แพ็คสินค้าที่บ้านแพ็ค ตรวจสินค้าและจำนวนให้ตรงกับออเดอร์", "เตรียมพัสดุและจัดส่งสินค้า พร้อมตรวจข้อมูลผู้รับและติดตามการส่งมอบ"] },
  { id: "sales-service-admin", name: "แอดมินบริการลูกค้าและปิดการขาย", base: "customer-service", duties: ["ตอบแชท ให้ข้อมูลสินค้า และบริการลูกค้า", "คีย์ออเดอร์ ตรวจรายละเอียดคำสั่งซื้อและข้อมูลจัดส่ง", "ติดตามลูกค้าและปิดการขาย พร้อมประสานงานส่งต่อออเดอร์"] },
  { id: "accounting-cashflow", name: "เจ้าหน้าที่บัญชีรายรับ–รายจ่าย", base: "hr", duties: ["ตรวจ Statement SCD กสิกรและกรุงไทย พร้อมตรวจที่มาของเงินเข้า–ออก", "บันทึกรายรับรายจ่ายของบ้านนพ.ทั้งหมดในโปรแกรมมหาเทพ"] },
  { id: "accounting-sales-tax", name: "เจ้าหน้าที่บัญชีขายและเอกสารภาษี", base: "hr", duties: ["จัดทำสลิปรายจ่ายใน Word และนำรายรับ My Order เข้า FlowAccount", "แนบใบเสร็จส่งสำนักงานบัญชีเพื่อยื่นภาษี จัดทำ COD และแจ้งยอดขายแหนมปลากราย"] },
  { id: "hr-payroll-commission", name: "เจ้าหน้าที่ HR เงินเดือนและค่าคอมมิชชัน", base: "hr", duties: ["ลงค่าแรงพนักงานในเมืองและบ้านแพ็ค พร้อมจัดทำเงินหมุนเวียน", "คิดค่าคอมแอดมินบ้านน้ำพริก เทเลเซลล์ และมหาเทพ ลงภาษีหัก ณ ที่จ่ายและตารางเงินเดือนส่งสำนักงานบัญชี"] },
  { id: "marketing-assistant-intern", name: "ผู้ช่วยผู้จัดการฝึกงาน — วิเคราะห์การตลาด", base: "customer-insight-marketer", duties: ["วิเคราะห์การตลาดและคู่แข่ง พร้อมสรุปประชุม", "สนับสนุนงานที่ผู้จัดการมอบหมายและโปรเจกต์รีแบรนด์สินค้าที่มีปัญหา"] },
  { id: "ecommerce-platform-officer", name: "เจ้าหน้าที่ดูแลแพลตฟอร์มอีคอมเมิร์ซ", base: "marketplace-commerce-specialist", duties: ["สรุปยอดขาย ตรวจความเหมาะสม อนุมัติและติดตาม KOL", "ตอบแชท Shopee, TikTok, Lazada, Thai Mart และเว็บไซต์แม่เฉลา", "ควบคุมไลฟ์และรีรัน ดูแลสต็อก จัดแคมเปญและตัดคลิปลงช่อง"] },
  { id: "performance-video-production", name: "นักตัดต่อวิดีโอสาย Performance", base: "performance-video-editor", duties: ["ตัดคลิปเทสและเติมคอนเทนต์ตามเป้ารายบุคคล ไม่ใช้โควตาเดียวกันทั้งตำแหน่ง", "ถ่ายฟุตเทจ รันรหัสสินค้า ส่งงาน เพิ่มสินค้าให้แอดมิน ทำรูปสินค้าและขึ้นแอด My Order" ] },
  { id: "ai-graphic-affiliate", name: "นักสร้างคอนเทนต์ AI กราฟิกและ Affiliate", base: "brand-content-video-editor", duties: ["ทำ Affiliate 4 ช่องทาง บน Facebook, TikTok และ YouTube พร้อมออกแบบโลโก้", "สร้างซีรีส์อย่างน้อยวันละ 1 เรื่อง และคลิปเบ็ดเตล็ดอย่างน้อยช่องละ 1 ตอนใน 6 ช่อง", "ผลิตคลิปช่อง Peachy วันละ 2 คลิป"] },
  { id: "digital-marketing-systems", name: "นักการตลาดดิจิทัลและดูแลระบบหลังบ้าน", base: "facebook-media-buyer", duties: ["ตัดคลิปเติมและเทส ถ่ายฟุตเทจ รันรหัส ขึ้น คุม และยิงโฆษณา", "แก้ปัญหาระบบหลังบ้านและโปรแกรมไลฟ์สด"] },
  { id: "brand-product-marketing", name: "นักการตลาดแบรนด์และพัฒนาผลิตภัณฑ์", base: "marketing", duties: ["คิดสินค้าใหม่นำเสนอผู้จัดการ พร้อมจัดทำสไลด์และกราฟิกสินค้า", "พิจารณาภาชนะและบรรจุภัณฑ์ที่เหมาะสมกับสินค้า"] },
  { id: "operations-procurement-manager", name: "ผู้จัดการฝ่ายปฏิบัติการและจัดซื้อ", base: "growth-commerce-manager", duties: ["ตรวจยอดคนทำงาน อัปเดตทีม ดูแลเทเลเซลล์และคัดกรองปัญหาองค์กรและบุคคล", "เคลียร์ออเดอร์ตกค้าง จัดซื้อ หาซัพพลายเออร์ สั่งสินค้าเทสและคิดต้นทุน", "จัดคิวรถคอกจากตลาดไทและอุทัย ตรวจสต็อก จัดเตรียมและวางระบบสินค้า", "รองรับโปรเจกต์ใหม่ แก้ปัญหาทีมและถ่ายงานด่านใหญ่"] },
];

export const roles: RoleTemplate[] = positionDefinitions.map((position) => {
  const base = [...previousRoles, ...legacyRoles].find((role) => role.id === position.base)!;
  return {
    ...base,
    id: position.id,
    baseRoleId: position.base,
    name: position.name,
    shortName: position.name,
    department: "ยังไม่ระบุทีม",
    departmentId: "",
    trend: 0,
    skills: position.id === "packing-shipping-officer" ? completeSkillFramework([
      { id: "packing-order-check", name: "ตรวจสินค้าและจำนวนตามออเดอร์", target: "ระดับ 3 จาก 5", targetLevel: 3 },
      { id: "packing-protection", name: "แพ็คสินค้าและป้องกันความเสียหาย", target: "ระดับ 3 จาก 5", targetLevel: 3 },
      { id: "shipping-handover", name: "ตรวจข้อมูลจัดส่งและส่งมอบพัสดุ", target: "ระดับ 3 จาก 5", targetLevel: 3 },
    ], aiWorkMastery(1, "ใช้เครื่องมือช่วยตรวจรายการแพ็ค โดยตรวจสอบกับออเดอร์จริงก่อนส่งมอบ")) : base.skills,
    kpis: position.duties.map((name, index) => ({
      id: `${position.id}-duty-${index + 1}`, name,
      weight: Math.floor(100 / position.duties.length) + (index === 0 ? 100 % position.duties.length : 0),
      target: "ตามหน้าที่และแผนงานที่ได้รับมอบหมาย",
    })),
  };
});

export const performanceProductionTargets = [
  { name: "ตาบอส", target: "ขั้นต่ำ 3 แคมเปญต่อวัน แคมเปญละ 3 คลิป รวมขั้นต่ำ 9 คลิป (รวมเทสและเติม) ส่งเกินได้" },
  { name: "แตม", target: "ขั้นต่ำ 3 แคมเปญต่อวัน แคมเปญละ 3 คลิป รวมขั้นต่ำ 9 คลิป (รวมเทสและเติม) ส่งเกินได้" },
  { name: "มายด์", target: "ตัดวันละ 2 ตัว: น้ำพริก 2 ตัว หรือยูนนาน 3 จีน (ต้องยืนยันความหมายเพิ่มเติม) ลงคลิป ขึ้นแอด และส่งงานเติมคอนเทนต์" },
];

roles.find((role) => role.id === "performance-video-production")!.kpis[0].target =
  performanceProductionTargets.map(({ name, target }) => `${name}: ${target}`).join("; ");

export const roleSalaryBands: Record<string, { min: number; mid: number; max: number }> = {
  "sales-manager": { min: 55000, mid: 70000, max: 90000 },
  marketing: { min: 30000, mid: 42000, max: 58000 },
  "customer-service": { min: 24000, mid: 32000, max: 42000 },
  developer: { min: 45000, mid: 65000, max: 90000 },
  "video-editor": { min: 28000, mid: 40000, max: 60000 },
  hr: { min: 32000, mid: 45000, max: 62000 },
  "growth-commerce-manager": { min: 55000, mid: 75000, max: 100000 },
  "customer-insight-marketer": { min: 30000, mid: 42000, max: 58000 },
  "offer-conversion-marketer": { min: 32000, mid: 45000, max: 62000 },
  "crm-retention-marketer": { min: 30000, mid: 43000, max: 60000 },
  "performance-video-editor": { min: 28000, mid: 42000, max: 60000 },
  "brand-content-video-editor": { min: 28000, mid: 40000, max: 60000 },
  "marketplace-commerce-specialist": { min: 32000, mid: 48000, max: 75000 },
  "facebook-media-buyer": { min: 38000, mid: 58000, max: 85000 },
};

// Retain the closest existing template's reference bands; no employee salary is changed.
for (const position of positionDefinitions) {
  roleSalaryBands[position.id] = { ...roleSalaryBands[position.base] };
}

const roleSkillPayMultiplier: Record<string, number> = {
  "sales-manager": 1.2,
  marketing: 1,
  "customer-service": .9,
  developer: 1.5,
  "video-editor": 1.2,
  hr: 1,
  "growth-commerce-manager": 1.3,
  "customer-insight-marketer": 1,
  "offer-conversion-marketer": 1.1,
  "crm-retention-marketer": 1.1,
  "performance-video-editor": 1.2,
  "brand-content-video-editor": 1.1,
  "marketplace-commerce-specialist": 1.2,
  "facebook-media-buyer": 1.3,
};

export const skillAllowanceByLevel: Record<number, number> = { 1: 0, 2: 500, 3: 800, 4: 1200, 5: 1800 };

export function skillAllowanceFor(roleId: string, level: number) {
  const base = skillAllowanceByLevel[Math.max(1, Math.min(5, Math.round(level)))] ?? 0;
  const multiplier = roleSkillPayMultiplier[roleId] ?? 1;
  return Math.round(base * multiplier / 100) * 100;
}

export const seedEmployeeLegacyRoleIds: Record<string, string> = {};

export const seedEmployees: EmployeeRecord[] = [];

export const seedHrProfiles: HrProfileRecord[] = [];

export const seedAttendanceRecords: AttendanceRecord[] = [];

export const seedSkillAchievements: SkillAchievementRecord[] = [];

export const seedTalentActions: TalentActionRecord[] = [];

export const seedProjects: ProjectRecord[] = [];

export const seedWorkItems: WorkItemRecord[] = [];

const policyTemplateNotice = "เอกสารนี้เป็นแม่แบบสำหรับระบบทดลอง HR ต้องตรวจแก้ให้ตรงสภาพการจ้างและให้ที่ปรึกษากฎหมายทบทวนก่อนประกาศใช้จริง ไม่ใช่คำรับรองว่าองค์กรปฏิบัติตามกฎหมายครบถ้วนแล้ว";

export const seedOrganizationPolicies: OrganizationPolicyRecord[] = [
  {
    id: "policy-work-rules-v1",
    code: "work-rules",
    title: "ข้อบังคับเกี่ยวกับการทำงาน (ฉบับแม่แบบ)",
    summary: "รวมวันและเวลาทำงาน ค่าจ้าง วันลา วินัย การร้องทุกข์ และการสิ้นสุดการจ้างไว้ในฉบับเดียว",
    content: `${policyTemplateNotice}\n\nสำหรับข้อมูลองค์กรตัวอย่าง 28 คน แม่แบบนี้จัดหัวข้อตรวจทานตามที่ HR ระบุโดยอ้างอิงโครงหัวข้อมาตรา 108 แต่ต้องตรวจข้อเท็จจริง กฎหมายปัจจุบัน และประกาศขององค์กรอีกครั้งก่อนใช้จริง\n\n1. วันทำงาน เวลาทำงานปกติ และเวลาพัก\nบริษัทกำหนดวันทำงาน เวลาทำงาน จุดลงเวลา และเวลาพักให้ชัดเจนตามหน่วยงาน การเปลี่ยนตารางต้องแจ้งล่วงหน้าและไม่ขัดต่อกฎหมายที่ใช้บังคับ\n\n2. วันหยุดและหลักเกณฑ์การหยุด\nประกาศวันหยุดประจำสัปดาห์ วันหยุดตามประเพณี และเงื่อนไขการหยุดล่วงหน้า พนักงานตรวจสอบปฏิทินล่าสุดในระบบและยื่นคำขอตามขั้นตอน\n\n3. การทำงานล่วงเวลาและการทำงานในวันหยุด\nต้องได้รับอนุมัติก่อนทำ ยืนยันความยินยอมเมื่อกฎหมายกำหนด บันทึกเวลาตามจริง และจ่ายค่าตอบแทนตามอัตราที่กฎหมายและข้อตกลงกำหนด\n\n4. วันและสถานที่จ่ายค่าจ้าง\nHR ต้องระบุรอบจ่าย วันที่จ่าย ช่องทางหรือสถานที่จ่าย และวิธีแจ้งเมื่อวันจ่ายตรงวันหยุดไว้ในประกาศฉบับใช้งานจริง การหักเงินทำได้เฉพาะกรณีที่กฎหมายอนุญาต\n\n5. วันลาและหลักเกณฑ์การลา\nระบุประเภทลา สิทธิ เอกสาร ช่องทางยื่น ผู้อนุมัติ และกรณีฉุกเฉินให้ครบ โดยสิทธิขั้นต่ำต้องไม่น้อยกว่ากฎหมายที่ใช้บังคับ\n\n6. วินัยและโทษทางวินัย\nแจ้งข้อกล่าวหาและข้อเท็จจริงให้พนักงานทราบ เปิดโอกาสให้ชี้แจง ตรวจหลักฐานอย่างเป็นธรรม และบันทึกผู้อนุมัติ การหัก Points เป็นเพียงกลไกแรงจูงใจ ไม่ใช่โทษทางวินัย ไม่แทนกระบวนการวินัย และไม่ใช้ลดค่าจ้างหรือสิทธิตามกฎหมาย\n\n7. การร้องทุกข์และอุทธรณ์\nพนักงานยื่นเรื่องต่อหัวหน้า HR หรือช่องทางลับที่บริษัทกำหนดได้ ต้องมีผู้รับเรื่อง ระยะเวลาตอบกลับ การคุ้มครองผู้ร้องโดยสุจริต และช่องทางอุทธรณ์ต่อผู้มีอำนาจสูงกว่า\n\n8. การเลิกจ้างและค่าชดเชย\nการบอกกล่าว เหตุเลิกจ้าง วันสิ้นสุดงาน การคืนทรัพย์สิน การจ่ายเงินค้างและค่าชดเชย ให้ HR ดำเนินการตามสัญญาและกฎหมายที่ใช้บังคับ พร้อมแจ้งสิทธิทักท้วงแก่พนักงาน`,
    category: "work_rules",
    status: "published",
    version: 1,
    effectiveDate: "2026-08-01",
    effectiveTo: null,
    scopeType: "all",
    scopeValues: [],
    acknowledgementRequired: true,
    acknowledgementDueDays: 7,
    rules: null,
    contentHash: "",
    publishedAt: "2026-08-01T02:00:00.000Z",
    publishedBy: "ฝ่ายทรัพยากรบุคคล",
    createdAt: "2026-08-01T02:00:00.000Z",
    updatedAt: "2026-08-01T02:00:00.000Z",
    updatedBy: "ฝ่ายทรัพยากรบุคคล",
  },
  {
    id: "policy-points-rewards-v1",
    code: "points-and-rewards",
    title: "กติกาการรับ ใช้ และแลก Points",
    summary: "Points มาจากผลประเมิน งานที่ผ่านหลักฐาน เวลา คุณภาพ และภารกิจ พร้อมเพดานป้องกันการให้ Points ง่ายเกินไป",
    content: `${policyTemplateNotice}\n\nหลักการสำคัญ\n• Points เป็นคะแนนกิจกรรมภายใน ไม่มีมูลค่าเป็นเงินสด ไม่ใช่ค่าจ้าง และไม่ลดทอนสิทธิหรือสวัสดิการตามกฎหมาย\n• Points ติดลบหรือการหัก Points ไม่ใช่โทษทางวินัย และไม่แทนการสอบข้อเท็จจริง ใบเตือน การอุทธรณ์ หรือกระบวนการ HR\n• งานและภารกิจได้ Points เมื่อส่งหลักฐานและผู้มีสิทธิอนุมัติแล้วเท่านั้น ระบบไม่ให้ Points ซ้ำจากแหล่งเดียวกัน และให้ Points จากงานรวมไม่เกิน 420 Points ต่อเดือน\n• ผลประเมินต้องได้อย่างน้อย 70 คะแนน คำนวณ (คะแนนรวม − 60) × 6 และไม่เกิน 240 Points ต่อเดือน\n• เข้างานตรงเวลา +5 Points สูงสุด 22 วันต่อเดือน; มาสาย −20; ขาดงานที่ตรวจสอบแล้ว −120; ลาที่อนุมัติ 0 Points\n• ส่งงานก่อนกำหนด +25; ส่งตรงกำหนด +15; โบนัสกำหนดส่งรวมไม่เกิน 80 Points ต่อเดือน; งานผิดพลาดที่มีหลักฐาน −40\n• โบนัสพิเศษ +50 และเควสต์ +75 ต้องมีหลักฐาน แต่ละประเภทได้ไม่เกิน 2 ครั้งต่อเดือน Points บวกมาตรฐานนอกผลประเมินรวมไม่เกิน 900 Points ต่อเดือน\n• ใบเตือน −150 และการผิดกฎ −100 บันทึกได้โดย HR หลังตรวจข้อเท็จจริงและแนบหลักฐานเท่านั้น Points ลบรวมไม่เกิน 200 Points ต่อเดือน\n• หัวหน้าไม่มีสิทธิ์ให้หรือหัก Points ของตนเอง และรายการอัตโนมัติห้ามบันทึกซ้ำด้วยมือ\n• แลกรางวัลได้ไม่เกิน 2 ครั้งต่อเดือน และเว้นอย่างน้อย 7 วัน ยอดคงเหลือต้องไม่ติดลบ คำขอทุกรายการต้องผ่านการตรวจสต็อกและอนุมัติ\n• หากยกเลิกคำขอที่ถูกต้อง ระบบต้องคืน Points ด้วยรายการย้อนกลับ ห้ามแก้หรือลบประวัติ Points เดิม`,
    category: "points_rewards",
    status: "published",
    version: 1,
    effectiveDate: "2026-08-01",
    effectiveTo: null,
    scopeType: "all",
    scopeValues: [],
    acknowledgementRequired: true,
    acknowledgementDueDays: 7,
    rules: defaultPointPolicyRules,
    contentHash: "",
    publishedAt: "2026-08-01T02:05:00.000Z",
    publishedBy: "ฝ่ายทรัพยากรบุคคล",
    createdAt: "2026-08-01T02:05:00.000Z",
    updatedAt: "2026-08-01T02:05:00.000Z",
    updatedBy: "ฝ่ายทรัพยากรบุคคล",
  },
  {
    id: "policy-ai-data-v1",
    code: "ai-and-data",
    title: "การใช้ AI และการคุ้มครองข้อมูลองค์กร",
    summary: "กำหนดข้อมูลที่ห้ามส่งให้ AI การตรวจผลลัพธ์ และความรับผิดชอบของผู้ใช้งาน",
    content: `${policyTemplateNotice}\n\n• ห้ามป้อนรหัสผ่าน ความลับทางการค้า ข้อมูลสุขภาพ เลขประจำตัว หรือข้อมูลลูกค้าที่ระบุตัวบุคคลได้ลงในบริการ AI ที่องค์กรไม่อนุมัติ\n• ปกปิดหรือลดทอนข้อมูลก่อนใช้ AI และใช้เฉพาะบัญชี เครื่องมือ และพื้นที่จัดเก็บที่บริษัทอนุมัติ\n• ผู้ใช้งานต้องตรวจข้อเท็จจริง ลิขสิทธิ์ ความลำเอียง และความเหมาะสมก่อนนำผล AI ไปใช้\n• การตัดสินใจที่กระทบการจ้าง ค่าจ้าง วินัย ลูกค้า หรือข้อผูกพันทางกฎหมายต้องมีมนุษย์ผู้รับผิดชอบตรวจและอนุมัติ\n• เมื่อพบข้อมูลรั่วไหลหรือผลลัพธ์เสี่ยง ให้หยุดใช้งาน เก็บหลักฐานเท่าที่จำเป็น และแจ้งหัวหน้ากับผู้ดูแลข้อมูลทันที`,
    category: "ai_data",
    status: "published",
    version: 1,
    effectiveDate: "2026-08-01",
    effectiveTo: null,
    scopeType: "all",
    scopeValues: [],
    acknowledgementRequired: true,
    acknowledgementDueDays: 7,
    rules: null,
    contentHash: "",
    publishedAt: "2026-08-01T02:10:00.000Z",
    publishedBy: "ฝ่ายทรัพยากรบุคคล",
    createdAt: "2026-08-01T02:10:00.000Z",
    updatedAt: "2026-08-01T02:10:00.000Z",
    updatedBy: "ฝ่ายทรัพยากรบุคคล",
  },
];

export const seedRewards: RewardRecord[] = [];

export const seedPointLedger: PointLedgerRecord[] = [];

export const seedRewardRedemptions: RewardRedemptionRecord[] = [];

export const seedEmployeeProfiles: EmployeeProfileRecord[] = [];

export const seedApplicationDocuments: ApplicationDocumentRecord[] = [];

export const seedEmploymentContracts: EmploymentContractRecord[] = [];

export function findRole(roleId: string) {
  return roles.find((role) => role.id === roleId) ?? previousRoles.find((role) => role.id === roleId) ?? legacyRoles.find((role) => role.id === roleId);
}

export function getRole(roleId: string) {
  return findRole(roleId) ?? roles[0];
}

export function scoreStatus(score: number | null): ScoreStatus | "รอประเมิน" {
  if (score === null) return "รอประเมิน";
  if (score >= 85) return "ดีเยี่ยม";
  if (score >= 75) return "ตามเป้าหมาย";
  return "ควรติดตาม";
}

export function makeInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]).join("").slice(0, 2) || "PP";
}

export function clampScore(value: unknown) {
  const score = Number(value);
  if (!Number.isFinite(score)) return 0;
  return Math.min(100, Math.max(0, Math.round(score)));
}

export function clampSkillLevel(value: unknown) {
  const score = Number(value);
  if (!Number.isFinite(score)) return 1;
  return Math.min(5, Math.max(1, Math.round(score)));
}
