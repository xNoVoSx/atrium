// Common parts of widget elements: inputs, heading, and the two actions every
// widget needs (open details, switch something).

import { LitElement, html, nothing, type TemplateResult } from "lit";
import { icon } from "../components/icon";
import type { PanelContext } from "../context";
import type { WidgetInstance } from "../data/pages";
import { widgetDef } from "./catalog";

export class WidgetBase extends LitElement {
  static override properties = {
    ctx: { attribute: false },
    config: { attribute: false },
    demo: { type: Boolean, reflect: true },
  };

  declare ctx: PanelContext;
  declare config: WidgetInstance;
  declare demo: boolean;

  constructor() {
    super();
    this.demo = false;
  }

  get options(): Record<string, unknown> {
    return this.config?.options ?? {};
  }

  /** Chosen design (options.variant), "" for the default. */
  get variant(): string {
    return typeof this.options.variant === "string" ? this.options.variant : "";
  }

  // Mirror the design onto the host so styles can switch with :host([variant=…]).
  protected override update(changed: Map<PropertyKey, unknown>): void {
    if (this.variant) this.setAttribute("variant", this.variant);
    else this.removeAttribute("variant");
    super.update(changed);
  }

  /** The heading: the instance's own title or the widget's name. */
  heading(): string {
    const def = widgetDef(this.config?.type ?? "");
    return this.config?.title || (def ? this.ctx.t(def.name) : "");
  }

  renderHead(note?: string | TemplateResult | typeof nothing): TemplateResult {
    const def = widgetDef(this.config?.type ?? "");
    return html`<div class="head">
      ${def ? html`<span class="ico">${icon(def.icon, 18, 2)}</span>` : nothing}
      <h2>${this.heading()}</h2>
      ${this.demo ? html`<span class="demo-badge">${this.ctx.t("w.demo")}</span>` : nothing}
      ${note ? html`<span class="note">${note}</span>` : nothing}
    </div>`;
  }

  moreInfo(entityId: string | undefined): void {
    if (!entityId || this.demo) return;
    this.dispatchEvent(
      new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }),
    );
  }

  /** Toggle any switchable entity (switch, input_boolean, light, fan …). */
  toggle(entityId: string): void {
    if (this.demo) return;
    const domain = entityId.split(".")[0] ?? "";
    const own = ["switch", "input_boolean", "light", "fan", "automation", "siren", "humidifier"];
    void this.ctx.store.hass?.callService(own.includes(domain) ? domain : "homeassistant", "toggle", {
      entity_id: entityId,
    });
  }
}
