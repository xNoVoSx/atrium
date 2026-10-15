import { LitElement, css, html, nothing } from "lit";
import { icon } from "../components/icon";
import type { PanelContext } from "../context";
import { SelectorController } from "../data/entity-store";
import { areaEntities, areaTemperature, rooms } from "../data/home";
import { ICONS, shared } from "../theme/shared";
import { formatTemperature } from "../util/format";

/**
 * Room page, first version: header with temperature and lights on, then the
 * room's heating and lights. Swiping between rooms follows in step 5.
 */
export class AtriumRoomPage extends LitElement {
  static override properties = { ctx: { attribute: false }, areaId: { attribute: "area-id" } };

  declare ctx: PanelContext;
  declare areaId: string;

  #info = new SelectorController(
    this,
    () => this.ctx?.store,
    (hass) => {
      const ids = areaEntities(hass, this.areaId);
      const all = rooms(hass);
      const humidityId = hass.areas[this.areaId]?.humidity_entity_id;
      const humidity = humidityId ? Number(hass.states[humidityId]?.state) : NaN;
      return {
        name: hass.areas[this.areaId]?.name ?? this.areaId,
        index: all.findIndex((r) => r.areaId === this.areaId) + 1,
        count: all.length,
        temperature: areaTemperature(hass, this.areaId, ids),
        humidity: Number.isNaN(humidity) ? null : humidity,
        lightsOn: ids.filter((id) => id.startsWith("light.") && hass.states[id]?.state === "on").length,
        controllable: ids.some((id) => id.startsWith("light.") || id.startsWith("climate.")),
      };
    },
  );

  protected override willUpdate(): void {
    this.#info.attach();
  }

  protected override render() {
    const info = this.#info.value;
    if (!info) return nothing;
    const { t, locale, navigate } = this.ctx;
    return html`
      <header>
        <div class="nav">
          <button type="button" class="back" @click=${() => navigate({ page: "rooms" })}>
            ${icon(ICONS.back, 18, 2)} ${t("nav.rooms")}
          </button>
          ${info.index ? html`<span class="label">${info.index} / ${info.count}</span>` : nothing}
        </div>
        <h1>${info.name}</h1>
        <div class="facts">
          <div><b>${formatTemperature(info.temperature, locale)}</b><span>${t("climate.current")}</span></div>
          ${
            info.humidity !== null
              ? html`<div><b>${Math.round(info.humidity)} %</b><span>${t("room.humidity")}</span></div>`
              : nothing
          }
          <div class=${info.lightsOn ? "on" : ""}>
            <b>${info.lightsOn}</b
            ><span>${info.lightsOn === 1 ? t("rooms.light_on") : t("rooms.lights_on")}</span>
          </div>
        </div>
      </header>
      <atrium-climate-module .ctx=${this.ctx} .areaId=${this.areaId}></atrium-climate-module>
      <atrium-lights-module .ctx=${this.ctx} .areaId=${this.areaId}></atrium-lights-module>
      ${info.controllable ? nothing : html`<p class="empty">${t("room.empty")}</p>`}
    `;
  }

  static override styles = [
    shared,
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      header {
        background: var(--a-panel);
        color: var(--a-on-panel);
        border-radius: var(--a-radius);
        padding: 14px 16px 18px;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      header .label {
        color: var(--a-on-panel2);
      }
      .nav {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .back {
        all: unset;
        cursor: pointer;
        min-height: 44px;
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--a-on-panel2);
      }
      .back:focus-visible {
        outline: 2px solid var(--a-ocher);
      }
      h1 {
        margin: 0;
        font-size: 34px;
        font-weight: 600;
        letter-spacing: -0.03em;
        line-height: 1.05;
      }
      .facts {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 6px;
      }
      .facts div {
        background: var(--a-panel2);
        border-radius: 4px;
        padding: 10px;
        display: flex;
        flex-direction: column;
      }
      .facts div.on {
        background: var(--a-ocher);
        color: var(--a-on-ocher);
      }
      .facts b {
        font-size: 22px;
        font-weight: 600;
      }
      .facts span {
        font-size: 12px;
        font-weight: 500;
        opacity: 0.85;
      }
      .empty {
        color: var(--a-text2);
        font-size: 14px;
      }
    `,
  ];
}
