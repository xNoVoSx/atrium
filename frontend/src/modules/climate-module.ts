import { LitElement, css, html, nothing } from "lit";
import { keyed } from "lit/directives/keyed.js";
import { repeat } from "lit/directives/repeat.js";
import { icon } from "../components/icon";
import type { PanelContext } from "../context";
import { ClimateStepper } from "../data/climate-stepper";
import { EntityController, SelectorController } from "../data/entity-store";
import { climateZones, zoneLabel } from "../data/home";
import { ICONS, shared } from "../theme/shared";
import { formatTemperature } from "../util/format";

/**
 * Heating at a glance: one zone large with − / +, the others as chips.
 * Repeated taps are collected and sent once, so the thermostat is not
 * flooded and the number never jumps back while tapping.
 */
export class AtriumClimateModule extends LitElement {
  static override properties = {
    ctx: { attribute: false },
    areaId: { attribute: "area-id" },
    variant: {},
    _selected: { state: true },
  };

  declare ctx: PanelContext;
  /** Limit to one area (room page). */
  declare areaId: string | undefined;
  declare _selected: string | undefined;
  /** Design chosen in the widget settings (default: one zone large, others as buttons). */
  declare variant: string | undefined;

  #zones = new SelectorController(
    this,
    () => this.ctx?.store,
    (hass) => {
      const all = climateZones(hass);
      const zones = this.areaId ? all.filter((id) => this.#areaOf(id) === this.areaId) : all;
      return zones.map((id) => {
        const temp = Number(hass.states[id]?.attributes.current_temperature);
        return {
          id,
          label: zoneLabel(hass, id, zones),
          temp: Number.isNaN(temp) ? null : temp,
          heating: hass.states[id]?.attributes.hvac_action === "heating",
        };
      });
    },
  );
  #zone = new EntityController(this, () => this.ctx?.store);
  #stepper = new ClimateStepper(this, () => this.ctx?.store.hass);

  #areaOf(entityId: string): string | null {
    const hass = this.ctx.store.hass;
    const entry = hass?.entities[entityId];
    return entry?.area_id ?? (entry?.device_id ? (hass?.devices[entry.device_id]?.area_id ?? null) : null);
  }

  protected override willUpdate(): void {
    this.#zones.attach();
    const zones = this.#zones.value ?? [];
    if (!this._selected || !zones.some((z) => z.id === this._selected)) {
      // Start with a zone that is heating, else the first one.
      const heating = zones.find((z) => this.ctx.store.state(z.id)?.attributes.hvac_action === "heating");
      this._selected = (heating ?? zones[0])?.id;
    }
    this.#zone.track(this._selected);
    this.#stepper.entityId = this._selected;
  }

  #openControl(): void {
    if (!this._selected) return;
    this.dispatchEvent(
      new CustomEvent("atrium-more-info", {
        detail: { entityId: this._selected },
        bubbles: true,
        composed: true,
      }),
    );
  }

  protected override render() {
    const zones = this.#zones.value ?? [];
    if (!zones.length) return nothing;
    const { t, locale, store } = this.ctx;
    const zoneEl = (layout: "tile" | "row" | "chip") =>
      zones.map(
        (z) =>
          html`<atrium-climate-zone
            .store=${store}
            .t=${t}
            .locale=${locale}
            .entityId=${z.id}
            .label=${z.label}
            .layout=${layout}
          ></atrium-climate-zone>`,
      );
    const head = html`<div class="head plain-head">
      <div class="label">${t("section.heating")}</div>
      <div class="count">
        ${zones.filter((z) => z.heating).length} / ${zones.length} ${t("climate.heating").toLowerCase()}
      </div>
    </div>`;
    const style =
      this.variant ??
      (typeof this.ctx.user.climateStyle === "string" ? this.ctx.user.climateStyle : undefined);
    switch (style) {
      case "tiles":
        return html`${head}
          <div class="v-tiles">${zoneEl("tile")}</div>`;
      case "list":
        return html`${head}
          <div class="v-list">${zoneEl("row")}</div>`;
      case "chips":
        return html`${head}
          <div class="v-chips">${zoneEl("chip")}</div>`;
      case "dial":
        return this.#renderDial(zones);
      case "minimal":
        return this.#renderMinimal(zones);
      default:
        return this.#renderCard(zones);
    }
  }

  #zoneButtons(
    zones: Array<{ id: string; label: string; temp: number | null; heating: boolean }>,
    selected: string | undefined,
  ) {
    const { t, locale } = this.ctx;
    return html`<div class="zones" role="tablist">
      ${repeat(
        zones,
        (z) => z.id,
        (z) =>
          html`<button
            type="button"
            role="tab"
            aria-selected=${String(z.id === selected)}
            @click=${() => (this._selected = z.id)}
          >
            <span class="zone-name"
              >${z.heating ? html`<span class="hot" title=${t("climate.heating")}></span>` : nothing}${z.label}</span
            >
            <span class="zone-temp">${formatTemperature(z.temp, locale)}</span>
          </button>`,
      )}
    </div>`;
  }

  /** A ring: the arc shows the target between 5 and 30 °C, a dot the current temperature. */
  #renderDial(zones: Array<{ id: string; label: string; temp: number | null; heating: boolean }>) {
    const s = this.#zone.state;
    if (!s) return nothing;
    const { t, locale } = this.ctx;
    const off = s.state === "off" && this.#stepper.pending === null;
    const target = this.#stepper.pending ?? Number(s.attributes.temperature);
    const current = Number(s.attributes.current_temperature);
    const min = Number(s.attributes.min_temp ?? 5);
    const max = Number(s.attributes.max_temp ?? 30);
    const frac = (v: number) => Math.max(0, Math.min(1, (v - min) / (max - min || 1)));
    const len = 2 * Math.PI * 42 * 0.75;
    const heating = s.attributes.hvac_action === "heating";
    const angle = (v: number) => (135 + frac(v) * 270) * (Math.PI / 180);
    const dot = Number.isNaN(current)
      ? null
      : { x: 50 + 42 * Math.cos(angle(current)), y: 50 + 42 * Math.sin(angle(current)) };
    const label = zones.find((z) => z.id === s.entity_id)?.label ?? "";
    return html`<div class="card dial ${heating ? "heating" : ""}">
      <div class="head">
        <div class="label">${t("section.heating")} · ${label}</div>
      </div>
      <div class="dial-wrap">
        <button
          type="button"
          class="step-btn"
          aria-label=${t("climate.colder")}
          @click=${() => this.#stepper.step(-1)}
        >
          ${icon(ICONS.minus, 22, 2.2)}
        </button>
        <button type="button" class="ring" @click=${() => this.#openControl()} title=${t("climate.more")}>
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle
              cx="50"
              cy="50"
              r="42"
              class="track"
              style="stroke-dasharray:${len} 999"
              transform="rotate(135 50 50)"
            />
            <circle
              cx="50"
              cy="50"
              r="42"
              class="value"
              style="stroke-dasharray:${off ? 0 : len * frac(target)} 999"
              transform="rotate(135 50 50)"
            />
            ${dot ? html`` : nothing}
          </svg>
          ${dot ? html`<span class="cur-dot" style="left:${dot.x}%;top:${dot.y}%"></span>` : nothing}
          <span class="ring-text">
            <b
              >${keyed(`${off}:${target}`, html`<span class="tick">${off ? t("climate.off") : formatTemperature(Number.isNaN(target) ? null : target, locale)}</span>`)}</b
            >
            <small
              >${t("climate.current")}
              ${formatTemperature(Number.isNaN(current) ? null : current, locale)}</small
            >
          </span>
        </button>
        <button
          type="button"
          class="step-btn plus"
          aria-label=${t("climate.warmer")}
          @click=${() => this.#stepper.step(1)}
        >
          ${icon(ICONS.plus, 22, 2.2)}
        </button>
      </div>
      ${zones.length > 1 ? this.#zoneButtons(zones, s.entity_id) : nothing}
    </div>`;
  }

  /** Just the number and − / +, the zone chosen from a list. */
  #renderMinimal(zones: Array<{ id: string; label: string; temp: number | null; heating: boolean }>) {
    const s = this.#zone.state;
    if (!s) return nothing;
    const { t, locale } = this.ctx;
    const off = s.state === "off" && this.#stepper.pending === null;
    const target = this.#stepper.pending ?? Number(s.attributes.temperature);
    return html`<div class="minimal">
      ${
        zones.length > 1
          ? html`<select
              aria-label=${t("climate.zone")}
              @change=${(e: Event) => (this._selected = (e.target as HTMLSelectElement).value)}
            >
              ${zones.map((z) => html`<option value=${z.id} ?selected=${z.id === s.entity_id}>${z.label}</option>`)}
            </select>`
          : html`<span class="min-label">${zones[0]?.label}</span>`
      }
      <div class="min-row">
        <button
          type="button"
          class="step-btn"
          aria-label=${t("climate.colder")}
          @click=${() => this.#stepper.step(-1)}
        >
          ${icon(ICONS.minus, 22, 2.2)}
        </button>
        <button type="button" class="min-value" @click=${() => this.#openControl()}>
          ${keyed(`${off}:${target}`, html`<span class="tick">${off ? t("climate.off") : formatTemperature(Number.isNaN(target) ? null : target, locale)}</span>`)}
        </button>
        <button
          type="button"
          class="step-btn plus"
          aria-label=${t("climate.warmer")}
          @click=${() => this.#stepper.step(1)}
        >
          ${icon(ICONS.plus, 22, 2.2)}
        </button>
      </div>
    </div>`;
  }

  #renderCard(zones: Array<{ id: string; label: string; temp: number | null; heating: boolean }>) {
    const s = this.#zone.state;
    if (!zones.length || !s) return nothing;
    const { t, locale } = this.ctx;
    const off = s.state === "off" && this.#stepper.pending === null;
    const target = this.#stepper.pending ?? Number(s.attributes.temperature);
    const current = Number(s.attributes.current_temperature);
    const heating = s.attributes.hvac_action === "heating";
    const label = zones.find((z) => z.id === s.entity_id)?.label ?? "";
    return html`
      <div class="card">
        <div class="head">
          <div class="label">${t("section.heating")} · ${label}</div>
          <div class="badge ${heating ? "heating" : ""}">
            ${
              heating
                ? html`<svg class="flame" viewBox="0 0 24 24" aria-hidden="true">
                    <g class="waves">
                      <path d="M8 6c-1-1.5 1-2.5 0-4M12 6c-1-1.5 1-2.5 0-4M16 6c-1-1.5 1-2.5 0-4" />
                    </g>
                    <path
                      class="fire"
                      d="M12 22c-3.3 0-6-2.4-6-5.6 0-2.6 1.7-4.2 3-5.4.3 1.4 1 2.3 2 2.8-.3-2.6.8-4.6 2.8-6 .2 2.4 1.4 3.6 2.6 5 .9 1.1 1.6 2.3 1.6 3.8 0 3-2.7 5.4-6 5.4z"
                    />
                  </svg>`
                : nothing
            }
            ${off ? t("climate.off") : heating ? t("climate.heating") : t("climate.idle")}
          </div>
        </div>
        <div class="main">
          <button class="open" type="button" title=${t("climate.more")} @click=${() => this.#openControl()}>
            <span class="target" aria-live="polite">
              ${keyed(
                `${off}:${target}`,
                html`<span class="tick"
                  >${off ? t("climate.off") : formatTemperature(Number.isNaN(target) ? null : target, locale)}</span
                >`,
              )}
            </span>
            <span class="sub">
              ${t("climate.target")} · ${t("climate.current")}
              ${formatTemperature(Number.isNaN(current) ? null : current, locale)}
            </span>
          </button>
          <div class="buttons">
            <button
              type="button"
              class="minus"
              aria-label=${t("climate.colder")}
              @click=${() => this.#stepper.step(-1)}
            >
              ${icon(ICONS.minus, 22, 2.2)}
            </button>
            <button
              type="button"
              class="plus"
              aria-label=${t("climate.warmer")}
              @click=${() => this.#stepper.step(1)}
            >
              ${icon(ICONS.plus, 22, 2.2)}
            </button>
          </div>
        </div>
        ${zones.length > 1 ? this.#zoneButtons(zones, s.entity_id) : nothing}
      </div>
    `;
  }

  static override styles = [
    shared,
    css`
      :host {
        display: block;
      }
      .card {
        background: var(--a-panel);
        color: var(--a-on-panel);
        border-radius: var(--a-radius);
        padding: 18px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .card .label {
        color: var(--a-on-panel2);
      }
      .head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
      }
      .badge {
        font-size: 13px;
        font-weight: 600;
        padding: 4px 10px;
        border-radius: 4px;
        background: var(--a-panel2);
        color: var(--a-on-panel);
        white-space: nowrap;
      }
      .badge.heating {
        background: var(--a-ocher);
        color: var(--a-on-ocher);
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding-left: 6px;
      }
      .flame {
        width: 16px;
        height: 16px;
        overflow: visible;
      }
      .flame .fire {
        fill: currentColor;
        transform-origin: 12px 22px;
        animation: flicker calc(var(--a-motion, 1) * 1.4s) ease-in-out var(--a-iter, infinite);
      }
      .flame .waves {
        fill: none;
        stroke: currentColor;
        stroke-width: 1.6;
        stroke-linecap: round;
        animation: rise calc(var(--a-motion, 1) * 1.8s) ease-out var(--a-iter, infinite);
      }
      @keyframes flicker {
        0%,
        100% {
          transform: scale(1, 1);
        }
        30% {
          transform: scale(0.94, 1.06) skewX(-2deg);
        }
        60% {
          transform: scale(1.04, 0.95) skewX(2deg);
        }
      }
      @keyframes rise {
        from {
          transform: translateY(4px);
          opacity: 0;
        }
        40% {
          opacity: 0.9;
        }
        to {
          transform: translateY(-3px);
          opacity: 0;
        }
      }
      .tick {
        display: inline-block;
        animation: tick calc(var(--a-motion, 1) * 380ms) cubic-bezier(0.2, 0.9, 0.25, 1);
      }
      @keyframes tick {
        from {
          transform: translateY(10px);
          opacity: 0.3;
        }
      }
      .hot {
        display: inline-block;
        width: 7px;
        height: 7px;
        border-radius: 4px;
        background: var(--a-ocher);
        margin-right: 6px;
        vertical-align: middle;
        animation: hot calc(var(--a-motion, 1) * 1.8s) ease-in-out var(--a-iter, infinite);
      }
      @keyframes hot {
        50% {
          opacity: 0.35;
        }
      }
      .main {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 12px;
      }
      .open {
        all: unset;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        border-radius: var(--a-radius);
      }
      .open:focus-visible {
        outline: 2px solid var(--a-ocher);
        outline-offset: 4px;
      }
      .target {
        font-size: 72px;
        font-weight: 600;
        letter-spacing: -0.04em;
        line-height: 0.9;
        font-variant-numeric: tabular-nums;
      }
      .sub {
        font-size: 14px;
        color: var(--a-on-panel2);
        margin-top: 6px;
      }
      .buttons {
        display: flex;
        gap: 8px;
      }
      .buttons button {
        width: 56px;
        height: 56px;
        border: 0;
        border-radius: var(--a-radius);
        display: flex;
        align-items: center;
        justify-content: center;
        touch-action: manipulation;
      }
      .minus {
        background: var(--a-panel2);
        color: var(--a-on-panel);
      }
      .plus {
        background: var(--a-ocher);
        color: var(--a-on-ocher);
      }
      /* All zones stay reachable: they wrap instead of scrolling sideways. */
      .zones {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 6px;
      }
      .zones button {
        min-width: 0;
        text-align: left;
        cursor: pointer;
        font-family: inherit;
        min-height: 44px;
        padding: 6px 12px;
        border: 0;
        border-radius: 4px;
        background: var(--a-panel2);
        color: var(--a-on-panel);
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        font-size: 13px;
      }
      .zones button[aria-selected="true"] {
        background: var(--a-on-panel);
        color: var(--a-panel);
      }
      .zone-name {
        font-weight: 600;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .plain-head {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-bottom: 10px;
      }
      .plain-head .label {
        color: var(--a-text2);
      }
      .count {
        font-size: 13px;
        font-weight: 600;
        color: var(--a-text2);
      }
      .v-tiles {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 8px;
      }
      .v-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .v-chips {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
        gap: 6px;
      }
      .step-btn {
        border: 0;
        width: 56px;
        height: 56px;
        border-radius: var(--a-radius);
        background: var(--a-panel2);
        color: var(--a-on-panel);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        flex: none;
      }
      .step-btn.plus {
        background: var(--a-ocher);
        color: var(--a-on-ocher);
      }
      .dial-wrap {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 14px;
      }
      .ring {
        all: unset;
        position: relative;
        width: min(220px, 52vw);
        aspect-ratio: 1;
        cursor: pointer;
      }
      .ring svg {
        width: 100%;
        height: 100%;
      }
      .ring circle {
        fill: none;
        stroke-width: 7;
        stroke-linecap: round;
      }
      .ring .track {
        stroke: var(--a-panel2);
      }
      .ring .value {
        stroke: var(--a-on-panel2);
        transition: stroke-dasharray calc(var(--a-motion, 1) * 500ms) cubic-bezier(0.2, 0.9, 0.25, 1);
      }
      .dial.heating .ring .value {
        stroke: var(--a-ocher);
      }
      .cur-dot {
        position: absolute;
        width: 12px;
        height: 12px;
        margin: -6px;
        border-radius: 6px;
        background: var(--a-on-panel);
        box-shadow: 0 0 0 3px var(--a-panel);
        transition:
          left calc(var(--a-motion, 1) * 500ms),
          top calc(var(--a-motion, 1) * 500ms);
      }
      .ring-text {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
      }
      .ring-text b {
        font-size: 44px;
        font-weight: 600;
        letter-spacing: -0.03em;
      }
      .ring-text small {
        font-size: 13px;
        color: var(--a-on-panel2);
      }
      .minimal {
        display: flex;
        flex-direction: column;
        gap: 10px;
        background: var(--a-s1);
        border-radius: var(--a-radius);
        padding: 14px;
      }
      .minimal select {
        align-self: flex-start;
        border: 0;
        border-radius: var(--a-radius);
        background: var(--a-s2);
        color: var(--a-text);
        font: inherit;
        font-weight: 600;
        min-height: 40px;
        padding: 0 10px;
      }
      .min-label {
        font-weight: 600;
      }
      .min-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .minimal .step-btn {
        background: var(--a-s3);
        color: var(--a-text);
      }
      .minimal .step-btn.plus {
        background: var(--a-ocher);
        color: var(--a-on-ocher);
      }
      .min-value {
        all: unset;
        cursor: pointer;
        font-size: 56px;
        font-weight: 600;
        letter-spacing: -0.04em;
      }
      .zone-temp {
        font-variant-numeric: tabular-nums;
      }
    `,
  ];
}
