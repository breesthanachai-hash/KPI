import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationName = "0024_gifted_peter_parker";

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
  settingsRoute,
  settingsLibrary,
  dashboardRoute,
  schemaSource,
  initializeSource,
  pageSource,
  cssSource,
  migrationSource,
  migrationSnapshot,
  previousSnapshot,
  migrationJournal,
] = await Promise.all([
  source("app/api/system-settings/route.ts"),
  source("lib/system-settings.ts"),
  source("app/api/dashboard/route.ts"),
  source("db/schema.ts"),
  source("db/initialize.ts"),
  source("app/page.tsx"),
  source("app/globals.css"),
  source(`drizzle/${migrationName}.sql`),
  source("drizzle/meta/0024_snapshot.json").then(JSON.parse),
  source("drizzle/meta/0023_snapshot.json").then(JSON.parse),
  source("drizzle/meta/_journal.json").then(JSON.parse),
]);

const runtimeTriggerNames = [
  "user_accounts_preserve_system_owner_update",
  "user_accounts_preserve_system_owner_delete",
  "quest_reward_linking_insert_guard",
  "quest_reward_linking_update_guard",
  "system_settings_singleton_insert_guard",
  "system_settings_update_guard",
  "system_settings_delete_guard",
  "system_settings_event_insert_guard",
  "system_settings_event_update_guard",
  "system_settings_event_delete_guard",
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

const settingsSeedSql = initializerPreparedSql("INSERT INTO system_settings (");
const runtimeTriggerSql = runtimeTriggerNames.map((name) => initializerPreparedSql(`CREATE TRIGGER IF NOT EXISTS ${name}`));
const v24MarkerSql = initializerPreparedSql("CREATE TABLE IF NOT EXISTS people_pulse_schema_v24_ready");

function settingsDto(row) {
  return {
    id: "global",
    revision: row.revision,
    organization: { name: row.organization_name, shortName: row.organization_short_name },
    experience: {
      navigationMode: row.navigation_mode,
      adminHome: row.admin_home,
      managerHome: row.manager_home,
      employeeHome: row.employee_home,
    },
    features: {
      aiAssistantEnabled: Boolean(row.ai_assistant_enabled),
      aiMascotEnabled: Boolean(row.ai_mascot_enabled),
      office3dEnabled: Boolean(row.office_3d_enabled),
      questRewardLinkingEnabled: Boolean(row.quest_reward_linking_enabled),
    },
    updatedAt: row.updated_at,
    updatedByName: row.updated_by_name,
  };
}

function createSettingsDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE user_accounts (
      id TEXT PRIMARY KEY NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL
    );
    CREATE TABLE quests (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      reward_id TEXT
    );
  `);
  for (const statement of migrationStatements()) db.exec(statement);
  db.exec(settingsSeedSql);
  db.prepare("INSERT INTO user_accounts (id,role,status) VALUES ('user-owner','admin','active'),('admin-2','admin','active')").run();
  for (const statement of runtimeTriggerSql) db.exec(statement);
  db.exec(v24MarkerSql);
  return db;
}

function updateSettings(db, changes, {
  eventId = "settings-event-1",
  actorUserId = "user-owner",
  actorName = "System Owner",
  resultingAt = "2026-09-10T12:00:00.000Z",
} = {}) {
  const current = db.prepare("SELECT * FROM system_settings WHERE id='global'").get();
  const previous = settingsDto(current);
  const nextRow = { ...current, ...changes };
  nextRow.revision = current.revision + 1;
  nextRow.updated_by_user_id = actorUserId;
  nextRow.updated_by_name = actorName;
  nextRow.updated_at = resultingAt;
  const next = settingsDto(nextRow);
  const fieldMap = [
    ["organization.name", "organization_name"],
    ["organization.shortName", "organization_short_name"],
    ["experience.navigationMode", "navigation_mode"],
    ["experience.adminHome", "admin_home"],
    ["experience.managerHome", "manager_home"],
    ["experience.employeeHome", "employee_home"],
    ["features.aiAssistantEnabled", "ai_assistant_enabled"],
    ["features.aiMascotEnabled", "ai_mascot_enabled"],
    ["features.office3dEnabled", "office_3d_enabled"],
    ["features.questRewardLinkingEnabled", "quest_reward_linking_enabled"],
  ];
  const changedKeys = fieldMap.filter(([, column]) => nextRow[column] !== current[column]).map(([key]) => key);
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(`INSERT INTO system_settings_events (
      id,settings_id,previous_revision,next_revision,expected_updated_at,resulting_updated_at,
      previous_snapshot,next_snapshot,changed_keys,actor_user_id,actor_name,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      eventId,
      "global",
      current.revision,
      nextRow.revision,
      current.updated_at,
      resultingAt,
      JSON.stringify(previous),
      JSON.stringify(next),
      JSON.stringify(changedKeys),
      actorUserId,
      actorName,
      resultingAt,
    );
    db.prepare(`UPDATE system_settings SET
      organization_name=?,organization_short_name=?,navigation_mode=?,admin_home=?,manager_home=?,employee_home=?,
      ai_assistant_enabled=?,ai_mascot_enabled=?,office_3d_enabled=?,quest_reward_linking_enabled=?,
      revision=?,updated_by_user_id=?,updated_by_name=?,updated_at=?
      WHERE id='global' AND revision=? AND updated_at=?`).run(
      nextRow.organization_name,
      nextRow.organization_short_name,
      nextRow.navigation_mode,
      nextRow.admin_home,
      nextRow.manager_home,
      nextRow.employee_home,
      nextRow.ai_assistant_enabled,
      nextRow.ai_mascot_enabled,
      nextRow.office_3d_enabled,
      nextRow.quest_reward_linking_enabled,
      nextRow.revision,
      actorUserId,
      actorName,
      resultingAt,
      current.revision,
      current.updated_at,
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return next;
}

test("v24 migration is additive, Sites-safe and journaled after v23", () => {
  assert.ok(migrationStatements().every((statement) => /^CREATE (?:TABLE|(?:UNIQUE )?INDEX)\b/.test(statement)));
  assert.doesNotMatch(migrationSource, /\bCREATE\s+TRIGGER\b|\bBEGIN\b|\bPRAGMA\b|people_pulse_schema_v24_ready/i);
  assert.ok(migrationSnapshot.tables.system_settings);
  assert.ok(migrationSnapshot.tables.system_settings_events);
  assert.equal(migrationSnapshot.prevId, previousSnapshot.id);
  assert.equal(migrationJournal.entries.at(-1)?.idx, 24);
  assert.equal(migrationJournal.entries.at(-1)?.tag, migrationName);
  assert.match(schemaSource, /export const systemSettings = sqliteTable\("system_settings"/);
  assert.match(schemaSource, /export const systemSettingsEvents = sqliteTable\("system_settings_events"/);
});

test("runtime installs owner/audit/linking guards before the final v24 marker and remains retry-safe", () => {
  assert.match(initializeSource, /LATEST_SCHEMA_MARKER = "people_pulse_schema_v24_ready"/);
  const markerIndex = initializeSource.lastIndexOf("CREATE TABLE IF NOT EXISTS people_pulse_schema_v24_ready");
  assert.ok(markerIndex > 0);
  for (const name of runtimeTriggerNames) {
    const triggerIndex = initializeSource.indexOf(`CREATE TRIGGER IF NOT EXISTS ${name}`);
    assert.ok(triggerIndex >= 0 && triggerIndex < markerIndex, `${name} must precede readiness`);
  }
  assert.match(settingsSeedSql, /SELECT 'global'[\s\S]*?WHERE NOT EXISTS \(SELECT 1 FROM system_settings\)/);
  assert.match(v24MarkerSql, /CHECK \(schema_version = 24\)/);

  const db = createSettingsDatabase();
  try {
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='trigger' AND name IN (" + runtimeTriggerNames.map(() => "?").join(",") + ")").get(...runtimeTriggerNames).count, runtimeTriggerNames.length);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM people_pulse_schema_v24_ready").get().count, 0);
    db.exec(settingsSeedSql);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM system_settings").get().count, 1);
    for (const statement of runtimeTriggerSql) db.exec(statement);
    db.exec(v24MarkerSql);
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
  } finally {
    db.close();
  }
});

test("only the active system owner can apply an exact audited settings revision", () => {
  const db = createSettingsDatabase();
  try {
    assert.throws(() => db.prepare("UPDATE user_accounts SET role='manager' WHERE id='user-owner'").run(), /SYSTEM_OWNER_REQUIRED/);
    assert.throws(() => db.prepare("DELETE FROM user_accounts WHERE id='user-owner'").run(), /SYSTEM_OWNER_REQUIRED/);
    assert.throws(() => db.prepare("UPDATE system_settings SET navigation_mode='full',revision=1,updated_by_user_id='admin-2',updated_by_name='Other Admin',updated_at='2026-09-10T11:00:00.000Z' WHERE id='global'").run(), /SYSTEM_SETTINGS_OWNER_REQUIRED/);
    assert.throws(() => db.prepare("UPDATE system_settings SET navigation_mode='full',revision=1,updated_by_user_id='user-owner',updated_by_name='System Owner',updated_at='2026-09-10T11:00:00.000Z' WHERE id='global'").run(), /SYSTEM_SETTINGS_AUDIT_REQUIRED/);

    const next = updateSettings(db, { navigation_mode: "full", admin_home: "overview" });
    assert.equal(next.revision, 1);
    assert.equal(db.prepare("SELECT navigation_mode FROM system_settings WHERE id='global'").get().navigation_mode, "full");
    assert.deepEqual(JSON.parse(db.prepare("SELECT changed_keys FROM system_settings_events WHERE id='settings-event-1'").get().changed_keys), ["experience.navigationMode", "experience.adminHome"]);
    assert.throws(() => db.prepare("UPDATE system_settings_events SET actor_name='Tampered' WHERE id='settings-event-1'").run(), /SYSTEM_SETTINGS_EVENT_IMMUTABLE/);
    assert.throws(() => db.prepare("DELETE FROM system_settings_events WHERE id='settings-event-1'").run(), /SYSTEM_SETTINGS_EVENT_IMMUTABLE/);
    assert.throws(() => db.prepare("DELETE FROM system_settings WHERE id='global'").run(), /SYSTEM_SETTINGS_IMMUTABLE_SINGLETON/);
  } finally {
    db.close();
  }
});

test("disabled quest-reward linking blocks only new relationships and preserves existing work", () => {
  const db = createSettingsDatabase();
  try {
    db.prepare("INSERT INTO quests (id,title,reward_id) VALUES ('existing','Existing quest','reward-a')").run();
    updateSettings(db, { quest_reward_linking_enabled: 0 }, { eventId: "settings-disable-linking" });
    db.prepare("INSERT INTO quests (id,title,reward_id) VALUES ('plain','Plain quest',NULL)").run();
    db.prepare("UPDATE quests SET title='Edited safely' WHERE id='existing'").run();
    assert.equal(db.prepare("SELECT reward_id FROM quests WHERE id='existing'").get().reward_id, "reward-a");
    assert.throws(() => db.prepare("INSERT INTO quests (id,title,reward_id) VALUES ('new-linked','New link','reward-b')").run(), /QUEST_REWARD_LINKING_DISABLED/);
    assert.throws(() => db.prepare("UPDATE quests SET reward_id='reward-b' WHERE id='existing'").run(), /QUEST_REWARD_LINKING_DISABLED/);
    db.prepare("UPDATE quests SET reward_id=NULL WHERE id='existing'").run();
    assert.equal(db.prepare("SELECT reward_id FROM quests WHERE id='existing'").get().reward_id, null);
  } finally {
    db.close();
  }
});

test("owner-only API gates before parsing and validates bounded connected settings", () => {
  assert.match(settingsLibrary, /currentUser\.id === "user-owner" && currentUser\.role === "admin" && currentUser\.status === "active"/);
  assert.match(settingsRoute, /const authentication = await ownerGate\(request\);[\s\S]*?if \(authentication\.response\) return authentication\.response;[\s\S]*?const payload = await readSettingsInput\(request\)/);
  assert.match(settingsRoute, /เฉพาะบัญชีเจ้าของระบบที่มีสิทธิ์สูงสุดเท่านั้น/);
  assert.match(settingsRoute, /const MAX_BODY_LENGTH = 16_384/);
  assert.match(settingsRoute, /payload\.action !== "saveSystemSettings"/);
  assert.match(settingsRoute, /Number\.isSafeInteger\(payload\.expectedRevision\)/);
  assert.match(settingsRoute, /Array\.from\(organizationName\)\.length < 2[\s\S]*?> 80/);
  assert.match(settingsRoute, /Array\.from\(organizationShortName\)\.length < 2[\s\S]*?> 30/);
  assert.match(settingsRoute, /aiMascotEnabled && !aiAssistantEnabled/);
  assert.match(settingsRoute, /previousRevision: current\.revision[\s\S]*?nextRevision[\s\S]*?changedKeys/);
  assert.match(settingsRoute, /await d1\.batch\(\[[\s\S]*?INSERT INTO system_settings_events[\s\S]*?UPDATE system_settings SET/);
  assert.match(settingsRoute, /WHERE id = \? AND revision = \? AND updated_at = \?/);
});

test("dashboard exposes only the safe presentation subset and a server-derived owner permission", () => {
  assert.match(settingsLibrary, /export type PublicSystemSettingsDto = Omit<SystemSettingsDto, "id" \| "updatedAt" \| "updatedByName">/);
  const publicDtoBlock = sourceBlock(settingsLibrary, "export function publicSystemSettingsDto", "export function systemSettingsEventDto");
  assert.doesNotMatch(publicDtoBlock, /updatedBy|actor|previousSnapshot|nextSnapshot/);
  assert.match(dashboardRoute, /const publicSystemSettings = await getPublicSystemSettings\(\)/);
  assert.match(dashboardRoute, /canManageSystemSettings: canManageSystemSettings\(currentUser\) && !employeePreview/);
  assert.match(dashboardRoute, /suppliedAccountId === "user-owner"[\s\S]*?บัญชีเจ้าของระบบเป็นสิทธิ์สูงสุด/);
  assert.match(dashboardRoute, /publicSystemSettings,/);
  assert.match(dashboardRoute, /rewardId && !preservesExistingReward && !\(await getSystemSettingsRow\(\)\)\.questRewardLinkingEnabled/);
  assert.doesNotMatch(settingsLibrary, /password|token|secret|credential/i);
});

test("system settings never become an authorization or Points-policy mechanism", () => {
  const combined = `${settingsRoute}\n${settingsLibrary}`;
  assert.doesNotMatch(combined, /authCredentials|authSessions|pointLedger|pointEvents|pointPolicyRules|employeeWarnings|employmentContracts/);
  assert.doesNotMatch(schemaSource, /systemSettings[\s\S]{0,800}(?:role|permission|salary|pointsPolicy)/i);
  assert.doesNotMatch(settingsRoute, /canManagePeople|canManageWork|canManageAccounts/);
});

test("UI contract keeps settings owner-only and treats optional features as presentation controls", () => {
  assert.match(pageSource, /type View =[\s\S]*?"settings"/);
  assert.match(pageSource, /const canManageSystemSettings = Boolean\(permissions\.canManageSystemSettings && !isEmployeePreview\)/);
  assert.match(pageSource, /view !== "settings" \|\| \(permissions\.canManageSystemSettings && !isEmployeePreview\)/);
  assert.match(pageSource, /fetch\("\/api\/system-settings"/);
  assert.match(pageSource, /action: "saveSystemSettings"[\s\S]*?expectedRevision: systemSettingsDraft\.revision/);
  assert.match(pageSource, /aiMascotEnabled && !systemSettingsDraft\.features\.aiAssistantEnabled/);
  assert.doesNotMatch(pageSource, /features:\s*\{[^}]*showQuests|features:\s*\{[^}]*showRewards/);
});

test("simplified navigation remains searchable, complete, keyboard-friendly and mobile-safe", () => {
  for (const view of ["overview", "employees", "profiles", "organizationDocs", "skills", "power", "peopleOps", "hr", "portfolio", "work", "office", "access", "settings"]) {
    assert.ok(
      pageSource.includes(`navigateFromWorkspaceMenu(\"${view}\"`) || pageSource.includes(`destinationId === \"${view}\"`) || pageSource.includes(`setView(\"${view}\")`),
      `navigation must retain ${view}`,
    );
  }
  assert.match(pageSource, /showWorkspaceMenu/);
  assert.match(pageSource, /workspaceMenuSearch/);
  assert.match(pageSource, /role="dialog"[\s\S]*?aria-modal="true"/);
  assert.match(pageSource, /workspaceMenuSearchRef/);
  assert.match(pageSource, /permissions\.canManageSystemSettings/);
  assert.match(cssSource, /workspace-menu/);
  assert.match(cssSource, /@media \(max-width: 760px\)[\s\S]*?workspace-menu/);
  assert.match(cssSource, /:focus-visible/);
});

test("production bundle contains the owner Settings Center and simple navigation copy", async () => {
  const assetDirectory = path.join(projectRoot, "dist/client/assets");
  const assets = (await readdir(assetDirectory)).filter((name) => name.endsWith(".js"));
  const bundle = (await Promise.all(assets.map((name) => readFile(path.join(assetDirectory, name), "utf8")))).join("\n");
  for (const copy of ["ศูนย์ตั้งค่าระบบ", "เฉพาะเจ้าของระบบ", "เมนูทั้งหมด", "รูปแบบเมนู", "ผูกรางวัลใหม่กับเควส"]) {
    assert.ok(bundle.includes(copy), `built settings experience must include: ${copy}`);
  }
});
