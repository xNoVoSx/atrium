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
  // The test light is switched by some checks; put it back exactly (state and brightness).
  const lightBefore0 = (await ws(page, { type: "get_states" })).find((x) => x.entity_id === cfg.testLight);

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
    await panelClick(page, '[data-tab="hidden"]');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}settings-admin.png`, fullPage: true });
    check("settings list the hidden light", await panelClick(page, `[data-hidden="${cfg.testLight}"] button`));
    const shown = await waitFor(
      async () => !(await ws(page, { type: "atrium/settings/get" })).layout.hiddenEntities?.includes(cfg.testLight),
      { timeout: 5000 },
    );
    check("'show' brings it back", shown != null);

    // Energy settings: change the price.
    await panelClick(page, '[data-tab="energy"]');
    await page.waitForTimeout(300);
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
    await panelClick(page, '[data-tab="home"]');
    await page.waitForTimeout(300);
    check("rooms module switch exists", await panelClick(page, '[data-module="rooms"] input'));
    const roomsOn = await waitFor(
      async () => {
        const layout = (await ws(page, { type: "atrium/settings/get" })).layout;
        const rooms = layout.pages?.home?.widgets.find((w) => w.type === "rooms");
        return rooms && !rooms.disabled;
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
      module.shadowRoot.querySelector("[data-sort-id]")?.scrollIntoView({ block: "center" });
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

    // Widgets: add a clock from the catalogue, make it small, then remove it.
    await clickNav(page, "home");
    await page.waitForTimeout(400);
    await panelClick(page, ".edit-toggle");
    await page.waitForTimeout(300);
    check("edit mode offers 'add widget'", await panelClick(page, ".add-widget"));
    await page.waitForTimeout(500);
    check("catalogue lists the clock", await panelClick(page, '[data-widget="clock"] .add'));
    const clockSaved = await waitFor(
      async () => (await ws(page, { type: "atrium/settings/get" })).layout.pages?.home?.widgets.find((w) => w.type === "clock"),
      { timeout: 5000 },
    );
    check("added widget is saved", clockSaved != null);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    check(
      "clock widget renders",
      Boolean(await page.evaluate((d) => eval(d)(document, "atrium-clock-widget")?.shadowRoot?.querySelector(".time"), deep)),
    );
    await page.screenshot({ path: `${SHOTS}edit-widget-added.png` });
    const clockId = clockSaved && (await ws(page, { type: "atrium/settings/get" })).layout.pages.home.widgets.find((w) => w.type === "clock").id;
    await panelClick(page, `[data-sort-id="${clockId}"] .tools button[title]`);
    const resized = await waitFor(
      async () => (await ws(page, { type: "atrium/settings/get" })).layout.pages.home.widgets.find((w) => w.id === clockId)?.size,
      { timeout: 5000 },
    );
    const newSize = (await ws(page, { type: "atrium/settings/get" })).layout.pages.home.widgets.find((w) => w.id === clockId)?.size;
    check("size button changes the size", resized != null, String(newSize));
    await panelClick(page, ".edit-toggle");

    // Navigation: add the office room as its own entry.
    await clickNav(page, "settings");
    await page.waitForTimeout(300);
    await panelClick(page, '[data-tab="nav"]');
    await page.waitForTimeout(300);
    await panelClick(page, ".add button.primary");
    const navSaved = await waitFor(
      async () => (await ws(page, { type: "atrium/settings/get" })).layout.nav?.items?.some((i) => i.kind === "room"),
      { timeout: 5000 },
    );
    check("menu entry for a room is saved", navSaved != null);
    await page.waitForTimeout(400);
    check(
      "the rail shows the room entry",
      await page.evaluate((d) => {
        const panel = eval(d)(document, "atrium-panel");
        return [...panel.shadowRoot.querySelectorAll("nav.rail a")].some((a) => a.getAttribute("href")?.includes("/room/"));
      }, deep),
    );

    // Own page from a template.
    await panelClick(page, '[data-tab="pages"]');
    await page.waitForTimeout(300);
    const typed = await page.evaluate((d) => {
      const input = eval(d)(document, "atrium-pages-settings")?.shadowRoot.querySelector(".add input");
      if (!input) return false;
      input.value = "E2E Info";
      input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      const select = input.parentElement.querySelector("select");
      select.value = "info";
      select.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      return true;
    }, deep);
    await page.waitForTimeout(200);
    check("page form exists", typed);
    await page.evaluate((d) => eval(d)(document, "atrium-pages-settings")?.shadowRoot.querySelector(".add button.primary")?.click(), deep);
    const pageSaved = await waitFor(
      async () => (await ws(page, { type: "atrium/settings/get" })).layout.pages?.["e2e-info"],
      { timeout: 5000 },
    );
    const created = (await ws(page, { type: "atrium/settings/get" })).layout.pages?.["e2e-info"];
    check("own page is created from a template", pageSaved != null && created?.widgets.length > 0, `${created?.widgets.length} widgets`);
    await page.waitForTimeout(800);
    check("browser shows the new page", page.url().endsWith("/atrium/page/e2e-info"));
    await page.screenshot({ path: `${SHOTS}edit-own-page.png`, fullPage: true });

    // View level: "simple" hides the categories entry.
    await ws(page, { type: "atrium/settings/set_user", settings: { level: "simple" } });
    await page.waitForTimeout(800);
    const navSimple = await page.evaluate((d) => {
      const panel = eval(d)(document, "atrium-panel");
      return [...panel.shadowRoot.querySelectorAll("nav [data-nav]")].map((a) => a.dataset.nav);
    }, deep);
    check("simple level hides categories", !navSimple.includes("categories") && navSimple.includes("home"), navSimple.join(","));
    await ws(page, { type: "atrium/settings/set_user", settings: {} });

    // Floor plan: add it, place the test light, drag it, tap it outside edit mode.
    await clickNav(page, "home");
    await page.waitForTimeout(400);
    await panelClick(page, ".edit-toggle");
    await page.waitForTimeout(300);
    await panelClick(page, ".add-widget");
    await page.waitForTimeout(400);
    await panelClick(page, '[data-widget="floorplan"] .add');
    await page.waitForTimeout(600);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    const homeWidgets = async () => (await ws(page, { type: "atrium/settings/get" })).layout.pages.home.widgets;
    const planId = (await homeWidgets()).find((w) => w.type === "floorplan")?.id;
    check("floor plan widget is added", Boolean(planId));
    await page.evaluate(({ d, light }) => {
      const plan = eval(d)(document, "atrium-floorplan-widget");
      const input = plan.shadowRoot.querySelector(".add input");
      input.value = light;
      input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      plan.shadowRoot.querySelector(".add button").click();
    }, { d: deep, light: cfg.testLight });
    const placed = await waitFor(async () => (await homeWidgets()).find((w) => w.id === planId)?.options?.markers?.length === 1, { timeout: 5000 });
    check("a device is placed on the plan", placed != null);
    await page.waitForTimeout(500);
    const box = await page.evaluate((d) => {
      const marker = eval(d)(document, "atrium-floorplan-widget").shadowRoot.querySelector(".m");
      marker.scrollIntoView({ block: "center" });
      const r = marker.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, deep);
    await page.mouse.move(box.x, box.y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(box.x - i * 12, box.y - i * 6);
    await page.mouse.up();
    const moved = await waitFor(async () => {
      const m = (await homeWidgets()).find((w) => w.id === planId)?.options?.markers?.[0];
      return m && (m.x < 49 || m.y < 49);
    }, { timeout: 5000 });
    check("dragging moves the device", moved != null);
    await page.screenshot({ path: `${SHOTS}floorplan-edit.png` });
    await panelClick(page, ".edit-toggle");
    await page.waitForTimeout(500);
    const lightBefore = (await ws(page, { type: "get_states" })).find((x) => x.entity_id === cfg.testLight)?.state;
    await page.evaluate((d) => eval(d)(document, "atrium-floorplan-widget").shadowRoot.querySelector(".m").click(), deep);
    const toggled = await waitFor(
      async () => (await ws(page, { type: "get_states" })).find((x) => x.entity_id === cfg.testLight)?.state !== lightBefore,
      { timeout: 8000 },
    );
    check("tapping a light on the plan switches it", toggled != null);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SHOTS}floorplan.png` });
    await page.evaluate((d) => eval(d)(document, "atrium-floorplan-widget").shadowRoot.querySelector(".m").click(), deep);
    await waitFor(
      async () => (await ws(page, { type: "get_states" })).find((x) => x.entity_id === cfg.testLight)?.state === lightBefore,
      { timeout: 8000 },
    );

    // Tile styles of the lights widget.
    for (const style of ["list", "square"]) {
      const layout = (await ws(page, { type: "atrium/settings/get" })).layout;
      layout.pages.home.widgets = layout.pages.home.widgets.map((w) => (w.type === "lights" ? { ...w, options: { ...w.options, style } } : w));
      await ws(page, { type: "atrium/settings/set_layout", layout });
      await page.waitForTimeout(700);
      const tiles = await page.evaluate((d) => {
        const mod = eval(d)(document, "atrium-lights-module");
        return [...(mod?.shadowRoot.querySelectorAll("atrium-light-tile") ?? [])].map((t) => ({ list: t.hasAttribute("list"), compact: t.hasAttribute("compact") }));
      }, deep);
      const ok = tiles.length > 0 && tiles.every((t) => (style === "list" ? t.list && t.compact : !t.list && !t.compact));
      check(`lights widget in ${style} style`, ok, `${tiles.length} tiles`);
      await page.screenshot({ path: `${SHOTS}lights-${style}.png` });
    }

    // Designs: heating as tiles (one tile per zone) and a frame around the header.
    {
      const layout = (await ws(page, { type: "atrium/settings/get" })).layout;
      layout.pages.home.widgets = layout.pages.home.widgets.map((w) =>
        w.type === "climate"
          ? { ...w, options: { ...w.options, variant: "tiles" } }
          : w.type === "header"
            ? { ...w, options: { ...w.options, skin: "contrast" } }
            : w,
      );
      await ws(page, { type: "atrium/settings/set_layout", layout });
      await page.waitForTimeout(800);
      const result = await page.evaluate((d) => {
        const mod = eval(d)(document, "atrium-climate-module");
        const zones = mod?.shadowRoot.querySelectorAll("atrium-climate-zone").length ?? 0;
        const header = eval(d)(document, '[data-widget="header"] .body');
        return { zones, skin: header?.className ?? "" };
      }, deep);
      check("heating design 'tiles' shows every zone", result.zones > 1, `${result.zones} zones`);
      check("frame 'contrast' is applied", result.skin.includes("skin-contrast"));
      await page.screenshot({ path: `${SHOTS}designs-home.png`, fullPage: true });
    }

    // Doorbell: the settings find it, "try it" shows the camera popup.
    await clickNav(page, "settings");
    await page.waitForTimeout(300);
    await panelClick(page, '[data-tab="doorbell"]');
    await page.waitForTimeout(400);
    await page.evaluate((d) => eval(d)(document, "atrium-doorbell-settings")?.shadowRoot.querySelector("button.primary")?.click(), deep);
    const bellShown = await waitFor(
      async () => page.evaluate((d) => Boolean(eval(d)(document, "atrium-doorbell")?.shadowRoot.querySelector(".card img")), deep),
      { timeout: 5000 },
    );
    check("doorbell popup shows the door camera", bellShown != null);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOTS}doorbell.png` });
    await page.evaluate((d) => [...eval(d)(document, "atrium-doorbell").shadowRoot.querySelectorAll(".actions button")].at(-1).click(), deep);

    // A failing action shows a message instead of failing silently.
    await page.evaluate(() => {
      void document.querySelector("home-assistant").hass.callService("atrium_e2e_missing", "nothing");
    });
    const toast = await waitFor(
      async () => page.evaluate((d) => Boolean(eval(d)(document, "atrium-panel")?.shadowRoot.querySelector(".toast")), deep),
      { timeout: 5000 },
    );
    check("failed action shows a message", toast != null);

    check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  } finally {
    if (lightBefore0?.state === "on")
      await ws(page, {
        type: "call_service",
        domain: "light",
        service: "turn_on",
        service_data: { entity_id: cfg.testLight, brightness: lightBefore0.attributes.brightness },
      });
    else if (lightBefore0?.state === "off")
      await ws(page, { type: "call_service", domain: "light", service: "turn_off", service_data: { entity_id: cfg.testLight } });
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
