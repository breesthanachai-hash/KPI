import { getD1, getFilesBucket } from "../../../db";
import { authenticatedRequestGate } from "../../../lib/access-control";
import { attendanceTime, ensureAttendanceEvidence, validAttendanceLocation, isInsideAttendanceOffice, officeDistanceMeters } from "../../../lib/attendance-capture";

export async function GET(request: Request) {
  const auth = await authenticatedRequestGate(request);
  if (auth.response) return auth.response;
  const db = getD1();
  const params = new URL(request.url).searchParams;
  if (params.get("view") === "history") {
    const month = params.get("month") ?? attendanceTime().day.slice(0,7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return Response.json({error:"เดือนที่เลือกไม่ถูกต้อง"},{status:400});
    const employeeId = auth.currentUser.employeeId;
    const rows = employeeId ? await db.prepare("SELECT work_date,clock_in,clock_out FROM attendance_records WHERE employee_id=? AND work_date>=? AND work_date<=? AND (clock_in IS NOT NULL OR clock_out IS NOT NULL) ORDER BY work_date DESC").bind(employeeId,`${month}-01`,`${month}-31`).all() : {results:[]};
    return Response.json({linked:!!employeeId,month,records:rows.results},{headers:{"Cache-Control":"no-store"}});
  }
  await ensureAttendanceEvidence(db);
  const photo = new URL(request.url).searchParams.get("photo");
  if (photo) {
    const evidence = await db.prepare("SELECT employee_id,photo_key FROM attendance_capture_evidence WHERE id=?").bind(photo).first<{employee_id:string;photo_key:string}>();
    if (!evidence || (auth.currentUser.role !== "admin" && evidence.employee_id !== auth.currentUser.employeeId)) return new Response("ไม่มีสิทธิ์", { status: 403 });
    const file = await getFilesBucket().get(evidence.photo_key);
    if (!file) return new Response("ไม่พบรูป", { status: 404 });
    return new Response(file.body, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  }
  const employeeId = auth.currentUser.employeeId;
  const { day } = attendanceTime();
  const today = employeeId ? await db.prepare("SELECT clock_in,clock_out,status FROM attendance_records WHERE employee_id=? AND work_date=?").bind(employeeId, day).first() : null;
  const history = employeeId ? await db.prepare("SELECT id,kind,recorded_at,accuracy FROM attendance_capture_evidence WHERE employee_id=? ORDER BY recorded_at DESC LIMIT 30").bind(employeeId).all() : {results:[]};
  return Response.json({ linked: !!employeeId, day, today, history: history.results }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await authenticatedRequestGate(request);
  if (auth.response) return auth.response;
  const employeeId = auth.currentUser.employeeId;
  if (!employeeId) return Response.json({error:"บัญชียังไม่ผูกกับพนักงาน กรุณาติดต่อ HR"}, {status:403});
  if (Number(request.headers.get("content-length")) > 2200000) return Response.json({error:"รูปใหญ่เกินกำหนด"}, {status:413});
  const form = await request.formData();
  const photo = form.get("photo"), kind = form.get("kind");
  const lat = Number(form.get("latitude")), lng = Number(form.get("longitude")), accuracy = Number(form.get("accuracy")), capturedAt = Number(form.get("capturedAt"));
  if (!["latitude","longitude","accuracy","capturedAt"].every(k=>form.has(k)) || !validAttendanceLocation(lat,lng,accuracy,capturedAt) || !["in","out"].includes(String(kind))) return Response.json({error:"พิกัดไม่ถูกต้องหรือหมดอายุ กรุณาจับพิกัดใหม่"}, {status:400});
  if (!isInsideAttendanceOffice(lat,lng)) return Response.json({error:`พิกัดที่อุปกรณ์รายงานห่างจากหมุดออฟฟิศ ${officeDistanceMeters(lat,lng).toFixed(2)} เมตร เกินรัศมี 3 เมตร กรุณาจับพิกัดใหม่ใกล้หมุด หรือติดต่อ HR หาก GPS คลาดเคลื่อน`},{status:403});
  if (!(photo instanceof File) || photo.type !== "image/jpeg" || photo.size < 4 || photo.size > 2000000) return Response.json({error:"ต้องแนบรูป JPEG ไม่เกิน 2 MB"}, {status:400});
  const bytes = new Uint8Array(await photo.slice(0,3).arrayBuffer());
  if (bytes[0]!==255 || bytes[1]!==216 || bytes[2]!==255) return Response.json({error:"รูปไม่ถูกต้อง"}, {status:400});
  const db = getD1();
  await ensureAttendanceEvidence(db);
  if (!await db.prepare("SELECT id FROM employees WHERE id=? AND status='active'").bind(employeeId).first()) return Response.json({error:"บัญชีพนักงานไม่พร้อมใช้งาน"},{status:403});
  const now = new Date(), { day, time, minutesLate } = attendanceTime(now);
  const existing = await db.prepare("SELECT clock_in,clock_out,status FROM attendance_records WHERE employee_id=? AND work_date=?").bind(employeeId,day).first<{clock_in:string|null;clock_out:string|null;status:string}>();
  if ((kind === "in" && existing) || (kind === "out" && (!existing?.clock_in || existing.clock_out || !["present","late"].includes(existing.status)))) return Response.json({error:"สถานะลงเวลาเปลี่ยนไปหรือมีรายการวันนี้แล้ว กรุณาโหลดใหม่ / ติดต่อ HR"},{status:409});
  const id = crypto.randomUUID(), key = `attendance-evidence/${employeeId}/${day}/${id}.jpg`;
  const bucket = getFilesBucket();
  await bucket.put(key, photo.stream(), {httpMetadata:{contentType:"image/jpeg"}});
  try {
    const record = kind === "in"
      ? db.prepare("INSERT INTO attendance_records (id,employee_id,work_date,status,clock_in,minutes_late,note,approval_status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'not_required',?,?,?)").bind(`attendance-${id}`,employeeId,day,minutesLate>0?"late":"present",time,minutesLate,"ลงเวลาด้วยรูปและพิกัด",employeeId,now.toISOString(),now.toISOString())
      : db.prepare("UPDATE attendance_records SET clock_out=?,updated_at=? WHERE employee_id=? AND work_date=? AND clock_in IS NOT NULL AND clock_out IS NULL AND status IN ('present','late')").bind(time,now.toISOString(),employeeId,day);
    await db.batch([record, db.prepare("INSERT INTO attendance_capture_evidence (id,employee_id,work_date,kind,recorded_at,latitude,longitude,accuracy,photo_key) VALUES (CASE WHEN changes()=1 THEN ? ELSE NULL END,?,?,?,?,?,?,?,?)").bind(id,employeeId,day,kind,now.toISOString(),lat,lng,accuracy,key)]);
  } catch {
    await bucket.delete(key);
    return Response.json({error:"บันทึกไม่สำเร็จ อาจมีการลงเวลาซ้ำ กรุณาโหลดใหม่"},{status:409});
  }
  return Response.json({message:`ลงเวลา${kind==="in"?"เข้า":"ออก"} ${time} เรียบร้อยแล้ว`});
}
