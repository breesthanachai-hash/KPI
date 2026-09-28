"use client";
import { useCallback, useEffect, useState } from "react";
type Assignment = {id:string;template_id:string;employee_id:string;employee_name:string;day:string;title:string;tasks_json:string;submitted_at:string|null;evidence_json:string|null};
type Data = {admin:boolean;assignments:Assignment[];people:{id:string;name:string;position:string}[];templates:{id:string;name:string;tasks:string[]}[];bindings:{template_id:string;employee_id:string;enabled:number}[]};
export default function DailyAssignments({ employeeId, mode = "assignments" }: {employeeId?:string|null;mode?:"assignments"|"bindings"}) {
  const [data,setData]=useState<Data|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [template,setTemplate]=useState("");
  const [person,setPerson]=useState("");
  const [search,setSearch]=useState("");
  const [notice,setNotice]=useState("");
  const [replaceExisting,setReplaceExisting]=useState(true);
  const [selected,setSelected]=useState("");
  const [note,setNote]=useState("");
  const [links,setLinks]=useState("");
  const [now,setNow]=useState(0);
  useEffect(()=>{ if(data) window.dispatchEvent(new Event("daily-assignments-updated")); },[data]);
  const load=useCallback(async()=>{try {const response=await fetch("/api/daily-assignments");const value=await response.json();if(!response.ok)throw Error(value.error||"โหลดงานไม่สำเร็จ");setData(value);setError("");}catch(e){setError(e instanceof Error?e.message:"โหลดงานไม่สำเร็จ");}},[]);
  useEffect(()=>{const refresh=()=>{setNow(Date.now());void load();};const first=setTimeout(refresh,0);const timer=setInterval(refresh,60000);return()=>{clearTimeout(first);clearInterval(timer);};},[load]);
  async function save(body:object){setBusy(true);setError("");setNotice("");try{const response=await fetch("/api/daily-assignments",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw Error(result.error);setSelected("");setNote("");setLinks("");await load();setNotice(mode === "bindings" ? "บันทึกการตั้งค่าผู้รับงานแล้ว โดยไม่เปลี่ยนข้อมูลหรือสิทธิ์บัญชีพนักงาน" : "ส่งงานเรียบร้อยแล้ว");}catch(e){setError(e instanceof Error?e.message:"บันทึกไม่สำเร็จ");}finally{setBusy(false);}}
  return <section className="daily-assignments">
    <h2>{mode === "bindings" ? "ตั้งค่าผู้รับงานรายวัน" : "งานประจำวัน"}</h2><p>ระบบแจกตามตำแหน่ง · จันทร์–เสาร์ 09:00–17:00 · ส่งงานแล้วเสร็จทันที</p>
    {notice&&<p role="status">{notice}</p>}
    {error&&<p role="alert">{error} <button type="button" onClick={()=>void load()}>โหลดใหม่</button></p>}
    {!data&&!error&&<p role="status">กำลังโหลด…</p>}
    {mode === "bindings" && data && !data.admin && <p role="alert">เฉพาะ HR/Admin เท่านั้น</p>}
    {mode === "bindings" && data?.admin&&<section className="assignment-binding-panel"><h3>ผูกบัญชีพนักงานกับงานรายวัน</h3><p>เลือกแม่แบบให้ตรงกับงานจริงได้ แม้ชื่อตำแหน่งในบัญชีไม่ตรงกัน โดยไม่เปลี่ยนตำแหน่งหรือสิทธิ์พนักงาน</p><p>งาน HR เงินเดือนและค่าคอมมิชชัน งาน AI/Affiliate เป้าตัดต่อที่ยังไม่ยืนยัน และงานตามโปรเจกต์ยังพักไว้</p>
      <form onSubmit={e=>{e.preventDefault();void save({action:"bind",templateId:template,employeeId:person,enabled:true,replaceExisting});}}>
        <label>1. เลือกบัญชีพนักงาน<select required disabled={busy} value={person} onChange={e=>{setPerson(e.target.value);setNotice("");const binding=data.bindings.find(b=>b.employee_id===e.target.value&&b.enabled);setTemplate(binding?.template_id??"");}}><option value="">เลือกบัญชีพนักงาน</option>{data.people.map(p=><option key={p.id} value={p.id}>{p.name} · {p.position}</option>)}</select></label>
        <label>2. เลือกตำแหน่งงานรายวัน<select required disabled={busy||!person} value={template} onChange={e=>setTemplate(e.target.value)}><option value="">เลือกตำแหน่ง</option>{data.templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <div className="assignment-binding-preview"><strong>3. ตรวจสอบก่อนบันทึก</strong><p>{data.people.find(p=>p.id===person)?.name??"ยังไม่ได้เลือกพนักงาน"} → {data.templates.find(t=>t.id===template)?.name??"ยังไม่ได้เลือกตำแหน่ง"}</p><ul>{data.templates.find(t=>t.id===template)?.tasks.map(task=><li key={task}>{task}</li>)}</ul><p>เริ่มวันนี้หากเลย 09:00 น. และเป็นวันทำงาน · งานเก่าที่สร้างแล้วจะยังคงอยู่</p></div>
        <label><span><input type="checkbox" disabled={busy} checked={replaceExisting} onChange={e=>setReplaceExisting(e.target.checked)}/> ใช้แม่แบบนี้แทนแม่แบบเดิมของพนักงาน (พักการแจกจากแม่แบบอื่น)</span></label><button disabled={busy||!person||!template}>{busy?"กำลังบันทึก…":"บันทึกการผูกและเปิดแจกงาน"}</button>
      </form>{!data.people.length&&<p>ยังไม่มีพนักงานที่มีบัญชีใช้งาน จึงยังไม่แจกงาน</p>}
      {data.bindings.map(b=><p key={`${b.template_id}:${b.employee_id}`}>{data.templates.find(t=>t.id===b.template_id)?.name} → {data.people.find(p=>p.id===b.employee_id)?.name??"บัญชีไม่พร้อมใช้งาน"} · {b.enabled?"เปิดอยู่":"พัก"} <button type="button" disabled={busy} onClick={()=>void save({action:"bind",templateId:b.template_id,employeeId:b.employee_id,enabled:!b.enabled})}>{b.enabled?"พักแจกงาน":"เปิดอีกครั้ง"}</button></p>)}
      <h4>สถานะการผูกบัญชี · {data.people.length} คน</h4><label>ค้นหาพนักงานหรือตำแหน่ง<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="พิมพ์ชื่อหรือตำแหน่ง" /></label><div className="assignment-binding-roster">{data.people.filter(p=>`${p.name} ${p.position}`.toLowerCase().includes(search.toLowerCase())).map(p=><article key={p.id}><strong>{p.name}</strong><p>{p.position}</p><p>{data.bindings.filter(b=>b.employee_id===p.id&&b.enabled).map(b=>data.templates.find(t=>t.id===b.template_id)?.name).join(", ")||"ยังไม่ผูกแม่แบบที่เปิดใช้งาน"}</p><button type="button" disabled={busy} onClick={()=>{setPerson(p.id);const binding=data.bindings.find(b=>b.employee_id===p.id&&b.enabled);setTemplate(binding?.template_id??"");setNotice(`เลือก ${p.name} แล้ว กรุณาตรวจสอบแบบฟอร์มด้านบน`);}}>เลือกบัญชีนี้เพื่อผูก / แก้ไขด้านบน</button></article>)}</div>
    </section>}
    {mode === "assignments" && data&&!data.assignments.length&&<p>ยังไม่มีงานรายวัน รอผูกผู้รับผิดชอบและถึงเวลาแจกงาน</p>}
    {mode === "assignments" && data?.assignments.map(a=><article key={a.id} data-status={a.submitted_at?"done":now>Date.parse(`${a.day}T17:00:00+07:00`)?"overdue":"pending"}><h3>{a.employee_name} · {a.title}</h3><p>{a.day} · กำหนดส่ง 17:00 · <strong>{a.submitted_at?"ส่งแล้ว":now>Date.parse(`${a.day}T17:00:00+07:00`)?"เกินกำหนด":"รอส่ง"}</strong></p>{["boss","tam"].includes(a.template_id)&&<p><strong>ขั้นต่ำ 3 แคมเปญ · แคมเปญละ 3 คลิป</strong></p>}<details><summary>ดูรายละเอียดงาน</summary><ul>{(JSON.parse(a.tasks_json) as string[]).map(t=><li key={t}>{t}</li>)}</ul></details>
      {a.evidence_json&&<details><summary>ดูหลักฐาน / งานที่ทำ</summary><p>{JSON.parse(a.evidence_json).note}</p>{(JSON.parse(a.evidence_json).links as string[]).map((link,i)=><p key={i}><a href={link} target="_blank" rel="noopener noreferrer">{["boss","tam"].includes(a.template_id)?`แคมเปญ ${Math.floor(i/3)+1} · คลิป ${i%3+1}`:`หลักฐาน ${i+1}`}</a></p>)}</details>}
      {!a.submitted_at&&a.employee_id===employeeId&&<button type="button" onClick={()=>{setSelected(a.id);setNote("");setLinks("");}}>ส่งงาน</button>}
      {selected===a.id&&<form onSubmit={e=>{e.preventDefault();void save({action:"submit",id:a.id,note,links:links.split("\n").map(l=>l.trim()).filter(Boolean)});}}><label>สรุปสิ่งที่ทำ<textarea required maxLength={5000} value={note} onChange={e=>setNote(e.target.value)}/></label><label>ลิงก์หลักฐาน หนึ่งลิงก์ต่อบรรทัด{["boss","tam"].includes(a.template_id)&&" — เรียงแคมเปญละ 3 คลิป ขั้นต่ำ 9 ลิงก์"}<textarea required value={links} onChange={e=>setLinks(e.target.value)}/></label><button disabled={busy}>ส่งและจบงาน</button><button type="button" onClick={()=>setSelected("")}>ยกเลิก</button></form>}
    </article>)}
    {mode === "assignments" && data&&<small>แสดงไม่เกิน 500 งานล่าสุด · งานค้างไม่ถูกปิดเมื่อขึ้นวันใหม่</small>}
  </section>;
}
