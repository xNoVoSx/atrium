// Rules for what Atrium shows, based on the entity/device/area registries.
// Pure functions: they only read `hass`, which keeps them easy to test.

import type { HassEntity, HomeAssistant } from "../types/hass";

/**
 * Hidden, disabled and config/diagnostic entities never appear automatically.
 * Accepts both the compact display entries and full registry entries.
 */
export function isAutoVisible(hass: HomeAssistant, entityId: string): boolean {
  const entry = hass.entities[entityId];
  if (!entry) return true;
  const hidden = entry.hidden === true || Boolean(entry.hidden_by);
  return !hidden && !entry.disabled_by && !entry.entity_category;
}

/** The entity's own area, else the area of its device. */
export function areaIdOf(hass: HomeAssistant, entityId: string): string | null {
  const entry = hass.entities[entityId];
  if (!entry) return null;
  if (entry.area_id) return entry.area_id;
  return (entry.device_id && hass.devices[entry.device_id]?.area_id) || null;
}

export function friendlyName(stateObj: HassEntity): string {
  return (stateObj.attributes.friendly_name as string | undefined) ?? stateObj.entity_id;
}

/** A light is dimmable unless plain on/off is its only colour mode. */
export function isDimmable(stateObj: HassEntity): boolean {
  const modes = (stateObj.attributes.supported_color_modes as string[] | undefined) ?? [];
  return modes.some((mode) => mode !== "onoff");
}

/** Brightness in percent, or null when off or not reported. */
export function brightnessPct(stateObj: HassEntity): number | null {
  const brightness = stateObj.attributes.brightness as number | null | undefined;
  return stateObj.state === "on" && brightness != null ? Math.round((brightness / 255) * 100) : null;
}

export interface AreaGroup {
  areaId: string | null;
  entityIds: string[];
}

/**
 * Visible entities of one domain, grouped by area. Areas follow the registry
 * order of their names; entities without an area come last.
 */
export function groupByArea(hass: HomeAssistant, domain: string): AreaGroup[] {
  const groups = new Map<string | null, string[]>();
  for (const entityId of Object.keys(hass.states)) {
    if (!entityId.startsWith(`${domain}.`) || !isAutoVisible(hass, entityId)) continue;
    const areaId = areaIdOf(hass, entityId);
    const list = groups.get(areaId) ?? [];
    list.push(entityId);
    groups.set(areaId, list);
  }
  const areaName = (id: string | null) => (id ? (hass.areas[id]?.name ?? id) : "");
  const byName = (a: string, b: string) => {
    const sa = hass.states[a];
    const sb = hass.states[b];
    return sa && sb ? friendlyName(sa).localeCompare(friendlyName(sb)) : a.localeCompare(b);
  };
  return [...groups.entries()]
    .map(([areaId, entityIds]) => ({ areaId, entityIds: entityIds.sort(byName) }))
    .sort((a, b) => {
      if (a.areaId === null) return 1;
      if (b.areaId === null) return -1;
      return areaName(a.areaId).localeCompare(areaName(b.areaId));
    });
}

/** Friendly name of an entity, or its id when it has no state. */
export function nameOf(hass: HomeAssistant, entityId: string): string {
  const s = hass.states[entityId];
  return s ? friendlyName(s) : entityId;
}

/** Name without a leading area name ("Büro Presence" in Büro -> "Presence"), like HA's own UI. */
export function withoutArea(name: string, areaName: string | undefined): string {
  if (!areaName) return name;
  const lower = name.toLowerCase();
  const prefix = areaName.toLowerCase();
  if (!lower.startsWith(prefix) || name.length <= areaName.length) return name;
  const rest = name.slice(areaName.length).replace(/^[\s:·-]+/, "");
  return rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : name;
}
