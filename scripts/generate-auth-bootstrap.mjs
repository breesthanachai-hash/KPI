import { createHmac, pbkdf2Sync, randomBytes } from "node:crypto";

const PASSWORD_ALGORITHM = "pbkdf2-sha256";
const PASSWORD_ITERATIONS = 600_000;
const PEPPER_VERSION = 1;
const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() ?? "" : "";
}

function fail(message) {
  process.stderr.write(`สร้างข้อมูลเริ่มต้นไม่สำเร็จ: ${message}\n`);
  process.exitCode = 1;
}

function randomPassword(length = 20) {
  const output = [];
  while (output.length < length) {
    const [value] = randomBytes(1);
    const safeRange = 256 - (256 % PASSWORD_ALPHABET.length);
    if (value >= safeRange) continue;
    output.push(PASSWORD_ALPHABET[value % PASSWORD_ALPHABET.length]);
  }
  return output.join("");
}

function verifier(password, pepper) {
  const salt = randomBytes(16);
  const pepperedPassword = createHmac("sha256", pepper)
    .update(password.normalize("NFC"), "utf8")
    .digest();
  const hash = pbkdf2Sync(pepperedPassword, salt, PASSWORD_ITERATIONS, 32, "sha256");
  return [
    PASSWORD_ALGORITHM,
    PASSWORD_ITERATIONS,
    PEPPER_VERSION,
    salt.toString("base64url"),
    hash.toString("base64url"),
  ].join("$");
}

if (process.argv.includes("--help")) {
  process.stdout.write([
    "สร้างรหัสชั่วคราวและค่าเริ่มต้นสำหรับระบบ ID + รหัสผ่าน",
    "",
    "วิธีใช้:",
    "  npm run auth:bootstrap -- --login-id admin --email owner@example.com --name \"ชื่อผู้ดูแล\"",
    "",
    "สคริปต์จะสุ่มรหัสผ่านและ secrets ให้เอง และจะไม่รับรหัสผ่านผ่าน command line",
  ].join("\n"));
  process.exit(0);
}

const loginId = argument("--login-id") || "admin";
const email = argument("--email").toLowerCase();
const displayName = argument("--name") || "ผู้ดูแลระบบ";

if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(loginId.toLowerCase())) {
  fail("--login-id ต้องยาว 3–64 ตัว และใช้เฉพาะ a-z, 0-9, จุด, ขีดกลาง หรือขีดล่าง");
} else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  fail("กรุณาระบุ --email ของผู้ดูแลให้ถูกต้อง");
} else if (displayName.length > 120) {
  fail("--name ต้องไม่เกิน 120 ตัวอักษร");
} else {
  const temporaryPassword = randomPassword();
  const pepper = randomBytes(48).toString("base64url");
  const rateLimitSecret = randomBytes(48).toString("base64url");
  const passwordVerifier = verifier(temporaryPassword, pepper);

  process.stdout.write(`${JSON.stringify({
    warning: "เก็บข้อมูลนี้ในตัวจัดการรหัสผ่านและแสดงรหัสชั่วคราวเพียงครั้งเดียว ห้าม commit ลง Git",
    login: {
      loginId: loginId.toLowerCase(),
      temporaryPassword,
      mustChangePasswordOnFirstLogin: true,
    },
    environment: [
      { key: "PEOPLE_PULSE_BOOTSTRAP_LOGIN_ID", value: loginId.toLowerCase(), secret: false },
      { key: "PEOPLE_PULSE_BOOTSTRAP_PASSWORD_HASH", value: passwordVerifier, secret: true },
      { key: "PEOPLE_PULSE_BOOTSTRAP_ADMIN_EMAIL", value: email, secret: false },
      { key: "PEOPLE_PULSE_BOOTSTRAP_ADMIN_NAME", value: displayName, secret: false },
      { key: "PEOPLE_PULSE_PASSWORD_PEPPER_VERSION", value: String(PEPPER_VERSION), secret: false },
      { key: `PEOPLE_PULSE_PASSWORD_PEPPER_V${PEPPER_VERSION}`, value: pepper, secret: true },
      { key: "PEOPLE_PULSE_RATE_LIMIT_SECRET", value: rateLimitSecret, secret: true },
    ],
  }, null, 2)}\n`);
}
