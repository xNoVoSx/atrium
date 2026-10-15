// Design tokens of style C ("Kachel"). Components only use these variables,
// so a theme is just another set of values on the panel host.

import { css } from "lit";

export type ThemePreference = "auto" | "dark" | "light";

export const tokens = css`
  :host {
    --a-radius: 8px;
    --a-font: "Space Grotesk", system-ui, -apple-system, "Segoe UI", sans-serif;
    --a-ocher: #e2b866;
    --a-on-ocher: #2a1e05;
    --a-slate: #4a6d8f;
    /* Sage, darkened from #5E7F63 so white text reaches WCAG AA. */
    --a-sage: #557459;
    --a-terra: #a4533a;
  }
  :host([theme="dark"]) {
    /* Style B "Kachel klar": separation by surface steps, no outlines. */
    --a-bg: #0f1113;
    --a-s1: #23272b;
    --a-s2: #2a2f34;
    --a-s3: #343a40;
    --a-text: #ecedea;
    --a-text2: #a9aeb3;
    --a-text3: #7e848a;
    --a-scrim: rgba(0, 0, 0, 0.6);
    --a-panel: #262b30;
    --a-panel2: #343a40;
    --a-on-panel: #ecedea;
    --a-on-panel2: #a9aeb3;
    --a-nav: #0b0c0d;
    --a-nav-line: #1e2124;
    --a-on-nav: #a9aeb3;
    --a-terra-text: #e8957a;
    color-scheme: dark;
  }
  :host([theme="light"]) {
    --a-bg: #dfe2de;
    --a-s1: #f5f6f4;
    --a-s2: #eceeeb;
    --a-s3: #d6dad5;
    --a-text: #1e2022;
    --a-text2: #50555b;
    --a-text3: #6b7076;
    --a-scrim: rgba(30, 32, 34, 0.55);
    --a-panel: #2b2d2f;
    --a-panel2: #3a3d40;
    --a-on-panel: #f2f2f0;
    --a-on-panel2: #b7bbbf;
    --a-nav: #1e2022;
    --a-nav-line: #1e2022;
    --a-on-nav: #b7bbbf;
    --a-terra-text: #a4533a;
    color-scheme: light;
  }
`;

/** Accent colours a user can pick; "on" is the text colour on the accent. */
export const ACCENTS: Record<string, { accent: string; on: string }> = {
  ocher: { accent: "#e2b866", on: "#2a1e05" },
  sage: { accent: "#8fbf95", on: "#0f2412" },
  slate: { accent: "#8fb3d6", on: "#0b1a28" },
  terra: { accent: "#e09a7c", on: "#2a1008" },
  lavender: { accent: "#bfaee6", on: "#1c1230" },
  mint: { accent: "#82cdb9", on: "#06231c" },
};

export const DENSITIES = ["compact", "normal", "large"] as const;
export type Density = (typeof DENSITIES)[number];
