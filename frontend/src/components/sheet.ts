import { LitElement, css, html } from "lit";

const DRAG_CLOSE_PX = 120;

/**
 * Container for detailed controls: a bottom sheet on phones (drag down to
 * close), a centred dialog on wide screens. The content comes in as a slot.
 * Fires `atrium-sheet-closed` when it closes.
 */
export class AtriumSheet extends LitElement {
  static override properties = {
    mode: { reflect: true },
    wide: { type: Boolean, reflect: true },
    open: { type: Boolean, reflect: true },
    label: {},
  };

  declare mode: "sheet" | "dialog";
  /** Dialog mode: room for catalogues and forms. */
  declare wide: boolean;
  declare open: boolean;
  /** Accessible name of the dialog. */
  declare label: string;

  #dragStartY: number | null = null;
  #dragDy = 0;
  #returnFocus: HTMLElement | null = null;

  constructor() {
    super();
    this.mode = "sheet";
    this.wide = false;
    this.open = false;
    this.label = "";
  }

  show(): void {
    this.#returnFocus = (document.activeElement as HTMLElement | null) ?? null;
    this.open = true;
    document.addEventListener("keydown", this.#onKey);
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.#surface()?.style.removeProperty("transform");
    document.removeEventListener("keydown", this.#onKey);
    this.#returnFocus?.focus?.({ preventScroll: true });
    this.dispatchEvent(new CustomEvent("atrium-sheet-closed", { bubbles: true, composed: true }));
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener("keydown", this.#onKey);
  }

  #onKey = (ev: KeyboardEvent) => {
    if (ev.key === "Escape") this.close();
  };

  #surface(): HTMLElement | null {
    return this.renderRoot.querySelector(".surface");
  }

  // Drag down to close (phones only; not when the touch starts on a control).
  #onPointerDown(ev: PointerEvent): void {
    if (this.mode !== "sheet") return;
    const fromControl = ev
      .composedPath()
      .some(
        (el) =>
          el instanceof HTMLElement &&
          (el.tagName === "BUTTON" || el.tagName === "INPUT" || el.classList.contains("slider")),
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

  protected override render() {
    return html`
      <div class="scrim" @click=${() => this.close()}></div>
      <div
        class="surface"
        role="dialog"
        aria-modal="true"
        aria-label=${this.label}
        @pointerdown=${this.#onPointerDown}
        @pointermove=${this.#onPointerMove}
        @pointerup=${this.#onPointerUp}
        @pointercancel=${this.#onPointerUp}
      >
        <div class="handle"></div>
        <slot></slot>
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
      max-height: calc(100% - 48px);
      overflow-y: auto;
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
    :host([mode="dialog"][wide]) .surface {
      width: min(760px, calc(100vw - 32px));
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
      flex: none;
      width: 44px;
      height: 5px;
      border-radius: 3px;
      background: var(--a-text3);
    }
    @media (prefers-reduced-motion: reduce) {
      .surface,
      .scrim {
        transition-duration: 0s !important;
      }
    }
  `;
}
