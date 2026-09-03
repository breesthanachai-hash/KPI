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
  assert.match(output.login.temporaryPassword, /^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%]{20}$/);
  assert.equal(output.login.mustChangePasswordOnFirstLogin, true);
  assert.equal(environment.PEOPLE_PULSE_PASSWORD_PEPPER_VERSION, "1");
  assert.ok(environment.PEOPLE_PULSE_PASSWORD_PEPPER_V1.length >= 32);
  assert.ok(environment.PEOPLE_PULSE_RATE_LIMIT_SECRET.length >= 32);
  assert.notEqual(environment.PEOPLE_PULSE_PASSWORD_PEPPER_V1, environment.PEOPLE_PULSE_RATE_LIMIT_SECRET);
  assert.match(environment.PEOPLE_PULSE_BOOTSTRAP_PASSWORD_HASH, /^pbkdf2-sha256\$100000\$1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
  assert.doesNotMatch(bootstrapScript, /argument\(["']--password["']\)/);
  assert.match(bootstrapScript, /จะไม่รับรหัสผ่านผ่าน command line/);

  const repaired = spawnSync(process.execPath, [
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
  assert.equal(repaired.status, 0, repaired.stderr || "repair generator must reuse the existing pepper");
  const repairOutput = JSON.parse(repaired.stdout);
  const repairEnvironment = Object.fromEntries(repairOutput.environment.map(({ key, value }) => [key, value]));
  assert.equal(repairOutput.mode, "repair-existing");
  assert.match(repairEnvironment.PEOPLE_PULSE_BOOTSTRAP_PASSWORD_HASH, /^pbkdf2-sha256\$100000\$1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
  assert.equal(repairEnvironment.PEOPLE_PULSE_PASSWORD_PEPPER_VERSION, "1");
  assert.equal("PEOPLE_PULSE_PASSWORD_PEPPER_V1" in repairEnvironment, false, "repair mode must not rotate or emit the existing pepper");
  assert.equal("PEOPLE_PULSE_RATE_LIMIT_SECRET" in repairEnvironment, false, "repair mode must not rotate or emit the rate-limit secret");

  const refusedRepair = spawnSync(process.execPath, [
    fileURLToPath(new URL("../scripts/generate-auth-bootstrap.mjs", import.meta.url)),
    "--repair-existing", "--login-id", "owner.admin", "--email", "owner@example.com",
  ], {
    encoding: "utf8",
    env: {
      ...process.env,
      PEOPLE_PULSE_PASSWORD_PEPPER_VERSION: "1",
      PEOPLE_PULSE_PASSWORD_PEPPER_V1: "",
    },
  });
  assert.notEqual(refusedRepair.status, 0);
  assert.match(refusedRepair.stderr, /ต้องมี PEOPLE_PULSE_PASSWORD_PEPPER_V1 เดิม/);

  const refusedWrongVersion = spawnSync(process.execPath, [
    fileURLToPath(new URL("../scripts/generate-auth-bootstrap.mjs", import.meta.url)),
    "--repair-existing", "--login-id", "owner.admin", "--email", "owner@example.com",
  ], {
    encoding: "utf8",
    env: {
      ...process.env,
      PEOPLE_PULSE_PASSWORD_PEPPER_VERSION: "2",
      PEOPLE_PULSE_PASSWORD_PEPPER_V1: environment.PEOPLE_PULSE_PASSWORD_PEPPER_V1,
    },
  });
  assert.notEqual(refusedWrongVersion.status, 0);
  assert.match(refusedWrongVersion.stderr, /รองรับ credential เดิมที่ใช้ pepper version 1 เท่านั้น/);

  const cryptoModule = new URL("../lib/password-crypto.ts", import.meta.url).href;
  const verificationScript = `
    import {
      AuthConfigurationError,
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
    const repairPassword = process.env.AUTH_TEST_REPAIR_PASSWORD;
    const repairSerialized = process.env.AUTH_TEST_REPAIR_VERIFIER;
    const parsed = parsePasswordVerifier(serialized);
    const repairParsed = parsePasswordVerifier(repairSerialized);
    const correct = parsed ? await verifyPassword(password, parsed) : false;
    const wrong = parsed ? await verifyPassword(password + "x", parsed) : true;
    const repairCorrect = repairParsed ? await verifyPassword(repairPassword, repairParsed) : false;
    const overLimitParsed = parsePasswordVerifier(serialized.replace("$100000$", "$100001$"));
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
      repairParsed: Boolean(repairParsed),
      repairCorrect,
      overLimitRejected: overLimitParsed === null,
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
      AUTH_TEST_REPAIR_PASSWORD: repairOutput.login.temporaryPassword,
      AUTH_TEST_REPAIR_VERIFIER: repairEnvironment.PEOPLE_PULSE_BOOTSTRAP_PASSWORD_HASH,
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
    repairParsed: true,
    repairCorrect: true,
    overLimitRejected: true,
    runtimeCorrect: true,
    iterations: 100_000,
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
    expectedIterations: 100_000,
    maximumIterations: 100_000,
  });
});

test("the runtime uses async native PBKDF2 with fixed-vector parity and rejects unsupported work before the KDF", async () => {
  const [passwordCrypto, generator, viteConfig, schema, initialize, migration, snapshot] = await Promise.all([
    source("lib/password-crypto.ts"),
    source("scripts/generate-auth-bootstrap.mjs"),
    source("vite.config.ts"),
    source("db/schema.ts"),
    source("db/initialize.ts"),
    source("drizzle/0016_jittery_lily_hollister.sql"),
    source("drizzle/meta/0016_snapshot.json").then(JSON.parse),
  ]);

  assert.match(passwordCrypto, /export const PASSWORD_ITERATIONS = 100_000/);
  assert.match(passwordCrypto, /export const MAX_PASSWORD_ITERATIONS = 100_000/);
  assert.match(passwordCrypto, /verifier\.passwordIterations < PASSWORD_ITERATIONS \|\| verifier\.passwordIterations > MAX_PASSWORD_ITERATIONS/);
  assert.match(passwordCrypto, /passwordIterations < PASSWORD_ITERATIONS \|\| passwordIterations > MAX_PASSWORD_ITERATIONS/);
  const deriveBlock = passwordCrypto.match(/async function derivePasswordHash[\s\S]*?(?=\nfunction currentPepperVersion)/)?.[0] ?? "";
  assertBefore(
    deriveBlock,
    /iterations > MAX_PASSWORD_ITERATIONS/,
    /derivePbkdf2WithNodeCrypto\(/,
    "PBKDF2 platform ceiling",
  );
  assert.match(deriveBlock, /Password iteration count is unsupported on this platform/);
  assert.match(passwordCrypto, /import \{ pbkdf2 \} from "node:crypto"/);
  assert.match(deriveBlock, /crypto\.subtle\.importKey\("raw", encoder\.encode\(pepper\), \{ name: "HMAC", hash: "SHA-256" \}/);
  assert.match(deriveBlock, /crypto\.subtle\.sign\("HMAC", pepperKey, encoder\.encode\(password\.normalize\("NFC"\)\)\)/);
  assert.match(deriveBlock, /return new Promise<Uint8Array>\(\(resolve, reject\) => \{[\s\S]*?pbkdf2\(password, salt, iterations, PASSWORD_HASH_BYTES, "sha256", \(error, derivedKey\) =>/);
  assert.doesNotMatch(passwordCrypto, /pbkdf2Sync|crypto\.subtle\.deriveBits|name: "PBKDF2"/);
  assert.match(viteConfig, /compatibility_flags: \["nodejs_compat"\]/);
  assert.match(generator, /const PASSWORD_ITERATIONS = 100_000/);
  assert.match(generator, /createHmac\("sha256", pepper\)[\s\S]*?password\.normalize\("NFC"\)/);
  assert.match(generator, /pbkdf2Sync\(pepperedPassword, salt, PASSWORD_ITERATIONS, 32, "sha256"\)/);
  assert.match(schema, /passwordIterations: integer\("password_iterations"\)\.notNull\(\)\.default\(100000\)/);
  assert.match(initialize, /password_iterations INTEGER NOT NULL DEFAULT 100000/);
  assert.match(migration, /`password_iterations` integer DEFAULT 100000 NOT NULL/);
  assert.equal(snapshot.tables.auth_credentials.columns.password_iterations.default, 100000);
  assert.doesNotMatch(`${passwordCrypto}\n${generator}\n${schema}`, /600_000|600000/);

  const fixedPassword = "People Pulse fixed vector – รหัสผ่าน";
  const fixedVerifier = "pbkdf2-sha256$100000$1$AAECAwQFBgcICQoLDA0ODw$me-DHdEkZqHOISG6329gWohf7sLJ3JtlHj5z-fLc11E";
  const cryptoModule = new URL("../lib/password-crypto.ts", import.meta.url).href;
  const fixedVectorScript = `
    import { parsePasswordVerifier, verifyPassword } from ${JSON.stringify(cryptoModule)};
    const verifier = parsePasswordVerifier(process.env.AUTH_FIXED_VERIFIER);
    const correct = verifier ? await verifyPassword(process.env.AUTH_FIXED_PASSWORD, verifier) : false;
    const wrong = verifier ? await verifyPassword(process.env.AUTH_FIXED_PASSWORD + "x", verifier) : true;
    process.stdout.write(JSON.stringify({ parsed: Boolean(verifier), correct, wrong }));
  `;
  const fixedVectorResult = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "--eval", fixedVectorScript], {
    encoding: "utf8",
    env: {
      ...process.env,
      AUTH_FIXED_PASSWORD: fixedPassword,
      AUTH_FIXED_VERIFIER: fixedVerifier,
      PEOPLE_PULSE_PASSWORD_PEPPER_VERSION: "1",
      PEOPLE_PULSE_PASSWORD_PEPPER_V1: "0123456789abcdef0123456789abcdef0123456789abcdef",
    },
  });
  assert.equal(fixedVectorResult.status, 0, fixedVectorResult.stderr || "native PBKDF2 fixed vector must execute");
  assert.deepEqual(JSON.parse(fixedVectorResult.stdout), { parsed: true, correct: true, wrong: false });
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
  const centralGate = accessControl.match(/export async function authenticatedRequestGate[\s\S]*?(?=\nexport async function ensureBootstrapAccounts)/)?.[0] ?? "";
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
  assert.match(logoutRoute, /if \(!currentUser\)[\s\S]*?clearSessionCookie\(request\)[\s\S]*?loggedOut: true/);
  assert.match(dashboardRoute, /accessDenied: true \}, \{ status: 403 \}/);
  assert.match(authService, /status: 401 \| 429/);
});

test("sessions use a 256-bit opaque cookie, persist only its hash, and validate live access", async () => {
  const [accessControl, schema] = await Promise.all([
    source("lib/access-control.ts"),
    source("db/schema.ts"),
  ]);
  const createSession = accessControl.match(/export async function createSession[\s\S]*?(?=\nexport async function revokeRequestSession)/)?.[0] ?? "";

  assert.match(accessControl, /const HTTPS_SESSION_COOKIE = "__Host-pp_session"/);
  assert.match(accessControl, /const HTTP_DEV_SESSION_COOKIE = "pp_session_dev"/);
  assert.match(accessControl, /const SESSION_TOKEN_BYTES = 32/);
  assert.match(createSession, /const token = randomToken\(SESSION_TOKEN_BYTES\)/);
  assert.match(createSession, /const tokenHash = await hashOpaqueToken\(token\)/);
  assert.match(createSession, /insert\(authSessions\)\.values\(\{[\s\S]*?tokenHash,[\s\S]*?credentialVersion/);
  assert.doesNotMatch(schema.match(/export const authSessions[\s\S]*?\n\]\);/)?.[0] ?? "", /\btoken:\s*text/);
  assert.match(accessControl, /`\$\{sessionCookieName\(request\)\}=\$\{token\}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=\$\{maxAge\}\$\{secure \? "; Secure" : ""\}`/);
  assert.match(accessControl, /\^\[A-Za-z0-9_-\]\{43\}\$/);
  assert.match(accessControl, /credential\.credentialVersion !== session\.credentialVersion/);
  assert.match(accessControl, /account\.status !== "active"/);
  assert.match(accessControl, /linkedEmployee\.status !== "active"/);
  assert.match(accessControl, /const liveDepartmentId = getRole\(linkedEmployee\.roleId\)\.departmentId/);
  assert.match(accessControl, /revokeReason: "account-unavailable"/);
  assert.match(accessControl, /revokeReason: "employee-link-unavailable"/);
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
  assert.match(authService, /attemptCount: sql`CASE[\s\S]*?\$\{authRateLimits\.attemptCount\} \+ 1 > \$\{limit\} THEN \$\{blockedUntil\}/);
  assert.match(authService, /id: `auth-rate-limit:\$\{bucketType\}:\$\{keyHash\}:\$\{windowStartedAt\}`[\s\S]*?onConflictDoNothing\(\)/);
  assert.match(loginBlock, /if \(credential && !locked && passwordWithinLimit\)[\s\S]*?else \{\s*await dummyVerifyPassword/);
  assert.match(authService, /privateLookupHash\("login-rate-login-id"/);
  assert.match(authService, /privateLookupHash\("login-rate-source"/);
  assert.match(authService, /const cloudflareAddress = request\.headers\.get\("cf-connecting-ip"\)/);
  assert.match(authService, /isLocalHostname|url\.hostname === "localhost"/);
  assert.match(authService, /request\.headers\.get\("x-forwarded-for"\)[\s\S]*?"local-development"/);
});

test("password and access mutations revoke sessions, reject self-admin edits, and close stale credential races", async () => {
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
  assert.match(page, /เปลี่ยนรหัสผ่านจากเมนูโปรไฟล์/);
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
  assert.match(page, /รหัสผู้ใช้สำหรับเข้าสู่ระบบ/);
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
  const bootstrap = accessControl.match(/export async function ensureBootstrapAccounts[\s\S]*?(?=\nexport async function authenticateRequest)/)?.[0] ?? "";

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
    "existingCredential.passwordIterations > 100_000",
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
    "gt(authCredentials.passwordIterations, 100_000)",
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

test("auth schema, forward trigger upgrade, migration journal and built Sites bundle stay in parity", async () => {
  const [schema, initialize, migration, packagedMigration, snapshot, legacyMigration, packagedLegacyMigration, legacySnapshot, journal, packageJson] = await Promise.all([
    source("db/schema.ts"),
    source("db/initialize.ts"),
    source("drizzle/0016_jittery_lily_hollister.sql"),
    source("dist/.openai/drizzle/0016_jittery_lily_hollister.sql"),
    source("drizzle/meta/0016_snapshot.json").then(JSON.parse),
    source("drizzle/0017_legacy_bootstrap_repair.sql"),
    source("dist/.openai/drizzle/0017_legacy_bootstrap_repair.sql"),
    source("drizzle/meta/0017_snapshot.json").then(JSON.parse),
    source("drizzle/meta/_journal.json").then(JSON.parse),
    source("package.json").then(JSON.parse),
  ]);

  assert.equal(packagedMigration, migration, "Sites build must package auth migration 0016 verbatim");
  assert.equal(packagedLegacyMigration, legacyMigration, "Sites build must package forward repair migration 0017 verbatim");
  assert.equal(journal.entries.at(-2)?.tag, "0016_jittery_lily_hollister");
  assert.equal(journal.entries.at(-1)?.tag, "0017_legacy_bootstrap_repair");
  assert.equal(legacySnapshot.prevId, snapshot.id, "0017 snapshot must be the direct forward successor to 0016");
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

  const migrationDrop = legacyMigration.indexOf("DROP TRIGGER IF EXISTS `auth_credentials_audit_bootstrap_iteration_repair`");
  const migrationCreate = legacyMigration.indexOf("CREATE TRIGGER `auth_credentials_audit_bootstrap_legacy_iteration_repair`");
  assert.ok(migrationDrop >= 0 && migrationDrop < migrationCreate, "0017 must replace the restrictive 0016 trigger in forward order");
  const initDrop = initialize.indexOf("DROP TRIGGER IF EXISTS auth_credentials_audit_bootstrap_iteration_repair");
  const initCreate = initialize.indexOf("CREATE TRIGGER IF NOT EXISTS auth_credentials_audit_bootstrap_legacy_iteration_repair");
  assert.ok(initDrop >= 0 && initDrop < initCreate, "fresh initialization must install the same final trigger as the upgrade path");
  assert.doesNotMatch(legacyMigration, /UPDATE [`]?auth_credentials[`]?/, "0017 must not repair any credential without the guarded runtime bootstrap flow");
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
    "100,000 รอบ",
    "--repair-existing",
    "0017_legacy_bootstrap_repair.sql",
    "legacy OAI",
    "login_succeeded",
    "generic-credential-failure",
    "session **0 แถว**",
    "WHERE password_iterations > 100000",
    "AND user_account_id <> 'user-owner'",
    "ต้องคืน 0 แถว",
    "รหัสผู้ใช้ + รหัสผ่านชั่วคราว + บทบาท + โปรไฟล์พนักงาน",
    "public cutover gate",
    "เปลี่ยน access policy กลับเป็น `custom/private`",
  ]) assert.ok(readme.includes(copy), `README must include: ${copy}`);
  assert.match(readme, /deploy[\s\S]*?ทดสอบ[\s\S]*?อนุมัติ[\s\S]*?public/i);
  assert.match(readme, /ห้าม[\s\S]*?commit[\s\S]*?PEOPLE_PULSE_PASSWORD_PEPPER_V1/);
});
