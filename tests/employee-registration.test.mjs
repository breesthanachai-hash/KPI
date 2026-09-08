import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = new URL("../", import.meta.url);

function source(path) {
  return readFile(new URL(path, projectRoot), "utf8");
}

function blockBetween(text, startPattern, endPattern) {
  const start = text.search(startPattern);
  assert.notEqual(start, -1, `missing block start: ${startPattern}`);
  const remainder = text.slice(start);
  const end = remainder.search(endPattern);
  return end === -1 ? remainder : remainder.slice(0, end);
}

test("employee registration accepts any nonblank password up to 15 characters", () => {
  const cryptoModule = new URL("../lib/password-crypto.ts", import.meta.url).href;
  const script = `
    import { registrationPasswordValidationError } from ${JSON.stringify(cryptoModule)};
    process.stdout.write(JSON.stringify([
      registrationPasswordValidationError("a"),
      registrationPasswordValidationError("A1!_รหัส"),
      registrationPasswordValidationError("123456789012345"),
      registrationPasswordValidationError("1234567890123456"),
      registrationPasswordValidationError("   "),
    ]));
  `;
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "--eval", script], {
    cwd: fileURLToPath(projectRoot),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), [null, null, null, "รหัสผ่านสำหรับสมัครสมาชิกต้องไม่เกิน 15 ตัวอักษร", "กรุณากรอกรหัสผ่าน"]);
});

test("login offers a complete employee registration form and keeps approval explicit", async () => {
  const authUi = await source("app/auth-ui.tsx");
  for (const field of ["given-name", "family-name", "nickname", "email", "username", "password", "confirmation"]) {
    assert.match(authUi, new RegExp(`name="${field}"`));
  }
  assert.match(authUi, /สมัครสมาชิกพนักงาน/);
  assert.match(authUi, /fetch\("\/api\/auth\/register"[\s\S]*?method: "POST"/);
  assert.match(authUi, /registrationPasswordValidation\(registration\.password, registration\.confirmation\)/);
  assert.match(authUi, /minLength=\{1\} maxLength=\{15\}/);
  assert.match(authUi, /ใช้ตัวอักษร ตัวเลข หรือสัญลักษณ์แบบใดก็ได้/);
  assert.match(authUi, /ความยาวไม่เกิน 15 ตัวอักษร/);
  assert.doesNotMatch(blockBetween(authUi, /authView === "register"/, /authView === "submitted"/), /PIN ตัวเลขอย่างเดียวอย่างน้อย 8 หลัก/);
  assert.match(authUi, /รอผู้ดูแลอนุมัติและผูกโปรไฟล์พนักงาน/);
  assert.match(authUi, /จากนั้นจึงใช้ ID และรหัสผ่านที่ตั้งไว้เข้าสู่ระบบได้/);
  assert.doesNotMatch(authUi, /ส่ง(?:รหัสผ่าน|password)(?:ให้|ไปยัง)ผู้ดูแล/i);
});

test("public registration is origin-checked, bounded, rate-limited, hashed and returns only a safe DTO", async () => {
  const [route, service] = await Promise.all([
    source("app/api/auth/register/route.ts"),
    source("lib/registration-service.ts"),
  ]);
  const handler = blockBetween(route, /export async function POST/, /\nasync function readBoundedRegistrationPayload/);
  assert.ok(handler.indexOf("unsafeRequestIsSameOrigin(request)") < handler.indexOf("ensureDatabase()"));
  assert.ok(handler.indexOf("unsafeRequestIsSameOrigin(request)") < handler.indexOf("readBoundedRegistrationPayload(request)"));
  assert.match(route, /byteLength > 8192/);
  assert.match(route, /status: 201, headers: privateNoStoreHeaders/);
  assert.match(service, /reserveRegistrationAttempt\(sourceHash, loginIdCanonical\)/);
  assert.match(service, /registrationPasswordValidationError\(password\)/);
  assert.match(service, /hashRegistrationPassword\(password\)/);
  assert.ok(service.indexOf("reserveRegistrationAttempt(sourceHash, loginIdCanonical)") < service.indexOf("const verifier = await hashRegistrationPassword(password)"));
  assert.match(service, /REGISTRATION_LOGIN_LIMIT = 3/);
  assert.match(service, /REGISTRATION_SOURCE_LIMIT = 8/);

  const dto = blockBetween(service, /export function employeeRegistrationRequestDto/, /\nexport function employeeRegistrationRequestDtos/);
  for (const safeField of ["id", "email", "loginId", "firstName", "lastName", "nickname", "status", "submittedAt"]) {
    assert.match(dto, new RegExp(`${safeField}: record\.${safeField}`));
  }
  assert.doesNotMatch(dto, /passwordHash|passwordSalt|passwordAlgorithm|passwordIterations|pepperVersion|sourceHash/);
});

test("HR/Admin approval is one-time, selects the role, links an active employee and erases the pending password verifier", async () => {
  const [service, dashboard] = await Promise.all([
    source("lib/registration-service.ts"),
    source("app/api/dashboard/route.ts"),
  ]);
  const approval = blockBetween(service, /export async function approveEmployeeRegistration/, /\nexport async function rejectEmployeeRegistration/);
  assert.match(approval, /employee\.status !== "active"/);
  assert.match(approval, /eq\(userAccounts\.employeeId, employeeId\)/);
  assert.match(approval, /db\.batch\(\[[\s\S]*?employeeRegistrationReviewClaims[\s\S]*?userAccounts[\s\S]*?authCredentials[\s\S]*?passwordHash: ""[\s\S]*?passwordSalt: ""[\s\S]*?registration_approved/);
  assert.match(approval, /roleInput === "admin" \|\| roleInput === "manager" \|\| roleInput === "employee"/);
  assert.match(approval, /role,/);
  assert.match(approval, /departmentId: role === "admin" \? "" : getRole\(employee\.roleId\)\.departmentId/);
  assert.match(approval, /role:\$\{role\}/);
  assert.match(approval, /mustChangePassword: false/);

  const rejection = blockBetween(service, /export async function rejectEmployeeRegistration/, /\nfunction normalizeEmail/);
  assert.match(rejection, /reason\.length < 3/);
  assert.match(rejection, /employeeRegistrationReviewClaims/);
  assert.match(rejection, /passwordHash: ""[\s\S]*?passwordSalt: ""/);
  assert.match(rejection, /registration_rejected/);

  assert.match(dashboard, /adminOnlyActions = new Set\(\[[\s\S]*?"approveEmployeeRegistration"[\s\S]*?"rejectEmployeeRegistration"/);
  assert.match(dashboard, /approveEmployeeRegistration\(payload\.requestId, payload\.employeeId, payload\.role, currentUser\)/);
  assert.match(dashboard, /authenticatedUser\.role === "admin"[\s\S]*?db\.select\(\)\.from\(employeeRegistrationRequests\)/);
  assert.match(dashboard, /employeeRegistrationRequests: currentUser\.role === "admin" \? employeeRegistrationRequestDtos\(registrationRequestRows\) : \[\]/);
});

test("admin user database has safe Excel export and registration-review tabs", async () => {
  const page = await source("app/page.tsx");
  for (const copy of ["จัดการสมาชิก", "อนุมัติสมาชิก", "กฎและสิทธิ์", "ส่งออก Excel (.csv)", "อนุมัติและเปิดบัญชี", "ปฏิเสธ", "สิทธิ์หลังอนุมัติ", "เพิกถอน", "คืนสิทธิ์"]) {
    assert.ok(page.includes(copy), `missing admin UI copy: ${copy}`);
  }
  assert.match(page, /registrationRoleSelections\[registrationRequest\.id\] \?\? "employee"/);
  assert.match(page, /action: "approveEmployeeRegistration"[\s\S]*?employeeId, role/);
  assert.match(page, /<option value="employee">พนักงาน[\s\S]*?<option value="manager">หัวหน้าทีม[\s\S]*?<option value="admin">HR \/ Admin/);
  const revokeAccess = blockBetween(page, /const toggleUserAccount =/, /\n  const deleteUserAccount/);
  assert.match(revokeAccess, /ออกจากระบบทุกอุปกรณ์ทันที/);
  assert.match(revokeAccess, /window\.confirm\(`\$\{actionLabel\}ของ/);
  assert.match(page, /className=\{account\.status === "active" \? "revoke-account" : "restore-account"\}/);
  assert.match(page, /view === "access" && isAdmin/);
  assert.match(page, /const exportUserAccounts =/);
  assert.match(page, /people-pulse-user-accounts-\$\{bangkokIsoDate\(\)\}\.csv/);
  assert.match(page, /Username[\s\S]*?ชื่อ–นามสกุล[\s\S]*?ชื่อเล่น[\s\S]*?บทบาท[\s\S]*?สถานะ[\s\S]*?อีเมล/);
  assert.match(page, /ไม่เปิดเผย Password Hash, Salt, Session Token หรือข้อมูลลับ/);
  assert.doesNotMatch(blockBetween(page, /const exportUserAccounts/, /\n  const isAdmin/), /passwordHash|passwordSalt|tokenHash|authUserId/);
});

test("migration 0021 installs registration tables, one-time review guards and the v21 marker", async () => {
  const [schema, initialize, migration, packagedMigration, snapshot] = await Promise.all([
    source("db/schema.ts"),
    source("db/initialize.ts"),
    source("drizzle/0021_chubby_malice.sql"),
    source("dist/.openai/drizzle/0021_chubby_malice.sql"),
    source("drizzle/meta/0021_snapshot.json").then(JSON.parse),
  ]);
  assert.equal(packagedMigration, migration);
  for (const code of [schema, initialize, migration]) {
    assert.match(code, /employee_registration_requests/);
    assert.match(code, /employee_registration_review_claims/);
    assert.match(code, /employee_registration_pending_login_unique/);
    assert.match(code, /employee_registration_pending_email_unique/);
  }
  for (const code of [initialize, migration]) {
    assert.match(code, /employee_registration_review_claim_validate/);
    assert.match(code, /employee_registration_status_review_guard/);
  }
  assert.match(migration, /ALTER TABLE `user_accounts` ADD `nickname` text DEFAULT '' NOT NULL/);
  assert.match(migration, /CREATE TABLE `people_pulse_schema_v21_ready`/);
  assert.equal(snapshot.tables.employee_registration_requests.columns.password_algorithm.default, "'pbkdf2-sha256-chain-v1'");
  assert.equal(snapshot.tables.employee_registration_requests.columns.password_iterations.default, 600000);

  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON; CREATE TABLE user_accounts (id TEXT PRIMARY KEY NOT NULL);");
  for (const statement of migration.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)) db.exec(statement);
  db.prepare("INSERT INTO user_accounts (id, nickname) VALUES ('reviewer', '')").run();
  db.prepare(`INSERT INTO employee_registration_requests (
    id, email, email_canonical, login_id, login_id_canonical, password_hash, password_salt,
    password_algorithm, password_iterations, pepper_version, first_name, last_name, nickname,
    status, source_hash, submitted_at, reviewed_by_name, rejection_reason, updated_at
  ) VALUES ('request-1','new@example.com','new@example.com','new.user','new.user','hash','salt',
    'pbkdf2-sha256-chain-v1',600000,1,'New','User','นิว','pending','source','2026-09-07T00:00:00.000Z','','','2026-09-07T00:00:00.000Z')`).run();
  assert.throws(() => db.prepare("UPDATE employee_registration_requests SET status='approved', password_hash='', password_salt='' WHERE id='request-1'").run(), /REGISTRATION_REVIEW_REQUIRED/);
  db.prepare("INSERT INTO employee_registration_review_claims (request_id, decision, reviewer_user_id) VALUES ('request-1','approved','reviewer')").run();
  db.prepare("UPDATE employee_registration_requests SET status='approved', password_hash='', password_salt='' WHERE id='request-1'").run();
  assert.equal(db.prepare("SELECT status FROM employee_registration_requests WHERE id='request-1'").get().status, "approved");
  assert.throws(() => db.prepare("UPDATE employee_registration_requests SET status='rejected' WHERE id='request-1'").run(), /REGISTRATION_REVIEW_REQUIRED/);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM people_pulse_schema_v21_ready").get().count, 0);
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
  db.close();
});

test("built client contains registration and admin review features", async () => {
  const assetRoot = new URL("../dist/client/assets/", import.meta.url);
  const assetNames = (await readdir(assetRoot)).filter((name) => name.endsWith(".js"));
  const client = (await Promise.all(assetNames.map((name) => source(`dist/client/assets/${name}`)))).join("\n");
  for (const copy of ["สมัครสมาชิกพนักงาน", "อนุมัติสมาชิก", "สมาชิกที่อนุมัติแล้ว", "สิทธิ์หลังอนุมัติ", "เพิกถอนสิทธิ์", "คืนสิทธิ์", "อนุมัติและเปิดบัญชี", "ส่งออก Excel (.csv)", "ใช้ตัวอักษร ตัวเลข หรือสัญลักษณ์แบบใดก็ได้", "ความยาวไม่เกิน 15 ตัวอักษร"]) {
    assert.match(client, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(client, /\/api\/auth\/register/);
});
