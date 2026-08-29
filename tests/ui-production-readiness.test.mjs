import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("admin-only employee files are gated while managers retain team evaluation", () => {
  assert.match(pageSource, /const canManageEmployeeFiles = currentUser\?\.role === "admin" && permissions\.canManagePeople && !isEmployeePreview/);
  assert.ok(pageSource.includes('{canManageEmployeeFiles && <button className="primary-button"'));
  assert.ok(pageSource.includes('{canManageEmployeeFiles && <button className="dossier-button"'));
  assert.match(pageSource, /\{view === "profiles" && canManageEmployeeFiles && \(/);
  assert.ok(pageSource.includes('<button className="evaluate-button"'));
  assert.ok(pageSource.includes('{evaluation ? "แก้ไขผล" : "ประเมิน"}</button>'));
});

test("initial dashboard failures stop before rendering a privileged-looking shell", () => {
  assert.match(pageSource, /if \(!currentUser && dataWarning\)/);
  assert.match(pageSource, /ระบบจึงหยุดไว้ก่อนเพื่อไม่แสดงเมนูหรือข้อมูลผิดสิทธิ์/);
  assert.match(pageSource, /setDashboardReloadKey\(\(key\) => key \+ 1\)/);
  assert.match(pageSource, /if \(!body\.currentUser\) throw new Error/);
});

test("error feedback and terminal HR transitions are explicit", () => {
  assert.match(pageSource, /tone: "success" \| "error"/);
  assert.match(pageSource, /role=\{toast\?\.tone === "error" \? "alert" : "status"\}/);
  assert.match(pageSource, /aria-live=\{toast\?\.tone === "error" \? "assertive" : "polite"\}/);
  assert.match(pageSource, /status === "archived" && !window\.confirm/);
  assert.match(pageSource, /status === "withdrawn" && !window\.confirm/);
  assert.match(pageSource, /status === "revoked" && !window\.confirm/);
  assert.match(cssSource, /\.toast\.error\s*\{/);
});

test("record validity is visible and warning dates are constrained", () => {
  assert.match(pageSource, /overdueOrganizationDocumentCount/);
  assert.match(pageSource, /className="overdue"/);
  assert.match(pageSource, /เลยวันหมดอายุ/);
  assert.match(pageSource, /min=\{employeeWarningForm\.incidentDate\}/);
  assert.match(pageSource, /warning-issued-date-error/);
});

test("pilot contract copy does not claim production electronic-signature assurance", () => {
  assert.match(pageSource, /PILOT CONTRACT WORKFLOW/);
  assert.match(pageSource, /ยังไม่ผูก hash กับไฟล์เอกสาร/);
  assert.match(pageSource, /ยังไม่ใช่ลายเซ็นอิเล็กทรอนิกส์สำหรับใช้ยืนยันผลทางกฎหมาย/);
  assert.doesNotMatch(pageSource, /description: "[^"]*สัญญาจ้างพร้อมลายเซ็นอิเล็กทรอนิกส์"/);
  assert.match(pageSource, /acknowledged: "HR บันทึกรับทราบ"/);
});

test("employee avatars reject legacy keys and keep initials as an image fallback", () => {
  assert.ok(pageSource.includes("profile?.profileImageKey?.startsWith(`employee-profile-images/${employee.id}/`)"));
  assert.match(pageSource, /<span className="avatar-initials">\{employee\.initials \|\| makeInitials\(employee\.name\)\}<\/span>/);
  assert.match(pageSource, /onError=\{\(event\) => event\.currentTarget\.remove\(\)\}/);
  assert.match(cssSource, /\.avatar-media img\s*\{[^}]*position:\s*absolute/);
});

test("readiness overrides stay outside the existing pilot access block", () => {
  const readinessIndex = cssSource.indexOf("/* Production readiness UI states */");
  const pilotIndex = cssSource.indexOf("/* Pilot readiness: keep the access workspace inside narrow mobile viewports. */");
  assert.ok(readinessIndex >= 0 && pilotIndex > readinessIndex);
});
