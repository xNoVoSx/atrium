// Look of all widgets: a flat tile with a heading, big numbers, bars, rows.
// Motion is scaled by --a-motion (1 = on, 0 = off), which the panel sets from
// the user's setting and prefers-reduced-motion.

import { css } from "lit";

export const widgetStyles = css`
  :host {
    display: block;
    font-family: var(--a-font);
    color: var(--a-text);
    min-width: 0;
  }
  .w {
    background: var(--a-s1);
    border-radius: var(--a-radius);
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    animation: w-in calc(var(--a-motion, 1) * 360ms) cubic-bezier(0.2, 0.9, 0.25, 1) both;
  }
  .w.plain {
    background: none;
    padding: 0;
  }
  @keyframes w-in {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .head .ico {
    width: 32px;
    height: 32px;
    flex: none;
    border-radius: var(--a-radius);
    background: var(--a-s3);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--a-text2);
  }
  .head h2 {
    margin: 0;
    flex: 1;
    min-width: 0;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--a-text2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .head .note {
    font-size: 12px;
    color: var(--a-text2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .demo-badge {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 10px;
    background: var(--a-s3);
    color: var(--a-text2);
    letter-spacing: 0.04em;
  }

  /* Big numbers */
  .summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
    gap: 8px;
  }
  .stat {
    all: unset;
    box-sizing: border-box;
    background: var(--a-s2);
    border-radius: var(--a-radius);
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    cursor: default;
  }
  .stat[data-entity] {
    cursor: pointer;
  }
  .stat .v {
    font-size: 26px;
    font-weight: 600;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .stat .v small {
    font-size: 13px;
    font-weight: 500;
    color: var(--a-text2);
    margin-left: 3px;
  }
  .stat .l {
    font-size: 12px;
    color: var(--a-text2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tone-ok .v {
    color: var(--a-ok-text, #7fb886);
  }
  .tone-warn .v {
    color: var(--a-ocher);
  }
  .tone-bad .v {
    color: var(--a-terra-text);
  }
  .tick {
    display: inline-block;
    animation: tick calc(var(--a-motion, 1) * 420ms) ease-out;
  }
  @keyframes tick {
    from {
      opacity: 0.2;
      transform: translateY(4px);
    }
  }

  /* Bars */
  .bar {
    height: 6px;
    border-radius: 3px;
    background: var(--a-s3);
    overflow: hidden;
  }
  .bar > span {
    display: block;
    height: 100%;
    border-radius: 3px;
    background: var(--a-sage);
    transform-origin: left;
    transition: width calc(var(--a-motion, 1) * 700ms) cubic-bezier(0.2, 0.9, 0.25, 1);
    animation: bar-in calc(var(--a-motion, 1) * 900ms) cubic-bezier(0.2, 0.9, 0.25, 1);
  }
  .bar.warn > span {
    background: var(--a-ocher);
  }
  .bar.bad > span {
    background: var(--a-terra);
  }
  .bar.active > span {
    background: var(--a-slate);
    background-image: linear-gradient(90deg, transparent 0, rgba(255, 255, 255, 0.25) 50%, transparent 100%);
    background-size: 200% 100%;
    animation:
      bar-in calc(var(--a-motion, 1) * 900ms) cubic-bezier(0.2, 0.9, 0.25, 1),
      shimmer calc(var(--a-motion, 1) * 2.2s) linear var(--a-iter, infinite);
  }
  @keyframes bar-in {
    from {
      transform: scaleX(0);
    }
  }
  @keyframes shimmer {
    from {
      background-position: 200% 0;
    }
    to {
      background-position: -200% 0;
    }
  }

  /* Groups (devices) */
  .groups {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 8px;
  }
  .group {
    background: var(--a-s2);
    border-radius: var(--a-radius);
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }
  .g-head {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .g-name {
    flex: 1;
    min-width: 0;
    font-weight: 600;
    font-size: 15px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .g-sub {
    font-size: 12px;
    color: var(--a-text3);
  }
  .metric {
    all: unset;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 4px 8px;
    font-size: 13px;
    cursor: default;
  }
  .metric[data-entity] {
    cursor: pointer;
  }
  .metric .ml {
    color: var(--a-text2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .metric .mv {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .metric .bar {
    grid-column: 1 / -1;
  }

  /* Status chip with dot */
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--a-text2);
    white-space: nowrap;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 4px;
    background: var(--a-text3);
    flex: none;
  }
  .dot.ok {
    background: #6fae77;
  }
  .dot.warn {
    background: var(--a-ocher);
  }
  .dot.bad {
    background: var(--a-terra);
    animation: pulse calc(var(--a-motion, 1) * 1.6s) ease-in-out var(--a-iter, infinite);
  }
  .dot.active,
  .dot.info {
    background: var(--a-slate);
  }
  .dot.active {
    animation: pulse calc(var(--a-motion, 1) * 1.6s) ease-in-out var(--a-iter, infinite);
  }
  @keyframes pulse {
    50% {
      box-shadow: 0 0 0 4px transparent;
      opacity: 0.45;
    }
  }

  /* Rows */
  .rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .row {
    all: unset;
    box-sizing: border-box;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 4px 10px;
    min-height: 48px;
    padding: 6px 10px 6px 12px;
    border-radius: var(--a-radius);
    background: var(--a-s2);
    cursor: default;
  }
  .row[data-entity] {
    cursor: pointer;
  }
  .row .rn {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .row .rn b {
    font-size: 14px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row .rn small {
    font-size: 12px;
    color: var(--a-text3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row .rv {
    font-size: 13px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .row .bar {
    grid-column: 2 / -1;
  }

  /* Switches */
  .toggles {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .pill {
    all: unset;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-height: 40px;
    padding: 0 6px 0 14px;
    border-radius: 20px;
    background: var(--a-s2);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
  .pill:focus-visible,
  .stat:focus-visible,
  .row:focus-visible,
  .metric:focus-visible {
    outline: 2px solid var(--a-ocher);
    outline-offset: 2px;
  }
  .knob {
    width: 40px;
    height: 26px;
    border-radius: 13px;
    background: var(--a-s3);
    position: relative;
    flex: none;
    transition: background-color calc(var(--a-motion, 1) * 200ms) ease;
  }
  .knob::after {
    content: "";
    position: absolute;
    top: 3px;
    left: 3px;
    width: 20px;
    height: 20px;
    border-radius: 10px;
    background: var(--a-text2);
    transition: transform calc(var(--a-motion, 1) * 220ms) cubic-bezier(0.3, 1.4, 0.5, 1);
  }
  .on .knob {
    background: var(--a-ocher);
  }
  .on .knob::after {
    transform: translateX(14px);
    background: var(--a-on-ocher);
  }
  .empty {
    font-size: 13px;
    color: var(--a-text3);
    margin: 0;
  }
  .missing {
    border: 1px dashed var(--a-s3);
    background: none;
  }
`;
