import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import { ClimateStepper } from "../data/climate-stepper";
import { EntityController, type EntityStore } from "../data/entity-store";
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
  };

  declare store: EntityStore | undefined;
  declare t: Translate;
  declare locale: string;
  declare entityId: string | undefined;

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

  protected override render() {
    const s = this.#entity.state;
    if (!s) return nothing;
    const t = this.t;
    const off = s.state === "off" && this.#stepper.pending === null;
    const target = this.#stepper.pending ?? Number(s.attributes.temperature);
    const current = Number(s.attributes.current_temperature);
    const heating = s.attributes.hvac_action === "heating";
    const modes = ((s.attributes.hvac_modes as string[] | undefined) ?? [])
      .slice()
      .sort((a, b) => MODE_ORDER.indexOf(a) - MODE_ORDER.indexOf(b));
    const presets = ((s.attributes.preset_modes as string[] | undefined) ?? []).filter((p) => p !== "none");
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
    `,
  ];
}
