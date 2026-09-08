export const MIN_NUMERIC_PIN_LENGTH = 6;
export const MIN_GENERAL_PASSWORD_LENGTH = 6;
export const MAX_NEW_PASSWORD_LENGTH = 15;

function normalizedPassword(value) {
  return value.normalize("NFC");
}

export function passwordUsesNumericPinPolicy(value) {
  return /^[0-9]+$/.test(normalizedPassword(value));
}

export function passwordMeetsMinimum(value) {
  const normalized = normalizedPassword(value);
  const length = [...normalized].length;
  return passwordUsesNumericPinPolicy(normalized)
    ? length >= MIN_NUMERIC_PIN_LENGTH
    : length >= MIN_GENERAL_PASSWORD_LENGTH;
}

export function passwordMinimumError(value) {
  if (passwordMeetsMinimum(value)) return "";
  return `รหัสผ่านต้องมีอย่างน้อย ${MIN_GENERAL_PASSWORD_LENGTH} ตัวอักษร`;
}
