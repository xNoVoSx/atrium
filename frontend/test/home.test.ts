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
  wastePickups,
  roomContent,
  adjacentRooms,
  daysUntil,
} from "../src/data/home";
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

describe("router", () => {
  it("parses and builds paths", () => {
    expect(parseRoute("/")).toEqual({ page: "home" });
    expect(parseRoute("/room/living%20room")).toEqual({ page: "room", areaId: "living room" });
    expect(parseRoute("/room")).toEqual({ page: "rooms" });
    expect(routePath({ page: "room", areaId: "living room" })).toBe("/room/living%20room");
    expect(navSection({ page: "room", areaId: "x" })).toBe("rooms");
  });
});

describe("waste collection", () => {
  const hass = fakeHass({
    states: {
      "sensor.wcs_mull": state("sensor.wcs_mull", "Papier in 6 days", {
        "2026-10-14": "Altes",
        "2026-10-21": "Papier / Gelber Sack",
        "2026-10-28": "Bioabfall, Restmüll",
        friendly_name: "Müll",
      }),
      "calendar.wcs": state("calendar.wcs", "off", {
        message: "Papier / Gelber Sack",
        start_time: "2026-10-21 00:00:00",
      }),
      "sensor.other": state("sensor.other", "1", { "2026-10-20": "not waste" }),
    },
    entities: {
      "sensor.wcs_mull": { entity_id: "sensor.wcs_mull", labels: [], platform: "waste_collection_schedule" },
      "calendar.wcs": { entity_id: "calendar.wcs", labels: [], platform: "waste_collection_schedule" },
      "sensor.other": { entity_id: "sensor.other", labels: [], platform: "template" },
    },
  });

  it("merges sensor and calendar by date, skips the past and other integrations", () => {
    expect(wastePickups(hass, "2026-10-15")).toEqual([
      { date: "2026-10-21", types: ["Papier / Gelber Sack"] },
      { date: "2026-10-28", types: ["Bioabfall", "Restmüll"] },
    ]);
  });

  it("counts days in local dates", () => {
    expect(daysUntil("2026-10-16", "2026-10-15")).toBe(1);
    expect(daysUntil("2026-11-01", "2026-10-15")).toBe(17);
  });
});

describe("room content", () => {
  const hass = withStates(
    {
      "climate.office": state("climate.office", "heat", {}),
      "switch.office_plug": state("switch.office_plug", "on", {}),
      "media_player.office": state("media_player.office", "idle", {}),
      "binary_sensor.office_window": state("binary_sensor.office_window", "off", { device_class: "window" }),
      "binary_sensor.office_update": state("binary_sensor.office_update", "off", { device_class: "update" }),
      "sensor.office_temp": state("sensor.office_temp", "21.2", { device_class: "temperature" }),
      "sensor.office_signal": state("sensor.office_signal", "-60", { device_class: "signal_strength" }),
      "sensor.office_broken": state("sensor.office_broken", "unavailable", { device_class: "humidity" }),
    },
    Object.fromEntries(
      [
        "climate.office",
        "switch.office_plug",
        "media_player.office",
        "binary_sensor.office_window",
        "binary_sensor.office_update",
        "sensor.office_temp",
        "sensor.office_signal",
        "sensor.office_broken",
      ].map((id) => [id, { entity_id: id, labels: [], area_id: "office" }]),
    ),
  );

  it("sorts a room into sections and leaves out noise", () => {
    expect(roomContent(hass, "office")).toEqual({
      climate: ["climate.office"],
      lights: ["light.group"],
      devices: ["switch.office_plug"],
      media: ["media_player.office"],
      binary: ["binary_sensor.office_window"],
      sensors: ["sensor.office_temp"],
    });
  });

  it("finds neighbouring rooms, wrapping around", () => {
    expect(adjacentRooms(hass, "hall")).toEqual({ prev: "office", next: "office" });
    expect(adjacentRooms(hass, "nowhere")).toEqual({ prev: null, next: null });
  });
});
