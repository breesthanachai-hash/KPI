import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const [pageSource, robotSource, assistantSource, cssSource] = await Promise.all([
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/ai-robot-mascot.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/ai-assistant.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
]);

const robotMarker = "/* Autonomous People AI mascot · lightweight CSS 3D, no extra WebGL context */";
const robotStylesStart = cssSource.indexOf(robotMarker);
const robotStylesEnd = cssSource.indexOf("@media (max-width: 1180px)", robotStylesStart);
const robotStyles = robotStylesStart >= 0 && robotStylesEnd > robotStylesStart
  ? cssSource.slice(robotStylesStart, robotStylesEnd)
  : "";

function cssRule(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
}

function numericProperty(rule, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const value = rule.match(new RegExp(`${escaped}\\s*:\\s*(\\d+)`))?.[1];
  return value ? Number(value) : Number.NaN;
}

test("renders the requested speech exactly once on a real accessible AI button", () => {
  assert.equal(
    (robotSource.match(/สงสัยถามกูได้นะไอ้สัส/g) ?? []).length,
    1,
    "the requested bubble copy must remain exact and must not be duplicated",
  );
  assert.match(robotSource, /<span className="ai-robot-speech" aria-hidden="true">สงสัยถามกูได้นะไอ้สัส<\/span>/);
  assert.match(robotSource, /<button[\s\S]*?type="button"[\s\S]*?className="ai-robot-launcher"[\s\S]*?onClick=\{onOpen\}/);
  assert.match(robotSource, /aria-label="เปิดผู้ช่วย AI"/);
  assert.match(robotSource, /aria-haspopup="dialog"/);
  assert.match(robotSource, /aria-expanded=\{open\}/);
  assert.match(robotSource, /aria-controls="people-ai-panel"/);
  assert.match(robotSource, /aria-describedby="people-ai-robot-description"/);
  assert.match(robotSource, /id="people-ai-robot-description" className="sr-only"/);
  assert.match(robotSource, /className="ai-robot-hide" onClick=\{onHide\} aria-label="ซ่อนหุ่น AI ผู้ช่วย"/);
  assert.match(robotSource, /hidden=\{open \|\| suspended\}/, "the roaming control must leave the screen while a dialog is open");
});

test("wires the mascot to the existing People AI open state without overlapping account menus", () => {
  assert.match(pageSource, /import AiRobotMascot from "\.\/ai-robot-mascot"/);
  const openHandler = pageSource.match(/const openPeopleAi = \(\) => \{[\s\S]*?\n  \};/)?.[0] ?? "";
  assert.ok(openHandler, "expected one shared People AI open handler");
  assert.match(openHandler, /lastFocusedElementRef\.current = document\.activeElement/);
  assert.match(openHandler, /setShowNotifications\(false\)/);
  assert.match(openHandler, /setShowUserMenu\(false\)/);
  assert.match(openHandler, /setShowAiAssistant\(true\)/);
  assert.match(pageSource, /showAiMascot && <AiRobotMascot open=\{showAiAssistant\} suspended=\{hasBlockingOverlay\} onOpen=\{openPeopleAi\} onHide=\{hideAiMascot\} \/>/);
  assert.match(pageSource, /\{ id: "ai", icon: "AI", label: "ผู้ช่วย AI"[^\n]*visible: publicSystemSettings\.features\.aiAssistantEnabled \}/, "the workspace menu must expose the People AI entry");
  assert.match(pageSource, /destinationId === "ai"\) \{\s*openPeopleAi\(\);/, "the workspace menu must route the AI entry through the shared open handler");
  assert.match(pageSource, /<AiAssistant open=\{showAiAssistant\}/);
  assert.match(pageSource, /!isEmployeeUser && publicSystemSettings\.features\.aiAssistantEnabled && <>[\s\S]*?<AiRobotMascot[\s\S]*?<AiAssistant[\s\S]*?<\/>}/);
});

test("offers a persistent visible toggle and keeps the roaming mascot off by default", () => {
  assert.match(pageSource, /AI_MASCOT_VISIBILITY_STORAGE_KEY = "people-pulse-ai-mascot-visible:v1"/);
  assert.match(pageSource, /const \[showAiMascot, setShowAiMascot\] = useState\(false\)/);
  assert.match(pageSource, /localStorage\.getItem\(AI_MASCOT_VISIBILITY_STORAGE_KEY\) === "shown"/);
  assert.match(pageSource, /localStorage\.setItem\(AI_MASCOT_VISIBILITY_STORAGE_KEY, visible \? "shown" : "hidden"\)/);
  assert.match(pageSource, /className="profile-ai-toggle" role="switch" aria-checked=\{showAiMascot\}/);
  assert.match(pageSource, /<strong>แสดงหุ่น AI ผู้ช่วย<\/strong>/);
  assert.match(pageSource, /ซ่อนหุ่น AI แล้ว เปิดกลับได้จากเมนูโปรไฟล์/);
  assert.match(cssSource, /\.profile-ai-toggle\[aria-checked="true"\] > \.profile-ai-switch/);
  assert.match(cssSource, /\.ai-robot-hide[\s\S]*?pointer-events:\s*auto/);
});

test("includes People AI in the shared focus trap, scroll lock, Escape close and focus restore", () => {
  const overlayStart = pageSource.indexOf("const hasOpenOverlay = Boolean(");
  const overlayEnd = pageSource.indexOf("const evaluationsByEmployee", overlayStart);
  assert.ok(overlayStart >= 0 && overlayEnd > overlayStart, "expected the shared overlay accessibility effect");
  const overlayEffect = pageSource.slice(overlayStart, overlayEnd);

  assert.match(pageSource, /const hasBlockingOverlay = Boolean\([\s\S]*?showNotifications \|\| showUserMenu \|\| showWorkspaceMenu \|\| showChangePassword\)/);
  assert.match(overlayEffect, /hasBlockingOverlay \|\| showAiAssistant/);
  assert.match(overlayEffect, /lastFocusedElementRef\.current = document\.activeElement/);
  assert.match(overlayEffect, /document\.body\.style\.overflow = "hidden"/);
  assert.match(overlayEffect, /event\.key === "Tab"/);
  assert.match(overlayEffect, /querySelectorAll<HTMLElement>\('button:not\(\[disabled\]\)[\s\S]*?\[tabindex\]:not\(\[tabindex="-1"\]\)'\)/);
  assert.match(overlayEffect, /event\.key === "Escape"[\s\S]*?setShowAiAssistant\(false\)/);
  assert.match(overlayEffect, /document\.body\.style\.overflow = previousOverflow/);
  assert.match(overlayEffect, /lastFocusedElementRef\.current\?\.focus\(\)/);
  assert.match(overlayEffect, /showNotifications, showUserMenu, showWorkspaceMenu, showChangePassword, showAiAssistant\]\);/);
});

test("keeps the AI backdrop out of the tab order and exposes a focusable named dialog", () => {
  assert.match(
    assistantSource,
    /<button className="ai-assistant-backdrop"[\s\S]*?aria-label="ปิด People AI" tabIndex=\{-1\} \/>/,
  );
  assert.match(
    assistantSource,
    /<aside id="people-ai-panel" className="ai-assistant-panel" role="dialog" aria-modal="true" aria-labelledby="people-ai-title" tabIndex=\{-1\}>/,
  );
  assert.match(assistantSource, /const timer = window\.setTimeout\(\(\) => inputRef\.current\?\.focus\(\), 180\)/);
});

test("builds the mascot with CSS shapes only and avoids another Three or canvas renderer", () => {
  assert.notEqual(robotStylesStart, -1, "expected the autonomous mascot style marker");
  assert.ok(robotStyles, "expected a bounded mascot stylesheet section");
  assert.doesNotMatch(robotSource, /(?:from|import\()\s*["']three["']/i);
  assert.doesNotMatch(robotSource, /<canvas\b|WebGLRenderer|CanvasRenderingContext/i);
  assert.match(robotSource, /<span className="ai-robot-scene" aria-hidden="true">/);
  assert.match(robotSource, /<span className="ai-robot-model">/);
  assert.match(robotStyles, /transform-style:\s*preserve-3d/);
  assert.match(robotStyles, /perspective:\s*720px/);
});

test("lets page controls receive pointer input and keeps the mascot below real overlays", () => {
  const mascotRule = cssRule(robotStyles, ".ai-robot-mascot");
  const launcherRule = cssRule(robotStyles, ".ai-robot-launcher");
  const speechRule = cssRule(robotStyles, ".ai-robot-speech");
  const topUtilitiesRule = cssRule(cssSource, ".top-right-utilities");
  const assistantLayerRule = cssRule(cssSource, ".ai-assistant-layer");
  const modalBackdropRule = cssRule(cssSource, ".modal-backdrop");

  assert.match(mascotRule, /position:\s*fixed/);
  assert.match(mascotRule, /pointer-events:\s*none/);
  assert.match(launcherRule, /pointer-events:\s*auto/);
  assert.match(speechRule, /pointer-events:\s*none/);
  assert.match(robotSource, /button,a\[href\],input,select,textarea,\[role='dialog'\],\.top-right-utilities,\.toast\.show,\.notification-layer,\.top-profile-menu/);
  assert.match(robotSource, /const sampleCount = Math\.max\(2, Math\.ceil\(distance \/ 38\)\)/);
  assert.match(robotSource, /return samples\.every\(positionIsSafe\)/);
  assert.match(robotStyles, /data-mode="walk"\]\s+\.ai-robot-launcher,[\s\S]*?data-mode="stumble"\]\s+\.ai-robot-launcher \{ pointer-events: none; \}/);

  const mascotZ = numericProperty(mascotRule, "z-index");
  const topUtilitiesZ = numericProperty(topUtilitiesRule, "z-index");
  const assistantLayerZ = numericProperty(assistantLayerRule, "z-index");
  const modalBackdropZ = numericProperty(modalBackdropRule, "z-index");
  assert.ok(Number.isFinite(mascotZ) && mascotZ > 0, "the mascot must use a deliberate stacking level");
  assert.ok(mascotZ < modalBackdropZ, "the mascot must stay below standard dialogs");
  assert.ok(mascotZ < topUtilitiesZ, "the mascot must stay below the notification/profile controls");
  assert.ok(mascotZ < assistantLayerZ, "the mascot must stay below the open AI dialog");
});

test("docks safely on mobile and honors reduced-motion and print preferences", () => {
  const mobileStart = robotStyles.indexOf("@media (max-width: 760px)");
  const reducedStart = robotStyles.indexOf("@media (prefers-reduced-motion: reduce)", mobileStart);
  assert.ok(mobileStart >= 0 && reducedStart > mobileStart, "expected mobile and reduced-motion mascot rules");
  const mobileRules = robotStyles.slice(mobileStart, reducedStart);
  const reducedRules = robotStyles.slice(reducedStart);

  assert.match(robotSource, /const compact = window\.innerWidth <= 760/);
  assert.match(robotSource, /compact[\s\S]*?\{ x: minX, y: maxY \}[\s\S]*?\{ x: maxX, y: maxY \}/);
  assert.doesNotMatch(robotSource, /if \(compact\) return \{/);
  assert.match(robotSource, /if \(compact\) return positionIsSafe\(candidate\)/);
  assert.match(robotSource, /window\.addEventListener\("scroll", onResize, \{ passive: true \}\)/);
  assert.match(robotSource, /setTravelMs\(0\)/, "initial and viewport relocation must snap before the next route");
  assert.match(robotSource, /if \(cancelled \|\| reducedMotion\.matches \|\| window\.innerWidth <= 760 \|\| document\.hidden\) return/);
  assert.match(mobileRules, /\.ai-robot-launcher \{ width: 88px; height: 112px; \}/);
  assert.match(mobileRules, /max-width:\s*min\(228px,calc\(100vw - 112px\)\)/);
  assert.match(reducedRules, /\.ai-robot-mascot,\.ai-robot-mascot \* \{ animation: none !important; \}/);
  assert.match(reducedRules, /\.ai-robot-mascot \{ transition: opacity 120ms linear; will-change: auto; \}/);
  assert.match(reducedRules, /\.ai-robot-speech \{ opacity: 0; transform: none; \}/);
  assert.match(reducedRules, /:is\(:hover,:focus-within\) \.ai-robot-speech \{ opacity: 1; \}/);

  const printStart = cssSource.indexOf("@media print", robotStylesEnd);
  const printEnd = cssSource.indexOf("/* Production readiness UI states */", printStart);
  assert.ok(printStart >= 0 && printEnd > printStart, "expected the print stylesheet after the mascot rules");
  const printRules = cssSource.slice(printStart, printEnd);
  assert.match(printRules, /\.topbar,\.ai-assistant-launch,\.ai-robot-mascot,\.ai-assistant-panel,[^{]+\{ display: none !important; \}/);
});

test("ships the robot and its exact message in the built client bundle", async () => {
  const assetRoot = new URL("../dist/client/assets/", import.meta.url);
  const assetNames = (await readdir(assetRoot)).filter((name) => name.endsWith(".js"));
  assert.ok(assetNames.length, "expected built client JavaScript assets");
  const bundle = (await Promise.all(assetNames.map((name) => readFile(new URL(name, assetRoot), "utf8")))).join("\n");

  assert.match(bundle, /สงสัยถามกูได้นะไอ้สัส/);
  assert.match(bundle, /ai-robot-mascot/);
  assert.match(bundle, /ai-robot-launcher/);
  assert.match(bundle, /แสดงหุ่น AI ผู้ช่วย/);
  assert.match(bundle, /people-pulse-ai-mascot-visible:v1/);
  assert.match(bundle, /people-ai-panel/);
});
