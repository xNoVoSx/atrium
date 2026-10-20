// Who is where: persons (person.*) with the zone they are in, since when,
// and how far from home when the phone reports a position.

import type { HomeAssistant } from "../types/hass";
import { nameOf } from "./registry";

/** home, a named zone, away (no zone), or no position at all. */
export type PresenceKind = "home" | "zone" | "away" | "unknown";

export interface Presence {
  id: string;
  name: string;
  picture: string;
  kind: PresenceKind;
  /** The zone entity for home and named zones. */
  zone?: string;
  /** Zone name as Home Assistant reports it (the person's state). */
  place: string;
  /** Icon of the zone, e.g. "mdi:briefcase". */
  icon?: string;
  /** ISO time of the last change of place. */
  since: string;
  /** Distance to home in km, when both positions are known and the person is not home. */
  km?: number;
}

const KIND_ORDER: Record<PresenceKind, number> = { home: 0, zone: 1, away: 2, unknown: 3 };

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Great-circle distance in km. */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

/** The zone a person's state names: "home" is zone.home, other zones go by their name. */
function zoneOf(hass: HomeAssistant, place: string): string | undefined {
  if (place === "home") return hass.states["zone.home"] ? "zone.home" : undefined;
  return Object.keys(hass.states).find(
    (id) =>
      id.startsWith("zone.") &&
      (str(hass.states[id]?.attributes.friendly_name) === place || id === `zone.${place}`),
  );
}

export function presenceOf(hass: HomeAssistant, id: string): Presence | undefined {
  const s = hass.states[id];
  if (!s) return undefined;
  const place = s.state;
  const zone = place === "not_home" ? undefined : zoneOf(hass, place);
  const kind: PresenceKind =
    place === "home" ? "home" : place === "not_home" ? "away" : zone ? "zone" : "unknown";
  const home = hass.states["zone.home"]?.attributes;
  const lat = num(s.attributes.latitude);
  const lon = num(s.attributes.longitude);
  const homeLat = num(home?.latitude);
  const homeLon = num(home?.longitude);
  const km =
    kind !== "home" &&
    kind !== "unknown" &&
    lat !== undefined &&
    lon !== undefined &&
    homeLat !== undefined &&
    homeLon !== undefined
      ? distanceKm(lat, lon, homeLat, homeLon)
      : undefined;
  const icon = zone ? str(hass.states[zone]?.attributes.icon) || undefined : undefined;
  return {
    id,
    name: nameOf(hass, id),
    picture: str(s.attributes.entity_picture),
    kind,
    ...(zone ? { zone } : {}),
    place,
    ...(icon ? { icon } : {}),
    since: s.last_changed,
    ...(km !== undefined ? { km } : {}),
  };
}

/** Persons sorted: home first, then other zones, away, unknown; by name within. */
export function presences(hass: HomeAssistant, ids: string[]): Presence[] {
  return ids
    .map((id) => presenceOf(hass, id))
    .filter((p): p is Presence => Boolean(p))
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name));
}

export interface PresenceGroup {
  /** Zone entity, or "away" / "unknown". */
  key: string;
  kind: PresenceKind;
  place: string;
  icon?: string;
  people: Presence[];
}

/** People grouped by where they are, in the order of presences(). */
export function presenceGroups(people: Presence[]): PresenceGroup[] {
  const groups = new Map<string, PresenceGroup>();
  for (const p of people) {
    const key = p.zone ?? p.kind;
    const group = groups.get(key) ?? {
      key,
      kind: p.kind,
      place: p.place,
      ...(p.icon ? { icon: p.icon } : {}),
      people: [],
    };
    group.people.push(p);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** "800 m", "3.2 km", "41 km" in the locale's number format. */
export function formatDistance(km: number, locale: string): string {
  if (km < 1) return `${new Intl.NumberFormat(locale).format(Math.round(km * 10) * 100)} m`;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: km < 10 ? 1 : 0 }).format(km)} km`;
}
