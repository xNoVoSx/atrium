import { describe, expect, it } from "vitest";
import "../src/main";

const ELEMENTS = ["atrium-panel", "atrium-home-page", "atrium-light-tile", "atrium-light-control"];

describe("custom elements", () => {
  // Browsers refuse createElement when a constructor touches attributes or children.
  it.each(ELEMENTS)("%s can be created with createElement", (name) => {
    const el = document.createElement(name);
    expect(el.constructor).toBe(customElements.get(name));
    expect(el.attributes.length).toBe(0);
  });

  it("the panel renders without hass", async () => {
    const panel = document.createElement("atrium-panel") as HTMLElement & {
      updateComplete: Promise<boolean>;
    };
    document.body.append(panel);
    await panel.updateComplete;
    expect(panel.shadowRoot?.querySelector("h1")?.textContent).toBe("Atrium");
    panel.remove();
  });
});
