// Schedule helpers (schedule.*): the week at a glance with a "now" line, the
// next change, and for admins an editor for the time ranges of each day.

import { css, html, nothing, type PropertyValues } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { SelectorController } from "../../data/entity-store";
import type { MessageKey } from "../../i18n";
import { WidgetBase } from "../base";
import { widgetStyles } from "../styles";

export const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
export type Day = (typeof DAYS)[number];

export interface Range {
  from: string;
  to: string;
}

export interface ScheduleConfig extends Partial<Record<Day, Range[]>> {
  id: string;
  name: string;
  icon?: string;
}

const minutes = (hhmm: string) => {
  const [h = "0", m = "0"] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
};

/** "07:00:00" → "07:00" for time inputs, and back. */
export const short = (t: string) => t.slice(0, 5);
export const long = (t: string) => (t.length === 5 ? `${t}:00` : t);

/** The payload for schedule/update: all days, ranges sorted and without empty ones. */
export function updatePayload(cfg: ScheduleConfig): { type: string; [key: string]: unknown } {
  const days = Object.fromEntries(
    DAYS.map((d) => [
      d,
      (cfg[d] ?? [])
        .filter((r) => r.from && r.to && minutes(r.to) > minutes(r.from))
        .map((r) => ({ from: long(r.from), to: long(r.to) }))
        .sort((a, b) => minutes(a.from) - minutes(b.from)),
    ]),
  );
  return {
    type: "schedule/update",
    schedule_id: cfg.id,
    name: cfg.name,
    ...(cfg.icon ? { icon: cfg.icon } : {}),
    ...days,
  };
}

const DEMO: ScheduleConfig[] = [
  {
    id: "demo_living",
    name: "Heizung Wohnen",
    monday: [
      { from: "06:30", to: "08:00" },
      { from: "16:00", to: "22:00" },
    ],
    tuesday: [
      { from: "06:30", to: "08:00" },
      { from: "16:00", to: "22:00" },
    ],
    wednesday: [
      { from: "06:30", to: "08:00" },
      { from: "16:00", to: "22:00" },
    ],
    thursday: [
      { from: "06:30", to: "08:00" },
      { from: "16:00", to: "22:00" },
    ],
    friday: [
      { from: "06:30", to: "08:00" },
      { from: "16:00", to: "23:00" },
    ],
    saturday: [{ from: "08:00", to: "23:00" }],
    sunday: [{ from: "08:00", to: "22:00" }],
  },
];

export class AtriumSchedulesWidget extends WidgetBase {
  static override properties = {
    ...WidgetBase.properties,
    _configs: { state: true },
    _edit: { state: true },
    _saving: { state: true },
  };
  declare _configs: ScheduleConfig[] | null;
  /** Copy being edited. */
  declare _edit: ScheduleConfig | null;
  declare _saving: boolean;
  #loaded = false;

  #states = new SelectorController(
    this,
    () => this.ctx?.store,
    (hass) =>
      Object.keys(hass.states)
        .filter((id) => id.startsWith("schedule."))
        .map((id) => ({
          id,
          on: hass.states[id]?.state === "on",
          next: String(hass.states[id]?.attributes.next_event ?? ""),
          name: String(hass.states[id]?.attributes.friendly_name ?? id),
        })),
  );

  constructor() {
    super();
    this._configs = null;
    this._edit = null;
    this._saving = false;
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    this.#states.attach();
    if (this.demo) {
      this._configs ??= DEMO;
      return;
    }
    if (!this.#loaded && changed.has("ctx") && this.ctx?.store.hass) {
      this.#loaded = true;
      void this.#load();
    }
  }

  async #load(): Promise<void> {
    try {
      this._configs = (await this.ctx.store.hass?.callWS<ScheduleConfig[]>({ type: "schedule/list" })) ?? [];
    } catch {
      this._configs = []; // not allowed or no schedules: show states only
    }
  }

  async #save(): Promise<void> {
    const edit = this._edit;
    if (!edit) return;
    if (this.demo) {
      this._configs = (this._configs ?? []).map((c) => (c.id === edit.id ? edit : c));
      this._edit = null;
      return;
    }
    this._saving = true;
    try {
      await this.ctx.store.hass?.callWS(updatePayload(edit));
      await this.#load();
      this._edit = null;
    } finally {
      this._saving = false;
    }
  }

  #setRange(day: Day, i: number, key: keyof Range, value: string): void {
    if (!this._edit) return;
    const ranges = [...(this._edit[day] ?? [])];
    const r = ranges[i];
    if (!r) return;
    ranges[i] = { ...r, [key]: value };
    this._edit = { ...this._edit, [day]: ranges };
  }

  #week(cfg: ScheduleConfig, now: Date) {
    const today = (now.getDay() + 6) % 7;
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const { t } = this.ctx;
    return html`<div class="week">
      ${DAYS.map(
        (d, i) =>
          html`<div class="day ${i === today ? "today" : ""}">
            <span class="dn">${t(`day.${d}` as MessageKey)}</span>
            <span class="track">
              ${(cfg[d] ?? []).map((r) => {
                const a = minutes(r.from);
                const b = minutes(r.to) || 1440;
                return html`<span
                  class="block"
                  style="left:${(a / 1440) * 100}%;width:${((b - a) / 1440) * 100}%"
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

  #editor() {
    const e = this._edit;
    if (!e) return nothing;
    const { t } = this.ctx;
    return html`<div class="editor">
      <div class="eh">
        <b>${e.name}</b>
        <button type="button" class="ghost" @click=${() => (this._edit = null)}>${t("w.cancel")}</button>
        <button type="button" class="primary" ?disabled=${this._saving} @click=${() => void this.#save()}>
          ${t("w.save")}
        </button>
      </div>
      ${DAYS.map(
        (d) =>
          html`<div class="erow">
            <span class="dn">${t(`day.${d}` as MessageKey)}</span>
            <div class="ranges">
              ${(e[d] ?? []).map(
                (r, i) =>
                  html`<span class="range">
                    <input
                      type="time"
                      .value=${short(r.from)}
                      @change=${(ev: Event) => this.#setRange(d, i, "from", (ev.target as HTMLInputElement).value)}
                      aria-label=${t("w.from")}
                    />
                    –
                    <input
                      type="time"
                      .value=${short(r.to)}
                      @change=${(ev: Event) => this.#setRange(d, i, "to", (ev.target as HTMLInputElement).value)}
                      aria-label=${t("w.to")}
                    />
                    <button
                      type="button"
                      class="x"
                      aria-label=${t("w.remove")}
                      @click=${() => (this._edit = { ...e, [d]: (e[d] ?? []).filter((_, j) => j !== i) })}
                    >
                      ×
                    </button>
                  </span>`,
              )}
              <button
                type="button"
                class="ghost small"
                @click=${() => (this._edit = { ...e, [d]: [...(e[d] ?? []), { from: "07:00", to: "22:00" }] })}
              >
                +
              </button>
            </div>
            <button
              type="button"
              class="ghost small"
              title=${t("w.copy_all")}
              @click=${() => (this._edit = { ...e, ...Object.fromEntries(DAYS.map((x) => [x, (e[d] ?? []).map((r) => ({ ...r }))])) })}
            >
              ${t("w.copy_all")}
            </button>
          </div>`,
      )}
    </div>`;
  }

  protected override render() {
    if (!this.ctx) return nothing;
    const { t, locale, isAdmin } = this.ctx;
    const states = this.demo
      ? [
          {
            id: "schedule.demo_living",
            on: true,
            next: new Date(Date.now() + 3 * 3600000).toISOString(),
            name: "Heizung Wohnen",
          },
        ]
      : (this.#states.value ?? []);
    if (!states.length)
      return this.ctx.editing
        ? html`<div class="w missing">
            ${this.renderHead()}
            <p class="empty">${t("w.not_found")}</p>
          </div>`
        : nothing;
    const configs = this._configs ?? [];
    const now = new Date();
    const time = (iso: string) =>
      iso
        ? new Intl.DateTimeFormat(locale, { weekday: "short", hour: "2-digit", minute: "2-digit" }).format(
            new Date(iso),
          )
        : "—";
    return html`<div class="w">
      ${this.renderHead()}
      ${
        this._edit
          ? this.#editor()
          : repeat(
              states,
              (s) => s.id,
              (s) => {
                const cfg = configs.find((c) => `schedule.${c.id}` === s.id);
                return html`<div class="sched">
                  <div class="sh">
                    <span class="dot ${s.on ? "ok" : ""}"></span>
                    <button type="button" class="sn" @click=${() => this.moreInfo(s.id)}>${s.name}</button>
                    <span class="next">${s.on ? t("w.on_until") : t("w.off_until")} ${time(s.next)}</span>
                    ${cfg && (isAdmin || this.demo) ? html`<button type="button" class="ghost small" @click=${() => (this._edit = structuredClone(cfg))}>${t("w.edit")}</button>` : nothing}
                  </div>
                  ${cfg ? this.#week(cfg, now) : nothing}
                </div>`;
              },
            )
      }
    </div>`;
  }

  static override styles = [
    widgetStyles,
    css`
      .sched {
        display: flex;
        flex-direction: column;
        gap: 8px;
        background: var(--a-s2);
        border-radius: var(--a-radius);
        padding: 10px 12px;
      }
      .sh {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .sn {
        all: unset;
        flex: 1;
        min-width: 120px;
        font-weight: 600;
        font-size: 15px;
        cursor: pointer;
      }
      .next {
        font-size: 12px;
        color: var(--a-text2);
      }
      .week {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      .day {
        display: grid;
        grid-template-columns: 28px minmax(0, 1fr);
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
      .block {
        position: absolute;
        top: 0;
        bottom: 0;
        background: var(--a-ocher);
        border-radius: 5px;
        transform-origin: left;
        animation: grow calc(var(--a-motion, 1) * 600ms) cubic-bezier(0.2, 0.9, 0.25, 1);
      }
      .today .track {
        height: 14px;
        border-radius: 7px;
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
      .editor {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .eh {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .eh b {
        flex: 1;
        font-size: 16px;
      }
      .erow {
        display: grid;
        grid-template-columns: 28px minmax(0, 1fr) auto;
        gap: 8px;
        align-items: center;
        background: var(--a-s2);
        border-radius: var(--a-radius);
        padding: 6px 8px;
      }
      .ranges {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: center;
      }
      .range {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        background: var(--a-s3);
        border-radius: 6px;
        padding: 2px 4px;
      }
      input[type="time"] {
        border: 0;
        background: transparent;
        color: var(--a-text);
        font: inherit;
        font-size: 14px;
        min-height: 32px;
      }
      button.primary,
      button.ghost,
      button.x {
        border: 0;
        border-radius: 6px;
        font: inherit;
        font-weight: 600;
        cursor: pointer;
        min-height: 36px;
        padding: 0 12px;
      }
      .primary {
        background: var(--a-ocher);
        color: var(--a-on-ocher);
      }
      .ghost {
        background: var(--a-s3);
        color: var(--a-text);
      }
      .small {
        min-height: 30px !important;
        padding: 0 10px !important;
        font-size: 12px;
      }
      .x {
        background: none;
        color: var(--a-text2);
        padding: 0 6px !important;
        min-height: 28px !important;
      }
      @keyframes grow {
        from {
          transform: scaleX(0);
        }
      }
    `,
  ];
}
