import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const owner = { id: "user-owner", role: "admin", status: "active", displayName: "เจ้าของ" };
const hr = { id: "hr", role: "admin", status: "active", displayName: "HR" };
function harness(count = 1) {
  const db = new DatabaseSync(":memory:"); db.exec("PRAGMA foreign_keys=ON");
  db.exec("CREATE TABLE employees(id TEXT PRIMARY KEY,name TEXT,email TEXT,position_title TEXT,status TEXT); CREATE TABLE user_accounts(id TEXT PRIMARY KEY,role TEXT,status TEXT); CREATE TABLE hr_profiles(employee_id TEXT PRIMARY KEY,current_salary REAL); CREATE TABLE employee_profiles(employee_id TEXT PRIMARY KEY,start_date TEXT); CREATE TABLE attendance_records(employee_id TEXT,work_date TEXT,status TEXT,minutes_late INTEGER,clock_in TEXT,updated_at TEXT); CREATE TABLE skill_achievements(id TEXT PRIMARY KEY,employee_id TEXT,skill_name TEXT,monthly_allowance INTEGER,verified_at TEXT); CREATE TABLE quest_completions(id TEXT PRIMARY KEY,employee_id TEXT,quest_title_snapshot TEXT,completed_at TEXT)");
  db.exec("INSERT INTO user_accounts VALUES ('user-owner','admin','active'),('hr','admin','active'),('manager','manager','active')");
  for (let i = 1; i <= count; i++) db.prepare("INSERT INTO employees VALUES (?,?,?,?,?)").run(`e${i}`, `พนักงาน ${i}`, `employee${i}@example.com`, "Sales", "active");
  db.exec(readFileSync(path.join(root, "drizzle/0025_mighty_iron_lad.sql"), "utf8"));
  let calls = 0;
  const d1 = {
    prepare(sql) { calls++; let args = []; const statement = {
      bind(...values) { args = values; return statement; },
      async first() { return db.prepare(sql).get(...args) ?? null; },
      async all() { return { results: db.prepare(sql).all(...args) }; },
      async run() { try { const result = db.prepare(sql).run(...args); return { meta: { changes: Number(result.changes) } }; } catch (error) { throw new Error(`${sql.slice(0, 90)}: ${error.message}`); } },
    }; return statement; },
    async batch(statements) { db.exec("BEGIN"); try { const results = []; for (const statement of statements) results.push(await statement.run()); db.exec("COMMIT"); return results; } catch (error) { db.exec("ROLLBACK"); throw error; } },
  };
  const cache = new Map();
  const load = relative => {
    const file = path.resolve(root, relative);
    if (cache.has(file)) return cache.get(file);
    const exports = {}; cache.set(file, exports);
    const output = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const require = specifier => {
      const absolute = path.resolve(path.dirname(file), specifier);
      if (absolute === path.join(root, "db") || absolute === path.join(root, "db/index")) return { getD1: () => d1 };
      if (absolute === path.join(root, "lib/system-settings")) return { canManageSystemSettings: u => u.id === "user-owner" && u.role === "admin" && u.status === "active", getSystemSettingsRow: async () => ({ organizationName: "บริษัททดสอบ" }) };
      if (absolute === path.join(root, "lib/access-control")) return { privateNoStoreHeaders: { "cache-control": "private, no-store" }, authenticatedRequestGate: async () => ({ currentUser: harness.user || owner }) };
      return load(path.relative(root, absolute) + ".ts");
    };
    new Function("require", "exports", output)(require, exports);
    return exports;
  };
  const engine = load("lib/payroll-calculation.ts"), service = load("lib/payroll-service.ts"), guards = load("db/payroll-guards.ts"), attendance = load("lib/payroll-attendance.ts");
  const draft = (entries = [engine.emptyPayrollInput("e1", "employee1@example.com", "20000")]) => ({ label: "เงินเดือนทดสอบ", period: "2026-09", startDate: "2026-09-01", endDate: "2026-09-30", payDate: "2026-09-30", policyNote: "ตรวจยอดตามข้อตกลงแล้ว", entries });
  return { db, d1, engine, service, guards, attendance, load, draft, calls: () => calls };
}

test("money parsing, half-up commission and exact monthly installments", () => {
  const { engine: e } = harness();
  assert.equal(e.decimal("12345.67"), 1234567);
  for (const bad of ["1.001", "NaN", "Infinity", "-1", " 1", "1e3", 12, "1000000000"]) assert.throws(() => e.decimal(bad));
  assert.equal(e.roundRatio(19999, 250, 10000), 500);
  const p = e.emptyPayrollInput("e1", "a@example.com", "10000.01");
  p.installments = "3";
  const amounts = [1,2,3].map(i => e.calculate({ ...p, installment: String(i) }).base);
  assert.deepEqual(amounts, [333333,333333,333335]); assert.equal(amounts.reduce((a,b) => a+b), 1000001);
  assert.equal(e.calculate({ ...p, wageType: "daily", rate: "500", units: "22", otHours: "1.5", otRate: "150" }).net, 1122500);
  assert.throws(() => e.calculate({ ...p, tax: "20000" }), /ยอดหักเกิน/);
});

test("attendance bonus requires complete previous month, actual rest days, full tenure and no leave/late", () => {
  const { attendance: a } = harness();
  const rests = "2026-08-02,2026-08-09,2026-08-16,2026-08-23";
  const rows = Array.from({ length: 31 }, (_, i) => ({ work_date: `2026-08-${String(i+1).padStart(2,"0")}`, status: "present", minutes_late: 0, clock_in: "09:00", updated_at: "v1" }));
  assert.equal(a.attendanceEntitlement("2026-09", rests, "2025-01-01", rows, "2026-09-01").amount, 30000);
  assert.equal(a.attendanceEntitlement("2026-09", rests, "2025-01-01", [], "2026-09-01").status, "incomplete");
  assert.equal(a.attendanceEntitlement("2026-09", rests, null, rows, "2026-09-01").status, "incomplete");
  for (const invalidDate of ["2026-00-00", "0000-00-00", "2026-02-30"]) assert.equal(a.attendanceEntitlement("2026-09", rests, invalidDate, rows, "2026-09-01").amount, 0);
  assert.equal(a.attendanceEntitlement("2026-09", rests, "2025-01-01", [{ ...rows[0], clock_in: "garbage" }, ...rows.slice(1)], "2026-09-01").amount, 0);
  for (const status of ["late", "leave", "absent"]) assert.equal(a.attendanceEntitlement("2026-09", rests, "2025-01-01", [{ ...rows[0], status }, ...rows.slice(1)], "2026-09-01").amount, 0);
  assert.equal(a.attendanceEntitlement("2026-09", rests, "2025-01-01", rows, "2026-08-31").amount, 0);
  assert.equal(a.previousMonth("2026-01"), "2025-12");
});

test("actual payroll service: owner approval, immutable slip, revision CAS, duplicate installment rollback", async () => {
  const h = harness(), { service: s, db } = h; await s.readyPayroll();
  const { id } = await s.mutatePayroll(hr, { action: "create", ...h.draft() });
  await assert.rejects(s.mutatePayroll(hr, { action: "approve", id, expectedRevision: 0, confirmed: true }), /เจ้าของ/);
  await s.mutatePayroll(owner, { action: "save", id, expectedRevision: 0, ...h.draft() });
  await assert.rejects(s.mutatePayroll(owner, { action: "save", id, expectedRevision: 0, ...h.draft() }), /อีกหน้าจอ/);
  await s.mutatePayroll(owner, { action: "approve", id, expectedRevision: 1, confirmed: true });
  assert.equal(db.prepare("SELECT status FROM payroll_runs WHERE id=?").get(id).status, "approved");
  const slip = db.prepare("SELECT * FROM payroll_slips WHERE run_id=?").get(id);
  assert.equal(slip.net, 2000000); assert.equal(JSON.parse(slip.snapshot).policyNote, undefined);
  assert.throws(() => db.prepare("UPDATE payroll_slips SET net=1 WHERE id=?").run(slip.id), /PAYROLL_IMMUTABLE/);
  assert.throws(() => db.prepare("DELETE FROM employees WHERE id='e1'").run(), /FOREIGN KEY/);
  assert.throws(() => db.prepare("DELETE FROM payroll_events WHERE run_id=?").run(id), /PAYROLL_IMMUTABLE/);
  const second = await s.mutatePayroll(owner, { action: "create", ...h.draft() });
  await assert.rejects(s.mutatePayroll(owner, { action: "approve", id: second.id, expectedRevision: 0, confirmed: true, overlapConfirmed: true }), /payroll_pay_claims/);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM payroll_slips WHERE run_id=?").get(second.id).c, 0);
  assert.equal(db.prepare("SELECT status FROM payroll_runs WHERE id=?").get(second.id).status, "draft");
  assert.equal(db.prepare("SELECT COUNT(*) c FROM payroll_events WHERE run_id=?").get(second.id).c, 1);
  await s.mutatePayroll(owner, { action: "paid", id, expectedRevision: 2, reason: "2026-09-30 TRANSFER-001" });
  assert.equal(db.prepare("SELECT status FROM payroll_runs WHERE id=?").get(id).status, "paid");
});

test("transactional overlap claim blocks a stale pre-read across distinct runs", async () => {
  const h = harness(); await h.service.readyPayroll();
  const first = await h.service.mutatePayroll(owner, { action: "create", ...h.draft() });
  const second = await h.service.mutatePayroll(owner, { action: "create", ...h.draft() });
  await h.service.mutatePayroll(owner, { action: "approve", id: first.id, expectedRevision: 0, confirmed: true });
  const document = h.db.prepare("SELECT document FROM payroll_runs WHERE id=?").get(second.id).document;
  assert.throws(() => h.db.prepare("INSERT INTO payroll_events VALUES (?,?,1,'approve','user-owner','owner',?,'','now')").run("stale-claim", second.id, document), /PAYROLL_OVERLAP/);
});

test("skill award expires, is not a salary raise, and cannot be paid twice in multiple installments", async () => {
  const h = harness(); await h.service.readyPayroll();
  h.db.exec("INSERT INTO skill_achievements VALUES ('skill-new','e1','สกิลใหม่',0,'2026-09-01')");
  const benefits = h.load("lib/payroll-benefits.ts");
  await benefits.createAward({ employeeId: "e1", kind: "skill", sourceId: "skill-new", amount: "500", startMonth: "2026-09", endMonth: "2026-11" }, owner.id);
  const p = { ...h.engine.emptyPayrollInput("e1", "employee1@example.com", "20000"), installments: "2", includeMonthlyExtras: true };
  const id = (await h.service.mutatePayroll(owner, { action: "create", ...h.draft([p]) })).id;
  assert.equal(JSON.parse((await h.service.getRun(id)).document).entries[0].skillBonus, "500.00");
  await h.service.mutatePayroll(owner, { action: "approve", id, expectedRevision: 0, confirmed: true });
  const second = (await h.service.mutatePayroll(owner, { action: "create", ...h.draft([{ ...p, installment: "2" }]) })).id;
  assert.equal(JSON.parse((await h.service.getRun(second)).document).entries[0].skillBonus, "0.00");
  await h.service.mutatePayroll(owner, { action: "approve", id: second, expectedRevision: 0, confirmed: true, overlapConfirmed: true });
  assert.equal((await benefits.applyMonthlyBenefits({ ...p }, "2026-12")).skillBonus, "0.00");
  assert.equal(h.db.prepare("SELECT COUNT(*) c FROM payroll_pay_claims WHERE kind='skill'").get().c, 1);
});

test("manager denied; employee cannot inspect other employee slip; private printable HTML", async () => {
  const h = harness(2); await h.service.readyPayroll();
  const { id } = await h.service.mutatePayroll(owner, { action: "create", ...h.draft() });
  await h.service.mutatePayroll(owner, { action: "approve", id, expectedRevision: 0, confirmed: true });
  const slip = h.db.prepare("SELECT id FROM payroll_slips").get();
  const api = h.load("app/api/payroll/route.ts");
  harness.user = { ...hr, id: "manager", role: "manager", employeeId: "e1" };
  assert.equal((await api.GET(new Request("https://test.local/api/payroll"))).status, 403);
  harness.user = { ...hr, id: "employee2", role: "employee", employeeId: "e2" };
  assert.equal((await api.GET(new Request(`https://test.local/api/payroll?slip=${slip.id}`))).status, 404);
  assert.equal((await api.GET(new Request("https://test.local/api/payroll?run=" + id))).status, 403);
  harness.user = { ...hr, id: "employee1", role: "employee", employeeId: "e1" };
  const print = await api.GET(new Request(`https://test.local/api/payroll?slip=${slip.id}&print=1`));
  assert.equal(print.status, 200); assert.match(print.headers.get("cache-control"), /no-store/); assert.match(await print.text(), /20,000.00/);
  harness.user = null;
});

test("missing Gmail settings never sends or pretends delivery; MIME excludes salary and escapes names", async () => {
  const h = harness(), mail = h.load("lib/payroll-mail.ts");
  const names = ["PEOPLE_PULSE_GMAIL_CLIENT_ID", "PEOPLE_PULSE_GMAIL_CLIENT_SECRET", "PEOPLE_PULSE_GMAIL_REFRESH_TOKEN"];
  const saved = names.map(k => process.env[k]); names.forEach(k => delete process.env[k]);
  try { assert.equal(mail.mailStatus().ready, false); await assert.rejects(mail.sendPayslip("none"), /ยังไม่เชื่อม/); }
  finally { names.forEach((key,i) => { if (saved[i] !== undefined) process.env[key] = saved[i]; }); }
  const raw = mail.payslipMime({ period: "2026-09", label: "ค่าจ้าง", slipId: "test", entry: { employeeName: "<script>hi</script>", totals: { net: 123456789 } } }, "test@example.com", "https://example.com");
  const decoded = Buffer.from(raw, "base64url").toString("utf8");
  assert.match(decoded, /From: maechalao2333@gmail.com/);
  const html = Buffer.from(decoded.split("\r\n\r\n")[1].replace(/\s/g,""), "base64").toString("utf8");
  assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /123456789/); assert.match(html, /payroll=1/);
});

test("80 employee approval is atomic and remains below 1000 D1 statement preparations", async () => {
  const h = harness(80); await h.service.readyPayroll();
  const entries = Array.from({ length: 80 }, (_,i) => h.engine.emptyPayrollInput(`e${i+1}`, `employee${i+1}@example.com`, "15000"));
  const id = (await h.service.mutatePayroll(owner, { action: "create", ...h.draft(entries) })).id;
  const before = h.calls();
  await h.service.mutatePayroll(owner, { action: "approve", id, expectedRevision: 0, confirmed: true });
  assert.equal(h.db.prepare("SELECT COUNT(*) c FROM payroll_slips").get().c, 80);
  assert.ok(h.calls() - before < 1000);
});

test("attendance change between precheck and batch aborts approval and all slips", async () => {
  const h = harness(); await h.service.readyPayroll();
  h.db.exec("INSERT INTO employee_profiles VALUES ('e1','2025-01-01')");
  for (let day = 1; day <= 31; day++) h.db.prepare("INSERT INTO attendance_records VALUES ('e1',?,'present',0,'09:00','v1')").run(`2026-08-${String(day).padStart(2,"0")}`);
  const entry = { ...h.engine.emptyPayrollInput("e1", "employee1@example.com", "20000"), includeMonthlyExtras: true, restDays: "2026-08-02,2026-08-09,2026-08-16,2026-08-23" };
  const id = (await h.service.mutatePayroll(owner, { action: "create", ...h.draft([entry]) })).id;
  assert.equal(JSON.parse((await h.service.getRun(id)).document).entries[0].attendanceBonus, "300.00");
  const batch = h.d1.batch;
  h.d1.batch = async statements => { h.db.exec("UPDATE attendance_records SET status='late',minutes_late=10,updated_at='v2' WHERE work_date='2026-08-01'"); return batch(statements); };
  await assert.rejects(h.service.mutatePayroll(owner, { action: "approve", id, expectedRevision: 0, confirmed: true }), /PAYROLL_ATTENDANCE_CHANGED/);
  assert.equal(h.db.prepare("SELECT COUNT(*) c FROM payroll_slips").get().c, 0);
  assert.equal((await h.service.getRun(id)).status, "draft");
});

test("80 employees with five active awards each use set-based queries and one atomic claim insert per employee", async () => {
  const h = harness(80); await h.service.readyPayroll();
  for (let employee = 1; employee <= 80; employee++) for (let award = 1; award <= 5; award++) {
    h.db.prepare("INSERT INTO skill_achievements VALUES (?,?,'skill',0,'now')").run(`source-${employee}-${award}`, `e${employee}`);
    h.db.prepare("INSERT INTO payroll_awards VALUES (?,?,'skill',?,'skill',50000,'2026-09','2026-11','user-owner','now')").run(`award-${employee}-${award}`, `e${employee}`, `source-${employee}-${award}`);
  }
  const entries = Array.from({ length: 80 }, (_,i) => ({ ...h.engine.emptyPayrollInput(`e${i+1}`, `employee${i+1}@example.com`, "15000"), includeMonthlyExtras: true }));
  const id = (await h.service.mutatePayroll(owner, { action: "create", ...h.draft(entries) })).id;
  const before = h.calls();
  await h.service.mutatePayroll(owner, { action: "approve", id, expectedRevision: 0, confirmed: true });
  assert.equal(h.db.prepare("SELECT COUNT(*) c FROM payroll_slips").get().c, 80);
  assert.equal(h.db.prepare("SELECT COUNT(*) c FROM payroll_pay_claims WHERE kind='skill'").get().c, 400);
  assert.ok(h.calls() - before < 300, `queries: ${h.calls() - before}`);
});

test("Gmail sends canonical draft once; uncertain send is quarantined without retry", async () => {
  const keys = ["PEOPLE_PULSE_GMAIL_CLIENT_ID", "PEOPLE_PULSE_GMAIL_CLIENT_SECRET", "PEOPLE_PULSE_GMAIL_REFRESH_TOKEN", "PEOPLE_PULSE_CANONICAL_ORIGIN"];
  const saved = keys.map(k => process.env[k]), fetchBefore = globalThis.fetch;
  keys.forEach(k => { process.env[k] = "test-only-placeholder"; }); process.env.PEOPLE_PULSE_CANONICAL_ORIGIN = "https://example.com";
  try {
    for (const uncertain of [false, true]) {
      const h = harness(); await h.service.readyPayroll(); const id = (await h.service.mutatePayroll(owner, { action: "create", ...h.draft() })).id;
      await h.service.mutatePayroll(owner, { action: "approve", id, expectedRevision: 0, confirmed: true });
      const slipId = h.db.prepare("SELECT id FROM payroll_slips").get().id;
      let sends = 0, raw;
      globalThis.fetch = async (url, options) => {
        if (url.endsWith("/token")) return Response.json({ access_token: "test-token" });
        if (url.endsWith("/profile")) return Response.json({ emailAddress: "maechalao2333@gmail.com" });
        if (url.endsWith("/drafts")) { raw = JSON.parse(options.body).message.raw; return Response.json({ id: "draft-test" }); }
        if (url.endsWith("/drafts/send")) { sends++; assert.equal(JSON.parse(options.body).message.raw, raw); assert.equal(JSON.parse(options.body).id, "draft-test"); if (uncertain) throw new Error("timeout"); return Response.json({ id: "sent-test" }); }
        throw new Error("Unexpected external request");
      };
      const mail = h.load("lib/payroll-mail.ts");
      if (uncertain) { await assert.rejects(mail.sendPayslip(slipId)); await assert.rejects(mail.sendPayslip(slipId), /Sent\/Drafts/); }
      else { assert.equal((await mail.sendPayslip(slipId)).status, "accepted"); assert.equal((await mail.sendPayslip(slipId)).alreadyAccepted, true); }
      assert.equal(sends, 1);
      assert.equal(h.db.prepare("SELECT status FROM payroll_deliveries").get().status, uncertain ? "review" : "accepted");
    }
  } finally { globalThis.fetch = fetchBefore; keys.forEach((k,i) => { if (saved[i] === undefined) delete process.env[k]; else process.env[k] = saved[i]; }); }
});
