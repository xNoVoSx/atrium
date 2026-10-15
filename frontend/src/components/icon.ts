import { html } from "lit";

/** Inline stroke icon (24×24 viewBox) in the current text colour. */
export const icon = (path: string, size = 22, width = 1.8) =>
  html`<svg
    width=${size}
    height=${size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width=${width}
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d=${path} />
  </svg>`;
