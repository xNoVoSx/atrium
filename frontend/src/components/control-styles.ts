// Shared look of the controls inside the sheet.

import { css } from "lit";

export const controlStyles = css`
  :host {
    display: flex;
    flex-direction: column;
    gap: 18px;
    font-family: var(--a-font);
    color: var(--a-text);
  }
  button {
    font-family: inherit;
    cursor: pointer;
  }
  button:focus-visible {
    outline: 2px solid var(--a-ocher);
    outline-offset: 2px;
  }
  .top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
  }
  .label {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--a-text2);
  }
  .title {
    font-size: 22px;
    font-weight: 600;
    margin-top: 2px;
  }
  .close {
    flex: none;
    width: 44px;
    height: 44px;
    border: 0;
    border-radius: 22px;
    background: var(--a-s3);
    color: var(--a-text);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .big {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
  }
  .value {
    font-size: 88px;
    font-weight: 600;
    letter-spacing: -0.05em;
    line-height: 0.85;
    font-variant-numeric: tabular-nums;
  }
  .value small {
    font-size: 36px;
    letter-spacing: 0;
  }
  .choices {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(72px, 1fr));
    gap: 8px;
  }
  .choices button {
    min-height: 52px;
    border: 0;
    border-radius: var(--a-radius);
    background: var(--a-s3);
    color: var(--a-text);
    font-size: 14px;
    font-weight: 600;
  }
  .choices button[aria-pressed="true"] {
    background: var(--a-text);
    color: var(--a-bg);
  }
  .sub {
    font-size: 14px;
    color: var(--a-text2);
  }
`;
