import { LitElement, css, html, nothing } from "lit";
import type { PanelContext } from "../context";
import { sensorChoices, setEnergy, suggestEnergy, type EnergyConfig } from "../data/energy";
import { StructureController } from "../data/entity-store";
import { nameOf } from "../data/registry";
import type { MessageKey } from "../i18n";
import { shared } from "../theme/shared";

type SensorKey =
  "acPower" | "energyTotal" | "inverterTemp" | "gridFrequency" | "forecastToday" | "forecastTomorrow";

const SENSORS: Array<{ key: SensorKey; label: MessageKey; deviceClass: string }> = [
  { key: "acPower", label: "energy.set.ac", deviceClass: "power" },
  { key: "energyTotal", label: "energy.set.total", deviceClass: "energy" },
  { key: "inverterTemp", label: "energy.set.temp", deviceClass: "temperature" },
  { key: "gridFrequency", label: "energy.set.freq", deviceClass: "frequency" },
  { key: "forecastToday", label: "energy.set.forecast_today", deviceClass: "energy" },
  { key: "forecastTomorrow", label: "energy.set.forecast_tomorrow", deviceClass: "energy" },
];

type NumberKey = "peakKw" | "price" | "purchaseCost" | "co2PerKwh";
const NUMBERS: Array<{ key: NumberKey; label: MessageKey; step: string }> = [
  { key: "peakKw", label: "energy.set.peak", step: "0.01" },
  { key: "price", label: "energy.set.price", step: "0.0001" },
  { key: "purchaseCost", label: "energy.set.cost", step: "1" },
  { key: "co2PerKwh", label: "energy.set.co2", step: "0.001" },
];

/** Settings section for solar (admins): sensors (automatic or chosen) and the system's figures. */
export class AtriumEnergySettings extends LitElement {
  static override properties = { ctx: { attribute: false } };
  declare ctx: PanelContext;

  #structure = new StructureController(this, () => this.ctx?.store);

  protected override willUpdate(): void {
    this.#structure.attach();
  }

  #saved(): EnergyConfig {
    return ((this.ctx.layout as { energy?: EnergyConfig }).energy ?? {}) as EnergyConfig;
  }

  #save(patch: Partial<EnergyConfig>): void {
    this.ctx.saveLayout(setEnergy(this.ctx.layout, patch));
  }

  protected override render() {
    const hass = this.ctx.store.rawHass;
    if (!hass) return nothing;
    const { t } = this.ctx;
    const saved = this.#saved();
    const auto = suggestEnergy(hass);
    const power = sensorChoices(hass, "power");
    const pvChosen = new Set(saved.pvPower ?? auto.pvPower ?? []);
    const consumersChosen = new Set((saved.consumers ?? auto.consumers ?? []).map((c) => c.power));
    const autoName = (id: string | undefined) => (id ? nameOf(hass, id) : t("energy.set.none"));
    return html`<section>
      <h2 class="label">${t("energy.title")}</h2>
      <div class="fields">
        ${SENSORS.map(({ key, label, deviceClass }) => {
          const choices = sensorChoices(hass, deviceClass);
          return html`<label class="field">
            <span>${t(label)}</span>
            <select
              data-energy=${key}
              @change=${(ev: Event) => this.#save({ [key]: (ev.target as HTMLSelectElement).value || undefined })}
            >
              <option value="" ?selected=${!saved[key]}>
                ${t("energy.set.auto")} (${autoName(auto[key])})
              </option>
              ${choices.map((c) => html`<option value=${c.id} ?selected=${saved[key] === c.id}>${c.name}</option>`)}
            </select>
          </label>`;
        })}
        ${NUMBERS.map(
          ({ key, label, step }) =>
            html`<label class="field">
              <span>${t(label)}</span>
              <input
                type="number"
                inputmode="decimal"
                step=${step}
                min="0"
                data-energy=${key}
                .value=${saved[key] !== undefined ? String(saved[key]) : ""}
                @change=${(ev: Event) => {
                  const value = (ev.target as HTMLInputElement).value;
                  this.#save({ [key]: value === "" ? undefined : Number(value) });
                }}
              />
            </label>`,
        )}
        <label class="field">
          <span>${t("energy.set.install")}</span>
          <input
            type="date"
            data-energy="installDate"
            .value=${saved.installDate ?? ""}
            @change=${(ev: Event) => this.#save({ installDate: (ev.target as HTMLInputElement).value || undefined })}
          />
        </label>
      </div>

      <details>
        <summary>${t("energy.set.strings")} · ${pvChosen.size}</summary>
        <div class="checks">
          ${power.map(
            (p) =>
              html`<label class="check">
                <input
                  type="checkbox"
                  .checked=${pvChosen.has(p.id)}
                  @change=${(ev: Event) => {
                    const next = new Set(pvChosen);
                    if ((ev.target as HTMLInputElement).checked) next.add(p.id);
                    else next.delete(p.id);
                    this.#save({ pvPower: [...next].sort() });
                  }}
                />
                <span>${p.name}</span>
              </label>`,
          )}
        </div>
      </details>

      <details>
        <summary>${t("energy.consumers")} · ${consumersChosen.size}</summary>
        <div class="checks">
          ${power
            .filter((p) => !pvChosen.has(p.id))
            .map(
              (p) =>
                html`<label class="check">
                  <input
                    type="checkbox"
                    .checked=${consumersChosen.has(p.id)}
                    @change=${(ev: Event) => {
                      const current = saved.consumers ?? auto.consumers ?? [];
                      const checked = (ev.target as HTMLInputElement).checked;
                      const pairedEnergy = auto.consumers?.find((c) => c.power === p.id)?.energy;
                      const next = checked
                        ? [...current, pairedEnergy ? { power: p.id, energy: pairedEnergy } : { power: p.id }]
                        : current.filter((c) => c.power !== p.id);
                      this.#save({ consumers: next });
                    }}
                  />
                  <span>${p.name}</span>
                </label>`,
            )}
        </div>
      </details>
    </section>`;
  }

  static override styles = [
    shared,
    css`
      section {
        display: flex;
        flex-direction: column;
        gap: 10px;
        max-width: 640px;
      }
      .fields {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
        gap: 8px;
      }
      .field {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 10px 12px;
        border-radius: var(--a-radius);
        background: var(--a-s1);
        font-size: 13px;
        color: var(--a-text2);
      }
      select,
      input[type="number"],
      input[type="date"] {
        font: inherit;
        font-size: 15px;
        min-height: 40px;
        padding: 0 10px;
        border: 0;
        border-radius: 6px;
        background: var(--a-s3);
        color: var(--a-text);
        color-scheme: inherit;
      }
      details {
        border-radius: var(--a-radius);
        background: var(--a-s1);
        padding: 10px 12px;
      }
      summary {
        cursor: pointer;
        font-size: 15px;
        font-weight: 600;
        min-height: 32px;
        display: flex;
        align-items: center;
      }
      .checks {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
        gap: 4px;
        margin-top: 8px;
      }
      .check {
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 40px;
        font-size: 14px;
      }
      .check input {
        width: 20px;
        height: 20px;
        accent-color: var(--a-ocher);
      }
    `,
  ];
}
