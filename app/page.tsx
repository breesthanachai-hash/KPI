"use client";

import { useMemo, useState } from "react";

type Role = {
  id: string;
  name: string;
  shortName: string;
  department: string;
  departmentId: string;
  people: number;
  score: number;
  progress: number;
  trend: number;
  status: "ดีเยี่ยม" | "ตามเป้าหมาย" | "ควรติดตาม";
  kpis: { name: string; weight: number; score: number; target: string }[];
};

const roles: Role[] = [
  {
    id: "sales-manager",
    name: "ผู้จัดการฝ่ายขาย",
    shortName: "ฝ่ายขาย",
    department: "ฝ่ายขาย",
    departmentId: "sales",
    people: 18,
    score: 88.5,
    progress: 91,
    trend: 4.8,
    status: "ดีเยี่ยม",
    kpis: [
      { name: "ยอดขายเทียบเป้าหมาย", weight: 40, score: 94, target: "≥ 100%" },
      { name: "อัตราปิดการขาย", weight: 25, score: 87, target: "≥ 32%" },
      { name: "การรักษาลูกค้า", weight: 20, score: 86, target: "≥ 90%" },
      { name: "การพัฒนาและบริหารทีม", weight: 15, score: 82, target: "≥ 85%" },
    ],
  },
  {
    id: "marketing",
    name: "เจ้าหน้าที่การตลาด",
    shortName: "การตลาด",
    department: "การตลาด",
    departmentId: "marketing",
    people: 24,
    score: 84.2,
    progress: 87,
    trend: 3.6,
    status: "ตามเป้าหมาย",
    kpis: [
      { name: "จำนวนลีดคุณภาพ", weight: 35, score: 88, target: "≥ 240 ราย" },
      { name: "ต้นทุนต่อหนึ่งลีด", weight: 25, score: 81, target: "≤ 420 บาท" },
      { name: "อัตราการมีส่วนร่วม", weight: 20, score: 86, target: "≥ 6.5%" },
      { name: "แคมเปญเสร็จตามแผน", weight: 20, score: 80, target: "≥ 90%" },
    ],
  },
  {
    id: "customer-service",
    name: "บริการลูกค้า",
    shortName: "ฝ่ายบริการ",
    department: "บริการลูกค้า",
    departmentId: "service",
    people: 31,
    score: 78.6,
    progress: 81,
    trend: 1.4,
    status: "ควรติดตาม",
    kpis: [
      { name: "คะแนนความพึงพอใจ", weight: 35, score: 82, target: "≥ 4.6/5" },
      { name: "เวลาตอบกลับครั้งแรก", weight: 25, score: 74, target: "≤ 8 นาที" },
      { name: "แก้ปัญหาในการติดต่อครั้งแรก", weight: 25, score: 77, target: "≥ 82%" },
      { name: "คุณภาพการให้บริการ", weight: 15, score: 83, target: "≥ 88%" },
    ],
  },
  {
    id: "developer",
    name: "นักพัฒนาซอฟต์แวร์",
    shortName: "เทคโนโลยี",
    department: "เทคโนโลยี",
    departmentId: "technology",
    people: 37,
    score: 86.8,
    progress: 89,
    trend: 4.1,
    status: "ดีเยี่ยม",
    kpis: [
      { name: "งานส่งมอบตรงรอบ", weight: 30, score: 91, target: "≥ 90%" },
      { name: "คุณภาพโค้ด", weight: 30, score: 88, target: "Defect ≤ 2%" },
      { name: "ความเสถียรของระบบ", weight: 25, score: 85, target: "≥ 99.9%" },
      { name: "การแบ่งปันความรู้", weight: 15, score: 79, target: "≥ 2 ครั้ง/ไตรมาส" },
    ],
  },
  {
    id: "hr",
    name: "ฝ่ายทรัพยากรบุคคล",
    shortName: "บุคคล",
    department: "ทรัพยากรบุคคล",
    departmentId: "people",
    people: 18,
    score: 80.4,
    progress: 84,
    trend: 2.2,
    status: "ตามเป้าหมาย",
    kpis: [
      { name: "ระยะเวลาสรรหาเฉลี่ย", weight: 30, score: 78, target: "≤ 28 วัน" },
      { name: "อัตราคงอยู่ของพนักงาน", weight: 30, score: 84, target: "≥ 92%" },
      { name: "ความผูกพันต่อองค์กร", weight: 25, score: 81, target: "≥ 80%" },
      { name: "แผนพัฒนาที่เสร็จตามกำหนด", weight: 15, score: 77, target: "≥ 90%" },
    ],
  },
];

const employees = [
  { initials: "NK", name: "นรินทร์ กิตติคุณ", role: "ผู้จัดการฝ่ายขาย", departmentId: "sales", score: 92, note: "ผลงานโดดเด่น", tone: "green" },
  { initials: "PS", name: "พิมพ์ชนก สุขใจ", role: "เจ้าหน้าที่การตลาด", departmentId: "marketing", score: 87, note: "เกินเป้าหมาย", tone: "ochre" },
  { initials: "TP", name: "ธนวัฒน์ พงศ์ศรี", role: "บริการลูกค้า", departmentId: "service", score: 71, note: "ควรติดตาม", tone: "terra" },
];

const filters = [
  { id: "all", label: "ทุกแผนก" },
  { id: "sales", label: "ฝ่ายขาย" },
  { id: "marketing", label: "การตลาด" },
  { id: "service", label: "ฝ่ายบริการ" },
];

function scoreStatus(score: number) {
  if (score >= 85) return "ดีเยี่ยม";
  if (score >= 75) return "ตามเป้าหมาย";
  return "ควรติดตาม";
}

export default function Home() {
  const [activeFilter, setActiveFilter] = useState("all");
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [activeNav, setActiveNav] = useState("overview");
  const [toast, setToast] = useState("");
  const [period, setPeriod] = useState("ไตรมาส 3 · ปี 2569");
  const [draftScores, setDraftScores] = useState<number[]>([]);

  const filteredRoles = useMemo(
    () => activeFilter === "all" ? roles : roles.filter((role) => role.departmentId === activeFilter),
    [activeFilter],
  );
  const filteredEmployees = useMemo(
    () => activeFilter === "all" ? employees : employees.filter((employee) => employee.departmentId === activeFilter),
    [activeFilter],
  );

  const openEvaluation = (role: Role) => {
    setSelectedRole(role);
    setDraftScores(role.kpis.map((kpi) => kpi.score));
  };

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };

  const jumpTo = (id: string) => {
    setActiveNav(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const draftTotal = selectedRole
    ? draftScores.reduce((sum, score, index) => sum + score * selectedRole.kpis[index].weight / 100, 0)
    : 0;

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => jumpTo("overview")} aria-label="ไปที่ภาพรวม">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>
            <strong>PEOPLE PULSE</strong>
            <small>KPI &amp; PERFORMANCE</small>
          </span>
        </button>
        <nav aria-label="เมนูหลัก">
          <button className={activeNav === "overview" ? "active" : ""} onClick={() => jumpTo("overview")}>ภาพรวม</button>
          <button className={activeNav === "roles" ? "active" : ""} onClick={() => jumpTo("roles")}>ตำแหน่งงาน</button>
          <button className={activeNav === "employees" ? "active" : ""} onClick={() => jumpTo("employees")}>พนักงาน</button>
        </nav>
        <div className="header-actions">
          <label className="period-select">
            <span className="sr-only">เลือกรอบประเมิน</span>
            <select value={period} onChange={(event) => setPeriod(event.target.value)}>
              <option>ไตรมาส 3 · ปี 2569</option>
              <option>ไตรมาส 2 · ปี 2569</option>
              <option>ไตรมาส 1 · ปี 2569</option>
            </select>
          </label>
          <button className="icon-button" onClick={() => showToast("ไม่มีการแจ้งเตือนใหม่") } aria-label="การแจ้งเตือน">
            <span aria-hidden="true">●</span><i />
          </button>
          <button className="profile-button" onClick={() => showToast("เข้าสู่ระบบในชื่อ วารุณี") } aria-label="โปรไฟล์ผู้ใช้">วร</button>
        </div>
      </header>

      <section className="dashboard" id="overview">
        <div className="page-heading">
          <div>
            <p className="eyebrow">ภาพรวมองค์กร</p>
            <h1>ภาพรวม KPI พนักงาน</h1>
            <p>ติดตามเป้าหมาย วิเคราะห์ผลงาน และดูแลการเติบโตของทีมในที่เดียว</p>
          </div>
          <div className="heading-actions">
            <button className="secondary-button" onClick={() => showToast("เตรียมไฟล์รายงานเรียบร้อยแล้ว") }><span aria-hidden="true">↓</span> ส่งออกรายงาน</button>
            <button className="primary-button" onClick={() => openEvaluation(roles[0])}><span aria-hidden="true">＋</span> เริ่มประเมิน</button>
          </div>
        </div>

        <div className="filter-row" aria-label="กรองตามแผนก">
          {filters.map((filter) => (
            <button
              key={filter.id}
              className={activeFilter === filter.id ? "active" : ""}
              onClick={() => setActiveFilter(filter.id)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="summary-grid">
          <article className="hero-score">
            <div className="score-ring" style={{ "--score": "82.4%" } as React.CSSProperties}>
              <div><strong>82.4</strong><span>คะแนนเฉลี่ย</span></div>
            </div>
            <div className="hero-copy">
              <span>ภาพรวมองค์กร</span>
              <h2>ผลงานดีขึ้นต่อเนื่อง<br />พร้อมไปสู่เป้าหมายถัดไป</h2>
              <p>คะแนนรวมเพิ่มขึ้น <strong>3.2 จุด</strong> จากไตรมาสก่อน</p>
              <div className="trend-bars" aria-label="คะแนนมีแนวโน้มสูงขึ้น">
                {[34, 42, 39, 52, 48, 59, 57, 66, 78, 88].map((height, index) => (
                  <i key={index} className={index > 6 ? "highlight" : ""} style={{ height: `${height}%` }} />
                ))}
              </div>
            </div>
          </article>

          <article className="metric-card">
            <div className="metric-top"><span>บรรลุเป้าหมาย</span><i className="metric-icon">✓</i></div>
            <strong>76%</strong>
            <p className="positive">↑ 6% จากไตรมาสก่อน</p>
            <div className="mini-progress"><i style={{ width: "76%" }} /></div>
          </article>
          <article className="metric-card">
            <div className="metric-top"><span>พนักงาน</span><i className="metric-icon people-icon">••</i></div>
            <strong>128 <small>คน</small></strong>
            <p>ครบ 5 กลุ่มตำแหน่ง</p>
            <div className="avatar-stack"><i>NK</i><i>PS</i><i>TP</i><i>+125</i></div>
          </article>
          <article className="metric-card">
            <div className="metric-top"><span>รอประเมิน</span><i className="metric-icon">◷</i></div>
            <strong>12 <small>คน</small></strong>
            <p className="warning">ควรติดตามภายใน 7 วัน</p>
            <button className="text-link" onClick={() => openEvaluation(roles[2])}>ดูรายการ <span>→</span></button>
          </article>
          <article className="metric-card">
            <div className="metric-top"><span>แนวโน้มไตรมาสนี้</span><i className="metric-icon">↗</i></div>
            <strong>+3.2</strong>
            <p className="positive">การเติบโตเชิงบวก</p>
            <div className="sparkline" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
          </article>
        </div>

        <div className="content-grid" id="roles">
          <section className="role-card">
            <div className="section-heading">
              <div><p className="eyebrow">5 กลุ่มตำแหน่ง</p><h2>ประสิทธิภาพตามตำแหน่ง</h2></div>
              <button onClick={() => showToast("แสดงข้อมูลตำแหน่งงานทั้งหมดแล้ว")}>ดูรายละเอียดทั้งหมด <span>→</span></button>
            </div>
            <div className="role-table" role="table" aria-label="ประสิทธิภาพตามตำแหน่ง">
              <div className="role-header" role="row">
                <span role="columnheader">ตำแหน่ง</span><span role="columnheader">พนักงาน</span><span role="columnheader">คะแนน</span><span role="columnheader">ความคืบหน้า</span><span />
              </div>
              {filteredRoles.length ? filteredRoles.map((role) => (
                <button className="role-row" role="row" key={role.id} onClick={() => openEvaluation(role)}>
                  <span className="role-name" role="cell"><i className={`status-dot ${role.status === "ควรติดตาม" ? "alert" : ""}`} /> <span><strong>{role.name}</strong><small>{role.department}</small></span></span>
                  <span role="cell">{role.people} คน</span>
                  <span className="role-score" role="cell"><strong>{role.score}</strong><small className={role.trend > 3 ? "up" : ""}>+{role.trend}</small></span>
                  <span className="progress-cell" role="cell"><i><b style={{ width: `${role.progress}%` }} /></i><em>{role.progress}%</em></span>
                  <span className="row-arrow" aria-hidden="true">›</span>
                </button>
              )) : <div className="empty-state">ยังไม่มีตำแหน่งในตัวกรองนี้</div>}
            </div>
          </section>

          <aside className="spotlight-card" id="employees">
            <div className="section-heading compact">
              <div><p className="eyebrow">รายบุคคล</p><h2>พนักงานที่น่าจับตา</h2></div>
              <button className="round-button" onClick={() => showToast("เปิดรายชื่อพนักงานทั้งหมด")}>→</button>
            </div>
            <div className="employee-list">
              {filteredEmployees.length ? filteredEmployees.map((employee) => {
                const role = roles.find((item) => item.name === employee.role) ?? roles[0];
                return (
                  <button className="employee-row" key={employee.name} onClick={() => openEvaluation(role)}>
                    <span className={`employee-avatar ${employee.tone}`}>{employee.initials}</span>
                    <span className="employee-copy"><strong>{employee.name}</strong><small>{employee.role}</small><em>{employee.note}</em></span>
                    <span className={`employee-score ${employee.score < 75 ? "low" : ""}`}><strong>{employee.score}</strong><small>คะแนน</small></span>
                  </button>
                );
              }) : <div className="empty-state">ไม่มีพนักงานเด่นในตัวกรองนี้</div>}
            </div>
            <div className="insight-box">
              <span className="insight-mark">↗</span>
              <div><strong>โอกาสพัฒนาทีม</strong><p>3 คนพร้อมรับเป้าหมายที่ท้าทายขึ้นในไตรมาสหน้า</p></div>
            </div>
          </aside>
        </div>
      </section>

      <footer><span>PEOPLE PULSE</span><p>ข้อมูลจำลองสำหรับต้นแบบระบบ KPI · อัปเดตล่าสุด 4 ส.ค. 2569</p></footer>

      {selectedRole && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSelectedRole(null)}>
          <section className="evaluation-modal" role="dialog" aria-modal="true" aria-labelledby="evaluation-title">
            <div className="modal-header">
              <div><p className="eyebrow">แบบประเมินประจำไตรมาส</p><h2 id="evaluation-title">{selectedRole.name}</h2><span>{selectedRole.department} · {period}</span></div>
              <button className="modal-close" onClick={() => setSelectedRole(null)} aria-label="ปิดหน้าต่าง">×</button>
            </div>
            <div className="modal-score-summary">
              <div><small>คะแนนถ่วงน้ำหนัก</small><strong>{draftTotal.toFixed(1)}</strong><span className={draftTotal < 75 ? "low" : ""}>{scoreStatus(draftTotal)}</span></div>
              <div className="modal-progress"><i style={{ width: `${draftTotal}%` }} /></div>
            </div>
            <div className="kpi-editor">
              {selectedRole.kpis.map((kpi, index) => (
                <label key={kpi.name}>
                  <span className="kpi-label"><span><strong>{kpi.name}</strong><small>น้ำหนัก {kpi.weight}% · เป้าหมาย {kpi.target}</small></span><b>{draftScores[index]}</b></span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={draftScores[index]}
                    onChange={(event) => setDraftScores((scores) => scores.map((score, scoreIndex) => scoreIndex === index ? Number(event.target.value) : score))}
                    style={{ "--range-value": `${draftScores[index]}%` } as React.CSSProperties}
                  />
                </label>
              ))}
            </div>
            <label className="note-field"><span>บันทึกจากผู้ประเมิน</span><textarea placeholder="ระบุผลงานเด่น จุดที่ควรพัฒนา หรือแผนสนับสนุน..." /></label>
            <div className="modal-actions"><button className="secondary-button" onClick={() => setSelectedRole(null)}>ยกเลิก</button><button className="primary-button" onClick={() => { setSelectedRole(null); showToast(`บันทึกผลประเมิน ${selectedRole.name} แล้ว`); }}>บันทึกผลประเมิน</button></div>
          </section>
        </div>
      )}

      <div className={`toast ${toast ? "show" : ""}`} role="status"><span>✓</span>{toast}</div>
    </main>
  );
}
