import { describe, expect, it } from "vitest";
import { levelAllows, setUserLevel, userLevel } from "../src/data/levels";
import { defaultNav, navItems, navMatches, setNavItems, visibleNav } from "../src/data/nav";
import {
  addWidget,
  createPage,
  customPages,
  deletePage,
  HOME_PAGE,
  moveWidget,
  orderWidgets,
  page,
  removeWidget,
  updateWidget,
} from "../src/data/pages";
import { translator } from "../src/i18n";
import { ADAPTERS, DEMO, adapterAvailable } from "../src/widgets/adapters";
import { duration, uptimeOf, usageTone } from "../src/widgets/adapters/util";
import { WIDGETS, widgetDef, widgetVisible } from "../src/widgets/catalog";
import type { HomeAssistant } from "../src/types/hass";
import { fakeHass, state } from "./fixtures";

const t = translator("en");

describe("levels", () => {
  it("defaults to expert for admins and standard for others", () => {
    expect(userLevel({}, {}, "u1", true)).toBe("expert");
    expect(userLevel({}, {}, "u1", false)).toBe("standard");
  });

  it("uses the admin's assignment, then the user's own choice when allowed", () => {
    const layout = setUserLevel({}, "u1", "simple");
    expect(userLevel(layout, {}, "u1", false)).toBe("simple");
    expect(userLevel(layout, { level: "expert" }, "u1", false)).toBe("expert");
    expect(userLevel({ ...layout, levelChoice: false }, { level: "expert" }, "u1", false)).toBe("simple");
    expect(userLevel(setUserLevel(layout, "u1", null), {}, "u1", false)).toBe("standard");
  });

  it("compares levels", () => {
    expect(levelAllows("simple", "standard")).toBe(false);
    expect(levelAllows("expert", "standard")).toBe(true);
    expect(levelAllows("simple", undefined)).toBe(true);
  });
});

describe("pages", () => {
  it("builds the home page from the old module settings", () => {
    const home = page({}, HOME_PAGE);
    expect(home?.widgets.map((w) => w.type)).toEqual([
      "header",
      "status",
      "climate",
      "solar",
      "lights",
      "scenes",
      "waste",
      "rooms",
    ]);
    expect(home?.widgets.find((w) => w.type === "rooms")?.disabled).toBe(true);
    expect(home?.widgets.find((w) => w.type === "lights")?.col).toBe(2);
    const hidden = page({ home: { hidden: [] } }, HOME_PAGE);
    expect(hidden?.widgets.every((w) => !w.disabled)).toBe(true);
  });

  it("adds, changes, moves and removes widgets", () => {
    let layout: Record<string, unknown> = addWidget({}, HOME_PAGE, { type: "clock" });
    const clock = page(layout, HOME_PAGE)?.widgets.at(-1);
    expect(clock?.type).toBe("clock");
    const id = clock?.id ?? "";
    layout = updateWidget(layout, HOME_PAGE, id, { size: "s", title: "Time" });
    expect(page(layout, HOME_PAGE)?.widgets.at(-1)).toMatchObject({ size: "s", title: "Time" });
    layout = updateWidget(layout, HOME_PAGE, id, { title: undefined });
    expect("title" in (page(layout, HOME_PAGE)?.widgets.at(-1) ?? {})).toBe(false);
    layout = moveWidget(layout, HOME_PAGE, id, -1);
    expect(page(layout, HOME_PAGE)?.widgets.at(-2)?.id).toBe(id);
    layout = orderWidgets(layout, HOME_PAGE, [id]);
    expect(page(layout, HOME_PAGE)?.widgets[0]?.id).toBe(id);
    layout = removeWidget(layout, HOME_PAGE, id);
    expect(page(layout, HOME_PAGE)?.widgets.some((w) => w.id === id)).toBe(false);
  });

  it("creates pages with unique ids and deletes them", () => {
    const a = createPage({}, "Server Raum");
    expect(a.id).toBe("server-raum");
    const b = createPage(a.layout, "Server Raum");
    expect(b.id).toBe("server-raum-2");
    expect(customPages(b.layout).map((p) => p.id)).toEqual(["server-raum", "server-raum-2"]);
    expect(customPages(deletePage(b.layout, "server-raum")).map((p) => p.id)).toEqual(["server-raum-2"]);
    expect(createPage({}, "Home").id).not.toBe(HOME_PAGE);
  });
});

describe("navigation", () => {
  it("has a default and respects levels and hiding", () => {
    expect(navItems({})).toEqual(defaultNav());
    expect(visibleNav({}, "simple").map((i) => i.kind)).toEqual(["home", "rooms", "settings"]);
    const items = defaultNav().map((i) => (i.kind === "rooms" ? { ...i, hidden: true } : i));
    expect(visibleNav(setNavItems({}, items), "expert").some((i) => i.kind === "rooms")).toBe(false);
  });

  it("matches routes", () => {
    expect(navMatches({ id: "r", kind: "rooms" }, { page: "room", areaId: "x" })).toBe(true);
    expect(navMatches({ id: "r", kind: "room", areaId: "x" }, { page: "room", areaId: "y" })).toBe(false);
    expect(navMatches({ id: "p", kind: "page", pageId: "a" }, { page: "page", pageId: "a" })).toBe(true);
  });
});

describe("widget catalogue", () => {
  it("has unique types with translated names and descriptions", () => {
    const types = WIDGETS.map((w) => w.type);
    expect(new Set(types).size).toBe(types.length);
    for (const w of WIDGETS) {
      expect(t(w.name), w.type).toBeTruthy();
      expect(t(w.description), w.type).toBeTruthy();
    }
    expect(translator("de")("wn.unifi")).toBe("UniFi-Netzwerk");
  });

  it("hides widgets below their level and when switched off", () => {
    expect(widgetVisible({ id: "a", type: "proxmox" }, "standard")).toBe(false);
    expect(widgetVisible({ id: "a", type: "proxmox" }, "expert")).toBe(true);
    expect(widgetVisible({ id: "a", type: "proxmox", minLevel: "simple" }, "simple")).toBe(true);
    expect(widgetVisible({ id: "a", type: "clock", disabled: true }, "expert")).toBe(false);
    expect(widgetVisible({ id: "a", type: "nope" }, "expert")).toBe(false);
  });

  it("has demo data for every data widget", () => {
    for (const key of Object.keys(ADAPTERS)) {
      const model = DEMO[key]?.({ t, locale: "en", options: {} });
      expect(model, key).toBeTruthy();
      expect(widgetDef(key)?.demo, key).toBe(true);
    }
  });
});

describe("adapters", () => {
  const withEntities = (
    list: Array<[string, string, Record<string, unknown>, Record<string, unknown>]>,
  ): HomeAssistant => {
    const base = fakeHass();
    const states = { ...base.states };
    const entities = { ...base.entities };
    for (const [id, value, attrs, entry] of list) {
      states[id] = state(id, value, attrs);
      entities[id] = { entity_id: id, labels: [], ...entry };
    }
    return {
      ...base,
      states,
      entities,
      devices: { ...base.devices, pve: { id: "pve", name: "pve", name_by_user: null, area_id: null } },
    };
  };

  it("are not available without their integration", () => {
    for (const key of Object.keys(ADAPTERS)) {
      if (key === "updates" || key === "security" || key === "batteries") continue;
      expect(adapterAvailable(key, fakeHass()), key).toBe(false);
    }
  });

  it("reads Proxmox nodes with status and usage", () => {
    const hass = withEntities([
      [
        "binary_sensor.pve_status",
        "on",
        {},
        { platform: "proxmoxve", device_id: "pve", translation_key: "status" },
      ],
      [
        "sensor.pve_cpu_used",
        "12.3",
        { unit_of_measurement: "%" },
        { platform: "proxmoxve", device_id: "pve", translation_key: "cpu_used" },
      ],
      [
        "sensor.pve_memory_used_percentage",
        "91",
        { unit_of_measurement: "%" },
        { platform: "proxmoxve", device_id: "pve" },
      ],
    ]);
    const model = ADAPTERS.proxmox?.(hass, { t, locale: "en", options: {} });
    expect(model?.summary?.[0]).toMatchObject({ value: "1", unit: "/ 1", tone: "ok" });
    const group = model?.groups?.[0];
    expect(group?.name).toBe("pve");
    expect(group?.status?.tone).toBe("ok");
    expect(group?.metrics.map((m) => [m.label, m.value, m.tone])).toEqual([
      ["CPU", "12", "ok"],
      ["Memory", "91", "bad"],
    ]);
  });

  it("reads a DNS filter with its protection switch", () => {
    const hass = withEntities([
      ["sensor.pihole_dns_queries_today", "1000", {}, { platform: "pi_hole" }],
      ["sensor.pihole_ads_blocked_today", "120", {}, { platform: "pi_hole" }],
      [
        "sensor.pihole_ads_percentage_blocked_today",
        "12",
        { unit_of_measurement: "%" },
        { platform: "pi_hole" },
      ],
      ["switch.pi_hole", "on", {}, { platform: "pi_hole" }],
    ]);
    const model = ADAPTERS.dns?.(hass, { t, locale: "en", options: {} });
    expect(model?.summary?.map((m) => m.value)).toEqual(["1,000", "120", "12"]);
    expect(model?.toggles?.[0]).toMatchObject({ entityId: "switch.pi_hole", on: true });
  });

  it("formats durations and usage", () => {
    expect(duration(90061)).toBe("1 d 1 h");
    expect(duration(3720)).toBe("1 h 2 min");
    expect(uptimeOf(state("sensor.up", "2", { unit_of_measurement: "h" }))).toBe("2 h 0 min");
    expect(usageTone(50)).toBe("ok");
    expect(usageTone(80)).toBe("warn");
    expect(usageTone(95)).toBe("bad");
  });
});

describe("room sections and categories", () => {
  it("orders and hides room page sections", async () => {
    const { roomSectionList, setRoomSection } = await import("../src/data/layout");
    expect(roomSectionList({}).map((s) => s.id)).toEqual([
      "climate",
      "lights",
      "devices",
      "media",
      "sensors",
      "widgets",
    ]);
    let layout = setRoomSection({}, { move: ["lights", -1] });
    layout = setRoomSection(layout, { enabled: ["sensors", false] });
    const list = roomSectionList(layout);
    expect(list.slice(0, 2).map((s) => s.id)).toEqual(["lights", "climate"]);
    expect(list.find((s) => s.id === "sensors")?.enabled).toBe(false);
  });

  it("orders and hides categories, new ones appear", async () => {
    const { categoryList, setCategory } = await import("../src/data/layout");
    const all = ["light", "climate", "energy"];
    const layout = setCategory(setCategory({}, all, { move: ["energy", -1] }), all, {
      enabled: ["light", false],
    });
    expect(categoryList(layout, [...all, "homelab"]).map((c) => `${c.id}:${c.enabled}`)).toEqual([
      "light:false",
      "energy:true",
      "climate:true",
      "homelab:true",
    ]);
  });
});

describe("doorbell", () => {
  const withBell = () => {
    const base = fakeHass();
    return {
      ...base,
      states: {
        ...base.states,
        "binary_sensor.door_cam_besucher": state("binary_sensor.door_cam_besucher", "off"),
        "binary_sensor.water_pressure": state("binary_sensor.water_pressure", "off"),
        "camera.door_cam_sub": state("camera.door_cam_sub", "idle"),
        "camera.door_cam_main": state("camera.door_cam_main", "idle"),
        "camera.garden": state("camera.garden", "idle"),
      },
      entities: {
        ...base.entities,
        "binary_sensor.door_cam_besucher": {
          entity_id: "binary_sensor.door_cam_besucher",
          device_id: "cam",
          labels: [],
        },
        "camera.door_cam_sub": { entity_id: "camera.door_cam_sub", device_id: "cam", labels: [] },
        "camera.door_cam_main": { entity_id: "camera.door_cam_main", device_id: "cam", labels: [] },
      },
    } as HomeAssistant;
  };

  it("finds the ring sensor and the main camera of the same device", async () => {
    const { doorbell, doorbellCandidates } = await import("../src/data/doorbell");
    const hass = withBell();
    expect(doorbellCandidates(hass)).toEqual(["binary_sensor.door_cam_besucher"]);
    expect(doorbell(hass, {})).toEqual({
      trigger: "binary_sensor.door_cam_besucher",
      camera: "camera.door_cam_main",
      seconds: 60,
    });
    expect(doorbell(hass, { doorbell: { off: true } })).toBeNull();
    expect(doorbell(hass, { doorbell: { camera: "camera.garden", seconds: 30 } })?.camera).toBe(
      "camera.garden",
    );
  });

  it("knows what a ring is", async () => {
    const { isRing } = await import("../src/data/doorbell");
    expect(isRing("binary_sensor.x", "off", "on")).toBe(true);
    expect(isRing("binary_sensor.x", "on", "off")).toBe(false);
    expect(isRing("event.x", "2026-10-15T10:00:00", "2026-10-15T10:05:00")).toBe(true);
    expect(isRing("event.x", undefined, "2026-10-15T10:05:00")).toBe(false);
    expect(isRing("event.x", "a", "unavailable")).toBe(false);
  });
});
