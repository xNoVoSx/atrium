import { LitElement, css, html, nothing } from "lit";
import { icon } from "./components/icon";
import type { AtriumSheet } from "./components/sheet";
import type { PanelContext } from "./context";
import { EntityStore } from "./data/entity-store";
import { isAutoVisible } from "./data/registry";
import { categoryInfo } from "./data/categories";
import { rooms } from "./data/home";
import {
  categoryList,
  hiddenAreas,
  hiddenEntities,
  savedOrder,
  setEntityHidden,
  toggleFavorite,
} from "./data/layout";
import { userLevel } from "./data/levels";
import { navMatches, navRoute, railMode, visibleNav, CATEGORIES, type NavItem } from "./data/nav";
import { page as pageConfig } from "./data/pages";
import { saveLayout, saveUserSettings, subscribeSettings, type AtriumSettings } from "./data/settings";
import { VersionWatch, loadedHash } from "./data/version-watch";
import { translator } from "./i18n";
import { navigate as navigateTo, parseRoute, type PageRoute } from "./router";
import { ICONS } from "./theme/shared";
import { ACCENTS, DENSITIES, tokens, type Density, type ThemePreference } from "./theme/tokens";
import type { HomeAssistant, PanelInfo, Route } from "./types/hass";
import { reportClient } from "./util/diagnostics";
import { WI } from "./widgets/icons";
import { readScreensaverMinutes, SCREENSAVER_KEY } from "./components/screensaver";
import type { AtriumDoorbell } from "./components/doorbell";
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

const SEARCH_ICON = "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4";
const MORE_ICON = "M5 12h.01M12 12h.01M19 12h.01";

/** One resolved navigation entry, ready to draw. */
interface NavEntry {
  key: string;
  kind: NavItem["kind"];
  label: string;
  /** SVG path or "mdi:…". */
  icon: string;
  route: PageRoute | null;
  url?: string;
  active: boolean;
  bottom: boolean;
  item: NavItem;
}

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
    _controlId: { state: true },
    _user: { state: true },
    _editing: { state: true },
    _more: { state: true },
    _search: { state: true },
    _reducedMotion: { state: true },
    _toast: { state: true },
    _saverMin: { state: true },
    _offline: { state: true },
  };

  declare narrow: boolean;
  declare route: Route | undefined;
  declare panel: PanelInfo | undefined;
  declare _themePref: ThemePreference;
  declare _layout: Record<string, unknown>;
  declare _pull: number;
  /** Entity shown in the sheet. */
  declare _controlId: string | null;
  declare _user: Record<string, unknown>;
  declare _editing: boolean;
  /** Phone: the sheet with all navigation entries. */
  declare _more: boolean;
  declare _search: boolean;
  declare _reducedMotion: boolean;
  /** Short message at the bottom (e.g. an action that failed). */
  declare _toast: string | null;
  /** The connection to Home Assistant is down. */
  declare _offline: boolean;
  /** Screensaver after this many idle minutes on this device (0 = off). */
  declare _saverMin: number;
  #toastTimer: ReturnType<typeof setTimeout> | undefined;

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
    this._controlId = null;
    this._user = {};
    this._editing = false;
    this._more = false;
    this._search = false;
    this._reducedMotion = false;
    this._toast = null;
    this._offline = false;
    this._saverMin = readScreensaverMinutes();
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
    this.#motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    this._reducedMotion = Boolean(this.#motionQuery?.matches);
    this.#motionQuery?.addEventListener?.("change", this.#onMotion);
    // Capture: Home Assistant's own quick search also listens for Ctrl+K.
    window.addEventListener("keydown", this.#onKey, { capture: true });
    window.addEventListener("unhandledrejection", this.#onRejection);
    this.#detachPull = attachPullRefresh({
      target: this,
      scrollTop: () => document.scrollingElement?.scrollTop ?? 0,
      enabled: () => this.narrow && !this._editing && !this.#control()?.open,
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
    this.#motionQuery?.removeEventListener?.("change", this.#onMotion);
    window.removeEventListener("keydown", this.#onKey, { capture: true });
    window.removeEventListener("unhandledrejection", this.#onRejection);
    this.#hass?.connection.removeEventListener?.("disconnected", this.#onDisconnected);
    this.#hass?.connection.removeEventListener?.("ready", this.#onReady);
    this.#connected = false;
  }

  #motionQuery: MediaQueryList | undefined;
  #onMotion = (ev: MediaQueryListEvent) => (this._reducedMotion = ev.matches);

  // Ctrl/Cmd+K opens the search, Escape closes it.
  #onKey = (ev: KeyboardEvent) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "k") {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      this._search = true;
    }
  };

  /** Subscriptions that need both a connection and the DOM. */
  #connect(): void {
    if (!this.#hass) return;
    this.#connected = true;
    void this.#versionWatch.start();
    this.#unsubSettings = subscribeSettings(this.#hass, (settings: AtriumSettings) => {
      this._layout = settings.layout;
      this._user = settings.user;
    });
    this.#unsubSettings.catch(() => undefined); // integration not loaded: defaults
    const conn = this.#hass.connection;
    conn.addEventListener?.("disconnected", this.#onDisconnected);
    conn.addEventListener?.("ready", this.#onReady);
  }

  #onDisconnected = () => (this._offline = true);
  #onReady = () => (this._offline = false);

  showToast(message: string): void {
    this._toast = message;
    clearTimeout(this.#toastTimer);
    this.#toastTimer = setTimeout(() => (this._toast = null), 4500);
  }

  // Service calls are fired and forgotten all over the panel; when one fails,
  // Home Assistant rejects with { code, message }. Say so instead of staying silent.
  #onRejection = (ev: PromiseRejectionEvent) => {
    const reason = ev.reason as { code?: unknown; message?: unknown } | undefined;
    if (!reason || typeof reason !== "object" || typeof reason.message !== "string" || !("code" in reason))
      return;
    ev.preventDefault();
    this.showToast(`${this.#ctx?.t("toast.failed") ?? "Failed"}: ${reason.message}`);
  };

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

  #control(): AtriumSheet | null {
    return this.renderRoot?.querySelector("atrium-sheet") ?? null;
  }

  #navigate = (route: PageRoute) => {
    navigateTo(this.route?.prefix ?? "/atrium", route);
    window.scrollTo({ top: 0 });
  };

  #saveLayout = (layout: object) => {
    const hass = this.hass;
    if (!hass?.user?.is_admin) return;
    this._layout = layout as Record<string, unknown>; // show at once; the subscription confirms
    void saveLayout(hass, this._layout);
  };

  #saveUser = (settings: object) => {
    const hass = this.hass;
    if (!hass) return;
    this._user = settings as Record<string, unknown>;
    void saveUserSettings(hass, this._user);
  };

  #onFavorite(ev: CustomEvent<{ entityId: string }>): void {
    this.#saveUser(toggleFavorite(this._user, ev.detail.entityId));
  }

  #onHide(ev: CustomEvent<{ entityId: string }>): void {
    const id = ev.detail.entityId;
    this.#saveLayout(setEntityHidden(this._layout, id, !hiddenEntities(this._layout).has(id)));
  }

  #onToggle(ev: CustomEvent<{ entityId: string }>): void {
    void this.hass?.callService("light", "toggle", { entity_id: ev.detail.entityId });
  }

  /** Own controls for lights and heating; everything else opens Home Assistant's dialog. */
  #onMoreInfo(ev: CustomEvent<{ entityId: string }>): void {
    const id = ev.detail.entityId;
    if (id.startsWith("light.") || id.startsWith("climate.")) {
      this._controlId = id;
      void this.updateComplete.then(() => this.#control()?.show());
    } else {
      this.dispatchEvent(
        new CustomEvent("hass-more-info", { detail: { entityId: id }, bubbles: true, composed: true }),
      );
    }
  }

  #renderControl(ctx: PanelContext) {
    const id = this._controlId;
    const body = !id
      ? nothing
      : id.startsWith("climate.")
        ? html`<atrium-climate-body
            .store=${this.store}
            .t=${ctx.t}
            .locale=${ctx.locale}
            .entityId=${id}
          ></atrium-climate-body>`
        : html`<atrium-light-body .store=${this.store} .t=${ctx.t} .entityId=${id}></atrium-light-body>`;
    return html`<atrium-sheet
      .mode=${this.narrow ? "sheet" : "dialog"}
      .label=${id ? ((this.store.state(id)?.attributes.friendly_name as string | undefined) ?? id) : ""}
      @atrium-close-sheet=${() => this.#control()?.close()}
      >${body}</atrium-sheet
    >`;
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
    const hidden = hiddenEntities(this._layout);
    // In edit mode hidden things stay visible (dimmed) so they can come back.
    this.store.setHidden(hidden, hiddenAreas(this._layout), !this._editing);
    const level = userLevel(this._layout, this._user, hass?.user?.id, Boolean(hass?.user?.is_admin));
    this.setAttribute("level", level);
    const motionOff = this._reducedMotion || this._user.motion === "off";
    // Entry effects become instant and loops run once, i.e. everything stands still.
    this.style.setProperty("--a-motion", motionOff ? "0.001" : "1");
    this.style.setProperty("--a-iter", motionOff ? "1" : "infinite");
    const accent = ACCENTS[String(this._user.accent ?? "")];
    if (accent) {
      this.style.setProperty("--a-ocher", accent.accent);
      this.style.setProperty("--a-on-ocher", accent.on);
    } else {
      this.style.removeProperty("--a-ocher");
      this.style.removeProperty("--a-on-ocher");
    }
    const density = DENSITIES.includes(this._user.density as Density)
      ? (this._user.density as Density)
      : level === "simple"
        ? "large"
        : "normal";
    this.setAttribute("density", density);
    this.#ctx = {
      store: this.store,
      t: translator(hass?.language),
      locale: hass?.locale?.language ?? hass?.language ?? "en",
      narrow: this.narrow,
      isAdmin: Boolean(hass?.user?.is_admin),
      userId: hass?.user?.id ?? "",
      level,
      layout: this._layout,
      user: this._user,
      editing: this._editing,
      hiddenEntities: hidden,
      navigate: this.#navigate,
      saveLayout: this.#saveLayout,
      saveUser: this.#saveUser,
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
      case "page":
        return html`<atrium-widget-page .ctx=${ctx} .pageId=${route.pageId}></atrium-widget-page>`;
      case "settings":
        return html`<atrium-settings-page
          .ctx=${ctx}
          .theme=${this._themePref}
          .version=${VERSION}
          .saver=${this._saverMin}
          @atrium-theme=${(ev: CustomEvent<ThemePreference>) => this.#setTheme(ev.detail)}
          @atrium-screensaver=${(ev: CustomEvent<number>) => {
            this._saverMin = ev.detail;
            try {
              localStorage.setItem(SCREENSAVER_KEY, String(ev.detail));
            } catch {
              // no storage: lasts for this session
            }
          }}
        ></atrium-settings-page>`;
    }
  }

  /** The stored navigation resolved for this user: labels, icons, routes, expanded groups. */
  #navEntries(route: PageRoute, ctx: PanelContext): NavEntry[] {
    const hass = this.store.hass;
    const entries: NavEntry[] = [];
    const base = (
      item: NavItem,
      key: string,
      label: string,
      icon: string,
      r: PageRoute | null,
      url?: string,
    ): NavEntry => ({
      key,
      kind: item.kind,
      label: item.label || label,
      icon: item.icon || icon,
      route: r,
      ...(url ? { url } : {}),
      active: r
        ? navMatches({ ...item, ...(r.page === "room" ? { kind: "room", areaId: r.areaId } : {}) }, route)
        : false,
      bottom: Boolean(item.bottom),
      item,
    });
    for (const item of visibleNav(this._layout, ctx.level)) {
      switch (item.kind) {
        case "home":
          entries.push(base(item, item.id, ctx.t("nav.home"), ICONS.home, navRoute(item)));
          break;
        case "rooms":
          entries.push(base(item, item.id, ctx.t("nav.rooms"), ICONS.rooms, navRoute(item)));
          break;
        case "categories":
          entries.push(base(item, item.id, ctx.t("nav.categories"), ICONS.categories, navRoute(item)));
          break;
        case "settings":
          entries.push(base(item, item.id, ctx.t("nav.settings"), ICONS.settings, navRoute(item)));
          break;
        case "search":
          entries.push(base(item, item.id, ctx.t("nav.search"), SEARCH_ICON, null));
          break;
        case "room": {
          const area = item.areaId ? hass?.areas[item.areaId] : undefined;
          if (area) entries.push(base(item, item.id, area.name, area.icon ?? ICONS.rooms, navRoute(item)));
          break;
        }
        case "category": {
          const info = categoryInfo(item.category ?? "");
          if (info) entries.push(base(item, item.id, ctx.t(info.title), info.icon, navRoute(item)));
          break;
        }
        case "page": {
          const cfg = pageConfig(this._layout, item.pageId ?? "");
          if (cfg)
            entries.push(base(item, item.id, cfg.title ?? cfg.id, cfg.icon ?? WI.note, navRoute(item)));
          break;
        }
        case "link":
          if (item.url) entries.push(base(item, item.id, item.url, WI.link, null, item.url));
          break;
        case "heading":
          entries.push(base(item, item.id, item.label ?? "", "", null));
          break;
        case "divider":
          entries.push(base(item, item.id, "", "", null));
          break;
        case "all-rooms":
          if (hass)
            for (const r of rooms(hass, savedOrder(this._layout, "rooms"))) {
              const area = hass.areas[r.areaId];
              const roomRoute: PageRoute = { page: "room", areaId: r.areaId };
              entries.push({
                ...base(
                  { ...item, label: "" },
                  `${item.id}:${r.areaId}`,
                  r.name,
                  area?.icon ?? ICONS.rooms,
                  roomRoute,
                ),
                active: route.page === "room" && route.areaId === r.areaId,
              });
            }
          break;
        case "all-categories":
          for (const { id } of categoryList(this._layout, CATEGORIES).filter((c) => c.enabled)) {
            const info = categoryInfo(id);
            if (!info || (info.minLevel === "expert" && ctx.level !== "expert")) continue;
            const catRoute: PageRoute = { page: "category", category: id };
            entries.push({
              ...base({ ...item, label: "" }, `${item.id}:${id}`, ctx.t(info.title), info.icon, catRoute),
              active: route.page === "category" && route.category === id,
            });
          }
          break;
      }
    }
    return entries;
  }

  #navIcon(path: string, size = 22) {
    if (path.startsWith("mdi:") && customElements.get("ha-icon"))
      return html`<ha-icon .icon=${path} style="--mdc-icon-size:${size}px"></ha-icon>`;
    return icon(path.startsWith("mdi:") ? ICONS.rooms : path, size);
  }

  #go(ev: MouseEvent, entry: NavEntry, ctx: PanelContext): void {
    if (entry.kind === "search") {
      ev.preventDefault();
      this._more = false;
      this._search = true;
      return;
    }
    if (entry.url) {
      if (entry.url.startsWith("/") && !ev.metaKey && !ev.ctrlKey) {
        ev.preventDefault();
        history.pushState(null, "", entry.url);
        window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
      }
      this._more = false;
      return;
    }
    if (!entry.route || ev.metaKey || ev.ctrlKey) return;
    ev.preventDefault();
    this._more = false;
    ctx.navigate(entry.route);
  }

  #href(entry: NavEntry): string {
    if (entry.url) return entry.url;
    if (!entry.route) return "#";
    const prefix = this.route?.prefix ?? "/atrium";
    switch (entry.route.page) {
      case "home":
        return prefix;
      case "room":
        return `${prefix}/room/${encodeURIComponent(entry.route.areaId)}`;
      case "category":
        return `${prefix}/category/${encodeURIComponent(entry.route.category)}`;
      case "page":
        return `${prefix}/page/${encodeURIComponent(entry.route.pageId)}`;
      default:
        return `${prefix}/${entry.route.page}`;
    }
  }

  #navLink(entry: NavEntry, ctx: PanelContext) {
    if (entry.kind === "heading") return html`<div class="nav-heading">${entry.label}</div>`;
    if (entry.kind === "divider") return html`<hr class="nav-divider" />`;
    const builtin = ["home", "rooms", "categories", "settings", "search"].includes(entry.kind);
    return html`<a
      href=${this.#href(entry)}
      data-nav=${builtin ? entry.kind : entry.key}
      target=${entry.url && !entry.url.startsWith("/") ? "_blank" : nothing}
      rel=${entry.url ? "noopener noreferrer" : nothing}
      aria-current=${entry.active ? "page" : "false"}
      title=${entry.label}
      @click=${(ev: MouseEvent) => this.#go(ev, entry, ctx)}
      >${this.#navIcon(entry.icon)}<span>${entry.label}</span></a
    >`;
  }

  #renderNav(route: PageRoute, ctx: PanelContext) {
    const entries = this.#navEntries(route, ctx);
    if (!this.narrow) {
      const icons = railMode(this._layout) === "icons";
      return html`<nav class=${icons ? "rail icons" : "rail"} aria-label="Atrium">
        <div class="brand"><span class="logo">A</span><span>Atrium</span></div>
        <div class="rail-items">${entries.map((e) => this.#navLink(e, ctx))}</div>
      </nav>`;
    }
    // Phone: the HA menu, up to four chosen entries, and "more" for the rest.
    const links = entries.filter((e) => e.kind !== "heading" && e.kind !== "divider");
    const bar = links.filter((e) => e.bottom).slice(0, 4);
    const rest = entries.filter((e) => !bar.includes(e));
    // "More" only when something besides the search is left (the search alone is not worth a slot).
    const restHasLinks = rest.some((e) => !["heading", "divider", "search"].includes(e.kind));
    const moreActive = rest.some((e) => e.active);
    return html`<nav class="bottom" aria-label="Atrium">
        <button
          type="button"
          data-nav="menu"
          @click=${() => this.dispatchEvent(new CustomEvent("hass-toggle-menu", { bubbles: true, composed: true }))}
        >
          ${icon(MENU_ICON, 22)}<span>${ctx.t("menu.open")}</span>
        </button>
        ${bar.map((e) => this.#navLink(e, ctx))}
        ${
          restHasLinks
            ? html`<button
                type="button"
                data-nav="more"
                aria-current=${moreActive ? "page" : "false"}
                @click=${() => (this._more = true)}
              >
                ${icon(MORE_ICON, 22, 3)}<span>${ctx.t("nav.more")}</span>
              </button>`
            : nothing
        }
      </nav>
      ${
        this._more
          ? html`<div class="more-scrim" @click=${() => (this._more = false)}></div>
              <div class="more" role="dialog" aria-label=${ctx.t("nav.more")}>
                <div class="more-grid">${rest.map((e) => this.#navLink(e, ctx))}</div>
              </div>`
          : nothing
      }`;
  }

  #lastPath: string | undefined;

  // A short fade and lift when the page changes (rooms animate their own swipe).
  protected override updated(): void {
    const path = this.route?.path ?? "/";
    if (this.#lastPath !== undefined && path !== this.#lastPath && !path.startsWith("/room/")) {
      const motionOff = this._reducedMotion || this._user.motion === "off";
      const page = this.renderRoot.querySelector("main > :not(.edit-hint)");
      if (!motionOff)
        page?.animate(
          [
            { opacity: 0, transform: "translateY(8px)" },
            { opacity: 1, transform: "none" },
          ],
          { duration: 240, easing: "cubic-bezier(0.2, 0.9, 0.25, 1)" },
        );
    }
    this.#lastPath = path;
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
        ${this.#renderNav(route, ctx)}
        <main
          @atrium-toggle=${this.#onToggle}
          @atrium-more-info=${this.#onMoreInfo}
          @atrium-favorite=${this.#onFavorite}
          @atrium-hide=${this.#onHide}
          @atrium-doorbell-test=${() => (this.renderRoot.querySelector("atrium-doorbell") as AtriumDoorbell | null)?.ring()}
          style=${this._pull ? `transform: translateY(${this._pull * 0.4}px)` : ""}
        >
          ${
            this._editing
              ? html`<div class="edit-hint">${ctx.t(ctx.isAdmin ? "edit.hint" : "edit.hint_user")}</div>`
              : nothing
          }
          ${this.#renderPage(route, ctx)}
          ${
            this._search
              ? html`<atrium-search
                  .ctx=${ctx}
                  @atrium-search-close=${() => (this._search = false)}
                ></atrium-search>`
              : nothing
          }
        </main>
        ${
          (route.page === "home" || route.page === "room" || route.page === "page") &&
          (ctx.isAdmin || ctx.level !== "simple")
            ? html`<button
                type="button"
                class="edit-toggle ${this._editing ? "active" : ""}"
                aria-pressed=${String(this._editing)}
                @click=${() => (this._editing = !this._editing)}
              >
                ${icon(this._editing ? "M5 12l5 5L20 7" : "M4 20h4L19 9l-4-4L4 16zM14 6l4 4", 18, 2)}
                <span>${ctx.t(this._editing ? "edit.done" : "edit.start")}</span>
              </button>`
            : nothing
        }
      </div>
      ${this.#renderControl(ctx)}
      <atrium-screensaver .ctx=${ctx} .minutes=${this._saverMin}></atrium-screensaver>
      <atrium-doorbell .ctx=${ctx}></atrium-doorbell>
      ${this._offline ? html`<div class="offline" role="status">${ctx.t("toast.offline")}</div>` : nothing}
      ${
        this._toast
          ? html`<div class="toast" role="alert">
              <span>${this._toast}</span>
              <button type="button" aria-label=${ctx.t("control.close")} @click=${() => (this._toast = null)}>
                ${icon(ICONS.close, 16, 2)}
              </button>
            </div>`
          : nothing
      }
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
      /* Size: "large" (default for the simple view) makes everything easier to read and hit. */
      :host([density="large"]) main {
        zoom: 1.12;
      }
      :host([density="compact"]) main {
        zoom: 0.92;
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
        padding: 0 1px;
        font-size: 10.5px;
        letter-spacing: -0.01em;
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
      nav.rail a span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .rail-items {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 2px;
        scrollbar-width: thin;
      }
      .nav-heading {
        margin: 14px 10px 4px;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--a-on-nav);
        opacity: 0.7;
      }
      .nav-divider {
        border: 0;
        height: 1px;
        background: var(--a-nav-line);
        margin: 8px 10px;
      }
      nav.rail.icons {
        width: 76px;
        padding: 20px 10px;
      }
      nav.rail.icons .brand span:not(.logo),
      nav.rail.icons a span,
      nav.rail.icons .nav-heading {
        display: none;
      }
      nav.rail.icons a {
        justify-content: center;
        padding: 0;
      }
      nav.rail.icons .brand {
        justify-content: center;
        padding: 0 0 16px;
      }
      nav ha-icon {
        flex: none;
        display: flex;
      }
      nav a {
        transition: background-color calc(var(--a-motion, 1) * 150ms);
      }
      nav.rail a:hover {
        background: var(--a-panel2);
      }

      /* Phone: "more" sheet */
      .more-scrim {
        position: fixed;
        inset: 0;
        z-index: 6;
        background: var(--a-scrim);
        animation: fade-in calc(var(--a-motion, 1) * 180ms) ease-out;
      }
      .more {
        position: fixed;
        left: 0;
        right: 0;
        bottom: calc(68px + env(safe-area-inset-bottom));
        z-index: 7;
        max-height: 70vh;
        overflow-y: auto;
        background: var(--a-nav);
        border-radius: 16px 16px 0 0;
        padding: 16px 12px;
        animation: slide-up calc(var(--a-motion, 1) * 240ms) cubic-bezier(0.2, 0.9, 0.25, 1);
      }
      .more-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 6px;
      }
      .more-grid a {
        min-height: 76px;
        border-radius: var(--a-radius);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 6px;
        font-size: 12px;
        padding: 6px;
        text-align: center;
        background: var(--a-panel);
      }
      .more-grid a span {
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
        white-space: nowrap;
      }
      .more-grid .nav-heading {
        grid-column: 1 / -1;
        margin: 8px 4px 0;
      }
      .more-grid .nav-divider {
        grid-column: 1 / -1;
      }
      @keyframes fade-in {
        from {
          opacity: 0;
        }
      }
      @keyframes slide-up {
        from {
          transform: translateY(40px);
          opacity: 0;
        }
      }

      /* Edit mode */
      .edit-toggle {
        position: fixed;
        right: 16px;
        bottom: calc(84px + env(safe-area-inset-bottom));
        z-index: 4;
        min-height: 44px;
        padding: 0 16px;
        border: 0;
        border-radius: 22px;
        display: flex;
        align-items: center;
        gap: 8px;
        font-family: inherit;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        background: var(--a-s3);
        color: var(--a-text);
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.3);
      }
      :host(:not([narrow])) .edit-toggle {
        bottom: 24px;
      }
      .edit-toggle.active {
        background: var(--a-ocher);
        color: var(--a-on-ocher);
      }
      .edit-toggle:focus-visible {
        outline: 2px solid var(--a-ocher);
        outline-offset: 2px;
      }
      .edit-hint {
        margin-bottom: 14px;
        padding: 10px 14px;
        border-radius: var(--a-radius);
        background: var(--a-s2);
        color: var(--a-text2);
        font-size: 13px;
        font-weight: 600;
      }

      /* Messages */
      .toast {
        position: fixed;
        left: 50%;
        bottom: calc(96px + env(safe-area-inset-bottom));
        transform: translateX(-50%);
        z-index: 30;
        max-width: min(560px, calc(100vw - 32px));
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 8px 10px 16px;
        border-radius: var(--a-radius);
        background: var(--a-terra);
        color: #fff;
        font-size: 14px;
        font-weight: 600;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
        animation: toast-in calc(var(--a-motion, 1) * 260ms) cubic-bezier(0.2, 0.9, 0.25, 1);
      }
      :host(:not([narrow])) .toast {
        bottom: 24px;
      }
      .toast button {
        border: 0;
        background: rgba(255, 255, 255, 0.18);
        color: inherit;
        width: 32px;
        height: 32px;
        border-radius: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        flex: none;
      }
      .offline {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 30;
        padding: 8px 16px;
        text-align: center;
        background: var(--a-ocher);
        color: var(--a-on-ocher);
        font-size: 13px;
        font-weight: 600;
        animation: slide-down calc(var(--a-motion, 1) * 260ms) ease-out;
      }
      @keyframes toast-in {
        from {
          transform: translate(-50%, 16px);
          opacity: 0;
        }
      }
      @keyframes slide-down {
        from {
          transform: translateY(-100%);
        }
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
