import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import { EntityController, type EntityStore } from "../data/entity-store";
import { friendlyName } from "../data/registry";
import type { MessageKey, Translate } from "../i18n";
import type { HassEntity } from "../types/hass";
import { ICONS } from "../theme/shared";
import { attachPress } from "../util/press";
import { icon } from "./icon";

/** What a tap does for each domain. Locks and alarms never act on a single tap. */
function tapAction(s: HassEntity): { domain: string; service: string } | null {
  const domain = s.entity_id.split(".")[0] ?? "";
  switch (domain) {
    case "switch":
    case "input_boolean":
    case "fan":
      return { domain, service: "toggle" };
    case "cover":
    case "valve":
      return { domain, service: "toggle" };
    case "media_player":
      return { domain, service: "media_play_pause" };
    case "button":
      return { domain, service: "press" };
    case "script":
      return { domain, service: "turn_on" };
    case "vacuum":
      return { domain, service: s.state === "cleaning" ? "return_to_base" : "start" };
    default:
      return null;
  }
}

const isActive = (s: HassEntity) =>
  ["on", "open", "opening", "playing", "cleaning", "unlocked"].includes(s.state);

/**
 * A tile for anything switchable that is not a light. Tap acts (toggle,
 * play/pause, open/close), long press opens Home Assistant's dialog.
 */
export class AtriumEntityTile extends LitElement {
  static override properties = {
    entityId: { attribute: "entity-id", reflect: true },
    store: { attribute: false },
    t: { attribute: false },
  };

  declare entityId: string;
  declare store: EntityStore | undefined;
  declare t: Translate;

  #entity = new EntityController(this, () => this.store);
  #detach: (() => void) | undefined;

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("entityId") || changed.has("store")) this.#entity.track(this.entityId);
  }

  protected override firstUpdated(): void {
    const button = this.renderRoot.querySelector("button");
    if (!button) return;
    this.#detach = attachPress(button, {
      onTap: () => this.#tap(),
      onLongPress: () => this.#moreInfo(),
    });
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#detach?.();
    this.#detach = undefined;
  }

  #tap(): void {
    const s = this.#entity.state;
    const action = s && tapAction(s);
    if (!s || !action) {
      this.#moreInfo();
      return;
    }
    void this.store?.hass?.callService(action.domain, action.service, { entity_id: this.entityId });
  }

  #moreInfo(): void {
    this.dispatchEvent(
      new CustomEvent("hass-more-info", {
        detail: { entityId: this.entityId },
        bubbles: true,
        composed: true,
      }),
    );
  }

  #stateLabel(s: HassEntity): string {
    const domain = s.entity_id.split(".")[0];
    const candidates: string[] =
      domain === "media_player"
        ? [`media.${s.state}`]
        : domain === "cover"
          ? [`cover.${s.state}`]
          : [`state.${s.state}`];
    for (const key of candidates) {
      const label = this.t(key as MessageKey);
      if (label) return label;
    }
    return s.state;
  }

  protected override render() {
    const s = this.#entity.state;
    if (!s) return nothing;
    const domain = s.entity_id.split(".")[0];
    const active = isActive(s);
    const media = domain === "media_player";
    const title = media ? ((s.attributes.media_title as string | undefined) ?? "") : "";
    return html`<button
      type="button"
      class="${active ? (media ? "media" : "on") : ""} ${s.state === "unavailable" ? "unavailable" : ""}"
      aria-pressed=${String(active)}
    >
      ${icon(media ? ICONS.media : ICONS.power, 26)}
      <span class="text">
        <span class="name">${friendlyName(s)}</span>
        <span class="state">${title || this.#stateLabel(s)}</span>
      </span>
    </button>`;
  }

  static override styles = css`
    :host {
      display: block;
    }
    button {
      all: unset;
      box-sizing: border-box;
      width: 100%;
      min-height: 64px;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 14px;
      border-radius: var(--a-radius);
      cursor: pointer;
      background: var(--a-s1);
      box-shadow: inset 0 0 0 1px var(--a-line);
      color: var(--a-text);
      font-family: var(--a-font);
      transition:
        background-color 220ms ease,
        transform 120ms ease;
      touch-action: manipulation;
      user-select: none;
      -webkit-user-select: none;
    }
    button:focus-visible {
      outline: 2px solid var(--a-ocher);
      outline-offset: 2px;
    }
    button.on {
      background: var(--a-ocher);
      color: var(--a-on-ocher);
      box-shadow: none;
    }
    button.media {
      background: var(--a-slate);
      color: #fff;
      box-shadow: none;
    }
    button.unavailable {
      opacity: 0.45;
    }
    button[pressed] {
      transform: scale(0.97);
    }
    svg {
      flex: none;
    }
    .text {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .name {
      font-size: 15px;
      font-weight: 600;
      line-height: 1.15;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    .state {
      font-size: 13px;
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `;
}
