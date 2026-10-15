// Household widgets: covers, fans, vacuums and mowers, locks, alarm,
// appliances, timers, switches, scripts and automations.

import { css, html, nothing, svg, type PropertyValues } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { SelectorController } from "../../data/entity-store";
import { nameOf } from "../../data/registry";
import type { MessageKey } from "../../i18n";
import type { HassEntity, HomeAssistant } from "../../types/hass";
import { chosenOr } from "../adapters/house";
import { domainOf, fmt, num } from "../adapters/util";
import { WidgetBase } from "../base";
import { widgetStyles } from "../styles";

interface Item {
  id: string;
  name: string;
  state: string;
  attrs: Record<string, unknown>;
  changed: string;
}

const itemOf = (hass: HomeAssistant, id: string): Item => {
  const s = hass.states[id] as HassEntity;
  return { id, name: nameOf(hass, id), state: s.state, attrs: s.attributes, changed: s.last_changed };
};

/** Base for widgets that list entities of some domains (chosen or automatic). */
class ListWidget extends WidgetBase {
  domains: readonly string[] = [];

  #items = new SelectorController(
    this,
    () => this.ctx?.store,
    (hass) => this.select(hass),
  );

  select(hass: HomeAssistant): Item[] {
    return chosenOr(hass, this.options, this.domains)
      .filter((id) => hass.states[id])
      .map((id) => itemOf(hass, id));
  }

  demoItems(): Item[] {
    return [];
  }

  get items(): Item[] {
    return this.demo ? this.demoItems() : (this.#items.value ?? []);
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    this.#items.attach();
    if (changed.has("config") || changed.has("ctx")) this.#items.refresh();
  }

  call(domain: string, service: string, entityId: string, data: Record<string, unknown> = {}): void {
    if (this.demo) return;
    void this.ctx.store.hass?.callService(domain, service, { entity_id: entityId, ...data });
  }

  stateLabel(state: string): string {
    const { t } = this.ctx;
    return t(`state.${state}` as MessageKey) || t(`w.st.${state}` as MessageKey) || state;
  }

  renderEmpty() {
    return this.ctx.editing
      ? html`<div class="w missing">
          ${this.renderHead()}
          <p class="empty">${this.ctx.t("w.not_found")}</p>
        </div>`
      : nothing;
  }
}

const demo = (id: string, name: string, state: string, attrs: Record<string, unknown> = {}): Item => ({
  id,
  name,
  state,
  attrs,
  changed: new Date().toISOString(),
});

const ctl = css`
  .ctl {
    display: flex;
    gap: 6px;
  }
  .ctl button,
  .act {
    all: unset;
    box-sizing: border-box;
    min-width: 42px;
    height: 42px;
    padding: 0 10px;
    border-radius: var(--a-radius);
    background: var(--a-s3);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: transform calc(var(--a-motion, 1) * 120ms);
  }
  .ctl button:active,
  .act:active {
    transform: scale(0.94);
  }
  .ctl button:focus-visible,
  .act:focus-visible {
    outline: 2px solid var(--a-ocher);
    outline-offset: 2px;
  }
  .act.primary {
    background: var(--a-ocher);
    color: var(--a-on-ocher);
  }
  .act.danger {
    background: var(--a-terra);
    color: #fff;
  }
  .ctl svg,
  .act svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .tile {
    background: var(--a-s2);
    border-radius: var(--a-radius);
    padding: 10px 12px;
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }
  .tile .tn {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    cursor: pointer;
  }
  .tile .tn b {
    font-size: 15px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tile .tn small {
    font-size: 12px;
    color: var(--a-text2);
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 8px;
  }
  .gfx {
    width: 40px;
    height: 40px;
    flex: none;
    color: var(--a-text2);
  }
  .gfx svg {
    width: 100%;
    height: 100%;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
    overflow: visible;
  }
  .on .gfx {
    color: var(--a-ocher);
  }
`;

const ico = (d: string) => svg`<svg viewBox="0 0 24 24"><path d=${d} /></svg>`;
const UP = "M6 15l6-6 6 6";
const DOWN = "M6 9l6 6 6-6";
const STOP = "M7 7h10v10H7z";
const PLAY = "M7 5l12 7-12 7z";
const PAUSE = "M7 5h4v14H7zM13 5h4v14h-4z";
const HOME = "M3 11l9-7 9 7v10H3z";

// ---- covers ----

export class AtriumCoversWidget extends ListWidget {
  override domains = ["cover"];

  override demoItems() {
    return [
      demo("cover.a", "Rollo Wohnzimmer", "open", { current_position: 100 }),
      demo("cover.b", "Markise", "opening", { current_position: 40 }),
      demo("cover.c", "Rollo Schlafzimmer", "closed", { current_position: 0 }),
    ];
  }

  protected override render() {
    if (!this.ctx) return nothing;
    const items = this.items.filter(
      (i) => i.attrs.device_class !== "garage" && i.attrs.device_class !== "door",
    );
    if (!items.length) return this.renderEmpty();
    const { t } = this.ctx;
    return html`<div class="w">
      ${this.renderHead(`${items.filter((i) => i.state !== "closed").length} ${t("status.open")}`)}
      <div class="tiles">
        ${repeat(
          items,
          (i) => i.id,
          (i) => {
            const pos =
              typeof i.attrs.current_position === "number"
                ? (i.attrs.current_position as number)
                : i.state === "closed"
                  ? 0
                  : 100;
            const moving = i.state === "opening" || i.state === "closing";
            return html`<div class="tile ${pos > 0 ? "" : ""}">
              <span class="gfx blind ${moving ? "moving" : ""}">
                <svg viewBox="0 0 24 24">
                  <rect x="4" y="3" width="16" height="18" rx="1" />
                  <g class="slats" style="transform: scaleY(${(100 - pos) / 100})">
                    <path d="M4 5h16M4 8h16M4 11h16M4 14h16M4 17h16M4 20h16" />
                  </g>
                </svg>
              </span>
              <span class="tn" @click=${() => this.moreInfo(i.id)}>
                <b>${i.name}</b
                ><small>${moving ? this.stateLabel(i.state) : `${pos} % ${t("status.open")}`}</small>
              </span>
              <span class="ctl">
                <button
                  type="button"
                  aria-label=${t("w.open")}
                  @click=${() => this.call("cover", "open_cover", i.id)}
                >
                  ${ico(UP)}
                </button>
                <button
                  type="button"
                  aria-label=${t("w.stop")}
                  @click=${() => this.call("cover", "stop_cover", i.id)}
                >
                  ${ico(STOP)}
                </button>
                <button
                  type="button"
                  aria-label=${t("w.close")}
                  @click=${() => this.call("cover", "close_cover", i.id)}
                >
                  ${ico(DOWN)}
                </button>
              </span>
            </div>`;
          },
        )}
      </div>
    </div>`;
  }

  static override styles = [
    widgetStyles,
    ctl,
    css`
      .ctl button {
        min-width: 38px;
        height: 38px;
        padding: 0;
      }
      .slats {
        transform-origin: 12px 3px;
        transition: transform calc(var(--a-motion, 1) * 900ms) ease;
      }
      .moving .slats {
        animation: slat calc(var(--a-motion, 1) * 1.2s) ease-in-out var(--a-iter, infinite) alternate;
      }
      @keyframes slat {
        to {
          opacity: 0.4;
        }
      }
    `,
  ];
}

// ---- fans ----

export class AtriumFansWidget extends ListWidget {
  override domains = ["fan"];

  override demoItems() {
    return [demo("fan.a", "Deckenventilator", "on", { percentage: 66 }), demo("fan.b", "Bad-Lüfter", "off")];
  }

  protected override render() {
    if (!this.ctx) return nothing;
    const items = this.items;
    if (!items.length) return this.renderEmpty();
    return html`<div class="w">
      ${this.renderHead()}
      <div class="tiles">
        ${repeat(
          items,
          (i) => i.id,
          (i) => {
            const on = i.state === "on";
            const pct =
              typeof i.attrs.percentage === "number" ? (i.attrs.percentage as number) : on ? 100 : 0;
            const speed = on ? Math.max(0.4, 2.4 - pct / 50) : 0;
            return html`<div class="tile ${on ? "on" : ""}">
              <span class="gfx fan" style="--spin:${speed}s">
                <svg viewBox="0 0 24 24">
                  <g class="blades">
                    <path
                      d="M12 10.5C12 6 14 4 16 4s3 2 1 4l-5 2.5M13.5 12c4.5 0 6.5 2 6.5 4s-2 3-4 1l-2.5-5M12 13.5c0 4.5-2 6.5-4 6.5s-3-2-1-4l5-2.5M10.5 12C6 12 4 10 4 8s2-3 4-1l2.5 5"
                    />
                  </g>
                  <circle cx="12" cy="12" r="1.5" />
                </svg>
              </span>
              <span class="tn" @click=${() => this.moreInfo(i.id)}>
                <b>${i.name}</b><small>${on ? `${pct} %` : this.stateLabel(i.state)}</small>
              </span>
              <button
                type="button"
                class="act ${on ? "primary" : ""}"
                aria-pressed=${String(on)}
                @click=${() => this.call("fan", "toggle", i.id)}
              >
                ${on ? this.ctx.t("state.on") : this.ctx.t("state.off")}
              </button>
            </div>`;
          },
        )}
      </div>
    </div>`;
  }

  static override styles = [
    widgetStyles,
    ctl,
    css`
      .blades {
        transform-origin: 12px 12px;
      }
      .on .blades {
        animation: spin calc(var(--a-motion, 1) * var(--spin, 1s)) linear var(--a-iter, infinite);
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
    `,
  ];
}

// ---- vacuums and lawn mowers ----

export class AtriumVacuumWidget extends ListWidget {
  override domains = ["vacuum", "lawn_mower"];

  override demoItems() {
    return [
      demo("vacuum.a", "Saugroboter", "cleaning", { battery_level: 72 }),
      demo("lawn_mower.b", "Mähroboter", "docked", { battery_level: 100 }),
    ];
  }

  protected override render() {
    if (!this.ctx) return nothing;
    const items = this.items;
    if (!items.length) return this.renderEmpty();
    const { t } = this.ctx;
    return html`<div class="w">
      ${this.renderHead()}
      <div class="tiles">
        ${repeat(
          items,
          (i) => i.id,
          (i) => {
            const domain = domainOf(i.id);
            const busy = ["cleaning", "mowing", "returning"].includes(i.state);
            const battery =
              typeof i.attrs.battery_level === "number" ? (i.attrs.battery_level as number) : null;
            const start = domain === "vacuum" ? "start" : "start_mowing";
            return html`<div class="tile ${busy ? "on" : ""}">
              <span class="gfx robot ${busy ? "busy" : ""}">
                <svg viewBox="0 0 24 24">
                  <g class="bot">
                    <circle cx="12" cy="13" r="7" />
                    <path d="M9 11h6" />
                    <circle cx="12" cy="13" r="1" />
                  </g>
                  <path class="trail" d="M2 21h20" />
                </svg>
              </span>
              <span class="tn" @click=${() => this.moreInfo(i.id)}>
                <b>${i.name}</b
                ><small>${this.stateLabel(i.state)}${battery !== null ? ` · ${battery} %` : ""}</small>
              </span>
              <span class="ctl">
                ${
                  busy
                    ? html`<button
                        type="button"
                        aria-label=${t("w.pause")}
                        @click=${() => this.call(domain, "pause", i.id)}
                      >
                        ${ico(PAUSE)}
                      </button>`
                    : html`<button
                        type="button"
                        aria-label=${t("w.start")}
                        @click=${() => this.call(domain, start, i.id)}
                      >
                        ${ico(PLAY)}
                      </button>`
                }
                <button
                  type="button"
                  aria-label=${t("w.dock")}
                  @click=${() => this.call(domain, domain === "vacuum" ? "return_to_base" : "dock", i.id)}
                >
                  ${ico(HOME)}
                </button>
              </span>
            </div>`;
          },
        )}
      </div>
    </div>`;
  }

  static override styles = [
    widgetStyles,
    ctl,
    css`
      .busy .bot {
        animation: roam calc(var(--a-motion, 1) * 3s) ease-in-out var(--a-iter, infinite);
      }
      .trail {
        stroke-dasharray: 2 3;
        opacity: 0.4;
      }
      .busy .trail {
        animation: dash calc(var(--a-motion, 1) * 1s) linear var(--a-iter, infinite);
      }
      @keyframes roam {
        0%,
        100% {
          transform: translateX(-3px) rotate(-8deg);
        }
        50% {
          transform: translateX(3px) rotate(8deg);
        }
      }
      @keyframes dash {
        to {
          stroke-dashoffset: -10;
        }
      }
    `,
  ];
}

// ---- locks ----

export class AtriumLocksWidget extends ListWidget {
  static override properties = { ...WidgetBase.properties, _confirm: { state: true } };
  declare _confirm: string | null;
  override domains = ["lock"];
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    super();
    this._confirm = null;
  }

  override demoItems() {
    return [demo("lock.a", "Haustür", "locked"), demo("lock.b", "Gartentor", "unlocked")];
  }

  /** Unlocking needs a second tap within 3 s, so a pocket tap cannot open the door. */
  #tap(i: Item): void {
    if (i.state === "locked" && this._confirm !== i.id) {
      this._confirm = i.id;
      clearTimeout(this.#timer);
      this.#timer = setTimeout(() => (this._confirm = null), 3000);
      return;
    }
    this._confirm = null;
    this.call("lock", i.state === "locked" ? "unlock" : "lock", i.id);
  }

  protected override render() {
    if (!this.ctx) return nothing;
    const items = this.items;
    if (!items.length) return this.renderEmpty();
    const { t } = this.ctx;
    return html`<div class="w">
      ${this.renderHead()}
      <div class="tiles">
        ${repeat(
          items,
          (i) => i.id,
          (i) => {
            const locked = i.state === "locked";
            return html`<div class="tile ${locked ? "" : "open"}">
              <span class="gfx lock ${locked ? "locked" : ""}">
                <svg viewBox="0 0 24 24">
                  <path class="shackle" d="M8 11V8a4 4 0 0 1 8 0v3" />
                  <rect x="5" y="11" width="14" height="10" rx="2" />
                </svg>
              </span>
              <span class="tn" @click=${() => this.moreInfo(i.id)}>
                <b>${i.name}</b><small>${locked ? t("w.locked") : t("w.unlocked")}</small>
              </span>
              <button
                type="button"
                class="act ${this._confirm === i.id ? "danger" : locked ? "" : "primary"}"
                @click=${() => this.#tap(i)}
              >
                ${this._confirm === i.id ? t("w.tap_again") : locked ? t("w.unlock") : t("w.lock")}
              </button>
            </div>`;
          },
        )}
      </div>
    </div>`;
  }

  static override styles = [
    widgetStyles,
    ctl,
    css`
      .shackle {
        transition: transform calc(var(--a-motion, 1) * 400ms) cubic-bezier(0.3, 1.5, 0.5, 1);
        transform: translateY(-2.5px);
      }
      .locked .shackle {
        transform: none;
      }
      .open .gfx {
        color: var(--a-ocher);
      }
    `,
  ];
}

// ---- alarm ----

export class AtriumAlarmWidget extends ListWidget {
  override domains = ["alarm_control_panel"];

  override demoItems() {
    return [demo("alarm_control_panel.a", "Alarmanlage", "armed_home")];
  }

  protected override render() {
    if (!this.ctx) return nothing;
    const items = this.items;
    if (!items.length) return this.renderEmpty();
    const { t } = this.ctx;
    return html`<div class="w">
      ${this.renderHead()}
      ${items.map((i) => {
        const armed = i.state.startsWith("armed");
        const alert = i.state === "triggered";
        const pending = i.state === "arming" || i.state === "pending";
        return html`<div
          class="alarm ${armed ? "armed" : ""} ${alert ? "alert" : ""} ${pending ? "pending" : ""}"
        >
          <span class="shield">
            <svg viewBox="0 0 24 24">
              <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
              ${armed ? svg`<path d="M9 12l2 2 4-4" />` : nothing}
            </svg>
          </span>
          <span class="tn" @click=${() => this.moreInfo(i.id)}
            ><b>${i.name}</b><small>${this.stateLabel(i.state)}</small></span
          >
          <span class="ctl">
            ${
              armed || pending || alert
                ? html`<button
                    type="button"
                    class="act danger"
                    @click=${() => this.call("alarm_control_panel", "alarm_disarm", i.id)}
                  >
                    ${t("w.disarm")}
                  </button>`
                : html`<button
                      type="button"
                      class="act"
                      @click=${() => this.call("alarm_control_panel", "alarm_arm_home", i.id)}
                    >
                      ${t("w.arm_home")}
                    </button>
                    <button
                      type="button"
                      class="act primary"
                      @click=${() => this.call("alarm_control_panel", "alarm_arm_away", i.id)}
                    >
                      ${t("w.arm_away")}
                    </button>`
            }
          </span>
        </div>`;
      })}
    </div>`;
  }

  static override styles = [
    widgetStyles,
    ctl,
    css`
      .alarm {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
        background: var(--a-s2);
        border-radius: var(--a-radius);
        padding: 12px;
      }
      .alarm.armed {
        background: var(--a-sage);
        color: #fff;
      }
      .alarm.alert {
        background: var(--a-terra);
        color: #fff;
        animation: alert calc(var(--a-motion, 1) * 1s) ease-in-out var(--a-iter, infinite) alternate;
      }
      .shield svg {
        width: 40px;
        height: 40px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .pending .shield {
        animation: alert calc(var(--a-motion, 1) * 0.8s) ease-in-out var(--a-iter, infinite) alternate;
      }
      .tn {
        flex: 1;
        display: flex;
        flex-direction: column;
        cursor: pointer;
      }
      .tn b {
        font-size: 17px;
      }
      .tn small {
        font-size: 13px;
        opacity: 0.85;
      }
      @keyframes alert {
        to {
          opacity: 0.6;
        }
      }
    `,
  ];
}

// ---- appliances (power-based) ----

const APPLIANCE_WORDS =
  /wasch|trockn|spül|geschirr|wash|dry|dish|oven|ofen|herd|kaffee|coffee|kühl|fridge|freezer/i;

export class AtriumAppliancesWidget extends ListWidget {
  override domains = ["sensor"];

  override select(hass: HomeAssistant): Item[] {
    const chosen = Array.isArray(this.options.entities)
      ? (this.options.entities as string[]).filter((id) => id in hass.states)
      : [];
    const ids = chosen.length
      ? chosen
      : Object.keys(hass.states).filter((id) => {
          const s = hass.states[id];
          if (!s) return false;
          return (
            id.startsWith("sensor.") &&
            s.attributes.device_class === "power" &&
            APPLIANCE_WORDS.test(nameOf(hass, id))
          );
        });
    return ids.map((id) => itemOf(hass, id));
  }

  override demoItems() {
    return [
      demo("sensor.a", "Waschmaschine", "1840", { unit_of_measurement: "W" }),
      demo("sensor.b", "Trockner", "0.4", { unit_of_measurement: "W" }),
    ];
  }

  protected override render() {
    if (!this.ctx) return nothing;
    const items = this.items;
    if (!items.length) return this.renderEmpty();
    const { t, locale } = this.ctx;
    const threshold = Number(this.options.threshold) || 5;
    return html`<div class="w">
      ${this.renderHead()}
      <div class="tiles">
        ${repeat(
          items,
          (i) => i.id,
          (i) => {
            const w = num({ state: i.state } as HassEntity) ?? 0;
            const running = w >= threshold;
            return html`<div class="tile ${running ? "on" : ""}" @click=${() => this.moreInfo(i.id)}>
              <span class="gfx drum ${running ? "run" : ""}">
                <svg viewBox="0 0 24 24">
                  <rect x="4" y="3" width="16" height="18" rx="2" />
                  <path d="M4 7h16" />
                  <g class="d">
                    <circle cx="12" cy="14" r="4" />
                    <path d="M10 13.5c1 1 3 1 4 0" />
                  </g>
                </svg>
              </span>
              <span class="tn"><b>${i.name}</b><small>${running ? t("w.running") : t("w.idle")}</small></span>
              <span class="pw">${fmt(locale, w, 0)} W</span>
            </div>`;
          },
        )}
      </div>
    </div>`;
  }

  static override styles = [
    widgetStyles,
    ctl,
    css`
      .tile {
        cursor: pointer;
      }
      .d {
        transform-origin: 12px 14px;
      }
      .run .d {
        animation: spin calc(var(--a-motion, 1) * 1.4s) linear var(--a-iter, infinite);
      }
      .pw {
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
    `,
  ];
}

// ---- timers ----

export class AtriumTimersWidget extends ListWidget {
  static override properties = { ...WidgetBase.properties, _tick: { state: true } };
  declare _tick: number;
  override domains = ["timer"];
  #timer: ReturnType<typeof setInterval> | undefined;

  constructor() {
    super();
    this._tick = 0;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.#timer = setInterval(() => (this._tick = Date.now()), 1000);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearInterval(this.#timer);
  }

  override demoItems() {
    return [
      demo("timer.a", "Eier", "active", {
        finishes_at: new Date(Date.now() + 245000).toISOString(),
        duration: "0:06:00",
      }),
    ];
  }

  protected override render() {
    if (!this.ctx) return nothing;
    const items = this.items;
    if (!items.length) return this.renderEmpty();
    const { t } = this.ctx;
    const parse = (d: unknown) => {
      const [h, m, s] = String(d ?? "0:0:0")
        .split(":")
        .map(Number);
      return ((h ?? 0) * 3600 + (m ?? 0) * 60 + (s ?? 0)) * 1000;
    };
    return html`<div class="w">
      ${this.renderHead()}
      <div class="tiles">
        ${repeat(
          items,
          (i) => i.id,
          (i) => {
            const active = i.state === "active";
            const left = active
              ? Math.max(0, Date.parse(String(i.attrs.finishes_at)) - Date.now())
              : parse(i.attrs.remaining);
            const total = parse(i.attrs.duration) || 1;
            const pct = Math.max(0, Math.min(100, (left / total) * 100));
            const mm = Math.floor(left / 60000);
            const ss = Math.floor((left % 60000) / 1000);
            return html`<div class="tile ${active ? "on" : ""}">
              <span class="ring" style="--p:${pct}">
                <svg viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15" class="bg" />
                  <circle cx="18" cy="18" r="15" class="fg" />
                </svg>
              </span>
              <span class="tn" @click=${() => this.moreInfo(i.id)}
                ><b>${i.name}</b><small>${this.stateLabel(i.state)}</small></span
              >
              <span class="left">${mm}:${String(ss).padStart(2, "0")}</span>
              <span class="ctl">
                ${
                  active
                    ? html`<button
                        type="button"
                        aria-label=${t("w.pause")}
                        @click=${() => this.call("timer", "pause", i.id)}
                      >
                        ${ico(PAUSE)}
                      </button>`
                    : html`<button
                        type="button"
                        aria-label=${t("w.start")}
                        @click=${() => this.call("timer", "start", i.id)}
                      >
                        ${ico(PLAY)}
                      </button>`
                }
              </span>
            </div>`;
          },
        )}
      </div>
    </div>`;
  }

  static override styles = [
    widgetStyles,
    ctl,
    css`
      .ring svg {
        width: 40px;
        height: 40px;
        transform: rotate(-90deg);
      }
      .ring circle {
        fill: none;
        stroke-width: 4;
      }
      .ring .bg {
        stroke: var(--a-s3);
      }
      .ring .fg {
        stroke: var(--a-ocher);
        stroke-dasharray: 94.25;
        stroke-dashoffset: calc(94.25 - 94.25 * var(--p) / 100);
        transition: stroke-dashoffset 1s linear;
      }
      .left {
        font-size: 20px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }
    `,
  ];
}

// ---- switches and helpers ----

export class AtriumSwitchesWidget extends ListWidget {
  override domains = ["switch", "input_boolean"];

  override demoItems() {
    return [
      demo("switch.a", "Kaffeemaschine", "on"),
      demo("input_boolean.b", "Urlaubsmodus", "off"),
      demo("switch.c", "Weihnachtsdeko", "off"),
    ];
  }

  protected override render() {
    if (!this.ctx) return nothing;
    const items = this.items.slice(0, Number(this.options.max) || 12);
    if (!items.length) return this.renderEmpty();
    return html`<div class="w">
      ${this.renderHead()}
      <div class="tiles">
        ${repeat(
          items,
          (i) => i.id,
          (i) => {
            const on = i.state === "on";
            return html`<button
              type="button"
              class="tile sw ${on ? "on" : ""}"
              aria-pressed=${String(on)}
              @click=${() => this.call(domainOf(i.id), "toggle", i.id)}
            >
              <span class="tn"><b>${i.name}</b><small>${this.stateLabel(i.state)}</small></span>
              <span class="knob"></span>
            </button>`;
          },
        )}
      </div>
    </div>`;
  }

  static override styles = [
    widgetStyles,
    ctl,
    css`
      .sw {
        all: unset;
        box-sizing: border-box;
        background: var(--a-s2);
        border-radius: var(--a-radius);
        padding: 10px 12px;
        display: flex;
        align-items: center;
        gap: 12px;
        cursor: pointer;
        min-height: 56px;
        transition: background-color calc(var(--a-motion, 1) * 250ms);
      }
      .sw.on {
        background: var(--a-ocher);
        color: var(--a-on-ocher);
      }
      .sw.on .tn small {
        color: inherit;
        opacity: 0.8;
      }
      .sw:focus-visible {
        outline: 2px solid var(--a-ocher);
        outline-offset: 2px;
      }
      .sw.on .knob {
        background: var(--a-on-ocher);
      }
      .sw.on .knob::after {
        background: var(--a-ocher);
      }
    `,
  ];
}

// ---- scripts and automations ----

export class AtriumScriptsWidget extends ListWidget {
  static override properties = { ...WidgetBase.properties, _ran: { state: true } };
  declare _ran: string | null;
  override domains = ["script", "automation"];
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    super();
    this._ran = null;
  }

  override select(hass: HomeAssistant): Item[] {
    const kind =
      this.options.kind === "automation"
        ? ["automation"]
        : this.options.kind === "both"
          ? ["script", "automation"]
          : ["script"];
    return chosenOr(hass, this.options, kind).map((id) => itemOf(hass, id));
  }

  override demoItems() {
    return [
      demo("script.a", "Gute Nacht", "off"),
      demo("script.b", "Ich gehe", "off"),
      demo("automation.c", "Licht bei Bewegung", "on"),
    ];
  }

  #run(i: Item): void {
    if (domainOf(i.id) === "automation") {
      this.call("automation", "toggle", i.id);
      return;
    }
    this.call("script", "turn_on", i.id);
    this._ran = i.id;
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => (this._ran = null), 1600);
  }

  protected override render() {
    if (!this.ctx) return nothing;
    const items = this.items;
    if (!items.length) return this.renderEmpty();
    const { t } = this.ctx;
    return html`<div class="w">
      ${this.renderHead()}
      <div class="tiles">
        ${repeat(
          items,
          (i) => i.id,
          (i) => {
            const auto = domainOf(i.id) === "automation";
            const on = auto ? i.state === "on" : i.state === "on" || this._ran === i.id;
            return html`<button type="button" class="tile run ${on ? "on" : ""}" @click=${() => this.#run(i)}>
              <span class="tn"
                ><b>${i.name}</b
                ><small
                  >${auto ? (on ? t("w.active") : t("w.inactive")) : on ? t("w.running") : t("w.tap_to_run")}</small
                ></span
              >
              ${auto ? html`<span class="knob"></span>` : html`<span class="play">${ico(PLAY)}</span>`}
            </button>`;
          },
        )}
      </div>
    </div>`;
  }

  static override styles = [
    widgetStyles,
    ctl,
    css`
      .run {
        all: unset;
        box-sizing: border-box;
        background: var(--a-s2);
        border-radius: var(--a-radius);
        padding: 10px 12px;
        display: flex;
        align-items: center;
        gap: 12px;
        cursor: pointer;
        min-height: 56px;
      }
      .run:focus-visible {
        outline: 2px solid var(--a-ocher);
        outline-offset: 2px;
      }
      .play {
        width: 36px;
        height: 36px;
        border-radius: 18px;
        background: var(--a-s3);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .play svg {
        width: 16px;
        height: 16px;
        fill: currentColor;
        stroke: none;
      }
      .run.on .play {
        background: var(--a-ocher);
        color: var(--a-on-ocher);
        animation: ran calc(var(--a-motion, 1) * 600ms) ease-out;
      }
      @keyframes ran {
        from {
          box-shadow: 0 0 0 0 var(--a-ocher);
        }
        to {
          box-shadow: 0 0 0 12px transparent;
        }
      }
    `,
  ];
}
