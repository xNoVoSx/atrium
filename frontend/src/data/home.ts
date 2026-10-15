// What the home page shows, derived from `hass`. Pure functions, unit tested.

import { areaIdOf, friendlyName, isAutoVisible } from "./registry";
import type { HassEntity, HomeAssistant } from "../types/hass";

const numeric = (s: HassEntity | undefined): number | null => {
  if (!s) return null;
  const n = Number(s.state);
  return s.state === "" || Number.isNaN(n) ? null : n;
};

const visibleOfDomain = (hass: HomeAssistant, domain: string) =>
  Object.keys(hass.states).filter((id) => id.startsWith(`${domain}.`) && isAutoVisible(hass, id));

const areaName = (hass: HomeAssistant, entityId: string) => {
  const area = areaIdOf(hass, entityId);
  return area ? (hass.areas[area]?.name ?? "") : "";
};

/** Sort by area name, then by entity name. */
function byAreaThenName(hass: HomeAssistant) {
  return (a: string, b: string) => {
    const sa = hass.states[a];
    const sb = hass.states[b];
    return (
      areaName(hass, a).localeCompare(areaName(hass, b)) ||
      (sa && sb ? friendlyName(sa).localeCompare(friendlyName(sb)) : a.localeCompare(b))
    );
  };
}

// ---- weather ----

export function weatherEntity(hass: HomeAssistant): HassEntity | undefined {
  const id = visibleOfDomain(hass, "weather").sort()[0];
  return id ? hass.states[id] : undefined;
}

// ---- heating ----

export function climateZones(hass: HomeAssistant): string[] {
  return visibleOfDomain(hass, "climate")
    .filter((id) => hass.states[id]?.state !== "unavailable")
    .sort(byAreaThenName(hass));
}

/** First word all names share ("Heizung Küche", "Heizung Flur" -> "Heizung "), or "". */
function sharedFirstWord(names: string[]): string {
  if (names.length < 2) return "";
  const first = names[0]?.split(" ")[0] ?? "";
  return first && names.every((n) => n.startsWith(`${first} `)) ? `${first} ` : "";
}

/**
 * Short label for a zone: its area, unless several zones share the area or it
 * has none; then its name without a word that all zone names start with.
 */
export function zoneLabel(hass: HomeAssistant, entityId: string, zones: string[]): string {
  const nameOf = (id: string) => {
    const s = hass.states[id];
    return s ? friendlyName(s) : id;
  };
  const area = areaIdOf(hass, entityId);
  const sharesArea = area !== null && zones.filter((z) => areaIdOf(hass, z) === area).length > 1;
  if (area && !sharesArea) return hass.areas[area]?.name ?? nameOf(entityId);
  const prefix = sharedFirstWord(zones.map(nameOf));
  return nameOf(entityId).slice(prefix.length);
}

/** Next target after one step, clamped to the device's limits. */
export function stepTarget(stateObj: HassEntity, current: number, direction: 1 | -1): number {
  const step = Number(stateObj.attributes.target_temp_step) || 0.5;
  const min = Number(stateObj.attributes.min_temp ?? 5);
  const max = Number(stateObj.attributes.max_temp ?? 35);
  const next = Math.round((current + direction * step) / step) * step;
  return Math.min(max, Math.max(min, next));
}

// ---- status ----

const OPENING_CLASSES = ["door", "garage_door", "opening", "window"];
const COVER_CLASSES = ["garage", "gate", "door"];

export interface OpenItem {
  entityId: string;
  since: string;
}

/** Doors, gates and windows that are open right now. */
export function openItems(hass: HomeAssistant): OpenItem[] {
  const items: OpenItem[] = [];
  for (const id of visibleOfDomain(hass, "binary_sensor")) {
    const s = hass.states[id];
    if (s?.state === "on" && OPENING_CLASSES.includes(String(s.attributes.device_class))) {
      items.push({ entityId: id, since: s.last_changed });
    }
  }
  for (const id of visibleOfDomain(hass, "cover")) {
    const s = hass.states[id];
    if (
      s &&
      ["open", "opening"].includes(s.state) &&
      COVER_CLASSES.includes(String(s.attributes.device_class))
    ) {
      items.push({ entityId: id, since: s.last_changed });
    }
  }
  return items.sort((a, b) => a.since.localeCompare(b.since));
}

export const LOW_BATTERY_PCT = 20;

/** Battery sensors below the threshold, lowest first. Hidden or diagnostic ones count too. */
export function lowBatteries(hass: HomeAssistant, threshold = LOW_BATTERY_PCT): string[] {
  return Object.values(hass.states)
    .filter((s) => {
      if (s.attributes.device_class !== "battery") return false;
      if (s.entity_id.startsWith("binary_sensor.")) return s.state === "on";
      const pct = numeric(s);
      return s.entity_id.startsWith("sensor.") && pct !== null && pct < threshold;
    })
    .sort((a, b) => (numeric(a) ?? 0) - (numeric(b) ?? 0))
    .map((s) => s.entity_id);
}

// ---- scenes ----

export function sceneEntities(hass: HomeAssistant): string[] {
  return [...visibleOfDomain(hass, "scene"), ...visibleOfDomain(hass, "script")].sort((a, b) => {
    const sa = hass.states[a];
    const sb = hass.states[b];
    return sa && sb ? friendlyName(sa).localeCompare(friendlyName(sb)) : a.localeCompare(b);
  });
}

// ---- rooms ----

export interface RoomSummary {
  areaId: string;
  name: string;
  temperature: number | null;
  lightsOn: number;
  entityCount: number;
}

/** Visible entities that belong to an area (directly or through their device). */
export function areaEntities(hass: HomeAssistant, areaId: string): string[] {
  return Object.keys(hass.states).filter((id) => isAutoVisible(hass, id) && areaIdOf(hass, id) === areaId);
}

export function areaTemperature(hass: HomeAssistant, areaId: string, entities?: string[]): number | null {
  const configured = hass.areas[areaId]?.temperature_entity_id;
  if (configured) return numeric(hass.states[configured]);
  const ids = entities ?? areaEntities(hass, areaId);
  for (const id of ids) {
    const s = hass.states[id];
    if (s && id.startsWith("sensor.") && s.attributes.device_class === "temperature") {
      const value = numeric(s);
      if (value !== null) return value;
    }
  }
  const climates = ids
    .map((id) => hass.states[id])
    .filter((s): s is HassEntity => !!s && s.entity_id.startsWith("climate."))
    .map((s) => Number(s.attributes.current_temperature))
    .filter((n) => !Number.isNaN(n));
  return climates.length ? climates.reduce((a, b) => a + b, 0) / climates.length : null;
}

export function rooms(hass: HomeAssistant): RoomSummary[] {
  return Object.values(hass.areas)
    .map((area) => {
      const ids = areaEntities(hass, area.area_id);
      return {
        areaId: area.area_id,
        name: area.name,
        temperature: areaTemperature(hass, area.area_id, ids),
        lightsOn: ids.filter((id) => id.startsWith("light.") && hass.states[id]?.state === "on").length,
        entityCount: ids.length,
      };
    })
    .filter((r) => r.entityCount > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---- lights ----

export function lightEntities(hass: HomeAssistant, areaId?: string): string[] {
  return visibleOfDomain(hass, "light")
    .filter((id) => areaId === undefined || areaIdOf(hass, id) === areaId)
    .sort(byAreaThenName(hass));
}
