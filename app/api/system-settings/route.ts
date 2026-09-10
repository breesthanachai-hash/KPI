import { getD1 } from "../../../db";
import { authenticatedRequestGate, privateNoStoreHeaders } from "../../../lib/access-control";
import { internalApiError } from "../../../lib/api-errors";
import {
  GLOBAL_SYSTEM_SETTINGS_ID,
  canManageSystemSettings,
  getSystemSettingsEvents,
  getSystemSettingsRow,
  systemSettingsDto,
  type SystemSettingsDto,
  type SystemSettingsEventDto,
} from "../../../lib/system-settings";

export const dynamic = "force-dynamic";

const MAX_BODY_LENGTH = 16_384;
const navigationModes = new Set(["simple", "full"]);
const adminHomes = new Set(["overview", "employees", "work"]);
const managerHomes = new Set(["overview", "employees", "work"]);
const employeeHomes = new Set(["work", "portfolio", "peopleOps"]);

type SettingsInput = {
  action?: unknown;
  expectedRevision?: unknown;
  organization?: unknown;
  experience?: unknown;
  features?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedLabel(value: unknown) {
  if (typeof value !== "string") return "";
  return value.normalize("NFC").replace(/\0/g, "").trim().replace(/\s+/gu, " ");
}

function booleanValue(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

async function readSettingsInput(request: Request): Promise<SettingsInput | null | "too-large"> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_LENGTH) return "too-large";
  const raw = await request.text();
  if (raw.length > MAX_BODY_LENGTH) return "too-large";
  try {
    const value: unknown = JSON.parse(raw);
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function changedSettingKeys(previous: SystemSettingsDto, next: SystemSettingsDto) {
  const fields: Array<[string, unknown, unknown]> = [
    ["organization.name", previous.organization.name, next.organization.name],
    ["organization.shortName", previous.organization.shortName, next.organization.shortName],
    ["experience.navigationMode", previous.experience.navigationMode, next.experience.navigationMode],
    ["experience.adminHome", previous.experience.adminHome, next.experience.adminHome],
    ["experience.managerHome", previous.experience.managerHome, next.experience.managerHome],
    ["experience.employeeHome", previous.experience.employeeHome, next.experience.employeeHome],
    ["features.aiAssistantEnabled", previous.features.aiAssistantEnabled, next.features.aiAssistantEnabled],
    ["features.aiMascotEnabled", previous.features.aiMascotEnabled, next.features.aiMascotEnabled],
    ["features.office3dEnabled", previous.features.office3dEnabled, next.features.office3dEnabled],
    ["features.questRewardLinkingEnabled", previous.features.questRewardLinkingEnabled, next.features.questRewardLinkingEnabled],
  ];
  return fields.filter(([, before, after]) => before !== after).map(([key]) => key);
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("SYSTEM_SETTINGS_NOT_INITIALIZED") || message.includes("no such table: system_settings")) {
    return Response.json({ error: "การตั้งค่าระบบยังไม่พร้อม กรุณาเผยแพร่ฐานข้อมูลเวอร์ชันล่าสุด" }, { status: 503, headers: privateNoStoreHeaders });
  }
  if (
    message.includes("SYSTEM_SETTINGS_STALE")
    || message.includes("SYSTEM_SETTINGS_INVALID_REVISION")
    || message.includes("SYSTEM_SETTINGS_AUDIT_REQUIRED")
    || message.includes("SYSTEM_SETTINGS_NO_CHANGES")
    || message.includes("system_settings_events.settings_id, system_settings_events.next_revision")
  ) {
    return Response.json({ error: "การตั้งค่าถูกแก้ไขจากอีกหน้าจอ กรุณาโหลดค่าล่าสุดแล้วลองอีกครั้ง" }, { status: 409, headers: privateNoStoreHeaders });
  }
  if (message.includes("SYSTEM_SETTINGS_OWNER_REQUIRED")) {
    return Response.json({ error: "สิทธิ์เจ้าของระบบเปลี่ยนแปลง กรุณาเข้าสู่ระบบใหม่" }, { status: 403, headers: privateNoStoreHeaders });
  }
  if (
    message.includes("SYSTEM_SETTINGS_INVALID_ORGANIZATION")
    || message.includes("SYSTEM_SETTINGS_INVALID_EXPERIENCE")
    || message.includes("SYSTEM_SETTINGS_INVALID_FEATURES")
    || message.includes("SYSTEM_SETTINGS_EVENT_INVALID")
  ) {
    return Response.json({ error: "ข้อมูลการตั้งค่าไม่ผ่านเงื่อนไขของระบบ กรุณาตรวจสอบแล้วลองอีกครั้ง" }, { status: 400, headers: privateNoStoreHeaders });
  }
  return internalApiError(error, "จัดการการตั้งค่าระบบไม่สำเร็จ", "system-settings");
}

async function ownerGate(request: Request) {
  const authentication = await authenticatedRequestGate(request);
  if (authentication.response) return authentication;
  if (!canManageSystemSettings(authentication.currentUser)) {
    return {
      response: Response.json(
        { error: "เฉพาะบัญชีเจ้าของระบบที่มีสิทธิ์สูงสุดเท่านั้น" },
        { status: 403, headers: privateNoStoreHeaders },
      ),
    };
  }
  return authentication;
}

export async function GET(request: Request) {
  try {
    const authentication = await ownerGate(request);
    if (authentication.response) return authentication.response;
    const [settings, auditEvents] = await Promise.all([
      getSystemSettingsRow(),
      getSystemSettingsEvents(),
    ]);
    return Response.json({ settings: systemSettingsDto(settings), auditEvents }, { headers: privateNoStoreHeaders });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const authentication = await ownerGate(request);
    if (authentication.response) return authentication.response;
    const currentUser = authentication.currentUser;
    const payload = await readSettingsInput(request);
    if (payload === "too-large") {
      return Response.json({ error: "ข้อมูลการตั้งค่ามีขนาดใหญ่เกินไป" }, { status: 413, headers: privateNoStoreHeaders });
    }
    if (!payload || payload.action !== "saveSystemSettings") {
      return Response.json({ error: "คำขอบันทึกการตั้งค่าไม่ถูกต้อง" }, { status: 400, headers: privateNoStoreHeaders });
    }
    if (!Number.isSafeInteger(payload.expectedRevision) || (payload.expectedRevision as number) < 0) {
      return Response.json({ error: "ข้อมูลเวอร์ชันการตั้งค่าไม่ครบ กรุณาโหลดค่าล่าสุด" }, { status: 400, headers: privateNoStoreHeaders });
    }
    if (!isRecord(payload.organization) || !isRecord(payload.experience) || !isRecord(payload.features)) {
      return Response.json({ error: "กรุณากรอกการตั้งค่าให้ครบทุกหมวด" }, { status: 400, headers: privateNoStoreHeaders });
    }

    const organizationName = normalizedLabel(payload.organization.name);
    const organizationShortName = normalizedLabel(payload.organization.shortName);
    const navigationMode = payload.experience.navigationMode;
    const adminHome = payload.experience.adminHome;
    const managerHome = payload.experience.managerHome;
    const employeeHome = payload.experience.employeeHome;
    const aiAssistantEnabled = booleanValue(payload.features.aiAssistantEnabled);
    const aiMascotEnabled = booleanValue(payload.features.aiMascotEnabled);
    const office3dEnabled = booleanValue(payload.features.office3dEnabled);
    const questRewardLinkingEnabled = booleanValue(payload.features.questRewardLinkingEnabled);

    if (Array.from(organizationName).length < 2 || Array.from(organizationName).length > 80) {
      return Response.json({ error: "ชื่อองค์กรต้องมี 2–80 ตัวอักษร" }, { status: 400, headers: privateNoStoreHeaders });
    }
    if (Array.from(organizationShortName).length < 2 || Array.from(organizationShortName).length > 30) {
      return Response.json({ error: "ชื่อย่อองค์กรต้องมี 2–30 ตัวอักษร" }, { status: 400, headers: privateNoStoreHeaders });
    }
    if (!navigationModes.has(String(navigationMode)) || !adminHomes.has(String(adminHome)) || !managerHomes.has(String(managerHome)) || !employeeHomes.has(String(employeeHome))) {
      return Response.json({ error: "หน้าหลักหรือรูปแบบเมนูไม่อยู่ในรายการที่ระบบรองรับ" }, { status: 400, headers: privateNoStoreHeaders });
    }
    if (aiAssistantEnabled === null || aiMascotEnabled === null || office3dEnabled === null || questRewardLinkingEnabled === null) {
      return Response.json({ error: "สถานะฟีเจอร์ไม่ถูกต้อง" }, { status: 400, headers: privateNoStoreHeaders });
    }
    if (aiMascotEnabled && !aiAssistantEnabled) {
      return Response.json({ error: "ต้องเปิดผู้ช่วย AI ก่อนจึงจะแสดงหุ่นยนต์ผู้ช่วยได้" }, { status: 400, headers: privateNoStoreHeaders });
    }

    const current = await getSystemSettingsRow();
    const expectedRevision = payload.expectedRevision as number;
    if (current.revision !== expectedRevision) {
      return Response.json({ error: "การตั้งค่าถูกแก้ไขจากอีกหน้าจอ กรุณาโหลดค่าล่าสุดแล้วลองอีกครั้ง" }, { status: 409, headers: privateNoStoreHeaders });
    }
    const previousDto = systemSettingsDto(current);
    const previousTime = Date.parse(current.updatedAt);
    const now = new Date(Math.max(Date.now(), Number.isFinite(previousTime) ? previousTime + 1 : 0)).toISOString();
    const nextRevision = current.revision + 1;
    const nextDto: SystemSettingsDto = {
      id: GLOBAL_SYSTEM_SETTINGS_ID,
      revision: nextRevision,
      organization: { name: organizationName, shortName: organizationShortName },
      experience: {
        navigationMode: navigationMode as SystemSettingsDto["experience"]["navigationMode"],
        adminHome: adminHome as SystemSettingsDto["experience"]["adminHome"],
        managerHome: managerHome as SystemSettingsDto["experience"]["managerHome"],
        employeeHome: employeeHome as SystemSettingsDto["experience"]["employeeHome"],
      },
      features: { aiAssistantEnabled, aiMascotEnabled, office3dEnabled, questRewardLinkingEnabled },
      updatedAt: now,
      updatedByName: currentUser.authenticatedName,
    };
    const changedKeys = changedSettingKeys(previousDto, nextDto);
    if (!changedKeys.length) {
      return Response.json({ settings: previousDto, auditEvent: null, unchanged: true }, { headers: privateNoStoreHeaders });
    }

    const eventId = `system-settings-event-${crypto.randomUUID()}`;
    const event: SystemSettingsEventDto = {
      id: eventId,
      previousRevision: current.revision,
      nextRevision,
      changedKeys,
      actorName: currentUser.authenticatedName,
      createdAt: now,
    };
    const d1 = getD1();
    await d1.batch([
      d1.prepare(`INSERT INTO system_settings_events (
        id, settings_id, previous_revision, next_revision, expected_updated_at, resulting_updated_at,
        previous_snapshot, next_snapshot, changed_keys, actor_user_id, actor_name, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          eventId, GLOBAL_SYSTEM_SETTINGS_ID, current.revision, nextRevision, current.updatedAt, now,
          JSON.stringify(previousDto), JSON.stringify(nextDto), JSON.stringify(changedKeys),
          currentUser.id, currentUser.authenticatedName, now,
        ),
      d1.prepare(`UPDATE system_settings SET
        organization_name = ?, organization_short_name = ?, navigation_mode = ?,
        admin_home = ?, manager_home = ?, employee_home = ?,
        ai_assistant_enabled = ?, ai_mascot_enabled = ?, office_3d_enabled = ?, quest_reward_linking_enabled = ?,
        revision = ?, updated_by_user_id = ?, updated_by_name = ?, updated_at = ?
        WHERE id = ? AND revision = ? AND updated_at = ?`)
        .bind(
          organizationName, organizationShortName, navigationMode,
          adminHome, managerHome, employeeHome,
          aiAssistantEnabled ? 1 : 0, aiMascotEnabled ? 1 : 0, office3dEnabled ? 1 : 0, questRewardLinkingEnabled ? 1 : 0,
          nextRevision, currentUser.id, currentUser.authenticatedName, now,
          GLOBAL_SYSTEM_SETTINGS_ID, current.revision, current.updatedAt,
        ),
    ]);
    return Response.json({ settings: nextDto, auditEvent: event }, { headers: privateNoStoreHeaders });
  } catch (error) {
    return errorResponse(error);
  }
}
