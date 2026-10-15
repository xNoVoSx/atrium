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
                ${svg`<path d=${area} class="area" /><path d=${path} class="line" pathLength="1" />`}
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
        stroke-dasharray: 1;
        animation: draw calc(var(--a-motion, 1) * 1.2s) ease-out both;
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
