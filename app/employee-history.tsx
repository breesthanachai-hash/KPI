"use client";
import { useEffect, useState } from "react";

type Event = { id: string; actor_name: string; created_at: string; before_json: string; after_json: string };
const labels: Record<string, string> = { positionTitle: "ชื่อตำแหน่ง", personalEmail: "อีเมลส่วนตัว", phone: "โทรศัพท์", birthDate: "วันเกิด", nationalIdLast4: "เลขบัตร 4 หลักท้าย", address: "ที่อยู่", emergencyName: "ผู้ติดต่อฉุกเฉิน", emergencyPhone: "โทรศัพท์ฉุกเฉิน", startDate: "วันเริ่มงาน", employmentType: "ประเภทการจ้าง", education: "การศึกษา", experienceYears: "ประสบการณ์ (ปี)", applicationSource: "ช่องทางสมัคร" };
export default function EmployeeHistory({ employeeId, revision }: { employeeId: string; revision: string }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
    setEvents([]); setError(""); setLoading(true);
    fetch(`/api/employee-history?employeeId=${encodeURIComponent(employeeId)}`, { signal: controller.signal }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "โหลดประวัติไม่สำเร็จ");
      if (!controller.signal.aborted) setEvents(data.events);
    }).catch((reason) => { if (!controller.signal.aborted) setError(reason.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [employeeId, revision, retry]);
  return <section className="employee-history" aria-label="ประวัติการแก้ไขโปรไฟล์">
    <h3>ประวัติการแก้ไขโปรไฟล์</h3>
    <p>บันทึกตั้งแต่เปิดใช้ระบบ LOG · แสดง 100 รายการล่าสุด · อ่านอย่างเดียว</p>
    {loading ? <p role="status">กำลังโหลดประวัติ…</p> : error ? <p role="alert">{error} <button type="button" onClick={() => setRetry(retry + 1)}>ลองอีกครั้ง</button></p> : !events.length ? <p>ยังไม่มีประวัติการแก้ไขโปรไฟล์</p> : events.map((event) => {
      const before = JSON.parse(event.before_json);
      const after = JSON.parse(event.after_json);
      const fields = Object.keys(labels).filter((field) => (before[field] ?? "") !== (after[field] ?? ""));
      return <details key={event.id}><summary>{new Date(event.created_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })} · {event.actor_name} · เปลี่ยน {fields.length} รายการ</summary>
        {fields.length ? <div className="employee-history-scroll"><table><thead><tr><th>ข้อมูล</th><th>ก่อนแก้ไข</th><th>หลังแก้ไข</th></tr></thead><tbody>{fields.map((field) => <tr key={field}><th>{labels[field]}</th><td>{String(before[field] ?? "") || "—"}</td><td>{String(after[field] ?? "") || "—"}</td></tr>)}</tbody></table></div> : <p>บันทึกโดยไม่มีการเปลี่ยนข้อมูล</p>}
      </details>;
    })}
  </section>;
}
