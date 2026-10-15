import { LitElement, css, html, nothing } from "lit";
import { repeat } from "lit/directives/repeat.js";
import type { PanelContext } from "../context";
import { applyOrder, favorites, savedOrder, setOrder } from "../data/layout";
import { attachSortable } from "../util/sortable";

/**
 * A grid of entity tiles in the order an admin saved under `orderKey`
 * (new entities are appended). Admins can drag the tiles in edit mode.
 */
export class AtriumEntityList extends LitElement {
  static override properties = {
    ctx: { attribute: false },
    ids: { attribute: false },
    orderKey: { attribute: "order-key" },
    _preview: { state: true },
  };

  declare ctx: PanelContext;
  declare ids: string[];
  declare orderKey: string;
  declare _preview: string[] | null;

  #detachSort: (() => void) | undefined;

  constructor() {
    super();
    this.ids = [];
    this._preview = null;
  }

  #ordered(): string[] {
    return applyOrder(this.ids, savedOrder(this.ctx.layout, this.orderKey));
  }

  protected override firstUpdated(): void {
    this.#attachSort();
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.hasUpdated) this.#attachSort();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#detachSort?.();
    this.#detachSort = undefined;
  }

  #attachSort(): void {
    if (this.#detachSort) return;
    this.#detachSort = attachSortable(this.renderRoot as ShadowRoot, {
      container: () => this.renderRoot.querySelector(".list"),
      enabled: () => this.ctx.editing && this.ctx.isAdmin,
      order: () => this._preview ?? this.#ordered(),
      onPreview: (ids) => (this._preview = ids),
      onDrop: (ids) => {
        this._preview = null;
        this.ctx.saveLayout(setOrder(this.ctx.layout, this.orderKey, ids));
      },
    });
  }

  protected override render() {
    const ids = this._preview ?? this.#ordered();
    if (!ids.length) return nothing;
    const { store, t, editing, isAdmin, hiddenEntities, user } = this.ctx;
    const favs = new Set(favorites(user));
    return html`<div class="list">
      ${repeat(
        ids,
        (id) => id,
        (id) =>
          html`<atrium-entity-tile
            data-sort-id=${id}
            .entityId=${id}
            .store=${store}
            .t=${t}
            ?editing=${editing}
            ?favorite=${favs.has(id)}
            ?atrium-hidden=${hiddenEntities.has(id)}
            ?canHide=${isAdmin}
          ></atrium-entity-tile>`,
      )}
    </div>`;
  }

  static override styles = css`
    :host {
      display: block;
    }
    .list {
      position: relative;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
      gap: 8px;
    }
    @media (max-width: 600px) {
      .list {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  `;
}
