// Contact sheets of every widget in every design, rendered as previews in the
// widget catalogue (sample data where the integration is missing). Changes
// nothing in Home Assistant: the catalogue is only opened, never used to add.
//
//   npm run designs            all widgets
//   npm run designs -- climate  only types containing "climate"

import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { browserProxy, loadConfig, login, readPanel, storedTokens, waitFor } from "./lib.mjs";

const SHOTS = new URL("./screenshots/", import.meta.url).pathname;
const filter = process.argv[2] ?? "";

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

const deep = `(function deep(root, sel) {
  const hit = root.querySelector(sel);
  if (hit) return hit;
  for (const el of root.querySelectorAll("*")) if (el.shadowRoot) { const x = deep(el.shadowRoot, sel); if (x) return x; }
  return null;
})`;

async function main() {
  const cfg = adminConfig();
  const tokens = await login(cfg);
  const browser = await chromium.launch({ proxy: browserProxy() });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
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
  await page.goto(`${cfg.haUrl}/atrium`);
  await waitFor(async () => (await readPanel(page))?.tiles.length > 0, { timeout: 30000 });
  await page.evaluate((d) => eval(d)(document, ".edit-toggle")?.click(), deep);
  await page.waitForTimeout(300);
  await page.evaluate((d) => eval(d)(document, ".add-widget")?.click(), deep);
  await page.waitForTimeout(600);

  const widgets = await page.evaluate((d) => {
    const picker = eval(d)(document, "atrium-widget-picker");
    return [...picker.shadowRoot.querySelectorAll("[data-widget]")].map((el) => el.dataset.widget);
  }, deep);

  const shots = [];
  for (const type of widgets.filter((w) => w.includes(filter))) {
    const variants = await page.evaluate(
      ({ d, type }) => {
        const picker = eval(d)(document, "atrium-widget-picker");
        picker._preview = type;
        picker._variant = null;
        return picker.updateComplete.then(() =>
          [...picker.shadowRoot.querySelectorAll(`[data-widget="${type}"] .vchips button`)].map((b) => b.dataset.variant),
        );
      },
      { d: deep, type },
    );
    for (const variant of variants.length ? variants : ["-"]) {
      await page.evaluate(
        ({ d, type, variant, first }) => {
          const picker = eval(d)(document, "atrium-widget-picker");
          picker._variant = variant === "-" || variant === first ? null : variant;
          picker.shadowRoot.querySelector(`[data-widget="${type}"]`)?.scrollIntoView({ block: "start" });
        },
        { d: deep, type, variant, first: variants[0] },
      );
      await page.waitForTimeout(900);
      const el = await page.evaluateHandle(
        ({ d, type }) => eval(d)(document, "atrium-widget-picker").shadowRoot.querySelector(`[data-widget="${type}"] .preview`),
        { d: deep, type },
      );
      const png = await el.asElement()?.screenshot().catch(() => null);
      if (png) shots.push({ type, variant, data: png.toString("base64") });
    }
  }

  // Contact sheets: one row per widget, its designs side by side.
  const byType = Object.groupBy(shots, (s) => s.type);
  const types = Object.keys(byType);
  const sheet = await ctx.newPage();
  for (let i = 0; i < types.length; i += 5) {
    const part = types.slice(i, i + 5);
    const body = part
      .map(
        (t) => `<h2>${t}</h2><div class="row">${byType[t]
          .map((s) => `<figure><img src="data:image/png;base64,${s.data}"><figcaption>${s.variant}</figcaption></figure>`)
          .join("")}</div>`,
      )
      .join("");
    await sheet.setContent(`<style>body{font:14px sans-serif;background:#888;margin:10px}h2{margin:16px 0 6px}
      .row{display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap}figure{margin:0;background:#fff;padding:4px}
      img{max-width:460px;display:block}figcaption{font-weight:bold}</style>${body}`);
    await sheet.screenshot({ path: `${SHOTS}designs-${String(i / 5 + 1).padStart(2, "0")}.png`, fullPage: true });
    console.log("sheet", i / 5 + 1, part.join(", "));
  }
  console.log(errors.length ? `page errors:\n${errors.slice(0, 10).join("\n")}` : "no page errors");
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
