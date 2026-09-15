#!/usr/bin/env node
// Restores a People Pulse backup archive (from GET /api/backup) into a
// Cloudflare D1 database and R2 bucket through wrangler.
//
//   node scripts/import-backup.mjs <backup.tar> --database <d1-name> --bucket <r2-bucket> [--local] [--dry-run] [--skip-files]
//
// Restore into an EMPTY, isolated target only. Replacing rows would delete
// retained payroll history and violate immutable audit guards. Apply migrations
// first, but do not serve application traffic until restore + validation finish.

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const BLOCK_SIZE = 512;
const SUPPORTED_FORMAT = "people-pulse-backup/1";
const STATEMENTS_PER_BATCH = 400;

function parseArgs(argv) {
  const options = { local: false, dryRun: false, skipFiles: false };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--database") options.database = argv[++index];
    else if (arg === "--bucket") options.bucket = argv[++index];
    else if (arg === "--local") options.local = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--skip-files") options.skipFiles = true;
    else if (arg.startsWith("--")) throw new Error(`unknown option ${arg}`);
    else positional.push(arg);
  }
  if (positional.length !== 1 || !options.database) {
    throw new Error("usage: import-backup.mjs <backup.tar> --database <d1-name> [--bucket <r2-bucket>] [--local] [--dry-run] [--skip-files]");
  }
  return { ...options, archive: positional[0] };
}

function readTar(buffer) {
  const entries = new Map();
  const decoder = new TextDecoder();
  const field = (offset, start, length) => decoder.decode(buffer.subarray(offset + start, offset + start + length)).replace(/\0.*$/s, "");
  for (let offset = 0; offset + BLOCK_SIZE <= buffer.length; ) {
    if (buffer.subarray(offset, offset + BLOCK_SIZE).every((byte) => byte === 0)) break;
    const name = field(offset, 0, 100);
    const prefix = field(offset, 345, 155);
    const size = parseInt(field(offset, 124, 12).trim() || "0", 8);
    const type = String.fromCharCode(buffer[offset + 156] || 0x30);
    const start = offset + BLOCK_SIZE;
    if (start + size > buffer.length) throw new Error(`archive is truncated inside ${name}`);
    if (type === "0" || type === "\0") entries.set(prefix ? `${prefix}/${name}` : name, buffer.subarray(start, start + size));
    offset = start + Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE;
  }
  return entries;
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "object" && typeof value.$bytes === "string") return `X'${Buffer.from(value.$bytes, "base64").toString("hex")}'`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

function quote(identifier) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

// Orders tables so referenced tables are inserted before the tables that point at them.
function dependencyOrder(tables) {
  const names = new Set(tables.map((table) => table.name));
  const dependencies = new Map(tables.map((table) => [
    table.name,
    [...table.sql.matchAll(/REFERENCES\s+[`"]?([A-Za-z0-9_]+)[`"]?/gi)].map((match) => match[1]).filter((name) => names.has(name) && name !== table.name),
  ]));
  const ordered = [];
  const state = new Map();
  const visit = (name) => {
    if (state.get(name) === "done") return;
    if (state.get(name) === "active") return; // Cycle: defer_foreign_keys covers it.
    state.set(name, "active");
    for (const dependency of dependencies.get(name) ?? []) visit(dependency);
    state.set(name, "done");
    ordered.push(name);
  };
  for (const table of tables) visit(table.name);
  return ordered.map((name) => tables.find((table) => table.name === name));
}

function wrangler(args, options) {
  const result = spawnSync("npx", ["wrangler", ...args], { stdio: options.capture ? "pipe" : "inherit", encoding: "utf8", env: { ...process.env, WRANGLER_LOG_PATH: ".wrangler/wrangler.log" } });
  if (result.status !== 0) {
    throw new Error(`wrangler ${args.slice(0, 3).join(" ")} failed${result.stderr ? `: ${result.stderr.slice(-2000)}` : ""}`);
  }
  return result.stdout ?? "";
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const entries = readTar(readFileSync(options.archive));
  const manifestBytes = entries.get("manifest.json");
  if (!manifestBytes) throw new Error("manifest.json is missing — the download was probably interrupted; export the backup again");
  const manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
  if (manifest.format !== SUPPORTED_FORMAT) throw new Error(`unsupported backup format ${manifest.format}`);
  const files = JSON.parse(new TextDecoder().decode(entries.get("files.json") ?? new Uint8Array([0x5b, 0x5d])));
  const target = options.local ? "--local" : "--remote";
  // Complete preflight before the first write; never overwrite a populated DB.
  if (!options.dryRun) {
    const countsSql = manifest.tables.map(table => `SELECT '${table.name.replace(/'/g, "''")}' name, COUNT(*) count FROM ${quote(table.name)}`).join(" UNION ALL ");
    const existing = JSON.parse(wrangler(["d1", "execute", options.database, target, "--json", "--command", countsSql], { capture: true }))[0].results;
    if (existing.some(row => row.count > 0)) throw new Error("Restore target is not empty. Create an isolated empty database; this importer never overwrites existing records. A partial restore must be inspected, not retried over live data.");
    const guards = JSON.parse(wrangler(["d1", "execute", options.database, target, "--json", "--command", "SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'payroll_%'"], { capture: true }))[0].results;
    if (guards.length) throw new Error("Payroll runtime guards are installed. Restore requires a fresh migration-only target before application startup; do not disable guards on a live database.");
  }
  const workDirectory = mkdtempSync(path.join(tmpdir(), "people-pulse-import-"));
  console.log(`Backup from ${manifest.createdAt}: ${manifest.tables.length} tables, ${files.length} files${options.dryRun ? " (dry run)" : ""}`);

  try {
    let batchIndex = 0;
    const runBatch = (statements) => {
      if (!statements.length) return;
      const file = path.join(workDirectory, `batch-${String(batchIndex++).padStart(4, "0")}.sql`);
      writeFileSync(file, `PRAGMA defer_foreign_keys = true;\n${statements.join("\n")}\n`);
      if (!options.dryRun) wrangler(["d1", "execute", options.database, target, "--yes", "--file", file], { capture: true });
    };

    for (const table of dependencyOrder(manifest.tables)) {
      const ndjson = new TextDecoder().decode(entries.get(`database/${table.name}.ndjson`) ?? new Uint8Array());
      const rows = ndjson.split("\n").filter(Boolean).map((line) => JSON.parse(line));
      if (rows.length !== table.rows) throw new Error(`${table.name}: manifest says ${table.rows} rows but archive holds ${rows.length}`);
      const columns = table.columns.map(quote).join(", ");
      let pending = [];
      for (const row of rows) {
        pending.push(`INSERT INTO ${quote(table.name)} (${columns}) VALUES (${table.columns.map((column) => sqlLiteral(row[column])).join(", ")});`);
        if (pending.length >= STATEMENTS_PER_BATCH) {
          runBatch(pending);
          pending = [];
        }
      }
      runBatch(pending);
      console.log(`  ${table.name}: ${rows.length} rows`);
    }

    if (!options.skipFiles && files.length) {
      if (!options.bucket) throw new Error("--bucket is required to restore files (or pass --skip-files)");
      for (const file of files) {
        const bytes = entries.get(`files/${file.index}.bin`);
        if (!bytes || bytes.length !== file.size) throw new Error(`file ${file.key} is missing or truncated in the archive`);
        const local = path.join(workDirectory, `file-${file.index}.bin`);
        writeFileSync(local, bytes);
        const args = ["r2", "object", "put", `${options.bucket}/${file.key}`, "--file", local, target];
        if (file.contentType) args.push("--content-type", file.contentType);
        if (!options.dryRun) wrangler(args, { capture: true });
        rmSync(local, { force: true });
      }
      console.log(`  files: ${files.length} uploaded`);
    }

    if (!options.dryRun) {
      const checks = manifest.tables.map((table) => `SELECT '${table.name}' AS name, COUNT(*) AS count FROM ${quote(table.name)}`).join(" UNION ALL ");
      const output = wrangler(["d1", "execute", options.database, target, "--json", "--command", checks], { capture: true });
      const counts = new Map(JSON.parse(output)[0].results.map((row) => [row.name, row.count]));
      const mismatches = manifest.tables.filter((table) => counts.get(table.name) !== table.rows);
      if (mismatches.length) {
        console.warn(`Row counts differ from the backup (pre-existing rows or partial import): ${mismatches.map((table) => `${table.name} ${counts.get(table.name)}≠${table.rows}`).join(", ")}`);
      } else {
        console.log("Row counts match the backup for every table.");
      }
    }
  } finally {
    rmSync(workDirectory, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
