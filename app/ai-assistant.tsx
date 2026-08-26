"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type PeopleAiActionId = "open_today" | "open_overdue" | "create_task" | "open_evaluations" | "open_skills" | "open_hr" | "open_portfolio";

export type PeopleAiEmployee = {
  id: string;
  name: string;
  roleId: string;
  roleName: string;
  department: string;
  kpiScore: number | null;
  skillScore: number | null;
  totalScore: number | null;
  bestFitRole: string;
  bestFitScore: number | null;
  skills: { name: string; current: number | null; target: number }[];
};

export type PeopleAiTask = {
  id: string;
  title: string;
  assigneeEmployeeId: string;
  assigneeName: string;
  projectName: string;
  status: "todo" | "in_progress" | "review" | "done";
  priority: "low" | "medium" | "high" | "urgent";
  progress: number;
  dueDate: string;
};

export type PeopleAiContext = {
  userKey: string;
  userName: string;
  userRole: string;
  period: string;
  currentView: string;
  canManagePeople: boolean;
  canManageWork: boolean;
  employees: PeopleAiEmployee[];
  tasks: PeopleAiTask[];
};

type AssistantAction = { id: PeopleAiActionId; label: string };
type ChatMessage = { id: string; role: "assistant" | "user"; content: string; actions?: AssistantAction[]; createdAt: string };

const priorityLabels: Record<PeopleAiTask["priority"], string> = { low: "ทั่วไป", medium: "ปานกลาง", high: "สำคัญ", urgent: "เร่งด่วน" };
const statusLabels: Record<PeopleAiTask["status"], string> = { todo: "ยังไม่เริ่ม", in_progress: "กำลังทำ", review: "รอตรวจ", done: "เสร็จแล้ว" };

const futureSkills: Record<string, string[]> = {
  "sales-manager": ["การพยากรณ์ยอดขายด้วยข้อมูล", "AI ช่วยเตรียมการขาย", "การโค้ชทีมแบบวัดผล"],
  marketing: ["AI Content Operations", "การวัดผล Attribution", "การทดลองแคมเปญอย่างเป็นระบบ"],
  "customer-service": ["การออกแบบฐานความรู้", "Conversation Quality Analysis", "ระบบบริการลูกค้าอัตโนมัติ"],
  developer: ["AI-assisted Development", "ความปลอดภัยของระบบ", "Workflow Automation"],
  "video-editor": ["AI-assisted Editing", "Short-form Storytelling", "Color Grading และ Sound Design"],
  hr: ["People Analytics", "Workforce Planning", "การโค้ชและพัฒนาคน"],
};

const quickPrompts = [
  { id: "tasks", label: "จัดงานวันนี้", prompt: "ช่วยจัดลำดับงานวันนี้และงานเร่งด่วนให้หน่อย" },
  { id: "kpi", label: "วิเคราะห์ KPI", prompt: "ช่วยวิเคราะห์ KPI และบอกจุดที่ควรติดตาม" },
  { id: "skills", label: "แนะนำสกิล", prompt: "ช่วยวิเคราะห์สกิลที่ควรพัฒนาและแนะนำสกิลใหม่" },
  { id: "evaluation", label: "ช่วยประเมิน", prompt: "ช่วยเตรียมข้อสรุปสำหรับการประเมินผลงาน" },
  { id: "help", label: "แก้ปัญหาระบบ", prompt: "ช่วยแนะนำวิธีใช้งานและแก้ปัญหาในระบบ" },
];

function nowTime() {
  return new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
}

function assistantWelcome(name: string): ChatMessage {
  return {
    id: "welcome",
    role: "assistant",
    createdAt: nowTime(),
    content: `สวัสดี ${name || "ครับ"} ผมคือ People AI ผู้ช่วยงานของคุณ\nผมช่วยอ่านภาพรวม KPI วิเคราะห์สกิล จัดลำดับทูดูลิส เตรียมประเมิน และแนะนำวิธีแก้ปัญหาในระบบได้ ลองเลือกหัวข้อด้านล่างหรือพิมพ์คำถามได้เลย`,
  };
}

function loadConversation(storageKey: string, name: string) {
  if (typeof window === "undefined") return [assistantWelcome(name)];
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return [assistantWelcome(name)];
    const parsed = JSON.parse(stored) as ChatMessage[];
    return Array.isArray(parsed) && parsed.length ? parsed.slice(-30).map((message, index) => ({ ...message, id: `saved-${index}` })) : [assistantWelcome(name)];
  } catch {
    return [assistantWelcome(name)];
  }
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "2-digit" }).format(new Date(`${date}T00:00:00+07:00`));
}

function average(values: (number | null)[]) {
  const measured = values.filter((value): value is number => value !== null);
  return measured.length ? measured.reduce((sum, value) => sum + value, 0) / measured.length : null;
}

function findFocusedEmployee(context: PeopleAiContext, focusEmployeeId: string, query: string) {
  if (focusEmployeeId) return context.employees.find((employee) => employee.id === focusEmployeeId) ?? null;
  const normalized = query.toLocaleLowerCase("th").replaceAll(" ", "");
  return context.employees.find((employee) => normalized.includes(employee.name.toLocaleLowerCase("th").replaceAll(" ", ""))) ?? null;
}

function taskActions(canManageWork: boolean): AssistantAction[] {
  return [
    { id: "open_today", label: "เปิดงานวันนี้" },
    { id: "open_overdue", label: "ดูงานเกินกำหนด" },
    ...(canManageWork ? [{ id: "create_task" as const, label: "สร้างงานใหม่" }] : []),
  ];
}

function taskAnalysis(context: PeopleAiContext, employee: PeopleAiEmployee | null) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
  const scope = context.tasks.filter((task) => task.status !== "done" && (!employee || task.assigneeEmployeeId === employee.id));
  const ranked = scope.slice().sort((a, b) => {
    const overdueA = a.dueDate < today ? 0 : 1;
    const overdueB = b.dueDate < today ? 0 : 1;
    const priorityRank = { urgent: 0, high: 1, medium: 2, low: 3 };
    return overdueA - overdueB || a.dueDate.localeCompare(b.dueDate) || priorityRank[a.priority] - priorityRank[b.priority];
  });
  const overdue = ranked.filter((task) => task.dueDate < today);
  const dueToday = ranked.filter((task) => task.dueDate === today);
  const review = ranked.filter((task) => task.status === "review");
  const headline = employee ? `ลำดับงานของ ${employee.name}` : "ลำดับงานที่ควรจัดการก่อน";
  if (!ranked.length) {
    return { content: `${headline}\nไม่พบงานค้างในขอบเขตที่คุณมีสิทธิ์เห็น ตอนนี้สามารถรับงานใหม่หรือวางแผนงานล่วงหน้าได้`, actions: taskActions(context.canManageWork) };
  }
  const lines = ranked.slice(0, 5).map((task, index) => `${index + 1}. ${task.title} — ${priorityLabels[task.priority]} · ${statusLabels[task.status]} · กำหนด ${formatDate(task.dueDate)} · คืบหน้า ${task.progress}%`);
  return {
    content: `${headline}\nพบงานค้าง ${ranked.length} งาน: เกินกำหนด ${overdue.length}, ครบกำหนดวันนี้ ${dueToday.length}, รอตรวจ ${review.length}\n\n${lines.join("\n")}\n\nแนะนำให้ปิดงานเกินกำหนดก่อน จากนั้นเคลียร์งานรอตรวจเพื่อไม่ให้ทีมติดคอขวด แล้วแบ่งงานใหญ่เป็นช่วงย่อยที่จบได้ภายในวันนี้`,
    actions: taskActions(context.canManageWork),
  };
}

function skillAnalysis(context: PeopleAiContext, employee: PeopleAiEmployee | null) {
  if (employee) {
    if (!employee.skills.length || employee.skillScore === null) {
      return {
        content: `วิเคราะห์สกิลของ ${employee.name}\nยังไม่มีผลประเมินสกิลในรอบ ${context.period} แนะนำให้ประเมินสกิลหลักของตำแหน่ง ${employee.roleName} ก่อน เพื่อให้ระบบหา Skill Gap และตำแหน่งที่เหมาะสมได้แม่นขึ้น`,
        actions: context.canManagePeople ? [{ id: "open_evaluations", label: "ไปหน้าประเมิน" }] : [],
      };
    }
    const gaps = employee.skills.filter((skill) => (skill.current ?? 0) < skill.target).sort((a, b) => (b.target - (b.current ?? 0)) - (a.target - (a.current ?? 0)));
    const strengths = employee.skills.slice().sort((a, b) => (b.current ?? 0) - (a.current ?? 0)).slice(0, 2);
    const newSkills = futureSkills[employee.roleId] ?? ["การใช้ AI ในงานประจำ", "การวิเคราะห์ข้อมูล", "การสื่อสารข้ามทีม"];
    return {
      content: `วิเคราะห์สกิลของ ${employee.name} · ${employee.roleName}\nคะแนนสกิลรวม ${employee.skillScore.toFixed(1)}\n\nจุดแข็ง: ${strengths.map((skill) => `${skill.name} ระดับ ${skill.current}`).join(", ") || "รอข้อมูลเพิ่ม"}\nช่องว่างสำคัญ: ${gaps.slice(0, 3).map((skill) => `${skill.name} ${skill.current ?? 0}/${skill.target}`).join(", ") || "ถึงเป้าหมายหลักแล้ว"}\nสกิลใหม่ที่น่าลงทุน: ${newSkills.join(", ")}\n${employee.bestFitScore !== null ? `ตำแหน่งที่ข้อมูลชี้ว่าเหมาะสูงสุด: ${employee.bestFitRole} (${employee.bestFitScore}%)` : "ควรเก็บผลประเมินเพิ่มก่อนแนะนำตำแหน่งใหม่"}\n\nแผนแนะนำ: เลือก 1 Skill Gap + 1 สกิลอนาคต ตั้งภารกิจที่มีหลักฐานจริง และทบทวนผลใน 30 วัน`,
      actions: context.canManagePeople ? [{ id: "open_skills", label: "เปิดข้อมูลสกิล" }, { id: "open_hr", label: "สร้างแผนพัฒนา" }] : [],
    };
  }
  const allGaps = context.employees.flatMap((person) => person.skills.filter((skill) => (skill.current ?? 0) < skill.target).map((skill) => ({ employee: person.name, ...skill, gap: skill.target - (skill.current ?? 0) }))).sort((a, b) => b.gap - a.gap);
  const measured = context.employees.filter((person) => person.skillScore !== null);
  const skillAverage = average(measured.map((person) => person.skillScore));
  return {
    content: `ภาพรวมสกิลทีม · ${context.period}\nมีข้อมูลประเมิน ${measured.length}/${context.employees.length} คน${skillAverage !== null ? ` คะแนนเฉลี่ย ${skillAverage.toFixed(1)}` : ""}\nSkill Gap ที่ควรเริ่มก่อน: ${allGaps.slice(0, 4).map((gap) => `${gap.employee} — ${gap.name} ${gap.current ?? 0}/${gap.target}`).join("; ") || "ยังไม่มีข้อมูลเพียงพอ"}\n\nแนะนำให้จัดกลุ่มเรียนตามช่องว่างร่วมกัน แล้วให้แต่ละคนส่งผลงานหรือผลทดสอบเป็นหลักฐานก่อนยืนยันระดับสกิล`,
    actions: context.canManagePeople ? [{ id: "open_skills", label: "เปิดภาพรวมสกิล" }, { id: "open_hr", label: "วางแผนอัปสกิล" }] : [],
  };
}

function kpiAnalysis(context: PeopleAiContext, employee: PeopleAiEmployee | null) {
  if (employee) {
    if (employee.totalScore === null) {
      return { content: `${employee.name} ยังไม่มีผลประเมินรอบ ${context.period}\nควรรวบรวมผลงานจริง งานที่ส่งตรงเวลา และหลักฐานผลลัพธ์ก่อนเริ่มให้คะแนน เพื่อให้การประเมินตรวจสอบย้อนหลังได้`, actions: context.canManagePeople ? [{ id: "open_evaluations", label: "เริ่มประเมิน" }, { id: "open_portfolio", label: "ดูแฟ้มผลงาน" }] : [{ id: "open_portfolio", label: "ดูแฟ้มผลงาน" }] };
    }
    const openTasks = context.tasks.filter((task) => task.assigneeEmployeeId === employee.id && task.status !== "done");
    const overdue = openTasks.filter((task) => task.dueDate < new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date()));
    return {
      content: `วิเคราะห์ผลของ ${employee.name} · ${context.period}\nKPI ${employee.kpiScore?.toFixed(1) ?? "—"} · สกิล ${employee.skillScore?.toFixed(1) ?? "—"} · รวม ${employee.totalScore.toFixed(1)}\nมีงานค้าง ${openTasks.length} งาน และเกินกำหนด ${overdue.length} งาน\n\nข้อเสนอแนะ: ${employee.kpiScore !== null && employee.skillScore !== null && employee.kpiScore > employee.skillScore ? "ผลงานออกมาดี แต่ควรยกระดับสกิลเพื่อรักษาคุณภาพระยะยาว" : "ควรเชื่อมคะแนนกับหลักฐานผลงานและเลือก KPI ที่ต้องยกระดับเพียง 1–2 ตัวในรอบถัดไป"} การสรุปผลควรมีทั้งจุดแข็ง ข้อเท็จจริงที่ตรวจสอบได้ และแผนสนับสนุนจากหัวหน้า`,
      actions: context.canManagePeople ? [{ id: "open_evaluations", label: "เปิดหน้าประเมิน" }, { id: "open_portfolio", label: "ตรวจหลักฐาน" }] : [{ id: "open_portfolio", label: "ดูผลงานของฉัน" }],
    };
  }
  const measured = context.employees.filter((person) => person.totalScore !== null);
  const scoreAverage = average(measured.map((person) => person.totalScore));
  const strongest = measured.slice().sort((a, b) => (b.totalScore ?? 0) - (a.totalScore ?? 0))[0];
  const needsAttention = measured.filter((person) => (person.totalScore ?? 100) < 75).sort((a, b) => (a.totalScore ?? 0) - (b.totalScore ?? 0));
  return {
    content: `ภาพรวม KPI · ${context.period}\nประเมินแล้ว ${measured.length}/${context.employees.length} คน${scoreAverage !== null ? ` · คะแนนเฉลี่ย ${scoreAverage.toFixed(1)}` : ""}\n${strongest ? `ผลงานเด่น: ${strongest.name} ${strongest.totalScore?.toFixed(1)} คะแนน` : "ยังไม่มีผลประเมิน"}\n${needsAttention.length ? `ควรติดตาม: ${needsAttention.slice(0, 3).map((person) => `${person.name} ${person.totalScore?.toFixed(1)}`).join(", ")}` : "ยังไม่พบคะแนนต่ำกว่าเกณฑ์ 75"}\n\nก่อนสรุปผล แนะนำให้ตรวจแฟ้มผลงาน งานเกินกำหนด และความครบถ้วนของการประเมิน เพื่อไม่ให้คะแนนมาจากความรู้สึกเพียงอย่างเดียว`,
    actions: context.canManagePeople ? [{ id: "open_evaluations", label: "เปิดรายการประเมิน" }, { id: "open_portfolio", label: "ดูหลักฐานผลงาน" }] : [{ id: "open_portfolio", label: "ดูผลงานของฉัน" }],
  };
}

function evaluationHelp(context: PeopleAiContext, employee: PeopleAiEmployee | null) {
  if (employee) {
    const skill = skillAnalysis(context, employee);
    return {
      content: `โครงร่างประเมินของ ${employee.name}\n1. ผลลัพธ์: KPI ${employee.kpiScore?.toFixed(1) ?? "รอประเมิน"} และคะแนนรวม ${employee.totalScore?.toFixed(1) ?? "รอประเมิน"}\n2. จุดเด่น: ${employee.skills.slice().sort((a, b) => (b.current ?? 0) - (a.current ?? 0)).slice(0, 2).map((item) => item.name).join(", ") || "ควรดูหลักฐานผลงานเพิ่ม"}\n3. จุดพัฒนา: ${employee.skills.filter((item) => (item.current ?? 0) < item.target).slice(0, 2).map((item) => item.name).join(", ") || "รักษามาตรฐานและเพิ่มโจทย์ท้าทาย"}\n4. ข้อตกลงรอบถัดไป: ตั้งเป้าหมายที่วัดได้ 1 ข้อ กำหนดหลักฐาน และวันทบทวน\n\nประโยคแนะนำ: “ผลงานที่เห็นชัดในรอบนี้คือ… จากหลักฐาน… ส่วนที่เราจะช่วยกันพัฒนาคือ… และจะวัดผลอีกครั้งวันที่…”`,
      actions: context.canManagePeople ? [{ id: "open_evaluations", label: "บันทึกผลประเมิน" }, ...(skill.actions ?? [])] : [{ id: "open_portfolio", label: "ดูผลงานของฉัน" }],
    };
  }
  return kpiAnalysis(context, null);
}

function systemHelp(query: string, context: PeopleAiContext) {
  const text = query.toLocaleLowerCase("th");
  if (/หลักฐาน|ส่งงาน|drive|ลิงก์|ไฟล์|ผลงาน/.test(text)) return { content: "วิธีส่งงานและหลักฐาน\n1. เปิดเมนู งาน แล้วเลือกงานที่ต้องการ\n2. กด ส่งหลักฐานงาน\n3. ใส่ลิงก์ Drive, วิดีโอ, Social, Pull Request หรืออัปโหลดไฟล์ตามตำแหน่ง\n4. เขียนสรุปผลลัพธ์สั้น ๆ แล้วส่งให้ผู้ตรวจ\n5. ติดตามสถานะได้ที่ แฟ้มผลงาน หากถูกส่งกลับให้แก้ไข ระบบจะแสดงหมายเหตุผู้ตรวจ", actions: [{ id: "open_portfolio" as const, label: "เปิดแฟ้มผลงาน" }] };
  if (/แต้ม|รางวัล|แลก/.test(text)) return { content: "ระบบแต้มและรางวัล\nแต้มมาจากผลประเมิน งานตรงเวลา ภารกิจ และพฤติกรรมการทำงาน ยอดคงเหลือจะหักเมื่อส่งคำขอแลกรางวัล หากแต้มไม่พอให้ตรวจประวัติรายการแต้มและรอบประเมินล่าสุดก่อน", actions: [] };
  if (/ลา|สาย|เข้างาน|ลงเวลา/.test(text)) return { content: "เวลาเข้างานและการลา\nพนักงานบันทึกเวลาและส่งคำขอลาได้จากเมนู เวลา & เติบโต ส่วนหัวหน้าหรือ HR ตรวจสถานะและอนุมัติ การลาที่อนุมัติแล้วจะไม่ถูกนับเป็นขาดงาน", actions: context.canManagePeople ? [{ id: "open_hr" as const, label: "เปิดระบบ HR" }] : [] };
  if (/สิทธิ์|เข้าไม่ได้|บัญชี|อีเมล/.test(text)) return { content: "ตรวจปัญหาการเข้าใช้งาน\n1. ตรวจว่าใช้อีเมลบริษัทบัญชีที่ถูกต้อง\n2. ให้ HR ตรวจว่าบัญชีถูกผูกกับโปรไฟล์พนักงานและสถานะเป็น Active\n3. ตรวจบทบาท Admin, Manager หรือ Employee\n4. ออกจากระบบแล้วเข้าใหม่หลังแก้สิทธิ์\nหากยังไม่สำเร็จ ให้ส่งข้อความผิดพลาดและหน้าที่เกิดปัญหาให้ผู้ดูแล", actions: [] };
  return { content: "ผมช่วยแก้ปัญหาในระบบได้ครับ\nบอกผมได้เลยว่าเกิดที่หน้าไหน กดปุ่มอะไร และเห็นข้อความว่าอย่างไร เช่น “ส่งหลักฐานไม่ได้”, “แต้มไม่เข้า”, “ไม่เห็นงานของฉัน” หรือ “บัญชีเข้าไม่ได้” แล้วผมจะไล่ตรวจทีละขั้นให้", actions: [] };
}

function createAssistantResponse(query: string, context: PeopleAiContext, focusEmployeeId: string): Omit<ChatMessage, "id" | "role" | "createdAt"> {
  const text = query.toLocaleLowerCase("th");
  const employee = findFocusedEmployee(context, focusEmployeeId, query);
  if (/ทูดู|todo|งานวันนี้|งานเร่ง|เกินกำหนด|จัดลำดับ|จัดงาน|ภารกิจ/.test(text)) return taskAnalysis(context, employee);
  if (/สกิล|skill|ความสามารถ|ตำแหน่ง|เหมาะสม|พัฒนา|อัปสกิล/.test(text)) return skillAnalysis(context, employee);
  if (/ประเมิน|feedback|ฟีดแบ็ก|สรุปผลงาน/.test(text)) return evaluationHelp(context, employee);
  if (/kpi|เคพีไอ|คะแนน|ผลงาน|วิเคราะห์ข้อมูล|วิเคราะห์ทีม/.test(text)) return kpiAnalysis(context, employee);
  if (/ช่วย|ปัญหา|ไม่ได้|วิธี|ใช้งาน|แต้ม|รางวัล|หลักฐาน|ส่งงาน|ลา|สาย|สิทธิ์|บัญชี/.test(text)) return systemHelp(query, context);
  return {
    content: `ผมวิเคราะห์จากข้อมูลที่คุณมีสิทธิ์เห็นในรอบ ${context.period} ได้ ${context.employees.length} คน และ ${context.tasks.filter((task) => task.status !== "done").length} งานที่ยังไม่เสร็จ\n\nลองระบุสิ่งที่ต้องการ เช่น “วิเคราะห์สกิลของชื่อพนักงาน”, “จัดลำดับงานวันนี้”, “ช่วยเขียนสรุปประเมิน” หรืออธิบายปัญหาที่พบในระบบ ผมจะตอบให้ตรงเรื่องมากขึ้น`,
    actions: taskActions(context.canManageWork),
  };
}

function MessageContent({ content }: { content: string }) {
  return <>{content.split("\n").map((line, index) => line ? <p key={`${index}-${line.slice(0, 12)}`}>{line}</p> : <span className="ai-message-gap" key={`gap-${index}`} />)}</>;
}

export default function AiAssistant({ open, context, onClose, onSystemAction }: { open: boolean; context: PeopleAiContext; onClose: () => void; onSystemAction: (action: PeopleAiActionId) => void }) {
  const storageKey = `people-pulse-ai-chat:${context.userKey || "guest"}`;
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadConversation(storageKey, context.userName));
  const [input, setInput] = useState("");
  const [focusEmployeeId, setFocusEmployeeId] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messageIdRef = useRef(messages.length);

  useEffect(() => {
    if (!messages.length) return;
    window.localStorage.setItem(storageKey, JSON.stringify(messages.slice(-30)));
  }, [messages, storageKey]);

  useEffect(() => {
    if (!open) return;
    messageEndRef.current?.scrollIntoView({ block: "end" });
    const timer = window.setTimeout(() => inputRef.current?.focus(), 180);
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [messages, onClose, open]);

  const openTasks = useMemo(() => context.tasks.filter((task) => task.status !== "done").length, [context.tasks]);

  const sendMessage = (message = input) => {
    const clean = message.trim().slice(0, 600);
    if (!clean || isThinking) return;
    const userMessage: ChatMessage = { id: `user-${++messageIdRef.current}`, role: "user", content: clean, createdAt: nowTime() };
    setMessages((items) => [...items, userMessage]);
    setInput("");
    setIsThinking(true);
    window.setTimeout(() => {
      const response = createAssistantResponse(clean, context, focusEmployeeId);
      setMessages((items) => [...items, { id: `assistant-${++messageIdRef.current}`, role: "assistant", createdAt: nowTime(), ...response }]);
      setIsThinking(false);
    }, 520);
  };

  const clearConversation = () => {
    const reset = [assistantWelcome(context.userName)];
    setMessages(reset);
    window.localStorage.setItem(storageKey, JSON.stringify(reset));
  };

  return (
    <>
      {open && <div className="ai-assistant-layer open">
        <button className="ai-assistant-backdrop" onClick={onClose} aria-label="ปิด People AI" tabIndex={open ? 0 : -1} />
        <aside className="ai-assistant-panel" role="dialog" aria-modal="true" aria-labelledby="people-ai-title">
          <header className="ai-assistant-header">
            <div className="ai-assistant-brand"><span aria-hidden="true">AI</span><div><small>ผู้ช่วยงานอัจฉริยะ</small><h2 id="people-ai-title">People AI</h2></div></div>
            <div className="ai-assistant-header-actions"><button onClick={clearConversation} aria-label="เริ่มบทสนทนาใหม่">เริ่มใหม่</button><button className="ai-assistant-close" onClick={onClose} aria-label="ปิดแชท">×</button></div>
          </header>
          <section className="ai-assistant-context" aria-label="ขอบเขตข้อมูลที่ใช้วิเคราะห์">
            <div><span>รอบข้อมูล</span><strong>{context.period}</strong></div>
            <div><span>ข้อมูลบุคลากร</span><strong>{context.employees.length} คน</strong></div>
            <div><span>งานค้าง</span><strong>{openTasks} งาน</strong></div>
          </section>
          <label className="ai-assistant-focus"><span>วิเคราะห์เฉพาะบุคคล</span><select value={focusEmployeeId} onChange={(event) => setFocusEmployeeId(event.target.value)}><option value="">ภาพรวมที่ฉันมีสิทธิ์เห็น</option>{context.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} · {employee.roleName}</option>)}</select></label>
          <div className="ai-quick-prompts" aria-label="คำถามแนะนำ">{quickPrompts.map((prompt) => <button key={prompt.id} onClick={() => sendMessage(prompt.prompt)} disabled={isThinking}>{prompt.label}</button>)}</div>
          <section className="ai-message-list" aria-live="polite" aria-busy={isThinking}>
            {messages.map((message) => <article key={message.id} className={`ai-message ${message.role}`}>
              <span className="ai-message-avatar" aria-hidden="true">{message.role === "assistant" ? "AI" : "คุณ"}</span>
              <div className="ai-message-body"><MessageContent content={message.content} />{message.actions?.length ? <div className="ai-message-actions">{message.actions.map((action) => <button key={action.id} onClick={() => onSystemAction(action.id)}>{action.label}<span aria-hidden="true">→</span></button>)}</div> : null}<small>{message.createdAt}</small></div>
            </article>)}
            {isThinking && <article className="ai-message assistant thinking"><span className="ai-message-avatar">AI</span><div className="ai-message-body"><div className="ai-thinking-dots"><i /><i /><i /></div><small>กำลังวิเคราะห์ข้อมูลที่เกี่ยวข้อง...</small></div></article>}
            <div ref={messageEndRef} />
          </section>
          <form className="ai-assistant-composer" onSubmit={(event) => { event.preventDefault(); sendMessage(); }}>
            <textarea ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(); } }} rows={2} maxLength={600} placeholder="ถามเรื่อง KPI สกิล งาน หรือปัญหาการใช้งาน..." />
            <button disabled={!input.trim() || isThinking} aria-label="ส่งข้อความ"><span aria-hidden="true">↑</span></button>
          </form>
          <footer className="ai-assistant-note"><span aria-hidden="true">●</span> วิเคราะห์จากข้อมูลที่คุณมีสิทธิ์เห็นเท่านั้น · ควรให้ผู้มีอำนาจตรวจสอบก่อนตัดสินใจด้านบุคลากร</footer>
        </aside>
      </div>}
    </>
  );
}
