import { LitElement, css, html, nothing } from "lit";
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
    _selected: { state: true },
  };

  declare ctx: PanelContext;
  /** Limit to one area (room page). */
  declare areaId: string | undefined;
  declare _selected: string | undefined;

  #zones = new SelectorController(
    this,
    () => this.ctx?.store,
    (hass) => {
      const all = climateZones(hass);
      const zones = this.areaId ? all.filter((id) => this.#areaOf(id) === this.areaId) : all;
      return zones.map((id) => {
        const temp = Number(hass.states[id]?.attributes.current_temperature);
        return { id, label: zoneLabel(hass, id, zones), temp: Number.isNaN(temp) ? null : temp };
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
            ${off ? t("climate.off") : heating ? t("climate.heating") : t("climate.idle")}
          </div>
        </div>
        <div class="main">
          <button class="open" type="button" title=${t("climate.more")} @click=${() => this.#openControl()}>
            <span class="target" aria-live="polite">
              ${off ? t("climate.off") : formatTemperature(Number.isNaN(target) ? null : target, locale)}
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
        ${
          zones.length > 1
            ? html`<div class="zones" role="tablist">
                ${repeat(
                  zones,
                  (z) => z.id,
                  (z) =>
                    html`<button
                      type="button"
                      role="tab"
                      aria-selected=${String(z.id === s.entity_id)}
                      @click=${() => (this._selected = z.id)}
                    >
                      <span class="zone-name">${z.label}</span>
                      <span class="zone-temp">${formatTemperature(z.temp, locale)}</span>
                    </button>`,
                )}
              </div>`
            : nothing
        }
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
      .zones {
        display: flex;
        gap: 6px;
        overflow-x: auto;
        scrollbar-width: none;
        margin: 0 -2px;
        padding: 2px;
      }
      .zones button {
        flex: 0 0 auto;
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
      }
      .zone-temp {
        font-variant-numeric: tabular-nums;
      }
    `,
  ];
}
