// Solar and consumption: which sensors to use (detected or chosen by an admin)
// and what to compute from them. Pure functions except the fetch helpers.

import { isAutoVisible, nameOf } from "./registry";
import type { HassEntity, HomeAssistant } from "../types/hass";

export interface EnergyConfig {
  /** Power of the PV strings (DC), W. */
  pvPower?: string[];
  /** Inverter output (AC), W. */
  acPower?: string;
  /** Lifetime production counter, kWh (statistics give daily values). */
  energyTotal?: string;
  inverterTemp?: string;
  gridFrequency?: string;
  /** Forecast sensors in kWh (e.g. Solcast, Forecast.Solar). */
  forecastToday?: string;
  forecastTomorrow?: string;
  /** Devices to show as consumers: power (W) and optionally an energy counter (kWh). */
  consumers?: Array<{ power: string; energy?: string; name?: string }>;
  peakKw?: number;
  /** Price per kWh that solar saves, €. */
  price?: number;
  /** Purchase cost of the system, €. */
  purchaseCost?: number;
  /** kg CO₂ per kWh of grid electricity. */
  co2PerKwh?: number;
  /** YYYY-MM-DD */
  installDate?: string;
}

const num = (s: HassEntity | undefined): number | null => {
  if (!s) return null;
  const n = Number(s.state);
  return s.state === "" || Number.isNaN(n) ? null : n;
};

const unitOf = (s: HassEntity) => String(s.attributes.unit_of_measurement ?? "");
const classOf = (s: HassEntity) => String(s.attributes.device_class ?? "");
const deviceOf = (hass: HomeAssistant, id: string) => hass.entities[id]?.device_id;

/** Watts, also when a sensor reports kW. */
export function watts(s: HassEntity | undefined): number | null {
  const n = num(s);
  if (n === null || !s) return null;
  return unitOf(s) === "kW" ? n * 1000 : n;
}

function sensorsOf(hass: HomeAssistant, deviceClass: string): HassEntity[] {
  return Object.values(hass.states).filter(
    (s) =>
      s.entity_id.startsWith("sensor.") && classOf(s) === deviceClass && isAutoVisible(hass, s.entity_id),
  );
}

/** Best guess of the sensors of a PV system, from names and devices. */
export function suggestEnergy(hass: HomeAssistant): EnergyConfig {
  const power = sensorsOf(hass, "power").filter((s) => ["W", "kW"].includes(unitOf(s)));
  const energy = sensorsOf(hass, "energy");
  const id = (s: HassEntity) => s.entity_id;

  const pvPower = power
    .map(id)
    .filter((e) => /(^|_)pv\d+_(input_)?power$|string_?\d+_power$/.test(e))
    .sort();
  const ac = power
    .map(id)
    .filter((e) => /(^|_)(output|ac|inverter)_power$/.test(e))
    .sort((a, b) => a.length - b.length)[0];
  const inverterDevice = ac ? deviceOf(hass, ac) : pvPower[0] ? deviceOf(hass, pvPower[0]) : undefined;
  const onInverter = (e: string) => inverterDevice !== undefined && deviceOf(hass, e) === inverterDevice;

  const energyTotal =
    energy
      .map(id)
      .filter((e) => /total_generate|generat\w*_total|pv_energy_total|yield_total|solar\w*_total/.test(e))
      .sort((a, b) => Number(/total_generate/.test(b)) - Number(/total_generate/.test(a)))[0] ??
    energy.map(id).find((e) => onInverter(e) && /total/.test(e));

  const temp = sensorsOf(hass, "temperature")
    .map(id)
    .filter((e) => onInverter(e))
    .sort((a, b) => Number(/inverter/.test(b)) - Number(/inverter/.test(a)))[0];
  const freq = sensorsOf(hass, "frequency")
    .map(id)
    .find((e) => onInverter(e));

  const forecast = energy.map(id).filter((e) => /solcast|forecast/.test(e));
  const forecastToday = forecast.find((e) => /today|heute/.test(e));
  const forecastTomorrow = forecast.find((e) => /tomorrow|morgen/.test(e));

  // Consumers: power sensors elsewhere, paired with an energy counter on the same device.
  const consumers = power
    .filter((s) => !onInverter(id(s)) && !pvPower.includes(id(s)))
    .map((s) => {
      const device = deviceOf(hass, id(s));
      const counters = energy.filter((e) => device && deviceOf(hass, id(e)) === device).map(id);
      const counter = counters.find((e) => !/today|yesterday|daily/.test(e)) ?? counters[0];
      return counter ? { power: id(s), energy: counter } : { power: id(s) };
    })
    .filter((c) => c.energy)
    .sort((a, b) => a.power.localeCompare(b.power));

  return {
    pvPower,
    acPower: ac,
    energyTotal,
    inverterTemp: temp,
    gridFrequency: freq,
    forecastToday,
    forecastTomorrow,
    consumers,
  };
}

/** Saved settings over detected ones: what an admin chose wins, field by field. */
export function energyConfig(hass: HomeAssistant, layout: Record<string, unknown> | undefined): EnergyConfig {
  const saved = ((layout ?? {}) as { energy?: EnergyConfig }).energy ?? {};
  const suggested = suggestEnergy(hass);
  const merged: EnergyConfig = { ...suggested };
  for (const [key, value] of Object.entries(saved)) {
    if (value !== undefined && value !== null && value !== "")
      (merged as Record<string, unknown>)[key] = value;
  }
  return merged;
}

export interface LiveEnergy {
  strings: Array<{ id: string; name: string; watts: number | null }>;
  dc: number | null;
  ac: number | null;
  loss: number | null;
  /** AC / DC, 0..1 */
  efficiency: number | null;
  /** AC / peak, 0..1 */
  ofPeak: number | null;
  temp: number | null;
  frequency: number | null;
  consumers: Array<{ id: string; name: string; watts: number | null }>;
}

export function liveEnergy(hass: HomeAssistant, cfg: EnergyConfig): LiveEnergy {
  const strings = (cfg.pvPower ?? []).map((id) => ({
    id,
    name: nameOf(hass, id),
    watts: watts(hass.states[id]),
  }));
  const known = strings.filter((s) => s.watts !== null);
  const dc = known.length ? known.reduce((sum, s) => sum + (s.watts ?? 0), 0) : null;
  const ac = cfg.acPower ? watts(hass.states[cfg.acPower]) : dc;
  const loss = dc !== null && ac !== null ? Math.max(0, dc - ac) : null;
  return {
    strings,
    dc,
    ac,
    loss,
    efficiency: dc && ac !== null && dc > 5 ? Math.min(1, ac / dc) : null,
    ofPeak: ac !== null && cfg.peakKw ? Math.min(1, ac / (cfg.peakKw * 1000)) : null,
    temp: cfg.inverterTemp ? num(hass.states[cfg.inverterTemp]) : null,
    frequency: cfg.gridFrequency ? num(hass.states[cfg.gridFrequency]) : null,
    consumers: (cfg.consumers ?? [])
      .map((c) => ({
        id: c.power,
        name: c.name ?? consumerName(hass, c.power),
        watts: watts(hass.states[c.power]),
      }))
      .sort((a, b) => (b.watts ?? -1) - (a.watts ?? -1)),
  };
}

/** A consumer is named after its device ("ServerStrom"), not its power sensor ("ServerStrom Power"). */
export function consumerName(hass: HomeAssistant, powerId: string): string {
  const device = hass.devices[deviceOf(hass, powerId) ?? ""];
  return device?.name_by_user || device?.name || nameOf(hass, powerId);
}

export const forecastKwh = (hass: HomeAssistant, id: string | undefined) =>
  id ? num(hass.states[id]) : null;

// ---- money and amortisation ----

export interface Amortisation {
  earned: number;
  cost: number;
  share: number;
  /** Expected payback date, YYYY-MM-DD, or null when unknown. */
  paybackDate: string | null;
}

/**
 * Money saved so far and when the system pays for itself, from the lifetime
 * production and the average production per day since installation.
 */
export function amortisation(
  totalKwh: number | null,
  cfg: EnergyConfig,
  today = new Date(),
): Amortisation | null {
  if (totalKwh === null || !cfg.price || !cfg.purchaseCost) return null;
  const earned = totalKwh * cfg.price;
  const share = Math.min(1, earned / cfg.purchaseCost);
  let paybackDate: string | null = null;
  if (cfg.installDate && earned > 0 && share < 1) {
    const days = Math.max(
      1,
      (today.getTime() - new Date(`${cfg.installDate}T00:00:00`).getTime()) / 86400000,
    );
    const perDay = earned / days;
    const remaining = (cfg.purchaseCost - earned) / perDay;
    const d = new Date(today.getTime() + remaining * 86400000);
    paybackDate = d.toISOString().slice(0, 10);
  }
  return { earned, cost: cfg.purchaseCost, share, paybackDate };
}

// ---- data from the recorder ----

export interface DailyValue {
  /** Local date YYYY-MM-DD */
  date: string;
  kwh: number;
}

interface StatRow {
  start: number;
  change?: number | null;
}

const localDay = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Daily production (or consumption) from long-term statistics. */
export async function fetchDaily(
  hass: HomeAssistant,
  statisticId: string,
  from: Date,
): Promise<DailyValue[]> {
  const result = await hass.callWS<Record<string, StatRow[]>>({
    type: "recorder/statistics_during_period",
    start_time: from.toISOString(),
    statistic_ids: [statisticId],
    period: "day",
    types: ["change"],
  });
  return (result[statisticId] ?? []).map((r) => ({
    date: localDay(r.start),
    kwh: Math.max(0, r.change ?? 0),
  }));
}

export interface PowerPoint {
  t: number;
  w: number;
}

/** Power history of one sensor in a time range (for the day curve). */
export async function fetchPowerHistory(
  hass: HomeAssistant,
  entityId: string,
  from: Date,
  to?: Date,
): Promise<PowerPoint[]> {
  const result = await hass.callWS<Record<string, Array<{ s: string; lu: number }>>>({
    type: "history/history_during_period",
    start_time: from.toISOString(),
    ...(to ? { end_time: to.toISOString() } : {}),
    entity_ids: [entityId],
    minimal_response: true,
    no_attributes: true,
  });
  const kw = unitOf(hass.states[entityId] ?? ({ attributes: {} } as HassEntity)) === "kW";
  return (result[entityId] ?? [])
    .map((p) => ({ t: p.lu * 1000, w: Number(p.s) * (kw ? 1000 : 1) }))
    .filter((p) => !Number.isNaN(p.w));
}

/**
 * Hourly mean power from long-term statistics. Detailed history is only kept
 * for a few days (recorder purge_keep_days); hourly means stay.
 */
export async function fetchHourlyMean(
  hass: HomeAssistant,
  entityId: string,
  from: Date,
  to: Date,
): Promise<PowerPoint[]> {
  const result = await hass.callWS<Record<string, Array<{ start: number; mean?: number | null }>>>({
    type: "recorder/statistics_during_period",
    start_time: from.toISOString(),
    end_time: to.toISOString(),
    statistic_ids: [entityId],
    period: "hour",
    types: ["mean"],
  });
  const kw = unitOf(hass.states[entityId] ?? ({ attributes: {} } as HassEntity)) === "kW";
  return (result[entityId] ?? [])
    .filter((r) => r.mean !== null && r.mean !== undefined)
    .map((r) => ({ t: r.start, w: (r.mean ?? 0) * (kw ? 1000 : 1) }));
}

/** Sum of daily values from a date on (YYYY-MM-DD, inclusive). */
export const sumFrom = (days: DailyValue[], from: string) =>
  days.filter((d) => d.date >= from).reduce((s, d) => s + d.kwh, 0);

/** Change some energy settings; undefined removes a key (back to automatic). */
export function setEnergy(
  raw: Record<string, unknown>,
  patch: Partial<EnergyConfig>,
): Record<string, unknown> {
  const removed = (v: unknown) => v === undefined || v === "" || (typeof v === "number" && Number.isNaN(v));
  const merged = { ...((raw.energy as EnergyConfig | undefined) ?? {}), ...patch };
  const energy = Object.fromEntries(Object.entries(merged).filter(([, v]) => !removed(v)));
  return { ...raw, energy };
}

/** Sensors of one device class, for pickers: id and name, sorted by name. */
export function sensorChoices(hass: HomeAssistant, deviceClass: string): Array<{ id: string; name: string }> {
  return Object.values(hass.states)
    .filter(
      (s) => s.entity_id.startsWith("sensor.") && String(s.attributes.device_class ?? "") === deviceClass,
    )
    .map((s) => ({ id: s.entity_id, name: nameOf(hass, s.entity_id) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
