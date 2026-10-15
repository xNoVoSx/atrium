import { LitElement, css, html, nothing } from "lit";
import type { PanelContext } from "../context";
import { CATEGORY_INFO } from "../data/categories";
import { rooms } from "../data/home";
import { levelAllows } from "../data/levels";
import { customPages } from "../data/pages";
import { isAutoVisible, nameOf } from "../data/registry";
import type { MessageKey } from "../i18n";
import type { PageRoute } from "../router";
import { ICONS } from "../theme/shared";
import { WI } from "../widgets/icons";
import { icon } from "./icon";

interface Hit {
  key: string;
  label: string;
  sub: string;
  icon: string;
  route?: PageRoute;
  entityId?: string;
}

const CONTROL_DOMAINS = [
  "light",
  "switch",
  "climate",
  "cover",
  "fan",
  "media_player",
  "lock",
  "scene",
  "script",
  "input_boolean",
  "vacuum",
  "sensor",
  "binary_sensor",
  "camera",
  "person",
];

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

/**
 * Search everything (Ctrl/Cmd+K): pages, rooms, categories and devices.
 * Arrow keys move, Enter opens, Escape closes.
 */
export class AtriumSearch extends LitElement {
  static override properties = { ctx: { attribute: false }, _q: { state: true }, _sel: { state: true } };

  declare ctx: PanelContext;
  declare _q: string;
  declare _sel: number;

  constructor() {
    super();
    this._q = "";
    this._sel = 0;
  }

  protected override firstUpdated(): void {
    this.renderRoot.querySelector("input")?.focus();
  }

  #close(): void {
    this.dispatchEvent(new CustomEvent("atrium-search-close", { bubbles: true, composed: true }));
  }

  #hits(): Hit[] {
    const { t, store, level } = this.ctx;
    const hass = store.hass;
    if (!hass) return [];
    const q = norm(this._q.trim());
    const match = (...texts: string[]) => !q || texts.some((x) => norm(x).includes(q));
    const fixed: Hit[] = [
      {
        key: "p:home",
        label: t("nav.home"),
        sub: t("search.page"),
        icon: ICONS.home,
        route: { page: "home" },
      },
      {
        key: "p:rooms",
        label: t("nav.rooms"),
        sub: t("search.page"),
        icon: ICONS.rooms,
        route: { page: "rooms" },
      },
      {
        key: "p:settings",
        label: t("nav.settings"),
        sub: t("search.page"),
        icon: ICONS.settings,
        route: { page: "settings" },
      },
    ];
    const pages: Hit[] = [
      ...fixed,
      ...CATEGORY_INFO.filter((c) => levelAllows(level, c.minLevel)).map((c) => ({
        key: `c:${c.id}`,
        label: t(c.title),
        sub: t("search.category"),
        icon: c.icon,
        route: { page: "category", category: c.id } as PageRoute,
      })),
      ...customPages(this.ctx.layout)
        .filter((p) => levelAllows(level, p.minLevel))
        .map((p) => ({
          key: `pg:${p.id}`,
          label: p.title ?? p.id,
          sub: t("search.page"),
          icon: WI.note,
          route: { page: "page", pageId: p.id } as PageRoute,
        })),
    ].filter((h) => match(h.label));
    const roomHits: Hit[] = rooms(hass)
      .filter((r) => match(r.name))
      .map((r) => ({
        key: `r:${r.areaId}`,
        label: r.name,
        sub: t("search.room"),
        icon: ICONS.rooms,
        route: { page: "room", areaId: r.areaId },
      }));
    const entities: Hit[] = q
      ? Object.keys(hass.states)
          .filter((id) => CONTROL_DOMAINS.includes(id.split(".")[0] ?? "") && isAutoVisible(hass, id))
          .filter((id) => match(nameOf(hass, id), id))
          .slice(0, 30)
          .map((id) => {
            const area =
              hass.entities[id]?.area_id ?? hass.devices[hass.entities[id]?.device_id ?? ""]?.area_id ?? null;
            return {
              key: `e:${id}`,
              label: nameOf(hass, id),
              sub: [area ? hass.areas[area]?.name : "", this.#state(id)].filter(Boolean).join(" · "),
              icon: id.startsWith("light.")
                ? WI.light
                : id.startsWith("climate.")
                  ? WI.climate
                  : ICONS.sensor,
              entityId: id,
            };
          })
      : [];
    return [...pages, ...roomHits, ...entities];
  }

  #state(id: string): string {
    const s = this.ctx.store.hass?.states[id];
    if (!s) return "";
    const unit = (s.attributes.unit_of_measurement as string | undefined) ?? "";
    if (unit && !Number.isNaN(Number(s.state))) return `${s.state} ${unit}`;
    return this.ctx.t(`state.${s.state}` as MessageKey) || s.state;
  }

  #open(hit: Hit | undefined): void {
    if (!hit) return;
    this.#close();
    if (hit.route) {
      this.ctx.navigate(hit.route);
      return;
    }
    if (hit.entityId) {
      const own = hit.entityId.startsWith("light.") || hit.entityId.startsWith("climate.");
      this.dispatchEvent(
        new CustomEvent(own ? "atrium-more-info" : "hass-more-info", {
          detail: { entityId: hit.entityId },
          bubbles: true,
          composed: true,
        }),
      );
    }
  }

  #onKey(ev: KeyboardEvent, hits: Hit[]): void {
    if (ev.key === "Escape") this.#close();
    else if (ev.key === "ArrowDown") {
      ev.preventDefault();
      this._sel = Math.min(hits.length - 1, this._sel + 1);
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      this._sel = Math.max(0, this._sel - 1);
    } else if (ev.key === "Enter") this.#open(hits[this._sel]);
  }

  protected override render() {
    const { t } = this.ctx;
    const hits = this.#hits();
    const sel = Math.min(this._sel, Math.max(0, hits.length - 1));
    return html`<div class="scrim" @click=${() => this.#close()}></div>
      <div class="box" role="dialog" aria-label=${t("nav.search")}>
        <div class="field">
          ${icon("M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4", 20, 2)}
          <input
            type="search"
            .value=${this._q}
            placeholder=${t("search.placeholder")}
            aria-label=${t("nav.search")}
            @input=${(e: Event) => {
              this._q = (e.target as HTMLInputElement).value;
              this._sel = 0;
            }}
            @keydown=${(e: KeyboardEvent) => this.#onKey(e, hits)}
          />
          <kbd>Esc</kbd>
        </div>
        <div class="hits" role="listbox">
          ${
            hits.length
              ? hits.map(
                  (h, i) =>
                    html`<button
                      type="button"
                      role="option"
                      aria-selected=${String(i === sel)}
                      class=${i === sel ? "sel" : ""}
                      @mouseenter=${() => (this._sel = i)}
                      @click=${() => this.#open(h)}
                    >
                      <span class="ico">${icon(h.icon, 18, 2)}</span>
                      <span class="txt"><b>${h.label}</b><small>${h.sub}</small></span>
                    </button>`,
                )
              : html`<p class="none">${t("search.none")}</p>`
          }
        </div>
        ${this.ctx.narrow ? nothing : html`<p class="tip">${t("search.tip")}</p>`}
      </div>`;
  }

  static override styles = css`
    :host {
      position: fixed;
      inset: 0;
      z-index: 20;
      font-family: var(--a-font);
      color: var(--a-text);
    }
    .scrim {
      position: absolute;
      inset: 0;
      background: var(--a-scrim);
      animation: fade calc(var(--a-motion, 1) * 150ms) ease-out;
    }
    .box {
      position: absolute;
      left: 50%;
      top: 10vh;
      transform: translateX(-50%);
      width: min(640px, calc(100vw - 24px));
      max-height: 76vh;
      display: flex;
      flex-direction: column;
      background: var(--a-s1);
      border-radius: 12px;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
      overflow: hidden;
      animation: pop calc(var(--a-motion, 1) * 200ms) cubic-bezier(0.2, 0.9, 0.25, 1);
    }
    .field {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 0 14px;
      border-bottom: 1px solid var(--a-s3);
      color: var(--a-text2);
    }
    input {
      flex: 1;
      min-height: 58px;
      border: 0;
      background: none;
      color: var(--a-text);
      font: inherit;
      font-size: 18px;
      outline: none;
    }
    kbd {
      font: inherit;
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 4px;
      background: var(--a-s3);
    }
    .hits {
      overflow-y: auto;
      padding: 6px;
    }
    .hits button {
      all: unset;
      box-sizing: border-box;
      width: 100%;
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 52px;
      padding: 0 10px;
      border-radius: var(--a-radius);
      cursor: pointer;
    }
    .hits button.sel {
      background: var(--a-s3);
    }
    .ico {
      width: 34px;
      height: 34px;
      border-radius: var(--a-radius);
      background: var(--a-s2);
      display: flex;
      align-items: center;
      justify-content: center;
      flex: none;
    }
    .txt {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .txt b {
      font-size: 15px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .txt small {
      font-size: 12px;
      color: var(--a-text2);
    }
    .none,
    .tip {
      margin: 0;
      padding: 14px;
      font-size: 13px;
      color: var(--a-text3);
    }
    .tip {
      border-top: 1px solid var(--a-s3);
      padding: 8px 14px;
    }
    @keyframes fade {
      from {
        opacity: 0;
      }
    }
    @keyframes pop {
      from {
        opacity: 0;
        transform: translate(-50%, -8px) scale(0.98);
      }
    }
  `;
}
