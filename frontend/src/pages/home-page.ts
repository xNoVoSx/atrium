import { LitElement, css, html } from "lit";
import { repeat } from "lit/directives/repeat.js";
import type { PanelContext } from "../context";
import { homeModules, type HomeModule } from "../data/layout";

/** Home page: the modules from the layout, one column on phones, two on wide screens. */
export class AtriumHomePage extends LitElement {
  static override properties = { ctx: { attribute: false } };

  declare ctx: PanelContext;

  #module(id: HomeModule) {
    const ctx = this.ctx;
    switch (id) {
      case "header":
        return html`<atrium-header-module class="wide" .ctx=${ctx}></atrium-header-module>`;
      case "status":
        return html`<atrium-status-module class="wide" .ctx=${ctx}></atrium-status-module>`;
      case "climate":
        return html`<atrium-climate-module class="a" .ctx=${ctx}></atrium-climate-module>`;
      case "lights":
        return html`<atrium-lights-module class="b" .ctx=${ctx} compact home></atrium-lights-module>`;
      case "scenes":
        return html`<atrium-scenes-module class="a" .ctx=${ctx}></atrium-scenes-module>`;
      case "waste":
        return html`<atrium-waste-module class="a" .ctx=${ctx}></atrium-waste-module>`;
      case "rooms":
        return html`<atrium-rooms-module class="b" .ctx=${ctx}></atrium-rooms-module>`;
    }
  }

  protected override render() {
    return html`${repeat(
      homeModules(this.ctx.layout),
      (id) => id,
      (id) => this.#module(id),
    )}`;
  }

  static override styles = css`
    :host {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 18px;
      align-items: start;
    }
    @media (min-width: 900px) {
      :host {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        grid-auto-flow: row dense;
        column-gap: 20px;
      }
      .wide {
        grid-column: 1 / -1;
      }
      .a {
        grid-column: 1;
      }
      .b {
        grid-column: 2;
      }
    }
  `;
}
