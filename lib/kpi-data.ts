export type ScoreStatus = "ดีเยี่ยม" | "ตามเป้าหมาย" | "ควรติดตาม";

export type MetricTemplate = {
  id: string;
  name: string;
  target: string;
};

export type KpiTemplate = MetricTemplate & {
  weight: number;
};

export type SkillTemplate = MetricTemplate & {
  targetLevel: number;
};

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

export type HrProfileRecord = {
  employeeId: string;
  currentSalary: number;
  salaryReviewMonth: string;
  updatedAt: string;
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
  sourceType: "task" | "mission" | "bonus" | "redemption";
  sourceId: string;
  points: number;
  note: string;
  createdAt: string;
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
    skills: [
      { id: "negotiation", name: "การเจรจาต่อรอง", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "forecasting", name: "การวางแผนยอดขาย", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "coaching", name: "การโค้ชทีม", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "customer-insight", name: "ความเข้าใจลูกค้า", target: "ระดับ 4 จาก 5", targetLevel: 4 },
    ],
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
    skills: [
      { id: "campaign-strategy", name: "กลยุทธ์แคมเปญ", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "analytics", name: "การวิเคราะห์ข้อมูล", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "content", name: "การสื่อสารเนื้อหา", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "experimentation", name: "การทดลองและเรียนรู้", target: "ระดับ 3 จาก 5", targetLevel: 3 },
    ],
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
    skills: [
      { id: "empathy", name: "ความเข้าอกเข้าใจ", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "problem-solving", name: "การแก้ปัญหา", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "product-knowledge", name: "ความรู้ผลิตภัณฑ์", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "communication", name: "การสื่อสาร", target: "ระดับ 4 จาก 5", targetLevel: 4 },
    ],
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
    skills: [
      { id: "engineering", name: "ทักษะวิศวกรรมซอฟต์แวร์", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "system-design", name: "การออกแบบระบบ", target: "ระดับ 3 จาก 5", targetLevel: 3 },
      { id: "quality", name: "การประกันคุณภาพ", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "collaboration", name: "การทำงานร่วมกัน", target: "ระดับ 4 จาก 5", targetLevel: 4 },
    ],
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
    skills: [
      { id: "people-analytics", name: "การวิเคราะห์ข้อมูลบุคลากร", target: "ระดับ 3 จาก 5", targetLevel: 3 },
      { id: "labor-practice", name: "งานบุคคลและข้อกำหนด", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "facilitation", name: "การอำนวยความร่วมมือ", target: "ระดับ 4 จาก 5", targetLevel: 4 },
      { id: "talent-development", name: "การพัฒนาบุคลากร", target: "ระดับ 4 จาก 5", targetLevel: 4 },
    ],
  },
];

export const roleSalaryBands: Record<string, { min: number; mid: number; max: number }> = {
  "sales-manager": { min: 55000, mid: 70000, max: 90000 },
  marketing: { min: 30000, mid: 42000, max: 58000 },
  "customer-service": { min: 24000, mid: 32000, max: 42000 },
  developer: { min: 45000, mid: 65000, max: 90000 },
  hr: { min: 32000, mid: 45000, max: 62000 },
};

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
  { id: "reward-half-day", title: "วันหยุดครึ่งวัน", description: "แลกสิทธิ์วันหยุดเพิ่มเติมครึ่งวัน", category: "wellbeing", costPoints: 500, stock: 6, icon: "☀", isActive: true, createdAt: "2026-08-01T02:00:00.000Z", updatedAt: "2026-08-01T02:00:00.000Z" },
  { id: "reward-learning", title: "งบเรียนรู้ 1,000 บาท", description: "ใช้กับคอร์ส หนังสือ หรือเวิร์กช็อป", category: "learning", costPoints: 850, stock: 4, icon: "↗", isActive: true, createdAt: "2026-08-01T02:00:00.000Z", updatedAt: "2026-08-01T02:00:00.000Z" },
  { id: "reward-lunch", title: "มื้อพิเศษกับทีม", description: "เครดิตอาหารกลางวันสำหรับฉลองความสำเร็จ", category: "recognition", costPoints: 350, stock: 10, icon: "★", isActive: true, createdAt: "2026-08-01T02:00:00.000Z", updatedAt: "2026-08-01T02:00:00.000Z" },
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
