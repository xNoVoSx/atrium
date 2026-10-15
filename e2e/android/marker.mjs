// Helper for checks that need a gesture in between (done with adb):
//   node marker.mjs set    -> marks the current page and scrolls to the top
//   node marker.mjs check  -> tells whether the page was reloaded since

import { chromium } from "playwright";

const browser = await chromium.connectOverCDP(process.env.ATRIUM_APP_CDP ?? "http://127.0.0.1:9333");
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => p.url().startsWith("http"));

if (process.argv[2] === "set") {
  await page.evaluate(() => {
    window.__marker = true;
    document.scrollingElement.scrollTop = 0;
  });
  console.log("marked", page.url(), "scrollTop", await page.evaluate(() => document.scrollingElement.scrollTop));
} else {
  const state = await page.evaluate(() => ({
    reloaded: window.__marker !== true,
    scrollTop: document.scrollingElement.scrollTop,
    url: location.href,
  }));
  console.log(JSON.stringify(state));
}
await browser.close();
