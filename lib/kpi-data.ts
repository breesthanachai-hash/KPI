export type ScoreStatus = "ดีเยี่ยม" | "ตามเป้าหมาย" | "ควรติดตาม";

export type MetricTemplate = {
  id: string;
  name: string;
  target: string;
};

export type KpiTemplate = MetricTemplate & {
  weight: number;
};

export type SkillCategoryId = "role" | "execution" | "collaboration" | "professionalism" | "growth";

export type SkillTemplate = MetricTemplate & {
  targetLevel: number;
  category?: SkillCategoryId;
  description?: string;
  evidence?: string;
  eligibleForAllowance?: boolean;
};

export const skillCategories: { id: SkillCategoryId; label: string; shortLabel: string; description: string; weight: number }[] = [
  { id: "role", label: "สกิลตามตำแหน่ง", shortLabel: "ตามตำแหน่ง", description: "ความรู้และความสามารถเฉพาะที่ต้องใช้เพื่อส่งมอบงานในบทบาทปัจจุบัน", weight: 40 },
  { id: "execution", label: "การทำงานและความรับผิดชอบ", shortLabel: "การทำงาน", description: "วินัย ความรับผิดชอบ การบริหารเวลา และมาตรฐานคุณภาพงาน", weight: 20 },
  { id: "collaboration", label: "การทำงานกับผู้อื่น", shortLabel: "การร่วมงาน", description: "การสื่อสาร ทีมเวิร์ก มารยาท และการใส่ใจผู้รับบริการ", weight: 15 },
  { id: "professionalism", label: "ความเป็นมืออาชีพ", shortLabel: "มืออาชีพ", description: "ความซื่อสัตย์ การรักษากฎและข้อมูล รวมถึงการจัดการอารมณ์", weight: 15 },
  { id: "growth", label: "การเติบโตและพัฒนาตน", shortLabel: "การเติบโต", description: "การปรับตัว เรียนรู้สิ่งใหม่ และริเริ่มแก้ปัญหาอย่างสร้างสรรค์", weight: 10 },
];

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

function completeSkillFramework(roleSkills: SkillTemplate[]) {
  return [
    ...roleSkills.map((skill) => ({
      ...skill,
      category: "role" as const,
      description: skill.description ?? "ประยุกต์ความรู้เฉพาะทางเพื่อส่งมอบผลงานตามมาตรฐานของตำแหน่ง",
      evidence: skill.evidence ?? "ผลทดสอบ ตัวอย่างผลงาน คุณภาพการส่งมอบ และผลตอบรับจากผู้ตรวจงาน",
      eligibleForAllowance: skill.eligibleForAllowance ?? true,
    })),
    ...coreCompetencies,
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
  manager: string;
  status: "active" | "inactive";
  latestScore: number | null;
  latestSkillScore: number | null;
  latestPeriod: string | null;
  updatedAt: string;
};

export type UserAccountRecord = {
  id: string;
  authUserId: string;
  email: string;
  displayName: string;
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
  icon: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PointLedgerRecord = {
  id: string;
  employeeId: string;
  sourceType: "task" | "mission" | "quest" | "evaluation" | "attendance" | "deadline" | "quality" | "discipline" | "bonus" | "redemption";
  sourceId: string;
  points: number;
  note: string;
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
  createdAt: string;
};

export const pointEconomyPolicy = {
  monthlyEvaluationMinimumScore: 70,
  monthlyEvaluationBaseScore: 60,
  monthlyEvaluationMultiplier: 6,
  monthlyEvaluationCap: 240,
  positiveManualEventsPerMonth: 2,
  attendanceDaysPerMonth: 22,
} as const;

export const workPointAwards: Record<WorkItemRecord["kind"], Record<WorkItemRecord["priority"], number>> = {
  task: { low: 10, medium: 20, high: 35, urgent: 50 },
  request: { low: 15, medium: 25, high: 40, urgent: 60 },
  mission: { low: 40, medium: 60, high: 90, urgent: 120 },
};

export function workPointValue(kind: WorkItemRecord["kind"], priority: WorkItemRecord["priority"]) {
  return workPointAwards[kind]?.[priority] ?? workPointAwards.task.medium;
}

export function monthlyEvaluationPoints(totalScore: number) {
  if (totalScore < pointEconomyPolicy.monthlyEvaluationMinimumScore) return 0;
  return Math.min(
    pointEconomyPolicy.monthlyEvaluationCap,
    Math.max(0, Math.round((totalScore - pointEconomyPolicy.monthlyEvaluationBaseScore) * pointEconomyPolicy.monthlyEvaluationMultiplier)),
  );
}

export const pointEventRules: Record<PointEventType, { label: string; points: number | null; description: string; sourceType: PointLedgerRecord["sourceType"] }> = {
  monthly_evaluation: { label: "แต้มประเมินประจำเดือน", points: null, description: "ผ่านเกณฑ์ 70 คะแนน แล้วคำนวณ (คะแนน − 60) × 6 สูงสุด 240 แต้ม", sourceType: "evaluation" },
  attendance_on_time: { label: "เข้างานตรงเวลา", points: 5, description: "ให้ได้วันละครั้ง สูงสุด 22 วัน หรือ 110 แต้มต่อเดือน", sourceType: "attendance" },
  attendance_late: { label: "มาสาย", points: -20, description: "หักแต้มเมื่อมาสายตามข้อมูลลงเวลาที่ตรวจสอบแล้ว", sourceType: "attendance" },
  absence: { label: "ขาดงานโดยไม่ได้รับอนุมัติ", points: -120, description: "ใช้เฉพาะกรณีขาดงานที่ตรวจสอบแล้ว", sourceType: "attendance" },
  approved_leave: { label: "ลาที่ได้รับอนุมัติ", points: 0, description: "บันทึกไว้ตรวจสอบโดยไม่หักแต้ม", sourceType: "attendance" },
  early_finish: { label: "ส่งงานก่อนกำหนด", points: 25, description: "โบนัสอัตโนมัติเมื่อหลักฐานผ่านการตรวจและเสร็จก่อนกำหนด", sourceType: "deadline" },
  on_time_finish: { label: "ส่งงานตรงกำหนด", points: 15, description: "โบนัสอัตโนมัติเมื่อหลักฐานผ่านการตรวจภายในวันกำหนด", sourceType: "deadline" },
  work_error: { label: "งานผิดพลาด", points: -40, description: "หักแต้มพร้อมระบุข้อผิดพลาด ผลกระทบ และแนวทางแก้ไข", sourceType: "quality" },
  warning: { label: "ได้รับใบเตือน", points: -150, description: "ต้องมีเหตุผล ผู้บันทึก และหลักฐานอ้างอิง", sourceType: "discipline" },
  rule_violation: { label: "ผิดกฎระเบียบการทำงาน", points: -100, description: "บันทึกหลังตรวจสอบข้อเท็จจริงตามระเบียบบริษัท", sourceType: "discipline" },
  bonus: { label: "โบนัสพิเศษ", points: 50, description: "ต้องมีหลักฐาน และให้ได้ไม่เกิน 2 ครั้งต่อเดือน", sourceType: "bonus" },
  quest: { label: "ทำเควสต์สำเร็จ", points: 75, description: "ต้องมีหลักฐาน ผ่านการตรวจ และให้ได้ไม่เกิน 2 ครั้งต่อเดือน", sourceType: "quest" },
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

export const periods = [
  "ไตรมาส 3 · ปี 2569",
  "ไตรมาส 2 · ปี 2569",
  "ไตรมาส 1 · ปี 2569",
];

export const roles: RoleTemplate[] = [
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

export const roleSalaryBands: Record<string, { min: number; mid: number; max: number }> = {
  "sales-manager": { min: 55000, mid: 70000, max: 90000 },
  marketing: { min: 30000, mid: 42000, max: 58000 },
  "customer-service": { min: 24000, mid: 32000, max: 42000 },
  developer: { min: 45000, mid: 65000, max: 90000 },
  "video-editor": { min: 28000, mid: 40000, max: 60000 },
  hr: { min: 32000, mid: 45000, max: 62000 },
};

const roleSkillPayMultiplier: Record<string, number> = {
  "sales-manager": 1.2,
  marketing: 1,
  "customer-service": .9,
  developer: 1.5,
  "video-editor": 1.2,
  hr: 1,
};

export const skillAllowanceByLevel: Record<number, number> = { 1: 0, 2: 500, 3: 800, 4: 1200, 5: 1800 };

export function skillAllowanceFor(roleId: string, level: number) {
  const base = skillAllowanceByLevel[Math.max(1, Math.min(5, Math.round(level)))] ?? 0;
  const multiplier = roleSkillPayMultiplier[roleId] ?? 1;
  return Math.round(base * multiplier / 100) * 100;
}

export const seedEmployees: EmployeeRecord[] = [
  { id: "emp-narin", initials: "นก", name: "นรินทร์ กิตติคุณ", email: "narin@peoplepulse.co", roleId: "sales-manager", manager: "วารุณี ภักดี", status: "active", latestScore: 92, latestSkillScore: 88, latestPeriod: periods[0], updatedAt: "2026-08-02T09:30:00.000Z" },
  { id: "emp-pimchanok", initials: "พส", name: "พิมพ์ชนก สุขใจ", email: "pimchanok@peoplepulse.co", roleId: "marketing", manager: "อรทัย ศรีสุข", status: "active", latestScore: 87, latestSkillScore: 84, latestPeriod: periods[0], updatedAt: "2026-08-01T08:20:00.000Z" },
  { id: "emp-thanawat", initials: "ธพ", name: "ธนวัฒน์ พงศ์ศรี", email: "thanawat@peoplepulse.co", roleId: "customer-service", manager: "กมลชนก มั่นคง", status: "active", latestScore: 71, latestSkillScore: 74, latestPeriod: periods[0], updatedAt: "2026-07-28T04:10:00.000Z" },
  { id: "emp-supakorn", initials: "ศว", name: "ศุภกร วัฒนะ", email: "supakorn@peoplepulse.co", roleId: "developer", manager: "ณัฐวุฒิ สายชล", status: "active", latestScore: 89, latestSkillScore: 91, latestPeriod: periods[0], updatedAt: "2026-08-03T03:45:00.000Z" },
  { id: "emp-kanyarat", initials: "กช", name: "กัญญารัตน์ ชัยพร", email: "kanyarat@peoplepulse.co", roleId: "hr", manager: "วารุณี ภักดี", status: "active", latestScore: 82, latestSkillScore: 86, latestPeriod: periods[0], updatedAt: "2026-07-30T07:15:00.000Z" },
  { id: "emp-nattapong", initials: "ณต", name: "ณัฐพงษ์ ตั้งใจ", email: "nattapong@peoplepulse.co", roleId: "sales-manager", manager: "วารุณี ภักดี", status: "active", latestScore: 84, latestSkillScore: 79, latestPeriod: periods[0], updatedAt: "2026-07-29T11:05:00.000Z" },
  { id: "emp-sirilak", initials: "ศร", name: "ศิริลักษณ์ รุ่งเรือง", email: "sirilak@peoplepulse.co", roleId: "marketing", manager: "อรทัย ศรีสุข", status: "active", latestScore: null, latestSkillScore: null, latestPeriod: null, updatedAt: "2026-07-20T06:00:00.000Z" },
  { id: "emp-pattarapon", initials: "ภพ", name: "ภัทรพล พูนทรัพย์", email: "pattarapon@peoplepulse.co", roleId: "developer", manager: "ณัฐวุฒิ สายชล", status: "active", latestScore: null, latestSkillScore: null, latestPeriod: null, updatedAt: "2026-07-18T05:50:00.000Z" },
];

export const seedHrProfiles: HrProfileRecord[] = [
  { employeeId: "emp-narin", currentSalary: 72000, salaryReviewMonth: "มกราคม 2570", updatedAt: "2026-08-02T09:30:00.000Z" },
  { employeeId: "emp-pimchanok", currentSalary: 44000, salaryReviewMonth: "มกราคม 2570", updatedAt: "2026-08-01T08:20:00.000Z" },
  { employeeId: "emp-thanawat", currentSalary: 30000, salaryReviewMonth: "ตุลาคม 2569", updatedAt: "2026-07-28T04:10:00.000Z" },
  { employeeId: "emp-supakorn", currentSalary: 68000, salaryReviewMonth: "มกราคม 2570", updatedAt: "2026-08-03T03:45:00.000Z" },
  { employeeId: "emp-kanyarat", currentSalary: 46000, salaryReviewMonth: "มกราคม 2570", updatedAt: "2026-07-30T07:15:00.000Z" },
  { employeeId: "emp-nattapong", currentSalary: 61000, salaryReviewMonth: "ตุลาคม 2569", updatedAt: "2026-07-29T11:05:00.000Z" },
  { employeeId: "emp-sirilak", currentSalary: 36000, salaryReviewMonth: "มกราคม 2570", updatedAt: "2026-07-20T06:00:00.000Z" },
  { employeeId: "emp-pattarapon", currentSalary: 52000, salaryReviewMonth: "มกราคม 2570", updatedAt: "2026-07-18T05:50:00.000Z" },
];

export const seedAttendanceRecords: AttendanceRecord[] = [
  { id: "attendance-narin-2026-08-22", employeeId: "emp-narin", workDate: "2026-08-22", status: "present", clockIn: "08:42", clockOut: null, minutesLate: 0, leaveType: null, note: "ลงเวลาผ่านระบบ", approvalStatus: "not_required", approvedBy: null, approvedAt: null, createdBy: "ระบบลงเวลา", createdAt: "2026-08-22T01:42:00.000Z", updatedAt: "2026-08-22T01:42:00.000Z" },
  { id: "attendance-pimchanok-2026-08-22", employeeId: "emp-pimchanok", workDate: "2026-08-22", status: "late", clockIn: "09:18", clockOut: null, minutesLate: 18, leaveType: null, note: "รถติด แจ้งหัวหน้าแล้ว", approvalStatus: "not_required", approvedBy: null, approvedAt: null, createdBy: "ระบบลงเวลา", createdAt: "2026-08-22T02:18:00.000Z", updatedAt: "2026-08-22T02:18:00.000Z" },
  { id: "attendance-thanawat-2026-08-22", employeeId: "emp-thanawat", workDate: "2026-08-22", status: "leave", clockIn: null, clockOut: null, minutesLate: 0, leaveType: "sick", note: "ลาป่วย 1 วัน แนบเอกสารในแฟ้มพนักงาน", approvalStatus: "pending", approvedBy: null, approvedAt: null, createdBy: "ธนวัฒน์ พงศ์ศรี", createdAt: "2026-08-22T00:30:00.000Z", updatedAt: "2026-08-22T00:30:00.000Z" },
  { id: "attendance-supakorn-2026-08-22", employeeId: "emp-supakorn", workDate: "2026-08-22", status: "present", clockIn: "08:55", clockOut: null, minutesLate: 0, leaveType: null, note: "", approvalStatus: "not_required", approvedBy: null, approvedAt: null, createdBy: "ระบบลงเวลา", createdAt: "2026-08-22T01:55:00.000Z", updatedAt: "2026-08-22T01:55:00.000Z" },
];

export const seedSkillAchievements: SkillAchievementRecord[] = [
  { id: "achievement-narin-negotiation-4", employeeId: "emp-narin", roleId: "sales-manager", skillId: "negotiation", skillName: "การเจรจาต่อรอง", level: 4, monthlyAllowance: 1400, verifiedBy: "ฝ่ายทรัพยากรบุคคล", verifiedAt: "2026-08-05T04:00:00.000Z", evidenceUrl: "", note: "ผ่านการทดสอบและมีผลงานปิดดีลตามเกณฑ์", createdAt: "2026-08-05T04:00:00.000Z" },
  { id: "achievement-supakorn-engineering-4", employeeId: "emp-supakorn", roleId: "developer", skillId: "engineering", skillName: "ทักษะวิศวกรรมซอฟต์แวร์", level: 4, monthlyAllowance: 1800, verifiedBy: "ฝ่ายทรัพยากรบุคคล", verifiedAt: "2026-08-08T04:00:00.000Z", evidenceUrl: "", note: "ผ่านผลงานจริงและการทดสอบระดับ 4", createdAt: "2026-08-08T04:00:00.000Z" },
];

export const seedTalentActions: TalentActionRecord[] = [
  { id: "action-thanawat-test", employeeId: "emp-thanawat", type: "skill_test", title: "ทดสอบการแก้ปัญหาและความรู้ผลิตภัณฑ์", status: "planned", score: null, dueDate: "2026-08-28", targetRoleId: "customer-service", createdAt: "2026-08-04T03:00:00.000Z", updatedAt: "2026-08-04T03:00:00.000Z" },
  { id: "action-nattapong-upskill", employeeId: "emp-nattapong", type: "upskill", title: "โปรแกรม Coaching for Performance", status: "in_progress", score: null, dueDate: "2026-09-15", targetRoleId: "sales-manager", createdAt: "2026-08-04T03:10:00.000Z", updatedAt: "2026-08-10T03:10:00.000Z" },
  { id: "action-pim-role", employeeId: "emp-pimchanok", type: "role_review", title: "ประเมินความพร้อมสายงาน People Analytics", status: "planned", score: null, dueDate: "2026-09-05", targetRoleId: "hr", createdAt: "2026-08-04T03:20:00.000Z", updatedAt: "2026-08-04T03:20:00.000Z" },
  { id: "action-narin-salary", employeeId: "emp-narin", type: "salary_review", title: "ทบทวนค่าตอบแทนตามผลงาน", status: "planned", score: null, dueDate: "2026-10-01", targetRoleId: "sales-manager", createdAt: "2026-08-04T03:30:00.000Z", updatedAt: "2026-08-04T03:30:00.000Z" },
];

export const seedProjects: ProjectRecord[] = [
  { id: "project-growth-q3", name: "Growth Sprint Q3", description: "ยกระดับยอดขายและแคมเปญเพื่อปิดไตรมาสให้เหนือเป้าหมาย", ownerEmployeeId: "emp-narin", departmentId: "sales", status: "active", dueDate: "2026-09-30", color: "mustard", createdAt: "2026-08-01T02:00:00.000Z", updatedAt: "2026-08-18T06:00:00.000Z" },
  { id: "project-cx-zero-wait", name: "CX Zero Wait", description: "ลดเวลารอและเพิ่มคุณภาพการแก้ปัญหาของลูกค้า", ownerEmployeeId: "emp-thanawat", departmentId: "service", status: "active", dueDate: "2026-09-18", color: "terra", createdAt: "2026-08-02T02:00:00.000Z", updatedAt: "2026-08-17T04:00:00.000Z" },
  { id: "project-platform-trust", name: "Platform Trust", description: "เพิ่มความเสถียร ระบบเฝ้าระวัง และคู่มือแก้เหตุขัดข้อง", ownerEmployeeId: "emp-supakorn", departmentId: "technology", status: "active", dueDate: "2026-10-15", color: "forest", createdAt: "2026-08-03T02:00:00.000Z", updatedAt: "2026-08-18T07:00:00.000Z" },
  { id: "project-people-onboarding", name: "Onboarding 30 Days", description: "สร้างประสบการณ์เริ่มงานและภารกิจเรียนรู้ 30 วันแรก", ownerEmployeeId: "emp-kanyarat", departmentId: "people", status: "planned", dueDate: "2026-10-30", color: "sage", createdAt: "2026-08-10T02:00:00.000Z", updatedAt: "2026-08-10T02:00:00.000Z" },
];

export const seedWorkItems: WorkItemRecord[] = [
  { id: "work-growth-story", projectId: "project-growth-q3", assigneeEmployeeId: "emp-pimchanok", kind: "task", title: "สรุป Customer Story สำหรับแคมเปญ", description: "จัดทำเรื่องเล่าลูกค้า 3 เคสพร้อมผลลัพธ์เชิงตัวเลข", priority: "high", status: "in_progress", progress: 65, points: 110, dueDate: "2026-08-26", createdAt: "2026-08-05T03:00:00.000Z", updatedAt: "2026-08-18T04:10:00.000Z" },
  { id: "work-growth-key-account", projectId: "project-growth-q3", assigneeEmployeeId: "emp-narin", kind: "mission", title: "ปิดดีลลูกค้า Key Account", description: "ปิดดีลใหม่มูลค่าตามเป้าหมายและถ่ายทอดวิธีการให้ทีม", priority: "urgent", status: "done", progress: 100, points: 180, dueDate: "2026-08-15", createdAt: "2026-08-01T03:00:00.000Z", updatedAt: "2026-08-15T09:00:00.000Z" },
  { id: "work-growth-lead-request", projectId: "project-growth-q3", assigneeEmployeeId: "emp-sirilak", kind: "request", title: "ขอชุดรายชื่อลูกค้าเป้าหมายใหม่", description: "คัดกรองรายชื่อกลุ่มธุรกิจบริการอย่างน้อย 120 ราย", priority: "medium", status: "todo", progress: 0, points: 70, dueDate: "2026-08-29", createdAt: "2026-08-18T05:00:00.000Z", updatedAt: "2026-08-18T05:00:00.000Z" },
  { id: "work-cx-knowledge", projectId: "project-cx-zero-wait", assigneeEmployeeId: "emp-thanawat", kind: "mission", title: "สร้างคลังคำตอบ 20 ปัญหาหลัก", description: "จัดทำคำตอบมาตรฐานและส่งให้หัวหน้าตรวจคุณภาพ", priority: "high", status: "review", progress: 90, points: 160, dueDate: "2026-08-22", createdAt: "2026-08-04T05:00:00.000Z", updatedAt: "2026-08-18T03:00:00.000Z" },
  { id: "work-cx-refund", projectId: "project-cx-zero-wait", assigneeEmployeeId: "emp-thanawat", kind: "request", title: "รีเควสต์ปรับขั้นตอนคืนเงิน", description: "รวบรวมจุดติดขัดและเสนอขั้นตอนใหม่ให้เหลือไม่เกิน 3 ขั้น", priority: "urgent", status: "in_progress", progress: 40, points: 120, dueDate: "2026-08-24", createdAt: "2026-08-12T04:00:00.000Z", updatedAt: "2026-08-18T07:00:00.000Z" },
  { id: "work-tech-runbook", projectId: "project-platform-trust", assigneeEmployeeId: "emp-supakorn", kind: "task", title: "จัดทำ Incident Runbook", description: "คู่มือรับมือ 5 เหตุการณ์สำคัญพร้อมผู้รับผิดชอบ", priority: "high", status: "done", progress: 100, points: 140, dueDate: "2026-08-16", createdAt: "2026-08-03T06:00:00.000Z", updatedAt: "2026-08-16T08:00:00.000Z" },
  { id: "work-tech-alert", projectId: "project-platform-trust", assigneeEmployeeId: "emp-pattarapon", kind: "task", title: "ปรับระบบแจ้งเตือนให้ลด False Alarm", description: "ทบทวน threshold และลดการแจ้งเตือนซ้ำอย่างน้อย 30%", priority: "medium", status: "in_progress", progress: 55, points: 150, dueDate: "2026-08-31", createdAt: "2026-08-09T06:00:00.000Z", updatedAt: "2026-08-18T08:00:00.000Z" },
  { id: "work-people-checklist", projectId: "project-people-onboarding", assigneeEmployeeId: "emp-kanyarat", kind: "task", title: "ออกแบบ Onboarding Checklist", description: "กำหนดภารกิจสัปดาห์ 1–4 พร้อมผู้ดูแลและแต้มรางวัล", priority: "medium", status: "todo", progress: 10, points: 130, dueDate: "2026-09-05", createdAt: "2026-08-10T06:00:00.000Z", updatedAt: "2026-08-18T08:00:00.000Z" },
];

export const seedRewards: RewardRecord[] = [
  { id: "reward-coffee", title: "คูปองกาแฟ", description: "เครื่องดื่ม 1 แก้วจากร้านพาร์ตเนอร์", category: "perk", costPoints: 120, stock: 20, icon: "☕", isActive: true, createdAt: "2026-08-01T02:00:00.000Z", updatedAt: "2026-08-01T02:00:00.000Z" },
  { id: "reward-cash-100", title: "คูปองเงินสด 100 บาท", description: "กิฟต์วอเชอร์มูลค่า 100 บาท ส่งให้หลังคำขอได้รับอนุมัติ", category: "perk", costPoints: 1000, stock: 100, icon: "฿", isActive: true, createdAt: "2026-08-21T02:00:00.000Z", updatedAt: "2026-08-21T02:00:00.000Z" },
  { id: "reward-shopping-500", title: "กิฟต์วอเชอร์ 500 บาท", description: "เลือกใช้กับร้านค้าที่บริษัทกำหนดหลังตรวจสอบสิทธิ์", category: "perk", costPoints: 5000, stock: 30, icon: "▣", isActive: true, createdAt: "2026-08-21T02:05:00.000Z", updatedAt: "2026-08-21T02:05:00.000Z" },
  { id: "reward-half-day", title: "วันหยุดครึ่งวัน", description: "แลกสิทธิ์วันหยุดเพิ่มเติมครึ่งวัน", category: "wellbeing", costPoints: 500, stock: 6, icon: "☀", isActive: true, createdAt: "2026-08-01T02:00:00.000Z", updatedAt: "2026-08-01T02:00:00.000Z" },
  { id: "reward-learning", title: "งบเรียนรู้ 1,000 บาท", description: "ใช้กับคอร์ส หนังสือ หรือเวิร์กช็อป", category: "learning", costPoints: 850, stock: 4, icon: "↗", isActive: true, createdAt: "2026-08-01T02:00:00.000Z", updatedAt: "2026-08-01T02:00:00.000Z" },
  { id: "reward-lunch", title: "มื้อพิเศษกับทีม", description: "เครดิตอาหารกลางวันสำหรับฉลองความสำเร็จ", category: "recognition", costPoints: 350, stock: 10, icon: "★", isActive: true, createdAt: "2026-08-01T02:00:00.000Z", updatedAt: "2026-08-01T02:00:00.000Z" },
  { id: "reward-iphone-18", title: "iPhone 18", description: "รางวัลพิเศษมูลค่าสูง จำกัดจำนวนและต้องผ่านการอนุมัติตามนโยบายบริษัท", category: "recognition", costPoints: 500000, stock: 1, icon: "◎", isActive: true, createdAt: "2026-08-21T02:10:00.000Z", updatedAt: "2026-08-21T02:10:00.000Z" },
];

export const seedPointLedger: PointLedgerRecord[] = [
  { id: "points-work-growth-key-account", employeeId: "emp-narin", sourceType: "mission", sourceId: "work-growth-key-account", points: 180, note: "สำเร็จภารกิจปิดดีล Key Account", createdAt: "2026-08-15T09:00:00.000Z" },
  { id: "points-work-tech-runbook", employeeId: "emp-supakorn", sourceType: "task", sourceId: "work-tech-runbook", points: 140, note: "จัดทำ Incident Runbook สำเร็จ", createdAt: "2026-08-16T08:00:00.000Z" },
  { id: "points-bonus-pim", employeeId: "emp-pimchanok", sourceType: "bonus", sourceId: "bonus-q3-pim", points: 420, note: "โบนัสผลงานแคมเปญไตรมาส 3", createdAt: "2026-08-12T06:00:00.000Z" },
  { id: "points-bonus-thanawat", employeeId: "emp-thanawat", sourceType: "bonus", sourceId: "bonus-cx-thanawat", points: 260, note: "คะแนนคำชมจากลูกค้า", createdAt: "2026-08-13T06:00:00.000Z" },
  { id: "points-bonus-kanyarat", employeeId: "emp-kanyarat", sourceType: "bonus", sourceId: "bonus-people-kanyarat", points: 310, note: "สนับสนุนกิจกรรมพัฒนาทีม", createdAt: "2026-08-14T06:00:00.000Z" },
  { id: "points-bonus-nattapong", employeeId: "emp-nattapong", sourceType: "bonus", sourceId: "bonus-coaching-nattapong", points: 290, note: "แบ่งปันเทคนิคการขายกับทีม", createdAt: "2026-08-14T07:00:00.000Z" },
  { id: "points-bonus-sirilak", employeeId: "emp-sirilak", sourceType: "bonus", sourceId: "bonus-content-sirilak", points: 180, note: "ช่วยงานคอนเทนต์เร่งด่วน", createdAt: "2026-08-15T07:00:00.000Z" },
  { id: "points-bonus-pattarapon", employeeId: "emp-pattarapon", sourceType: "bonus", sourceId: "bonus-platform-pattarapon", points: 230, note: "แก้เหตุระบบนอกเวลาทำการ", createdAt: "2026-08-17T07:00:00.000Z" },
];

export const seedRewardRedemptions: RewardRedemptionRecord[] = [];

export const seedEmployeeProfiles: EmployeeProfileRecord[] = [
  { employeeId: "emp-narin", personalEmail: "narin.k@example.com", phone: "089-245-6712", birthDate: "1990-04-18", nationalIdLast4: "4821", address: "เขตบางรัก กรุงเทพมหานคร", emergencyName: "นลินี กิตติคุณ", emergencyPhone: "081-345-9981", startDate: "2022-02-01", employmentType: "permanent", education: "บริหารธุรกิจบัณฑิต มหาวิทยาลัยเชียงใหม่", experienceYears: 9, applicationSource: "Employee Referral", updatedAt: "2026-08-10T07:00:00.000Z" },
  { employeeId: "emp-pimchanok", personalEmail: "pim.s@example.com", phone: "086-725-1840", birthDate: "1995-11-09", nationalIdLast4: "1906", address: "เขตพญาไท กรุงเทพมหานคร", emergencyName: "ภาณุ สุขใจ", emergencyPhone: "094-551-2088", startDate: "2023-06-15", employmentType: "permanent", education: "นิเทศศาสตรบัณฑิต มหาวิทยาลัยกรุงเทพ", experienceYears: 5, applicationSource: "LinkedIn", updatedAt: "2026-08-08T07:00:00.000Z" },
  { employeeId: "emp-thanawat", personalEmail: "thanawat.p@example.com", phone: "092-448-3207", birthDate: "1997-01-21", nationalIdLast4: "7334", address: "อำเภอเมือง นนทบุรี", emergencyName: "ธัญชนก พงศ์ศรี", emergencyPhone: "089-780-4421", startDate: "2024-01-08", employmentType: "permanent", education: "ศิลปศาสตรบัณฑิต มหาวิทยาลัยรามคำแหง", experienceYears: 4, applicationSource: "JobsDB", updatedAt: "2026-08-09T07:00:00.000Z" },
  { employeeId: "emp-supakorn", personalEmail: "supakorn.w@example.com", phone: "095-113-7846", birthDate: "1992-07-02", nationalIdLast4: "6158", address: "เขตสวนหลวง กรุงเทพมหานคร", emergencyName: "ศิริพร วัฒนะ", emergencyPhone: "086-331-0094", startDate: "2021-09-01", employmentType: "permanent", education: "วิศวกรรมศาสตรบัณฑิต มหาวิทยาลัยเทคโนโลยีพระจอมเกล้าธนบุรี", experienceYears: 8, applicationSource: "Tech Community", updatedAt: "2026-08-10T07:00:00.000Z" },
  { employeeId: "emp-kanyarat", personalEmail: "kanyarat.c@example.com", phone: "081-624-9155", birthDate: "1993-05-13", nationalIdLast4: "3407", address: "เขตจตุจักร กรุงเทพมหานคร", emergencyName: "กฤตชัย ชัยพร", emergencyPhone: "098-205-7814", startDate: "2022-11-16", employmentType: "permanent", education: "รัฐศาสตรบัณฑิต มหาวิทยาลัยธรรมศาสตร์", experienceYears: 7, applicationSource: "Career Page", updatedAt: "2026-08-11T07:00:00.000Z" },
  { employeeId: "emp-nattapong", personalEmail: "nattapong.t@example.com", phone: "088-275-6339", birthDate: "1991-09-27", nationalIdLast4: "9274", address: "อำเภอปากเกร็ด นนทบุรี", emergencyName: "นิชา ตั้งใจ", emergencyPhone: "082-661-7400", startDate: "2023-03-01", employmentType: "permanent", education: "บริหารธุรกิจมหาบัณฑิต มหาวิทยาลัยเกษตรศาสตร์", experienceYears: 10, applicationSource: "Recruiter", updatedAt: "2026-08-08T07:00:00.000Z" },
  { employeeId: "emp-sirilak", personalEmail: "sirilak.r@example.com", phone: "093-508-2871", birthDate: "1998-12-04", nationalIdLast4: "2059", address: "เขตดินแดง กรุงเทพมหานคร", emergencyName: "สุกัญญา รุ่งเรือง", emergencyPhone: "090-664-5271", startDate: "2026-07-01", employmentType: "probation", education: "อักษรศาสตรบัณฑิต มหาวิทยาลัยศิลปากร", experienceYears: 3, applicationSource: "University Alumni", updatedAt: "2026-08-07T07:00:00.000Z" },
  { employeeId: "emp-pattarapon", personalEmail: "pattarapon.p@example.com", phone: "097-362-8814", birthDate: "1996-08-19", nationalIdLast4: "7740", address: "เขตบางนา กรุงเทพมหานคร", emergencyName: "พรพิมล พูนทรัพย์", emergencyPhone: "084-411-7350", startDate: "2026-06-16", employmentType: "probation", education: "วิทยาศาสตรบัณฑิต มหาวิทยาลัยมหิดล", experienceYears: 4, applicationSource: "GitHub Portfolio", updatedAt: "2026-08-07T07:00:00.000Z" },
];

export const seedApplicationDocuments: ApplicationDocumentRecord[] = [
  { id: "doc-narin-resume", employeeId: "emp-narin", documentType: "resume", title: "ประวัติย่อ (Resume)", fileName: "resume-narin.pdf", storageKey: "", contentType: "application/pdf", sizeBytes: 428000, status: "verified", note: "นำเข้าจากแฟ้มเดิม", uploadedBy: "ฝ่ายทรัพยากรบุคคล", uploadedAt: "2022-01-12T04:00:00.000Z", verifiedBy: "ฝ่ายทรัพยากรบุคคล", verifiedAt: "2022-01-13T04:00:00.000Z" },
  { id: "doc-narin-id", employeeId: "emp-narin", documentType: "id_card", title: "สำเนาบัตรประชาชน", fileName: "id-card-narin.pdf", storageKey: "", contentType: "application/pdf", sizeBytes: 316000, status: "verified", note: "นำเข้าจากแฟ้มเดิม", uploadedBy: "ฝ่ายทรัพยากรบุคคล", uploadedAt: "2022-01-12T04:10:00.000Z", verifiedBy: "ฝ่ายทรัพยากรบุคคล", verifiedAt: "2022-01-13T04:10:00.000Z" },
  { id: "doc-narin-transcript", employeeId: "emp-narin", documentType: "transcript", title: "วุฒิการศึกษา / Transcript", fileName: "transcript-narin.pdf", storageKey: "", contentType: "application/pdf", sizeBytes: 520000, status: "verified", note: "นำเข้าจากแฟ้มเดิม", uploadedBy: "ฝ่ายทรัพยากรบุคคล", uploadedAt: "2022-01-12T04:20:00.000Z", verifiedBy: "ฝ่ายทรัพยากรบุคคล", verifiedAt: "2022-01-13T04:20:00.000Z" },
  { id: "doc-pim-resume", employeeId: "emp-pimchanok", documentType: "resume", title: "ประวัติย่อ (Resume)", fileName: "resume-pimchanok.pdf", storageKey: "", contentType: "application/pdf", sizeBytes: 376000, status: "verified", note: "นำเข้าจากระบบสรรหา", uploadedBy: "Recruitment Team", uploadedAt: "2023-05-20T04:00:00.000Z", verifiedBy: "ฝ่ายทรัพยากรบุคคล", verifiedAt: "2023-05-22T04:00:00.000Z" },
  { id: "doc-sirilak-resume", employeeId: "emp-sirilak", documentType: "resume", title: "ประวัติย่อ (Resume)", fileName: "resume-sirilak.pdf", storageKey: "", contentType: "application/pdf", sizeBytes: 390000, status: "verified", note: "ตรวจแล้วจากระบบสรรหา", uploadedBy: "Recruitment Team", uploadedAt: "2026-05-18T04:00:00.000Z", verifiedBy: "ฝ่ายทรัพยากรบุคคล", verifiedAt: "2026-05-20T04:00:00.000Z" },
  { id: "doc-sirilak-id", employeeId: "emp-sirilak", documentType: "id_card", title: "สำเนาบัตรประชาชน", fileName: "id-card-sirilak.pdf", storageKey: "", contentType: "application/pdf", sizeBytes: 280000, status: "pending", note: "รอตรวจความชัดเจน", uploadedBy: "ศิริลักษณ์ รุ่งเรือง", uploadedAt: "2026-06-20T04:00:00.000Z", verifiedBy: null, verifiedAt: null },
];

export const seedEmploymentContracts: EmploymentContractRecord[] = [
  { id: "contract-narin-2022", employeeId: "emp-narin", documentId: null, title: "สัญญาจ้างพนักงานประจำ", version: "1.0", status: "signed", effectiveDate: "2022-02-01", expiryDate: null, sentAt: "2022-01-18T04:00:00.000Z", signedName: "นรินทร์ กิตติคุณ", signedAt: "2022-01-19T06:30:00.000Z", consentText: "ข้าพเจ้าได้อ่านและยอมรับข้อกำหนดในสัญญาจ้างฉบับนี้", signerUserId: "legacy-import", signerEmail: "narin@peoplepulse.co", createdBy: "ฝ่ายทรัพยากรบุคคล", createdAt: "2022-01-18T04:00:00.000Z", updatedAt: "2022-01-19T06:30:00.000Z" },
  { id: "contract-sirilak-2026", employeeId: "emp-sirilak", documentId: null, title: "สัญญาจ้างและเงื่อนไขทดลองงาน", version: "1.0", status: "sent", effectiveDate: "2026-07-01", expiryDate: "2026-10-28", sentAt: "2026-06-18T03:00:00.000Z", signedName: null, signedAt: null, consentText: "", signerUserId: null, signerEmail: null, createdBy: "ฝ่ายทรัพยากรบุคคล", createdAt: "2026-06-18T03:00:00.000Z", updatedAt: "2026-06-18T03:00:00.000Z" },
  { id: "contract-pattarapon-2026", employeeId: "emp-pattarapon", documentId: null, title: "สัญญาจ้างและเงื่อนไขทดลองงาน", version: "1.0", status: "draft", effectiveDate: "2026-06-16", expiryDate: "2026-10-13", sentAt: null, signedName: null, signedAt: null, consentText: "", signerUserId: null, signerEmail: null, createdBy: "ฝ่ายทรัพยากรบุคคล", createdAt: "2026-06-10T03:00:00.000Z", updatedAt: "2026-06-10T03:00:00.000Z" },
];

export function getRole(roleId: string) {
  return roles.find((role) => role.id === roleId) ?? roles[0];
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
