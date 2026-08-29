import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("pins a supported release runtime and exposes read-only verification scripts", async () => {
  const [packageJson, nodeVersion, verifier] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../.node-version", import.meta.url), "utf8"),
    readFile(new URL("../scripts/verify-release.mjs", import.meta.url), "utf8"),
  ]);

  assert.equal(nodeVersion.trim(), "22.13.0");
  assert.equal(packageJson.engines.node, ">=22.13.0");
  assert.equal(packageJson.packageManager, "npm@10.9.2");
  assert.equal(packageJson.scripts["release:preflight"], "node scripts/verify-release.mjs --preflight");
  assert.equal(
    packageJson.scripts["release:verify"],
    "npm run release:preflight && npm test && npm run lint && node scripts/verify-release.mjs --artifacts",
  );

  assert.match(verifier, /PEOPLE_PULSE_ENABLE_DEMO_DATA[\s\S]*?toLowerCase\(\) !== "true"/);
  assert.match(verifier, /hosting\.d1 === "DB"/);
  assert.match(verifier, /hosting\.r2 === "FILES"/);
  assert.match(verifier, /compareDirectories\(/);
  assert.doesNotMatch(verifier, /node:child_process|\bwriteFile\b|\bunlink\b|\brm\(|\bfetch\(|mcp__|wrangler\s+deploy/);
});

test("serves the shared SVG favicon through metadata and a stable favicon.ico redirect", async () => {
  const [layout, route, favicon] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/favicon.ico/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/favicon.svg", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /icons: \{[\s\S]*?url: "\/favicon\.svg", type: "image\/svg\+xml"[\s\S]*?shortcut: "\/favicon\.svg"/);
  assert.match(route, /Response\.redirect\(new URL\("\/favicon\.svg", request\.url\), 308\)/);
  assert.match(favicon, /<svg[\s\S]*?viewBox="0 0 24 24"/);
});

test("documents backup, access, smoke and rollback gates without automating production changes", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");

  for (const copy of [
    "Release runbook แบบไม่แตะ production อัตโนมัติ",
    "npm run release:verify",
    "Checklist สำรองข้อมูลก่อน release",
    "Checklist ก่อนอนุมัติเผยแพร่",
    "Rollback ที่ปลอดภัย",
    "ห้ามทดลอง restore ทับฐานจริง",
    "จะไม่ทำสองขั้นตอนนี้แทน",
  ]) {
    assert.ok(readme.includes(copy), `README must include: ${copy}`);
  }
});
