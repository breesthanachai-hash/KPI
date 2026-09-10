import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationName = "0023_complex_ken_ellis";

function source(relativePath) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

function sourceBlock(text, start, end) {
  const startIndex = text.indexOf(start);
  const endIndex = text.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `missing source block start: ${start}`);
  assert.ok(endIndex > startIndex, `missing source block end: ${end}`);
  return text.slice(startIndex, endIndex);
}

const [
  dashboardRoute,
  pageSource,
  cssSource,
  schemaSource,
  initializeSource,
  dataSource,
  accessControlSource,
  registrationServiceSource,
  migrationSource,
  migrationSnapshot,
  previousSnapshot,
  migrationJournal,
] = await Promise.all([
  source("app/api/dashboard/route.ts"),
  source("app/page.tsx"),
  source("app/globals.css"),
  source("db/schema.ts"),
  source("db/initialize.ts"),
  source("lib/kpi-data.ts"),
  source("lib/access-control.ts"),
  source("lib/registration-service.ts"),
  source(`drizzle/${migrationName}.sql`),
  source("drizzle/meta/0023_snapshot.json").then(JSON.parse),
  source("drizzle/meta/0022_snapshot.json").then(JSON.parse),
  source("drizzle/meta/_journal.json").then(JSON.parse),
]);

const positionTriggerNames = [
  "employee_position_event_insert_guard",
  "employee_position_update_guard",
  "employee_position_event_apply",
  "employee_position_event_update_guard",
  "employee_position_event_delete_guard",
];

function migrationStatements() {
  return migrationSource.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean);
}

function initializerPreparedSql(prefix) {
  const opening = `d1.prepare(\`${prefix}`;
  const start = initializeSource.indexOf(opening);
  assert.ok(start >= 0, `initializer must prepare ${prefix}`);
  const sqlStart = start + "d1.prepare(`".length;
  const end = initializeSource.indexOf("`)", sqlStart);
  assert.ok(end > sqlStart, `initializer SQL must terminate for ${prefix}`);
  return initializeSource.slice(sqlStart, end);
}

const positionRuntimeSql = positionTriggerNames.map((name) => initializerPreparedSql(`CREATE TRIGGER IF NOT EXISTS ${name}`));
const v23MarkerSql = initializerPreparedSql("CREATE TABLE IF NOT EXISTS people_pulse_schema_v23_ready");

function createPositionDatabase({ installRuntime = true } = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE employees (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      role_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      updated_at TEXT NOT NULL
    );
    CREATE TABLE user_accounts (
      id TEXT PRIMARY KEY NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL
    );
  `);
  for (const statement of migrationStatements()) db.exec(statement);
  if (installRuntime) {
    for (const statement of positionRuntimeSql) db.exec(statement);
    db.exec(v23MarkerSql);
  }
  return db;
}

function insertPositionEvent(db, {
  id = "position-event-1",
  employeeId = "employee-1",
  employeeName = "Example Employee",
  roleId = "crm-retention-marketer",
  previousTitle = "",
  nextTitle = "CRM Growth Lead",
  expectedUpdatedAt = "2026-09-10T00:00:00.000Z",
  resultingUpdatedAt = "2026-09-10T00:00:00.001Z",
  actorUserId = "admin-1",
} = {}) {
  return db.prepare(`INSERT INTO employee_position_events (
    id, employee_id, employee_name_snapshot, role_id_snapshot,
    previous_position_title, next_position_title, expected_updated_at,
    resulting_updated_at, actor_user_id, actor_name, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'HR Admin', ?)`).run(
    id,
    employeeId,
    employeeName,
    roleId,
    previousTitle,
    nextTitle,
    expectedUpdatedAt,
    resultingUpdatedAt,
    actorUserId,
    resultingUpdatedAt,
  );
}

test("schema v23 adds a backward-compatible display title and durable audit snapshots", () => {
  assert.match(dataSource, /export type EmployeeRecord = \{[\s\S]*?positionTitle: string/);
  assert.match(dataSource, /export type EmployeePositionEventRecord = \{[\s\S]*?previousPositionTitle: string;[\s\S]*?nextPositionTitle: string;[\s\S]*?actorUserId: string/);
  assert.match(schemaSource, /positionTitle: text\("position_title"\)\.notNull\(\)\.default\(""\)/);

  const eventSchema = sourceBlock(schemaSource, "export const employeePositionEvents", "export const userAccounts");
  for (const column of [
    "employeeId", "employeeNameSnapshot", "roleIdSnapshot", "previousPositionTitle", "nextPositionTitle",
    "expectedUpdatedAt", "resultingUpdatedAt", "actorUserId", "actorName", "createdAt",
  ]) assert.match(eventSchema, new RegExp(`${column}:`));
  assert.doesNotMatch(eventSchema, /\.references\(/, "audit snapshots must survive employee or account deletion");
  assert.match(eventSchema, /uniqueIndex\("employee_position_events_employee_result_unique"\)\.on\(table\.employeeId, table\.resultingUpdatedAt\)/);

  assert.equal(migrationSnapshot.tables.employees.columns.position_title.notNull, true);
  assert.equal(migrationSnapshot.tables.employees.columns.position_title.default, "''");
  assert.ok(migrationSnapshot.tables.employee_position_events);
  assert.equal(migrationSnapshot.prevId, previousSnapshot.id);
  const journalEntry = migrationJournal.entries.find((entry) => entry.idx === 23);
  assert.equal(journalEntry?.tag, migrationName);
});

test("migration 0023 is Sites-splitter safe and upgrades existing employee rows without publishing readiness", () => {
  assert.match(migrationSource, /CREATE TABLE `employee_position_events`/);
  assert.match(migrationSource, /ALTER TABLE `employees` ADD `position_title` text DEFAULT '' NOT NULL/);
  assert.ok(migrationStatements().every((statement) => /^(?:CREATE (?:TABLE|(?:UNIQUE )?INDEX)|ALTER TABLE)\b/.test(statement)));
  assert.doesNotMatch(migrationSource, /\bCREATE\s+TRIGGER\b/i);
  assert.doesNotMatch(migrationSource, /\bBEGIN\b/i);
  assert.doesNotMatch(migrationSource, /\bPRAGMA\b/i);
  assert.doesNotMatch(migrationSource, /people_pulse_schema_v23_ready/);

  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE employees (id TEXT PRIMARY KEY NOT NULL, role_id TEXT NOT NULL); INSERT INTO employees (id, role_id) VALUES ('legacy-1', 'crm-retention-marketer');");
    for (const statement of migrationStatements()) db.exec(statement);
    const column = db.prepare("PRAGMA table_info(employees)").all().find((item) => item.name === "position_title");
    assert.equal(column?.notnull, 1);
    assert.equal(column?.dflt_value, "''");
    assert.equal(db.prepare("SELECT position_title FROM employees WHERE id='legacy-1'").get().position_title, "");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='trigger' AND name LIKE 'employee_position_%'").get().count, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='people_pulse_schema_v23_ready'").get().count, 0);
  } finally {
    db.close();
  }
});

test("runtime initialization installs all five position guards before the v23 marker and is repeatable", () => {
  assert.match(initializeSource, /LATEST_SCHEMA_MARKER = "people_pulse_schema_v23_ready"/);
  assert.match(initializeSource, /position_title TEXT NOT NULL DEFAULT ''/);
  assert.match(initializeSource, /\["employees", "position_title", "TEXT NOT NULL DEFAULT ''"\]/);
  assert.match(initializeSource, /table: "employees" \| "rewards"/);
  const markerIndex = initializeSource.lastIndexOf("CREATE TABLE IF NOT EXISTS people_pulse_schema_v23_ready");
  assert.ok(markerIndex > 0);
  for (const trigger of positionTriggerNames) {
    const triggerIndex = initializeSource.indexOf(`CREATE TRIGGER IF NOT EXISTS ${trigger}`);
    assert.ok(triggerIndex >= 0 && triggerIndex < markerIndex, `${trigger} must precede the readiness marker`);
  }
  assert.match(v23MarkerSql, /CHECK \(schema_version = 23\)/);

  const db = createPositionDatabase({ installRuntime: false });
  try {
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='trigger' AND name LIKE 'employee_position_%'").get().count, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='people_pulse_schema_v23_ready'").get().count, 0);
    for (const statement of positionRuntimeSql) db.exec(statement);
    db.exec(v23MarkerSql);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='trigger' AND name LIKE 'employee_position_%'").get().count, 5);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='people_pulse_schema_v23_ready'").get().count, 1);
    for (const statement of positionRuntimeSql) db.exec(statement);
    db.exec(v23MarkerSql);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='trigger' AND name LIKE 'employee_position_%'").get().count, 5);
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
  } finally {
    db.close();
  }
});

test("position changes require an active admin audit event and immutable snapshots", () => {
  const db = createPositionDatabase();
  try {
    db.prepare("INSERT INTO user_accounts (id,role,status) VALUES ('admin-1','admin','active'),('manager-1','manager','active')").run();
    db.prepare("INSERT INTO employees (id,name,role_id,status,updated_at) VALUES ('employee-1','Example Employee','crm-retention-marketer','active','2026-09-10T00:00:00.000Z')").run();

    assert.throws(() => db.prepare("UPDATE employees SET position_title='Bypass' WHERE id='employee-1'").run(), /EMPLOYEE_POSITION_AUDIT_REQUIRED/);
    insertPositionEvent(db);
    assert.deepEqual({ ...db.prepare("SELECT position_title,updated_at FROM employees WHERE id='employee-1'").get() }, {
      position_title: "CRM Growth Lead",
      updated_at: "2026-09-10T00:00:00.001Z",
    });
    const event = db.prepare("SELECT employee_name_snapshot,role_id_snapshot,previous_position_title,next_position_title,actor_name FROM employee_position_events WHERE id='position-event-1'").get();
    assert.deepEqual({ ...event }, {
      employee_name_snapshot: "Example Employee",
      role_id_snapshot: "crm-retention-marketer",
      previous_position_title: "",
      next_position_title: "CRM Growth Lead",
      actor_name: "HR Admin",
    });

    assert.throws(() => insertPositionEvent(db, {
      id: "position-event-stale",
      previousTitle: "",
      nextTitle: "Stale Change",
      resultingUpdatedAt: "2026-09-10T00:00:00.002Z",
    }), /EMPLOYEE_POSITION_STALE/);
    assert.throws(() => insertPositionEvent(db, {
      id: "position-event-manager",
      previousTitle: "CRM Growth Lead",
      nextTitle: "Unauthorized Change",
      expectedUpdatedAt: "2026-09-10T00:00:00.001Z",
      resultingUpdatedAt: "2026-09-10T00:00:00.002Z",
      actorUserId: "manager-1",
    }), /EMPLOYEE_POSITION_ACTOR_INVALID/);
    assert.throws(() => insertPositionEvent(db, {
      id: "position-event-spaces",
      previousTitle: "CRM Growth Lead",
      nextTitle: "Invalid  Spacing",
      expectedUpdatedAt: "2026-09-10T00:00:00.001Z",
      resultingUpdatedAt: "2026-09-10T00:00:00.002Z",
    }), /EMPLOYEE_POSITION_INVALID/);
    assert.throws(() => db.prepare("UPDATE employee_position_events SET actor_name='Other' WHERE id='position-event-1'").run(), /EMPLOYEE_POSITION_EVENT_IMMUTABLE/);
    assert.throws(() => db.prepare("DELETE FROM employee_position_events WHERE id='position-event-1'").run(), /EMPLOYEE_POSITION_EVENT_IMMUTABLE/);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM employee_position_events").get().count, 1);

    db.prepare("DELETE FROM employees WHERE id='employee-1'").run();
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM employee_position_events WHERE employee_id='employee-1'").get().count, 1, "audit snapshot must survive permanent dossier deletion");
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
  } finally {
    db.close();
  }
});

test("a stale audited position change rolls the accompanying profile write back atomically", () => {
  const db = createPositionDatabase();
  try {
    db.exec("CREATE TABLE employee_profiles (employee_id TEXT PRIMARY KEY NOT NULL, phone TEXT NOT NULL);");
    db.prepare("INSERT INTO user_accounts (id,role,status) VALUES ('admin-1','admin','active')").run();
    db.prepare("INSERT INTO employees (id,name,role_id,status,updated_at) VALUES ('employee-1','Example Employee','crm-retention-marketer','active','2026-09-10T00:00:00.000Z')").run();

    assert.throws(() => {
      db.exec("BEGIN");
      try {
        db.prepare("INSERT INTO employee_profiles (employee_id,phone) VALUES ('employee-1','0800000000')").run();
        insertPositionEvent(db, { expectedUpdatedAt: "2026-09-09T00:00:00.000Z", resultingUpdatedAt: "2026-09-10T00:00:00.001Z" });
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    }, /EMPLOYEE_POSITION_STALE/);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM employee_profiles").get().count, 0);
    assert.equal(db.prepare("SELECT position_title FROM employees WHERE id='employee-1'").get().position_title, "");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM employee_position_events").get().count, 0);
  } finally {
    db.close();
  }
});

test("create and profile APIs normalize display titles while keeping the base role immutable", () => {
  const normalization = sourceBlock(dashboardRoute, "function normalizedPositionTitle", "function roleDepartmentId");
  assert.match(normalization, /typeof value !== "string" \|\| value\.includes\("\\0"\)/);
  assert.match(normalization, /value\.normalize\("NFC"\)\.trim\(\)\.replace\(\/\\s\+\/g, " "\)/);

  const employeePayload = sourceBlock(dashboardRoute, "type EmployeePayload", "type UpdateEmployeeStatusPayload");
  assert.match(employeePayload, /roleId\?: string/);
  assert.match(employeePayload, /positionTitle\?: string/);
  const createBlock = sourceBlock(dashboardRoute, 'if (payload.action === "createEmployee")', 'if (payload.action === "saveEvaluation")');
  assert.match(createBlock, /roles\.some\(\(role\) => role\.id === roleId\)/, "new employees must use a known active KPI template");
  assert.match(createBlock, /positionTitle === null \|\| Array\.from\(positionTitle\)\.length > 120/);
  assert.match(createBlock, /roleId,[\s\S]*?positionTitle,[\s\S]*?manager/);
  assert.match(createBlock, /currentSalary: roleSalaryBands\[roleId\]\.mid/);
  assert.doesNotMatch(createBlock, /roleSalaryBands\[positionTitle\]|roleId:\s*positionTitle/);

  const profilePayload = sourceBlock(dashboardRoute, "type EmployeeProfilePayload", "type DocumentStatusPayload");
  assert.match(profilePayload, /expectedEmployeeUpdatedAt\?: string/);
  assert.match(profilePayload, /positionTitle\?: string/);
  assert.doesNotMatch(profilePayload, /roleId\?:/);
  assert.match(dashboardRoute, /adminOnlyActions = new Set\(\[[\s\S]*?"saveEmployeeProfile"/);

  const profileBlock = sourceBlock(dashboardRoute, 'if (payload.action === "saveEmployeeProfile")', 'if (payload.action === "updateDocumentStatus")');
  assert.match(profileBlock, /payload\.positionTitle === undefined \? undefined : normalizedPositionTitle\(payload\.positionTitle\)/);
  assert.match(profileBlock, /employee\.status === "archived"[\s\S]*?เปิดดูได้อย่างเดียว/);
  assert.match(profileBlock, /!findRole\(employee\.roleId\)/);
  assert.match(profileBlock, /employee\.updatedAt !== expectedEmployeeUpdatedAt/);
  assert.match(profileBlock, /Array\.from\(requestedPositionTitle\)\.length > 120/);
  assert.match(profileBlock, /const positionTitle = requestedPositionTitle \?\? employee\.positionTitle/);
  assert.match(profileBlock, /const positionChanged = positionTitle !== employee\.positionTitle/);
  assert.match(profileBlock, /INSERT INTO employee_position_events[\s\S]*?previous_position_title, next_position_title[\s\S]*?actor_user_id, actor_name/);
  assert.match(profileBlock, /UPDATE employees SET updated_at = \? WHERE id = \? AND updated_at = \? AND role_id = \? AND position_title = \? AND status <> 'archived'/);
  assert.match(profileBlock, /CASE WHEN changes\(\) = 1 THEN name ELSE NULL END/);
  assert.match(profileBlock, /await d1\.batch\(statements\)/);
  assert.match(profileBlock, /message\.includes\("employee_position_events"\)/, "unique/race conflicts must map to a reloadable 409");
  assert.match(profileBlock, /const \[savedProfile\] = await db\.select\(\)\.from\(employeeProfiles\)[\s\S]*?employeeProfile: employeeProfileWithValidImage\(savedProfile\), employee: \{ \.\.\.employee, positionTitle, updatedAt: now \}, positionEvent/);
  assert.doesNotMatch(profileBlock, /profileImageKey:\s*""|profileImageUpdatedAt:\s*null/, "saving a title or profile must preserve the existing avatar fields");
  assert.doesNotMatch(profileBlock, /payload\.roleId|SET role_id\s*=|evaluations|employee_self_assessments|point_ledger|hr_profiles/);
});

test("position titles cannot affect authentication, RBAC, policy scope, KPI or quest eligibility", () => {
  assert.doesNotMatch(accessControlSource, /positionTitle|position_title/);
  assert.doesNotMatch(registrationServiceSource, /positionTitle|position_title/);
  assert.match(accessControlSource, /findRole\(employee\.roleId\)\?\.departmentId === account\.departmentId/);
  assert.match(accessControlSource, /const liveDepartmentId = findRole\(linkedEmployee\.roleId\)\?\.departmentId \?\? ""[\s\S]*?revokeReason: "employee-role-unavailable"/);
  assert.match(registrationServiceSource, /const employeeRole = findRole\(employee\.roleId\)[\s\S]*?role !== "admin" && !employeeRole[\s\S]*?departmentId: role === "admin" \? "" : employeeRole\?\.departmentId \?\? ""/);

  const roleScopeHelper = sourceBlock(dashboardRoute, "function roleDepartmentId", "function apiError");
  assert.match(roleScopeHelper, /findRole\(roleId\)\?\.departmentId \?\? ""/);
  const policyScope = sourceBlock(dashboardRoute, "function policyAppliesToEmployee", "function previousIsoDay");
  assert.match(policyScope, /const employeeRole = findRole\(employee\.roleId\)/);
  assert.match(policyScope, /policy\.scopeType === "department"[\s\S]*?employeeRole\.departmentId/);
  assert.doesNotMatch(policyScope, /positionTitle|position_title/);

  for (const [start, end] of [
    ['if (payload.action === "saveEvaluation")', 'if (payload.action === "saveSelfAssessment")'],
    ['if (payload.action === "saveSelfAssessment")', 'if (payload.action === "saveHrPlan")'],
    ['if (payload.action === "verifySkillAchievement")', 'if (payload.action === "saveProject")'],
    ['if (payload.action === "completeQuestForEmployee")', 'if (payload.action === "deleteQuest")'],
  ]) {
    const block = sourceBlock(dashboardRoute, start, end);
    assert.match(block, /findRole\(employee\.roleId\)/);
    assert.doesNotMatch(block, /positionTitle|position_title/);
  }
  assert.match(dashboardRoute, /const ownerRole = findRole\(owner\.roleId\)/);
  assert.match(dashboardRoute, /const actorRole = findRole\(actorEmployee\.roleId\)/);
  assert.match(dashboardRoute, /const assigneeRole = findRole\(assignee\.roleId\)/);
  assert.match(dashboardRoute, /employeePositionEvents: currentUser\.role === "admin" \? employeePositionEventRows : \[\]/);
  assert.match(dashboardRoute, /authenticatedUser\.role === "admin" && !isEmployeePreviewRequest \? db\.select\(\)\.from\(employeePositionEvents\) : Promise\.resolve\(\[\]\)/);
});

test("the UI keeps custom titles display-only, normalized, accessible and reversible", () => {
  assert.match(pageSource, /function normalizedEmployeePositionTitle\(value: string\) \{[\s\S]*?value\.normalize\("NFC"\)\.trim\(\)\.replace\(\/\\s\+\/g, " "\)/);
  assert.match(pageSource, /function employeePositionLabel\(employee:[\s\S]*?normalizedEmployeePositionTitle\(employee\.positionTitle\) \|\| getRole\(employee\.roleId\)\.name/);
  assert.ok((pageSource.match(/employeePositionLabel\(/g) ?? []).length >= 30, "employee-facing screens and exports must consistently use the effective title");
  assert.match(pageSource, /const employeePositionTitleLength = Array\.from\(normalizedEmployeePositionTitle\(employeeForm\.positionTitle\)\)\.length/);
  assert.match(pageSource, /const profilePositionTitleLength = Array\.from\(normalizedEmployeePositionTitle\(profilePositionTitle\)\)\.length/);

  const addEmployeeBlock = sourceBlock(pageSource, "const addEmployee = async", "const updateEmployeeLifecycleStatus");
  assert.match(addEmployeeBlock, /positionMode === "custom" \? normalizedEmployeePositionTitle\(employeeForm\.positionTitle\) : ""/);
  assert.match(addEmployeeBlock, /JSON\.stringify\(\{ action: "createEmployee", name: employeeForm\.name, email: employeeForm\.email, roleId: employeeForm\.roleId, positionTitle, manager: employeeForm\.manager \}\)/);
  assert.doesNotMatch(addEmployeeBlock, /positionMode,/);

  const addModal = sourceBlock(pageSource, "{showAddEmployee && canManageEmployeeFiles", "{showChangePassword && currentUser");
  assert.match(addModal, /className="wide employee-position-choice"/);
  assert.match(addModal, /value === "__custom__"[\s\S]*?positionMode: "custom"[\s\S]*?positionMode: "standard", positionTitle: "", roleId: value/);
  assert.match(addModal, /<option value="__custom__">กำหนดเอง…<\/option>/);
  assert.match(addModal, /className="wide employee-custom-position"[\s\S]*?<input required aria-invalid=\{employeeCustomPositionInvalid\}/);
  assert.match(addModal, /className="wide employee-base-role"[\s\S]*?<span>กรอบ KPI และแผนก<\/span>[\s\S]*?value=\{employeeForm\.roleId\}/);
  assert.match(addModal, /ชื่อนี้ใช้แสดงในแฟ้ม รายชื่อ และรายงานเท่านั้น/);
  assert.match(addModal, /disabled=\{isSaving \|\| employeeCustomPositionInvalid\}/);
  assert.doesNotMatch(addModal, /maxLength=\{120\}/, "the browser must not enforce a UTF-16 limit that disagrees with Unicode code-point validation");

  const openEditor = sourceBlock(pageSource, "const openProfileEditor", "const saveEmployeeProfile");
  assert.match(openEditor, /profileEmployee\.status === "archived" \|\| isEmployeePreview/);
  assert.match(openEditor, /normalizedEmployeePositionTitle\(profileEmployee\.positionTitle\)/);
  assert.match(openEditor, /setProfilePositionMode\(positionTitle \? "custom" : "standard"\)/);
  const saveProfile = sourceBlock(pageSource, "const saveEmployeeProfile", "const uploadProfileImage");
  assert.match(saveProfile, /profilePositionMode === "custom" \? normalizedEmployeePositionTitle\(profilePositionTitle\) : ""/);
  assert.match(saveProfile, /action: "saveEmployeeProfile", employeeId: profileEmployee\.id, expectedEmployeeUpdatedAt: profileEmployee\.updatedAt, positionTitle/);
  assert.doesNotMatch(saveProfile, /roleId/);
  assert.match(saveProfile, /setEmployees\(\(items\) => items\.map/);

  const profileModal = sourceBlock(pageSource, "{showProfileEditor && profileEmployee", "{showContractForm && profileEmployee");
  assert.match(profileModal, /<option value="standard">ใช้ตำแหน่งมาตรฐาน/);
  assert.match(profileModal, /if \(positionMode === "standard"\) setProfilePositionTitle\(""\)/);
  assert.match(profileModal, /className="wide employee-position-context" role="note"/);
  assert.match(profileModal, /กรอบ KPI และแผนก \(แก้จากหน้านี้ไม่ได้\)/);
  assert.match(profileModal, /ชื่อตำแหน่งที่แสดงไม่เปลี่ยนสิทธิ์หรือกรอบประเมิน/);
  assert.match(profileModal, /disabled=\{isSaving \|\| profileCustomPositionInvalid\}/);

  assert.match(cssSource, /\/\* Employee position titles stay display-only/);
  assert.match(cssSource, /employee-position-choice[\s\S]*?employee-custom-position[\s\S]*?employee-base-role/);
  assert.match(cssSource, /min-height: 46px/);
  assert.match(cssSource, /:focus-visible/);
  assert.match(cssSource, /@media \(max-width: 640px\)[\s\S]*?employee-position-context/);
});

test("searches, reports and permanent deletion use the effective title without spreadsheet injection or false deletion promises", () => {
  assert.match(pageSource, /function csvCell[\s\S]*?\^\\s\*\[=\+\\-@\][\s\S]*?`'\$\{text\}`/);
  for (const [start, end] of [
    ["const exportReport =", "const exportPortfolioReport ="],
    ["const exportPortfolioReport =", "const exportUserAccounts ="],
    ["const exportUserAccounts =", "const isAdmin ="],
  ]) assert.match(sourceBlock(pageSource, start, end), /employeePositionLabel\(/);
  assert.match(pageSource, /employee\.name} \$\{employee\.email} \$\{employeePositionLabel\(employee\)} \$\{role\.name} \$\{role\.department}/);
  assert.match(pageSource, /ระบบจะคงหลักฐานตรวจสอบขั้นต่ำบางรายการเป็น snapshot ตามประวัติองค์กร/);
  assert.match(pageSource, /ผู้ที่เคยได้รับสิทธิ์จากเควสและประวัติการเปลี่ยนชื่อตำแหน่ง/);
  assert.match(pageSource, /ข้อมูลใช้งานและไฟล์ที่ลบแล้วกู้คืนไม่ได้/);
  assert.doesNotMatch(sourceBlock(pageSource, "const deleteEmployeePermanently", "const editUserAccount"), /ลบข้อมูลส่วนบุคคล ประวัติงาน การประเมิน สัญญา เอกสาร และไฟล์แนบทั้งหมด/);
});

test("the production Sites artifact contains the exact migration and custom-position UI contract", async () => {
  const packagedMigration = await source(`dist/.openai/drizzle/${migrationName}.sql`);
  assert.equal(packagedMigration, migrationSource);
  const packagedMigrations = (await readdir(path.join(projectRoot, "dist/.openai/drizzle"))).filter((name) => name.startsWith("0023_"));
  assert.deepEqual(packagedMigrations, [`${migrationName}.sql`]);
  const assetDirectory = path.join(projectRoot, "dist/client/assets");
  const assets = (await readdir(assetDirectory)).filter((file) => file.endsWith(".js"));
  const bundle = (await Promise.all(assets.map((file) => readFile(path.join(assetDirectory, file), "utf8")))).join("\n");
  for (const copy of [
    "ชื่อตำแหน่งที่แสดง",
    "กำหนดเอง…",
    "กรอบ KPI และแผนก",
    "ชื่อนี้ใช้แสดงในแฟ้ม รายชื่อ และรายงานเท่านั้น",
    "ชื่อตำแหน่งที่แสดงไม่เปลี่ยนสิทธิ์หรือกรอบประเมิน",
    "ระบบจะคงหลักฐานตรวจสอบขั้นต่ำบางรายการเป็น snapshot ตามประวัติองค์กร",
  ]) assert.ok(bundle.includes(copy), `built client is missing: ${copy}`);
});
