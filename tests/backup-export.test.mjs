import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { TarWriter, tarHeader } from "../lib/tar-writer.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function source(relativePath) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

async function collect(build) {
  const chunks = [];
  const writable = new WritableStream({ write(chunk) { chunks.push(chunk); } });
  const tar = new TarWriter(writable.getWriter(), () => Date.UTC(2026, 8, 10, 12, 0, 0));
  await build(tar);
  return { tar, bytes: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))) };
}

test("tar headers follow ustar layout with a valid checksum", () => {
  const header = tarHeader("database/employees.ndjson", 1234, 1_789_000_000);
  assert.equal(header.length, 512);
  assert.equal(Buffer.from(header.subarray(0, 25)).toString(), "database/employees.ndjson");
  assert.equal(Buffer.from(header.subarray(124, 135)).toString(), "00000002322");
  assert.equal(Buffer.from(header.subarray(257, 263)).toString(), "ustar\0");
  const stored = parseInt(Buffer.from(header.subarray(148, 154)).toString(), 8);
  let computed = 0;
  header.forEach((byte, index) => { computed += index >= 148 && index < 156 ? 0x20 : byte; });
  assert.equal(stored, computed);
  assert.throws(() => tarHeader("x".repeat(300), 0, 0), /too long/);
  assert.throws(() => tarHeader("file", -1, 0), /invalid tar entry size/);
});

test("the writer produces an archive that system tar can list and extract byte-for-byte", async () => {
  const payload = new Uint8Array(1500).map((_, index) => index % 251);
  const { tar, bytes } = await collect(async (writer) => {
    await writer.addText("manifest.json", "{\"ok\":true}\n");
    await writer.addBytes("files/0.bin", payload);
    await writer.addStream("files/1.bin", 3, new Blob([new Uint8Array([1, 2, 3])]).stream());
    await writer.addText("database/empty.ndjson", "");
    await writer.finish();
  });
  assert.equal(tar.entries, 4);
  assert.equal(bytes.length % 512, 0);
  assert.equal(bytes.length, tar.bytes);

  const directory = await mkdtemp(path.join(tmpdir(), "people-pulse-tar-"));
  try {
    const archive = path.join(directory, "backup.tar");
    await writeFile(archive, bytes);
    const listing = spawnSync("tar", ["-tf", archive], { encoding: "utf8" });
    assert.equal(listing.status, 0, listing.stderr);
    assert.deepEqual(listing.stdout.trim().split("\n"), ["manifest.json", "files/0.bin", "files/1.bin", "database/empty.ndjson"]);
    const extraction = spawnSync("tar", ["-xf", archive, "-C", directory], { encoding: "utf8" });
    assert.equal(extraction.status, 0, extraction.stderr);
    assert.deepEqual(new Uint8Array(await readFile(path.join(directory, "files/0.bin"))), payload);
    assert.deepEqual([...await readFile(path.join(directory, "files/1.bin"))], [1, 2, 3]);
    assert.equal(await readFile(path.join(directory, "manifest.json"), "utf8"), "{\"ok\":true}\n");
    assert.equal((await readFile(path.join(directory, "database/empty.ndjson"))).length, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a stream that does not match its declared size aborts the archive instead of corrupting it", async () => {
  await assert.rejects(collect(async (writer) => {
    await writer.addStream("files/0.bin", 5, new Blob([new Uint8Array([1, 2])]).stream());
  }), /produced 2 bytes, expected 5/);
  await assert.rejects(collect(async (writer) => {
    await writer.addStream("files/0.bin", 1, new Blob([new Uint8Array([1, 2])]).stream());
  }), /more than 1 bytes/);
  const { tar } = await collect(async (writer) => { await writer.finish(); });
  await assert.rejects(tar.addText("late.txt", "x"), /already finished/);
});

test("the backup route is owner-only, streams a tar, skips transient tables and ends with the manifest", async () => {
  const route = await source("app/api/backup/route.ts");
  assert.match(route, /const gate = await authenticatedRequestGate\(request\)/);
  assert.match(route, /if \(!canManageSystemSettings\(gate\.currentUser\)\)[\s\S]*?status: 403/);
  assert.match(route, /EXCLUDED_TABLES = new Set\(\["d1_migrations", "auth_sessions", "auth_rate_limits"\]\)/);
  assert.match(route, /"content-type": "application\/x-tar"/);
  assert.match(route, /"content-disposition": `attachment; filename="people-pulse-backup-/);
  assert.match(route, /\.\.\.privateNoStoreHeaders/);
  assert.match(route, /ORDER BY rowid LIMIT \? OFFSET \?/);
  assert.match(route, /include: \["httpMetadata", "customMetadata"\]/);
  assert.ok(route.indexOf('"files.json"') < route.indexOf('"manifest.json"'), "manifest.json must be the final entry");
  assert.match(route, /await tar\.finish\(\)/);
  assert.match(route, /tar\.abort\(error\)/);
  assert.doesNotMatch(route, /process\.env/, "the backup must never include environment secrets");
});

test("the Settings Center exposes the backup download only inside the owner view", async () => {
  const [page, css] = await Promise.all([source("app/page.tsx"), source("app/globals.css")]);
  const settingsStart = page.indexOf('view === "settings" && ');
  const backupLink = page.indexOf('href="/api/backup" download');
  assert.ok(settingsStart >= 0 && backupLink > settingsStart, "backup link must live inside the owner settings view");
  assert.match(page, /<section className="system-settings-backup" aria-labelledby="settings-backup-title">/);
  assert.match(page, /className="system-settings-backup-link" href="\/api\/backup" download>ดาวน์โหลดข้อมูลสำรอง<\/a>/);
  assert.match(css, /\.system-settings-backup-link:focus-visible/);
});

test("the import script restores parent tables first and refuses archives without a manifest", async () => {
  const script = await source("scripts/import-backup.mjs");
  assert.match(script, /INSERT INTO/);
  assert.doesNotMatch(script, /INSERT OR REPLACE INTO/);
  assert.match(script, /Restore target is not empty/);
  assert.match(script, /PRAGMA defer_foreign_keys = true;/);
  assert.match(script, /REFERENCES\\s\+/);
  assert.match(script, /manifest\.json is missing/);
  assert.match(script, /SUPPORTED_FORMAT = "people-pulse-backup\/1"/);
  const route = await source("app/api/backup/route.ts");
  assert.match(route, /BACKUP_FORMAT = "people-pulse-backup\/1"/);
});
