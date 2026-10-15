import { LitElement, css, html, nothing } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { icon } from "../components/icon";
import type { PanelContext } from "../context";
import { SelectorController } from "../data/entity-store";
import { lowBatteries, openItems } from "../data/home";
import { nameOf } from "../data/registry";
import { ICONS, shared } from "../theme/shared";
import { formatSince } from "../util/format";

/**
 * Things that need attention, as slim rows: open doors/gates/windows and low
 * batteries. Nothing at all when everything is fine.
 */
export class AtriumStatusModule extends LitElement {
  static override properties = { ctx: { attribute: false } };

  declare ctx: PanelContext;

  #status = new SelectorController(
    this,
    () => this.ctx?.store,
    (hass) => ({
      open: openItems(hass).map((o) => ({ ...o, name: nameOf(hass, o.entityId) })),
      batteries: lowBatteries(hass).map((id) => ({
        id,
        name: nameOf(hass, id),
        value: hass.states[id]?.state ?? "",
      })),
    }),
  );

  protected override willUpdate(): void {
    this.#status.attach();
  }

  #moreInfo(entityId: string): void {
    this.dispatchEvent(
      new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }),
    );
  }

  protected override render() {
    const status = this.#status.value;
    if (!status || (!status.open.length && !status.batteries.length)) return nothing;
    const { t, locale } = this.ctx;
    const now = new Date();
    const count = status.batteries.length;
    const first = status.batteries[0];
    return html`
      ${repeat(
        status.open,
        (o) => o.entityId,
        (o) =>
          html`<button class="row open" type="button" @click=${() => this.#moreInfo(o.entityId)}>
            ${icon(ICONS.door, 20, 2)}
            <span class="title">${o.name} ${t("status.open")}</span>
            <span class="meta">${formatSince(o.since, now, locale)}</span>
          </button>`,
      )}
      ${
        count && first
          ? html`<button
              class="row battery"
              type="button"
              title=${status.batteries.map((b) => `${b.name} ${b.value} %`).join("\n")}
              @click=${() => this.#moreInfo(first.id)}
            >
              ${icon(ICONS.battery, 20, 2)}
              <span class="title">${count} ${count === 1 ? t("status.battery") : t("status.batteries")}</span>
              <span class="meta">${first.value} %</span>
            </button>`
          : nothing
      }
    `;
  }

  static override styles = [
    shared,
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .row {
        all: unset;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 44px;
        padding: 0 14px;
        border-radius: var(--a-radius);
        cursor: pointer;
        font-family: var(--a-font);
      }
      .row:focus-visible {
        outline: 2px solid var(--a-ocher);
        outline-offset: 2px;
      }
      .row svg {
        flex: none;
      }
      .open {
        background: var(--a-terra);
        color: #fff;
      }
      .battery {
        background: var(--a-s1);
        color: var(--a-text);
      }
      .battery svg {
        color: var(--a-terra-text);
      }
      .title {
        flex: 1;
        min-width: 0;
        font-size: 15px;
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .meta {
        flex: none;
        font-size: 13px;
        font-weight: 500;
      }
      .battery .meta {
        color: var(--a-text2);
      }
    `,
  ];
}
