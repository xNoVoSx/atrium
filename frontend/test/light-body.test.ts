import { describe, expect, it, vi } from "vitest";
import "../src/main";
import type { AtriumLightBody } from "../src/components/light-body";
import { EntityStore } from "../src/data/entity-store";
import { translator } from "../src/i18n";
import { fakeHass, state } from "./fixtures";

async function mount(attrs: Record<string, unknown>) {
  const calls: unknown[][] = [];
  const base = fakeHass();
  const hass = {
    ...base,
    states: {
      ...base.states,
      "light.color": state("light.color", "on", { friendly_name: "Color", brightness: 200, ...attrs }),
    },
    callService: vi.fn(async (...args: unknown[]) => {
      calls.push(args);
    }),
  };
  const store = new EntityStore();
  store.update(hass);
  const el = document.createElement("atrium-light-body") as AtriumLightBody;
  el.store = store;
  el.t = translator("en");
  el.entityId = "light.color";
  document.body.append(el);
  await el.updateComplete;
  return { el, calls };
}

describe("light control", () => {
  it("offers colour temperature and colour when the light supports them", async () => {
    const { el, calls } = await mount({
      supported_color_modes: ["color_temp", "hs"],
      color_mode: "hs",
      hs_color: [120, 90],
      min_color_temp_kelvin: 2200,
      max_color_temp_kelvin: 6500,
      color_temp_kelvin: 3000,
    });
    const root = el.shadowRoot;
    expect(root?.querySelector(".slider.temp")).not.toBeNull();
    expect(root?.querySelectorAll(".swatch").length).toBe(8);
    expect(root?.querySelector(".swatch.active")?.getAttribute("aria-label")).toBe("120°");
    (root?.querySelectorAll(".swatch")[0] as HTMLButtonElement).click();
    expect(calls.at(-1)).toEqual(["light", "turn_on", { entity_id: "light.color", hs_color: [0, 90] }]);
    const warm = [...(root?.querySelectorAll(".choices button") ?? [])].find(
      (b) => b.textContent?.trim() === "Warm",
    ) as HTMLButtonElement;
    warm.click();
    expect(calls.at(-1)).toEqual(["light", "turn_on", { entity_id: "light.color", color_temp_kelvin: 2700 }]);
    el.remove();
  });

  it("shows neither for a plain dimmer", async () => {
    const { el } = await mount({ supported_color_modes: ["brightness"] });
    expect(el.shadowRoot?.querySelector(".slider.temp")).toBeNull();
    expect(el.shadowRoot?.querySelector(".swatch")).toBeNull();
    el.remove();
  });
});
