import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import { EntityController, type EntityStore } from "../data/entity-store";
import { nameOf } from "../data/registry";
import type { MessageKey, Translate } from "../i18n";
import { icon } from "./icon";

// media_player supported_features bits (Home Assistant MediaPlayerEntityFeature)
const PAUSE = 1;
const VOLUME_SET = 4;
const PREVIOUS = 16;
const NEXT = 32;
const TURN_ON = 128;
const TURN_OFF = 256;
const PLAY = 16384;

const P = {
  play: "M7 5l12 7-12 7z",
  pause: "M7 5h4v14H7zM13 5h4v14h-4z",
  prev: "M6 5v14M18 5L8 12l10 7z",
  next: "M18 5v14M6 5l10 7-10 7z",
  power: "M12 3v9M6.3 7.3a8 8 0 1 0 11.4 0",
};

/** One media player: artwork, what is on, transport controls and volume. */
export class AtriumMediaCard extends LitElement {
  static override properties = {
    entityId: { attribute: "entity-id", reflect: true },
    store: { attribute: false },
    t: { attribute: false },
    _volume: { state: true },
  };

  declare entityId: string;
  declare store: EntityStore | undefined;
  declare t: Translate;
  declare _volume: number | null;

  #entity = new EntityController(this, () => this.store);

  constructor() {
    super();
    this._volume = null;
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("entityId") || changed.has("store")) this.#entity.track(this.entityId);
  }

  #call(service: string, data: Record<string, unknown> = {}): void {
    void this.store?.hass?.callService("media_player", service, { entity_id: this.entityId, ...data });
  }

  protected override render() {
    const s = this.#entity.state;
    const hass = this.store?.hass;
    if (!s || !hass) return nothing;
    const t = this.t;
    const features = Number(s.attributes.supported_features ?? 0);
    const has = (bit: number) => (features & bit) !== 0;
    const on = !["off", "standby", "unavailable"].includes(s.state);
    const playing = s.state === "playing";
    const title = (s.attributes.media_title as string | undefined) || "";
    const artist =
      (s.attributes.media_artist as string | undefined) ||
      (s.attributes.app_name as string | undefined) ||
      "";
    // Like Home Assistant's own cards: the local proxy first (some integrations,
    // e.g. Plex, give a path that only their own server knows).
    const picture = (s.attributes.entity_picture_local ?? s.attributes.entity_picture) as string | undefined;
    const volume = this._volume ?? Math.round(Number(s.attributes.volume_level ?? 0) * 100);
    const stateLabel = t(`media.${s.state}` as MessageKey) || t(`state.${s.state}` as MessageKey) || s.state;
    return html`<div class="card ${playing ? "playing" : ""}">
      <div class="top">
        ${
          picture && on
            ? html`<img
                class="art"
                src=${picture}
                alt=""
                @error=${(e: Event) => ((e.target as HTMLImageElement).style.visibility = "hidden")}
              />`
            : html`<span class="art empty"></span>`
        }
        <div class="text">
          <div class="name">${nameOf(hass, this.entityId)}</div>
          <div class="title">${title || stateLabel}</div>
          ${artist ? html`<div class="artist">${artist}</div>` : nothing}
        </div>
        ${
          has(TURN_ON) || has(TURN_OFF)
            ? html`<button
                type="button"
                class="round ${on ? "on" : ""}"
                aria-label=${on ? t("media.turn_off") : t("media.turn_on")}
                @click=${() => this.#call(on ? "turn_off" : "turn_on")}
              >
                ${icon(P.power, 20, 2)}
              </button>`
            : nothing
        }
      </div>
      ${
        on
          ? html`<div class="controls">
                ${
                  has(PREVIOUS)
                    ? html`<button
                        type="button"
                        aria-label=${t("media.previous")}
                        @click=${() => this.#call("media_previous_track")}
                      >
                        ${icon(P.prev, 22, 2)}
                      </button>`
                    : nothing
                }
                ${
                  has(PAUSE) || has(PLAY)
                    ? html`<button
                        type="button"
                        class="main"
                        aria-label=${playing ? t("media.pause") : t("media.play")}
                        @click=${() => this.#call("media_play_pause")}
                      >
                        ${icon(playing ? P.pause : P.play, 26, 2)}
                      </button>`
                    : nothing
                }
                ${
                  has(NEXT)
                    ? html`<button
                        type="button"
                        aria-label=${t("media.next")}
                        @click=${() => this.#call("media_next_track")}
                      >
                        ${icon(P.next, 22, 2)}
                      </button>`
                    : nothing
                }
              </div>
              ${
                has(VOLUME_SET)
                  ? html`<label class="volume">
                      <span>${t("media.volume")}</span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        .value=${String(volume)}
                        @input=${(ev: Event) => (this._volume = Number((ev.target as HTMLInputElement).value))}
                        @change=${(ev: Event) => {
                          this.#call("volume_set", {
                            volume_level: Number((ev.target as HTMLInputElement).value) / 100,
                          });
                          this._volume = null;
                        }}
                      />
                      <span class="pct">${volume} %</span>
                    </label>`
                  : nothing
              }`
          : nothing
      }
    </div>`;
  }

  static override styles = css`
    :host {
      display: block;
      font-family: var(--a-font);
      color: var(--a-text);
    }
    .card {
      border-radius: var(--a-radius);
      background: var(--a-s1);
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .card.playing {
      background: var(--a-slate);
      color: #fff;
    }
    .top {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .art {
      width: 56px;
      height: 56px;
      border-radius: 6px;
      object-fit: cover;
      flex: none;
      background: var(--a-s3);
    }
    .text {
      flex: 1;
      min-width: 0;
    }
    .name {
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      opacity: 0.85;
    }
    .title {
      font-size: 17px;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .artist {
      font-size: 13px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    button {
      border: 0;
      cursor: pointer;
      font-family: inherit;
      display: flex;
      align-items: center;
      justify-content: center;
      color: inherit;
    }
    button:focus-visible {
      outline: 2px solid var(--a-ocher);
      outline-offset: 2px;
    }
    .round {
      width: 44px;
      height: 44px;
      border-radius: 22px;
      background: var(--a-s3);
      color: var(--a-text);
      flex: none;
    }
    .round.on {
      background: var(--a-ocher);
      color: var(--a-on-ocher);
    }
    .controls {
      display: flex;
      justify-content: center;
      gap: 12px;
    }
    .controls button {
      width: 52px;
      height: 52px;
      border-radius: var(--a-radius);
      background: rgba(255, 255, 255, 0.12);
    }
    .card:not(.playing) .controls button {
      background: var(--a-s3);
    }
    .controls button.main {
      width: 64px;
      background: var(--a-ocher);
      color: var(--a-on-ocher);
    }
    .volume {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 13px;
    }
    .volume input {
      flex: 1;
      accent-color: var(--a-ocher);
      height: 32px;
    }
    .pct {
      width: 44px;
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
  `;
}
