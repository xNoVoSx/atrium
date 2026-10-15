// Rooms overview, categories and settings. Small pages that mostly arrange modules.

import { LitElement, css, html, nothing } from "lit";
import { repeat } from "lit/directives/repeat.js";
import type { PanelContext } from "../context";
import { SelectorController, StructureController } from "../data/entity-store";
import { icon } from "../components/icon";
import { batteries, climateZones, rooms } from "../data/home";
import {
  hiddenAreas,
  hiddenEntities,
  moveBy,
  savedOrder,
  setAreaHidden,
  setEntityHidden,
  setOrder,
} from "../data/layout";
import { groupByArea, nameOf } from "../data/registry";
import type { MessageKey } from "../i18n";
import { ICONS, shared } from "../theme/shared";
import { CATEGORY_INFO } from "../data/categories";
import { isLevel, levelAllows, levelChoiceAllowed, LEVELS } from "../data/levels";
import { customPages } from "../data/pages";
import { WIDGETS } from "../widgets/catalog";
import { WI } from "../widgets/icons";
import { ACCENTS, DENSITIES, type ThemePreference } from "../theme/tokens";

export class AtriumRoomsPage extends LitElement {
  static override properties = { ctx: { attribute: false } };
  declare ctx: PanelContext;

  protected override render() {
    return html`<h1>${this.ctx.t("nav.rooms")}</h1>
      <atrium-rooms-module .ctx=${this.ctx} .heading=${false} large></atrium-rooms-module>`;
  }

  static override styles = [shared, pageStyles()];
}

export class AtriumCategoriesPage extends LitElement {
  static override properties = { ctx: { attribute: false } };
  declare ctx: PanelContext;

  protected override render() {
    const { t, navigate, level } = this.ctx;
    return html`<h1>${t("nav.categories")}</h1>
      <div class="list">
        ${CATEGORY_INFO.filter((c) => levelAllows(level, c.minLevel)).map(
          (c) =>
            html`<button
              type="button"
              data-category=${c.id}
              @click=${() => navigate({ page: "category", category: c.id })}
            >
              <span class="cico">${icon(c.icon, 24, 1.8)}</span>
              <span class="title">${t(c.title)}</span><span class="sub">${t(c.sub)}</span>
            </button>`,
        )}
        ${customPages(this.ctx.layout)
          .filter((p) => levelAllows(level, p.minLevel))
          .map(
            (p) =>
              html`<button
                type="button"
                data-page=${p.id}
                @click=${() => navigate({ page: "page", pageId: p.id })}
              >
                <span class="cico"
                  >${p.icon && customElements.get("ha-icon") ? html`<ha-icon .icon=${p.icon}></ha-icon>` : icon(WI.note, 24, 1.8)}</span
                >
                <span class="title">${p.title ?? p.id}</span><span class="sub">${t("search.page")}</span>
              </button>`,
          )}
      </div>`;
  }

  static override styles = [
    shared,
    pageStyles(),
    css`
      .list {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: 10px;
      }
      .list button {
        border: 0;
        border-radius: var(--a-radius);
        background: var(--a-s1);
        color: var(--a-text);
        padding: 18px;
        text-align: left;
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-height: 88px;
        cursor: pointer;
        transition:
          transform calc(var(--a-motion, 1) * 150ms) ease,
          background-color calc(var(--a-motion, 1) * 150ms);
        animation: in calc(var(--a-motion, 1) * 320ms) cubic-bezier(0.2, 0.9, 0.25, 1) both;
      }
      .list button:hover {
        background: var(--a-s2);
      }
      .list button:active {
        transform: scale(0.98);
      }
      .list button:nth-child(2) {
        animation-delay: calc(var(--a-motion, 1) * 30ms);
      }
      .list button:nth-child(3) {
        animation-delay: calc(var(--a-motion, 1) * 60ms);
      }
      .list button:nth-child(4) {
        animation-delay: calc(var(--a-motion, 1) * 90ms);
      }
      .list button:nth-child(5) {
        animation-delay: calc(var(--a-motion, 1) * 120ms);
      }
      .list button:nth-child(6) {
        animation-delay: calc(var(--a-motion, 1) * 150ms);
      }
      .list button:nth-child(n + 7) {
        animation-delay: calc(var(--a-motion, 1) * 180ms);
      }
      .cico {
        color: var(--a-ocher);
        margin-bottom: 6px;
        display: flex;
      }
      .title {
        font-size: 20px;
        font-weight: 600;
      }
      .sub {
        font-size: 13px;
        color: var(--a-text2);
      }
      @keyframes in {
        from {
          opacity: 0;
          transform: translateY(8px);
        }
      }
    `,
  ];
}

/** A category: everything of one kind, grouped by room. */
export class AtriumCategoryPage extends LitElement {
  static override properties = { ctx: { attribute: false }, category: {}, _examples: { state: true } };
  declare ctx: PanelContext;
  declare category: string;
  declare _examples: boolean;

  constructor() {
    super();
    this._examples = false;
  }

  #structure = new StructureController(this, () => this.ctx?.store);
  #batteries = new SelectorController(
    this,
    () => this.ctx?.store,
    (hass) =>
      this.category === "batteries"
        ? batteries(hass).map((b) => ({ ...b, name: nameOf(hass, b.entityId) }))
        : [],
  );

  protected override willUpdate(): void {
    this.#structure.attach();
    this.#batteries.attach();
    this.#batteries.refresh();
  }

  #renderBatteries() {
    const { t } = this.ctx;
    const list = this.#batteries.value ?? [];
    return html`<h1>${t("categories.batteries")}</h1>
      <div class="batteries">
        ${repeat(
          list,
          (b) => b.entityId,
          (b) =>
            html`<button
              type="button"
              class="battery ${b.low ? "low" : ""}"
              data-battery=${b.entityId}
              @click=${() =>
                this.dispatchEvent(
                  new CustomEvent("hass-more-info", {
                    detail: { entityId: b.entityId },
                    bubbles: true,
                    composed: true,
                  }),
                )}
            >
              <span class="b-name">${b.name}</span>
              <span class="b-bar"><span style="width: ${b.value ?? (b.low ? 5 : 100)}%"></span></span>
              <span class="b-value"
                >${b.value !== null ? `${Math.round(b.value)} %` : b.low ? "!" : "OK"}</span
              >
            </button>`,
        )}
      </div>`;
  }

  #renderHomelab() {
    const { t } = this.ctx;
    const hass = this.ctx.store.hass;
    const homelab = WIDGETS.filter((w) => w.group === "network" || w.group === "server");
    const present = hass ? homelab.filter((w) => w.available(hass)) : [];
    const missing = homelab.filter((w) => !present.includes(w) && w.demo);
    return html`<h1>${t("categories.homelab")}</h1>
      <div class="wgrid">
        ${present.map((w) => html`<div class="s-${w.size}">${w.render(this.ctx, { id: `hl-${w.type}`, type: w.type }, false)}</div>`)}
      </div>
      ${
        missing.length
          ? html`<button
                type="button"
                class="examples"
                aria-expanded=${String(this._examples)}
                @click=${() => (this._examples = !this._examples)}
              >
                ${this._examples ? t("homelab.hide_examples") : t("homelab.show_examples")}
                (${missing.length})
              </button>
              ${
                this._examples
                  ? html`<p class="hint">${t("homelab.examples_hint")}</p>
                      <div class="wgrid">
                        ${missing.map((w) => html`<div class="s-${w.size}">${w.render(this.ctx, { id: `hl-${w.type}`, type: w.type }, true)}</div>`)}
                      </div>`
                  : nothing
              }`
          : nothing
      }`;
  }

  protected override render() {
    const hass = this.ctx.store.hass;
    if (!hass) return nothing;
    const { t } = this.ctx;
    if (this.category === "batteries") return this.#renderBatteries();
    if (this.category === "homelab") return this.#renderHomelab();
    if (this.category === "energy") return html`<atrium-energy-page .ctx=${this.ctx}></atrium-energy-page>`;
    if (this.category === "security")
      return html`<atrium-security-page .ctx=${this.ctx}></atrium-security-page>`;
    if (this.category === "media") return html`<atrium-media-page .ctx=${this.ctx}></atrium-media-page>`;
    if (this.category === "climate") {
      const areas = [...new Set(climateZones(hass).map((id) => hass.entities[id]?.area_id ?? null))];
      return html`<h1>${t("section.heating")}</h1>
        ${
          areas.length
            ? html`<atrium-climate-module .ctx=${this.ctx}></atrium-climate-module>`
            : html`<p class="hint">—</p>`
        }`;
    }
    const groups = groupByArea(hass, "light");
    return html`<h1>${t("section.lights")}</h1>
      ${repeat(
        groups,
        (g) => g.areaId ?? "",
        (g) =>
          html`<section>
            <h2 class="label">${g.areaId ? (hass.areas[g.areaId]?.name ?? g.areaId) : t("area.none")}</h2>
            <div class="grid">
              ${repeat(
                g.entityIds,
                (id) => id,
                (id) =>
                  html`<atrium-light-tile
                    .entityId=${id}
                    .store=${this.ctx.store}
                    .t=${t}
                  ></atrium-light-tile>`,
              )}
            </div>
          </section>`,
      )}
      <p class="hint">${t("hint.controls")}</p>`;
  }

  static override styles = [
    shared,
    pageStyles(),
    css`
      section {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .batteries {
        display: flex;
        flex-direction: column;
        gap: 6px;
        max-width: 720px;
      }
      .battery {
        border: 0;
        text-align: left;
        min-height: 52px;
        padding: 0 14px;
        border-radius: var(--a-radius);
        background: var(--a-s1);
        color: var(--a-text);
        display: grid;
        grid-template-columns: minmax(0, 1fr) 80px 52px;
        align-items: center;
        gap: 12px;
      }
      .b-name {
        font-size: 15px;
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .b-bar {
        height: 8px;
        border-radius: 4px;
        background: var(--a-s3);
        overflow: hidden;
      }
      .b-bar span {
        display: block;
        height: 100%;
        background: var(--a-sage);
      }
      .low .b-bar span {
        background: var(--a-terra);
      }
      .b-value {
        text-align: right;
        font-size: 15px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }
      .low .b-value {
        color: var(--a-terra-text);
      }
      .wgrid {
        display: grid;
        grid-template-columns: repeat(12, minmax(0, 1fr));
        gap: 18px 20px;
        align-items: start;
        grid-auto-flow: row dense;
      }
      .wgrid > * {
        grid-column: span 12;
        min-width: 0;
      }
      @media (min-width: 900px) {
        .wgrid > .s-m {
          grid-column: span 6;
        }
        .wgrid > .s-s {
          grid-column: span 4;
        }
      }
      .examples {
        align-self: flex-start;
        border: 0;
        border-radius: var(--a-radius);
        background: var(--a-s2);
        color: var(--a-text);
        min-height: 44px;
        padding: 0 16px;
        font: inherit;
        font-weight: 600;
        cursor: pointer;
      }
    `,
  ];
}

export class AtriumSettingsPage extends LitElement {
  static override properties = {
    ctx: { attribute: false },
    theme: {},
    version: {},
    _tab: { state: true },
  };
  declare ctx: PanelContext;
  declare theme: ThemePreference;
  declare version: string;
  declare _tab: string;

  constructor() {
    super();
    let saved = "look";
    try {
      saved = sessionStorage.getItem("atrium-settings-tab") ?? "look";
    } catch {
      // no storage
    }
    this._tab = saved;
  }

  #structure = new StructureController(this, () => this.ctx?.store);

  protected override willUpdate(): void {
    this.#structure.attach();
  }

  #moveButtons(onMove: (delta: -1 | 1) => void, first: boolean, last: boolean) {
    const { t } = this.ctx;
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

  #renderRooms() {
    const { t, layout, saveLayout, store } = this.ctx;
    const raw = store.rawHass;
    if (!raw) return nothing;
    const hidden = hiddenAreas(layout);
    const list = rooms(raw, savedOrder(layout, "rooms"));
    const ids = list.map((r) => r.areaId);
    return html`<section>
      <h2 class="label">${t("settings.rooms")}</h2>
      <div class="rows">
        ${list.map(
          (r, i) =>
            html`<div class="row" data-area=${r.areaId}>
              <span class="name ${hidden.has(r.areaId) ? "off" : ""}">${r.name}</span>
              <button
                type="button"
                class="text"
                @click=${() => saveLayout(setAreaHidden(layout, r.areaId, !hidden.has(r.areaId)))}
              >
                ${hidden.has(r.areaId) ? t("settings.show_room") : t("settings.hide_room")}
              </button>
              ${this.#moveButtons(
                (d) => saveLayout(setOrder(layout, "rooms", moveBy(ids, r.areaId, d))),
                i === 0,
                i === list.length - 1,
              )}
            </div>`,
        )}
      </div>
    </section>`;
  }

  #renderHidden() {
    const { t, layout, saveLayout, store } = this.ctx;
    const raw = store.rawHass;
    const hidden = [...hiddenEntities(layout)];
    return html`<section>
      <h2 class="label">${t("settings.hidden")}</h2>
      ${
        hidden.length
          ? html`<div class="rows">
              ${hidden.map(
                (id) =>
                  html`<div class="row" data-hidden=${id}>
                    <span class="name">${raw ? nameOf(raw, id) : id}</span>
                    <button
                      type="button"
                      class="text"
                      @click=${() => saveLayout(setEntityHidden(layout, id, false))}
                    >
                      ${t("settings.show")}
                    </button>
                  </div>`,
              )}
            </div>`
          : html`<p class="hint">${t("settings.hidden_none")}</p>`
      }
    </section>`;
  }

  #tab(): string {
    return this._tab;
  }

  #appearance() {
    const { t, isAdmin, layout, user, saveUser, level } = this.ctx;
    const themes: ThemePreference[] = ["auto", "dark", "light"];
    const ownLevel = isLevel(user.level) ? user.level : null;
    const canChoose = levelChoiceAllowed(layout) || isAdmin;
    const motion = user.motion === "off" ? "off" : "on";
    return html`<section>
        <h2 class="label">${t("theme.label")}</h2>
        <div class="seg" role="group" aria-label=${t("theme.label")}>
          ${themes.map(
            (pref) =>
              html`<button
                type="button"
                data-theme=${pref}
                aria-pressed=${String(this.theme === pref)}
                @click=${() => this.dispatchEvent(new CustomEvent("atrium-theme", { detail: pref, bubbles: true, composed: true }))}
              >
                ${t(`theme.${pref}` as MessageKey)}
              </button>`,
          )}
        </div>
      </section>
      <section>
        <h2 class="label">${t("settings.motion")}</h2>
        <div class="seg" role="group" aria-label=${t("settings.motion")}>
          ${(["on", "off"] as const).map(
            (m) =>
              html`<button
                type="button"
                data-motion=${m}
                aria-pressed=${String(motion === m)}
                @click=${() => {
                  const next = { ...user };
                  if (m === "off") next.motion = "off";
                  else delete next.motion;
                  saveUser(next);
                }}
              >
                ${t(`settings.motion_${m}` as MessageKey)}
              </button>`,
          )}
        </div>
        <p class="hint">${t("settings.motion_hint")}</p>
      </section>
      <section>
        <h2 class="label">${t("settings.accent")}</h2>
        <div class="swatches" role="group" aria-label=${t("settings.accent")}>
          ${Object.entries(ACCENTS).map(
            ([id, c]) =>
              html`<button
                type="button"
                class="swatch"
                data-accent=${id}
                style="--c:${c.accent}"
                aria-pressed=${String((user.accent ?? "ocher") === id)}
                aria-label=${t(`accent.${id}` as MessageKey)}
                title=${t(`accent.${id}` as MessageKey)}
                @click=${() => {
                  const next = { ...user };
                  if (id === "ocher") delete next.accent;
                  else next.accent = id;
                  saveUser(next);
                }}
              ></button>`,
          )}
        </div>
      </section>
      <section>
        <h2 class="label">${t("settings.density")}</h2>
        <div class="seg" role="group" aria-label=${t("settings.density")}>
          <button
            type="button"
            aria-pressed=${String(!user.density)}
            @click=${() => {
              const next = { ...user };
              delete next.density;
              saveUser(next);
            }}
          >
            ${t("settings.auto")}
          </button>
          ${DENSITIES.map(
            (d) =>
              html`<button
                type="button"
                data-density=${d}
                aria-pressed=${String(user.density === d)}
                @click=${() => saveUser({ ...user, density: d })}
              >
                ${t(`settings.density_${d}` as MessageKey)}
              </button>`,
          )}
        </div>
      </section>
      ${
        canChoose
          ? html`<section>
              <h2 class="label">${t("settings.my_level")}</h2>
              <div class="seg" role="group" aria-label=${t("settings.my_level")}>
                <button
                  type="button"
                  data-level=""
                  aria-pressed=${String(!ownLevel)}
                  @click=${() => {
                    const next = { ...user };
                    delete next.level;
                    saveUser(next);
                  }}
                >
                  ${t("settings.auto")}
                </button>
                ${LEVELS.map(
                  (l) =>
                    html`<button
                      type="button"
                      data-level=${l}
                      aria-pressed=${String(ownLevel === l)}
                      @click=${() => saveUser({ ...user, level: l })}
                    >
                      ${t(`level.${l}` as MessageKey)}
                    </button>`,
                )}
              </div>
              <p class="hint">${t(`level.${level}_sub` as MessageKey)}</p>
            </section>`
          : nothing
      }`;
  }

  protected override render() {
    const { t, isAdmin } = this.ctx;
    const tabs: Array<[string, MessageKey]> = isAdmin
      ? [
          ["look", "settings.tab_look"],
          ["home", "settings.tab_home"],
          ["nav", "settings.tab_nav"],
          ["pages", "settings.tab_pages"],
          ["rooms", "settings.tab_rooms"],
          ["users", "settings.tab_users"],
          ["energy", "settings.tab_energy"],
          ["hidden", "settings.tab_hidden"],
        ]
      : [];
    const tab = isAdmin ? this.#tab() : "look";
    return html`<h1>${t("settings.title")}</h1>
      ${
        tabs.length
          ? html`<div class="tabs" role="tablist">
              ${tabs.map(
                ([id, label]) =>
                  html`<button
                    type="button"
                    role="tab"
                    data-tab=${id}
                    aria-selected=${String(tab === id)}
                    @click=${() => {
                      this._tab = id;
                      try {
                        sessionStorage.setItem("atrium-settings-tab", id);
                      } catch {
                        // no storage: the tab is not remembered
                      }
                    }}
                  >
                    ${t(label)}
                  </button>`,
              )}
            </div>`
          : nothing
      }
      <div class="panel">
        ${tab === "look" ? this.#appearance() : nothing}
        ${tab === "home" ? html`<atrium-home-settings .ctx=${this.ctx}></atrium-home-settings>` : nothing}
        ${tab === "nav" ? html`<atrium-nav-settings .ctx=${this.ctx}></atrium-nav-settings>` : nothing}
        ${tab === "pages" ? html`<atrium-pages-settings .ctx=${this.ctx}></atrium-pages-settings>` : nothing}
        ${tab === "rooms" ? this.#renderRooms() : nothing}
        ${tab === "users" ? html`<atrium-users-settings .ctx=${this.ctx}></atrium-users-settings>` : nothing}
        ${tab === "energy" ? html`<atrium-energy-settings .ctx=${this.ctx}></atrium-energy-settings>` : nothing}
        ${tab === "hidden" ? this.#renderHidden() : nothing}
      </div>
      <p class="hint">${t("settings.edit_hint")}</p>
      <p class="hint">${t("settings.version")} ${this.version}</p>`;
  }

  static override styles = [
    shared,
    pageStyles(),
    css`
      section {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .swatches {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .swatch {
        width: 40px;
        height: 40px;
        border-radius: 20px;
        border: 0;
        background: var(--c);
        cursor: pointer;
        box-shadow: 0 0 0 3px var(--a-bg);
        transition: transform calc(var(--a-motion, 1) * 150ms);
      }
      .swatch[aria-pressed="true"] {
        box-shadow:
          0 0 0 3px var(--a-bg),
          0 0 0 5px var(--a-text);
        transform: scale(1.08);
      }
      .tabs {
        display: flex;
        gap: 6px;
        overflow-x: auto;
        scrollbar-width: none;
        padding-bottom: 2px;
      }
      .tabs button {
        flex: none;
        border: 0;
        border-radius: 20px;
        min-height: 40px;
        padding: 0 16px;
        background: var(--a-s1);
        color: var(--a-text2);
        font: inherit;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: background-color calc(var(--a-motion, 1) * 150ms);
      }
      .tabs button[aria-selected="true"] {
        background: var(--a-text);
        color: var(--a-bg);
      }
      .panel {
        display: flex;
        flex-direction: column;
        gap: 14px;
        max-width: 860px;
        animation: tab-in calc(var(--a-motion, 1) * 240ms) ease-out;
      }
      @keyframes tab-in {
        from {
          opacity: 0;
          transform: translateY(4px);
        }
      }
      .seg {
        display: inline-flex;
        flex-wrap: wrap;
        align-self: flex-start;
        gap: 4px;
        background: var(--a-s1);
        border-radius: var(--a-radius);
        padding: 4px;
      }
      .seg button {
        min-height: 44px;
        padding: 0 16px;
        border: 0;
        border-radius: 4px;
        background: transparent;
        color: var(--a-text2);
        font-size: 14px;
        font-weight: 600;
      }
      .seg button[aria-pressed="true"] {
        background: var(--a-text);
        color: var(--a-bg);
      }
      .rows {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .row {
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 56px;
        padding: 0 8px 0 14px;
        border-radius: var(--a-radius);
        background: var(--a-s1);
      }
      .name {
        flex: 1;
        min-width: 0;
        font-size: 15px;
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .name.off {
        color: var(--a-text2);
        font-weight: 500;
      }
      .icon,
      .text {
        border: 0;
        border-radius: var(--a-radius);
        background: var(--a-s3);
        color: var(--a-text);
        min-height: 40px;
      }
      .icon {
        width: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .icon:disabled {
        opacity: 0.35;
        cursor: default;
      }
      .text {
        padding: 0 12px;
        font-size: 13px;
        font-weight: 600;
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
        transition: background-color 160ms ease;
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
        transition: transform 160ms ease;
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
    `,
  ];
}

function pageStyles() {
  return css`
    :host {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    h1 {
      margin: 4px 0 0;
      font-size: 34px;
      font-weight: 600;
      letter-spacing: -0.03em;
    }
    .hint {
      margin: 0;
      font-size: 13px;
      color: var(--a-text2);
    }
  `;
}
