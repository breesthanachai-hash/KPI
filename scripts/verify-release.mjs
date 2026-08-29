import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2] ?? "--artifacts";
const minimumNode = [22, 13, 0];
const templateFiles = [
  "office-lease-agreement-template.docx",
  "employment-agreement-template.docx",
  "confidentiality-nda-template.docx",
  "employee-warning-letter-template.docx",
  "asset-handover-return-template.docx",
];
const completed = [];

function fail(message) {
  throw new Error(message);
}

function check(condition, message) {
  if (!condition) fail(message);
  completed.push(message);
}

function versionParts(value) {
  return value.replace(/^v/, "").split(".").slice(0, 3).map((part) => Number.parseInt(part, 10));
}

function versionAtLeast(current, minimum) {
  for (let index = 0; index < minimum.length; index += 1) {
    if ((current[index] ?? 0) > minimum[index]) return true;
    if ((current[index] ?? 0) < minimum[index]) return false;
  }
  return true;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function requireFile(path, label) {
  const details = await stat(path).catch(() => null);
  check(Boolean(details?.isFile() && details.size > 0), label);
}

async function listFiles(root, directory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(root, path));
    else if (entry.isFile()) files.push(relative(root, path));
  }
  return files.sort();
}

async function compareFiles(source, built, label) {
  const [sourceBytes, builtBytes] = await Promise.all([readFile(source), readFile(built)]);
  check(sourceBytes.equals(builtBytes), label);
}

async function compareDirectories(source, built, label) {
  const [sourceNames, builtNames] = await Promise.all([listFiles(source), listFiles(built)]);
  check(JSON.stringify(sourceNames) === JSON.stringify(builtNames), `${label}: file list must match`);
  for (const name of sourceNames) {
    await compareFiles(join(source, name), join(built, name), `${label}: ${name}`);
  }
}

async function verifyPreflight() {
  check(["--preflight", "--artifacts"].includes(mode), "mode must be --preflight or --artifacts");
  if (!versionAtLeast(versionParts(process.versions.node), minimumNode)) {
    fail(`Node ${process.versions.node} is unsupported; use Node 22.13.0 or newer`);
  }
  completed.push(`Node ${process.versions.node} satisfies >=22.13.0`);

  const [packageJson, hosting, nodeVersion, journal, faviconRoute, faviconSvg] = await Promise.all([
    readJson(join(projectRoot, "package.json")),
    readJson(join(projectRoot, ".openai", "hosting.json")),
    readFile(join(projectRoot, ".node-version"), "utf8"),
    readJson(join(projectRoot, "drizzle", "meta", "_journal.json")),
    readFile(join(projectRoot, "app", "favicon.ico", "route.ts"), "utf8"),
    readFile(join(projectRoot, "public", "favicon.svg"), "utf8"),
  ]);

  check(nodeVersion.trim() === "22.13.0", ".node-version must pin Node 22.13.0");
  check(packageJson.engines?.node === ">=22.13.0", "package engines must require Node >=22.13.0");
  check(packageJson.packageManager === "npm@10.9.2", "package manager must be pinned to npm 10.9.2");
  check(packageJson.scripts?.["release:verify"]?.includes("verify-release.mjs --artifacts"), "release verification script must be registered");

  const hostingKeys = Object.keys(hosting).sort();
  check(JSON.stringify(hostingKeys) === JSON.stringify(["d1", "project_id", "r2"]), "hosting metadata must contain only project_id, d1 and r2");
  check(typeof hosting.project_id === "string" && hosting.project_id.length > 0, "hosting project_id must be present");
  check(hosting.d1 === "DB", "D1 binding must be DB");
  check(hosting.r2 === "FILES", "R2 binding must be FILES");

  const migrationEntries = journal.entries ?? [];
  check(migrationEntries.length > 0, "migration journal must not be empty");
  check(migrationEntries.every((entry, index) => entry.idx === index), "migration journal indices must be continuous");
  const migrationNames = (await readdir(join(projectRoot, "drizzle")))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
  const journalNames = migrationEntries.map((entry) => `${entry.tag}.sql`).sort();
  check(JSON.stringify(migrationNames) === JSON.stringify(journalNames), "migration SQL files must match the journal");

  check(faviconRoute.includes('new URL("/favicon.svg", request.url)') && faviconRoute.includes("308"), "/favicon.ico must redirect permanently to the shared SVG icon");
  check(faviconSvg.includes("<svg") && faviconSvg.includes("viewBox="), "shared SVG favicon must contain valid source markup");

  for (const name of templateFiles) {
    await requireFile(join(projectRoot, "public", "templates", name), `source template must exist: ${name}`);
  }

  check((process.env.PEOPLE_PULSE_ENABLE_DEMO_DATA ?? "").trim().toLowerCase() !== "true", "PEOPLE_PULSE_ENABLE_DEMO_DATA must not be true during release verification");
}

async function verifyArtifacts() {
  await requireFile(join(projectRoot, "dist", "server", "index.js"), "built server entry must exist");
  const assetNames = await readdir(join(projectRoot, "dist", "client", "assets"));
  check(assetNames.some((name) => name.endsWith(".js")), "built client JavaScript must exist");
  check(assetNames.some((name) => name.endsWith(".css")), "built client CSS must exist");

  await compareFiles(
    join(projectRoot, ".openai", "hosting.json"),
    join(projectRoot, "dist", ".openai", "hosting.json"),
    "packaged hosting metadata must match source",
  );
  await compareDirectories(
    join(projectRoot, "drizzle"),
    join(projectRoot, "dist", ".openai", "drizzle"),
    "packaged migrations",
  );
  for (const name of templateFiles) {
    await compareFiles(
      join(projectRoot, "public", "templates", name),
      join(projectRoot, "dist", "client", "templates", name),
      `packaged template must match source: ${name}`,
    );
  }

  const serverBundle = await readFile(join(projectRoot, "dist", "server", "index.js"), "utf8");
  check(serverBundle.includes("/favicon.ico") && serverBundle.includes("/favicon.svg"), "built server must include the favicon.ico route and shared SVG target");
}

try {
  await verifyPreflight();
  if (mode === "--artifacts") await verifyArtifacts();
  console.log(`Release verification passed (${completed.length} checks, no deployment or live-data writes).`);
} catch (error) {
  console.error(`Release verification failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
