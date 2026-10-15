import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import { keyed } from "lit/directives/keyed.js";
import { ClimateStepper } from "../data/climate-stepper";
import { EntityController, type EntityStore } from "../data/entity-store";
import type { Translate } from "../i18n";
import { ICONS } from "../theme/shared";
import { formatTemperature } from "../util/format";
import { icon } from "./icon";

const FLAME =
  "M12 22c-3.3 0-6-2.4-6-5.6 0-2.6 1.7-4.2 3-5.4.3 1.4 1 2.3 2 2.8-.3-2.6.8-4.6 2.8-6 .2 2.4 1.4 3.6 2.6 5 .9 1.1 1.6 2.3 1.6 3.8 0 3-2.7 5.4-6 5.4z";

/**
 * One heating zone with its own − / +, as a tile, a row or a chip. Used by the
 * heating widget's designs that show all zones at once.
 */
export class AtriumClimateZone extends LitElement {
  static override properties = {
    store: { attribute: false },
    t: { attribute: false },
    locale: {},
    entityId: { attribute: "entity-id", reflect: true },
    label: {},
    layout: { reflect: true },
  };

  declare store: EntityStore | undefined;
  declare t: Translate;
  declare locale: string;
  declare entityId: string;
  declare label: string;
  declare layout: "tile" | "row" | "chip";

  #entity = new EntityController(this, () => this.store);
  #stepper = new ClimateStepper(this, () => this.store?.hass);

  constructor() {
    super();
    this.layout = "tile";
    this.locale = "en";
    this.label = "";
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("entityId") || changed.has("store")) {
      this.#entity.track(this.entityId);
      this.#stepper.entityId = this.entityId;
    }
  }

  #open(): void {
    this.dispatchEvent(
      new CustomEvent("atrium-more-info", {
        detail: { entityId: this.entityId },
        bubbles: true,
        composed: true,
      }),
    );
  }

  protected override render() {
    const s = this.#entity.state;
    if (!s) return nothing;
    const t = this.t;
    const off = s.state === "off" && this.#stepper.pending === null;
    const target = this.#stepper.pending ?? Number(s.attributes.temperature);
    const current = Number(s.attributes.current_temperature);
    const heating = s.attributes.hvac_action === "heating";
    const targetText = off
      ? t("climate.off")
      : formatTemperature(Number.isNaN(target) ? null : target, this.locale);
    const currentText = formatTemperature(Number.isNaN(current) ? null : current, this.locale);
    const stepper = html`<span class="step">
      <button
        type="button"
        class="minus"
        aria-label=${t("climate.colder")}
        @click=${() => this.#stepper.step(-1)}
      >
        ${icon(ICONS.minus, 18, 2.2)}
      </button>
      <button
        type="button"
        class="plus"
        aria-label=${t("climate.warmer")}
        @click=${() => this.#stepper.step(1)}
      >
        ${icon(ICONS.plus, 18, 2.2)}
      </button>
    </span>`;
    const flame = heating
      ? html`<svg class="flame" viewBox="0 0 24 24" aria-label=${t("climate.heating")}>
          <path d=${FLAME} />
        </svg>`
      : nothing;
    if (this.layout === "chip")
      return html`<button type="button" class="chip ${heating ? "hot" : ""}" @click=${() => this.#open()}>
        <span class="cn">${flame}${this.label}</span>
        <span class="cv"
          >${keyed(targetText, html`<span class="tick">${targetText}</span>`)}<small
            >${currentText}</small
          ></span
        >
      </button>`;
    if (this.layout === "row")
      return html`<div class="row ${heating ? "hot" : ""}">
        <button type="button" class="rn" @click=${() => this.#open()}>
          ${flame}<span>${this.label}</span><small>${t("climate.current")} ${currentText}</small>
        </button>
        <span class="rv">${keyed(targetText, html`<span class="tick">${targetText}</span>`)}</span>
        ${stepper}
      </div>`;
    return html`<div class="tile ${heating ? "hot" : ""}">
      <button type="button" class="tn" @click=${() => this.#open()}>${this.label}${flame}</button>
      <span class="tv">${keyed(targetText, html`<span class="tick">${targetText}</span>`)}</span>
      <span class="tc">${t("climate.current")} ${currentText}</span>
      ${stepper}
    </div>`;
  }

  static override styles = css`
    :host {
      display: block;
      font-family: var(--a-font);
      color: var(--a-text);
      min-width: 0;
    }
    button {
      font: inherit;
      color: inherit;
      cursor: pointer;
    }
    .step {
      display: inline-flex;
      gap: 6px;
    }
    .step button {
      border: 0;
      width: 40px;
      height: 40px;
      border-radius: var(--a-radius);
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--a-s3);
      transition: transform calc(var(--a-motion, 1) * 120ms);
    }
    .step button:active {
      transform: scale(0.92);
    }
    .step .plus {
      background: var(--a-ocher);
      color: var(--a-on-ocher);
    }
    .flame {
      width: 14px;
      height: 14px;
      fill: var(--a-ocher);
      flex: none;
      transform-origin: 12px 22px;
      animation: flicker calc(var(--a-motion, 1) * 1.4s) ease-in-out var(--a-iter, infinite);
    }
    .tick {
      display: inline-block;
      animation: tick calc(var(--a-motion, 1) * 380ms) cubic-bezier(0.2, 0.9, 0.25, 1);
    }
    /* tile */
    .tile {
      background: var(--a-s1);
      border-radius: var(--a-radius);
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      border-top: 3px solid transparent;
      transition: border-color calc(var(--a-motion, 1) * 300ms);
    }
    .tile.hot {
      border-top-color: var(--a-ocher);
    }
    .tn,
    .rn {
      all: unset;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 14px;
      font-weight: 600;
      min-width: 0;
    }
    .tv {
      font-size: 34px;
      font-weight: 600;
      letter-spacing: -0.03em;
      line-height: 1;
    }
    .tc {
      font-size: 12px;
      color: var(--a-text2);
    }
    .tile .step {
      margin-top: 4px;
    }
    .tile .step button {
      flex: 1;
    }
    /* row */
    .row {
      display: flex;
      align-items: center;
      gap: 10px;
      background: var(--a-s1);
      border-radius: var(--a-radius);
      padding: 6px 6px 6px 12px;
      min-height: 52px;
    }
    .rn {
      flex: 1;
      flex-wrap: wrap;
    }
    .rn span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .rn small {
      width: 100%;
      font-size: 12px;
      font-weight: 500;
      color: var(--a-text2);
    }
    .rv {
      font-size: 22px;
      font-weight: 600;
      min-width: 3.2em;
      text-align: right;
    }
    /* chip */
    .chip {
      all: unset;
      box-sizing: border-box;
      width: 100%;
      cursor: pointer;
      background: var(--a-s1);
      border-radius: var(--a-radius);
      padding: 8px 12px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .chip.hot {
      background: var(--a-ocher);
      color: var(--a-on-ocher);
    }
    .chip.hot .flame {
      fill: currentColor;
    }
    .cn {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 13px;
      font-weight: 600;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .cv {
      font-size: 20px;
      font-weight: 600;
      display: flex;
      align-items: baseline;
      gap: 6px;
    }
    .cv small {
      font-size: 12px;
      font-weight: 500;
      opacity: 0.75;
    }
    @keyframes flicker {
      0%,
      100% {
        transform: scale(1);
      }
      40% {
        transform: scale(0.92, 1.08);
      }
    }
    @keyframes tick {
      from {
        transform: translateY(8px);
        opacity: 0.3;
      }
    }
  `;
}
