import { LitElement, css, html, nothing, svg } from "lit";
import type { LiveEnergy } from "../data/energy";
import type { Translate } from "../i18n";

/**
 * The live energy flow as an animated diagram; used by the energy page and
 * the energy-flow widget. Dots move faster with more power.
 */
export class AtriumEnergyFlow extends LitElement {
  static override properties = {
    live: { attribute: false },
    t: { attribute: false },
    locale: {},
    narrow: { type: Boolean },
  };

  declare live: LiveEnergy | null;
  declare t: Translate;
  declare locale: string;
  declare narrow: boolean;

  constructor() {
    super();
    this.live = null;
    this.locale = "en";
    this.narrow = false;
  }

  #fmt(n: number | null, digits = 1, unit = ""): string {
    if (n === null || Number.isNaN(n)) return "—";
    const s = new Intl.NumberFormat(this.locale, {
      maximumFractionDigits: digits,
      minimumFractionDigits: 0,
    }).format(n);
    return unit ? `${s} ${unit}` : s;
  }

  /**
   * Energy flow: PV strings -> inverter -> house -> consumers. When the
   * measured consumers need more than the sun gives, the difference must come
   * from the grid; without a grid meter that is shown as a minimum.
   */
  protected override render() {
    const live = this.live;
    if (!live) return nothing;
    const { t, narrow } = this;
    const W = narrow ? 400 : 680;
    const strings = live.strings.slice(0, 4);
    const active = live.consumers.filter((c) => (c.watts ?? 0) >= 1);
    const max = narrow ? 4 : 6;
    const shown = active.length > max ? active.slice(0, max - 1) : active;
    const rest = active.slice(shown.length);
    const items = [
      ...shown.map((c) => ({ name: c.name, w: c.watts ?? 0 })),
      ...(rest.length
        ? [{ name: `+${rest.length} ${t("energy.more")}`, w: rest.reduce((s, c) => s + (c.watts ?? 0), 0) }]
        : []),
    ];
    const consumersW = active.reduce((s, c) => s + (c.watts ?? 0), 0);
    const ac = live.ac ?? 0;
    const gridMin = consumersW - ac > 1 ? consumersW - ac : 0;

    const rowH = 56;
    const rows = Math.max(strings.length, items.length, 2);
    const top = 10;
    const bodyH = rows * rowH;
    const H = top + bodyH + (gridMin ? 84 : 10);
    const midY = top + bodyH / 2;
    const rowY = (i: number, n: number) => top + (bodyH / n) * (i + 0.5);

    const pv = { x: 0, w: narrow ? 72 : 96 };
    const inv = { x: narrow ? 100 : 160, w: narrow ? 76 : 104 };
    const house = { x: narrow ? 238 : 360, r: 30 };
    const cons = { x: narrow ? 300 : 470, w: W - (narrow ? 300 : 470) };
    const nameLen = narrow ? 11 : 22;
    const clip = (s: string) => (s.length > nameLen ? `${s.slice(0, nameLen - 1)}…` : s);
    // Dots move faster with more power.
    const speed = (w: number | null) => (w && w > 1 ? Math.max(0.35, 3 - Math.log10(w)) : 0);
    const line = (d: string, w: number | null, cls: string) =>
      svg`<path d=${d} class="flow ${cls} ${w && w > 1 ? "on" : ""}" style="animation-duration: ${speed(w)}s" />`;

    return html`<svg viewBox="0 0 ${W} ${H}" class="flowchart" role="img" aria-label=${t("energy.flow")}>
      ${strings.map((s, i) => {
        const y = rowY(i, strings.length);
        return svg`${line(`M${pv.x + pv.w} ${y} C${pv.x + pv.w + 30} ${y} ${inv.x - 30} ${midY} ${inv.x} ${midY}`, s.watts, "pv")}
          <rect x=${pv.x} y=${y - 22} width=${pv.w} height="44" rx="8" class="node" />
          <text x=${pv.x + pv.w / 2} y=${y - 1} class="v">${this.#fmt(s.watts, 0, "W")}</text>
          <text x=${pv.x + pv.w / 2} y=${y + 15} class="n">PV${i + 1}</text>`;
      })}
      ${line(`M${inv.x + inv.w} ${midY} L${house.x - house.r} ${midY}`, live.ac, "ac")}
      ${items.map((c, i) => {
        const y = rowY(i, items.length);
        return svg`${line(`M${house.x + house.r} ${midY} C${house.x + house.r + 30} ${midY} ${cons.x - 30} ${y} ${cons.x} ${y}`, c.w, "load")}
          <rect x=${cons.x} y=${y - 22} width=${cons.w} height="44" rx="8" class="node" />
          <text x=${cons.x + 10} y=${y - 2} class="v left">${this.#fmt(c.w, 0, "W")}</text>
          <text x=${cons.x + 10} y=${y + 14} class="n left">${clip(c.name)}</text>`;
      })}
      ${
        gridMin
          ? svg`${line(`M${house.x} ${H - 52} L${house.x} ${midY + house.r}`, gridMin, "grid")}
          <rect x=${house.x - 60} y=${H - 52} width="120" height="44" rx="8" class="node grid" />
          <text x=${house.x} y=${H - 32} class="v light">≥ ${this.#fmt(gridMin, 0, "W")}</text>
          <text x=${house.x} y=${H - 16} class="n light">${t("energy.grid")}</text>`
          : nothing
      }
      <rect x=${inv.x} y=${midY - 30} width=${inv.w} height="60" rx="8" class="node" />
      <text x=${inv.x + inv.w / 2} y=${midY - 4} class="v">${this.#fmt(live.ac, 0, "W")}</text>
      <text x=${inv.x + inv.w / 2} y=${midY + 14} class="n">
        ${t("energy.inverter_short")}
        ${live.efficiency !== null ? this.#fmt(live.efficiency * 100, 0, "%") : ""}
      </text>
      <circle cx=${house.x} cy=${midY} r=${house.r} class="house" />
      <path
        d="M${house.x - 11} ${midY + 9} V${midY - 2} L${house.x} ${midY - 11} L${house.x + 11} ${midY - 2} V${midY + 9} Z"
        class="house-icon"
      />
    </svg>`;
  }
  static override styles = css`
    :host {
      display: block;
    }
    .flowchart .left {
      text-anchor: start;
    }
    .node.grid {
      fill: var(--a-terra);
    }
    .flow.load.on {
      stroke: var(--a-slate);
    }
    .flow.grid.on {
      stroke: var(--a-terra);
    }
    .house {
      fill: var(--a-ocher);
    }
    .house-icon {
      fill: none;
      stroke: var(--a-on-ocher);
      stroke-width: 2;
      stroke-linejoin: round;
    }
    .flowchart {
      width: 100%;
      height: auto;
    }
    .node {
      fill: var(--a-s3);
    }
    .node.out {
      fill: var(--a-sage);
    }
    .flowchart text {
      text-anchor: middle;
      font-family: var(--a-font);
      fill: var(--a-text);
    }
    .flowchart .v {
      font-size: 16px;
      font-weight: 600;
    }
    .flowchart .v.small {
      font-size: 13px;
    }
    .flowchart .n {
      font-size: 12px;
      fill: var(--a-text2);
    }
    .flowchart .light {
      fill: #fff;
    }
    .flow {
      fill: none;
      stroke: var(--a-s3);
      stroke-width: 3;
      stroke-linecap: round;
    }
    .flow.on {
      stroke-dasharray: 2 10;
      animation: dash linear var(--a-iter, infinite);
    }
    .flow.pv.on {
      stroke: var(--a-ocher);
    }
    .flow.ac.on {
      stroke: var(--a-sage);
    }
    @keyframes dash {
      to {
        stroke-dashoffset: -24;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .flow.on {
        animation: none;
      }
    }
  `;
}
