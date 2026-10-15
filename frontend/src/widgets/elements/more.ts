// "What happened" (activity from the logbook) and a compact card for one room.

import { css, html, nothing, type PropertyValues } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { SelectorController } from "../../data/entity-store";
import { energyConfig, liveEnergy, type LiveEnergy } from "../../data/energy";
import { areaTemperature, lightEntities } from "../../data/home";
import { isAutoVisible, nameOf } from "../../data/registry";
import type { MessageKey } from "../../i18n";
import { formatTemperature } from "../../util/format";
import { domainOf } from "../adapters/util";
import { WidgetBase } from "../base";
import { widgetStyles } from "../styles";

interface LogEntry {
  when: number;
  entity_id?: string;
  state?: string;
  name?: string;
  message?: string;
  domain?: string;
}

/** Domains worth telling a person about; sensors and automations are noise. */
const INTERESTING = [
  "light",
  "switch",
  "cover",
  "lock",
  "binary_sensor",
  "person",
  "alarm_control_panel",
  "media_player",
  "input_boolean",
  "scene",
  "script",
  "vacuum",
  "fan",
];
const BINARY_GROUPS: Record<string, string> = {
  door: "door",
  window: "door",
  garage_door: "door",
  opening: "door",
  motion: "motion",
  occupancy: "occupancy",
  presence: "occupancy",
  moisture: "moisture",
};

export class AtriumActivityWidget extends WidgetBase {
  static override properties = { ...WidgetBase.properties, _entries: { state: true }, _now: { state: true } };
  declare _entries: LogEntry[];
  declare _now: number;
  #unsub: Promise<() => void> | undefined;
  #timer: ReturnType<typeof setInterval> | undefined;

  constructor() {
    super();
    this._entries = [];
    this._now = Date.now();
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.#timer = setInterval(() => (this._now = Date.now()), 30000);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearInterval(this.#timer);
    void this.#unsub?.then((u) => u()).catch(() => undefined);
    this.#unsub = undefined;
  }

  #keep(e: LogEntry): boolean {
    const hass = this.ctx.store.hass;
    if (!hass || !e.entity_id) return false;
    const domain = domainOf(e.entity_id);
    if (!INTERESTING.includes(domain)) return false;
    if (!isAutoVisible(hass, e.entity_id)) return false;
    if (domain === "binary_sensor") {
      const cls = String(hass.states[e.entity_id]?.attributes.device_class ?? "");
      if (!BINARY_GROUPS[cls]) return false;
      // Motion going quiet is not news.
      if ((cls === "motion" || cls === "occupancy" || cls === "presence") && e.state === "off") return false;
    }
    return e.state !== "unavailable" && e.state !== "unknown";
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (this.demo) {
      if (!this._entries.length) {
        const now = Date.now() / 1000;
        this._entries = [
          { when: now - 60, entity_id: "binary_sensor.demo_door", state: "on", name: "Haustür" },
          { when: now - 600, entity_id: "light.demo", state: "on", name: "Licht Küche" },
          { when: now - 3600, entity_id: "person.demo", state: "home", name: "Anna" },
        ];
      }
      return;
    }
    const hass = this.ctx?.store.hass;
    if (!hass || this.#unsub || !changed.has("ctx")) return;
    const hours = Number(this.options.hours) || 12;
    this.#unsub = hass.connection.subscribeMessage<{ events: LogEntry[] }>(
      (msg) => {
        const fresh = (msg.events ?? []).filter((e) => this.#keep(e));
        if (!fresh.length) return;
        this._entries = [...fresh, ...this._entries].sort((a, b) => b.when - a.when).slice(0, 60);
      },
      { type: "logbook/event_stream", start_time: new Date(Date.now() - hours * 3600000).toISOString() },
    );
    this.#unsub.catch(() => undefined);
  }

  #text(e: LogEntry): string {
    const { t } = this.ctx;
    const hass = this.ctx.store.hass;
    const id = e.entity_id ?? "";
    const domain = domainOf(id);
    if (domain === "binary_sensor") {
      const cls = String(hass?.states[id]?.attributes.device_class ?? "");
      const group = BINARY_GROUPS[cls] ?? "";
      return t(`binary.${group}.${e.state}` as MessageKey) || e.state || "";
    }
    if (domain === "person")
      return e.state === "home"
        ? t("w.came_home")
        : e.state === "not_home"
          ? t("w.left_home")
          : (e.state ?? "");
    if (domain === "scene" || domain === "script") return t("w.ran");
    if (domain === "lock") return e.state === "locked" ? t("w.locked") : t("w.unlocked");
    return t(`state.${e.state}` as MessageKey) || t(`w.st.${e.state}` as MessageKey) || e.state || "";
  }

  #ago(when: number): string {
    const { locale } = this.ctx;
    const minutes = Math.round((this._now / 1000 - when) / 60);
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
    if (minutes < 60) return rtf.format(-minutes, "minute");
    const hours = Math.round(minutes / 60);
    if (hours < 24) return rtf.format(-hours, "hour");
    return new Intl.DateTimeFormat(locale, { weekday: "short", hour: "2-digit", minute: "2-digit" }).format(
      when * 1000,
    );
  }

  protected override render() {
    if (!this.ctx) return nothing;
    const hass = this.ctx.store.hass;
    const max = Number(this.options.max) || 8;
    const entries = this._entries.slice(0, max);
    return html`<div class="w">
      ${this.renderHead()}
      ${
        entries.length
          ? html`<div class="log">
              ${repeat(
                entries,
                (e) => `${e.entity_id}:${e.when}`,
                (e) =>
                  html`<button type="button" class="ev" @click=${() => this.moreInfo(e.entity_id)}>
                    <span class="when">${this.#ago(e.when)}</span>
                    <span class="what"
                      ><b
                        >${hass && e.entity_id && hass.states[e.entity_id] ? nameOf(hass, e.entity_id) : (e.name ?? "")}</b
                      >
                      ${this.#text(e)}</span
                    >
                  </button>`,
              )}
            </div>`
          : html`<p class="empty">${this.ctx.t("w.quiet")}</p>`
      }
    </div>`;
  }

  static override styles = [
    widgetStyles,
    css`
      .log {
        display: flex;
        flex-direction: column;
        position: relative;
      }
      .log::before {
        content: "";
        position: absolute;
        left: 80px;
        top: 6px;
        bottom: 6px;
        width: 2px;
        background: var(--a-s3);
      }
      .ev {
        all: unset;
        display: grid;
        grid-template-columns: 66px minmax(0, 1fr);
        gap: 26px;
        padding: 6px 0;
        cursor: pointer;
        position: relative;
        font-size: 14px;
        animation: w-in calc(var(--a-motion, 1) * 300ms) ease-out;
      }
      .ev::after {
        content: "";
        position: absolute;
        left: 77px;
        top: 50%;
        width: 8px;
        height: 8px;
        margin-top: -4px;
        border-radius: 4px;
        background: var(--a-ocher);
      }
      .ev:focus-visible {
        outline: 2px solid var(--a-ocher);
      }
      .when {
        font-size: 12px;
        color: var(--a-text3);
        text-align: right;
        white-space: nowrap;
      }
      .what {
        color: var(--a-text2);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .what b {
        color: var(--a-text);
        font-weight: 600;
      }
      :host([variant="list"]) .log::before,
      :host([variant="list"]) .ev::after {
        display: none;
      }
      :host([variant="list"]) .ev {
        gap: 10px;
        border-bottom: 1px solid var(--a-s2);
      }
    `,
  ];
}

// ---- one room ----

export class AtriumRoomCardWidget extends WidgetBase {
  #room = new SelectorController(
    this,
    () => this.ctx?.store,
    (hass) => {
      const area = typeof this.options.area === "string" ? this.options.area : "";
      const a = hass.areas[area];
      if (!a) return null;
      const lights = lightEntities(hass, area);
      const humidity = a.humidity_entity_id ? Number(hass.states[a.humidity_entity_id]?.state) : NaN;
      return {
        id: area,
        name: a.name,
        icon: a.icon ?? "",
        temp: areaTemperature(hass, area),
        humidity: Number.isNaN(humidity) ? null : humidity,
        on: lights.filter((id) => hass.states[id]?.state === "on").length,
        total: lights.length,
      };
    },
  );

  protected override willUpdate(changed: PropertyValues<this>): void {
    this.#room.attach();
    if (changed.has("config")) this.#room.refresh();
  }

  #allLights(on: boolean): void {
    const area = this.#room.value?.id;
    if (!area || this.demo) return;
    void this.ctx.store.hass?.callService("light", on ? "turn_on" : "turn_off", {}, { area_id: area });
  }

  protected override render() {
    if (!this.ctx) return nothing;
    const { t, locale, navigate } = this.ctx;
    const r = this.demo
      ? { id: "", name: "Wohnzimmer", icon: "mdi:sofa", temp: 21.5, humidity: 48, on: 2, total: 3 }
      : this.#room.value;
    if (!r)
      return this.ctx.editing
        ? html`<div class="w missing">
            ${this.renderHead()}
            <p class="empty">${t("w.choose_room")}</p>
          </div>`
        : nothing;
    const hasIcon = r.icon && customElements.get("ha-icon");
    return html`<div class="w room ${r.on ? "lit" : ""}">
      <button type="button" class="top" @click=${() => r.id && navigate({ page: "room", areaId: r.id })}>
        ${hasIcon ? html`<ha-icon .icon=${r.icon}></ha-icon>` : nothing}
        <span class="rn">${this.config.title || r.name}</span>
        <span class="go">›</span>
      </button>
      <div class="facts">
        <span><b>${formatTemperature(r.temp, locale)}</b><small>${t("climate.current")}</small></span>
        ${r.humidity !== null ? html`<span><b>${Math.round(r.humidity)} %</b><small>${t("room.humidity")}</small></span>` : nothing}
        ${
          r.total
            ? html`<button
                type="button"
                class="lights ${r.on ? "on" : ""}"
                @click=${() => this.#allLights(!r.on)}
              >
                <b>${r.on} / ${r.total}</b><small>${r.on ? t("w.all_off") : t("w.all_on")}</small>
              </button>`
            : nothing
        }
      </div>
    </div>`;
  }

  static override styles = [
    widgetStyles,
    css`
      .top {
        all: unset;
        display: flex;
        align-items: center;
        gap: 10px;
        cursor: pointer;
      }
      .top ha-icon {
        --mdc-icon-size: 26px;
        color: var(--a-text2);
        transition: color calc(var(--a-motion, 1) * 300ms);
      }
      .lit .top ha-icon {
        color: var(--a-ocher);
      }
      .rn {
        flex: 1;
        font-size: 20px;
        font-weight: 600;
      }
      .go {
        font-size: 24px;
        color: var(--a-text3);
      }
      .facts {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
      }
      .facts > * {
        all: unset;
        box-sizing: border-box;
        background: var(--a-s2);
        border-radius: var(--a-radius);
        padding: 8px 10px;
        display: flex;
        flex-direction: column;
      }
      .facts b {
        font-size: 20px;
        font-weight: 600;
      }
      .facts small {
        font-size: 12px;
        color: var(--a-text2);
      }
      .lights {
        cursor: pointer;
        transition: background-color calc(var(--a-motion, 1) * 250ms);
      }
      .lights.on {
        background: var(--a-ocher);
        color: var(--a-on-ocher);
      }
      .lights.on small {
        color: inherit;
        opacity: 0.8;
      }
      :host([variant="minimal"]) .facts > :not(:first-child) {
        display: none;
      }
      :host([variant="minimal"]) .facts {
        grid-template-columns: minmax(0, 1fr);
      }
      :host([variant="big"]) .rn {
        font-size: 28px;
      }
      :host([variant="big"]) .facts b {
        font-size: 30px;
      }
      :host([variant="big"]) .facts > * {
        padding: 14px;
      }
    `,
  ];
}

// ---- energy flow ----

export class AtriumEnergyFlowWidget extends WidgetBase {
  #live = new SelectorController(
    this,
    () => this.ctx?.store,
    (hass) => {
      const cfg = energyConfig(hass, this.ctx.layout);
      return cfg.acPower || cfg.pvPower?.length ? liveEnergy(hass, cfg) : null;
    },
  );

  protected override willUpdate(changed: PropertyValues<this>): void {
    this.#live.attach();
    if (changed.has("ctx")) this.#live.refresh();
  }

  protected override render() {
    if (!this.ctx) return nothing;
    const live = this.demo ? DEMO_LIVE : (this.#live.value ?? null);
    if (!live)
      return this.ctx.editing
        ? html`<div class="w missing">
            ${this.renderHead()}
            <p class="empty">${this.ctx.t("w.not_found")}</p>
          </div>`
        : nothing;
    return html`<button
      type="button"
      class="w open"
      @click=${() => !this.demo && this.ctx.navigate({ page: "category", category: "energy" })}
    >
      ${this.renderHead()}
      <atrium-energy-flow
        .live=${live}
        .t=${this.ctx.t}
        .locale=${this.ctx.locale}
        ?narrow=${this.ctx.narrow}
      ></atrium-energy-flow>
    </button>`;
  }

  static override styles = [
    widgetStyles,
    css`
      .open {
        all: unset;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        gap: 12px;
        width: 100%;
        background: var(--a-s1);
        border-radius: var(--a-radius);
        padding: 14px;
        cursor: pointer;
      }
    `,
  ];
}

const DEMO_LIVE: LiveEnergy = {
  ac: 612,
  dc: 640,
  loss: 28,
  efficiency: 0.956,
  ofPeak: 0.68,
  temp: 41,
  frequency: 50.01,
  strings: [
    { id: "a", name: "PV1", watts: 330 },
    { id: "b", name: "PV2", watts: 310 },
  ],
  consumers: [
    { id: "a", name: "Kühlschrank", watts: 92 },
    { id: "b", name: "Server", watts: 310 },
    { id: "c", name: "Waschmaschine", watts: 420 },
  ],
};
