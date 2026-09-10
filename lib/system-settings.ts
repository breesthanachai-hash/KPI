import { desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { systemSettings, systemSettingsEvents } from "../db/schema";
import type { CurrentUser } from "./access-control";

export const GLOBAL_SYSTEM_SETTINGS_ID = "global";

export type SystemSettingsDto = {
  id: typeof GLOBAL_SYSTEM_SETTINGS_ID;
  revision: number;
  organization: {
    name: string;
    shortName: string;
  };
  experience: {
    navigationMode: "simple" | "full";
    adminHome: "overview" | "employees" | "work";
    managerHome: "overview" | "employees" | "work";
    employeeHome: "work" | "portfolio" | "peopleOps";
  };
  features: {
    aiAssistantEnabled: boolean;
    aiMascotEnabled: boolean;
    office3dEnabled: boolean;
    questRewardLinkingEnabled: boolean;
  };
  updatedAt: string;
  updatedByName: string;
};

export type PublicSystemSettingsDto = Omit<SystemSettingsDto, "id" | "updatedAt" | "updatedByName">;

export type SystemSettingsEventDto = {
  id: string;
  previousRevision: number;
  nextRevision: number;
  changedKeys: string[];
  actorName: string;
  createdAt: string;
};

type SystemSettingsRow = typeof systemSettings.$inferSelect;

export const defaultSystemSettings: SystemSettingsRow = {
  id: GLOBAL_SYSTEM_SETTINGS_ID,
  organizationName: "People Pulse",
  organizationShortName: "People Pulse",
  navigationMode: "simple",
  adminHome: "work",
  managerHome: "work",
  employeeHome: "work",
  aiAssistantEnabled: true,
  aiMascotEnabled: true,
  office3dEnabled: true,
  questRewardLinkingEnabled: true,
  revision: 0,
  updatedByUserId: "system",
  updatedByName: "ระบบ",
  updatedAt: "",
};

export function canManageSystemSettings(currentUser: Pick<CurrentUser, "id" | "role" | "status">) {
  return currentUser.id === "user-owner" && currentUser.role === "admin" && currentUser.status === "active";
}

export function systemSettingsDto(row: SystemSettingsRow): SystemSettingsDto {
  return {
    id: GLOBAL_SYSTEM_SETTINGS_ID,
    revision: row.revision,
    organization: {
      name: row.organizationName,
      shortName: row.organizationShortName,
    },
    experience: {
      navigationMode: row.navigationMode,
      adminHome: row.adminHome,
      managerHome: row.managerHome,
      employeeHome: row.employeeHome,
    },
    features: {
      aiAssistantEnabled: row.aiAssistantEnabled,
      aiMascotEnabled: row.aiMascotEnabled,
      office3dEnabled: row.office3dEnabled,
      questRewardLinkingEnabled: row.questRewardLinkingEnabled,
    },
    updatedAt: row.updatedAt,
    updatedByName: row.updatedByName,
  };
}

export function publicSystemSettingsDto(row: SystemSettingsRow): PublicSystemSettingsDto {
  const settings = systemSettingsDto(row);
  return {
    revision: settings.revision,
    organization: settings.organization,
    experience: settings.experience,
    features: settings.features,
  };
}

export function systemSettingsEventDto(row: typeof systemSettingsEvents.$inferSelect): SystemSettingsEventDto {
  return {
    id: row.id,
    previousRevision: row.previousRevision,
    nextRevision: row.nextRevision,
    changedKeys: row.changedKeys,
    actorName: row.actorName,
    createdAt: row.createdAt,
  };
}

export async function getSystemSettingsRow() {
  const db = getDb();
  const [settings] = await db.select().from(systemSettings).where(eq(systemSettings.id, GLOBAL_SYSTEM_SETTINGS_ID)).limit(1);
  if (!settings) throw new Error("SYSTEM_SETTINGS_NOT_INITIALIZED");
  return settings;
}

export async function getPublicSystemSettings() {
  return publicSystemSettingsDto(await getSystemSettingsRow());
}

export async function getSystemSettingsEvents(limit = 25) {
  const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit)));
  const db = getDb();
  const rows = await db.select().from(systemSettingsEvents)
    .where(eq(systemSettingsEvents.settingsId, GLOBAL_SYSTEM_SETTINGS_ID))
    .orderBy(desc(systemSettingsEvents.nextRevision))
    .limit(safeLimit);
  return rows.map(systemSettingsEventDto);
}
