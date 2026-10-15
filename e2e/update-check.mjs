// Checks that open Atrium pages load a new frontend by themselves (wall tablets).
//
// 1. Open the panel in app mode and mark the page.
// 2. Change the bundle on the server and reload the entry -> the page must reload.
// 3. Same again while the control is open. Home Assistant re-creates the panel
//    element when the module URL changes (which closes the control), so the
//    page must still end up on the new bundle instead of getting stuck.
// 4. Put the original bundle back.

import { readFileSync } from "node:fs";
import { chromium, devices } from "playwright";
import { api, reloadEntry, ssh } from "../scripts/ha.mjs";
import { adminWs, browserProxy, companionAppBridge, loadConfig, login, readPanel, tileButton, waitFor } from "./lib.mjs";

const REMOTE_BUNDLE = "/config/custom_components/atrium/frontend/atrium.js";
const localBundle = readFileSync(new URL("../custom_components/atrium/frontend/atrium.js", import.meta.url));

const results = [];
function check(name, ok, detail = "") {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

async function changeBundle(note) {
  ssh(`printf '\\n// e2e update check: ${note}\\n' >> ${REMOTE_BUNDLE}`);
  await reloadEntry();
}

async function main() {
  const cfg = loadConfig();
  const browser = await chromium.launch({ proxy: browserProxy() });
  const adminCtx = await browser.newContext();
  const serverHash = async () => (await adminWs(adminCtx, cfg, [{ type: "atrium/info" }]))[0].frontend_hash;

  const tokens = await login(cfg);
  const pixel = devices["Pixel 7"];
  const app = await browser.newContext({ ...pixel });
  await app.addInitScript(companionAppBridge, { accessToken: tokens.access_token, expiresIn: tokens.expires_in });
  const page = await app.newPage();
  await page.goto(`${cfg.haUrl}/atrium?external_auth=1`);
  await waitFor(async () => (await readPanel(page))?.tiles.length > 0, { timeout: 30000 });

  const mark = () => page.evaluate(() => (window.__e2eMarker = true));
  const reloaded = async () => {
    try {
      return !(await page.evaluate(() => window.__e2eMarker === true));
    } catch {
      return false; // navigation in progress
    }
  };
  const runsHash = async (hash) => (await readPanel(page).catch(() => null))?.bundleUrl?.endsWith(`?v=${hash}`);

  try {
    // Idle page: reloads right away.
    await mark();
    await changeBundle("idle");
    const hash1 = await serverHash();
    const ms = await waitFor(async () => (await reloaded()) && (await runsHash(hash1)), { timeout: 20000 });
    check("idle page loads the new bundle by itself", ms != null, `${ms} ms`);

    // Control open while the update arrives.
    await waitFor(async () => (await readPanel(page))?.tiles.length > 0, { timeout: 30000 });
    await (await tileButton(page, cfg.testLight)).click({ button: "right" });
    await page.waitForTimeout(400);
    await mark();
    await changeBundle("busy");
    const hash2 = await serverHash();
    const ms2 = await waitFor(async () => (await reloaded()) && (await runsHash(hash2)), { timeout: 20000 });
    const after = await readPanel(page).catch(() => null);
    check(
      "control open during update: still ends up on the new bundle",
      ms2 != null,
      ms2 != null
        ? `${ms2} ms`
        : `reloaded=${await reloaded()} control.open=${after?.control.open} bundle=${after?.bundleUrl?.split("?")[1]} server=${hash2}`,
    );
  } finally {
    // Restore the bundle that was deployed.
    ssh(`cat > ${REMOTE_BUNDLE}`, localBundle);
    await reloadEntry();
    const [entry] = await api("config/config_entries/entry?domain=atrium");
    console.log(`restored original bundle (entry ${entry?.state})`);
    await browser.close();
  }

  const failed = results.filter((ok) => !ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed.`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
