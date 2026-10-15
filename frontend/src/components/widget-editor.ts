import { LitElement, css, html, nothing } from "lit";
import type { PanelContext } from "../context";
import { LEVELS, type Level } from "../data/levels";
import { page, updateWidget, WIDGET_SIZES, type WidgetInstance, type WidgetSize } from "../data/pages";
import { nameOf } from "../data/registry";
import { withoutKey } from "../util/object";
import type { MessageKey } from "../i18n";
import { widgetDef } from "../widgets/catalog";
import { SKINS } from "../widgets/skins";
import type { OptionField } from "../widgets/types";

/**
 * Settings of one widget on a page: heading, size, who sees it, and the
 * widget's own options. Every change is saved at once (the page behind
 * shows it live).
 */
export class AtriumWidgetEditor extends LitElement {
  static override properties = {
    ctx: { attribute: false },
    pageId: { attribute: false },
    widgetId: { attribute: false },
  };

  declare ctx: PanelContext;
  declare pageId: string;
  declare widgetId: string;

  #widget(): WidgetInstance | undefined {
    return page(this.ctx.layout, this.pageId)?.widgets.find((w) => w.id === this.widgetId);
  }

  #patch(patch: Partial<Omit<WidgetInstance, "id">>): void {
    this.ctx.saveLayout(updateWidget(this.ctx.layout, this.pageId, this.widgetId, patch));
  }

  #setOption(key: string, value: unknown): void {
    const w = this.#widget();
    const empty =
      value === "" || value === undefined || value === null || (Array.isArray(value) && !value.length);
    const options = withoutKey({ ...w?.options }, key);
    if (!empty) options[key] = value;
    this.#patch({ options: Object.keys(options).length ? options : undefined });
  }

  #entityChoices(domains: string[] | undefined): Array<{ id: string; name: string }> {
    const hass = this.ctx.store.rawHass;
    if (!hass) return [];
    return Object.keys(hass.states)
      .filter((id) => !domains?.length || domains.includes(id.split(".")[0] ?? ""))
      .map((id) => ({ id, name: nameOf(hass, id) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  #field(f: OptionField, value: unknown) {
    const { t } = this.ctx;
    const label = html`<span class="fl">${t(f.label)}</span>`;
    switch (f.kind) {
      case "boolean":
        return html`<label class="field row">
          ${label}
          <input
            type="checkbox"
            .checked=${value === true}
            @change=${(e: Event) => this.#setOption(f.key, (e.target as HTMLInputElement).checked || undefined)}
          />
        </label>`;
      case "number":
        return html`<label class="field">
          ${label}
          <input
            type="number"
            min=${f.min ?? nothing}
            max=${f.max ?? nothing}
            .value=${value === undefined ? "" : String(value)}
            @change=${(e: Event) => {
              const v = (e.target as HTMLInputElement).value;
              this.#setOption(f.key, v === "" ? undefined : Number(v));
            }}
          />
        </label>`;
      case "select":
        return html`<label class="field">
          ${label}
          <select
            @change=${(e: Event) => this.#setOption(f.key, (e.target as HTMLSelectElement).value || undefined)}
          >
            <option value="" ?selected=${!value}>${t("wo.default")}</option>
            ${(f.choices ?? []).map(([v, l]) => html`<option value=${v} ?selected=${value === v}>${t(l)}</option>`)}
          </select>
        </label>`;
      case "area": {
        const areas = Object.values(this.ctx.store.rawHass?.areas ?? {}).sort((a, b) =>
          a.name.localeCompare(b.name),
        );
        return html`<label class="field">
          ${label}
          <select
            @change=${(e: Event) => this.#setOption(f.key, (e.target as HTMLSelectElement).value || undefined)}
          >
            <option value="" ?selected=${!value}>${t("wo.all_areas")}</option>
            ${areas.map((a) => html`<option value=${a.area_id} ?selected=${value === a.area_id}>${a.name}</option>`)}
          </select>
        </label>`;
      }
      case "text":
        return html`<label class="field">
          ${label}
          <textarea
            rows="4"
            placeholder=${f.placeholder ?? ""}
            .value=${typeof value === "string" ? value : ""}
            @change=${(e: Event) => this.#setOption(f.key, (e.target as HTMLTextAreaElement).value)}
          ></textarea>
        </label>`;
      case "url":
        return html`<label class="field">
          ${label}
          <input
            type="url"
            placeholder="https://"
            .value=${typeof value === "string" ? value : ""}
            @change=${(e: Event) => this.#setOption(f.key, (e.target as HTMLInputElement).value.trim())}
          />
        </label>`;
      case "entity": {
        const listId = `dl-${f.key}`;
        const choices = this.#entityChoices(f.domains);
        return html`<label class="field">
          ${label}
          <input
            list=${listId}
            placeholder=${t("wo.auto")}
            .value=${typeof value === "string" ? value : ""}
            @change=${(e: Event) => this.#setOption(f.key, (e.target as HTMLInputElement).value.trim())}
          />
          <datalist id=${listId}>
            ${choices.map((c) => html`<option value=${c.id}>${c.name}</option>`)}
          </datalist>
        </label>`;
      }
      case "entities": {
        const chosen = Array.isArray(value) ? (value as string[]) : [];
        const listId = `dl-${f.key}`;
        const choices = this.#entityChoices(f.domains).filter((c) => !chosen.includes(c.id));
        const hass = this.ctx.store.rawHass;
        return html`<div class="field">
          ${label}
          ${
            chosen.length
              ? html`<div class="chosen">
                  ${chosen.map(
                    (id, i) =>
                      html`<div class="pick">
                        <span>${hass ? nameOf(hass, id) : id}<small>${id}</small></span>
                        <button
                          type="button"
                          aria-label=${t("settings.up")}
                          ?disabled=${i === 0}
                          @click=${() => this.#setOption(f.key, move(chosen, i, -1))}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          aria-label=${t("w.remove")}
                          @click=${() =>
                            this.#setOption(
                              f.key,
                              chosen.filter((x) => x !== id),
                            )}
                        >
                          ✕
                        </button>
                      </div>`,
                  )}
                </div>`
              : html`<p class="hint">${t("wo.auto_hint")}</p>`
          }
          <input
            list=${listId}
            placeholder=${t("wo.add_entity")}
            @change=${(e: Event) => {
              const input = e.target as HTMLInputElement;
              const id = input.value.trim();
              input.value = "";
              if (id && this.ctx.store.rawHass?.states[id]) this.#setOption(f.key, [...chosen, id]);
            }}
          />
          <datalist id=${listId}>
            ${choices.slice(0, 400).map((c) => html`<option value=${c.id}>${c.name}</option>`)}
          </datalist>
        </div>`;
      }
    }
  }

  protected override render() {
    const w = this.#widget();
    const def = w ? widgetDef(w.type) : undefined;
    if (!w || !def) return nothing;
    const { t } = this.ctx;
    const sizes = def.sizes ?? WIDGET_SIZES;
    const size = w.size ?? def.size;
    return html`<div class="editor">
      <h2>${t(def.name)}</h2>
      <p class="hint">${t(def.description)}</p>
      <label class="field">
        <span class="fl">${t("wo.title")}</span>
        <input
          .value=${w.title ?? ""}
          placeholder=${t(def.name)}
          @change=${(e: Event) => this.#patch({ title: (e.target as HTMLInputElement).value.trim() || undefined })}
        />
      </label>
      ${
        sizes.length > 1
          ? html`<div class="field">
              <span class="fl">${t("wo.size")}</span>
              <div class="seg">
                ${sizes.map(
                  (s: WidgetSize) =>
                    html`<button
                      type="button"
                      aria-pressed=${String(size === s)}
                      @click=${() => this.#patch({ size: s === def.size ? undefined : s })}
                    >
                      ${t(`wo.size_${s}` as MessageKey)}
                    </button>`,
                )}
              </div>
            </div>`
          : nothing
      }
      ${
        size !== "l"
          ? html`<div class="field">
              <span class="fl">${t("wo.column")}</span>
              <div class="seg">
                ${([undefined, 1, 2] as const).map(
                  (c) =>
                    html`<button
                      type="button"
                      aria-pressed=${String(w.col === c)}
                      @click=${() => this.#patch({ col: c })}
                    >
                      ${t(c === 1 ? "wo.col_left" : c === 2 ? "wo.col_right" : "wo.auto")}
                    </button>`,
                )}
              </div>
            </div>`
          : nothing
      }
      ${
        def.variants?.length
          ? html`<div class="field">
              <span class="fl">${t("wo.design")}</span>
              <div class="designs">
                ${def.variants.map(
                  ([v, label], i) =>
                    html`<button
                      type="button"
                      data-variant=${v}
                      aria-pressed=${String((w.options?.variant ?? def.variants?.[0]?.[0]) === v)}
                      @click=${() => this.#setOption("variant", i === 0 ? undefined : v)}
                    >
                      ${t(label)}
                    </button>`,
                )}
              </div>
            </div>`
          : nothing
      }
      <div class="field">
        <span class="fl">${t("wo.frame")}</span>
        <div class="designs">
          ${SKINS.map(
            ([v, label]) =>
              html`<button
                type="button"
                data-skin=${v}
                aria-pressed=${String((w.options?.skin ?? "standard") === v)}
                @click=${() => this.#setOption("skin", v === "standard" ? undefined : v)}
              >
                ${t(label)}
              </button>`,
          )}
        </div>
      </div>
      <div class="field">
        <span class="fl">${t("wo.visible_from")}</span>
        <div class="seg">
          ${LEVELS.map(
            (l: Level) =>
              html`<button
                type="button"
                aria-pressed=${String((w.minLevel ?? def.minLevel) === l)}
                @click=${() => this.#patch({ minLevel: l === def.minLevel ? undefined : l })}
              >
                ${t(`level.${l}` as MessageKey)}
              </button>`,
          )}
        </div>
      </div>
      ${(def.options ?? []).map((f) => this.#field(f, w.options?.[f.key]))}
      <button
        type="button"
        class="done"
        @click=${() => this.dispatchEvent(new CustomEvent("atrium-close-sheet", { bubbles: true, composed: true }))}
      >
        ${t("edit.done")}
      </button>
    </div>`;
  }

  static override styles = css`
    :host {
      display: block;
      font-family: var(--a-font);
      color: var(--a-text);
    }
    .editor {
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding: 4px 4px 12px;
    }
    h2 {
      margin: 0;
      font-size: 22px;
      font-weight: 600;
    }
    .hint {
      margin: 0;
      font-size: 13px;
      color: var(--a-text2);
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .field.row {
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
    }
    .fl {
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--a-text2);
    }
    input,
    select,
    textarea {
      font: inherit;
      font-size: 15px;
      color: var(--a-text);
      background: var(--a-s2);
      border: 0;
      border-radius: var(--a-radius);
      min-height: 44px;
      padding: 0 12px;
      box-sizing: border-box;
      width: 100%;
    }
    textarea {
      padding: 10px 12px;
      resize: vertical;
    }
    input[type="checkbox"] {
      width: 24px;
      height: 24px;
      min-height: 0;
      accent-color: var(--a-ocher);
    }
    input:focus-visible,
    select:focus-visible,
    textarea:focus-visible,
    button:focus-visible {
      outline: 2px solid var(--a-ocher);
      outline-offset: 1px;
    }
    .seg {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      background: var(--a-s2);
      border-radius: var(--a-radius);
      padding: 4px;
      align-self: flex-start;
    }
    .seg button {
      border: 0;
      background: none;
      color: var(--a-text2);
      font: inherit;
      font-size: 14px;
      font-weight: 600;
      min-height: 38px;
      padding: 0 14px;
      border-radius: 6px;
      cursor: pointer;
    }
    .seg button[aria-pressed="true"] {
      background: var(--a-text);
      color: var(--a-bg);
    }
    .designs {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
      gap: 6px;
    }
    .designs button {
      border: 0;
      min-height: 44px;
      border-radius: var(--a-radius);
      background: var(--a-s2);
      color: var(--a-text);
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      padding: 0 8px;
    }
    .designs button[aria-pressed="true"] {
      background: var(--a-ocher);
      color: var(--a-on-ocher);
    }
    .chosen {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .pick {
      display: flex;
      align-items: center;
      gap: 6px;
      background: var(--a-s2);
      border-radius: var(--a-radius);
      padding: 4px 4px 4px 12px;
    }
    .pick span {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      font-size: 14px;
      font-weight: 600;
    }
    .pick small {
      font-size: 11px;
      font-weight: 400;
      color: var(--a-text3);
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .pick button {
      border: 0;
      background: var(--a-s3);
      color: var(--a-text);
      width: 36px;
      height: 36px;
      border-radius: 6px;
      cursor: pointer;
    }
    .pick button:disabled {
      opacity: 0.3;
    }
    .done {
      border: 0;
      min-height: 48px;
      border-radius: var(--a-radius);
      background: var(--a-ocher);
      color: var(--a-on-ocher);
      font: inherit;
      font-weight: 600;
      font-size: 15px;
      cursor: pointer;
    }
  `;
}

function move<T>(list: T[], i: number, delta: number): T[] {
  const next = [...list];
  const j = i + delta;
  if (j < 0 || j >= next.length) return next;
  const [item] = next.splice(i, 1);
  if (item !== undefined) next.splice(j, 0, item);
  return next;
}
