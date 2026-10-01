import { sql } from "drizzle-orm";
import { check, index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const payrollRuns = sqliteTable("payroll_runs", {
  id: text("id").primaryKey(),
  period: text("period").notNull(),
  status: text("status", { enum: ["draft", "approved", "paid", "void"] }).notNull().default("draft"),
  revision: integer("revision").notNull().default(0),
  document: text("document").notNull(),
  approvedBy: text("approved_by"), approvedAt: text("approved_at"), paymentReference: text("payment_reference"),
  createdBy: text("created_by").notNull(), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (t) => [index("payroll_runs_period_idx").on(t.period), check("payroll_run_state", sql`${t.status} IN ('draft','approved','paid','void') AND typeof(${t.revision})='integer' AND ${t.revision} >= 0 AND json_valid(${t.document}) AND json_type(${t.document})='object' AND (${t.status} NOT IN ('approved','paid') OR (${t.approvedBy} IS NOT NULL AND ${t.approvedAt} IS NOT NULL))`)]);

export const payrollEvents = sqliteTable("payroll_events", {
  id: text("id").primaryKey(), runId: text("run_id").notNull().references(() => payrollRuns.id, { onDelete: "restrict" }),
  revision: integer("revision").notNull(), action: text("action").notNull(), actorId: text("actor_id").notNull(), actorName: text("actor_name").notNull(),
  document: text("document").notNull(), reason: text("reason").notNull().default(""), createdAt: text("created_at").notNull(),
}, (t) => [uniqueIndex("payroll_event_revision_unique").on(t.runId, t.revision)]);

export const payrollSlips = sqliteTable("payroll_slips", {
  id: text("id").primaryKey(), runId: text("run_id").notNull().references(() => payrollRuns.id, { onDelete: "restrict" }),
  employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "restrict" }),
  period: text("period").notNull(), snapshot: text("snapshot").notNull(), recipientEmail: text("recipient_email").notNull(),
  gross: integer("gross").notNull(), deductions: integer("deductions").notNull(), net: integer("net").notNull(), createdAt: text("created_at").notNull(),
}, (t) => [uniqueIndex("payroll_slip_employee_run_unique").on(t.runId, t.employeeId), index("payroll_slip_employee_idx").on(t.employeeId, t.period),
  check("payroll_slip_money", sql`typeof(${t.gross})='integer' AND typeof(${t.deductions})='integer' AND typeof(${t.net})='integer' AND ${t.gross} BETWEEN 0 AND 10000000000 AND ${t.deductions} BETWEEN 0 AND ${t.gross} AND ${t.net}=${t.gross}-${t.deductions} AND json_valid(${t.snapshot})`)]);

export const payrollDeliveries = sqliteTable("payroll_deliveries", {
  slipId: text("slip_id").primaryKey().references(() => payrollSlips.id, { onDelete: "restrict" }),
  status: text("status", { enum: ["pending", "sending", "accepted", "failed", "review"] }).notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0), leaseToken: text("lease_token"), leaseUntil: text("lease_until"),
  firstAttemptAt: text("first_attempt_at"), payload: text("payload"), providerId: text("provider_id"), lastError: text("last_error"), updatedAt: text("updated_at").notNull(),
  providerDraftId: text("provider_draft_id"),
  sendStartedAt: text("send_started_at"),
}, (t) => [check("payroll_delivery_state", sql`${t.status} IN ('pending','sending','accepted','failed','review') AND typeof(${t.attempts})='integer' AND ${t.attempts} >= 0`)]);

export const payrollAwards = sqliteTable("payroll_awards", {
  id: text("id").primaryKey(), employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "restrict" }),
  kind: text("kind", { enum: ["skill", "quest"] }).notNull(), sourceId: text("source_id").notNull(), label: text("label").notNull(),
  amount: integer("amount").notNull(), startMonth: text("start_month").notNull(), endMonth: text("end_month").notNull(),
  createdBy: text("created_by").notNull(), createdAt: text("created_at").notNull(),
}, (t) => [uniqueIndex("payroll_award_source_unique").on(t.kind, t.sourceId), check("payroll_award_valid", sql`${t.kind} IN ('skill','quest') AND typeof(${t.amount})='integer' AND ${t.amount} BETWEEN 1 AND 10000000000 AND ${t.startMonth}<=${t.endMonth}`)]);

export const payrollPayClaims = sqliteTable("payroll_pay_claims", {
  id: text("id").primaryKey(), slipId: text("slip_id").notNull().references(() => payrollSlips.id, { onDelete: "restrict" }),
  employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "restrict" }),
  kind: text("kind").notNull(), source: text("source").notNull(), amount: integer("amount").notNull(),
}, (t) => [index("payroll_claim_employee_idx").on(t.employeeId)]);

export const employees = sqliteTable("employees", {
  id: text("id").primaryKey(),
  initials: text("initials").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  roleId: text("role_id").notNull(),
  positionTitle: text("position_title").notNull().default(""),
  manager: text("manager").notNull().default(""),
  status: text("status", { enum: ["active", "inactive", "resigned", "archived"] }).notNull().default("active"),
  latestScore: real("latest_score"),
  latestSkillScore: real("latest_skill_score"),
  latestPeriod: text("latest_period"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("employees_email_unique").on(table.email),
  index("employees_role_idx").on(table.roleId),
]);

// Cross-environment proposals are snapshots, not foreign keys to users or employees.
// They must remain reviewable if the employee is removed or source IDs are unknown.
export const employeePositionChangeRequests = sqliteTable("employee_position_change_requests", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull(),
  previousRoleId: text("previous_role_id").notNull(),
  previousPositionTitle: text("previous_position_title").notNull(),
  expectedEmployeeUpdatedAt: text("expected_employee_updated_at").notNull(),
  requestedRoleId: text("requested_role_id").notNull(),
  requestedPositionTitle: text("requested_position_title").notNull(),
  reason: text("reason").notNull(),
  requestedBy: text("requested_by").notNull(),
  requestedByName: text("requested_by_name").notNull(),
  createdAt: text("created_at").notNull(),
  sourceFingerprint: text("source_fingerprint").notNull(),
  importedBy: text("imported_by"),
  importedAt: text("imported_at"),
  status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
  reviewedBy: text("reviewed_by"),
  reviewedByName: text("reviewed_by_name"),
  approvedAt: text("approved_at"),
  rejectedAt: text("rejected_at"),
  reviewNote: text("review_note").notNull().default(""),
}, t => [
  index("position_requests_status_created_idx").on(t.status, t.createdAt),
  index("position_requests_employee_created_idx").on(t.employeeId, t.createdAt),
  check("position_requests_state", sql`(${t.status}='pending' AND ${t.reviewedBy} IS NULL AND ${t.approvedAt} IS NULL AND ${t.rejectedAt} IS NULL) OR (${t.status}='approved' AND ${t.reviewedBy} IS NOT NULL AND ${t.reviewedByName} IS NOT NULL AND ${t.approvedAt} IS NOT NULL AND ${t.rejectedAt} IS NULL) OR (${t.status}='rejected' AND ${t.reviewedBy} IS NOT NULL AND ${t.reviewedByName} IS NOT NULL AND ${t.rejectedAt} IS NOT NULL AND ${t.approvedAt} IS NULL)`),
]);

export const employeePositionEvents = sqliteTable("employee_position_events", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull(),
  employeeNameSnapshot: text("employee_name_snapshot").notNull(),
  roleIdSnapshot: text("role_id_snapshot").notNull(),
  previousPositionTitle: text("previous_position_title").notNull().default(""),
  nextPositionTitle: text("next_position_title").notNull().default(""),
  expectedUpdatedAt: text("expected_updated_at").notNull(),
  resultingUpdatedAt: text("resulting_updated_at").notNull(),
  actorUserId: text("actor_user_id").notNull(),
  actorName: text("actor_name").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("employee_position_events_employee_result_unique").on(table.employeeId, table.resultingUpdatedAt),
  index("employee_position_events_employee_created_idx").on(table.employeeId, table.createdAt),
  index("employee_position_events_actor_created_idx").on(table.actorUserId, table.createdAt),
]);

export const systemSettings = sqliteTable("system_settings", {
  id: text("id").primaryKey(),
  organizationName: text("organization_name").notNull().default("People Pulse"),
  organizationShortName: text("organization_short_name").notNull().default("People Pulse"),
  navigationMode: text("navigation_mode", { enum: ["simple", "full"] }).notNull().default("simple"),
  adminHome: text("admin_home", { enum: ["overview", "employees", "work"] }).notNull().default("work"),
  managerHome: text("manager_home", { enum: ["overview", "employees", "work"] }).notNull().default("work"),
  employeeHome: text("employee_home", { enum: ["work", "portfolio", "peopleOps"] }).notNull().default("work"),
  aiAssistantEnabled: integer("ai_assistant_enabled", { mode: "boolean" }).notNull().default(true),
  aiMascotEnabled: integer("ai_mascot_enabled", { mode: "boolean" }).notNull().default(true),
  office3dEnabled: integer("office_3d_enabled", { mode: "boolean" }).notNull().default(true),
  questRewardLinkingEnabled: integer("quest_reward_linking_enabled", { mode: "boolean" }).notNull().default(true),
  revision: integer("revision").notNull().default(0),
  updatedByUserId: text("updated_by_user_id").notNull().default("system"),
  updatedByName: text("updated_by_name").notNull().default("ระบบ"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const systemSettingsEvents = sqliteTable("system_settings_events", {
  id: text("id").primaryKey(),
  settingsId: text("settings_id").notNull().references(() => systemSettings.id, { onDelete: "restrict" }),
  previousRevision: integer("previous_revision").notNull(),
  nextRevision: integer("next_revision").notNull(),
  expectedUpdatedAt: text("expected_updated_at").notNull(),
  resultingUpdatedAt: text("resulting_updated_at").notNull(),
  previousSnapshot: text("previous_snapshot", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  nextSnapshot: text("next_snapshot", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  changedKeys: text("changed_keys", { mode: "json" }).$type<string[]>().notNull(),
  actorUserId: text("actor_user_id").notNull(),
  actorName: text("actor_name").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("system_settings_events_revision_unique").on(table.settingsId, table.nextRevision),
  index("system_settings_events_created_idx").on(table.settingsId, table.createdAt),
]);

export const userAccounts = sqliteTable("user_accounts", {
  id: text("id").primaryKey(),
  authUserId: text("auth_user_id").notNull().default(""),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  nickname: text("nickname").notNull().default(""),
  role: text("role", { enum: ["admin", "manager", "employee"] }).notNull().default("employee"),
  employeeId: text("employee_id").references(() => employees.id, { onDelete: "set null" }),
  departmentId: text("department_id").notNull().default(""),
  status: text("status", { enum: ["active", "inactive"] }).notNull().default("active"),
  lastLoginAt: text("last_login_at"),
  createdBy: text("created_by").notNull().default("ระบบ"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("user_accounts_email_unique").on(table.email),
  uniqueIndex("user_accounts_auth_user_unique").on(table.authUserId).where(sql`${table.authUserId} != ''`),
  uniqueIndex("user_accounts_employee_unique").on(table.employeeId).where(sql`${table.employeeId} IS NOT NULL`),
  index("user_accounts_role_status_idx").on(table.role, table.status),
]);

export const authCredentials = sqliteTable("auth_credentials", {
  userAccountId: text("user_account_id").primaryKey().references(() => userAccounts.id, { onDelete: "cascade" }),
  loginId: text("login_id").notNull(),
  loginIdCanonical: text("login_id_canonical").notNull(),
  passwordHash: text("password_hash").notNull().default(""),
  passwordSalt: text("password_salt").notNull().default(""),
  passwordAlgorithm: text("password_algorithm").notNull().default("pbkdf2-sha256"),
  passwordIterations: integer("password_iterations").notNull().default(100000),
  pepperVersion: integer("pepper_version").notNull().default(1),
  credentialVersion: integer("credential_version").notNull().default(1),
  mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(true),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: text("locked_until"),
  passwordChangedAt: text("password_changed_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("auth_credentials_login_id_canonical_unique").on(table.loginIdCanonical),
  index("auth_credentials_locked_until_idx").on(table.lockedUntil),
]);

export const authSessions = sqliteTable("auth_sessions", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull(),
  userAccountId: text("user_account_id").notNull().references(() => userAccounts.id, { onDelete: "cascade" }),
  credentialVersion: integer("credential_version").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  authenticatedAt: text("authenticated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  idleExpiresAt: text("idle_expires_at").notNull(),
  absoluteExpiresAt: text("absolute_expires_at").notNull(),
  revokedAt: text("revoked_at"),
  revokeReason: text("revoke_reason").notNull().default(""),
}, (table) => [
  uniqueIndex("auth_sessions_token_hash_unique").on(table.tokenHash),
  index("auth_sessions_user_active_idx").on(table.userAccountId, table.revokedAt, table.absoluteExpiresAt),
  index("auth_sessions_expiry_idx").on(table.idleExpiresAt, table.absoluteExpiresAt),
]);

export const authRateLimits = sqliteTable("auth_rate_limits", {
  keyHash: text("key_hash").primaryKey(),
  bucketType: text("bucket_type", { enum: ["login_id", "source"] }).notNull(),
  windowStartedAt: text("window_started_at").notNull(),
  attemptCount: integer("attempt_count").notNull().default(0),
  blockedUntil: text("blocked_until"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("auth_rate_limits_blocked_until_idx").on(table.blockedUntil),
  index("auth_rate_limits_bucket_updated_idx").on(table.bucketType, table.updatedAt),
]);

export const authEvents = sqliteTable("auth_events", {
  id: text("id").primaryKey(),
  userAccountId: text("user_account_id").references(() => userAccounts.id, { onDelete: "set null" }),
  eventType: text("event_type", { enum: ["login_succeeded", "login_failed", "login_rate_limited", "logout", "sessions_revoked", "password_changed", "credential_created", "credential_reset", "credential_updated", "account_deleted", "employee_purged", "bootstrap_credential_repaired", "registration_submitted", "registration_approved", "registration_rejected"] }).notNull(),
  sourceHash: text("source_hash").notNull().default(""),
  detail: text("detail").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("auth_events_user_created_idx").on(table.userAccountId, table.createdAt),
  index("auth_events_type_created_idx").on(table.eventType, table.createdAt),
]);

export const employeeRegistrationRequests = sqliteTable("employee_registration_requests", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  emailCanonical: text("email_canonical").notNull(),
  loginId: text("login_id").notNull(),
  loginIdCanonical: text("login_id_canonical").notNull(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  passwordAlgorithm: text("password_algorithm").notNull().default("pbkdf2-sha256-chain-v1"),
  passwordIterations: integer("password_iterations").notNull().default(600000),
  pepperVersion: integer("pepper_version").notNull().default(1),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  nickname: text("nickname").notNull(),
  status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
  sourceHash: text("source_hash").notNull().default(""),
  submittedAt: text("submitted_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  reviewedByUserId: text("reviewed_by_user_id").references(() => userAccounts.id, { onDelete: "set null" }),
  reviewedByName: text("reviewed_by_name").notNull().default(""),
  reviewedAt: text("reviewed_at"),
  rejectionReason: text("rejection_reason").notNull().default(""),
  approvedUserAccountId: text("approved_user_account_id").references(() => userAccounts.id, { onDelete: "set null" }),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("employee_registration_pending_login_unique").on(table.loginIdCanonical).where(sql`${table.status} = 'pending'`),
  uniqueIndex("employee_registration_pending_email_unique").on(table.emailCanonical).where(sql`${table.status} = 'pending'`),
  index("employee_registration_status_submitted_idx").on(table.status, table.submittedAt),
  index("employee_registration_source_submitted_idx").on(table.sourceHash, table.submittedAt),
]);

export const employeeRegistrationReviewClaims = sqliteTable("employee_registration_review_claims", {
  requestId: text("request_id").primaryKey().references(() => employeeRegistrationRequests.id, { onDelete: "restrict" }),
  decision: text("decision", { enum: ["approved", "rejected"] }).notNull(),
  reviewerUserId: text("reviewer_user_id").notNull().references(() => userAccounts.id, { onDelete: "restrict" }),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("employee_registration_review_claims_reviewer_idx").on(table.reviewerUserId, table.createdAt),
]);

export const notificationReads = sqliteTable("notification_reads", {
  id: text("id").primaryKey(),
  userKey: text("user_key").notNull(),
  notificationId: text("notification_id").notNull(),
  readAt: text("read_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("notification_reads_user_notification_unique").on(table.userKey, table.notificationId),
  index("notification_reads_user_read_idx").on(table.userKey, table.readAt),
]);

export const organizationPolicies = sqliteTable("organization_policies", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull().default(""),
  content: text("content").notNull(),
  category: text("category", { enum: ["work_rules", "points_rewards", "ai_data", "other"] }).notNull().default("other"),
  status: text("status", { enum: ["draft", "published"] }).notNull().default("draft"),
  version: integer("version").notNull().default(1),
  effectiveDate: text("effective_date").notNull(),
  effectiveTo: text("effective_to"),
  scopeType: text("scope_type", { enum: ["all", "department", "role", "employment_type"] }).notNull().default("all"),
  scopeValues: text("scope_values", { mode: "json" }).$type<string[]>().notNull(),
  acknowledgementRequired: integer("acknowledgement_required", { mode: "boolean" }).notNull().default(true),
  acknowledgementDueDays: integer("acknowledgement_due_days").notNull().default(7),
  rules: text("rules", { mode: "json" }).$type<Record<string, unknown> | null>(),
  contentHash: text("content_hash").notNull().default(""),
  publishedAt: text("published_at"),
  publishedBy: text("published_by"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedBy: text("updated_by").notNull().default("ระบบ"),
}, (table) => [
  uniqueIndex("organization_policies_code_version_unique").on(table.code, table.version),
  uniqueIndex("organization_policies_published_code_effective_unique").on(table.code, table.effectiveDate).where(sql`${table.status} = 'published'`),
  index("organization_policies_status_effective_idx").on(table.status, table.effectiveDate),
  index("organization_policies_category_status_idx").on(table.category, table.status),
]);

export const organizationPolicyPublishClaims = sqliteTable("organization_policy_publish_claims", {
  id: text("id").primaryKey(),
  policyId: text("policy_id").notNull().references(() => organizationPolicies.id, { onDelete: "restrict" }),
  code: text("code").notNull(),
  predecessorVersion: integer("predecessor_version").notNull(),
  expectedContentHash: text("expected_content_hash").notNull().default(""),
  publishedAt: text("published_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("organization_policy_publish_claim_policy_unique").on(table.policyId),
  uniqueIndex("organization_policy_publish_claim_head_unique").on(table.code, table.predecessorVersion),
]);

export const policyAcknowledgements = sqliteTable("policy_acknowledgements", {
  id: text("id").primaryKey(),
  policyId: text("policy_id").notNull().references(() => organizationPolicies.id, { onDelete: "restrict" }),
  employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "restrict" }),
  userAccountId: text("user_account_id").references(() => userAccounts.id, { onDelete: "set null" }),
  policyVersion: integer("policy_version").notNull(),
  contentHash: text("content_hash").notNull(),
  acknowledgementText: text("acknowledgement_text").notNull(),
  acknowledgedName: text("acknowledged_name").notNull(),
  acknowledgedEmail: text("acknowledged_email").notNull(),
  authenticatedUserId: text("authenticated_user_id").notNull(),
  acknowledgedAt: text("acknowledged_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("policy_acknowledgements_policy_version_employee_unique").on(table.policyId, table.policyVersion, table.employeeId),
  index("policy_acknowledgements_employee_date_idx").on(table.employeeId, table.acknowledgedAt),
  index("policy_acknowledgements_policy_date_idx").on(table.policyId, table.acknowledgedAt),
]);

export const evaluations = sqliteTable("evaluations", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  period: text("period").notNull(),
  kpiScores: text("kpi_scores", { mode: "json" }).$type<Record<string, number>>().notNull(),
  skillScores: text("skill_scores", { mode: "json" }).$type<Record<string, number>>().notNull(),
  kpiScore: real("kpi_score").notNull(),
  skillScore: real("skill_score").notNull(),
  totalScore: real("total_score").notNull(),
  note: text("note").notNull().default(""),
  evaluator: text("evaluator").notNull().default("ฝ่ายทรัพยากรบุคคล"),
  evaluatedAt: text("evaluated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("evaluations_employee_period_unique").on(table.employeeId, table.period),
  index("evaluations_period_idx").on(table.period),
]);

export const employeeSelfAssessments = sqliteTable("employee_self_assessments", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  period: text("period").notNull(),
  kpiScores: text("kpi_scores", { mode: "json" }).$type<Record<string, number>>().notNull(),
  skillScores: text("skill_scores", { mode: "json" }).$type<Record<string, number>>().notNull(),
  kpiScore: real("kpi_score").notNull(),
  skillScore: real("skill_score").notNull(),
  totalScore: real("total_score").notNull(),
  note: text("note").notNull().default(""),
  submittedAt: text("submitted_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("employee_self_assessments_employee_period_unique").on(table.employeeId, table.period),
  index("employee_self_assessments_period_idx").on(table.period),
]);

export const hrProfiles = sqliteTable("hr_profiles", {
  employeeId: text("employee_id").primaryKey().references(() => employees.id, { onDelete: "cascade" }),
  currentSalary: real("current_salary").notNull().default(0),
  salaryReviewMonth: text("salary_review_month").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const attendanceRecords = sqliteTable("attendance_records", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  workDate: text("work_date").notNull(),
  status: text("status", { enum: ["present", "late", "absent", "leave"] }).notNull().default("present"),
  clockIn: text("clock_in"),
  clockOut: text("clock_out"),
  minutesLate: integer("minutes_late").notNull().default(0),
  leaveType: text("leave_type", { enum: ["sick", "personal", "vacation", "other"] }),
  note: text("note").notNull().default(""),
  approvalStatus: text("approval_status", { enum: ["not_required", "pending", "approved", "rejected"] }).notNull().default("not_required"),
  approvedBy: text("approved_by"),
  approvedAt: text("approved_at"),
  createdBy: text("created_by").notNull().default("ฝ่ายทรัพยากรบุคคล"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("attendance_employee_date_unique").on(table.employeeId, table.workDate),
  index("attendance_work_date_idx").on(table.workDate),
  index("attendance_approval_date_idx").on(table.approvalStatus, table.workDate),
]);

export const skillAchievements = sqliteTable("skill_achievements", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  roleId: text("role_id").notNull(),
  skillId: text("skill_id").notNull(),
  skillName: text("skill_name").notNull(),
  level: integer("level").notNull(),
  monthlyAllowance: integer("monthly_allowance").notNull().default(0),
  verifiedBy: text("verified_by").notNull(),
  verifiedAt: text("verified_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  evidenceUrl: text("evidence_url").notNull().default(""),
  note: text("note").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("skill_achievement_milestone_unique").on(table.employeeId, table.skillId, table.level),
  index("skill_achievement_employee_verified_idx").on(table.employeeId, table.verifiedAt),
]);

export const talentActions = sqliteTable("talent_actions", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["skill_test", "upskill", "role_review", "salary_review"] }).notNull(),
  title: text("title").notNull(),
  status: text("status", { enum: ["planned", "in_progress", "completed"] }).notNull().default("planned"),
  score: real("score"),
  dueDate: text("due_date").notNull(),
  targetRoleId: text("target_role_id").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("talent_actions_employee_idx").on(table.employeeId),
  index("talent_actions_status_due_idx").on(table.status, table.dueDate),
]);

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  ownerEmployeeId: text("owner_employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  departmentId: text("department_id").notNull().default(""),
  status: text("status", { enum: ["planned", "active", "on_hold", "completed"] }).notNull().default("planned"),
  dueDate: text("due_date").notNull(),
  color: text("color").notNull().default("forest"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("projects_status_due_idx").on(table.status, table.dueDate),
  index("projects_owner_idx").on(table.ownerEmployeeId),
]);

export const workItems = sqliteTable("work_items", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  assigneeEmployeeId: text("assignee_employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  createdByEmployeeId: text("created_by_employee_id").references(() => employees.id, { onDelete: "set null" }),
  kind: text("kind", { enum: ["task", "request", "mission"] }).notNull().default("task"),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  priority: text("priority", { enum: ["low", "medium", "high", "urgent"] }).notNull().default("medium"),
  status: text("status", { enum: ["todo", "in_progress", "review", "done"] }).notNull().default("todo"),
  progress: integer("progress").notNull().default(0),
  points: integer("points").notNull().default(0),
  dueDate: text("due_date").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("work_items_project_status_idx").on(table.projectId, table.status),
  index("work_items_assignee_status_idx").on(table.assigneeEmployeeId, table.status),
  index("work_items_creator_status_idx").on(table.createdByEmployeeId, table.status),
  index("work_items_due_idx").on(table.dueDate),
]);

export const workSubmissions = sqliteTable("work_submissions", {
  id: text("id").primaryKey(),
  workItemId: text("work_item_id").notNull().references(() => workItems.id, { onDelete: "cascade" }),
  employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  submissionType: text("submission_type", { enum: ["video", "drive", "social", "document", "design", "code", "sales", "service", "hr", "other"] }).notNull().default("other"),
  title: text("title").notNull(),
  linkUrl: text("link_url").notNull().default(""),
  note: text("note").notNull().default(""),
  fileName: text("file_name").notNull().default(""),
  storageKey: text("storage_key").notNull().default(""),
  contentType: text("content_type").notNull().default("application/octet-stream"),
  sizeBytes: integer("size_bytes").notNull().default(0),
  status: text("status", { enum: ["submitted", "approved", "revision"] }).notNull().default("submitted"),
  submittedBy: text("submitted_by").notNull().default(""),
  submittedAt: text("submitted_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  reviewedBy: text("reviewed_by"),
  reviewedAt: text("reviewed_at"),
  reviewerNote: text("reviewer_note").notNull().default(""),
}, (table) => [
  uniqueIndex("work_submissions_one_submitted_per_work_unique").on(table.workItemId).where(sql`${table.status} = 'submitted'`),
  index("work_submissions_work_status_idx").on(table.workItemId, table.status),
  index("work_submissions_employee_submitted_idx").on(table.employeeId, table.submittedAt),
]);

export const rewards = sqliteTable("rewards", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  category: text("category", { enum: ["perk", "learning", "wellbeing", "recognition"] }).notNull().default("perk"),
  costPoints: integer("cost_points").notNull(),
  stock: integer("stock").notNull().default(0),
  inventoryVersion: integer("inventory_version").notNull().default(0),
  icon: text("icon").notNull().default("★"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("rewards_active_cost_idx").on(table.isActive, table.costPoints),
]);

export const quests = sqliteTable("quests", {
  id: text("id").primaryKey(),
  type: text("type", { enum: ["individual", "team", "activity"] }).notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  status: text("status", { enum: ["draft", "active", "completed", "archived"] }).notNull().default("draft"),
  progress: integer("progress").notNull().default(0),
  pointsReward: integer("points_reward").notNull().default(0),
  rewardId: text("reward_id").references(() => rewards.id, { onDelete: "restrict" }),
  rewardTitleSnapshot: text("reward_title_snapshot").notNull().default(""),
  rewardIconSnapshot: text("reward_icon_snapshot").notNull().default(""),
  isFeatured: integer("is_featured", { mode: "boolean" }).notNull().default(true),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  revision: integer("revision").notNull().default(0),
  createdByUserId: text("created_by_user_id").notNull().default(""),
  createdByName: text("created_by_name").notNull().default(""),
  updatedByUserId: text("updated_by_user_id").notNull().default(""),
  updatedByName: text("updated_by_name").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("quests_status_featured_dates_idx").on(table.status, table.isFeatured, table.startDate, table.endDate),
  index("quests_type_status_idx").on(table.type, table.status),
  index("quests_reward_idx").on(table.rewardId),
]);

export const questTargets = sqliteTable("quest_targets", {
  id: text("id").primaryKey(),
  questId: text("quest_id").notNull().references(() => quests.id, { onDelete: "restrict" }),
  targetType: text("target_type", { enum: ["employee", "department", "all"] }).notNull(),
  targetKey: text("target_key").notNull(),
  targetLabelSnapshot: text("target_label_snapshot").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("quest_targets_quest_type_key_unique").on(table.questId, table.targetType, table.targetKey),
  index("quest_targets_type_key_quest_idx").on(table.targetType, table.targetKey, table.questId),
]);

export const questMutationEvents = sqliteTable("quest_mutation_events", {
  id: text("id").primaryKey(),
  questId: text("quest_id").notNull().references(() => quests.id, { onDelete: "restrict" }),
  eventType: text("event_type", { enum: ["created", "updated", "archived"] }).notNull(),
  expectedRevision: integer("expected_revision").notNull(),
  expectedUpdatedAt: text("expected_updated_at").notNull(),
  revision: integer("revision").notNull(),
  actorUserId: text("actor_user_id").notNull().default(""),
  actorName: text("actor_name").notNull(),
  snapshotJson: text("snapshot_json").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("quest_mutation_events_quest_revision_unique").on(table.questId, table.revision),
  index("quest_mutation_events_actor_created_idx").on(table.actorUserId, table.createdAt),
]);

export const questCompletions = sqliteTable("quest_completions", {
  id: text("id").primaryKey(),
  questId: text("quest_id").notNull().references(() => quests.id, { onDelete: "restrict" }),
  employeeId: text("employee_id").notNull(),
  completionDate: text("completion_date").notNull(),
  questRevision: integer("quest_revision").notNull(),
  questUpdatedAt: text("quest_updated_at").notNull(),
  questTypeSnapshot: text("quest_type_snapshot", { enum: ["individual", "team", "activity"] }).notNull(),
  questTitleSnapshot: text("quest_title_snapshot").notNull(),
  questDescriptionSnapshot: text("quest_description_snapshot").notNull().default(""),
  questStartDateSnapshot: text("quest_start_date_snapshot").notNull(),
  questEndDateSnapshot: text("quest_end_date_snapshot").notNull(),
  pointsAwarded: integer("points_awarded").notNull(),
  rewardId: text("reward_id"),
  rewardTitleSnapshot: text("reward_title_snapshot").notNull().default(""),
  rewardIconSnapshot: text("reward_icon_snapshot").notNull().default(""),
  rewardInventoryVersion: integer("reward_inventory_version"),
  employeeNameSnapshot: text("employee_name_snapshot").notNull(),
  employeeRoleIdSnapshot: text("employee_role_id_snapshot").notNull(),
  employeeDepartmentIdSnapshot: text("employee_department_id_snapshot").notNull(),
  employeeDepartmentNameSnapshot: text("employee_department_name_snapshot").notNull(),
  evidenceUrl: text("evidence_url").notNull(),
  note: text("note").notNull(),
  pointEventId: text("point_event_id").notNull(),
  pointLedgerId: text("point_ledger_id").notNull(),
  policyId: text("policy_id").notNull(),
  policyVersion: integer("policy_version").notNull(),
  policyContentHash: text("policy_content_hash").notNull(),
  questPointPolicyLimit: integer("quest_point_policy_limit").notNull(),
  maxManualQuestCompletions: integer("max_manual_quest_completions").notNull(),
  standardEarnMonthlyCap: integer("standard_earn_monthly_cap").notNull(),
  completedByUserId: text("completed_by_user_id").notNull().default(""),
  completedByName: text("completed_by_name").notNull(),
  completedAt: text("completed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("quest_completions_quest_employee_unique").on(table.questId, table.employeeId),
  index("quest_completions_employee_date_idx").on(table.employeeId, table.completionDate),
  index("quest_completions_quest_date_idx").on(table.questId, table.completionDate),
]);

export const pointLedger = sqliteTable("point_ledger", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  sourceType: text("source_type", { enum: ["task", "mission", "quest", "evaluation", "attendance", "deadline", "quality", "discipline", "bonus", "redemption"] }).notNull(),
  sourceId: text("source_id").notNull(),
  points: integer("points").notNull(),
  note: text("note").notNull().default(""),
  policyId: text("policy_id").references(() => organizationPolicies.id, { onDelete: "set null" }),
  policyVersion: integer("policy_version"),
  policyContentHash: text("policy_content_hash"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("point_ledger_source_unique").on(table.sourceType, table.sourceId),
  index("point_ledger_employee_created_idx").on(table.employeeId, table.createdAt),
  index("point_ledger_policy_idx").on(table.policyId, table.policyVersion),
]);

export const pointEvents = sqliteTable("point_events", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  eventType: text("event_type", { enum: ["monthly_evaluation", "attendance_on_time", "attendance_late", "absence", "approved_leave", "early_finish", "on_time_finish", "work_error", "warning", "rule_violation", "bonus", "quest"] }).notNull(),
  points: integer("points").notNull(),
  eventDate: text("event_date").notNull(),
  note: text("note").notNull().default(""),
  evidenceUrl: text("evidence_url").notNull().default(""),
  recordedBy: text("recorded_by").notNull().default(""),
  policyId: text("policy_id").references(() => organizationPolicies.id, { onDelete: "set null" }),
  policyVersion: integer("policy_version"),
  policyContentHash: text("policy_content_hash"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("point_events_employee_date_idx").on(table.employeeId, table.eventDate),
  index("point_events_type_date_idx").on(table.eventType, table.eventDate),
  index("point_events_policy_idx").on(table.policyId, table.policyVersion),
]);

export const pointMutationClaims = sqliteTable("point_mutation_claims", {
  id: text("id").primaryKey(),
  pointEventId: text("point_event_id").notNull().references(() => pointEvents.id, { onDelete: "restrict" }),
  employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "restrict" }),
  predecessorEventCount: integer("predecessor_event_count").notNull(),
  employeeSequenceKey: text("employee_sequence_key").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("point_mutation_claim_event_unique").on(table.pointEventId),
  uniqueIndex("point_mutation_claim_employee_sequence_unique").on(table.employeeSequenceKey),
  index("point_mutation_claim_employee_created_idx").on(table.employeeId, table.createdAt),
]);

export const pointCapClaims = sqliteTable("point_cap_claims", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "restrict" }),
  claimMonth: text("claim_month").notNull(),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id").notNull(),
  employeeMonthSequenceKey: text("employee_month_sequence_key").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("point_cap_claim_employee_month_sequence_unique").on(table.employeeMonthSequenceKey),
  uniqueIndex("point_cap_claim_source_unique").on(table.sourceType, table.sourceId),
  index("point_cap_claim_employee_month_idx").on(table.employeeId, table.claimMonth),
]);

export const rewardRedemptions = sqliteTable("reward_redemptions", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  rewardId: text("reward_id").notNull().references(() => rewards.id, { onDelete: "cascade" }),
  pointsSpent: integer("points_spent").notNull(),
  status: text("status", { enum: ["requested", "approved", "fulfilled", "cancelled"] }).notNull().default("requested"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("reward_redemptions_employee_created_idx").on(table.employeeId, table.createdAt),
  index("reward_redemptions_status_idx").on(table.status),
]);

export const rewardRedemptionClaims = sqliteTable("reward_redemption_claims", {
  id: text("id").primaryKey(),
  redemptionId: text("redemption_id").notNull().references(() => rewardRedemptions.id, { onDelete: "restrict" }),
  employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "restrict" }),
  rewardId: text("reward_id").notNull().references(() => rewards.id, { onDelete: "restrict" }),
  employeeRequestKey: text("employee_request_key").notNull(),
  rewardInventoryKey: text("reward_inventory_key").notNull(),
  expectedInventoryVersion: integer("expected_inventory_version").notNull(),
  requiredBalance: integer("required_balance").notNull(),
  maxRedemptionsPerMonth: integer("max_redemptions_per_month").notNull(),
  cooldownDays: integer("cooldown_days").notNull(),
  requestMonth: text("request_month").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("reward_redemption_claim_redemption_unique").on(table.redemptionId),
  uniqueIndex("reward_redemption_claim_employee_request_unique").on(table.employeeRequestKey),
  uniqueIndex("reward_redemption_claim_inventory_unique").on(table.rewardInventoryKey),
  index("reward_redemption_claim_employee_created_idx").on(table.employeeId, table.createdAt),
]);

export const employeeProfiles = sqliteTable("employee_profiles", {
  employeeId: text("employee_id").primaryKey().references(() => employees.id, { onDelete: "cascade" }),
  personalEmail: text("personal_email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  birthDate: text("birth_date").notNull().default(""),
  nationalIdLast4: text("national_id_last4").notNull().default(""),
  address: text("address").notNull().default(""),
  emergencyName: text("emergency_name").notNull().default(""),
  emergencyPhone: text("emergency_phone").notNull().default(""),
  startDate: text("start_date").notNull().default(""),
  employmentType: text("employment_type", { enum: ["permanent", "contract", "probation", "intern"] }).notNull().default("permanent"),
  education: text("education").notNull().default(""),
  experienceYears: integer("experience_years").notNull().default(0),
  applicationSource: text("application_source").notNull().default(""),
  profileImageKey: text("profile_image_key").notNull().default(""),
  profileImageContentType: text("profile_image_content_type").notNull().default(""),
  profileImageUpdatedAt: text("profile_image_updated_at"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const applicationDocuments = sqliteTable("application_documents", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  documentType: text("document_type", { enum: ["resume", "id_card", "house_registration", "transcript", "portfolio", "bank_account", "medical_certificate", "contract", "other"] }).notNull(),
  title: text("title").notNull(),
  fileName: text("file_name").notNull(),
  storageKey: text("storage_key").notNull().default(""),
  contentType: text("content_type").notNull().default("application/octet-stream"),
  sizeBytes: integer("size_bytes").notNull().default(0),
  status: text("status", { enum: ["pending", "verified", "rejected"] }).notNull().default("pending"),
  note: text("note").notNull().default(""),
  uploadedBy: text("uploaded_by").notNull().default(""),
  uploadedAt: text("uploaded_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  verifiedBy: text("verified_by"),
  verifiedAt: text("verified_at"),
}, (table) => [
  uniqueIndex("application_documents_required_type_unique").on(table.employeeId, table.documentType).where(sql`${table.documentType} NOT IN ('contract', 'other')`),
  index("application_documents_employee_status_idx").on(table.employeeId, table.status),
]);

export const employmentContracts = sqliteTable("employment_contracts", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  documentId: text("document_id").references(() => applicationDocuments.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  version: text("version").notNull().default("1.0"),
  status: text("status", { enum: ["draft", "sent", "viewed", "signed", "cancelled"] }).notNull().default("draft"),
  effectiveDate: text("effective_date").notNull(),
  expiryDate: text("expiry_date"),
  sentAt: text("sent_at"),
  signedName: text("signed_name"),
  signedAt: text("signed_at"),
  consentText: text("consent_text").notNull().default(""),
  signerUserId: text("signer_user_id"),
  signerEmail: text("signer_email"),
  createdBy: text("created_by").notNull().default("ฝ่ายทรัพยากรบุคคล"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("employment_contracts_employee_created_idx").on(table.employeeId, table.createdAt),
  index("employment_contracts_status_idx").on(table.status),
]);

export const organizationDocuments = sqliteTable("organization_documents", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  category: text("category", { enum: ["lease", "employment", "hr", "legal", "finance", "operations", "other"] }).notNull().default("other"),
  description: text("description").notNull().default(""),
  documentNumber: text("document_number").notNull(),
  version: text("version").notNull().default("1.0"),
  status: text("status", { enum: ["draft", "active", "expired", "archived"] }).notNull().default("draft"),
  owner: text("owner").notNull(),
  effectiveDate: text("effective_date").notNull().default(""),
  expiryDate: text("expiry_date"),
  note: text("note").notNull().default(""),
  fileName: text("file_name").notNull().default(""),
  storageKey: text("storage_key").notNull().default(""),
  contentType: text("content_type").notNull().default("application/octet-stream"),
  sizeBytes: integer("size_bytes").notNull().default(0),
  revision: integer("revision").notNull().default(0),
  createdByUserId: text("created_by_user_id").notNull().default(""),
  createdBy: text("created_by").notNull().default("ฝ่ายทรัพยากรบุคคล"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedByUserId: text("updated_by_user_id").notNull().default(""),
  updatedBy: text("updated_by").notNull().default("ฝ่ายทรัพยากรบุคคล"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("organization_documents_number_version_unique").on(table.documentNumber, table.version),
  uniqueIndex("organization_documents_storage_key_unique").on(table.storageKey).where(sql`${table.storageKey} != ''`),
  index("organization_documents_category_status_idx").on(table.category, table.status),
  index("organization_documents_status_effective_idx").on(table.status, table.effectiveDate),
]);

export const employeeWarnings = sqliteTable("employee_warnings", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "restrict" }),
  warningNumber: text("warning_number").notNull(),
  level: text("level", { enum: ["first", "second", "final"] }).notNull().default("first"),
  subject: text("subject").notNull(),
  incidentDate: text("incident_date").notNull(),
  issuedDate: text("issued_date").notNull(),
  facts: text("facts").notNull(),
  correctiveAction: text("corrective_action").notNull().default(""),
  reviewDate: text("review_date"),
  employeeStatement: text("employee_statement").notNull().default(""),
  status: text("status", { enum: ["draft", "issued", "acknowledged", "resolved", "withdrawn"] }).notNull().default("draft"),
  fileName: text("file_name").notNull().default(""),
  storageKey: text("storage_key").notNull().default(""),
  contentType: text("content_type").notNull().default("application/octet-stream"),
  sizeBytes: integer("size_bytes").notNull().default(0),
  revision: integer("revision").notNull().default(0),
  issuedBy: text("issued_by"),
  issuedAt: text("issued_at"),
  acknowledgedBy: text("acknowledged_by"),
  acknowledgedAt: text("acknowledged_at"),
  resolvedBy: text("resolved_by"),
  resolvedAt: text("resolved_at"),
  withdrawnBy: text("withdrawn_by"),
  withdrawnAt: text("withdrawn_at"),
  createdByUserId: text("created_by_user_id").notNull().default(""),
  createdBy: text("created_by").notNull().default("ฝ่ายทรัพยากรบุคคล"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedByUserId: text("updated_by_user_id").notNull().default(""),
  updatedBy: text("updated_by").notNull().default("ฝ่ายทรัพยากรบุคคล"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("employee_warnings_warning_number_unique").on(table.warningNumber),
  uniqueIndex("employee_warnings_storage_key_unique").on(table.storageKey).where(sql`${table.storageKey} != ''`),
  index("employee_warnings_employee_issued_idx").on(table.employeeId, table.issuedDate),
  index("employee_warnings_status_issued_idx").on(table.status, table.issuedDate),
]);

export const employeeWarningEvents = sqliteTable("employee_warning_events", {
  id: text("id").primaryKey(),
  warningId: text("warning_id").notNull().references(() => employeeWarnings.id, { onDelete: "restrict" }),
  eventType: text("event_type", { enum: ["created", "updated", "issued", "acknowledged", "resolved", "withdrawn"] }).notNull(),
  actorUserId: text("actor_user_id").notNull().default(""),
  actorName: text("actor_name").notNull(),
  note: text("note").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("employee_warning_events_warning_created_idx").on(table.warningId, table.createdAt),
]);

export const employeeRecognitions = sqliteTable("employee_recognitions", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "restrict" }),
  recognitionType: text("recognition_type", { enum: ["certificate", "award", "honor", "training", "license", "other"] }).notNull().default("certificate"),
  title: text("title").notNull(),
  issuer: text("issuer").notNull(),
  issuedDate: text("issued_date").notNull(),
  expiryDate: text("expiry_date"),
  credentialId: text("credential_id").notNull().default(""),
  verificationUrl: text("verification_url").notNull().default(""),
  description: text("description").notNull().default(""),
  status: text("status", { enum: ["active", "expired", "revoked"] }).notNull().default("active"),
  fileName: text("file_name").notNull().default(""),
  storageKey: text("storage_key").notNull().default(""),
  contentType: text("content_type").notNull().default("application/octet-stream"),
  sizeBytes: integer("size_bytes").notNull().default(0),
  revision: integer("revision").notNull().default(0),
  createdByUserId: text("created_by_user_id").notNull().default(""),
  createdBy: text("created_by").notNull().default("ฝ่ายทรัพยากรบุคคล"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedByUserId: text("updated_by_user_id").notNull().default(""),
  updatedBy: text("updated_by").notNull().default("ฝ่ายทรัพยากรบุคคล"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("employee_recognitions_storage_key_unique").on(table.storageKey).where(sql`${table.storageKey} != ''`),
  index("employee_recognitions_employee_issued_idx").on(table.employeeId, table.issuedDate),
  index("employee_recognitions_status_expiry_idx").on(table.status, table.expiryDate),
]);
