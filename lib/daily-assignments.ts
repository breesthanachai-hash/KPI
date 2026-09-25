export const dailyTemplates = [
  { id: "toey", name: "บัญชี", tasks: ["ตรวจ Statement SCD / กสิกร / กรุงไทยและที่มาเงินเข้า–ออก", "บันทึกรายรับ–รายจ่ายบ้านนพ.ในมหาเทพ", "ทำสลิปรายจ่ายและนำรายรับ My Order เข้า FlowAccount", "รวบรวมใบเสร็จ จัดทำ COD และแจ้งยอดขายแหนมปลากราย"] },
  { id: "prae", name: "ฝึกงานผู้ช่วยผู้จัดการ", tasks: ["วิเคราะห์ตลาดและคู่แข่ง สรุปสิ่งที่พบ"] },
  { id: "eye", name: "แพลตฟอร์ม", tasks: ["สรุปยอดขายและตรวจสต็อกทุกแพลตฟอร์ม", "ตอบแชทลูกค้า ตรวจคำขอ KOL และติดตามผล"] },
  { id: "boss", name: "ตัดต่อ", tasks: ["ส่งขั้นต่ำ 3 แคมเปญ แคมเปญละ 3 คลิป (รวมเทสและเติม ไม่แยกบวกโควตา)"] },
  { id: "freem", name: "การตลาดดิจิตัล", tasks: ["ตัดคลิปเติม/เทส รันรหัส ขึ้นและติดตามโฆษณาตามแผน"] },
  { id: "night", name: "ผู้จัดการ", tasks: ["เช็กคนทำงาน อัปเดตทีมและติดตามปัญหาเทเลเซลล์", "เคลียร์ออเดอร์ค้าง ตรวจสต็อกและเตรียมสินค้า"] },
  { id: "packing", name: "เจ้าหน้าที่แพ็คและจัดส่งสินค้า", tasks: ["ตรวจออเดอร์ แพ็คสินค้า ตรวจผู้รับและส่งมอบพัสดุ"] },
  { id: "admin", name: "แอดมินบริการลูกค้าและปิดการขาย", tasks: ["ตอบแชท บริการลูกค้า คีย์ออเดอร์ ติดตามและปิดการขาย"] },
];

// Keep stored IDs and employee records unchanged; resolve retired templates at read time.
export function canonicalDailyTemplateId(id: string) { return id === "tam" ? "boss" : id === "neer" ? "toey" : id; }

export function bangkokDay(now = new Date()) { return new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10); }
export function isDailyWorkday(day: string) { return new Date(`${day}T00:00:00Z`).getUTCDay() !== 0; }
export async function ensureDailyAssignments(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS daily_assignment_bindings (template_id TEXT NOT NULL, employee_id TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, next_day TEXT NOT NULL, PRIMARY KEY(template_id, employee_id))`),
    db.prepare(`CREATE TABLE IF NOT EXISTS daily_assignments (id TEXT PRIMARY KEY, template_id TEXT NOT NULL, employee_id TEXT NOT NULL, day TEXT NOT NULL, title TEXT NOT NULL, tasks_json TEXT NOT NULL, submitted_at TEXT, evidence_json TEXT, UNIQUE(template_id, employee_id, day))`),
  ]);
}

export async function generateDailyAssignments(db: D1Database, now = new Date()) {
  await ensureDailyAssignments(db);
  const today = bangkokDay(now);
  const cutoff = now >= new Date(`${today}T09:00:00+07:00`) ? today : bangkokDay(new Date(now.getTime() - 86400000));
  const bindings = await db.prepare(`SELECT b.* FROM daily_assignment_bindings b JOIN employees e ON e.id=b.employee_id WHERE b.enabled=1 AND e.status='active' AND EXISTS (SELECT 1 FROM user_accounts u WHERE u.employee_id=e.id AND u.status='active')`).all<{template_id:string;employee_id:string;next_day:string}>();
  for (const binding of bindings.results ?? []) {
    const template = dailyTemplates.find((item) => item.id === canonicalDailyTemplateId(binding.template_id));
    if (!template) continue;
    let day = binding.next_day;
    // Bounded catch-up, with unique keys to make concurrent refreshes harmless.
    for (let i = 0; day <= cutoff && i < 90; i++) {
      if (isDailyWorkday(day)) await db.prepare(`INSERT OR IGNORE INTO daily_assignments (id,template_id,employee_id,day,title,tasks_json) SELECT ?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM daily_assignments WHERE employee_id=? AND day=? AND (template_id=? OR (?='boss' AND template_id='tam') OR (?='toey' AND template_id='neer')))`).bind(`${template.id}:${binding.employee_id}:${day}`, template.id, binding.employee_id, day, template.name, JSON.stringify(template.tasks), binding.employee_id, day, template.id, template.id, template.id).run();
      day = new Date(Date.parse(`${day}T00:00:00Z`) + 86400000).toISOString().slice(0,10);
    }
    await db.prepare("UPDATE daily_assignment_bindings SET next_day=? WHERE template_id=? AND employee_id=? AND next_day < ?").bind(day,binding.template_id,binding.employee_id,day).run();
  }
}
