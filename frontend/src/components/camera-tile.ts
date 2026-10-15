import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import { EntityController, type EntityStore } from "../data/entity-store";
import { nameOf } from "../data/registry";

const REFRESH_MS = 10000;

/**
 * A camera snapshot that refreshes every few seconds while it is on screen.
 * Tap opens Home Assistant's dialog with the live stream.
 */
export class AtriumCameraTile extends LitElement {
  static override properties = {
    entityId: { attribute: "entity-id", reflect: true },
    store: { attribute: false },
    _tick: { state: true },
    _visible: { state: true },
  };

  declare entityId: string;
  declare store: EntityStore | undefined;
  declare _tick: number;
  declare _visible: boolean;

  #entity = new EntityController(this, () => this.store);
  #timer: ReturnType<typeof setInterval> | undefined;
  #observer: IntersectionObserver | undefined;

  constructor() {
    super();
    this._tick = Date.now();
    // Assume visible until the observer says otherwise (it only knows after layout).
    this._visible = true;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.hasUpdated) this.#observe();
    this.#timer = setInterval(() => {
      if (this._visible && document.visibilityState === "visible") this._tick = Date.now();
    }, REFRESH_MS);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#observer?.disconnect();
    clearInterval(this.#timer);
  }

  protected override firstUpdated(): void {
    this.#observe();
  }

  // Only refresh images while the tile is on screen and the page is visible.
  #observe(): void {
    this.#observer?.disconnect();
    this.#observer = new IntersectionObserver((entries) => {
      this._visible = entries.some((e) => e.isIntersecting);
    });
    this.#observer.observe(this);
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("entityId") || changed.has("store")) this.#entity.track(this.entityId);
  }

  protected override render() {
    const s = this.#entity.state;
    const hass = this.store?.hass;
    if (!s || !hass) return nothing;
    const picture = s.attributes.entity_picture as string | undefined;
    const src =
      picture && this._visible ? `${picture}${picture.includes("?") ? "&" : "?"}t=${this._tick}` : "";
    return html`<button
      type="button"
      @click=${() =>
        this.dispatchEvent(
          new CustomEvent("hass-more-info", {
            detail: { entityId: this.entityId },
            bubbles: true,
            composed: true,
          }),
        )}
    >
      ${src ? html`<img src=${src} alt="" loading="lazy" />` : html`<span class="placeholder"></span>`}
      <span class="name">${nameOf(hass, this.entityId)}</span>
    </button>`;
  }

  static override styles = css`
    :host {
      display: block;
    }
    button {
      all: unset;
      box-sizing: border-box;
      position: relative;
      display: block;
      width: 100%;
      aspect-ratio: 16 / 9;
      border-radius: var(--a-radius);
      overflow: hidden;
      cursor: pointer;
      background: var(--a-s1);
    }
    button:focus-visible {
      outline: 2px solid var(--a-ocher);
      outline-offset: 2px;
    }
    img,
    .placeholder {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .name {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      padding: 18px 12px 8px;
      font-family: var(--a-font);
      font-size: 14px;
      font-weight: 600;
      color: #fff;
      background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
    }
  `;
}
