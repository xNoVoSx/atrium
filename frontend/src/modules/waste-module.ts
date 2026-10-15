import { LitElement, css, html, nothing } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { icon } from "../components/icon";
import type { PanelContext } from "../context";
import { SelectorController } from "../data/entity-store";
import { daysUntil, localDate, wastePickups } from "../data/home";
import type { Translate } from "../i18n";
import { ICONS, shared } from "../theme/shared";

const SHOWN = 3;

export function relativeDay(t: Translate, days: number): string {
  if (days === 0) return t("waste.today");
  if (days === 1) return t("waste.tomorrow");
  return t("waste.in_days").replace("{n}", String(days));
}

/** Next pickups from Waste Collection Schedule; today and tomorrow stand out. */
export class AtriumWasteModule extends LitElement {
  static override properties = { ctx: { attribute: false } };

  declare ctx: PanelContext;

  // Recomputed on state changes; the date in the key makes it roll over at midnight too.
  #pickups = new SelectorController(
    this,
    () => this.ctx?.store,
    (hass) => {
      const today = localDate(new Date());
      return wastePickups(hass, today)
        .slice(0, SHOWN)
        .map((p) => ({ ...p, days: daysUntil(p.date, today) }));
    },
  );

  protected override willUpdate(): void {
    this.#pickups.attach();
  }

  protected override render() {
    const pickups = this.#pickups.value ?? [];
    const [next, ...later] = pickups;
    if (!next) return nothing;
    const { t, locale } = this.ctx;
    const weekday = (date: string) =>
      new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" }).format(
        new Date(`${date}T12:00:00`),
      );
    const soon = next.days <= 1;
    return html`
      <h2 class="label">${t("waste.title")}</h2>
      <div class="next ${soon ? "soon" : ""}">
        ${icon(ICONS.trash, 28)}
        <div class="text">
          <div class="types">${next.types.join(" · ")}</div>
          <div class="when">${relativeDay(t, next.days)} · ${weekday(next.date)}</div>
        </div>
      </div>
      ${
        later.length
          ? html`<div class="later">
              ${repeat(
                later,
                (p) => p.date,
                (p) =>
                  html`<div class="item">
                    <span class="types">${p.types.join(" · ")}</span>
                    <span class="when">${weekday(p.date)}</span>
                  </div>`,
              )}
            </div>`
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
      .next {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 16px;
        border-radius: var(--a-radius);
        background: var(--a-s1);
      }
      .next.soon {
        background: var(--a-ocher);
        color: var(--a-on-ocher);
        box-shadow: none;
      }
      .next .types {
        font-size: 17px;
        font-weight: 600;
      }
      .next .when {
        font-size: 13px;
        font-weight: 500;
      }
      .next:not(.soon) .when {
        color: var(--a-text2);
      }
      .later {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 8px;
      }
      .item {
        padding: 10px 12px;
        border-radius: var(--a-radius);
        background: var(--a-s1);
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .item .types {
        font-size: 14px;
        font-weight: 600;
      }
      .item .when {
        font-size: 12px;
        color: var(--a-text2);
      }
    `,
  ];
}
