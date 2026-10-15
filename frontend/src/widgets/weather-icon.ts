// Animated weather icons: the sun turns slowly, clouds drift, rain and snow
// fall, lightning flashes. All motion scales with --a-motion.

import { css, svg } from "lit";

const SUN = svg`<g class="sun"><circle cx="12" cy="12" r="4.2" />
  <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" /></g>`;
const SMALL_SUN = svg`<g class="sun small"><circle cx="8" cy="8" r="3" />
  <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" /></g>`;
const CLOUD = svg`<path class="cloud" d="M7 19a4 4 0 1 1 .6-8A5.5 5.5 0 0 1 18 12a3.5 3.5 0 0 1-.5 7z" />`;
const MOON = svg`<path class="moon" d="M15 4a8 8 0 1 0 5 13A7 7 0 0 1 15 4z" />`;
const drops = (cls: string) => svg`<g class=${cls}><path d="M9 20.5v2M13 20.5v2M17 20.5v2" /></g>`;

export function weatherIcon(condition: string) {
  const c = condition;
  const body =
    c === "sunny"
      ? SUN
      : c === "clear-night"
        ? svg`${MOON}<g class="stars"><path d="M5 4v.01M8 2v.01M4 9v.01" /></g>`
        : c === "partlycloudy"
          ? svg`${SMALL_SUN}${CLOUD}`
          : c === "rainy" || c === "pouring"
            ? svg`${CLOUD}${drops("rain")}`
            : c === "snowy" || c === "snowy-rainy"
              ? svg`${CLOUD}${drops("snow")}`
              : c === "lightning" || c === "lightning-rainy"
                ? svg`${CLOUD}<path class="bolt" d="M12 14l-2 4h3l-2 4" />`
                : c === "fog"
                  ? svg`<g class="fog"><path d="M4 9h16M3 13h18M5 17h14" /></g>`
                  : c === "windy" || c === "windy-variant"
                    ? svg`<g class="fog"><path d="M3 9h11a2.5 2.5 0 1 0-2.5-2.5M3 13h15a2.5 2.5 0 1 1-2.5 2.5M3 17h8" /></g>`
                    : CLOUD;
  return svg`<svg class="wx" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export const weatherIconStyles = css`
  .wx {
    overflow: visible;
  }
  .wx .sun {
    color: var(--a-ocher);
    transform-origin: 12px 12px;
    animation: wx-spin calc(var(--a-motion, 1) * 24s) linear var(--a-iter, infinite);
  }
  .wx .sun.small {
    transform-origin: 8px 8px;
  }
  .wx .cloud {
    animation: wx-drift calc(var(--a-motion, 1) * 6s) ease-in-out var(--a-iter, infinite) alternate;
  }
  .wx .moon {
    color: var(--a-ocher);
  }
  .wx .stars {
    animation: wx-twinkle calc(var(--a-motion, 1) * 2.4s) ease-in-out var(--a-iter, infinite);
  }
  .wx .rain path,
  .wx .snow path {
    animation: wx-fall calc(var(--a-motion, 1) * 1.1s) linear var(--a-iter, infinite);
  }
  .wx .snow path {
    stroke-dasharray: 0.1 2;
    animation-duration: calc(var(--a-motion, 1) * 2.4s);
  }
  .wx .rain path:nth-child(2),
  .wx .snow path:nth-child(2) {
    animation-delay: -0.4s;
  }
  .wx .rain path:nth-child(3),
  .wx .snow path:nth-child(3) {
    animation-delay: -0.75s;
  }
  .wx .bolt {
    color: var(--a-ocher);
    animation: wx-flash calc(var(--a-motion, 1) * 3s) steps(1) var(--a-iter, infinite);
  }
  .wx .fog {
    animation: wx-drift calc(var(--a-motion, 1) * 4s) ease-in-out var(--a-iter, infinite) alternate;
  }
  @keyframes wx-spin {
    to {
      transform: rotate(360deg);
    }
  }
  @keyframes wx-drift {
    from {
      transform: translateX(-0.8px);
    }
    to {
      transform: translateX(0.8px);
    }
  }
  @keyframes wx-fall {
    from {
      transform: translateY(-3px);
      opacity: 0;
    }
    30% {
      opacity: 1;
    }
    to {
      transform: translateY(2px);
      opacity: 0;
    }
  }
  @keyframes wx-flash {
    0%,
    86% {
      opacity: 1;
    }
    88% {
      opacity: 0.2;
    }
    90% {
      opacity: 1;
    }
    92% {
      opacity: 0.2;
    }
  }
  @keyframes wx-twinkle {
    50% {
      opacity: 0.3;
    }
  }
`;
