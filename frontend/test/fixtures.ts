// A small fake `hass` with just enough structure for the data layer.

import type { HassEntity, HomeAssistant } from "../src/types/hass";

export function state(entityId: string, value: string, attributes: Record<string, unknown> = {}): HassEntity {
  return {
    entity_id: entityId,
    state: value,
    attributes,
    last_changed: "",
    last_updated: "",
    context: { id: "", parent_id: null, user_id: null },
  };
}

export function fakeHass(overrides: Partial<HomeAssistant> = {}): HomeAssistant {
  const states = {
    "light.group": state("light.group", "on", {
      friendly_name: "Office Lamp",
      brightness: 128,
      supported_color_modes: ["brightness"],
      entity_id: ["light.member_1", "light.member_2"],
    }),
    "light.member_1": state("light.member_1", "on", { friendly_name: "Member 1" }),
    "light.member_2": state("light.member_2", "on", { friendly_name: "Member 2" }),
    "light.status_led": state("light.status_led", "on", { friendly_name: "Status LED" }),
    "light.hall": state("light.hall", "off", { friendly_name: "Hall", supported_color_modes: ["onoff"] }),
    "light.loose": state("light.loose", "off", { friendly_name: "Loose" }),
    "sensor.temp": state("sensor.temp", "20"),
  };
  return {
    states,
    entities: {
      "light.group": { entity_id: "light.group", area_id: "office", labels: [] },
      "light.member_1": { entity_id: "light.member_1", device_id: "dev1", labels: [], hidden: true },
      "light.member_2": { entity_id: "light.member_2", device_id: "dev1", labels: [], hidden: true },
      "light.status_led": { entity_id: "light.status_led", labels: [], entity_category: "config" },
      "light.hall": { entity_id: "light.hall", device_id: "dev2", labels: [] },
      "light.loose": { entity_id: "light.loose", labels: [] },
    },
    devices: {
      dev1: { id: "dev1", name: "Dimmer", name_by_user: null, area_id: "office" },
      dev2: { id: "dev2", name: "Hall switch", name_by_user: null, area_id: "hall" },
    },
    areas: {
      office: { area_id: "office", name: "Office" },
      hall: { area_id: "hall", name: "Hall" },
    },
    user: { id: "u1", name: "Test", is_admin: false, is_owner: false },
    themes: { darkMode: true },
    language: "en",
    config: {} as HomeAssistant["config"],
    auth: {},
    connection: {} as HomeAssistant["connection"],
    callService: async () => undefined,
    callWS: async <T>() => undefined as T,
    ...overrides,
  };
}
