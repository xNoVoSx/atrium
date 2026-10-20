// The heating program: per zone the level in force (comfort, night …), when it
// changes, the week as coloured stretches and the temperature of every level.
// Admins change temperatures and times; they are Home Assistant helpers, so the
// household's own automation keeps applying them to the thermostats.

import { css, html, nothing, type PropertyValues } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { icon } from "../../components/icon";
import { SelectorController } from "../../data/entity-store";
import {
  currentLevel,
  daySegments,
  heatingToggles,
  heatingZones,
  levelName,
  levelTemp,
  nextChange,
  type HeatingZone,
  type Segment,
} from "../../data/heating";
import { nameOf } from "../../data/registry";
import {
  DAYS,
  dayIndex,
  loadSchedules,
  updatePayload,
  type ScheduleConfig,
  type Schedules,
} from "../../data/schedules";
import type { MessageKey } from "../../i18n";
import type { HomeAssistant } from "../../types/hass";
import { ICONS } from "../../theme/shared";
import { formatTemperature } from "../../util/format";
import { WidgetBase } from "../base";
import { widgetStyles } from "../styles";

interface LevelView {
  name: string;
  temp: number | null;
  entity: string;
  step: number;
  min: number;
  max: number;
  schedule?: string;
}

interface ThermostatView {
  id: string;
  name: string;
  target: number | null;
  off: boolean;
}

export interface ZoneView {
  id: string;
  name: string;
  levels: LevelView[];
  current: number;
  next: { at: Date; level: number } | null;
  /** Monday first; empty when the schedules' weeks are not known. */
  week: Segment[][];
  thermostats: ThermostatView[];
}

function zoneView(hass: HomeAssistant, zone: HeatingZone, schedules: Schedules, now: Date): ZoneView {
  const known = zone.levels.every((l) => !l.schedule || schedules.has(l.schedule));
  return {
    id: zone.id,
    name: zone.name,
    levels: zone.levels.map((l) => {
      const a = hass.states[l.temp]?.attributes ?? {};
      return {
        name: levelName(hass, zone, l),
        temp: levelTemp(hass, l),
        entity: l.temp,
        step: Number(a.step) || 0.5,
        min: Number(a.min ?? 5),
        max: Number(a.max ?? 30),
        ...(l.schedule ? { schedule: l.schedule } : {}),
      };
    }),
    current: currentLevel(hass, zone),
    next: known ? nextChange(zone, schedules, now) : null,
    week: known ? DAYS.map((d) => daySegments(zone, schedules, d)) : [],
    thermostats: zone.thermostats
      .filter((id) => hass.states[id] && hass.states[id]?.state !== "unavailable")
      .map((id) => {
        const s = hass.states[id];
        const target = Number(s?.attributes.temperature);
        return {
          id,
          name: nameOf(hass, id),
          target: Number.isFinite(target) ? target : null,
          off: s?.state === "off",
        };
      }),
  };
}

const demoWeek = (comfort: Array<[number, number]>): Segment[] => {
  const out: Segment[] = [];
  let at = 0;
  for (const [from, to] of comfort) {
    if (from > at) out.push({ from: at, to: from, level: 1 });
    out.push({ from, to, level: 0 });
    at = to;
  }
  if (at < 1440) out.push({ from: at, to: 1440, level: 1 });
  return out;
};

function demoZones(now: Date): ZoneView[] {
  const work = demoWeek([
    [390, 480],
    [960, 1320],
  ]);
  const free = demoWeek([[480, 1380]]);
  const level = (name: string, temp: number, schedule?: string): LevelView => ({
    name,
    temp,
    entity: `input_number.demo_${name}`,
    step: 0.5,
    min: 5,
    max: 25,
    ...(schedule ? { schedule } : {}),
  });
  const next = new Date(now);
  next.setHours(22, 0, 0, 0);
  return [
    {
      id: "demo_living",
      name: "Wohnen",
      levels: [level("Komfort", 21, "schedule.demo"), level("Nacht", 17)],
      current: 0,
      next: { at: next, level: 1 },
      week: [work, work, work, work, work, free, free],
      thermostats: [],
    },
  ];
}

export class AtriumHeatingProgramWidget extends WidgetBase {
  static override properties = {
    ...WidgetBase.properties,
    _schedules: { state: true },
    _edit: { state: true },
    _saving: { state: true },
    _pending: { state: true },
  };
  declare _schedules: Schedules | null;
  /** Schedule being edited and the heading to show. */
  declare _edit: { config: ScheduleConfig; heading: string } | null;
  declare _saving: boolean;
  /** Temperatures changed here and not yet confirmed by Home Assistant. */
  declare _pending: Record<string, number>;
  #loaded = false;
  #timers = new Map<string, number>();

  // Re-render when anything the program shows changes.
  #watch = new SelectorController(
    this,
    () => this.ctx?.store,
    (hass) => {
      const zones = heatingZones(hass, this.ctx.layout);
      const ids = [
        ...zones.flatMap((z) => [...z.levels.flatMap((l) => [l.temp, l.schedule ?? ""]), ...z.thermostats]),
        ...heatingToggles(hass, this.ctx.layout),
      ];
      return ids.map((id) => {
        const s = hass.states[id];
        return `${id}=${s?.state}/${s?.attributes.temperature ?? ""}`;
      });
    },
  );

  constructor() {
    super();
    this._schedules = null;
    this._edit = null;
    this._saving = false;
    this._pending = {};
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    for (const t of this.#timers.values()) clearTimeout(t);
    this.#timers.clear();
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    this.#watch.attach();
    if (!this.demo && !this.#loaded && changed.has("ctx") && this.ctx?.store.hass) {
      this.#loaded = true;
      void this.#load();
    }
  }

  async #load(): Promise<void> {
    const hass = this.ctx.store.rawHass;
    try {
      this._schedules = hass ? await loadSchedules(hass) : new Map();
    } catch {
      this._schedules = new Map(); // weeks unknown: current level only
    }
  }

  get #canEdit(): boolean {
    return this.ctx.isAdmin || this.demo;
  }

  /** −/+ on a level: shown at once, sent after a short pause so a few taps make one change. */
  #step(level: LevelView, delta: -1 | 1): void {
    const base = this._pending[level.entity] ?? level.temp ?? level.min;
    const value = Math.min(level.max, Math.max(level.min, Math.round((base + delta * level.step) * 10) / 10));
    this._pending = { ...this._pending, [level.entity]: value };
    if (this.demo) return;
    clearTimeout(this.#timers.get(level.entity));
    this.#timers.set(
      level.entity,
      window.setTimeout(() => {
        this.#timers.delete(level.entity);
        const domain = level.entity.split(".")[0] ?? "input_number";
        void this.ctx.store.hass
          ?.callService(domain, "set_value", { entity_id: level.entity, value })
          .finally(() => {
            this._pending = Object.fromEntries(
              Object.entries(this._pending).filter(([id]) => id !== level.entity),
            );
          });
      }, 900),
    );
  }

  async #save(config: ScheduleConfig | undefined): Promise<void> {
    if (!config) return;
    if (this.demo) {
      this._edit = null;
      return;
    }
    this._saving = true;
    try {
      await this.ctx.store.hass?.callWS(updatePayload(config));
      await this.#load();
      this._edit = null;
    } finally {
      this._saving = false;
    }
  }

  #openEditor(zone: ZoneView, level: LevelView): void {
    const config = this.demo
      ? { id: "demo", name: level.name, monday: [{ from: "06:30", to: "08:00" }] }
      : level.schedule && this._schedules?.get(level.schedule);
    if (config) this._edit = { config, heading: `${zone.name} · ${level.name}` };
  }

  #time(d: Date): string {
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    return new Intl.DateTimeFormat(this.ctx.locale, {
      ...(sameDay ? {} : { weekday: "short" }),
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  }

  #temp(v: number | null): string {
    return formatTemperature(v, this.ctx.locale);
  }

  #toggles(hass: HomeAssistant | undefined) {
    if (!hass || this.demo) return nothing;
    const list = heatingToggles(hass, this.ctx.layout).filter((id) => hass.states[id]);
    if (!list.length) return nothing;
    const edit = this.#canEdit;
    return html`<div class="toggles">
      ${list.map((id) => {
        const on = hass.states[id]?.state === "on";
        return html`<button
          type="button"
          class="tg ${on ? "on" : ""}"
          data-toggle=${id}
          aria-pressed=${String(on)}
          ?disabled=${!edit}
          title=${edit ? "" : this.ctx.t("heat.admin_only")}
          @click=${() => this.toggle(id)}
        >
          <span class="dot"></span>${nameOf(hass, id)}
        </button>`;
      })}
    </div>`;
  }

  #week(z: ZoneView) {
    // Without schedules the week is one colour: nothing to see.
    if (!z.week.length || !z.levels.some((l) => l.schedule)) return nothing;
    const now = new Date();
    const today = dayIndex(now);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const { t } = this.ctx;
    const defaultLevel = z.levels.findIndex((l) => !l.schedule);
    return html`<div class="week">
      ${z.week.map((segs, i) =>
        this.variant === "today" && i !== today
          ? nothing
          : html`<div class="day ${i === today ? "today" : ""}">
              <span class="dn">${t(`day.${DAYS[i]}` as MessageKey)}</span>
              <span class="track">
                ${segs.map((s) => {
                  const lv = z.levels[s.level];
                  return html`<span
                    class="seg"
                    data-level=${s.level === defaultLevel ? "base" : String(s.level)}
                    style="left:${(s.from / 1440) * 100}%;width:${((s.to - s.from) / 1440) * 100}%"
                    title=${lv ? `${lv.name} ${this.#temp(this._pending[lv.entity] ?? lv.temp)}` : ""}
                  ></span>`;
                })}
                ${i === today ? html`<span class="now" style="left:${(nowMin / 1440) * 100}%"></span>` : nothing}
              </span>
            </div>`,
      )}
      <div class="day hours">
        <span class="dn"></span
        ><span class="scale"><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span></span>
      </div>
    </div>`;
  }

  #zone(z: ZoneView) {
    const { t } = this.ctx;
    const cur = z.levels[z.current];
    const next = z.next ? z.levels[z.next.level] : undefined;
    const defaultLevel = z.levels.findIndex((l) => !l.schedule);
    const tempOf = (l: LevelView | undefined) => (l ? (this._pending[l.entity] ?? l.temp) : null);
    const off = z.thermostats.length > 0 && z.thermostats.every((th) => th.off);
    const want = tempOf(cur);
    const astray = z.thermostats.filter(
      (th) => !th.off && want !== null && th.target !== null && th.target !== want,
    );
    const compact = this.variant === "compact";
    return html`<div class="zone" data-zone=${z.id}>
      <div class="zh">
        <span class="zn">${z.name}</span>
        <span class="now-level" data-level=${z.current === defaultLevel ? "base" : String(z.current)}>
          ${cur ? html`${cur.name} <b>${this.#temp(tempOf(cur))}</b>` : t("heat.no_program")}
        </span>
      </div>
      <div class="sub">
        ${off ? html`<span class="warn">${t("heat.all_off")}</span> · ` : nothing}
        ${
          z.next && next
            ? html`${t("heat.until")} ${this.#time(z.next.at)} · ${t("heat.then")} ${next.name}
              ${this.#temp(tempOf(next))}`
            : nothing
        }
      </div>
      ${compact ? nothing : this.#week(z)}
      <div class="levels">
        ${z.levels.map(
          (l, i) =>
            html`<div class="level" data-entity=${l.entity}>
              <span class="sw" data-level=${i === defaultLevel ? "base" : String(i)}></span>
              <span class="ln">${l.name}</span>
              ${
                this.#canEdit
                  ? html`<span class="step">
                      <button
                        type="button"
                        aria-label=${`${l.name} ${t("climate.colder")}`}
                        @click=${() => this.#step(l, -1)}
                      >
                        ${icon(ICONS.minus, 16, 2.2)}
                      </button>
                      <span class="lt">${this.#temp(tempOf(l))}</span>
                      <button
                        type="button"
                        class="plus"
                        aria-label=${`${l.name} ${t("climate.warmer")}`}
                        @click=${() => this.#step(l, 1)}
                      >
                        ${icon(ICONS.plus, 16, 2.2)}
                      </button>
                    </span>`
                  : html`<span class="lt">${this.#temp(tempOf(l))}</span>`
              }
              ${
                this.#canEdit && l.schedule && !compact
                  ? html`<button
                      type="button"
                      class="ghost small"
                      data-times=${l.schedule}
                      @click=${() => this.#openEditor(z, l)}
                    >
                      ${t("heat.times")}
                    </button>`
                  : nothing
              }
            </div>`,
        )}
      </div>
      ${
        astray.length
          ? html`<div class="astray">
              ${astray.map(
                (th) =>
                  html`<button type="button" class="chip" @click=${() => this.#openThermostat(th.id)}>
                    ${th.name}: ${this.#temp(th.target)} ${t("heat.instead_of")} ${this.#temp(want)}
                  </button>`,
              )}
            </div>`
          : nothing
      }
    </div>`;
  }

  #openThermostat(id: string): void {
    this.dispatchEvent(
      new CustomEvent("atrium-more-info", { detail: { entityId: id }, bubbles: true, composed: true }),
    );
  }

  protected override render() {
    if (!this.ctx) return nothing;
    const { t } = this.ctx;
    const hass = this.ctx.store.hass;
    const now = new Date();
    const schedules = this._schedules ?? new Map();
    const zones = this.demo
      ? demoZones(now)
      : hass
        ? heatingZones(hass, this.ctx.layout)
            .filter((z) => z.levels.length)
            .map((z) => zoneView(hass, z, schedules, now))
        : [];
    if (!zones.length)
      return this.ctx.editing
        ? html`<div class="w missing">
            ${this.renderHead()}
            <p class="empty">${t("heat.none")}</p>
          </div>`
        : nothing;
    return html`<div class="w">
      ${this.renderHead()}
      ${
        this._edit
          ? html`<atrium-schedule-editor
              .t=${t}
              .config=${this._edit.config}
              .heading=${this._edit.heading}
              ?saving=${this._saving}
              @atrium-schedule-cancel=${() => (this._edit = null)}
              @atrium-schedule-save=${(ev: CustomEvent<ScheduleConfig>) => void this.#save(ev.detail)}
            ></atrium-schedule-editor>`
          : html`${this.#toggles(hass)}
              <div class="zones">
                ${repeat(
                  zones,
                  (z) => z.id,
                  (z) => this.#zone(z),
                )}
              </div>
              ${this.#canEdit ? html`<p class="hint">${t("heat.hint")}</p>` : nothing}`
      }
    </div>`;
  }

  static override styles = [
    widgetStyles,
    css`
      :host {
        --lvl-0: var(--a-ocher);
        --lvl-1: color-mix(in srgb, var(--a-ocher) 55%, var(--a-s3));
        --lvl-2: color-mix(in srgb, var(--a-ocher) 30%, var(--a-s3));
        --lvl-base: color-mix(in srgb, #3e5c7a 55%, var(--a-s3));
      }
      [data-level="0"] {
        --lvl: var(--lvl-0);
      }
      [data-level="1"] {
        --lvl: var(--lvl-1);
      }
      [data-level="2"],
      [data-level="3"] {
        --lvl: var(--lvl-2);
      }
      [data-level="base"] {
        --lvl: var(--lvl-base);
      }
      .toggles {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .tg {
        all: unset;
        box-sizing: border-box;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 36px;
        padding: 0 12px;
        border-radius: 18px;
        background: var(--a-s2);
        font-size: 13px;
        font-weight: 600;
      }
      .tg:disabled {
        cursor: default;
      }
      .tg .dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--a-text3);
      }
      .tg.on .dot {
        background: var(--a-ocher);
      }
      .zones {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
        gap: 10px;
      }
      .zone {
        background: var(--a-s2);
        border-radius: var(--a-radius);
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 0;
      }
      .zh {
        display: flex;
        align-items: baseline;
        gap: 8px;
        flex-wrap: wrap;
      }
      .zn {
        flex: 1;
        font-size: 16px;
        font-weight: 600;
      }
      .now-level {
        font-size: 13px;
        padding: 3px 10px;
        border-radius: 12px;
        background: var(--lvl);
        color: var(--a-text);
      }
      .now-level[data-level="0"] {
        color: var(--a-on-ocher);
      }
      .now-level b {
        font-size: 15px;
      }
      .sub {
        font-size: 12px;
        color: var(--a-text2);
        min-height: 1em;
      }
      .warn {
        color: var(--a-terracotta, #a4533a);
        font-weight: 600;
      }
      .week {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      .day {
        display: grid;
        grid-template-columns: 26px minmax(0, 1fr);
        gap: 8px;
        align-items: center;
      }
      .dn {
        font-size: 11px;
        font-weight: 600;
        color: var(--a-text3);
      }
      .today .dn {
        color: var(--a-text);
      }
      .track {
        position: relative;
        height: 10px;
        border-radius: 5px;
        background: var(--a-s3);
        overflow: hidden;
      }
      .today .track {
        height: 14px;
        border-radius: 7px;
      }
      .seg {
        position: absolute;
        top: 0;
        bottom: 0;
        background: var(--lvl);
        transform-origin: left;
        animation: grow calc(var(--a-motion, 1) * 600ms) cubic-bezier(0.2, 0.9, 0.25, 1);
      }
      .now {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 2px;
        margin-left: -1px;
        background: var(--a-text);
      }
      .scale {
        display: flex;
        justify-content: space-between;
        font-size: 10px;
        color: var(--a-text3);
      }
      .levels {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .level {
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 40px;
      }
      .sw {
        width: 12px;
        height: 12px;
        border-radius: 3px;
        background: var(--lvl);
        flex: none;
      }
      .ln {
        flex: 1;
        min-width: 0;
        font-size: 14px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .lt {
        font-size: 15px;
        font-weight: 600;
        min-width: 4.2em;
        text-align: center;
      }
      .step {
        display: inline-flex;
        align-items: center;
        gap: 2px;
      }
      .step button {
        border: 0;
        width: 36px;
        height: 36px;
        border-radius: var(--a-radius);
        background: var(--a-s3);
        color: var(--a-text);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }
      .step .plus {
        background: var(--a-ocher);
        color: var(--a-on-ocher);
      }
      button.ghost {
        border: 0;
        border-radius: 6px;
        font: inherit;
        font-weight: 600;
        cursor: pointer;
        background: var(--a-s3);
        color: var(--a-text);
      }
      .small {
        min-height: 32px;
        padding: 0 10px;
        font-size: 12px;
      }
      .astray {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .chip {
        all: unset;
        cursor: pointer;
        font-size: 12px;
        padding: 4px 10px;
        border-radius: 12px;
        background: color-mix(in srgb, #a4533a 30%, var(--a-s3));
      }
      .hint {
        margin: 0;
        font-size: 12px;
        color: var(--a-text2);
      }
      button:focus-visible {
        outline: 2px solid var(--a-ocher);
        outline-offset: 2px;
      }
      :host([variant="compact"]) .level {
        min-height: 34px;
      }
      @keyframes grow {
        from {
          transform: scaleX(0);
        }
      }
    `,
  ];
}
