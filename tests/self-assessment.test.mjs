import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

function source(path) {
  return readFile(new URL(path, projectRoot), "utf8");
}

test("employee self-assessment is stored separately from official evaluation and Points", async () => {
  const [schema, initialize, migration, route] = await Promise.all([
    source("db/schema.ts"),
    source("db/initialize.ts"),
    source("drizzle/0020_silly_mockingbird.sql"),
    source("app/api/dashboard/route.ts"),
  ]);
  for (const code of [schema, initialize, migration]) {
    assert.match(code, /employee_self_assessments/);
    assert.match(code, /employee_self_assessments_employee_period_unique/);
  }
  assert.match(initialize, /LATEST_SCHEMA_MARKER = "people_pulse_schema_v22_ready"/);
  assert.match(migration, /CREATE TABLE `people_pulse_schema_v20_ready`/);
  assert.match(route, /employeePortalActions = new Set\(\[[^\]]*"saveSelfAssessment"/);
  assert.match(route, /currentUser\.role !== "employee" \|\| !currentUser\.employeeId \|\| currentUser\.employeeId !== employeeId/);
  assert.match(route, /selfAssessments: currentUser\.role === "employee" && currentUser\.employeeId[\s\S]*?row\.employeeId === currentUser\.employeeId/);

  const selfSave = route.match(/if \(payload\.action === "saveSelfAssessment"\) \{[\s\S]*?(?=\n    if \(payload\.action === )/)?.[0] ?? "";
  assert.match(selfSave, /db\.insert\(employeeSelfAssessments\)[\s\S]*?onConflictDoUpdate/);
  assert.match(selfSave, /pointEntry: null[\s\S]*?pointEvent: null/);
  assert.doesNotMatch(selfSave, /db\.(?:insert|update)\((?:evaluations|employees|pointLedger|pointEvents)/);
});

test("employee UI saves only their own self-assessment and explains the approval boundary", async () => {
  const page = await source("app/page.tsx");
  assert.match(page, /selfAssessments\?: EmployeeSelfAssessmentRecord\[\]/);
  assert.match(page, /setSelfAssessments\(body\.selfAssessments \?\? \[\]\)/);
  assert.match(page, /action: isSelfAssessment \? "saveSelfAssessment" : "saveEvaluation"/);
  assert.match(page, /currentUser\?\.role === "employee" && currentUser\.employeeId !== employee\.id/);
  assert.match(page, /พนักงานประเมินตนเองได้เฉพาะโปรไฟล์ของตน/);
  assert.match(page, /นี่คือแบบประเมินตนเอง/);
  assert.match(page, /ไม่แทนผลประเมินทางการ ไม่สร้าง Points และคุณไม่สามารถอนุมัติคะแนนของตนเองได้/);
  assert.match(page, /บันทึกแบบประเมินตนเอง/);
});

test("built site includes self-assessment UI and migration", async () => {
  const assetNames = (await readdir(new URL("../dist/client/assets/", import.meta.url))).filter((name) => name.endsWith(".js"));
  const client = (await Promise.all(assetNames.map((name) => source(`dist/client/assets/${name}`)))).join("\n");
  assert.match(client, /saveSelfAssessment/);
  assert.match(client, /บันทึกแบบประเมินตนเอง/);
  assert.match(client, /ไม่แทนผลประเมินทางการ/);
  assert.equal(
    await source("dist/.openai/drizzle/0020_silly_mockingbird.sql"),
    await source("drizzle/0020_silly_mockingbird.sql"),
  );
});
