import { LitElement, css, html, nothing } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { icon } from "../components/icon";
import type { PanelContext } from "../context";
import { SelectorController } from "../data/entity-store";
import { sceneEntities } from "../data/home";
import type { WidgetInstance } from "../data/pages";
import { nameOf } from "../data/registry";
import { shared } from "../theme/shared";

const HELP = "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01";
const SPARK =
  "M7 3l1.5 4 4 1.5-4 1.5L7 14l-1.5-4-4-1.5 4-1.5zM17 10l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z";

/**
 * Scenes and scripts as buttons. Each shows what it switches (the scene's
 * entities), a "?" explains what a scene is, and a short ripple confirms.
 */
export class AtriumScenesModule extends LitElement {
  static override properties = {
    ctx: { attribute: false },
    config: { attribute: false },
    _ran: { state: true },
    _help: { state: true },
  };

  declare ctx: PanelContext;
  declare config: WidgetInstance | undefined;
  declare _ran: string | null;
  declare _help: boolean;

  #scenes = new SelectorController(
    this,
    () => this.ctx?.store,
    (hass) =>
      sceneEntities(hass).map((id) => {
        const targets = (hass.states[id]?.attributes.entity_id as string[] | undefined) ?? [];
        return {
          id,
          name: nameOf(hass, id),
          icon: (hass.states[id]?.attributes.icon as string | undefined) ?? "",
          targets: targets.map((t) => (hass.states[t] ? nameOf(hass, t) : t)),
        };
      }),
  );
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    super();
    this._ran = null;
    this._help = false;
  }

  protected override willUpdate(): void {
    this.#scenes.attach();
    const variant = this.config?.options?.variant;
    if (typeof variant === "string" && variant !== "grid") this.setAttribute("variant", variant);
    else this.removeAttribute("variant");
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearTimeout(this.#timer);
  }

  #run(entityId: string): void {
    const [domain] = entityId.split(".");
    void this.ctx.store.hass?.callService(domain === "script" ? "script" : "scene", "turn_on", {
      entity_id: entityId,
    });
    this._ran = entityId;
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => (this._ran = null), 1500);
  }

  protected override render() {
    const scenes = this.#scenes.value ?? [];
    if (!scenes.length) return nothing;
    const { t } = this.ctx;
    const hasIcon = Boolean(customElements.get("ha-icon"));
    return html`
      <div class="heading">
        <h2 class="label">${this.config?.title || t("section.scenes")}</h2>
        <button
          type="button"
          class="help ${this._help ? "on" : ""}"
          aria-expanded=${String(this._help)}
          aria-label=${t("scenes.help_title")}
          @click=${() => (this._help = !this._help)}
        >
          ${icon(HELP, 18, 2)}
        </button>
      </div>
      ${
        this._help
          ? html`<div class="explain">
              <b>${t("scenes.help_title")}</b>
              <p>${t("scenes.help")}</p>
              <p class="more">${t("scenes.help_more")}</p>
            </div>`
          : nothing
      }
      <div class="row">
        ${repeat(
          scenes,
          (s) => s.id,
          (s) =>
            html`<button
              type="button"
              class=${this._ran === s.id ? "ran" : ""}
              data-scene=${s.id}
              @click=${() => this.#run(s.id)}
            >
              <span class="ico"
                >${s.icon && hasIcon ? html`<ha-icon .icon=${s.icon}></ha-icon>` : icon(SPARK, 20, 1.8)}</span
              >
              <span class="txt">
                <b>${s.name}</b>
                ${
                  this._ran === s.id
                    ? html`<small>✓ ${t("scenes.ran")}</small>`
                    : s.targets.length
                      ? html`<small
                          >${s.targets.slice(0, 3).join(", ")}${s.targets.length > 3 ? " …" : ""}</small
                        >`
                      : nothing
                }
              </span>
            </button>`,
        )}
      </div>
    `;
  }

  static override styles = [
    shared,
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .help {
        border: 0;
        width: 34px;
        height: 34px;
        border-radius: 17px;
        background: var(--a-s1);
        color: var(--a-text2);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }
      .help.on {
        background: var(--a-ocher);
        color: var(--a-on-ocher);
      }
      .explain {
        background: var(--a-s1);
        border-radius: var(--a-radius);
        border-left: 4px solid var(--a-ocher);
        padding: 12px 14px;
        font-size: 14px;
        line-height: 1.45;
        animation: open calc(var(--a-motion, 1) * 250ms) ease-out;
      }
      .explain p {
        margin: 6px 0 0;
      }
      .explain .more {
        color: var(--a-text2);
        font-size: 13px;
      }
      .row {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        gap: 8px;
      }
      .row button {
        position: relative;
        overflow: hidden;
        min-height: 60px;
        padding: 8px 12px;
        border: 0;
        border-radius: var(--a-radius);
        background: var(--a-s1);
        color: var(--a-text);
        display: flex;
        align-items: center;
        gap: 10px;
        text-align: left;
        cursor: pointer;
        transition:
          background-color calc(var(--a-motion, 1) * 200ms) ease,
          color calc(var(--a-motion, 1) * 200ms) ease,
          transform calc(var(--a-motion, 1) * 120ms) ease;
      }
      .row button:active {
        transform: scale(0.97);
      }
      .row button.ran {
        background: var(--a-ocher);
        color: var(--a-on-ocher);
      }
      .row button.ran::after {
        content: "";
        position: absolute;
        left: 50%;
        top: 50%;
        width: 20px;
        height: 20px;
        margin: -10px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.45);
        animation: ripple calc(var(--a-motion, 1) * 600ms) ease-out forwards;
      }
      .ico {
        display: flex;
        color: var(--a-ocher);
        flex: none;
      }
      .ran .ico {
        color: inherit;
      }
      .txt {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .txt b {
        font-size: 15px;
        font-weight: 600;
      }
      .txt small {
        font-size: 12px;
        opacity: 0.75;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      @keyframes ripple {
        to {
          transform: scale(14);
          opacity: 0;
        }
      }
      @keyframes open {
        from {
          opacity: 0;
          transform: translateY(-4px);
        }
      }
      :host([variant="list"]) .row {
        grid-template-columns: minmax(0, 1fr);
        gap: 6px;
      }
      :host([variant="big"]) .row {
        grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
      }
      :host([variant="big"]) .row button {
        min-height: 96px;
        flex-direction: column;
        align-items: flex-start;
        justify-content: space-between;
      }
      :host([variant="big"]) .txt b {
        font-size: 18px;
      }
      :host([variant="big"]) .ico {
        transform: scale(1.4);
        transform-origin: left top;
      }
      :host([variant="chips"]) .row {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      :host([variant="chips"]) .row button {
        min-height: 40px;
        border-radius: 20px;
        padding: 4px 14px 4px 10px;
      }
      :host([variant="chips"]) .txt small {
        display: none;
      }
    `,
  ];
}
