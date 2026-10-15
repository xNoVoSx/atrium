import { LitElement, css, html, nothing } from "lit";
import { icon } from "../components/icon";
import type { PanelContext } from "../context";
import { SelectorController } from "../data/entity-store";
import { daysUntil, localDate, wastePickups, weatherEntity } from "../data/home";
import { weatherCondition } from "../i18n";
import { ICONS, shared } from "../theme/shared";
import { formatDate, formatTemperature, formatTime } from "../util/format";
import { relativeDay } from "./waste-module";

/** Clock and date on the left; weather and the next bin to put out on the right. */
export class AtriumHeaderModule extends LitElement {
  static override properties = { ctx: { attribute: false }, _now: { state: true } };

  declare ctx: PanelContext;
  declare _now: Date;

  #timer: ReturnType<typeof setTimeout> | undefined;
  #info = new SelectorController(
    this,
    () => this.ctx?.store,
    (hass) => {
      const w = weatherEntity(hass);
      const today = localDate(new Date());
      const next = wastePickups(hass, today)[0];
      return {
        weather: w ? { temp: Number(w.attributes.temperature), state: w.state } : null,
        // The next pickup; once its day is over the following one takes its place.
        waste: next ? { types: next.types, date: next.date, days: daysUntil(next.date, today) } : null,
      };
    },
  );

  constructor() {
    super();
    this._now = new Date();
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.#tick();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearTimeout(this.#timer);
  }

  // Wake up at the start of each minute instead of polling.
  #tick = () => {
    this._now = new Date();
    this.#timer = setTimeout(this.#tick, 60000 - (Date.now() % 60000) + 50);
  };

  protected override willUpdate(): void {
    this.#info.attach();
  }

  protected override render() {
    const { locale, t } = this.ctx;
    const info = this.#info.value;
    const weather = info?.weather;
    const waste = info?.waste;
    return html`
      <div class="when">
        <div class="time">${formatTime(this._now, locale)}</div>
        <div class="date">${formatDate(this._now, locale)}</div>
      </div>
      <div class="side">
        ${
          weather
            ? html`<div class="weather">
                <span class="temp"
                  >${formatTemperature(Number.isNaN(weather.temp) ? null : weather.temp, locale, 0)}</span
                >
                <span class="date">${weatherCondition(t, weather.state)}</span>
              </div>`
            : nothing
        }
        ${
          waste
            ? html`<div class="waste ${waste.days <= 1 ? "soon" : ""}" title=${t("waste.title")}>
                ${icon(ICONS.trash, 18, 2)}
                <span class="waste-text">
                  <span class="waste-types">${waste.types.join(" · ")}</span>
                  <span class="waste-when">${relativeDay(t, waste.days)}</span>
                </span>
              </div>`
            : nothing
        }
      </div>
    `;
  }

  static override styles = [
    shared,
    css`
      :host {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        padding: 4px 2px 4px;
      }
      .time {
        font-size: 56px;
        font-weight: 600;
        letter-spacing: -0.04em;
        line-height: 1;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .date {
        font-size: 14px;
        font-weight: 500;
        color: var(--a-text2);
      }
      .side {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 8px;
        min-width: 0;
        padding-top: 4px;
      }
      .weather {
        display: flex;
        align-items: baseline;
        gap: 8px;
      }
      .temp {
        font-size: 24px;
        font-weight: 600;
        line-height: 1;
      }
      .waste {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 10px;
        border-radius: var(--a-radius);
        background: var(--a-s1);
        max-width: 100%;
        box-sizing: border-box;
      }
      .waste svg {
        flex: none;
        color: var(--a-text2);
      }
      .waste.soon {
        background: var(--a-ocher);
        color: var(--a-on-ocher);
        box-shadow: none;
      }
      .waste.soon svg {
        color: inherit;
      }
      .waste-text {
        display: flex;
        flex-direction: column;
        min-width: 0;
        text-align: right;
      }
      .waste-types {
        font-size: 13px;
        font-weight: 600;
        line-height: 1.2;
      }
      .waste-when {
        font-size: 12px;
        color: var(--a-text2);
      }
      .waste.soon .waste-when {
        color: inherit;
      }
    `,
  ];
}
