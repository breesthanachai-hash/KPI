import { findRole } from "./kpi-data";

export const POSITION_REQUEST_FORMAT = "people-pulse-position-requests";
export const MAX_POSITION_REQUEST_FILE_BYTES = 256 * 1024;
export const MAX_POSITION_REQUEST_IMPORT = 100;
export type PositionRequestTransfer = {
  id: string;
  employee_id: string;
  previous_role_id: string;
  previous_position_title: string;
  expected_employee_updated_at: string;
  requested_role_id: string;
  requested_position_title: string;
  reason: string;
  requested_by: string;
  requested_by_name: string;
  created_at: string;
  status: "pending";
};
export type PositionRequestFile = {
  format: typeof POSITION_REQUEST_FORMAT;
  version: 1;
  requests: PositionRequestTransfer[];
};

export class PositionRequestError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PositionRequestError("รูปแบบข้อมูลไม่ถูกต้อง");
  return value as Record<string, unknown>;
}

export function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  if (Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(value, key))) {
    throw new PositionRequestError("ไฟล์มีข้อมูลนอกแบบคำขอหรือข้อมูลไม่ครบ ห้ามแนบข้อมูลบัญชีและข้อมูลลับ");
  }
}

export function textField(value: unknown, max: number, allowEmpty = false): string {
  if (typeof value !== "string" || /[\u0000-\u001f\u007f]/u.test(value)) throw new PositionRequestError("ข้อมูลข้อความไม่ถูกต้อง");
  const text = value.normalize("NFC").trim().replace(/\s+/g, " ");
  if ((!text && !allowEmpty) || Array.from(text).length > max) throw new PositionRequestError(`กรุณาระบุข้อมูลไม่เกิน ${max} ตัวอักษร`);
  return text;
}

function identifier(value: unknown) {
  const id = textField(value, 160);
  if (!/^[a-zA-Z0-9_.:-]+$/.test(id)) throw new PositionRequestError("รหัสอ้างอิงไม่ถูกต้อง");
  return id;
}

function timestamp(value: unknown) {
  const date = textField(value, 40);
  // Accept the pre-existing SQLite CURRENT_TIMESTAMP representation too.
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z| \d{2}:\d{2}:\d{2})$/.test(date) || !Number.isFinite(Date.parse(date))) {
    throw new PositionRequestError("วันเวลาในคำขอไม่ถูกต้อง");
  }
  return date;
}

const transferKeys = ["id", "employee_id", "previous_role_id", "previous_position_title", "expected_employee_updated_at", "requested_role_id", "requested_position_title", "reason", "requested_by", "requested_by_name", "created_at", "status"] as const;

export function parseTransfer(value: unknown): PositionRequestTransfer {
  const input = record(value);
  exactKeys(input, transferKeys);
  if (input.status !== "pending") throw new PositionRequestError("รับเฉพาะคำขอที่รออนุมัติ");
  const result: PositionRequestTransfer = {
    id: identifier(input.id), employee_id: identifier(input.employee_id),
    previous_role_id: identifier(input.previous_role_id),
    previous_position_title: textField(input.previous_position_title, 120, true),
    expected_employee_updated_at: timestamp(input.expected_employee_updated_at),
    requested_role_id: identifier(input.requested_role_id),
    requested_position_title: textField(input.requested_position_title, 120, true),
    reason: textField(input.reason, 1000),
    requested_by: identifier(input.requested_by), requested_by_name: textField(input.requested_by_name, 160),
    created_at: timestamp(input.created_at), status: "pending",
  };
  if (!findRole(result.requested_role_id)) throw new PositionRequestError("ไม่พบกรอบตำแหน่งใหม่ในระบบนี้");
  if (result.previous_role_id === result.requested_role_id && result.previous_position_title === result.requested_position_title) throw new PositionRequestError("ตำแหน่งใหม่ต้องต่างจากเดิม");
  return result;
}

export function parseRequestFile(value: unknown): PositionRequestFile {
  const file = record(value);
  exactKeys(file, ["format", "version", "requests"]);
  if (file.format !== POSITION_REQUEST_FORMAT || file.version !== 1 || !Array.isArray(file.requests) || !file.requests.length || file.requests.length > MAX_POSITION_REQUEST_IMPORT) {
    throw new PositionRequestError("รูปแบบไฟล์ไม่รองรับ หรือมีคำขอเกิน 100 รายการ");
  }
  const requests = file.requests.map(parseTransfer);
  if (new Set(requests.map(row => row.id)).size !== requests.length) throw new PositionRequestError("ไฟล์มีรหัสคำขอซ้ำ");
  return { format: POSITION_REQUEST_FORMAT, version: 1, requests };
}

// Explicit allowlist: never spread database rows into a downloadable file.
export function exportTransfer(row: PositionRequestTransfer): PositionRequestTransfer {
  return parseTransfer({
    id: row.id, employee_id: row.employee_id, previous_role_id: row.previous_role_id,
    previous_position_title: row.previous_position_title, expected_employee_updated_at: row.expected_employee_updated_at,
    requested_role_id: row.requested_role_id, requested_position_title: row.requested_position_title,
    reason: row.reason, requested_by: row.requested_by, requested_by_name: row.requested_by_name,
    created_at: row.created_at, status: row.status,
  });
}
