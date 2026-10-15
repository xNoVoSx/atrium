// Visual tour as an admin: screenshots of the main screens on desktop and
// phone, for looking at the result. Changes nothing in the shared layout.

import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { browserProxy, clickNav, loadConfig, login, readPanel, storedTokens, waitFor } from "./lib.mjs";

const SHOTS = new URL("./screenshots/tour-", import.meta.url).pathname;

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

const deep = `(function deep(root, sel) {
  const hit = root.querySelector(sel);
  if (hit) return hit;
  for (const el of root.querySelectorAll("*")) if (el.shadowRoot) { const x = deep(el.shadowRoot, sel); if (x) return x; }
  return null;
})`;

const click = (page, selector) =>
  page.evaluate(
    ({ deep, selector }) => {
      const el = eval(deep)(document, selector);
      el?.click();
      return Boolean(el);
    },
    { deep, selector },
  );

const go = (page, path) =>
  page.evaluate((p) => {
    history.pushState(null, "", p);
    window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
  }, path);

async function open(browser, cfg, tokens, options) {
  const ctx = await browser.newContext(options);
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
  await page.waitForTimeout(800);
  return { page, errors };
}

async function main() {
  const only = process.argv[2];
  const cfg = adminConfig();
  const tokens = await login(cfg);
  const browser = await chromium.launch({ proxy: browserProxy() });
  const shot = async (page, name, full = true) => {
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${SHOTS}${name}.png`, fullPage: full });
    console.log("shot", name);
  };

  const desk = await open(browser, cfg, tokens, { viewport: { width: 1440, height: 900 } });
  const p = desk.page;
  if (!only || only === "desk") {
    await shot(p, "desk-home");
    const help = p.locator("atrium-scenes-module button.help");
    if (await help.count()) {
      await help.click();
      await shot(p, "desk-scenes-help");
      await help.click();
    }
    await go(p, "/atrium/category/homelab");
    await shot(p, "desk-homelab");
    await click(p, "button.examples");
    await shot(p, "desk-homelab-examples");
    for (const tab of ["look", "nav", "pages", "users"]) {
      await clickNav(p, "settings");
      await p.waitForTimeout(300);
      await click(p, `[data-tab="${tab}"]`);
      await shot(p, `desk-settings-${tab}`);
    }
    await clickNav(p, "home");
    await p.waitForTimeout(400);
    await click(p, ".edit-toggle");
    await shot(p, "desk-edit");
    await click(p, ".add-widget");
    await shot(p, "desk-picker", false);
    await click(p, '[data-widget="unifi"] .ghost');
    await shot(p, "desk-picker-preview", false);
    await click(p, '[data-widget="activity"] .ghost');
    await p.evaluate((d) => eval(d)(document, '[data-widget="activity"]')?.scrollIntoView(), deep);
    await shot(p, "desk-picker-activity", false);
    await click(p, '[data-widget="schedules"] .ghost');
    await p.evaluate((d) => eval(d)(document, '[data-widget="schedules"]')?.scrollIntoView(), deep);
    await shot(p, "desk-picker-schedules", false);
    await p.keyboard.press("Escape");
    await click(p, ".edit-toggle");
    await p.keyboard.press("Control+k");
    await p.keyboard.type("büro");
    await shot(p, "desk-search", false);
    await p.keyboard.press("Escape");
  }

  const phone = await open(browser, cfg, tokens, {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  if (!only || only === "phone") {
    await shot(phone.page, "phone-home");
    await click(phone.page, '[data-nav="more"]');
    await shot(phone.page, "phone-more", false);
    await go(phone.page, "/atrium/category/homelab");
    await shot(phone.page, "phone-homelab");
    await go(phone.page, "/atrium/settings");
    await click(phone.page, '[data-tab="look"]');
    await shot(phone.page, "phone-settings-look");
    await click(phone.page, '[data-tab="nav"]');
    await shot(phone.page, "phone-settings-nav");
    await go(phone.page, "/atrium");
    await phone.page.waitForTimeout(500);
    await click(phone.page, ".edit-toggle");
    await shot(phone.page, "phone-edit");
    await click(phone.page, ".add-widget");
    await shot(phone.page, "phone-picker", false);
    await phone.page.keyboard.press("Escape");
    await click(phone.page, ".edit-toggle");
  }

  const errors = [...desk.errors, ...phone.errors];
  console.log(errors.length ? `page errors:\n${errors.slice(0, 10).join("\n")}` : "no page errors");
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
