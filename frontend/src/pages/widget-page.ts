import { LitElement, css, html, nothing } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { icon } from "../components/icon";
import type { AtriumSheet } from "../components/sheet";
import type { PanelContext } from "../context";
import { levelAllows } from "../data/levels";
import {
  addWidget,
  HOME_PAGE,
  orderWidgets,
  page,
  removeWidget,
  updateWidget,
  WIDGET_SIZES,
  type WidgetInstance,
} from "../data/pages";
import type { MessageKey } from "../i18n";
import { ICONS } from "../theme/shared";
import { attachSortable } from "../util/sortable";
import { widgetDef, widgetVisible } from "../widgets/catalog";
import { skinStyles } from "../widgets/skins";

const GRIP = "M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01";
const COG =
  "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8 2 2 0 1 1-2.8 2.8 1.7 1.7 0 0 0-2.8 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.8-1.2 2 2 0 1 1-2.8-2.8A1.7 1.7 0 0 0 3.3 13a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.8 2 2 0 1 1 2.8-2.8A1.7 1.7 0 0 0 10 2.2a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.8 1.2 2 2 0 1 1 2.8 2.8A1.7 1.7 0 0 0 20.8 9a2 2 0 1 1 0 4 1.7 1.7 0 0 0-1.4 2z";
const EYE = "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z";
const EYE_OFF =
  "M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.9M6.1 6.1A17 17 0 0 0 2 12s3.5 7 10 7a9.8 9.8 0 0 0 4.4-1";
const SIZE = "M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6";

/**
 * A page of widgets (the home page or one an admin made). Admins in edit mode
 * get a toolbar per widget (move, size, settings, hide, remove) and a button
 * to add widgets from the catalogue.
 */
export class AtriumWidgetPage extends LitElement {
  static override properties = {
    ctx: { attribute: false },
    pageId: { attribute: "page-id" },
    embedded: { type: Boolean },
    _preview: { state: true },
    _editing: { state: true },
    _picking: { state: true },
    _confirmRemove: { state: true },
    _wide: { state: true },
  };

  declare ctx: PanelContext;
  declare pageId: string;
  /** Part of another page (a room): no heading, nothing shown while empty. */
  declare embedded: boolean;
  declare _preview: string[] | null;
  /** Widget whose settings are open. */
  declare _editing: string | null;
  declare _picking: boolean;
  declare _confirmRemove: string | null;
  /** Wide enough for two columns. */
  declare _wide: boolean;
  #resize = new ResizeObserver((entries) => {
    const w = entries[0]?.contentRect.width ?? 0;
    if (w >= 860 !== this._wide) this._wide = w >= 860;
  });

  #detachSort: (() => void) | undefined;

  constructor() {
    super();
    this.pageId = HOME_PAGE;
    this.embedded = false;
    this.addEventListener("atrium-widget-options", this.#onOptions as EventListener);
    this._preview = null;
    this._editing = null;
    this._picking = false;
    this._confirmRemove = null;
    this._wide = false;
  }

  get #canEdit(): boolean {
    return this.ctx.editing && this.ctx.isAdmin;
  }

  #widgets(): WidgetInstance[] {
    const all = page(this.ctx.layout, this.pageId)?.widgets ?? [];
    const ordered = this._preview
      ? (this._preview.map((id) => all.find((w) => w.id === id)).filter(Boolean) as WidgetInstance[])
      : all;
    // Admins editing see everything (switched-off and level-hidden ones dimmed).
    return this.#canEdit
      ? ordered.filter((w) => widgetDef(w.type))
      : ordered.filter((w) => widgetVisible(w, this.ctx.level));
  }

  protected override firstUpdated(): void {
    this.#attachSort();
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.hasUpdated) this.#attachSort();
    this.#resize.observe(this);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#resize.disconnect();
    this.#detachSort?.();
    this.#detachSort = undefined;
  }

  #attachSort(): void {
    if (this.#detachSort) return;
    this.#detachSort = attachSortable(this.renderRoot as ShadowRoot, {
      container: () => this.renderRoot.querySelector(".grid"),
      enabled: () => this.#canEdit,
      handle: "grip",
      order: () => this._preview ?? this.#widgets().map((w) => w.id),
      onPreview: (ids) => (this._preview = ids),
      onDrop: (ids) => {
        this._preview = null;
        this.ctx.saveLayout(orderWidgets(this.ctx.layout, this.pageId, ids));
      },
    });
  }

  #sheet(): AtriumSheet | null {
    return this.renderRoot.querySelector("atrium-sheet");
  }

  #openEditor(id: string): void {
    this._picking = false;
    this._editing = id;
    void this.updateComplete.then(() => this.#sheet()?.show());
  }

  #openPicker(): void {
    this._editing = null;
    this._picking = true;
    void this.updateComplete.then(() => this.#sheet()?.show());
  }

  #onAdd(ev: CustomEvent<string>): void {
    const [type = "", variant] = ev.detail.split("|");
    const def = widgetDef(type);
    if (!def) return;
    // On a room's page, widgets that can be limited to a room start with this room.
    const room = this.pageId.startsWith("room:") ? this.pageId.slice(5) : "";
    const options: Record<string, unknown> = {
      ...(room && def.options?.some((o) => o.kind === "area") ? { area: room } : {}),
      ...(variant ? { variant } : {}),
    };
    const next = addWidget(this.ctx.layout, this.pageId, {
      type: def.type,
      ...(Object.keys(options).length ? { options } : {}),
    });
    this.ctx.saveLayout(next);
    const added = page(next, this.pageId)?.widgets.at(-1);
    this.#sheet()?.close();
    // Widgets with options open their settings right away.
    if (added && def.options?.length) setTimeout(() => this.#openEditor(added.id), 250);
  }

  #cycleSize(w: WidgetInstance): void {
    const def = widgetDef(w.type);
    if (!def) return;
    const sizes = def.sizes ?? WIDGET_SIZES;
    const current = w.size ?? def.size;
    const next = sizes[(sizes.indexOf(current) + 1) % sizes.length] ?? def.size;
    this.ctx.saveLayout(
      updateWidget(this.ctx.layout, this.pageId, w.id, { size: next === def.size ? undefined : next }),
    );
  }

  #remove(w: WidgetInstance): void {
    if (this._confirmRemove !== w.id) {
      this._confirmRemove = w.id;
      setTimeout(() => {
        if (this._confirmRemove === w.id) this._confirmRemove = null;
      }, 3000);
      return;
    }
    this._confirmRemove = null;
    this.ctx.saveLayout(removeWidget(this.ctx.layout, this.pageId, w.id));
  }

  #toolbar(w: WidgetInstance) {
    const { t } = this.ctx;
    const def = widgetDef(w.type);
    if (!def) return nothing;
    const sizes = def.sizes ?? WIDGET_SIZES;
    return html`<div class="tools">
      <span class="grip edit-action" title=${t("w.drag")}>${icon(GRIP, 18, 3)}</span>
      <span class="tname">${w.title || t(def.name)}</span>
      ${
        sizes.length > 1
          ? html`<button
              type="button"
              class="edit-action"
              title=${t("wo.size")}
              @click=${() => this.#cycleSize(w)}
            >
              ${icon(SIZE, 16, 2)}<span class="sz">${t(`wo.size_${w.size ?? def.size}` as MessageKey)}</span>
            </button>`
          : nothing
      }
      <button
        type="button"
        class="edit-action"
        title=${t("w.settings")}
        aria-label=${t("w.settings")}
        @click=${() => this.#openEditor(w.id)}
      >
        ${icon(COG, 16, 2)}
      </button>
      <button
        type="button"
        class="edit-action"
        title=${w.disabled ? t("w.show") : t("w.hide")}
        aria-label=${w.disabled ? t("w.show") : t("w.hide")}
        @click=${() => this.ctx.saveLayout(updateWidget(this.ctx.layout, this.pageId, w.id, { disabled: w.disabled ? undefined : true }))}
      >
        ${icon(w.disabled ? EYE_OFF : EYE, 16, 2)}
      </button>
      <button
        type="button"
        class="edit-action ${this._confirmRemove === w.id ? "danger" : ""}"
        aria-label=${t("w.remove")}
        @click=${() => this.#remove(w)}
      >
        ${this._confirmRemove === w.id ? t("w.tap_again") : icon(ICONS.close, 16, 2)}
      </button>
    </div>`;
  }

  /** A widget changed its own options (e.g. markers dragged on a floor plan). */
  #onOptions = (ev: CustomEvent<{ id: string; options: Record<string, unknown> }>) => {
    ev.stopPropagation();
    if (!this.ctx.isAdmin) return;
    this.ctx.saveLayout(
      updateWidget(this.ctx.layout, this.pageId, ev.detail.id, { options: ev.detail.options }),
    );
  };

  #slot(w: WidgetInstance, canEdit: boolean) {
    const { t } = this.ctx;
    const def = widgetDef(w.type);
    if (!def) return nothing;
    const size = w.size ?? def.size;
    const dimmed = canEdit && !widgetVisible(w, this.ctx.level);
    const levelHidden = canEdit && !w.disabled && !levelAllows(this.ctx.level, w.minLevel ?? def.minLevel);
    // The widget's own frame, else the user's default frame.
    const chosen = w.options?.skin ?? this.ctx.user.skin;
    const skin = typeof chosen === "string" && chosen !== "standard" ? `skin-${chosen}` : "";
    return html`<div class="slot s-${size} ${dimmed ? "dim" : ""}" data-sort-id=${w.id} data-widget=${w.type}>
      ${canEdit ? this.#toolbar(w) : nothing}
      ${levelHidden ? html`<div class="lvl">${t("w.level_hidden")}</div>` : nothing}
      <div class="body ${skin}">${def.render(this.ctx, w, false)}</div>
    </div>`;
  }

  /**
   * Wide screens: full-width widgets break the page into runs; inside a run
   * the other widgets fill two independent columns, so a tall widget does not
   * leave a hole next to a short one.
   */
  #columns(widgets: WidgetInstance[]) {
    const runs: Array<{ full: WidgetInstance } | { cols: [WidgetInstance[], WidgetInstance[]] }> = [];
    for (const w of widgets) {
      const size = w.size ?? widgetDef(w.type)?.size ?? "m";
      if (size === "l") {
        runs.push({ full: w });
        continue;
      }
      let run = runs.at(-1);
      if (!run || "full" in run) {
        run = { cols: [[], []] };
        runs.push(run);
      }
      const [left, right] = run.cols;
      const col = w.col ?? (left.length <= right.length ? 1 : 2);
      (col === 1 ? left : right).push(w);
    }
    return html`<div class="flow">
      ${runs.map((r) =>
        "full" in r
          ? this.#slot(r.full, false)
          : html`<div class="cols">
              ${r.cols.map(
                (list) =>
                  html`<div class="col">
                    ${repeat(
                      list,
                      (w) => w.id,
                      (w) => this.#slot(w, false),
                    )}
                  </div>`,
              )}
            </div>`,
      )}
    </div>`;
  }

  protected override render() {
    if (!this.ctx) return nothing;
    const { t } = this.ctx;
    const cfg = page(this.ctx.layout, this.pageId);
    if (!cfg) return html`<p class="hint">${t("page.missing")}</p>`;
    const widgets = this.#widgets();
    const canEdit = this.#canEdit;
    if (this.embedded && !widgets.length && !canEdit) return nothing;
    return html`
      ${cfg.title ? html`<h1>${cfg.icon && customElements.get("ha-icon") ? html`<ha-icon .icon=${cfg.icon}></ha-icon>` : nothing}${cfg.title}</h1>` : nothing}
      ${
        canEdit || !this._wide
          ? html`<div class="grid ${canEdit ? "editing" : ""}">
              ${repeat(
                widgets,
                (w) => w.id,
                (w) => this.#slot(w, canEdit),
              )}
              ${
                canEdit
                  ? html`<button
                      type="button"
                      class="add-widget edit-action"
                      @click=${() => this.#openPicker()}
                    >
                      ${icon(ICONS.plus, 22, 2)} ${t("w.add_widget")}
                    </button>`
                  : nothing
              }
            </div>`
          : this.#columns(widgets)
      }
      ${!widgets.length && !canEdit && !this.embedded ? html`<p class="hint">${t(this.ctx.isAdmin ? "page.empty_admin" : "page.empty")}</p>` : nothing}
      ${
        canEdit
          ? html`<atrium-sheet
              .mode=${this.ctx.narrow ? "sheet" : "dialog"}
              ?wide=${this._picking}
              .label=${this._picking ? t("w.add_widget") : t("w.settings")}
              @atrium-close-sheet=${() => this.#sheet()?.close()}
              @atrium-sheet-closed=${() => {
                this._editing = null;
                this._picking = false;
              }}
              @atrium-add-widget=${this.#onAdd}
            >
              ${
                this._picking
                  ? html`<atrium-widget-picker .ctx=${this.ctx}></atrium-widget-picker>`
                  : this._editing
                    ? html`<atrium-widget-editor
                        .ctx=${this.ctx}
                        .pageId=${this.pageId}
                        .widgetId=${this._editing}
                      ></atrium-widget-editor>`
                    : nothing
              }
            </atrium-sheet>`
          : nothing
      }
    `;
  }

  static override styles = [
    skinStyles,
    css`
      :host {
        display: block;
      }
      .body {
        min-width: 0;
      }
      h1 {
        margin: 4px 0 18px;
        font-size: 34px;
        font-weight: 600;
        letter-spacing: -0.03em;
        display: flex;
        align-items: center;
        gap: 12px;
      }
      h1 ha-icon {
        --mdc-icon-size: 32px;
        color: var(--a-ocher);
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(12, minmax(0, 1fr));
        gap: 18px 20px;
        align-items: start;
        position: relative;
        grid-auto-flow: row dense;
      }
      .flow,
      .col {
        display: flex;
        flex-direction: column;
        gap: 18px;
        min-width: 0;
      }
      .cols {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: 20px;
        align-items: start;
      }
      .slot {
        grid-column: span 12;
        min-width: 0;
        position: relative;
      }
      @media (min-width: 900px) {
        .s-m {
          grid-column: span 6;
        }
        .s-s {
          grid-column: span 4;
        }
      }
      @media (min-width: 600px) and (max-width: 899px) {
        .s-s {
          grid-column: span 6;
        }
      }
      .editing .slot {
        outline: 1px dashed var(--a-s3);
        outline-offset: 6px;
        border-radius: var(--a-radius);
      }
      .slot.dim > :not(.tools) {
        opacity: 0.4;
      }
      .slot.dragging {
        z-index: 3;
        filter: drop-shadow(0 12px 24px rgba(0, 0, 0, 0.35));
      }
      .tools {
        display: flex;
        align-items: center;
        gap: 4px;
        margin-bottom: 8px;
        padding: 4px;
        border-radius: var(--a-radius);
        background: var(--a-s2);
      }
      .tools .tname {
        flex: 1;
        min-width: 0;
        font-size: 13px;
        font-weight: 600;
        color: var(--a-text2);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .tools button,
      .grip {
        border: 0;
        min-width: 36px;
        height: 36px;
        padding: 0 8px;
        border-radius: 6px;
        background: var(--a-s3);
        color: var(--a-text);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        font: inherit;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      .grip {
        cursor: grab;
        touch-action: none;
        background: none;
        color: var(--a-text2);
      }
      .tools button.danger {
        background: var(--a-terra);
        color: #fff;
      }
      .sz {
        min-width: 1.2em;
      }
      .lvl {
        font-size: 12px;
        color: var(--a-text3);
        margin: -4px 0 6px;
      }
      .add-widget {
        grid-column: span 12;
        min-height: 64px;
        border: 2px dashed var(--a-s3);
        border-radius: var(--a-radius);
        background: none;
        color: var(--a-text2);
        font: inherit;
        font-size: 15px;
        font-weight: 600;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        cursor: pointer;
        transition: border-color calc(var(--a-motion, 1) * 150ms);
      }
      .add-widget:hover {
        border-color: var(--a-ocher);
        color: var(--a-text);
      }
      button:focus-visible {
        outline: 2px solid var(--a-ocher);
        outline-offset: 2px;
      }
      .hint {
        color: var(--a-text2);
        font-size: 14px;
      }
    `,
  ];
}
