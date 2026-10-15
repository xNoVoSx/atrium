import { describe, expect, it } from "vitest";
import { ELEMENTS } from "../src/main";

describe("custom elements", () => {
  // Browsers refuse createElement when a constructor touches attributes or children.
  it.each(ELEMENTS.map(([name]) => name))("%s can be created with createElement", (name) => {
    const el = document.createElement(name);
    expect(el.constructor).toBe(customElements.get(name));
    expect(el.attributes.length).toBe(0);
  });

  it("the panel renders its shell without hass", async () => {
    const panel = document.createElement("atrium-panel") as HTMLElement & {
      updateComplete: Promise<boolean>;
    };
    document.body.append(panel);
    await panel.updateComplete;
    const root = panel.shadowRoot;
    expect(root?.querySelector("nav .brand")?.textContent).toContain("Atrium");
    expect(root?.querySelector("atrium-home-page")).not.toBeNull();
    panel.remove();
  });
});
