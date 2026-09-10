import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import test from "node:test";
import { inflateRawSync } from "node:zlib";

const templateFiles = [
  "office-lease-agreement-template.docx",
  "employment-agreement-template.docx",
  "confidentiality-nda-template.docx",
  "employee-warning-letter-template.docx",
  "asset-handover-return-template.docx",
];

function findEndOfCentralDirectory(buffer) {
  const minimumOffset = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error("DOCX ZIP has no end-of-central-directory record");
}

function readZipEntries(buffer) {
  assert.equal(buffer.subarray(0, 4).toString("hex"), "504b0304", "DOCX must start with the ZIP local-file signature");
  const endOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(endOffset + 10);
  let offset = buffer.readUInt32LE(endOffset + 16);
  const entries = new Map();

  for (let index = 0; index < entryCount; index += 1) {
    assert.equal(buffer.readUInt32LE(offset), 0x02014b50, "invalid central-directory entry");
    const flags = buffer.readUInt16LE(offset + 8);
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + fileNameLength).toString("utf8");

    assert.equal(flags & 0x1, 0, `${name} must not be encrypted`);
    assert.ok(!name.startsWith("/") && !name.includes("\\") && !name.split("/").includes(".."), `${name} must be a safe archive path`);
    assert.ok(!entries.has(name), `${name} must not be duplicated`);
    assert.equal(buffer.readUInt32LE(localHeaderOffset), 0x04034b50, `${name} has an invalid local header`);

    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
    let data;
    if (compressionMethod === 0) data = compressed;
    else if (compressionMethod === 8) data = inflateRawSync(compressed);
    else throw new Error(`${name} uses unsupported ZIP compression method ${compressionMethod}`);
    assert.equal(data.length, uncompressedSize, `${name} did not decompress to the declared size`);
    entries.set(name, data);

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  assert.equal(entries.size, entryCount, "all DOCX ZIP entries must be readable");
  return entries;
}

function xmlText(buffer) {
  return buffer
    .toString("utf8")
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function builtPageAsset() {
  const assetRoot = new URL("../dist/client/assets/", import.meta.url);
  const pageAssetName = (await readdir(assetRoot)).find((name) => /^page-.*\.js$/.test(name));
  assert.ok(pageAssetName, "expected a built page asset");
  return readFile(new URL(pageAssetName, assetRoot), "utf8");
}

test("ships a clear admin-only organization-document and employee-record UI", async () => {
  const [page, pageAsset, dashboardRoute] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    builtPageAsset(),
    readFile(new URL("../app/api/dashboard/route.ts", import.meta.url), "utf8"),
  ]);

  for (const copy of [
    "เอกสารองค์กร",
    "คลังเอกสาร",
    "แม่แบบพร้อมใช้",
    "แม่แบบสัญญาเช่าสำนักงาน / พื้นที่",
    "แม่แบบสัญญาจ้างพนักงาน",
    "แม่แบบสัญญารักษาความลับ (NDA)",
    "แม่แบบหนังสือเตือนพนักงาน",
    "แม่แบบรับ–คืนทรัพย์สินบริษัท",
    "ประวัติใบเตือน",
    "เกียรติบัตรและรางวัลจากผลงาน",
    "เอกสารแม่แบบเป็นเพียงจุดเริ่มต้น",
    "การรับทราบไม่เท่ากับการยอมรับผิด",
  ]) {
    assert.ok(pageAsset.includes(copy), `built UI must include: ${copy}`);
  }

  assert.match(page, /\{ id: "organization-docs", icon: "▤", label: "เอกสารองค์กร"[^\n]*visible: Boolean\(isAdmin && permissions\.canManageOrganizationDocuments\) \}/, "the workspace menu must show organization documents only to document managers");
  assert.match(page, /view === "organizationDocs" && isAdmin && permissions\.canManageOrganizationDocuments && !isEmployeePreview/);
  assert.match(page, /permissions\.canManageEmployeeWarnings && <section className="employee-warning-card">/);
  assert.match(page, /permissions\.canManageEmployeeRecognitions && <section className="employee-recognition-card">/);
  assert.match(page, /const employeeViews: View\[\] = \["work", "portfolio", "office", "power", "peopleOps"\]/);

  const organizationFileInput = page.match(/className="wide organization-record-file"[\s\S]{0,700}/)?.[0] ?? "";
  assert.ok(organizationFileInput, "expected the organization-document file input");
  assert.match(organizationFileInput, /accept="\.pdf,\.doc,\.docx,\.jpg,\.jpeg,\.png"/);
  assert.doesNotMatch(organizationFileInput, /\.xls|\.xlsx/);

  assert.match(dashboardRoute, /canManageOrganizationDocuments: currentUser\.role === "admin"/);
  assert.match(dashboardRoute, /canManageEmployeeWarnings: currentUser\.role === "admin"/);
  assert.match(dashboardRoute, /canManageEmployeeRecognitions: currentUser\.role === "admin"/);
});

test("keeps private files admin-only and never exposes R2 storage keys", async () => {
  const [dashboardRoute, organizationRoute, warningRoute, recognitionRoute, data] = await Promise.all([
    readFile(new URL("../app/api/dashboard/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/organization-documents/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/employee-warnings/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/employee-recognitions/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/kpi-data.ts", import.meta.url), "utf8"),
  ]);

  for (const table of ["organizationDocuments", "employeeWarnings", "employeeWarningEvents", "employeeRecognitions"]) {
    assert.match(
      dashboardRoute,
      new RegExp(`authenticatedUser\\.role === "admin" && !isEmployeePreviewRequest \\? db\\.select\\(\\)\\.from\\(${table}\\) : Promise\\.resolve\\(\\[\\]\\)`),
      `${table} must not even be selected for non-admin or preview requests`,
    );
  }
  for (const property of ["organizationDocuments", "employeeWarnings", "employeeRecognitions"]) {
    assert.match(
      dashboardRoute,
      new RegExp(`${property}: currentUser\\.role === "admin" \\? ${property === "organizationDocuments" ? "organizationDocumentRows" : property === "employeeWarnings" ? "employeeWarningRows" : "employeeRecognitionRows"}\\.map\\(privateFileDto\\) : \\[\\]`),
    );
  }
  assert.match(dashboardRoute, /function privateFileDto<[\s\S]*?const \{ storageKey, \.\.\.safe \} = record;[\s\S]*?hasFile: Boolean\(storageKey\)/);
  assert.match(data, /type OrganizationDocumentDto = Omit<OrganizationDocumentRecord, "storageKey"> & \{ hasFile: boolean \}/);
  assert.match(data, /type EmployeeWarningDto = Omit<EmployeeWarningRecord, "storageKey"> & \{ hasFile: boolean \}/);
  assert.match(data, /type EmployeeRecognitionDto = Omit<EmployeeRecognitionRecord, "storageKey"> & \{ hasFile: boolean \}/);

  for (const [name, route] of [
    ["organization documents", organizationRoute],
    ["employee warnings", warningRoute],
    ["employee recognitions", recognitionRoute],
  ]) {
    assert.match(route, /async function requireAdmin\(request: Request\) \{\s*return authenticatedRequestGate\(request\);\s*\}/);
    assert.match(route, /const authentication = await requireAdmin\(request\);[\s\S]*?if \(authentication\.response\) return authentication\.response;[\s\S]*?const \{ currentUser \} = authentication;/);
    assert.match(route, /if \(currentUser\.role !== "admin"\) return Response\.json\(/);
    assert.match(route, /getFilesBucket\(\)\.get\(/, `${name} downloads must come from private R2 storage`);
    assert.match(route, /"cache-control": "private, no-store"/);
    assert.match(route, /"x-content-type-options": "nosniff"/);
    assert.match(route, /"content-disposition": `attachment; filename\*=UTF-8''/);
    assert.match(route, /const \{ storageKey, \.\.\.safe \} = /);
    assert.match(route, /hasFile: Boolean\(storageKey\)/);
    assert.doesNotMatch(route, /export async function DELETE/);

    assert.match(route, /file\.size <= 10 \* 1024 \* 1024/);
    assert.match(route, /allowedExtensions\[file\.type\]\?\.has\(extension\)/);
    assert.match(route, /new Uint8Array\(await file\.slice\(0, 8\)\.arrayBuffer\(\)\)/);
    assert.match(route, /\[0x25, 0x50, 0x44, 0x46, 0x2d\]/, `${name} must validate PDF magic bytes`);
    assert.match(route, /\[0x50, 0x4b, 0x03, 0x04\]/, `${name} must validate DOCX ZIP magic bytes`);
    assert.match(route, /\[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a\]/, `${name} must validate PNG magic bytes`);
    assert.match(route, /if \(uploadedStorageKey && !committed\)[\s\S]*?getFilesBucket\(\)\.delete\(uploadedStorageKey\)/, `${name} must clean up failed uploads`);
    assert.match(route, /if \(!updated\) \{[\s\S]{0,700}getFilesBucket\(\)\.delete\(uploadedStorageKey\)[\s\S]{0,700}status: 409/, `${name} must clean up a newly uploaded file when compare-and-swap loses a race`);
    assert.match(route, /crypto\.randomUUID\(\)/, `${name} must use unguessable R2 object keys`);
  }
});

test("locks revisions, warning audit history and lifecycle transitions without changing Points", async () => {
  const [organizationRoute, warningRoute, recognitionRoute, schema, initialize, migration, packagedMigration] = await Promise.all([
    readFile(new URL("../app/api/organization-documents/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/employee-warnings/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/employee-recognitions/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/initialize.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0015_parallel_the_hood.sql", import.meta.url), "utf8"),
    readFile(new URL("../dist/.openai/drizzle/0015_parallel_the_hood.sql", import.meta.url), "utf8"),
  ]);

  assert.equal(packagedMigration, migration, "Sites build must package the exact validated migration 0015");
  for (const table of ["organization_documents", "employee_warnings", "employee_warning_events", "employee_recognitions"]) {
    assert.match(migration, new RegExp("CREATE TABLE `" + table + "`"));
    assert.match(initialize, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(schema, /organization_documents_number_version_unique/);
  assert.match(schema, /employee_warnings_warning_number_unique/);
  assert.match(schema, /employeeWarnings[\s\S]*?onDelete: "restrict"/);
  assert.match(schema, /employeeWarningEvents[\s\S]*?onDelete: "restrict"/);
  assert.match(schema, /employeeRecognitions[\s\S]*?onDelete: "restrict"/);

  for (const trigger of [
    "organization_document_revision_guard",
    "employee_warning_revision_guard",
    "employee_warning_status_transition_guard",
    "employee_warning_substantive_fields_lock",
    "employee_warning_created_audit",
    "employee_warning_updated_audit",
    "employee_warning_event_update_guard",
    "employee_warning_event_delete_guard",
    "employee_recognition_revision_guard",
  ]) {
    assert.match(initialize, new RegExp(`CREATE TRIGGER(?: IF NOT EXISTS)? ${trigger}`));
    assert.match(migration, new RegExp("CREATE TRIGGER `" + trigger + "`"));
  }
  assert.match(initialize, /employee_warning_event_update_guard[\s\S]*?RAISE\(ABORT, 'EMPLOYEE_WARNING_EVENT_IMMUTABLE'\)/);
  assert.match(initialize, /employee_warning_event_delete_guard[\s\S]*?RAISE\(ABORT, 'EMPLOYEE_WARNING_EVENT_IMMUTABLE'\)/);
  assert.match(initialize, /employee_warning_created_audit[\s\S]*?INSERT INTO employee_warning_events/);
  assert.match(initialize, /employee_warning_updated_audit[\s\S]*?INSERT INTO employee_warning_events/);

  assert.match(organizationRoute, /draft: \["active", "archived"\], active: \["expired", "archived"\], expired: \["active", "archived"\], archived: \[\]/);
  assert.match(warningRoute, /draft: \["issued", "withdrawn"\], issued: \["acknowledged", "resolved", "withdrawn"\]/);
  assert.match(warningRoute, /acknowledged: \["resolved", "withdrawn"\], resolved: \[\], withdrawn: \[\]/);
  assert.match(recognitionRoute, /active: \["expired", "revoked"\], expired: \["active", "revoked"\], revoked: \[\]/);

  for (const [name, route, table] of [
    ["organization documents", organizationRoute, "organizationDocuments"],
    ["employee warnings", warningRoute, "employeeWarnings"],
    ["employee recognitions", recognitionRoute, "employeeRecognitions"],
  ]) {
    assert.match(route, /revision: expectedRevision \+ 1/, `${name} must increment revisions`);
    assert.match(route, new RegExp(`eq\\(${table}\\.revision, expectedRevision\\)`), `${name} must compare-and-swap revisions`);
  }
  assert.match(organizationRoute, /expiryDateInput < effectiveDate/);
  assert.match(warningRoute, /issuedDate < incidentDate/);
  assert.match(warningRoute, /reviewDateInput < issuedDate/);
  assert.match(warningRoute, /employeeStatement: employeeStatement \?\? warning\.employeeStatement/, "acknowledgement without a new statement must preserve the existing employee statement");
  assert.match(recognitionRoute, /expiryDateInput < issuedDate/);
  assert.match(warningRoute, /การรับทราบเอกสารไม่ได้หมายถึงการยอมรับผิด/);
  assert.doesNotMatch(warningRoute, /pointLedger|pointEvents|recordPointEvent|pointMutation|points:\s*-?\d/i, "warning workflow must not mutate Points");
});

test("ships five safe, generic and reproducible DOCX templates in the deployed bundle", async () => {
  const builder = await readFile(new URL("../scripts/build_organization_templates.py", import.meta.url), "utf8");
  assert.match(builder, /OUTPUT_DIR = ROOT \/ "public" \/ "templates"/);
  assert.match(builder, /DRAFT/);
  assert.match(builder, /เอกสารนี้เป็นแม่แบบทั่วไป ไม่ใช่คำปรึกษากฎหมาย/);
  assert.match(builder, /การลงชื่อ “รับทราบ” ไม่เท่ากับ “ยอมรับผิด”/);
  assert.match(builder, /การออกใบเตือนไม่ควรหัก Points อัตโนมัติ/);
  assert.match(builder, /การเรียกเก็บความเสียหาย[\s\S]*?ไม่หักเงินหรือ Points อัตโนมัติ/);

  const expectedTemplateText = {
    "office-lease-agreement-template.docx": ["สัญญาเช่าสำนักงาน", "ภาษี ค่าธรรมเนียม และการหักภาษี ณ ที่จ่าย"],
    "employment-agreement-template.docx": ["สัญญาจ้างงาน", "ผลประเมินไม่เปลี่ยนสิทธิค่าจ้างหรือวินัยโดยอัตโนมัติ"],
    "confidentiality-nda-template.docx": ["ข้อตกลงการรักษาความลับ (NDA)", "การใช้ AI และบริการภายนอก"],
    "employee-warning-letter-template.docx": ["หนังสือเตือนพนักงาน", "ไม่เท่ากับ “ยอมรับผิด”", "ไม่ควรหัก Points อัตโนมัติ"],
    "asset-handover-return-template.docx": ["แบบรับมอบและคืนทรัพย์สิน", "ไม่หักเงินหรือ Points อัตโนมัติ"],
  };

  for (const fileName of templateFiles) {
    assert.match(builder, new RegExp(`save\\(doc, "${fileName.replaceAll(".", "\\.")}"\\)`), `${fileName} must be reproducible from the checked-in builder`);
    const sourceUrl = new URL(`../public/templates/${fileName}`, import.meta.url);
    const builtUrl = new URL(`../dist/client/templates/${fileName}`, import.meta.url);
    const [source, built, metadata] = await Promise.all([readFile(sourceUrl), readFile(builtUrl), stat(sourceUrl)]);
    assert.ok(metadata.size > 10_000 && metadata.size < 2_000_000, `${fileName} must have a plausible DOCX size`);
    assert.ok(source.equals(built), `${fileName} must be copied byte-for-byte into the deployed bundle`);

    const entries = readZipEntries(source);
    assert.ok(entries.has("[Content_Types].xml"), `${fileName} must declare OOXML content types`);
    assert.ok(entries.has("word/document.xml"), `${fileName} must contain a Word document body`);
    const entryNames = [...entries.keys()];
    assert.ok(entryNames.every((name) => !/(?:vbaProject\.bin|word\/embeddings\/|activeX\/|customUI\/|\.exe$|\.js$|\.html?$|\.cmd$|\.bat$|\.ps1$|\.sh$)/i.test(name)), `${fileName} must not embed executable or active content`);

    for (const [entryName, entry] of entries) {
      if (entryName.endsWith(".rels")) assert.doesNotMatch(entry.toString("utf8"), /TargetMode=["']External["']/i, `${fileName} must not have external OOXML relationships`);
    }
    assert.doesNotMatch(entries.get("[Content_Types].xml").toString("utf8"), /macroEnabled|vbaProject/i, `${fileName} must be macro-free`);

    const text = xmlText(entries.get("word/document.xml"));
    assert.ok(text.includes("DRAFT"), `${fileName} must be visibly marked as a draft`);
    assert.ok(text.includes("ไม่ใช่คำปรึกษากฎหมาย"), `${fileName} must include the legal-review disclaimer`);
    assert.ok(text.includes("[[VERSION]]"), `${fileName} must expose a version placeholder`);
    assert.match(text, /\[\[[A-Z][A-Z0-9_]*(?::[^\]]+)?\]\]/, `${fileName} must use generic placeholders instead of real personal data`);
    for (const expectedText of expectedTemplateText[fileName]) assert.ok(text.includes(expectedText), `${fileName} must include: ${expectedText}`);
  }
});

test("documents the storage, permissions, template and retention contract", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  assert.match(readme, /## เอกสารองค์กร ใบเตือน และเกียรติบัตร/);
  assert.match(readme, /หน้า \*\*เอกสารองค์กร\*\* เป็นพื้นที่ของ HR \/ Admin/);
  assert.match(readme, /ไฟล์เอกสารจริงเก็บใน R2 และตรวจสิทธิ์ฝั่งเซิร์ฟเวอร์ทุกครั้งที่ดาวน์โหลด/);
  assert.match(readme, /แม่แบบ DOCX 5 ฉบับ/);
  assert.match(readme, /ไม่ใช่คำปรึกษากฎหมาย/);
  assert.match(readme, /draft → issued → acknowledged \/ resolved \/ withdrawn/);
  assert.match(readme, /การออกใบเตือนไม่หัก Points อัตโนมัติ/);
  assert.match(readme, /ใช้ revision ป้องกันการแก้ชนกัน/);
  assert.match(readme, /ใช้การเก็บถาวรแทนการลบประวัติ/);
  assert.match(readme, /`0015_parallel_the_hood\.sql` เพิ่มคลังเอกสารองค์กร/);
});
