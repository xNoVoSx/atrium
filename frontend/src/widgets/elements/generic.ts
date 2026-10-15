// General-purpose widgets: chosen entities, a sensor graph, a gauge, a note,
// quick links, a web page, one camera, media players.

import { css, html, nothing, svg, type PropertyValues } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { EntityController, SelectorController } from "../../data/entity-store";
import { mediaPlayers } from "../../data/home";
import { favorites } from "../../data/layout";
import { nameOf } from "../../data/registry";
import { chosenOr } from "../adapters/house";
import { fmt, num, unitOf } from "../adapters/util";
import { WidgetBase } from "../base";
import { widgetStyles } from "../styles";

const str = (v: unknown) => (typeof v === "string" ? v : "");
const list = (v: unknown) =>
  Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === "string") : [];

// ---- entities ----

export class AtriumEntitiesWidget extends WidgetBase {
  #ids = new SelectorController(
    this,
    () => this.ctx?.store,
    (hass) => list(this.options.entities).filter((id) => id in hass.states),
  );

  protected override willUpdate(changed: PropertyValues<this>): void {
    this.#ids.attach();
    if (changed.has("config")) this.#ids.refresh();
  }

  protected override render() {
    if (!this.ctx) return nothing;
    const ids = this.#ids.value ?? [];
    if (!ids.length && !this.demo)
      return this.ctx.editing
        ? html`<div class="w missing">
            ${this.renderHead()}
            <p class="empty">${this.ctx.t("w.choose_entities")}</p>
          </div>`
        : nothing;
    const { store, t, editing, isAdmin, hiddenEntities, user } = this.ctx;
    const favs = new Set(favorites(user));
    return html`<div class="w">
      ${this.renderHead()}
      <div class="grid">
        ${repeat(
          ids,
          (id) => id,
          (id) =>
            id.startsWith("light.")
              ? html`<atrium-light-tile
                  compact
                  .entityId=${id}
                  .store=${store}
                  .t=${t}
                  ?editing=${editing}
                  ?favorite=${favs.has(id)}
                  ?atrium-hidden=${hiddenEntities.has(id)}
                  ?canHide=${isAdmin}
                ></atrium-light-tile>`
              : html`<atrium-entity-tile
                  .entityId=${id}
                  .store=${store}
                  .t=${t}
                  ?editing=${editing}
                  ?favorite=${favs.has(id)}
                  ?atrium-hidden=${hiddenEntities.has(id)}
                  ?canHide=${isAdmin}
                ></atrium-entity-tile>`,
        )}
      </div>
    </div>`;
  }

  static override styles = [
    widgetStyles,
    css`
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
        gap: 8px;
      }
      @media (max-width: 600px) {
        .grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
      :host([variant="list"]) .grid {
        grid-template-columns: minmax(0, 1fr);
        gap: 6px;
      }
    `,
  ];
}

// ---- graph ----

export class AtriumGraphWidget extends WidgetBase {
  static override properties = { ...WidgetBase.properties, _points: { state: true } };
  declare _points: Array<{ t: number; v: number }> | null;
  #entity = new EntityController(this, () => this.ctx?.store);
  #key = "";
  #timer: ReturnType<typeof setInterval> | undefined;

  constructor() {
    super();
    this._points = null;
  }

  get #id(): string {
    return str(this.options.entity);
  }

  get #hours(): number {
    return Number(this.options.hours) || 24;
  }

  async #load(): Promise<void> {
    const hass = this.ctx?.store.hass;
    if (!hass || !this.#id) return;
    try {
      const result = await hass.callWS<Record<string, Array<{ s: string; lu: number }>>>({
        type: "history/history_during_period",
        start_time: new Date(Date.now() - this.#hours * 3600000).toISOString(),
        entity_ids: [this.#id],
        minimal_response: true,
        no_attributes: true,
      });
      this._points = (result[this.#id] ?? [])
        .map((p) => ({ t: p.lu * 1000, v: Number(p.s) }))
        .filter((p) => Number.isFinite(p.v));
    } catch {
      this._points = [];
    }
  }

  protected override willUpdate(): void {
    if (this.demo) {
      const now = Date.now();
      this._points = Array.from({ length: 48 }, (_, i) => ({
        t: now - (48 - i) * 1800000,
        v: 20 + 3 * Math.sin(i / 6) + (i % 5) / 4,
      }));
      return;
    }
    this.#entity.track(this.#id || undefined);
    const key = `${this.#id}|${this.#hours}`;
    if (key !== this.#key && this.ctx?.store.hass) {
      this.#key = key;
      void this.#load();
    }
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.#timer = setInterval(() => void this.#load(), 5 * 60000);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearInterval(this.#timer);
    this.#key = "";
  }

  override heading(): string {
    const hass = this.ctx?.store.hass;
    return this.config?.title || (this.#id && hass && !this.demo ? nameOf(hass, this.#id) : super.heading());
  }

  protected override render() {
    if (!this.ctx) return nothing;
    const { locale, t } = this.ctx;
    if (!this.#id && !this.demo)
      return this.ctx.editing
        ? html`<div class="w missing">
            ${this.renderHead()}
            <p class="empty">${t("w.choose_entity")}</p>
          </div>`
        : nothing;
    const s = this.#entity.state;
    const current = this.demo ? 21.4 : num(s);
    const unit = this.demo ? "°C" : unitOf(s);
    const pts = this._points ?? [];
    const W = 300;
    const H = 90;
    let path = "";
    let area = "";
    let min = 0;
    let max = 0;
    if (pts.length > 1) {
      const values = pts.map((p) => p.v);
      min = Math.min(...values);
      max = Math.max(...values);
      const span = max - min || 1;
      const t0 = pts[0]?.t ?? Date.now();
      const tSpan = Date.now() - t0 || 1;
      const xy = pts.map((p) => [((p.t - t0) / tSpan) * W, H - 6 - ((p.v - min) / span) * (H - 16)] as const);
      // Step line (sensor values hold until the next change), extended to now.
      path = xy.map(([x, y], i) => (i === 0 ? `M${x} ${y}` : `H${x} V${y}`)).join(" ") + ` H${W}`;
      area = `${path} V${H} H0 Z`;
    }
    return html`<div class="w">
      ${this.renderHead(`${this.#hours} h`)}
      <div class="cur">${fmt(locale, current, 1)}<small>${unit}</small></div>
      ${
        path
          ? html`<svg class="graph" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
                ${svg`<path d=${area} class="area" /><path d=${path} class="line"/>`}
              </svg>
              <div class="range"><span>${fmt(locale, min, 1)}</span><span>${fmt(locale, max, 1)}</span></div>`
          : html`<p class="empty">${this._points === null ? "…" : t("w.no_history")}</p>`
      }
    </div>`;
  }

  static override styles = [
    widgetStyles,
    css`
      .cur {
        font-size: 34px;
        font-weight: 600;
        letter-spacing: -0.02em;
      }
      .cur small {
        font-size: 15px;
        color: var(--a-text2);
        margin-left: 4px;
      }
      .graph {
        width: 100%;
        height: 90px;
      }
      .line {
        fill: none;
        stroke: var(--a-ocher);
        stroke-width: 2;
        vector-effect: non-scaling-stroke;
      }
      .graph {
        animation: reveal calc(var(--a-motion, 1) * 1.2s) ease-out both;
      }
      @keyframes reveal {
        from {
          clip-path: inset(0 100% 0 0);
        }
        to {
          clip-path: inset(0 0 0 0);
        }
      }
      .area {
        fill: var(--a-ocher);
        opacity: 0.12;
        animation: fade calc(var(--a-motion, 1) * 1.2s) ease-out both;
      }
      .range {
        display: flex;
        justify-content: space-between;
        font-size: 12px;
        color: var(--a-text3);
      }
      @keyframes draw {
        from {
          stroke-dashoffset: 1;
        }
        to {
          stroke-dashoffset: 0;
        }
      }
      @keyframes fade {
        from {
          opacity: 0;
        }
      }
    `,
  ];
}

// ---- gauge ----

export class AtriumGaugeWidget extends WidgetBase {
  #entity = new EntityController(this, () => this.ctx?.store);

  protected override willUpdate(): void {
    this.#entity.track(str(this.options.entity) || undefined);
  }

  override heading(): string {
    const hass = this.ctx?.store.hass;
    const id = str(this.options.entity);
    return this.config?.title || (id && hass && !this.demo ? nameOf(hass, id) : super.heading());
  }

  protected override render() {
    if (!this.ctx) return nothing;
    const s = this.#entity.state;
    if (!s && !this.demo)
      return this.ctx.editing
        ? html`<div class="w missing">
            ${this.renderHead()}
            <p class="empty">${this.ctx.t("w.choose_entity")}</p>
          </div>`
        : nothing;
    const value = this.demo ? 63 : (num(s) ?? 0);
    const unit = this.demo ? "%" : unitOf(s);
    const min = Number(this.options.min ?? 0);
    const max = Number(this.options.max ?? (unit === "%" ? 100 : Math.max(100, value)));
    const p = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));
    const warn = Number(this.options.warn ?? NaN);
    const tone = Number.isFinite(warn) && value >= warn ? "warn" : "";
    // Half circle from 180° to 0°, radius 40.
    const len = Math.PI * 40;
    if (this.variant === "ring") {
      const c = 2 * Math.PI * 40;
      return html`<div class="w">
        ${this.renderHead()}
        <div class="gauge ring ${tone}">
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="40" class="bg" />
            <circle
              cx="50"
              cy="50"
              r="40"
              class="fg"
              transform="rotate(-90 50 50)"
              style="stroke-dasharray:${c};stroke-dashoffset:${c * (1 - p)}"
            />
          </svg>
          <div class="gv center">${fmt(this.ctx.locale, value, 1)}<small>${unit}</small></div>
        </div>
      </div>`;
    }
    if (this.variant === "bar")
      return html`<div class="w">
        ${this.renderHead()}
        <div class="gbar ${tone}">
          <div class="gv left">${fmt(this.ctx.locale, value, 1)}<small>${unit}</small></div>
          <div class="track"><span style="width:${p * 100}%"></span></div>
          <div class="ends">
            <span>${fmt(this.ctx.locale, min, 0)}</span><span>${fmt(this.ctx.locale, max, 0)}</span>
          </div>
        </div>
      </div>`;
    return html`<div class="w">
      ${this.renderHead()}
      <div class="gauge ${tone}">
        <svg viewBox="0 0 100 58" aria-hidden="true">
          <path d="M10 50 A40 40 0 0 1 90 50" class="bg" />
          <path
            d="M10 50 A40 40 0 0 1 90 50"
            class="fg"
            style="stroke-dasharray:${len};stroke-dashoffset:${len * (1 - p)}"
          />
        </svg>
        <div class="gv">${fmt(this.ctx.locale, value, 1)}<small>${unit}</small></div>
      </div>
    </div>`;
  }

  static override styles = [
    widgetStyles,
    css`
      .gauge {
        position: relative;
        max-width: 260px;
        margin: 0 auto;
        width: 100%;
      }
      .gauge svg {
        width: 100%;
        display: block;
      }
      .bg,
      .fg {
        fill: none;
        stroke-width: 9;
        stroke-linecap: round;
      }
      .bg {
        stroke: var(--a-s3);
      }
      .fg {
        stroke: var(--a-sage);
        transition: stroke-dashoffset calc(var(--a-motion, 1) * 900ms) cubic-bezier(0.2, 0.9, 0.25, 1);
      }
      .warn .fg {
        stroke: var(--a-terra);
      }
      .gv {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        text-align: center;
        font-size: 30px;
        font-weight: 600;
      }
      .gv small {
        font-size: 14px;
        color: var(--a-text2);
        margin-left: 3px;
      }
      .gauge.ring {
        max-width: 200px;
      }
      .gv.center {
        top: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .gbar {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .gv.left {
        position: static;
        text-align: left;
      }
      .gbar .track {
        height: 14px;
        border-radius: 7px;
        background: var(--a-s3);
        overflow: hidden;
      }
      .gbar .track span {
        display: block;
        height: 100%;
        background: var(--a-sage);
        border-radius: 7px;
        transition: width calc(var(--a-motion, 1) * 800ms) cubic-bezier(0.2, 0.9, 0.25, 1);
      }
      .gbar.warn .track span {
        background: var(--a-terra);
      }
      .ends {
        display: flex;
        justify-content: space-between;
        font-size: 12px;
        color: var(--a-text3);
      }
    `,
  ];
}

// ---- note ----

export class AtriumNoteWidget extends WidgetBase {
  protected override render() {
    if (!this.ctx) return nothing;
    const text = this.demo ? "**Müll raus!**\nDienstag kommt der Schornsteinfeger." : str(this.options.text);
    if (!text)
      return this.ctx.editing
        ? html`<div class="w missing">
            ${this.renderHead()}
            <p class="empty">${this.ctx.t("w.write_note")}</p>
          </div>`
        : nothing;
    // Minimal formatting: **bold**, one paragraph per line. No HTML from users.
    const line = (l: string) =>
      l
        .split(/(\*\*[^*]+\*\*)/g)
        .map((part) =>
          part.startsWith("**") && part.endsWith("**") ? html`<b>${part.slice(2, -2)}</b>` : part,
        );
    return html`<div class="w note">
      ${this.config.title ? this.renderHead() : nothing}
      ${text.split("\n").map((l) => (l.trim() ? html`<p>${line(l)}</p>` : nothing))}
    </div>`;
  }

  static override styles = [
    widgetStyles,
    css`
      .note {
        border-left: 4px solid var(--a-ocher);
      }
      p {
        margin: 0;
        font-size: 16px;
        line-height: 1.45;
      }
      :host([variant="big"]) p {
        font-size: 24px;
        line-height: 1.3;
      }
    `,
  ];
}

// ---- quick links ----

export class AtriumLinksWidget extends WidgetBase {
  #links(): Array<{ label: string; url: string }> {
    const text = this.demo
      ? "Energie | /energy\nZigbee2MQTT | /zigbee2mqtt\nPortainer | https://portainer.example"
      : str(this.options.links);
    return text
      .split("\n")
      .map((l) => l.split("|").map((x) => x.trim()))
      .filter((p) => p[0] && p[1])
      .map(([label = "", url = ""]) => ({ label, url }));
  }

  #open(ev: MouseEvent, url: string): void {
    if (this.demo) {
      ev.preventDefault();
      return;
    }
    if (url.startsWith("/") && !ev.ctrlKey && !ev.metaKey) {
      ev.preventDefault();
      history.pushState(null, "", url);
      window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
    }
  }

  protected override render() {
    if (!this.ctx) return nothing;
    const links = this.#links();
    if (!links.length)
      return this.ctx.editing
        ? html`<div class="w missing">
            ${this.renderHead()}
            <p class="empty">${this.ctx.t("w.add_links")}</p>
          </div>`
        : nothing;
    return html`<div class="w">
      ${this.renderHead()}
      <div class="links">
        ${links.map(
          (l) =>
            html`<a
              href=${l.url}
              target=${l.url.startsWith("/") ? "_self" : "_blank"}
              rel="noopener noreferrer"
              @click=${(e: MouseEvent) => this.#open(e, l.url)}
            >
              <span>${l.label}</span><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg>
            </a>`,
        )}
      </div>
    </div>`;
  }

  static override styles = [
    widgetStyles,
    css`
      .links {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        gap: 8px;
      }
      a {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        min-height: 48px;
        padding: 0 10px 0 14px;
        border-radius: var(--a-radius);
        background: var(--a-s2);
        color: var(--a-text);
        text-decoration: none;
        font-weight: 600;
        font-size: 14px;
        transition: background-color calc(var(--a-motion, 1) * 150ms);
      }
      a:hover {
        background: var(--a-s3);
      }
      a:focus-visible {
        outline: 2px solid var(--a-ocher);
        outline-offset: 2px;
      }
      a svg {
        width: 18px;
        height: 18px;
        fill: none;
        stroke: var(--a-text3);
        stroke-width: 2;
        transition: transform calc(var(--a-motion, 1) * 150ms);
      }
      a:hover svg {
        transform: translateX(3px);
      }
      :host([variant="list"]) .links {
        grid-template-columns: minmax(0, 1fr);
        gap: 4px;
      }
      :host([variant="chips"]) .links {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      :host([variant="chips"]) a {
        min-height: 38px;
        border-radius: 19px;
        padding: 0 8px 0 14px;
      }
    `,
  ];
}

// ---- web page ----

export class AtriumWebWidget extends WidgetBase {
  protected override render() {
    if (!this.ctx) return nothing;
    const url = str(this.options.url);
    if (!url || this.demo)
      return html`<div class="w ${this.demo ? "" : "missing"}">
        ${this.renderHead()}
        <p class="empty">${this.ctx.t("w.web_hint")}</p>
      </div>`;
    const height = Number(this.options.height) || 360;
    return html`<div class="w">
      ${this.config.title ? this.renderHead() : nothing}
      <iframe
        src=${url}
        style="height:${height}px"
        loading="lazy"
        referrerpolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        title=${this.heading()}
      ></iframe>
    </div>`;
  }

  static override styles = [
    widgetStyles,
    css`
      iframe {
        width: 100%;
        border: 0;
        border-radius: var(--a-radius);
        background: var(--a-s2);
      }
    `,
  ];
}

// ---- cameras ----

export class AtriumCamerasWidget extends WidgetBase {
  #ids = new SelectorController(
    this,
    () => this.ctx?.store,
    (hass) =>
      chosenOr(hass, this.options, ["camera"]).filter((id) => hass.states[id]?.state !== "unavailable"),
  );

  protected override willUpdate(changed: PropertyValues<this>): void {
    this.#ids.attach();
    if (changed.has("config")) this.#ids.refresh();
  }

  protected override render() {
    if (!this.ctx) return nothing;
    const ids = (this.#ids.value ?? []).slice(0, Number(this.options.max) || 4);
    if (!ids.length || this.demo)
      return this.ctx.editing || this.demo
        ? html`<div class="w ${this.demo ? "" : "missing"}">
            ${this.renderHead()}
            <div class="ph"></div>
          </div>`
        : nothing;
    return html`<div class="w">
      ${this.renderHead()}
      <div class="cams">
        ${repeat(
          ids,
          (id) => id,
          (id) => html`<atrium-camera-tile .entityId=${id} .store=${this.ctx.store}></atrium-camera-tile>`,
        )}
      </div>
    </div>`;
  }

  static override styles = [
    widgetStyles,
    css`
      .cams {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
        gap: 8px;
      }
      .ph {
        aspect-ratio: 16 / 9;
        border-radius: var(--a-radius);
        background: linear-gradient(110deg, var(--a-s2) 30%, var(--a-s3) 50%, var(--a-s2) 70%);
        background-size: 300% 100%;
        animation: shimmer calc(var(--a-motion, 1) * 2s) linear var(--a-iter, infinite);
      }
      @keyframes shimmer {
        from {
          background-position: 100% 0;
        }
        to {
          background-position: -100% 0;
        }
      }
      :host([variant="big"]) .cams {
        grid-template-columns: minmax(0, 1fr);
      }
    `,
  ];
}

// ---- media ----

export class AtriumMediaWidget extends WidgetBase {
  #ids = new SelectorController(
    this,
    () => this.ctx?.store,
    (hass) => {
      const chosen = list(this.options.entities).filter((id) => id in hass.states);
      if (chosen.length) return chosen;
      const all = mediaPlayers(hass);
      // Without a choice: what is playing right now.
      return this.options.all === true
        ? all
        : all.filter((id) => ["playing", "paused"].includes(hass.states[id]?.state ?? ""));
    },
  );

  protected override willUpdate(changed: PropertyValues<this>): void {
    this.#ids.attach();
    if (changed.has("config")) this.#ids.refresh();
  }

  protected override render() {
    if (!this.ctx) return nothing;
    const ids = this.#ids.value ?? [];
    if (!ids.length)
      return this.ctx.editing || this.demo
        ? html`<div class="w missing">
            ${this.renderHead()}
            <p class="empty">${this.ctx.t("w.nothing_playing")}</p>
          </div>`
        : nothing;
    return html`<div class="w plain">
      <div class="players">
        ${repeat(
          ids,
          (id) => id,
          (id) =>
            html`<atrium-media-card
              .entityId=${id}
              .store=${this.ctx.store}
              .t=${this.ctx.t}
            ></atrium-media-card>`,
        )}
      </div>
    </div>`;
  }

  static override styles = [
    widgetStyles,
    css`
      .players {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 8px;
      }
    `,
  ];
}

// ---- one value as a tile ----

export class AtriumStatWidget extends WidgetBase {
  static override properties = { ...WidgetBase.properties, _pts: { state: true } };
  declare _pts: number[];
  #entity = new EntityController(this, () => this.ctx?.store);
  #key = "";

  constructor() {
    super();
    this._pts = [];
  }

  get #id(): string {
    return str(this.options.entity);
  }

  protected override willUpdate(): void {
    if (this.demo) {
      this._pts = [19.8, 20.1, 20.4, 20.2, 20.9, 21.3, 21.2, 21.6];
      return;
    }
    this.#entity.track(this.#id || undefined);
    if (this.#id && this.#id !== this.#key && this.ctx?.store.hass) {
      this.#key = this.#id;
      void this.ctx.store.hass
        .callWS<Record<string, Array<{ s: string }>>>({
          type: "history/history_during_period",
          start_time: new Date(Date.now() - 24 * 3600000).toISOString(),
          entity_ids: [this.#id],
          minimal_response: true,
          no_attributes: true,
        })
        .then(
          (r) => (this._pts = (r[this.#id] ?? []).map((p) => Number(p.s)).filter((n) => Number.isFinite(n))),
        )
        .catch(() => undefined);
    }
  }

  override heading(): string {
    const hass = this.ctx?.store.hass;
    return this.config?.title || (this.#id && hass && !this.demo ? nameOf(hass, this.#id) : super.heading());
  }

  protected override render() {
    if (!this.ctx) return nothing;
    const s = this.#entity.state;
    if (!s && !this.demo)
      return this.ctx.editing
        ? html`<div class="w missing">
            ${this.renderHead()}
            <p class="empty">${this.ctx.t("w.choose_entity")}</p>
          </div>`
        : nothing;
    const value = this.demo ? 21.6 : num(s);
    const unit = this.demo ? "°C" : unitOf(s);
    const pts = [...this._pts, ...(value !== null ? [value] : [])];
    const first = pts[0];
    const trend = value !== null && first !== undefined ? value - first : 0;
    const min = Math.min(...pts);
    const max = Math.max(...pts);
    const path =
      pts.length > 1
        ? pts
            .map(
              (v, i) =>
                `${i ? "L" : "M"}${(i / (pts.length - 1)) * 100} ${30 - ((v - min) / (max - min || 1)) * 26}`,
            )
            .join(" ")
        : "";
    return html`<button type="button" class="w stat-tile" @click=${() => this.moreInfo(this.#id)}>
      <span class="sl">${this.heading()}</span>
      <span class="sv"
        >${value === null ? (s?.state ?? "—") : fmt(this.ctx.locale, value, 1)}<small>${unit}</small>
        ${Math.abs(trend) > 0.05 ? html`<span class="tr ${trend > 0 ? "up" : "down"}">${trend > 0 ? "↗" : "↘"}</span>` : nothing}</span
      >
      ${
        this.variant === "bar" && value !== null && max > min
          ? html`<span class="vbar"
              ><span style="width:${((value - min) / (max - min)) * 100}%"></span
            ></span>`
          : nothing
      }
      ${path ? html`<svg viewBox="0 0 100 32" preserveAspectRatio="none" class="spark">${svg`<path d=${path}/>`}</svg>` : nothing}
    </button>`;
  }

  static override styles = [
    widgetStyles,
    css`
      .stat-tile {
        all: unset;
        box-sizing: border-box;
        width: 100%;
        background: var(--a-s1);
        border-radius: var(--a-radius);
        padding: 14px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        cursor: pointer;
      }
      .sl {
        font-size: 13px;
        font-weight: 600;
        color: var(--a-text2);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .sv {
        font-size: 36px;
        font-weight: 600;
        letter-spacing: -0.03em;
        line-height: 1.05;
        display: flex;
        align-items: baseline;
        gap: 4px;
      }
      .sv small {
        font-size: 15px;
        color: var(--a-text2);
      }
      .tr {
        font-size: 20px;
        margin-left: auto;
      }
      .tr.up {
        color: var(--a-ocher);
      }
      .tr.down {
        color: var(--a-slate);
      }
      .spark {
        width: 100%;
        height: 32px;
      }
      .spark {
        animation: reveal calc(var(--a-motion, 1) * 1s) ease-out both;
      }
      .spark path {
        fill: none;
        stroke: var(--a-ocher);
        stroke-width: 2;
        vector-effect: non-scaling-stroke;
      }
      @keyframes reveal {
        from {
          clip-path: inset(0 100% 0 0);
        }
        to {
          clip-path: inset(0 0 0 0);
        }
      }
      @keyframes draw {
        from {
          stroke-dashoffset: 1;
        }
        to {
          stroke-dashoffset: 0;
        }
      }
      :host([variant="big"]) .sv {
        font-size: 60px;
      }
      :host([variant="big"]) .spark {
        height: 48px;
      }
      :host([variant="minimal"]) .spark,
      :host([variant="minimal"]) .tr {
        display: none;
      }
      :host([variant="bar"]) .spark {
        display: none;
      }
      .vbar {
        height: 10px;
        border-radius: 5px;
        background: var(--a-s3);
        overflow: hidden;
      }
      .vbar span {
        display: block;
        height: 100%;
        background: var(--a-ocher);
        border-radius: 5px;
        transform-origin: left;
        animation: grow calc(var(--a-motion, 1) * 800ms) cubic-bezier(0.2, 0.9, 0.25, 1);
        transition: width calc(var(--a-motion, 1) * 600ms);
      }
      @keyframes grow {
        from {
          transform: scaleX(0);
        }
      }
    `,
  ];
}

// ---- one big button ----

export class AtriumButtonWidget extends WidgetBase {
  static override properties = { ...WidgetBase.properties, _done: { state: true } };
  declare _done: boolean;
  #entity = new EntityController(this, () => this.ctx?.store);
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    super();
    this._done = false;
  }

  get #id(): string {
    return str(this.options.entity);
  }

  protected override willUpdate(): void {
    this.#entity.track(this.#id || undefined);
  }

  #press(): void {
    const id = this.#id;
    this._done = true;
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => (this._done = false), 1200);
    if (this.demo || !id) return;
    const domain = id.split(".")[0] ?? "";
    if (domain === "scene" || domain === "script")
      void this.ctx.store.hass?.callService(domain, "turn_on", { entity_id: id });
    else if (domain === "button" || domain === "input_button")
      void this.ctx.store.hass?.callService(domain, "press", { entity_id: id });
    else this.toggle(id);
  }

  protected override render() {
    if (!this.ctx) return nothing;
    const s = this.#entity.state;
    if (!s && !this.demo)
      return this.ctx.editing
        ? html`<div class="w missing">
            ${this.renderHead()}
            <p class="empty">${this.ctx.t("w.choose_entity")}</p>
          </div>`
        : nothing;
    const hass = this.ctx.store.hass;
    const label = this.config.title || (this.demo ? "Gute Nacht" : hass && s ? nameOf(hass, this.#id) : "");
    const on = s?.state === "on";
    const iconName = str(this.options.icon) || (s?.attributes.icon as string | undefined) || "";
    const hasIcon = iconName && customElements.get("ha-icon");
    return html`<button
      type="button"
      class="big ${on ? "on" : ""} ${this._done ? "done" : ""}"
      @click=${() => this.#press()}
    >
      ${hasIcon ? html`<ha-icon .icon=${iconName}></ha-icon>` : html`<span class="glyph">✦</span>`}
      <span class="bl">${label}</span>
      ${
        s && ["switch", "light", "input_boolean", "fan"].includes(this.#id.split(".")[0] ?? "")
          ? html`<span class="bs">${on ? this.ctx.t("state.on") : this.ctx.t("state.off")}</span>`
          : nothing
      }
    </button>`;
  }

  static override styles = [
    widgetStyles,
    css`
      .big {
        all: unset;
        box-sizing: border-box;
        width: 100%;
        min-height: 110px;
        border-radius: var(--a-radius);
        background: var(--a-s1);
        padding: 16px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 8px;
        cursor: pointer;
        position: relative;
        overflow: hidden;
        transition:
          background-color calc(var(--a-motion, 1) * 250ms),
          transform calc(var(--a-motion, 1) * 120ms);
      }
      .big:active {
        transform: scale(0.97);
      }
      .big:focus-visible {
        outline: 2px solid var(--a-ocher);
        outline-offset: 2px;
      }
      .big.on,
      .big.done {
        background: var(--a-ocher);
        color: var(--a-on-ocher);
      }
      .big.done::after {
        content: "";
        position: absolute;
        left: 50%;
        top: 50%;
        width: 20px;
        height: 20px;
        margin: -10px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.4);
        animation: ripple calc(var(--a-motion, 1) * 700ms) ease-out forwards;
      }
      ha-icon {
        --mdc-icon-size: 30px;
      }
      .glyph {
        font-size: 26px;
        color: var(--a-ocher);
      }
      .on .glyph,
      .done .glyph {
        color: inherit;
      }
      .bl {
        font-size: 18px;
        font-weight: 600;
      }
      .bs {
        font-size: 13px;
        opacity: 0.8;
      }
      @keyframes ripple {
        to {
          transform: scale(16);
          opacity: 0;
        }
      }
      :host([variant="round"]) .big {
        width: auto;
        min-height: 0;
        aspect-ratio: 1;
        max-width: 160px;
        margin: 0 auto;
        border-radius: 50%;
        align-items: center;
        justify-content: center;
        text-align: center;
      }
      :host([variant="round"]) .bl {
        font-size: 15px;
      }
      :host([variant="wide"]) .big {
        min-height: 64px;
        flex-direction: row;
        align-items: center;
        justify-content: flex-start;
        gap: 14px;
      }
      :host([variant="wide"]) .bs {
        margin-left: auto;
      }
    `,
  ];
}
