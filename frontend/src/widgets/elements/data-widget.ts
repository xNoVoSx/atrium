import { css, html, nothing, type PropertyValues } from "lit";
import { keyed } from "lit/directives/keyed.js";
import { repeat } from "lit/directives/repeat.js";
import { SelectorController } from "../../data/entity-store";
import { ADAPTERS, DEMO } from "../adapters";
import { WidgetBase } from "../base";
import { widgetStyles } from "../styles";
import type { DataModel, Metric, MetricGroup, Row } from "../types";

/**
 * A widget that shows what an adapter derives from Home Assistant: big
 * numbers, devices with bars, rows with status, switches. Used by all
 * homelab and system widgets.
 */
export class AtriumDataWidget extends WidgetBase {
  static override properties = {
    ...WidgetBase.properties,
    adapter: {},
    _flipped: { state: true },
  };

  declare adapter: string;
  /** Demo switches the user tapped. */
  declare _flipped: Set<string>;

  #model = new SelectorController<DataModel | null>(
    this,
    () => this.ctx?.store,
    (hass) => {
      if (this.demo) return null;
      const fn = ADAPTERS[this.adapter];
      return fn ? fn(hass, { t: this.ctx.t, locale: this.ctx.locale, options: this.options }) : null;
    },
  );

  constructor() {
    super();
    this._flipped = new Set();
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    this.#model.attach();
    if (changed.has("ctx") || changed.has("config") || changed.has("demo")) this.#model.refresh();
  }

  #model_(): DataModel | null {
    if (this.demo)
      return DEMO[this.adapter]?.({ t: this.ctx.t, locale: this.ctx.locale, options: {} }) ?? null;
    return this.#model.value ?? null;
  }

  #switch(entityId: string): void {
    if (this.demo) {
      const next = new Set(this._flipped);
      if (next.has(entityId)) next.delete(entityId);
      else next.add(entityId);
      this._flipped = next;
      return;
    }
    this.toggle(entityId);
  }

  #on(entityId: string, on: boolean): boolean {
    return this._flipped.has(entityId) ? !on : on;
  }

  #stat(m: Metric) {
    return html`<button
      type="button"
      class="stat tone-${m.tone ?? "none"}"
      data-entity=${m.entityId ?? nothing}
      tabindex=${m.entityId ? 0 : -1}
      @click=${() => this.moreInfo(m.entityId)}
    >
      <span class="v"
        >${keyed(m.value, html`<span class="tick">${m.value}</span>`)}${m.unit ? html`<small>${m.unit}</small>` : nothing}</span
      >
      <span class="l">${m.label}</span>
      ${typeof m.pct === "number" ? html`<span class="bar ${m.tone ?? ""}"><span style="width:${clampPct(m.pct)}%"></span></span>` : nothing}
    </button>`;
  }

  #metric(m: Metric) {
    return html`<button
      type="button"
      class="metric"
      data-entity=${m.entityId ?? nothing}
      tabindex=${m.entityId ? 0 : -1}
      @click=${() => this.moreInfo(m.entityId)}
    >
      <span class="ml">${m.label}</span>
      <span class="mv">${m.value}${m.unit ? ` ${m.unit}` : ""}</span>
      ${typeof m.pct === "number" ? html`<span class="bar ${m.tone ?? ""}"><span style="width:${clampPct(m.pct)}%"></span></span>` : nothing}
    </button>`;
  }

  #group(g: MetricGroup) {
    return html`<div class="group" data-group=${g.id}>
      <div class="g-head">
        <span class="g-name">${g.name}</span>
        ${g.status ? html`<span class="chip"><span class="dot ${g.status.tone}"></span>${g.status.label}</span>` : nothing}
      </div>
      ${g.sub ? html`<span class="g-sub">${g.sub}</span>` : nothing} ${g.metrics.map((m) => this.#metric(m))}
    </div>`;
  }

  #row(r: Row) {
    const toggle = r.toggle;
    const on = toggle ? this.#on(toggle.entityId, toggle.on) : false;
    return html`<div
      class="row"
      role=${r.entityId ? "button" : nothing}
      tabindex=${r.entityId ? 0 : -1}
      data-entity=${r.entityId ?? nothing}
      @click=${() => this.moreInfo(r.entityId)}
    >
      <span class="dot ${r.tone ?? ""}"></span>
      <span class="rn"><b>${r.name}</b>${r.sub ? html`<small>${r.sub}</small>` : nothing}</span>
      <span class="rv">${r.value ?? ""}</span>
      ${
        toggle
          ? html`<button
              type="button"
              class="pill ${on ? "on" : ""}"
              aria-pressed=${String(on)}
              aria-label=${r.name}
              @click=${(ev: Event) => {
                ev.stopPropagation();
                this.#switch(toggle.entityId);
              }}
            >
              <span class="knob"></span>
            </button>`
          : html`<span></span>`
      }
      ${typeof r.pct === "number" ? html`<span class="bar ${r.tone ?? ""}"><span style="width:${clampPct(r.pct)}%"></span></span>` : nothing}
    </div>`;
  }

  protected override render() {
    if (!this.ctx) return nothing;
    const m = this.#model_();
    if (!m) {
      if (!this.ctx.editing) return nothing;
      return html`<div class="w missing">
        ${this.renderHead()}
        <p class="empty">${this.ctx.t("w.not_found")}</p>
      </div>`;
    }
    return html`<div class="w">
      ${this.renderHead(m.note)}
      ${m.summary?.length ? html`<div class="summary">${m.summary.map((s) => this.#stat(s))}</div>` : nothing}
      ${
        m.toggles?.length
          ? html`<div class="toggles">
              ${m.toggles.map((tg) => {
                const on = this.#on(tg.entityId, tg.on);
                return html`<button
                  type="button"
                  class="pill ${on ? "on" : ""}"
                  aria-pressed=${String(on)}
                  data-toggle=${tg.entityId}
                  @click=${() => this.#switch(tg.entityId)}
                >
                  ${tg.label}<span class="knob"></span>
                </button>`;
              })}
            </div>`
          : nothing
      }
      ${
        m.groups?.length
          ? html`<div class="groups">
              ${repeat(
                m.groups,
                (g) => g.id,
                (g) => this.#group(g),
              )}
            </div>`
          : nothing
      }
      ${
        m.rows?.length
          ? html`<div class="rows">
              ${repeat(
                m.rows,
                (r) => r.id,
                (r) => this.#row(r),
              )}
            </div>`
          : nothing
      }
      ${m.empty ? html`<p class="empty">${m.empty}</p>` : nothing}
    </div>`;
  }

  static override styles = [
    widgetStyles,
    css`
      .row .pill {
        padding: 0 4px;
        min-height: 34px;
        background: none;
      }
    `,
  ];
}

const clampPct = (n: number) => Math.max(0, Math.min(100, n));
