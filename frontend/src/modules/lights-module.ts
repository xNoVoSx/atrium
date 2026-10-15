import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import { repeat } from "lit/directives/repeat.js";
import type { PanelContext } from "../context";
import { SelectorController } from "../data/entity-store";
import { lightEntities } from "../data/home";
import { applyOrder, favorites, savedOrder, setFavoritesOrder, setOrder } from "../data/layout";
import { isAutoVisible } from "../data/registry";
import { shared } from "../theme/shared";
import { attachSortable } from "../util/sortable";

type Mode = "favorites" | "lights";
export type LightVariant = "compact" | "square" | "list" | "buttons" | "slider";
export const LIGHT_VARIANTS: readonly LightVariant[] = ["compact", "square", "list", "buttons", "slider"];

/** The user's own choice for light tiles everywhere (settings → appearance), if any. */
export const userLightVariant = (user: Record<string, unknown> | undefined): LightVariant | undefined =>
  LIGHT_VARIANTS.includes(user?.lightStyle as LightVariant) ? (user?.lightStyle as LightVariant) : undefined;

/**
 * Light tiles. On the home page a user's favourites replace the list once
 * there are any; in edit mode all lights show so more can be starred.
 * Tiles can be dragged in edit mode: favourites by everyone (own order),
 * the automatic list by admins (shared order).
 */
export class AtriumLightsModule extends LitElement {
  static override properties = {
    ctx: { attribute: false },
    areaId: { attribute: "area-id" },
    heading: { type: Boolean },
    compact: { type: Boolean },
    variant: {},
    home: { type: Boolean },
    _preview: { state: true },
  };

  declare ctx: PanelContext;
  declare areaId: string | undefined;
  declare heading: boolean;
  declare compact: boolean;
  /** Tile style chosen in the widget settings; overrides `compact`. */
  declare variant: LightVariant | undefined;
  /** Home page: favourites first. */
  declare home: boolean;
  declare _preview: string[] | null;

  #detachSort: (() => void) | undefined;

  #orderKey(): string {
    return `lights:${this.areaId ?? "home"}`;
  }

  #list = new SelectorController(
    this,
    () => this.ctx?.store,
    (hass) => {
      const lights = applyOrder(
        lightEntities(hass, this.areaId),
        savedOrder(this.ctx.layout, this.#orderKey()),
      );
      const favs = this.home
        ? favorites(this.ctx.user).filter((id) => hass.states[id] && isAutoVisible(hass, id))
        : [];
      if (!favs.length) return { mode: "lights" as Mode, ids: lights };
      if (!this.ctx.editing) return { mode: "favorites" as Mode, ids: favs };
      // Edit mode: favourites first, then everything else that could be starred.
      return { mode: "favorites" as Mode, ids: [...favs, ...lights.filter((id) => !favs.includes(id))] };
    },
  );

  #onCount = new SelectorController(
    this,
    () => this.ctx?.store,
    (hass) => (this.#list.value?.ids ?? []).filter((id) => hass.states[id]?.state === "on").length,
  );

  constructor() {
    super();
    this.heading = true;
    this.compact = false;
    this.home = false;
    this._preview = null;
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    this.#list.attach();
    if (changed.has("ctx")) this.#list.refresh();
    this.#onCount.attach();
    this.#onCount.refresh();
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
      container: () => this.renderRoot.querySelector(".grid"),
      enabled: () => this.ctx.editing && this.#canReorder(),
      order: () => this._preview ?? this.#list.value?.ids ?? [],
      onPreview: (ids) => (this._preview = ids),
      onDrop: (ids) => this.#saveOrder(ids),
    });
  }

  #canReorder(): boolean {
    return this.#list.value?.mode === "favorites" || this.ctx.isAdmin;
  }

  #saveOrder(ids: string[]): void {
    const list = this.#list.value;
    this._preview = null;
    if (list?.mode === "favorites") {
      const favs = favorites(this.ctx.user);
      this.ctx.saveUser(
        setFavoritesOrder(
          this.ctx.user,
          ids.filter((id) => favs.includes(id)),
        ),
      );
    } else if (this.ctx.isAdmin) {
      this.ctx.saveLayout(setOrder(this.ctx.layout, this.#orderKey(), ids));
    }
  }

  #variant(): LightVariant {
    return this.variant ?? userLightVariant(this.ctx?.user) ?? (this.compact ? "compact" : "square");
  }

  protected override render() {
    const list = this.#list.value;
    const ids = this._preview ?? list?.ids ?? [];
    if (!ids.length) return nothing;
    const { store, t, editing, isAdmin, hiddenEntities, user } = this.ctx;
    const favs = new Set(favorites(user));
    const areaName = this.areaId ? store.hass?.areas[this.areaId]?.name : undefined;
    const title = list?.mode === "favorites" ? t("section.favorites") : t("section.lights");
    const count = this.#onCount.value ?? 0;
    return html`
      ${
        this.heading
          ? html`<div class="heading">
              <h2 class="label">${title}</h2>
              ${count ? html`<span class="count">${count} ${t("state.on").toLowerCase()}</span>` : nothing}
            </div>`
          : nothing
      }
      <div class="grid ${this.#variant()}">
        ${repeat(
          ids,
          (id) => id,
          (id) =>
            id.startsWith("light.")
              ? html`<atrium-light-tile
                  data-sort-id=${id}
                  ?compact=${["compact", "list", "slider"].includes(this.#variant())}
                  ?list=${this.#variant() === "list"}
                  ?round=${this.#variant() === "buttons"}
                  ?slider=${this.#variant() === "slider"}
                  .entityId=${id}
                  .store=${store}
                  .t=${t}
                  .areaName=${areaName}
                  ?editing=${editing}
                  ?favorite=${favs.has(id)}
                  ?atrium-hidden=${hiddenEntities.has(id)}
                  ?canHide=${isAdmin}
                ></atrium-light-tile>`
              : html`<atrium-entity-tile
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
      </div>
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
      .heading {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
      }
      .count {
        font-size: 13px;
        font-weight: 600;
        color: var(--a-text2);
      }
      .grid {
        position: relative;
      }
      .grid.compact {
        grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
      }
      .grid.buttons {
        grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
        gap: 12px 8px;
      }
      .grid.slider {
        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
        gap: 8px;
      }
      .grid.list {
        grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
        gap: 6px;
      }
      @media (max-width: 600px) {
        .grid.compact {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
    `,
  ];
}
