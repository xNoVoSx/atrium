import { describe, expect, it } from "vitest";
import { amortisation, energyConfig, liveEnergy, setEnergy, suggestEnergy, watts } from "../src/data/energy";
import { fakeHass, state } from "./fixtures";

const inv = "inverter";
const plug = "plug";

function solarHass() {
  const states = {
    "sensor.inv_pv1_power": state("sensor.inv_pv1_power", "318", {
      device_class: "power",
      unit_of_measurement: "W",
    }),
    "sensor.inv_pv2_power": state("sensor.inv_pv2_power", "306", {
      device_class: "power",
      unit_of_measurement: "W",
    }),
    "sensor.inv_output_power": state("sensor.inv_output_power", "612", {
      device_class: "power",
      unit_of_measurement: "W",
    }),
    "sensor.inv_three_or_single_phase_grid_output_power": state(
      "sensor.inv_three_or_single_phase_grid_output_power",
      "610",
      { device_class: "power", unit_of_measurement: "W" },
    ),
    "sensor.inv_total_generate_energy": state("sensor.inv_total_generate_energy", "689", {
      device_class: "energy",
      unit_of_measurement: "kWh",
    }),
    "sensor.inv_today_generate_energy": state("sensor.inv_today_generate_energy", "687", {
      device_class: "energy",
      unit_of_measurement: "kWh",
    }),
    "sensor.inv_inverter_temperature": state("sensor.inv_inverter_temperature", "31", {
      device_class: "temperature",
    }),
    "sensor.inv_grid_frequency": state("sensor.inv_grid_frequency", "50.02", { device_class: "frequency" }),
    "sensor.server_power": state("sensor.server_power", "48", {
      device_class: "power",
      unit_of_measurement: "W",
    }),
    "sensor.server_energy_today": state("sensor.server_energy_today", "1.1", { device_class: "energy" }),
    "sensor.server_energy_total": state("sensor.server_energy_total", "5229", { device_class: "energy" }),
    "sensor.lonely_power": state("sensor.lonely_power", "5", {
      device_class: "power",
      unit_of_measurement: "W",
    }),
  };
  const entities = Object.fromEntries(
    Object.keys(states).map((id) => [
      id,
      {
        entity_id: id,
        labels: [],
        device_id: id.includes("server") ? plug : id.includes("lonely") ? "x" : inv,
      },
    ]),
  );
  return fakeHass({
    states,
    entities,
    devices: { [plug]: { id: plug, name: "Server plug", name_by_user: null, area_id: null } },
  });
}

describe("suggestEnergy", () => {
  it("finds strings, output, lifetime counter, inverter readings and consumers", () => {
    expect(suggestEnergy(solarHass())).toEqual({
      pvPower: ["sensor.inv_pv1_power", "sensor.inv_pv2_power"],
      acPower: "sensor.inv_output_power",
      energyTotal: "sensor.inv_total_generate_energy",
      inverterTemp: "sensor.inv_inverter_temperature",
      gridFrequency: "sensor.inv_grid_frequency",
      forecastToday: undefined,
      forecastTomorrow: undefined,
      consumers: [{ power: "sensor.server_power", energy: "sensor.server_energy_total" }],
    });
  });

  it("lets saved settings win field by field", () => {
    const cfg = energyConfig(solarHass(), { energy: { acPower: "sensor.inv_pv1_power", price: 0.25 } });
    expect(cfg.acPower).toBe("sensor.inv_pv1_power");
    expect(cfg.price).toBe(0.25);
    expect(cfg.energyTotal).toBe("sensor.inv_total_generate_energy");
  });
});

describe("liveEnergy", () => {
  it("adds strings, computes loss, efficiency and share of peak", () => {
    const hass = solarHass();
    const live = liveEnergy(hass, { ...suggestEnergy(hass), peakKw: 0.9 });
    expect(live.dc).toBe(624);
    expect(live.ac).toBe(612);
    expect(live.loss).toBe(12);
    expect(live.efficiency).toBeCloseTo(0.981, 3);
    expect(live.ofPeak).toBeCloseTo(0.68, 2);
    expect(live.temp).toBe(31);
    expect(live.consumers.map((c) => c.watts)).toEqual([48]);
    expect(live.consumers[0]?.name).toBe("Server plug");
  });

  it("converts kW to W", () => {
    expect(watts(state("sensor.x", "1.5", { unit_of_measurement: "kW" }))).toBe(1500);
  });
});

describe("amortisation", () => {
  it("projects the payback date from the average so far", () => {
    const a = amortisation(
      689,
      { price: 0.25, purchaseCost: 450, installDate: "2026-03-15" },
      new Date("2026-10-15T12:00:00"),
    );
    expect(a?.earned).toBeCloseTo(172.25, 2);
    expect(a?.share).toBeCloseTo(0.383, 3);
    expect(a?.paybackDate && a.paybackDate > "2027-01-01").toBe(true);
  });

  it("needs a price and a cost", () => {
    expect(amortisation(689, {})).toBeNull();
  });
});

describe("setEnergy", () => {
  it("merges, and removes keys set to undefined", () => {
    const a = setEnergy({ order: { x: [] } }, { price: 0.3, acPower: "sensor.a" });
    expect(a).toEqual({ order: { x: [] }, energy: { price: 0.3, acPower: "sensor.a" } });
    expect(setEnergy(a, { acPower: undefined }).energy).toEqual({ price: 0.3 });
  });
});
