// Doorbell: what rings, and which camera shows the door. Found automatically
// (doorbell event entities, "visitor" sensors) unless an admin set it.

import type { HomeAssistant } from "../types/hass";

export interface DoorbellLayout {
  /** Popup switched off. */
  off?: boolean;
  trigger?: string;
  camera?: string;
  /** How long the popup stays, seconds. */
  seconds?: number;
}

export interface Doorbell {
  trigger: string;
  camera: string | null;
  seconds: number;
}

/** Whole words in an entity id that mean "someone rang". */
const RING_WORDS = ["visitor", "besucher", "doorbell", "ding", "ring", "klingel", "klingelt"];

const domain = (id: string) => id.split(".")[0] ?? "";

export function doorbellCandidates(hass: HomeAssistant): string[] {
  return Object.keys(hass.states).filter((id) => {
    const s = hass.states[id];
    if (!s) return false;
    if (domain(id) === "event") return s.attributes.device_class === "doorbell";
    if (domain(id) !== "binary_sensor") return false;
    const key = (hass.entities[id]?.translation_key ?? "").toLowerCase();
    const words = id.toLowerCase().split(/[._]/);
    return key === "visitor" || RING_WORDS.some((w) => words.includes(w));
  });
}

function cameraFor(hass: HomeAssistant, trigger: string): string | null {
  const device = hass.entities[trigger]?.device_id;
  const cameras = Object.keys(hass.states).filter((id) => domain(id) === "camera");
  const same = device ? cameras.filter((id) => hass.entities[id]?.device_id === device) : [];
  // Prefer the main stream over a sub stream.
  const pick = (list: string[]) => list.find((id) => !/sub|fluent|low|snapshot/i.test(id)) ?? list[0];
  return pick(same) ?? pick(cameras.filter((id) => /door|tuer|tür|klingel|bell/i.test(id))) ?? null;
}

export function doorbell(hass: HomeAssistant, layout: Record<string, unknown> | undefined): Doorbell | null {
  const cfg = ((layout ?? {}) as { doorbell?: DoorbellLayout }).doorbell ?? {};
  if (cfg.off) return null;
  const trigger = cfg.trigger && hass.states[cfg.trigger] ? cfg.trigger : doorbellCandidates(hass)[0];
  if (!trigger) return null;
  const camera = cfg.camera && hass.states[cfg.camera] ? cfg.camera : cameraFor(hass, trigger);
  return { trigger, camera, seconds: cfg.seconds && cfg.seconds > 0 ? cfg.seconds : 60 };
}

/** Did this state change mean "someone rang"? */
export function isRing(entityId: string, before: string | undefined, after: string | undefined): boolean {
  if (!after || after === "unavailable" || after === "unknown" || after === before) return false;
  // Event entities: the state is the time of the last event, so any new value is a ring.
  if (domain(entityId) === "event") return before !== undefined;
  return after === "on";
}

export function setDoorbell(raw: Record<string, unknown>, patch: DoorbellLayout): Record<string, unknown> {
  const current = ((raw as { doorbell?: DoorbellLayout }).doorbell ?? {}) as DoorbellLayout;
  const next: Record<string, unknown> = { ...current, ...patch };
  for (const [k, v] of Object.entries(next))
    if (v === undefined || v === "" || v === false) next[k] = undefined;
  return { ...raw, doorbell: Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined)) };
}
