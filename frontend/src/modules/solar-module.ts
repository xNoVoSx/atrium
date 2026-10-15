import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import { icon } from "../components/icon";
import type { PanelContext } from "../context";
import { energyConfig, fetchDaily, liveEnergy } from "../data/energy";
import { SelectorController } from "../data/entity-store";
import { localDate } from "../data/home";
import { shared } from "../theme/shared";

const SUN =
  "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4";
const REFRESH_MS = 5 * 60 * 1000;

/** One sage row on the home page: solar power now and today's yield; opens the energy page. */
export class AtriumSolarModule extends LitElement {
  static override properties = { ctx: { attribute: false }, _today: { state: true } };

  declare ctx: PanelContext;
  declare _today: number | null;

  #timer: ReturnType<typeof setInterval> | undefined;
  #totalId: string | undefined;

  #live = new SelectorController(
    this,
    () => this.ctx?.store,
    (hass) => {
      const cfg = energyConfig(hass, this.ctx.layout);
      if (!cfg.acPower && !cfg.pvPower?.length) return null;
      const ac = liveEnergy(hass, cfg).ac;
      return { ac: ac === null ? null : Math.round(ac), total: cfg.energyTotal };
    },
  );

  constructor() {
    super();
    this._today = null;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.#timer = setInterval(() => void this.#loadToday(), REFRESH_MS);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearInterval(this.#timer);
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    this.#live.attach();
    if (changed.has("ctx")) this.#live.refresh();
    const total = this.#live.value?.total;
    if (total !== this.#totalId) {
      this.#totalId = total;
      void this.#loadToday();
    }
  }

  async #loadToday(): Promise<void> {
    const hass = this.ctx?.store.hass;
    if (!hass || !this.#totalId) return;
    const now = new Date();
    try {
      const days = await fetchDaily(
        hass,
        this.#totalId,
        new Date(now.getFullYear(), now.getMonth(), now.getDate()),
      );
      this._today = days.find((d) => d.date === localDate(now))?.kwh ?? 0;
    } catch {
      this._today = null;
    }
  }

  protected override render() {
    const live = this.#live.value;
    if (!live) return nothing;
    const { t, locale, navigate } = this.ctx;
    const fmt = (n: number, d: number) =>
      new Intl.NumberFormat(locale, { maximumFractionDigits: d }).format(n);
    return html`<button type="button" @click=${() => navigate({ page: "category", category: "energy" })}>
      ${icon(SUN, 26, 1.8)}
      <span class="text">
        <span class="title">${t("module.solar")} · ${live.ac === null ? "—" : `${fmt(live.ac, 0)} W`}</span>
        ${
          this._today !== null
            ? html`<span class="sub">${fmt(this._today, 2)} kWh ${t("energy.today").toLowerCase()}</span>`
            : nothing
        }
      </span>
    </button>`;
  }

  static override styles = [
    shared,
    css`
      :host {
        display: block;
      }
      button {
        all: unset;
        box-sizing: border-box;
        width: 100%;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 14px 16px;
        border-radius: var(--a-radius);
        background: var(--a-sage);
        color: #fff;
        font-family: var(--a-font);
      }
      button:focus-visible {
        outline: 2px solid var(--a-ocher);
        outline-offset: 2px;
      }
      .text {
        display: flex;
        flex-direction: column;
      }
      .title {
        font-size: 17px;
        font-weight: 600;
      }
      .sub {
        font-size: 13px;
      }
    `,
  ];
}
