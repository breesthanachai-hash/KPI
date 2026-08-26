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
  const [hosting, migration, workforceMigration, workMigration, dossierMigration, dossierIndexMigration, proofMigration, pointsMigration, peopleOpsMigration, accessMigration, notificationMigration, packagedMigration, packagedWorkforceMigration, packagedWorkMigration, packagedDossierMigration, packagedDossierIndexMigration, packagedProofMigration, packagedPointsMigration, packagedPeopleOpsMigration, packagedAccessMigration, packagedNotificationMigration, page, dashboardRoute, accessControl, data, schema, documentRoute, profileImageRoute, workSubmissionRoute, nextConfig] = await Promise.all([
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
  assert.match(page, /activeRewardEmployeeId = isEmployeeUser/);
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
  assert.match(dashboardRoute, /const employeePortalActions = new Set\(\["markNotificationsRead", "saveWorkItem", "redeemReward"\]\)/);
  assert.match(dashboardRoute, /งานที่ส่งตรวจหรือปิดแล้วไม่สามารถแก้ความคืบหน้าได้/);
  assert.match(workSubmissionRoute, /งานนี้ส่งตรวจหรือปิดแล้ว/);
  assert.match(workSubmissionRoute, /งานนี้มีหลักฐานรอตรวจอยู่แล้ว/);

  assert.match(styles, /Employee portal: a focused, private workspace/);
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
  assert.match(page, /disabled=\{isEmployeePreview \|\| !unreadNotifications\.length\}/);
});
