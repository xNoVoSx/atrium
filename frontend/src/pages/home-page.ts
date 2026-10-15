import { LitElement, css, html } from "lit";
import type { PanelContext } from "../context";
import { HOME_PAGE } from "../data/pages";

/** Home page: the widgets of the "home" page (see data/pages.ts). */
export class AtriumHomePage extends LitElement {
  static override properties = { ctx: { attribute: false } };

  declare ctx: PanelContext;

  protected override render() {
    return html`<atrium-widget-page .ctx=${this.ctx} .pageId=${HOME_PAGE}></atrium-widget-page>`;
  }

  static override styles = css`
    :host {
      display: block;
    }
  `;
}
