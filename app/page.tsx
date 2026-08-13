"use client";

import { useEffect, useMemo, useState } from "react";
import {
  type EmployeeRecord,
  type EvaluationRecord,
  getRole,
  makeInitials,
  periods,
  roles,
  scoreStatus,
  seedEmployees,
} from "../lib/kpi-data";

type View = "overview" | "employees" | "skills";

const departmentFilters = [
  { id: "all", label: "ทุกแผนก" },
  ...roles.map((role) => ({ id: role.departmentId, label: role.department })),
];

function fallbackEvaluation(employee: EmployeeRecord): EvaluationRecord | null {
  if (employee.latestScore === null || employee.latestPeriod === null) return null;
  const role = getRole(employee.roleId);
  const skillLevel = Math.max(1, Math.min(5, Math.round((employee.latestSkillScore ?? 80) / 20)));
  return {
    id: `${employee.id}:${employee.latestPeriod}`,
    employeeId: employee.id,
    period: employee.latestPeriod,
    kpiScores: Object.fromEntries(role.kpis.map((kpi) => [kpi.id, employee.latestScore ?? 80])),
    skillScores: Object.fromEntries(role.skills.map((skill) => [skill.id, skillLevel])),
    kpiScore: employee.latestScore,
    skillScore: employee.latestSkillScore ?? skillLevel * 20,
    totalScore: employee.latestScore,
    note: "",
    evaluator: "ฝ่ายทรัพยากรบุคคล",
    evaluatedAt: employee.updatedAt,
  };
}

function csvCell(value: string | number | null) {
  const text = value === null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "2-digit" }).format(new Date(value));
}

function skillLevelLabel(level: number | null) {
  if (level === null) return "รอประเมิน";
  return ["", "พื้นฐาน", "กำลังพัฒนา", "ใช้งานได้", "ชำนาญ", "ผู้เชี่ยวชาญ"][level] ?? "รอประเมิน";
}

export default function Home() {
  const [view, setView] = useState<View>("overview");
  const [activeDepartment, setActiveDepartment] = useState("all");
  const [period, setPeriod] = useState(periods[0]);
  const [employees, setEmployees] = useState<EmployeeRecord[]>(seedEmployees);
  const [evaluations, setEvaluations] = useState<EvaluationRecord[]>(
    seedEmployees.map(fallbackEvaluation).filter((item): item is EvaluationRecord => item !== null),
  );
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeRecord | null>(null);
  const [skillProfileEmployee, setSkillProfileEmployee] = useState<EmployeeRecord | null>(null);
  const [kpiScores, setKpiScores] = useState<Record<string, number>>({});
  const [skillScores, setSkillScores] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [dataWarning, setDataWarning] = useState("");
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [employeeForm, setEmployeeForm] = useState({ name: "", email: "", roleId: roles[0].id, manager: "" });

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/dashboard?period=${encodeURIComponent(period)}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as { employees?: EmployeeRecord[]; evaluations?: EvaluationRecord[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "โหลดข้อมูลไม่สำเร็จ");
        setEmployees(body.employees ?? []);
        setEvaluations(body.evaluations ?? []);
        setDataWarning("");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setDataWarning("กำลังแสดงข้อมูลสำรอง ระบบจะบันทึกได้เมื่อฐานข้อมูลพร้อม");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [period]);

  useEffect(() => {
    if (!selectedEmployee && !skillProfileEmployee && !showAddEmployee) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedEmployee(null);
        setSkillProfileEmployee(null);
        setShowAddEmployee(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedEmployee, skillProfileEmployee, showAddEmployee]);

  const evaluationsByEmployee = useMemo(
    () => new Map(evaluations.filter((evaluation) => evaluation.period === period).map((evaluation) => [evaluation.employeeId, evaluation])),
    [evaluations, period],
  );

  const filteredEmployees = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("th");
    return employees.filter((employee) => {
      const role = getRole(employee.roleId);
      const departmentMatches = activeDepartment === "all" || role.departmentId === activeDepartment;
      const queryMatches = !query || `${employee.name} ${employee.email} ${role.name} ${role.department}`.toLocaleLowerCase("th").includes(query);
      return employee.status === "active" && departmentMatches && queryMatches;
    });
  }, [activeDepartment, employees, search]);

  const evaluatedEmployees = employees.filter((employee) => evaluationsByEmployee.has(employee.id));
  const averageScore = evaluatedEmployees.length
    ? evaluatedEmployees.reduce((sum, employee) => sum + (evaluationsByEmployee.get(employee.id)?.totalScore ?? 0), 0) / evaluatedEmployees.length
    : 0;
  const averageSkill = evaluatedEmployees.length
    ? evaluatedEmployees.reduce((sum, employee) => sum + (evaluationsByEmployee.get(employee.id)?.skillScore ?? 0), 0) / evaluatedEmployees.length
    : 0;
  const completion = employees.length ? evaluatedEmployees.length / employees.length * 100 : 0;
  const pendingEmployees = employees.filter((employee) => !evaluationsByEmployee.has(employee.id));

  const roleStats = useMemo(() => roles.map((role) => {
    const people = employees.filter((employee) => employee.roleId === role.id && employee.status === "active");
    const roleEvaluations = people.map((employee) => evaluationsByEmployee.get(employee.id)).filter((item): item is EvaluationRecord => Boolean(item));
    const score = roleEvaluations.length ? roleEvaluations.reduce((sum, item) => sum + item.totalScore, 0) / roleEvaluations.length : 0;
    const skill = roleEvaluations.length ? roleEvaluations.reduce((sum, item) => sum + item.skillScore, 0) / roleEvaluations.length : 0;
    return { role, people: people.length, evaluated: roleEvaluations.length, score, skill };
  }), [employees, evaluationsByEmployee]);

  const selectedRole = selectedEmployee ? getRole(selectedEmployee.roleId) : null;
  const skillProfileRole = skillProfileEmployee ? getRole(skillProfileEmployee.roleId) : null;
  const skillProfileEvaluation = skillProfileEmployee ? evaluationsByEmployee.get(skillProfileEmployee.id) ?? null : null;
  const kpiTotal = selectedRole
    ? selectedRole.kpis.reduce((sum, kpi) => sum + (kpiScores[kpi.id] ?? 0) * kpi.weight / 100, 0)
    : 0;
  const skillTotal = selectedRole
    ? selectedRole.skills.reduce((sum, skill) => sum + (skillScores[skill.id] ?? 1), 0) / selectedRole.skills.length / 5 * 100
    : 0;
  const grandTotal = kpiTotal * 0.7 + skillTotal * 0.3;

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  };

  const openEvaluation = (employee: EmployeeRecord) => {
    const role = getRole(employee.roleId);
    const existing = evaluationsByEmployee.get(employee.id) ?? fallbackEvaluation(employee);
    setSelectedEmployee(employee);
    setKpiScores(Object.fromEntries(role.kpis.map((kpi) => [kpi.id, existing?.kpiScores[kpi.id] ?? 80])));
    setSkillScores(Object.fromEntries(role.skills.map((skill) => [skill.id, existing?.skillScores[skill.id] ?? skill.targetLevel])));
    setNote(existing?.note ?? "");
  };

  const editSkillProfile = (employee: EmployeeRecord) => {
    setSkillProfileEmployee(null);
    openEvaluation(employee);
  };

  const saveEvaluation = async () => {
    if (!selectedEmployee) return;
    setIsSaving(true);
    try {
      const response = await fetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "saveEvaluation", employeeId: selectedEmployee.id, period, kpiScores, skillScores, note }),
      });
      const body = await response.json() as { evaluation?: EvaluationRecord; error?: string };
      if (!response.ok || !body.evaluation) throw new Error(body.error ?? "บันทึกผลประเมินไม่สำเร็จ");
      const saved = body.evaluation;
      setEvaluations((items) => [...items.filter((item) => !(item.employeeId === saved.employeeId && item.period === saved.period)), saved]);
      if (period === periods[0]) {
        setEmployees((items) => items.map((employee) => employee.id === saved.employeeId ? {
          ...employee,
          latestScore: saved.totalScore,
          latestSkillScore: saved.skillScore,
          latestPeriod: saved.period,
          updatedAt: saved.evaluatedAt,
        } : employee));
      }
      setSelectedEmployee(null);
      showToast(`บันทึกผลประเมิน ${selectedEmployee.name} แล้ว`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "บันทึกผลประเมินไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const addEmployee = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      const response = await fetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "createEmployee", ...employeeForm }),
      });
      const body = await response.json() as { employee?: EmployeeRecord; error?: string };
      if (!response.ok || !body.employee) throw new Error(body.error ?? "เพิ่มพนักงานไม่สำเร็จ");
      setEmployees((items) => [...items, body.employee as EmployeeRecord]);
      setShowAddEmployee(false);
      setEmployeeForm({ name: "", email: "", roleId: roles[0].id, manager: "" });
      showToast(`เพิ่ม ${body.employee.name} ในระบบแล้ว`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "เพิ่มพนักงานไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  };

  const exportReport = () => {
    const rows = employees.map((employee) => {
      const role = getRole(employee.roleId);
      const evaluation = evaluationsByEmployee.get(employee.id);
      return [
        employee.name,
        employee.email,
        role.department,
        role.name,
        period,
        evaluation?.kpiScore ?? null,
        evaluation?.skillScore ?? null,
        evaluation?.totalScore ?? null,
        scoreStatus(evaluation?.totalScore ?? null),
        role.skills.map((skill) => `${skill.name}: ${evaluation?.skillScores[skill.id] ?? "รอประเมิน"}/${skill.targetLevel}`).join("; "),
        evaluation?.note ?? "",
      ];
    });
    const content = [
      ["ชื่อพนักงาน", "อีเมล", "แผนก", "ตำแหน่ง", "รอบประเมิน", "คะแนน KPI", "คะแนนสกิล", "คะแนนรวม", "สถานะ", "รายละเอียดสกิล (ปัจจุบัน/เป้าหมาย)", "หมายเหตุ"],
      ...rows,
    ].map((row) => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `people-pulse-${period.replaceAll(" ", "-")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("ส่งออกรายงาน CSV แล้ว");
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setView("overview")} aria-label="ไปที่ภาพรวม">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span><strong>PEOPLE PULSE</strong><small>KPI &amp; SKILL SYSTEM</small></span>
        </button>
        <nav aria-label="เมนูหลัก">
          <button className={view === "overview" ? "active" : ""} onClick={() => setView("overview")}>ภาพรวม</button>
          <button className={view === "employees" ? "active" : ""} onClick={() => setView("employees")}>พนักงาน</button>
          <button className={view === "skills" ? "active" : ""} onClick={() => setView("skills")}>สกิลทีม</button>
        </nav>
        <div className="header-actions">
          <label className="period-select">
            <span className="sr-only">เลือกรอบประเมิน</span>
            <select value={period} onChange={(event) => { setIsLoading(true); setPeriod(event.target.value); }}>{periods.map((item) => <option key={item}>{item}</option>)}</select>
          </label>
          <button className="icon-button" onClick={() => pendingEmployees.length ? setView("employees") : showToast("ไม่มีรายการรอประเมิน")} aria-label={`${pendingEmployees.length} รายการรอประเมิน`}>
            <span aria-hidden="true">●</span>{pendingEmployees.length > 0 && <i />}
          </button>
          <button className="profile-button" onClick={() => showToast("ผู้ดูแลระบบ People Pulse")} aria-label="โปรไฟล์ผู้ใช้">วร</button>
        </div>
      </header>

      <section className="dashboard">
        {dataWarning && <div className="data-warning" role="status"><span>!</span>{dataWarning}</div>}
        <div className="page-heading">
          <div>
            <p className="eyebrow">{view === "overview" ? "ภาพรวมองค์กร" : view === "employees" ? "ทะเบียนและการประเมิน" : "COMPETENCY MATRIX"}</p>
            <h1>{view === "overview" ? "ภาพรวม KPI พนักงาน" : view === "employees" ? "พนักงานและผลประเมิน" : "ภาพรวมสกิลของทีม"}</h1>
            <p>{view === "overview" ? "ติดตามเป้าหมาย ประเมินผลงาน และวางแผนพัฒนาทีมในที่เดียว" : view === "employees" ? "ค้นหา เพิ่มพนักงาน และบันทึกผล KPI พร้อมระดับสกิลรายบุคคล" : "มองเห็นจุดแข็ง ช่องว่าง และความพร้อมของแต่ละสายงาน"}</p>
          </div>
          <div className="heading-actions">
            <button className="secondary-button" onClick={exportReport}><span aria-hidden="true">↓</span> ส่งออกรายงาน</button>
            <button className="primary-button" onClick={() => pendingEmployees[0] ? openEvaluation(pendingEmployees[0]) : setView("employees")}><span aria-hidden="true">＋</span> เริ่มประเมิน</button>
          </div>
        </div>

        <div className="filter-row" aria-label="กรองตามแผนก">
          {departmentFilters.map((filter) => (
            <button key={filter.id} className={activeDepartment === filter.id ? "active" : ""} onClick={() => setActiveDepartment(filter.id)}>{filter.label}</button>
          ))}
        </div>

        {view === "overview" && (
          <>
            <div className="summary-grid">
              <article className="hero-score">
                <div className="score-ring" style={{ "--score": `${averageScore}%` } as React.CSSProperties}>
                  <div><strong>{averageScore ? averageScore.toFixed(1) : "—"}</strong><span>คะแนนรวมเฉลี่ย</span></div>
                </div>
                <div className="hero-copy">
                  <span>{period}</span>
                  <h2>{averageScore >= 85 ? "ทีมทำผลงานโดดเด่น\nพร้อมรับเป้าหมายถัดไป" : "เห็นทั้งผลงานและสกิล\nเพื่อพัฒนาทีมอย่างตรงจุด"}</h2>
                  <p>สูตรคะแนนรวม <strong>KPI 70%</strong> และ <strong>สกิล 30%</strong></p>
                  <div className="trend-bars" aria-label="แนวโน้มคะแนนเติบโต">
                    {[46, 53, 49, 61, 58, 67, 72, 76, 82, Math.max(30, averageScore)].map((height, index) => <i key={index} className={index > 6 ? "highlight" : ""} style={{ height: `${height}%` }} />)}
                  </div>
                </div>
              </article>
              <MetricCard label="ประเมินแล้ว" value={`${completion.toFixed(0)}%`} copy={`${evaluatedEmployees.length} จาก ${employees.length} คน`} tone="positive" progress={completion} icon="✓" />
              <MetricCard label="พนักงานทั้งหมด" value={`${employees.length} คน`} copy={`${roles.length} กลุ่มตำแหน่ง`} icon="••" />
              <MetricCard label="รอประเมิน" value={`${pendingEmployees.length} คน`} copy={pendingEmployees.length ? "ควรดำเนินการในรอบนี้" : "ครบถ้วนแล้ว"} tone={pendingEmployees.length ? "warning" : "positive"} icon="◷" />
              <MetricCard label="คะแนนสกิลเฉลี่ย" value={averageSkill ? averageSkill.toFixed(1) : "—"} copy="เทียบจากระดับ 1–5" tone="positive" icon="↗" />
            </div>

            <div className="content-grid">
              <section className="role-card">
                <div className="section-heading">
                  <div><p className="eyebrow">{roles.length} กลุ่มตำแหน่ง</p><h2>ผลงานตามสายงาน</h2></div>
                  <button onClick={() => setView("skills")}>ดู Skill Matrix <span>→</span></button>
                </div>
                <div className="role-table" role="table" aria-label="ผลงานตามสายงาน">
                  <div className="role-header" role="row"><span>ตำแหน่ง</span><span>พนักงาน</span><span>คะแนนรวม</span><span>ประเมินแล้ว</span><span /></div>
                  {roleStats.filter(({ role }) => activeDepartment === "all" || role.departmentId === activeDepartment).map(({ role, people, evaluated, score }) => (
                    <button className="role-row" role="row" key={role.id} onClick={() => { setActiveDepartment(role.departmentId); setView("employees"); }}>
                      <span className="role-name"><i className={`status-dot ${score > 0 && score < 75 ? "alert" : ""}`} /><span><strong>{role.name}</strong><small>{role.department}</small></span></span>
                      <span>{people} คน</span>
                      <span className="role-score"><strong>{score ? score.toFixed(1) : "—"}</strong><small className="up">+{role.trend}</small></span>
                      <span className="progress-cell"><i><b style={{ width: `${people ? evaluated / people * 100 : 0}%` }} /></i><em>{evaluated}/{people}</em></span>
                      <span className="row-arrow" aria-hidden="true">›</span>
                    </button>
                  ))}
                </div>
              </section>

              <aside className="spotlight-card">
                <div className="section-heading compact"><div><p className="eyebrow">ACTION LIST</p><h2>รอประเมิน</h2></div><button className="round-button" onClick={() => setView("employees")} aria-label="ดูทั้งหมด">→</button></div>
                <div className="employee-list">
                  {pendingEmployees.slice(0, 4).map((employee) => <EmployeeCompact key={employee.id} employee={employee} onClick={() => openEvaluation(employee)} />)}
                  {!pendingEmployees.length && <div className="success-state"><span>✓</span><strong>ประเมินครบแล้ว</strong><p>ไม่มีรายการค้างในรอบนี้</p></div>}
                </div>
                <div className="insight-box"><span className="insight-mark">↗</span><div><strong>โอกาสพัฒนาทีม</strong><p>{roleStats.filter((item) => item.skill > 0 && item.skill < 80).length || 1} สายงานมีช่องว่างสกิลที่ควรวางแผนพัฒนา</p></div></div>
              </aside>
            </div>
          </>
        )}

        {view === "employees" && (
          <section className="directory-card">
            <div className="directory-toolbar">
              <label className="search-field"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาชื่อ อีเมล หรือตำแหน่ง" /><span className="sr-only">ค้นหาพนักงาน</span></label>
              <p>{isLoading ? "กำลังอัปเดต..." : `พบ ${filteredEmployees.length} คน`}</p>
              <button className="primary-button" onClick={() => setShowAddEmployee(true)}>＋ เพิ่มพนักงาน</button>
            </div>
            <div className="employee-table" role="table" aria-label="รายชื่อพนักงาน">
              <div className="employee-table-head" role="row"><span>พนักงาน</span><span>ตำแหน่ง / ผู้จัดการ</span><span>KPI</span><span>สกิล</span><span>สถานะ</span><span /></div>
              {filteredEmployees.map((employee) => {
                const role = getRole(employee.roleId);
                const evaluation = evaluationsByEmployee.get(employee.id);
                const status = scoreStatus(evaluation?.totalScore ?? null);
                return (
                  <div className="employee-table-row" role="row" key={employee.id}>
                    <span className="employee-identity"><i>{employee.initials || makeInitials(employee.name)}</i><span><strong>{employee.name}</strong><small>{employee.email}</small></span></span>
                    <span><strong>{role.name}</strong><small>{role.department} · ผู้จัดการ {employee.manager || "—"}</small></span>
                    <ScoreCell value={evaluation?.kpiScore ?? null} />
                    <ScoreCell value={evaluation?.skillScore ?? null} />
                    <span><b className={`status-pill ${status === "ควรติดตาม" ? "alert" : status === "รอประเมิน" ? "pending" : ""}`}>{status}</b><small>{evaluation ? `อัปเดต ${formatUpdatedAt(evaluation.evaluatedAt)}` : "ยังไม่มีผลรอบนี้"}</small></span>
                    <span className="table-actions">
                      <button className="skill-profile-button" onClick={() => setSkillProfileEmployee(employee)}>ดูสกิล</button>
                      <button className="evaluate-button" onClick={() => openEvaluation(employee)}>{evaluation ? "แก้ไขผล" : "ประเมิน"}</button>
                    </span>
                  </div>
                );
              })}
              {!filteredEmployees.length && <div className="empty-state">ไม่พบพนักงานตามเงื่อนไขที่เลือก</div>}
            </div>
          </section>
        )}

        {view === "skills" && (
          <section className="skills-layout">
            <div className="skill-summary-card">
              <p className="eyebrow">ภาพรวมทั้งองค์กร</p>
              <div className="skill-summary-score"><strong>{averageSkill ? averageSkill.toFixed(1) : "—"}</strong><span>คะแนนสกิลเฉลี่ย<br />จากเต็ม 100</span></div>
              <div className="skill-legend"><span><i className="ready" />พร้อมใช้งาน ≥ 80</span><span><i className="develop" />ควรพัฒนา &lt; 80</span></div>
            </div>
            <div className="skill-matrix-card">
              <div className="section-heading"><div><p className="eyebrow">แยกตามสายงาน</p><h2>Skill Readiness</h2></div><span className="matrix-period">{period}</span></div>
              <div className="skill-matrix">
                {roleStats.filter(({ role }) => activeDepartment === "all" || role.departmentId === activeDepartment).map(({ role, people, skill }) => (
                  <button key={role.id} className="skill-role" onClick={() => { setActiveDepartment(role.departmentId); setView("employees"); }}>
                    <span className="skill-role-title"><i>{role.shortName.slice(0, 2)}</i><span><strong>{role.name}</strong><small>{people} คน · {role.skills.length} สกิลหลัก</small></span></span>
                    <span className="skill-bar"><i><b className={skill > 0 && skill < 80 ? "develop" : ""} style={{ width: `${skill}%` }} /></i><em>{skill ? skill.toFixed(0) : "—"}</em></span>
                    <span className={`skill-readiness ${skill > 0 && skill < 80 ? "develop" : ""}`}>{skill >= 80 ? "พร้อมใช้งาน" : skill > 0 ? "ควรพัฒนา" : "รอข้อมูล"}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="development-card">
              <div><p className="eyebrow">แผนพัฒนาแนะนำ</p><h2>ช่องว่างที่ควรเร่งเติม</h2></div>
              <div className="development-list">
                {roleStats.filter((item) => item.skill > 0).sort((a, b) => a.skill - b.skill).slice(0, 3).map(({ role, skill }, index) => (
                  <article key={role.id}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{role.skills[index % role.skills.length].name}</strong><p>{role.department} · ความพร้อมเฉลี่ย {skill.toFixed(0)}%</p></div><button onClick={() => { setActiveDepartment(role.departmentId); setView("employees"); }}>ดูทีม →</button></article>
                ))}
              </div>
            </div>
            <div className="individual-skills-card">
              <div className="individual-skills-heading">
                <div><p className="eyebrow">INDIVIDUAL SKILL PROFILE</p><h2>สกิลรายบุคคล</h2><p>เปรียบเทียบระดับปัจจุบันกับเป้าหมายของตำแหน่ง เพื่อวางแผนพัฒนาได้ตรงจุด</p></div>
                <label className="search-field"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาพนักงานหรือตำแหน่ง" /><span className="sr-only">ค้นหาโปรไฟล์สกิล</span></label>
              </div>
              <div className="individual-skill-grid">
                {filteredEmployees.map((employee) => {
                  const role = getRole(employee.roleId);
                  const evaluation = evaluationsByEmployee.get(employee.id);
                  const readiness = role.skills.filter((skill) => (evaluation?.skillScores[skill.id] ?? 0) >= skill.targetLevel).length;
                  const biggestGap = role.skills
                    .map((skill) => ({ skill, gap: skill.targetLevel - (evaluation?.skillScores[skill.id] ?? 0) }))
                    .sort((a, b) => b.gap - a.gap)[0];
                  return (
                    <article className="individual-skill-card" key={employee.id}>
                      <div className="person-skill-head">
                        <span className="employee-avatar">{employee.initials || makeInitials(employee.name)}</span>
                        <span><strong>{employee.name}</strong><small>{role.name}</small></span>
                        <b className={evaluation && evaluation.skillScore < 80 ? "develop" : ""}>{evaluation ? evaluation.skillScore.toFixed(0) : "—"}<small>/100</small></b>
                      </div>
                      <div className="person-skill-list">
                        {role.skills.map((skill) => {
                          const level = evaluation?.skillScores[skill.id] ?? null;
                          return (
                            <div key={skill.id}>
                              <span><strong>{skill.name}</strong><small>{level === null ? "รอประเมิน" : `ระดับ ${level} · ${skillLevelLabel(level)}`}</small></span>
                              <span className="mini-levels" aria-label={`${skill.name} ${level === null ? "ยังไม่ประเมิน" : `ระดับ ${level} จาก 5`}`}>
                                {[1, 2, 3, 4, 5].map((item) => <i key={item} className={`${level !== null && item <= level ? "filled" : ""} ${item === skill.targetLevel ? "target" : ""}`} />)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="person-skill-foot">
                        <span className={readiness === role.skills.length ? "ready" : "develop"}>{evaluation ? `ถึงเป้าหมาย ${readiness}/${role.skills.length} สกิล` : "ยังไม่มีผลประเมิน"}</span>
                        <small>{evaluation && biggestGap?.gap > 0 ? `เน้นพัฒนา: ${biggestGap.skill.name}` : evaluation ? "สกิลพร้อมตามบทบาท" : "เริ่มประเมินเพื่อสร้างโปรไฟล์"}</small>
                        <button onClick={() => setSkillProfileEmployee(employee)}>ดูรายละเอียด →</button>
                      </div>
                    </article>
                  );
                })}
                {!filteredEmployees.length && <div className="empty-state">ไม่พบโปรไฟล์สกิลตามเงื่อนไขที่เลือก</div>}
              </div>
            </div>
          </section>
        )}
      </section>

      <footer><span>PEOPLE PULSE</span><p>ระบบ KPI &amp; Skill Management · อัปเดตข้อมูลตามรอบประเมิน</p></footer>

      {skillProfileEmployee && skillProfileRole && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSkillProfileEmployee(null)}>
          <section className="skill-profile-modal" role="dialog" aria-modal="true" aria-labelledby="skill-profile-title">
            <div className="skill-profile-hero">
              <div className="profile-identity">
                <span>{skillProfileEmployee.initials || makeInitials(skillProfileEmployee.name)}</span>
                <div><p className="eyebrow">INDIVIDUAL SKILL PROFILE</p><h2 id="skill-profile-title">{skillProfileEmployee.name}</h2><small>{skillProfileRole.name} · {skillProfileRole.department}</small></div>
              </div>
              <button className="modal-close dark" onClick={() => setSkillProfileEmployee(null)} aria-label="ปิดหน้าต่าง">×</button>
              <div className="profile-score-block">
                <div><small>ความพร้อมด้านสกิล</small><strong>{skillProfileEvaluation ? skillProfileEvaluation.skillScore.toFixed(0) : "—"}</strong><span>/ 100</span></div>
                <div className="profile-score-copy"><b>{skillProfileEvaluation ? scoreStatus(skillProfileEvaluation.skillScore) : "รอประเมิน"}</b><p>{period}<br />เป้าหมายตามตำแหน่ง {skillProfileRole.skills.length} สกิล</p></div>
              </div>
            </div>
            <div className="skill-profile-body">
              <div className="profile-section-heading"><div><p className="eyebrow">COMPETENCY DETAIL</p><h3>ระดับปัจจุบันเทียบเป้าหมาย</h3></div><span><i />ระดับปัจจุบัน <i className="target" />เป้าหมาย</span></div>
              <div className="profile-skill-list">
                {skillProfileRole.skills.map((skill) => {
                  const level = skillProfileEvaluation?.skillScores[skill.id] ?? null;
                  const gap = level === null ? null : skill.targetLevel - level;
                  return (
                    <article key={skill.id}>
                      <div className="profile-skill-name"><strong>{skill.name}</strong><small>{level === null ? "ยังไม่มีระดับในรอบนี้" : `${skillLevelLabel(level)} · ระดับ ${level} จาก 5`}</small></div>
                      <div className="profile-level-track" aria-label={`${skill.name}: ${level === null ? "รอประเมิน" : `ระดับ ${level}`} เป้าหมายระดับ ${skill.targetLevel}`}>
                        {[1, 2, 3, 4, 5].map((item) => <span key={item} className={`${level !== null && item <= level ? "filled" : ""} ${item === skill.targetLevel ? "target" : ""}`}><i />{item}</span>)}
                      </div>
                      <div className={`gap-pill ${gap !== null && gap <= 0 ? "ready" : ""}`}>{gap === null ? "รอประเมิน" : gap > 0 ? `ขาด ${gap} ระดับ` : gap === 0 ? "ตรงเป้าหมาย" : `เกิน ${Math.abs(gap)} ระดับ`}</div>
                    </article>
                  );
                })}
              </div>
              <div className="profile-insights">
                <article>
                  <span className="insight-icon strength">✓</span>
                  <div><strong>จุดแข็ง</strong><p>{skillProfileEvaluation ? (() => {
                    const strengths = skillProfileRole.skills.filter((skill) => (skillProfileEvaluation.skillScores[skill.id] ?? 0) >= skill.targetLevel);
                    return strengths.length ? strengths.map((skill) => skill.name).join(" · ") : "ยังไม่มีสกิลที่ถึงระดับเป้าหมาย";
                  })() : "ประเมินสกิลเพื่อค้นหาจุดแข็งของบุคคลนี้"}</p></div>
                </article>
                <article>
                  <span className="insight-icon focus">↗</span>
                  <div><strong>จุดเน้นพัฒนา</strong><p>{skillProfileEvaluation ? (() => {
                    const gaps = skillProfileRole.skills
                      .map((skill) => ({ skill, gap: skill.targetLevel - (skillProfileEvaluation.skillScores[skill.id] ?? 0) }))
                      .filter((item) => item.gap > 0)
                      .sort((a, b) => b.gap - a.gap);
                    return gaps.length ? gaps.slice(0, 2).map((item) => `${item.skill.name} (+${item.gap})`).join(" · ") : "พร้อมตามเป้าหมายของตำแหน่ง";
                  })() : "กำหนดระดับปัจจุบันเพื่อสร้างแผนพัฒนารายบุคคล"}</p></div>
                </article>
              </div>
              {skillProfileEvaluation?.note && <div className="profile-note"><span>บันทึกและแผนพัฒนา</span><p>{skillProfileEvaluation.note}</p></div>}
            </div>
            <div className="modal-actions profile-actions"><button className="secondary-button" onClick={() => setSkillProfileEmployee(null)}>ปิด</button><button className="primary-button" onClick={() => editSkillProfile(skillProfileEmployee)}>{skillProfileEvaluation ? "แก้ไขระดับสกิล" : "เริ่มประเมินสกิล"}</button></div>
          </section>
        </div>
      )}

      {selectedEmployee && selectedRole && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSelectedEmployee(null)}>
          <section className="evaluation-modal" role="dialog" aria-modal="true" aria-labelledby="evaluation-title">
            <div className="modal-header">
              <div className="modal-person"><span>{selectedEmployee.initials}</span><div><p className="eyebrow">แบบประเมินรายบุคคล</p><h2 id="evaluation-title">{selectedEmployee.name}</h2><small>{selectedRole.name} · {period}</small></div></div>
              <button className="modal-close" onClick={() => setSelectedEmployee(null)} aria-label="ปิดหน้าต่าง">×</button>
            </div>
            <div className="modal-score-summary">
              <div><small>คะแนนรวม</small><strong>{grandTotal.toFixed(1)}</strong><span className={grandTotal < 75 ? "low" : ""}>{scoreStatus(grandTotal)}</span></div>
              <div className="score-formula"><span>KPI 70% <b>{kpiTotal.toFixed(1)}</b></span><span>สกิล 30% <b>{skillTotal.toFixed(1)}</b></span></div>
              <div className="modal-progress"><i style={{ width: `${grandTotal}%` }} /></div>
            </div>
            <div className="evaluation-columns">
              <div className="evaluation-section">
                <div className="evaluation-section-title"><span>01</span><div><strong>ผลงานตาม KPI</strong><small>ให้คะแนนจากผลลัพธ์จริง 0–100</small></div></div>
                <div className="kpi-editor">
                  {selectedRole.kpis.map((kpi) => (
                    <label key={kpi.id}>
                      <span className="kpi-label"><span><strong>{kpi.name}</strong><small>น้ำหนัก {kpi.weight}% · เป้าหมาย {kpi.target}</small></span><b>{kpiScores[kpi.id]}</b></span>
                      <input type="range" min="0" max="100" value={kpiScores[kpi.id] ?? 0} onChange={(event) => setKpiScores((scores) => ({ ...scores, [kpi.id]: Number(event.target.value) }))} style={{ "--range-value": `${kpiScores[kpi.id] ?? 0}%` } as React.CSSProperties} />
                    </label>
                  ))}
                </div>
              </div>
              <div className="evaluation-section">
                <div className="evaluation-section-title"><span>02</span><div><strong>ระดับสกิล</strong><small>เลือกระดับความสามารถ 1–5</small></div></div>
                <div className="skill-editor">
                  {selectedRole.skills.map((skill) => (
                    <fieldset key={skill.id}><legend><strong>{skill.name}</strong><small>เป้าหมาย {skill.target}</small></legend><div className="level-picker">
                      {[1, 2, 3, 4, 5].map((level) => <button type="button" key={level} className={(skillScores[skill.id] ?? 1) === level ? "active" : ""} onClick={() => setSkillScores((scores) => ({ ...scores, [skill.id]: level }))} aria-label={`${skill.name} ระดับ ${level}`}>{level}</button>)}
                    </div></fieldset>
                  ))}
                </div>
              </div>
            </div>
            <label className="note-field"><span>บันทึกและแผนพัฒนา</span><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="ระบุผลงานเด่น จุดที่ควรพัฒนา และสิ่งที่องค์กรจะสนับสนุน..." /></label>
            <div className="modal-actions"><button className="secondary-button" onClick={() => setSelectedEmployee(null)}>ยกเลิก</button><button className="primary-button" disabled={isSaving} onClick={saveEvaluation}>{isSaving ? "กำลังบันทึก..." : "บันทึกผลประเมิน"}</button></div>
          </section>
        </div>
      )}

      {showAddEmployee && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowAddEmployee(false)}>
          <form className="employee-modal" onSubmit={addEmployee} role="dialog" aria-modal="true" aria-labelledby="add-employee-title">
            <div className="modal-header"><div><p className="eyebrow">ทะเบียนพนักงาน</p><h2 id="add-employee-title">เพิ่มพนักงานใหม่</h2><small>ข้อมูลนี้จะพร้อมสำหรับการประเมินในทุกรอบ</small></div><button type="button" className="modal-close" onClick={() => setShowAddEmployee(false)} aria-label="ปิดหน้าต่าง">×</button></div>
            <div className="form-grid">
              <label className="wide"><span>ชื่อ–นามสกุล</span><input required value={employeeForm.name} onChange={(event) => setEmployeeForm((form) => ({ ...form, name: event.target.value }))} placeholder="เช่น อริสา ตั้งใจ" /></label>
              <label className="wide"><span>อีเมล</span><input required type="email" value={employeeForm.email} onChange={(event) => setEmployeeForm((form) => ({ ...form, email: event.target.value }))} placeholder="name@company.com" /></label>
              <label><span>ตำแหน่ง</span><select value={employeeForm.roleId} onChange={(event) => setEmployeeForm((form) => ({ ...form, roleId: event.target.value }))}>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
              <label><span>ผู้จัดการ</span><input value={employeeForm.manager} onChange={(event) => setEmployeeForm((form) => ({ ...form, manager: event.target.value }))} placeholder="ชื่อผู้จัดการ" /></label>
            </div>
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowAddEmployee(false)}>ยกเลิก</button><button className="primary-button" disabled={isSaving}>{isSaving ? "กำลังเพิ่ม..." : "เพิ่มพนักงาน"}</button></div>
          </form>
        </div>
      )}

      <div className={`toast ${toast ? "show" : ""}`} role="status"><span>✓</span>{toast}</div>
    </main>
  );
}

function MetricCard({ label, value, copy, icon, tone = "", progress }: { label: string; value: string; copy: string; icon: string; tone?: string; progress?: number }) {
  return <article className="metric-card"><div className="metric-top"><span>{label}</span><i className="metric-icon">{icon}</i></div><strong>{value}</strong><p className={tone}>{copy}</p>{progress !== undefined && <div className="mini-progress"><i style={{ width: `${progress}%` }} /></div>}</article>;
}

function EmployeeCompact({ employee, onClick }: { employee: EmployeeRecord; onClick: () => void }) {
  const role = getRole(employee.roleId);
  return <button className="employee-row" onClick={onClick}><span className="employee-avatar">{employee.initials}</span><span className="employee-copy"><strong>{employee.name}</strong><small>{role.name}</small><em>ยังไม่มีผลรอบนี้</em></span><span className="row-arrow" aria-hidden="true">›</span></button>;
}

function ScoreCell({ value }: { value: number | null }) {
  return <span className="table-score"><strong>{value === null ? "—" : value.toFixed(1)}</strong><i><b style={{ width: `${value ?? 0}%` }} /></i></span>;
}
