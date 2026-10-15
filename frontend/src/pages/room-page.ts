import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { icon } from "../components/icon";
import type { PanelContext } from "../context";
import { SelectorController } from "../data/entity-store";
import { adjacentRooms, areaTemperature, roomContent, rooms } from "../data/home";
import { nameOf, withoutArea } from "../data/registry";
import type { MessageKey, Translate } from "../i18n";
import { ICONS, shared } from "../theme/shared";
import type { HomeAssistant } from "../types/hass";
import { formatTemperature } from "../util/format";
import { attachSwipe } from "../util/swipe";

/** On-states that need attention (red); motion and presence are just information. */
const ALERT_CLASSES = ["door", "garage_door", "window", "opening", "moisture", "smoke", "gas"];

/** Direction of the last room change, for the slide-in animation. */
let enterFrom: "left" | "right" | null = null;

function binaryLabel(t: Translate, deviceClass: string, state: string): string {
  const group = ["door", "garage_door", "window", "opening"].includes(deviceClass)
    ? "door"
    : ["occupancy", "presence"].includes(deviceClass)
      ? "occupancy"
      : deviceClass;
  const specific = t(`binary.${group}.${state}` as MessageKey);
  return specific || t(`binary.${state}` as MessageKey) || state;
}

function sensorValue(hass: HomeAssistant, id: string, locale: string): string {
  const s = hass.states[id];
  if (!s) return "—";
  const n = Number(s.state);
  const unit = (s.attributes.unit_of_measurement as string | undefined) ?? "";
  const digits = unit === "°C" || unit === "°F" || unit === "%" ? 1 : 0;
  const value = new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(n);
  return unit ? `${value} ${unit}`.replace(" °", "°") : value;
}

/**
 * A room: header with the essentials, then everything in it, by kind.
 * Swipe left/right (or the arrows) to go to the neighbouring rooms.
 */
export class AtriumRoomPage extends LitElement {
  static override properties = { ctx: { attribute: false }, areaId: { attribute: "area-id" } };

  declare ctx: PanelContext;
  declare areaId: string;

  #detachSwipe: (() => void) | undefined;

  #room = new SelectorController(
    this,
    () => this.ctx?.store,
    (hass) => {
      const content = roomContent(hass, this.areaId);
      const all = rooms(hass);
      const area = hass.areas[this.areaId];
      const humidityId = area?.humidity_entity_id;
      const humidity = humidityId ? Number(hass.states[humidityId]?.state) : NaN;
      const locale = this.ctx.locale;
      return {
        name: area?.name ?? this.areaId,
        icon: area?.icon ?? null,
        index: all.findIndex((r) => r.areaId === this.areaId) + 1,
        count: all.length,
        ...adjacentRooms(hass, this.areaId),
        temperature: areaTemperature(hass, this.areaId),
        humidity: Number.isNaN(humidity) ? null : humidity,
        lightsOn: content.lights.filter((id) => hass.states[id]?.state === "on").length,
        content,
        // Values in the selector so the page re-renders when a reading changes.
        binary: content.binary.map((id) => ({
          id,
          name: withoutArea(nameOf(hass, id), area?.name),
          state: hass.states[id]?.state ?? "",
          deviceClass: String(hass.states[id]?.attributes.device_class ?? ""),
        })),
        sensors: content.sensors.map((id) => ({
          id,
          name: withoutArea(nameOf(hass, id), area?.name),
          value: sensorValue(hass, id, locale),
        })),
      };
    },
  );

  override connectedCallback(): void {
    super.connectedCallback();
    this.#detachSwipe = attachSwipe(this, {
      onLeft: () => this.#go("next"),
      onRight: () => this.#go("prev"),
    });
    window.addEventListener("keydown", this.#onKey);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#detachSwipe?.();
    window.removeEventListener("keydown", this.#onKey);
  }

  #onKey = (ev: KeyboardEvent) => {
    const target = ev.composedPath()[0];
    if (target instanceof HTMLInputElement || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    if (ev.key === "ArrowLeft") this.#go("prev");
    if (ev.key === "ArrowRight") this.#go("next");
  };

  #go(which: "prev" | "next"): void {
    const room = this.#room.value;
    const areaId = room?.[which];
    if (!areaId) return;
    enterFrom = which === "next" ? "right" : "left";
    this.ctx.navigate({ page: "room", areaId });
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    this.#room.attach();
    if (changed.has("areaId") && changed.get("areaId") !== undefined) {
      // Same element, other room: recompute right away.
      this.#room.hostDisconnected();
      this.#room.attach();
    }
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has("areaId") && enterFrom) {
      const main = this.renderRoot.querySelector(".room");
      main?.animate(
        [
          { transform: `translateX(${enterFrom === "right" ? 40 : -40}px)`, opacity: 0.2 },
          { transform: "none", opacity: 1 },
        ],
        { duration: 220, easing: "cubic-bezier(0.2, 0.9, 0.25, 1)" },
      );
      enterFrom = null;
    }
  }

  #section(title: MessageKey, body: unknown) {
    return html`<section>
      <h2 class="label">${this.ctx.t(title)}</h2>
      ${body}
    </section>`;
  }

  protected override render() {
    const room = this.#room.value;
    if (!room) return nothing;
    const { t, locale, store } = this.ctx;
    const c = room.content;
    const hasIcon = room.icon && customElements.get("ha-icon");
    return html`
      <div class="room">
        <header>
          <div class="nav">
            <button type="button" class="back" @click=${() => this.ctx.navigate({ page: "rooms" })}>
              ${icon(ICONS.back, 18, 2)} ${t("nav.rooms")}
            </button>
            ${
              room.count > 1
                ? html`<div class="arrows">
                    <button type="button" aria-label=${t("room.previous")} @click=${() => this.#go("prev")}>
                      ${icon(ICONS.back, 20, 2)}
                    </button>
                    <span class="label">${room.index} / ${room.count}</span>
                    <button type="button" aria-label=${t("room.next")} @click=${() => this.#go("next")}>
                      ${icon(ICONS.next, 20, 2)}
                    </button>
                  </div>`
                : nothing
            }
          </div>
          <h1>
            ${hasIcon ? html`<ha-icon .icon=${room.icon}></ha-icon>` : nothing}
            <span>${room.name}</span>
          </h1>
          <div class="facts">
            <div>
              <b>${formatTemperature(room.temperature, locale)}</b><span>${t("climate.current")}</span>
            </div>
            ${
              room.humidity !== null
                ? html`<div><b>${Math.round(room.humidity)} %</b><span>${t("room.humidity")}</span></div>`
                : nothing
            }
            <div class=${room.lightsOn ? "on" : ""}>
              <b>${room.lightsOn}</b>
              <span>${room.lightsOn === 1 ? t("rooms.light_on") : t("rooms.lights_on")}</span>
            </div>
          </div>
        </header>

        ${
          c.climate.length
            ? html`<atrium-climate-module .ctx=${this.ctx} .areaId=${this.areaId}></atrium-climate-module>`
            : nothing
        }
        ${
          c.lights.length
            ? html`<atrium-lights-module
                .ctx=${this.ctx}
                .areaId=${this.areaId}
                compact
              ></atrium-lights-module>`
            : nothing
        }
        ${
          c.devices.length
            ? this.#section(
                "room.devices",
                html`<div class="list">
                  ${repeat(
                    c.devices,
                    (id) => id,
                    (id) =>
                      html`<atrium-entity-tile .entityId=${id} .store=${store} .t=${t}></atrium-entity-tile>`,
                  )}
                </div>`,
              )
            : nothing
        }
        ${
          c.media.length
            ? this.#section(
                "room.media",
                html`<div class="list">
                  ${repeat(
                    c.media,
                    (id) => id,
                    (id) =>
                      html`<atrium-entity-tile .entityId=${id} .store=${store} .t=${t}></atrium-entity-tile>`,
                  )}
                </div>`,
              )
            : nothing
        }
        ${
          room.binary.length || room.sensors.length
            ? this.#section(
                "room.sensors",
                html`<div class="chips">
                  ${repeat(
                    room.binary,
                    (b) => b.id,
                    (b) =>
                      html`<button
                        type="button"
                        class="chip ${b.state === "on" && ALERT_CLASSES.includes(b.deviceClass) ? "alert" : ""}"
                        @click=${() => this.#moreInfo(b.id)}
                      >
                        <span class="chip-name">${b.name}</span>
                        <span class="chip-value">${binaryLabel(t, b.deviceClass, b.state)}</span>
                      </button>`,
                  )}
                  ${repeat(
                    room.sensors,
                    (s) => s.id,
                    (s) =>
                      html`<button type="button" class="chip" @click=${() => this.#moreInfo(s.id)}>
                        <span class="chip-name">${s.name}</span>
                        <span class="chip-value">${s.value}</span>
                      </button>`,
                  )}
                </div>`,
              )
            : nothing
        }
        ${
          c.climate.length + c.lights.length + c.devices.length + c.media.length === 0 &&
          !room.binary.length &&
          !room.sensors.length
            ? html`<p class="empty">${t("room.empty")}</p>`
            : nothing
        }
      </div>
    `;
  }

  #moreInfo(entityId: string): void {
    this.dispatchEvent(
      new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }),
    );
  }

  static override styles = [
    shared,
    css`
      :host {
        display: block;
        touch-action: pan-y;
      }
      .room {
        display: flex;
        flex-direction: column;
        gap: 18px;
      }
      header {
        background: var(--a-panel);
        color: var(--a-on-panel);
        border-radius: var(--a-radius);
        padding: 8px 12px 16px 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      header .label {
        color: var(--a-on-panel2);
      }
      .nav {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .nav button {
        all: unset;
        cursor: pointer;
        min-height: 44px;
        min-width: 44px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        color: var(--a-on-panel2);
        border-radius: var(--a-radius);
      }
      .nav button:focus-visible {
        outline: 2px solid var(--a-ocher);
      }
      .back {
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }
      .arrows {
        display: flex;
        align-items: center;
      }
      h1 {
        margin: 0;
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 32px;
        font-weight: 600;
        letter-spacing: -0.03em;
        line-height: 1.05;
      }
      h1 ha-icon {
        --mdc-icon-size: 32px;
        color: var(--a-ocher);
      }
      .facts {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 6px;
        margin-right: 4px;
      }
      .facts div {
        background: var(--a-panel2);
        border-radius: 4px;
        padding: 10px;
        display: flex;
        flex-direction: column;
      }
      .facts div.on {
        background: var(--a-ocher);
        color: var(--a-on-ocher);
      }
      .facts b {
        font-size: 22px;
        font-weight: 600;
      }
      .facts span {
        font-size: 12px;
        font-weight: 500;
      }
      section {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .list {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
        gap: 8px;
      }
      @media (max-width: 600px) {
        .list {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
      .chips {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 8px;
      }
      @media (max-width: 600px) {
        .chips {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
      .chip {
        border: 0;
        text-align: left;
        min-height: 56px;
        padding: 8px 12px;
        border-radius: var(--a-radius);
        background: var(--a-s1);
        color: var(--a-text);
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 2px;
        min-width: 0;
      }
      .chip.alert {
        background: var(--a-terra);
        color: #fff;
        box-shadow: none;
      }
      .chip-name {
        font-size: 12px;
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .chip:not(.alert) .chip-name {
        color: var(--a-text2);
      }
      .chip-value {
        font-size: 17px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }
      .empty {
        color: var(--a-text2);
        font-size: 14px;
      }
    `,
  ];
}
