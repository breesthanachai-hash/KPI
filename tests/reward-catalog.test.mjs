import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dashboardRoute = await readFile(path.join(projectRoot, "app/api/dashboard/route.ts"), "utf8");
const pageSource = await readFile(path.join(projectRoot, "app/page.tsx"), "utf8");
const schemaSource = await readFile(path.join(projectRoot, "db/schema.ts"), "utf8");
const cssSource = await readFile(path.join(projectRoot, "app/globals.css"), "utf8");

function sourceBlock(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `missing source block start: ${start}`);
  assert.ok(endIndex > startIndex, `missing source block end: ${end}`);
  return source.slice(startIndex, endIndex);
}

const saveRewardBlock = sourceBlock(
  dashboardRoute,
  'if (payload.action === "saveReward")',
  'if (payload.action === "deleteReward")',
);
const deleteRewardBlock = sourceBlock(
  dashboardRoute,
  'if (payload.action === "deleteReward")',
  'if (payload.action === "updateRewardRedemption")',
);
const redeemRewardBlock = sourceBlock(
  dashboardRoute,
  'if (payload.action === "redeemReward")',
  'if (payload.action === "saveEmployeeProfile")',
);
const uiSaveRewardBlock = sourceBlock(
  pageSource,
  "const saveReward = async",
  "const deleteReward = async",
);
const uiDeleteRewardBlock = sourceBlock(
  pageSource,
  "const deleteReward = async",
  "const redeemReward = async",
);

test("reward catalog mutations are typed and restricted to HR or admin", () => {
  assert.match(dashboardRoute, /type SaveRewardPayload = \{[\s\S]*?action: "saveReward"[\s\S]*?expectedInventoryVersion\?: number;[\s\S]*?expectedUpdatedAt\?: string;/);
  assert.match(dashboardRoute, /type DeleteRewardPayload = \{[\s\S]*?action: "deleteReward"[\s\S]*?confirmation\?: string;[\s\S]*?expectedInventoryVersion\?: number;[\s\S]*?expectedUpdatedAt\?: string;/);
  assert.match(dashboardRoute, /request\.json\(\) as[\s\S]*?SaveRewardPayload \| DeleteRewardPayload/);
  assert.match(dashboardRoute, /adminOnlyActions = new Set\(\[[\s\S]*?"saveReward"[\s\S]*?"deleteReward"/);
  assert.match(dashboardRoute, /adminOnlyActions\.has\(payload\.action\) && currentUser\.role !== "admin"[\s\S]*?เฉพาะ HR หรือผู้ดูแลระบบเท่านั้น/);
});

test("reward create and edit validate every catalog field on the server", () => {
  assert.match(saveRewardBlock, /const rewardCategories = new Set\(\["perk", "learning", "wellbeing", "recognition"\]\)/);
  assert.match(saveRewardBlock, /!title \|\| Array\.from\(title\)\.length > 160/);
  assert.match(saveRewardBlock, /Array\.from\(description\)\.length > 2_000/);
  assert.match(saveRewardBlock, /!category \|\| !rewardCategories\.has\(category\)/);
  assert.match(saveRewardBlock, /Array\.from\(icon\)\.length > 16/);
  assert.match(saveRewardBlock, /!Number\.isInteger\(costPoints\) \|\| costPoints < 1 \|\| costPoints > 10_000_000/);
  assert.match(saveRewardBlock, /!Number\.isInteger\(stock\) \|\| stock < 0 \|\| stock > 1_000_000/);
  assert.match(saveRewardBlock, /typeof payload\.isActive !== "boolean"/);
  assert.match(saveRewardBlock, /db\.insert\(rewards\)\.values\(reward\)\.returning\(\)/);
  assert.match(saveRewardBlock, /return Response\.json\(\{ reward: createdReward \}, \{ status: 201 \}\)/);
});

test("reward edit and delete require compare-and-swap versions", () => {
  for (const [name, block] of [["save", saveRewardBlock], ["delete", deleteRewardBlock]]) {
    assert.match(block, /const expectedUpdatedAt = typeof payload\.expectedUpdatedAt === "string"/);
    assert.match(block, /const expectedInventoryVersion = payload\.expectedInventoryVersion/);
    assert.match(block, /sourceReward\.updatedAt !== expectedUpdatedAt \|\| sourceReward\.inventoryVersion !== expectedInventoryVersion/);
    assert.match(block, /eq\(rewards\.id, sourceReward\.id\),[\s\S]*?eq\(rewards\.updatedAt, expectedUpdatedAt\),[\s\S]*?eq\(rewards\.inventoryVersion, expectedInventoryVersion\)/, `${name} must guard both metadata and inventory versions`);
    assert.match(block, /inventoryVersion: sourceReward\.inventoryVersion \+ 1/);
    assert.match(block, /\.returning\(\)/);
    assert.match(block, /status: 409/);
  }
});

test("deleting a reward is a confirmed soft delete that preserves redemption history", () => {
  assert.match(deleteRewardBlock, /const requiredConfirmation = `ลบรางวัล \$\{sourceReward\.title\}`/);
  assert.match(deleteRewardBlock, /payload\.confirmation !== requiredConfirmation/);
  assert.match(deleteRewardBlock, /db\.update\(rewards\)\.set\(\{[\s\S]*?isActive: false,[\s\S]*?inventoryVersion: sourceReward\.inventoryVersion \+ 1/);
  assert.match(deleteRewardBlock, /disposition: "deactivated"[\s\S]*?deleted: false[\s\S]*?deactivated: true/);
  assert.doesNotMatch(deleteRewardBlock, /db\.delete\(rewards\)/);
  assert.doesNotMatch(deleteRewardBlock, /rewardRedemptions|rewardRedemptionClaims|pointLedger|pointEvents/);
  assert.match(schemaSource, /export const rewardRedemptions[\s\S]*?pointsSpent: integer\("points_spent"\)\.notNull\(\)/);
});

test("non-admin reward visibility is active-only while redemption history remains employee-scoped", () => {
  assert.match(dashboardRoute, /const visibleRewardRedemptions = redemptionRows\.filter\(\(redemption\) => visibleEmployeeIds\.has\(redemption\.employeeId\)\)/);
  assert.match(dashboardRoute, /const visibleRewards = currentUser\.role === "admin"[\s\S]*?\? rewardRows[\s\S]*?: rewardRows\.filter\(\(reward\) => reward\.isActive\)/);
  assert.match(dashboardRoute, /rewards: visibleRewards/);
  assert.match(dashboardRoute, /rewardRedemptions: visibleRewardRedemptions/);
  assert.doesNotMatch(dashboardRoute, /visibleHistoricalRewardIds/);
});

test("catalog changes never alter Points or historical redemption snapshots", () => {
  const catalogMutationBlocks = `${saveRewardBlock}\n${deleteRewardBlock}`;
  assert.doesNotMatch(catalogMutationBlocks, /db\.(?:insert|update|delete)\((?:pointLedger|pointEvents|rewardRedemptions|rewardRedemptionClaims)\)/);
  assert.doesNotMatch(catalogMutationBlocks, /pointsSpent/);
  assert.match(redeemRewardBlock, /pointsSpent: reward\.costPoints/);
  assert.match(redeemRewardBlock, /points: -reward\.costPoints/);
});

test("reward redemption rolls back if an admin catalog edit wins the inventory race", () => {
  assert.match(redeemRewardBlock, /eq\(rewards\.inventoryVersion, reward\.inventoryVersion\), eq\(rewards\.stock, reward\.stock\)/);
  assert.match(redeemRewardBlock, /CASE WHEN changes\(\) = 1 THEN \$\{rewards\.title\} ELSE NULL END/);
  assert.match(dashboardRoute, /isRedemptionConflictError[\s\S]*?NOT NULL constraint failed: rewards\.title/);
  assert.match(redeemRewardBlock, /isRedemptionConflictError\(error\)[\s\S]*?ยอด Points หรือสต็อกมีการเปลี่ยนแปลงพร้อมกัน[\s\S]*?status: 409/);
});

test("the reward manager UI is admin-only, preview-safe and keeps inactive rewards for audit", () => {
  assert.match(pageSource, /const canManageRewardCatalog = Boolean\(isAdmin && !isEmployeePreview\)/);
  assert.match(pageSource, /const rewardCatalog = canManageRewardCatalog \? rewards : rewards\.filter\(\(reward\) => reward\.isActive\)/);
  assert.match(pageSource, /canManageRewardCatalog && <button type="button" onClick=\{\(\) => openRewardEditor\(\)\}[\s\S]*?สร้างรางวัล/);
  assert.match(pageSource, /canManageRewardCatalog && <div className="reward-admin-actions"[\s\S]*?openRewardEditor\(reward\)[\s\S]*?deleteReward\(reward\)/);
  assert.match(pageSource, /showRewardForm && isAdmin && !isEmployeePreview/);
  assert.match(pageSource, /id="reward-management-title"[\s\S]*?แก้ไขรางวัล[\s\S]*?สร้างรางวัลใหม่/);
  for (const label of ["ชื่อรางวัล", "รายละเอียด", "หมวดรางวัล", "ไอคอน", "ราคา (Points)", "สต็อก (จำนวนสิทธิ์)", "เปิดให้แลกรางวัล", "ปิดรางวัลไว้"]) {
    assert.ok(pageSource.includes(label), `missing reward form label: ${label}`);
  }
  assert.match(uiSaveRewardBlock, /currentUser\?\.role !== "admin" \|\| isEmployeePreview/);
  assert.match(uiSaveRewardBlock, /action: "saveReward"[\s\S]*?expectedUpdatedAt: editingReward\?\.updatedAt[\s\S]*?expectedInventoryVersion:/);
  assert.match(uiDeleteRewardBlock, /window\.confirm\(`[\s\S]*?ระบบจะเก็บประวัติคำขอเดิมไว้ตรวจสอบ/);
  assert.match(uiDeleteRewardBlock, /action: "deleteReward"[\s\S]*?expectedUpdatedAt: reward\.updatedAt[\s\S]*?expectedInventoryVersion:[\s\S]*?confirmation: `ลบรางวัล \$\{reward\.title\}`/);
  assert.match(uiDeleteRewardBlock, /setRewards\(\(items\) => items\.map\(\(item\) => item\.id === deactivatedReward\.id \? deactivatedReward : item\)\)/);
  assert.doesNotMatch(uiDeleteRewardBlock, /setRewards\([\s\S]*?\.filter\(/);
  assert.match(cssSource, /\.reward-admin-actions[\s\S]*?\.reward-management-modal[\s\S]*?\.reward-delete-button/);
});

test("reward history uses the immutable spend note without exposing a deactivated catalog icon", () => {
  assert.match(pageSource, /const historicalRewardTitlesByRedemption = useMemo\(\(\) => \{[\s\S]*?const notePrefix = "แลกรางวัล: ";/);
  assert.match(pageSource, /entry\.sourceType !== "redemption" \|\| entry\.points >= 0 \|\| !entry\.note\.startsWith\(notePrefix\) \|\| titles\.has\(entry\.sourceId\)/);
  assert.match(pageSource, /const historicalTitle = entry\.note\.slice\(notePrefix\.length\)\.trim\(\);[\s\S]*?titles\.set\(entry\.sourceId, historicalTitle\)/);
  assert.match(pageSource, /return titles;[\s\S]*?\}, \[accessiblePointLedger\]\)/);
  assert.ok((pageSource.match(/historicalRewardTitlesByRedemption\.get\(redemption\.id\) \?\? reward\?\.title \?\? "รางวัล"/g) ?? []).length >= 2, "notifications and redemption history must both use the immutable title snapshot");
  assert.match(pageSource, /return <article key=\{redemption\.id\} className=\{`redemption-request status-\$\{redemption\.status\}`\}><span>★<\/span><p><strong>\{historicalRewardTitle\}<\/strong>/);
  assert.doesNotMatch(pageSource, /className=\{`redemption-request status-\$\{redemption\.status\}`\}><span>\{reward\?\.icon/);
});

test("the built site ships reward creation, editing and safe deletion", async () => {
  const assetDirectory = path.join(projectRoot, "dist/client/assets");
  const assetNames = (await readdir(assetDirectory)).filter((name) => name.endsWith(".js"));
  const bundle = (await Promise.all(assetNames.map((name) => readFile(path.join(assetDirectory, name), "utf8")))).join("\n");
  for (const copy of [
    "จัดการรางวัลขององค์กร",
    "สร้างรางวัล",
    "สร้างรางวัลใหม่",
    "แก้ไขรางวัล",
    "ลบรางวัล",
    "ราคา (Points)",
    "สต็อก (จำนวนสิทธิ์)",
    "ประวัติการแลกจะไม่หาย",
    "นำออกจากร้านแล้ว",
  ]) {
    assert.ok(bundle.includes(copy), `built reward manager must include: ${copy}`);
  }
});
