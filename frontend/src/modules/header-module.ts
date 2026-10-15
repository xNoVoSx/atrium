import { LitElement, css, html, nothing } from "lit";
import type { PanelContext } from "../context";
import { SelectorController } from "../data/entity-store";
import { weatherEntity } from "../data/home";
import { weatherCondition } from "../i18n";
import { shared } from "../theme/shared";
import { formatDate, formatTemperature, formatTime } from "../util/format";

/** Clock, date and current weather. */
export class AtriumHeaderModule extends LitElement {
  static override properties = { ctx: { attribute: false }, _now: { state: true } };

  declare ctx: PanelContext;
  declare _now: Date;

  #timer: ReturnType<typeof setTimeout> | undefined;
  #weather = new SelectorController(
    this,
    () => this.ctx?.store,
    (hass) => {
      const w = weatherEntity(hass);
      return w ? { temp: Number(w.attributes.temperature), state: w.state } : null;
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
    this.#weather.attach();
  }

  protected override render() {
    const { locale, t } = this.ctx;
    const weather = this.#weather.value;
    return html`
      <div class="when">
        <div class="time">${formatTime(this._now, locale)}</div>
        <div class="date">${formatDate(this._now, locale)}</div>
      </div>
      ${
        weather
          ? html`<div class="weather">
              <div class="temp">
                ${formatTemperature(Number.isNaN(weather.temp) ? null : weather.temp, locale, 0)}
              </div>
              <div class="date">${weatherCondition(t, weather.state)}</div>
            </div>`
          : nothing
      }
    `;
  }

  static override styles = [
    shared,
    css`
      :host {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        padding: 4px 2px 8px;
      }
      .time {
        font-size: 56px;
        font-weight: 600;
        letter-spacing: -0.04em;
        line-height: 1;
        font-variant-numeric: tabular-nums;
      }
      .date {
        font-size: 14px;
        font-weight: 500;
        color: var(--a-text2);
      }
      .weather {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 2px;
      }
      .temp {
        font-size: 28px;
        font-weight: 600;
        line-height: 1;
      }
    `,
  ];
}
