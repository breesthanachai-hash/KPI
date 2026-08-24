import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

test("builds the People Pulse KPI product bundle", async () => {
  const assetRoot = new URL("../dist/client/assets/", import.meta.url);
  const assetNames = await readdir(assetRoot);
  const pageAssetName = assetNames.find((name) => /^page-.*\.js$/.test(name));
  assert.ok(pageAssetName, "expected a built page asset");

  const [pageAsset, layout, styles, office3D, packageJson] = await Promise.all([
    readFile(new URL(pageAssetName, assetRoot), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/office-3d.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(pageAsset, /PEOPLE PULSE/);
  assert.match(pageAsset, /ภาพรวม KPI พนักงาน/);
  assert.match(pageAsset, /QUANTUM PEOPLE OS/);
  assert.match(pageAsset, /saveEvaluation/);
  assert.match(pageAsset, /สกิลรายบุคคล/);
  assert.match(pageAsset, /INDIVIDUAL SKILL PROFILE/);
  assert.match(pageAsset, /TALENT FIT ANALYSIS/);
  assert.match(pageAsset, /กราฟสกิลที่ถนัด/);
  assert.match(pageAsset, /ตำแหน่งที่เหมาะสม/);
  assert.match(pageAsset, /ค่าพลังพนักงาน/);
  assert.match(pageAsset, /TEAM POWER RATINGS/);
  assert.match(pageAsset, /EMPLOYEE POWER CARDS/);
  assert.match(pageAsset, /POWER ARENA/);
  assert.match(pageAsset, /เปรียบเทียบค่าพลัง/);
  assert.match(pageAsset, /SPD/);
  assert.match(pageAsset, /LDR/);
  assert.match(pageAsset, /บริหารทรัพยากรบุคคล/);
  assert.match(pageAsset, /PEOPLE OPERATING SYSTEM/);
  assert.match(pageAsset, /เวลาเข้างานและเส้นทางเติบโต/);
  assert.match(pageAsset, /TIME &amp; ATTENDANCE|TIME & ATTENDANCE/);
  assert.match(pageAsset, /เงินเพิ่มตามสกิลที่ยืนยันแล้ว/);
  assert.match(pageAsset, /SMART TEAM BUILDER/);
  assert.match(pageAsset, /saveAttendance/);
  assert.match(pageAsset, /approveAttendance/);
  assert.match(pageAsset, /verifySkillAchievement/);
  assert.match(pageAsset, /PEOPLE DECISION BOARD/);
  assert.match(pageAsset, /ทดสอบสกิล/);
  assert.match(pageAsset, /อัปสกิล/);
  assert.match(pageAsset, /กรอบเงินเดือนตามตำแหน่ง/);
  assert.match(pageAsset, /saveHrPlan/);
  assert.match(pageAsset, /completeTalentAction/);
  assert.match(pageAsset, /ทูดูลิส/);
  assert.match(pageAsset, /SMART TO-DO WORKSPACE/);
  assert.match(pageAsset, /พื้นที่ทำงาน/);
  assert.match(pageAsset, /บุคลากร/);
  assert.match(pageAsset, /สำนักงานจำลอง/);
  assert.match(pageAsset, /REAL-TIME 3D HERO OFFICE/);
  assert.match(pageAsset, /ภาระงานสูงสุดตอนนี้/);
  assert.match(pageAsset, /สำนักงานใหญ่ 3D หลายห้องในโลกเดียวกัน/);
  assert.match(office3D, /WebGLRenderer/);
  assert.match(office3D, /OrbitControls/);
  assert.match(office3D, /เดินสำรวจออฟฟิศ/);
  assert.match(office3D, /พักบนโซฟา/);
  assert.match(office3D, /คุยกับทีม/);
  assert.match(office3D, /requestFullscreen/);
  assert.match(office3D, /Raycaster/);
  assert.match(office3D, /3D WORLD LIVE/);
  assert.match(office3D, /REAL-TIME 3D/);
  assert.match(office3D, /ลากเพื่อหมุน/);
  assert.match(office3D, /office-3d-canvas/);
  assert.match(office3D, /AUTONOMOUS 3D WORLD/);
  assert.match(office3D, /setAnimationLoop/);
  assert.match(office3D, /hero-avatar/);
  assert.match(office3D, /data-activity/);
  assert.match(office3D, /CEO ROOM/);
  assert.match(office3D, /MANAGER POD/);
  assert.match(office3D, /CREATIVE LAB/);
  assert.match(office3D, /POWER CAFE/);
  assert.match(office3D, /ผู้พิทักษ์สุริยะ/);
  assert.match(office3D, /กัปตันขนมปังปิ้ง/);
  assert.match(office3D, /speechSynthesis/);
  assert.match(office3D, /createOfficeAudioEngine/);
  assert.match(office3D, /สุ่มเหตุการณ์ฮา/);
  assert.match(office3D, /OrthographicCamera/);
  assert.match(office3D, /addNeonCity/);
  assert.match(office3D, /addCampusPortal/);
  assert.match(office3D, /heroPositions/);
  assert.match(packageJson, /"three"/);
  assert.match(pageAsset, /TODAY/);
  assert.match(pageAsset, /MASTER TO-DO LIST/);
  assert.match(pageAsset, /รายการงานทั้งหมดของทีม/);
  assert.match(pageAsset, /งานเกินกำหนด/);
  assert.match(pageAsset, /7 วันข้างหน้า/);
  assert.match(pageAsset, /สะสมแต้ม แลกกิฟต์วอเชอร์และรางวัล/);
  assert.match(pageAsset, /POINTS OPERATIONS/);
  assert.match(pageAsset, /แต้มประเมินประจำเดือน/);
  assert.match(pageAsset, /กติกาการได้และเสียแต้ม/);
  assert.match(pageAsset, /คูปองเงินสด 100 บาท/);
  assert.match(pageAsset, /iPhone 18/);
  assert.match(pageAsset, /WORK PROOF CENTER/);
  assert.match(pageAsset, /ส่งหลักฐานงาน/);
  assert.match(pageAsset, /หลักฐานแนะนำตามตำแหน่ง/);
  assert.match(pageAsset, /ลิงก์วิดีโอฉบับ Final/);
  assert.match(pageAsset, /นักตัดต่อวิดีโอ/);
  assert.match(pageAsset, /แฟ้มผลงานพนักงาน/);
  assert.match(pageAsset, /EMPLOYEE WORK PORTFOLIO/);
  assert.match(pageAsset, /PORTFOLIO FINDER/);
  assert.match(pageAsset, /ค้นหาแฟ้มและไฟล์ผลงาน/);
  assert.match(pageAsset, /ข้อมูลพร้อมใช้ประกอบการประเมิน/);
  assert.match(pageAsset, /\/api\/profile-image/);
  assert.match(pageAsset, /reviewWorkSubmission/);
  assert.match(pageAsset, /saveWorkItem/);
  assert.match(pageAsset, /saveProject/);
  assert.match(pageAsset, /redeemReward/);
  assert.match(pageAsset, /แฟ้มพนักงาน/);
  assert.match(pageAsset, /EMPLOYEE DIGITAL DOSSIER/);
  assert.match(pageAsset, /เอกสารสมัครงาน/);
  assert.match(pageAsset, /ลงนามสัญญาอิเล็กทรอนิกส์/);
  assert.match(pageAsset, /saveEmployeeProfile/);
  assert.match(pageAsset, /createContract/);
  assert.match(pageAsset, /signContract/);
  assert.match(pageAsset, /ACCESS & PERMISSIONS/);
  assert.match(pageAsset, /ผู้ใช้งานและสิทธิ์เข้าถึง/);
  assert.match(pageAsset, /ให้แต่ละคนเห็นเฉพาะสิ่งที่ควรเห็น/);
  assert.match(pageAsset, /งานและภารกิจของฉัน/);
  assert.match(pageAsset, /saveUserAccount/);
  assert.match(pageAsset, /QUANTUM PEOPLE OS/);
  assert.match(pageAsset, /NEURAL CORE/);
  assert.match(pageAsset, /LIVE DATA STREAM/);
  assert.match(pageAsset, /ERA 3000/);
  assert.match(pageAsset, /รายละเอียดสกิล \(ปัจจุบัน\/เป้าหมาย\)/);
  assert.match(layout, /People Pulse 3000 — ศูนย์บัญชาการบุคลากรแห่งอนาคต/);
  assert.match(layout, /\/og-hero-campus\.png/);
  assert.match(styles, /Modern workspace refresh/);
  assert.match(styles, /app-shell \{ padding-left: 248px/);
  assert.match(styles, /nav-section-label/);
  assert.match(styles, /Live office simulation/);
  assert.match(styles, /office-timeline-play/);
  assert.match(styles, /Interactive 3D office world/);
  assert.match(styles, /office-3d-canvas/);
  assert.match(styles, /Hero Office Campus/);
  assert.match(styles, /office-3d-story-strip/);
  assert.match(styles, /office-ai-conversation/);
  assert.match(styles, /office-native-3d-badge/);
  assert.match(styles, /office-3d-world-hud/);
  assert.match(styles, /Cinematic campus view/);
  assert.match(styles, /autonomous-hero-layer/);
  assert.match(styles, /office-3d-world-hud/);
  assert.match(styles, /hero-leg-walk/);
  assert.match(styles, /PEOPLE PULSE 3000/);
  assert.match(styles, /future-grid-plane/);
  assert.match(styles, /future-scan-beam/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.doesNotMatch(pageAsset, /Your site is taking shape|Building your site|codex-preview/i);
});

test("ships durable role-based access and scoped people, work, portfolio and reward storage", async () => {
  const [hosting, migration, workforceMigration, workMigration, dossierMigration, dossierIndexMigration, proofMigration, pointsMigration, peopleOpsMigration, accessMigration, packagedMigration, packagedWorkforceMigration, packagedWorkMigration, packagedDossierMigration, packagedDossierIndexMigration, packagedProofMigration, packagedPointsMigration, packagedPeopleOpsMigration, packagedAccessMigration, page, dashboardRoute, accessControl, data, schema, documentRoute, profileImageRoute, workSubmissionRoute, nextConfig] = await Promise.all([
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0000_marvelous_pandemic.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0001_outstanding_leper_queen.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0002_legal_vector.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0003_light_runaways.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0004_tricky_domino.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0005_neat_kingpin.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0006_typical_zuras.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0007_colossal_lord_tyger.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0008_spotty_trauma.sql", import.meta.url), "utf8"),
    readFile(new URL("../dist/.openai/drizzle/0000_marvelous_pandemic.sql", import.meta.url), "utf8"),
    readFile(new URL("../dist/.openai/drizzle/0001_outstanding_leper_queen.sql", import.meta.url), "utf8"),
    readFile(new URL("../dist/.openai/drizzle/0002_legal_vector.sql", import.meta.url), "utf8"),
    readFile(new URL("../dist/.openai/drizzle/0003_light_runaways.sql", import.meta.url), "utf8"),
    readFile(new URL("../dist/.openai/drizzle/0004_tricky_domino.sql", import.meta.url), "utf8"),
    readFile(new URL("../dist/.openai/drizzle/0005_neat_kingpin.sql", import.meta.url), "utf8"),
    readFile(new URL("../dist/.openai/drizzle/0006_typical_zuras.sql", import.meta.url), "utf8"),
    readFile(new URL("../dist/.openai/drizzle/0007_colossal_lord_tyger.sql", import.meta.url), "utf8"),
    readFile(new URL("../dist/.openai/drizzle/0008_spotty_trauma.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/dashboard/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/access-control.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/kpi-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/documents/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/profile-image/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/work-submissions/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
  ]);

  assert.match(hosting, /"d1":\s*"DB"/);
  assert.match(hosting, /"r2":\s*"FILES"/);
  assert.match(migration, /CREATE TABLE `employees`/);
  assert.match(migration, /CREATE TABLE `evaluations`/);
  assert.equal(packagedMigration, migration);
  assert.match(workforceMigration, /CREATE TABLE `hr_profiles`/);
  assert.match(workforceMigration, /CREATE TABLE `talent_actions`/);
  assert.equal(packagedWorkforceMigration, workforceMigration);
  assert.match(workMigration, /CREATE TABLE `projects`/);
  assert.match(workMigration, /CREATE TABLE `work_items`/);
  assert.match(workMigration, /CREATE TABLE `point_ledger`/);
  assert.match(workMigration, /CREATE TABLE `rewards`/);
  assert.match(workMigration, /CREATE TABLE `reward_redemptions`/);
  assert.equal(packagedWorkMigration, workMigration);
  assert.match(dossierMigration, /CREATE TABLE `employee_profiles`/);
  assert.match(dossierMigration, /CREATE TABLE `application_documents`/);
  assert.match(dossierMigration, /CREATE TABLE `employment_contracts`/);
  assert.equal(packagedDossierMigration, dossierMigration);
  assert.match(dossierIndexMigration, /application_documents_required_type_unique/);
  assert.equal(packagedDossierIndexMigration, dossierIndexMigration);
  assert.match(proofMigration, /CREATE TABLE `work_submissions`/);
  assert.match(proofMigration, /profile_image_key/);
  assert.equal(packagedProofMigration, proofMigration);
  assert.match(pointsMigration, /CREATE TABLE `point_events`/);
  assert.match(pointsMigration, /point_events_employee_date_idx/);
  assert.equal(packagedPointsMigration, pointsMigration);
  assert.match(peopleOpsMigration, /CREATE TABLE `attendance_records`/);
  assert.match(peopleOpsMigration, /CREATE TABLE `skill_achievements`/);
  assert.match(peopleOpsMigration, /attendance_employee_date_unique/);
  assert.match(peopleOpsMigration, /skill_achievement_milestone_unique/);
  assert.equal(packagedPeopleOpsMigration, peopleOpsMigration);
  assert.match(accessMigration, /CREATE TABLE `user_accounts`/);
  assert.match(accessMigration, /user_accounts_email_unique/);
  assert.match(accessMigration, /user_accounts_auth_user_unique/);
  assert.match(accessMigration, /user_accounts_employee_unique/);
  assert.equal(packagedAccessMigration, accessMigration);
  assert.match(schema, /kpiScores/);
  assert.match(schema, /skillScores/);
  assert.match(schema, /currentSalary/);
  assert.match(schema, /salaryReviewMonth/);
  assert.match(schema, /talentActions/);
  assert.match(schema, /projects/);
  assert.match(schema, /workItems/);
  assert.match(schema, /pointLedger/);
  assert.match(schema, /pointEvents/);
  assert.match(schema, /rewardRedemptions/);
  assert.match(schema, /employeeProfiles/);
  assert.match(schema, /applicationDocuments/);
  assert.match(schema, /employmentContracts/);
  assert.match(schema, /profileImageKey/);
  assert.match(schema, /workSubmissions/);
  assert.match(schema, /attendanceRecords/);
  assert.match(schema, /skillAchievements/);
  assert.match(schema, /userAccounts/);
  assert.match(page, /saveEvaluation/);
  assert.match(page, /saveHrPlan/);
  assert.match(page, /saveWorkItem/);
  assert.match(page, /startWorkItem/);
  assert.match(page, /useState<View>\("work"\)/);
  assert.match(page, /workDueFilter/);
  assert.match(page, /workAssigneeFilter/);
  assert.match(page, /workViewMode/);
  assert.match(page, /redeemReward/);
  assert.match(page, /recordPointEvent/);
  assert.match(page, /runMonthlyPointCycle/);
  assert.match(dashboardRoute, /recordPointEvent/);
  assert.match(dashboardRoute, /runMonthlyPointCycle/);
  assert.match(dashboardRoute, /saveAttendance/);
  assert.match(dashboardRoute, /approveAttendance/);
  assert.match(dashboardRoute, /verifySkillAchievement/);
  assert.match(dashboardRoute, /saveUserAccount/);
  assert.match(dashboardRoute, /visibleEmployeeIds/);
  assert.match(dashboardRoute, /canManageAccounts/);
  assert.match(accessControl, /oai-authenticated-user-id/);
  assert.match(accessControl, /authenticateRequest/);
  assert.match(accessControl, /canAccessEmployee/);
  assert.match(data, /pointEventRules/);
  assert.match(data, /reward-cash-100/);
  assert.match(data, /reward-iphone-18/);
  assert.match(page, /saveEmployeeProfile/);
  assert.match(page, /signEmploymentContract/);
  assert.match(page, /submitWorkProof/);
  assert.match(page, /reviewWorkProof/);
  assert.match(page, /uploadProfileImage/);
  assert.match(page, /exportPortfolioReport/);
  assert.match(page, /portfolioSearch/);
  assert.match(documentRoute, /getFilesBucket/);
  assert.match(documentRoute, /10 \* 1024 \* 1024/);
  assert.match(profileImageRoute, /employee-profile-images/);
  assert.match(profileImageRoute, /5 \* 1024 \* 1024/);
  assert.match(workSubmissionRoute, /work-submissions/);
  assert.match(workSubmissionRoute, /25 \* 1024 \* 1024/);
  assert.match(nextConfig, /bodySizeLimit:\s*"25mb"/);
  assert.match(page, /exportReport/);
  await assert.rejects(access(new URL("app/_sites-preview", projectRoot)));
});
