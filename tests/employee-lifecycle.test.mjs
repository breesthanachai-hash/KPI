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
  assert.match(schemaSource, /"account_deleted", "employee_purged", "bootstrap_credential_repaired"/);
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

test("permanent employee deletion is admin-only, archived-only and requires an exact typed confirmation", () => {
  assert.match(dashboardRoute, /type DeleteEmployeePermanentlyPayload = \{[\s\S]*?action: "deleteEmployeePermanently"[\s\S]*?confirmation\?: string/);
  assert.match(dashboardRoute, /adminOnlyActions = new Set\(\[[\s\S]*?"deleteEmployeePermanently"/);
  assert.match(dashboardRoute, /if \(payload\.action === "deleteEmployeePermanently"\)[\s\S]*?currentUser\.employeeId === employeeId[\s\S]*?ไม่สามารถลบแฟ้มของบัญชีที่กำลังใช้งานอยู่/);
  assert.match(dashboardRoute, /employee\.status !== "archived"[\s\S]*?ต้องลบพนักงานออกจากรายชื่อก่อน จึงจะลบแฟ้มถาวรได้/);
  assert.match(dashboardRoute, /employee\.updatedAt !== expectedUpdatedAt[\s\S]*?const requiredConfirmation = `ลบถาวร \$\{employee\.name\}`[\s\S]*?payload\.confirmation !== requiredConfirmation/);
});

test("permanent deletion reassigns owned projects instead of deleting team work", () => {
  assert.match(dashboardRoute, /ownedProjectRows[\s\S]*?activeEmployeeRows[\s\S]*?getRole\(candidate\.roleId\)\.departmentId === employeeDepartmentId/);
  assert.match(dashboardRoute, /ownedProjectRows\.length && !replacementEmployee[\s\S]*?ไม่มีพนักงานที่ทำงานอยู่ในแผนกเดียวกันให้รับช่วง/);
  assert.match(dashboardRoute, /UPDATE projects SET owner_employee_id = \?, updated_at = \? WHERE owner_employee_id = \? AND \$\{employeeGuard\}/);
  assert.match(dashboardRoute, /reassignedProjectCount: ownedProjectRows\.length/);
});

test("permanent deletion atomically removes restricted records, preserves warning guards and records an audit event", () => {
  const purgeBlock = dashboardRoute.slice(
    dashboardRoute.indexOf('if (payload.action === "deleteEmployeePermanently")'),
    dashboardRoute.indexOf('if (payload.action === "createEmployee")'),
  );
  for (const table of ["policy_acknowledgements", "point_mutation_claims", "point_cap_claims", "reward_redemption_claims", "employee_warning_events", "employee_warnings", "employee_recognitions", "employees"]) {
    assert.match(purgeBlock, new RegExp(`DELETE FROM ${table}`), `missing purge for ${table}`);
  }
  assert.match(purgeBlock, /DELETE FROM auth_sessions[\s\S]*?DELETE FROM auth_credentials[\s\S]*?DELETE FROM notification_reads/);
  assert.match(purgeBlock, /UPDATE user_accounts SET auth_user_id = ''[\s\S]*?email = 'deleted-' \|\| id \|\| '@deleted\.invalid'[\s\S]*?display_name = 'ผู้ใช้ที่ลบแล้ว'[\s\S]*?employee_id = NULL/);
  assert.match(purgeBlock, /DROP TRIGGER IF EXISTS employee_warning_event_delete_guard[\s\S]*?CREATE TRIGGER employee_warning_event_delete_guard/);
  assert.match(purgeBlock, /event_type, source_hash, detail[\s\S]*?'employee_purged'/);
  assert.match(purgeBlock, /DELETE FROM employees WHERE id = \? AND status = 'archived' AND updated_at = \?/);
  assert.match(purgeBlock, /deletionResults\[employeeDeleteResultIndex\]\?\.meta\.changes[\s\S]*?!== 1/);
});

test("permanent deletion collects private R2 files before the database purge and cleans them after commit", () => {
  assert.match(dashboardRoute, /employeeProfiles\.profileImageKey[\s\S]*?applicationDocuments\.storageKey[\s\S]*?employeeWarnings\.storageKey[\s\S]*?employeeRecognitions\.storageKey/);
  assert.match(dashboardRoute, /workSubmissions\.storageKey[\s\S]*?or\(eq\(workSubmissions\.employeeId, employeeId\), eq\(workItems\.assigneeEmployeeId, employeeId\)\)/);
  assert.match(dashboardRoute, /const filesBucket = fileKeys\.length \? getFilesBucket\(\) : null[\s\S]*?await d1\.batch\(statements\)[\s\S]*?filesBucket\.delete\(fileKey\)/);
  assert.match(dashboardRoute, /fileCleanupPending/);
});

test("archived dossiers expose an explicit irreversible permanent-delete control", () => {
  assert.match(pageSource, /const confirmationPhrase = `ลบถาวร \$\{employee\.name\}`/);
  assert.match(pageSource, /window\.prompt\(`[\s\S]*?การดำเนินการนี้กู้คืนไม่ได้[\s\S]*?\$\{confirmationPhrase\}`\)/);
  assert.match(pageSource, /action: "deleteEmployeePermanently"[\s\S]*?expectedUpdatedAt: employee\.updatedAt[\s\S]*?confirmation/);
  assert.match(pageSource, /className="purge-employee"[\s\S]*?>ลบถาวร<\/button>/);
  assert.match(pageSource, /setEmployees\(\(items\) => items\.filter\(\(item\) => item\.id !== employee\.id\)\)/);
  assert.match(cssSource, /\.dossier-lifecycle-actions button\.purge-employee[\s\S]*?background: #9f1239/);
});

test("the built site ships the employee lifecycle controls", async () => {
  const assetDirectory = path.join(projectRoot, "dist/client/assets");
  const assets = (await readdir(assetDirectory)).filter((file) => file.endsWith(".js"));
  const bundle = (await Promise.all(assets.map((file) => readFile(path.join(assetDirectory, file), "utf8")))).join("\n");
  assert.match(bundle, /สถานะการจ้าง/);
  assert.match(bundle, /ลาออกแล้ว/);
  assert.match(bundle, /ลบออกจากรายชื่อ/);
  assert.match(bundle, /กู้คืนแฟ้ม/);
  assert.match(bundle, /ลบถาวร/);
  assert.match(bundle, /การดำเนินการนี้กู้คืนไม่ได้/);
});
