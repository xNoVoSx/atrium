// Styles shared by pages and modules.

import { css } from "lit";

export const shared = css`
  :host {
    font-family: var(--a-font);
    color: var(--a-text);
  }
  .label {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--a-text2);
  }
  button {
    font-family: inherit;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  button:focus-visible,
  a:focus-visible {
    outline: 2px solid var(--a-ocher);
    outline-offset: 2px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 10px;
  }
  @media (max-width: 600px) {
    .grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
`;

export const ICONS = {
  home: "M3 11l9-7 9 7v10H3z",
  rooms: "M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z",
  categories: "M4 6h16M4 12h16M4 18h10",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  back: "M15 6l-6 6 6 6",
  door: "M3 21V9l9-5 9 5v12M7 21v-8h10v8M7 16h10",
  battery: "M3 8h15v8H3zM18 11h3v2h-3M6 11h4",
  play: "M7 5l12 7-12 7z",
  minus: "M5 12h14",
  plus: "M12 5v14M5 12h14",
  thermo: "M10 14V5a2 2 0 1 1 4 0v9a4 4 0 1 1-4 0z",
  refresh: "M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5",
  close: "M6 6l12 12M18 6L6 18",
  next: "M9 6l6 6-6 6",
  power: "M12 3v9M6.3 7.3a8 8 0 1 0 11.4 0",
  media: "M7 5l12 7-12 7z",
  window: "M4 4h16v16H4zM12 4v16M4 12h16",
  motion: "M13 4a2 2 0 1 1 0 .01M9 21l3-6 3 3v3M7 12l3-3 3 1 2 3h3",
  sensor: "M12 3v12M8 7h8M7 21h10",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6",
} as const;
