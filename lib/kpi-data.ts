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
