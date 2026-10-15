// Helpers for the end-to-end tests: configuration, login, HA access and
// reading the panel through its shadow roots.

import { readFileSync } from "node:fs";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see .env.example)`);
  return value;
}

export function loadConfig() {
  const haUrl = required("ATRIUM_HA_URL").replace(/\/$/, "");
  const user = Object.fromEntries(
    readFileSync(required("ATRIUM_TEST_USER_FILE"), "utf8")
      .trim()
      .split("\n")
      .map((line) => line.split(/=(.*)/s).slice(0, 2)),
  );
  return {
    haUrl,
    clientId: `${haUrl}/`,
    adminToken: readFileSync(required("ATRIUM_ADMIN_TOKEN_FILE"), "utf8").trim(),
    username: user.username,
    password: user.password,
    testLight: required("ATRIUM_TEST_LIGHT"),
  };
}

/** The login flow the frontend uses: login_flow -> authorization code -> tokens. */
export async function login(cfg) {
  const json = async (res) => {
    if (!res.ok) throw new Error(`${res.url}: ${res.status} ${await res.text()}`);
    return res.json();
  };
  const post = (path, body) =>
    fetch(`${cfg.haUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const flow = await json(
    await post("/auth/login_flow", {
      client_id: cfg.clientId,
      handler: ["homeassistant", null],
      redirect_uri: `${cfg.haUrl}/?auth_callback=1`,
    }),
  );
  const step = await json(
    await post(`/auth/login_flow/${flow.flow_id}`, {
      client_id: cfg.clientId,
      username: cfg.username,
      password: cfg.password,
    }),
  );
  if (step.type !== "create_entry") throw new Error(`login failed: ${JSON.stringify(step)}`);
  return json(
    await fetch(`${cfg.haUrl}/auth/token`, {
      method: "POST",
      body: new URLSearchParams({ grant_type: "authorization_code", code: step.result, client_id: cfg.clientId }),
    }),
  );
}

export async function adminRest(cfg, path, body) {
  const res = await fetch(`${cfg.haUrl}/api/${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${cfg.adminToken}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

/** Runs WebSocket API commands as admin, from inside the browser (shares its network path). */
export async function adminWs(context, cfg, commands) {
  const page = await context.newPage();
  try {
    // Open the socket from HA's own origin, like the real frontend does.
    await page.goto(`${cfg.haUrl}/manifest.json`);
    return await page.evaluate(
      ({ url, token, commands }) =>
        new Promise((resolve, reject) => {
          const ws = new WebSocket(url);
          const results = [];
          ws.onmessage = (ev) => {
            const msg = JSON.parse(ev.data);
            if (msg.type === "auth_required") ws.send(JSON.stringify({ type: "auth", access_token: token }));
            else if (msg.type === "auth_ok") commands.forEach((c, i) => ws.send(JSON.stringify({ id: i + 1, ...c })));
            else if (msg.type === "auth_invalid") reject(new Error("admin token rejected"));
            else if (msg.type === "result") {
              results[msg.id - 1] = msg.result;
              if (results.filter((r) => r !== undefined).length === commands.length) {
                ws.close();
                resolve(results);
              }
            }
          };
          ws.onerror = () => reject(new Error("websocket error"));
        }),
      { url: `${cfg.haUrl.replace(/^http/, "ws")}/api/websocket`, token: cfg.adminToken, commands },
    );
  } finally {
    await page.close();
  }
}

export function browserProxy() {
  const raw = process.env.HTTP_PROXY || process.env.http_proxy;
  if (!raw) return undefined;
  const url = new URL(raw);
  return {
    server: `${url.protocol}//${url.host}`,
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
}

/** What the Android Companion app injects into its WebView, enough for external auth. */
export function companionAppBridge({ accessToken, expiresIn }) {
  window.__busLog = [];
  window.externalApp = {
    getExternalAuth(payload) {
      const { callback } = JSON.parse(payload);
      setTimeout(() => window[callback](true, { access_token: accessToken, expires_in: expiresIn }));
    },
    revokeExternalAuth(payload) {
      const { callback } = JSON.parse(payload);
      setTimeout(() => window[callback](true));
    },
    externalBus(raw) {
      const msg = JSON.parse(raw);
      window.__busLog.push(msg.type);
      if (msg.type === "config/get") {
        setTimeout(() =>
          window.externalBus({
            id: msg.id,
            type: "result",
            success: true,
            result: { hasSettingsScreen: true, hasSidebar: true, canWriteTag: false, appVersion: "e2e" },
          }),
        );
      }
    },
  };
}

export function storedTokens(tokens) {
  localStorage.setItem("hassTokens", JSON.stringify(tokens));
}

// ---- reading the panel (runs in the page) ----

const FIND_PANEL = `
  (function find(root) {
    const hit = root.querySelector("atrium-panel");
    if (hit) return hit;
    for (const el of root.querySelectorAll("*")) {
      if (el.shadowRoot) { const x = find(el.shadowRoot); if (x) return x; }
    }
    return null;
  })(document)`;

export const readPanel = (page) =>
  page.evaluate((findPanel) => {
    const panel = eval(findPanel);
    if (!panel?.shadowRoot) return null; // element not upgraded yet
    const deep = (root, sel, out = []) => {
      out.push(...root.querySelectorAll(sel));
      for (const el of root.querySelectorAll("*")) if (el.shadowRoot) deep(el.shadowRoot, sel, out);
      return out;
    };
    const page = panel.shadowRoot.querySelector("main > *");
    const tiles = deep(panel.shadowRoot, "atrium-light-tile").map((t) => ({
      entityId: t.entityId,
      state: t.getAttribute("state"),
      renders: t.renderCount,
    }));
    const control = panel.shadowRoot.querySelector("atrium-light-control");
    const surface = control?.shadowRoot?.querySelector(".surface");
    if (!page?.shadowRoot || !surface) return null; // not rendered yet
    const rect = surface.getBoundingClientRect();
    return {
      version: panel.dataset.version,
      bundleUrl: performance
        .getEntriesByType("resource")
        .map((e) => e.name)
        .filter((n) => n.includes("/atrium_static/atrium.js"))
        .pop(),
      theme: panel.getAttribute("theme"),
      narrow: panel.hasAttribute("narrow"),
      page: page.localName,
      menuShown: Boolean(panel.shadowRoot.querySelector('nav [data-nav="menu"]')),
      nav: panel.shadowRoot.querySelector("nav")?.className,
      // Labels in the navigation must not run into each other or be cut off.
      navLabelsFit: [...panel.shadowRoot.querySelectorAll("nav span")].every((s) => s.scrollWidth <= s.clientWidth + 1),
      tiles,
      control: {
        open: control.hasAttribute("open"),
        mode: control.getAttribute("mode"),
        visibility: getComputedStyle(surface).visibility,
        dimHidden: control.shadowRoot.querySelector(".dim")?.hidden ?? null,
        rect: { top: rect.top, bottom: rect.bottom },
      },
      viewport: { w: innerWidth, h: innerHeight },
    };
  }, FIND_PANEL);

export const tileButton = (page, entityId) =>
  page.evaluateHandle(
    ({ findPanel, entityId }) => {
      const find = (root) => {
        const hit = root.querySelector(`atrium-light-tile[entity-id="${entityId}"]`);
        if (hit) return hit;
        for (const el of root.querySelectorAll("*")) {
          if (el.shadowRoot) {
            const x = find(el.shadowRoot);
            if (x) return x;
          }
        }
        return null;
      };
      return find(eval(findPanel).shadowRoot).shadowRoot.querySelector("button");
    },
    { findPanel: FIND_PANEL, entityId },
  );

/** Click a navigation entry (home, rooms, categories, settings, menu). */
export const clickNav = (page, id) =>
  page.evaluate(
    ({ findPanel, id }) => eval(findPanel).shadowRoot.querySelector(`nav [data-nav="${id}"]`).click(),
    { findPanel: FIND_PANEL, id },
  );

/** Switch the theme on the settings page and return to the home page. */
export async function clickThemeButton(page, theme) {
  await clickNav(page, "settings");
  await page.waitForTimeout(300);
  await page.evaluate(
    ({ findPanel, theme }) =>
      eval(findPanel)
        .shadowRoot.querySelector("atrium-settings-page")
        .shadowRoot.querySelector(`.seg button[data-theme="${theme}"]`)
        .click(),
    { findPanel: FIND_PANEL, theme },
  );
  await clickNav(page, "home");
  await page.waitForTimeout(300);
}

export const plantStyle = (page, cssText) =>
  page.evaluate(
    ({ findPanel, cssText }) => {
      const panel = eval(findPanel);
      // Plant into the header module (deepest common place with text).
      const root = panel.shadowRoot
        .querySelector("atrium-home-page")
        .shadowRoot.querySelector("atrium-header-module").shadowRoot;
      root.getElementById("e2e-planted")?.remove();
      if (!cssText) return;
      const style = document.createElement("style");
      style.id = "e2e-planted";
      style.textContent = cssText;
      root.append(style);
    },
    { findPanel: FIND_PANEL, cssText },
  );

/** WCAG contrast of every visible text in the panel; text opacity is blended in. */
export const contrastIssues = (page) =>
  page.evaluate((findPanel) => {
    const parse = (c) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      return { r, g, b, a };
    };
    const lum = ({ r, g, b }) => {
      const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const blend = (fg, bg, a) => ({ r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a) });
    const up = (el) => el.parentElement || el.getRootNode().host || null;
    const background = (el) => {
      for (let n = el; n; n = up(n)) {
        const c = parse(getComputedStyle(n).backgroundColor);
        if (c && c.a > 0.5) return c;
      }
      return { r: 255, g: 255, b: 255, a: 1 };
    };
    const opacity = (el) => {
      let o = 1;
      for (let n = el; n; n = up(n)) o *= Number(getComputedStyle(n).opacity);
      return o;
    };
    const issues = [];
    const walk = (root) => {
      for (const el of root.querySelectorAll("*")) {
        if (el.shadowRoot) walk(el.shadowRoot);
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (!own) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility !== "visible" || el.getBoundingClientRect().width === 0 || opacity(el) < 0.3) continue;
        const bg = background(el);
        const fg = blend(parse(cs.color), bg, parse(cs.color).a * opacity(el));
        const [l1, l2] = [lum(fg), lum(bg)].sort((a, b) => b - a);
        const ratio = (l1 + 0.05) / (l2 + 0.05);
        const size = parseFloat(cs.fontSize);
        const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 600);
        if (ratio < (large ? 3 : 4.5)) issues.push(`"${el.textContent.trim().slice(0, 20)}" ${ratio.toFixed(2)}`);
      }
    };
    walk(eval(findPanel).shadowRoot);
    return issues;
  }, FIND_PANEL);

export async function waitFor(fn, { timeout = 10000, interval = 20 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = await fn();
    if (value) return Date.now() - start;
    await new Promise((r) => setTimeout(r, interval));
  }
  return null;
}
