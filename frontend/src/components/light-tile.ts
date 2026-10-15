import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import { EntityController, type EntityStore } from "../data/entity-store";
import { brightnessPct, friendlyName, withoutArea } from "../data/registry";
import type { Translate } from "../i18n";
import { attachPress } from "../util/press";
import { editOverlay, editStyles } from "./edit-overlay";

const BULB = html`<svg
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.7"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z" />
</svg>`;

/** A light as a style-C tile: tap toggles, long press asks for the control. */
export class AtriumLightTile extends LitElement {
  static override properties = {
    entityId: { attribute: "entity-id", reflect: true },
    compact: { type: Boolean, reflect: true },
    areaName: { attribute: false },
    editing: { type: Boolean, reflect: true },
    favorite: { type: Boolean },
    atriumHidden: { type: Boolean, attribute: "atrium-hidden", reflect: true },
    canHide: { type: Boolean },
    store: { attribute: false },
    t: { attribute: false },
  };

  declare entityId: string;
  /** One row (icon, name, state) instead of a square. */
  declare compact: boolean;
  /** On a room page: the room's name, left out of the light's name. */
  declare areaName: string | undefined;
  declare editing: boolean;
  declare favorite: boolean;
  declare atriumHidden: boolean;
  declare canHide: boolean;
  declare store: EntityStore | undefined;
  declare t: Translate;

  /** How often this tile rendered; used by the end-to-end tests. */
  renderCount = 0;

  #entity = new EntityController(this, () => this.store);
  #detachPress: (() => void) | undefined;

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("entityId") || changed.has("store")) this.#entity.track(this.entityId);
  }

  protected override firstUpdated(): void {
    const button = this.renderRoot.querySelector<HTMLElement>("button.tile");
    if (!button) return;
    this.#detachPress = attachPress(button, {
      onTap: () => !this.editing && this.#emit("atrium-toggle"),
      onLongPress: () => !this.editing && this.#emit("atrium-more-info"),
    });
  }

  protected override updated(): void {
    // Exposed for styling from outside and for the end-to-end tests.
    const state = this.#entity.state?.state;
    if (state) this.setAttribute("state", state);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#detachPress?.();
    this.#detachPress = undefined;
  }

  #emit(type: string): void {
    this.dispatchEvent(
      new CustomEvent(type, { detail: { entityId: this.entityId }, bubbles: true, composed: true }),
    );
  }

  #stateLabel(): string {
    const s = this.#entity.state;
    if (!s) return "";
    switch (s.state) {
      case "on": {
        const pct = brightnessPct(s);
        return pct != null ? `${this.t("state.on")} · ${pct} %` : this.t("state.on");
      }
      case "off":
        return this.t("state.off");
      case "unavailable":
        return this.t("state.unavailable");
      default:
        return this.t("state.unknown");
    }
  }

  protected override render() {
    const s = this.#entity.state;
    if (!s) return nothing;
    this.renderCount += 1;
    const on = s.state === "on";
    return html`<button
        type="button"
        class="tile ${on ? "on" : s.state === "unavailable" ? "unavailable" : ""}"
        aria-pressed=${String(on)}
      >
        ${BULB}
        <span class="text">
          <span class="name">${withoutArea(friendlyName(s), this.areaName)}</span>
          <span class="state">${this.#stateLabel()}</span>
        </span>
      </button>
      ${editOverlay(
        this,
        this.entityId,
        {
          editing: this.editing,
          favorite: this.favorite,
          hidden: this.atriumHidden,
          canHide: this.canHide,
        },
        this.t,
      )}`;
  }

  static override styles = [
    css`
      :host {
        display: block;
      }
      button.tile {
        all: unset;
        box-sizing: border-box;
        width: 100%;
        aspect-ratio: 1;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 16px;
        border-radius: var(--a-radius);
        cursor: pointer;
        background: var(--a-s1);
        color: var(--a-text);
        font-family: var(--a-font);
        transition:
          background-color 220ms ease,
          color 220ms ease,
          transform 120ms ease;
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;
        -webkit-touch-callout: none;
      }
      button.tile:focus-visible {
        outline: 2px solid var(--a-ocher);
        outline-offset: 2px;
      }
      button.tile.on {
        background: var(--a-ocher);
        color: var(--a-on-ocher);
        box-shadow: none;
      }
      button.tile.unavailable {
        opacity: 0.45;
      }
      button.tile[pressed] {
        transform: scale(0.96);
      }
      svg {
        width: 30px;
        height: 30px;
      }
      .text {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .name {
        font-size: 17px;
        font-weight: 600;
        line-height: 1.2;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }
      .state {
        font-size: 13px;
        font-weight: 500;
      }
      :host([compact]) button.tile {
        aspect-ratio: auto;
        min-height: 64px;
        flex-direction: row;
        align-items: center;
        justify-content: flex-start;
        gap: 12px;
        padding: 10px 14px;
      }
      :host([compact]) svg {
        flex: none;
        width: 26px;
        height: 26px;
      }
      :host([compact]) .text {
        min-width: 0;
      }
      :host([compact]) .name {
        font-size: 15px;
        line-height: 1.15;
      }
      @media (prefers-reduced-motion: reduce) {
        button.tile {
          transition: none;
        }
      }
    `,
    // Last, so edit mode wins over the tile layout (e.g. compact padding).
    editStyles,
  ];
}
