import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationName = "0022_strong_wrecking_crew";
const dashboardRoute = await readFile(path.join(projectRoot, "app/api/dashboard/route.ts"), "utf8");
const pageSource = await readFile(path.join(projectRoot, "app/page.tsx"), "utf8");
const cssSource = await readFile(path.join(projectRoot, "app/globals.css"), "utf8");
const schemaSource = await readFile(path.join(projectRoot, "db/schema.ts"), "utf8");
const initializeSource = await readFile(path.join(projectRoot, "db/initialize.ts"), "utf8");
const dataSource = await readFile(path.join(projectRoot, "lib/kpi-data.ts"), "utf8");
const migrationSource = await readFile(path.join(projectRoot, `drizzle/${migrationName}.sql`), "utf8");
const migrationSnapshot = JSON.parse(await readFile(path.join(projectRoot, "drizzle/meta/0022_snapshot.json"), "utf8"));
const migrationJournal = JSON.parse(await readFile(path.join(projectRoot, "drizzle/meta/_journal.json"), "utf8"));
const questTriggerNames = [
  "quest_completion_insert_guard",
  "quest_completion_update_guard",
  "quest_completion_delete_guard",
  "quest_fulfilled_terms_lock",
  "quest_target_fulfilled_insert_guard",
  "quest_target_fulfilled_update_guard",
  "quest_target_fulfilled_delete_guard",
  "quest_mutation_event_guard",
  "quest_mutation_event_update_guard",
  "quest_mutation_event_delete_guard",
];

function sourceBlock(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `missing source block start: ${start}`);
  assert.ok(endIndex > startIndex, `missing source block end: ${end}`);
  return source.slice(startIndex, endIndex);
}

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

const questRuntimeSql = [
  ...questTriggerNames.map((name) => initializerPreparedSql(`CREATE TRIGGER IF NOT EXISTS ${name}`)),
];

function installQuestRuntimeContract(db) {
  for (const statement of questRuntimeSql) db.exec(statement);
}

function createMigrationDatabase({ installRuntime = true } = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE rewards (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      is_active INTEGER NOT NULL,
      stock INTEGER NOT NULL,
      inventory_version INTEGER NOT NULL
    );
    CREATE TABLE employees (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      role_id TEXT NOT NULL,
      status TEXT NOT NULL
    );
    CREATE TABLE user_accounts (
      id TEXT PRIMARY KEY NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL,
      employee_id TEXT
    );
    CREATE TABLE organization_policies (
      id TEXT PRIMARY KEY NOT NULL,
      code TEXT NOT NULL,
      category TEXT NOT NULL,
      scope_type TEXT NOT NULL,
      status TEXT NOT NULL,
      version INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      effective_date TEXT NOT NULL,
      effective_to TEXT
    );
    CREATE TABLE point_events (
      id TEXT PRIMARY KEY NOT NULL,
      employee_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      points INTEGER NOT NULL,
      event_date TEXT NOT NULL,
      evidence_url TEXT NOT NULL,
      policy_id TEXT NOT NULL,
      policy_version INTEGER NOT NULL,
      policy_content_hash TEXT NOT NULL
    );
    CREATE TABLE point_ledger (
      id TEXT PRIMARY KEY NOT NULL,
      employee_id TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      points INTEGER NOT NULL,
      policy_id TEXT NOT NULL,
      policy_version INTEGER NOT NULL,
      policy_content_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE point_mutation_claims (
      point_event_id TEXT NOT NULL,
      employee_id TEXT NOT NULL
    );
    CREATE TABLE point_cap_claims (
      employee_id TEXT NOT NULL,
      claim_month TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL
    );
  `);
  for (const statement of migrationStatements()) db.exec(statement);
  if (installRuntime) installQuestRuntimeContract(db);
  return db;
}

function bangkokDay(offset = 0) {
  return new Date(Date.now() + 7 * 60 * 60 * 1000 + offset * 86_400_000).toISOString().slice(0, 10);
}

function seedCompletionFixture(db, {
  suffix = "",
  employeeRole = "role-sales",
  completionRole = employeeRole,
  actorId = "admin-account",
  points = 0,
  reward = true,
} = {}) {
  const employeeId = `employee${suffix}`;
  const questId = `quest${suffix}`;
  const completionId = `completion${suffix}`;
  const pointEventId = `point-event${suffix}`;
  const pointLedgerId = `point-ledger${suffix}`;
  const today = bangkokDay();
  const month = today.slice(0, 7);
  db.prepare("INSERT INTO employees (id,name,role_id,status) VALUES (?,?,?,'active')").run(employeeId, `Employee ${suffix || "One"}`, employeeRole);
  db.prepare(`INSERT INTO quests (
    id,type,title,description,status,progress,points_reward,reward_id,reward_title_snapshot,reward_icon_snapshot,
    is_featured,start_date,end_date,revision,created_by_user_id,created_by_name,updated_by_user_id,updated_by_name,created_at,updated_at
  ) VALUES (?, 'activity', ?, 'Verified criteria', 'active', 0, ?, ?, ?, ?, 1, ?, ?, 0, 'admin-account', 'Admin', 'admin-account', 'Admin', ?, ?)`)
    .run(questId, `Quest ${suffix || "One"}`, points, reward ? "reward-one" : null, reward ? "Reward One" : "", reward ? "★" : "", bangkokDay(-1), bangkokDay(1), `${today}T00:00:00.000Z`, `${today}T00:00:00.000Z`);
  db.prepare("INSERT INTO point_events (id,employee_id,event_type,points,event_date,evidence_url,policy_id,policy_version,policy_content_hash) VALUES (?,?,'quest',?,?,'https://example.com/proof','policy-one',1,'hash-one')")
    .run(pointEventId, employeeId, points, today);
  db.prepare("INSERT INTO point_ledger (id,employee_id,source_type,source_id,points,policy_id,policy_version,policy_content_hash,created_at) VALUES (?,?,'quest',?,?,'policy-one',1,'hash-one',?)")
    .run(pointLedgerId, employeeId, completionId, points, `${today}T00:00:00.000Z`);
  db.prepare("INSERT INTO point_mutation_claims (point_event_id,employee_id) VALUES (?,?)").run(pointEventId, employeeId);
  db.prepare("INSERT INTO point_cap_claims (employee_id,claim_month,source_type,source_id) VALUES (?,?,'quest_completion',?)").run(employeeId, month, completionId);
  const insert = db.prepare(`INSERT INTO quest_completions (
    id,quest_id,employee_id,completion_date,quest_revision,quest_updated_at,quest_type_snapshot,quest_title_snapshot,
    quest_description_snapshot,quest_start_date_snapshot,quest_end_date_snapshot,points_awarded,reward_id,reward_title_snapshot,
    reward_icon_snapshot,reward_inventory_version,employee_name_snapshot,employee_role_id_snapshot,employee_department_id_snapshot,
    employee_department_name_snapshot,evidence_url,note,point_event_id,point_ledger_id,policy_id,policy_version,policy_content_hash,
    quest_point_policy_limit,max_manual_quest_completions,standard_earn_monthly_cap,completed_by_user_id,completed_by_name,completed_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const values = [
    completionId,
    questId,
    employeeId,
    today,
    0,
    `${today}T00:00:00.000Z`,
    "activity",
    `Quest ${suffix || "One"}`,
    "Verified criteria",
    bangkokDay(-1),
    bangkokDay(1),
    points,
    reward ? "reward-one" : null,
    reward ? "Reward One" : "",
    reward ? "★" : "",
    reward ? 0 : null,
    `Employee ${suffix || "One"}`,
    completionRole,
    "department-sales",
    "Sales",
    "https://example.com/proof",
    "Evidence checked",
    pointEventId,
    pointLedgerId,
    "policy-one",
    1,
    "hash-one",
    100,
    3,
    500,
    actorId,
    "Admin",
    `${today}T00:00:00.000Z`,
  ];
  return { insert, values, completionId, questId, employeeId, pointEventId, pointLedgerId };
}

const policySelectorBlock = sourceBlock(dashboardRoute, "function pointPolicyFromRows", "type QuestRow");
const questDtoBlock = sourceBlock(dashboardRoute, "function questDto", "function policyAppliesToEmployee");
const questVisibilityBlock = sourceBlock(dashboardRoute, "const visibleQuests =", "const teamOverviewEmployeeIds");
const recordPointEventBlock = sourceBlock(dashboardRoute, 'if (payload.action === "recordPointEvent")', 'if (payload.action === "runMonthlyPointCycle")');
const saveQuestBlock = sourceBlock(dashboardRoute, 'if (payload.action === "saveQuest")', 'if (payload.action === "completeQuestForEmployee")');
const completeQuestBlock = sourceBlock(dashboardRoute, 'if (payload.action === "completeQuestForEmployee")', 'if (payload.action === "deleteQuest")');
const deleteQuestBlock = sourceBlock(dashboardRoute, 'if (payload.action === "deleteQuest")', 'if (payload.action === "saveReward")');
const openQuestEditorBlock = sourceBlock(pageSource, "const openQuestEditor =", "const closeQuestEditor =");
const uiSaveQuestBlock = sourceBlock(pageSource, "const saveQuest = async", "const deleteQuest = async");
const uiDeleteQuestBlock = sourceBlock(pageSource, "const deleteQuest = async", "const openQuestFulfillment =");
const uiCompleteQuestBlock = sourceBlock(pageSource, "const openQuestFulfillment =", "const startWorkItem = async");
const notificationBlock = sourceBlock(pageSource, "const notifications = useMemo", "const unreadNotifications =");
const openNotificationBlock = sourceBlock(pageSource, "const openNotification =", "const comparePowerProfile =");

test("migration 0022 stays Sites-safe while runtime installs the durable quest guards", async () => {
  for (const table of ["quests", "quest_targets", "quest_mutation_events", "quest_completions"]) {
    assert.match(schemaSource, new RegExp(`sqliteTable\\("${table}"`));
    assert.ok(migrationSource.includes(`CREATE TABLE \`${table}\``), `migration must create ${table}`);
    assert.ok(migrationSnapshot.tables[table], `snapshot must include ${table}`);
  }
  assert.match(schemaSource, /export const questCompletions = sqliteTable\("quest_completions"[\s\S]*?employeeId: text\("employee_id"\)\.notNull\(\)[\s\S]*?employeeRoleIdSnapshot: text\("employee_role_id_snapshot"\)\.notNull\(\)[\s\S]*?uniqueIndex\("quest_completions_quest_employee_unique"\)/);
  assert.ok(migrationStatements().every((statement) => /^CREATE (?:TABLE|(?:UNIQUE )?INDEX)\b/.test(statement)), "migration 0022 must contain only splitter-safe table and index statements");
  assert.doesNotMatch(migrationSource, /\bCREATE\s+TRIGGER\b/i);
  assert.doesNotMatch(migrationSource, /\bBEGIN\b/i);
  assert.doesNotMatch(migrationSource, /\bPRAGMA\b/i);
  assert.doesNotMatch(migrationSource, /people_pulse_schema_v22_ready/);
  const journalEntry = migrationJournal.entries.find((entry) => entry.idx === 22);
  assert.equal(journalEntry?.tag, migrationName);

  for (const trigger of questTriggerNames) {
    assert.match(initializeSource, new RegExp(`CREATE TRIGGER IF NOT EXISTS ${trigger}`));
  }
  // The two quest_reward_linking guards belong to system settings and are covered by tests/system-settings.test.mjs.
  assert.equal((initializeSource.match(/CREATE TRIGGER IF NOT EXISTS quest_(?!reward_linking_)[a-z_]+/g) ?? []).length, 10);
  const db = createMigrationDatabase({ installRuntime: false });
  try {
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM pragma_table_info('quest_completions')").get().count, 33);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='trigger' AND name LIKE 'quest_%'").get().count, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='people_pulse_schema_v22_ready'").get().count, 0);
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);

    installQuestRuntimeContract(db);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='trigger' AND name LIKE 'quest_%'").get().count, 10);
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);

    installQuestRuntimeContract(db);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='trigger' AND name LIKE 'quest_%'").get().count, 10, "runtime initialization must be idempotent");
  } finally {
    db.close();
  }
});

test("database guards accept intentional zero-Point completion and reject actor, role and history tampering", () => {
  const db = createMigrationDatabase();
  try {
    db.exec(`
      INSERT INTO rewards (id,title,is_active,stock,inventory_version) VALUES ('reward-one','Reward One',1,2,0);
      INSERT INTO user_accounts (id,role,status,employee_id) VALUES ('admin-account','admin','active',NULL);
      INSERT INTO user_accounts (id,role,status,employee_id) VALUES ('employee-account','employee','active','employee');
      INSERT INTO organization_policies (id,code,category,scope_type,status,version,content_hash,effective_date,effective_to)
        VALUES ('policy-one','points-and-rewards','points_rewards','all','published',1,'hash-one','2000-01-01',NULL);
    `);
    const valid = seedCompletionFixture(db);
    const invalidActorValues = valid.values.slice();
    invalidActorValues[30] = "employee-account";
    assert.throws(() => valid.insert.run(...invalidActorValues), /QUEST_COMPLETION_ACTOR_INVALID/);
    valid.insert.run(...valid.values);
    const completion = db.prepare("SELECT points_awarded AS pointsAwarded, employee_role_id_snapshot AS employeeRole FROM quest_completions WHERE id=?").get(valid.completionId);
    assert.equal(completion.pointsAwarded, 0);
    assert.equal(completion.employeeRole, "role-sales");
    assert.equal(db.prepare("SELECT points FROM point_events WHERE id=?").get(valid.pointEventId).points, 0);
    assert.equal(db.prepare("SELECT points FROM point_ledger WHERE id=?").get(valid.pointLedgerId).points, 0);
    assert.throws(() => valid.insert.run(...valid.values), /UNIQUE constraint failed/);
    assert.throws(() => db.prepare("UPDATE quest_completions SET note='changed' WHERE id=?").run(valid.completionId), /QUEST_COMPLETION_IMMUTABLE/);
    assert.throws(() => db.prepare("DELETE FROM quest_completions WHERE id=?").run(valid.completionId), /QUEST_COMPLETION_IMMUTABLE/);
    assert.throws(() => db.prepare("UPDATE quests SET title='changed' WHERE id=?").run(valid.questId), /QUEST_FULFILLED_TERMS_LOCKED/);
    assert.throws(() => db.prepare("INSERT INTO quest_targets (id,quest_id,target_type,target_key,target_label_snapshot) VALUES ('late-target',?,'employee','employee','Employee One')").run(valid.questId), /QUEST_FULFILLED_TARGETS_LOCKED/);
    db.prepare("UPDATE quests SET status='archived' WHERE id=?").run(valid.questId);
    assert.equal(db.prepare("SELECT status FROM quests WHERE id=?").get(valid.questId).status, "archived");

    const staleRole = seedCompletionFixture(db, { suffix: "-role-race", employeeRole: "role-new", completionRole: "role-old", reward: false });
    assert.throws(() => staleRole.insert.run(...staleRole.values), /QUEST_COMPLETION_EMPLOYEE_UNAVAILABLE/);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM quest_completions WHERE id=?").get(staleRole.completionId).count, 0);
  } finally {
    db.close();
  }
});

test("quest DTOs retain target labels and immutable reward display snapshots", () => {
  assert.match(schemaSource, /export const questTargets = sqliteTable\("quest_targets"[\s\S]*?targetLabelSnapshot: text\("target_label_snapshot"\)\.notNull\(\)/);
  assert.match(dataSource, /export type QuestRecord = \{[\s\S]*?targetEmployees: Array<\{ id: string; label: string \}>[\s\S]*?targetDepartments: Array<\{ id: string; label: string \}>/);
  assert.match(questDtoBlock, /targetEmployees = ownTargets[\s\S]*?label: target\.targetLabelSnapshot \|\| target\.targetKey/);
  assert.match(questDtoBlock, /targetDepartments = ownTargets[\s\S]*?label: target\.targetLabelSnapshot \|\| target\.targetKey/);
  assert.match(saveQuestBlock, /targetLabelSnapshot:[\s\S]{0,240}?activeEmployeesById\.get\(employeeId\)\?\.name/);
  assert.match(saveQuestBlock, /targetLabelSnapshot:[\s\S]{0,240}?departmentsById\.get\(departmentId\)/);
  assert.match(saveQuestBlock, /snapshotJson = JSON\.stringify\(\{ \.\.\.savedQuest, targetEmployeeIds, targetDepartmentIds, targetEmployees, targetDepartments \}\)/);
  assert.match(pageSource, /quest\.targetEmployees\?\.find\(\(target\) => target\.id === employeeId\)\?\.label/);
  assert.match(pageSource, /quest\.targetDepartments\?\.find\(\(target\) => target\.id === departmentId\)\?\.label/);
});

test("quest create, edit, archive and completion actions are typed and admin-only", () => {
  assert.match(dashboardRoute, /type SaveQuestPayload = \{[\s\S]*?action: "saveQuest"[\s\S]*?expectedRevision\?: number[\s\S]*?expectedUpdatedAt\?: string/);
  assert.match(dashboardRoute, /type CompleteQuestForEmployeePayload = \{[\s\S]*?action: "completeQuestForEmployee"[\s\S]*?questId\?: string[\s\S]*?employeeId\?: string[\s\S]*?completionDate\?: string[\s\S]*?evidenceUrl\?: string[\s\S]*?note\?: string[\s\S]*?expectedRevision\?: number[\s\S]*?expectedUpdatedAt\?: string/);
  assert.doesNotMatch(sourceBlock(dashboardRoute, "type CompleteQuestForEmployeePayload", "type EmployeeProfilePayload"), /pointsReward|rewardId|amount|stock/);
  assert.match(dashboardRoute, /request\.json\(\) as[\s\S]*?SaveQuestPayload \| DeleteQuestPayload \| CompleteQuestForEmployeePayload/);
  assert.match(dashboardRoute, /adminOnlyActions = new Set\(\[[\s\S]*?"saveQuest"[\s\S]*?"deleteQuest"[\s\S]*?"completeQuestForEmployee"/);
  assert.match(dashboardRoute, /adminOnlyActions\.has\(payload\.action\) && currentUser\.role !== "admin"/);
  assert.match(dashboardRoute, /canManageQuests: currentUser\.role === "admin"/);
});

test("the server validates quest fields, lifecycle, policy and exact audience shape", () => {
  assert.match(saveQuestBlock, /!title \|\| Array\.from\(title\)\.length > 180/);
  assert.match(saveQuestBlock, /!description \|\| Array\.from\(description\)\.length > 4_000/);
  assert.match(saveQuestBlock, /type !== "individual" && type !== "team" && type !== "activity"/);
  assert.match(saveQuestBlock, /!Number\.isSafeInteger\(requestedProgress\)[\s\S]*?requestedProgress < 0 \|\| requestedProgress > 100/);
  assert.match(saveQuestBlock, /!Number\.isSafeInteger\(pointsReward\)[\s\S]*?pointsReward < 0 \|\| pointsReward > 10_000_000/);
  assert.match(saveQuestBlock, /!isValidIsoDay\(startDate\) \|\| !isValidIsoDay\(endDate\) \|\| endDate < startDate/);
  assert.match(saveQuestBlock, /type === "individual" && \(targetEmployeeIds\.length !== 1 \|\| targetDepartmentIds\.length !== 0\)/);
  assert.match(saveQuestBlock, /type === "team" && \(targetDepartmentIds\.length < 1 \|\| targetDepartmentIds\.length > 50 \|\| targetEmployeeIds\.length !== 0\)/);
  assert.match(saveQuestBlock, /type === "activity" && \(targetEmployeeIds\.length !== 0 \|\| targetDepartmentIds\.length !== 0\)/);
  assert.match(saveQuestBlock, /from\(employees\)\.where\(eq\(employees\.status, "active"\)\)/);
  assert.match(saveQuestBlock, /targetDepartmentIds\.some\(\(departmentId\) => !departmentsById\.has\(departmentId\)\)/);
  assert.match(saveQuestBlock, /sourceQuest\.status === "draft" && \(status === "draft" \|\| status === "active"\)/);
  assert.match(saveQuestBlock, /sourceQuest\.status === "active" && \(status === "active" \|\| status === "completed"\)/);
  assert.match(saveQuestBlock, /sourceQuest\.status === "completed" && status === "completed"/);
  assert.match(saveQuestBlock, /sourceQuest\?\.status === "archived"[\s\S]*?ประวัติถาวรและไม่สามารถแก้ไขได้/);
  assert.match(saveQuestBlock, /activePointPolicy\.contentHash !== await policyIntegrityHash\(activePointPolicy\)/);
  assert.match(saveQuestBlock, /questRule\.entryMode !== "manual" \|\| !questRule\.authorizedRoles\.includes\("admin"\)/);
  assert.match(saveQuestBlock, /pointsReward > questPointLimit \|\| pointsReward > standardEarnMonthlyCap/);
  assert.match(saveQuestBlock, /activePointRules\.economy\.positiveManualEventsPerMonth < 1/);
});

test("inactive linked rewards are preserved only for safe existing edits", () => {
  assert.match(saveQuestBlock, /const preservesExistingReward = Boolean\(rewardId && sourceQuest\?\.rewardId === rewardId\)/);
  assert.match(saveQuestBlock, /const activatesDraftQuest = sourceQuest\?\.status === "draft" && status === "active"/);
  assert.match(saveQuestBlock, /!linkedReward\.isActive && \(!preservesExistingReward \|\| activatesDraftQuest\)/);
  assert.match(saveQuestBlock, /rewardTitleSnapshot = preservesExistingReward[\s\S]*?sourceQuest\?\.rewardTitleSnapshot/);
  assert.match(saveQuestBlock, /rewardIconSnapshot = preservesExistingReward[\s\S]*?sourceQuest\?\.rewardIconSnapshot/);
  assert.match(pageSource, /const questPreservesInactiveReward = Boolean\(editingQuest\?\.rewardId && editingQuest\.rewardId === questForm\.rewardId && !\(editingQuest\.status === "draft" && questForm\.status === "active"\)\)/);
  assert.match(pageSource, /const questRewardUnavailable = Boolean\(questForm\.rewardId\) && !questSelectedReward\?\.isActive && !questPreservesInactiveReward/);
});

test("quest edits use CAS, append-only revisions and freeze fulfilled economic terms and targets", () => {
  assert.match(saveQuestBlock, /sourceQuest\.updatedAt !== expectedUpdatedAt \|\| sourceQuest\.revision !== expectedRevision/);
  assert.match(saveQuestBlock, /const revision = sourceQuest \? sourceQuest\.revision \+ 1 : 0/);
  assert.match(saveQuestBlock, /UPDATE quests SET[\s\S]*?WHERE id = \? AND revision = \? AND updated_at = \?/);
  assert.match(saveQuestBlock, /INSERT INTO quest_mutation_events[\s\S]*?expected_revision[\s\S]*?expected_updated_at[\s\S]*?snapshot_json/);
  assert.match(saveQuestBlock, /await d1\.batch\(\[[\s\S]*?mutationEventStatement,[\s\S]*?updateQuestStatement,[\s\S]*?DELETE FROM quest_targets[\s\S]*?targetStatements/);
  assert.match(saveQuestBlock, /existingCompletion[\s\S]*?fulfilledTermsChanged[\s\S]*?sourceQuest\.type !== type[\s\S]*?sourceQuest\.description !== description[\s\S]*?sourceQuest\.pointsReward !== pointsReward[\s\S]*?sourceQuest\.rewardId !== rewardId[\s\S]*?sourceQuest\.startDate !== startDate[\s\S]*?sourceQuest\.endDate !== endDate[\s\S]*?targetsChanged/);
  assert.match(initializeSource, /CREATE TRIGGER IF NOT EXISTS quest_fulfilled_terms_lock[\s\S]*?QUEST_FULFILLED_TERMS_LOCKED/);
  for (const operation of ["insert", "update", "delete"]) {
    assert.match(initializeSource, new RegExp(`quest_target_fulfilled_${operation}_guard[\\s\\S]*?QUEST_FULFILLED_TARGETS_LOCKED`));
  }
  assert.match(initializeSource, /quest_mutation_event_update_guard[\s\S]*?QUEST_MUTATION_EVENT_IMMUTABLE/);
  assert.match(initializeSource, /quest_mutation_event_delete_guard[\s\S]*?QUEST_MUTATION_EVENT_IMMUTABLE/);
});

test("deleting a quest is a confirmed terminal soft archive that preserves fulfillment history", () => {
  assert.match(deleteQuestBlock, /const requiredConfirmation = `ลบเควส \$\{sourceQuest\.title\}`/);
  assert.match(deleteQuestBlock, /payload\.confirmation !== requiredConfirmation/);
  assert.match(deleteQuestBlock, /sourceQuest\.updatedAt !== expectedUpdatedAt \|\| sourceQuest\.revision !== expectedRevision/);
  assert.match(deleteQuestBlock, /status: "archived"[\s\S]*?revision: sourceQuest\.revision \+ 1/);
  assert.match(deleteQuestBlock, /UPDATE quests SET status = 'archived'[\s\S]*?WHERE id = \? AND revision = \? AND updated_at = \?/);
  assert.match(deleteQuestBlock, /disposition: "archived"[\s\S]*?deleted: false[\s\S]*?archived: true/);
  assert.doesNotMatch(deleteQuestBlock, /DELETE FROM (?:quests|quest_targets|quest_mutation_events|quest_completions)|db\.delete\((?:quests|questTargets|questMutationEvents|questCompletions)\)/);
  assert.doesNotMatch(deleteQuestBlock, /UPDATE rewards|INSERT INTO point_ledger|INSERT INTO point_events/);
});

test("quest and completion GET visibility is role-scoped and hides actor IDs from non-admin users", () => {
  assert.match(questVisibilityBlock, /if \(currentUser\.role === "admin"\) return true/);
  assert.match(questVisibilityBlock, /if \(quest\.status !== "active"\) return false/);
  assert.match(questVisibilityBlock, /if \(quest\.type === "activity"\) return true/);
  assert.match(questVisibilityBlock, /quest\.type === "team"[\s\S]*?target\.targetType === "department" && target\.targetKey === employeeDepartmentId/);
  assert.match(questVisibilityBlock, /currentUser\.role === "manager"[\s\S]*?target\.targetType === "employee" && visibleEmployeeIds\.has\(target\.targetKey\)/);
  assert.match(questVisibilityBlock, /visibleQuestCompletions = questCompletionRows[\s\S]*?currentUser\.role === "admin" \|\| visibleEmployeeIds\.has\(completion\.employeeId\)/);
  assert.match(questVisibilityBlock, /questCompletionDto\(completion, currentUser\.role === "admin"\)/);
  assert.match(questDtoBlock, /includeAdminMetadata \? \{ createdByUserId, createdByName, updatedByUserId, updatedByName \} : \{\}/);
  assert.match(questDtoBlock, /const \{ completedByUserId, \.\.\.publicCompletion \} = completion[\s\S]*?includeAdminMetadata \? \{ completedByUserId \} : \{\}/);
  assert.match(dashboardRoute, /questCompletions: visibleQuestCompletions/);
});

test("save and archive never award value; completion is the sole quest economy path", () => {
  const catalogMutationBlocks = `${saveQuestBlock}\n${deleteQuestBlock}`;
  assert.match(questDtoBlock, /pointsAwardMode: "admin_verified_completion"/);
  assert.match(questDtoBlock, /rewardFulfillmentMode: quest\.rewardId \? "admin_verified_completion"[\s\S]*?: "none"/);
  assert.match(questDtoBlock, /ตรวจหลักฐานแล้วใช้ “ตรวจผลและมอบสิทธิ์”/);
  assert.doesNotMatch(catalogMutationBlocks, /UPDATE rewards|INSERT INTO point_ledger|INSERT INTO point_events|INSERT INTO quest_completions/);
  assert.match(recordPointEventBlock, /if \(eventType === "quest"\)[\s\S]*?Points จากเควสต้องตรวจหลักฐานและมอบสิทธิ์จากศูนย์เควสเท่านั้น[\s\S]*?status: 409/);
  assert.match(pageSource, /manualPointEventTypes = [\s\S]*?filter\(\(eventType\) => eventType !== "quest"/);
});

test("completion validates CAS, actor, audience, Bangkok date, evidence and immutable snapshots", () => {
  assert.match(completeQuestBlock, /currentUser\.employeeId === employeeId[\s\S]*?status: 403/);
  assert.match(completeQuestBlock, /quest\.status !== "active" && quest\.status !== "completed"/);
  assert.match(completeQuestBlock, /quest\.updatedAt !== expectedUpdatedAt \|\| quest\.revision !== expectedRevision/);
  assert.match(completeQuestBlock, /quest\.type === "activity"[\s\S]*?quest\.type === "individual"[\s\S]*?target\.targetType === "employee"[\s\S]*?quest\.type === "team"[\s\S]*?target\.targetType === "department"/);
  assert.match(completeQuestBlock, /const today = bangkokIsoDay\(\)/);
  assert.match(completeQuestBlock, /!isValidIsoDay\(completionDate\) \|\| completionDate > today/);
  assert.match(completeQuestBlock, /completionDate < quest\.startDate \|\| completionDate > quest\.endDate/);
  assert.match(completeQuestBlock, /isoDayDistance\(completionDate, today\) > 90/);
  assert.match(completeQuestBlock, /!evidenceUrl \|\| evidenceUrl\.length > 1_200 \|\| !isSafeHttpsUrl\(evidenceUrl\)/);
  assert.match(completeQuestBlock, /!note \|\| Array\.from\(note\)\.length > 1_000/);
  assert.match(completeQuestBlock, /employeeRoleIdSnapshot: employee\.roleId/);
  assert.match(completeQuestBlock, /employeeDepartmentIdSnapshot: employeeDepartmentId/);
  assert.match(initializeSource, /QUEST_COMPLETION_ACTOR_INVALID[\s\S]*?QUEST_COMPLETION_STALE_QUEST[\s\S]*?role_id = NEW\.employee_role_id_snapshot[\s\S]*?QUEST_COMPLETION_EMPLOYEE_NOT_ELIGIBLE/);
});

test("completion selects the historical policy, enforces caps and awards the exact configured Points", () => {
  assert.match(policySelectorBlock, /row\.code === "points-and-rewards" && row\.category === "points_rewards" && row\.scopeType === "all" && isPolicyEffective\(row, day\)/);
  assert.match(policySelectorBlock, /sort\(\(a, b\) => b\.version - a\.version\)\[0\]/);
  assert.match(completeQuestBlock, /pointPolicyFromRows\(pointPolicyRows, completionDate\)/);
  assert.match(completeQuestBlock, /completionPolicy\.contentHash !== await policyIntegrityHash\(completionPolicy\)/);
  assert.match(completeQuestBlock, /questRule\.entryMode !== "manual" \|\| !questRule\.authorizedRoles\.includes\("admin"\)/);
  assert.match(completeQuestBlock, /quest\.pointsReward > questPointPolicyLimit/);
  assert.match(completeQuestBlock, /questCompletionsThisMonth >= maxManualQuestCompletions/);
  assert.match(completeQuestBlock, /positiveEventsThisMonth \+ workAwardsThisMonth \+ quest\.pointsReward > standardEarnMonthlyCap/);
  assert.match(completeQuestBlock, /quest\.rewardId && \(!linkedReward \|\| !linkedReward\.isActive \|\| linkedReward\.stock <= 0\)/);
  assert.match(completeQuestBlock, /eventType: "quest" as const,[\s\S]*?points: quest\.pointsReward/);
  assert.match(completeQuestBlock, /sourceType: "quest" as const,[\s\S]*?sourceId: completionId,[\s\S]*?points: quest\.pointsReward/);
  assert.doesNotMatch(completeQuestBlock, /Math\.(?:min|max)\([^\n]*quest\.pointsReward|points:\s*questPointPolicyLimit/);
  assert.match(completeQuestBlock, /pointsAwarded: quest\.pointsReward/);
  assert.match(completeQuestBlock, /policyId: policyMetadata\.policyId[\s\S]*?policyVersion: policyMetadata\.policyVersion[\s\S]*?policyContentHash: policyMetadata\.policyContentHash/);
});

test("completion is atomic, inventory-CAS guarded and idempotent before and after a race", () => {
  assert.match(completeQuestBlock, /priorCompletion[\s\S]*?return completionResponse\(priorCompletion, true\)/);
  assert.match(completeQuestBlock, /const statements = \[[\s\S]*?INSERT INTO point_events[\s\S]*?INSERT INTO point_mutation_claims[\s\S]*?INSERT INTO point_cap_claims[\s\S]*?INSERT INTO point_ledger[\s\S]*?INSERT INTO quest_completions/);
  assert.match(completeQuestBlock, /UPDATE rewards SET stock = stock - 1, inventory_version = inventory_version \+ 1[\s\S]*?WHERE id = \? AND is_active = 1 AND stock > 0 AND inventory_version = \?/);
  assert.match(completeQuestBlock, /UPDATE rewards SET title = CASE WHEN changes\(\) = 1 THEN title ELSE NULL END/);
  assert.match(completeQuestBlock, /await d1\.batch\(statements\)/);
  assert.match(completeQuestBlock, /racedCompletion[\s\S]*?return completionResponse\(racedCompletion, true\)/);
  assert.match(completeQuestBlock, /QUEST_COMPLETION_[\s\S]*?status: 409/);
  assert.match(completeQuestBlock, /idempotentReplay: false \}, \{ status: 201 \}/);
  assert.match(schemaSource, /quest_completions_quest_employee_unique/);
  assert.match(initializeSource, /quest_completion_update_guard[\s\S]*?QUEST_COMPLETION_IMMUTABLE/);
  assert.match(initializeSource, /quest_completion_delete_guard[\s\S]*?QUEST_COMPLETION_IMMUTABLE/);
});

test("the Quest Center is the prominent default and renders all scoped quest types and fulfillment history", () => {
  assert.match(pageSource, /type WorkSection = "quests" \| "tasks" \| "projects" \| "points" \| "rewards"/);
  assert.match(pageSource, /useState<WorkSection>\("quests"\)/);
  assert.match(pageSource, /\{ id: "quests", icon: "Q", label: "ศูนย์เควส"[\s\S]*?\{ id: "tasks", icon: "\u2713"/);
  assert.match(pageSource, /id="quest-center-title">ภารกิจเด่นของคนและทีม/);
  assert.match(pageSource, /questTypeMeta:[\s\S]*?individual: \{ label: "เควสรายบุคคล"[\s\S]*?team: \{ label: "เควสแบบทีม"[\s\S]*?activity: \{ label: "เควสกิจกรรม"/);
  assert.match(pageSource, /<article key=\{quest\.id\} data-quest-id=\{quest\.id\} className=\{`quest-card/);
  for (const copy of ["Points ที่ประกาศ", "รางวัลพิเศษ", "ผู้เข้าร่วม", "ความคืบหน้า", "เควสเด่น"]) {
    assert.ok(pageSource.includes(copy), `quest center must display ${copy}`);
  }
  assert.match(pageSource, /className="quest-own-fulfillment" role="status"[\s\S]*?<strong>ได้รับสิทธิ์แล้ว<\/strong>/);
  assert.match(pageSource, /className="quest-fulfillment-count"[\s\S]*?completions\.length/);
  assert.match(pageSource, /permissions\.canManageQuests && completions\.length > 0 && <details className="quest-fulfillment-history"[\s\S]*?employeeNameSnapshot[\s\S]*?employeeDepartmentNameSnapshot[\s\S]*?completion\.note[\s\S]*?completedByName[\s\S]*?completion\.evidenceUrl/);
});

test("quest management and fulfillment UI are admin-only, policy-aware and replay-safe", () => {
  assert.match(pageSource, /permissions\.canManageQuests && !isEmployeePreview && <button type="button" onClick=\{\(\) => openQuestEditor\(\)\}/);
  assert.match(pageSource, /showQuestForm && permissions\.canManageQuests && !isEmployeePreview/);
  assert.match(openQuestEditorBlock, /quest\?\.status === "archived"[\s\S]*?ข้อมูลอ่านอย่างเดียว ไม่สามารถแก้ไขหรือเปิดกลับได้/);
  assert.match(uiSaveQuestBlock, /action: "saveQuest"[\s\S]*?expectedRevision: editingQuest\?\.revision[\s\S]*?expectedUpdatedAt: editingQuest\?\.updatedAt/);
  assert.match(uiDeleteQuestBlock, /เก็บเควสเป็นประวัติ[\s\S]*?ไม่เปลี่ยนรายการ Points หรือรางวัลย้อนหลัง/);
  assert.match(uiDeleteQuestBlock, /action: "deleteQuest"[\s\S]*?confirmation: `ลบเควส \$\{quest\.title\}`/);
  assert.doesNotMatch(uiDeleteQuestBlock, /setQuests\([\s\S]*?\.filter\(/);

  assert.match(pageSource, /permissions\.canManageQuests && !isEmployeePreview && quest\.status !== "archived"[\s\S]*?button type="button" className="fulfill"[\s\S]*?>ตรวจผลและมอบสิทธิ์<\/button>/);
  assert.match(pageSource, /completedEmployeeIds[\s\S]*?employee\.id !== currentUser\?\.employeeId[\s\S]*?!completedEmployeeIds\.has\(employee\.id\)/);
  assert.match(uiCompleteQuestBlock, /action: "completeQuestForEmployee"[\s\S]*?questId: questToFulfill\.id[\s\S]*?employeeId: questCompletionForm\.employeeId[\s\S]*?completionDate: questCompletionForm\.completionDate[\s\S]*?expectedRevision: questToFulfill\.revision[\s\S]*?expectedUpdatedAt: questToFulfill\.updatedAt[\s\S]*?evidenceUrl:[\s\S]*?note:/);
  assert.match(uiCompleteQuestBlock, /setQuestCompletions\([\s\S]*?setPointEvents\([\s\S]*?setPointLedger\([\s\S]*?setRewards\(/);
  assert.match(uiCompleteQuestBlock, /body\.idempotentReplay[\s\S]*?ระบบไม่มอบสิทธิ์ซ้ำ/);
  assert.match(pageSource, /publishedOrganizationPolicies[\s\S]*?policy\.code === "points-and-rewards" && policy\.category === "points_rewards" && policy\.scopeType === "all"[\s\S]*?policy\.effectiveDate <= questCompletionForm\.completionDate[\s\S]*?sort\(\(a, b\) => b\.version - a\.version\)\[0\]/);
  assert.match(pageSource, /questCompletionMonthlyLimitReached[\s\S]*?questCompletionStandardCapExceeded[\s\S]*?questCompletionRewardUnavailable[\s\S]*?questCompletionReady/);
});

test("quest forms, progress, dialogs and notifications are accessible and responsive", () => {
  assert.match(pageSource, /hasBlockingOverlay = Boolean\([\s\S]*?showQuestForm \|\| questToFulfill/);
  assert.match(pageSource, /event\.key === "Escape"[\s\S]*?setShowQuestForm\(false\)[\s\S]*?setQuestToFulfill\(null\)/);
  assert.match(pageSource, /<form className="quest-form-modal"[\s\S]*?role="dialog" aria-modal="true" aria-labelledby="quest-form-title"/);
  assert.match(pageSource, /<form className="quest-fulfillment-modal"[\s\S]*?role="dialog" aria-modal="true" aria-labelledby="quest-fulfillment-title"/);
  assert.match(pageSource, /<select autoFocus required[\s\S]*?>เลือกพนักงาน<\/option>/);
  assert.match(pageSource, /type="date" min=\{questCompletionMinDate\} max=\{questCompletionMaxDate\}/);
  assert.match(pageSource, /type="url" inputMode="url" pattern="https:\/\/\.\*" maxLength=\{1200\}/);
  assert.match(pageSource, /บันทึกผลการตรวจ[\s\S]*?<textarea required maxLength=\{1000\}/);
  assert.match(pageSource, /readOnly aria-readonly="true" value=\{`\$\{formatMoney\(questToFulfill\.pointsReward\)\} Points`\}/);
  assert.match(pageSource, /role="progressbar" aria-label=\{`ความคืบหน้าเควส/);
  assert.match(pageSource, /aria-valuemin=\{0\} aria-valuemax=\{100\} aria-valuenow=\{quest\.progress\}/);
  assert.match(notificationBlock, /quests\.filter\(\(quest\) => quest\.status === "active"\)[\s\S]*?questId: quest\.id[\s\S]*?actionLabel: "เปิดศูนย์เควส"/);
  assert.match(openNotificationBlock, /if \(notification\.questId\)[\s\S]*?setWorkSection\("quests"\)[\s\S]*?data-quest-id/);
  assert.match(cssSource, /\.quest-type-filters button,[\s\S]*?\.quest-card-actions button,[\s\S]*?\.quest-empty button \{ min-height: 44px; \}/);
  assert.match(cssSource, /@media \(max-width: 900px\)[\s\S]*?\.quest-card-grid \{ grid-template-columns: 1fr; \}/);
  assert.match(cssSource, /@media \(max-width: 640px\)[\s\S]*?\.quest-fulfillment-modal[\s\S]*?\.quest-fulfillment-grid \{ grid-template-columns: 1fr; \}/);
  assert.match(cssSource, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.quest-hero-orbit/);
});

test("the built Sites artifact ships the exact migration and complete Quest Center contract", async () => {
  const packagedMigration = await readFile(path.join(projectRoot, `dist/.openai/drizzle/${migrationName}.sql`), "utf8");
  assert.equal(packagedMigration, migrationSource);
  const packagedMigrations = (await readdir(path.join(projectRoot, "dist/.openai/drizzle"))).filter((name) => name.startsWith("0022_") && name.endsWith(".sql"));
  assert.deepEqual(packagedMigrations, [`${migrationName}.sql`]);

  const assetDirectory = path.join(projectRoot, "dist/client/assets");
  const assetNames = (await readdir(assetDirectory)).filter((name) => name.endsWith(".js"));
  const bundle = (await Promise.all(assetNames.map((name) => readFile(path.join(assetDirectory, name), "utf8")))).join("\n");
  for (const copy of [
    "ศูนย์เควส",
    "ภารกิจเด่นของคนและทีม",
    "สร้างเควสใหม่",
    "เควสรายบุคคล",
    "เควสแบบทีม",
    "เควสกิจกรรม",
    "Points เมื่อสำเร็จ",
    "รางวัลพิเศษ",
    "เก็บเควสเป็นประวัติ",
    "ตรวจผลและมอบสิทธิ์",
    "พนักงานที่ผ่านเควส",
    "ลิงก์หลักฐาน HTTPS",
    "บันทึกผลการตรวจ",
    "ได้รับสิทธิ์แล้ว",
    "ระบบไม่มอบสิทธิ์ซ้ำ",
    "ไม่มีนโยบาย Points ที่ใช้กับวันที่ทำสำเร็จ",
    "ระบบจะไม่มอบเพียงบางส่วน",
  ]) {
    assert.ok(bundle.includes(copy), `built Quest Center must include: ${copy}`);
  }
});
