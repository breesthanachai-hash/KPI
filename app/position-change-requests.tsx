"use client";
import { useCallback, useEffect, useState } from "react";
import { findRole, roles } from "../lib/kpi-data";
import { MAX_POSITION_REQUEST_FILE_BYTES, parseRequestFile, type PositionRequestFile, type PositionRequestTransfer } from "../lib/position-request-format";
import type { PositionEmployee, PositionRequestRow } from "../lib/position-request-service";

type RequestRow = Omit<PositionRequestRow,"source_fingerprint"> & { employee_name:string; conflict:string };
type PreviewRow = {request:PositionRequestTransfer;employee_name:string;conflict:string;duplicate:boolean;existing_status:string|null};
type Data = {requests:RequestRow[];employees:PositionEmployee[];approvalEnabled:boolean;nextOffset:number|null};
const position = (role:string,title:string) => title || findRole(role)?.name || role;
const stateLabel = {pending:"รออนุมัติ",approved:"อนุมัติแล้ว",rejected:"ปฏิเสธแล้ว"};

async function post(body: unknown) {
  const response = await fetch("/api/position-change-requests",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "ดำเนินการไม่สำเร็จ");
  return result;
}

export default function PositionChangeRequests({onEmployeeChanged}:{onEmployeeChanged:()=>void}) {
  const [data,setData] = useState<Data|null>(null);
  const [offset,setOffset] = useState(0);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const [busy,setBusy] = useState(false);
  const [loading,setLoading] = useState(true);
  const [employeeId,setEmployeeId] = useState("");
  const [roleId,setRoleId] = useState(roles[0].id);
  const [title,setTitle] = useState("");
  const [reason,setReason] = useState("");
  const [file,setFile] = useState<PositionRequestFile|null>(null);
  const [preview,setPreview] = useState<PreviewRow[]|null>(null);
  const [review,setReview] = useState<RequestRow|null>(null);
  const [note,setNote] = useState("");
  const [confirmed,setConfirmed] = useState(false);
  const [exportCursor,setExportCursor] = useState("");
  const load = useCallback(async (signal?:AbortSignal) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/position-change-requests?offset=${offset}`,{signal,cache:"no-store"});
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "โหลดคำขอไม่สำเร็จ");
      if (!signal?.aborted) setData(body);
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "เชื่อมต่อไม่ได้");
    } finally { if (!signal?.aborted) setLoading(false); }
  },[offset]);
  useEffect(()=>{const controller=new AbortController();const timer=setTimeout(()=>void load(controller.signal),0);return()=>{clearTimeout(timer);controller.abort();};},[load]);
  const employee = data?.employees.find(item=>item.id===employeeId);
  async function perform(action:()=>Promise<void>) {
    if (busy) return;
    setBusy(true);setError("");setNotice("");
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : "ดำเนินการไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  async function importFile(selected?:File) {
    setPreview(null);setFile(null);
    if (!selected) return;
    await perform(async()=>{
      if (selected.size>MAX_POSITION_REQUEST_FILE_BYTES) throw new Error("ไฟล์ใหญ่เกิน 256 KB");
      const parsed = parseRequestFile(JSON.parse(await selected.text()));
      const result = await post({action:"previewImport",file:parsed});
      setFile(parsed);setPreview(result.preview);setNotice("ตรวจไฟล์แล้ว ยังไม่ได้นำเข้าหรือเปลี่ยนข้อมูลพนักงาน");
    });
  }
  async function exportPending() {
    await perform(async()=>{
      const response=await fetch(`/api/position-change-requests?export=1&after=${encodeURIComponent(exportCursor)}`,{cache:"no-store"});
      const body=await response.json();
      if(!response.ok)throw new Error(body.error ?? "ส่งออกไม่สำเร็จ");
      if(!body.file.requests.length){setExportCursor("");setNotice("ไม่มีคำขอรออนุมัติในชุดนี้");return;}
      const safeFile=parseRequestFile(body.file);
      const url=URL.createObjectURL(new Blob([JSON.stringify(safeFile,null,2)],{type:"application/json"}));
      const anchor=document.createElement("a");anchor.href=url;anchor.download=`position-requests-${Date.now()}.json`;
      document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
      setExportCursor(body.nextCursor ?? "");setNotice(body.nextCursor ? `ส่งออก ${safeFile.requests.length} คำขอแล้ว ยังมีชุดถัดไป` : "ส่งออกเฉพาะคำขอที่รออนุมัติแล้ว");
    });
  }
  return <section className="position-requests" aria-labelledby="position-request-title">
    <h2 id="position-request-title">คำขอเปลี่ยนตำแหน่งพนักงาน</h2>
    <p>สร้างคำขอ → ส่งออก JSON → นำเข้าที่ระบบหลัก → HR/Admin ตรวจและอนุมัติทีละรายการ</p>
    <p className="position-request-mode">{data?.approvalEnabled ? "ระบบนี้เปิดรับการอนุมัติ · การอนุมัติจะเปลี่ยนตำแหน่งและกรอบ KPI จริง" : "โหมดสร้างคำขอ · ปิดการอนุมัติไว้ ไม่เปลี่ยนข้อมูลพนักงานจริง"}</p>
    <p>ไม่เปลี่ยนรหัสผ่าน สิทธิ์บัญชี เงินเดือน หรือแม่แบบงานรายวัน · ไฟล์คำขอมีข้อมูลบุคลากร ควรส่งผ่านช่องทางจำกัดสิทธิ์ และห้ามกรอกรหัสลับในเหตุผล</p>
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    <button type="button" disabled={busy||loading} onClick={()=>{setError("");void load();}}>โหลดข้อมูลล่าสุด</button>
    {loading&&<p role="status">กำลังโหลด…</p>}
    {data&&<><div className="position-request-columns">
      <form onSubmit={event=>{event.preventDefault();if(!employee)return;void perform(async()=>{
        await post({action:"create",employee_id:employee.id,expected_employee_updated_at:employee.updated_at,requested_role_id:roleId,requested_position_title:title,reason});
        setReason("");setNotice("สร้างคำขอรออนุมัติแล้ว ตำแหน่งจริงยังไม่เปลี่ยน");await load();
      });}}>
        <h3>1. สร้างคำขอ</h3>
        <label>พนักงาน<select required value={employeeId} disabled={busy} onChange={event=>{setEmployeeId(event.target.value);const person=data.employees.find(item=>item.id===event.target.value);if(person){setRoleId(person.role_id);setTitle(person.position_title);}}}><option value="">เลือกพนักงาน</option>{data.employees.map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
        {employee&&<p>เดิม: {position(employee.role_id,employee.position_title)} · กรอบ KPI: {findRole(employee.role_id)?.name ?? employee.role_id}</p>}
        <label>กรอบตำแหน่งใหม่<select required value={roleId} disabled={busy} onChange={event=>setRoleId(event.target.value)}>{!roles.some(role=>role.id===roleId)&&<option value={roleId}>{findRole(roleId)?.name ?? roleId} (กรอบเดิม)</option>}{roles.map(role=><option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
        <label>ชื่อตำแหน่งเฉพาะ (ไม่บังคับ)<input value={title} disabled={busy} maxLength={240} onChange={event=>setTitle(event.target.value)} placeholder="เว้นว่างเพื่อใช้ชื่อกรอบตำแหน่ง" /></label>
        <label>เหตุผล<input required value={reason} disabled={busy} maxLength={1000} onChange={event=>setReason(event.target.value)} /></label>
        <button type="submit" disabled={busy||!employee}>สร้างคำขอเท่านั้น</button>
      </form>
      <section><h3>2. ส่งออก / นำเข้า</h3>
        <button type="button" disabled={busy} onClick={()=>void exportPending()}>{exportCursor ? "ส่งออกคำขอชุดถัดไป" : "ส่งออกคำขอรออนุมัติ (JSON)"}</button>
        {exportCursor&&<button type="button" disabled={busy} onClick={()=>setExportCursor("")}>เริ่มส่งออกใหม่</button>}
        <p>ครั้งละไม่เกิน 100 คำขอ · ไม่มีข้อมูลบัญชีหรือข้อมูลยืนยันตัวตน</p>
        <label>เลือกไฟล์คำขอเพื่อตรวจสอบ<input type="file" accept=".json,application/json" disabled={busy} onChange={event=>void importFile(event.target.files?.[0])} /></label>
        {preview&&<div><h4>ตรวจไฟล์ก่อนนำเข้า · {preview.length} รายการ</h4>
          <p>ผู้ร้องขอตามไฟล์เป็นข้อมูลอ้างอิง ไม่ใช่การยืนยันตัวตนจากระบบหลัก</p>
          {preview.map(row=><article key={row.request.id}><strong>{row.employee_name}</strong><p>{position(row.request.previous_role_id,row.request.previous_position_title)} → {position(row.request.requested_role_id,row.request.requested_position_title)}</p><p>{row.request.reason}</p><small>ผู้ร้องขอตามไฟล์: {row.request.requested_by_name}</small>{row.conflict&&<p className="position-request-conflict">{row.conflict}</p>}{row.duplicate&&<p>มีคำขอนี้แล้ว ({row.existing_status}) จะไม่เขียนทับ</p>}</article>)}
          <button type="button" disabled={busy||!file||preview.every(row=>row.duplicate)} onClick={()=>void perform(async()=>{const result=await post({action:"import",file});setFile(null);setPreview(null);setNotice(`นำเข้า ${result.imported} คำขอเพื่อรอตรวจแล้ว ยังไม่เปลี่ยนตำแหน่ง`);await load();})}>นำเข้าเป็นคำขอรออนุมัติ</button>
          <button type="button" disabled={busy} onClick={()=>{setFile(null);setPreview(null);}}>ยกเลิกไฟล์นี้</button>
        </div>}
      </section>
    </div>
    <section><h3>3. ตรวจคำขอและผลพิจารณา</h3>
      {review&&<form className="position-request-review" onSubmit={event=>{event.preventDefault();void perform(async()=>{await post({action:"approve",id:review.id,review_note:note,confirmed});setReview(null);setNotice("อนุมัติและบันทึกประวัติแล้ว");onEmployeeChanged();await load();});}}>
        <h4>ตรวจคำขอของ {review.employee_name}</h4>
        <p>เดิม: {position(review.previous_role_id,review.previous_position_title)} · {findRole(review.previous_role_id)?.name ?? review.previous_role_id}</p>
        <p>ใหม่: {position(review.requested_role_id,review.requested_position_title)} · {findRole(review.requested_role_id)?.name ?? review.requested_role_id}</p>
        <p>เหตุผล: {review.reason}</p><p>ผู้ร้องขอ{review.imported_by ? "ตามไฟล์" : ""}: {review.requested_by_name}</p>
        {review.conflict&&<p role="alert">{review.conflict} · อนุมัติไม่ได้</p>}
        <label>หมายเหตุผู้พิจารณา (จำเป็นเมื่อปฏิเสธ)<input value={note} maxLength={1000} disabled={busy} onChange={event=>setNote(event.target.value)} /></label>
        <label className="position-request-confirm"><input type="checkbox" checked={confirmed} disabled={busy||!!review.conflict} onChange={event=>setConfirmed(event.target.checked)} /> ยืนยันเปลี่ยนตำแหน่งและกรอบ KPI จริง โดยไม่แก้สิทธิ์บัญชี</label>
        <button type="submit" disabled={busy||!data.approvalEnabled||!!review.conflict||!confirmed}>อนุมัติรายการนี้</button>
        <button type="button" disabled={busy||!data.approvalEnabled||!note.trim()} onClick={()=>void perform(async()=>{await post({action:"reject",id:review.id,review_note:note});setReview(null);setNotice("ปฏิเสธคำขอแล้ว ข้อมูลพนักงานไม่เปลี่ยน");await load();})}>ปฏิเสธรายการนี้</button>
        <button type="button" disabled={busy} onClick={()=>setReview(null)}>ปิดการตรวจ</button>
      </form>}
      {!data.requests.length&&<p>ยังไม่มีคำขอ</p>}
      {data.requests.map(row=><article key={row.id}><h4>{row.employee_name} · {stateLabel[row.status]}</h4><p>{position(row.previous_role_id,row.previous_position_title)} → {position(row.requested_role_id,row.requested_position_title)}</p>
        <p>กรอบ KPI: {findRole(row.previous_role_id)?.name ?? row.previous_role_id} → {findRole(row.requested_role_id)?.name ?? row.requested_role_id}</p>
        <p>เหตุผล: {row.reason}</p><small>{row.id} · {row.created_at} · ผู้ร้องขอ{row.imported_by ? "ตามไฟล์" : ""}: {row.requested_by_name}</small>
        {row.conflict&&<p className="position-request-conflict">{row.conflict}</p>}
        {row.status==="pending"&&data.approvalEnabled&&<button type="button" disabled={busy} onClick={()=>{setReview(row);setNote("");setConfirmed(false);}}>ตรวจและพิจารณา · {row.employee_name}</button>}
        {row.status!=="pending"&&<p>ผู้พิจารณา: {row.reviewed_by_name} · {row.approved_at ?? row.rejected_at} · {row.review_note || "ไม่มีหมายเหตุ"}</p>}
      </article>)}
      <div><button type="button" disabled={busy||loading||offset===0} onClick={()=>setOffset(Math.max(0,offset-100))}>หน้าก่อน</button><button type="button" disabled={busy||loading||data.nextOffset===null} onClick={()=>setOffset(data.nextOffset!)}>หน้าถัดไป</button></div>
    </section></>}
  </section>;
}
