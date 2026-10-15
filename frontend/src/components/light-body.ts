import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import { EntityController, type EntityStore } from "../data/entity-store";
import { brightnessPct, friendlyName, isDimmable } from "../data/registry";
import type { Translate } from "../i18n";
import { ICONS } from "../theme/shared";
import { controlStyles } from "./control-styles";
import { icon } from "./icon";

const PRESETS = [10, 40, 80, 100] as const;
const COLOR_MODES = ["hs", "rgb", "rgbw", "rgbww", "xy"];
/** Hue presets (degrees) for colour lights. */
const HUES = [0, 30, 50, 120, 180, 220, 270, 320] as const;
const TEMP_PRESETS: Array<[number, "control.warm" | "control.neutral" | "control.daylight"]> = [
  [2700, "control.warm"],
  [4000, "control.neutral"],
  [5500, "control.daylight"],
];

export const closeSheet = (el: HTMLElement) =>
  el.dispatchEvent(new CustomEvent("atrium-close-sheet", { bubbles: true, composed: true }));

export const closeButton = (el: HTMLElement, t: Translate) =>
  html`<button class="close" type="button" aria-label=${t("control.close")} @click=${() => closeSheet(el)}>
    ${icon(ICONS.close, 18, 2.2)}
  </button>`;

/** Detailed control of a light: on/off, brightness, presets. */
export class AtriumLightBody extends LitElement {
  static override properties = {
    store: { attribute: false },
    t: { attribute: false },
    entityId: { attribute: "entity-id" },
    _dragPct: { state: true },
    _dragKelvin: { state: true },
  };

  declare store: EntityStore | undefined;
  declare t: Translate;
  declare entityId: string | undefined;
  declare _dragPct: number | null;
  declare _dragKelvin: number | null;

  #entity = new EntityController(this, () => this.store);

  constructor() {
    super();
    this._dragPct = null;
    this._dragKelvin = null;
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("entityId") || changed.has("store")) {
      this.#entity.track(this.entityId);
      this._dragPct = null;
    }
  }

  #call(service: "toggle" | "turn_on", data: Record<string, unknown> = {}): void {
    const hass = this.store?.hass;
    if (!hass || !this.entityId) return;
    void hass.callService("light", service, { entity_id: this.entityId, ...data });
  }

  protected override render() {
    const s = this.#entity.state;
    if (!s) return nothing;
    const t = this.t;
    const on = s.state === "on";
    const dimmable = isDimmable(s);
    const pct = this._dragPct ?? brightnessPct(s) ?? 0;
    const showPct = dimmable && (on || this._dragPct !== null);
    return html`
      <div class="top">
        <div>
          <div class="label">${t("control.light")}</div>
          <div class="title">${friendlyName(s)}</div>
        </div>
        ${closeButton(this, t)}
      </div>
      <div class="big">
        <div class="value">
          ${showPct ? html`${pct}<small>%</small>` : on ? t("state.on") : t("state.off")}
        </div>
        <button
          class="power ${on ? "on" : ""}"
          type="button"
          aria-pressed=${String(on)}
          @click=${() => this.#call("toggle")}
        >
          ${on ? t("state.on") : t("state.off")}
        </button>
      </div>
      <div class="dim" ?hidden=${!dimmable}>
        <div class="label">${t("control.brightness")}</div>
        <div class="slider">
          <div class="fill" style="width: ${on || this._dragPct !== null ? pct : 0}%"></div>
          <input
            type="range"
            min="1"
            max="100"
            step="1"
            .value=${String(pct || 1)}
            aria-label=${t("control.brightness")}
            @input=${(ev: Event) => (this._dragPct = Number((ev.target as HTMLInputElement).value))}
            @change=${(ev: Event) => {
              this.#call("turn_on", { brightness_pct: Number((ev.target as HTMLInputElement).value) });
              this._dragPct = null;
            }}
          />
        </div>
        <div class="choices">
          ${PRESETS.map(
            (p) =>
              html`<button type="button" @click=${() => this.#call("turn_on", { brightness_pct: p })}>
                ${p} %
              </button>`,
          )}
        </div>
      </div>
      ${this.#renderTemp(s.attributes)} ${this.#renderColor(s.attributes)}
    `;
  }

  #modes(attrs: Record<string, unknown>): string[] {
    return Array.isArray(attrs.supported_color_modes) ? (attrs.supported_color_modes as string[]) : [];
  }

  /** Colour temperature, where the light has it: a warm-to-cold slider and three presets. */
  #renderTemp(attrs: Record<string, unknown>) {
    if (!this.#modes(attrs).includes("color_temp")) return nothing;
    const t = this.t;
    const min = Number(attrs.min_color_temp_kelvin ?? 2000);
    const max = Number(attrs.max_color_temp_kelvin ?? 6500);
    const current = this._dragKelvin ?? Number(attrs.color_temp_kelvin ?? Math.round((min + max) / 2));
    const pos = ((current - min) / (max - min || 1)) * 100;
    return html`<div class="dim">
      <div class="label">${t("control.temperature")} · ${current} K</div>
      <div class="slider temp">
        <div class="knob" style="left: ${Math.max(0, Math.min(100, pos))}%"></div>
        <input
          type="range"
          min=${min}
          max=${max}
          step="50"
          .value=${String(current)}
          aria-label=${t("control.temperature")}
          @input=${(ev: Event) => (this._dragKelvin = Number((ev.target as HTMLInputElement).value))}
          @change=${(ev: Event) => {
            this.#call("turn_on", { color_temp_kelvin: Number((ev.target as HTMLInputElement).value) });
            this._dragKelvin = null;
          }}
        />
      </div>
      <div class="choices">
        ${TEMP_PRESETS.filter(([k]) => k >= min - 200 && k <= max + 200).map(
          ([k, label]) =>
            html`<button
              type="button"
              @click=${() => this.#call("turn_on", { color_temp_kelvin: Math.min(max, Math.max(min, k)) })}
            >
              ${t(label)}
            </button>`,
        )}
      </div>
    </div>`;
  }

  /** Colour, where the light has it: a few swatches. */
  #renderColor(attrs: Record<string, unknown>) {
    if (!this.#modes(attrs).some((m) => COLOR_MODES.includes(m))) return nothing;
    const hs = Array.isArray(attrs.hs_color) ? (attrs.hs_color as number[]) : null;
    const colorMode = String(attrs.color_mode ?? "");
    return html`<div class="dim">
      <div class="label">${this.t("control.color")}</div>
      <div class="swatches">
        ${HUES.map((h) => {
          const active =
            COLOR_MODES.includes(colorMode) &&
            hs !== null &&
            Math.abs((hs[0] ?? -99) - h) < 12 &&
            (hs[1] ?? 0) > 50;
          return html`<button
            type="button"
            class="swatch ${active ? "active" : ""}"
            style="--c: hsl(${h} 85% 58%)"
            aria-label="${h}°"
            @click=${() => this.#call("turn_on", { hs_color: [h, 90] })}
          ></button>`;
        })}
      </div>
    </div>`;
  }

  static override styles = [
    controlStyles,
    css`
      .power {
        height: 56px;
        padding: 0 22px;
        border: 0;
        border-radius: var(--a-radius);
        font-size: 16px;
        font-weight: 600;
        background: var(--a-s3);
        color: var(--a-text);
      }
      .power.on {
        background: var(--a-ocher);
        color: var(--a-on-ocher);
      }
      .dim {
        display: flex;
        flex-direction: column;
        gap: 18px;
      }
      .dim[hidden] {
        display: none;
      }
      .slider {
        position: relative;
        height: 64px;
        border-radius: var(--a-radius);
        background: var(--a-s3);
        overflow: hidden;
        touch-action: none;
      }
      .fill {
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        background: var(--a-ocher);
        transition: width 120ms linear;
      }
      .slider.temp {
        background: linear-gradient(90deg, #ffb35c, #fff1dc 50%, #cfe3ff);
        height: 48px;
      }
      .knob {
        position: absolute;
        top: 6px;
        bottom: 6px;
        width: 6px;
        margin-left: -3px;
        border-radius: 3px;
        background: #1e2022;
        box-shadow: 0 0 0 2px #fff;
        transition: left calc(var(--a-motion, 1) * 120ms) linear;
      }
      .swatches {
        display: grid;
        grid-template-columns: repeat(8, minmax(0, 1fr));
        gap: 8px;
      }
      .swatch {
        aspect-ratio: 1;
        border: 0;
        border-radius: 50%;
        background: var(--c);
        cursor: pointer;
        transition: transform calc(var(--a-motion, 1) * 150ms);
      }
      .swatch:active {
        transform: scale(0.9);
      }
      .swatch.active {
        box-shadow:
          0 0 0 3px var(--a-s1),
          0 0 0 5px var(--a-text);
      }
      .slider input {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        opacity: 0;
        margin: 0;
        cursor: pointer;
      }
    `,
  ];
}
