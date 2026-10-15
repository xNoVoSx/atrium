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
  clickNav,
  clickThemeButton,
  companionAppBridge,
  contrastIssues,
  loadConfig,
  login,
  plantStyle,
  readPanel,
  openClimateControl,
  storedTokens,
  swipe,
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
  // While the test reloads the config entry on purpose, Home Assistant briefly
  // removes the panel and its own frontend logs errors; those are not Atrium's.
  let expectingReload = false;
  for (const [name, page] of [
    ["app", appPage],
    ["desktop", deskPage],
  ]) {
    page.on("console", (m) => m.type() === "error" && !expectingReload && errors[name].push(m.text()));
    page.on("pageerror", (e) => !expectingReload && errors[name].push(String(e)));
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
  check("phone: bottom navigation, desktop: rail", appPanel.nav === "bottom" && deskPanel.nav === "rail");
  check("navigation labels fit", appPanel.navLabelsFit && deskPanel.navLabelsFit);
  check("home page is shown first", appPanel.page === "atrium-home-page" && deskPanel.page === "atrium-home-page");

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

  // Status: garage door always shown in its real state; thermostat window detection is not.
  const allStates = await adminRest(cfg, "states");
  const garage = allStates.find(
    (s) => s.entity_id.startsWith("binary_sensor.") && s.attributes.device_class === "garage_door",
  );
  const status = await deskPage.evaluate(() => {
    const deep = (root, sel) => {
      const hit = root.querySelector(sel);
      if (hit) return hit;
      for (const el of root.querySelectorAll("*")) if (el.shadowRoot) { const x = deep(el.shadowRoot, sel); if (x) return x; }
      return null;
    };
    const module = deep(document, "atrium-status-module");
    const rows = [...(module?.shadowRoot.querySelectorAll("button.row") ?? [])];
    return {
      garages: rows.filter((r) => r.dataset.garage).map((r) => ({ id: r.dataset.garage, open: r.classList.contains("open") })),
      texts: rows.map((r) => r.textContent.replace(/\s+/g, " ").trim()),
    };
  });
  if (garage) {
    const row = status.garages.find((g) => g.id === garage.entity_id);
    check(
      "garage door row shows its real state",
      row && row.open === (garage.state === "on"),
      `${garage.state} -> ${row?.open ? "red" : "green"}`,
    );
  }
  const trvWindows = allStates.filter(
    (s) => s.attributes.device_class === "window" && /heizung|thermostat|trv/i.test(s.attributes.friendly_name ?? ""),
  );
  check(
    "thermostat window detection is not listed",
    trvWindows.every((w) => !status.texts.some((txt) => txt.includes(w.attributes.friendly_name))),
    `${trvWindows.length} thermostat window sensors`,
  );

  // Live sync: switch on the desktop, measure until the app shows it.
  const target = before.state === "on" ? "off" : "on";
  const rendersBefore = (await readPanel(appPage))?.tiles;
  await (await tileButton(deskPage, cfg.testLight)).click();
  const stateIs = (page) => async () =>
    (await readPanel(page))?.tiles.find((t) => t.entityId === cfg.testLight)?.state === target;
  const deskMs = await waitFor(stateIs(deskPage), { timeout: 5000 });
  const appMs = await waitFor(stateIs(appPage), { timeout: 5000 });
  check("desktop tap switches the light", deskMs != null, `${deskMs} ms`);
  check("app shows the change live", appMs != null, `+${appMs} ms`);
  const rerendered = (await readPanel(appPage))?.tiles
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
  check("app: Escape closes the control", !(await readPanel(appPage))?.control.open);

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
    check("on/off light: no brightness slider", (await readPanel(deskPage))?.control.dimHidden === true, onOff.entity_id);
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
      await plantStyle(deskPage, ".date { color: #dfe1de !important; }");
      check("contrast check detects a planted failure", (await contrastIssues(deskPage)).length > 0);
      await plantStyle(deskPage, null);
    }
    await deskPage.keyboard.press("Escape");
    await deskPage.waitForTimeout(400);
  }
  await clickThemeButton(deskPage, "auto");

  // Navigation: rooms overview -> a room -> back home, in app mode.
  await clickNav(appPage, "rooms");
  await waitFor(async () => (await readPanel(appPage))?.page === "atrium-rooms-page", { timeout: 5000 });
  const roomHref = await appPage.evaluate(() => {
    const find = (root) => {
      const hit = root.querySelector("atrium-rooms-module");
      if (hit) return hit;
      for (const el of root.querySelectorAll("*")) if (el.shadowRoot) { const x = find(el.shadowRoot); if (x) return x; }
      return null;
    };
    const link = find(document).shadowRoot.querySelector("a");
    link.click();
    return link.getAttribute("href");
  });
  const onRoom = await waitFor(async () => (await readPanel(appPage))?.page === "atrium-room-page", { timeout: 5000 });
  check("rooms -> room page", onRoom != null && appPage.url().endsWith(roomHref), roomHref);
  await appPage.waitForTimeout(400);
  await appPage.screenshot({ path: `${SHOTS}app-room.png`, fullPage: true });

  // Swipe left = next room, swipe right = back.
  const firstRoom = (await readPanel(appPage))?.room;
  await swipe(appPage, { x: 330, y: 200 }, { x: 60, y: 210 });
  const swiped = await waitFor(async () => {
    const r = (await readPanel(appPage))?.room;
    return r && r !== firstRoom;
  }, { timeout: 3000 });
  check("swipe left opens the next room", swiped != null, (await readPanel(appPage))?.room);
  await swipe(appPage, { x: 60, y: 200 }, { x: 330, y: 205 });
  const back = await waitFor(async () => (await readPanel(appPage))?.room === firstRoom, { timeout: 3000 });
  check("swipe right goes back", back != null);
  await swipe(appPage, { x: 200, y: 700 }, { x: 210, y: 300 });
  await appPage.waitForTimeout(300);
  check("vertical swipe keeps the room", (await readPanel(appPage))?.room === firstRoom);
  await clickNav(appPage, "home");
  check("back to home", (await waitFor(async () => (await readPanel(appPage))?.page === "atrium-home-page")) != null);

  // Desktop: arrow keys change rooms; the heating number opens the heating control.
  await clickNav(deskPage, "rooms");
  await waitFor(async () => (await readPanel(deskPage))?.page === "atrium-rooms-page");
  await deskPage.evaluate(() => {
    const deep = (root, sel) => {
      const hit = root.querySelector(sel);
      if (hit) return hit;
      for (const el of root.querySelectorAll("*")) if (el.shadowRoot) { const x = deep(el.shadowRoot, sel); if (x) return x; }
      return null;
    };
    deep(document, "atrium-rooms-module").shadowRoot.querySelector("a").click();
  });
  await waitFor(async () => (await readPanel(deskPage))?.page === "atrium-room-page");
  const deskRoom = (await readPanel(deskPage))?.room;
  await deskPage.keyboard.press("ArrowRight");
  const keyed = await waitFor(async () => (await readPanel(deskPage))?.room !== deskRoom, { timeout: 3000 });
  check("desktop: arrow key opens the next room", keyed != null);
  await clickNav(deskPage, "home");
  await waitFor(async () => (await readPanel(deskPage))?.page === "atrium-home-page");
  if (await openClimateControl(deskPage)) {
    await deskPage.waitForTimeout(400);
    const c = (await readPanel(deskPage))?.control;
    check("heating number opens the heating control", c.open && c.body === "atrium-climate-body", c.body);
    await deskPage.screenshot({ path: `${SHOTS}desktop-climate.png` });
    await deskPage.keyboard.press("Escape");
    await deskPage.waitForTimeout(400);
  }

  // Low batteries: the row opens the batteries page.
  const batteryRow = await deskPage.evaluate(() => {
    const deep = (root, sel) => {
      const hit = root.querySelector(sel);
      if (hit) return hit;
      for (const el of root.querySelectorAll("*")) if (el.shadowRoot) { const x = deep(el.shadowRoot, sel); if (x) return x; }
      return null;
    };
    const row = deep(document, "[data-batteries]");
    row?.click();
    return Boolean(row);
  });
  if (batteryRow) {
    await waitFor(async () => (await readPanel(deskPage))?.page === "atrium-category-page", { timeout: 5000 });
    await deskPage.waitForTimeout(400);
    const low = await deskPage.evaluate(() => {
      const deep = (root, sel) => {
        const hit = root.querySelector(sel);
        if (hit) return hit;
        for (const el of root.querySelectorAll("*")) if (el.shadowRoot) { const x = deep(el.shadowRoot, sel); if (x) return x; }
        return null;
      };
      const page = deep(document, "atrium-category-page");
      return page?.shadowRoot.querySelectorAll(".battery.low").length ?? 0;
    });
    check("battery row opens the list of weak batteries", low > 0, `${low} weak`);
    await deskPage.screenshot({ path: `${SHOTS}desktop-batteries.png` });
    await clickNav(deskPage, "home");
    await deskPage.waitForTimeout(300);
  }

  // Energy page (as a normal user: statistics and history must be readable).
  await deskPage.evaluate(() => {
    history.pushState(null, "", "/atrium/category/energy");
    window.dispatchEvent(new CustomEvent("location-changed"));
  });
  const energy = await waitFor(
    async () =>
      deskPage.evaluate(() => {
        const deep = (root, sel) => {
          const hit = root.querySelector(sel);
          if (hit) return hit;
          for (const el of root.querySelectorAll("*")) if (el.shadowRoot) { const x = deep(el.shadowRoot, sel); if (x) return x; }
          return null;
        };
        const page = deep(document, "atrium-energy-page")?.shadowRoot;
        if (!page?.querySelector(".cal")) return null;
        return {
          strings: page.querySelectorAll(".flowchart .flow.pv").length,
          days: page.querySelectorAll(".cal .day").length,
          filled: page.querySelectorAll(".cal .day:not(.l-1)").length,
          kpis: [...page.querySelectorAll(".kpis b")].map((b) => b.textContent.trim()),
        };
      }),
    { timeout: 15000 },
  );
  const e = await deskPage.evaluate(() => {
    const deep = (root, sel) => {
      const hit = root.querySelector(sel);
      if (hit) return hit;
      for (const el of root.querySelectorAll("*")) if (el.shadowRoot) { const x = deep(el.shadowRoot, sel); if (x) return x; }
      return null;
    };
    const page = deep(document, "atrium-energy-page")?.shadowRoot;
    return {
      strings: page?.querySelectorAll(".flowchart .flow.pv").length ?? 0,
      days: page?.querySelectorAll(".cal .day").length ?? 0,
      filled: page?.querySelectorAll(".cal .day:not(.l-1)").length ?? 0,
      today: page?.querySelector(".kpis b")?.textContent.trim(),
    };
  });
  check("energy page renders flow and month calendar", energy != null && e.strings > 0 && e.days >= 28, `${e.strings} strings, ${e.days} days`);
  check("daily values come from statistics", e.filled > 0 && e.today !== "—", `${e.filled} days with data, today ${e.today}`);
  await deskPage.waitForTimeout(500);
  await deskPage.screenshot({ path: `${SHOTS}desktop-energy.png`, fullPage: true });
  await clickNav(deskPage, "home");
  await deskPage.waitForTimeout(300);

  // Non-admins: favourites yes, hiding and layout no.
  await clickNav(deskPage, "settings");
  await deskPage.waitForTimeout(400);
  const adminParts = await deskPage.evaluate(() => {
    const deep = (root, sel) => {
      const hit = root.querySelector(sel);
      if (hit) return hit;
      for (const el of root.querySelectorAll("*")) if (el.shadowRoot) { const x = deep(el.shadowRoot, sel); if (x) return x; }
      return null;
    };
    return Boolean(deep(document, "[data-module]") || deep(document, "[data-area]"));
  });
  check("non-admin: no admin sections in settings", !adminParts);
  await clickNav(deskPage, "home");
  await deskPage.waitForTimeout(400);
  const editActions = await deskPage.evaluate(() => {
    const deep = (root, sel) => {
      const hit = root.querySelector(sel);
      if (hit) return hit;
      for (const el of root.querySelectorAll("*")) if (el.shadowRoot) { const x = deep(el.shadowRoot, sel); if (x) return x; }
      return null;
    };
    deep(document, ".edit-toggle")?.click();
    return new Promise((resolve) =>
      setTimeout(() => {
        const tile = deep(document, "atrium-light-tile");
        const n = tile?.shadowRoot.querySelectorAll(".edit-action").length ?? -1;
        deep(document, ".edit-toggle")?.click();
        resolve(n);
      }, 400),
    );
  });
  check("non-admin: star only, no hide", editActions === 1, `${editActions} buttons`);

  // Reloading the entry with an unchanged bundle must not reload open pages.
  await appPage.evaluate(() => (window.__e2eMarker = true));
  const [entry] = await adminRest(cfg, "config/config_entries/entry?domain=atrium");
  expectingReload = true;
  await adminRest(cfg, `config/config_entries/entry/${entry.entry_id}/reload`, {});
  await appPage.waitForTimeout(2500);
  expectingReload = false;
  check("unchanged bundle: open pages stay", await appPage.evaluate(() => window.__e2eMarker === true));

  // Restore the test light.
  if (before.state === "on") {
    await adminRest(cfg, "services/light/turn_on", { entity_id: cfg.testLight, brightness: before.attributes.brightness });
  } else {
    await adminRest(cfg, "services/light/turn_off", { entity_id: cfg.testLight });
  }
  // Checked on the server: the pages may be rebuilding after the entry reload above.
  const restored = await waitFor(async () => (await adminRest(cfg, `states/${cfg.testLight}`)).state === before.state, {
    timeout: 10000,
    interval: 250,
  });
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
