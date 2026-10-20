// Heating program and thermostat guard against the real Home Assistant.
// Creates its own test zone (one temperature helper, one schedule helper) so no
// real thermostat is touched, changes it through the panel, checks the result
// in Home Assistant, and deletes the helpers again. Thermostat sheets and the
// guard settings are only looked at, never changed.
//
//   npm run heating

import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { adminRest, adminWs, browserProxy, loadConfig, login, readPanel, storedTokens, waitFor } from "./lib.mjs";

const SHOTS = new URL("./screenshots/", import.meta.url).pathname;
const TEMP = "input_number.atrium_test_komfort";
const SCHEDULE = "schedule.atrium_test_komfortzeit";
const ZONE = '[data-zone="atrium_test"]';
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

let failures = 0;
const check = (ok, what, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures++;
};

function adminConfig() {
  const cfg = loadConfig();
  const kv = Object.fromEntries(
    readFileSync(process.env.ATRIUM_TEST_ADMIN_FILE, "utf8")
      .trim()
      .split("\n")
      .map((l) => l.split(/=(.*)/s).slice(0, 2)),
  );
  return { ...cfg, username: kv.username, password: kv.password };
}

async function open(browser, cfg, viewport, path) {
  const tokens = await login(cfg);
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(storedTokens, {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_type: "Bearer",
    expires_in: tokens.expires_in,
    expires: Date.now() + tokens.expires_in * 1000,
    hassUrl: cfg.haUrl,
    clientId: cfg.clientId,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${cfg.haUrl}${path}`);
  await waitFor(async () => (await readPanel(page)) !== null, { timeout: 30000 });
  return { ctx, page, errors };
}

const stateOf = async (cfg, id) => (await adminRest(cfg, `states/${id}`)).state;

async function main() {
  const admin = adminConfig();
  const user = loadConfig();
  const browser = await chromium.launch({ proxy: browserProxy() });
  const setup = await browser.newContext();
  const week = Object.fromEntries(DAYS.map((d) => [d, [{ from: "07:00:00", to: "19:00:00" }]]));
  await adminWs(setup, admin, [
    {
      type: "input_number/create",
      name: "Atrium Test Komfort",
      min: 5,
      max: 25,
      step: 0.5,
      initial: 20,
      unit_of_measurement: "°C",
      mode: "box",
    },
    { type: "schedule/create", name: "Atrium Test Komfortzeit", ...week },
  ]);
  try {
    await waitFor(async () => (await stateOf(admin, TEMP).catch(() => null)) === "20.0", { timeout: 15000 });

    // ---- admin, desktop ----
    const desk = await open(browser, admin, { width: 1440, height: 1000 }, "/atrium/category/climate");
    const zone = desk.page.locator(`atrium-heating-program-widget ${ZONE}`);
    await zone.waitFor({ timeout: 20000 });
    check(true, "test zone shown in the program");
    check((await zone.locator(".now-level").textContent()).includes("20"), "current level shows 20 °C");

    await zone.locator(`.level[data-entity="${TEMP}"] button.plus`).click();
    await zone.locator(`.level[data-entity="${TEMP}"] button.plus`).click();
    check((await zone.locator(`.level[data-entity="${TEMP}"] .lt`).textContent()).includes("21"), "two taps show 21 °C at once");
    await waitFor(async () => (await stateOf(admin, TEMP)) === "21.0", { timeout: 8000 }).catch(() => null);
    check((await stateOf(admin, TEMP)) === "21.0", "one change of +1 °C reaches Home Assistant", await stateOf(admin, TEMP));

    await zone.locator(`[data-times="${SCHEDULE}"]`).click();
    const editor = desk.page.locator("atrium-heating-program-widget atrium-schedule-editor");
    await editor.waitFor();
    await editor.locator('[data-day="monday"] input[type="time"]').first().fill("06:30");
    await editor.locator('[data-day="monday"] [data-copy="weekdays"]').click();
    await desk.page.screenshot({ path: `${SHOTS}heating-editor.png` });
    await editor.locator(".eh .primary").click();
    await editor.waitFor({ state: "detached", timeout: 8000 });
    const [list] = await adminWs(setup, admin, [{ type: "schedule/list" }]);
    const saved = list.find((s) => s.id === "atrium_test_komfortzeit");
    check(saved?.friday?.[0]?.from === "06:30:00", "Mon–Fr now start 06:30", JSON.stringify(saved?.friday));
    check(saved?.saturday?.[0]?.from === "07:00:00", "weekend unchanged", JSON.stringify(saved?.saturday));
    await desk.page.waitForTimeout(800);
    await desk.page.screenshot({ path: `${SHOTS}heating-desk.png`, fullPage: true });

    // A thermostat's sheet: program line and child lock (looked at only). The
    // first thermostat that belongs to a zone (helper names or automation).
    const tiles = desk.page.locator("atrium-climate-module atrium-climate-zone");
    const body = desk.page.locator("atrium-climate-body");
    let withProgram = false;
    for (let i = 0; i < (await tiles.count()) && !withProgram; i++) {
      await tiles.nth(i).locator("button").first().click();
      await body.locator(".big").waitFor({ timeout: 8000 });
      await desk.page.waitForTimeout(400);
      withProgram = (await body.locator(".program").count()) === 1;
      if (!withProgram) {
        await desk.page.keyboard.press("Escape");
        await desk.page.waitForTimeout(400);
      }
    }
    check(withProgram, "sheet shows the program");
    check((await body.locator(".lockrow").count()) === 1, "sheet shows the child lock");
    await desk.page.screenshot({ path: `${SHOTS}heating-sheet.png` });
    await desk.page.keyboard.press("Escape");

    // Settings → Heating (looked at only).
    await desk.page.goto(`${admin.haUrl}/atrium/settings`);
    await waitFor(async () => (await readPanel(desk.page)) !== null, { timeout: 20000 });
    await desk.page.locator('[data-tab="heating"]').click();
    const guards = desk.page.locator("atrium-heating-settings .row.guard");
    await guards.first().waitFor({ timeout: 8000 });
    check((await guards.count()) >= 1, "guard rows per thermostat", String(await guards.count()));
    check(
      (await desk.page.locator('atrium-heating-settings [data-zone="atrium_test"]').count()) === 1,
      "settings list the test zone",
    );
    await desk.page.screenshot({ path: `${SHOTS}heating-settings.png`, fullPage: true });

    // "Detect and save" writes zones with thermostats from the automations;
    // the layout is restored exactly afterwards.
    const [before] = await adminWs(setup, admin, [{ type: "atrium/settings/get" }]);
    try {
      await desk.page.locator('atrium-heating-settings [data-action="detect"]').click();
      await waitFor(
        async () => (await adminWs(setup, admin, [{ type: "atrium/settings/get" }]))[0].layout.heating?.zones,
        { timeout: 15000, interval: 500 },
      );
      const [after] = await adminWs(setup, admin, [{ type: "atrium/settings/get" }]);
      const zones = after.layout.heating.zones;
      check(zones.some((z) => z.id === "atrium_test"), "detect saves the test zone", String(zones.length));
      check(
        zones.filter((z) => z.thermostats.length).length >= zones.length - 1,
        "detected zones have thermostats",
        zones.map((z) => `${z.id}:${z.thermostats.length}`).join(" "),
      );
      check(JSON.stringify(after.layout.guards) === JSON.stringify(before.layout.guards), "guards untouched");
      await desk.page.waitForTimeout(500);
      await desk.page.screenshot({ path: `${SHOTS}heating-settings-saved.png`, fullPage: true });
    } finally {
      await adminWs(setup, admin, [{ type: "atrium/settings/set_layout", layout: before.layout }]);
      const [restored] = await adminWs(setup, admin, [{ type: "atrium/settings/get" }]);
      check(JSON.stringify(restored.layout) === JSON.stringify(before.layout), "layout restored exactly");
    }
    check(desk.errors.length === 0, "no page errors (admin desktop)", desk.errors.join(" | "));

    // ---- admin, phone ----
    const phone = await open(browser, admin, { width: 412, height: 915 }, "/atrium/category/climate");
    await phone.page.locator(`atrium-heating-program-widget ${ZONE}`).waitFor({ timeout: 20000 });
    await phone.page.locator(`atrium-heating-program-widget`).scrollIntoViewIfNeeded();
    await phone.page.waitForTimeout(600);
    await phone.page.screenshot({ path: `${SHOTS}heating-phone.png`, fullPage: true });
    const overflow = await phone.page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    check(!overflow, "no sideways scrolling on the phone");

    // ---- not an admin: sees the program, cannot change it ----
    const viewer = await open(browser, user, { width: 1440, height: 1000 }, "/atrium/category/climate");
    const vzone = viewer.page.locator(`atrium-heating-program-widget ${ZONE}`);
    await vzone.waitFor({ timeout: 20000 });
    check((await vzone.locator(".step button").count()) === 0, "non-admin gets no −/+");
    check((await vzone.locator("[data-times]").count()) === 0, "non-admin gets no time editor");
    const toggles = viewer.page.locator("atrium-heating-program-widget .tg");
    if (await toggles.count()) check(await toggles.first().isDisabled(), "non-admin cannot flip program switches");
    await viewer.page.screenshot({ path: `${SHOTS}heating-viewer.png`, fullPage: true });
    check(viewer.errors.length === 0, "no page errors (non-admin)", viewer.errors.join(" | "));
  } finally {
    await adminWs(setup, admin, [
      { type: "input_number/delete", input_number_id: "atrium_test_komfort" },
      { type: "schedule/delete", schedule_id: "atrium_test_komfortzeit" },
    ]);
    const gone = await adminRest(admin, `states/${TEMP}`).then(() => false).catch(() => true);
    check(gone, "test helpers deleted");
    await browser.close();
  }
  console.log(failures ? `${failures} check(s) failed` : "all heating checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
