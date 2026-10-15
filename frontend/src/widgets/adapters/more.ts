// Adapters for energy prices, wallboxes, cars, weather warnings and air quality.

import type { Adapter, AdapterContext, DataModel, MetricGroup, Row, Tone } from "../types";
import {
  byDevice,
  compact,
  domainOf,
  fmt,
  keyOf,
  num,
  pctMetric,
  pick,
  platformEntities,
  unitOf,
  valueMetric,
} from "./util";

export const MORE_PLATFORMS = {
  price: ["nordpool", "tibber", "epex_spot", "awattar", "entsoe", "energyzero", "frank_energie"],
  charger: [
    "easee",
    "go_echarger",
    "goecharger_api2",
    "wallbox",
    "ocpp",
    "openwb",
    "keba",
    "zaptec",
    "ohme",
    "openevse",
    "evcc",
  ],
  vehicle: [
    "tesla_fleet",
    "teslemetry",
    "tessie",
    "bmw_connected_drive",
    "volkswagen_we_connect_id",
    "renault",
    "kia_uvo",
    "mercedes_me",
    "polestar",
    "skodaconnect",
    "smartcar",
  ],
  warnings: ["dwd_weather_warnings", "meteoalarm", "nina"],
} as const;

const numAttr = (v: unknown): number | null => {
  const n = Number(v);
  return v === null || v === undefined || v === "" || !Number.isFinite(n) ? null : n;
};

// ---- electricity price ----

export const priceAdapter: Adapter = (hass, ctx) => {
  const ids = platformEntities(hass, MORE_PLATFORMS.price).filter(
    (id) => domainOf(id) === "sensor" && /\/kwh/i.test(unitOf(hass.states[id])),
  );
  const id = pick(hass, ids, ["current", "price", "electricity"]) ?? ids[0];
  if (!id) return null;
  const s = hass.states[id];
  const attrs = s?.attributes ?? {};
  const now = num(s);
  const list = (attrs.today ?? attrs.prices_today ?? attrs.raw_today) as unknown[] | undefined;
  const values = Array.isArray(list)
    ? list
        .map((v) =>
          numAttr(
            typeof v === "object" && v !== null
              ? ((v as Record<string, unknown>).value ?? (v as Record<string, unknown>).price)
              : v,
          ),
        )
        .filter((v): v is number => v !== null)
    : [];
  const min = numAttr(attrs.min ?? attrs.min_price) ?? (values.length ? Math.min(...values) : null);
  const max = numAttr(attrs.max ?? attrs.max_price) ?? (values.length ? Math.max(...values) : null);
  const avg =
    numAttr(attrs.average ?? attrs.avg_price) ??
    (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
  const unit = unitOf(s);
  const pos =
    now !== null && min !== null && max !== null && max > min ? ((now - min) / (max - min)) * 100 : null;
  const tone: Tone = pos === null ? "info" : pos < 33 ? "ok" : pos < 66 ? "warn" : "bad";
  return {
    summary: compact([
      { label: ctx.t("w.price_now"), value: fmt(ctx.locale, now, 3), unit, pct: pos, tone, entityId: id },
      min !== null ? { label: ctx.t("w.price_min"), value: fmt(ctx.locale, min, 3), unit } : null,
      max !== null ? { label: ctx.t("w.price_max"), value: fmt(ctx.locale, max, 3), unit } : null,
      avg !== null ? { label: ctx.t("w.price_avg"), value: fmt(ctx.locale, avg, 3), unit } : null,
    ]),
    note:
      pos === null
        ? undefined
        : pos < 33
          ? ctx.t("w.price_cheap")
          : pos > 66
            ? ctx.t("w.price_dear")
            : undefined,
  };
};

// ---- wallbox ----

export const chargerAdapter: Adapter = (hass, ctx) => {
  const ids = platformEntities(hass, MORE_PLATFORMS.charger);
  if (!ids.length) return null;
  const groups: MetricGroup[] = byDevice(hass, ids).map((dev) => {
    const statusId = pick(hass, dev.ids, ["status", "charger_status", "car_state", "state"], "sensor");
    const status = statusId ? (hass.states[statusId]?.state ?? "") : "";
    const power = dev.ids.find((id) => hass.states[id]?.attributes.device_class === "power");
    const session = pick(
      hass,
      dev.ids.filter((id) => hass.states[id]?.attributes.device_class === "energy"),
      ["session", "charged", "added", "energy"],
    );
    const charging =
      /charg|lädt|laden/i.test(status) && !/not|fertig|complete|finished|disconnected/i.test(status);
    return {
      id: dev.deviceId || dev.name,
      name: dev.name,
      status: { label: status || "—", tone: charging ? "active" : status ? "ok" : "off" },
      metrics: compact([
        valueMetric(hass, power, ctx.t("w.power"), ctx.locale, 1),
        valueMetric(hass, session, ctx.t("w.session"), ctx.locale, 1),
      ]),
    };
  });
  const switches = ids.filter(
    (id) => domainOf(id) === "switch" && /charg|enable|is_enabled|allow/.test(keyOf(hass, id)),
  );
  return {
    groups,
    toggles: switches.slice(0, 2).map((id) => ({
      entityId: id,
      on: hass.states[id]?.state === "on",
      label: hass.entities[id]?.name ?? ctx.t("w.charging"),
    })),
  };
};

// ---- car ----

export const vehicleAdapter: Adapter = (hass, ctx) => {
  const ids = platformEntities(hass, MORE_PLATFORMS.vehicle);
  if (!ids.length) return null;
  const groups: MetricGroup[] = byDevice(hass, ids)
    .filter((dev) =>
      dev.ids.some(
        (id) =>
          hass.states[id]?.attributes.device_class === "battery" ||
          /range|fuel|battery/.test(keyOf(hass, id)),
      ),
    )
    .map((dev) => {
      const battery =
        dev.ids.find((id) => hass.states[id]?.attributes.device_class === "battery") ??
        pick(hass, dev.ids, ["battery_level", "state_of_charge", "soc"], "sensor");
      const range = pick(hass, dev.ids, ["range", "remaining_range", "battery_range"], "sensor");
      const charging = pick(hass, dev.ids, ["charging", "charge_state", "charger"]);
      const tracker = dev.ids.find((id) => domainOf(id) === "device_tracker");
      const chargingNow = charging ? ["on", "charging"].includes(hass.states[charging]?.state ?? "") : false;
      const where = tracker ? hass.states[tracker]?.state : undefined;
      return {
        id: dev.deviceId || dev.name,
        name: dev.name,
        sub: where === "home" ? ctx.t("w.at_home") : where === "not_home" ? ctx.t("w.away") : where,
        ...(chargingNow ? { status: { label: ctx.t("w.charging"), tone: "active" as Tone } } : {}),
        metrics: compact([
          (() => {
            const m = pctMetric(hass, battery, ctx.t("w.battery"), ctx.locale);
            return m
              ? {
                  ...m,
                  tone:
                    (m.pct ?? 0) < 20
                      ? ("bad" as Tone)
                      : (m.pct ?? 0) < 40
                        ? ("warn" as Tone)
                        : ("ok" as Tone),
                }
              : null;
          })(),
          valueMetric(hass, range, ctx.t("w.range"), ctx.locale, 0),
        ]),
      };
    });
  return groups.length ? { groups } : null;
};

// ---- weather warnings ----

export const warningsAdapter: Adapter = (hass, ctx) => {
  const ids = platformEntities(hass, MORE_PLATFORMS.warnings).filter(
    (id) => domainOf(id) === "sensor" || domainOf(id) === "binary_sensor",
  );
  if (!ids.length) return null;
  const rows: Row[] = [];
  let level = 0;
  for (const id of ids) {
    const s = hass.states[id];
    if (!s) continue;
    const a = s.attributes;
    const count = numAttr(a.warning_count) ?? 0;
    level = Math.max(level, numAttr(s.state) ?? 0);
    for (let i = 1; i <= count; i++) {
      const lvl = numAttr(a[`warning_${i}_level`]) ?? 1;
      rows.push({
        id: `${id}:${i}`,
        name: String(a[`warning_${i}_headline`] ?? a[`warning_${i}_name`] ?? ""),
        sub: String(a[`warning_${i}_description`] ?? "").slice(0, 140),
        tone: lvl >= 3 ? "bad" : lvl >= 2 ? "warn" : "info",
        entityId: id,
      });
    }
    // NINA and Meteoalarm: one binary sensor per warning.
    if (domainOf(id) === "binary_sensor" && s.state === "on") {
      level = Math.max(level, 2);
      rows.push({
        id,
        name: String(a.headline ?? a.event ?? a.friendly_name ?? id),
        sub: String(a.description ?? "").slice(0, 140),
        tone: "warn",
        entityId: id,
      });
    }
  }
  const tone: Tone = level >= 3 ? "bad" : level >= 1 ? "warn" : "ok";
  return {
    summary: [{ label: ctx.t("w.warn_level"), value: rows.length ? `${level}` : ctx.t("w.none"), tone }],
    rows,
    ...(rows.length ? {} : { note: ctx.t("w.no_warnings") }),
  };
};

// ---- air quality ----

const AIR: Record<string, [number, number]> = {
  carbon_dioxide: [1000, 1500],
  pm25: [25, 50],
  pm10: [50, 100],
  aqi: [100, 150],
  volatile_organic_compounds: [500, 1000],
  volatile_organic_compounds_parts: [500, 1000],
  nitrogen_dioxide: [100, 200],
};

export const airAdapter: Adapter = (hass, ctx) => {
  const ids = Object.keys(hass.states).filter((id) => {
    const cls = String(hass.states[id]?.attributes.device_class ?? "");
    return (
      domainOf(id) === "sensor" && cls in AIR && !hass.entities[id]?.hidden && !hass.entities[id]?.disabled_by
    );
  });
  if (!ids.length) return null;
  const rows: Row[] = ids
    .map((id) => {
      const s = hass.states[id];
      const v = num(s);
      const [warn, bad] = AIR[String(s?.attributes.device_class)] ?? [Infinity, Infinity];
      const tone: Tone = v === null ? "off" : v >= bad ? "bad" : v >= warn ? "warn" : "ok";
      const area = hass.entities[id]?.area_id ?? hass.devices[hass.entities[id]?.device_id ?? ""]?.area_id;
      return {
        id,
        name: String(s?.attributes.friendly_name ?? id),
        sub: area ? hass.areas[area]?.name : undefined,
        value: v === null ? (s?.state ?? "") : `${fmt(ctx.locale, v, 0)} ${unitOf(s)}`,
        tone,
        entityId: id,
      };
    })
    .sort(
      (a, b) => ["bad", "warn", "ok", "off"].indexOf(a.tone) - ["bad", "warn", "ok", "off"].indexOf(b.tone),
    );
  const badCount = rows.filter((r) => r.tone === "bad" || r.tone === "warn").length;
  return {
    summary: [
      {
        label: ctx.t("w.air_alerts"),
        value: `${badCount}`,
        unit: `/ ${rows.length}`,
        tone: badCount ? "warn" : "ok",
      },
    ],
    rows: rows.slice(0, 10),
  };
};

export const MORE_ADAPTERS: Record<string, Adapter> = {
  price: priceAdapter,
  charger: chargerAdapter,
  vehicle: vehicleAdapter,
  warnings: warningsAdapter,
  air: airAdapter,
};

export const MORE_DEMO: Record<string, (ctx: AdapterContext) => DataModel> = {
  price: (c) => ({
    summary: [
      { label: c.t("w.price_now"), value: "0,214", unit: "€/kWh", pct: 22, tone: "ok" },
      { label: c.t("w.price_min"), value: "0,182", unit: "€/kWh" },
      { label: c.t("w.price_max"), value: "0,331", unit: "€/kWh" },
      { label: c.t("w.price_avg"), value: "0,247", unit: "€/kWh" },
    ],
    note: c.t("w.price_cheap"),
  }),
  charger: (c) => ({
    groups: [
      {
        id: "1",
        name: "Wallbox",
        status: { label: "charging", tone: "active" },
        metrics: [
          { label: c.t("w.power"), value: "10,8", unit: "kW" },
          { label: c.t("w.session"), value: "14,2", unit: "kWh" },
        ],
      },
    ],
    toggles: [{ entityId: "switch.demo_wallbox", on: true, label: c.t("w.charging") }],
  }),
  vehicle: (c) => ({
    groups: [
      {
        id: "1",
        name: "Model 3",
        sub: c.t("w.at_home"),
        status: { label: c.t("w.charging"), tone: "active" },
        metrics: [
          { label: c.t("w.battery"), value: "64", unit: "%", pct: 64, tone: "ok" },
          { label: c.t("w.range"), value: "312", unit: "km" },
        ],
      },
    ],
  }),
  warnings: (c) => ({
    summary: [{ label: c.t("w.warn_level"), value: "2", tone: "warn" }],
    rows: [
      {
        id: "1",
        name: "Amtliche WARNUNG vor STURMBÖEN",
        sub: "Es treten Sturmböen mit Geschwindigkeiten um 75 km/h auf.",
        tone: "warn",
      },
    ],
  }),
  air: (c) => ({
    summary: [{ label: c.t("w.air_alerts"), value: "1", unit: "/ 3", tone: "warn" }],
    rows: [
      { id: "1", name: "CO₂ Schlafzimmer", value: "1.240 ppm", tone: "warn" },
      { id: "2", name: "Feinstaub draußen", value: "12 µg/m³", tone: "ok" },
      { id: "3", name: "CO₂ Büro", value: "620 ppm", tone: "ok" },
    ],
  }),
};
