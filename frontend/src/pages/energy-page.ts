import { LitElement, css, html, nothing, svg, type PropertyValues } from "lit";
import { repeat } from "lit/directives/repeat.js";
import type { PanelContext } from "../context";
import {
  amortisation,
  energyConfig,
  fetchDaily,
  fetchHourlyMean,
  fetchPowerHistory,
  forecastKwh,
  liveEnergy,
  sumFrom,
  type DailyValue,
  type EnergyConfig,
  type LiveEnergy,
  type PowerPoint,
} from "../data/energy";
import { SelectorController } from "../data/entity-store";
import { localDate } from "../data/home";
import { shared } from "../theme/shared";

const REFRESH_MS = 5 * 60 * 1000;
const DAY_FROM_H = 5;
const DAY_TO_H = 21;
const DAY_MS = 86400000;

interface Recorded {
  /** Daily production since the earliest month loaded. */
  days: DailyValue[];
  /** Daily consumption per consumer (keyed by its power sensor), this year. */
  consumerDays: Record<string, DailyValue[]>;
  /** First date loaded. */
  from: string;
}

interface DayData {
  date: string;
  points: PowerPoint[];
  /** "history" = detailed; "hourly" = hourly means (older days); "none" = nothing kept. */
  source: "history" | "hourly" | "none";
}

const parseDate = (date: string) => {
  const [y = 1970, m = 1, d = 1] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/**
 * Solar and consumption: live flow, a day (today or any day picked in the
 * calendar) as numbers and curve, the month as a calendar with daily kWh,
 * consumers with today/month/year, and amortisation. Live values come from
 * `hass`, the rest from Home Assistant's history and statistics.
 */
export class AtriumEnergyPage extends LitElement {
  static override properties = {
    ctx: { attribute: false },
    _rec: { state: true },
    _month: { state: true },
    _day: { state: true },
    _dayData: { state: true },
  };

  declare ctx: PanelContext;
  declare _rec: Recorded | null;
  /** First day of the month shown in the calendar. */
  declare _month: Date;
  /** Day shown in the curve, YYYY-MM-DD. */
  declare _day: string;
  declare _dayData: DayData | null;

  #timer: ReturnType<typeof setInterval> | undefined;
  #loadedFor = "";

  #cfg = new SelectorController(
    this,
    () => this.ctx?.store,
    (hass) => energyConfig(hass, this.ctx.layout),
  );

  #live = new SelectorController(
    this,
    () => this.ctx?.store,
    (hass) => {
      const cfg = this.#cfg.value;
      if (!cfg) return null;
      const live = liveEnergy(hass, cfg);
      return {
        ...live,
        total: cfg.energyTotal ? Number(hass.states[cfg.energyTotal]?.state) : null,
        forecastToday: forecastKwh(hass, cfg.forecastToday),
        forecastTomorrow: forecastKwh(hass, cfg.forecastTomorrow),
      };
    },
  );

  constructor() {
    super();
    const now = new Date();
    this._rec = null;
    this._month = new Date(now.getFullYear(), now.getMonth(), 1);
    this._day = localDate(now);
    this._dayData = null;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.#timer = setInterval(() => void this.#load(), REFRESH_MS);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearInterval(this.#timer);
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    this.#cfg.attach();
    if (changed.has("ctx")) this.#cfg.refresh();
    this.#live.attach();
    this.#live.refresh();
    const key = JSON.stringify(this.#cfg.value ?? {});
    if (key !== this.#loadedFor) {
      this.#loadedFor = key;
      this._rec = null;
      void this.#load();
    }
  }

  async #load(): Promise<void> {
    const hass = this.ctx?.store.hass;
    const cfg = this.#cfg.value;
    if (!hass || !cfg) return;
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const from = this._month < yearStart ? this._month : yearStart;
    try {
      const [days, consumers] = await Promise.all([
        cfg.energyTotal ? fetchDaily(hass, cfg.energyTotal, from) : Promise.resolve([]),
        Promise.all(
          (cfg.consumers ?? [])
            .filter((c) => c.energy)
            .map(async (c) => [c.power, await fetchDaily(hass, c.energy as string, yearStart)] as const),
        ),
      ]);
      this._rec = { days, consumerDays: Object.fromEntries(consumers), from: localDate(from) };
    } catch {
      // Recorder not available: live values still work.
      this._rec = { days: [], consumerDays: {}, from: localDate(from) };
    }
    void this.#loadDay(this._day);
  }

  async #loadDay(date: string): Promise<void> {
    const hass = this.ctx?.store.hass;
    const cfg = this.#cfg.value;
    if (!hass || !cfg?.acPower) {
      this._dayData = { date, points: [], source: "none" };
      return;
    }
    const start = parseDate(date);
    const end = new Date(start.getTime() + DAY_MS);
    try {
      let points = await fetchPowerHistory(hass, cfg.acPower, start, end);
      let source: DayData["source"] = "history";
      if (points.length < 3 && date !== localDate(new Date())) {
        points = await fetchHourlyMean(hass, cfg.acPower, start, end);
        source = points.length ? "hourly" : "none";
      }
      if (this._day === date) this._dayData = { date, points, source };
    } catch {
      if (this._day === date) this._dayData = { date, points: [], source: "none" };
    }
  }

  #pickDay(date: string): void {
    if (date > localDate(new Date())) return;
    this._day = date;
    this._dayData = null;
    void this.#loadDay(date);
  }

  #shiftMonth(delta: -1 | 1): void {
    const next = new Date(this._month.getFullYear(), this._month.getMonth() + delta, 1);
    const now = new Date();
    if (next > new Date(now.getFullYear(), now.getMonth(), 1)) return;
    this._month = next;
    if (this._rec && localDate(next) < this._rec.from) void this.#load();
  }

  #fmt(n: number | null, digits = 1, unit = ""): string {
    if (n === null || Number.isNaN(n)) return "—";
    const s = new Intl.NumberFormat(this.ctx.locale, {
      maximumFractionDigits: digits,
      minimumFractionDigits: 0,
    }).format(n);
    return unit ? `${s} ${unit}` : s;
  }

  #money(n: number | null): string {
    if (n === null) return "—";
    return new Intl.NumberFormat(this.ctx.locale, { style: "currency", currency: "EUR" }).format(n);
  }

  #dayKwh(date: string): number | null {
    return this._rec?.days.find((d) => d.date === date)?.kwh ?? null;
  }

  #dayCurve(data: DayData, cfg: EnergyConfig) {
    const day = parseDate(data.date);
    const isToday = data.date === localDate(new Date());
    const now = Date.now();
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), DAY_FROM_H).getTime();
    const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), DAY_TO_H).getTime();
    const limit = isToday ? Math.min(end, now) : end;
    const points = data.points.filter((p) => p.t <= limit);
    const top = Math.max(cfg.peakKw ? cfg.peakKw * 1000 : 0, ...points.map((p) => p.w), 100);
    // Drawn at roughly its displayed size, so labels keep their font size.
    const W = 420;
    const H = 150;
    const x = (t: number) => Math.max(0, Math.min(W, ((t - start) / (end - start)) * W));
    const y = (w: number) => H - (w / top) * (H - 10);
    let d = "";
    let prevW = 0;
    for (const p of points) {
      // Step line: power holds until the next reading.
      d += d
        ? ` L${x(p.t).toFixed(1)} ${y(prevW).toFixed(1)} L${x(p.t).toFixed(1)} ${y(p.w).toFixed(1)}`
        : `M${x(p.t).toFixed(1)} ${y(p.w).toFixed(1)}`;
      prevW = p.w;
    }
    const lastX = x(limit);
    if (d) d += ` L${lastX.toFixed(1)} ${y(prevW).toFixed(1)}`;
    const area = d ? `${d} L${lastX.toFixed(1)} ${H} L${x(points[0]?.t ?? start).toFixed(1)} ${H} Z` : "";
    const hours = [6, 9, 12, 15, 18];
    return html`<svg
      viewBox="0 0 ${W} ${H + 22}"
      class="curve"
      role="img"
      aria-label=${this.ctx.t("energy.day_curve")}
    >
      ${[0.25, 0.5, 0.75].map((f) => svg`<line x1="0" x2=${W} y1=${H - f * (H - 10)} y2=${H - f * (H - 10)} class="grid" />`)}
      ${area ? svg`<path d=${area} class="area" />` : nothing}
      ${d ? svg`<path d=${d} class="line" />` : nothing}
      ${isToday && now < end && now > start ? svg`<line x1=${lastX} x2=${lastX} y1="0" y2=${H} class="now" />` : nothing}
      ${hours.map((h) => svg`<text x=${x(new Date(day.getFullYear(), day.getMonth(), day.getDate(), h).getTime())} y=${H + 16} class="tick">${h}:00</text>`)}
      <text x=${W} y="12" class="tick end">${this.#fmt(top, 0, "W")}</text>
    </svg>`;
  }

  #renderDay(cfg: EnergyConfig) {
    const { t, locale } = this.ctx;
    const data = this._dayData;
    const isToday = this._day === localDate(new Date());
    const title = isToday
      ? t("energy.today_curve")
      : new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(
          parseDate(this._day),
        );
    const kwh = this.#dayKwh(this._day);
    const peak = data?.points.reduce((m, p) => Math.max(m, p.w), 0) ?? null;
    const active = data?.points.filter((p) => p.w > 5) ?? [];
    const time = (ms: number) =>
      new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(ms);
    return html`<section class="card day-card" data-day=${this._day}>
      <div class="row-head">
        <span class="label">${title}</span>
        ${
          isToday
            ? nothing
            : html`<button type="button" class="link" @click=${() => this.#pickDay(localDate(new Date()))}>
                ${t("energy.back_today")}
              </button>`
        }
      </div>
      <div class="day-facts">
        <div><b>${this.#fmt(kwh, 2, "kWh")}</b><span>${t("energy.produced")}</span></div>
        <div><b>${this.#fmt(peak, 0, "W")}</b><span>${t("energy.peak")}</span></div>
        <div>
          <b
            >${active.length ? `${time(active[0]?.t ?? 0)}–${time(active[active.length - 1]?.t ?? 0)}` : "—"}</b
          >
          <span>${t("energy.producing")}</span>
        </div>
      </div>
      ${data ? this.#dayCurve(data, cfg) : html`<div class="loading"></div>`}
      ${data?.source === "hourly" ? html`<div class="hint">${t("energy.hourly_note")}</div>` : nothing}
      ${data?.source === "none" ? html`<div class="hint">${t("energy.no_history")}</div>` : nothing}
    </section>`;
  }

  #renderCalendar(totals: unknown) {
    const { t, locale } = this.ctx;
    const month = this._month;
    const now = new Date();
    const today = localDate(now);
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const offset = (month.getDay() + 6) % 7; // Monday first
    const monthDays = (this._rec?.days ?? []).filter((d) => d.date.startsWith(localDate(month).slice(0, 7)));
    const byDate = new Map(monthDays.map((d) => [d.date, d.kwh]));
    const max = Math.max(0.1, ...monthDays.map((d) => d.kwh));
    const total = monthDays.reduce((s, d) => s + d.kwh, 0);
    const isCurrent = month.getFullYear() === now.getFullYear() && month.getMonth() === now.getMonth();
    const weekdays = Array.from({ length: 7 }, (_, i) =>
      new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(new Date(2024, 0, 1 + i)),
    );
    const cells = [];
    for (let i = 0; i < offset; i++) cells.push(html`<span></span>`);
    for (let day = 1; day <= daysInMonth; day++) {
      const date = localDate(new Date(month.getFullYear(), month.getMonth(), day));
      const kwh = byDate.get(date);
      const future = date > today;
      const level = kwh === undefined ? -1 : Math.min(4, Math.ceil((kwh / max) * 4));
      cells.push(
        html`<button
          type="button"
          class="day l${level} ${date === this._day ? "selected" : ""} ${date === today ? "today" : ""}"
          data-date=${date}
          ?disabled=${future}
          aria-pressed=${String(date === this._day)}
          aria-label=${new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }).format(parseDate(date))}
          @click=${() => this.#pickDay(date)}
        >
          <span class="d">${day}</span>
          ${kwh !== undefined ? html`<span class="k">${this.#fmt(kwh, 1)}</span>` : nothing}
        </button>`,
      );
    }
    return html`<section class="card cal-card">
      <div class="row-head">
        <div class="month-nav">
          <button
            type="button"
            class="nav"
            aria-label=${t("energy.prev_month")}
            @click=${() => this.#shiftMonth(-1)}
          >
            ‹
          </button>
          <span class="label"
            >${new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(month)}</span
          >
          <button
            type="button"
            class="nav"
            aria-label=${t("energy.next_month")}
            ?disabled=${isCurrent}
            @click=${() => this.#shiftMonth(1)}
          >
            ›
          </button>
        </div>
        <span class="label">${this.#fmt(total, 1, "kWh")}</span>
      </div>
      ${
        this._rec
          ? html`<div class="cal-head">${weekdays.map((w) => html`<span>${w}</span>`)}</div>
              <div class="cal">${cells}</div>`
          : html`<div class="loading"></div>`
      }
      <div class="hint">${t("energy.pick_day")}</div>
      ${totals}
    </section>`;
  }

  #renderConsumers(live: LiveEnergy) {
    const { t } = this.ctx;
    const now = new Date();
    const today = localDate(now);
    const monthStart = localDate(new Date(now.getFullYear(), now.getMonth(), 1));
    const rows = live.consumers.map((c) => {
      const days = this._rec?.consumerDays[c.id];
      return {
        ...c,
        today: days ? sumFrom(days, today) : null,
        month: days ? sumFrom(days, monthStart) : null,
        year: days ? sumFrom(days, `${now.getFullYear()}-01-01`) : null,
      };
    });
    const totalOf = (key: "today" | "month" | "year") =>
      rows.some((r) => r[key] !== null) ? rows.reduce((s, r) => s + (r[key] ?? 0), 0) : null;
    const maxW = Math.max(1, ...rows.map((r) => r.watts ?? 0));
    return html`<section class="card cons-card">
      <div class="label">${t("energy.consumers")}</div>
      <div class="table-wrap">
        <table class="ctable">
          <thead>
            <tr>
              <th scope="col"></th>
              <th scope="col">${t("energy.now")}</th>
              <th scope="col">${t("energy.today")}</th>
              <th scope="col">${t("energy.month")}</th>
              <th scope="col">${t("energy.year")}</th>
            </tr>
          </thead>
          <tbody>
            ${repeat(
              rows,
              (r) => r.id,
              (r) =>
                html`<tr>
                  <th scope="row">
                    ${r.name}
                    <span class="live ${(r.watts ?? 0) >= 1 ? "on" : ""}"
                      ><span style="width: ${Math.max(2, ((r.watts ?? 0) / maxW) * 100)}%"></span
                    ></span>
                  </th>
                  <td>${this.#fmt(r.watts, 0, "W")}</td>
                  <td>${this.#fmt(r.today, 2)}</td>
                  <td>${this.#fmt(r.month, 1)}</td>
                  <td>${this.#fmt(r.year, 0)}</td>
                </tr>`,
            )}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">${t("energy.total")}</th>
              <td>
                ${this.#fmt(
                  live.consumers.reduce((s, c) => s + (c.watts ?? 0), 0),
                  0,
                  "W",
                )}
              </td>
              <td>${this.#fmt(totalOf("today"), 2)}</td>
              <td>${this.#fmt(totalOf("month"), 1)}</td>
              <td>${this.#fmt(totalOf("year"), 0)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div class="hint">kWh</div>
    </section>`;
  }

  protected override render() {
    const { t } = this.ctx;
    const cfg = this.#cfg.value;
    const live = this.#live.value;
    if (!cfg || !live) return nothing;
    if (!cfg.acPower && !cfg.pvPower?.length) {
      return html`<h1>${t("energy.title")}</h1>
        <p class="hint">${t("energy.none")}</p>`;
    }
    const now = new Date();
    const days = this._rec?.days ?? [];
    const todayKwh = this._rec ? (this.#dayKwh(localDate(now)) ?? 0) : null;
    const week = this._rec ? sumFrom(days, localDate(new Date(now.getTime() - 6 * DAY_MS))) : null;
    const month = this._rec ? sumFrom(days, localDate(new Date(now.getFullYear(), now.getMonth(), 1))) : null;
    const year = this._rec ? sumFrom(days, `${now.getFullYear()}-01-01`) : null;
    const amort = amortisation(Number.isNaN(live.total ?? NaN) ? null : live.total, cfg);
    return html`<h1>${t("energy.title")}</h1>
      <div class="layout ${amort ? "" : "no-amort"}">
        <section class="hero">
          <div class="label on-sage">${t("energy.solar_now")}</div>
          <div class="big">${this.#fmt(live.ac, 0)}<small> W</small></div>
          ${
            live.ofPeak !== null
              ? html`<div class="bar"><span style="width: ${Math.round(live.ofPeak * 100)}%"></span></div>
                  <div class="hero-foot">
                    ${this.#fmt(live.ofPeak * 100, 0, "%")} ${t("energy.of_peak")}
                    ${this.#fmt(cfg.peakKw ?? null, 2, "kWp")}
                  </div>`
              : nothing
          }
        </section>

        <section class="card flow-card">
          <div class="label">${t("energy.flow")}</div>
          <atrium-energy-flow
            .live=${live}
            .t=${this.ctx.t}
            .locale=${this.ctx.locale}
            ?narrow=${this.ctx.narrow}
          ></atrium-energy-flow>
        </section>

        <section class="kpis">
          <div><b>${this.#fmt(todayKwh, 2, "kWh")}</b><span>${t("energy.today")}</span></div>
          ${
            live.forecastToday !== null
              ? html`<div>
                  <b>${this.#fmt(live.forecastToday, 1, "kWh")}</b><span>${t("energy.forecast")}</span>
                </div>`
              : nothing
          }
          <div>
            <b>${this.#money(todayKwh !== null && cfg.price ? todayKwh * cfg.price : null)}</b>
            <span>${t("energy.earned_today")}</span>
          </div>
          <div>
            <b>${this.#fmt(todayKwh !== null && cfg.co2PerKwh ? todayKwh * cfg.co2PerKwh : null, 2, "kg")}</b>
            <span>${t("energy.co2")}</span>
          </div>
          <div>
            <b>${live.efficiency !== null ? this.#fmt(live.efficiency * 100, 0, "%") : "—"}</b>
            <span>${t("energy.efficiency")}</span>
          </div>
          ${
            live.temp !== null
              ? html`<div><b>${this.#fmt(live.temp, 0, "°C")}</b><span>${t("energy.inverter")}</span></div>`
              : nothing
          }
          ${
            live.frequency !== null
              ? html`<div>
                  <b>${this.#fmt(live.frequency, 2, "Hz")}</b><span>${t("energy.frequency")}</span>
                </div>`
              : nothing
          }
        </section>

        ${this.#renderDay(cfg)}
        ${this.#renderCalendar(
          html`<div class="totals">
            <div><b>${this.#fmt(week, 1, "kWh")}</b><span>${t("energy.week")}</span></div>
            <div><b>${this.#fmt(month, 1, "kWh")}</b><span>${t("energy.month")}</span></div>
            <div><b>${this.#fmt(year, 0, "kWh")}</b><span>${t("energy.year")}</span></div>
          </div>`,
        )}
        ${live.consumers.length ? this.#renderConsumers(live) : nothing}
        ${
          amort
            ? html`<section class="card amort-card">
                <div class="label">${t("energy.amortisation")}</div>
                <div class="amort">
                  <b>${this.#money(amort.earned)}</b><span>${t("energy.of")} ${this.#money(amort.cost)}</span>
                </div>
                <div class="bar sage"><span style="width: ${Math.round(amort.share * 100)}%"></span></div>
                <div class="hint">
                  ${this.#fmt(amort.share * 100, 0, "%")}
                  ${
                    amort.paybackDate
                      ? html`· ${t("energy.payback")}
                        ${new Intl.DateTimeFormat(this.ctx.locale, { month: "long", year: "numeric" }).format(
                          new Date(amort.paybackDate),
                        )}`
                      : nothing
                  }
                </div>
              </section>`
            : nothing
        }
      </div>`;
  }

  static override styles = [
    shared,
    css`
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
      /* Fixed places instead of auto-flow, so cards in a row line up. */
      .layout {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 12px;
      }
      @media (min-width: 900px) {
        .layout {
          grid-template-columns: repeat(12, minmax(0, 1fr));
        }
        .hero {
          grid-column: span 4;
        }
        .flow-card {
          grid-column: span 8;
        }
        .kpis {
          grid-column: 1 / -1;
        }
        .day-card {
          grid-column: span 7;
        }
        .cal-card {
          grid-column: span 5;
        }
        .cons-card {
          grid-column: span 8;
        }
        .amort-card {
          grid-column: span 4;
        }
        .no-amort .cons-card {
          grid-column: 1 / -1;
        }
      }
      .card,
      .hero {
        border-radius: var(--a-radius);
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-width: 0;
      }
      .card {
        background: var(--a-s1);
      }
      .hero {
        background: var(--a-sage);
        color: #fff;
      }
      .on-sage {
        color: #fff;
      }
      .big {
        font-size: 72px;
        font-weight: 600;
        letter-spacing: -0.04em;
        line-height: 0.9;
        font-variant-numeric: tabular-nums;
      }
      .big small {
        font-size: 28px;
        letter-spacing: 0;
      }
      .bar {
        height: 8px;
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.25);
        overflow: hidden;
      }
      .bar span {
        display: block;
        height: 100%;
        background: #fff;
        transition: width 400ms ease;
      }
      .bar.sage {
        height: 12px;
        background: var(--a-s3);
      }
      .bar.sage span {
        background: var(--a-sage);
      }
      .hero-foot {
        font-size: 14px;
      }
      .kpis {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
        gap: 8px;
      }
      .hero {
        justify-content: space-between;
      }
      .flow-card {
        justify-content: center;
      }
      .cal-card .totals {
        margin-top: auto;
      }
      .cal-card .totals b {
        font-size: 17px;
        white-space: normal;
      }
      .live {
        display: block;
        height: 5px;
        margin-top: 4px;
        border-radius: 3px;
        background: var(--a-s3);
        overflow: hidden;
        max-width: 220px;
      }
      .live span {
        display: block;
        height: 100%;
        border-radius: 3px;
        background: var(--a-s3);
        transition: width 600ms ease;
      }
      .live.on span {
        background: repeating-linear-gradient(
          90deg,
          var(--a-slate) 0 10px,
          color-mix(in srgb, var(--a-slate) 60%, #fff) 10px 20px
        );
        background-size: 40px 100%;
        animation: stripes 1.2s linear infinite;
      }
      @keyframes stripes {
        to {
          background-position: 40px 0;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .live.on span {
          animation: none;
        }
      }
      .kpis div,
      .totals div {
        background: var(--a-s1);
        border-radius: var(--a-radius);
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      .kpis b,
      .totals b {
        font-size: 20px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .kpis span,
      .totals span {
        font-size: 12px;
        color: var(--a-text2);
      }
      .totals {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
      }
      .totals div {
        background: var(--a-s2);
      }
      .curve {
        width: 100%;
        height: auto;
      }
      .curve .grid {
        stroke: var(--a-s3);
        stroke-width: 1;
      }
      .curve .area {
        fill: var(--a-ocher);
        opacity: 0.25;
      }
      .curve .line {
        fill: none;
        stroke: var(--a-ocher);
        stroke-width: 2;
        stroke-linejoin: round;
      }
      .curve .now {
        stroke: var(--a-text);
        stroke-width: 1.5;
      }
      .curve .tick {
        font-family: var(--a-font);
        font-size: 11px;
        fill: var(--a-text2);
        text-anchor: middle;
      }
      .curve .tick.end {
        text-anchor: end;
      }
      .curve-foot,
      .hint {
        font-size: 13px;
        color: var(--a-text2);
      }
      .row-head {
        display: flex;
        justify-content: space-between;
        gap: 8px;
      }
      .cal-head,
      .cal {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        gap: 4px;
      }
      .cal-head span {
        font-size: 11px;
        color: var(--a-text2);
        text-align: center;
      }
      .day {
        height: 34px;
        border-radius: 4px;
        font-size: 11px;
        padding: 3px 5px;
        box-sizing: border-box;
        background: var(--a-s2);
        color: var(--a-text2);
      }
      .day.l0 {
        background: var(--a-s3);
        color: var(--a-text);
      }
      .day.l1 {
        background: color-mix(in srgb, var(--a-ocher) 30%, var(--a-s2));
        color: var(--a-text);
      }
      .day.l2 {
        background: color-mix(in srgb, var(--a-ocher) 55%, var(--a-s2));
        color: var(--a-text);
      }
      .day.l3,
      .day.l4 {
        background: var(--a-ocher);
        color: var(--a-on-ocher);
      }
      .day.today {
        outline: 2px solid var(--a-text);
        outline-offset: -2px;
      }
      .consumers {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .c-top {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        font-size: 15px;
        font-weight: 600;
      }
      .c-bar {
        height: 6px;
        border-radius: 3px;
        background: var(--a-s3);
        margin-top: 4px;
        overflow: hidden;
      }
      .c-bar span {
        display: block;
        height: 100%;
        background: var(--a-slate);
      }
      .c-sub {
        font-size: 12px;
        color: var(--a-text2);
        margin-top: 2px;
      }
      .amort {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
      }
      .amort b {
        font-size: 32px;
        font-weight: 600;
      }
      .amort span {
        font-size: 14px;
        color: var(--a-text2);
      }
      .loading {
        height: 120px;
        border-radius: var(--a-radius);
        background: var(--a-s2);
      }
      .day-facts {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
      }
      .day-facts div {
        background: var(--a-s2);
        border-radius: var(--a-radius);
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .day-facts b {
        font-size: 17px;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-variant-numeric: tabular-nums;
      }
      .day-facts span {
        font-size: 12px;
        color: var(--a-text2);
      }
      .link,
      .nav {
        border: 0;
        background: var(--a-s3);
        color: var(--a-text);
        border-radius: var(--a-radius);
        min-height: 36px;
        font-weight: 600;
      }
      .link {
        padding: 0 12px;
        font-size: 13px;
      }
      .nav {
        width: 36px;
        font-size: 18px;
        line-height: 1;
      }
      .nav:disabled {
        opacity: 0.35;
        cursor: default;
      }
      .month-nav {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .row-head {
        align-items: center;
      }
      button.day {
        border: 0;
        font-family: inherit;
        text-align: left;
        cursor: pointer;
        height: 44px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      }
      button.day:disabled {
        cursor: default;
        opacity: 0.6;
      }
      button.day .k {
        font-size: 11px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }
      button.day.selected {
        outline: 2px solid var(--a-text);
        outline-offset: -2px;
      }
      button.day.today:not(.selected) {
        box-shadow: inset 0 -3px 0 var(--a-text2);
      }
      .table-wrap {
        overflow-x: auto;
      }
      table.ctable {
        width: 100%;
        border-collapse: collapse;
        font-variant-numeric: tabular-nums;
      }
      table.ctable th,
      table.ctable td {
        padding: 8px 6px;
        text-align: right;
        white-space: nowrap;
        font-size: 14px;
      }
      table.ctable th[scope="row"] {
        text-align: left;
        font-weight: 600;
        white-space: normal;
      }
      table.ctable thead th {
        font-size: 12px;
        font-weight: 600;
        color: var(--a-text2);
      }
      table.ctable tbody tr + tr {
        border-top: 1px solid var(--a-s3);
      }
      table.ctable tfoot {
        border-top: 2px solid var(--a-s3);
      }
      table.ctable tfoot th,
      table.ctable tfoot td {
        font-weight: 700;
      }
    `,
  ];
}
