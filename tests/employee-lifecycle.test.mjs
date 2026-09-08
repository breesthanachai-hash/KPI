import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pageSource = await readFile(path.join(projectRoot, "app/page.tsx"), "utf8");
const dashboardRoute = await readFile(path.join(projectRoot, "app/api/dashboard/route.ts"), "utf8");
const schemaSource = await readFile(path.join(projectRoot, "db/schema.ts"), "utf8");
const dataSource = await readFile(path.join(projectRoot, "lib/kpi-data.ts"), "utf8");
const cssSource = await readFile(path.join(projectRoot, "app/globals.css"), "utf8");

test("employee records support active, resigned and recoverable archived lifecycle states", () => {
  assert.match(schemaSource, /enum: \["active", "inactive", "resigned", "archived"\]/);
  assert.match(dataSource, /status: "active" \| "inactive" \| "resigned" \| "archived"/);
  assert.match(dashboardRoute, /action: "updateEmployeeStatus" \| "archiveEmployee"/);
  assert.match(dashboardRoute, /const nextStatus = payload\.action === "archiveEmployee" \? "archived"/);
});

test("only HR or admin can change lifecycle and an active employee cannot be archived directly", () => {
  assert.match(dashboardRoute, /adminOnlyActions = new Set\(\[[\s\S]*?"updateEmployeeStatus"[\s\S]*?"archiveEmployee"/);
  assert.match(dashboardRoute, /if \(currentUser\.employeeId === employeeId\)[\s\S]*?ไม่สามารถเปลี่ยนสถานะหรือลบแฟ้มของบัญชีที่กำลังใช้งานอยู่/);
  assert.match(dashboardRoute, /payload\.action === "archiveEmployee" && employee\.status === "active"[\s\S]*?กรุณาเปลี่ยนสถานะเป็น “ลาออกแล้ว” ก่อนลบออกจากรายชื่อ/);
  assert.match(dashboardRoute, /employee\.updatedAt !== expectedUpdatedAt[\s\S]*?แฟ้มนี้ถูกแก้ไขจากอีกหน้าจอ/);
});

test("resignation and archival disable the linked account and revoke existing sessions", () => {
  const lifecycleBlock = dashboardRoute.slice(
    dashboardRoute.indexOf('if (payload.action === "updateEmployeeStatus" || payload.action === "archiveEmployee")'),
    dashboardRoute.indexOf('if (payload.action === "createEmployee")'),
  );
  assert.match(lifecycleBlock, /const disablesAccess = nextStatus !== "active"/);
  assert.match(lifecycleBlock, /db\.update\(userAccounts\)\.set\(\{ status: "inactive"/);
  assert.match(lifecycleBlock, /db\.update\(authSessions\)\.set\(\{ revokedAt: now, revokeReason: `employee-\$\{nextStatus\}` \}\)/);
  assert.match(lifecycleBlock, /eventType: "sessions_revoked"/);
  assert.match(lifecycleBlock, /disabledUserAccountIds/);
});

test("non-admin users receive active employees only", () => {
  assert.match(dashboardRoute, /if \(currentUser\.role === "admin"\) return true;[\s\S]*?employee\.id === currentUser\.employeeId\) return employee\.status === "active";[\s\S]*?return employee\.status === "active" && currentUser\.role === "manager"/);
  assert.match(dashboardRoute, /status === "active" && employeeId && linkedEmployee\?\.status !== "active"/);
});

test("employee dossier lets HR filter, mark resigned, archive and recover records", () => {
  assert.match(pageSource, /type DossierStatusFilter = "all" \| "active" \| "resigned" \| "archived"/);
  assert.match(pageSource, /<option value="active">ทำงานอยู่<\/option><option value="resigned">ลาออกแล้ว<\/option><option value="archived">ลบออกจากรายชื่อแล้ว<\/option>/);
  assert.match(pageSource, /action: "updateEmployeeStatus"[\s\S]*?expectedUpdatedAt: employee\.updatedAt/);
  assert.match(pageSource, /action: "archiveEmployee"[\s\S]*?expectedUpdatedAt: employee\.updatedAt/);
  assert.match(pageSource, /disabled=\{isSaving \|\| profileEmployee\.status === "active"\}[\s\S]*?>ลบออกจากรายชื่อ<\/button>/);
  assert.match(pageSource, /className="restore-employee"[\s\S]*?>กู้คืนแฟ้ม<\/button>/);
  assert.match(pageSource, /ระบบยังเก็บประวัติงาน การประเมิน สัญญา และเอกสารไว้เพื่อการตรวจสอบ/);
});

test("archived dossiers are read-only while downloads and restoration remain available", () => {
  assert.match(pageSource, /profileEmployee\.status !== "archived" && <label className="upload-document-button"/);
  assert.match(pageSource, /profileEmployee\.status !== "archived" && <button type="button" className="warning-create-button"/);
  assert.match(pageSource, /profileEmployee\.status !== "archived" && <button type="button" className="recognition-create-button"/);
  assert.match(pageSource, /profileEmployee\.status !== "archived" && <button className="contract-create-button"/);
  assert.match(cssSource, /\/\* Employee lifecycle controls \*\/[\s\S]*?\.dossier-lifecycle-actions[\s\S]*?\.archive-employee[\s\S]*?\.restore-employee/);
});

test("the built site ships the employee lifecycle controls", async () => {
  const assetDirectory = path.join(projectRoot, "dist/client/assets");
  const assets = (await readdir(assetDirectory)).filter((file) => file.endsWith(".js"));
  const bundle = (await Promise.all(assets.map((file) => readFile(path.join(assetDirectory, file), "utf8")))).join("\n");
  assert.match(bundle, /สถานะการจ้าง/);
  assert.match(bundle, /ลาออกแล้ว/);
  assert.match(bundle, /ลบออกจากรายชื่อ/);
  assert.match(bundle, /กู้คืนแฟ้ม/);
});
