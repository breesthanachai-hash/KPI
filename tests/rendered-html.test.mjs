import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

test("builds the People Pulse KPI product bundle", async () => {
  const assetRoot = new URL("../dist/client/assets/", import.meta.url);
  const assetNames = await readdir(assetRoot);
  const pageAssetName = assetNames.find((name) => /^page-.*\.js$/.test(name));
  assert.ok(pageAssetName, "expected a built page asset");

  const [pageAsset, layout] = await Promise.all([
    readFile(new URL(pageAssetName, assetRoot), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(pageAsset, /PEOPLE PULSE/);
  assert.match(pageAsset, /ภาพรวม KPI พนักงาน/);
  assert.match(pageAsset, /KPI &amp; SKILL SYSTEM|KPI & SKILL SYSTEM/);
  assert.match(pageAsset, /saveEvaluation/);
  assert.match(pageAsset, /สกิลรายบุคคล/);
  assert.match(pageAsset, /INDIVIDUAL SKILL PROFILE/);
  assert.match(pageAsset, /TALENT FIT ANALYSIS/);
  assert.match(pageAsset, /กราฟสกิลที่ถนัด/);
  assert.match(pageAsset, /ตำแหน่งที่เหมาะสม/);
  assert.match(pageAsset, /รายละเอียดสกิล \(ปัจจุบัน\/เป้าหมาย\)/);
  assert.match(layout, /People Pulse — ระบบวัด KPI พนักงาน/);
  assert.doesNotMatch(pageAsset, /Your site is taking shape|Building your site|codex-preview/i);
});

test("ships durable KPI and skill evaluation storage", async () => {
  const [hosting, migration, packagedMigration, page, schema] = await Promise.all([
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0000_marvelous_pandemic.sql", import.meta.url), "utf8"),
    readFile(new URL("../dist/.openai/drizzle/0000_marvelous_pandemic.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
  ]);

  assert.match(hosting, /"d1":\s*"DB"/);
  assert.match(migration, /CREATE TABLE `employees`/);
  assert.match(migration, /CREATE TABLE `evaluations`/);
  assert.equal(packagedMigration, migration);
  assert.match(schema, /kpiScores/);
  assert.match(schema, /skillScores/);
  assert.match(page, /saveEvaluation/);
  assert.match(page, /exportReport/);
  await assert.rejects(access(new URL("app/_sites-preview", projectRoot)));
});
