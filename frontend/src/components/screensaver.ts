import { LitElement, css, html, nothing } from "lit";
import type { PanelContext } from "../context";
import { weatherEntity } from "../data/home";
import { weatherCondition } from "../i18n";
import { formatTemperature } from "../util/format";
import { weatherIcon, weatherIconStyles } from "../widgets/weather-icon";

export const SCREENSAVER_KEY = "atrium-screensaver-min";
export const SCREENSAVER_CHOICES = [0, 1, 5, 10, 30] as const;

export function readScreensaverMinutes(): number {
  try {
    const n = Number(localStorage.getItem(SCREENSAVER_KEY));
    return (SCREENSAVER_CHOICES as readonly number[]).includes(n) ? n : 0;
  } catch {
    return 0;
  }
}

const EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

/**
 * For wall tablets: after some minutes without touch, a calm dark view with a
 * large clock, date and weather. The clock drifts slowly so nothing burns in.
 * Any touch wakes the panel. Per device (stored in this browser).
 */
export class AtriumScreensaver extends LitElement {
  static override properties = {
    ctx: { attribute: false },
    minutes: { type: Number },
    _active: { state: true },
    _now: { state: true },
  };

  declare ctx: PanelContext;
  declare minutes: number;
  declare _active: boolean;
  declare _now: Date;
  #idle: ReturnType<typeof setTimeout> | undefined;
  #clock: ReturnType<typeof setInterval> | undefined;

  constructor() {
    super();
    this.minutes = 0;
    this._active = false;
    this._now = new Date();
  }

  override connectedCallback(): void {
    super.connectedCallback();
    for (const e of EVENTS) window.addEventListener(e, this.#onActivity, { capture: true, passive: true });
    this.#arm();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    for (const e of EVENTS) window.removeEventListener(e, this.#onActivity, { capture: true });
    clearTimeout(this.#idle);
    clearInterval(this.#clock);
  }

  protected override updated(changed: Map<string, unknown>): void {
    if (changed.has("minutes")) this.#arm();
  }

  #onActivity = (ev: Event) => {
    if (this._active) {
      // The waking touch must not also press whatever is underneath.
      ev.preventDefault?.();
      ev.stopPropagation();
      this.#wake();
      return;
    }
    this.#arm();
  };

  #arm(): void {
    clearTimeout(this.#idle);
    if (!this.minutes) return;
    this.#idle = setTimeout(() => this.#sleep(), this.minutes * 60000);
  }

  #sleep(): void {
    this._now = new Date();
    this._active = true;
    clearInterval(this.#clock);
    this.#clock = setInterval(() => (this._now = new Date()), 1000);
  }

  #wake(): void {
    this._active = false;
    clearInterval(this.#clock);
    // Swallow the click that follows the waking pointerdown.
    window.addEventListener("click", (e) => e.stopPropagation(), { capture: true, once: true });
    this.#arm();
  }

  protected override render() {
    if (!this._active || !this.ctx) return nothing;
    const { t, locale } = this.ctx;
    const hass = this.ctx.store.hass;
    const w = hass ? weatherEntity(hass) : undefined;
    // Drift a little every minute so a static picture never burns in.
    const m = this._now.getMinutes();
    const dx = ((m * 37) % 60) - 30;
    const dy = ((m * 23) % 40) - 20;
    return html`<div class="saver" role="dialog" aria-label=${t("saver.title")}>
      <div class="center" style="transform: translate(${dx}px, ${dy}px)">
        <div class="time">
          ${new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(this._now)}
        </div>
        <div class="date">
          ${new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(this._now)}
        </div>
        ${
          w
            ? html`<div class="wx">
                ${weatherIcon(w.state)}
                <span
                  >${formatTemperature(Number(w.attributes.temperature), locale, 0)} ·
                  ${weatherCondition(t, w.state)}</span
                >
              </div>`
            : nothing
        }
        <div class="hint">${t("saver.touch")}</div>
      </div>
    </div>`;
  }

  static override styles = [
    weatherIconStyles,
    css`
      .saver {
        position: fixed;
        inset: 0;
        z-index: 50;
        background: #050607;
        color: #d9dbd8;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: var(--a-font);
        animation: fade calc(var(--a-motion, 1) * 1.2s) ease-out;
        cursor: none;
      }
      .center {
        text-align: center;
        transition: transform 2s ease;
      }
      .time {
        font-size: clamp(80px, 18vw, 220px);
        font-weight: 600;
        letter-spacing: -0.05em;
        line-height: 1;
        font-variant-numeric: tabular-nums;
      }
      .date {
        font-size: clamp(18px, 3vw, 30px);
        color: #9aa0a6;
        margin-top: 8px;
      }
      .wx {
        margin-top: 24px;
        display: inline-flex;
        align-items: center;
        gap: 12px;
        font-size: clamp(16px, 2.4vw, 24px);
        color: #b8bcc0;
      }
      .wx svg {
        width: 40px;
        height: 40px;
      }
      .hint {
        margin-top: 40px;
        font-size: 13px;
        color: #50555b;
      }
      @keyframes fade {
        from {
          opacity: 0;
        }
      }
    `,
  ];
}
