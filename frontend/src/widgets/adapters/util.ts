// Helpers for adapters: find an integration's entities, group them by
// device, recognise what a sensor measures, format numbers.

import type { HassEntity, HomeAssistant } from "../../types/hass";
import type { Metric, Tone } from "../types";

/** Entities of these integrations (platforms), disabled ones left out. */
export function platformEntities(hass: HomeAssistant, platforms: readonly string[]): string[] {
  return Object.values(hass.entities)
    .filter((e) => e.platform && platforms.includes(e.platform) && !e.disabled_by && hass.states[e.entity_id])
    .map((e) => e.entity_id)
    .sort();
}

export const hasPlatform = (hass: HomeAssistant, platforms: readonly string[]) =>
  Object.values(hass.entities).some((e) => e.platform && platforms.includes(e.platform) && !e.disabled_by);

export const domainOf = (entityId: string) => entityId.split(".")[0] ?? "";

/** Entity ids grouped by device, devices in name order; entities without device under "". */
export function byDevice(
  hass: HomeAssistant,
  ids: readonly string[],
): Array<{ deviceId: string; name: string; ids: string[] }> {
  const map = new Map<string, string[]>();
  for (const id of ids) {
    const dev = hass.entities[id]?.device_id ?? "";
    map.set(dev, [...(map.get(dev) ?? []), id]);
  }
  return [...map.entries()]
    .map(([deviceId, list]) => ({ deviceId, name: deviceName(hass, deviceId) || list[0] || "", ids: list }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function deviceName(hass: HomeAssistant, deviceId: string): string {
  const d = hass.devices[deviceId];
  return d ? (d.name_by_user ?? d.name ?? "") : "";
}

/** What an entity is: translation key, else the object id, lower case. */
export function keyOf(hass: HomeAssistant, id: string): string {
  return (hass.entities[id]?.translation_key ?? id.split(".")[1] ?? "").toLowerCase();
}

/** First entity whose key or id contains one of the words (in that order of preference). */
export function pick(
  hass: HomeAssistant,
  ids: readonly string[],
  words: readonly string[],
  domain?: string,
): string | undefined {
  const pool = domain ? ids.filter((id) => domainOf(id) === domain) : ids;
  for (const w of words) {
    const hit = pool.find((id) => keyOf(hass, id).includes(w) || id.includes(w));
    if (hit) return hit;
  }
  return undefined;
}

export function num(s: HassEntity | undefined): number | null {
  if (!s) return null;
  const n = Number(s.state);
  return Number.isFinite(n) ? n : null;
}

export const unitOf = (s: HassEntity | undefined) =>
  (s?.attributes.unit_of_measurement as string | undefined) ?? "";

export function fmt(locale: string, n: number | null, digits = 0): string {
  if (n === null) return "—";
  return new Intl.NumberFormat(locale, { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n);
}

/** Usage tone: green below warn, amber up to bad, red above. */
export function usageTone(pct: number | null, warn = 75, bad = 90): Tone {
  if (pct === null) return "off";
  return pct >= bad ? "bad" : pct >= warn ? "warn" : "ok";
}

export function isAvailable(s: HassEntity | undefined): boolean {
  return Boolean(s) && s?.state !== "unavailable" && s?.state !== "unknown";
}

/** A percentage metric (CPU, RAM, disk) from a sensor. */
export function pctMetric(
  hass: HomeAssistant,
  id: string | undefined,
  label: string,
  locale: string,
): Metric | null {
  if (!id) return null;
  const s = hass.states[id];
  const n = num(s);
  return { label, value: fmt(locale, n, 0), unit: "%", pct: n, tone: usageTone(n), entityId: id };
}

/** A plain value metric with the sensor's own unit. */
export function valueMetric(
  hass: HomeAssistant,
  id: string | undefined,
  label: string,
  locale: string,
  digits = 1,
): Metric | null {
  if (!id) return null;
  const s = hass.states[id];
  const n = num(s);
  return {
    label,
    value: n === null ? (s?.state ?? "—") : fmt(locale, n, digits),
    unit: n === null ? "" : unitOf(s),
    entityId: id,
  };
}

/** Human duration from seconds: "3 d 4 h", "5 h 2 min", "12 min". */
export function duration(seconds: number | null): string {
  if (seconds === null || seconds < 0) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d) return `${d} d ${h} h`;
  if (h) return `${h} h ${m} min`;
  return `${m} min`;
}

/** Uptime from a timestamp sensor (boot time) or a duration sensor. */
export function uptimeOf(s: HassEntity | undefined, now = Date.now()): string {
  if (!s || !isAvailable(s)) return "—";
  if (s.attributes.device_class === "timestamp") {
    const t = Date.parse(s.state);
    return Number.isFinite(t) ? duration((now - t) / 1000) : "—";
  }
  const n = num(s);
  if (n === null) return s.state;
  const unit = unitOf(s);
  const factor = unit === "d" ? 86400 : unit === "h" ? 3600 : unit === "min" ? 60 : 1;
  return duration(n * factor);
}

export const compact = <T>(list: Array<T | null | undefined | false>): T[] => list.filter(Boolean) as T[];
