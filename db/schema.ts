import { sql } from "drizzle-orm";
import { index, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const employees = sqliteTable("employees", {
  id: text("id").primaryKey(),
  initials: text("initials").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  roleId: text("role_id").notNull(),
  manager: text("manager").notNull().default(""),
  status: text("status", { enum: ["active", "inactive"] }).notNull().default("active"),
  latestScore: real("latest_score"),
  latestSkillScore: real("latest_skill_score"),
  latestPeriod: text("latest_period"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("employees_email_unique").on(table.email),
  index("employees_role_idx").on(table.roleId),
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

export const hrProfiles = sqliteTable("hr_profiles", {
  employeeId: text("employee_id").primaryKey().references(() => employees.id, { onDelete: "cascade" }),
  currentSalary: real("current_salary").notNull().default(0),
  salaryReviewMonth: text("salary_review_month").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

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
