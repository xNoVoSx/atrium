import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import { EntityController, type EntityStore } from "../data/entity-store";
import { brightnessPct, friendlyName, isDimmable } from "../data/registry";
import type { Translate } from "../i18n";
import { ICONS } from "../theme/shared";
import { controlStyles } from "./control-styles";
import { icon } from "./icon";

const PRESETS = [10, 40, 80, 100] as const;

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
  };

  declare store: EntityStore | undefined;
  declare t: Translate;
  declare entityId: string | undefined;
  declare _dragPct: number | null;

  #entity = new EntityController(this, () => this.store);

  constructor() {
    super();
    this._dragPct = null;
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
    `;
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
