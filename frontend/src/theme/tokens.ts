// Design tokens of style C ("Kachel"). Components only use these variables,
// so a theme is just another set of values on the panel host.

import { css } from "lit";

export type ThemePreference = "auto" | "dark" | "light";

export const tokens = css`
  :host {
    --a-radius: 6px;
    --a-font: "Space Grotesk", system-ui, -apple-system, "Segoe UI", sans-serif;
    --a-ocher: #e2b866;
    --a-on-ocher: #2a1e05;
    --a-slate: #4a6d8f;
    --a-sage: #5e7f63;
    --a-terra: #a4533a;
  }
  :host([theme="dark"]) {
    --a-bg: #121416;
    --a-s1: #1c1f22;
    --a-s2: #25292d;
    --a-s3: #30353a;
    --a-text: #ecedea;
    --a-text2: #a9aeb3;
    --a-text3: #7e848a;
    --a-scrim: rgba(0, 0, 0, 0.6);
    color-scheme: dark;
  }
  :host([theme="light"]) {
    --a-bg: #e4e6e3;
    --a-s1: #f5f6f4;
    --a-s2: #eceeeb;
    --a-s3: #dcdfda;
    --a-text: #1e2022;
    --a-text2: #50555b;
    --a-text3: #6b7076;
    --a-scrim: rgba(30, 32, 34, 0.55);
    color-scheme: light;
  }
`;
