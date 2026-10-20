// The heating program: zones whose target temperature follows schedule helpers
// and temperature helpers in Home Assistant, as many households build it
// ("comfort from 07:00 to 19:00, otherwise night"). Atrium shows and edits the
// helpers; the household's own automation keeps applying them to the
// thermostats. Also the rules of the thermostat guard (child lock, own program)
// that the integration enforces.

import type { HomeAssistant } from "../types/hass";
import { DAYS, dayIndex, endMinutes, isOnAt, minutes, type Day, type Schedules } from "./schedules";

export interface HeatingLevel {
  /** schedule.* that switches this level on; none = applies when no other level does. */
  schedule?: string;
  /** input_number.* (or number.*) holding the temperature. */
  temp: string;
}

export interface HeatingZone {
  /** Stable id (the shared prefix of the helpers). */
  id: string;
  name: string;
  /** climate.* entities the zone's temperature goes to. */
  thermostats: string[];
  /** In priority order: the first level whose schedule is on wins; the last without schedule is the default. */
  levels: HeatingLevel[];
}

export interface HeatingLayout {
  /** Saved by an admin; without it, zones are detected from the helpers' names. */
  zones?: HeatingZone[];
  /** input_boolean.* switches of the program, e.g. "heating automatic", "heating season". */
  toggles?: string[];
}

export type LockMode = "always" | "relock";

export interface GuardRule {
  /** switch.* or lock.* child lock of the thermostat. */
  lock?: string;
  lockMode?: LockMode;
  relockMinutes?: number;
  /** Put the thermostat back when it is switched to its own program. */
  keepMode?: boolean;
}

const HEATING_WORDS = /heiz|heat|thermo|klima|climate|warm/i;
const TEMP_UNITS = ["°C", "°F"];

const objectId = (entityId: string) => entityId.slice(entityId.indexOf(".") + 1);
const head = (id: string) => id.slice(0, id.lastIndexOf("_"));
const tail = (id: string) => id.slice(id.lastIndexOf("_") + 1);
const tempOf = (hass: HomeAssistant, id: string) => {
  const v = Number(hass.states[id]?.state);
  return Number.isFinite(v) ? v : null;
};

/** Without keys whose value is undefined. */
const defined = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

export const heatingLayout = (layout: Record<string, unknown> | undefined): HeatingLayout =>
  ((layout ?? {}) as { heating?: HeatingLayout }).heating ?? {};

export function setHeating(
  layout: Record<string, unknown>,
  patch: Partial<HeatingLayout>,
): Record<string, unknown> {
  return { ...layout, heating: defined({ ...heatingLayout(layout), ...patch }) };
}

// ---- detection ----

/**
 * Zones from helper names: temperature helpers that share a prefix
 * ("heating_living_comfort", "heating_living_night") form a zone; a schedule
 * with the same prefix whose last word starts like a temperature's last word
 * ("heating_living_comforttime") switches that level. Levels with a schedule
 * come first, warmer first; the remaining temperature is the default.
 */
export function detectZones(hass: HomeAssistant): HeatingZone[] {
  const ids = Object.keys(hass.states);
  const temps = ids.filter(
    (id) =>
      id.startsWith("input_number.") &&
      TEMP_UNITS.includes(String(hass.states[id]?.attributes.unit_of_measurement ?? "")) &&
      objectId(id).includes("_"),
  );
  const schedules = ids.filter((id) => id.startsWith("schedule."));
  const climates = ids.filter((id) => id.startsWith("climate."));
  const byPrefix = new Map<string, string[]>();
  for (const id of temps) {
    const p = head(objectId(id));
    byPrefix.set(p, [...(byPrefix.get(p) ?? []), id]);
  }
  const zones: HeatingZone[] = [];
  for (const [prefix, list] of byPrefix) {
    const own = schedules.filter((s) => head(objectId(s)) === prefix);
    const levels: HeatingLevel[] = list.map((temp) => {
      const word = tail(objectId(temp)).toLowerCase();
      const schedule = own.find((s) => word.length >= 3 && tail(objectId(s)).toLowerCase().startsWith(word));
      return schedule ? { schedule, temp } : { temp };
    });
    const scheduled = levels.filter((l) => l.schedule);
    if (!scheduled.length && !HEATING_WORDS.test(prefix)) continue;
    scheduled.sort((a, b) => (tempOf(hass, b.temp) ?? 0) - (tempOf(hass, a.temp) ?? 0));
    const fallback = levels.find((l) => !l.schedule);
    const rest = prefix
      .split("_")
      .filter((w) => !HEATING_WORDS.test(w))
      .join("_");
    zones.push({
      id: prefix,
      name: zoneName(hass, list),
      thermostats: rest ? climates.filter((c) => objectId(c).includes(rest)) : [],
      levels: [...scheduled, ...(fallback ? [fallback] : [])],
    });
  }
  return zones.sort((a, b) => a.name.localeCompare(b.name));
}

/** Words all helper names share, minus a leading heating word ("Heating Living Comfort" → "Living"). */
function zoneName(hass: HomeAssistant, temps: string[]): string {
  const names = temps.map((id) =>
    String(hass.states[id]?.attributes.friendly_name ?? objectId(id)).split(" "),
  );
  const first = names[0] ?? [];
  let n = first.length;
  for (const words of names.slice(1)) {
    let i = 0;
    while (i < n && words[i] === first[i]) i++;
    n = i;
  }
  if (names.length === 1) n = Math.max(1, first.length - 1);
  const shared = first.slice(0, n);
  if (shared.length > 1 && HEATING_WORDS.test(shared[0] ?? "")) shared.shift();
  return shared.join(" ") || objectId(temps[0] ?? "");
}

/**
 * Thermostats per zone from automation configs: an object that names a zone's
 * entity (e.g. its target sensor "sensor.heating_living_target") next to
 * climate entities assigns those thermostats to the zone.
 */
export function thermostatsFromAutomations(zones: HeatingZone[], configs: unknown[]): HeatingZone[] {
  const found = new Map<string, Set<string>>();
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== "object") return;
    const values = Object.values(node as Record<string, unknown>);
    const strings = values.flatMap((v) =>
      typeof v === "string"
        ? [v]
        : Array.isArray(v)
          ? v.filter((x): x is string => typeof x === "string")
          : [],
    );
    const climates = strings.filter((s) => /^climate\.[\w]+$/.test(s));
    if (climates.length) {
      for (const zone of zones) {
        const named = strings.some((s) => {
          if (!/^[a-z_]+\.[\w]+$/.test(s) || s.startsWith("climate.")) return false;
          const o = objectId(s);
          return o === zone.id || o.startsWith(`${zone.id}_`);
        });
        if (named) found.set(zone.id, new Set([...(found.get(zone.id) ?? []), ...climates]));
      }
    }
    values.forEach(visit);
  };
  configs.forEach(visit);
  return zones.map((z) => (found.has(z.id) ? { ...z, thermostats: [...(found.get(z.id) ?? [])] } : z));
}

/** Switches of the program: input_booleans whose name says heating. */
export const detectToggles = (hass: HomeAssistant) =>
  Object.keys(hass.states)
    .filter((id) => id.startsWith("input_boolean.") && HEATING_WORDS.test(objectId(id)))
    .sort();

/** Saved zones, or detected ones until an admin saves them. */
export function heatingZones(
  hass: HomeAssistant,
  layout: Record<string, unknown> | undefined,
): HeatingZone[] {
  return heatingLayout(layout).zones ?? detectZones(hass);
}

export const heatingToggles = (hass: HomeAssistant, layout: Record<string, unknown> | undefined) =>
  heatingLayout(layout).toggles ?? detectToggles(hass);

export const zoneOf = (zones: HeatingZone[], climate: string) =>
  zones.find((z) => z.thermostats.includes(climate));

// ---- the program ----

/** Short name of a level: its helper's name without the zone's words ("Heating Living Comfort" → "Comfort"). */
export function levelName(hass: HomeAssistant, zone: HeatingZone, level: HeatingLevel): string {
  const full = String(hass.states[level.temp]?.attributes.friendly_name ?? objectId(level.temp));
  const zoneWords = new Set(zone.name.toLowerCase().split(" "));
  const words = full.split(" ").filter((w) => !zoneWords.has(w.toLowerCase()) && !HEATING_WORDS.test(w));
  return words.join(" ") || full;
}

export const levelTemp = (hass: HomeAssistant, level: HeatingLevel | undefined) =>
  level ? tempOf(hass, level.temp) : null;

/** Level in force now, from the schedules' live states. */
export function currentLevel(hass: HomeAssistant, zone: HeatingZone): number {
  const i = zone.levels.findIndex((l) => l.schedule && hass.states[l.schedule]?.state === "on");
  return i >= 0 ? i : zone.levels.findIndex((l) => !l.schedule);
}

/**
 * The next change from the schedules' live states (next_event), without their
 * stored weeks: at the earliest next event the schedules that change then flip.
 */
export function nextChangeFromStates(
  hass: HomeAssistant,
  zone: HeatingZone,
): { at: Date; level: number } | null {
  const events = zone.levels
    .filter((l) => l.schedule)
    .map((l) => {
      const s = hass.states[l.schedule ?? ""];
      const t = Date.parse(String(s?.attributes.next_event ?? ""));
      return { schedule: l.schedule ?? "", on: s?.state === "on", at: Number.isFinite(t) ? t : null };
    });
  const at = Math.min(...events.map((e) => e.at ?? Infinity));
  if (!Number.isFinite(at)) return null;
  const onThen = new Set(events.filter((e) => (e.at === at ? !e.on : e.on)).map((e) => e.schedule));
  const i = zone.levels.findIndex((l) => l.schedule && onThen.has(l.schedule));
  const level = i >= 0 ? i : zone.levels.findIndex((l) => !l.schedule);
  return level === currentLevel(hass, zone) ? null : { at: new Date(at), level };
}

/** Level at a minute of a day, from the stored weeks. */
export function levelAt(zone: HeatingZone, schedules: Schedules, day: Day, minute: number): number {
  const i = zone.levels.findIndex((l) => l.schedule && isOnAt(schedules.get(l.schedule), day, minute));
  return i >= 0 ? i : zone.levels.findIndex((l) => !l.schedule);
}

function boundaries(zone: HeatingZone, schedules: Schedules, day: Day): number[] {
  const set = new Set([0]);
  for (const l of zone.levels) {
    for (const r of (l.schedule && schedules.get(l.schedule)?.[day]) || []) {
      set.add(minutes(r.from));
      set.add(endMinutes(r.to) % 1440);
    }
  }
  return [...set].sort((a, b) => a - b);
}

export interface Segment {
  from: number;
  to: number;
  level: number;
}

/** A day as stretches of one level each. */
export function daySegments(zone: HeatingZone, schedules: Schedules, day: Day): Segment[] {
  const marks = boundaries(zone, schedules, day);
  const out: Segment[] = [];
  marks.forEach((from, i) => {
    const to = marks[i + 1] ?? 1440;
    const level = levelAt(zone, schedules, day, from);
    const last = out[out.length - 1];
    if (last && last.level === level) last.to = to;
    else out.push({ from, to, level });
  });
  return out;
}

/** When the level changes next (within a week), and to which. */
export function nextChange(
  zone: HeatingZone,
  schedules: Schedules,
  now: Date,
): { at: Date; level: number } | null {
  const today = dayIndex(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const current = levelAt(zone, schedules, DAYS[today] as Day, nowMin);
  for (let offset = 0; offset <= 7; offset++) {
    const day = DAYS[(today + offset) % 7] as Day;
    for (const m of boundaries(zone, schedules, day)) {
      if (offset === 0 && m <= nowMin) continue;
      const level = levelAt(zone, schedules, day, m);
      if (level !== current) {
        const at = new Date(now);
        at.setDate(now.getDate() + offset);
        at.setHours(Math.floor(m / 60), m % 60, 0, 0);
        return { at, level };
      }
    }
  }
  return null;
}

// ---- guard ----

export const guards = (layout: Record<string, unknown> | undefined): Record<string, GuardRule> =>
  ((layout ?? {}) as { guards?: Record<string, GuardRule> }).guards ?? {};

/** Change one thermostat's rule; a rule that enforces nothing is removed. */
export function setGuard(
  layout: Record<string, unknown>,
  climate: string,
  patch: Partial<GuardRule>,
): Record<string, unknown> {
  const rule = defined<GuardRule>({ ...guards(layout)[climate], ...patch });
  const others = Object.fromEntries(Object.entries(guards(layout)).filter(([id]) => id !== climate));
  return { ...layout, guards: rule.lockMode || rule.keepMode ? { ...others, [climate]: rule } : others };
}

/** The thermostat's child lock: a switch or lock on the same device named like one. */
export function childLockOf(hass: HomeAssistant, climate: string): string | undefined {
  const device = hass.entities[climate]?.device_id;
  if (!device) return undefined;
  return Object.values(hass.entities)
    .filter((e) => e.device_id === device && /^(switch|lock)\./.test(e.entity_id))
    .map((e) => e.entity_id)
    .find((id) => /child_?lock|kindersicherung|lock$/i.test(objectId(id)));
}

export const isUnlocked = (hass: HomeAssistant, lock: string) => {
  const s = hass.states[lock]?.state;
  return lock.startsWith("lock.") ? s === "unlocked" || s === "open" : s === "off";
};
