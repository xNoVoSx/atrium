// Rooms overview, categories and settings. Small pages that mostly arrange modules.

import { LitElement, css, html, nothing } from "lit";
import { repeat } from "lit/directives/repeat.js";
import type { PanelContext } from "../context";
import { StructureController } from "../data/entity-store";
import { climateZones } from "../data/home";
import { groupByArea } from "../data/registry";
import type { MessageKey } from "../i18n";
import { shared } from "../theme/shared";
import type { ThemePreference } from "../theme/tokens";

export class AtriumRoomsPage extends LitElement {
  static override properties = { ctx: { attribute: false } };
  declare ctx: PanelContext;

  protected override render() {
    return html`<h1>${this.ctx.t("nav.rooms")}</h1>
      <atrium-rooms-module .ctx=${this.ctx} .heading=${false} large></atrium-rooms-module>`;
  }

  static override styles = [shared, pageStyles()];
}

export class AtriumCategoriesPage extends LitElement {
  static override properties = { ctx: { attribute: false } };
  declare ctx: PanelContext;

  protected override render() {
    const { t, navigate } = this.ctx;
    const entries: Array<[string, MessageKey, MessageKey]> = [
      ["light", "section.lights", "categories.lights"],
      ["climate", "section.heating", "categories.heating"],
    ];
    return html`<h1>${t("nav.categories")}</h1>
      <div class="list">
        ${entries.map(
          ([id, title, sub]) =>
            html`<button type="button" @click=${() => navigate({ page: "category", category: id })}>
              <span class="title">${t(title)}</span><span class="sub">${t(sub)}</span>
            </button>`,
        )}
      </div>
      <p class="hint">${t("categories.later")}</p>`;
  }

  static override styles = [
    shared,
    pageStyles(),
    css`
      .list {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: 10px;
      }
      .list button {
        border: 0;
        border-radius: var(--a-radius);
        background: var(--a-s1);
        color: var(--a-text);
        padding: 18px;
        text-align: left;
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-height: 88px;
      }
      .title {
        font-size: 20px;
        font-weight: 600;
      }
      .sub {
        font-size: 13px;
        color: var(--a-text2);
      }
    `,
  ];
}

/** A category: everything of one kind, grouped by room. */
export class AtriumCategoryPage extends LitElement {
  static override properties = { ctx: { attribute: false }, category: {} };
  declare ctx: PanelContext;
  declare category: string;

  #structure = new StructureController(this, () => this.ctx?.store);

  protected override willUpdate(): void {
    this.#structure.attach();
  }

  protected override render() {
    const hass = this.ctx.store.hass;
    if (!hass) return nothing;
    const { t } = this.ctx;
    if (this.category === "climate") {
      const areas = [...new Set(climateZones(hass).map((id) => hass.entities[id]?.area_id ?? null))];
      return html`<h1>${t("section.heating")}</h1>
        ${
          areas.length
            ? html`<atrium-climate-module .ctx=${this.ctx}></atrium-climate-module>`
            : html`<p class="hint">—</p>`
        }`;
    }
    const groups = groupByArea(hass, "light");
    return html`<h1>${t("section.lights")}</h1>
      ${repeat(
        groups,
        (g) => g.areaId ?? "",
        (g) =>
          html`<section>
            <h2 class="label">${g.areaId ? (hass.areas[g.areaId]?.name ?? g.areaId) : t("area.none")}</h2>
            <div class="grid">
              ${repeat(
                g.entityIds,
                (id) => id,
                (id) =>
                  html`<atrium-light-tile
                    .entityId=${id}
                    .store=${this.ctx.store}
                    .t=${t}
                  ></atrium-light-tile>`,
              )}
            </div>
          </section>`,
      )}
      <p class="hint">${t("hint.controls")}</p>`;
  }

  static override styles = [
    shared,
    pageStyles(),
    css`
      section {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
    `,
  ];
}

export class AtriumSettingsPage extends LitElement {
  static override properties = {
    ctx: { attribute: false },
    theme: {},
    version: {},
  };
  declare ctx: PanelContext;
  declare theme: ThemePreference;
  declare version: string;

  protected override render() {
    const { t } = this.ctx;
    const themes: ThemePreference[] = ["auto", "dark", "light"];
    return html`<h1>${t("settings.title")}</h1>
      <section>
        <h2 class="label">${t("theme.label")}</h2>
        <div class="seg" role="group" aria-label=${t("theme.label")}>
          ${themes.map(
            (pref) =>
              html`<button
                type="button"
                data-theme=${pref}
                aria-pressed=${String(this.theme === pref)}
                @click=${() =>
                  this.dispatchEvent(
                    new CustomEvent("atrium-theme", { detail: pref, bubbles: true, composed: true }),
                  )}
              >
                ${t(`theme.${pref}` as MessageKey)}
              </button>`,
          )}
        </div>
      </section>
      <p class="hint">${t("settings.later")}</p>
      <p class="hint">${t("settings.version")} ${this.version}</p>`;
  }

  static override styles = [
    shared,
    pageStyles(),
    css`
      section {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .seg {
        display: inline-flex;
        align-self: flex-start;
        gap: 4px;
        background: var(--a-s1);
        border-radius: var(--a-radius);
        padding: 4px;
      }
      .seg button {
        min-height: 44px;
        padding: 0 16px;
        border: 0;
        border-radius: 4px;
        background: transparent;
        color: var(--a-text2);
        font-size: 14px;
        font-weight: 600;
      }
      .seg button[aria-pressed="true"] {
        background: var(--a-text);
        color: var(--a-bg);
      }
    `,
  ];
}

function pageStyles() {
  return css`
    :host {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    h1 {
      margin: 4px 0 0;
      font-size: 34px;
      font-weight: 600;
      letter-spacing: -0.03em;
    }
    .hint {
      margin: 0;
      font-size: 13px;
      color: var(--a-text2);
    }
  `;
}
