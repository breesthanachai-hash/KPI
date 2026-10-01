import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { importEmployeePositionSnapshot } from "../scripts/import-employee-position-snapshot.mjs";

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "people-pulse-snapshot-"));
  const state = path.join(root, ".wrangler", "state", "d1");
  mkdirSync(state, { recursive: true });
  const database = path.join(state, "test.sqlite");
  const db = new DatabaseSync(database);
  db.exec(`CREATE TABLE employees (id TEXT PRIMARY KEY, name TEXT NOT NULL, initials TEXT NOT NULL, email TEXT NOT NULL UNIQUE, role_id TEXT NOT NULL, position_title TEXT NOT NULL, manager TEXT NOT NULL, status TEXT NOT NULL, updated_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE user_accounts (id TEXT PRIMARY KEY, role TEXT NOT NULL, status TEXT NOT NULL);
    CREATE TABLE employee_position_change_requests (id TEXT PRIMARY KEY);
    INSERT INTO user_accounts VALUES ('local-admin','admin','active');`);
  db.close();
  const snapshot = {
    format: "people-pulse-employee-position-snapshot/1", exported_at: "2026-10-01T00:00:00.000Z",
    source: "test", purpose: "test", role_catalog_source: "lib/kpi-data.ts",
    requested_workflow: "position-requests", import_policy: "employees-only",
    roles: [], departments: [], counts: { employees: 2 }, user_accounts: [],
    employees: [
      { id: "emp-one", name: "หนึ่ง", initials: "ห", email: "one@example.test", role_id: "video-editor", position_title: "", manager: "ไนท์", status: "active", updated_at: "2026-10-01T01:02:03.000Z" },
      { id: "emp-two", name: "สอง", initials: "ส", email: "two@example.test", role_id: "performance-video-production", position_title: "ตัดต่อ", manager: "ไนท์", status: "archived", updated_at: "2026-10-01T01:02:04.000Z" },
    ],
  };
  const file = path.join(root, "snapshot.json");
  const bytes = Buffer.from(JSON.stringify(snapshot));
  writeFileSync(file, bytes);
  return { root, database, file, hash: createHash("sha256").update(bytes).digest("hex") };
}

test("employee position snapshot import dry-runs then writes only exact employee fields", () => {
  const item = fixture();
  try {
    assert.deepEqual(importEmployeePositionSnapshot({ snapshot: item.file, database: item.database, sha256: item.hash, dryRun: true }).employees, 2);
    let db = new DatabaseSync(item.database);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM employees").get().count, 0);
    db.close();
    assert.equal(importEmployeePositionSnapshot({ snapshot: item.file, database: item.database, sha256: item.hash, dryRun: false }).employees, 2);
    db = new DatabaseSync(item.database);
    assert.deepEqual(db.prepare("SELECT id,role_id,position_title,status,updated_at FROM employees ORDER BY id").all().map((row) => ({ ...row })), [
      { id: "emp-one", role_id: "video-editor", position_title: "", status: "active", updated_at: "2026-10-01T01:02:03.000Z" },
      { id: "emp-two", role_id: "performance-video-production", position_title: "ตัดต่อ", status: "archived", updated_at: "2026-10-01T01:02:04.000Z" },
    ]);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM user_accounts").get().count, 1);
    db.close();
  } finally { rmSync(item.root, { recursive: true, force: true }); }
});

test("employee position snapshot import rejects a changed checksum before writing", () => {
  const item = fixture();
  try {
    assert.throws(() => importEmployeePositionSnapshot({ snapshot: item.file, database: item.database, sha256: "0".repeat(64), dryRun: false }), /SHA-256/);
    const db = new DatabaseSync(item.database);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM employees").get().count, 0);
    db.close();
  } finally { rmSync(item.root, { recursive: true, force: true }); }
});
