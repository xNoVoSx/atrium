import { describe, expect, it } from "vitest";
import { areaIdOf, brightnessPct, groupByArea, isAutoVisible, isDimmable } from "../src/data/registry";
import { fakeHass, state } from "./fixtures";

describe("isAutoVisible", () => {
  const hass = fakeHass();

  it("hides entities hidden in the registry (e.g. members of a group helper)", () => {
    expect(isAutoVisible(hass, "light.member_1")).toBe(false);
  });

  it("hides config and diagnostic entities", () => {
    expect(isAutoVisible(hass, "light.status_led")).toBe(false);
  });

  it("shows group helpers and normal entities", () => {
    expect(isAutoVisible(hass, "light.group")).toBe(true);
    expect(isAutoVisible(hass, "light.hall")).toBe(true);
  });

  it("shows entities without a registry entry", () => {
    expect(isAutoVisible(hass, "light.not_in_registry")).toBe(true);
  });
});

describe("areaIdOf", () => {
  const hass = fakeHass();

  it("prefers the entity's own area", () => {
    expect(areaIdOf(hass, "light.group")).toBe("office");
  });

  it("falls back to the device's area", () => {
    expect(areaIdOf(hass, "light.hall")).toBe("hall");
  });

  it("is null without area or device", () => {
    expect(areaIdOf(hass, "light.loose")).toBeNull();
  });
});

describe("groupByArea", () => {
  it("groups visible lights by area, sorted by area name, no-area last", () => {
    expect(groupByArea(fakeHass(), "light")).toEqual([
      { areaId: "hall", entityIds: ["light.hall"] },
      { areaId: "office", entityIds: ["light.group"] },
      { areaId: null, entityIds: ["light.loose"] },
    ]);
  });
});

describe("light helpers", () => {
  it("treats on/off-only lights as not dimmable", () => {
    expect(isDimmable(state("light.a", "on", { supported_color_modes: ["onoff"] }))).toBe(false);
    expect(isDimmable(state("light.a", "on", { supported_color_modes: ["brightness"] }))).toBe(true);
    expect(isDimmable(state("light.a", "on", {}))).toBe(false);
  });

  it("converts brightness to percent only while on", () => {
    expect(brightnessPct(state("light.a", "on", { brightness: 255 }))).toBe(100);
    expect(brightnessPct(state("light.a", "on", { brightness: 128 }))).toBe(50);
    expect(brightnessPct(state("light.a", "off", { brightness: 128 }))).toBeNull();
  });
});
