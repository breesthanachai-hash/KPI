#!/usr/bin/env node
// Imports the read-only employee-position snapshot into an EMPTY local D1
// SQLite database. This deliberately never reads or writes credentials, users,
// sessions, payroll, or any data outside employees.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { findRole } from "../lib/kpi-data.ts";

const FORMAT = "people-pulse-employee-position-snapshot/1";
const MAX_BYTES = 1024 * 1024;
const SNAPSHOT_FIELDS = ["format", "exported_at", "source", "purpose", "employees", "user_accounts", "roles", "departments", "role_catalog_source", "requested_workflow", "import_policy", "counts"];
const EMPLOYEE_COLUMNS = ["id", "name", "initials", "email", "role_id", "position_title", "manager", "status", "updated_at"];
const STATUSES = new Set(["active", "inactive", "resigned", "archived"]);

function fail(message) { throw new Error(message); }

function parseArgs(argv) {
  const options = { dryRun: true };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--database") options.database = argv[++index];
    else if (value === "--sha256") options.sha256 = argv[++index]?.toLowerCase();
    else if (value === "--apply") options.dryRun = false;
    else if (value === "--dry-run") options.dryRun = true;
    else if (value.startsWith("--")) fail(`ไม่รู้จัก option: ${value}`);
    else positional.push(value);
  }
  if (positional.length !== 1 || !options.database || !options.sha256) {
    fail("วิธีใช้: node scripts/import-employee-position-snapshot.mjs <snapshot.json> --database <local-d1.sqlite> --sha256 <sha256> [--dry-run|--apply]");
  }
  if (!/^[a-f0-9]{64}$/.test(options.sha256)) fail("SHA-256 ต้องเป็น hexadecimal 64 ตัวอักษร");
  return { ...options, snapshot: positional[0] };
}

function exactKeys(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} ต้องเป็น object`);
  const actual = Object.keys(value).sort();
  const expected = [...allowed].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(`${label} มีฟิลด์ที่ไม่อนุญาตหรือขาดฟิลด์ที่จำเป็น`);
  }
}

function validateSnapshot(bytes, expectedHash) {
  if (bytes.byteLength > MAX_BYTES) fail("snapshot ใหญ่เกิน 1 MB");
  const actualHash = createHash("sha256").update(bytes).digest("hex");
  if (actualHash !== expectedHash) fail("SHA-256 ไม่ตรงกับค่าที่ได้รับ หยุดนำเข้า");
  let snapshot;
  try { snapshot = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { fail("snapshot ไม่ใช่ JSON ที่ถูกต้อง"); }
  exactKeys(snapshot, SNAPSHOT_FIELDS, "snapshot");
  if (snapshot.format !== FORMAT) fail(`รูปแบบ snapshot ไม่รองรับ: ${String(snapshot.format)}`);
  if (!Array.isArray(snapshot.employees) || !Array.isArray(snapshot.user_accounts)) fail("snapshot ไม่มี employees หรือ user_accounts ที่ถูกต้อง");
  if (snapshot.user_accounts.length !== 0) fail("snapshot นี้ต้องไม่มี user_accounts");
  if (snapshot.counts?.employees !== snapshot.employees.length) fail("จำนวน employees ไม่ตรงกับ counts ใน snapshot");
  const ids = new Set();
  const emails = new Set();
  for (const [index, employee] of snapshot.employees.entries()) {
    exactKeys(employee, EMPLOYEE_COLUMNS, `employees[${index}]`);
    for (const key of EMPLOYEE_COLUMNS) if (typeof employee[key] !== "string") fail(`employees[${index}].${key} ต้องเป็นข้อความ`);
    if (!employee.id || ids.has(employee.id)) fail(`employee_id ซ้ำหรือว่างที่แถว ${index + 1}`);
    if (!employee.email || emails.has(employee.email)) fail(`email ซ้ำหรือว่างที่แถว ${index + 1}`);
    if (!STATUSES.has(employee.status)) fail(`สถานะพนักงานไม่รองรับที่แถว ${index + 1}`);
    if (!employee.updated_at || Number.isNaN(Date.parse(employee.updated_at))) fail(`updated_at ไม่ถูกต้องที่แถว ${index + 1}`);
    if (!findRole(employee.role_id)) fail(`ไม่พบ role_id ${employee.role_id} ใน lib/kpi-data.ts`);
    ids.add(employee.id); emails.add(employee.email);
  }
  return { snapshot, actualHash };
}

function scalar(db, sql, ...params) { return db.prepare(sql).get(...params); }

function preflight(db) {
  const required = ["employees", "user_accounts", "employee_position_change_requests"];
  for (const table of required) {
    if (!scalar(db, "SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name=?", table)?.ok) {
      fail(`ฐานทดสอบยังไม่มีตาราง ${table}; รัน migration ถึง 0026 ก่อนนำเข้า`);
    }
  }
  const employees = scalar(db, "SELECT COUNT(*) AS count FROM employees").count;
  if (employees !== 0) fail(`ตาราง employees ไม่ว่าง (${employees} คน) หยุดนำเข้าโดยไม่เขียนทับ`);
  const admin = scalar(db, "SELECT id FROM user_accounts WHERE role='admin' AND status='active' LIMIT 1");
  if (!admin) fail("ไม่พบบัญชี HR/Admin ที่ใช้งานได้ในฐานทดสอบ");
  const insertTriggers = db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='employees' AND upper(sql) GLOB '*INSERT*'").all();
  if (insertTriggers.length) fail(`พบ trigger ที่เขียนผลข้างเคียงเมื่อเพิ่ม employees: ${insertTriggers.map((trigger) => trigger.name).join(', ')}`);
  return { employees, userAccounts: scalar(db, "SELECT COUNT(*) AS count FROM user_accounts").count };
}

function verifyRows(db, employees) {
  const read = db.prepare("SELECT id,name,initials,email,role_id,position_title,manager,status,updated_at FROM employees WHERE id=?");
  for (const source of employees) {
    const actual = read.get(source.id);
    if (!actual || EMPLOYEE_COLUMNS.some((column) => actual[column] !== source[column])) fail(`ข้อมูลพนักงาน ${source.id} ไม่ตรงกับ snapshot; rollback ทั้งชุด`);
  }
  const count = scalar(db, "SELECT COUNT(*) AS count FROM employees").count;
  if (count !== employees.length) fail(`จำนวนพนักงานหลังนำเข้าไม่ตรง (${count}/${employees.length})`);
}

export function importEmployeePositionSnapshot(options) {
  const bytes = readFileSync(options.snapshot);
  const { snapshot, actualHash } = validateSnapshot(bytes, options.sha256);
  const databasePath = path.resolve(options.database);
  if (!databasePath.includes(`${path.sep}.wrangler${path.sep}state${path.sep}`)) fail("อนุญาตเฉพาะฐาน D1 local ใน .wrangler/state; ไม่รองรับ remote หรือฐาน production");
  const db = new DatabaseSync(databasePath);
  try {
    const before = preflight(db);
    if (options.dryRun) return { dryRun: true, hash: actualHash, employees: snapshot.employees.length, before };
    const insert = db.prepare("INSERT INTO employees (id,name,initials,email,role_id,position_title,manager,status,updated_at) VALUES (?,?,?,?,?,?,?,?,?)");
    db.exec("BEGIN IMMEDIATE");
    try {
      const secondPreflight = preflight(db);
      if (secondPreflight.employees !== 0 || secondPreflight.userAccounts !== before.userAccounts) fail("ฐานทดสอบเปลี่ยนระหว่างตรวจสอบ; rollback");
      for (const employee of snapshot.employees) insert.run(...EMPLOYEE_COLUMNS.map((column) => employee[column]));
      verifyRows(db, snapshot.employees);
      const accountsAfter = scalar(db, "SELECT COUNT(*) AS count FROM user_accounts").count;
      if (accountsAfter !== before.userAccounts) fail("พบการเปลี่ยนแปลง user_accounts; rollback");
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return { dryRun: false, hash: actualHash, employees: snapshot.employees.length, before };
  } finally { db.close(); }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = importEmployeePositionSnapshot(options);
  console.log(`${result.dryRun ? "ตรวจสอบผ่าน (dry-run)" : "นำเข้าสำเร็จ"}: ${result.employees} คน · SHA-256 ${result.hash}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (error) { console.error(error instanceof Error ? error.message : error); process.exit(1); }
}
