import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

test("builds the People Pulse KPI product bundle", async () => {
  const assetRoot = new URL("../dist/client/assets/", import.meta.url);
  const assetNames = await readdir(assetRoot);
  const pageAssetName = assetNames.find((name) => /^page-.*\.js$/.test(name));
  assert.ok(pageAssetName, "expected a built page asset");

  const [pageAsset, layout, styles, office3D, aiAssistant, kpiData, dashboardRoute, packageJson] = await Promise.all([
    readFile(new URL(pageAssetName, assetRoot), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/office-3d.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ai-assistant.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/kpi-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/dashboard/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(pageAsset, /PEOPLE PULSE/);
  assert.match(pageAsset, /ภาพรวม KPI พนักงาน/);
  assert.match(pageAsset, /PEOPLE &amp; WORK OS|PEOPLE & WORK OS/);
  assert.match(pageAsset, /saveEvaluation/);
  assert.match(pageAsset, /สกิลรายบุคคล/);
  assert.match(pageAsset, /ประเมินรอบด้าน 22–24 สมรรถนะ/);
  assert.match(pageAsset, /6 หมวดมาตรฐาน/);
  assert.match(pageAsset, /AI SKILL PATH/);
  assert.match(pageAsset, /เส้นทางการใช้ AI จากพื้นฐานสู่ขั้นสูง/);
  assert.match(pageAsset, /ระดับ 1–2/);
  assert.match(pageAsset, /ระดับ 4–5/);
  assert.match(pageAsset, /ผู้จัดการทีมหน้าบ้านและการเติบโต/);
  assert.match(pageAsset, /นักการตลาดด้าน Customer Insight/);
  assert.match(pageAsset, /นักการตลาดด้าน Offer &amp; Conversion|นักการตลาดด้าน Offer & Conversion/);
  assert.match(pageAsset, /นักการตลาดด้าน CRM &amp; Retention|นักการตลาดด้าน CRM & Retention/);
  assert.match(pageAsset, /นักตัดต่อวิดีโอสาย Performance/);
  assert.match(pageAsset, /นักตัดต่อวิดีโอสาย Brand &amp; Content|นักตัดต่อวิดีโอสาย Brand & Content/);
  assert.match(pageAsset, /ผู้ดูแล TikTok Shop \/ Shopee \/ Lazada/);
  assert.match(pageAsset, /ผู้เชี่ยวชาญโฆษณา Facebook/);
  assert.match(pageAsset, /การบริหาร TikTok Shop, Shopee และ Lazada/);
  assert.match(pageAsset, /Pixel, CAPI และ Event Tracking/);
  assert.match(kpiData, /นรินทร์ กิตติคุณ/);
  assert.match(kpiData, /growth-commerce-manager/);
  assert.match(kpiData, /seedEmployeeLegacyRoleIds/);
  assert.match(kpiData, /core-ai-work-mastery/);
  assert.match(kpiData, /การใช้ AI ในงาน: พื้นฐาน → เชิงลึก → ผู้เชี่ยวชาญ/);
  assert.match(kpiData, /ห้ามใส่ข้อมูลลับ/);
  assert.match(kpiData, /มีมนุษย์กำกับ/);
  assert.match(kpiData, /eligibleForAllowance: false/);
  assert.equal((kpiData.match(/\], aiWorkMastery\(/g) ?? []).length, 8, "expected a role-specific AI target for every current role");
  const skillCategoryBlock = kpiData.match(/export const skillCategories:[\s\S]*?\n\];/)?.[0] ?? "";
  const skillCategoryWeightTotal = [...skillCategoryBlock.matchAll(/weight: (\d+)/g)].reduce((sum, match) => sum + Number(match[1]), 0);
  assert.equal(skillCategoryWeightTotal, 100, "competency category weights must total 100");
  assert.match(dashboardRoute, /isUnmodifiedDemoEmployee/);
  assert.match(pageAsset, /วินัยและความตรงต่อเวลา/);
  assert.match(pageAsset, /ความรับผิดชอบและการเป็นเจ้าของงาน/);
  assert.match(pageAsset, /มารยาท การให้เกียรติ และความเหมาะสม/);
  assert.match(pageAsset, /ความซื่อสัตย์และจริยธรรม/);
  assert.match(pageAsset, /พฤติกรรมที่สังเกตได้/);
  assert.match(pageAsset, /ประเมินแล้ว/);
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
  assert.match(pageAsset, /งานของทีม/);
  assert.match(pageAsset, /รายการเดียวจบ/);
  assert.match(pageAsset, /พื้นที่ทำงาน/);
  assert.match(pageAsset, /บุคลากร/);
  assert.match(pageAsset, /สำนักงานจำลอง/);
  assert.match(pageAsset, /สำนักงาน 3D ของทีม/);
  assert.match(pageAsset, /ภาระงานสูงสุดตอนนี้/);
  assert.match(pageAsset, /สำนักงานใหญ่ 3D หลายห้องในโลกเดียวกัน/);
  assert.match(office3D, /WebGLRenderer/);
  assert.match(office3D, /OrbitControls/);
  assert.match(office3D, /เดินสำรวจออฟฟิศ/);
  assert.match(office3D, /พักบนโซฟา/);
  assert.match(office3D, /คุยกับทีม/);
  assert.match(office3D, /requestFullscreen/);
  assert.match(office3D, /Raycaster/);
  assert.match(office3D, /สำนักงาน 3D สด/);
  assert.match(office3D, /REAL-TIME 3D/);
  assert.match(office3D, /ลากเพื่อหมุน/);
  assert.match(office3D, /office-3d-canvas/);
  assert.match(office3D, /สำนักงาน 3D อัตโนมัติ/);
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
  assert.match(pageAsset, /งานของวันนี้/);
  assert.match(pageAsset, /simple-todo-card/);
  assert.match(pageAsset, /เลือกส่วนจัดการงาน/);
  assert.match(pageAsset, /รายการงาน/);
  assert.match(pageAsset, /ติดตามภาพรวม/);
  assert.match(pageAsset, /ใช้แต้มแลกของ/);
  assert.match(pageAsset, /งานที่ต้องทำ/);
  assert.match(pageAsset, /เกินกำหนด/);
  assert.match(pageAsset, /งานภายใน 7 วัน/);
  assert.match(pageAsset, /สะสมแต้ม แลกกิฟต์วอเชอร์และรางวัล/);
  assert.match(pageAsset, /POINTS OPERATIONS/);
  assert.match(pageAsset, /แต้มประเมินประจำเดือน/);
  assert.match(pageAsset, /กติกาการได้และเสียแต้ม/);
  assert.match(kpiData, /คูปองเงินสด 100 บาท/);
  assert.match(kpiData, /iPhone 18/);
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
  assert.match(pageAsset, /งานของฉัน/);
  assert.match(pageAsset, /saveUserAccount/);
  assert.match(pageAsset, /ผู้ช่วย AI/);
  assert.match(pageAsset, /People AI/);
  assert.match(pageAsset, /กล่องข้อความและแจ้งเตือน/);
  assert.match(pageAsset, /มีเควส:/);
  assert.match(pageAsset, /อ่านทั้งหมด/);
  assert.match(pageAsset, /markNotificationsRead/);
  assert.match(aiAssistant, /จัดลำดับงานวันนี้/);
  assert.match(aiAssistant, /ช่วยวิเคราะห์ KPI/);
  assert.match(aiAssistant, /AI-assisted Editing/);
  assert.match(aiAssistant, /วิเคราะห์จากข้อมูลที่คุณมีสิทธิ์เห็นเท่านั้น/);
  assert.match(aiAssistant, /people-pulse-ai-chat/);
  assert.match(pageAsset, /PEOPLE &amp; WORK OS|PEOPLE & WORK OS/);
  assert.doesNotMatch(pageAsset, /NEURAL CORE|LIVE DATA STREAM|ERA 3000/);
  assert.match(pageAsset, /รายละเอียดสกิล \(ปัจจุบัน\/เป้าหมาย\)/);
  assert.match(layout, /People Pulse — ระบบจัดการคนและงานที่ใช้ง่าย/);
  assert.match(layout, /@fontsource-variable\/noto-sans-thai\/wght\.css/);
  assert.doesNotMatch(layout, /\/og-hero-campus\.png/);
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
  assert.match(styles, /Modern Nature theme/);
  assert.match(styles, /Contrast balance/);
  assert.match(styles, /People AI/);
  assert.match(styles, /ai-assistant-panel/);
  assert.match(styles, /Unified Thai typography/);
  assert.match(styles, /Noto Sans Thai Variable/);
  assert.match(styles, /Botanical text palette/);
  assert.match(styles, /--text-secondary: #365f54/);
  assert.match(styles, /Complete UI rebuild/);
  assert.match(styles, /--forest: #245fbe/);
  assert.match(styles, /Work hub/);
  assert.match(styles, /work-section-tabs/);
  assert.match(styles, /Competency framework/);
  assert.match(styles, /competency-framework-card/);
  assert.match(styles, /ai-level-guide/);
  assert.match(styles, /skill-category-tabs/);
  assert.match(styles, /Accessibility contrast lock/);
  assert.match(styles, /Notification center/);
  assert.match(styles, /notification-bell-button/);
  assert.match(styles, /notification-center/);
  assert.match(styles, /top-right-utilities/);
  assert.match(styles, /top-profile-menu/);
  assert.match(styles, /point-balance-charter/);
  assert.match(styles, /--on-dark-secondary: #e7f1ff/);
  assert.match(styles, /\.skill-profile-hero \.profile-identity h2/);
  assert.match(styles, /\.role-fit-panel \.fit-disclaimer/);
  assert.match(styles, /\.profile-level-track span \{ color: #365d80/);
  assert.match(office3D, /Noto Sans Thai Variable/);
  assert.match(styles, /calm-shell/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.doesNotMatch(pageAsset, /Your site is taking shape|Building your site|codex-preview/i);
});

test("ships durable role-based access and scoped people, work, portfolio and reward storage", async () => {
  const [hosting, migration, workforceMigration, workMigration, dossierMigration, dossierIndexMigration, proofMigration, pointsMigration, peopleOpsMigration, accessMigration, notificationMigration, policyMigration, packagedMigration, packagedWorkforceMigration, packagedWorkMigration, packagedDossierMigration, packagedDossierIndexMigration, packagedProofMigration, packagedPointsMigration, packagedPeopleOpsMigration, packagedAccessMigration, packagedNotificationMigration, packagedPolicyMigration, page, dashboardRoute, accessControl, data, schema, documentRoute, profileImageRoute, workSubmissionRoute, nextConfig] = await Promise.all([
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
    readFile(new URL("../drizzle/0009_easy_wong.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0010_dry_blue_blade.sql", import.meta.url), "utf8"),
    readFile(new URL("../dist/.openai/drizzle/0000_marvelous_pandemic.sql", import.meta.url), "utf8"),
    readFile(new URL("../dist/.openai/drizzle/0001_outstanding_leper_queen.sql", import.meta.url), "utf8"),
    readFile(new URL("../dist/.openai/drizzle/0002_legal_vector.sql", import.meta.url), "utf8"),
    readFile(new URL("../dist/.openai/drizzle/0003_light_runaways.sql", import.meta.url), "utf8"),
    readFile(new URL("../dist/.openai/drizzle/0004_tricky_domino.sql", import.meta.url), "utf8"),
    readFile(new URL("../dist/.openai/drizzle/0005_neat_kingpin.sql", import.meta.url), "utf8"),
    readFile(new URL("../dist/.openai/drizzle/0006_typical_zuras.sql", import.meta.url), "utf8"),
    readFile(new URL("../dist/.openai/drizzle/0007_colossal_lord_tyger.sql", import.meta.url), "utf8"),
    readFile(new URL("../dist/.openai/drizzle/0008_spotty_trauma.sql", import.meta.url), "utf8"),
    readFile(new URL("../dist/.openai/drizzle/0009_easy_wong.sql", import.meta.url), "utf8"),
    readFile(new URL("../dist/.openai/drizzle/0010_dry_blue_blade.sql", import.meta.url), "utf8"),
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
  assert.match(notificationMigration, /CREATE TABLE `notification_reads`/);
  assert.match(notificationMigration, /notification_reads_user_notification_unique/);
  assert.equal(packagedNotificationMigration, notificationMigration);
  assert.match(policyMigration, /CREATE TABLE `organization_policies`/);
  assert.match(policyMigration, /CREATE TABLE `policy_acknowledgements`/);
  assert.match(policyMigration, /policy_acknowledgements_policy_version_employee_unique/);
  assert.equal(packagedPolicyMigration, policyMigration);
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
  assert.match(schema, /notificationReads/);
  assert.match(schema, /organizationPolicies/);
  assert.match(schema, /policyAcknowledgements/);
  assert.match(page, /saveEvaluation/);
  assert.match(page, /saveHrPlan/);
  assert.match(page, /saveWorkItem/);
  assert.match(page, /startWorkItem/);
  assert.match(page, /useState<View>\("work"\)/);
  assert.match(page, /workDueFilter/);
  assert.match(page, /workAssigneeFilter/);
  assert.match(page, /simple-todo-card/);
  assert.match(page, /ฉันต้องทำอะไรต่อ/);
  assert.match(page, /redeemReward/);
  assert.match(page, /recordPointEvent/);
  assert.match(page, /runMonthlyPointCycle/);
  assert.match(dashboardRoute, /recordPointEvent/);
  assert.match(dashboardRoute, /runMonthlyPointCycle/);
  assert.match(dashboardRoute, /award_after_approved_evidence/);
  assert.match(dashboardRoute, /positiveManualEventsPerMonth/);
  assert.match(dashboardRoute, /monthlyEvaluationMinimumScore/);
  assert.match(dashboardRoute, /saveAttendance/);
  assert.match(dashboardRoute, /approveAttendance/);
  assert.match(dashboardRoute, /verifySkillAchievement/);
  assert.match(dashboardRoute, /hasCompleteSkillAssessment/);
  assert.match(dashboardRoute, /calculateSkillScore/);
  assert.match(dashboardRoute, /saveUserAccount/);
  assert.match(dashboardRoute, /markNotificationsRead/);
  assert.match(dashboardRoute, /visibleEmployeeIds/);
  assert.match(dashboardRoute, /canManageAccounts/);
  assert.match(accessControl, /oai-authenticated-user-id/);
  assert.match(accessControl, /authenticateRequest/);
  assert.match(accessControl, /canAccessEmployee/);
  assert.match(data, /pointEventRules/);
  assert.match(data, /pointEconomyPolicy/);
  assert.match(data, /workPointAwards/);
  assert.match(data, /monthlyEvaluationPoints/);
  assert.match(data, /coreCompetencies/);
  assert.match(data, /core-discipline/);
  assert.match(data, /core-respect-manners/);
  assert.match(data, /calculateSkillScore/);
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

test("ships a private employee portal with safe team overview and self-only actions", async () => {
  const [page, pageAsset, dashboardRoute, workSubmissionRoute, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    (async () => {
      const assetRoot = new URL("../dist/client/assets/", import.meta.url);
      const assetNames = await readdir(assetRoot);
      const pageAssetName = assetNames.find((name) => /^page-.*\.js$/.test(name));
      assert.ok(pageAssetName, "expected a built page asset");
      return readFile(new URL(pageAssetName, assetRoot), "utf8");
    })(),
    readFile(new URL("../app/api/dashboard/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/work-submissions/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(pageAsset, /MY PEOPLE PULSE/);
  assert.match(pageAsset, /EMPLOYEE PORTAL/);
  assert.match(pageAsset, /งานของฉัน/);
  assert.match(pageAsset, /แฟ้มผลงานของฉัน/);
  assert.match(pageAsset, /สำนักงานของทีม/);
  assert.match(pageAsset, /ค่าพลังทีม/);
  assert.match(pageAsset, /เติบโต &amp; เงินเดือน|เติบโต & เงินเดือน/);
  assert.match(pageAsset, /แต้ม &amp; รางวัล|แต้ม & รางวัล/);
  assert.match(pageAsset, /MY GROWTH PATH/);
  assert.match(pageAsset, /เงินเดือนปัจจุบัน/);
  assert.match(pageAsset, /สกิลที่ควรพัฒนาต่อ/);
  assert.match(pageAsset, /ข้อมูลส่วนนี้เห็นได้เฉพาะคุณและ HR/);

  assert.match(page, /const employeeViews: View\[\] = \["work", "portfolio", "office", "power", "peopleOps"\]/);
  assert.match(page, /section\.id !== "projects"/);
  assert.match(page, /!isEmployeeUser && <AiAssistant/);
  assert.match(page, /item\.assigneeEmployeeId === currentUser\.employeeId/);
  assert.match(page, /const activeRewardEmployeeId = isAdmin \? rewardEmployeeId : currentUser\?\.employeeId \?\? ""/);
  assert.match(page, /บัญชีที่ใช้แต้ม/);
  assert.match(page, /employee-growth-portal/);
  assert.match(page, /employee-portal-welcome/);

  assert.match(dashboardRoute, /teamOverview: employeePortalTeamOverview/);
  assert.match(dashboardRoute, /email: "", manager: ""/);
  assert.match(dashboardRoute, /kpiScores: \{\}, note: "", evaluator: ""/);
  assert.match(dashboardRoute, /title: item\.kind === "mission" \? "ภารกิจของทีม"/);
  assert.match(dashboardRoute, /id: `team-load:/);
  assert.match(dashboardRoute, /dueDate: item\.dueDate < teamOverviewDate \? "2000-01-01"/);
  assert.match(dashboardRoute, /currentUser\.role === "admin" \|\| currentUser\.role === "employee" \? hrProfileRows/);
  assert.match(dashboardRoute, /const employeePortalActions = new Set\(\["markNotificationsRead", "saveWorkItem", "redeemReward", "acknowledgeOrganizationPolicy", "signContract"\]\)/);
  assert.match(dashboardRoute, /งานที่ส่งตรวจหรือปิดแล้วไม่สามารถแก้ความคืบหน้าได้/);
  assert.match(workSubmissionRoute, /งานนี้ส่งตรวจหรือปิดแล้ว/);
  assert.match(workSubmissionRoute, /งานนี้มีหลักฐานรอตรวจอยู่แล้ว/);

  const employeePortalStyles = styles.match(/\/\* Employee portal: the same blue-and-orange visual language as the HR workspace \*\/[\s\S]*?(?=\n@media \(max-width: 1180px\))/)?.[0] ?? "";
  assert.ok(employeePortalStyles, "expected the employee portal palette block");
  assert.match(employeePortalStyles, /var\(--forest\)/, "employee portal should inherit the HR blue primary palette");
  assert.match(employeePortalStyles, /var\(--mustard\)/, "employee portal should use the HR orange accent");
  assert.match(employeePortalStyles, /color: #fff !important/);
  assert.match(employeePortalStyles, /color: #c9dbef !important/);
  assert.match(employeePortalStyles, /color: #ffb467 !important/);
  assert.doesNotMatch(employeePortalStyles, /#123f4b|#165a62|#184d64|#17645f|#26766c|#2c7c6d|#176859|#8ee2cf|#dff5ed|#66bca6/i, "employee portal must not restore the old teal-green theme");
  assert.match(styles, /\.employee-portal-shell/);
  assert.match(styles, /\.employee-growth-portal/);
  assert.match(styles, /\.reward-owner-lock/);
});

test("ships a secure admin-only, read-only employee preview link", async () => {
  const [page, dashboardRoute] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/dashboard/route.ts", import.meta.url), "utf8"),
  ]);

  // The public-facing query key is deliberately translated to the API key;
  // the API remains the authority that decides whether previewing is allowed.
  assert.match(page, /get\("employee_preview"\)/);
  assert.match(page, /dashboardParams\.set\("previewEmployeeId", previewEmployeeId\)/);
  assert.match(page, /setEmployeePreview\(body\.employeePreview \?\? null\)/);
  assert.match(page, /const isEmployeePreview = Boolean\(employeePreview\?\.readOnly\)/);

  // A preview can only be activated by an already-authenticated admin. It
  // becomes an employee-scoped identity in memory and never changes an account.
  assert.match(dashboardRoute, /const authenticatedUser = await authenticateRequest\(request\)/);
  assert.match(dashboardRoute, /const requestedPreviewEmployeeId = url\.searchParams\.get\("previewEmployeeId"\)/);
  assert.match(dashboardRoute, /const isEmployeePreviewRequest = authenticatedUser\.role === "admin" && Boolean\(requestedPreviewEmployeeId\)/);
  assert.match(dashboardRoute, /let currentUser = authenticatedUser/);
  assert.match(dashboardRoute, /id: `employee-preview:\$\{previewEmployee\.id\}`/);
  assert.match(dashboardRoute, /role: "employee"/);
  assert.match(dashboardRoute, /employeeId: previewEmployee\.id/);
  assert.match(dashboardRoute, /employeePreview = \{[\s\S]*?employeeId: previewEmployee\.id,[\s\S]*?readOnly: true,[\s\S]*?launchedBy: authenticatedUser\.displayName/);
  assert.match(dashboardRoute, /ไม่พบโปรไฟล์พนักงานที่ใช้งานอยู่สำหรับโหมดทดลอง/);

  // Admin account data and persisted notification state must not cross the
  // employee-preview boundary, including at the database-read layer.
  assert.match(dashboardRoute, /authenticatedUser\.role === "admin" && !isEmployeePreviewRequest \? db\.select\(\)\.from\(userAccounts\) : Promise\.resolve\(\[\]\)/);
  assert.match(dashboardRoute, /isEmployeePreviewRequest \? Promise\.resolve\(\[\]\) : db\.select\(\)\.from\(notificationReads\)/);
  assert.match(dashboardRoute, /userAccounts: currentUser\.role === "admin" \? userAccountRows : \[\]/);
  assert.match(dashboardRoute, /notificationReads: employeePreview \? \[\] : notificationReadRows/);

  // The UI makes the simulation obvious and blocks every employee mutation
  // available from this portal while preserving read-only inspection.
  assert.match(page, /className="employee-preview-banner"/);
  assert.match(page, /โหมดทดลองมุมมองพนักงาน/);
  assert.match(page, /โหมดนี้อ่านอย่างเดียว/);
  assert.match(page, /กลับมุมมองผู้ดูแล/);
  assert.match(page, /const guardEmployeePreviewMutation/);
  assert.match(page, /if \(isEmployeePreview\) return;/);
  assert.match(page, /guardEmployeePreviewMutation\("เริ่มหรืออัปเดตงาน"\)/);
  assert.match(page, /guardEmployeePreviewMutation\("ส่งหลักฐานใหม่"\)/);
  assert.match(page, /guardEmployeePreviewMutation\("ส่งคำขอแลกรางวัล"\)/);
  assert.match(page, /guardEmployeePreviewMutation\("ยืนยันรับทราบกฎองค์กร"\)/);
  assert.match(page, /disabled=\{isSaving \|\| isEmployeePreview\}/);
  assert.match(page, /disabled=\{isEmployeePreview \|\| !unreadNotifications\.length\}/);
});

test("ships balanced point governance and version-specific organization policy acknowledgements", async () => {
  const assetRoot = new URL("../dist/client/assets/", import.meta.url);
  const assetNames = await readdir(assetRoot);
  const pageAssetName = assetNames.find((name) => /^page-.*\.js$/.test(name));
  assert.ok(pageAssetName, "expected a built page asset");

  const [pageAsset, page, dashboardRoute, data, schema, initialize, styles, policyMigration, packagedPolicyMigration, governanceMigration, packagedGovernanceMigration] = await Promise.all([
    readFile(new URL(pageAssetName, assetRoot), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/dashboard/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/kpi-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/initialize.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0010_dry_blue_blade.sql", import.meta.url), "utf8"),
    readFile(new URL("../dist/.openai/drizzle/0010_dry_blue_blade.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0011_same_iceman.sql", import.meta.url), "utf8"),
    readFile(new URL("../dist/.openai/drizzle/0011_same_iceman.sql", import.meta.url), "utf8"),
  ]);

  // Policies and immutable acknowledgement evidence survive deployments.
  assert.match(schema, /export const organizationPolicies = sqliteTable\("organization_policies"/);
  assert.match(schema, /export const policyAcknowledgements = sqliteTable\("policy_acknowledgements"/);
  assert.match(schema, /policyVersion: integer\("policy_version"\)\.notNull\(\)/);
  assert.match(schema, /contentHash: text\("content_hash"\)\.notNull\(\)/);
  assert.match(schema, /uniqueIndex\("policy_acknowledgements_policy_version_employee_unique"\)\.on\(table\.policyId, table\.policyVersion, table\.employeeId\)/);
  assert.match(policyMigration, /CREATE TABLE `organization_policies`/);
  assert.match(policyMigration, /CREATE TABLE `policy_acknowledgements`/);
  assert.match(policyMigration, /CREATE UNIQUE INDEX `organization_policies_code_version_unique`/);
  assert.match(policyMigration, /CREATE UNIQUE INDEX `policy_acknowledgements_policy_version_employee_unique` ON `policy_acknowledgements` \(`policy_id`,`policy_version`,`employee_id`\)/);
  assert.match(initialize, /CREATE TABLE IF NOT EXISTS organization_policies/);
  assert.match(initialize, /policy_acknowledgements_policy_version_employee_unique ON policy_acknowledgements \(policy_id, policy_version, employee_id\)/);
  assert.match(initialize, /async function ensureColumn/);
  assert.match(initialize, /PRAGMA table_info\(\$\{table\}\)/);
  assert.match(initialize, /ALTER TABLE \$\{table\} ADD COLUMN \$\{column\} \$\{definition\}/);
  assert.match(initialize, /\["rewards", "inventory_version", "INTEGER NOT NULL DEFAULT 0"\]/);
  assert.match(initialize, /\["point_ledger", "policy_id", "TEXT REFERENCES organization_policies\(id\) ON DELETE SET NULL"\]/);
  assert.match(initialize, /CREATE INDEX IF NOT EXISTS point_ledger_policy_idx ON point_ledger \(policy_id, policy_version\)/);
  assert.equal(packagedPolicyMigration, policyMigration);

  // The seeded work-rules template covers all eight mandatory subject areas,
  // while the UI gives HR a matching pre-publication checklist.
  const workRulesSeed = data.match(/id: "policy-work-rules-v1"[\s\S]*?(?=\n  \{\n    id: "policy-points-rewards-v1")/)?.[0] ?? "";
  assert.ok(workRulesSeed, "expected the seeded work-rules policy");
  for (const heading of [
    "วันทำงาน เวลาทำงานปกติ และเวลาพัก",
    "วันหยุดและหลักเกณฑ์การหยุด",
    "การทำงานล่วงเวลาและการทำงานในวันหยุด",
    "วันและสถานที่จ่ายค่าจ้าง",
    "วันลาและหลักเกณฑ์การลา",
    "วินัยและโทษทางวินัย",
    "การร้องทุกข์และอุทธรณ์",
    "การเลิกจ้างและค่าชดเชย",
  ]) assert.match(workRulesSeed, new RegExp(heading));

  const checklistBlock = page.match(/const complianceChecklistItems = \[[\s\S]*?\n\] as const;/)?.[0] ?? "";
  assert.ok(checklistBlock, "expected the eight-topic compliance checklist");
  for (const title of [
    "เวลาทำงานและเวลาพัก",
    "วันหยุด",
    "การทำงานล่วงเวลา (OT)",
    "ค่าจ้างและรอบจ่าย",
    "วันลา",
    "วินัยและการสอบข้อเท็จจริง",
    "ช่องทางร้องทุกข์",
    "การสิ้นสุดการจ้าง",
  ]) assert.ok(checklistBlock.includes(title), `expected checklist topic: ${title}`);
  assert.equal((checklistBlock.match(/\{ id: /g) ?? []).length, 8, "the publish checklist must contain exactly eight required topics");

  // The product labels this as a reviewable template, not legal certification,
  // and never treats points as wages or a replacement for due process.
  assert.match(data, /เอกสารนี้เป็นแม่แบบสำหรับระบบทดลอง HR ต้องตรวจแก้ให้ตรงสภาพการจ้างและให้ที่ปรึกษากฎหมายทบทวนก่อนประกาศใช้จริง/);
  assert.match(data, /ไม่ใช่ค่าจ้าง/);
  assert.match(data, /ไม่แทนกระบวนการวินัย/);
  assert.match(data, /ไม่ใช้ลดค่าจ้างหรือสิทธิตามกฎหมาย/);
  assert.match(pageAsset, /แม่แบบตรวจข้อบังคับการทำงาน 8 หัวข้อ/);
  assert.match(pageAsset, /ยืนยันว่าส่งให้ HR หรือที่ปรึกษากฎหมายทบทวนแล้ว/);
  assert.match(pageAsset, /ระบบช่วยตรวจความครบถ้วนเท่านั้น ไม่ได้รับรองความถูกต้องทางกฎหมาย/);
  assert.match(pageAsset, /ไม่ใช่การสละสิทธิ์หรือยอมรับทุกข้อความ/);

  // Admins draft and publish; employees receive only applicable, effective
  // published versions and can see only their own acknowledgement receipt.
  assert.match(dashboardRoute, /function isPolicyEffective/);
  assert.match(dashboardRoute, /function policyAppliesToEmployee/);
  assert.match(dashboardRoute, /currentUser\.role === "admin" \|\| \(isPolicyEffective\(policy, policyDay\) && policyAppliesToEmployee\(policy, signedInEmployee, signedInEmployeeProfile\)\)/);
  assert.match(dashboardRoute, /if \(currentUser\.role !== "admin"\) return Boolean\(currentUser\.employeeId\) && acknowledgement\.employeeId === currentUser\.employeeId/);
  assert.match(dashboardRoute, /const visiblePolicyAcknowledgements = currentUser\.role === "admin"[\s\S]*?: visiblePolicyAcknowledgementRows\.map\(publicPolicyAcknowledgement\)/);
  assert.match(dashboardRoute, /canManagePolicies: currentUser\.role === "admin"/);
  assert.match(dashboardRoute, /canAcknowledgePolicies: Boolean\(currentUser\.employeeId\) && !employeePreview/);
  const adminOnlyActionBlock = dashboardRoute.match(/const adminOnlyActions = new Set\(\[[^\]]+\]\)/)?.[0] ?? "";
  assert.match(adminOnlyActionBlock, /"saveOrganizationPolicy"/);
  assert.match(adminOnlyActionBlock, /"publishOrganizationPolicy"/);
  assert.match(adminOnlyActionBlock, /"updateRewardRedemption"/);
  assert.match(dashboardRoute, /employeePortalActions = new Set\(\["markNotificationsRead", "saveWorkItem", "redeemReward", "acknowledgeOrganizationPolicy", "signContract"\]\)/);
  assert.match(page, /panel\.id !== "adjust" \|\| permissions\.canReviewWork/);
  assert.match(page, /isAdmin \? <form className="organization-policy-editor"/);
  assert.match(page, /พนักงานจะเห็นเฉพาะฉบับที่ประกาศแล้ว/);

  // Published rows are immutable; edits create the next version. Acknowledging
  // is self-only, version-specific, content-bound, and idempotent.
  assert.match(dashboardRoute, /const createsNewVersion = !sourcePolicy \|\| sourcePolicy\.status === "published"/);
  assert.match(dashboardRoute, /if \(draft\.status !== "draft"\)/);
  assert.match(dashboardRoute, /requestedCategory !== sourcePolicy\.category/);
  assert.match(dashboardRoute, /requestedCode !== sourcePolicy\.code/);
  assert.match(dashboardRoute, /category === "points_rewards" \? true : payload\.acknowledgementRequired/);
  assert.match(dashboardRoute, /draft\.category === "points_rewards" && !draft\.acknowledgementRequired/);
  assert.match(page, /const savedPolicy = await persistOrganizationPolicyDraft\(\)/);
  assert.match(page, /policyId: savedPolicy\.id/);
  assert.match(dashboardRoute, /type PolicyHashInput = Pick<OrganizationPolicyRow, "code" \| "title" \| "summary" \| "content" \| "category" \| "version" \| "effectiveDate" \| "scopeType" \| "scopeValues" \| "acknowledgementRequired" \| "acknowledgementDueDays" \| "rules">/);
  assert.match(dashboardRoute, /function stableJsonValue\(value: unknown\)/);
  assert.match(dashboardRoute, /async function policyIntegrityHash\(policy: PolicyHashInput\)/);
  const policyHashBlock = dashboardRoute.match(/async function policyIntegrityHash\(policy: PolicyHashInput\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  for (const canonicalField of ["code", "title", "summary", "content", "category", "version", "effectiveDate", "scopeType", "scopeValues", "acknowledgementRequired", "acknowledgementDueDays", "rules"]) {
    assert.match(policyHashBlock, new RegExp(`\\b${canonicalField}:`), `canonical policy hash must bind ${canonicalField}`);
  }
  assert.doesNotMatch(policyHashBlock, /effectiveTo:/, "closing an older policy version must not invalidate its acknowledgement hash");
  assert.match(dashboardRoute, /const hash = await policyIntegrityHash\(draft\)/);
  assert.match(dashboardRoute, /const currentPolicyHash = await policyIntegrityHash\(policy\)/);
  assert.match(dashboardRoute, /policy\.contentHash !== currentPolicyHash/);
  assert.match(dashboardRoute, /eq\(policyAcknowledgements\.policyVersion, policy\.version\)/);
  assert.match(dashboardRoute, /policyVersion: policy\.version/);
  assert.match(dashboardRoute, /contentHash: currentPolicyHash/);
  const publicAcknowledgementBlock = dashboardRoute.match(/function publicPolicyAcknowledgement\([\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(publicAcknowledgementBlock, /const \{ id, policyId, employeeId, policyVersion, contentHash, acknowledgedAt \} = acknowledgement/);
  assert.match(publicAcknowledgementBlock, /return \{ id, policyId, employeeId, policyVersion, contentHash, acknowledgedAt \}/);
  assert.doesNotMatch(publicAcknowledgementBlock, /acknowledgedEmail|authenticatedUserId|acknowledgementText|acknowledgedName|userAccountId/);
  assert.match(dashboardRoute, /if \(existingAcknowledgement\) return Response\.json\(\{ policyAcknowledgement: currentUser\.role === "admin" \? existingAcknowledgement : publicPolicyAcknowledgement\(existingAcknowledgement\) \}\)/);
  assert.match(dashboardRoute, /db\.insert\(policyAcknowledgements\)\.values\(policyAcknowledgement\)\.onConflictDoNothing\(\)/);
  assert.match(dashboardRoute, /policyAcknowledgement: currentUser\.role === "admin" \? acknowledgementResponse : publicPolicyAcknowledgement\(acknowledgementResponse\)/);
  assert.match(page, /guardEmployeePreviewMutation\("ยืนยันรับทราบกฎองค์กร"\)/);
  assert.match(page, /disabled=\{isSaving \|\| isEmployeePreview\}/);

  // The UI consumes the effective policy returned by the server instead of
  // rendering a second, hard-coded point economy.
  assert.match(page, /useState<PointPolicyRules>\(defaultPointPolicyRules\)/);
  assert.match(page, /pointPolicyRules\?: PointPolicyRules/);
  assert.match(page, /setActivePointPolicyRules\(body\.pointPolicyRules \?\? defaultPointPolicyRules\)/);
  assert.match(page, /const pointEconomyPolicy = activePointPolicyRules\.economy/);
  assert.match(page, /const pointEventRules = activePointPolicyRules\.events/);
  assert.match(page, /const workPointAwards = activePointPolicyRules\.workAwards/);
  assert.match(page, /pointEventRules\[eventType\]\.entryMode === "manual"/);
  assert.match(page, /pointEventRules\[eventType\]\.authorizedRoles\.includes\(pointOperatorRole\)/);
  assert.match(page, /required=\{selectedPointEventRule\.requiresEvidence\}/);
  assert.match(page, /monthlyEvaluationPoints\(monthlyPointExampleScore, activePointPolicyRules\)/);
  assert.match(page, /workPointValue\("mission", "high", activePointPolicyRules\)/);
  assert.match(page, /setActivePointPolicyRules\(resolvePointPolicyRules\(body\.organizationPolicy\.rules\)\)/);
  assert.match(page, /const monthlyPointFormulaLabel = `ต้องผ่าน \$\{pointEconomyPolicy\.monthlyEvaluationMinimumScore\}/);
  assert.match(page, /const rewardPreflightChecks = rewardToRedeem \? \[/);
  for (const preflightId of ["policy", "acknowledgement", "balance", "monthly-limit", "cooldown", "stock"]) {
    assert.match(page, new RegExp(`id: "${preflightId}"`));
  }
  assert.match(page, /disabled=\{isSaving \|\| !canSubmitRewardRedemption\}/);

  // The active published point policy is the source of truth for caps,
  // evidence, authorized actors, redemption cadence and anti-self-dealing.
  assert.match(data, /export const defaultPointPolicyRules/);
  assert.match(data, /negativePointsPerMonthCap: 200/);
  assert.match(data, /deadlineBonusMonthlyCap: 80/);
  assert.match(data, /workAwardsMonthlyCap: 420/);
  assert.match(data, /standardEarnMonthlyCap: 900/);
  assert.match(data, /maxRedemptionsPerMonth: 2/);
  assert.match(data, /cooldownDays: 7/);
  assert.match(data, /warning: \{[\s\S]*?entryMode: "manual"[\s\S]*?requiresEvidence: true[\s\S]*?authorizedRoles: \["admin"\]/);
  assert.match(dashboardRoute, /const \{ policy: activePointPolicy, rules: activePointRules \} = pointPolicyFromRows/);
  assert.match(dashboardRoute, /ผู้ใช้ไม่สามารถให้หรือหักแต้มของตนเองได้/);
  assert.match(dashboardRoute, /rule\.entryMode !== "manual"/);
  assert.match(dashboardRoute, /!rule\.authorizedRoles\.includes\(currentUser\.role\)/);
  assert.match(dashboardRoute, /rule\.requiresEvidence && !evidenceUrl/);
  assert.match(dashboardRoute, /negativePointsThisMonth \+ Math\.abs\(rule\.points\) > eventPointEconomyPolicy\.negativePointsPerMonthCap/);
  assert.match(dashboardRoute, /positiveEventsThisMonth \+ workAwardsThisMonth \+ rule\.points > eventPointEconomyPolicy\.standardEarnMonthlyCap/);
  assert.match(dashboardRoute, /activePointRules\.redemption\.acknowledgementRequired/);
  assert.match(dashboardRoute, /monthlyRedemptions\.length >= activePointRules\.redemption\.maxRedemptionsPerMonth/);
  assert.match(dashboardRoute, /activePointRules\.redemption\.cooldownDays/);
  assert.match(dashboardRoute, /ผู้ใช้ไม่สามารถประเมินตนเองหรือให้แต้มจากผลประเมินตนเองได้/);
  assert.match(dashboardRoute, /แต้มจะถูกคำนวณแบบครั้งเดียวเมื่อ HR ประมวลผลรอบแต้มรายเดือน/);
  assert.ok((dashboardRoute.match(/\.\.\.policyMetadata/g) ?? []).length >= 4, "governed point events and ledger rows must carry policy provenance");

  // Migration 0011 and the schema preserve the exact policy used for every
  // point mutation and serialize competing publish, point and reward writes.
  assert.equal(packagedGovernanceMigration, governanceMigration);
  assert.match(schema, /export const organizationPolicyPublishClaims = sqliteTable\("organization_policy_publish_claims"/);
  assert.match(schema, /export const pointMutationClaims = sqliteTable\("point_mutation_claims"/);
  assert.match(schema, /export const rewardRedemptionClaims = sqliteTable\("reward_redemption_claims"/);
  assert.match(schema, /inventoryVersion: integer\("inventory_version"\)\.notNull\(\)\.default\(0\)/);
  assert.equal((schema.match(/policyId: text\("policy_id"\)\.references\(\(\) => organizationPolicies\.id/g) ?? []).length, 2, "both point tables must retain policy provenance");
  assert.equal((schema.match(/policyVersion: integer\("policy_version"\)/g) ?? []).length, 3, "acknowledgements and both point tables must retain policy versions");
  assert.equal((schema.match(/policyContentHash: text\("policy_content_hash"\)/g) ?? []).length, 2, "both point tables must retain policy hashes");
  assert.match(governanceMigration, /CREATE TABLE `organization_policy_publish_claims`/);
  assert.match(governanceMigration, /CREATE UNIQUE INDEX `organization_policy_publish_claim_head_unique`/);
  assert.match(governanceMigration, /CREATE TABLE `point_mutation_claims`/);
  assert.match(governanceMigration, /CREATE UNIQUE INDEX `point_mutation_claim_employee_sequence_unique`/);
  assert.match(governanceMigration, /CREATE TABLE `reward_redemption_claims`/);
  assert.match(governanceMigration, /CREATE UNIQUE INDEX `reward_redemption_claim_inventory_unique`/);
  assert.match(governanceMigration, /ALTER TABLE `point_events` ADD `policy_content_hash` text/);
  assert.match(governanceMigration, /ALTER TABLE `point_ledger` ADD `policy_content_hash` text/);
  assert.match(governanceMigration, /ALTER TABLE `rewards` ADD `inventory_version` integer DEFAULT 0 NOT NULL/);
  assert.match(dashboardRoute, /function pointPolicyMetadata\(policy: OrganizationPolicyRow \| null\)/);
  assert.match(dashboardRoute, /policyId: policy\?\.id \?\? null/);
  assert.match(dashboardRoute, /policyVersion: policy\?\.version \?\? null/);
  assert.match(dashboardRoute, /policyContentHash: policy\?\.contentHash \|\| null/);
  assert.match(dashboardRoute, /db\.insert\(organizationPolicyPublishClaims\)\.values\(publishClaim\)/);
  assert.match(dashboardRoute, /db\.insert\(pointMutationClaims\)\.values\(mutationClaim\)/);
  assert.match(dashboardRoute, /db\.insert\(rewardRedemptionClaims\)\.values\(redemptionClaim\)/);
  assert.ok((dashboardRoute.match(/await db\.batch\(\[/g) ?? []).length >= 5, "governed multi-row mutations must use D1 batches");

  // Manual point events use the historical policy, bounded backdating and
  // verified attendance records rather than trusting a free-form request.
  assert.match(dashboardRoute, /if \(eventDate > today\) return Response\.json\(\{ error: "ไม่สามารถบันทึกเหตุการณ์แต้มล่วงหน้าได้"/);
  assert.match(dashboardRoute, /const maximumBackdateDays = currentUser\.role === "admin" \? 90 : 7/);
  assert.match(dashboardRoute, /pointPolicyFromRows\(pointPolicyRows, eventDate\)/);
  assert.match(dashboardRoute, /if \(!eventPointPolicy\) return Response\.json\(\{ error: "ไม่มีกติกาแต้มที่ประกาศใช้สำหรับวันที่เกิดเหตุการณ์/);
  assert.match(dashboardRoute, /const attendanceTypes: PointEventType\[\] = \["attendance_on_time", "attendance_late", "absence", "approved_leave"\]/);
  assert.match(dashboardRoute, /eq\(attendanceRecords\.employeeId, employeeId\), eq\(attendanceRecords\.workDate, eventDate\)/);
  assert.match(dashboardRoute, /attendanceRecord\.status !== expectedAttendanceStatus \|\| !approvalMatches/);
  assert.match(dashboardRoute, /eventType === "approved_leave" \? attendanceRecord\?\.approvalStatus === "approved"/);

  // Sites applies migrations with a statement splitter, so compound trigger
  // bodies stay out of migration files and are installed atomically at runtime.
  assert.doesNotMatch(governanceMigration, /CREATE\s+TRIGGER/i);
  assert.doesNotMatch(governanceMigration, /\bBEGIN\b/i);
  assert.match(initialize, /CREATE TRIGGER reward_redemption_claim_guard/);
  assert.match(initialize, /REDEMPTION_STALE_INVENTORY/);
  assert.match(initialize, /REDEMPTION_INSUFFICIENT_BALANCE/);
  assert.match(initialize, /REDEMPTION_MONTHLY_LIMIT/);
  assert.match(initialize, /REDEMPTION_COOLDOWN/);
  assert.match(dashboardRoute, /rewardInventoryKey: `\$\{rewardId\}:inventory:\$\{reward\.inventoryVersion\}`/);
  assert.match(dashboardRoute, /eq\(rewards\.inventoryVersion, reward\.inventoryVersion\)/);
  assert.match(dashboardRoute, /isRedemptionConflictError\(error\)/);

  // Work evidence and reward requests have one-way, idempotent workflows.
  assert.match(dashboardRoute, /const submissionDate = bangkokIsoDayFromTimestamp\(submission\.submittedAt\) \?\? bangkokIsoDay\(\)/);
  assert.match(dashboardRoute, /eq\(workSubmissions\.status, "submitted"\)/);
  assert.match(dashboardRoute, /eq\(workItems\.status, "review"\)/);
  assert.match(dashboardRoute, /if \(payload\.action === "updateRewardRedemption"\)/);
  assert.match(dashboardRoute, /redemption\.status === "requested" && \(targetStatus === "approved" \|\| targetStatus === "cancelled"\)/);
  assert.match(dashboardRoute, /redemption\.status === "approved" && \(targetStatus === "fulfilled" \|\| targetStatus === "cancelled"\)/);
  assert.match(dashboardRoute, /const reversalId = `points-redemption-reversal-\$\{redemption\.id\}`/);
  assert.match(dashboardRoute, /stock: sql`\$\{rewards\.stock\} \+ 1`/);
  assert.match(page, /updateRewardRedemption\(redemption, "approved"\)/);
  assert.match(page, /updateRewardRedemption\(redemption, "fulfilled"\)/);
  assert.match(page, /updateRewardRedemption\(redemption, "cancelled"\)/);
  assert.match(page, /\.filter\(\(entry\) => entry\.points !== 0\)/);
  assert.match(styles, /\.work-point-table-scroll \{[^}]*overflow-x: auto/);

  assert.match(pageAsset, /กฎองค์กรและการรับทราบ/);
  assert.match(pageAsset, /ยืนยันว่าได้อ่านและรับทราบ/);
  assert.match(styles, /Points hub and organization policy workspace/);
  assert.match(styles, /\.organization-policy-center/);
  assert.match(styles, /\.policy-acknowledgement-card/);
});

test("hardens policy publishing, point caps and work evidence against concurrent writes", async () => {
  const [schema, initialize, dashboardRoute, workSubmissionRoute, hardeningMigration, packagedHardeningMigration] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/initialize.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/dashboard/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/work-submissions/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0012_common_christian_walker.sql", import.meta.url), "utf8"),
    readFile(new URL("../dist/.openai/drizzle/0012_common_christian_walker.sql", import.meta.url), "utf8"),
  ]);

  assert.equal(packagedHardeningMigration, hardeningMigration, "the deployed bundle must include migration 0012 verbatim");
  assert.doesNotMatch(hardeningMigration, /CREATE\s+TRIGGER/i, "Sites migrations must not contain compound trigger statements");
  assert.doesNotMatch(hardeningMigration, /\bBEGIN\b/i, "Sites migrations must not contain trigger bodies");

  // Saving and publishing a policy are compare-and-swap operations bound to
  // the canonical content visible to HR, including a database-level guard.
  assert.match(schema, /expectedContentHash: text\("expected_content_hash"\)\.notNull/);
  assert.match(hardeningMigration, /ALTER TABLE `organization_policy_publish_claims` ADD `expected_content_hash`/);
  assert.match(initialize, /CREATE TRIGGER IF NOT EXISTS organization_policy_publish_claim_guard/);
  assert.match(initialize, /status = 'draft'/);
  assert.match(initialize, /content_hash = NEW\.expected_content_hash/);
  assert.match(initialize, /POLICY_PUBLISH_STALE_DRAFT/);
  const savePolicyBlock = dashboardRoute.match(/if \(payload\.action === "saveOrganizationPolicy"\) \{[\s\S]*?(?=\n    if \(payload\.action === "publishOrganizationPolicy"\))/)?.[0] ?? "";
  const publishPolicyBlock = dashboardRoute.match(/if \(payload\.action === "publishOrganizationPolicy"\) \{[\s\S]*?(?=\n    if \(payload\.action === "acknowledgeOrganizationPolicy"\))/)?.[0] ?? "";
  assert.ok(savePolicyBlock && publishPolicyBlock, "expected isolated policy save and publish actions");
  assert.match(savePolicyBlock, /contentHash: await policyIntegrityHash\(draftPolicy\)/);
  assert.match(savePolicyBlock, /eq\(organizationPolicies\.status, "draft"\)/);
  assert.match(savePolicyBlock, /eq\(organizationPolicies\.contentHash, sourcePolicy\.contentHash\)/);
  assert.match(savePolicyBlock, /eq\(organizationPolicies\.updatedAt, sourcePolicy\.updatedAt\)/);
  assert.match(publishPolicyBlock, /expectedContentHash: draft\.contentHash/);
  assert.match(publishPolicyBlock, /message\.includes\("POLICY_PUBLISH_"\)/);
  assert.match(publishPolicyBlock, /status: 409/);

  // Every standard capped award path shares one employee/month sequence lock,
  // so a work approval and manual bonus cannot both spend the same allowance.
  assert.match(schema, /export const pointCapClaims = sqliteTable\("point_cap_claims"/);
  for (const field of ["claimMonth", "sourceType", "sourceId", "employeeMonthSequenceKey"]) assert.match(schema, new RegExp(`${field}:`));
  for (const indexName of [
    "point_cap_claim_employee_month_sequence_unique",
    "point_cap_claim_source_unique",
    "point_cap_claim_employee_month_idx",
  ]) {
    assert.match(schema, new RegExp(indexName));
    assert.match(hardeningMigration, new RegExp(indexName));
    assert.match(initialize, new RegExp(indexName));
  }
  const reviewBlock = dashboardRoute.match(/if \(payload\.action === "reviewWorkSubmission"\) \{[\s\S]*?(?=\n    if \(payload\.action === "recordPointEvent"\))/)?.[0] ?? "";
  const manualPointBlock = dashboardRoute.match(/if \(payload\.action === "recordPointEvent"\) \{[\s\S]*?(?=\n    if \(payload\.action === "runMonthlyPointCycle"\))/)?.[0] ?? "";
  assert.ok(reviewBlock && manualPointBlock, "expected isolated review and manual-point actions");
  assert.match(reviewBlock, /sourceType: status === "approved" \? "work_approval" : "work_revision"/);
  assert.match(reviewBlock, /sourceId: status === "approved" \? workItem\.id : submission\.id/);
  assert.match(reviewBlock, /employeeMonthSequenceKey: `\$\{workItem\.assigneeEmployeeId\}:\$\{completionMonth\}:\$\{employeeCapClaimRows\.length\}`/);
  assert.match(reviewBlock, /db\.insert\(pointCapClaims\)\.values\(pointCapClaim\)/);
  assert.doesNotMatch(reviewBlock, /reviewClaimPrefix|points-work-review-claim|points:\s*0/);
  assert.match(manualPointBlock, /sourceType: "manual_point_event"/);
  assert.match(manualPointBlock, /sourceId: eventId/);
  assert.match(manualPointBlock, /employeeMonthSequenceKey: `\$\{employeeId\}:\$\{eventMonth\}:\$\{employeeCapClaimRows\.length\}`/);
  assert.match(manualPointBlock, /await db\.batch\(\[[\s\S]*?db\.insert\(pointEvents\)[\s\S]*?db\.insert\(pointMutationClaims\)[\s\S]*?db\.insert\(pointCapClaims\)[\s\S]*?db\.insert\(pointLedger\)/);

  // Evaluations become immutable inputs to the explicit monthly point run;
  // saving an evaluation never rewrites a ledger award already spent.
  const saveEvaluationBlock = dashboardRoute.match(/if \(payload\.action === "saveEvaluation"\) \{[\s\S]*?(?=\n    if \(payload\.action === "saveHrPlan"\))/)?.[0] ?? "";
  const monthlyCycleBlock = dashboardRoute.match(/if \(payload\.action === "runMonthlyPointCycle"\) \{[\s\S]*?(?=\n    if \(payload\.action === "updateRewardRedemption"\))/)?.[0] ?? "";
  assert.ok(saveEvaluationBlock && monthlyCycleBlock, "expected isolated evaluation and monthly-cycle actions");
  assert.match(saveEvaluationBlock, /eq\(employees\.status, "active"\)/);
  assert.match(saveEvaluationBlock, /await db\.batch\(\[/);
  assert.doesNotMatch(saveEvaluationBlock, /monthlyEvaluationPoints|db\.insert\(pointEvents\)|db\.insert\(pointLedger\)/);
  assert.match(saveEvaluationBlock, /\{ evaluation, pointEntry: null, pointEvent: null, pointWarning: "บันทึกผลประเมินแล้ว แต้มจะถูกคำนวณแบบครั้งเดียวเมื่อ HR ประมวลผลรอบแต้มรายเดือน" \}/);
  assert.match(monthlyCycleBlock, /monthlyPointPolicy\.contentHash !== await policyIntegrityHash\(monthlyPointPolicy\)/);
  assert.match(monthlyCycleBlock, /const monthlySourceId = `monthly-evaluation-\$\{month\}:\$\{evaluation\.employeeId\}`/);
  assert.match(monthlyCycleBlock, /db\.insert\(pointEvents\)\.values\(event\)\.onConflictDoNothing\(\)/);
  assert.match(monthlyCycleBlock, /db\.insert\(pointLedger\)\.values\(entry\)\.onConflictDoNothing\(\)/);

  // Evidence submission is one atomic state transition. Database constraints
  // reject duplicate pending evidence or changed work terms, and an uploaded R2
  // object is removed if the transaction fails before it is committed.
  assert.match(schema, /work_submissions_one_submitted_per_work_unique/);
  assert.match(hardeningMigration, /CREATE UNIQUE INDEX `work_submissions_one_submitted_per_work_unique`/);
  for (const [trigger, code] of [
    ["work_submission_insert_guard", "WORK_SUBMISSION_INVALID_STATE"],
    ["work_item_submission_terms_lock", "WORK_ITEM_TERMS_LOCKED"],
  ]) {
    assert.match(initialize, new RegExp(trigger));
    assert.match(initialize, new RegExp(code));
  }
  assert.match(initialize, /assignee_employee_id = NEW\.employee_id/);
  assert.match(initialize, /status IN \('todo', 'in_progress'\)/);
  assert.match(initialize, /NEW\.project_id IS NOT OLD\.project_id/);
  assert.match(initialize, /NEW\.due_date IS NOT OLD\.due_date/);
  assert.equal((workSubmissionRoute.match(/await db\.batch\(\[/g) ?? []).length, 1, "submission insert and work transition must use one D1 batch");
  assert.match(workSubmissionRoute, /db\.insert\(workSubmissions\)\.values\(submission\)[\s\S]*?db\.update\(workItems\)/);
  assert.match(workSubmissionRoute, /WORK_SUBMISSION_INVALID_STATE[\s\S]*?status: 409/);
  assert.match(workSubmissionRoute, /UNIQUE constraint failed[\s\S]*?status: 409/);
  assert.match(workSubmissionRoute, /uploadedStorageKey && !submissionCommitted/);
  assert.match(workSubmissionRoute, /getFilesBucket\(\)\.delete\(uploadedStorageKey\)/);
  assert.match(reviewBlock, /await db\.batch\(\[[\s\S]*?db\.insert\(pointCapClaims\)[\s\S]*?db\.update\(workSubmissions\)[\s\S]*?db\.update\(workItems\)/);
});

test("locks employee evidence and signatures to their owner and applies Bangkok business months", async () => {
  const [page, dashboardRoute, workSubmissionRoute, initialize, bangkokMigration, packagedBangkokMigration] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/dashboard/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/work-submissions/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/initialize.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0013_bangkok_reward_month.sql", import.meta.url), "utf8"),
    readFile(new URL("../dist/.openai/drizzle/0013_bangkok_reward_month.sql", import.meta.url), "utf8"),
  ]);

  // Employees may sign only their own contract. Managers and admins are not
  // allowed to sign on behalf of another person even if they can view them.
  assert.match(dashboardRoute, /employeePortalActions = new Set\(\[[^\]]*"signContract"[^\]]*\]\)/);
  const signContractBlock = dashboardRoute.match(/if \(payload\.action === "signContract"\) \{[\s\S]*?(?=\n    if \(payload\.action === "sendContract"\))/)?.[0] ?? "";
  assert.ok(signContractBlock, "expected an isolated contract-signing action");
  assert.match(signContractBlock, /currentUser\.role !== "employee" \|\| !currentUser\.employeeId \|\| currentUser\.employeeId !== contract\.employeeId/);
  assert.match(signContractBlock, /เฉพาะพนักงานเจ้าของสัญญาเท่านั้นที่ลงนามได้ HR และหัวหน้าทีมไม่สามารถลงนามแทน/);
  assert.doesNotMatch(signContractBlock, /canAccessEmployee\(/, "view access must never authorize a signature");

  // Evidence POSTs are owner-only and require an active employee record. HR
  // and managers retain read/review access, but cannot manufacture evidence.
  const submissionPostBlock = workSubmissionRoute.match(/export async function POST\(request: Request\) \{[\s\S]*?(?=\nexport async function GET\()/)?.[0] ?? "";
  assert.ok(submissionPostBlock, "expected an isolated evidence POST handler");
  assert.match(submissionPostBlock, /currentUser\.role !== "employee" \|\| !currentUser\.employeeId \|\| currentUser\.employeeId !== workItem\.assigneeEmployeeId/);
  assert.match(submissionPostBlock, /เฉพาะพนักงานผู้รับผิดชอบงานเท่านั้นที่ส่งหลักฐานได้ HR และหัวหน้าทีมไม่สามารถส่งแทน/);
  assert.match(submissionPostBlock, /eq\(employees\.id, workItem\.assigneeEmployeeId\), eq\(employees\.status, "active"\)/);
  assert.match(submissionPostBlock, /employeeId: workItem\.assigneeEmployeeId/);
  assert.doesNotMatch(submissionPostBlock, /canAccessEmployee\(currentUser/, "team visibility must not grant evidence submission rights");

  // Saving work uses compare-and-swap for both employee progress and manager
  // edits, and refuses to overwrite a concurrent transition to review.
  const saveWorkItemBlock = dashboardRoute.match(/if \(payload\.action === "saveWorkItem"\) \{[\s\S]*?(?=\n    if \(payload\.action === "reviewWorkSubmission"\))/)?.[0] ?? "";
  assert.ok(saveWorkItemBlock, "expected an isolated save-work action");
  assert.match(saveWorkItemBlock, /eq\(workItems\.status, assignedWorkItem\.status\)/);
  assert.match(saveWorkItemBlock, /eq\(workItems\.updatedAt, assignedWorkItem\.updatedAt\)/);
  assert.match(saveWorkItemBlock, /eq\(workItems\.status, existingWorkItem\.status\)/);
  assert.match(saveWorkItemBlock, /eq\(workItems\.updatedAt, existingWorkItem\.updatedAt\)/);
  assert.equal((saveWorkItemBlock.match(/notExists\(submittedEvidence\)/g) ?? []).length, 2, "both work update paths must reject submitted evidence");
  assert.ok((saveWorkItemBlock.match(/\)\.returning\(\)/g) ?? []).length >= 2, "both work update paths must inspect their CAS result");
  assert.equal((saveWorkItemBlock.match(/if \(!savedWorkItem\) return Response\.json\([\s\S]*?\{ status: 409 \}\)/g) ?? []).length, 2, "both stale work updates must return conflict");
  assert.match(saveWorkItemBlock, /await db\.insert\(workItems\)\.values\(workItem\)/);
  assert.doesNotMatch(saveWorkItemBlock, /insert\(workItems\)[\s\S]*?onConflictDoUpdate/, "new work must not upsert over a concurrent row");

  // Anti-self-dealing applies to every account linked to the target employee,
  // regardless of whether the linked account is employee, manager or admin.
  const evaluationBlock = dashboardRoute.match(/if \(payload\.action === "saveEvaluation"\) \{[\s\S]*?(?=\n    if \(payload\.action === "saveHrPlan"\))/)?.[0] ?? "";
  const reviewBlock = dashboardRoute.match(/if \(payload\.action === "reviewWorkSubmission"\) \{[\s\S]*?(?=\n    if \(payload\.action === "recordPointEvent"\))/)?.[0] ?? "";
  const manualPointBlock = dashboardRoute.match(/if \(payload\.action === "recordPointEvent"\) \{[\s\S]*?(?=\n    if \(payload\.action === "runMonthlyPointCycle"\))/)?.[0] ?? "";
  assert.ok(evaluationBlock && reviewBlock && manualPointBlock, "expected isolated evaluation, review and point actions");
  assert.match(evaluationBlock, /if \(currentUser\.employeeId === employeeId\) return Response\.json\([\s\S]*?\{ status: 403 \}\)/);
  assert.match(reviewBlock, /if \(currentUser\.employeeId === workItem\.assigneeEmployeeId\) return Response\.json\([\s\S]*?\{ status: 403 \}\)/);
  assert.match(manualPointBlock, /if \(currentUser\.employeeId === employeeId\) return Response\.json\([\s\S]*?\{ status: 403 \}\)/);

  // The proof composer is rendered only for the signed-in employee who owns
  // the work item. HR and managers receive a read/review-only explanation.
  assert.match(page, /const canSubmitActiveWorkProof = Boolean\(!isEmployeePreview && currentUser\?\.role === "employee" && currentUser\.employeeId && currentUser\.employeeId === submissionWorkItem\?\.assigneeEmployeeId\)/);
  assert.match(page, /isEmployeePreview \|\| !canSubmitActiveWorkProof \|\| submissionWorkItem\.status === "review" \|\| submissionWorkItem\.status === "done" \? <div[\s\S]*?: <form className="submission-form" onSubmit=\{submitWorkProof\}>/);
  assert.match(page, /HR และหัวหน้าเปิดดูหลักฐานและตรวจผลงานได้ แต่ส่งแทนพนักงานไม่ได้/);

  // Every user-facing and server-side business day/month calculation uses the
  // Asia/Bangkok boundary, including work caps and reward preflight checks.
  assert.match(dashboardRoute, /const BANGKOK_OFFSET_MS = 7 \* 60 \* 60 \* 1000/);
  assert.match(dashboardRoute, /function bangkokIsoDayFromTimestamp\(value: string\)/);
  assert.match(dashboardRoute, /new Date\(timestamp \+ BANGKOK_OFFSET_MS\)\.toISOString\(\)\.slice\(0, 10\)/);
  assert.match(dashboardRoute, /function bangkokMonthFromTimestamp\(value: string\)/);
  assert.match(dashboardRoute, /const submissionDate = bangkokIsoDayFromTimestamp\(submission\.submittedAt\) \?\? bangkokIsoDay\(\)/);
  assert.equal((dashboardRoute.match(/bangkokMonthFromTimestamp\(entry\.createdAt\)/g) ?? []).length, 2, "work and manual awards must share Bangkok month caps");
  assert.match(dashboardRoute, /const month = bangkokMonthFromTimestamp\(now\) \?\? bangkokIsoDay\(\)\.slice\(0, 7\)/);
  assert.match(dashboardRoute, /activeRedemptions\.filter\(\(redemption\) => bangkokMonthFromTimestamp\(redemption\.createdAt\) === month\)/);
  assert.match(page, /new Intl\.DateTimeFormat\("en-CA", \{ timeZone: "Asia\/Bangkok"/);
  assert.match(page, /const \[monthlyPointMonth, setMonthlyPointMonth\] = useState\(bangkokIsoMonth\(\)\)/);
  assert.match(page, /eventDate: bangkokIsoDate\(\)/);
  assert.match(page, /activeRewardRedemptions\.filter\(\(redemption\) => bangkokIsoMonth\(redemption\.createdAt\) === rewardCurrentMonth\)/);
  assert.match(page, /people-pulse-work-portfolio-\$\{bangkokIsoDate\(\)\}\.csv/);

  // Migration 0013 is an intentionally simple marker. Compound trigger SQL is
  // installed by runtime initialization so the Sites statement splitter never
  // receives a semicolon-delimited BEGIN/END body.
  assert.equal(packagedBangkokMigration, bangkokMigration, "the deployed bundle must include migration 0013 verbatim");
  assert.equal(bangkokMigration.trim(), "SELECT 1;");
  assert.doesNotMatch(bangkokMigration, /CREATE\s+TRIGGER/i);
  assert.doesNotMatch(bangkokMigration, /\bBEGIN\b/i);
  const initializeDrop = initialize.indexOf('d1.prepare("DROP TRIGGER IF EXISTS reward_redemption_claim_guard")');
  const initializeCreate = initialize.indexOf("d1.prepare(`CREATE TRIGGER reward_redemption_claim_guard");
  assert.ok(initializeDrop >= 0 && initializeCreate > initializeDrop, "runtime initialization must replace the trigger in the same order");
  assert.match(initialize, /datetime\(NEW\.created_at, '\+7 hours'\)/);
  assert.match(initialize, /datetime\(created_at, '\+7 hours'\)/);
  assert.match(initialize, /REDEMPTION_INVALID_MONTH/);
});

test("ships a readable and responsive Portfolio Finder", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  // The search command is prominent, labelled and simple to clear.
  assert.match(page, /aria-labelledby="portfolio-finder-title"/);
  assert.match(page, /<label htmlFor="portfolio-search-input">ค้นหาทุกข้อมูลในแฟ้ม<\/label>/);
  assert.match(page, /id="portfolio-search-input" type="search"/);
  assert.match(page, /aria-label="ล้างคำค้นหา"/);
  assert.match(page, /ล้างตัวกรองทั้งหมด/);

  // Status totals follow all other active filters, while the selected status
  // controls only the final result list.
  assert.match(page, /const portfolioFilterMatches = useMemo/);
  assert.match(page, /const visiblePortfolioEntries = useMemo\(\(\) => portfolioStatus === "all"/);
  assert.match(page, /const portfolioStatusCounts = useMemo/);
  for (const status of ["all", "approved", "submitted", "revision", "missing"]) {
    assert.match(page, new RegExp(`count: portfolioStatusCounts\\.${status}`));
  }
  assert.match(page, /className="portfolio-status-tabs" role="group"/);
  assert.match(page, /className="portfolio-active-filters"/);
  assert.match(page, /visiblePortfolioAssetCount/);
  assert.match(page, /เรียงผลงานล่าสุดก่อน/);
  assert.match(page, /additionalEvidenceCount > 0/);
  assert.match(page, /เปิดดูหลักฐานทั้งหมด/);

  // The final scoped block wins over the legacy compact styles: key copy is at
  // least 12px, controls have comfortable targets, and tablet/mobile cards do
  // not restore the old 1020px horizontal table.
  const portfolioStyles = styles.match(/\/\* Portfolio finder: readable search, visible filters and card-like results\. \*\/[\s\S]*$/)?.[0] ?? "";
  assert.ok(portfolioStyles, "expected the final Portfolio Finder style block");
  assert.match(portfolioStyles, /\.portfolio-search-input input \{[^}]*min-height: 54px[^}]*font-size: 15px !important/);
  assert.match(portfolioStyles, /\.portfolio-filter-grid select \{[^}]*min-height: 46px[^}]*font-size: 14px !important/);
  assert.match(portfolioStyles, /\.portfolio-assets a,\.portfolio-assets button \{[^}]*min-height: 44px/);
  assert.match(portfolioStyles, /\.portfolio-owner-banner > div > small \{[^}]*font-size: 13px !important/);
  assert.doesNotMatch(portfolioStyles, /font-size:\s*(?:[0-9]|1[01])px/i, "Portfolio Finder must not reintroduce unreadably small text");
  assert.match(portfolioStyles, /@media \(max-width: 1320px\)[\s\S]*?\.portfolio-archive \{ overflow: visible; \}[\s\S]*?\.portfolio-archive-row \{ min-width: 0;/);
  assert.match(portfolioStyles, /@media \(max-width: 520px\)[\s\S]*?\.portfolio-archive-row \{ grid-template-columns: 1fr;/);
  assert.match(page, /className="portfolio-archive" role="region"/);
  assert.match(page, /className="portfolio-archive-head" aria-hidden="true"/);
  assert.match(page, /className="portfolio-archive-row" aria-label=/);
  assert.match(page, /className="portfolio-empty" role="status"/);
});
