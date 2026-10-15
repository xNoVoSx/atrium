import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import { repeat } from "lit/directives/repeat.js";
import type { PanelContext } from "../context";
import { SelectorController } from "../data/entity-store";
import { rooms } from "../data/home";
import { savedOrder } from "../data/layout";
import { shared } from "../theme/shared";
import { formatTemperature } from "../util/format";

/** One tile per area: its icon (ocher while lights are on), temperature and name. */
export class AtriumRoomsModule extends LitElement {
  static override properties = {
    ctx: { attribute: false },
    heading: { type: Boolean },
    large: { type: Boolean, reflect: true },
    variant: { reflect: true },
  };

  declare ctx: PanelContext;
  declare heading: boolean;
  declare large: boolean;
  /** Design: squares (default), list, cards or chips. */
  declare variant: string | undefined;

  #rooms = new SelectorController(
    this,
    () => this.ctx?.store,
    (hass) =>
      rooms(hass, savedOrder(this.ctx.layout, "rooms")).map((r) => ({
        ...r,
        icon: hass.areas[r.areaId]?.icon ?? null,
        // Rounded here so tiny sensor changes do not re-render the grid.
        temperature: r.temperature === null ? null : Math.round(r.temperature * 2) / 2,
      })),
  );

  constructor() {
    super();
    this.heading = true;
    this.large = false;
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    this.#rooms.attach();
    if (changed.has("ctx")) this.#rooms.refresh();
  }

  protected override render() {
    const list = this.#rooms.value ?? [];
    if (!list.length) return nothing;
    const { t, locale, navigate } = this.ctx;
    return html`
      ${this.heading ? html`<h2 class="label">${t("section.rooms")}</h2>` : nothing}
      <div class="rooms">
        ${repeat(
          list,
          (r) => r.areaId,
          (r) =>
            html`<a
              href="/atrium/room/${encodeURIComponent(r.areaId)}"
              @click=${(ev: MouseEvent) => {
                if (ev.metaKey || ev.ctrlKey) return;
                ev.preventDefault();
                navigate({ page: "room", areaId: r.areaId });
              }}
            >
              <span class="top">
                ${
                  r.icon && customElements.get("ha-icon")
                    ? html`<ha-icon class="icon ${r.lightsOn ? "lit" : ""}" .icon=${r.icon}></ha-icon>`
                    : html`<span class="icon"></span>`
                }
              </span>
              <span class="bottom">
                <span class="temp">${formatTemperature(r.temperature, locale, 1)}</span>
                <span class="name">${r.name}</span>
                ${
                  r.lightsOn
                    ? html`<span class="sr"
                        >${r.lightsOn} ${r.lightsOn === 1 ? t("rooms.light_on") : t("rooms.lights_on")}</span
                      >`
                    : nothing
                }
              </span>
            </a>`,
        )}
      </div>
    `;
  }

  static override styles = [
    shared,
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .rooms {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
        gap: 8px;
      }
      @media (max-width: 600px) {
        .rooms {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }
      :host([large]) .rooms {
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      }
      a {
        aspect-ratio: 1;
        max-height: 180px;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 12px;
        border-radius: var(--a-radius);
        background: var(--a-s1);
        color: var(--a-text);
        text-decoration: none;
        min-width: 0;
      }
      .icon {
        --mdc-icon-size: 26px;
        color: var(--a-text2);
        min-height: 26px;
      }
      .icon.lit {
        color: var(--a-ocher);
      }
      .sr {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
      }
      .bottom {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      .top {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .temp {
        font-size: 22px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }
      .name {
        font-size: 13px;
        font-weight: 600;
        line-height: 1.2;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }
      a {
        transition:
          background-color calc(var(--a-motion, 1) * 150ms),
          transform calc(var(--a-motion, 1) * 120ms);
      }
      a:active {
        transform: scale(0.97);
      }
      /* Design "list": one row per room. */
      :host([variant="list"]) .rooms {
        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
        gap: 6px;
      }
      :host([variant="list"]) a {
        aspect-ratio: auto;
        flex-direction: row;
        align-items: center;
        gap: 12px;
        min-height: 52px;
        padding: 8px 14px;
      }
      :host([variant="list"]) .bottom {
        flex: 1;
        flex-direction: row-reverse;
        justify-content: space-between;
        align-items: center;
      }
      :host([variant="list"]) .temp {
        font-size: 17px;
      }
      :host([variant="list"]) .name {
        font-size: 15px;
      }
      /* Design "cards": wide cards with the lights that are on. */
      :host([variant="cards"]) .rooms {
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      }
      :host([variant="cards"]) a {
        aspect-ratio: auto;
        min-height: 100px;
        flex-direction: row;
        justify-content: flex-start;
        align-items: flex-start;
        gap: 14px;
        padding: 14px;
      }
      :host([variant="cards"]) .icon {
        --mdc-icon-size: 34px;
        background: var(--a-s2);
        border-radius: var(--a-radius);
        padding: 8px;
      }
      :host([variant="cards"]) .bottom {
        flex: 1;
      }
      :host([variant="cards"]) .name {
        font-size: 17px;
        order: -1;
      }
      :host([variant="cards"]) .sr {
        position: static;
        width: auto;
        height: auto;
        clip: auto;
        font-size: 12px;
        color: var(--a-ocher);
        font-weight: 600;
      }
      /* Design "chips": small pills that wrap. */
      :host([variant="chips"]) .rooms {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      :host([variant="chips"]) a {
        aspect-ratio: auto;
        flex-direction: row;
        align-items: center;
        gap: 8px;
        padding: 6px 14px 6px 10px;
        border-radius: 20px;
        min-height: 40px;
      }
      :host([variant="chips"]) .icon {
        --mdc-icon-size: 18px;
        min-height: 18px;
      }
      :host([variant="chips"]) .bottom {
        flex-direction: row-reverse;
        align-items: baseline;
        gap: 6px;
      }
      :host([variant="chips"]) .temp {
        font-size: 13px;
        color: var(--a-text2);
      }
      :host([variant="chips"]) .name {
        font-size: 14px;
      }
    `,
  ];
}
