import { LitElement, css, html, nothing } from "lit";
import { repeat } from "lit/directives/repeat.js";
import type { PanelContext } from "../context";
import { SelectorController } from "../data/entity-store";
import { lightEntities } from "../data/home";
import { shared } from "../theme/shared";

/**
 * Light tiles. On the home page all visible lights for now; favourites
 * replace this list once they can be chosen (settings, step 6).
 */
export class AtriumLightsModule extends LitElement {
  static override properties = {
    ctx: { attribute: false },
    areaId: { attribute: "area-id" },
    heading: { type: Boolean },
  };

  declare ctx: PanelContext;
  declare areaId: string | undefined;
  declare heading: boolean;

  // Only the list of ids: tiles update themselves on state changes.
  #ids = new SelectorController(
    this,
    () => this.ctx?.store,
    (hass) => lightEntities(hass, this.areaId),
  );

  constructor() {
    super();
    this.heading = true;
  }

  protected override willUpdate(): void {
    this.#ids.attach();
  }

  protected override render() {
    const ids = this.#ids.value ?? [];
    if (!ids.length) return nothing;
    const { store, t } = this.ctx;
    return html`
      ${this.heading ? html`<h2 class="label">${t("section.lights")}</h2>` : nothing}
      <div class="grid">
        ${repeat(
          ids,
          (id) => id,
          (id) => html`<atrium-light-tile .entityId=${id} .store=${store} .t=${t}></atrium-light-tile>`,
        )}
      </div>
    `;
  }

  static override styles = [
    shared,
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
    `,
  ];
}
