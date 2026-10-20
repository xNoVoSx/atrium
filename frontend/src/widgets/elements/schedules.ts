// Schedule helpers (schedule.*): the week at a glance with a "now" line, the
// next change, and for admins an editor for the time ranges of each day.

import { css, html, nothing, type PropertyValues } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { SelectorController } from "../../data/entity-store";
import {
  DAYS,
  endMinutes,
  loadSchedules,
  minutes,
  schedulesByEntity,
  updatePayload,
  type ScheduleConfig,
  type Schedules,
} from "../../data/schedules";
import type { MessageKey } from "../../i18n";
import { WidgetBase } from "../base";
import { widgetStyles } from "../styles";

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
  /** Stored weeks by entity. */
  declare _configs: Schedules | null;
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
      this._configs ??= schedulesByEntity(DEMO, {});
      return;
    }
    if (!this.#loaded && changed.has("ctx") && this.ctx?.store.hass) {
      this.#loaded = true;
      void this.#load();
    }
  }

  async #load(): Promise<void> {
    const hass = this.ctx.store.rawHass;
    try {
      this._configs = hass ? await loadSchedules(hass) : new Map();
    } catch {
      this._configs = new Map(); // not allowed or no schedules: show states only
    }
  }

  async #save(edit: ScheduleConfig | undefined): Promise<void> {
    if (!edit) return;
    if (this.demo) {
      this._configs = new Map(
        [...(this._configs ?? [])].map(([entity, c]) => [entity, c.id === edit.id ? edit : c]),
      );
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

  #week(cfg: ScheduleConfig, now: Date) {
    const today = (now.getDay() + 6) % 7;
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const { t } = this.ctx;
    return html`<div class="week">
      ${DAYS.map((d, i) =>
        this.variant === "today" && i !== today
          ? nothing
          : html`<div class="day ${i === today ? "today" : ""}">
              <span class="dn">${t(`day.${d}` as MessageKey)}</span>
              <span class="track">
                ${(cfg[d] ?? []).map((r) => {
                  const a = minutes(r.from);
                  const b = endMinutes(r.to);
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
    return html`<atrium-schedule-editor
      .t=${this.ctx.t}
      .config=${e}
      ?saving=${this._saving}
      @atrium-schedule-cancel=${() => (this._edit = null)}
      @atrium-schedule-save=${(ev: CustomEvent<ScheduleConfig>) => void this.#save(ev.detail)}
    ></atrium-schedule-editor>`;
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
    const configs = this._configs ?? new Map<string, ScheduleConfig>();
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
                const cfg = configs.get(s.id);
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
        min-height: 30px;
        padding: 0 10px;
        font-size: 12px;
      }
      @keyframes grow {
        from {
          transform: scaleX(0);
        }
      }
    `,
  ];
}
