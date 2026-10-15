// Attach to the WebView of the real Companion app (running in an emulator) and
// report what Atrium sees there.
//
// Needs: emulator with the app logged in, WebView debugging socket forwarded:
//   adb forward tcp:9333 localabstract:webview_devtools_remote_<pid of the app>

import { chromium } from "playwright";
import { readPanel, waitFor } from "../lib.mjs";

const CDP = process.env.ATRIUM_APP_CDP ?? "http://127.0.0.1:9333";

const browser = await chromium.connectOverCDP(CDP);
const pages = browser.contexts().flatMap((c) => c.pages());
const page = pages.find((p) => p.url().startsWith("http"));
if (!page) throw new Error(`no HA page in the app: ${pages.map((p) => p.url()).join(", ")}`);
console.log("app page:", page.url());

// Navigate like the sidebar does.
await page.evaluate(() => {
  history.pushState(null, "", "/atrium");
  window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
});
await waitFor(async () => (await readPanel(page))?.tiles.length > 0, { timeout: 20000 });

const panel = await readPanel(page);
console.log("version:", panel?.version, "bundle:", panel?.bundleUrl?.split("?")[1], "narrow:", panel?.narrow);
console.log("tiles:", panel?.tiles.map((t) => t.entityId).join(", "));

const view = await page.evaluate(() => {
  const ha = document.querySelector("home-assistant");
  const hass = ha?.hass;
  const probe = ["light.example_1", "light.example_2"];
  // Which element scrolls? Pull-to-refresh in the app needs to know whether we are at the top.
  const scrollers = [];
  const walk = (root) => {
    for (const el of root.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) {
        scrollers.push(`${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""} ${el.clientHeight}/${el.scrollHeight}`);
      }
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(document);
  return {
    user: hass?.user?.name,
    admin: hass?.user?.is_admin,
    entityCount: hass ? Object.keys(hass.entities).length : null,
    probe: Object.fromEntries(probe.map((id) => [id, hass?.entities[id] ?? null])),
    ua: navigator.userAgent,
    documentScroll: `${document.scrollingElement.clientHeight}/${document.scrollingElement.scrollHeight}`,
    scrollers,
  };
});
console.log(JSON.stringify(view, null, 1));
await page.screenshot({ path: new URL("../screenshots/android-app.png", import.meta.url).pathname });
await browser.close();
