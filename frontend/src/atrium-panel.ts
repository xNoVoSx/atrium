import { LitElement, css, html, nothing } from "lit";
import { icon } from "./components/icon";
import type { AtriumLightControl } from "./components/light-control";
import type { PanelContext } from "./context";
import { EntityStore } from "./data/entity-store";
import { isAutoVisible } from "./data/registry";
import { subscribeSettings, type AtriumSettings } from "./data/settings";
import { VersionWatch, loadedHash } from "./data/version-watch";
import { translator, type MessageKey } from "./i18n";
import { navSection, navigate as navigateTo, parseRoute, type PageRoute } from "./router";
import { ICONS } from "./theme/shared";
import { tokens, type ThemePreference } from "./theme/tokens";
import type { HomeAssistant, PanelInfo, Route } from "./types/hass";
import { reportClient } from "./util/diagnostics";
import { PULL_THRESHOLD_PX, attachPullRefresh } from "./util/pull-refresh";

export const VERSION = __ATRIUM_VERSION__;
const THEME_KEY = "atrium-theme";
const THEMES: ThemePreference[] = ["auto", "dark", "light"];
const MENU_ICON = "M4 6h16M4 12h16M4 18h16";

function readThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return THEMES.includes(stored as ThemePreference) ? (stored as ThemePreference) : "auto";
  } catch {
    return "auto";
  }
}

type NavId = "home" | "rooms" | "categories" | "settings";
const NAV: Array<{ id: NavId; route: PageRoute; label: MessageKey; icon: string }> = [
  { id: "home", route: { page: "home" }, label: "nav.home", icon: ICONS.home },
  { id: "rooms", route: { page: "rooms" }, label: "nav.rooms", icon: ICONS.rooms },
  { id: "categories", route: { page: "categories" }, label: "nav.categories", icon: ICONS.categories },
  { id: "settings", route: { page: "settings" }, label: "nav.settings", icon: ICONS.settings },
];

/** The panel Home Assistant mounts in the sidebar: navigation, pages, shared control. */
export class AtriumPanel extends LitElement {
  static override properties = {
    hass: { attribute: false, noAccessor: true },
    narrow: { type: Boolean, reflect: true },
    route: { attribute: false },
    panel: { attribute: false },
    _themePref: { state: true },
    _layout: { state: true },
    _pull: { state: true },
  };

  declare narrow: boolean;
  declare route: Route | undefined;
  declare panel: PanelInfo | undefined;
  declare _themePref: ThemePreference;
  declare _layout: Record<string, unknown>;
  declare _pull: number;

  readonly store = new EntityStore();
  #hass: HomeAssistant | undefined;
  #ctx: PanelContext | undefined;
  #versionWatch = new VersionWatch(() => this.hass, {
    ownHash: loadedHash(import.meta.url),
    isBusy: () => Boolean(this.#control()?.open),
  });
  #connected = false;
  #reported = false;
  #unsubSettings: Promise<() => Promise<void>> | undefined;
  #detachPull: (() => void) | undefined;

  constructor() {
    super();
    this.narrow = false;
    this._themePref = readThemePreference();
    this._layout = {};
    this._pull = 0;
  }

  get hass(): HomeAssistant | undefined {
    return this.#hass;
  }

  // Every state change in the house arrives here. The store forwards it to the
  // affected parts; the panel itself only re-renders for theme, language or user.
  set hass(hass: HomeAssistant | undefined) {
    const prev = this.#hass;
    this.#hass = hass;
    if (!hass) return;
    this.store.update(hass);
    if (!this.#connected && this.isConnected) this.#connect();
    this.#report();
    if (
      !prev ||
      prev.themes !== hass.themes ||
      prev.language !== hass.language ||
      prev.user?.is_admin !== hass.user?.is_admin
    ) {
      this.requestUpdate("hass", prev);
    }
  }

  override connectedCallback(): void {
    super.connectedCallback();
    // Attributes may not be set in a custom element's constructor.
    this.dataset.version = VERSION;
    if (this.#hass && !this.#connected) this.#connect();
    this.#detachPull = attachPullRefresh({
      target: this,
      scrollTop: () => document.scrollingElement?.scrollTop ?? 0,
      enabled: () => this.narrow && !this.#control()?.open,
      onPull: (d) => (this._pull = d),
      onRefresh: () => location.reload(),
    });
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#versionWatch.stop();
    void this.#unsubSettings?.then((unsub) => unsub()).catch(() => undefined);
    this.#unsubSettings = undefined;
    this.#detachPull?.();
    this.#connected = false;
  }

  /** Subscriptions that need both a connection and the DOM. */
  #connect(): void {
    if (!this.#hass) return;
    this.#connected = true;
    void this.#versionWatch.start();
    this.#unsubSettings = subscribeSettings(this.#hass, (settings: AtriumSettings) => {
      this._layout = settings.layout;
    });
    this.#unsubSettings.catch(() => undefined); // integration not loaded: defaults
  }

  #applyTheme(): void {
    const dark =
      this._themePref === "auto" ? Boolean(this.hass?.themes.darkMode) : this._themePref === "dark";
    this.setAttribute("theme", dark ? "dark" : "light");
  }

  #setTheme(pref: ThemePreference): void {
    this._themePref = pref;
    try {
      localStorage.setItem(THEME_KEY, pref);
    } catch {
      // Storage unavailable (private mode): the choice lasts for this session.
    }
  }

  #control(): AtriumLightControl | null {
    return this.renderRoot?.querySelector("atrium-light-control") ?? null;
  }

  #navigate = (route: PageRoute) => {
    navigateTo(this.route?.prefix ?? "/atrium", route);
    window.scrollTo({ top: 0 });
  };

  #onToggle(ev: CustomEvent<{ entityId: string }>): void {
    void this.hass?.callService("light", "toggle", { entity_id: ev.detail.entityId });
  }

  #onMoreInfo(ev: CustomEvent<{ entityId: string }>): void {
    this.#control()?.show(ev.detail.entityId);
  }

  #report(): void {
    const hass = this.hass;
    if (this.#reported || !hass || !Object.keys(hass.entities).length) return;
    this.#reported = true;
    // What this client believes about every light: registry entry present, hidden flag, shown.
    const lights = Object.fromEntries(
      Object.keys(hass.states)
        .filter((id) => id.startsWith("light."))
        .map((id) => [
          id,
          {
            entry: id in hass.entities,
            hidden: hass.entities[id]?.hidden ?? hass.entities[id]?.hidden_by ?? null,
            shown: isAutoVisible(hass, id),
          },
        ]),
    );
    reportClient(hass, VERSION, { lights });
  }

  protected override willUpdate(): void {
    this.#applyTheme();
    const hass = this.hass;
    this.#ctx = {
      store: this.store,
      t: translator(hass?.language),
      locale: hass?.locale?.language ?? hass?.language ?? "en",
      narrow: this.narrow,
      isAdmin: Boolean(hass?.user?.is_admin),
      layout: this._layout,
      navigate: this.#navigate,
    };
  }

  #renderPage(route: PageRoute, ctx: PanelContext) {
    switch (route.page) {
      case "home":
        return html`<atrium-home-page .ctx=${ctx}></atrium-home-page>`;
      case "rooms":
        return html`<atrium-rooms-page .ctx=${ctx}></atrium-rooms-page>`;
      case "room":
        return html`<atrium-room-page .ctx=${ctx} .areaId=${route.areaId}></atrium-room-page>`;
      case "categories":
        return html`<atrium-categories-page .ctx=${ctx}></atrium-categories-page>`;
      case "category":
        return html`<atrium-category-page .ctx=${ctx} .category=${route.category}></atrium-category-page>`;
      case "settings":
        return html`<atrium-settings-page
          .ctx=${ctx}
          .theme=${this._themePref}
          .version=${VERSION}
          @atrium-theme=${(ev: CustomEvent<ThemePreference>) => this.#setTheme(ev.detail)}
        ></atrium-settings-page>`;
    }
  }

  #renderNav(active: NavId, ctx: PanelContext) {
    // Settings are open to everyone (appearance is per device); admin-only parts live inside.
    const items = NAV;
    return html`<nav class=${this.narrow ? "bottom" : "rail"} aria-label="Atrium">
      ${this.narrow ? nothing : html`<div class="brand"><span class="logo">A</span><span>Atrium</span></div>`}
      ${
        this.narrow
          ? html`<button
              type="button"
              data-nav="menu"
              @click=${() =>
                this.dispatchEvent(new CustomEvent("hass-toggle-menu", { bubbles: true, composed: true }))}
            >
              ${icon(MENU_ICON, 22)}<span>${ctx.t("menu.open")}</span>
            </button>`
          : nothing
      }
      ${items.map(
        (n) =>
          html`<a
            href="/atrium${n.route.page === "home" ? "" : `/${n.route.page}`}"
            data-nav=${n.id}
            aria-current=${n.id === active ? "page" : "false"}
            @click=${(ev: MouseEvent) => {
              if (ev.metaKey || ev.ctrlKey) return;
              ev.preventDefault();
              ctx.navigate(n.route);
            }}
            >${icon(n.icon, 22)}<span>${ctx.t(n.label)}</span></a
          >`,
      )}
    </nav>`;
  }

  protected override render() {
    const ctx = this.#ctx;
    if (!ctx) return nothing;
    const route = parseRoute(this.route?.path);
    const pullReady = this._pull >= PULL_THRESHOLD_PX;
    return html`
      ${
        this._pull > 0
          ? html`<div
              class="pull ${pullReady ? "ready" : ""}"
              style="transform: translate(-50%, ${this._pull - 48}px)"
            >
              <span style="transform: rotate(${this._pull * 3}deg)">${icon(ICONS.refresh, 20, 2.2)}</span>
              <span class="sr">${ctx.t(pullReady ? "refresh.release" : "refresh.pull")}</span>
            </div>`
          : nothing
      }
      <div class="shell">
        ${this.#renderNav(navSection(route), ctx)}
        <main
          @atrium-toggle=${this.#onToggle}
          @atrium-more-info=${this.#onMoreInfo}
          style=${this._pull ? `transform: translateY(${this._pull * 0.4}px)` : ""}
        >
          ${this.#renderPage(route, ctx)}
        </main>
      </div>
      <atrium-light-control
        .store=${this.store}
        .t=${ctx.t}
        .mode=${this.narrow ? "sheet" : "dialog"}
      ></atrium-light-control>
    `;
  }

  static override styles = [
    tokens,
    css`
      :host {
        display: block;
        min-height: 100vh;
        background: var(--a-bg);
        color: var(--a-text);
        font-family: var(--a-font);
        -webkit-tap-highlight-color: transparent;
      }
      .shell {
        display: flex;
        min-height: 100vh;
      }
      main {
        flex: 1;
        min-width: 0;
        max-width: 1200px;
        margin: 0 auto;
        padding: 16px 16px 24px;
        box-sizing: border-box;
        position: relative;
      }
      :host([narrow]) main {
        padding-bottom: calc(96px + env(safe-area-inset-bottom));
      }
      nav a,
      nav button {
        font-family: inherit;
        color: var(--a-on-nav);
        text-decoration: none;
        font-weight: 600;
      }
      nav button {
        border: 0;
        background: none;
        cursor: pointer;
      }
      nav a:focus-visible,
      nav button:focus-visible {
        outline: 2px solid var(--a-ocher);
        outline-offset: -2px;
      }
      nav a[aria-current="page"] {
        color: var(--a-ocher);
      }

      /* Phone: bottom bar */
      nav.bottom {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 5;
        display: flex;
        background: var(--a-nav);
        border-top: 1px solid var(--a-nav-line);
        padding-bottom: env(safe-area-inset-bottom);
      }
      nav.bottom a,
      nav.bottom button {
        flex: 1;
        min-height: 68px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 4px;
        min-width: 0;
        padding: 0 2px;
        font-size: 11px;
      }
      nav.bottom span {
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      /* Wide: rail on the left */
      nav.rail {
        position: sticky;
        top: 0;
        align-self: flex-start;
        height: 100vh;
        width: 220px;
        flex: none;
        box-sizing: border-box;
        padding: 20px 12px;
        background: var(--a-nav);
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      nav.rail .brand {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 0 8px 16px;
        color: var(--a-on-panel);
        font-size: 18px;
        font-weight: 600;
      }
      nav.rail .logo {
        width: 32px;
        height: 32px;
        border-radius: var(--a-radius);
        background: var(--a-ocher);
        color: var(--a-on-ocher);
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
      }
      nav.rail a {
        min-height: 44px;
        padding: 0 10px;
        border-radius: var(--a-radius);
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 15px;
      }
      nav.rail a[aria-current="page"] {
        background: var(--a-panel2);
      }

      /* Pull to refresh */
      .pull {
        position: fixed;
        top: 0;
        left: 50%;
        z-index: 6;
        width: 40px;
        height: 40px;
        border-radius: 20px;
        background: var(--a-s2);
        color: var(--a-text2);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.3);
      }
      .pull.ready {
        background: var(--a-ocher);
        color: var(--a-on-ocher);
      }
      .pull span {
        display: flex;
      }
      .sr {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
      }
    `,
  ];
}
