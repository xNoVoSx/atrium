// Adapters and helpers for household widgets.

import { areaIdOf, isAutoVisible, nameOf } from "../../data/registry";
import { batteries, securityContent } from "../../data/home";
import type { HomeAssistant } from "../../types/hass";
import type { Adapter, AdapterContext, DataModel, Row } from "../types";
import { compact, domainOf, fmt, num } from "./util";

const toNumber = (v: unknown): number | null => {
  const n = Number(v);
  return v === null || v === undefined || v === "" || !Number.isFinite(n) ? null : n;
};

/** Visible entities of some domains, optionally in one area, by name. */
export function visibleIds(hass: HomeAssistant, domains: readonly string[], area?: string): string[] {
  return Object.keys(hass.states)
    .filter((id) => domains.includes(domainOf(id)) && isAutoVisible(hass, id))
    .filter((id) => !area || areaIdOf(hass, id) === area)
    .sort((a, b) => nameOf(hass, a).localeCompare(nameOf(hass, b)));
}

/** The entities chosen in the widget's options, else the automatic list. */
export function chosenOr(
  hass: HomeAssistant,
  options: Record<string, unknown>,
  domains: readonly string[],
): string[] {
  const chosen = Array.isArray(options.entities)
    ? (options.entities as unknown[]).filter((x): x is string => typeof x === "string" && x in hass.states)
    : [];
  if (chosen.length) return chosen;
  const area = typeof options.area === "string" && options.area ? options.area : undefined;
  return visibleIds(hass, domains, area);
}

export const securityAdapter: Adapter = (hass, ctx) => {
  const c = securityContent(hass);
  const open = c.openings.filter((id) => hass.states[id]?.state === "on");
  const motion = c.motion.filter((id) => hass.states[id]?.state === "on");
  const unlocked = c.locks.filter((id) => hass.states[id]?.state === "unlocked");
  const gatesOpen = c.garages.filter((g) => g.open);
  if (!c.openings.length && !c.locks.length && !c.garages.length && !c.alarms.length) return null;
  const rows: Row[] = [
    ...gatesOpen.map((g) => ({
      id: g.entityId,
      name: nameOf(hass, g.entityId),
      value: ctx.t("status.open"),
      tone: "bad" as const,
      entityId: g.entityId,
    })),
    ...open.map((id) => ({
      id,
      name: nameOf(hass, id),
      value: ctx.t("status.open"),
      tone: "warn" as const,
      entityId: id,
    })),
    ...unlocked.map((id) => ({
      id,
      name: nameOf(hass, id),
      value: ctx.t("w.unlocked"),
      tone: "warn" as const,
      entityId: id,
    })),
  ];
  const alarm = c.alarms[0];
  return {
    summary: compact([
      {
        label: ctx.t("w.open_now"),
        value: `${open.length + gatesOpen.length}`,
        tone: open.length + gatesOpen.length ? "warn" : "ok",
      },
      c.locks.length
        ? {
            label: ctx.t("w.unlocked"),
            value: `${unlocked.length}`,
            unit: `/ ${c.locks.length}`,
            tone: unlocked.length ? "warn" : "ok",
          }
        : null,
      c.motion.length ? { label: ctx.t("w.motion_now"), value: `${motion.length}`, tone: "info" } : null,
      alarm
        ? { label: ctx.t("security.alarm"), value: hass.states[alarm]?.state ?? "—", entityId: alarm }
        : null,
    ]),
    rows,
    ...(rows.length ? {} : { note: ctx.t("w.all_closed") }),
  };
};

export const batteriesAdapter: Adapter = (hass, ctx) => {
  const list = batteries(hass);
  if (!list.length) return null;
  const low = list.filter((b) => b.low);
  const shown = (low.length ? low : list.slice(0, 4)).map((b) => ({
    id: b.entityId,
    name: nameOf(hass, b.entityId),
    value: b.value !== null ? `${fmt(ctx.locale, b.value, 0)} %` : b.low ? "!" : "OK",
    tone: b.low ? ("bad" as const) : ("ok" as const),
    pct: b.value,
    entityId: b.entityId,
  }));
  return {
    summary: [
      {
        label: ctx.t("w.low"),
        value: `${low.length}`,
        unit: `/ ${list.length}`,
        tone: low.length ? "bad" : "ok",
      },
    ],
    rows: shown,
  };
};

export const plantsAdapter: Adapter = (hass, ctx) => {
  const ids = Object.keys(hass.states).filter(
    (id) =>
      domainOf(id) === "plant" ||
      (domainOf(id) === "sensor" && hass.states[id]?.attributes.device_class === "moisture"),
  );
  if (!ids.length) return null;
  return {
    rows: ids.map((id) => {
      const s = hass.states[id];
      const v = domainOf(id) === "plant" ? toNumber(s?.attributes.moisture) : num(s);
      const tone =
        domainOf(id) === "plant" ? (s?.state === "ok" ? "ok" : "warn") : v !== null && v < 20 ? "warn" : "ok";
      return {
        id,
        name: nameOf(hass, id),
        value: v !== null ? `${fmt(ctx.locale, v, 0)} %` : (s?.state ?? ""),
        tone,
        pct: v,
        entityId: id,
      };
    }),
  };
};

export const HOUSE_ADAPTERS: Record<string, Adapter> = {
  security: securityAdapter,
  batteries: batteriesAdapter,
  plants: plantsAdapter,
};

export const HOUSE_DEMO: Record<string, (ctx: AdapterContext) => DataModel> = {
  security: (c) => ({
    summary: [
      { label: c.t("w.open_now"), value: "1", tone: "warn" },
      { label: c.t("w.unlocked"), value: "0", unit: "/ 2", tone: "ok" },
      { label: c.t("w.motion_now"), value: "2", tone: "info" },
    ],
    rows: [{ id: "1", name: "Terrassentür", value: c.t("status.open"), tone: "warn" }],
  }),
  batteries: (c) => ({
    summary: [{ label: c.t("w.low"), value: "1", unit: "/ 14", tone: "bad" }],
    rows: [{ id: "1", name: "Bewegungsmelder Flur", value: "8 %", tone: "bad", pct: 8 }],
  }),
  plants: () => ({
    rows: [
      { id: "1", name: "Monstera", value: "41 %", tone: "ok", pct: 41 },
      { id: "2", name: "Basilikum", value: "12 %", tone: "warn", pct: 12 },
    ],
  }),
};
