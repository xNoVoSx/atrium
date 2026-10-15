// Category pages: security (doors, gates, locks, alarm, motion, cameras) and media.

import { LitElement, css, html, nothing } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { icon } from "../components/icon";
import type { PanelContext } from "../context";
import { SelectorController } from "../data/entity-store";
import { mediaPlayers, securityContent } from "../data/home";
import { areaIdOf, nameOf, withoutArea } from "../data/registry";
import type { MessageKey } from "../i18n";
import { ICONS, shared } from "../theme/shared";
import type { HomeAssistant } from "../types/hass";
import { formatSince } from "../util/format";

const ALERT = ["door", "garage_door", "window", "opening"];

function shortName(hass: HomeAssistant, id: string): string {
  const area = areaIdOf(hass, id);
  return withoutArea(nameOf(hass, id), area ? hass.areas[area]?.name : undefined);
}

function areaLabel(hass: HomeAssistant, id: string): string {
  const area = areaIdOf(hass, id);
  return area ? (hass.areas[area]?.name ?? "") : "";
}

export class AtriumSecurityPage extends LitElement {
  static override properties = { ctx: { attribute: false } };
  declare ctx: PanelContext;

  #content = new SelectorController(
    this,
    () => this.ctx?.store,
    (hass) => {
      const c = securityContent(hass);
      const row = (id: string) => {
        const s = hass.states[id];
        return {
          id,
          name: shortName(hass, id),
          area: areaLabel(hass, id),
          state: s?.state ?? "",
          deviceClass: String(s?.attributes.device_class ?? ""),
          since: s?.last_changed ?? "",
        };
      };
      return {
        garages: c.garages.map((g) => ({ ...g, name: shortName(hass, g.entityId) })),
        openings: c.openings.map(row),
        locks: c.locks.map(row),
        alarms: c.alarms.map(row),
        motion: c.motion.map(row),
        cameras: c.cameras,
      };
    },
  );

  protected override willUpdate(): void {
    this.#content.attach();
  }

  #moreInfo(entityId: string): void {
    this.dispatchEvent(
      new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }),
    );
  }

  #binaryLabel(deviceClass: string, state: string): string {
    const { t } = this.ctx;
    if (state === "unavailable" || state === "unknown") return t(`state.${state}` as MessageKey);
    const group = ALERT.includes(deviceClass)
      ? "door"
      : ["occupancy", "presence"].includes(deviceClass)
        ? "occupancy"
        : deviceClass;
    return t(`binary.${group}.${state}` as MessageKey) || t(`binary.${state}` as MessageKey) || state;
  }

  protected override render() {
    const c = this.#content.value;
    if (!c) return nothing;
    const { t, locale, store } = this.ctx;
    const now = new Date();
    const list = (
      rows: Array<{
        id: string;
        name: string;
        area: string;
        state: string;
        deviceClass: string;
        since: string;
      }>,
      alertWhenOn: boolean,
    ) =>
      html`<div class="rows">
        ${repeat(
          rows,
          (r) => r.id,
          (r) =>
            html`<button
              type="button"
              class="row ${alertWhenOn && r.state === "on" ? "alert" : r.state === "on" ? "active" : ""}"
              data-entity=${r.id}
              @click=${() => this.#moreInfo(r.id)}
            >
              <span class="name">${r.name}${r.area ? html`<small>${r.area}</small>` : nothing}</span>
              <span class="value">${this.#binaryLabel(r.deviceClass, r.state)}</span>
              ${r.state === "on" && r.since ? html`<span class="since">${formatSince(r.since, now, locale)}</span>` : nothing}
            </button>`,
        )}
      </div>`;
    return html`<h1>${t("security.title")}</h1>
      ${
        c.garages.length
          ? html`<section>
              <h2 class="label">${t("security.gates")}</h2>
              <div class="rows">
                ${c.garages.map(
                  (g) =>
                    html`<button
                      type="button"
                      class="row big ${g.open ? "alert" : "closed"}"
                      data-entity=${g.entityId}
                      @click=${() => this.#moreInfo(g.entityId)}
                    >
                      ${icon(ICONS.garage, 22, 2)}
                      <span class="name">${g.name}</span>
                      <span class="value">${g.open ? t("status.open") : t("status.closed")}</span>
                      ${g.open ? html`<span class="since">${formatSince(g.since, now, locale)}</span>` : nothing}
                    </button>`,
                )}
              </div>
            </section>`
          : nothing
      }
      ${
        c.cameras.length
          ? html`<section>
              <h2 class="label">${t("security.cameras")}</h2>
              <div class="cameras">
                ${repeat(
                  c.cameras,
                  (id) => id,
                  (id) => html`<atrium-camera-tile .entityId=${id} .store=${store}></atrium-camera-tile>`,
                )}
              </div>
            </section>`
          : nothing
      }
      ${
        c.alarms.length
          ? html`<section>
              <h2 class="label">${t("security.alarm")}</h2>
              ${list(c.alarms, false)}
            </section>`
          : nothing
      }
      ${
        c.locks.length
          ? html`<section>
              <h2 class="label">${t("security.locks")}</h2>
              ${list(c.locks, false)}
            </section>`
          : nothing
      }
      ${
        c.openings.length
          ? html`<section>
              <h2 class="label">${t("security.openings")}</h2>
              ${list(c.openings, true)}
            </section>`
          : nothing
      }
      ${
        c.motion.length
          ? html`<section>
              <h2 class="label">${t("security.motion")}</h2>
              ${list(c.motion, false)}
            </section>`
          : nothing
      }`;
  }

  static override styles = [
    shared,
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: 18px;
      }
      h1 {
        margin: 4px 0 0;
        font-size: 34px;
        font-weight: 600;
        letter-spacing: -0.03em;
      }
      section {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .rows {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 8px;
      }
      .row {
        border: 0;
        text-align: left;
        min-height: 52px;
        padding: 8px 14px;
        border-radius: var(--a-radius);
        background: var(--a-s1);
        color: var(--a-text);
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .row.big {
        min-height: 60px;
      }
      .row.alert {
        background: var(--a-terra);
        color: #fff;
      }
      .row.closed {
        background: var(--a-sage);
        color: #fff;
      }
      .row.active {
        background: var(--a-ocher);
        color: var(--a-on-ocher);
      }
      .name {
        flex: 1;
        min-width: 0;
        font-size: 15px;
        font-weight: 600;
        display: flex;
        flex-direction: column;
      }
      .name small {
        font-size: 12px;
        font-weight: 500;
        opacity: 0.85;
      }
      .value {
        font-size: 14px;
        font-weight: 600;
      }
      .since {
        font-size: 13px;
      }
      .cameras {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 10px;
      }
    `,
  ];
}

export class AtriumMediaPage extends LitElement {
  static override properties = { ctx: { attribute: false } };
  declare ctx: PanelContext;

  #players = new SelectorController(
    this,
    () => this.ctx?.store,
    (hass) => mediaPlayers(hass),
  );

  protected override willUpdate(): void {
    this.#players.attach();
  }

  protected override render() {
    const players = this.#players.value ?? [];
    const { t, store } = this.ctx;
    return html`<h1>${t("media.title")}</h1>
      ${
        players.length
          ? html`<div class="players">
              ${repeat(
                players,
                (id) => id,
                (id) => html`<atrium-media-card .entityId=${id} .store=${store} .t=${t}></atrium-media-card>`,
              )}
            </div>`
          : html`<p class="hint">${t("media.none")}</p>`
      }`;
  }

  static override styles = [
    shared,
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      h1 {
        margin: 4px 0 0;
        font-size: 34px;
        font-weight: 600;
        letter-spacing: -0.03em;
      }
      .players {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 10px;
      }
      .hint {
        color: var(--a-text2);
        font-size: 14px;
      }
    `,
  ];
}
