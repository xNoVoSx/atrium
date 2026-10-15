import { LitElement, css, html, nothing, svg, type PropertyValues } from "lit";
import { repeat } from "lit/directives/repeat.js";
import type { PanelContext } from "../context";
import {
  amortisation,
  energyConfig,
  fetchDaily,
  fetchPowerHistory,
  forecastKwh,
  liveEnergy,
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

interface Recorded {
  today: number | null;
  month: DailyValue[];
  week: number | null;
  monthTotal: number | null;
  year: number | null;
  history: PowerPoint[];
  consumersToday: Record<string, number>;
}

/**
 * Solar and consumption: live flow, today's numbers and curve, the month as a
 * calendar, consumers and amortisation. Live values come from `hass`, daily
 * values from Home Assistant's statistics (refreshed every few minutes).
 */
export class AtriumEnergyPage extends LitElement {
  static override properties = {
    ctx: { attribute: false },
    _rec: { state: true },
  };

  declare ctx: PanelContext;
  declare _rec: Recorded | null;

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
    this._rec = null;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.#timer = setInterval(() => void this.#load(true), REFRESH_MS);
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
      void this.#load(false);
    }
  }

  async #load(quiet: boolean): Promise<void> {
    const hass = this.ctx?.store.hass;
    const cfg = this.#cfg.value;
    if (!hass || !cfg) return;
    if (!quiet) this._rec = null;
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const weekStart = new Date(midnight.getTime() - 6 * 86400000);
    const sum = (list: DailyValue[], from: Date) =>
      list.filter((d) => d.date >= localDate(from)).reduce((s, d) => s + d.kwh, 0);
    try {
      const [year, history, consumers] = await Promise.all([
        cfg.energyTotal
          ? fetchDaily(hass, cfg.energyTotal, yearStart < weekStart ? yearStart : weekStart)
          : [],
        cfg.acPower ? fetchPowerHistory(hass, cfg.acPower, midnight) : Promise.resolve([]),
        Promise.all(
          (cfg.consumers ?? [])
            .filter((c) => c.energy)
            .map(async (c) => {
              const days = await fetchDaily(hass, c.energy as string, midnight);
              return [c.power, days.reduce((s, d) => s + d.kwh, 0)] as const;
            }),
        ),
      ]);
      const today = localDate(now);
      this._rec = {
        today: cfg.energyTotal ? (year.find((d) => d.date === today)?.kwh ?? 0) : null,
        month: year.filter((d) => d.date >= localDate(monthStart)),
        week: cfg.energyTotal ? sum(year, weekStart) : null,
        monthTotal: cfg.energyTotal ? sum(year, monthStart) : null,
        year: cfg.energyTotal ? sum(year, yearStart) : null,
        history,
        consumersToday: Object.fromEntries(consumers),
      };
    } catch {
      // Recorder not available: live values still work.
      this._rec = {
        today: null,
        month: [],
        week: null,
        monthTotal: null,
        year: null,
        history: [],
        consumersToday: {},
      };
    }
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

  #flow(live: LiveEnergy) {
    const strings = live.strings.slice(0, 4);
    const h = Math.max(160, strings.length * 70);
    const midY = h / 2;
    // Dash speed follows power: more watts, faster dots.
    const speed = (w: number | null) => (w && w > 1 ? Math.max(0.4, 3 - Math.log10(w)) : 0);
    const line = (d: string, w: number | null, cls: string) =>
      svg`<path d=${d} class="flow ${cls} ${w && w > 1 ? "on" : ""}" style="animation-duration: ${speed(w)}s" />`;
    return html`<svg
      viewBox="0 0 440 ${h}"
      class="flowchart"
      role="img"
      aria-label="${this.ctx.t("energy.flow")}"
    >
      ${strings.map((s, i) => {
        const y = strings.length === 1 ? midY : 20 + (i * (h - 40)) / (strings.length - 1);
        return svg`${line(`M88 ${y} C150 ${y} 150 ${midY} 196 ${midY}`, s.watts, "pv")}
          <rect x="0" y=${y - 26} width="88" height="52" rx="8" class="node" />
          <text x="44" y=${y - 2} class="v">${this.#fmt(s.watts, 0, "W")}</text>
          <text x="44" y=${y + 16} class="n">${`PV${i + 1}`}</text>`;
      })}
      ${line(`M292 ${midY} L340 ${midY}`, live.ac, "ac")}
      <rect x="196" y=${midY - 34} width="96" height="68" rx="8" class="node inv" />
      <text x="244" y=${midY - 6} class="v small">${this.ctx.t("energy.inverter_short")}</text>
      <text x="244" y=${midY + 14} class="n">
        ${live.efficiency !== null ? this.#fmt(live.efficiency * 100, 0, "%") : "—"}
      </text>
      <rect x="340" y=${midY - 34} width="100" height="68" rx="8" class="node out" />
      <text x="390" y=${midY - 2} class="v light">${this.#fmt(live.ac, 0, "W")}</text>
      <text x="390" y=${midY + 18} class="n light">${this.ctx.t("energy.grid_house")}</text>
    </svg>`;
  }

  #dayCurve(history: PowerPoint[], cfg: EnergyConfig) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), DAY_FROM_H).getTime();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), DAY_TO_H).getTime();
    const points = history.filter((p) => p.t >= start && p.t <= Math.min(end, now.getTime()));
    const top = Math.max(cfg.peakKw ? cfg.peakKw * 1000 : 0, ...points.map((p) => p.w), 100);
    // Drawn at roughly its displayed size, so labels keep their font size.
    const W = 420;
    const H = 150;
    const x = (t: number) => ((t - start) / (end - start)) * W;
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
    const nowX = x(Math.min(now.getTime(), end));
    if (d) d += ` L${nowX.toFixed(1)} ${y(prevW).toFixed(1)}`;
    const area = d ? `${d} L${nowX.toFixed(1)} ${H} L${x(points[0]?.t ?? start).toFixed(1)} ${H} Z` : "";
    const peak = points.reduce((m, p) => Math.max(m, p.w), 0);
    const hours = [6, 9, 12, 15, 18];
    return html`<svg
        viewBox="0 0 ${W} ${H + 22}"
        class="curve"
        role="img"
        aria-label=${this.ctx.t("energy.today_curve")}
      >
        ${[0.25, 0.5, 0.75].map((f) => svg`<line x1="0" x2=${W} y1=${H - f * (H - 10)} y2=${H - f * (H - 10)} class="grid" />`)}
        ${area ? svg`<path d=${area} class="area" />` : nothing}
        ${d ? svg`<path d=${d} class="line" />` : nothing}
        ${now.getTime() < end && now.getTime() > start ? svg`<line x1=${nowX} x2=${nowX} y1="0" y2=${H} class="now" />` : nothing}
        ${hours.map((h) => svg`<text x=${x(new Date(now.getFullYear(), now.getMonth(), now.getDate(), h).getTime())} y=${H + 16} class="tick">${h}:00</text>`)}
        <text x=${W} y="12" class="tick end">${this.#fmt(top, 0, "W")}</text>
      </svg>
      <div class="curve-foot">${this.ctx.t("energy.peak")} ${this.#fmt(peak, 0, "W")}</div>`;
  }

  #calendar(month: DailyValue[]) {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const offset = (first.getDay() + 6) % 7; // Monday first
    const byDate = new Map(month.map((d) => [d.date, d.kwh]));
    const max = Math.max(0.1, ...month.map((d) => d.kwh));
    const today = localDate(now);
    const weekdays = Array.from({ length: 7 }, (_, i) =>
      new Intl.DateTimeFormat(this.ctx.locale, { weekday: "narrow" }).format(new Date(2024, 0, 1 + i)),
    );
    const cells = [];
    for (let i = 0; i < offset; i++) cells.push(html`<span></span>`);
    for (let day = 1; day <= daysInMonth; day++) {
      const date = localDate(new Date(now.getFullYear(), now.getMonth(), day));
      const kwh = byDate.get(date);
      const level = kwh === undefined ? -1 : Math.min(4, Math.ceil((kwh / max) * 4));
      cells.push(
        html`<span
          class="day l${level} ${date === today ? "today" : ""}"
          title=${kwh !== undefined ? this.#fmt(kwh, 1, "kWh") : ""}
          >${day}</span
        >`,
      );
    }
    return html`<div class="cal-head">${weekdays.map((w) => html`<span>${w}</span>`)}</div>
      <div class="cal">${cells}</div>`;
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
    const rec = this._rec;
    const todayKwh = rec?.today ?? null;
    const amort = amortisation(Number.isNaN(live.total ?? NaN) ? null : live.total, cfg);
    const maxConsumer = Math.max(1, ...live.consumers.map((c) => c.watts ?? 0));
    return html`<h1>${t("energy.title")}</h1>
      <div class="layout">
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

        <section class="card flowcard">
          <div class="label">${t("energy.flow")}</div>
          ${this.#flow(live)}
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
            <b>${this.#money(todayKwh !== null && cfg.price ? todayKwh * cfg.price : null)}</b
            ><span>${t("energy.earned_today")}</span>
          </div>
          <div>
            <b>${this.#fmt(todayKwh !== null && cfg.co2PerKwh ? todayKwh * cfg.co2PerKwh : null, 2, "kg")}</b
            ><span>${t("energy.co2")}</span>
          </div>
          <div>
            <b>${live.efficiency !== null ? this.#fmt(live.efficiency * 100, 0, "%") : "—"}</b
            ><span>${t("energy.efficiency")}</span>
          </div>
          ${live.temp !== null ? html`<div><b>${this.#fmt(live.temp, 0, "°C")}</b><span>${t("energy.inverter")}</span></div>` : nothing}
          ${live.frequency !== null ? html`<div><b>${this.#fmt(live.frequency, 2, "Hz")}</b><span>${t("energy.frequency")}</span></div>` : nothing}
        </section>

        <section class="card">
          <div class="label">${t("energy.today_curve")}</div>
          ${rec ? this.#dayCurve(rec.history, cfg) : html`<div class="loading"></div>`}
        </section>

        <section class="card">
          <div class="row-head">
            <span class="label"
              >${new Intl.DateTimeFormat(this.ctx.locale, { month: "long" }).format(new Date())} · kWh</span
            >
            <span class="label">${this.#fmt(rec?.monthTotal ?? null, 1, "kWh")}</span>
          </div>
          ${rec ? this.#calendar(rec.month) : html`<div class="loading"></div>`}
          <div class="totals">
            <div><b>${this.#fmt(rec?.week ?? null, 1)}</b><span>${t("energy.week")}</span></div>
            <div><b>${this.#fmt(rec?.monthTotal ?? null, 1)}</b><span>${t("energy.month")}</span></div>
            <div><b>${this.#fmt(rec?.year ?? null, 0)}</b><span>${t("energy.year")}</span></div>
          </div>
        </section>

        ${
          live.consumers.length
            ? html`<section class="card">
                <div class="row-head">
                  <span class="label">${t("energy.consumers")}</span>
                  <span class="label"
                    >${this.#fmt(
                      live.consumers.reduce((s, c) => s + (c.watts ?? 0), 0),
                      0,
                      "W",
                    )}</span
                  >
                </div>
                <div class="consumers">
                  ${repeat(
                    live.consumers,
                    (c) => c.id,
                    (c) =>
                      html`<div class="consumer">
                        <div class="c-top">
                          <span>${c.name}</span><span>${this.#fmt(c.watts, 0, "W")}</span>
                        </div>
                        <div class="c-bar">
                          <span style="width: ${((c.watts ?? 0) / maxConsumer) * 100}%"></span>
                        </div>
                        ${
                          rec?.consumersToday[c.id] !== undefined
                            ? html`<div class="c-sub">
                                ${this.#fmt(rec.consumersToday[c.id] ?? 0, 2, "kWh")}
                                ${t("energy.today").toLowerCase()}
                              </div>`
                            : nothing
                        }
                      </div>`,
                  )}
                </div>
              </section>`
            : nothing
        }
        ${
          amort
            ? html`<section class="card">
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
                        ${new Intl.DateTimeFormat(this.ctx.locale, { month: "long", year: "numeric" }).format(new Date(amort.paybackDate))}`
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
      .layout {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 12px;
      }
      @media (min-width: 900px) {
        .layout {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .wide {
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
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
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
      .flowchart {
        width: 100%;
        height: auto;
        max-height: 240px;
      }
      .node {
        fill: var(--a-s3);
      }
      .node.out {
        fill: var(--a-sage);
      }
      .flowchart text {
        text-anchor: middle;
        font-family: var(--a-font);
        fill: var(--a-text);
      }
      .flowchart .v {
        font-size: 16px;
        font-weight: 600;
      }
      .flowchart .v.small {
        font-size: 13px;
      }
      .flowchart .n {
        font-size: 12px;
        fill: var(--a-text2);
      }
      .flowchart .light {
        fill: #fff;
      }
      .flow {
        fill: none;
        stroke: var(--a-s3);
        stroke-width: 3;
        stroke-linecap: round;
      }
      .flow.on {
        stroke-dasharray: 2 10;
        animation: dash linear infinite;
      }
      .flow.pv.on {
        stroke: var(--a-ocher);
      }
      .flow.ac.on {
        stroke: var(--a-sage);
      }
      @keyframes dash {
        to {
          stroke-dashoffset: -24;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .flow.on {
          animation: none;
        }
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
    `,
  ];
}
