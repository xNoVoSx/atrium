// Admin settings of the heating: which helpers and thermostats form the
// program's zones, its switches, and the guard that keeps thermostats locked
// and on the household's program (enforced by the integration).

import { LitElement, css, html, nothing } from "lit";
import type { PanelContext } from "../context";
import {
  childLockOf,
  detectToggles,
  detectZones,
  guards,
  heatingLayout,
  heatingToggles,
  heatingZones,
  levelName,
  setGuard,
  setHeating,
  thermostatsFromAutomations,
  type GuardRule,
  type HeatingZone,
  type LockMode,
} from "../data/heating";
import { moveBy } from "../data/layout";
import { nameOf } from "../data/registry";
import type { HomeAssistant } from "../types/hass";
import { moveButtons, settingsStyles, toggle } from "./settings-sections";

const RELOCK_MINUTES = [1, 2, 5, 10, 15, 30, 60, 120];

/** Every automation's config, for finding which thermostats a zone drives (admins only). */
async function automationConfigs(hass: HomeAssistant): Promise<unknown[]> {
  const ids = Object.keys(hass.states).filter((id) => id.startsWith("automation."));
  const results = await Promise.all(
    ids.map((entity_id) =>
      hass
        .callWS<{ config: unknown }>({ type: "automation/config", entity_id })
        .then((r) => r.config)
        .catch(() => null),
    ),
  );
  return results.filter(Boolean);
}

export class AtriumHeatingSettings extends LitElement {
  static override properties = {
    ctx: { attribute: false },
    _busy: { state: true },
  };
  declare ctx: PanelContext;
  declare _busy: boolean;

  constructor() {
    super();
    this._busy = false;
  }

  /** Detect zones from the helpers, thermostats from the automations, and save. */
  async #detect(): Promise<void> {
    const hass = this.ctx.store.rawHass;
    if (!hass) return;
    this._busy = true;
    try {
      const zones = thermostatsFromAutomations(detectZones(hass), await automationConfigs(hass));
      this.ctx.saveLayout(setHeating(this.ctx.layout, { zones, toggles: detectToggles(hass) }));
    } finally {
      this._busy = false;
    }
  }

  #saveZones(zones: HeatingZone[]): void {
    this.ctx.saveLayout(setHeating(this.ctx.layout, { zones }));
  }

  #patchZone(zones: HeatingZone[], id: string, patch: Partial<HeatingZone>): void {
    this.#saveZones(zones.map((z) => (z.id === id ? { ...z, ...patch } : z)));
  }

  #guard(climate: string, patch: Partial<GuardRule>): void {
    this.ctx.saveLayout(setGuard(this.ctx.layout, climate, patch));
  }

  /** Same rule for all thermostats at once. */
  #guardAll(climates: string[], patch: Partial<GuardRule>): void {
    const hass = this.ctx.store.rawHass;
    let layout = this.ctx.layout;
    for (const c of climates) {
      const lock = guards(layout)[c]?.lock ?? (hass ? childLockOf(hass, c) : undefined);
      const extra = patch.lockMode && lock ? { lock } : {};
      if (patch.lockMode && !lock) continue;
      layout = setGuard(layout, c, { ...patch, ...extra });
    }
    this.ctx.saveLayout(layout);
  }

  #zones(hass: HomeAssistant) {
    const { t, layout } = this.ctx;
    const saved = Boolean(heatingLayout(layout).zones);
    const zones = heatingZones(hass, layout);
    const climates = Object.keys(hass.states).filter((id) => id.startsWith("climate."));
    return html`<h2>${t("heat.program")}</h2>
      <p class="hint">${t("heat.settings_hint")}</p>
      <div class="add">
        <span class="name"
          >${saved ? t("heat.saved") : t("heat.detected")}<small
            >${zones.length} ${t("heat.zones")}</small
          ></span
        >
        <button
          type="button"
          class="text primary"
          data-action="detect"
          ?disabled=${this._busy}
          @click=${() => void this.#detect()}
        >
          ${t("heat.detect")}
        </button>
        ${
          saved
            ? html`<button
                type="button"
                class="text"
                @click=${() => this.ctx.saveLayout(setHeating(layout, { zones: undefined, toggles: undefined }))}
              >
                ${t("heat.reset")}
              </button>`
            : nothing
        }
      </div>
      <div class="rows">
        ${zones.map(
          (z) =>
            html`<div class="zone" data-zone=${z.id}>
              <div class="row heading-row"><span class="name">${z.name}</span></div>
              ${z.levels.map(
                (l, i) =>
                  html`<div class="row sub">
                    <span class="name"
                      >${levelName(hass, z, l)}<small
                        >${l.schedule ? nameOf(hass, l.schedule) : t("heat.otherwise")} ·
                        ${nameOf(hass, l.temp)}</small
                      ></span
                    >
                    ${
                      saved && l.schedule
                        ? moveButtons(
                            t,
                            (d) => this.#patchZone(zones, z.id, { levels: moveBy(z.levels, l, d) }),
                            i === 0,
                            !z.levels[i + 1]?.schedule,
                          )
                        : nothing
                    }
                  </div>`,
              )}
              <div class="row sub thermostats">
                <span class="name"
                  >${t("heat.thermostats")}<small
                    >${
                      z.thermostats.length
                        ? saved
                          ? ""
                          : z.thermostats.map((id) => nameOf(hass, id)).join(", ")
                        : t("heat.none_assigned")
                    }</small
                  ></span
                >
                ${
                  saved
                    ? html`<select
                          aria-label=${t("heat.add_thermostat")}
                          @change=${(e: Event) => {
                            const sel = e.target as HTMLSelectElement;
                            if (sel.value)
                              this.#patchZone(zones, z.id, { thermostats: [...z.thermostats, sel.value] });
                            sel.value = "";
                          }}
                        >
                          <option value="">${t("heat.add_thermostat")}</option>
                          ${climates
                            .filter((c) => !z.thermostats.includes(c))
                            .map((c) => html`<option value=${c}>${nameOf(hass, c)}</option>`)}
                        </select>
                        ${z.thermostats.map(
                          (c) =>
                            html`<button
                              type="button"
                              class="text"
                              aria-label=${`${t("w.remove")} ${nameOf(hass, c)}`}
                              @click=${() => this.#patchZone(zones, z.id, { thermostats: z.thermostats.filter((x) => x !== c) })}
                            >
                              ${nameOf(hass, c)} ×
                            </button>`,
                        )}`
                    : nothing
                }
              </div>
            </div>`,
        )}
      </div>`;
  }

  #toggles(hass: HomeAssistant) {
    const { t, layout } = this.ctx;
    const chosen = heatingToggles(hass, layout);
    const all = Object.keys(hass.states)
      .filter((id) => id.startsWith("input_boolean."))
      .sort((a, b) => Number(chosen.includes(b)) - Number(chosen.includes(a)) || a.localeCompare(b));
    return html`<h2>${t("heat.toggles")}</h2>
      <p class="hint">${t("heat.toggles_hint")}</p>
      <div class="rows">
        ${all.slice(0, Math.max(chosen.length + 6, 8)).map(
          (id) =>
            html`<div class="row">
              ${toggle(
                chosen.includes(id),
                (on) =>
                  this.ctx.saveLayout(
                    setHeating(layout, { toggles: on ? [...chosen, id] : chosen.filter((x) => x !== id) }),
                  ),
                nameOf(hass, id),
              )}
              <span class="name">${nameOf(hass, id)}<small>${id}</small></span>
            </div>`,
        )}
      </div>`;
  }

  #guards(hass: HomeAssistant) {
    const { t, layout } = this.ctx;
    const rules = guards(layout);
    const climates = Object.keys(hass.states)
      .filter((id) => id.startsWith("climate."))
      .sort((a, b) => nameOf(hass, a).localeCompare(nameOf(hass, b)));
    const locks = Object.keys(hass.states).filter((id) => /^(switch|lock)\./.test(id) && /lock/i.test(id));
    const modeSelect = (value: LockMode | "", onChange: (v: LockMode | undefined) => void, label: string) =>
      html`<select
        aria-label=${label}
        data-field="lockMode"
        @change=${(e: Event) => onChange(((e.target as HTMLSelectElement).value || undefined) as LockMode | undefined)}
      >
        <option value="" ?selected=${!value}>${t("heat.lock_free")}</option>
        <option value="always" ?selected=${value === "always"}>${t("heat.lock_mode_always")}</option>
        <option value="relock" ?selected=${value === "relock"}>${t("heat.lock_mode_relock")}</option>
      </select>`;
    const minutesSelect = (value: number, onChange: (v: number) => void) =>
      html`<select
        aria-label=${t("heat.relock_after")}
        data-field="relockMinutes"
        @change=${(e: Event) => onChange(Number((e.target as HTMLSelectElement).value))}
      >
        ${RELOCK_MINUTES.map((n) => html`<option value=${n} ?selected=${value === n}>${n} min</option>`)}
      </select>`;
    return html`<h2>${t("heat.guard")}</h2>
      <p class="hint">${t("heat.guard_hint")}</p>
      <div class="rows">
        <div class="row all" data-climate="*">
          <span class="name"
            >${t("heat.all_thermostats")}<small>${t("heat.all_thermostats_sub")}</small></span
          >
          ${modeSelect("", (v) => this.#guardAll(climates, { lockMode: v }), t("heat.lock"))}
          <button type="button" class="text" @click=${() => this.#guardAll(climates, { keepMode: true })}>
            ${t("heat.keep_all")}
          </button>
        </div>
        ${climates.map((c) => {
          const rule = rules[c] ?? {};
          const lock = rule.lock ?? childLockOf(hass, c);
          return html`<div class="row guard" data-climate=${c}>
            <span class="name"
              >${nameOf(hass, c)}<small>${lock ? nameOf(hass, lock) : t("heat.no_lock")}</small></span
            >
            ${
              lock
                ? html`${modeSelect(rule.lockMode ?? "", (v) => this.#guard(c, { lockMode: v, lock }), t("heat.lock"))}
                  ${
                    rule.lockMode === "relock"
                      ? minutesSelect(rule.relockMinutes ?? 10, (n) =>
                          this.#guard(c, { relockMinutes: n, lock }),
                        )
                      : nothing
                  }`
                : html`<select
                    aria-label=${t("heat.choose_lock")}
                    @change=${(e: Event) => this.#guard(c, { lock: (e.target as HTMLSelectElement).value || undefined })}
                  >
                    <option value="">${t("heat.choose_lock")}</option>
                    ${locks.map((id) => html`<option value=${id}>${nameOf(hass, id)}</option>`)}
                  </select>`
            }
            <label class="keep">
              ${toggle(Boolean(rule.keepMode), (on) => this.#guard(c, { keepMode: on || undefined }), t("heat.keep"))}
              <span>${t("heat.keep")}</span>
            </label>
          </div>`;
        })}
      </div>
      <p class="hint">${t("heat.guard_note")}</p>`;
  }

  protected override render() {
    const hass = this.ctx.store.rawHass;
    if (!hass) return nothing;
    return html`${this.#zones(hass)} ${this.#toggles(hass)} ${this.#guards(hass)}`;
  }

  static override styles = [
    settingsStyles,
    css`
      .zone {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin-bottom: 8px;
      }
      .row.sub {
        margin-left: 12px;
        min-height: 48px;
      }
      .thermostats .text {
        min-height: 32px;
      }
      .keep {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: var(--a-text2);
      }
      .row.all {
        background: var(--a-s2);
      }
    `,
  ];
}
