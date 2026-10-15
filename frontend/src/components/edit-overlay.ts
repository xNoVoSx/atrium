// Star (favourite) and eye (hide in Atrium) on a tile in edit mode.

import { css, html, nothing } from "lit";
import type { Translate } from "../i18n";

const STAR = "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z";
const EYE = "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z";
const EYE_OFF =
  "M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6";

export interface EditState {
  editing: boolean;
  favorite: boolean;
  hidden: boolean;
  canHide: boolean;
}

function emit(el: HTMLElement, type: string, entityId: string) {
  el.dispatchEvent(new CustomEvent(type, { detail: { entityId }, bubbles: true, composed: true }));
}

export function editOverlay(host: HTMLElement, entityId: string, state: EditState, t: Translate) {
  if (!state.editing) return nothing;
  const svgIcon = (path: string, filled: boolean) =>
    html`<svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill=${filled ? "currentColor" : "none"}
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d=${path} />
    </svg>`;
  return html`<span class="edit-actions">
    <button
      type="button"
      class="edit-action ${state.favorite ? "active" : ""}"
      aria-pressed=${String(state.favorite)}
      aria-label=${t("edit.favorite")}
      @click=${(ev: Event) => {
        ev.stopPropagation();
        emit(host, "atrium-favorite", entityId);
      }}
    >
      ${svgIcon(STAR, state.favorite)}
    </button>
    ${
      state.canHide
        ? html`<button
            type="button"
            class="edit-action ${state.hidden ? "active" : ""}"
            aria-pressed=${String(state.hidden)}
            aria-label=${t("edit.hide")}
            @click=${(ev: Event) => {
              ev.stopPropagation();
              emit(host, "atrium-hide", entityId);
            }}
          >
            ${svgIcon(state.hidden ? EYE_OFF : EYE, false)}
          </button>`
        : nothing
    }
  </span>`;
}

export const editStyles = css`
  :host {
    position: relative;
  }
  :host([editing]) {
    cursor: grab;
  }
  :host([editing]) button.tile {
    pointer-events: none;
  }
  :host([atrium-hidden]) button.tile {
    opacity: 0.4;
  }
  :host(.dragging) {
    z-index: 3;
    cursor: grabbing;
    filter: drop-shadow(0 12px 24px rgba(0, 0, 0, 0.35));
  }
  :host([editing]) button.tile {
    padding-right: 88px;
  }
  .edit-actions {
    position: absolute;
    top: 50%;
    right: 8px;
    transform: translateY(-50%);
    display: flex;
    gap: 6px;
  }
  .edit-action {
    all: unset;
    box-sizing: border-box;
    width: 32px;
    height: 32px;
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    background: var(--a-s3);
    color: var(--a-text2);
  }
  .edit-action.active {
    background: var(--a-ocher);
    color: var(--a-on-ocher);
  }
  .edit-action:focus-visible {
    outline: 2px solid var(--a-ocher);
    outline-offset: 2px;
  }
`;
