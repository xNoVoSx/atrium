import { LitElement, css, html, nothing } from "lit";
import type { PanelContext } from "../context";
import type { MessageKey } from "../i18n";
import { WIDGETS } from "../widgets/catalog";
import { WIDGET_GROUPS, type WidgetDef } from "../widgets/types";
import { icon } from "./icon";

/**
 * The widget catalogue: grouped, searchable, with a live preview (sample
 * data when the integration is not installed). Fires `atrium-add-widget`
 * with the type.
 */
export class AtriumWidgetPicker extends LitElement {
  static override properties = {
    ctx: { attribute: false },
    _query: { state: true },
    _preview: { state: true },
    _onlyAvailable: { state: true },
    _variant: { state: true },
  };

  declare ctx: PanelContext;
  declare _query: string;
  declare _preview: string | null;
  declare _onlyAvailable: boolean;
  /** Design picked in the open preview. */
  declare _variant: string | null;

  constructor() {
    super();
    this._query = "";
    this._preview = null;
    this._onlyAvailable = false;
    this._variant = null;
  }

  #add(def: WidgetDef): void {
    const variant = this._preview === def.type ? this._variant : null;
    this.dispatchEvent(
      new CustomEvent("atrium-add-widget", {
        detail: variant ? `${def.type}|${variant}` : def.type,
        bubbles: true,
        composed: true,
      }),
    );
  }

  protected override render() {
    const { t } = this.ctx;
    const hass = this.ctx.store.rawHass;
    const q = this._query.trim().toLowerCase();
    const avail = new Map(WIDGETS.map((w) => [w.type, hass ? w.available(hass) : false]));
    const matches = (w: WidgetDef) =>
      (!this._onlyAvailable || avail.get(w.type)) &&
      (!q ||
        t(w.name).toLowerCase().includes(q) ||
        t(w.description).toLowerCase().includes(q) ||
        (w.integrations ?? []).some((i) => i.includes(q)));
    return html`<div class="picker">
      <h2>${t("w.add_widget")}</h2>
      <div class="bar">
        <input
          type="search"
          placeholder=${t("w.search")}
          .value=${this._query}
          @input=${(e: Event) => (this._query = (e.target as HTMLInputElement).value)}
        />
        <label class="only"
          ><input
            type="checkbox"
            .checked=${this._onlyAvailable}
            @change=${(e: Event) => (this._onlyAvailable = (e.target as HTMLInputElement).checked)}
          />${t("w.only_available")}</label
        >
      </div>
      ${WIDGET_GROUPS.map((g) => {
        const list = WIDGETS.filter((w) => w.group === g && matches(w)).sort(
          (a, b) => Number(avail.get(b.type)) - Number(avail.get(a.type)),
        );
        if (!list.length) return nothing;
        return html`<section>
          <h3>${t(`wg.${g}` as MessageKey)}</h3>
          ${list.map((w) => {
            const ok = avail.get(w.type);
            const open = this._preview === w.type;
            return html`<div class="item ${ok ? "" : "na"}" data-widget=${w.type}>
              <div class="top">
                <span class="ico">${icon(w.icon, 20, 2)}</span>
                <span class="txt">
                  <b>${t(w.name)}</b>
                  <small>${t(w.description)}</small>
                  ${!ok && w.integrations?.length ? html`<small class="needs">${t("w.needs")} ${w.integrations.slice(0, 4).join(", ")}</small>` : nothing}
                </span>
                ${
                  w.demo || ok
                    ? html`<button
                        type="button"
                        class="ghost"
                        aria-expanded=${String(open)}
                        @click=${() => {
                          this._preview = open ? null : w.type;
                          this._variant = null;
                        }}
                      >
                        ${t("w.preview")}
                      </button>`
                    : nothing
                }
                <button type="button" class="add" @click=${() => this.#add(w)}>${t("w.add")}</button>
              </div>
              ${
                open
                  ? html`${
                        w.variants?.length
                          ? html`<div class="vchips" role="group" aria-label=${t("wo.design")}>
                              ${w.variants.map(
                                ([v, label], i) =>
                                  html`<button
                                    type="button"
                                    data-variant=${v}
                                    aria-pressed=${String((this._variant ?? w.variants?.[0]?.[0]) === v)}
                                    @click=${() => (this._variant = i === 0 ? null : v)}
                                  >
                                    ${t(label)}
                                  </button>`,
                              )}
                            </div>`
                          : nothing
                      }
                      <div class="preview">
                        ${w.render(
                          this.ctx,
                          {
                            id: `preview-${w.type}`,
                            type: w.type,
                            ...(this._variant ? { options: { variant: this._variant } } : {}),
                          },
                          !ok || Boolean(w.setup),
                        )}
                      </div>`
                  : nothing
              }
            </div>`;
          })}
        </section>`;
      })}
    </div>`;
  }

  static override styles = css`
    :host {
      display: block;
      font-family: var(--a-font);
      color: var(--a-text);
    }
    .picker {
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding-bottom: 12px;
    }
    h2 {
      margin: 0;
      font-size: 22px;
      font-weight: 600;
    }
    .bar {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 1;
      background: var(--a-s1);
      padding: 4px 0 8px;
    }
    input[type="search"] {
      flex: 1;
      min-width: 180px;
      min-height: 44px;
      border: 0;
      border-radius: var(--a-radius);
      background: var(--a-s2);
      color: var(--a-text);
      font: inherit;
      font-size: 15px;
      padding: 0 12px;
    }
    .only {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: var(--a-text2);
    }
    .only input {
      width: 20px;
      height: 20px;
      accent-color: var(--a-ocher);
    }
    section {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    h3 {
      margin: 6px 0 0;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--a-text2);
    }
    .item {
      background: var(--a-s2);
      border-radius: var(--a-radius);
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .top {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .ico {
      width: 36px;
      height: 36px;
      border-radius: var(--a-radius);
      background: var(--a-s3);
      display: flex;
      align-items: center;
      justify-content: center;
      flex: none;
    }
    .na .ico {
      opacity: 0.5;
    }
    .txt {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    .txt b {
      font-size: 15px;
    }
    .txt small {
      font-size: 12px;
      color: var(--a-text2);
    }
    .needs {
      color: var(--a-text3) !important;
      font-style: italic;
    }
    button {
      border: 0;
      border-radius: var(--a-radius);
      min-height: 38px;
      padding: 0 12px;
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      flex: none;
    }
    .ghost {
      background: var(--a-s3);
      color: var(--a-text);
    }
    .add {
      background: var(--a-ocher);
      color: var(--a-on-ocher);
    }
    button:focus-visible,
    input:focus-visible {
      outline: 2px solid var(--a-ocher);
      outline-offset: 2px;
    }
    .vchips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .vchips button {
      min-height: 32px;
      border-radius: 16px;
      background: var(--a-s3);
      color: var(--a-text);
      font-size: 12px;
    }
    .vchips button[aria-pressed="true"] {
      background: var(--a-text);
      color: var(--a-bg);
    }
    .preview {
      --a-s1: var(--a-bg);
    }
    @media (max-width: 520px) {
      .top {
        flex-wrap: wrap;
      }
      .txt {
        flex-basis: calc(100% - 50px);
      }
      .ghost {
        margin-left: 46px;
      }
    }
  `;
}
