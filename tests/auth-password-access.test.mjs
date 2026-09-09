import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = new URL("../", import.meta.url);

function source(path) {
  return readFile(new URL(path, projectRoot), "utf8");
}

function handlerSource(route, method) {
  const start = route.indexOf(`export async function ${method}(request: Request)`);
  assert.notEqual(start, -1, `expected an exported ${method} handler`);
  const next = route.indexOf("export async function ", start + 1);
  return route.slice(start, next === -1 ? route.length : next);
}

function assertBefore(block, first, second, label) {
  const firstIndex = block.search(first);
  const secondIndex = block.search(second);
  assert.ok(firstIndex >= 0, `${label}: expected ${first}`);
  assert.ok(secondIndex >= 0, `${label}: expected ${second}`);
  assert.ok(firstIndex < secondIndex, `${label}: the guard must run before the protected operation`);
}

test("password policy accepts any 6–15 character password across account flows", async () => {
  const [policy, cryptoSource, authUi, page, authService] = await Promise.all([
    source("lib/password-policy.js"),
    source("lib/password-crypto.ts"),
    source("app/auth-ui.tsx"),
    source("app/page.tsx"),
    source("lib/auth-service.ts"),
  ]);
  const policyModule = new URL("../lib/password-policy.js", import.meta.url).href;
  const script = `
    import { passwordMeetsMinimum, passwordMinimumError } from ${JSON.stringify(policyModule)};
    process.stdout.write(JSON.stringify({
      pin6: passwordMeetsMinimum("123456"),
      pin5: passwordMeetsMinimum("12345"),
      general6: passwordMeetsMinimum("Ab!123"),
      general5: passwordMeetsMinimum("Ab!12"),
      pinError: passwordMinimumError("12345"),
      generalError: passwordMinimumError("Ab!12"),
    }));
  `;
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "--eval", script], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr || "password policy must execute");
  assert.deepEqual(JSON.parse(result.stdout), {
    pin6: true,
    pin5: false,
    general6: true,
    general5: false,
    pinError: "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร",
    generalError: "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร",
  });
  assert.match(policy, /MIN_NUMERIC_PIN_LENGTH = 6/);
  assert.match(policy, /MIN_GENERAL_PASSWORD_LENGTH = 6/);
  assert.match(policy, /MAX_NEW_PASSWORD_LENGTH = 15/);
  assert.match(cryptoSource, /passwordMinimumError\(normalized\)/);
  assert.match(cryptoSource, /length > MAX_NEW_PASSWORD_LENGTH/);
  assert.match(authUi, /ความยาว 6–15 ตัวอักษร/);
  assert.match(page, /passwordMeetsMinimum\(temporaryPassword\)/);
  assert.match(page, /maxLength=\{MAX_NEW_PASSWORD_LENGTH\}/);
  assert.match(authService, /รหัสผ่านชั่วคราวอย่างน้อย 6 ตัวอักษร/);
});

test("owner recovery is expiring, single-use and can safely reset to one owner account", async () => {
  const [accessControl, cryptoSource, loginRoute, readme] = await Promise.all([
    source("lib/access-control.ts"),
    source("lib/password-crypto.ts"),
    source("app/api/auth/login/route.ts"),
    source("README.md"),
  ]);
  const recovery = accessControl.slice(
    accessControl.indexOf("export async function ensureOwnerRecoveryCredential"),
    accessControl.indexOf("async function initializeBootstrapAccounts"),
  );
  assert.match(recovery, /PEOPLE_PULSE_OWNER_RECOVERY_ID/);
  assert.match(recovery, /PEOPLE_PULSE_OWNER_RECOVERY_PASSWORD/);
  assert.match(recovery, /PEOPLE_PULSE_OWNER_RECOVERY_EXPIRES_AT/);
  assert.match(recovery, /PEOPLE_PULSE_OWNER_RECOVERY_PURGE_OTHER_USERS/);
  assert.match(recovery, /expiresAtTime <= Date\.now\(\)/);
  assert.match(recovery, /purgeOtherUsersValue && !purgeOtherUsers\)\) \{\s*return;/);
  assert.match(recovery, /expiresAtTime <= Date\.now\(\)\) \{\s*return;/);
  assert.match(recovery, /if \(validationError\) return;/);
  assert.doesNotMatch(recovery, /configuration is incomplete|configuration has expired/, "a stale partial recovery environment must never block ordinary login");
  assert.match(recovery, /credential-mutation:owner-recovery:/);
  assert.match(recovery, /eq\(authEvents\.id, claimId\)/);
  assert.match(recovery, /eq\(authCredentials\.credentialVersion, credential\.credentialVersion\)/);
  assert.match(recovery, /mustChangePassword: true/);
  assert.match(recovery, /failedAttempts: 0/);
  assert.match(recovery, /lockedUntil: null/);
  assert.match(recovery, /revokeReason: "owner-password-recovery"/);
  assert.match(recovery, /db\.delete\(authRateLimits\)/);
  assert.match(recovery, /hashTemporaryOwnerRecoveryPassword\(recoveryPassword\)/);
  assert.match(recovery, /db\.delete\(userAccounts\)\.where\(ne\(userAccounts\.id, owner\.id\)\)/);
  assert.match(recovery, /loginId: ownerLoginId/);
  assert.match(recovery, /loginIdCanonical: ownerLoginIdCanonical/);
  assert.doesNotMatch(recovery, /db\.delete\(employees\)/, "account cleanup must preserve employee and work history");
  assert.match(cryptoSource, /export async function hashTemporaryOwnerRecoveryPassword[\s\S]*?\/\^\\d\{4\}\$\//);
  assert.doesNotMatch(recovery, /Response\.json|console\.|temporaryPassword/);
  assertBefore(loginRoute, /ensureOwnerRecoveryCredential\(\)/, /readBoundedLoginPayload\(request\)/, "owner recovery");
  assert.match(readme, /กู้บัญชีแบบครั้งเดียว/);
});

test("bootstrap output is compatible with the real PBKDF2 verifier and keeps independent secrets", { timeout: 30_000 }, async () => {
  const bootstrapScript = await source("scripts/generate-auth-bootstrap.mjs");
  const generated = spawnSync(process.execPath, [
    fileURLToPath(new URL("../scripts/generate-auth-bootstrap.mjs", import.meta.url)),
    "--login-id", "Owner.Admin",
    "--email", "owner@example.com",
    "--name", "ผู้ดูแลทดสอบ",
  ], { encoding: "utf8", maxBuffer: 1024 * 1024 });

  assert.equal(generated.status, 0, generated.stderr || "bootstrap generator must exit successfully");
  const output = JSON.parse(generated.stdout);
  const environment = Object.fromEntries(output.environment.map(({ key, value }) => [key, value]));
  assert.equal(output.mode, "initial-bootstrap");
  assert.equal(output.login.loginId, "owner.admin");
  assert.match(output.login.temporaryPassword, /^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%]{15}$/);
  assert.equal(output.login.mustChangePasswordOnFirstLogin, true);
  assert.equal(environment.PEOPLE_PULSE_PASSWORD_PEPPER_VERSION, "1");
  assert.ok(environment.PEOPLE_PULSE_PASSWORD_PEPPER_V1.length >= 32);
  assert.ok(environment.PEOPLE_PULSE_RATE_LIMIT_SECRET.length >= 32);
  assert.notEqual(environment.PEOPLE_PULSE_PASSWORD_PEPPER_V1, environment.PEOPLE_PULSE_RATE_LIMIT_SECRET);
  assert.match(environment.PEOPLE_PULSE_BOOTSTRAP_PASSWORD_HASH, /^pbkdf2-sha256-chain-v1\$600000\$1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
  assert.doesNotMatch(bootstrapScript, /argument\(["']--password["']\)/);
  assert.match(bootstrapScript, /จะไม่รับรหัสผ่านผ่าน command line/);

  const refusedRepair = spawnSync(process.execPath, [
    fileURLToPath(new URL("../scripts/generate-auth-bootstrap.mjs", import.meta.url)),
    "--repair-existing",
    "--login-id", "Owner.Admin",
    "--email", "owner@example.com",
    "--name", "ผู้ดูแลทดสอบ",
  ], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    env: {
      ...process.env,
      PEOPLE_PULSE_PASSWORD_PEPPER_VERSION: "1",
      PEOPLE_PULSE_PASSWORD_PEPPER_V1: environment.PEOPLE_PULSE_PASSWORD_PEPPER_V1,
    },
  });
  assert.notEqual(refusedRepair.status, 0);
  assert.equal(refusedRepair.stdout, "", "retired repair mode must not emit a replacement verifier or secrets");
  assert.match(refusedRepair.stderr, /ยกเลิก --repair-existing[ๆ\s\S]*?รหัสชั่วคราวเดิม[ๆ\s\S]*?บังคับเปลี่ยนรหัส/);

  const cryptoModule = new URL("../lib/password-crypto.ts", import.meta.url).href;
  const verificationScript = `
    import {
      AuthConfigurationError,
      LEGACY_PASSWORD_ITERATIONS,
      MAX_PASSWORD_ITERATIONS,
      PASSWORD_ITERATIONS,
      canonicalizeLoginId,
      hashOpaqueToken,
      hashPassword,
      parsePasswordVerifier,
      privateLookupHash,
      randomToken,
      serializePasswordVerifier,
      verifyPassword,
    } from ${JSON.stringify(cryptoModule)};

    const password = process.env.AUTH_TEST_PASSWORD;
    const serialized = process.env.AUTH_TEST_VERIFIER;
    const parsed = parsePasswordVerifier(serialized);
    const correct = parsed ? await verifyPassword(password, parsed) : false;
    const wrong = parsed ? await verifyPassword(password + "x", parsed) : true;
    const legacyParsed = parsePasswordVerifier(process.env.AUTH_TEST_LEGACY_VERIFIER);
    const unsupportedIterationsRejected = [99999, 100001, 599999, 600001].every((iterations) => (
      parsePasswordVerifier(serialized.replace("$600000$", \`$\${iterations}$\`)) === null
    ));
    const runtimeVerifier = await hashPassword(password);
    const runtimeRoundTrip = parsePasswordVerifier(serializePasswordVerifier(runtimeVerifier));
    const runtimeCorrect = runtimeRoundTrip ? await verifyPassword(password, runtimeRoundTrip) : false;
    const token = randomToken(32);
    const tokenHash = await hashOpaqueToken(token);
    const loginLookup = await privateLookupHash("login-rate-login-id", "owner.admin");
    const sourceLookup = await privateLookupHash("login-rate-source", "203.0.113.10");

    delete process.env.PEOPLE_PULSE_RATE_LIMIT_SECRET;
    let missingRateSecret = false;
    try { await privateLookupHash("test", "value"); } catch (error) { missingRateSecret = error instanceof AuthConfigurationError; }
    delete process.env.PEOPLE_PULSE_PASSWORD_PEPPER_V1;
    delete process.env.PEOPLE_PULSE_PASSWORD_PEPPER;
    let missingPasswordPepper = false;
    try { await hashPassword(password); } catch (error) { missingPasswordPepper = error instanceof AuthConfigurationError; }

    process.stdout.write(JSON.stringify({
      parsed: Boolean(parsed),
      correct,
      wrong,
      legacyParsed: Boolean(legacyParsed),
      unsupportedIterationsRejected,
      runtimeCorrect,
      iterations: runtimeVerifier.passwordIterations,
      saltBytes: Buffer.from(runtimeVerifier.passwordSalt, "base64url").byteLength,
      hashBytes: Buffer.from(runtimeVerifier.passwordHash, "base64url").byteLength,
      distinctSalt: parsed?.passwordSalt !== runtimeVerifier.passwordSalt,
      tokenLength: token.length,
      tokenHashLength: tokenHash.length,
      tokenIsNotHash: token !== tokenHash,
      lookupHashesArePrivateAndScoped: loginLookup.length === 43 && sourceLookup.length === 43 && loginLookup !== sourceLookup,
      canonicalLogin: canonicalizeLoginId("  Owner.Admin  "),
      missingRateSecret,
      missingPasswordPepper,
      expectedIterations: PASSWORD_ITERATIONS,
      legacyIterations: LEGACY_PASSWORD_ITERATIONS,
      maximumIterations: MAX_PASSWORD_ITERATIONS,
    }));
  `;
  const verified = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "--eval", verificationScript], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    env: {
      ...process.env,
      AUTH_TEST_PASSWORD: output.login.temporaryPassword,
      AUTH_TEST_VERIFIER: environment.PEOPLE_PULSE_BOOTSTRAP_PASSWORD_HASH,
      AUTH_TEST_LEGACY_VERIFIER: "pbkdf2-sha256$100000$1$AAECAwQFBgcICQoLDA0ODw$me-DHdEkZqHOISG6329gWohf7sLJ3JtlHj5z-fLc11E",
      PEOPLE_PULSE_PASSWORD_PEPPER_VERSION: environment.PEOPLE_PULSE_PASSWORD_PEPPER_VERSION,
      PEOPLE_PULSE_PASSWORD_PEPPER_V1: environment.PEOPLE_PULSE_PASSWORD_PEPPER_V1,
      PEOPLE_PULSE_RATE_LIMIT_SECRET: environment.PEOPLE_PULSE_RATE_LIMIT_SECRET,
    },
  });
  assert.equal(verified.status, 0, verified.stderr || "runtime password verifier must execute");
  assert.deepEqual(JSON.parse(verified.stdout), {
    parsed: true,
    correct: true,
    wrong: false,
    legacyParsed: true,
    unsupportedIterationsRejected: true,
    runtimeCorrect: true,
    iterations: 600_000,
    saltBytes: 16,
    hashBytes: 32,
    distinctSalt: true,
    tokenLength: 43,
    tokenHashLength: 43,
    tokenIsNotHash: true,
    lookupHashesArePrivateAndScoped: true,
    canonicalLogin: "owner.admin",
    missingRateSecret: true,
    missingPasswordPepper: true,
    expectedIterations: 600_000,
    legacyIterations: 100_000,
    maximumIterations: 600_000,
  });
});

test("the runtime accepts legacy PBKDF2 and uses a Worker-safe six-stage current verifier", async () => {
  const [passwordCrypto, generator, viteConfig, schema, initialize, migration, snapshot] = await Promise.all([
    source("lib/password-crypto.ts"),
    source("scripts/generate-auth-bootstrap.mjs"),
    source("vite.config.ts"),
    source("db/schema.ts"),
    source("db/initialize.ts"),
    source("drizzle/0016_jittery_lily_hollister.sql"),
    source("drizzle/meta/0016_snapshot.json").then(JSON.parse),
  ]);

  assert.match(passwordCrypto, /export const LEGACY_PASSWORD_ITERATIONS = 100_000/);
  assert.match(passwordCrypto, /export const LEGACY_PASSWORD_ALGORITHM = "pbkdf2-sha256"/);
  assert.match(passwordCrypto, /export const PASSWORD_ALGORITHM = "pbkdf2-sha256-chain-v1"/);
  assert.match(passwordCrypto, /export const PASSWORD_ITERATIONS = 600_000/);
  assert.match(passwordCrypto, /export const PASSWORD_STAGE_ITERATIONS = 100_000/);
  assert.match(passwordCrypto, /export const PASSWORD_STAGE_COUNT = PASSWORD_ITERATIONS \/ PASSWORD_STAGE_ITERATIONS/);
  assert.match(passwordCrypto, /export const MAX_PASSWORD_ITERATIONS = PASSWORD_ITERATIONS/);
  assert.match(passwordCrypto, /function passwordVerifierIsSupported\(algorithm: string, iterations: number\)[\s\S]*?algorithm === LEGACY_PASSWORD_ALGORITHM && iterations === LEGACY_PASSWORD_ITERATIONS[\s\S]*?algorithm === PASSWORD_ALGORITHM && iterations === PASSWORD_ITERATIONS/);
  assert.match(passwordCrypto, /!passwordVerifierIsSupported\(verifier\.passwordAlgorithm, verifier\.passwordIterations\)/);
  assert.match(passwordCrypto, /!passwordVerifierIsSupported\(passwordAlgorithm, passwordIterations\)/);
  const deriveBlock = passwordCrypto.match(/async function derivePasswordHash[\s\S]*?(?=\nfunction currentPepperVersion)/)?.[0] ?? "";
  assertBefore(
    deriveBlock,
    /!passwordVerifierIsSupported\(algorithm, iterations\)/,
    /derivePbkdf2WithNodeCrypto\(/,
    "password verifier support guard",
  );
  assert.match(deriveBlock, /Password verifier is unsupported on this platform/);
  assert.match(passwordCrypto, /import \{ pbkdf2 \} from "node:crypto"/);
  assert.match(deriveBlock, /crypto\.subtle\.importKey\("raw", encoder\.encode\(pepper\), \{ name: "HMAC", hash: "SHA-256" \}/);
  assert.match(deriveBlock, /crypto\.subtle\.sign\("HMAC", pepperKey, encoder\.encode\(password\.normalize\("NFC"\)\)\)/);
  assert.match(deriveBlock, /for \(let stage = 0; stage < PASSWORD_STAGE_COUNT; stage \+= 1\)/);
  assert.match(deriveBlock, /setUint32\(salt\.byteLength, stage \+ 1, false\)/);
  assert.match(deriveBlock, /derivePbkdf2WithNodeCrypto\([\s\S]*?PASSWORD_STAGE_ITERATIONS/);
  assert.match(deriveBlock, /return new Promise<Uint8Array>\(\(resolve, reject\) => \{[\s\S]*?pbkdf2\(password, salt, iterations, PASSWORD_HASH_BYTES, "sha256", \(error, derivedKey\) =>/);
  assert.doesNotMatch(passwordCrypto, /pbkdf2Sync|crypto\.subtle\.deriveBits|name: "PBKDF2"/);
  assert.match(passwordCrypto, /hashPassword[\s\S]*?derivePasswordHash\(password, passwordSalt, PASSWORD_ALGORITHM, PASSWORD_ITERATIONS, pepperVersion\)/);
  assert.match(passwordCrypto, /dummyVerifyPassword[\s\S]*?dummySalt,[\s\S]*?PASSWORD_ALGORITHM,[\s\S]*?PASSWORD_ITERATIONS/);
  assert.match(viteConfig, /compatibility_flags: \["nodejs_compat"\]/);
  assert.match(generator, /const PASSWORD_ALGORITHM = "pbkdf2-sha256-chain-v1"/);
  assert.match(generator, /const PASSWORD_ITERATIONS = 600_000/);
  assert.match(generator, /const PASSWORD_STAGE_ITERATIONS = 100_000/);
  assert.match(generator, /createHmac\("sha256", pepper\)[\s\S]*?password\.normalize\("NFC"\)/);
  assert.match(generator, /for \(let stage = 0; stage < PASSWORD_STAGE_COUNT; stage \+= 1\)[\s\S]*?writeUInt32BE\(stage \+ 1, salt\.length\)[\s\S]*?pbkdf2Sync\(hash, stageSalt, PASSWORD_STAGE_ITERATIONS, 32, "sha256"\)/);
  assert.match(schema, /passwordIterations: integer\("password_iterations"\)\.notNull\(\)\.default\(100000\)/);
  assert.match(initialize, /password_iterations INTEGER NOT NULL DEFAULT 100000/);
  assert.match(migration, /`password_iterations` integer DEFAULT 100000 NOT NULL/);
  assert.equal(snapshot.tables.auth_credentials.columns.password_iterations.default, 100000);

  const fixedPassword = "People Pulse fixed vector – รหัสผ่าน";
  const legacyFixedVerifier = "pbkdf2-sha256$100000$1$AAECAwQFBgcICQoLDA0ODw$me-DHdEkZqHOISG6329gWohf7sLJ3JtlHj5z-fLc11E";
  const currentFixedVerifier = "pbkdf2-sha256-chain-v1$600000$1$AAECAwQFBgcICQoLDA0ODw$8Bxh8MfcJ5zUL5B2a3NaeLGEfCzudEWuPb9a6BQWtbk";
  const cryptoModule = new URL("../lib/password-crypto.ts", import.meta.url).href;
  const fixedVectorScript = `
    import { parsePasswordVerifier, verifyPassword } from ${JSON.stringify(cryptoModule)};
    const legacy = parsePasswordVerifier(process.env.AUTH_LEGACY_FIXED_VERIFIER);
    const current = parsePasswordVerifier(process.env.AUTH_CURRENT_FIXED_VERIFIER);
    const unsupported = [99999, 100001, 599999, 600001].map((iterations) => (
      parsePasswordVerifier(process.env.AUTH_CURRENT_FIXED_VERIFIER.replace("$600000$", "$" + iterations + "$")) === null
    ));
    process.stdout.write(JSON.stringify({
      legacyParsed: Boolean(legacy),
      legacyCorrect: legacy ? await verifyPassword(process.env.AUTH_FIXED_PASSWORD, legacy) : false,
      legacyWrong: legacy ? await verifyPassword(process.env.AUTH_FIXED_PASSWORD + "x", legacy) : true,
      currentParsed: Boolean(current),
      currentCorrect: current ? await verifyPassword(process.env.AUTH_FIXED_PASSWORD, current) : false,
      currentWrong: current ? await verifyPassword(process.env.AUTH_FIXED_PASSWORD + "x", current) : true,
      unsupported,
    }));
  `;
  const fixedVectorResult = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "--eval", fixedVectorScript], {
    encoding: "utf8",
    env: {
      ...process.env,
      AUTH_FIXED_PASSWORD: fixedPassword,
      AUTH_LEGACY_FIXED_VERIFIER: legacyFixedVerifier,
      AUTH_CURRENT_FIXED_VERIFIER: currentFixedVerifier,
      PEOPLE_PULSE_PASSWORD_PEPPER_VERSION: "1",
      PEOPLE_PULSE_PASSWORD_PEPPER_V1: "0123456789abcdef0123456789abcdef0123456789abcdef",
    },
  });
  assert.equal(fixedVectorResult.status, 0, fixedVectorResult.stderr || "native PBKDF2 fixed vector must execute");
  assert.deepEqual(JSON.parse(fixedVectorResult.stdout), {
    legacyParsed: true,
    legacyCorrect: true,
    legacyWrong: false,
    currentParsed: true,
    currentCorrect: true,
    currentWrong: false,
    unsupported: [true, true, true, true],
  });
});

test("every unsafe API checks the centralized same-origin gate before reading a body", async () => {
  const routePaths = [
    "app/api/auth/login/route.ts",
    "app/api/auth/change-password/route.ts",
    "app/api/auth/logout/route.ts",
    "app/api/dashboard/route.ts",
    "app/api/documents/route.ts",
    "app/api/profile-image/route.ts",
    "app/api/work-submissions/route.ts",
    "app/api/organization-documents/route.ts",
    "app/api/employee-warnings/route.ts",
    "app/api/employee-recognitions/route.ts",
  ];
  const routes = new Map(await Promise.all(routePaths.map(async (path) => [path, await source(path)])));
  const cases = [
    [routePaths[0], "POST", /unsafeRequestIsSameOrigin\(request\)/, /readBoundedLoginPayload\(request\)/],
    [routePaths[1], "POST", /unsafeRequestIsSameOrigin\(request\)/, /request\.json\(/],
    [routePaths[2], "POST", /unsafeRequestIsSameOrigin\(request\)/, /request\.json\(/],
    [routePaths[3], "POST", /authenticatedRequestGate\(request\)/, /request\.json\(/],
    [routePaths[4], "POST", /authenticatedRequestGate\(request\)/, /request\.formData\(/],
    [routePaths[5], "POST", /authenticatedRequestGate\(request\)/, /request\.formData\(/],
    [routePaths[6], "POST", /authenticatedRequestGate\(request\)/, /request\.formData\(/],
    [routePaths[7], "POST", /requireAdmin\(request\)/, /request\.formData\(/],
    [routePaths[7], "PATCH", /requireAdmin\(request\)/, /request\.json\(/],
    [routePaths[8], "POST", /requireAdmin\(request\)/, /request\.formData\(/],
    [routePaths[8], "PATCH", /requireAdmin\(request\)/, /request\.json\(/],
    [routePaths[9], "POST", /requireAdmin\(request\)/, /request\.formData\(/],
    [routePaths[9], "PATCH", /requireAdmin\(request\)/, /request\.json\(/],
  ];

  for (const [path, method, gate, body] of cases) {
    assertBefore(handlerSource(routes.get(path), method), gate, body, `${method} ${path}`);
  }
  for (const path of routePaths.slice(7)) {
    assert.match(routes.get(path), /async function requireAdmin\(request: Request\) \{\s*return authenticatedRequestGate\(request\);\s*\}/);
  }

  const accessControl = await source("lib/access-control.ts");
  const centralGate = accessControl.match(/export async function authenticatedRequestGate[\s\S]*?(?=\nexport function ensureBootstrapAccounts)/)?.[0] ?? "";
  assertBefore(centralGate, /unsafeRequestIsSameOrigin\(request\)/, /ensureDatabase\(\)/, "central authentication gate");
  assert.match(accessControl, /if \(!origin \|\| \(origin !== requestUrl\.origin && origin !== configuredOrigin\)\) return false/);
  assert.match(accessControl, /if \(fetchSite === "same-origin"\) return true/);
  assert.match(accessControl, /return !fetchSite && isLocalHostname\(requestUrl\.hostname\)/);
  assert.match(accessControl, /configuredOrigin && requestUrl\.hostname === "people-pulse-th-kpi\.brees2539\.chatgpt\.site"/);
  assert.doesNotMatch(`${accessControl}\n${await source("db/schema.ts")}`, /\b(?:csrf|xsrf)\b/i);
});

test("first-party routes expose 401, forced-change 428, rate-limit 429 and no-store cookies only in headers", async () => {
  const [accessControl, authService, loginRoute, sessionRoute, changeRoute, logoutRoute, dashboardRoute] = await Promise.all([
    source("lib/access-control.ts"),
    source("lib/auth-service.ts"),
    source("app/api/auth/login/route.ts"),
    source("app/api/auth/session/route.ts"),
    source("app/api/auth/change-password/route.ts"),
    source("app/api/auth/logout/route.ts"),
    source("app/api/dashboard/route.ts"),
  ]);

  assert.match(accessControl, /authRequired: true[\s\S]*?status: 401/);
  assert.match(accessControl, /passwordChangeRequired: true[\s\S]*?status: 428/);
  assert.match(accessControl, /private, no-store, max-age=0/);
  assert.match(accessControl, /vary: "Cookie"/);
  assert.match(loginRoute, /result\.retryAfterSeconds[\s\S]*?headers\.set\("retry-after"/);
  assert.match(loginRoute, /status: result\.currentUser\.mustChangePassword \? 428 : 200/);
  assert.match(loginRoute, /headers\.append\("set-cookie", result\.session\.cookie\)/);
  assert.doesNotMatch(loginRoute.match(/const body = \{[\s\S]*?\n    \};/)?.[0] ?? "", /cookie|session|token/i);
  assert.match(sessionRoute, /if \(!currentUser\) return authRequiredResponse\(\)/);
  assert.match(sessionRoute, /if \(currentUser\.mustChangePassword\) return passwordChangeRequiredResponse\(currentUser\)/);
  assert.match(changeRoute, /headers\.append\("set-cookie", session\.cookie\)/);
  assert.match(logoutRoute, /const sessionContext = await authenticatedRequestSession\(request\)/);
  assert.match(logoutRoute, /if \(!sessionContext\)[\s\S]*?clearSessionCookie\(request\)[\s\S]*?loggedOut: true/);
  assert.match(logoutRoute, /await completeLogout\([\s\S]*?sessionContext\.sessionId,[\s\S]*?sessionContext\.currentUser\.id,[\s\S]*?payload\.allDevices === true/);
  assert.doesNotMatch(logoutRoute, /ensureBootstrapAccounts|revokeRequestSession|revokeAllSessionsForAccount|recordAuthEvent/);
  const logoutBatch = accessControl.match(/export async function completeLogout[\s\S]*?(?=\nexport function clearSessionCookie)/)?.[0] ?? "";
  assert.match(logoutBatch, /const revokeQuery = allDevices[\s\S]*?eq\(authSessions\.userAccountId, userAccountId\)[\s\S]*?: db\.update\(authSessions\)[\s\S]*?eq\(authSessions\.id, sessionId\)/);
  assert.match(logoutBatch, /const queries = \[[\s\S]*?revokeQuery,[\s\S]*?sessions_revoked[\s\S]*?authEventValues\("logout"[\s\S]*?\] as const;\s*await db\.batch\(queries\)/);
  assert.match(dashboardRoute, /accessDenied: true \}, \{ status: 403 \}/);
  assert.match(authService, /status: 401 \| 429/);
});

test("sessions use a 256-bit opaque cookie, persist only its hash, and validate live access", async () => {
  const [accessControl, schema] = await Promise.all([
    source("lib/access-control.ts"),
    source("db/schema.ts"),
  ]);
  const sessionCreation = accessControl.match(/export async function createSession[\s\S]*?(?=\nexport async function revokeRequestSession)/)?.[0] ?? "";
  const liveSessionLookup = accessControl.match(/async function authenticatedSession[\s\S]*?(?=\nfunction sessionToken)/)?.[0] ?? "";

  assert.match(accessControl, /const HTTPS_SESSION_COOKIE = "__Host-pp_session"/);
  assert.match(accessControl, /const HTTP_DEV_SESSION_COOKIE = "pp_session_dev"/);
  assert.match(accessControl, /const SESSION_TOKEN_BYTES = 32/);
  assert.match(sessionCreation, /export async function createSession[\s\S]*?const prepared = await prepareSession\(request, account, credentialVersion\)[\s\S]*?insert\(authSessions\)\.values\(prepared\.values\)[\s\S]*?return prepared\.creation/);
  assert.match(sessionCreation, /export async function prepareSession[\s\S]*?const token = randomToken\(SESSION_TOKEN_BYTES\)/);
  assert.match(sessionCreation, /const tokenHash = await hashOpaqueToken\(token\)/);
  assert.match(sessionCreation, /const values: typeof authSessions\.\$inferInsert = \{[\s\S]*?tokenHash,[\s\S]*?credentialVersion,[\s\S]*?revokedAt: null/);
  assert.match(sessionCreation, /creation: \{ cookie: sessionCookie\(request, token, absoluteExpiresAt\)[\s\S]*?values/);
  assert.doesNotMatch(schema.match(/export const authSessions[\s\S]*?\n\]\);/)?.[0] ?? "", /\btoken:\s*text/);
  assert.match(accessControl, /`\$\{sessionCookieName\(request\)\}=\$\{token\}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=\$\{maxAge\}\$\{secure \? "; Secure" : ""\}`/);
  assert.match(accessControl, /\^\[A-Za-z0-9_-\]\{43\}\$/);
  assert.match(accessControl, /credential\.credentialVersion !== session\.credentialVersion/);
  assert.match(accessControl, /account\.status !== "active"/);
  assert.match(accessControl, /linkedEmployee\.status !== "active"/);
  assert.match(accessControl, /const liveDepartmentId = getRole\(linkedEmployee\.roleId\)\.departmentId/);
  assert.match(accessControl, /revokeReason: "account-unavailable"/);
  assert.match(accessControl, /revokeReason: "employee-link-unavailable"/);
  assert.match(liveSessionLookup, /\.from\(authSessions\)[\s\S]*?\.leftJoin\(userAccounts,[\s\S]*?\.leftJoin\(authCredentials,[\s\S]*?\.leftJoin\(employees,[\s\S]*?\.where\(eq\(authSessions\.tokenHash, tokenHash\)\)[\s\S]*?\.limit\(1\)/);
  assert.equal((liveSessionLookup.match(/\.from\(/g) ?? []).length, 1, "session authentication must fetch session, account, credential and employee in one joined lookup");
  assert.doesNotMatch(liveSessionLookup, /Promise\.all\(|db\.select\([\s\S]*?db\.select\(/);
});

test("login admission is atomic, the sixth ID failure is cheap, and unknown users still run a dummy KDF", async () => {
  const authService = await source("lib/auth-service.ts");
  const loginBlock = authService.match(/export async function authenticateLogin[\s\S]*?(?=\nexport async function publicUserAccountDtos)/)?.[0] ?? "";
  const earlyBlockIndex = loginBlock.indexOf("if (blockedUntil)");
  const reservationIndex = loginBlock.indexOf("rateReservationQuery(");
  const credentialLookupIndex = loginBlock.indexOf(".from(authCredentials)");
  const dummyIndex = loginBlock.indexOf("await dummyVerifyPassword");

  assert.match(authService, /const LOGIN_ID_FAILURE_LIMIT = 5/);
  assert.match(authService, /const SOURCE_ATTEMPT_LIMIT = 40/);
  assert.match(authService, /const ACCOUNT_FAILURE_LIMIT = 5/);
  assert.ok(earlyBlockIndex >= 0 && earlyBlockIndex < reservationIndex, "an already-blocked bucket must return before a reservation or KDF");
  assert.ok(reservationIndex >= 0 && reservationIndex < credentialLookupIndex, "the admission reservation must happen before credential lookup");
  assert.ok(credentialLookupIndex >= 0 && credentialLookupIndex < dummyIndex, "unknown or rejected credentials must take the dummy KDF path after admission");
  assert.match(loginBlock, /await getDb\(\)\.batch\(\[[\s\S]*?rateReservationQuery\(loginKeyHash, "login_id", LOGIN_ID_FAILURE_LIMIT/);
  assert.match(loginBlock, /select\(\)\.from\(authRateLimits\)[\s\S]*?inArray\(authRateLimits\.keyHash, \[loginKeyHash, sourceKeyHash\]\)/);
  assert.doesNotMatch(loginBlock, /getRateBucket\(/, "both rate buckets must be loaded by one IN query");
  assert.match(loginBlock, /\.from\(authCredentials\)[\s\S]*?\.innerJoin\(userAccounts,[\s\S]*?\.leftJoin\(employees,[\s\S]*?\.where\(eq\(authCredentials\.loginIdCanonical, loginIdCanonical\)\)/);
  assert.match(loginBlock, /const accountCanSignIn = accountIsEligible\(account \?\? null, loginContext\?\.employee \?\? null\)/);
  assert.match(loginBlock, /if \(credential && !locked\) await db\.batch\(\[credentialFailureQuery\(credential, nowDate\), failureEventQuery\]\)/);
  assert.match(loginBlock, /const preparedSession = await prepareSession\(request, refreshedAccount, credential\.credentialVersion\)[\s\S]*?await db\.batch\(\[[\s\S]*?eq\(authCredentials\.credentialVersion, credential\.credentialVersion\)[\s\S]*?releaseRateReservationQuery\(sourceKeyHash, now\)[\s\S]*?cleanupQueries\.sessions,[\s\S]*?db\.insert\(authSessions\)\.values\(preparedSession\.values\),[\s\S]*?eventType: "login_succeeded"/);
  assert.match(loginBlock, /session: preparedSession\.creation/);
  assert.doesNotMatch(loginBlock, /await createSession\(|await Promise\.all\(\[[\s\S]*?cleanupExpiredAuthRecords/, "successful login writes must remain in the transactional batch");
  assert.match(authService, /attemptCount: sql`CASE[\s\S]*?\$\{authRateLimits\.attemptCount\} \+ 1 > \$\{limit\} THEN \$\{blockedUntil\}/);
  assert.match(authService, /id: `auth-rate-limit:\$\{bucketType\}:\$\{keyHash\}:\$\{windowStartedAt\}`[\s\S]*?onConflictDoNothing\(\)/);
  assert.match(loginBlock, /if \(credential && !locked && passwordWithinLimit\)[\s\S]*?else \{\s*await dummyVerifyPassword/);
  assert.match(authService, /privateLookupHash\("login-rate-login-id"/);
  assert.match(authService, /privateLookupHash\("login-rate-source"/);
  assert.match(authService, /const cloudflareAddress = request\.headers\.get\("cf-connecting-ip"\)/);
  assert.match(authService, /isLocalHostname|url\.hostname === "localhost"/);
  assert.match(authService, /request\.headers\.get\("x-forwarded-for"\)[\s\S]*?"local-development"/);
});

test("password and access mutations revoke sessions, delete accounts safely, and close stale credential races", async () => {
  const [accessControl, authService, dashboardRoute, initialize, migration, page] = await Promise.all([
    source("lib/access-control.ts"),
    source("lib/auth-service.ts"),
    source("app/api/dashboard/route.ts"),
    source("db/initialize.ts"),
    source("drizzle/0016_jittery_lily_hollister.sql"),
    source("app/page.tsx"),
  ]);

  const changePassword = authService.match(/export async function changePasswordForUser[\s\S]*?(?=\nexport async function requestSourceHash)/)?.[0] ?? "";
  assert.match(changePassword, /eq\(authCredentials\.credentialVersion, credential\.credentialVersion\)/);
  assert.match(changePassword, /if \(!updatedCredential\) throw new AuthInputError/);
  assert.match(changePassword, /await revokeAllSessionsForAccount\(currentUser\.id, "password-changed"\)/);
  assert.match(changePassword, /await createSession\(request, currentUser, nextCredentialVersion\)/);
  assert.match(accessControl, /credential\.credentialVersion !== session\.credentialVersion/);

  const deleteAccountBlock = dashboardRoute.match(/if \(payload\.action === "deleteUserAccount"\) \{[\s\S]*?(?=\n    if \(payload\.action === "saveUserAccount"\))/)?.[0] ?? "";
  assert.match(dashboardRoute, /adminOnlyActions = new Set\(\[[\s\S]*?"deleteUserAccount"/);
  assertBefore(deleteAccountBlock, /accountId === currentUser\.id/, /db\.select\(\)\.from\(userAccounts\)/, "self-account deletion");
  assertBefore(deleteAccountBlock, /accountId === "user-owner"/, /db\.select\(\)\.from\(userAccounts\)/, "system-owner deletion");
  assert.match(deleteAccountBlock, /activeAdmins\.length <= 1[\s\S]*?status: 409/);
  assert.match(deleteAccountBlock, /await db\.batch\(\[[\s\S]*?eventType: "account_deleted"[\s\S]*?detail: `target:\$\{accountId\};actor:\$\{currentUser\.id\}`[\s\S]*?db\.delete\(userAccounts\)\.where\(eq\(userAccounts\.id, accountId\)\)/);
  assert.doesNotMatch(deleteAccountBlock, /db\.delete\(employees\)/, "deleting login access must preserve the employee profile and work history");
  assert.match(deleteAccountBlock, /deletedUserAccountId: accountId/);

  const accountBlock = dashboardRoute.match(/if \(payload\.action === "saveUserAccount"\) \{[\s\S]*?(?=\n    if \(payload\.action === "createEmployee"\))/)?.[0] ?? "";
  assert.match(accountBlock, /if \(suppliedAccountId === currentUser\.id\) \{[\s\S]*?status: 409/);
  assertBefore(accountBlock, /suppliedAccountId === currentUser\.id/, /db\.select\(\)\.from\(userAccounts\)/, "self-account mutation");
  assert.match(accountBlock, /id: `credential-mutation:\$\{accountId\}:\$\{existingCredential\.credentialVersion\}`/);
  assert.match(accountBlock, /eq\(authCredentials\.credentialVersion, existingCredential\.credentialVersion\)/);
  assert.match(accountBlock, /await db\.batch\(\[[\s\S]*?db\.insert\(authEvents\)\.values\(mutationClaim\),[\s\S]*?credentialUpdate,[\s\S]*?accountMutation/);
  assert.match(accountBlock, /existing\.role !== role \|\| existing\.status !== status \|\| existing\.employeeId !== employeeId \|\| existing\.departmentId !== departmentId/);
  assert.match(accountBlock, /revokeAllSessionsForAccount\(accountId,[\s\S]*?"credential-reset"[\s\S]*?"account-access-changed"[\s\S]*?"login-id-changed"/);
  assert.match(initialize, /CREATE TRIGGER IF NOT EXISTS auth_events_validate_credential_mutation_claim[\s\S]*?RAISE\(ABORT, 'STALE_CREDENTIAL_VERSION'\)/);
  assert.match(migration, /CREATE TRIGGER `auth_events_validate_credential_mutation_claim`[\s\S]*?RAISE\(ABORT, 'STALE_CREDENTIAL_VERSION'\)/);

  for (const trigger of ["user_accounts_preserve_last_active_admin_update", "user_accounts_preserve_last_active_admin_delete"]) {
    assert.match(initialize, new RegExp(`CREATE TRIGGER IF NOT EXISTS ${trigger}[\\s\\S]*?LAST_ACTIVE_ADMIN_REQUIRED`));
    assert.match(migration, new RegExp("CREATE TRIGGER `" + trigger + "`[\\s\\S]*?LAST_ACTIVE_ADMIN_REQUIRED"));
  }
  assert.match(accountBlock, /activeAdmins\.length <= 1[\s\S]*?status: 409/);
  assert.match(page, /disabled=\{isSaving \|\| account\.id === currentUser\?\.id\}/);
  assert.match(page, /setShowChangePassword\(true\)[\s\S]*?<strong>เปลี่ยนรหัสผ่าน<\/strong>[\s\S]*?ยืนยันรหัสปัจจุบันและตั้งรหัสใหม่/);
  assert.match(page, /const deleteUserAccount = async \(account: PublicUserAccount\)/);
  assert.match(page, /window\.confirm\([\s\S]*?บัญชี รหัสผ่าน และเซสชันจะถูกลบถาวร แต่โปรไฟล์พนักงานและประวัติงานจะยังอยู่/);
  assert.match(page, /action: "deleteUserAccount", accountId: account\.id/);
  assert.match(page, /className="delete-account"[\s\S]*?disabled=\{isSaving \|\| account\.id === currentUser\?\.id \|\| account\.id === "user-owner"\}/);
});

test("public DTOs and the client bundle contain no authentication secrets or legacy identity bridge", async () => {
  const [authService, accessControl, dashboardRoute, page, authUi] = await Promise.all([
    source("lib/auth-service.ts"),
    source("lib/access-control.ts"),
    source("app/api/dashboard/route.ts"),
    source("app/page.tsx"),
    source("app/auth-ui.tsx"),
  ]);

  assert.match(authService, /PublicUserAccountDto = Omit<UserAccountRecord, "authUserId">/);
  assert.match(authService, /delete \(safeAccount as Partial<UserAccountRecord>\)\.authUserId/);
  assert.match(authService, /hasPassword: Boolean\(credential\?\.passwordHash\)/);
  assert.match(dashboardRoute, /delete \(currentUserDto as Partial<CurrentUser>\)\.authUserId/);
  assert.match(dashboardRoute, /userAccounts: currentUser\.role === "admin" \? await publicUserAccountDtos\(userAccountRows\) : \[\]/);
  assert.match(page, /type PublicUserAccount = Omit<UserAccountRecord, "authUserId">/);

  const clientRoot = new URL("../dist/client/assets/", import.meta.url);
  const clientFiles = (await readdir(clientRoot)).filter((name) => name.endsWith(".js"));
  assert.ok(clientFiles.length, "expected a built client bundle");
  const clientBundle = (await Promise.all(clientFiles.map((name) => readFile(new URL(name, clientRoot), "utf8")))).join("\n");
  assert.doesNotMatch(clientBundle, /passwordHash|passwordSalt|tokenHash|pepperVersion|authUserId|PEOPLE_PULSE_PASSWORD_PEPPER|PEOPLE_PULSE_RATE_LIMIT_SECRET/);

  const firstPartyUi = `${page}\n${authUi}`;
  assert.match(authUi, /fetch\("\/api\/auth\/login"/);
  assert.match(authUi, /name="username"/);
  assert.match(authUi, /autoComplete="current-password"/);
  assert.match(authUi, /<span>ชื่อผู้ใช้<\/span>/);
  assert.match(page, /ชื่อผู้ใช้สำหรับเข้าสู่ระบบ/);
  assert.doesNotMatch(authUi, /<span>รหัสผู้ใช้<\/span>/);
  assert.match(page, /รหัสผ่านชั่วคราว/);
  assert.match(page, /ผูกกับโปรไฟล์พนักงาน/);
  assert.doesNotMatch(firstPartyUi, /signin-with-chatgpt|oai-authenticated-user-id|เข้าสู่ระบบด้วย ChatGPT/i);
  assert.doesNotMatch(`${accessControl}\n${dashboardRoute}`, /oai-authenticated-user-id|authenticatedIdentity\(|chatgpt-auth|isLocalRequest/i);
});

test("bootstrap repairs only a pristine or pre-first-party legacy owner through an evidence-bound exact CAS", async () => {
  const [accessControl, initialize, legacyMigration, schema] = await Promise.all([
    source("lib/access-control.ts"),
    source("db/initialize.ts"),
    source("drizzle/0017_legacy_bootstrap_repair.sql"),
    source("db/schema.ts"),
  ]);
  const bootstrapCache = accessControl.match(/export function ensureBootstrapAccounts[\s\S]*?(?=\nasync function initializeBootstrapAccounts)/)?.[0] ?? "";
  const bootstrap = accessControl.match(/async function initializeBootstrapAccounts[\s\S]*?(?=\nexport async function authenticateRequest)/)?.[0] ?? "";

  assert.match(accessControl, /let bootstrapInitialization: Promise<void> \| null = null/);
  assert.match(bootstrapCache, /if \(bootstrapInitialization\) return bootstrapInitialization/);
  assert.match(bootstrapCache, /bootstrapInitialization = initializeBootstrapAccounts\(\)\.catch\(\(error\) => \{\s*bootstrapInitialization = null;\s*throw error/);
  assert.match(bootstrap, /const \[ownerRows, credentialRows\] = await db\.batch\(\[[\s\S]*?from\(userAccounts\)[\s\S]*?from\(authCredentials\)[\s\S]*?\]\)/);
  assert.match(bootstrap, /const existingOwner = ownerRows\[0\][\s\S]*?const existingCredential = credentialRows\[0\]/);

  for (const variable of [
    "PEOPLE_PULSE_BOOTSTRAP_LOGIN_ID",
    "PEOPLE_PULSE_BOOTSTRAP_PASSWORD_HASH",
    "PEOPLE_PULSE_BOOTSTRAP_ADMIN_EMAIL",
    "PEOPLE_PULSE_BOOTSTRAP_ADMIN_NAME",
  ]) assert.match(bootstrap, new RegExp(variable));
  assert.match(bootstrap, /const hasAnyBootstrapConfig = Boolean\(configuredLoginId \|\| configuredVerifier \|\| configuredEmail\)/);
  assert.match(bootstrap, /if \(!hasAnyBootstrapConfig\) return/);
  assert.match(bootstrap, /if \(!loginIdCanonical \|\| !verifier \|\| !\/\^\[/);
  assert.match(bootstrap, /configuration is incomplete or invalid/);
  const currentCostGuard = /!existingCredential[\s\S]*?verifier\.passwordAlgorithm !== PASSWORD_ALGORITHM \|\| verifier\.passwordIterations !== PASSWORD_ITERATIONS/;
  assert.match(bootstrap, currentCostGuard);
  assertBefore(bootstrap, currentCostGuard, /db\.insert\(userAccounts\)/, "empty-database bootstrap work factor");
  assertBefore(bootstrap, currentCostGuard, /db\.insert\(authCredentials\)/, "empty-database bootstrap credential");

  const executableBootstrap = `
    const PASSWORD_ALGORITHM = "pbkdf2-sha256-chain-v1";
    const PASSWORD_ITERATIONS = 600000;
    const LEGACY_PASSWORD_ITERATIONS = 100000;
    const userAccounts = { id: "id" };
    const authCredentials = { userAccountId: "userAccountId" };
    const authSessions = {};
    const authEvents = {};
    const eq = (...values) => values;
    const gt = (...values) => values;
    const isNull = (...values) => values;
    const and = (...values) => values;
    const sql = () => true;
    const validateLoginId = (value) => value.toLowerCase();
    const parsePasswordVerifier = () => ({
      passwordAlgorithm: "pbkdf2-sha256",
      passwordIterations: LEGACY_PASSWORD_ITERATIONS,
      pepperVersion: 1,
      passwordSalt: "AAECAwQFBgcICQoLDA0ODw",
      passwordHash: "me-DHdEkZqHOISG6329gWohf7sLJ3JtlHj5z-fLc11E",
    });
    let writes = 0;
    const readQuery = () => ({ from() { return this; }, where() { return this; }, limit() { return this; } });
    const db = {
      select: readQuery,
      batch: async () => [[], []],
      insert: () => { writes += 1; throw new Error("unexpected bootstrap write"); },
    };
    const getDb = () => db;
    const recordAuthEvent = async () => { writes += 1; };
    ${bootstrap.replace("async function initializeBootstrapAccounts", "export async function initializeBootstrapAccounts")}
    export const writeCount = () => writes;
  `;
  const previousBootstrapEnvironment = {
    loginId: process.env.PEOPLE_PULSE_BOOTSTRAP_LOGIN_ID,
    verifier: process.env.PEOPLE_PULSE_BOOTSTRAP_PASSWORD_HASH,
    email: process.env.PEOPLE_PULSE_BOOTSTRAP_ADMIN_EMAIL,
  };
  try {
    process.env.PEOPLE_PULSE_BOOTSTRAP_LOGIN_ID = "owner.admin";
    process.env.PEOPLE_PULSE_BOOTSTRAP_PASSWORD_HASH = "pbkdf2-sha256$100000$1$AAECAwQFBgcICQoLDA0ODw$me-DHdEkZqHOISG6329gWohf7sLJ3JtlHj5z-fLc11E";
    process.env.PEOPLE_PULSE_BOOTSTRAP_ADMIN_EMAIL = "owner@example.com";
    const bootstrapModule = await import(`data:text/javascript;base64,${Buffer.from(executableBootstrap).toString("base64")}`);
    await assert.rejects(bootstrapModule.initializeBootstrapAccounts(), /current password work factor/);
    assert.equal(bootstrapModule.writeCount(), 0, "a legacy verifier on an empty database must fail before account, credential, or event writes");
  } finally {
    for (const [key, value] of Object.entries({
      PEOPLE_PULSE_BOOTSTRAP_LOGIN_ID: previousBootstrapEnvironment.loginId,
      PEOPLE_PULSE_BOOTSTRAP_PASSWORD_HASH: previousBootstrapEnvironment.verifier,
      PEOPLE_PULSE_BOOTSTRAP_ADMIN_EMAIL: previousBootstrapEnvironment.email,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  const existingStart = bootstrap.indexOf("if (existingCredential) {");
  const initialInsertStart = bootstrap.indexOf("const insertedCredentials");
  assert.ok(existingStart >= 0 && initialInsertStart > existingStart, "expected a bounded legacy-repair branch before initial insertion");
  const repairBranch = bootstrap.slice(existingStart, initialInsertStart);
  assert.match(repairBranch, /const pristineBootstrapOwner = existingOwner[\s\S]*?existingOwner\.authUserId === ""[\s\S]*?existingOwner\.lastLoginAt === null[\s\S]*?existingOwner\.createdAt === existingOwner\.updatedAt/);
  assert.match(repairBranch, /const legacyOaiOwner = existingOwner[\s\S]*?existingOwner\.authUserId !== ""[\s\S]*?existingOwner\.lastLoginAt !== null[\s\S]*?existingOwner\.createdAt < existingOwner\.lastLoginAt[\s\S]*?existingOwner\.lastLoginAt < existingCredential\.createdAt/);
  for (const condition of [
    "existingOwner.email === configuredEmail",
    'existingOwner.role === "admin"',
    'existingOwner.status === "active"',
    'existingOwner.createdBy === "ระบบเริ่มต้น"',
    "(pristineBootstrapOwner || legacyOaiOwner)",
    "existingCredential.loginIdCanonical === loginIdCanonical",
    'existingCredential.passwordAlgorithm === "pbkdf2-sha256"',
    "verifier.passwordIterations === LEGACY_PASSWORD_ITERATIONS",
    "existingCredential.passwordIterations > LEGACY_PASSWORD_ITERATIONS",
    "existingCredential.pepperVersion === verifier.pepperVersion",
    "existingCredential.credentialVersion === 1",
    "existingCredential.mustChangePassword",
    "existingCredential.failedAttempts >= 0",
    "existingCredential.failedAttempts <= 1",
    "existingCredential.lockedUntil === null",
    "originalPasswordChangedAt === existingCredential.createdAt",
  ]) assert.ok(repairBranch.includes(condition), `legacy repair must require: ${condition}`);
  assert.match(repairBranch, /if \(!untouchedBootstrapCredential \|\| !originalPasswordChangedAt\) return/);
  assert.match(repairBranch, /\.set\(\{[\s\S]*?\.\.\.verifier,[\s\S]*?credentialVersion: 2,[\s\S]*?mustChangePassword: true,[\s\S]*?failedAttempts: 0,[\s\S]*?lockedUntil: null/);
  for (const casCondition of [
    'eq(authCredentials.userAccountId, "user-owner")',
    "eq(authCredentials.loginIdCanonical, existingCredential.loginIdCanonical)",
    "eq(authCredentials.passwordAlgorithm, existingCredential.passwordAlgorithm)",
    "eq(authCredentials.passwordHash, existingCredential.passwordHash)",
    "eq(authCredentials.passwordSalt, existingCredential.passwordSalt)",
    "eq(authCredentials.passwordIterations, existingCredential.passwordIterations)",
    "gt(authCredentials.passwordIterations, LEGACY_PASSWORD_ITERATIONS)",
    "eq(authCredentials.pepperVersion, existingCredential.pepperVersion)",
    "eq(authCredentials.credentialVersion, 1)",
    "eq(authCredentials.mustChangePassword, true)",
    "eq(authCredentials.failedAttempts, existingCredential.failedAttempts)",
    "isNull(authCredentials.lockedUntil)",
    "eq(authCredentials.passwordChangedAt, originalPasswordChangedAt)",
    "eq(authCredentials.createdAt, existingCredential.createdAt)",
    "eq(authCredentials.updatedAt, existingCredential.updatedAt)",
  ]) assert.ok(repairBranch.includes(casCondition), `legacy repair CAS must include: ${casCondition}`);
  for (const ownerCondition of [
    "${userAccounts.id} = 'user-owner'",
    "${userAccounts.email} = ${configuredEmail}",
    "${userAccounts.role} = 'admin'",
    "${userAccounts.status} = 'active'",
    "${userAccounts.createdBy} = 'ระบบเริ่มต้น'",
    "${userAccounts.authUserId} = ''",
    "${userAccounts.lastLoginAt} IS NULL",
    "${userAccounts.createdAt} = ${userAccounts.updatedAt}",
    "${userAccounts.authUserId} != ''",
    "${userAccounts.lastLoginAt} IS NOT NULL",
    "${userAccounts.createdAt} < ${userAccounts.lastLoginAt}",
    "${userAccounts.lastLoginAt} < ${existingCredential.createdAt}",
  ]) assert.ok(repairBranch.includes(ownerCondition), `legacy repair database claim must require: ${ownerCondition}`);
  assert.match(repairBranch, /sql`NOT EXISTS \([\s\S]*?FROM \$\{authSessions\}[\s\S]*?userAccountId\} = 'user-owner'[\s\S]*?\)`/);
  assert.match(repairBranch, /SELECT COUNT\(\*\) FROM \$\{authEvents\}[\s\S]*?eventType\} = 'credential_created'[\s\S]*?sourceHash\} = ''[\s\S]*?detail\} = 'bootstrap-prehashed'[\s\S]*?createdAt\} >= \$\{existingCredential\.createdAt\}[\s\S]*?\) = 1/);
  assert.match(repairBranch, /sql`NOT EXISTS \([\s\S]*?FROM \$\{authEvents\}[\s\S]*?AND NOT \([\s\S]*?credential_created[\s\S]*?bootstrap-prehashed[\s\S]*?OR \([\s\S]*?login_failed[\s\S]*?generic-credential-failure[\s\S]*?\)[\s\S]*?\)`/);
  assert.match(repairBranch, /SELECT COUNT\(\*\) FROM \$\{authEvents\}[\s\S]*?eventType\} = 'login_failed'[\s\S]*?detail\} = 'generic-credential-failure'[\s\S]*?createdAt\} >= \$\{existingCredential\.createdAt\}[\s\S]*?\) = \$\{existingCredential\.failedAttempts\}/);
  assert.equal((repairBranch.match(/\$\{authEvents\.createdAt\} >= \$\{existingCredential\.createdAt\}/g) ?? []).length, 4);
  for (const unsafeEvent of ["login_succeeded", "password_changed", "credential_reset", "credential_updated", "bootstrap_credential_repaired"]) {
    assert.doesNotMatch(repairBranch, new RegExp(`eventType\\} = '${unsafeEvent}'`), `${unsafeEvent} must remain outside the repair evidence allowlist`);
  }
  assert.match(repairBranch, /\.returning\(\{ userAccountId: authCredentials\.userAccountId \}\)/);
  assert.match(repairBranch, /void repairedCredential;\s*return/);
  assert.doesNotMatch(repairBranch, /recordAuthEvent\(/, "the database trigger must own the atomic repair audit");

  assert.match(bootstrap, /\.onConflictDoNothing\(\)/);
  assert.match(bootstrap, /const insertedCredentials = await db\.insert\(authCredentials\)[\s\S]*?\.returning\(\{ userAccountId: authCredentials\.userAccountId \}\)/);
  assert.match(bootstrap, /if \(insertedCredentials\.length\) await recordAuthEvent\("credential_created"/);
  assert.doesNotMatch(bootstrap, /hashPassword\(|temporaryPassword|defaultPassword/i);

  for (const triggerSource of [initialize, legacyMigration]) {
    assert.match(triggerSource, /auth_credentials_audit_bootstrap_legacy_iteration_repair/);
    assert.match(triggerSource, /OLD\.user_account_id = 'user-owner'[\s\S]*?OLD\.password_algorithm = 'pbkdf2-sha256'[\s\S]*?OLD\.password_iterations > 100000/);
    assert.match(triggerSource, /OLD\.credential_version = 1[\s\S]*?OLD\.must_change_password = 1[\s\S]*?OLD\.failed_attempts BETWEEN 0 AND 1[\s\S]*?OLD\.locked_until IS NULL/);
    assert.match(triggerSource, /OLD\.password_changed_at = OLD\.created_at/);
    assert.doesNotMatch(triggerSource, /OLD\.created_at = OLD\.updated_at/);
    assert.match(triggerSource, /NEW\.password_algorithm = 'pbkdf2-sha256'[\s\S]*?NEW\.password_iterations = 100000[\s\S]*?NEW\.pepper_version = OLD\.pepper_version[\s\S]*?NEW\.credential_version = 2[\s\S]*?NEW\.must_change_password = 1[\s\S]*?NEW\.failed_attempts = 0[\s\S]*?NEW\.locked_until IS NULL/);
    assert.match(triggerSource, /auth_user_id = ''[\s\S]*?last_login_at IS NULL[\s\S]*?created_at = updated_at[\s\S]*?OR[\s\S]*?auth_user_id != ''[\s\S]*?last_login_at IS NOT NULL[\s\S]*?created_at < last_login_at[\s\S]*?last_login_at < OLD\.created_at/);
    assert.match(triggerSource, /NOT EXISTS \([\s\S]*?FROM [`]?auth_sessions[`]?[\s\S]*?user_account_id = OLD\.user_account_id/);
    assert.match(triggerSource, /event_type = 'credential_created'[\s\S]*?source_hash = ''[\s\S]*?detail = 'bootstrap-prehashed'[\s\S]*?created_at >= OLD\.created_at[\s\S]*?\) = 1/);
    assert.match(triggerSource, /AND NOT \([\s\S]*?credential_created[\s\S]*?bootstrap-prehashed[\s\S]*?OR \(event_type = 'login_failed'[\s\S]*?generic-credential-failure[\s\S]*?\)/);
    assert.match(triggerSource, /event_type = 'login_failed'[\s\S]*?detail = 'generic-credential-failure'[\s\S]*?created_at >= OLD\.created_at[\s\S]*?\) = OLD\.failed_attempts/);
    assert.match(triggerSource, /UPDATE [`]?auth_sessions[`]?[\s\S]*?revoke_reason = 'bootstrap-iteration-repair'[\s\S]*?revoked_at IS NULL/);
    assert.match(triggerSource, /INSERT INTO [`]?auth_events[`]?[\s\S]*?'bootstrap-legacy-credential-repaired:user-owner:1'[\s\S]*?'bootstrap_credential_repaired'/);
  }
  assert.match(schema, /"bootstrap_credential_repaired"/);
});

test("migration 0017 upgrades the old trigger, accepts one failed-login drift, and rolls back on audit collision", async () => {
  const [authMigration, legacyRepairMigration] = await Promise.all([
    source("drizzle/0016_jittery_lily_hollister.sql"),
    source("drizzle/0017_legacy_bootstrap_repair.sql"),
  ]);
  const oldTrigger = authMigration.match(/CREATE TRIGGER `auth_credentials_audit_bootstrap_iteration_repair`[\s\S]*?\nEND;/)?.[0] ?? "";
  assert.ok(oldTrigger, "migration 0016 must expose the trigger that 0017 upgrades");

  function upgradedDatabase() {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE user_accounts (
        id TEXT PRIMARY KEY, auth_user_id TEXT NOT NULL, email TEXT NOT NULL,
        role TEXT NOT NULL, status TEXT NOT NULL, created_by TEXT NOT NULL,
        last_login_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE auth_credentials (
        user_account_id TEXT PRIMARY KEY, login_id_canonical TEXT NOT NULL,
        password_hash TEXT NOT NULL, password_salt TEXT NOT NULL,
        password_algorithm TEXT NOT NULL, password_iterations INTEGER NOT NULL,
        pepper_version INTEGER NOT NULL, credential_version INTEGER NOT NULL,
        must_change_password INTEGER NOT NULL, failed_attempts INTEGER NOT NULL,
        locked_until TEXT, password_changed_at TEXT, created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE auth_sessions (
        id TEXT PRIMARY KEY, user_account_id TEXT NOT NULL,
        revoked_at TEXT, revoke_reason TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE auth_events (
        id TEXT PRIMARY KEY, user_account_id TEXT, event_type TEXT NOT NULL,
        source_hash TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL
      );
    `);
    db.exec(oldTrigger);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'trigger' AND name = 'auth_credentials_audit_bootstrap_iteration_repair'").get().total, 1);
    db.exec(legacyRepairMigration);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'trigger' AND name = 'auth_credentials_audit_bootstrap_iteration_repair'").get().total, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'trigger' AND name = 'auth_credentials_audit_bootstrap_legacy_iteration_repair'").get().total, 1);
    return db;
  }

  const accountCreatedAt = "2026-08-01T00:00:00.000Z";
  const legacyOaiLoginAt = "2026-08-20T00:00:00.000Z";
  const credentialCreatedAt = "2026-09-01T00:00:00.000Z";
  const failedLoginAt = "2026-09-02T00:00:00.000Z";
  const repairedAt = "2026-09-03T00:00:00.000Z";

  function seedAllowedLegacyHistory(db, { collideAudit = false } = {}) {
    db.prepare("INSERT INTO user_accounts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      "user-owner", "legacy-oai-owner-id", "owner@example.com", "admin", "active",
      "ระบบเริ่มต้น", legacyOaiLoginAt, accountCreatedAt, legacyOaiLoginAt,
    );
    db.prepare("INSERT INTO auth_credentials VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      "user-owner", "owner.admin", "legacy-600k-hash", "legacy-salt", "pbkdf2-sha256",
      600000, 1, 1, 1, 1, null, credentialCreatedAt, credentialCreatedAt, failedLoginAt,
    );
    db.prepare("INSERT INTO auth_events VALUES (?, ?, ?, ?, ?, ?)").run(
      "credential-created", "user-owner", "credential_created", "", "bootstrap-prehashed", credentialCreatedAt,
    );
    db.prepare("INSERT INTO auth_events VALUES (?, ?, ?, ?, ?, ?)").run(
      "failed-login", "user-owner", "login_failed", "source-hash", "generic-credential-failure", failedLoginAt,
    );
    if (collideAudit) {
      db.prepare("INSERT INTO auth_events VALUES (?, ?, ?, ?, ?, ?)").run(
        "bootstrap-legacy-credential-repaired:user-owner:1", null, "bootstrap_credential_repaired", "", "collision", failedLoginAt,
      );
    }
  }

  function runRepairUpdate(db) {
    db.prepare(`UPDATE auth_credentials SET
      password_hash = 'new-100k-hash', password_salt = 'new-salt', password_iterations = 100000,
      pepper_version = 1, credential_version = 2, must_change_password = 1,
      failed_attempts = 0, locked_until = NULL, password_changed_at = ?, updated_at = ?
      WHERE user_account_id = 'user-owner'`).run(repairedAt, repairedAt);
  }

  const allowedDb = upgradedDatabase();
  seedAllowedLegacyHistory(allowedDb);
  runRepairUpdate(allowedDb);
  const repairedCredential = allowedDb.prepare("SELECT password_iterations, credential_version, must_change_password, failed_attempts, locked_until, password_changed_at, updated_at FROM auth_credentials WHERE user_account_id = 'user-owner'").get();
  assert.equal(repairedCredential.password_iterations, 100000);
  assert.equal(repairedCredential.credential_version, 2);
  assert.equal(repairedCredential.must_change_password, 1);
  assert.equal(repairedCredential.failed_attempts, 0, "the single failed-login counter must be reset");
  assert.equal(repairedCredential.locked_until, null);
  assert.equal(repairedCredential.password_changed_at, repairedAt);
  assert.equal(repairedCredential.updated_at, repairedAt, "failed-login timestamp drift must be replaced by the repair timestamp");
  const repairAudit = allowedDb.prepare("SELECT id, event_type, detail FROM auth_events WHERE event_type = 'bootstrap_credential_repaired'").get();
  assert.equal(repairAudit.id, "bootstrap-legacy-credential-repaired:user-owner:1");
  assert.equal(repairAudit.event_type, "bootstrap_credential_repaired");
  assert.equal(repairAudit.detail, "iterations:600000->100000");
  allowedDb.close();

  const collisionDb = upgradedDatabase();
  seedAllowedLegacyHistory(collisionDb, { collideAudit: true });
  assert.throws(() => runRepairUpdate(collisionDb), /UNIQUE constraint failed: auth_events\.id/);
  const rolledBackCredential = collisionDb.prepare("SELECT password_hash, password_iterations, credential_version, failed_attempts, updated_at FROM auth_credentials WHERE user_account_id = 'user-owner'").get();
  assert.equal(rolledBackCredential.password_hash, "legacy-600k-hash");
  assert.equal(rolledBackCredential.password_iterations, 600000);
  assert.equal(rolledBackCredential.credential_version, 1);
  assert.equal(rolledBackCredential.failed_attempts, 1);
  assert.equal(rolledBackCredential.updated_at, failedLoginAt);
  collisionDb.close();
});

test("migration 0019 permits only sessions backed by live access and rolls a rejected batch back", async () => {
  const sessionGuardMigration = await source("drizzle/0019_auth_session_guard.sql");
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE employees (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL
      );
      CREATE TABLE user_accounts (
        id TEXT PRIMARY KEY,
        role TEXT NOT NULL,
        status TEXT NOT NULL,
        employee_id TEXT
      );
      CREATE TABLE auth_credentials (
        user_account_id TEXT PRIMARY KEY,
        password_hash TEXT NOT NULL,
        credential_version INTEGER NOT NULL
      );
      CREATE TABLE auth_sessions (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        user_account_id TEXT NOT NULL,
        credential_version INTEGER NOT NULL
      );
      CREATE TABLE batch_effects (
        id TEXT PRIMARY KEY,
        detail TEXT NOT NULL
      );
    `);
    db.exec(sessionGuardMigration);

    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'trigger' AND name = 'auth_sessions_validate_insert'").get().total, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'table' AND name = 'people_pulse_schema_v19_ready'").get().total, 1);

    const insertEmployee = db.prepare("INSERT INTO employees (id, status) VALUES (?, ?)");
    insertEmployee.run("employee-active-manager", "active");
    insertEmployee.run("employee-active-staff", "active");
    insertEmployee.run("employee-inactive", "inactive");

    const insertAccount = db.prepare("INSERT INTO user_accounts (id, role, status, employee_id) VALUES (?, ?, ?, ?)");
    insertAccount.run("admin-active", "admin", "active", null);
    insertAccount.run("manager-active", "manager", "active", "employee-active-manager");
    insertAccount.run("employee-active", "employee", "active", "employee-active-staff");
    insertAccount.run("admin-inactive", "admin", "inactive", null);
    insertAccount.run("role-unknown", "auditor", "active", "employee-active-staff");
    insertAccount.run("employee-missing", "manager", "active", "employee-not-found");
    insertAccount.run("employee-inactive-link", "employee", "active", "employee-inactive");
    insertAccount.run("empty-password-hash", "admin", "active", null);

    const insertCredential = db.prepare("INSERT INTO auth_credentials (user_account_id, password_hash, credential_version) VALUES (?, ?, ?)");
    for (const [accountId, hash, version] of [
      ["admin-active", "admin-hash", 7],
      ["manager-active", "manager-hash", 3],
      ["employee-active", "employee-hash", 4],
      ["admin-inactive", "inactive-hash", 1],
      ["role-unknown", "unknown-role-hash", 1],
      ["employee-missing", "missing-link-hash", 1],
      ["employee-inactive-link", "inactive-link-hash", 1],
      ["empty-password-hash", "", 1],
    ]) insertCredential.run(accountId, hash, version);

    const insertSession = db.prepare("INSERT INTO auth_sessions (id, token_hash, user_account_id, credential_version) VALUES (?, ?, ?, ?)");
    for (const [id, accountId, credentialVersion] of [
      ["valid-admin", "admin-active", 7],
      ["valid-manager", "manager-active", 3],
      ["valid-employee", "employee-active", 4],
    ]) insertSession.run(id, `token-${id}`, accountId, credentialVersion);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM auth_sessions").get().total, 3);

    for (const [reason, accountId, credentialVersion] of [
      ["stale credential", "admin-active", 6],
      ["inactive account", "admin-inactive", 1],
      ["unknown role", "role-unknown", 1],
      ["missing employee", "employee-missing", 1],
      ["inactive employee", "employee-inactive-link", 1],
      ["empty password hash", "empty-password-hash", 1],
      ["missing account", "account-not-found", 1],
    ]) {
      assert.throws(
        () => insertSession.run(`invalid-${reason}`, `token-invalid-${reason}`, accountId, credentialVersion),
        /AUTH_SESSION_ACCOUNT_UNAVAILABLE/,
        reason,
      );
    }

    assert.throws(() => {
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare("INSERT INTO batch_effects (id, detail) VALUES (?, ?)").run("must-roll-back", "written before guarded session");
        insertSession.run("invalid-transaction", "token-invalid-transaction", "admin-active", 999);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    }, /AUTH_SESSION_ACCOUNT_UNAVAILABLE/);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM batch_effects").get().total, 0, "a rejected guarded insert must roll back earlier writes in the same transactional batch");
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM auth_sessions").get().total, 3);
  } finally {
    db.close();
  }
});

test("ensureDatabase shares one probe, skips bulk work on the v22 marker, and retries a failed fallback", async () => {
  const initializeSource = await source("db/initialize.ts");
  assert.match(initializeSource, /const LATEST_SCHEMA_MARKER = "people_pulse_schema_v22_ready"/);
  assert.match(initializeSource, /SELECT 1 AS ready FROM sqlite_master WHERE type = 'table' AND name = \? LIMIT 1/);
  assert.match(initializeSource, /if \(initialization\) return initialization/);
  assert.match(initializeSource, /initialization = \(async \(\) => \{\s*if \(await latestSchemaIsReady\(d1\)\) return/);
  assert.match(initializeSource, /\}\)\(\)\.catch\(\(error\) => \{\s*initialization = null;\s*throw error/);

  const runnableSource = initializeSource
    .replace('import { getD1 } from ".";', "const getD1 = () => globalThis.__PEOPLE_PULSE_TEST_D1;")
    .replace("let initialization: Promise<unknown> | null = null;", "let initialization = null;")
    .replaceAll("d1: ReturnType<typeof getD1>", "d1")
    .replace(/table: "rewards" \| "point_ledger" \| "point_events" \| "organization_policy_publish_claims" \| "work_items" \| "user_accounts",/, "table,")
    .replace("column: string,", "column,")
    .replace("definition: string,", "definition,")
    .replace(".first<{ ready: number }>()", ".first()")
    .replace("const columns = result.results as Array<{ name: string }>;", "const columns = result.results;")
    .replace("] as const;", "];");
  assert.doesNotMatch(runnableSource, /Promise<unknown>|ReturnType<|\.first<\{| as Array<|\] as const/);

  async function loadInitializer(d1, label) {
    globalThis.__PEOPLE_PULSE_TEST_D1 = d1;
    const moduleSource = `${runnableSource}\n// isolated test module: ${label}`;
    return import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString("base64")}`);
  }

  function fakeD1({ first, batch = async () => [] }) {
    const calls = { prepared: [], binds: [], first: 0, all: 0, run: 0, batches: [] };
    const d1 = {
      prepare(sql) {
        calls.prepared.push(sql);
        return {
          sql,
          bind(value) {
            calls.binds.push(value);
            return this;
          },
          first() {
            calls.first += 1;
            return first(calls.first);
          },
          async all() {
            calls.all += 1;
            return { results: [] };
          },
          async run() {
            calls.run += 1;
            return { success: true };
          },
        };
      },
      batch(statements) {
        const sql = statements.map((statement) => statement.sql);
        calls.batches.push(sql);
        return batch(sql, calls.batches.length);
      },
    };
    return { calls, d1 };
  }

  try {
    let releaseReady;
    const readyProbe = new Promise((resolve) => { releaseReady = resolve; });
    const fast = fakeD1({ first: () => readyProbe });
    const fastInitializer = await loadInitializer(fast.d1, "fast-path");
    const fastFirst = fastInitializer.ensureDatabase();
    const fastConcurrent = fastInitializer.ensureDatabase();
    assert.strictEqual(fastConcurrent, fastFirst, "concurrent callers must share the once-per-isolate promise");
    assert.equal(fast.calls.prepared.length, 1, "the ready fast path must prepare only its sentinel lookup");
    assert.equal(fast.calls.first, 1);
    assert.deepEqual(fast.calls.binds, ["people_pulse_schema_v22_ready"]);
    assert.equal(fast.calls.batches.length, 0);
    assert.equal(fast.calls.all, 0);
    assert.equal(fast.calls.run, 0);
    releaseReady({ ready: 1 });
    await fastFirst;
    assert.strictEqual(fastInitializer.ensureDatabase(), fastFirst, "a resolved isolate must keep reusing the same promise");
    assert.equal(fast.calls.prepared.length, 1);
    assert.doesNotMatch(fast.calls.prepared[0], /CREATE|PRAGMA|ALTER/i);

    let failFirstBatch = true;
    const fallback = fakeD1({
      first: () => undefined,
      batch: async () => {
        if (failFirstBatch) {
          failFirstBatch = false;
          throw new Error("simulated DDL failure");
        }
        return [];
      },
    });
    const fallbackInitializer = await loadInitializer(fallback.d1, "fallback-retry");
    const failedFirst = fallbackInitializer.ensureDatabase();
    const failedConcurrent = fallbackInitializer.ensureDatabase();
    assert.strictEqual(failedConcurrent, failedFirst);
    const failedResults = await Promise.allSettled([failedFirst, failedConcurrent]);
    assert.deepEqual(failedResults.map(({ status }) => status), ["rejected", "rejected"]);
    assert.match(failedResults[0].reason.message, /simulated DDL failure/);

    const retry = fallbackInitializer.ensureDatabase();
    assert.notStrictEqual(retry, failedFirst, "a rejected initialization must clear the cached promise");
    await retry;
    assert.equal(fallback.calls.first, 2, "retry must probe the marker again before rebuilding");
    assert.equal(fallback.calls.batches.length, 3, "one failed bulk batch plus both successful fallback batches are expected");
    assert.ok(fallback.calls.prepared.length > 100, "a missing marker must enter the complete compatibility initializer");
    assert.ok(fallback.calls.all > 0, "the fallback must run compatibility PRAGMA checks");
    assert.ok(fallback.calls.run > 0, "missing compatibility columns must run their ALTER statements");
    const successfulSql = fallback.calls.batches.slice(1).flat();
    assert.ok(successfulSql.some((sql) => sql.includes("DROP TRIGGER IF EXISTS auth_credentials_audit_bootstrap_iteration_repair")));
    assert.ok(successfulSql.some((sql) => sql.includes("CREATE TRIGGER IF NOT EXISTS auth_credentials_audit_bootstrap_legacy_iteration_repair")));
    assert.ok(successfulSql.some((sql) => sql.includes("DROP TRIGGER IF EXISTS auth_sessions_validate_insert")));
    assert.ok(successfulSql.some((sql) => sql.includes("CREATE TRIGGER auth_sessions_validate_insert")));
    assert.match(successfulSql.at(-2), /^PRAGMA optimize$/);
    assert.match(successfulSql.at(-1), /CREATE TABLE IF NOT EXISTS people_pulse_schema_v22_ready/);
    assert.strictEqual(fallbackInitializer.ensureDatabase(), retry);
  } finally {
    delete globalThis.__PEOPLE_PULSE_TEST_D1;
  }
});

test("auth schema, forward trigger and sentinel migrations, journal and built Sites bundle stay in parity", async () => {
  const [
    schema,
    initialize,
    migration,
    packagedMigration,
    snapshot,
    legacyMigration,
    packagedLegacyMigration,
    legacySnapshot,
    markerMigration,
    packagedMarkerMigration,
    markerSnapshot,
    sessionGuardMigration,
    packagedSessionGuardMigration,
    sessionGuardSnapshot,
    selfAssessmentMigration,
    packagedSelfAssessmentMigration,
    selfAssessmentSnapshot,
    registrationMigration,
    packagedRegistrationMigration,
    registrationSnapshot,
    journal,
    packageJson,
  ] = await Promise.all([
    source("db/schema.ts"),
    source("db/initialize.ts"),
    source("drizzle/0016_jittery_lily_hollister.sql"),
    source("dist/.openai/drizzle/0016_jittery_lily_hollister.sql"),
    source("drizzle/meta/0016_snapshot.json").then(JSON.parse),
    source("drizzle/0017_legacy_bootstrap_repair.sql"),
    source("dist/.openai/drizzle/0017_legacy_bootstrap_repair.sql"),
    source("drizzle/meta/0017_snapshot.json").then(JSON.parse),
    source("drizzle/0018_schema_v18_ready.sql"),
    source("dist/.openai/drizzle/0018_schema_v18_ready.sql"),
    source("drizzle/meta/0018_snapshot.json").then(JSON.parse),
    source("drizzle/0019_auth_session_guard.sql"),
    source("dist/.openai/drizzle/0019_auth_session_guard.sql"),
    source("drizzle/meta/0019_snapshot.json").then(JSON.parse),
    source("drizzle/0020_silly_mockingbird.sql"),
    source("dist/.openai/drizzle/0020_silly_mockingbird.sql"),
    source("drizzle/meta/0020_snapshot.json").then(JSON.parse),
    source("drizzle/0021_chubby_malice.sql"),
    source("dist/.openai/drizzle/0021_chubby_malice.sql"),
    source("drizzle/meta/0021_snapshot.json").then(JSON.parse),
    source("drizzle/meta/_journal.json").then(JSON.parse),
    source("package.json").then(JSON.parse),
  ]);

  assert.equal(packagedMigration, migration, "Sites build must package auth migration 0016 verbatim");
  assert.equal(packagedLegacyMigration, legacyMigration, "Sites build must package forward repair migration 0017 verbatim");
  assert.equal(packagedMarkerMigration, markerMigration, "Sites build must package schema marker migration 0018 verbatim");
  assert.equal(packagedSessionGuardMigration, sessionGuardMigration, "Sites build must package session guard migration 0019 verbatim");
  assert.equal(packagedSelfAssessmentMigration, selfAssessmentMigration, "Sites build must package self-assessment migration 0020 verbatim");
  assert.equal(packagedRegistrationMigration, registrationMigration, "Sites build must package registration migration 0021 verbatim");
  assert.equal(journal.entries.at(-7)?.tag, "0016_jittery_lily_hollister");
  assert.equal(journal.entries.at(-6)?.tag, "0017_legacy_bootstrap_repair");
  assert.equal(journal.entries.at(-5)?.tag, "0018_schema_v18_ready");
  assert.equal(journal.entries.at(-4)?.tag, "0019_auth_session_guard");
  assert.equal(journal.entries.at(-3)?.tag, "0020_silly_mockingbird");
  assert.equal(journal.entries.at(-2)?.tag, "0021_chubby_malice");
  assert.equal(journal.entries.at(-1)?.tag, "0022_strong_wrecking_crew");
  assert.equal(legacySnapshot.prevId, snapshot.id, "0017 snapshot must be the direct forward successor to 0016");
  assert.equal(markerSnapshot.prevId, legacySnapshot.id, "0018 snapshot must be the direct forward successor to 0017");
  assert.equal(sessionGuardSnapshot.prevId, markerSnapshot.id, "0019 snapshot must be the direct forward successor to 0018");
  assert.equal(selfAssessmentSnapshot.prevId, sessionGuardSnapshot.id, "0020 snapshot must be the direct forward successor to 0019");
  assert.equal(registrationSnapshot.prevId, selfAssessmentSnapshot.id, "0021 snapshot must be the direct forward successor to 0020");
  assert.equal(packageJson.scripts["auth:bootstrap"], "node scripts/generate-auth-bootstrap.mjs");
  for (const [exportName, tableName] of [
    ["authCredentials", "auth_credentials"],
    ["authSessions", "auth_sessions"],
    ["authRateLimits", "auth_rate_limits"],
    ["authEvents", "auth_events"],
  ]) {
    assert.match(schema, new RegExp(`export const ${exportName} = sqliteTable\\("${tableName}"`));
    assert.match(initialize, new RegExp(`CREATE TABLE IF NOT EXISTS ${tableName}`));
    assert.match(migration, new RegExp("CREATE TABLE `" + tableName + "`"));
  }
  for (const column of ["password_hash", "password_salt", "password_iterations", "pepper_version", "credential_version", "must_change_password"]) {
    assert.match(initialize, new RegExp(column));
    assert.match(migration, new RegExp("`" + column + "`"));
  }
  assert.match(schema, /uniqueIndex\("auth_credentials_login_id_canonical_unique"\)/);
  assert.match(schema, /uniqueIndex\("auth_sessions_token_hash_unique"\)/);
  assert.match(schema, /passwordIterations: integer\("password_iterations"\)\.notNull\(\)\.default\(100000\)/);
  assert.match(initialize, /password_iterations INTEGER NOT NULL DEFAULT 100000/);
  assert.match(migration, /`password_iterations` integer DEFAULT 100000 NOT NULL/);
  assert.equal(snapshot.tables.auth_credentials.columns.password_iterations.default, 100000);
  assert.equal(legacySnapshot.tables.auth_credentials.columns.password_iterations.default, 100000);
  assert.equal(markerSnapshot.tables.auth_credentials.columns.password_iterations.default, 100000);
  assert.equal(sessionGuardSnapshot.tables.auth_credentials.columns.password_iterations.default, 100000);
  assert.equal(selfAssessmentSnapshot.tables.auth_credentials.columns.password_iterations.default, 100000);
  assert.equal(registrationSnapshot.tables.auth_credentials.columns.password_iterations.default, 100000);
  assert.equal(registrationSnapshot.tables.employee_registration_requests.columns.password_algorithm.default, "'pbkdf2-sha256-chain-v1'");
  assert.equal(registrationSnapshot.tables.employee_registration_requests.columns.password_iterations.default, 600000);

  const migrationDrop = legacyMigration.indexOf("DROP TRIGGER IF EXISTS `auth_credentials_audit_bootstrap_iteration_repair`");
  const migrationCreate = legacyMigration.indexOf("CREATE TRIGGER `auth_credentials_audit_bootstrap_legacy_iteration_repair`");
  assert.ok(migrationDrop >= 0 && migrationDrop < migrationCreate, "0017 must replace the restrictive 0016 trigger in forward order");
  const initDrop = initialize.indexOf("DROP TRIGGER IF EXISTS auth_credentials_audit_bootstrap_iteration_repair");
  const initCreate = initialize.indexOf("CREATE TRIGGER IF NOT EXISTS auth_credentials_audit_bootstrap_legacy_iteration_repair");
  assert.ok(initDrop >= 0 && initDrop < initCreate, "fresh initialization must install the same final trigger as the upgrade path");
  assert.doesNotMatch(legacyMigration, /UPDATE [`]?auth_credentials[`]?/, "0017 must not repair any credential without the guarded runtime bootstrap flow");
  assert.match(markerMigration, /^CREATE TABLE `people_pulse_schema_v18_ready` \{?[\s\S]*?`schema_version` integer PRIMARY KEY NOT NULL CHECK \(`schema_version` = 18\)[\s\S]*?\);?\s*$/);
  assert.doesNotMatch(markerMigration, /(?:DROP|ALTER|UPDATE|DELETE|INSERT)\s/i, "0018 must only add the readiness marker after 0017");
  const guardDrop = sessionGuardMigration.indexOf("DROP TRIGGER IF EXISTS `auth_sessions_validate_insert`");
  const guardCreate = sessionGuardMigration.indexOf("CREATE TRIGGER `auth_sessions_validate_insert`");
  const guardMarker = sessionGuardMigration.indexOf("CREATE TABLE `people_pulse_schema_v19_ready`");
  assert.ok(guardDrop >= 0 && guardDrop < guardCreate && guardCreate < guardMarker, "0019 must replace the session guard before publishing its readiness marker");
  for (const guardSource of [initialize, sessionGuardMigration]) {
    const normalizedGuardSource = guardSource.replaceAll("`", "");
    assert.match(normalizedGuardSource, /auth_sessions_validate_insert[\s\S]*?account\.status = 'active'[\s\S]*?account\.role IN \('admin', 'manager', 'employee'\)[\s\S]*?credential\.password_hash <> ''[\s\S]*?credential\.credential_version = NEW\.credential_version/);
    assert.match(normalizedGuardSource, /account\.role = 'admin'[\s\S]*?account\.employee_id IS NOT NULL[\s\S]*?employee\.status = 'active'[\s\S]*?AUTH_SESSION_ACCOUNT_UNAVAILABLE/);
  }
  assert.doesNotMatch(sessionGuardMigration, /(?:ALTER TABLE|UPDATE\s+[`"\w]|DELETE FROM|INSERT INTO)/i, "0019 must install only the insert guard and its readiness marker");
  const freshGuard = initialize.indexOf("CREATE TRIGGER auth_sessions_validate_insert");
  const freshMarker = initialize.indexOf("CREATE TABLE IF NOT EXISTS people_pulse_schema_v22_ready");
  const finalOptimize = initialize.indexOf('d1.prepare("PRAGMA optimize")');
  assert.ok(freshGuard > initCreate, "fresh initialization must retain the legacy bootstrap trigger and then install the session guard");
  assert.ok(freshMarker > freshGuard && freshMarker > finalOptimize, "fresh initialization must create the v22 marker only after all tables and final triggers");
  assert.match(selfAssessmentMigration, /CREATE TABLE `employee_self_assessments`[\s\S]*?CREATE UNIQUE INDEX `employee_self_assessments_employee_period_unique`[\s\S]*?CREATE TABLE `people_pulse_schema_v20_ready`/);
  assert.match(initialize, /CREATE TABLE IF NOT EXISTS employee_self_assessments[\s\S]*?employee_self_assessments_employee_period_unique/);
  assert.match(registrationMigration, /CREATE TABLE `employee_registration_requests`[\s\S]*?employee_registration_pending_login_unique[\s\S]*?ALTER TABLE `user_accounts` ADD `nickname`[\s\S]*?CREATE TABLE `people_pulse_schema_v21_ready`/);
});

test("local auth secrets are ignored by Git and excluded from the Sites bundle", async () => {
  const gitignore = await source(".gitignore");
  assert.match(gitignore, /^\.dev\.vars\*$/m);
  assert.match(gitignore, /^!\.dev\.vars\.example$/m);
  const tracked = spawnSync("git", ["ls-files", "--error-unmatch", ".dev.vars"], {
    cwd: fileURLToPath(projectRoot),
    encoding: "utf8",
  });
  assert.notEqual(tracked.status, 0, ".dev.vars must never be tracked");
  await assert.rejects(access(new URL("../dist/.dev.vars", import.meta.url)));
  const packagedPaths = await readdir(new URL("../dist/", import.meta.url), { recursive: true });
  assert.equal(packagedPaths.some((path) => /(?:^|\/)\.dev\.vars(?:$|\.)/.test(path)), false);
});

test("README defines ID/password onboarding and keeps public access behind a tested cutover gate", async () => {
  const readme = await source("README.md");
  for (const copy of [
    "บัญชีแบบ ID + รหัสผ่าน",
    "npm run auth:bootstrap -- --login-id admin --email owner@example.com --name",
    "PEOPLE_PULSE_PASSWORD_PEPPER_V1",
    "PEOPLE_PULSE_RATE_LIMIT_SECRET",
    "PEOPLE_PULSE_CANONICAL_ORIGIN",
    "PBKDF2-SHA-256",
    "node:crypto",
    "100,000 รอบ",
    "600,000 รอบ",
    "--repair-existing",
    "ถูกยกเลิก",
    "0017_legacy_bootstrap_repair.sql",
    "0018_schema_v18_ready.sql",
    "0019_auth_session_guard.sql",
    "0020_silly_mockingbird.sql",
    "0021_chubby_malice.sql",
    "legacy OAI",
    "credential.password_iterations <> 600000",
    "credential.user_account_id = 'user-owner'",
    "credential.must_change_password <> 0",
    "คืน 0 แถว",
    "ชื่อผู้ใช้ + รหัสผ่านชั่วคราว + บทบาท + โปรไฟล์พนักงาน",
    "public cutover gate",
    "เปลี่ยน access policy กลับเป็น `custom/private`",
  ]) assert.ok(readme.includes(copy), `README must include: ${copy}`);
  assert.doesNotMatch(readme, /npm run auth:bootstrap -- --repair-existing/, "retired repair mode must not remain an operator instruction");
  assert.doesNotMatch(readme, /password_iterations > 100000/, "the public gate must not reject current 600k credentials");
  assert.match(readme, /บัญชี active ทุกบัญชีใช้ 600,000 รอบ/);
  assert.match(readme, /เจ้าของ(?:ระบบ)?เปลี่ยนรหัสชั่วคราวเสร็จ/);
  assert.match(readme, /deploy[\s\S]*?ทดสอบ[\s\S]*?อนุมัติ[\s\S]*?public/i);
  assert.match(readme, /ห้าม[\s\S]*?commit[\s\S]*?PEOPLE_PULSE_PASSWORD_PEPPER_V1/);
});
