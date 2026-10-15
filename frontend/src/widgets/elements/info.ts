// Information widgets: weather forecast, calendar, to-do lists, people,
// clock, sun, notifications.

import { css, html, nothing, svg, type PropertyValues } from "lit";
import { live } from "lit/directives/live.js";
import { repeat } from "lit/directives/repeat.js";
import { SelectorController } from "../../data/entity-store";
import { weatherEntity } from "../../data/home";
import { nameOf } from "../../data/registry";
import { weatherCondition } from "../../i18n";
import type { HomeAssistant } from "../../types/hass";
import { visibleIds } from "../adapters/house";
import { WidgetBase } from "../base";
import { widgetStyles } from "../styles";
import { weatherIcon, weatherIconStyles } from "../weather-icon";

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Run an async subscription while connected; restart when the key changes. */
class Subscription {
  #key = "";
  #unsub: Promise<() => void> | undefined;

  set(key: string, start: (() => Promise<() => void>) | null): void {
    if (key === this.#key) return;
    this.stop();
    this.#key = key;
    if (start) {
      this.#unsub = start();
      this.#unsub.catch(() => undefined);
    }
  }

  stop(): void {
    void this.#unsub?.then((u) => u()).catch(() => undefined);
    this.#unsub = undefined;
    this.#key = "";
  }
}

// ---- weather ----

interface Forecast {
  datetime: string;
  condition?: string;
  temperature?: number;
  templow?: number;
  precipitation_probability?: number;
  precipitation?: number;
}

export class AtriumWeatherWidget extends WidgetBase {
  static override properties = { ...WidgetBase.properties, _forecast: { state: true } };
  declare _forecast: Forecast[];

  #sub = new Subscription();
  #now = new SelectorController(
    this,
    () => this.ctx?.store,
    (hass) => {
      const id = str(this.options.entity) || weatherEntity(hass)?.entity_id;
      const s = id ? hass.states[id] : undefined;
      if (!s) return null;
      return {
        id: s.entity_id,
        condition: s.state,
        temperature: Number(s.attributes.temperature),
        unit: str(s.attributes.temperature_unit) || "°",
        humidity: s.attributes.humidity as number | undefined,
        wind: s.attributes.wind_speed as number | undefined,
        windUnit: str(s.attributes.wind_speed_unit),
        name: nameOf(hass, s.entity_id),
      };
    },
  );

  constructor() {
    super();
    this._forecast = [];
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    this.#now.attach();
    if (changed.has("config")) this.#now.refresh();
    const hass = this.ctx?.store.hass;
    const id = this.#now.value?.id;
    const type = str(this.options.forecast) || "daily";
    if (this.demo) {
      this._forecast = demoForecast(type);
      return;
    }
    this.#sub.set(
      hass && id ? `${id}:${type}` : "",
      hass && id
        ? () =>
            hass.connection.subscribeMessage<{ forecast: Forecast[] | null }>(
              (msg) => (this._forecast = msg.forecast ?? []),
              { type: "weather/subscribe_forecast", entity_id: id, forecast_type: type },
            )
        : null,
    );
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#sub.stop();
  }

  protected override render() {
    const now = this.demo
      ? { condition: "partlycloudy", temperature: 17, unit: "°C", humidity: 64, wind: 12, windUnit: "km/h" }
      : this.#now.value;
    if (!now) return this.ctx?.editing ? html`<div class="w missing">${this.renderHead()}</div>` : nothing;
    const { t, locale } = this.ctx;
    const hourly = str(this.options.forecast) === "hourly";
    const days = this._forecast.slice(0, hourly ? 8 : 6);
    const fmtT = (n: number | undefined) =>
      n === undefined || Number.isNaN(n)
        ? "—"
        : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(n)}°`;
    const label = (d: string) =>
      new Intl.DateTimeFormat(locale, hourly ? { hour: "2-digit" } : { weekday: "short" }).format(
        new Date(d),
      );
    return html`<div class="w">
      ${this.renderHead()}
      <div class="now">
        <span class="big-ico">${weatherIcon(now.condition)}</span>
        <div>
          <div class="temp">${fmtT(now.temperature)}</div>
          <div class="cond">${weatherCondition(t, now.condition)}</div>
        </div>
        <div class="facts">
          ${now.humidity !== undefined ? html`<span>${Math.round(now.humidity)} % ${t("room.humidity")}</span>` : nothing}
          ${now.wind !== undefined ? html`<span>${Math.round(now.wind)} ${now.windUnit} ${t("w.wind")}</span>` : nothing}
        </div>
      </div>
      ${
        days.length
          ? html`<div class="days">
              ${days.map(
                (d) =>
                  html`<div class="day">
                    <span class="dl">${label(d.datetime)}</span>
                    <span class="di">${weatherIcon(d.condition ?? "")}</span>
                    <span class="dt">${fmtT(d.temperature)}</span>
                    ${d.templow !== undefined ? html`<span class="dlow">${fmtT(d.templow)}</span>` : nothing}
                    ${d.precipitation_probability ? html`<span class="dp">${Math.round(d.precipitation_probability)} %</span>` : nothing}
                  </div>`,
              )}
            </div>`
          : nothing
      }
    </div>`;
  }

  static override styles = [
    widgetStyles,
    weatherIconStyles,
    css`
      .now {
        display: flex;
        align-items: center;
        gap: 14px;
        flex-wrap: wrap;
      }
      .big-ico svg {
        width: 56px;
        height: 56px;
      }
      .temp {
        font-size: 40px;
        font-weight: 600;
        letter-spacing: -0.03em;
        line-height: 1;
      }
      .cond {
        color: var(--a-text2);
        font-size: 14px;
      }
      .facts {
        margin-left: auto;
        display: flex;
        flex-direction: column;
        gap: 2px;
        font-size: 13px;
        color: var(--a-text2);
        text-align: right;
      }
      .days {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(52px, 1fr));
        gap: 6px;
      }
      .day {
        background: var(--a-s2);
        border-radius: var(--a-radius);
        padding: 8px 4px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        font-size: 13px;
      }
      .dl {
        color: var(--a-text2);
        font-weight: 600;
      }
      .di svg {
        width: 26px;
        height: 26px;
      }
      .dt {
        font-weight: 600;
      }
      .dlow,
      .dp {
        color: var(--a-text3);
        font-size: 12px;
      }
      :host([variant="now"]) .days {
        display: none;
      }
      :host([variant="forecast"]) .now {
        display: none;
      }
      :host([variant="big"]) .big-ico svg {
        width: 96px;
        height: 96px;
      }
      :host([variant="big"]) .temp {
        font-size: 72px;
      }
      :host([variant="big"]) .cond {
        font-size: 18px;
      }
    `,
  ];
}

function demoForecast(type: string): Forecast[] {
  const conds = ["sunny", "partlycloudy", "rainy", "cloudy", "sunny", "lightning-rainy", "snowy", "fog"];
  const start = Date.now();
  return conds.map((c, i) => ({
    datetime: new Date(start + i * (type === "hourly" ? 3600000 : 86400000)).toISOString(),
    condition: c,
    temperature: 18 - i,
    templow: 9 - i / 2,
    precipitation_probability: c.includes("rain") ? 70 : 0,
  }));
}

// ---- calendar ----

interface CalEvent {
  summary: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  location?: string;
  calendar: string;
}

export class AtriumCalendarWidget extends WidgetBase {
  static override properties = { ...WidgetBase.properties, _events: { state: true } };
  declare _events: CalEvent[] | null;
  #loadedKey = "";
  #timer: ReturnType<typeof setInterval> | undefined;

  constructor() {
    super();
    this._events = null;
  }

  #calendars(hass: HomeAssistant): string[] {
    const chosen = Array.isArray(this.options.entities) ? (this.options.entities as string[]) : [];
    return chosen.length ? chosen.filter((id) => id in hass.states) : visibleIds(hass, ["calendar"]);
  }

  async #load(): Promise<void> {
    const hass = this.ctx?.store.hass;
    const callApi = hass?.callApi?.bind(hass);
    if (!hass || !callApi) return;
    const days = Number(this.options.days) || 7;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + days * 86400000);
    const lists = await Promise.all(
      this.#calendars(hass).map(async (id) => {
        try {
          const events = await callApi<Array<Omit<CalEvent, "calendar">>>(
            "GET",
            `calendars/${id}?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`,
          );
          return events.map((e) => ({ ...e, calendar: nameOf(hass, id) }));
        } catch {
          return [];
        }
      }),
    );
    const startOf = (e: CalEvent) => e.start.dateTime ?? e.start.date ?? "";
    this._events = lists.flat().sort((a, b) => startOf(a).localeCompare(startOf(b)));
  }

  protected override willUpdate(): void {
    if (this.demo) {
      const d = (h: number) => new Date(Date.now() + h * 3600000).toISOString();
      this._events = [
        { summary: "Zahnarzt", start: { dateTime: d(3) }, end: { dateTime: d(4) }, calendar: "Familie" },
        {
          summary: "Restmüll",
          start: { date: d(24).slice(0, 10) },
          end: { date: d(48).slice(0, 10) },
          calendar: "Müll",
        },
        {
          summary: "Geburtstag Oma",
          start: { date: d(72).slice(0, 10) },
          end: { date: d(96).slice(0, 10) },
          calendar: "Familie",
        },
      ];
      return;
    }
    const hass = this.ctx?.store.hass;
    const key = hass ? `${this.#calendars(hass).join()}|${String(this.options.days ?? "")}` : "";
    if (key && key !== this.#loadedKey) {
      this.#loadedKey = key;
      void this.#load();
    }
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.#timer = setInterval(() => void this.#load(), 15 * 60000);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearInterval(this.#timer);
    this.#loadedKey = "";
  }

  protected override render() {
    if (!this.ctx) return nothing;
    const { t, locale } = this.ctx;
    const events = this._events ?? [];
    const dayKey = (e: CalEvent) => (e.start.dateTime ?? e.start.date ?? "").slice(0, 10);
    const groups = new Map<string, CalEvent[]>();
    for (const e of events.slice(0, Number(this.options.max) || 8))
      groups.set(dayKey(e), [...(groups.get(dayKey(e)) ?? []), e]);
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const dayLabel = (d: string) =>
      d === today
        ? t("waste.today")
        : d === tomorrow
          ? t("waste.tomorrow")
          : new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(
              new Date(`${d}T12:00`),
            );
    const time = (e: CalEvent) =>
      e.start.dateTime
        ? new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(
            new Date(e.start.dateTime),
          )
        : t("w.all_day");
    return html`<div class="w">
      ${this.renderHead()}
      ${
        this._events === null
          ? html`<p class="empty">…</p>`
          : events.length
            ? [...groups.entries()].map(
                ([day, list]) =>
                  html`<div class="cal-day">
                    <span class="cal-label">${dayLabel(day)}</span>
                    ${list.map(
                      (e) =>
                        html`<div class="cal-ev">
                          <span class="cal-time">${time(e)}</span>
                          <span class="cal-sum"
                            ><b>${e.summary}</b
                            ><small>${e.calendar}${e.location ? ` · ${e.location}` : ""}</small></span
                          >
                        </div>`,
                    )}
                  </div>`,
              )
            : html`<p class="empty">${t("w.no_events")}</p>`
      }
    </div>`;
  }

  static override styles = [
    widgetStyles,
    css`
      .cal-day {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .cal-label {
        font-size: 12px;
        font-weight: 600;
        color: var(--a-text2);
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }
      .cal-ev {
        display: grid;
        grid-template-columns: 84px minmax(0, 1fr);
        gap: 10px;
        align-items: center;
        background: var(--a-s2);
        border-radius: var(--a-radius);
        padding: 8px 12px;
        border-left: 3px solid var(--a-slate);
      }
      .cal-time {
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        font-size: 14px;
      }
      .cal-sum {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .cal-sum b {
        font-size: 14px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .cal-sum small {
        font-size: 12px;
        color: var(--a-text3);
      }
      :host([variant="compact"]) .cal-sum small {
        display: none;
      }
      :host([variant="compact"]) .cal-ev {
        padding: 4px 10px;
        border-left-width: 2px;
      }
      :host([variant="compact"]) .cal-time {
        font-size: 13px;
      }
    `,
  ];
}

// ---- to-do ----

interface TodoItem {
  uid: string;
  summary: string;
  status: "needs_action" | "completed";
  due?: string;
}

export class AtriumTodoWidget extends WidgetBase {
  static override properties = { ...WidgetBase.properties, _items: { state: true }, _draft: { state: true } };
  declare _items: TodoItem[] | null;
  declare _draft: string;
  #sub = new Subscription();

  constructor() {
    super();
    this._items = null;
    this._draft = "";
  }

  #entity(): string | undefined {
    const hass = this.ctx?.store.hass;
    if (!hass) return undefined;
    const chosen = str(this.options.entity);
    if (chosen && chosen in hass.states) return chosen;
    const all = visibleIds(hass, ["todo"]);
    return all.find((id) => id.includes("shopping") || id.includes("einkauf")) ?? all[0];
  }

  protected override willUpdate(): void {
    if (this.demo) {
      if (!this._items)
        this._items = [
          { uid: "1", summary: "Milch", status: "needs_action" },
          { uid: "2", summary: "Brot", status: "needs_action" },
          { uid: "3", summary: "Kaffee", status: "completed" },
        ];
      return;
    }
    const hass = this.ctx?.store.hass;
    const id = this.#entity();
    this.#sub.set(
      id ?? "",
      hass && id
        ? () =>
            hass.connection.subscribeMessage<{ items: TodoItem[] }>((msg) => (this._items = msg.items), {
              type: "todo/item/subscribe",
              entity_id: id,
            })
        : null,
    );
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#sub.stop();
  }

  #toggleItem(item: TodoItem): void {
    const status = item.status === "completed" ? "needs_action" : "completed";
    if (this.demo) {
      this._items = (this._items ?? []).map((i) => (i.uid === item.uid ? { ...i, status } : i));
      return;
    }
    const id = this.#entity();
    if (id)
      void this.ctx.store.hass?.callService(
        "todo",
        "update_item",
        { item: item.uid, status },
        { entity_id: id },
      );
  }

  #add(ev: Event): void {
    ev.preventDefault();
    const text = this._draft.trim();
    if (!text) return;
    this._draft = "";
    if (this.demo) {
      this._items = [
        ...(this._items ?? []),
        { uid: String(Date.now()), summary: text, status: "needs_action" },
      ];
      return;
    }
    const id = this.#entity();
    if (id) void this.ctx.store.hass?.callService("todo", "add_item", { item: text }, { entity_id: id });
  }

  override heading(): string {
    const id = this.#entity();
    const hass = this.ctx?.store.hass;
    return this.config?.title || (id && hass && !this.demo ? nameOf(hass, id) : super.heading());
  }

  protected override render() {
    if (!this.ctx) return nothing;
    const { t } = this.ctx;
    if (!this.demo && !this.#entity())
      return this.ctx.editing ? html`<div class="w missing">${this.renderHead()}</div>` : nothing;
    const items = this._items ?? [];
    const open = items.filter((i) => i.status !== "completed");
    const done = items.filter((i) => i.status === "completed").slice(0, 3);
    return html`<div class="w">
      ${this.renderHead(`${open.length}`)}
      <form class="add" @submit=${this.#add}>
        <input
          .value=${live(this._draft)}
          @input=${(e: Event) => (this._draft = (e.target as HTMLInputElement).value)}
          placeholder=${t("w.add_item")}
          aria-label=${t("w.add_item")}
        />
        <button type="submit" aria-label=${t("w.add_item")}>+</button>
      </form>
      <div class="items">
        ${repeat(
          [...open, ...done],
          (i) => i.uid,
          (i) =>
            html`<button
              type="button"
              class="item ${i.status === "completed" ? "done" : ""}"
              @click=${() => this.#toggleItem(i)}
            >
              <span class="box"
                ><svg viewBox="0 0 24 24"><path d="M5 12l5 5L20 7" /></svg
              ></span>
              <span class="txt">${i.summary}</span>
            </button>`,
        )}
      </div>
    </div>`;
  }

  static override styles = [
    widgetStyles,
    css`
      .add {
        display: flex;
        gap: 6px;
      }
      .add input {
        flex: 1;
        min-width: 0;
        min-height: 42px;
        border: 0;
        border-radius: var(--a-radius);
        background: var(--a-s2);
        color: var(--a-text);
        font: inherit;
        font-size: 15px;
        padding: 0 12px;
      }
      .add button {
        width: 42px;
        border: 0;
        border-radius: var(--a-radius);
        background: var(--a-ocher);
        color: var(--a-on-ocher);
        font-size: 22px;
        font-weight: 600;
        cursor: pointer;
      }
      .items {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .item {
        all: unset;
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 42px;
        padding: 0 8px;
        border-radius: var(--a-radius);
        cursor: pointer;
        font-size: 15px;
      }
      .item:hover {
        background: var(--a-s2);
      }
      .box {
        width: 22px;
        height: 22px;
        border-radius: 6px;
        border: 2px solid var(--a-text3);
        display: flex;
        align-items: center;
        justify-content: center;
        flex: none;
        transition: background-color calc(var(--a-motion, 1) * 200ms);
      }
      .box svg {
        width: 16px;
        height: 16px;
        fill: none;
        stroke: var(--a-on-ocher);
        stroke-width: 3;
        stroke-dasharray: 24;
        stroke-dashoffset: 24;
        transition: stroke-dashoffset calc(var(--a-motion, 1) * 300ms) ease-out;
      }
      .done .box {
        background: var(--a-ocher);
        border-color: var(--a-ocher);
      }
      .done .box svg {
        stroke-dashoffset: 0;
      }
      .txt {
        background: linear-gradient(currentColor, currentColor) no-repeat 0 55% / 0 1.5px;
        transition: background-size calc(var(--a-motion, 1) * 300ms) ease-out;
      }
      .done .txt {
        color: var(--a-text3);
        background-size: 100% 1.5px;
      }
      :host([variant="compact"]) .item.done {
        display: none;
      }
      :host([variant="compact"]) .item {
        min-height: 34px;
        font-size: 14px;
      }
    `,
  ];
}

// ---- people ----

export class AtriumPersonsWidget extends WidgetBase {
  #people = new SelectorController(
    this,
    () => this.ctx?.store,
    (hass) =>
      visibleIds(hass, ["person"]).map((id) => {
        const s = hass.states[id];
        return {
          id,
          name: nameOf(hass, id),
          state: s?.state ?? "",
          picture: str(s?.attributes.entity_picture),
          since: s?.last_changed ?? "",
        };
      }),
  );

  protected override willUpdate(): void {
    this.#people.attach();
  }

  protected override render() {
    if (!this.ctx) return nothing;
    const { t } = this.ctx;
    const people = this.demo
      ? [
          { id: "a", name: "Anna", state: "home", picture: "", since: "" },
          { id: "b", name: "Ben", state: "not_home", picture: "", since: "" },
          { id: "c", name: "Oma", state: "Arbeit", picture: "", since: "" },
        ]
      : (this.#people.value ?? []);
    if (!people.length)
      return this.ctx.editing ? html`<div class="w missing">${this.renderHead()}</div>` : nothing;
    const home = people.filter((p) => p.state === "home").length;
    return html`<div class="w">
      ${this.renderHead(`${home} / ${people.length} ${t("w.at_home")}`)}
      <div class="people">
        ${people.map(
          (p) =>
            html`<button
              type="button"
              class="person ${p.state === "home" ? "home" : ""}"
              @click=${() => this.moreInfo(p.id)}
            >
              <span class="avatar">
                ${p.picture ? html`<img src=${p.picture} alt="" />` : html`<span>${p.name.slice(0, 1)}</span>`}
              </span>
              <span class="pn">${p.name}</span>
              <span class="ps"
                >${p.state === "home" ? t("w.at_home") : p.state === "not_home" ? t("w.away") : p.state}</span
              >
            </button>`,
        )}
      </div>
    </div>`;
  }

  static override styles = [
    widgetStyles,
    css`
      .people {
        display: flex;
        flex-wrap: wrap;
        gap: 14px;
      }
      .person {
        all: unset;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        width: 76px;
      }
      .avatar {
        width: 56px;
        height: 56px;
        border-radius: 28px;
        background: var(--a-s3);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 22px;
        font-weight: 600;
        overflow: hidden;
        position: relative;
        filter: grayscale(1);
        opacity: 0.65;
        transition:
          filter calc(var(--a-motion, 1) * 400ms),
          opacity calc(var(--a-motion, 1) * 400ms);
      }
      .home .avatar {
        filter: none;
        opacity: 1;
        box-shadow: 0 0 0 3px var(--a-sage);
        animation: arrive calc(var(--a-motion, 1) * 700ms) ease-out;
      }
      .avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .pn {
        font-weight: 600;
        font-size: 14px;
      }
      .ps {
        font-size: 12px;
        color: var(--a-text3);
        text-align: center;
      }
      @keyframes arrive {
        from {
          box-shadow: 0 0 0 10px transparent;
        }
      }
      :host([variant="list"]) .people {
        flex-direction: column;
        gap: 6px;
      }
      :host([variant="list"]) .person {
        width: auto;
        flex-direction: row;
        gap: 12px;
        background: var(--a-s2);
        border-radius: var(--a-radius);
        padding: 6px 12px 6px 6px;
      }
      :host([variant="list"]) .avatar {
        width: 40px;
        height: 40px;
        font-size: 16px;
      }
      :host([variant="list"]) .pn {
        flex: 1;
      }
      :host([variant="chips"]) .people {
        gap: 6px;
      }
      :host([variant="chips"]) .person {
        width: auto;
        flex-direction: row;
        gap: 8px;
        background: var(--a-s2);
        border-radius: 22px;
        padding: 4px 12px 4px 4px;
      }
      :host([variant="chips"]) .avatar {
        width: 32px;
        height: 32px;
        font-size: 13px;
      }
      :host([variant="chips"]) .ps {
        display: none;
      }
    `,
  ];
}

// ---- clock ----

export class AtriumClockWidget extends WidgetBase {
  static override properties = { ...WidgetBase.properties, _now: { state: true } };
  declare _now: Date;
  #timer: ReturnType<typeof setInterval> | undefined;

  constructor() {
    super();
    this._now = new Date();
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.#timer = setInterval(() => (this._now = new Date()), 1000);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearInterval(this.#timer);
  }

  protected override render() {
    if (!this.ctx) return nothing;
    const { locale } = this.ctx;
    const seconds = this.options.seconds === true;
    const parts = new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      ...(seconds ? { second: "2-digit" } : {}),
    }).formatToParts(this._now);
    if (this.variant === "analog") {
      const h = this._now.getHours() % 12;
      const m = this._now.getMinutes();
      const sec = this._now.getSeconds();
      const hand = (deg: number, len: number, cls: string) =>
        svg`<line x1="50" y1="50" x2="50" y2=${50 - len} class=${cls} transform="rotate(${deg} 50 50)" />`;
      return html`<div class="w clock">
        <svg
          class="analog"
          viewBox="0 0 100 100"
          aria-label=${new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(this._now)}
        >
          <circle cx="50" cy="50" r="46" class="face" />
          ${Array.from({ length: 12 }, (_, i) => svg`<line x1="50" y1="8" x2="50" y2=${i % 3 === 0 ? 15 : 12} class="mark" transform="rotate(${i * 30} 50 50)" />`)}
          ${hand(h * 30 + m / 2, 24, "hh")} ${hand(m * 6 + sec / 10, 34, "mh")} ${hand(sec * 6, 38, "sh")}
          <circle cx="50" cy="50" r="2.5" class="pin" />
        </svg>
        <div class="date">
          ${new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(this._now)}
        </div>
      </div>`;
    }
    return html`<div class="w clock">
      <div class="time">
        ${parts.map((p) => (p.type === "literal" ? html`<span class="colon">${p.value}</span>` : html`<span>${p.value}</span>`))}
      </div>
      <div class="date">
        ${new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(this._now)}
      </div>
    </div>`;
  }

  static override styles = [
    widgetStyles,
    css`
      .clock {
        align-items: center;
        justify-content: center;
        min-height: 120px;
      }
      .time {
        font-size: clamp(44px, 9vw, 84px);
        font-weight: 600;
        letter-spacing: -0.04em;
        font-variant-numeric: tabular-nums;
        line-height: 1;
      }
      .colon {
        animation: blink calc(var(--a-motion, 1) * 2s) steps(1) var(--a-iter, infinite);
      }
      .date {
        color: var(--a-text2);
        font-size: 15px;
      }
      @keyframes blink {
        50% {
          opacity: 0.25;
        }
      }
      :host([variant="minimal"]) .date {
        display: none;
      }
      :host([variant="minimal"]) .clock {
        min-height: 0;
      }
      .analog {
        width: min(220px, 70%);
        aspect-ratio: 1;
      }
      .face {
        fill: var(--a-s2);
      }
      .mark {
        stroke: var(--a-text3);
        stroke-width: 1.6;
        stroke-linecap: round;
      }
      .hh,
      .mh {
        stroke: var(--a-text);
        stroke-linecap: round;
      }
      .hh {
        stroke-width: 4;
      }
      .mh {
        stroke-width: 2.6;
      }
      .sh {
        stroke: var(--a-ocher);
        stroke-width: 1.2;
        transition: transform calc(var(--a-motion, 1) * 200ms) cubic-bezier(0.4, 2.2, 0.6, 1);
      }
      .pin {
        fill: var(--a-ocher);
      }
    `,
  ];
}

// ---- sun ----

export class AtriumSunWidget extends WidgetBase {
  #sun = new SelectorController(
    this,
    () => this.ctx?.store,
    (hass) => {
      const s = hass.states["sun.sun"];
      if (!s) return null;
      return {
        rising: str(s.attributes.next_rising),
        setting: str(s.attributes.next_setting),
        elevation: Number(s.attributes.elevation ?? 0),
        up: s.state === "above_horizon",
      };
    },
  );

  protected override willUpdate(): void {
    this.#sun.attach();
  }

  protected override render() {
    if (!this.ctx) return nothing;
    const { t, locale } = this.ctx;
    const sun = this.demo
      ? {
          rising: new Date(Date.now() + 15 * 3600000).toISOString(),
          setting: new Date(Date.now() + 4 * 3600000).toISOString(),
          elevation: 28,
          up: true,
        }
      : this.#sun.value;
    if (!sun) return nothing;
    const time = (d: string) =>
      d ? new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(d)) : "—";
    // Position on the arc from the time between today's sunrise and sunset
    // (HA only gives the next ones; a passed event is 24 h earlier).
    const now = Date.now();
    let rise = Date.parse(sun.rising);
    let set = Date.parse(sun.setting);
    if (rise > now && set < rise) rise -= 86400000;
    if (set > now && rise > set) set -= 86400000;
    const span = set - rise;
    const p =
      sun.up && span > 0 ? Math.max(0, Math.min(1, (now - rise) / span)) : new Date().getHours() < 12 ? 0 : 1;
    const x = 6 + 108 * p;
    const y = (1 - p) * (1 - p) * 60 + 2 * (1 - p) * p * -14 + p * p * 60;
    return html`<div class="w">
      ${this.renderHead()}
      <svg class="arc" viewBox="0 0 120 66" aria-hidden="true">
        <path d="M6 60 Q60 -14 114 60" class="track" />
        <line x1="0" y1="60" x2="120" y2="60" class="horizon" />
        <circle cx=${x} cy=${y} r="6" class="sunball ${sun.up ? "up" : ""}" />
      </svg>
      <div class="times">
        <span><small>${t("w.sunrise")}</small>${time(sun.rising)}</span>
        <span><small>${t("w.sunset")}</small>${time(sun.setting)}</span>
      </div>
    </div>`;
  }

  static override styles = [
    widgetStyles,
    css`
      .arc {
        width: 100%;
        max-height: 120px;
      }
      .track {
        fill: none;
        stroke: var(--a-s3);
        stroke-width: 1.5;
        stroke-dasharray: 3 3;
      }
      .horizon {
        stroke: var(--a-text3);
        stroke-width: 1;
      }
      .sunball {
        fill: var(--a-text3);
        transition:
          cx calc(var(--a-motion, 1) * 1s) ease,
          cy calc(var(--a-motion, 1) * 1s) ease;
      }
      .sunball.up {
        fill: var(--a-ocher);
        animation: glow calc(var(--a-motion, 1) * 3s) ease-in-out var(--a-iter, infinite);
      }
      .times {
        display: flex;
        justify-content: space-between;
        font-size: 18px;
        font-weight: 600;
      }
      .times span {
        display: flex;
        flex-direction: column;
      }
      .times span:last-child {
        text-align: right;
      }
      .times small {
        font-size: 12px;
        font-weight: 500;
        color: var(--a-text2);
      }
      @keyframes glow {
        50% {
          opacity: 0.75;
        }
      }
      :host([variant="minimal"]) .arc {
        display: none;
      }
    `,
  ];
}

// ---- notifications ----

interface Notification {
  notification_id: string;
  title?: string;
  message: string;
  created_at: string;
}

export class AtriumNotificationsWidget extends WidgetBase {
  static override properties = { ...WidgetBase.properties, _list: { state: true } };
  declare _list: Notification[];
  #sub = new Subscription();
  #map = new Map<string, Notification>();

  constructor() {
    super();
    this._list = [];
  }

  protected override willUpdate(): void {
    if (this.demo) {
      this._list = [
        {
          notification_id: "1",
          title: "Neues Gerät gefunden",
          message: "Eine Zigbee-Steckdose wurde erkannt.",
          created_at: new Date().toISOString(),
        },
      ];
      return;
    }
    const hass = this.ctx?.store.hass;
    this.#sub.set(
      hass ? "on" : "",
      hass
        ? () =>
            hass.connection.subscribeMessage<{ type: string; notifications: Record<string, Notification> }>(
              (msg) => {
                if (msg.type === "removed")
                  for (const id of Object.keys(msg.notifications)) this.#map.delete(id);
                else for (const [id, n] of Object.entries(msg.notifications)) this.#map.set(id, n);
                this._list = [...this.#map.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
              },
              { type: "persistent_notification/subscribe" },
            )
        : null,
    );
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#sub.stop();
    this.#map.clear();
  }

  #dismiss(id: string): void {
    if (this.demo) {
      this._list = this._list.filter((n) => n.notification_id !== id);
      return;
    }
    void this.ctx.store.hass?.callService("persistent_notification", "dismiss", { notification_id: id });
  }

  protected override render() {
    if (!this.ctx) return nothing;
    const { t } = this.ctx;
    if (!this._list.length && !this.ctx.editing && !this.demo) return nothing;
    return html`<div class="w">
      ${this.renderHead(`${this._list.length}`)}
      ${
        this._list.length
          ? repeat(
              this._list,
              (n) => n.notification_id,
              (n) =>
                html`<div class="note-item">
                  <div class="nt">
                    <b>${n.title ?? ""}</b><span>${n.message.replace(/[#*_`[\]]/g, "").slice(0, 220)}</span>
                  </div>
                  <button
                    type="button"
                    class="x"
                    aria-label=${t("w.dismiss")}
                    @click=${() => this.#dismiss(n.notification_id)}
                  >
                    ✕
                  </button>
                </div>`,
            )
          : html`<p class="empty">${t("w.no_notifications")}</p>`
      }
    </div>`;
  }

  static override styles = [
    widgetStyles,
    css`
      .note-item {
        display: flex;
        gap: 10px;
        align-items: flex-start;
        background: var(--a-s2);
        border-radius: var(--a-radius);
        padding: 10px 12px;
        border-left: 3px solid var(--a-ocher);
        animation: w-in calc(var(--a-motion, 1) * 300ms) ease-out;
      }
      .nt {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
        font-size: 13px;
        color: var(--a-text2);
      }
      .nt b {
        color: var(--a-text);
        font-size: 14px;
      }
      .x {
        border: 0;
        background: var(--a-s3);
        color: var(--a-text);
        width: 32px;
        height: 32px;
        border-radius: 16px;
        cursor: pointer;
        flex: none;
      }
      :host([variant="compact"]) .nt span {
        display: none;
      }
      :host([variant="compact"]) .note-item {
        padding: 6px 10px;
        align-items: center;
      }
    `,
  ];
}
