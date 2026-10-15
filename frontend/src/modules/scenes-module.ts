import { LitElement, css, html, nothing } from "lit";
import { repeat } from "lit/directives/repeat.js";
import type { PanelContext } from "../context";
import { SelectorController } from "../data/entity-store";
import { sceneEntities } from "../data/home";
import { nameOf } from "../data/registry";
import { shared } from "../theme/shared";

/** Scenes and scripts as buttons; a short confirmation shows what ran. */
export class AtriumScenesModule extends LitElement {
  static override properties = { ctx: { attribute: false }, _ran: { state: true } };

  declare ctx: PanelContext;
  declare _ran: string | null;

  #scenes = new SelectorController(
    this,
    () => this.ctx?.store,
    (hass) => sceneEntities(hass).map((id) => ({ id, name: nameOf(hass, id) })),
  );
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    super();
    this._ran = null;
  }

  protected override willUpdate(): void {
    this.#scenes.attach();
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
    return html`
      <h2 class="label">${this.ctx.t("section.scenes")}</h2>
      <div class="row">
        ${repeat(
          scenes,
          (s) => s.id,
          (s) =>
            html`<button
              type="button"
              class=${this._ran === s.id ? "ran" : ""}
              @click=${() => this.#run(s.id)}
            >
              ${s.name}
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
      .row {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
        gap: 8px;
      }
      button {
        min-height: 52px;
        padding: 6px 10px;
        border: 0;
        border-radius: var(--a-radius);
        background: var(--a-s1);
        color: var(--a-text);
        font-size: 15px;
        font-weight: 600;
        transition:
          background-color 200ms ease,
          color 200ms ease;
      }
      button.ran {
        background: var(--a-ocher);
        color: var(--a-on-ocher);
      }
    `,
  ];
}
