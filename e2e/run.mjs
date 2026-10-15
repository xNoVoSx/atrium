// End-to-end test of the Atrium panel against a real Home Assistant.
//
// Two clients side by side, logged in as a non-admin test user:
//   - app:     phone viewport with touch, Companion-app user agent and the
//              external-auth bridge the Android app injects
//   - desktop: 1440 px browser with the normal stored-token login
// Only ATRIUM_TEST_LIGHT is switched; its state is restored at the end.
// Screenshots land in e2e/screenshots/ (not committed) - look at them.

import { mkdirSync, readFileSync } from "node:fs";
import { chromium, devices } from "playwright";
import {
  adminRest,
  adminWs,
  browserProxy,
  clickThemeButton,
  companionAppBridge,
  contrastIssues,
  loadConfig,
  login,
  plantStyle,
  readPanel,
  storedTokens,
  tileButton,
  waitFor,
} from "./lib.mjs";

const SHOTS = new URL("./screenshots/", import.meta.url).pathname;
const manifest = JSON.parse(
  readFileSync(new URL("../custom_components/atrium/manifest.json", import.meta.url), "utf8"),
);

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const cfg = loadConfig();
  const browser = await chromium.launch({ proxy: browserProxy() });
  const adminCtx = await browser.newContext();

  // Ground truth from the server.
  const [registry, info] = await adminWs(adminCtx, cfg, [
    { type: "config/entity_registry/list" },
    { type: "atrium/info" },
  ]);
  const notAuto = new Set(
    registry
      .filter((e) => e.entity_id.startsWith("light.") && (e.hidden_by || e.entity_category))
      .map((e) => e.entity_id),
  );
  const before = await adminRest(cfg, `states/${cfg.testLight}`);

  const [appTokens, deskTokens] = [await login(cfg), await login(cfg)];

  const pixel = devices["Pixel 7"];
  const app = await browser.newContext({
    ...pixel,
    userAgent: `${pixel.userAgent} Home Assistant/2026.10.0-e2e (Android 15; Pixel 7)`,
  });
  await app.addInitScript(companionAppBridge, {
    accessToken: appTokens.access_token,
    expiresIn: appTokens.expires_in,
  });
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await desk.addInitScript(storedTokens, {
    access_token: deskTokens.access_token,
    refresh_token: deskTokens.refresh_token,
    token_type: "Bearer",
    expires_in: deskTokens.expires_in,
    expires: Date.now() + deskTokens.expires_in * 1000,
    hassUrl: cfg.haUrl,
    clientId: cfg.clientId,
  });

  const appPage = await app.newPage();
  const deskPage = await desk.newPage();
  const errors = { app: [], desktop: [] };
  for (const [name, page] of [
    ["app", appPage],
    ["desktop", deskPage],
  ]) {
    page.on("console", (m) => m.type() === "error" && errors[name].push(m.text()));
    page.on("pageerror", (e) => errors[name].push(String(e)));
  }

  const t0 = Date.now();
  await Promise.all([
    appPage.goto(`${cfg.haUrl}/atrium?external_auth=1`),
    deskPage.goto(`${cfg.haUrl}/atrium`),
  ]);
  const ready = (page) => waitFor(async () => (await readPanel(page))?.tiles.length > 0, { timeout: 30000 });
  const rendered = (await ready(appPage)) != null && (await ready(deskPage)) != null;
  check("panel renders (app + desktop)", rendered, `${Date.now() - t0} ms`);
  if (!rendered) {
    await appPage.screenshot({ path: `${SHOTS}failed-app.png` });
    await deskPage.screenshot({ path: `${SHOTS}failed-desktop.png` });
    console.log("console errors:", JSON.stringify(errors, null, 1));
    throw new Error("panel did not render; see failed-*.png");
  }
  for (const page of [appPage, deskPage]) {
    await page.waitForFunction(() => !document.getElementById("ha-launch-screen"), null, { timeout: 15000 });
  }

  const appPanel = await readPanel(appPage);
  const deskPanel = await readPanel(deskPage);
  check("app mode talks to the external bus", (await appPage.evaluate(() => window.__busLog)).includes("config/get"));
  check("app is narrow, desktop is not", appPanel.narrow && !deskPanel.narrow);
  check("menu button only on narrow screens", appPanel.menuShown && !deskPanel.menuShown);

  for (const [name, panel] of [
    ["app", appPanel],
    ["desktop", deskPanel],
  ]) {
    const ids = panel.tiles.map((t) => t.entityId);
    const leaked = ids.filter((id) => notAuto.has(id));
    check(`${name}: no hidden or config lights`, leaked.length === 0, leaked.join(", ") || `${ids.length} tiles`);
    check(`${name}: test light shown`, ids.includes(cfg.testLight));
    check(`${name}: version ${manifest.version}`, panel.version === manifest.version, panel.version);
    check(
      `${name}: loaded the bundle the server serves`,
      panel.bundleUrl?.endsWith(`?v=${info.frontend_hash}`),
      panel.bundleUrl?.split("?")[1],
    );
    check(`${name}: closed control is invisible`, panel.control.visibility === "hidden");
  }
  await appPage.screenshot({ path: `${SHOTS}app.png`, fullPage: true });
  await deskPage.screenshot({ path: `${SHOTS}desktop.png`, fullPage: true });

  // Live sync: switch on the desktop, measure until the app shows it.
  const target = before.state === "on" ? "off" : "on";
  const rendersBefore = (await readPanel(appPage)).tiles;
  await (await tileButton(deskPage, cfg.testLight)).click();
  const stateIs = (page) => async () =>
    (await readPanel(page)).tiles.find((t) => t.entityId === cfg.testLight)?.state === target;
  const deskMs = await waitFor(stateIs(deskPage), { timeout: 5000 });
  const appMs = await waitFor(stateIs(appPage), { timeout: 5000 });
  check("desktop tap switches the light", deskMs != null, `${deskMs} ms`);
  check("app shows the change live", appMs != null, `+${appMs} ms`);
  const rerendered = (await readPanel(appPage)).tiles
    .filter((t) => t.renders !== rendersBefore.find((b) => b.entityId === t.entityId)?.renders)
    .map((t) => t.entityId);
  check("only the changed tile re-rendered", rerendered.every((id) => id === cfg.testLight), rerendered.join(", "));

  // Phone: long press opens the bottom sheet.
  const box = await (await tileButton(appPage, cfg.testLight)).boundingBox();
  await appPage.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await appPage.mouse.down();
  await appPage.waitForTimeout(700);
  await appPage.mouse.up();
  await appPage.waitForTimeout(400);
  const appOpen = await readPanel(appPage);
  check("app: long press opens the control", appOpen.control.open && appOpen.control.visibility === "visible");
  check(
    "app: control is a bottom sheet",
    appOpen.control.mode === "sheet" && Math.abs(appOpen.control.rect.bottom - appOpen.viewport.h) < 2,
  );
  await appPage.screenshot({ path: `${SHOTS}app-control.png` });
  await appPage.keyboard.press("Escape");
  await appPage.waitForTimeout(400);
  check("app: Escape closes the control", !(await readPanel(appPage)).control.open);

  // Desktop: right click opens a centred dialog, every time.
  for (const round of [1, 2]) {
    await (await tileButton(deskPage, cfg.testLight)).click({ button: "right" });
    await deskPage.waitForTimeout(400);
    const open = await readPanel(deskPage);
    const mid = (open.control.rect.top + open.control.rect.bottom) / 2;
    check(
      `desktop: right click #${round} opens a centred dialog`,
      open.control.open && open.control.mode === "dialog" && Math.abs(mid - open.viewport.h / 2) < 4,
    );
    if (round === 1) check("dimmable light: brightness slider shown", open.control.dimHidden === false);
    await deskPage.keyboard.press("Escape");
    await deskPage.waitForTimeout(400);
  }

  // A light without brightness support gets no slider.
  const states = await adminRest(cfg, "states");
  const onOff = states.find(
    (s) =>
      deskPanel.tiles.some((t) => t.entityId === s.entity_id) &&
      (s.attributes.supported_color_modes ?? []).every((m) => m === "onoff"),
  );
  if (onOff) {
    await (await tileButton(deskPage, onOff.entity_id)).click({ button: "right" });
    await deskPage.waitForTimeout(400);
    check("on/off light: no brightness slider", (await readPanel(deskPage)).control.dimHidden === true, onOff.entity_id);
    await deskPage.keyboard.press("Escape");
    await deskPage.waitForTimeout(400);
  }

  // Readability in both themes, with the dialog open so it is measured too.
  for (const theme of ["dark", "light"]) {
    await clickThemeButton(deskPage, theme);
    await (await tileButton(deskPage, cfg.testLight)).click({ button: "right" });
    await deskPage.waitForTimeout(400);
    const panel = await readPanel(deskPage);
    check(`${theme}: theme applied and dialog open`, panel.theme === theme && panel.control.open);
    const issues = await contrastIssues(deskPage);
    check(`${theme}: text contrast (WCAG AA)`, issues.length === 0, issues.slice(0, 6).join(", "));
    await deskPage.screenshot({ path: `${SHOTS}desktop-${theme}.png` });
    if (theme === "light") {
      await plantStyle(deskPage, ".seg button { color: #dfe1de !important; }");
      check("contrast check detects a planted failure", (await contrastIssues(deskPage)).length > 0);
      await plantStyle(deskPage, null);
    }
    await deskPage.keyboard.press("Escape");
    await deskPage.waitForTimeout(400);
  }
  await clickThemeButton(deskPage, "auto");

  // Reloading the entry with an unchanged bundle must not reload open pages.
  await appPage.evaluate(() => (window.__e2eMarker = true));
  const [entry] = await adminRest(cfg, "config/config_entries/entry?domain=atrium");
  await adminRest(cfg, `config/config_entries/entry/${entry.entry_id}/reload`, {});
  await appPage.waitForTimeout(2500);
  check("unchanged bundle: open pages stay", await appPage.evaluate(() => window.__e2eMarker === true));

  // Restore the test light.
  if (before.state === "on") {
    await adminRest(cfg, "services/light/turn_on", { entity_id: cfg.testLight, brightness: before.attributes.brightness });
  } else {
    await adminRest(cfg, "services/light/turn_off", { entity_id: cfg.testLight });
  }
  const restored = await waitFor(
    async () => (await readPanel(appPage)).tiles.find((t) => t.entityId === cfg.testLight)?.state === before.state,
    { timeout: 5000 },
  );
  check("test light restored", restored != null, before.state);

  for (const [name, list] of Object.entries(errors)) {
    check(`${name}: no console errors`, list.length === 0, list.slice(0, 3).join(" | "));
  }

  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed. Screenshots: ${SHOTS}`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
