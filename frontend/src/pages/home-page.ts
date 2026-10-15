import { LitElement, css, html } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { StructureController, type EntityStore } from "../data/entity-store";
import { groupByArea } from "../data/registry";
import type { Translate } from "../i18n";

/**
 * Home page of the skeleton: all visible lights grouped by area. Re-renders
 * only when the structure changes; tiles update themselves.
 */
export class AtriumHomePage extends LitElement {
  static override properties = {
    store: { attribute: false },
    t: { attribute: false },
  };

  declare store: EntityStore | undefined;
  declare t: Translate;

  #structure = new StructureController(this, () => this.store);

  protected override willUpdate(): void {
    this.#structure.attach();
  }

  protected override render() {
    const hass = this.store?.hass;
    if (!hass) return html``;
    const groups = groupByArea(hass, "light");
    return html`
      <h2 class="label">${this.t("section.lights")}</h2>
      ${repeat(
        groups,
        (g) => g.areaId ?? "",
        (g) => html`
          <section>
            <h3>${g.areaId ? (hass.areas[g.areaId]?.name ?? g.areaId) : this.t("area.none")}</h3>
            <div class="grid">
              ${repeat(
                g.entityIds,
                (id) => id,
                (id) =>
                  html`<atrium-light-tile
                    .entityId=${id}
                    .store=${this.store}
                    .t=${this.t}
                  ></atrium-light-tile>`,
              )}
            </div>
          </section>
        `,
      )}
      <p class="hint">${this.t("hint.controls")}</p>
    `;
  }

  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .label {
      margin: 0;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--a-text2);
    }
    section {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    h3 {
      margin: 6px 0 0;
      font-size: 15px;
      font-weight: 600;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 10px;
    }
    .hint {
      margin: 0;
      font-size: 13px;
      color: var(--a-text2);
    }
  `;
}
