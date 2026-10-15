import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import { EntityController, type EntityStore } from "../data/entity-store";
import { brightnessPct, friendlyName, isDimmable } from "../data/registry";
import type { Translate } from "../i18n";

const PRESETS = [10, 40, 80, 100] as const;
const DRAG_CLOSE_PX = 120;

/**
 * Detailed control of one light. On phones it is a bottom sheet that can be
 * dragged down; on wide screens a centred dialog.
 */
export class AtriumLightControl extends LitElement {
  static override properties = {
    store: { attribute: false },
    t: { attribute: false },
    mode: { reflect: true },
    entityId: { state: true },
    open: { type: Boolean, reflect: true },
    _dragPct: { state: true },
  };

  declare store: EntityStore | undefined;
  declare t: Translate;
  declare mode: "sheet" | "dialog";
  declare entityId: string | undefined;
  declare open: boolean;
  declare _dragPct: number | null;

  #entity = new EntityController(this, () => this.store);
  #dragStartY: number | null = null;
  #dragDy = 0;
  #returnFocus: HTMLElement | null = null;

  constructor() {
    super();
    this.mode = "sheet";
    this.open = false;
    this._dragPct = null;
  }

  show(entityId: string): void {
    this.#returnFocus = (document.activeElement as HTMLElement | null) ?? null;
    this.entityId = entityId;
    this._dragPct = null;
    this.open = true;
    document.addEventListener("keydown", this.#onKey);
    void this.updateComplete.then(() =>
      this.renderRoot.querySelector<HTMLElement>(".close")?.focus({ preventScroll: true }),
    );
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.#surface()?.style.removeProperty("transform");
    document.removeEventListener("keydown", this.#onKey);
    this.#returnFocus?.focus?.({ preventScroll: true });
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener("keydown", this.#onKey);
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("entityId") || changed.has("store")) this.#entity.track(this.entityId);
  }

  #onKey = (ev: KeyboardEvent) => {
    if (ev.key === "Escape") this.close();
  };

  #surface(): HTMLElement | null {
    return this.renderRoot.querySelector(".surface");
  }

  #call(service: "toggle" | "turn_on", data: Record<string, unknown> = {}): void {
    const hass = this.store?.hass;
    if (!hass || !this.entityId) return;
    void hass.callService("light", service, { entity_id: this.entityId, ...data });
  }

  #onRangeInput(ev: Event): void {
    this._dragPct = Number((ev.target as HTMLInputElement).value);
  }

  #onRangeChange(ev: Event): void {
    this.#call("turn_on", { brightness_pct: Number((ev.target as HTMLInputElement).value) });
    this._dragPct = null;
  }

  // Drag the sheet down to close it (phones only; not from the slider or buttons).
  #onPointerDown(ev: PointerEvent): void {
    if (this.mode !== "sheet") return;
    const fromControl = ev
      .composedPath()
      .some(
        (el) => el instanceof HTMLElement && (el.tagName === "BUTTON" || el.classList.contains("slider")),
      );
    if (fromControl) return;
    this.#dragStartY = ev.clientY;
    this.#dragDy = 0;
    const surface = this.#surface();
    surface?.classList.add("dragging");
    surface?.setPointerCapture(ev.pointerId);
  }

  #onPointerMove(ev: PointerEvent): void {
    if (this.#dragStartY === null) return;
    this.#dragDy = Math.max(0, ev.clientY - this.#dragStartY);
    this.#surface()?.style.setProperty("transform", `translateY(${this.#dragDy}px)`);
  }

  #onPointerUp(): void {
    if (this.#dragStartY === null) return;
    this.#dragStartY = null;
    const surface = this.#surface();
    surface?.classList.remove("dragging");
    if (this.#dragDy > DRAG_CLOSE_PX) this.close();
    else surface?.style.removeProperty("transform");
  }

  #renderBody() {
    const s = this.#entity.state;
    if (!s) return nothing;
    const on = s.state === "on";
    const dimmable = isDimmable(s);
    const pct = this._dragPct ?? brightnessPct(s) ?? 0;
    const showPct = dimmable && (on || this._dragPct !== null);
    return html`
      <div class="top">
        <div>
          <div class="label">${this.t("control.light")}</div>
          <div class="title" id="title">${friendlyName(s)}</div>
        </div>
        <button
          class="close"
          type="button"
          aria-label=${this.t("control.close")}
          @click=${() => this.close()}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <div class="big">
        <div class="value">
          ${showPct ? html`${pct}<small>%</small>` : on ? this.t("state.on") : this.t("state.off")}
        </div>
        <button
          class="power ${on ? "on" : ""}"
          type="button"
          aria-pressed=${String(on)}
          @click=${() => this.#call("toggle")}
        >
          ${on ? this.t("state.on") : this.t("state.off")}
        </button>
      </div>
      <div class="dim" ?hidden=${!dimmable}>
        <div class="label">${this.t("control.brightness")}</div>
        <div class="slider">
          <div class="fill" style="width: ${on || this._dragPct !== null ? pct : 0}%"></div>
          <input
            type="range"
            min="1"
            max="100"
            step="1"
            .value=${String(pct || 1)}
            aria-label=${this.t("control.brightness")}
            @input=${this.#onRangeInput}
            @change=${this.#onRangeChange}
          />
        </div>
        <div class="presets">
          ${PRESETS.map(
            (p) =>
              html`<button type="button" @click=${() => this.#call("turn_on", { brightness_pct: p })}>
                ${p} %
              </button>`,
          )}
        </div>
      </div>
    `;
  }

  protected override render() {
    return html`
      <div class="scrim" @click=${() => this.close()}></div>
      <div
        class="surface"
        role="dialog"
        aria-modal="true"
        aria-labelledby="title"
        @pointerdown=${this.#onPointerDown}
        @pointermove=${this.#onPointerMove}
        @pointerup=${this.#onPointerUp}
        @pointercancel=${this.#onPointerUp}
      >
        <div class="handle"></div>
        ${this.#renderBody()}
      </div>
    `;
  }

  static override styles = css`
    :host {
      position: fixed;
      inset: 0;
      z-index: 10;
      pointer-events: none;
      font-family: var(--a-font);
    }
    :host([open]) {
      pointer-events: auto;
    }
    .scrim {
      position: absolute;
      inset: 0;
      background: var(--a-scrim);
      opacity: 0;
      transition: opacity 260ms ease;
    }
    :host([open]) .scrim {
      opacity: 1;
    }
    .surface {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      margin: 0 auto;
      max-width: 560px;
      box-sizing: border-box;
      background: var(--a-s1);
      color: var(--a-text);
      border-radius: 16px 16px 0 0;
      padding: 10px 20px calc(24px + env(safe-area-inset-bottom));
      display: flex;
      flex-direction: column;
      gap: 18px;
      touch-action: none;
      transform: translateY(100%);
      /* Closed: slide out, then hide so it never shows in tall or scrolled layouts. */
      visibility: hidden;
      transition:
        transform 320ms cubic-bezier(0.2, 0.9, 0.25, 1),
        opacity 200ms ease,
        visibility 0s linear 320ms;
    }
    :host([open]) .surface {
      transform: translateY(0);
      visibility: visible;
      transition-delay: 0s;
    }
    .surface.dragging {
      transition: none;
    }

    :host([mode="dialog"]) .surface {
      top: 50%;
      bottom: auto;
      left: 50%;
      right: auto;
      width: min(440px, calc(100vw - 32px));
      max-width: none;
      border-radius: var(--a-radius);
      padding: 20px 24px 24px;
      opacity: 0;
      touch-action: auto;
      transform: translate(-50%, -48%) scale(0.97);
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
    }
    :host([mode="dialog"][open]) .surface {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
    :host([mode="dialog"]) .handle {
      display: none;
    }

    .handle {
      align-self: center;
      width: 44px;
      height: 5px;
      border-radius: 3px;
      background: var(--a-text3);
    }
    .top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .label {
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--a-text2);
    }
    .title {
      font-size: 22px;
      font-weight: 600;
      margin-top: 2px;
    }
    button {
      font-family: inherit;
      cursor: pointer;
    }
    button:focus-visible {
      outline: 2px solid var(--a-ocher);
      outline-offset: 2px;
    }
    .close {
      width: 44px;
      height: 44px;
      border: 0;
      border-radius: 22px;
      background: var(--a-s3);
      color: var(--a-text);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .big {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
    }
    .value {
      font-size: 88px;
      font-weight: 600;
      letter-spacing: -0.05em;
      line-height: 0.85;
      font-variant-numeric: tabular-nums;
    }
    .value small {
      font-size: 36px;
      letter-spacing: 0;
    }
    .power {
      height: 56px;
      padding: 0 22px;
      border: 0;
      border-radius: var(--a-radius);
      font-size: 16px;
      font-weight: 600;
      background: var(--a-s3);
      color: var(--a-text);
    }
    .power.on {
      background: var(--a-ocher);
      color: var(--a-on-ocher);
    }
    .dim {
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
    .dim[hidden] {
      display: none;
    }
    .slider {
      position: relative;
      height: 64px;
      border-radius: var(--a-radius);
      background: var(--a-s3);
      overflow: hidden;
      touch-action: none;
    }
    .fill {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      background: var(--a-ocher);
      transition: width 120ms linear;
    }
    .slider input {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      opacity: 0;
      margin: 0;
      cursor: pointer;
    }
    .presets {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
    }
    .presets button {
      height: 52px;
      border: 0;
      border-radius: var(--a-radius);
      background: var(--a-s3);
      color: var(--a-text);
      font-size: 14px;
      font-weight: 600;
    }
    @media (prefers-reduced-motion: reduce) {
      .surface,
      .scrim {
        transition-duration: 0s !important;
      }
    }
  `;
}
