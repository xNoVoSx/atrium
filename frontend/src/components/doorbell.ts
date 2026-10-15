import { LitElement, css, html, nothing } from "lit";
import type { PanelContext } from "../context";
import { doorbell, isRing, type Doorbell } from "../data/doorbell";
import { nameOf } from "../data/registry";

const BELL = "M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 21h4";
const REFRESH_MS = 1500;

/**
 * When the doorbell rings, show the door camera on every open Atrium screen.
 * The picture refreshes every 1.5 s; the popup closes by itself.
 */
export class AtriumDoorbell extends LitElement {
  static override properties = {
    ctx: { attribute: false },
    _open: { state: true },
    _tick: { state: true },
    _at: { state: true },
  };

  declare ctx: PanelContext;
  declare _open: boolean;
  declare _tick: number;
  declare _at: Date | null;

  #bell: Doorbell | null = null;
  #unsub: (() => void) | undefined;
  #last: string | undefined;
  #refresh: ReturnType<typeof setInterval> | undefined;
  #close: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    super();
    this._open = false;
    this._tick = 0;
    this._at = null;
  }

  protected override willUpdate(): void {
    const hass = this.ctx?.store.hass;
    if (!hass) return;
    const bell = doorbell(hass, this.ctx.layout);
    if (bell?.trigger !== this.#bell?.trigger) {
      this.#unsub?.();
      this.#unsub = undefined;
      this.#last = bell ? hass.states[bell.trigger]?.state : undefined;
      if (bell)
        this.#unsub = this.ctx.store.subscribeEntity(bell.trigger, () => {
          const now = this.ctx.store.state(bell.trigger)?.state;
          const rang = isRing(bell.trigger, this.#last, now);
          this.#last = now;
          if (rang) this.ring();
        });
    }
    this.#bell = bell;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#unsub?.();
    this.#unsub = undefined;
    this.#bell = null;
    this.#stop();
  }

  /** Show the popup (also used by the "try it" button in the settings). */
  ring(): void {
    this._open = true;
    this._at = new Date();
    this._tick = Date.now();
    clearInterval(this.#refresh);
    this.#refresh = setInterval(() => (this._tick = Date.now()), REFRESH_MS);
    clearTimeout(this.#close);
    this.#close = setTimeout(() => this.#stop(), (this.#bell?.seconds ?? 60) * 1000);
    navigator.vibrate?.([120, 80, 120]);
  }

  #stop(): void {
    this._open = false;
    clearInterval(this.#refresh);
    clearTimeout(this.#close);
  }

  #live(): void {
    const camera = this.#bell?.camera;
    this.#stop();
    if (camera)
      this.dispatchEvent(
        new CustomEvent("hass-more-info", { detail: { entityId: camera }, bubbles: true, composed: true }),
      );
  }

  protected override render() {
    if (!this._open || !this.ctx) return nothing;
    const { t, locale } = this.ctx;
    const hass = this.ctx.store.hass;
    const camera = this.#bell?.camera;
    const picture = camera
      ? (hass?.states[camera]?.attributes.entity_picture as string | undefined)
      : undefined;
    const src = picture ? `${picture}${picture.includes("?") ? "&" : "?"}t=${this._tick}` : "";
    return html`<div class="scrim" @click=${() => this.#stop()}></div>
      <div class="card" role="alertdialog" aria-label=${t("bell.title")}>
        <div class="head">
          <span class="bell"
            ><svg viewBox="0 0 24 24"><path d=${BELL} /></svg
          ></span>
          <div>
            <b>${t("bell.title")}</b>
            <small
              >${this._at ? new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(this._at) : ""}${camera && hass ? ` · ${nameOf(hass, camera)}` : ""}</small
            >
          </div>
        </div>
        ${src ? html`<img src=${src} alt=${t("bell.camera")} />` : html`<div class="noimg">${t("bell.no_camera")}</div>`}
        <div class="actions">
          ${camera ? html`<button type="button" class="primary" @click=${() => this.#live()}>${t("bell.live")}</button>` : nothing}
          <button type="button" @click=${() => this.#stop()}>${t("control.close")}</button>
        </div>
      </div>`;
  }

  static override styles = css`
    :host {
      font-family: var(--a-font);
      color: var(--a-text);
    }
    .scrim {
      position: fixed;
      inset: 0;
      z-index: 40;
      background: var(--a-scrim);
      animation: fade calc(var(--a-motion, 1) * 200ms) ease-out;
    }
    .card {
      position: fixed;
      z-index: 41;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      width: min(640px, calc(100vw - 24px));
      background: var(--a-s1);
      border-radius: 14px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5);
      animation: pop calc(var(--a-motion, 1) * 320ms) cubic-bezier(0.3, 1.4, 0.5, 1);
    }
    .head {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .head b {
      display: block;
      font-size: 22px;
    }
    .head small {
      color: var(--a-text2);
      font-size: 13px;
    }
    .bell {
      width: 48px;
      height: 48px;
      border-radius: 24px;
      background: var(--a-ocher);
      color: var(--a-on-ocher);
      display: flex;
      align-items: center;
      justify-content: center;
      flex: none;
    }
    .bell svg {
      width: 26px;
      height: 26px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
      transform-origin: 12px 3px;
      animation: ring calc(var(--a-motion, 1) * 1.2s) ease-in-out var(--a-iter, infinite);
    }
    img,
    .noimg {
      width: 100%;
      aspect-ratio: 16 / 9;
      object-fit: cover;
      border-radius: var(--a-radius);
      background: var(--a-s3);
    }
    .noimg {
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--a-text2);
    }
    .actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }
    .actions button {
      border: 0;
      min-height: 48px;
      padding: 0 20px;
      border-radius: var(--a-radius);
      background: var(--a-s3);
      color: var(--a-text);
      font: inherit;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
    }
    .actions .primary {
      background: var(--a-ocher);
      color: var(--a-on-ocher);
    }
    @keyframes ring {
      0%,
      60%,
      100% {
        transform: rotate(0);
      }
      10%,
      30% {
        transform: rotate(14deg);
      }
      20%,
      40% {
        transform: rotate(-14deg);
      }
    }
    @keyframes fade {
      from {
        opacity: 0;
      }
    }
    @keyframes pop {
      from {
        opacity: 0;
        transform: translate(-50%, -46%) scale(0.95);
      }
    }
  `;
}
