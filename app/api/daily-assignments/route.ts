import { authenticatedRequestGate } from "../../../lib/access-control";
import { getD1 } from "../../../db";
import { getRole } from "../../../lib/kpi-data";
import { bangkokDay, canonicalDailyTemplateId, dailyTemplates, ensureDailyAssignments, generateDailyAssignments } from "../../../lib/daily-assignments";

export async function GET(request: Request) {
  const auth = await authenticatedRequestGate(request);
  if (auth.response) return auth.response;
  const db = getD1();
  await generateDailyAssignments(db);
  const admin = auth.currentUser.role === "admin";
  const rows = await db.prepare(`SELECT a.*, e.name AS employee_name FROM daily_assignments a JOIN employees e ON e.id=a.employee_id WHERE (?=1 OR a.employee_id=?) ORDER BY a.day DESC, e.name LIMIT 500`).bind(admin ? 1 : 0,auth.currentUser.employeeId ?? "").all();
  const people = admin ? await db.prepare("SELECT id,name,role_id,position_title FROM employees e WHERE status='active' AND EXISTS (SELECT 1 FROM user_accounts u WHERE u.employee_id=e.id AND u.status='active')").all<{id:string;name:string;role_id:string;position_title:string}>() : {results:[]};
  const bindings = admin ? await db.prepare("SELECT CASE WHEN template_id='tam' THEN 'boss' WHEN template_id='neer' THEN 'toey' ELSE template_id END AS template_id, employee_id, MAX(enabled) AS enabled FROM daily_assignment_bindings GROUP BY CASE WHEN template_id='tam' THEN 'boss' WHEN template_id='neer' THEN 'toey' ELSE template_id END, employee_id").all() : {results:[]};
  const assignments = ((rows.results ?? []) as Array<Record<string, unknown>>).map(row => ({...row, title: dailyTemplates.find(t=>t.id===canonicalDailyTemplateId(String(row.template_id)))?.name ?? row.title}));
  return Response.json({ assignments, people:(people.results??[]).map(p=>({...p,position:p.position_title||getRole(p.role_id).name})), bindings:bindings.results, templates:dailyTemplates, admin }, {headers:{"Cache-Control":"no-store"}});
}

export async function POST(request: Request) {
  const auth = await authenticatedRequestGate(request);
  if (auth.response) return auth.response;
  const body = await request.json();
  const db = getD1();
  await ensureDailyAssignments(db);
  if (body.action === "bind") {
    if (auth.currentUser.role !== "admin") return Response.json({error:"เฉพาะ Admin / HR"},{status:403});
    if (!dailyTemplates.some((t)=>t.id===body.templateId) || typeof body.employeeId !== "string" || typeof body.enabled !== "boolean") return Response.json({error:"ข้อมูลไม่ถูกต้อง"},{status:400});
    const employee = await db.prepare("SELECT e.id FROM employees e WHERE e.id=? AND e.status='active' AND EXISTS (SELECT 1 FROM user_accounts u WHERE u.employee_id=e.id AND u.status='active')").bind(body.employeeId).first();
    if (!employee) return Response.json({error:"ต้องเลือกพนักงานที่มีบัญชีใช้งาน"},{status:400});
    const statements = [];
    // A single UI switch controls both legacy editor bindings without deleting history.
    if (body.templateId === "boss") statements.push(db.prepare("UPDATE daily_assignment_bindings SET enabled=0 WHERE employee_id=? AND template_id='tam'").bind(body.employeeId));
    if (body.templateId === "toey") statements.push(db.prepare("UPDATE daily_assignment_bindings SET enabled=0 WHERE employee_id=? AND template_id='neer'").bind(body.employeeId));
    if (body.replaceExisting === true && body.enabled) statements.push(db.prepare("UPDATE daily_assignment_bindings SET enabled=0 WHERE employee_id=? AND template_id<>?").bind(body.employeeId,body.templateId));
    statements.push(db.prepare(`INSERT INTO daily_assignment_bindings (template_id,employee_id,enabled,next_day) VALUES (?,?,?,?) ON CONFLICT(template_id,employee_id) DO UPDATE SET enabled=excluded.enabled,next_day=CASE WHEN daily_assignment_bindings.enabled=0 THEN excluded.next_day ELSE daily_assignment_bindings.next_day END`).bind(body.templateId,body.employeeId,body.enabled?1:0,bangkokDay()));
    await db.batch(statements);
    await generateDailyAssignments(db);
    return Response.json({ok:true});
  }
  if (body.action !== "submit" || typeof body.id !== "string") return Response.json({error:"คำขอไม่ถูกต้อง"},{status:400});
  const row = await db.prepare("SELECT * FROM daily_assignments WHERE id=?").bind(body.id).first<{employee_id:string;template_id:string;submitted_at:string|null}>();
  if (!row || row.employee_id !== auth.currentUser.employeeId) return Response.json({error:"ส่งได้เฉพาะงานของตนเอง"},{status:403});
  const links = body.links;
  if (!Array.isArray(links) || links.length > 150 || !links.length || links.some((link:unknown)=>typeof link !== "string" || link.length>2000 || !/^https?:\/\/\S+$/.test(link))) return Response.json({error:"กรุณาแนบลิงก์หลักฐาน http/https"},{status:400});
  const video = ["boss","tam"].includes(row.template_id);
  if (video && (links.length < 9 || links.length % 3 !== 0 || new Set(links).size !== links.length)) return Response.json({error:"ขั้นต่ำ 3 แคมเปญ แคมเปญละ 3 ลิงก์คลิปที่ไม่ซ้ำกัน"},{status:400});
  if (typeof body.note !== "string" || body.note.length>5000 || !body.note.trim()) return Response.json({error:"กรุณาสรุปงานที่ทำ"},{status:400});
  const result = await db.prepare("UPDATE daily_assignments SET submitted_at=?,evidence_json=? WHERE id=? AND submitted_at IS NULL").bind(new Date().toISOString(),JSON.stringify({note:body.note.trim(),links}),body.id).run();
  return result.meta.changes ? Response.json({ok:true}) : Response.json({error:"งานนี้ส่งแล้ว กรุณาโหลดใหม่"},{status:409});
}
