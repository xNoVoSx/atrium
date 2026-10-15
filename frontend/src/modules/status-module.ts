import { LitElement, css, html, nothing } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { icon } from "../components/icon";
import type { PanelContext } from "../context";
import { SelectorController } from "../data/entity-store";
import { garageDoors, lowBatteries, openItems } from "../data/home";
import { setEntityHidden } from "../data/layout";
import { areaIdOf, nameOf, withoutArea } from "../data/registry";
import { ICONS, shared } from "../theme/shared";
import { formatSince } from "../util/format";

/**
 * Slim rows at the top: garage doors always (green closed, red open), open
 * doors/windows and low batteries only when they need attention. In edit mode
 * admins can hide a row's entity.
 */
export class AtriumStatusModule extends LitElement {
  static override properties = { ctx: { attribute: false }, variant: { reflect: true } };

  declare ctx: PanelContext;
  /** Design: rows (default), chips or cards. */
  declare variant: string | undefined;

  #status = new SelectorController(
    this,
    () => this.ctx?.store,
    (hass) => ({
      garages: garageDoors(hass).map((g) => {
        const area = areaIdOf(hass, g.entityId);
        return {
          ...g,
          name: withoutArea(nameOf(hass, g.entityId), area ? hass.areas[area]?.name : undefined),
        };
      }),
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

  #hideButton(entityId: string) {
    if (!this.ctx.editing || !this.ctx.isAdmin) return nothing;
    return html`<button
      class="hide"
      type="button"
      aria-label=${this.ctx.t("edit.hide")}
      @click=${(ev: Event) => {
        ev.stopPropagation();
        this.ctx.saveLayout(setEntityHidden(this.ctx.layout, entityId, true));
      }}
    >
      ${icon(ICONS.close, 16, 2.2)}
    </button>`;
  }

  #moreInfo(entityId: string): void {
    this.dispatchEvent(
      new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }),
    );
  }

  protected override render() {
    const status = this.#status.value;
    if (!status || (!status.garages.length && !status.open.length && !status.batteries.length))
      return nothing;
    const { t, locale } = this.ctx;
    const now = new Date();
    const count = status.batteries.length;
    const first = status.batteries[0];
    return html`
      ${repeat(
        status.garages,
        (g) => g.entityId,
        (g) =>
          html`<div class="line">
            <button
              class="row ${g.open ? "open" : "closed"}"
              type="button"
              data-garage=${g.entityId}
              @click=${() => this.#moreInfo(g.entityId)}
            >
              ${icon(ICONS.garage, 20, 2)}
              <span class="title">${g.name} ${g.open ? t("status.open") : t("status.closed")}</span>
              ${g.open ? html`<span class="meta">${formatSince(g.since, now, locale)}</span>` : nothing}
            </button>
            ${this.#hideButton(g.entityId)}
          </div>`,
      )}
      ${repeat(
        status.open,
        (o) => o.entityId,
        (o) =>
          html`<div class="line">
            <button class="row open" type="button" @click=${() => this.#moreInfo(o.entityId)}>
              ${icon(ICONS.window, 20, 2)}
              <span class="title">${o.name} ${t("status.open")}</span>
              <span class="meta">${formatSince(o.since, now, locale)}</span>
            </button>
            ${this.#hideButton(o.entityId)}
          </div>`,
      )}
      ${
        count && first
          ? html`<button
              class="row battery"
              type="button"
              data-batteries
              @click=${() => this.ctx.navigate({ page: "category", category: "batteries" })}
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
      .line {
        display: flex;
        gap: 6px;
      }
      .line .row {
        flex: 1;
        min-width: 0;
      }
      .hide {
        flex: none;
        width: 44px;
        border: 0;
        border-radius: var(--a-radius);
        background: var(--a-s3);
        color: var(--a-text);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .open {
        background: var(--a-terra);
        color: #fff;
      }
      .closed {
        background: var(--a-sage);
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
      /* Design "chips" */
      :host([variant="chips"]) {
        flex-direction: row;
        flex-wrap: wrap;
      }
      :host([variant="chips"]) .line {
        display: inline-flex;
      }
      :host([variant="chips"]) .row {
        min-height: 36px;
        border-radius: 18px;
        padding: 0 12px;
        font-size: 13px;
        gap: 6px;
      }
      /* Design "cards" */
      :host([variant="cards"]) {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      }
      :host([variant="cards"]) .row {
        min-height: 76px;
        flex-direction: column;
        align-items: flex-start;
        justify-content: center;
        gap: 4px;
        padding: 10px 14px;
      }
      :host([variant="cards"]) .title {
        font-size: 15px;
      }
    `,
  ];
}
