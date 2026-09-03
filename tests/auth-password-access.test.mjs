import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, readFile, readdir } from "node:fs/promises";
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
  assert.ok(firstIndex < secondIndex, `${label}: security gate must run before request body parsing`);
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
  assert.equal(output.login.loginId, "owner.admin");
  assert.match(output.login.temporaryPassword, /^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%]{20}$/);
  assert.equal(output.login.mustChangePasswordOnFirstLogin, true);
  assert.equal(environment.PEOPLE_PULSE_PASSWORD_PEPPER_VERSION, "1");
  assert.ok(environment.PEOPLE_PULSE_PASSWORD_PEPPER_V1.length >= 32);
  assert.ok(environment.PEOPLE_PULSE_RATE_LIMIT_SECRET.length >= 32);
  assert.notEqual(environment.PEOPLE_PULSE_PASSWORD_PEPPER_V1, environment.PEOPLE_PULSE_RATE_LIMIT_SECRET);
  assert.match(environment.PEOPLE_PULSE_BOOTSTRAP_PASSWORD_HASH, /^pbkdf2-sha256\$600000\$1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
  assert.doesNotMatch(bootstrapScript, /argument\(["']--password["']\)/);
  assert.match(bootstrapScript, /จะไม่รับรหัสผ่านผ่าน command line/);

  const cryptoModule = new URL("../lib/password-crypto.ts", import.meta.url).href;
  const verificationScript = `
    import {
      AuthConfigurationError,
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
    }));
  `;
  const verified = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "--eval", verificationScript], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    env: {
      ...process.env,
      AUTH_TEST_PASSWORD: output.login.temporaryPassword,
      AUTH_TEST_VERIFIER: environment.PEOPLE_PULSE_BOOTSTRAP_PASSWORD_HASH,
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

test("bootstrap is optional but all-or-none, pre-hashed, once-only, and audited only after insertion", async () => {
  const accessControl = await source("lib/access-control.ts");
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
  assert.match(bootstrap, /if \(existingCredential\) return/);
  assert.match(bootstrap, /\.onConflictDoNothing\(\)/);
  assert.match(bootstrap, /const insertedCredentials = await db\.insert\(authCredentials\)[\s\S]*?\.returning\(\{ userAccountId: authCredentials\.userAccountId \}\)/);
  assert.match(bootstrap, /if \(insertedCredentials\.length\) await recordAuthEvent\("credential_created"/);
  assert.doesNotMatch(bootstrap, /hashPassword\(|temporaryPassword|defaultPassword/i);
});

test("auth schema, runtime initialization, migration journal and built Sites bundle stay in parity", async () => {
  const [schema, initialize, migration, packagedMigration, journal, packageJson] = await Promise.all([
    source("db/schema.ts"),
    source("db/initialize.ts"),
    source("drizzle/0016_jittery_lily_hollister.sql"),
    source("dist/.openai/drizzle/0016_jittery_lily_hollister.sql"),
    source("drizzle/meta/_journal.json").then(JSON.parse),
    source("package.json").then(JSON.parse),
  ]);

  assert.equal(packagedMigration, migration, "Sites build must package auth migration 0016 verbatim");
  assert.equal(journal.entries.at(-1)?.tag, "0016_jittery_lily_hollister");
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
    "รหัสผู้ใช้ + รหัสผ่านชั่วคราว + บทบาท + โปรไฟล์พนักงาน",
    "public cutover gate",
    "เปลี่ยน access policy กลับเป็น `custom/private`",
  ]) assert.ok(readme.includes(copy), `README must include: ${copy}`);
  assert.match(readme, /deploy[\s\S]*?ทดสอบ[\s\S]*?อนุมัติ[\s\S]*?public/i);
  assert.match(readme, /ห้าม[\s\S]*?commit[\s\S]*?PEOPLE_PULSE_PASSWORD_PEPPER_V1/);
});
