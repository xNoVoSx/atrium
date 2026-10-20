import { LitElement, css, html, nothing } from "lit";
import { DAYS, short, type Day, type Range, type ScheduleConfig } from "../data/schedules";
import type { MessageKey, Translate } from "../i18n";

const WEEKDAYS: readonly Day[] = DAYS.slice(0, 5);

/**
 * Time ranges of a schedule helper, day by day. Works on a copy; fires
 * `atrium-schedule-save` (detail: the changed config) or `atrium-schedule-cancel`.
 */
export class AtriumScheduleEditor extends LitElement {
  static override properties = {
    t: { attribute: false },
    config: { attribute: false },
    heading: {},
    saving: { type: Boolean },
    _edit: { state: true },
  };

  declare t: Translate;
  declare config: ScheduleConfig;
  /** Shown instead of the schedule's own name. */
  declare heading: string;
  declare saving: boolean;
  declare _edit: ScheduleConfig | null;

  constructor() {
    super();
    this.heading = "";
    this.saving = false;
    this._edit = null;
  }

  protected override willUpdate(changed: Map<PropertyKey, unknown>): void {
    if (changed.has("config")) this._edit = this.config ? structuredClone(this.config) : null;
  }

  #setRange(day: Day, i: number, key: keyof Range, value: string): void {
    const e = this._edit;
    const ranges = [...(e?.[day] ?? [])];
    const r = ranges[i];
    if (!e || !r) return;
    ranges[i] = { ...r, [key]: value };
    this._edit = { ...e, [day]: ranges };
  }

  #copy(from: Day, to: readonly Day[]): void {
    const e = this._edit;
    if (!e) return;
    this._edit = { ...e, ...Object.fromEntries(to.map((d) => [d, (e[from] ?? []).map((r) => ({ ...r }))])) };
  }

  #fire(name: string, detail?: ScheduleConfig): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  protected override render() {
    const e = this._edit;
    if (!e) return nothing;
    const t = this.t;
    return html`<div class="eh">
        <b>${this.heading || e.name}</b>
        <button type="button" class="ghost" @click=${() => this.#fire("atrium-schedule-cancel")}>
          ${t("w.cancel")}
        </button>
        <button
          type="button"
          class="primary"
          ?disabled=${this.saving}
          @click=${() => this.#fire("atrium-schedule-save", this._edit ?? undefined)}
        >
          ${t("w.save")}
        </button>
      </div>
      ${DAYS.map(
        (d) =>
          html`<div class="erow" data-day=${d}>
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
                aria-label=${t("w.add_range")}
                @click=${() => (this._edit = { ...e, [d]: [...(e[d] ?? []), { from: "07:00", to: "22:00" }] })}
              >
                +
              </button>
            </div>
            <span class="copy">
              ${
                WEEKDAYS.includes(d)
                  ? html`<button
                      type="button"
                      class="ghost small"
                      data-copy="weekdays"
                      @click=${() => this.#copy(d, WEEKDAYS)}
                    >
                      ${t("w.copy_weekdays")}
                    </button>`
                  : nothing
              }
              <button type="button" class="ghost small" data-copy="all" @click=${() => this.#copy(d, DAYS)}>
                ${t("w.copy_all")}
              </button>
            </span>
          </div>`,
      )}`;
  }

  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      gap: 8px;
      font-family: var(--a-font);
      color: var(--a-text);
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
    .dn {
      font-size: 11px;
      font-weight: 600;
      color: var(--a-text2);
    }
    .ranges,
    .copy {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
    }
    .copy {
      justify-content: flex-end;
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
    button {
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
      min-height: 30px;
      padding: 0 10px;
      font-size: 12px;
    }
    .x {
      background: none;
      color: var(--a-text2);
      padding: 0 6px;
      min-height: 28px;
    }
    button:focus-visible,
    input:focus-visible {
      outline: 2px solid var(--a-ocher);
      outline-offset: 2px;
    }
    @media (max-width: 520px) {
      .erow {
        grid-template-columns: 28px minmax(0, 1fr);
      }
      .copy {
        grid-column: 2;
        justify-content: flex-start;
      }
    }
  `;
}
