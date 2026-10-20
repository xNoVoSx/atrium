import { describe, expect, it } from "vitest";
import { distanceKm, formatDistance, presenceGroups, presences } from "../src/data/presence";
import type { HomeAssistant } from "../src/types/hass";
import { fakeHass, state } from "./fixtures";

const HOME = { latitude: 52.52, longitude: 13.405 };

function people(): HomeAssistant {
  const base = fakeHass();
  const at = (id: string, value: string, attrs: Record<string, unknown> = {}) => ({
    ...state(id, value, attrs),
    last_changed: "2026-10-20T08:17:00+00:00",
  });
  return {
    ...base,
    states: {
      ...base.states,
      "zone.home": state("zone.home", "1", { friendly_name: "Home", icon: "mdi:home", ...HOME }),
      "zone.work": state("zone.work", "1", {
        friendly_name: "Arbeit",
        icon: "mdi:briefcase",
        latitude: 52.5,
        longitude: 13.3,
      }),
      "person.anna": at("person.anna", "home", { friendly_name: "Anna", ...HOME }),
      "person.ben": at("person.ben", "not_home", {
        friendly_name: "Ben",
        latitude: 52.55,
        longitude: 13.405,
      }),
      "person.oma": at("person.oma", "Arbeit", { friendly_name: "Oma", latitude: 52.5, longitude: 13.3 }),
      "person.lea": at("person.lea", "unknown", { friendly_name: "Lea", device_trackers: [] }),
      "person.zoe": at("person.zoe", "home", { friendly_name: "Zoe" }),
    },
  };
}

const ALL = ["person.lea", "person.oma", "person.ben", "person.zoe", "person.anna"];

describe("presence", () => {
  it("knows home, named zones, away and unknown, sorted that way", () => {
    const list = presences(people(), ALL);
    expect(list.map((p) => [p.name, p.kind])).toEqual([
      ["Anna", "home"],
      ["Zoe", "home"],
      ["Oma", "zone"],
      ["Ben", "away"],
      ["Lea", "unknown"],
    ]);
    const oma = list.find((p) => p.name === "Oma");
    expect(oma?.zone).toBe("zone.work");
    expect(oma?.icon).toBe("mdi:briefcase");
    expect(oma?.since).toBe("2026-10-20T08:17:00+00:00");
  });

  it("measures the distance from home only when away", () => {
    const list = presences(people(), ALL);
    expect(list.find((p) => p.name === "Anna")?.km).toBeUndefined();
    expect(list.find((p) => p.name === "Lea")?.km).toBeUndefined();
    expect(list.find((p) => p.name === "Ben")?.km).toBeCloseTo(3.34, 1);
  });

  it("groups people by place", () => {
    const groups = presenceGroups(presences(people(), ALL));
    expect(groups.map((g) => [g.key, g.people.length])).toEqual([
      ["zone.home", 2],
      ["zone.work", 1],
      ["away", 1],
      ["unknown", 1],
    ]);
  });

  it("formats distances", () => {
    expect(formatDistance(0.83, "en")).toBe("800 m");
    expect(formatDistance(3.24, "de")).toBe("3,2 km");
    expect(formatDistance(41.6, "en")).toBe("42 km");
    expect(distanceKm(0, 0, 0, 0)).toBe(0);
  });
});
