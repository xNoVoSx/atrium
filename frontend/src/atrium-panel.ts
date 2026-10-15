import { LitElement, css, html } from "lit";
import { EntityStore } from "./data/entity-store";
import { isAutoVisible } from "./data/registry";
import { VersionWatch, loadedHash } from "./data/version-watch";
import { translator, type MessageKey, type Translate } from "./i18n";
import { tokens, type ThemePreference } from "./theme/tokens";
import type { HomeAssistant, PanelInfo, Route } from "./types/hass";
import { reportClient } from "./util/diagnostics";
import type { AtriumLightControl } from "./components/light-control";

export const VERSION = __ATRIUM_VERSION__;
const THEME_KEY = "atrium-theme";
const THEMES: ThemePreference[] = ["auto", "dark", "light"];

function readThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return THEMES.includes(stored as ThemePreference) ? (stored as ThemePreference) : "auto";
  } catch {
    return "auto";
  }
}

/** The panel Home Assistant mounts in the sidebar. */
export class AtriumPanel extends LitElement {
  static override properties = {
    hass: { attribute: false, noAccessor: true },
    narrow: { type: Boolean, reflect: true },
    route: { attribute: false },
    panel: { attribute: false },
    _themePref: { state: true },
  };

  declare narrow: boolean;
  declare route: Route | undefined;
  declare panel: PanelInfo | undefined;
  declare _themePref: ThemePreference;

  readonly store = new EntityStore();
  #hass: HomeAssistant | undefined;
  #t: Translate = translator("en");
  #language: string | undefined;
  #versionWatch = new VersionWatch(() => this.hass, {
    ownHash: loadedHash(import.meta.url),
    isBusy: () => Boolean(this.#control()?.open),
  });
  #watching = false;
  #reported = false;

  constructor() {
    super();
    this.narrow = false;
    this._themePref = readThemePreference();
  }

  override connectedCallback(): void {
    super.connectedCallback();
    // Attributes may not be set in a custom element's constructor.
    this.dataset.version = VERSION;
  }

  get hass(): HomeAssistant | undefined {
    return this.#hass;
  }

  // Every state change in the house arrives here. The store forwards it to the
  // affected tiles; the panel itself only re-renders for theme or language.
  set hass(hass: HomeAssistant | undefined) {
    const prev = this.#hass;
    this.#hass = hass;
    if (!hass) return;
    this.store.update(hass);
    if (!this.#watching) {
      this.#watching = true;
      void this.#versionWatch.start();
    }
    this.#report();
    if (!prev || prev.themes !== hass.themes || prev.language !== hass.language) {
      this.requestUpdate("hass", prev);
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#versionWatch.stop();
    this.#watching = false;
  }

  protected override willUpdate(): void {
    if (this.hass && this.hass.language !== this.#language) {
      this.#language = this.hass.language;
      this.#t = translator(this.hass.language);
    }
    this.#applyTheme();
  }

  #applyTheme(): void {
    const dark =
      this._themePref === "auto" ? Boolean(this.hass?.themes.darkMode) : this._themePref === "dark";
    this.setAttribute("theme", dark ? "dark" : "light");
  }

  #setTheme(pref: ThemePreference): void {
    this._themePref = pref;
    try {
      localStorage.setItem(THEME_KEY, pref);
    } catch {
      // Storage unavailable (private mode): the choice lasts for this session.
    }
  }

  #control(): AtriumLightControl | null {
    return this.renderRoot.querySelector("atrium-light-control");
  }

  #onToggle(ev: CustomEvent<{ entityId: string }>): void {
    void this.hass?.callService("light", "toggle", { entity_id: ev.detail.entityId });
  }

  #onMoreInfo(ev: CustomEvent<{ entityId: string }>): void {
    this.#control()?.show(ev.detail.entityId);
  }

  #report(): void {
    const hass = this.hass;
    if (this.#reported || !hass || !Object.keys(hass.entities).length) return;
    this.#reported = true;
    // What this client believes about every light: registry entry present, hidden flag, shown.
    const lights = Object.fromEntries(
      Object.keys(hass.states)
        .filter((id) => id.startsWith("light."))
        .map((id) => [
          id,
          {
            entry: id in hass.entities,
            hidden: hass.entities[id]?.hidden ?? null,
            shown: isAutoVisible(hass, id),
          },
        ]),
    );
    reportClient(hass, VERSION, { lights });
  }

  protected override render() {
    const t = this.#t;
    return html`
      <div class="wrap">
        <header>
          <button
            class="menu"
            type="button"
            aria-label=${t("menu.open")}
            ?hidden=${!this.narrow}
            @click=${() =>
              this.dispatchEvent(new CustomEvent("hass-toggle-menu", { bubbles: true, composed: true }))}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1>Atrium</h1>
          <div class="seg" role="group" aria-label=${t("theme.label")}>
            ${THEMES.map(
              (pref) =>
                html`<button
                  type="button"
                  data-theme=${pref}
                  aria-pressed=${String(this._themePref === pref)}
                  @click=${() => this.#setTheme(pref)}
                >
                  ${t(`theme.${pref}` as MessageKey)}
                </button>`,
            )}
          </div>
        </header>
        <atrium-home-page
          .store=${this.store}
          .t=${t}
          @atrium-toggle=${this.#onToggle}
          @atrium-more-info=${this.#onMoreInfo}
        ></atrium-home-page>
        <footer>Atrium ${VERSION}</footer>
      </div>
      <atrium-light-control
        .store=${this.store}
        .t=${t}
        .mode=${this.narrow ? "sheet" : "dialog"}
      ></atrium-light-control>
    `;
  }

  static override styles = [
    tokens,
    css`
      :host {
        display: block;
        min-height: 100vh;
        background: var(--a-bg);
        color: var(--a-text);
        font-family: var(--a-font);
        -webkit-tap-highlight-color: transparent;
      }
      .wrap {
        max-width: 1100px;
        margin: 0 auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      header {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      button {
        font-family: inherit;
        cursor: pointer;
      }
      button:focus-visible {
        outline: 2px solid var(--a-ocher);
        outline-offset: 2px;
      }
      .menu {
        width: 44px;
        height: 44px;
        border: 0;
        border-radius: var(--a-radius);
        background: var(--a-s1);
        color: var(--a-text);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .menu[hidden] {
        display: none;
      }
      h1 {
        margin: 0;
        font-size: 34px;
        font-weight: 600;
        letter-spacing: -0.03em;
        flex: 1;
      }
      .seg {
        display: flex;
        gap: 4px;
        background: var(--a-s1);
        border-radius: var(--a-radius);
        padding: 4px;
      }
      .seg button {
        height: 36px;
        padding: 0 12px;
        border: 0;
        border-radius: 4px;
        background: transparent;
        color: var(--a-text2);
        font-size: 13px;
        font-weight: 600;
      }
      .seg button[aria-pressed="true"] {
        background: var(--a-text);
        color: var(--a-bg);
      }
      footer {
        font-size: 12px;
        color: var(--a-text2);
      }
    `,
  ];
}
