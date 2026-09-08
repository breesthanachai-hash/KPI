import { pbkdf2 } from "node:crypto";
import { MAX_NEW_PASSWORD_LENGTH, MIN_GENERAL_PASSWORD_LENGTH, passwordMinimumError } from "./password-policy.js";

export const LEGACY_PASSWORD_ALGORITHM = "pbkdf2-sha256" as const;
export const PASSWORD_ALGORITHM = "pbkdf2-sha256-chain-v1" as const;
export const LEGACY_PASSWORD_ITERATIONS = 100_000;
export const PASSWORD_ITERATIONS = 600_000;
export const PASSWORD_STAGE_ITERATIONS = 100_000;
export const PASSWORD_STAGE_COUNT = PASSWORD_ITERATIONS / PASSWORD_STAGE_ITERATIONS;
export const MAX_PASSWORD_ITERATIONS = PASSWORD_ITERATIONS;
export const MIN_PASSWORD_LENGTH = MIN_GENERAL_PASSWORD_LENGTH;
export const MAX_PASSWORD_LENGTH = 256;
export const MAX_PASSWORD_BYTES = 1024;
export const MAX_REGISTRATION_PASSWORD_LENGTH = MAX_NEW_PASSWORD_LENGTH;

const PASSWORD_HASH_BYTES = 32;
const PASSWORD_SALT_BYTES = 16;
const DEFAULT_PEPPER_VERSION = 1;
const encoder = new TextEncoder();

export class AuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthConfigurationError";
  }
}

export type PasswordVerifier = {
  passwordHash: string;
  passwordSalt: string;
  passwordAlgorithm: typeof PASSWORD_ALGORITHM | typeof LEGACY_PASSWORD_ALGORITHM;
  passwordIterations: number;
  pepperVersion: number;
};

export function canonicalizeLoginId(value: string) {
  return value.normalize("NFKC").trim().toLowerCase();
}

export function validateLoginId(value: string) {
  const canonical = canonicalizeLoginId(value);
  if (canonical.length < 3 || canonical.length > 64) return null;
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(canonical)) return null;
  return canonical;
}

export function passwordValidationError(password: string) {
  const normalized = password.normalize("NFC");
  const length = [...normalized].length;
  const byteLength = encoder.encode(normalized).byteLength;
  if (!normalized.trim()) return "กรุณากรอกรหัสผ่าน";
  const minimumError = passwordMinimumError(normalized);
  if (minimumError) return minimumError;
  if (length > MAX_NEW_PASSWORD_LENGTH) return `รหัสผ่านต้องไม่เกิน ${MAX_NEW_PASSWORD_LENGTH} ตัวอักษร`;
  if (byteLength > MAX_PASSWORD_BYTES) return "รหัสผ่านยาวเกินขนาดที่ระบบรองรับ";
  return null;
}

export function passwordInputIsWithinLimit(password: string) {
  const normalized = password.normalize("NFC");
  return [...normalized].length <= MAX_PASSWORD_LENGTH && encoder.encode(normalized).byteLength <= MAX_PASSWORD_BYTES;
}

export async function hashPassword(password: string): Promise<PasswordVerifier> {
  const validationError = passwordValidationError(password);
  if (validationError) throw new RangeError(validationError);
  return createPasswordVerifier(password);
}

export async function hashTemporaryOwnerRecoveryPassword(password: string): Promise<PasswordVerifier> {
  const normalized = password.normalize("NFC");
  if (!/^\d{4}$/.test(normalized)) {
    throw new RangeError("รหัสกู้บัญชีเจ้าของต้องเป็นตัวเลข 4 หลักและใช้ได้เพียงครั้งเดียว");
  }
  return createPasswordVerifier(normalized);
}

async function createPasswordVerifier(password: string): Promise<PasswordVerifier> {
  const pepperVersion = currentPepperVersion();
  const passwordSalt = randomToken(PASSWORD_SALT_BYTES);
  const passwordHash = await derivePasswordHash(password, passwordSalt, PASSWORD_ALGORITHM, PASSWORD_ITERATIONS, pepperVersion);
  return { passwordHash, passwordSalt, passwordAlgorithm: PASSWORD_ALGORITHM, passwordIterations: PASSWORD_ITERATIONS, pepperVersion };
}

export function registrationPasswordValidationError(password: string) {
  const normalized = password.normalize("NFC");
  if (!normalized.trim()) return "กรุณากรอกรหัสผ่าน";
  const minimumError = passwordMinimumError(normalized);
  if (minimumError) return minimumError;
  if ([...normalized].length > MAX_REGISTRATION_PASSWORD_LENGTH) return "รหัสผ่านสำหรับสมัครสมาชิกต้องไม่เกิน 15 ตัวอักษร";
  return null;
}

export async function hashRegistrationPassword(password: string): Promise<PasswordVerifier> {
  const validationError = registrationPasswordValidationError(password);
  if (validationError) throw new RangeError(validationError);
  const pepperVersion = currentPepperVersion();
  const passwordSalt = randomToken(PASSWORD_SALT_BYTES);
  const passwordHash = await derivePasswordHash(password, passwordSalt, PASSWORD_ALGORITHM, PASSWORD_ITERATIONS, pepperVersion);
  return { passwordHash, passwordSalt, passwordAlgorithm: PASSWORD_ALGORITHM, passwordIterations: PASSWORD_ITERATIONS, pepperVersion };
}

export async function verifyPassword(password: string, verifier: PasswordVerifier) {
  if (!passwordInputIsWithinLimit(password)) return false;
  if (!passwordVerifierIsSupported(verifier.passwordAlgorithm, verifier.passwordIterations)) {
    await dummyVerifyPassword(password);
    return false;
  }
  const storedHash = decodeBase64Url(verifier.passwordHash);
  const salt = decodeBase64Url(verifier.passwordSalt);
  if (storedHash?.byteLength !== PASSWORD_HASH_BYTES || !salt || salt.byteLength < PASSWORD_SALT_BYTES) {
    await dummyVerifyPassword(password);
    return false;
  }
  const calculated = decodeBase64Url(await derivePasswordHash(
    password,
    verifier.passwordSalt,
    verifier.passwordAlgorithm,
    verifier.passwordIterations,
    verifier.pepperVersion,
  ));
  return Boolean(calculated && timingSafeEqual(calculated, storedHash));
}

export async function dummyVerifyPassword(password: string) {
  if (!passwordInputIsWithinLimit(password)) return false;
  const dummySalt = "cGVvcGxlLXB1bHNlLWR1bW15LXNhbHQ";
  const calculated = decodeBase64Url(await derivePasswordHash(
    password,
    dummySalt,
    PASSWORD_ALGORITHM,
    PASSWORD_ITERATIONS,
    currentPepperVersion(),
  ));
  const impossibleHash = new Uint8Array(PASSWORD_HASH_BYTES);
  return Boolean(calculated && timingSafeEqual(calculated, impossibleHash) && false);
}

export function serializePasswordVerifier(verifier: PasswordVerifier) {
  return [
    verifier.passwordAlgorithm,
    String(verifier.passwordIterations),
    String(verifier.pepperVersion),
    verifier.passwordSalt,
    verifier.passwordHash,
  ].join("$");
}

export function parsePasswordVerifier(value: string): PasswordVerifier | null {
  const [passwordAlgorithm, iterationsRaw, pepperVersionRaw, passwordSalt, passwordHash, extra] = value.trim().split("$");
  const passwordIterations = Number(iterationsRaw);
  const pepperVersion = Number(pepperVersionRaw);
  if (
    extra !== undefined
    || !passwordVerifierIsSupported(passwordAlgorithm, passwordIterations)
    || !Number.isInteger(pepperVersion)
    || pepperVersion < 1
  ) return null;
  const salt = decodeBase64Url(passwordSalt ?? "");
  const hash = decodeBase64Url(passwordHash ?? "");
  if (!salt || salt.byteLength < PASSWORD_SALT_BYTES || hash?.byteLength !== PASSWORD_HASH_BYTES) return null;
  return {
    passwordAlgorithm: passwordAlgorithm as PasswordVerifier["passwordAlgorithm"],
    passwordIterations,
    pepperVersion,
    passwordSalt,
    passwordHash,
  };
}

export function randomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return encodeBase64Url(bytes);
}

export async function hashOpaqueToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return encodeBase64Url(new Uint8Array(digest));
}

export async function privateLookupHash(purpose: string, value: string) {
  const secret = process.env.PEOPLE_PULSE_RATE_LIMIT_SECRET?.trim() ?? "";
  if (secret.length < 32) throw new AuthConfigurationError("Rate-limit lookup secret is missing or too short.");
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${purpose}\u0000${value}`));
  return encodeBase64Url(new Uint8Array(signature));
}

async function derivePasswordHash(
  password: string,
  saltEncoded: string,
  algorithm: PasswordVerifier["passwordAlgorithm"],
  iterations: number,
  pepperVersion: number,
) {
  if (!passwordVerifierIsSupported(algorithm, iterations)) {
    throw new AuthConfigurationError("Password verifier is unsupported on this platform.");
  }
  const salt = decodeBase64Url(saltEncoded);
  if (!salt) throw new AuthConfigurationError("Password salt is invalid.");
  const pepper = passwordPepper(pepperVersion);
  const pepperKey = await crypto.subtle.importKey("raw", encoder.encode(pepper), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const pepperedPassword = await crypto.subtle.sign("HMAC", pepperKey, encoder.encode(password.normalize("NFC")));
  const derived = algorithm === LEGACY_PASSWORD_ALGORITHM
    ? await derivePbkdf2WithNodeCrypto(new Uint8Array(pepperedPassword), salt, LEGACY_PASSWORD_ITERATIONS)
    : await deriveChainedPbkdf2(new Uint8Array(pepperedPassword), salt);
  return encodeBase64Url(derived);
}

function passwordVerifierIsSupported(algorithm: string, iterations: number) {
  return Number.isInteger(iterations) && (
    (algorithm === LEGACY_PASSWORD_ALGORITHM && iterations === LEGACY_PASSWORD_ITERATIONS)
    || (algorithm === PASSWORD_ALGORITHM && iterations === PASSWORD_ITERATIONS)
  );
}

async function deriveChainedPbkdf2(password: Uint8Array, salt: Uint8Array) {
  let stageInput = password;
  for (let stage = 0; stage < PASSWORD_STAGE_COUNT; stage += 1) {
    const stageSalt = new Uint8Array(salt.byteLength + 4);
    stageSalt.set(salt);
    new DataView(stageSalt.buffer).setUint32(salt.byteLength, stage + 1, false);
    stageInput = await derivePbkdf2WithNodeCrypto(
      stageInput,
      stageSalt,
      PASSWORD_STAGE_ITERATIONS,
    );
  }
  return stageInput;
}

function derivePbkdf2WithNodeCrypto(password: Uint8Array, salt: Uint8Array, iterations: number) {
  return new Promise<Uint8Array>((resolve, reject) => {
    pbkdf2(password, salt, iterations, PASSWORD_HASH_BYTES, "sha256", (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(new Uint8Array(derivedKey));
    });
  });
}

function currentPepperVersion() {
  const configured = Number(process.env.PEOPLE_PULSE_PASSWORD_PEPPER_VERSION ?? DEFAULT_PEPPER_VERSION);
  if (!Number.isInteger(configured) || configured < 1 || configured > 9999) throw new AuthConfigurationError("Password pepper version is invalid.");
  return configured;
}

function passwordPepper(version: number) {
  const versioned = process.env[`PEOPLE_PULSE_PASSWORD_PEPPER_V${version}`]?.trim();
  const legacy = version === DEFAULT_PEPPER_VERSION ? process.env.PEOPLE_PULSE_PASSWORD_PEPPER?.trim() : "";
  const pepper = versioned || legacy || "";
  if (pepper.length < 32) throw new AuthConfigurationError(`Password pepper V${version} is missing or too short.`);
  return pepper;
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(base64);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.byteLength !== right.byteLength) return false;
  const subtle = crypto.subtle as SubtleCrypto & { timingSafeEqual?: (a: ArrayBufferView, b: ArrayBufferView) => boolean };
  if (typeof subtle.timingSafeEqual === "function") return subtle.timingSafeEqual(left, right);
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}
