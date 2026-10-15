import { describe, expect, it } from "vitest";
import {
  areaTemperature,
  climateZones,
  lowBatteries,
  openItems,
  rooms,
  sceneEntities,
  stepTarget,
  zoneLabel,
} from "../src/data/home";
import { homeModules } from "../src/data/layout";
import { navSection, parseRoute, routePath } from "../src/router";
import { fakeHass, state } from "./fixtures";

const withStates = (extra: Record<string, ReturnType<typeof state>>, entities = {}) => {
  const base = fakeHass();
  return fakeHass({ states: { ...base.states, ...extra }, entities: { ...base.entities, ...entities } });
};

describe("heating", () => {
  const hass = withStates(
    {
      "climate.office": state("climate.office", "heat", { current_temperature: 20.5, temperature: 21 }),
      "climate.hall": state("climate.hall", "heat", { current_temperature: 19 }),
      "climate.broken": state("climate.broken", "unavailable"),
    },
    {
      "climate.office": { entity_id: "climate.office", labels: [], area_id: "office" },
      "climate.hall": { entity_id: "climate.hall", labels: [], area_id: "hall" },
    },
  );

  it("lists available zones sorted by area", () => {
    expect(climateZones(hass)).toEqual(["climate.hall", "climate.office"]);
  });

  it("labels a zone by its area", () => {
    expect(zoneLabel(hass, "climate.office", climateZones(hass))).toBe("Office");
  });

  it("drops a word all zone names share when a zone has no area", () => {
    const h = withStates({
      "climate.a": state("climate.a", "heat", { friendly_name: "Heizung Esszimmer" }),
      "climate.b": state("climate.b", "heat", { friendly_name: "Heizung Flur Mitte" }),
    });
    expect(zoneLabel(h, "climate.b", ["climate.a", "climate.b"])).toBe("Flur Mitte");
  });

  it("steps within the device limits", () => {
    const s = state("climate.x", "heat", { target_temp_step: 0.5, min_temp: 5, max_temp: 22 });
    expect(stepTarget(s, 21, 1)).toBe(21.5);
    expect(stepTarget(s, 22, 1)).toBe(22);
    expect(stepTarget(s, 5, -1)).toBe(5);
  });
});

describe("status", () => {
  it("finds open doors and garage covers, not closed ones", () => {
    const hass = withStates({
      "binary_sensor.door": state("binary_sensor.door", "on", { device_class: "door" }),
      "binary_sensor.motion": state("binary_sensor.motion", "on", { device_class: "motion" }),
      "cover.garage": state("cover.garage", "open", { device_class: "garage" }),
      "cover.blind": state("cover.blind", "open", { device_class: "blind" }),
    });
    expect(
      openItems(hass)
        .map((o) => o.entityId)
        .sort(),
    ).toEqual(["binary_sensor.door", "cover.garage"]);
  });

  it("lists low batteries lowest first, ignoring unknown values", () => {
    const hass = withStates({
      "sensor.a_battery": state("sensor.a_battery", "12", { device_class: "battery" }),
      "sensor.b_battery": state("sensor.b_battery", "1", { device_class: "battery" }),
      "sensor.c_battery": state("sensor.c_battery", "80", { device_class: "battery" }),
      "sensor.d_battery": state("sensor.d_battery", "unavailable", { device_class: "battery" }),
    });
    expect(lowBatteries(hass)).toEqual(["sensor.b_battery", "sensor.a_battery"]);
  });
});

describe("rooms", () => {
  it("summarises areas with visible entities", () => {
    const hass = fakeHass();
    const list = rooms(hass);
    expect(list.map((r) => r.areaId)).toEqual(["hall", "office"]);
    // Office: the group helper is on (its hidden members do not count).
    expect(list.find((r) => r.areaId === "office")?.lightsOn).toBe(1);
  });

  it("prefers the area's configured temperature sensor", () => {
    const hass = withStates({ "sensor.office_temp": state("sensor.office_temp", "21.4") });
    hass.areas.office = { area_id: "office", name: "Office", temperature_entity_id: "sensor.office_temp" };
    expect(areaTemperature(hass, "office")).toBe(21.4);
  });
});

describe("scenes", () => {
  it("lists scenes and scripts by name", () => {
    const hass = withStates({
      "scene.b": state("scene.b", "unknown", { friendly_name: "Evening" }),
      "script.a": state("script.a", "off", { friendly_name: "All off" }),
    });
    expect(sceneEntities(hass)).toEqual(["script.a", "scene.b"]);
  });
});

describe("layout", () => {
  it("uses the default order without settings", () => {
    expect(homeModules(undefined)).toEqual(["header", "status", "climate", "lights", "scenes", "rooms"]);
  });

  it("applies order and hidden modules, keeping unknown ones out and new ones in", () => {
    expect(homeModules({ home: { order: ["rooms", "nope", "header"], hidden: ["scenes"] } })).toEqual([
      "rooms",
      "header",
      "status",
      "climate",
      "lights",
    ]);
  });
});

describe("router", () => {
  it("parses and builds paths", () => {
    expect(parseRoute("/")).toEqual({ page: "home" });
    expect(parseRoute("/room/living%20room")).toEqual({ page: "room", areaId: "living room" });
    expect(parseRoute("/room")).toEqual({ page: "rooms" });
    expect(routePath({ page: "room", areaId: "living room" })).toBe("/room/living%20room");
    expect(navSection({ page: "room", areaId: "x" })).toBe("rooms");
  });
});
