// Admin sections of the settings page: home widgets, navigation, own pages,
// users and their view levels.

import { LitElement, css, html, nothing } from "lit";
import { icon } from "../components/icon";
import type { PanelContext } from "../context";
import { CATEGORY_INFO, categoryInfo } from "../data/categories";
import { rooms } from "../data/home";
import { moveBy } from "../data/layout";
import { LEVELS, levelChoiceAllowed, setUserLevel, type Level } from "../data/levels";
import {
  defaultNav,
  navId,
  navItems,
  railMode,
  setNav,
  setNavItems,
  type NavItem,
  type NavKind,
} from "../data/nav";
import {
  createPage,
  customPages,
  deletePage,
  HOME_PAGE,
  moveWidget,
  page,
  removeWidget,
  savePage,
  updateWidget,
  type WidgetInstance,
} from "../data/pages";
import type { MessageKey } from "../i18n";
import { ICONS } from "../theme/shared";
import { availableWidgets, widgetDef } from "../widgets/catalog";
import { doorbell, doorbellCandidates, setDoorbell, type DoorbellLayout } from "../data/doorbell";
import { nameOf } from "../data/registry";

export const settingsStyles = css`
  :host {
    display: flex;
    flex-direction: column;
    gap: 10px;
    font-family: var(--a-font);
    color: var(--a-text);
  }
  h2 {
    margin: 8px 0 0;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--a-text2);
  }
  .hint {
    margin: 0;
    font-size: 13px;
    color: var(--a-text2);
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 56px;
    padding: 6px 8px 6px 12px;
    border-radius: var(--a-radius);
    background: var(--a-s1);
    flex-wrap: wrap;
  }
  .row.off {
    opacity: 0.6;
  }
  .name {
    flex: 1;
    min-width: 120px;
    display: flex;
    flex-direction: column;
    font-size: 15px;
    font-weight: 600;
  }
  .name small {
    font-size: 12px;
    font-weight: 500;
    color: var(--a-text3);
  }
  .heading-row {
    background: none;
    min-height: 40px;
  }
  button,
  select,
  input {
    font: inherit;
  }
  .icon,
  .text {
    border: 0;
    border-radius: var(--a-radius);
    background: var(--a-s3);
    color: var(--a-text);
    min-height: 40px;
    cursor: pointer;
  }
  .icon {
    width: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .icon:disabled {
    opacity: 0.3;
    cursor: default;
  }
  .text {
    padding: 0 12px;
    font-size: 13px;
    font-weight: 600;
  }
  .text.on,
  .text.primary {
    background: var(--a-ocher);
    color: var(--a-on-ocher);
  }
  .text.danger {
    background: var(--a-terra);
    color: #fff;
  }
  select,
  input[type="text"],
  input[type="url"],
  input:not([type]) {
    min-height: 40px;
    border: 0;
    border-radius: var(--a-radius);
    background: var(--a-s2);
    color: var(--a-text);
    padding: 0 10px;
    font-size: 14px;
    min-width: 0;
  }
  .add {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    padding: 10px;
    border-radius: var(--a-radius);
    background: var(--a-s1);
  }
  .seg {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 3px;
    background: var(--a-s2);
    border-radius: var(--a-radius);
    padding: 3px;
  }
  .seg button {
    border: 0;
    background: none;
    color: var(--a-text2);
    font-size: 13px;
    font-weight: 600;
    min-height: 36px;
    padding: 0 10px;
    border-radius: 6px;
    cursor: pointer;
  }
  .seg button[aria-pressed="true"] {
    background: var(--a-text);
    color: var(--a-bg);
  }
  button:focus-visible,
  select:focus-visible,
  input:focus-visible {
    outline: 2px solid var(--a-ocher);
    outline-offset: 2px;
  }
  .switch {
    position: relative;
    width: 46px;
    height: 28px;
    flex: none;
    cursor: pointer;
  }
  .switch input {
    position: absolute;
    inset: 0;
    opacity: 0;
    margin: 0;
    cursor: pointer;
  }
  .track {
    position: absolute;
    inset: 0;
    border-radius: 14px;
    background: var(--a-s3);
    transition: background-color calc(var(--a-motion, 1) * 160ms) ease;
  }
  .track::after {
    content: "";
    position: absolute;
    top: 3px;
    left: 3px;
    width: 22px;
    height: 22px;
    border-radius: 11px;
    background: var(--a-text);
    transition: transform calc(var(--a-motion, 1) * 160ms) ease;
  }
  .switch input:checked + .track {
    background: var(--a-ocher);
  }
  .switch input:checked + .track::after {
    transform: translateX(18px);
    background: var(--a-on-ocher);
  }
  .switch input:focus-visible + .track {
    outline: 2px solid var(--a-ocher);
    outline-offset: 2px;
  }
`;

export const toggle = (checked: boolean, onChange: (on: boolean) => void, label: string) =>
  html`<label class="switch" title=${label}>
    <input
      type="checkbox"
      aria-label=${label}
      .checked=${checked}
      @change=${(e: Event) => onChange((e.target as HTMLInputElement).checked)}
    />
    <span class="track"></span>
  </label>`;

export function moveButtons(
  t: PanelContext["t"],
  onMove: (d: -1 | 1) => void,
  first: boolean,
  last: boolean,
) {
  return html`<button
      type="button"
      class="icon"
      aria-label=${t("settings.up")}
      ?disabled=${first}
      @click=${() => onMove(-1)}
    >
      ${icon(ICONS.up, 18, 2)}
    </button>
    <button
      type="button"
      class="icon"
      aria-label=${t("settings.down")}
      ?disabled=${last}
      @click=${() => onMove(1)}
    >
      ${icon(ICONS.down, 18, 2)}
    </button>`;
}

function levelSelect(
  t: PanelContext["t"],
  value: Level | undefined,
  onChange: (l: Level | undefined) => void,
  autoLabel: MessageKey = "wo.default",
) {
  return html`<select
    aria-label=${t("wo.visible_from")}
    @change=${(e: Event) => onChange(((e.target as HTMLSelectElement).value || undefined) as Level | undefined)}
  >
    <option value="" ?selected=${!value}>${t(autoLabel)}</option>
    ${LEVELS.map((l) => html`<option value=${l} ?selected=${value === l}>${t("settings.from")} ${t(`level.${l}` as MessageKey)}</option>`)}
  </select>`;
}

// ---- home widgets ----

export class AtriumHomeSettings extends LitElement {
  static override properties = { ctx: { attribute: false } };
  declare ctx: PanelContext;

  protected override render() {
    const { t, layout, saveLayout } = this.ctx;
    const widgets = page(layout, HOME_PAGE)?.widgets ?? [];
    return html`<h2>${t("settings.home")}</h2>
      <p class="hint">${t("settings.home_hint")}</p>
      <div class="rows">
        ${widgets.map((w: WidgetInstance, i) => {
          const def = widgetDef(w.type);
          if (!def) return nothing;
          return html`<div class="row ${w.disabled ? "off" : ""}" data-module=${w.type}>
            ${toggle(!w.disabled, (on) => saveLayout(updateWidget(layout, HOME_PAGE, w.id, { disabled: on ? undefined : true })), t(def.name))}
            <span class="name"
              >${w.title || t(def.name)}<small
                >${t(`wo.size_${w.size ?? def.size}` as MessageKey)} ·
                ${t(`level.${w.minLevel ?? def.minLevel}` as MessageKey)}</small
              ></span
            >
            ${moveButtons(t, (d) => saveLayout(moveWidget(layout, HOME_PAGE, w.id, d)), i === 0, i === widgets.length - 1)}
            <button
              type="button"
              class="icon"
              aria-label=${t("w.remove")}
              @click=${() => saveLayout(removeWidget(layout, HOME_PAGE, w.id))}
            >
              ${icon(ICONS.close, 16, 2)}
            </button>
          </div>`;
        })}
      </div>`;
  }

  static override styles = settingsStyles;
}

// ---- navigation ----

const ADDABLE: Array<[NavKind, MessageKey]> = [
  ["room", "navk.room"],
  ["category", "navk.category"],
  ["page", "navk.page"],
  ["all-rooms", "navk.all-rooms"],
  ["all-categories", "navk.all-categories"],
  ["link", "navk.link"],
  ["heading", "navk.heading"],
  ["divider", "navk.divider"],
  ["home", "navk.home"],
  ["rooms", "navk.rooms"],
  ["categories", "navk.categories"],
  ["search", "navk.search"],
  ["settings", "navk.settings"],
];

export class AtriumNavSettings extends LitElement {
  static override properties = {
    ctx: { attribute: false },
    _kind: { state: true },
    _target: { state: true },
    _label: { state: true },
    _url: { state: true },
  };
  declare ctx: PanelContext;
  declare _kind: NavKind;
  declare _target: string;
  declare _label: string;
  declare _url: string;

  constructor() {
    super();
    this._kind = "room";
    this._target = "";
    this._label = "";
    this._url = "";
  }

  #save(items: NavItem[]): void {
    this.ctx.saveLayout(setNavItems(this.ctx.layout, items));
  }

  #patch(id: string, patch: Partial<NavItem>): void {
    this.#save(
      navItems(this.ctx.layout).map((i) => {
        if (i.id !== id) return i;
        const next = Object.entries({ ...i, ...patch }).filter(
          ([, v]) => v !== undefined && v !== "" && v !== false,
        );
        return Object.fromEntries(next) as unknown as NavItem;
      }),
    );
  }

  #describe(item: NavItem): string {
    const { t, store, layout } = this.ctx;
    const hass = store.rawHass;
    switch (item.kind) {
      case "room":
        return hass?.areas[item.areaId ?? ""]?.name ?? item.areaId ?? "";
      case "category": {
        const info = categoryInfo(item.category ?? "");
        return info ? t(info.title) : (item.category ?? "");
      }
      case "page":
        return page(layout, item.pageId ?? "")?.title ?? item.pageId ?? "";
      case "link":
        return item.url ?? "";
      case "home":
      case "rooms":
      case "categories":
      case "settings":
      case "search":
        return t(`nav.${item.kind}` as MessageKey);
      default:
        return t(`navk.${item.kind}` as MessageKey);
    }
  }

  #targets() {
    const { t, store, layout } = this.ctx;
    const hass = store.rawHass;
    if (this._kind === "room") return hass ? rooms(hass).map((r) => [r.areaId, r.name] as const) : [];
    if (this._kind === "category") return CATEGORY_INFO.map((c) => [c.id, t(c.title)] as const);
    if (this._kind === "page") return customPages(layout).map((p) => [p.id, p.title ?? p.id] as const);
    return [];
  }

  #add(): void {
    const kind = this._kind;
    const item: NavItem = { id: navId(kind), kind };
    if (kind === "room") item.areaId = this._target || this.#targets()[0]?.[0];
    if (kind === "category") item.category = this._target || this.#targets()[0]?.[0];
    if (kind === "page") item.pageId = this._target || this.#targets()[0]?.[0];
    if (kind === "link") {
      if (!this._url.trim()) return;
      item.url = this._url.trim();
    }
    if (this._label.trim()) item.label = this._label.trim();
    if (kind === "heading" && !item.label) item.label = this.ctx.t("navk.heading");
    if (
      (kind === "room" && !item.areaId) ||
      (kind === "category" && !item.category) ||
      (kind === "page" && !item.pageId)
    )
      return;
    const items = navItems(this.ctx.layout);
    // New entries go before the settings entry, which usually stays last.
    const settingsAt = items.findIndex((i) => i.kind === "settings");
    const next = [...items];
    next.splice(settingsAt >= 0 ? settingsAt : next.length, 0, item);
    this.#save(next);
    this._label = "";
    this._url = "";
  }

  protected override render() {
    const { t, layout, saveLayout } = this.ctx;
    const items = navItems(layout);
    const ids = items.map((i) => i.id);
    const targets = this.#targets();
    const needsTarget = ["room", "category", "page"].includes(this._kind);
    return html`<h2>${t("settings.nav")}</h2>
      <p class="hint">${t("settings.nav_hint")}</p>
      <div class="row heading-row">
        <span class="name">${t("settings.rail")}</span>
        <div class="seg">
          ${(["full", "icons"] as const).map(
            (m) =>
              html`<button
                type="button"
                aria-pressed=${String(railMode(layout) === m)}
                @click=${() => saveLayout(setNav(layout, { rail: m }))}
              >
                ${t(`settings.rail_${m}` as MessageKey)}
              </button>`,
          )}
        </div>
      </div>
      <div class="rows">
        ${items.map(
          (item, i) =>
            html`<div class="row ${item.hidden ? "off" : ""}" data-nav-item=${item.id}>
              ${toggle(!item.hidden, (on) => this.#patch(item.id, { hidden: !on }), t("w.show"))}
              <span class="name">
                <input
                  .value=${item.label ?? ""}
                  placeholder=${this.#describe(item) || t(`navk.${item.kind}` as MessageKey)}
                  aria-label=${t("settings.label")}
                  ?disabled=${item.kind === "divider"}
                  @change=${(e: Event) => this.#patch(item.id, { label: (e.target as HTMLInputElement).value.trim() || undefined })}
                />
                <small
                  >${t(`navk.${item.kind}` as MessageKey)}${item.kind === "room" || item.kind === "page" || item.kind === "category" || item.kind === "link" ? ` · ${this.#describe(item)}` : ""}</small
                >
              </span>
              ${
                item.kind !== "heading" && item.kind !== "divider" && !item.kind.startsWith("all-")
                  ? html`<button
                      type="button"
                      class="text ${item.bottom ? "on" : ""}"
                      aria-pressed=${String(Boolean(item.bottom))}
                      title=${t("settings.bottom_hint")}
                      @click=${() => this.#patch(item.id, { bottom: !item.bottom })}
                    >
                      ${t("settings.bottom")}
                    </button>`
                  : nothing
              }
              ${levelSelect(t, item.minLevel, (l) => this.#patch(item.id, { minLevel: l }), "settings.everyone")}
              ${moveButtons(t, (d) => this.#save(moveBy(ids, item.id, d).flatMap((id) => items.filter((x) => x.id === id))), i === 0, i === items.length - 1)}
              <button
                type="button"
                class="icon"
                aria-label=${t("w.remove")}
                @click=${() => this.#save(items.filter((x) => x.id !== item.id))}
              >
                ${icon(ICONS.close, 16, 2)}
              </button>
            </div>`,
        )}
      </div>
      <div class="add">
        <select
          aria-label=${t("settings.add_entry")}
          @change=${(e: Event) => {
            this._kind = (e.target as HTMLSelectElement).value as NavKind;
            this._target = "";
          }}
        >
          ${ADDABLE.map(([k, l]) => html`<option value=${k} ?selected=${this._kind === k}>${t(l)}</option>`)}
        </select>
        ${
          needsTarget
            ? targets.length
              ? html`<select
                  aria-label=${t("settings.target")}
                  @change=${(e: Event) => (this._target = (e.target as HTMLSelectElement).value)}
                >
                  ${targets.map(([v, l]) => html`<option value=${v} ?selected=${this._target === v}>${l}</option>`)}
                </select>`
              : html`<span class="hint">${t("settings.no_targets")}</span>`
            : nothing
        }
        ${
          this._kind === "link"
            ? html`<input
                type="url"
                placeholder="https:// …  /energy"
                .value=${this._url}
                @input=${(e: Event) => (this._url = (e.target as HTMLInputElement).value)}
              />`
            : nothing
        }
        ${
          this._kind !== "divider"
            ? html`<input
                placeholder=${t("settings.label_optional")}
                .value=${this._label}
                @input=${(e: Event) => (this._label = (e.target as HTMLInputElement).value)}
              />`
            : nothing
        }
        <button type="button" class="text primary" @click=${() => this.#add()}>${t("w.add")}</button>
      </div>
      <div>
        <button type="button" class="text" @click=${() => this.#save(defaultNav())}>
          ${t("settings.reset_nav")}
        </button>
      </div>`;
  }

  static override styles = [
    settingsStyles,
    css`
      .name input {
        background: transparent;
        padding: 0;
        min-height: 28px;
        font-size: 15px;
        font-weight: 600;
      }
      .name input:focus {
        background: var(--a-s2);
        padding: 0 8px;
      }
      .name input::placeholder {
        color: var(--a-text);
        opacity: 1;
      }
    `,
  ];
}

// ---- own pages ----

const TEMPLATES: Array<[string, MessageKey]> = [
  ["empty", "settings.tpl_empty"],
  ["info", "settings.tpl_info"],
  ["homelab", "settings.tpl_homelab"],
  ["household", "settings.tpl_household"],
  ["security", "settings.tpl_security"],
];

export class AtriumPagesSettings extends LitElement {
  static override properties = { ctx: { attribute: false }, _title: { state: true }, _tpl: { state: true } };
  declare ctx: PanelContext;
  declare _title: string;
  declare _tpl: string;

  constructor() {
    super();
    this._title = "";
    this._tpl = "empty";
  }

  #templateWidgets(): Array<Omit<WidgetInstance, "id">> {
    const hass = this.ctx.store.rawHass;
    if (!hass) return [];
    const avail = availableWidgets(hass);
    const pick = (types: string[]) =>
      types.filter((ty) => avail.some((w) => w.type === ty)).map((type) => ({ type }));
    switch (this._tpl) {
      case "info":
        return pick(["clock", "weather", "calendar", "todo", "persons", "sun", "notifications"]);
      case "homelab":
        return avail
          .filter((w) => w.group === "network" || w.group === "server")
          .map((w) => ({ type: w.type }));
      case "household":
        return pick(["appliances", "covers", "vacuum", "timers", "switches", "plants", "todo", "waste"]);
      case "security":
        return pick(["security", "alarm", "locks", "cameras"]);
      default:
        return [];
    }
  }

  #create(): void {
    const title = this._title.trim();
    if (!title) return;
    const widgets = this.#templateWidgets().map((w, i) => ({ id: `w${i + 1}`, ...w }));
    const { layout, id } = createPage(this.ctx.layout, title, widgets);
    const items = navItems(layout);
    const settingsAt = items.findIndex((i) => i.kind === "settings");
    const next = [...items];
    next.splice(settingsAt >= 0 ? settingsAt : next.length, 0, {
      id: navId("page"),
      kind: "page",
      pageId: id,
    });
    this.ctx.saveLayout(setNavItems(layout, next));
    this._title = "";
    this.ctx.navigate({ page: "page", pageId: id });
  }

  protected override render() {
    const { t, layout, saveLayout, navigate } = this.ctx;
    const pages = customPages(layout);
    return html`<h2>${t("settings.pages")}</h2>
      <p class="hint">${t("settings.pages_hint")}</p>
      <div class="rows">
        ${pages.map(
          (p) =>
            html`<div class="row" data-page=${p.id}>
              <span class="name">
                <input
                  .value=${p.title ?? ""}
                  aria-label=${t("wo.title")}
                  @change=${(e: Event) => saveLayout(savePage(layout, { ...p, title: (e.target as HTMLInputElement).value.trim() || p.id }))}
                />
                <small>/atrium/page/${p.id} · ${p.widgets.length} ${t("settings.widgets")}</small>
              </span>
              <input
                class="mdi"
                .value=${p.icon ?? ""}
                placeholder="mdi:server"
                aria-label=${t("settings.icon")}
                @change=${(e: Event) => {
                  const v = (e.target as HTMLInputElement).value.trim();
                  const next = { ...p };
                  if (v) next.icon = v;
                  else delete next.icon;
                  saveLayout(savePage(layout, next));
                }}
              />
              ${levelSelect(
                t,
                p.minLevel,
                (l) => {
                  const next = { ...p };
                  if (l) next.minLevel = l;
                  else delete next.minLevel;
                  saveLayout(savePage(layout, next));
                },
                "settings.everyone",
              )}
              <button type="button" class="text" @click=${() => navigate({ page: "page", pageId: p.id })}>
                ${t("settings.open")}
              </button>
              <button
                type="button"
                class="icon"
                aria-label=${t("w.remove")}
                @click=${() => {
                  const withoutNav = setNavItems(
                    layout,
                    navItems(layout).filter((i) => !(i.kind === "page" && i.pageId === p.id)),
                  );
                  saveLayout(deletePage(withoutNav, p.id));
                }}
              >
                ${icon(ICONS.close, 16, 2)}
              </button>
            </div>`,
        )}
        ${pages.length ? nothing : html`<p class="hint">${t("settings.no_pages")}</p>`}
      </div>
      <div class="add">
        <input
          placeholder=${t("settings.page_title")}
          .value=${this._title}
          @input=${(e: Event) => (this._title = (e.target as HTMLInputElement).value)}
          @keydown=${(e: KeyboardEvent) => e.key === "Enter" && this.#create()}
        />
        <select
          aria-label=${t("settings.template")}
          @change=${(e: Event) => (this._tpl = (e.target as HTMLSelectElement).value)}
        >
          ${TEMPLATES.map(([v, l]) => html`<option value=${v} ?selected=${this._tpl === v}>${t(l)}</option>`)}
        </select>
        <button
          type="button"
          class="text primary"
          ?disabled=${!this._title.trim()}
          @click=${() => this.#create()}
        >
          ${t("settings.create_page")}
        </button>
      </div>`;
  }

  static override styles = [
    settingsStyles,
    css`
      .name input {
        background: transparent;
        padding: 0;
        min-height: 28px;
        font-size: 15px;
        font-weight: 600;
      }
      .mdi {
        width: 130px;
      }
    `,
  ];
}

// ---- users and levels ----

interface AtriumUser {
  id: string;
  name: string;
  is_admin: boolean;
}

export class AtriumUsersSettings extends LitElement {
  static override properties = { ctx: { attribute: false }, _users: { state: true } };
  declare ctx: PanelContext;
  declare _users: AtriumUser[] | null;

  constructor() {
    super();
    this._users = null;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    void this.ctx?.store.hass
      ?.callWS<AtriumUser[]>({ type: "atrium/users" })
      .then((u) => (this._users = u.sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => (this._users = []));
  }

  protected override render() {
    const { t, layout, saveLayout } = this.ctx;
    const levels = ((layout as { levels?: Record<string, Level> }).levels ?? {}) as Record<string, Level>;
    return html`<h2>${t("settings.users")}</h2>
      <p class="hint">${t("settings.users_hint")}</p>
      <div class="rows">
        ${(this._users ?? []).map(
          (u) =>
            html`<div class="row" data-user=${u.id}>
              <span class="name"
                >${u.name}<small>${u.is_admin ? t("settings.admin") : t("settings.user")}</small></span
              >
              <div class="seg" role="group" aria-label=${u.name}>
                <button
                  type="button"
                  aria-pressed=${String(!levels[u.id])}
                  @click=${() => saveLayout(setUserLevel(layout, u.id, null))}
                >
                  ${t("settings.auto")}
                </button>
                ${LEVELS.map(
                  (l) =>
                    html`<button
                      type="button"
                      aria-pressed=${String(levels[u.id] === l)}
                      @click=${() => saveLayout(setUserLevel(layout, u.id, l))}
                    >
                      ${t(`level.${l}` as MessageKey)}
                    </button>`,
                )}
              </div>
            </div>`,
        )}
        ${this._users === null ? html`<p class="hint">…</p>` : nothing}
      </div>
      <div class="row">
        ${toggle(levelChoiceAllowed(layout), (on) => saveLayout({ ...layout, levelChoice: on }), t("settings.level_choice"))}
        <span class="name"
          >${t("settings.level_choice")}<small>${t("settings.level_choice_sub")}</small></span
        >
      </div>
      <div class="rows">
        ${LEVELS.map((l) => html`<p class="hint"><b>${t(`level.${l}` as MessageKey)}:</b> ${t(`level.${l}_sub` as MessageKey)}</p>`)}
      </div>`;
  }

  static override styles = settingsStyles;
}

// ---- doorbell ----

export class AtriumDoorbellSettings extends LitElement {
  static override properties = { ctx: { attribute: false } };
  declare ctx: PanelContext;

  protected override render() {
    const { t, layout, saveLayout, store } = this.ctx;
    const hass = store.rawHass;
    if (!hass) return nothing;
    const cfg = ((layout as { doorbell?: DoorbellLayout }).doorbell ?? {}) as DoorbellLayout;
    const found = doorbell(hass, { ...layout, doorbell: { ...cfg, off: false } });
    const candidates = doorbellCandidates(hass);
    const triggers = Object.keys(hass.states)
      .filter((id) => id.startsWith("binary_sensor.") || id.startsWith("event."))
      .sort((a, b) => Number(candidates.includes(b)) - Number(candidates.includes(a)) || a.localeCompare(b));
    const cameras = Object.keys(hass.states).filter((id) => id.startsWith("camera."));
    const label = (id: string) => `${nameOf(hass, id)} (${id})`;
    return html`<h2>${t("settings.doorbell")}</h2>
      <p class="hint">${t("settings.doorbell_hint")}</p>
      <div class="row">
        ${toggle(!cfg.off, (on) => saveLayout(setDoorbell(layout, { off: !on })), t("settings.doorbell"))}
        <span class="name"
          >${t("settings.doorbell_on")}<small
            >${found ? `${t("settings.doorbell_found")}: ${nameOf(hass, found.trigger)}` : t("settings.doorbell_none")}</small
          ></span
        >
      </div>
      <div class="row">
        <span class="name">${t("settings.doorbell_trigger")}</span>
        <select
          @change=${(e: Event) => saveLayout(setDoorbell(layout, { trigger: (e.target as HTMLSelectElement).value || undefined }))}
        >
          <option value="" ?selected=${!cfg.trigger}>${t("wo.auto")}</option>
          ${triggers.map((id) => html`<option value=${id} ?selected=${cfg.trigger === id}>${label(id)}</option>`)}
        </select>
      </div>
      <div class="row">
        <span class="name">${t("settings.doorbell_camera")}</span>
        <select
          @change=${(e: Event) => saveLayout(setDoorbell(layout, { camera: (e.target as HTMLSelectElement).value || undefined }))}
        >
          <option value="" ?selected=${!cfg.camera}>
            ${t("wo.auto")}${found?.camera ? ` – ${nameOf(hass, found.camera)}` : ""}
          </option>
          ${cameras.map((id) => html`<option value=${id} ?selected=${cfg.camera === id}>${label(id)}</option>`)}
        </select>
      </div>
      <div class="row">
        <span class="name">${t("settings.doorbell_seconds")}</span>
        <select
          @change=${(e: Event) => saveLayout(setDoorbell(layout, { seconds: Number((e.target as HTMLSelectElement).value) || undefined }))}
        >
          ${[30, 60, 120, 300].map((n) => html`<option value=${n} ?selected=${(cfg.seconds ?? 60) === n}>${n} s</option>`)}
        </select>
      </div>
      <div>
        <button
          type="button"
          class="text primary"
          ?disabled=${cfg.off}
          @click=${() => this.dispatchEvent(new CustomEvent("atrium-doorbell-test", { bubbles: true, composed: true }))}
        >
          ${t("settings.doorbell_test")}
        </button>
      </div>`;
  }

  static override styles = settingsStyles;
}
