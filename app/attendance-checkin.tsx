"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { attendanceOffice, attendanceTime, isInsideAttendanceOffice, officeDistanceMeters } from "../lib/attendance-capture";

type Status = {linked:boolean;day:string;today:{clock_in:string|null;clock_out:string|null;status:string}|null;history:{id:string;kind:string;recorded_at:string;accuracy:number}[]};
export default function AttendanceCheckin({ preview = false }: {preview?:boolean}) {
  const [section,setSection]=useState<"clock"|"history">("clock");
  return <div>
    <nav className="attendance-submenu" aria-label="เมนูเข้างาน">
      <button type="button" aria-current={section==="clock"?"page":undefined} onClick={()=>setSection("clock")}>ลงเวลาเข้า–ออก</button>
      <button type="button" aria-current={section==="history"?"page":undefined} onClick={()=>setSection("history")}>ประวัติเข้างาน</button>
    </nav>
    {section==="clock"?<AttendanceClock preview={preview}/>:<AttendanceHistory/>}
  </div>;
}

function AttendanceHistory() {
  const [month,setMonth]=useState(()=>attendanceTime().day.slice(0,7));
  const [result,setResult]=useState<{linked:boolean;records:{work_date:string;clock_in:string|null;clock_out:string|null}[]}|null>(null);
  const [error,setError]=useState("");
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    fetch(`/api/attendance-capture?view=history&month=${encodeURIComponent(month)}`,{signal:controller.signal})
      .then(async response=>{const body=await response.json();if(!response.ok)throw Error(body.error||"โหลดประวัติไม่สำเร็จ");return body;})
      .then(body=>{if(!controller.signal.aborted)setResult(body);})
      .catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:"โหลดประวัติไม่สำเร็จ");});
    return()=>controller.abort();
  },[month,retry]);
  return <section className="attendance-checkin">
    <header><p className="eyebrow">ATTENDANCE HISTORY</p><h2>ประวัติเข้างานของฉัน</h2><p>เวลาเข้า–ออกที่บันทึกไว้ · เวลาประเทศไทย</p></header>
    <label className="attendance-month">เลือกเดือน<input type="month" value={month} onChange={e=>{if(e.target.value){setMonth(e.target.value);setResult(null);setError("");}}}/></label>
    {error?<p role="alert">{error} <button type="button" onClick={()=>{setError("");setResult(null);setRetry(v=>v+1);}}>ลองใหม่</button></p>:!result?<p role="status">กำลังโหลดประวัติ…</p>:!result.linked?<p role="status">บัญชีนี้ยังไม่ผูกกับพนักงาน กรุณาติดต่อ HR</p>:<>
      <table className="attendance-history-table"><caption>วันที่และเวลาเข้า–ออก</caption><thead><tr><th scope="col">วันที่</th><th scope="col">เวลาเข้า</th><th scope="col">เวลาออก</th></tr></thead><tbody>{result.records.map(row=><tr key={row.work_date}><td>{new Date(`${row.work_date}T12:00:00+07:00`).toLocaleDateString("th-TH",{timeZone:"Asia/Bangkok",day:"numeric",month:"short",year:"numeric"})}</td><td>{row.clock_in??"—"}</td><td>{row.clock_out??"—"}</td></tr>)}</tbody></table>
      {!result.records.length&&<p role="status">ไม่มีประวัติเข้างานในเดือนนี้</p>}
    </>}
  </section>;
}

function AttendanceClock({ preview = false }: {preview?:boolean}) {
  const [data,setData]=useState<Status|null>(null), [busy,setBusy]=useState(false), [error,setError]=useState(""), [message,setMessage]=useState("");
  const [photo,setPhoto]=useState<Blob|null>(null), [photoUrl,setPhotoUrl]=useState(""), [location,setLocation]=useState<GeolocationPosition|null>(null), [camera,setCamera]=useState(false);
  const video=useRef<HTMLVideoElement>(null), stream=useRef<MediaStream|null>(null), mounted=useRef(true);
  const stop=useCallback(()=>{stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;setCamera(false);},[]);
  const load=useCallback(async()=>{try{const res=await fetch("/api/attendance-capture");const value=await res.json();if(!res.ok)throw Error(value.error||"โหลดข้อมูลไม่สำเร็จ");setData(value);}catch(e){setError(e instanceof Error?e.message:"โหลดข้อมูลไม่สำเร็จ");}},[]);
  useEffect(()=>{mounted.current=true;const timer=setTimeout(()=>void load(),0);return()=>{mounted.current=false;clearTimeout(timer);stream.current?.getTracks().forEach(t=>t.stop());};},[load]);
  useEffect(()=>()=>{if(photoUrl)URL.revokeObjectURL(photoUrl);},[photoUrl]);
  async function prepare(){
    setBusy(true);setError("");setMessage("");setPhoto(null);setPhotoUrl("");setLocation(null);stop();
    try {
      if(!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !navigator.geolocation)throw Error("ต้องใช้ HTTPS หรือ localhost และเบราว์เซอร์ที่รองรับกล้องและตำแหน่ง");
      const media=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:960},height:{ideal:720}},audio:false});
      if(!mounted.current){media.getTracks().forEach(t=>t.stop());return;}
      stream.current=media;if(video.current){video.current.srcObject=media;await video.current.play();}setCamera(true);
      const gps=await new Promise<GeolocationPosition>((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,maximumAge:0,timeout:20000}));
      if(mounted.current)setLocation(gps);
    }catch{stop();setError("เปิดกล้องหรือจับพิกัดไม่ได้ กรุณาอนุญาตกล้องและตำแหน่งในการตั้งค่าเว็บไซต์ แล้วลองใหม่ หากยังไม่ได้ให้ติดต่อ HR");}finally{if(mounted.current)setBusy(false);}
  }
  function capture(){const v=video.current;if(!v?.videoWidth)return;const canvas=document.createElement("canvas");canvas.width=Math.min(v.videoWidth,960);canvas.height=Math.round(v.videoHeight*canvas.width/v.videoWidth);canvas.getContext("2d")?.drawImage(v,0,0,canvas.width,canvas.height);canvas.toBlob(blob=>{if(blob&&mounted.current){setPhoto(blob);setPhotoUrl(URL.createObjectURL(blob));stop();}},"image/jpeg",0.8);}
  async function submit(){
    if(!photo||!location||!data)return;
    if(!isInsideAttendanceOffice(location.coords.latitude,location.coords.longitude)){setError("พิกัดอยู่นอกรัศมี 3 เมตร กรุณาจับพิกัดใหม่หรือติดต่อ HR");return;}
    if(Date.now()-location.timestamp>120000){setError("พิกัดหมดอายุ กรุณาเปิดกล้องและจับพิกัดใหม่");return;}
    setBusy(true);setError("");
    try{const body=new FormData();body.set("photo",photo,"checkin.jpg");body.set("kind",data.today?.clock_in?"out":"in");body.set("latitude",String(location.coords.latitude));body.set("longitude",String(location.coords.longitude));body.set("accuracy",String(location.coords.accuracy));body.set("capturedAt",String(location.timestamp));const res=await fetch("/api/attendance-capture",{method:"POST",body});const value=await res.json();if(!res.ok)throw Error(value.error||"บันทึกไม่สำเร็จ");setMessage(value.message);setPhoto(null);setPhotoUrl("");setLocation(null);await load();}catch(e){setError(e instanceof Error?e.message:"บันทึกไม่สำเร็จ");}finally{setBusy(false);}
  }
  const unavailable=preview||!data?.linked||!!data.today?.clock_out||!!(data.today&&!data.today.clock_in);
  return <section className="attendance-checkin">
    <header><p className="eyebrow">TIME & ATTENDANCE</p><h2>ลงเวลาเข้างาน / ออกงาน</h2><p>จันทร์–เสาร์ 09:00–17:00 · เวลาประเทศไทย</p></header>
    <div className="checkin-summary"><span>วันที่ {data?.day??"…"}</span><strong>เข้า {data?.today?.clock_in??"—"}</strong><strong>ออก {data?.today?.clock_out??"—"}</strong></div>
    <div className="checkin-guide">
      <p><strong>ก่อนลงเวลา</strong> อนุญาตกล้องและ GPS · พิกัดต้องห่างจาก <a href={attendanceOffice.mapsUrl} target="_blank" rel="noreferrer">หมุดออฟฟิศ</a> ไม่เกิน <strong>3 เมตร</strong></p>
      <p><strong>ข้อมูลส่วนตัว</strong> เก็บรูปและพิกัดเมื่อกดยืนยัน คุณและ HR/Admin ดูได้ ไม่ติดตามต่อเนื่อง</p>
      <p><strong>GPS คลาดเคลื่อน?</strong> จับพิกัดใหม่หรือติดต่อ HR</p>
    </div>
    {location&&<p role="status">ระยะจากหมุด {officeDistanceMeters(location.coords.latitude,location.coords.longitude).toFixed(2)} เมตร · {isInsideAttendanceOffice(location.coords.latitude,location.coords.longitude)?"อยู่ในรัศมีที่กำหนด":"อยู่นอกรัศมี ลงเวลาไม่ได้"}{location.coords.accuracy>3?" · ค่าความคลาดเคลื่อน GPS มากกว่า 3 เมตร":""}</p>}
    {preview&&<p role="status">โหมดดูตัวอย่างไม่สามารถลงเวลาแทนพนักงานได้</p>}
    {data&&!data.linked&&<p role="status">บัญชีนี้ยังไม่ผูกกับพนักงาน กรุณาติดต่อ HR ก่อนลงเวลา</p>}
    {data?.today?.clock_out&&<p role="status">ลงเวลาเข้าและออกครบแล้ววันนี้</p>}
    {data?.today&&!data.today.clock_in&&<p role="status">มีรายการวันลาหรือสถานะอื่นในวันนี้ กรุณาติดต่อ HR</p>}
    {error&&<p role="alert">{error} <button type="button" onClick={()=>{setError("");void load();}}>โหลดใหม่</button></p>}
    {message&&<p role="status">{message}</p>}
    <div className="checkin-capture-grid"><div><video ref={video} muted playsInline hidden={!camera} aria-label="ภาพจากกล้องสำหรับลงเวลา" />{photoUrl&&photo&&<img src={photoUrl} alt="รูปหลักฐานก่อนบันทึก" />}<div className="checkin-actions"><button type="button" disabled={busy||unavailable} onClick={()=>void prepare()}>1. {photo?"ถ่ายใหม่ / จับพิกัดใหม่":"เปิดกล้องและจับพิกัด"}</button>{camera&&<button type="button" disabled={busy||!location} onClick={capture}>2. ถ่ายรูป</button>}</div></div><div className="checkin-location"><h3>หลักฐานการลงเวลา</h3><p>{photo?"✓ ถ่ายรูปแล้ว":"รอถ่ายรูปจากกล้อง"}</p><p>{location?`✓ พิกัด ${location.coords.latitude.toFixed(5)}, ${location.coords.longitude.toFixed(5)} (คลาดเคลื่อนประมาณ ${Math.round(location.coords.accuracy)} เมตร)`:"รออนุญาตตำแหน่งอุปกรณ์"}</p><button type="button" disabled={busy||unavailable||!photo||!location} onClick={()=>void submit()}>{busy?"กำลังดำเนินการ…":`3. ยืนยันลงเวลา${data?.today?.clock_in?"ออก":"เข้า"}`}</button><button type="button" disabled={busy} onClick={()=>{stop();setPhoto(null);setPhotoUrl("");setLocation(null);}}>ยกเลิก / ปิดกล้อง</button></div></div>
    <h3>หลักฐานล่าสุดของฉัน</h3>{data?.history.length===0&&<p>ยังไม่มีหลักฐานรูปและพิกัด</p>}<ul>{data?.history.map(row=><li key={row.id}>{new Date(row.recorded_at).toLocaleString("th-TH",{timeZone:"Asia/Bangkok"})} · {row.kind==="in"?"เข้างาน":"ออกงาน"} · <a href={`/api/attendance-capture?photo=${encodeURIComponent(row.id)}`} target="_blank" rel="noreferrer">ดูรูปหลักฐาน</a></li>)}</ul>
  </section>;
}
