// Frames every widget can be drawn in. They work by overriding the design
// tokens on the widget's slot, so they reach into every widget without each
// widget knowing about them.

import { css } from "lit";
import type { MessageKey } from "../i18n";

export const SKINS: Array<[string, MessageKey]> = [
  ["standard", "skin.standard"],
  ["outline", "skin.outline"],
  ["raised", "skin.raised"],
  ["flat", "skin.flat"],
  ["accent", "skin.accent"],
  ["tinted", "skin.tinted"],
  ["contrast", "skin.contrast"],
];

/** For the element that wraps one widget (class skin-<id>). */
export const skinStyles = css`
  .skin-outline {
    --a-s1: transparent;
    border: 1.5px solid var(--a-s3);
    border-radius: calc(var(--a-radius) + 4px);
    padding: 4px;
  }
  .skin-raised {
    --a-s1: var(--a-s2);
    --a-s2: var(--a-s3);
    border-radius: var(--a-radius);
    box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.12),
      0 8px 24px rgba(0, 0, 0, 0.18);
  }
  .skin-flat {
    --a-s1: transparent;
  }
  .skin-accent {
    border-left: 4px solid var(--a-ocher);
    border-radius: var(--a-radius);
    padding-left: 6px;
  }
  .skin-tinted,
  .skin-contrast {
    background: var(--a-s1);
    border-radius: calc(var(--a-radius) + 4px);
    padding: 10px;
  }
  .skin-tinted {
    --a-s1: color-mix(in srgb, var(--a-ocher) 14%, var(--a-bg));
    --a-s2: color-mix(in srgb, var(--a-ocher) 22%, var(--a-bg));
    --a-s3: color-mix(in srgb, var(--a-ocher) 32%, var(--a-bg));
  }
  .skin-contrast {
    --a-s1: var(--a-panel);
    --a-s2: var(--a-panel2);
    --a-s3: color-mix(in srgb, var(--a-panel2) 70%, #ffffff);
    --a-text: var(--a-on-panel);
    --a-text2: var(--a-on-panel2);
    --a-text3: var(--a-on-panel2);
    color: var(--a-on-panel);
  }
`;
