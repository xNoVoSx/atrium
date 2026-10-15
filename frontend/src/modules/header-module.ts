import { LitElement, css, html, nothing } from "lit";
import { icon } from "../components/icon";
import type { PanelContext } from "../context";
import { SelectorController } from "../data/entity-store";
import { daysUntil, localDate, wastePickups, weatherEntity } from "../data/home";
import { weatherCondition } from "../i18n";
import { ICONS, shared } from "../theme/shared";
import type { WidgetInstance } from "../data/pages";
import { weatherIcon, weatherIconStyles } from "../widgets/weather-icon";
import { formatDate, formatTemperature, formatTime } from "../util/format";
import { relativeDay } from "./waste-module";

/** Clock and date on the left; weather and the next bin to put out on the right. */
export class AtriumHeaderModule extends LitElement {
  static override properties = {
    ctx: { attribute: false },
    config: { attribute: false },
    _now: { state: true },
  };

  declare ctx: PanelContext;
  declare config: WidgetInstance | undefined;
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
    const variant = this.config?.options?.variant;
    if (typeof variant === "string" && variant !== "standard") this.setAttribute("variant", variant);
    else this.removeAttribute("variant");
  }

  protected override render() {
    const { locale, t } = this.ctx;
    const info = this.#info.value;
    const weather = info?.weather;
    const waste = info?.waste;
    const greet = this.config?.options?.greeting ?? this.ctx.level === "simple";
    const hour = this._now.getHours();
    const first = (this.ctx.store.hass?.user?.name ?? "").split(" ")[0];
    const hello = t(
      hour < 5
        ? "greet.night"
        : hour < 11
          ? "greet.morning"
          : hour < 18
            ? "greet.day"
            : hour < 22
              ? "greet.evening"
              : "greet.night",
    );
    return html`
      <div class="when">
        ${greet ? html`<div class="greet">${hello}${first ? `, ${first}` : ""}</div>` : nothing}
        <div class="time">${formatTime(this._now, locale)}</div>
        <div class="date">${formatDate(this._now, locale)}</div>
      </div>
      <div class="side">
        ${
          weather
            ? html`<div class="weather">
                <span class="wx-ico">${weatherIcon(weather.state)}</span>
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
    weatherIconStyles,
    css`
      .greet {
        font-size: 18px;
        font-weight: 600;
        color: var(--a-text2);
        margin-bottom: 4px;
        animation: greet-in calc(var(--a-motion, 1) * 600ms) ease-out;
      }
      @keyframes greet-in {
        from {
          opacity: 0;
          transform: translateX(-6px);
        }
      }
      .wx-ico svg {
        width: 28px;
        height: 28px;
        align-self: center;
      }
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
      /* Design "centred" */
      :host([variant="centered"]) {
        flex-direction: column;
        align-items: center;
        text-align: center;
      }
      :host([variant="centered"]) .side {
        flex-direction: row;
        align-items: center;
        flex-wrap: wrap;
        justify-content: center;
        padding-top: 0;
      }
      /* Design "one line" */
      :host([variant="line"]) {
        align-items: center;
        flex-wrap: wrap;
      }
      :host([variant="line"]) .when {
        display: flex;
        align-items: baseline;
        gap: 12px;
        flex-wrap: wrap;
      }
      :host([variant="line"]) .time {
        font-size: 30px;
      }
      :host([variant="line"]) .greet {
        margin: 0;
      }
      :host([variant="line"]) .side {
        flex-direction: row;
        align-items: center;
        padding-top: 0;
      }
      /* Design "large" (wall tablets) */
      :host([variant="big"]) .time {
        font-size: clamp(72px, 12vw, 128px);
      }
      :host([variant="big"]) .date {
        font-size: 18px;
      }
      :host([variant="big"]) .weather .temp {
        font-size: 40px;
      }
    `,
  ];
}
