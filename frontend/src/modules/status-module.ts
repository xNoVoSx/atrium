import { LitElement, css, html, nothing } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { icon } from "../components/icon";
import type { PanelContext } from "../context";
import { SelectorController } from "../data/entity-store";
import { lowBatteries, openItems } from "../data/home";
import { nameOf } from "../data/registry";
import { ICONS, shared } from "../theme/shared";
import { formatSince } from "../util/format";

/** Things that need attention: open doors/gates, low batteries. Empty when all is fine. */
export class AtriumStatusModule extends LitElement {
  static override properties = { ctx: { attribute: false } };

  declare ctx: PanelContext;

  #status = new SelectorController(
    this,
    () => this.ctx?.store,
    (hass) => ({
      open: openItems(hass).map((o) => ({
        ...o,
        name: nameOf(hass, o.entityId),
      })),
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
    return html`
      ${repeat(
        status.open,
        (o) => o.entityId,
        (o) =>
          html`<button class="banner open" type="button" @click=${() => this.#moreInfo(o.entityId)}>
            ${icon(ICONS.door, 28)}
            <span class="text">
              <span class="title">${o.name} ${t("status.open")}</span>
              <span class="sub">${t("status.since")} ${formatSince(o.since, now, locale)}</span>
            </span>
          </button>`,
      )}
      ${
        count
          ? html`<button
              class="banner battery"
              type="button"
              @click=${() => status.batteries[0] && this.#moreInfo(status.batteries[0].id)}
            >
              ${icon(ICONS.battery, 28)}
              <span class="text">
                <span class="title"
                  >${count} ${count === 1 ? t("status.battery") : t("status.batteries")}</span
                >
                <span class="sub"
                  >${status.batteries
                    .slice(0, 3)
                    .map((b) => `${b.name} ${b.value} %`)
                    .join(" · ")}</span
                >
              </span>
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
        gap: 10px;
      }
      .banner {
        all: unset;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 16px;
        border-radius: var(--a-radius);
        cursor: pointer;
        font-family: var(--a-font);
      }
      .banner:focus-visible {
        outline: 2px solid var(--a-ocher);
        outline-offset: 2px;
      }
      .open {
        background: var(--a-terra);
        color: #fff;
      }
      .battery {
        background: var(--a-s2);
        color: var(--a-text);
      }
      .battery svg {
        color: var(--a-terra-text);
      }
      .text {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .title {
        font-size: 17px;
        font-weight: 600;
      }
      .sub {
        font-size: 13px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .battery .sub {
        color: var(--a-text2);
      }
    `,
  ];
}
