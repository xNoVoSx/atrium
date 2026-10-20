import { describe, expect, it } from "vitest";
import {
  childLockOf,
  currentLevel,
  daySegments,
  detectToggles,
  detectZones,
  guards,
  levelName,
  nextChange,
  nextChangeFromStates,
  scheduleMap,
  setGuard,
  thermostatsFromAutomations,
} from "../src/data/heating";
import type { HomeAssistant } from "../src/types/hass";
import { fakeHass, state } from "./fixtures";

const num = (id: string, name: string, value: number) =>
  state(id, String(value), { friendly_name: name, unit_of_measurement: "°C", min: 5, max: 25, step: 0.5 });

/** A house built like many: comfort/night per zone, a kids' room with an extra day level. */
function house(overrides: Record<string, ReturnType<typeof state>> = {}): HomeAssistant {
  const base = fakeHass();
  const states = {
    ...base.states,
    "input_number.heating_living_comfort": num(
      "input_number.heating_living_comfort",
      "Heating Living Comfort",
      21,
    ),
    "input_number.heating_living_night": num("input_number.heating_living_night", "Heating Living Night", 17),
    "schedule.heating_living_comforttime": state("schedule.heating_living_comforttime", "on", {
      friendly_name: "Heating Living Comfort time",
      next_event: "2026-10-20T19:00:00+02:00",
    }),
    "input_number.heating_kids_comfort": num("input_number.heating_kids_comfort", "Heating Kids Comfort", 21),
    "input_number.heating_kids_day": num("input_number.heating_kids_day", "Heating Kids Day", 18),
    "input_number.heating_kids_night": num("input_number.heating_kids_night", "Heating Kids Night", 17),
    "schedule.heating_kids_daytime": state("schedule.heating_kids_daytime", "on", {
      next_event: "2026-10-20T19:00:00+02:00",
    }),
    "schedule.heating_kids_comforttime": state("schedule.heating_kids_comforttime", "off", {
      next_event: "2026-10-20T15:00:00+02:00",
    }),
    "input_number.heating_bath_temperature": num(
      "input_number.heating_bath_temperature",
      "Heating Bath Temperature",
      18,
    ),
    "input_number.pool_target": num("input_number.pool_target", "Pool target", 28),
    "input_boolean.heating_automatic": state("input_boolean.heating_automatic", "on"),
    "input_boolean.guest_mode": state("input_boolean.guest_mode", "off"),
    "climate.heating_kids": state("climate.heating_kids", "heat", { temperature: 18 }),
    "climate.living_left": state("climate.living_left", "heat", { temperature: 21 }),
    "switch.heating_kids_child_lock": state("switch.heating_kids_child_lock", "on"),
    "switch.heating_kids_open_window": state("switch.heating_kids_open_window", "on"),
    ...overrides,
  };
  return {
    ...base,
    states,
    entities: {
      ...base.entities,
      "climate.heating_kids": { entity_id: "climate.heating_kids", device_id: "trv", labels: [] },
      "switch.heating_kids_child_lock": {
        entity_id: "switch.heating_kids_child_lock",
        device_id: "trv",
        labels: [],
      },
      "switch.heating_kids_open_window": {
        entity_id: "switch.heating_kids_open_window",
        device_id: "trv",
        labels: [],
      },
    },
  };
}

function zone(hass: HomeAssistant, id: string) {
  const z = detectZones(hass).find((x) => x.id === id);
  if (!z) throw new Error(`zone ${id} missing`);
  return z;
}

describe("heating zones", () => {
  it("are found by helper names, levels with schedules first, warmer first", () => {
    const hass = house();
    const zones = detectZones(hass);
    expect(zones.map((z) => z.id)).toEqual(["heating_bath", "heating_kids", "heating_living"]);
    const kids = zones.find((z) => z.id === "heating_kids");
    expect(kids?.name).toBe("Kids");
    expect(kids?.levels).toEqual([
      { schedule: "schedule.heating_kids_comforttime", temp: "input_number.heating_kids_comfort" },
      { schedule: "schedule.heating_kids_daytime", temp: "input_number.heating_kids_day" },
      { temp: "input_number.heating_kids_night" },
    ]);
    expect(kids?.thermostats).toEqual(["climate.heating_kids"]);
    const k = zone(hass, "heating_kids");
    expect(levelName(hass, k, { temp: "input_number.heating_kids_day" })).toBe("Day");
    const bath = zones.find((z) => z.id === "heating_bath");
    expect(bath?.name).toBe("Bath");
    expect(bath?.levels).toEqual([{ temp: "input_number.heating_bath_temperature" }]);
  });

  it("get their thermostats from automations", () => {
    const zones = thermostatsFromAutomations(detectZones(house()), [
      {
        triggers: [{ entity_id: ["sensor.heating_living_target", "sensor.heating_kids_target"] }],
        variables: {
          zones: [
            {
              target: "sensor.heating_living_target",
              thermostats: ["climate.living_left", "climate.living_right"],
            },
            { target: "sensor.heating_kids_target", thermostats: ["climate.heating_kids"] },
          ],
        },
      },
    ]);
    expect(zones.find((z) => z.id === "heating_living")?.thermostats).toEqual([
      "climate.living_left",
      "climate.living_right",
    ]);
  });

  it("know the level now and when it changes", () => {
    const hass = house();
    const kids = zone(hass, "heating_kids");
    expect(currentLevel(hass, kids)).toBe(1); // day: comfort is off, day is on
    const next = nextChangeFromStates(hass, kids);
    expect(next?.level).toBe(0); // comfort at 15:00
    expect(next?.at.toISOString()).toBe("2026-10-20T13:00:00.000Z");
  });

  it("draw a day from the stored weeks", () => {
    const kids = zone(house(), "heating_kids");
    const schedules = scheduleMap([
      { id: "heating_kids_comforttime", name: "c", monday: [{ from: "15:00:00", to: "19:00:00" }] },
      { id: "heating_kids_daytime", name: "d", monday: [{ from: "07:00:00", to: "19:00:00" }] },
    ]);
    expect(daySegments(kids, schedules, "monday")).toEqual([
      { from: 0, to: 420, level: 2 },
      { from: 420, to: 900, level: 1 },
      { from: 900, to: 1140, level: 0 },
      { from: 1140, to: 1440, level: 2 },
    ]);
    expect(daySegments(kids, schedules, "tuesday")).toEqual([{ from: 0, to: 1440, level: 2 }]);
    // Monday 16:00 → next change 19:00 to night
    const at = new Date(2026, 9, 19, 16, 0);
    expect(nextChange(kids, schedules, at)).toEqual({ at: new Date(2026, 9, 19, 19, 0), level: 2 });
  });

  it("find heating switches", () => {
    expect(detectToggles(house())).toEqual(["input_boolean.heating_automatic"]);
  });
});

describe("thermostat guard rules", () => {
  it("are set per thermostat and removed when they enforce nothing", () => {
    let layout: Record<string, unknown> = { other: 1 };
    layout = setGuard(layout, "climate.a", {
      lock: "switch.a_child_lock",
      lockMode: "relock",
      relockMinutes: 5,
    });
    expect(guards(layout)).toEqual({
      "climate.a": { lock: "switch.a_child_lock", lockMode: "relock", relockMinutes: 5 },
    });
    layout = setGuard(layout, "climate.a", { lockMode: undefined });
    expect(guards(layout)).toEqual({});
    expect(layout.other).toBe(1);
  });

  it("find the child lock on the thermostat's device", () => {
    expect(childLockOf(house(), "climate.heating_kids")).toBe("switch.heating_kids_child_lock");
    expect(childLockOf(house(), "climate.living_left")).toBeUndefined();
  });
});
