// Checks Atrium inside the real Companion app running in an Android emulator.
//
//   npm run app             run the checks
//   npm run app -- inspect  print what the app's frontend sees
//
// Needs a running emulator with the app installed and logged in (see CLAUDE notes
// of the project or README). Finds the app's WebView DevTools socket, forwards it
// and attaches Playwright to the real WebView.

import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { loadConfig, readPanel, tileButton, waitFor } from "../lib.mjs";

const APP = "io.homeassistant.companion.android";
const PORT = Number(process.env.ATRIUM_APP_CDP_PORT ?? 9333);
const SHOTS = new URL("../screenshots/", import.meta.url).pathname;

const adb = (...args) => execFileSync("adb", args, { encoding: "utf8" }).trim();

function forwardDevtools() {
  const pid = adb("shell", "pidof", APP);
  if (!pid) throw new Error("the Companion app is not running in the emulator");
  const sockets = adb("shell", "cat", "/proc/net/unix");
  const name = `webview_devtools_remote_${pid}`;
  if (!sockets.includes(`@${name}`)) throw new Error(`no WebView DevTools socket for pid ${pid}`);
  adb("forward", `tcp:${PORT}`, `localabstract:${name}`);
}

const results = [];
function check(name, ok, detail = "") {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

async function openAtrium(page) {
  await page.evaluate(() => {
    if (location.pathname.startsWith("/atrium")) return;
    history.pushState(null, "", "/atrium");
    window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
  });
  return waitFor(async () => (await readPanel(page))?.tiles.length > 0, { timeout: 20000 });
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const cfg = loadConfig();
  forwardDevtools();
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  const page = browser
    .contexts()
    .flatMap((c) => c.pages())
    .find((p) => p.url().startsWith("http"));
  if (!page) throw new Error("no Home Assistant page in the app");

  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  check("Atrium opens in the app", (await openAtrium(page)) != null);
  const panel = await readPanel(page);

  if (process.argv[2] === "inspect") {
    console.log(JSON.stringify(panel, null, 1));
    await browser.close();
    return;
  }

  // Registry ground truth as the app delivers it (full or compact entries).
  const notAuto = await page.evaluate(() => {
    const hass = document.querySelector("home-assistant")?.hass;
    return Object.entries(hass?.entities ?? {})
      .filter(([id, e]) => id.startsWith("light.") && (e.hidden || e.hidden_by || e.disabled_by || e.entity_category))
      .map(([id]) => id);
  });
  const ids = panel.tiles.map((t) => t.entityId);
  const leaked = ids.filter((id) => notAuto.includes(id));
  check("no hidden lights in the app", leaked.length === 0, leaked.join(", ") || `${ids.length} tiles`);
  check("test light shown", ids.includes(cfg.testLight));
  check("narrow layout in the app", panel.narrow);
  check("closed control is invisible", panel.control.visibility === "hidden");

  // Tap toggles and the change shows up; then switch back.
  const before = panel.tiles.find((t) => t.entityId === cfg.testLight)?.state;
  const target = before === "on" ? "off" : "on";
  await (await tileButton(page, cfg.testLight)).tap();
  const ms = await waitFor(
    async () => (await readPanel(page)).tiles.find((t) => t.entityId === cfg.testLight)?.state === target,
    { timeout: 5000 },
  );
  check("tap switches the light in the app", ms != null, `${ms} ms`);
  await (await tileButton(page, cfg.testLight)).tap();
  await waitFor(
    async () => (await readPanel(page)).tiles.find((t) => t.entityId === cfg.testLight)?.state === before,
    { timeout: 5000 },
  );

  await page.screenshot({ path: `${SHOTS}app-real.png` });

  // Pull to refresh with a real finger gesture (the app itself has none).
  await page.evaluate(() => {
    window.__e2eMarker = true;
    document.scrollingElement.scrollTop = 0;
  });
  adb("shell", "input", "swipe", "540", "700", "540", "1700", "700");
  const reloaded = await waitFor(
    async () => {
      try {
        return await page.evaluate(() => window.__e2eMarker !== true);
      } catch {
        return false; // navigation in progress
      }
    },
    { timeout: 10000 },
  );
  check("pull down at the top reloads Atrium", reloaded != null, `${reloaded} ms`);
  check("Atrium is back after the reload", (await openAtrium(page)) != null);

  // A short pull must not reload.
  await page.evaluate(() => (window.__e2eMarker = true));
  adb("shell", "input", "swipe", "540", "700", "540", "850", "300");
  await page.waitForTimeout(2000);
  check("a short pull does not reload", await page.evaluate(() => window.__e2eMarker === true));
  check("no JavaScript errors in the app", errors.length === 0, errors.slice(0, 3).join(" | "));

  await browser.close();
  const failed = results.filter((ok) => !ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed.`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
