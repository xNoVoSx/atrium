// A floor plan: an image (or a plain grid) with devices placed on it. Lights
// and switches toggle on tap, everything else opens its details. In edit mode
// admins add devices and drag them to their place.

import { css, html, nothing, svg, type PropertyValues } from "lit";
import { live } from "lit/directives/live.js";
import { repeat } from "lit/directives/repeat.js";
import { SelectorController } from "../../data/entity-store";
import { nameOf } from "../../data/registry";
import { domainOf, fmt, num, unitOf } from "../adapters/util";
import { WidgetBase } from "../base";
import { widgetStyles } from "../styles";

export interface Marker {
  entity: string;
  /** Position in percent of the plan. */
  x: number;
  y: number;
}

const TOGGLE = ["light", "switch", "fan", "input_boolean"];
const OPENINGS = ["door", "window", "garage_door", "opening"];

const PATHS: Record<string, string> = {
  light: "M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z",
  switch: "M12 3v9M6.3 7.3a8 8 0 1 0 11.4 0",
  climate: "M10 14V5a2 2 0 1 1 4 0v9a4 4 0 1 1-4 0z",
  binary_sensor: "M3 21V9l9-5 9 5v12M7 21v-8h10v8",
  camera: "M3 7h4l2-3h6l2 3h4v12H3zM12 10a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  cover: "M4 4h16v16H4zM4 8h16M4 12h16",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z",
  media_player: "M7 5l12 7-12 7z",
  sensor: "M12 3v12M8 7h8M7 21h10",
};

const isMarker = (m: unknown): m is Marker =>
  typeof m === "object" && m !== null && typeof (m as Marker).entity === "string";

export class AtriumFloorplanWidget extends WidgetBase {
  static override properties = { ...WidgetBase.properties, _drag: { state: true }, _draft: { state: true } };
  declare _drag: { index: number; x: number; y: number } | null;
  declare _draft: string;

  #states = new SelectorController(
    this,
    () => this.ctx?.store,
    (hass) =>
      this.#markers().map((m) => {
        const s = hass.states[m.entity];
        return {
          state: s?.state ?? "unavailable",
          cls: String(s?.attributes.device_class ?? ""),
          name: s ? nameOf(hass, m.entity) : m.entity,
          value:
            s && num(s) !== null
              ? `${fmt(this.ctx.locale, num(s), 1)}${unitOf(s) === "°C" ? "°" : ` ${unitOf(s)}`}`
              : "",
          temp: s && domainOf(m.entity) === "climate" ? Number(s.attributes.current_temperature) : null,
        };
      }),
  );

  constructor() {
    super();
    this._drag = null;
    this._draft = "";
  }

  #markers(): Marker[] {
    if (this.demo)
      return [
        { entity: "light.demo_a", x: 22, y: 30 },
        { entity: "light.demo_b", x: 70, y: 28 },
        { entity: "binary_sensor.demo_door", x: 48, y: 88 },
        { entity: "climate.demo", x: 72, y: 66 },
      ];
    return Array.isArray(this.options.markers) ? (this.options.markers as unknown[]).filter(isMarker) : [];
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    this.#states.attach();
    if (changed.has("config")) this.#states.refresh();
  }

  get #editing(): boolean {
    return Boolean(this.ctx?.editing && this.ctx.isAdmin && !this.demo);
  }

  #save(markers: Marker[]): void {
    this.dispatchEvent(
      new CustomEvent("atrium-widget-options", {
        detail: { id: this.config.id, options: { ...this.options, markers } },
        bubbles: true,
        composed: true,
      }),
    );
  }

  #tap(m: Marker): void {
    if (this.#editing || this.demo) return;
    const domain = domainOf(m.entity);
    if (TOGGLE.includes(domain)) this.toggle(m.entity);
    else if (domain === "light" || domain === "climate")
      this.dispatchEvent(
        new CustomEvent("atrium-more-info", {
          detail: { entityId: m.entity },
          bubbles: true,
          composed: true,
        }),
      );
    else this.moreInfo(m.entity);
  }

  #long(m: Marker): void {
    if (this.#editing || this.demo) return;
    const domain = domainOf(m.entity);
    const own = domain === "light" || domain === "climate";
    this.dispatchEvent(
      new CustomEvent(own ? "atrium-more-info" : "hass-more-info", {
        detail: { entityId: m.entity },
        bubbles: true,
        composed: true,
      }),
    );
  }

  #down(ev: PointerEvent, index: number): void {
    if (!this.#editing) return;
    if ((ev.target as HTMLElement).closest(".rm")) return;
    ev.preventDefault();
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    const m = this.#markers()[index];
    if (m) this._drag = { index, x: m.x, y: m.y };
  }

  #move(ev: PointerEvent): void {
    if (!this._drag) return;
    const plan = this.renderRoot.querySelector(".plan")?.getBoundingClientRect();
    if (!plan) return;
    const x = Math.max(2, Math.min(98, ((ev.clientX - plan.left) / plan.width) * 100));
    const y = Math.max(3, Math.min(97, ((ev.clientY - plan.top) / plan.height) * 100));
    this._drag = { ...this._drag, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  }

  #up(): void {
    const d = this._drag;
    if (!d) return;
    this._drag = null;
    const markers = this.#markers().map((m, i) => (i === d.index ? { ...m, x: d.x, y: d.y } : m));
    this.#save(markers);
  }

  #add(ev: Event): void {
    ev.preventDefault();
    const id = this._draft.trim();
    if (!id || !this.ctx.store.hass?.states[id]) return;
    this._draft = "";
    this.#save([...this.#markers(), { entity: id, x: 50, y: 50 }]);
  }

  protected override render() {
    if (!this.ctx) return nothing;
    const { t } = this.ctx;
    const markers = this.#markers();
    const states = this.#states.value ?? [];
    const image = typeof this.options.image === "string" ? this.options.image : "";
    const ratio = Number(this.options.ratio) || 1.6;
    const editing = this.#editing;
    const hass = this.ctx.store.rawHass;
    return html`<div class="w">
      ${this.renderHead(editing ? t("fp.drag_hint") : nothing)}
      <div
        class="plan ${image ? "" : "grid"} ${editing ? "editing" : ""}"
        style="aspect-ratio:${ratio};${image ? `background-image:url('${encodeURI(image)}')` : ""}"
        @pointermove=${this.#move}
        @pointerup=${this.#up}
        @pointercancel=${this.#up}
      >
        ${repeat(
          markers,
          (m, i) => `${m.entity}:${i}`,
          (m, i) => {
            const st = this.demo
              ? [
                  { state: "on", cls: "", name: "Decke", value: "", temp: null },
                  { state: "off", cls: "", name: "Stehlampe", value: "", temp: null },
                  { state: "on", cls: "door", name: "Haustür", value: "", temp: null },
                  { state: "heat", cls: "", name: "Heizung", value: "", temp: 21.5 },
                ][i]
              : states[i];
            const domain = domainOf(m.entity);
            const pos = this._drag?.index === i ? this._drag : m;
            const on = st?.state === "on" && TOGGLE.includes(domain);
            const alert = domain === "binary_sensor" && st?.state === "on" && OPENINGS.includes(st.cls);
            const label =
              st?.temp !== null && st?.temp !== undefined && !Number.isNaN(st.temp)
                ? `${st.temp}°`
                : domain === "sensor"
                  ? (st?.value ?? "")
                  : "";
            return html`<button
              type="button"
              class="m ${on ? "on" : ""} ${alert ? "alert" : ""} ${st?.state === "unavailable" ? "na" : ""} ${this._drag?.index === i ? "drag" : ""}"
              style="left:${pos.x}%;top:${pos.y}%"
              title=${st?.name ?? m.entity}
              aria-label=${st?.name ?? m.entity}
              @click=${() => this.#tap(m)}
              @contextmenu=${(e: Event) => {
                e.preventDefault();
                this.#long(m);
              }}
              @pointerdown=${(e: PointerEvent) => this.#down(e, i)}
            >
              <svg viewBox="0 0 24 24">${svg`<path d=${PATHS[domain] ?? PATHS.sensor} />`}</svg>
              ${label ? html`<span class="val">${label}</span>` : nothing}
              ${
                editing
                  ? html`<span
                      class="rm edit-action"
                      role="button"
                      aria-label=${t("w.remove")}
                      @click=${(e: Event) => {
                        e.stopPropagation();
                        this.#save(markers.filter((_, j) => j !== i));
                      }}
                      >×</span
                    >`
                  : nothing
              }
            </button>`;
          },
        )}
        ${!markers.length && !this.demo ? html`<p class="hint">${t(editing ? "fp.add_hint" : "fp.empty")}</p>` : nothing}
      </div>
      ${
        editing
          ? html`<form class="add" @submit=${this.#add}>
              <input
                class="edit-action"
                list="fp-entities"
                placeholder=${t("wo.add_entity")}
                .value=${live(this._draft)}
                @input=${(e: Event) => (this._draft = (e.target as HTMLInputElement).value)}
              />
              <datalist id="fp-entities">
                ${Object.keys(hass?.states ?? {})
                  .filter((id) => Object.keys(PATHS).includes(domainOf(id)))
                  .slice(0, 600)
                  .map((id) => html`<option value=${id}>${hass ? nameOf(hass, id) : id}</option>`)}
              </datalist>
              <button type="submit" class="edit-action">${t("w.add")}</button>
            </form>`
          : nothing
      }
    </div>`;
  }

  static override styles = [
    widgetStyles,
    css`
      .plan {
        position: relative;
        width: 100%;
        border-radius: var(--a-radius);
        background-color: var(--a-s2);
        background-size: contain;
        background-position: center;
        background-repeat: no-repeat;
        overflow: hidden;
        touch-action: none;
      }
      .plan.grid {
        background-image:
          linear-gradient(var(--a-s3) 1px, transparent 1px),
          linear-gradient(90deg, var(--a-s3) 1px, transparent 1px);
        background-size: 24px 24px;
        background-position: -1px -1px;
        background-repeat: repeat;
      }
      .plan.editing {
        outline: 2px dashed var(--a-ocher);
        outline-offset: -2px;
      }
      .m {
        all: unset;
        position: absolute;
        transform: translate(-50%, -50%);
        min-width: 40px;
        height: 40px;
        padding: 0 6px;
        box-sizing: border-box;
        border-radius: 20px;
        background: var(--a-s1);
        color: var(--a-text);
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        cursor: pointer;
        transition:
          background-color calc(var(--a-motion, 1) * 250ms),
          transform calc(var(--a-motion, 1) * 150ms);
      }
      .m:active {
        transform: translate(-50%, -50%) scale(0.92);
      }
      .m svg {
        width: 20px;
        height: 20px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .m.on {
        background: var(--a-ocher);
        color: var(--a-on-ocher);
        animation: lit calc(var(--a-motion, 1) * 500ms) ease-out;
      }
      .m.alert {
        background: var(--a-terra);
        color: #fff;
        animation: pulse-ring calc(var(--a-motion, 1) * 1.6s) ease-out var(--a-iter, infinite);
      }
      .m.na {
        opacity: 0.45;
      }
      .m.drag {
        transition: none;
        cursor: grabbing;
        z-index: 2;
      }
      .editing .m {
        cursor: grab;
      }
      .val {
        font-size: 13px;
        font-weight: 600;
      }
      .rm {
        position: absolute;
        top: -8px;
        right: -8px;
        width: 20px;
        height: 20px;
        border-radius: 10px;
        background: var(--a-terra);
        color: #fff;
        font-size: 14px;
        line-height: 20px;
        text-align: center;
      }
      .hint {
        position: absolute;
        inset: 0;
        margin: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 20px;
        color: var(--a-text2);
        font-size: 14px;
      }
      .add {
        display: flex;
        gap: 6px;
      }
      .add input {
        flex: 1;
        min-height: 42px;
        border: 0;
        border-radius: var(--a-radius);
        background: var(--a-s2);
        color: var(--a-text);
        font: inherit;
        padding: 0 12px;
      }
      .add button {
        border: 0;
        border-radius: var(--a-radius);
        background: var(--a-ocher);
        color: var(--a-on-ocher);
        font: inherit;
        font-weight: 600;
        padding: 0 16px;
        cursor: pointer;
      }
      @keyframes lit {
        from {
          transform: translate(-50%, -50%) scale(0.8);
        }
      }
      @keyframes pulse-ring {
        from {
          box-shadow: 0 0 0 0 var(--a-terra);
        }
        to {
          box-shadow: 0 0 0 14px transparent;
        }
      }
    `,
  ];
}
