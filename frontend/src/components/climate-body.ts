import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import { ClimateStepper } from "../data/climate-stepper";
import { EntityController, type EntityStore } from "../data/entity-store";
import {
  childLockOf,
  currentLevel,
  guards,
  heatingZones,
  isUnlocked,
  levelName,
  levelTemp,
  nextChangeFromStates,
  zoneOf,
} from "../data/heating";
import { friendlyName } from "../data/registry";
import type { MessageKey, Translate } from "../i18n";
import { ICONS } from "../theme/shared";
import { formatTemperature } from "../util/format";
import { controlStyles } from "./control-styles";
import { icon } from "./icon";
import { closeButton } from "./light-body";

const MODE_ORDER = ["heat", "auto", "heat_cool", "cool", "dry", "fan_only", "off"];

/** Detailed control of a thermostat: target, mode, presets. */
export class AtriumClimateBody extends LitElement {
  static override properties = {
    store: { attribute: false },
    t: { attribute: false },
    locale: {},
    entityId: { attribute: "entity-id" },
    layout: { attribute: false },
    isAdmin: { attribute: false },
  };

  declare store: EntityStore | undefined;
  declare t: Translate;
  declare locale: string;
  declare entityId: string | undefined;
  /** Shared layout: heating program and guard rules. */
  declare layout: Record<string, unknown> | undefined;
  declare isAdmin: boolean;

  constructor() {
    super();
    this.isAdmin = false;
  }

  #entity = new EntityController(this, () => this.store);
  #stepper = new ClimateStepper(this, () => this.store?.hass);

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("entityId") || changed.has("store")) {
      this.#entity.track(this.entityId);
      this.#stepper.entityId = this.entityId;
    }
  }

  #call(service: string, data: Record<string, unknown>): void {
    const hass = this.store?.hass;
    if (!hass || !this.entityId) return;
    void hass.callService("climate", service, { entity_id: this.entityId, ...data });
  }

  #modeLabel(mode: string): string {
    return this.t(`climate.mode.${mode}` as MessageKey) || mode;
  }

  #presetLabel(preset: string): string {
    return this.t(`climate.preset.${preset}` as MessageKey) || preset;
  }

  #time(d: Date): string {
    const sameDay = d.toDateString() === new Date().toDateString();
    return new Intl.DateTimeFormat(this.locale, {
      ...(sameDay ? {} : { weekday: "short" }),
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  }

  /** "Program: Comfort 21 °C · until 19:00, then Night 17 °C", and a note when set by hand. */
  #program(target: number) {
    const hass = this.store?.hass;
    if (!hass || !this.entityId) return nothing;
    const zone = zoneOf(heatingZones(hass, this.layout), this.entityId);
    if (!zone) return nothing;
    const t = this.t;
    const cur = zone.levels[currentLevel(hass, zone)];
    const want = levelTemp(hass, cur);
    const next = nextChangeFromStates(hass, zone);
    const nextLevel = next ? zone.levels[next.level] : undefined;
    const temp = (v: number | null) => formatTemperature(v, this.locale);
    const byHand = want !== null && !Number.isNaN(target) && target !== want;
    return html`<div class="program" data-program=${zone.id}>
      <div class="label">${t("heat.program")}</div>
      <div class="pline">
        ${cur ? html`<b>${levelName(hass, zone, cur)} ${temp(want)}</b>` : nothing}
        ${
          next && nextLevel
            ? html`<span
                >${t("heat.until")} ${this.#time(next.at)} · ${t("heat.then")}
                ${levelName(hass, zone, nextLevel)} ${temp(levelTemp(hass, nextLevel))}</span
              >`
            : nothing
        }
      </div>
      ${
        byHand
          ? html`<div class="byhand">
              ${t("heat.by_hand")}
              ${temp(target)}${next ? html` · ${t("heat.until")} ${this.#time(next.at)}` : nothing}
            </div>`
          : nothing
      }
    </div>`;
  }

  /** The child lock: its state, what the guard does, and for admins a switch. */
  #lock() {
    const hass = this.store?.hass;
    if (!hass || !this.entityId) return nothing;
    const rule = guards(this.layout)[this.entityId];
    const lock = rule?.lock ?? childLockOf(hass, this.entityId);
    if (!lock || !hass.states[lock]) return nothing;
    const t = this.t;
    const open = isUnlocked(hass, lock);
    const mode =
      rule?.lockMode === "always"
        ? t("heat.lock_always")
        : rule?.lockMode === "relock"
          ? t("heat.lock_relock").replace("{n}", String(rule.relockMinutes ?? 10))
          : "";
    const domain = lock.split(".")[0] ?? "switch";
    const service = domain === "lock" ? (open ? "lock" : "unlock") : open ? "turn_on" : "turn_off";
    return html`<div class="lockrow" data-lock=${lock}>
      <span class="ln">
        ${t("heat.lock")}: <b>${open ? t("heat.unlocked") : t("heat.locked")}</b>
        ${mode ? html`<small>${mode}</small>` : nothing}
      </span>
      ${
        this.isAdmin
          ? html`<button
              type="button"
              class="lockbtn"
              @click=${() => void hass.callService(domain, service, { entity_id: lock })}
            >
              ${open ? t("heat.do_lock") : t("heat.do_unlock")}
            </button>`
          : nothing
      }
    </div>`;
  }

  protected override render() {
    const s = this.#entity.state;
    if (!s) return nothing;
    const t = this.t;
    const off = s.state === "off" && this.#stepper.pending === null;
    const target = this.#stepper.pending ?? Number(s.attributes.temperature);
    const current = Number(s.attributes.current_temperature);
    const heating = s.attributes.hvac_action === "heating";
    const keepMode = this.entityId ? guards(this.layout)[this.entityId]?.keepMode : false;
    const modes = ((s.attributes.hvac_modes as string[] | undefined) ?? [])
      .filter((m) => !(keepMode && m === "auto"))
      .slice()
      .sort((a, b) => MODE_ORDER.indexOf(a) - MODE_ORDER.indexOf(b));
    const presets = ((s.attributes.preset_modes as string[] | undefined) ?? []).filter(
      (p) => p !== "none" && !(keepMode && ["auto", "schedule", "program"].includes(p)),
    );
    return html`
      <div class="top">
        <div>
          <div class="label">${t("section.heating")}</div>
          <div class="title">${friendlyName(s)}</div>
        </div>
        ${closeButton(this, t)}
      </div>
      <div class="big">
        <button
          type="button"
          class="step"
          aria-label=${t("climate.colder")}
          @click=${() => this.#stepper.step(-1)}
        >
          ${icon(ICONS.minus, 26, 2.2)}
        </button>
        <div class="center">
          <div class="value" aria-live="polite">
            ${off ? t("climate.off") : formatTemperature(Number.isNaN(target) ? null : target, this.locale)}
          </div>
          <div class="sub">
            ${t("climate.current")} ${formatTemperature(Number.isNaN(current) ? null : current, this.locale)}
            · ${heating ? t("climate.heating") : t("climate.idle")}
          </div>
        </div>
        <button
          type="button"
          class="step warm"
          aria-label=${t("climate.warmer")}
          @click=${() => this.#stepper.step(1)}
        >
          ${icon(ICONS.plus, 26, 2.2)}
        </button>
      </div>
      ${this.#program(target)} ${this.#lock()}
      ${
        modes.length > 1
          ? html`<div class="label">${t("climate.mode")}</div>
              <div class="choices">
                ${modes.map(
                  (m) =>
                    html`<button
                      type="button"
                      aria-pressed=${String(s.state === m)}
                      @click=${() => this.#call("set_hvac_mode", { hvac_mode: m })}
                    >
                      ${this.#modeLabel(m)}
                    </button>`,
                )}
              </div>`
          : nothing
      }
      ${
        presets.length
          ? html`<div class="label">${t("climate.preset")}</div>
              <div class="choices">
                ${presets.map(
                  (p) =>
                    html`<button
                      type="button"
                      aria-pressed=${String(s.attributes.preset_mode === p)}
                      @click=${() => this.#call("set_preset_mode", { preset_mode: p })}
                    >
                      ${this.#presetLabel(p)}
                    </button>`,
                )}
              </div>`
          : nothing
      }
    `;
  }

  static override styles = [
    controlStyles,
    css`
      .big {
        align-items: center;
      }
      .center {
        text-align: center;
        flex: 1;
      }
      .center .sub {
        margin-top: 8px;
      }
      .step {
        width: 64px;
        height: 64px;
        flex: none;
        border: 0;
        border-radius: var(--a-radius);
        background: var(--a-s3);
        color: var(--a-text);
        display: flex;
        align-items: center;
        justify-content: center;
        touch-action: manipulation;
      }
      .step.warm {
        background: var(--a-ocher);
        color: var(--a-on-ocher);
      }
      .program,
      .lockrow {
        background: var(--a-s2);
        border-radius: var(--a-radius);
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: 14px;
      }
      .program .label {
        margin: 0;
      }
      .pline {
        display: flex;
        flex-wrap: wrap;
        gap: 4px 10px;
        align-items: baseline;
      }
      .pline span,
      .lockrow small {
        font-size: 13px;
        color: var(--a-text2);
      }
      .byhand {
        font-size: 13px;
        color: var(--a-ocher);
        font-weight: 600;
      }
      .lockrow {
        flex-direction: row;
        align-items: center;
        gap: 10px;
      }
      .lockrow .ln {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .lockbtn {
        border: 0;
        border-radius: var(--a-radius);
        min-height: 40px;
        padding: 0 14px;
        font: inherit;
        font-size: 13px;
        font-weight: 600;
        background: var(--a-s3);
        color: var(--a-text);
        cursor: pointer;
      }
    `,
  ];
}
