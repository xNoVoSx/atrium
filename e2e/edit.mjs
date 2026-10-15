// End-to-end test of editing as an admin: favourites, hiding, drag to
// reorder, home modules. The shared layout belongs to the whole household,
// so it is saved first and restored at the end, also when a check fails.

import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import {
  browserProxy,
  clickNav,
  loadConfig,
  login,
  readPanel,
  storedTokens,
  tileButton,
  waitFor,
} from "./lib.mjs";

const SHOTS = new URL("./screenshots/", import.meta.url).pathname;
const results = [];
function check(name, ok, detail = "") {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

function adminConfig() {
  const cfg = loadConfig();
  const file = process.env.ATRIUM_TEST_ADMIN_FILE;
  if (!file) throw new Error("ATRIUM_TEST_ADMIN_FILE is not set (see .env.example)");
  const kv = Object.fromEntries(
    readFileSync(file, "utf8")
      .trim()
      .split("\n")
      .map((l) => l.split(/=(.*)/s).slice(0, 2)),
  );
  return { ...cfg, username: kv.username, password: kv.password };
}

// ---- helpers running in the page ----

const ws = (page, msg) =>
  page.evaluate((m) => document.querySelector("home-assistant").hass.callWS(m), msg);

const deep = `(function deep(root, sel) {
  const hit = root.querySelector(sel);
  if (hit) return hit;
  for (const el of root.querySelectorAll("*")) if (el.shadowRoot) { const x = deep(el.shadowRoot, sel); if (x) return x; }
  return null;
})`;

const panelClick = (page, selector) =>
  page.evaluate(
    ({ deep, selector }) => {
      const el = eval(deep)(document, selector);
      el?.click();
      return Boolean(el);
    },
    { deep, selector },
  );

/** Click the star or eye on a tile in edit mode. */
const tileAction = (page, entityId, which) =>
  page.evaluate(
    ({ deep, entityId, which }) => {
      const tile = eval(deep)(document, `[entity-id="${entityId}"]`);
      const buttons = tile?.shadowRoot.querySelectorAll(".edit-action");
      const button = buttons?.[which === "star" ? 0 : 1];
      button?.click();
      return Boolean(button);
    },
    { deep, entityId, which },
  );

const homeTileIds = (page) =>
  page.evaluate((deep) => {
    const module = eval(deep)(document, "atrium-lights-module");
    return [...(module?.shadowRoot.querySelectorAll("[data-sort-id]") ?? [])].map((t) => t.dataset.sortId);
  }, deep);

const lightsTitle = (page) =>
  page.evaluate((deep) => eval(deep)(document, "atrium-lights-module")?.shadowRoot.querySelector("h2")?.textContent, deep);

async function main() {
  const cfg = adminConfig();
  const tokens = await login(cfg);
  const browser = await chromium.launch({ proxy: browserProxy() });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto(`${cfg.haUrl}/atrium`);
  await waitFor(async () => (await readPanel(page))?.tiles.length > 0, { timeout: 30000 });
  const original = await ws(page, { type: "atrium/settings/get" });

  try {
    // Start from the automatic layout with no favourites.
    await ws(page, { type: "atrium/settings/set_layout", layout: {} });
    await ws(page, { type: "atrium/settings/set_user", settings: {} });
    await page.waitForTimeout(500);

    check("admin sees the edit button", await panelClick(page, ".edit-toggle"));
    await page.waitForTimeout(300);
    check("edit mode shows the hint", Boolean(await page.evaluate((d) => eval(d)(document, ".edit-hint"), deep)));
    await page.screenshot({ path: `${SHOTS}edit-mode.png` });

    // Tapping a tile in edit mode must not switch it.
    const before = (await readPanel(page))?.tiles.find((t) => t.entityId === cfg.testLight)?.state;
    await (await tileButton(page, cfg.testLight)).click({ force: true });
    await page.waitForTimeout(800);
    check(
      "tap in edit mode does not switch",
      (await readPanel(page))?.tiles.find((t) => t.entityId === cfg.testLight)?.state === before,
    );

    // Favourite.
    check("star a light", await tileAction(page, cfg.testLight, "star"));
    const favSaved = await waitFor(
      async () => (await ws(page, { type: "atrium/settings/get" })).user.favorites?.includes(cfg.testLight),
      { timeout: 5000 },
    );
    check("favourite is saved for this user", favSaved != null);
    await panelClick(page, ".edit-toggle");
    await page.waitForTimeout(400);
    const favIds = await homeTileIds(page);
    check(
      "home shows only favourites",
      favIds.length === 1 && favIds[0] === cfg.testLight && /favori/i.test((await lightsTitle(page)) ?? ""),
      favIds.join(", "),
    );
    await ws(page, { type: "atrium/settings/set_user", settings: {} });
    await page.waitForTimeout(500);

    // Hide and bring back through the settings page.
    await panelClick(page, ".edit-toggle");
    await page.waitForTimeout(300);
    check("eye hides a light", await tileAction(page, cfg.testLight, "hide"));
    const hiddenSaved = await waitFor(
      async () => (await ws(page, { type: "atrium/settings/get" })).layout.hiddenEntities?.includes(cfg.testLight),
      { timeout: 5000 },
    );
    check("hidden entity is saved in the shared layout", hiddenSaved != null);
    const dimmed = await page.evaluate(
      ({ deep, id }) => eval(deep)(document, `[entity-id="${id}"]`)?.hasAttribute("atrium-hidden"),
      { deep, id: cfg.testLight },
    );
    check("in edit mode the hidden light stays visible, dimmed", dimmed === true);
    await panelClick(page, ".edit-toggle");
    await page.waitForTimeout(400);
    check("outside edit mode it is gone", !(await homeTileIds(page)).includes(cfg.testLight));

    await clickNav(page, "settings");
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}settings-admin.png`, fullPage: true });
    check("settings list the hidden light", await panelClick(page, `[data-hidden="${cfg.testLight}"] button`));
    const shown = await waitFor(
      async () => !(await ws(page, { type: "atrium/settings/get" })).layout.hiddenEntities?.includes(cfg.testLight),
      { timeout: 5000 },
    );
    check("'show' brings it back", shown != null);

    // Energy settings: change the price.
    const priceSet = await page.evaluate(({ deep }) => {
      const input = eval(deep)(document, 'input[data-energy="price"]');
      if (!input) return false;
      input.value = "0.31";
      input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      return true;
    }, { deep });
    const priceSaved = await waitFor(
      async () => (await ws(page, { type: "atrium/settings/get" })).layout.energy?.price === 0.31,
      { timeout: 5000 },
    );
    check("energy price is saved from the settings", priceSet && priceSaved != null);

    // Home modules: switch rooms on.
    check("rooms module switch exists", await panelClick(page, '[data-module="rooms"] input'));
    const roomsOn = await waitFor(
      async () => {
        const layout = (await ws(page, { type: "atrium/settings/get" })).layout;
        return layout.home?.hidden && !layout.home.hidden.includes("rooms");
      },
      { timeout: 5000 },
    );
    check("module switch is saved", roomsOn != null);
    await clickNav(page, "home");
    await page.waitForTimeout(500);
    check(
      "home now shows the rooms module",
      Boolean(await page.evaluate((d) => eval(d)(document, "atrium-rooms-module"), deep)),
    );

    // Drag the first light behind the second.
    await ws(page, { type: "atrium/settings/set_layout", layout: {} });
    await page.waitForTimeout(500);
    await panelClick(page, ".edit-toggle");
    await page.waitForTimeout(300);
    const startOrder = await homeTileIds(page);
    const boxes = await page.evaluate((deep) => {
      const module = eval(deep)(document, "atrium-lights-module");
      return [...module.shadowRoot.querySelectorAll("[data-sort-id]")].slice(0, 2).map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width };
      });
    }, deep);
    const [a, b] = boxes;
    await page.mouse.move(a.x - a.w / 4, a.y);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(a.x + ((b.x + b.w / 3 - a.x) * i) / 12, a.y + ((b.y - a.y) * i) / 12);
    await page.mouse.up();
    const ordered = await waitFor(
      async () => (await ws(page, { type: "atrium/settings/get" })).layout.order?.["lights:home"],
      { timeout: 5000 },
    );
    const saved = (await ws(page, { type: "atrium/settings/get" })).layout.order?.["lights:home"] ?? [];
    check(
      "drag reorders and saves the order",
      ordered != null && saved[0] === startOrder[1] && saved[1] === startOrder[0],
      saved.slice(0, 2).join(", "),
    );
    await panelClick(page, ".edit-toggle");

    // Room page: drag the first device behind the second.
    const deviceRoom = await page.evaluate(async (deep) => {
      const hass = document.querySelector("home-assistant").hass;
      for (const area of Object.keys(hass.areas)) {
        history.pushState(null, "", `/atrium/room/${area}`);
        window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
        await new Promise((r) => setTimeout(r, 300));
        const list = eval(deep)(document, "atrium-entity-list");
        if ((list?.shadowRoot.querySelectorAll("[data-sort-id]").length ?? 0) >= 2) return area;
      }
      return null;
    }, deep);
    check("a room with two devices exists", deviceRoom != null, deviceRoom ?? "");
    if (deviceRoom) {
      await panelClick(page, ".edit-toggle");
      await page.waitForTimeout(300);
      const items = await page.evaluate((deep) => {
        const list = eval(deep)(document, "atrium-entity-list");
        return [...list.shadowRoot.querySelectorAll("[data-sort-id]")].slice(0, 2).map((el) => {
          const r = el.getBoundingClientRect();
          return { id: el.dataset.sortId, x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width };
        });
      }, deep);
      const [d1, d2] = items;
      await page.mouse.move(d1.x - d1.w / 4, d1.y);
      await page.mouse.down();
      for (let i = 1; i <= 12; i++)
        await page.mouse.move(d1.x + ((d2.x + d2.w / 3 - d1.x) * i) / 12, d1.y + ((d2.y - d1.y) * i) / 12);
      await page.mouse.up();
      const key = `devices:${deviceRoom}`;
      const devSaved = await waitFor(
        async () => (await ws(page, { type: "atrium/settings/get" })).layout.order?.[key],
        { timeout: 5000 },
      );
      const devOrder = (await ws(page, { type: "atrium/settings/get" })).layout.order?.[key] ?? [];
      check(
        "drag reorders devices on a room page",
        devSaved != null && devOrder[0] === d2.id && devOrder[1] === d1.id,
        devOrder.slice(0, 2).join(", "),
      );
      await page.screenshot({ path: `${SHOTS}edit-room-devices.png`, fullPage: true });
      await panelClick(page, ".edit-toggle");
    }

    check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  } finally {
    await ws(page, { type: "atrium/settings/set_layout", layout: original.layout });
    await ws(page, { type: "atrium/settings/set_user", settings: original.user });
    const now = await ws(page, { type: "atrium/settings/get" });
    console.log(
      "restored layout and favourites:",
      JSON.stringify(now.layout) === JSON.stringify(original.layout) &&
        JSON.stringify(now.user) === JSON.stringify(original.user),
    );
    await browser.close();
  }

  const failed = results.filter((ok) => !ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed. Screenshots: ${SHOTS}`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
