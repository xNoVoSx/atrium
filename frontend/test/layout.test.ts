import { describe, expect, it } from "vitest";
import {
  applyOrder,
  favorites,
  hiddenEntities,
  homeModuleList,
  homeModules,
  moveBy,
  moveModule,
  setAreaHidden,
  setEntityHidden,
  setModuleEnabled,
  setOrder,
  toggleFavorite,
} from "../src/data/layout";

describe("home modules", () => {
  it("shows a calm home page by default", () => {
    expect(homeModules(undefined)).toEqual(["header", "status", "climate", "lights"]);
  });

  it("applies order and hidden modules, ignoring unknown ids", () => {
    expect(homeModules({ home: { order: ["rooms", "nope", "header"], hidden: ["scenes"] } })).toEqual([
      "rooms",
      "header",
      "status",
      "climate",
      "lights",
      "waste",
    ]);
  });

  it("switches modules on and off", () => {
    const on = setModuleEnabled({}, "rooms", true);
    expect(homeModules(on as Record<string, unknown>)).toContain("rooms");
    const off = setModuleEnabled(on as Record<string, unknown>, "climate", false);
    expect(homeModules(off as Record<string, unknown>)).not.toContain("climate");
  });

  it("moves a module up", () => {
    const moved = moveModule({}, "lights", -1) as Record<string, unknown>;
    expect(
      homeModuleList(moved)
        .map((m) => m.id)
        .slice(0, 4),
    ).toEqual(["header", "status", "lights", "climate"]);
  });
});

describe("hidden entities and areas", () => {
  it("adds and removes, without touching other keys", () => {
    const a = setEntityHidden({ order: { x: ["a"] } }, "light.a", true) as Record<string, unknown>;
    expect([...hiddenEntities(a)]).toEqual(["light.a"]);
    expect(a.order).toEqual({ x: ["a"] });
    expect([...hiddenEntities(setEntityHidden(a, "light.a", false) as Record<string, unknown>)]).toEqual([]);
  });

  it("hides areas", () => {
    expect(setAreaHidden({}, "garden", true).hiddenAreas).toEqual(["garden"]);
  });
});

describe("order", () => {
  it("keeps saved order, appends new ids, drops vanished ones", () => {
    expect(applyOrder(["a", "b", "c", "d"], ["c", "gone", "a"])).toEqual(["c", "a", "b", "d"]);
    expect(applyOrder(["a", "b"], undefined)).toEqual(["a", "b"]);
  });

  it("stores an order per list", () => {
    expect(setOrder({}, "lights:home", ["b", "a"]).order).toEqual({ "lights:home": ["b", "a"] });
  });

  it("moves by one step and stays in bounds", () => {
    expect(moveBy(["a", "b", "c"], "c", -1)).toEqual(["a", "c", "b"]);
    expect(moveBy(["a", "b", "c"], "a", -1)).toEqual(["a", "b", "c"]);
  });
});

describe("favourites", () => {
  it("toggles in the user's order", () => {
    const one = toggleFavorite({}, "light.a") as Record<string, unknown>;
    const two = toggleFavorite(one, "switch.b") as Record<string, unknown>;
    expect(favorites(two)).toEqual(["light.a", "switch.b"]);
    expect(favorites(toggleFavorite(two, "light.a") as Record<string, unknown>)).toEqual(["switch.b"]);
  });
});
