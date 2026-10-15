// The original home modules as widgets.

import { html } from "lit";
import { suggestEnergy } from "../../data/energy";
import { climateZones, lightEntities, rooms, sceneEntities, wastePickups } from "../../data/home";
import { WI } from "../icons";
import type { WidgetDef } from "../types";

const areaOf = (o: Record<string, unknown> | undefined) =>
  typeof o?.area === "string" && o.area ? o.area : undefined;

export const CORE_WIDGETS: WidgetDef[] = [
  {
    type: "header",
    group: "overview",
    icon: WI.header,
    name: "module.header",
    description: "wd.header",
    size: "l",
    sizes: ["l"],
    minLevel: "simple",
    single: true,
    available: () => true,
    options: [{ key: "greeting", label: "wo.greeting", kind: "boolean" }],
    render: (ctx, c) => html`<atrium-header-module .ctx=${ctx} .config=${c}></atrium-header-module>`,
  },
  {
    type: "status",
    group: "overview",
    icon: WI.status,
    name: "module.status",
    description: "wd.status",
    size: "l",
    minLevel: "simple",
    single: true,
    available: () => true,
    render: (ctx) => html`<atrium-status-module .ctx=${ctx}></atrium-status-module>`,
  },
  {
    type: "climate",
    group: "comfort",
    icon: WI.climate,
    name: "module.climate",
    description: "wd.climate",
    size: "m",
    minLevel: "simple",
    available: (hass) => climateZones(hass).length > 0,
    options: [{ key: "area", label: "wo.area", kind: "area" }],
    render: (ctx, c) =>
      html`<atrium-climate-module .ctx=${ctx} .areaId=${areaOf(c.options)}></atrium-climate-module>`,
  },
  {
    type: "solar",
    group: "energy",
    icon: WI.solar,
    name: "module.solar",
    description: "wd.solar",
    size: "m",
    minLevel: "standard",
    available: (hass) => Boolean(suggestEnergy(hass).acPower || suggestEnergy(hass).pvPower?.length),
    render: (ctx) => html`<atrium-solar-module .ctx=${ctx}></atrium-solar-module>`,
  },
  {
    type: "lights",
    group: "comfort",
    icon: WI.light,
    name: "module.lights",
    description: "wd.lights",
    size: "m",
    minLevel: "simple",
    available: (hass) => lightEntities(hass).length > 0,
    options: [{ key: "area", label: "wo.area", kind: "area" }],
    render: (ctx, c) => {
      const area = areaOf(c.options);
      return area
        ? html`<atrium-lights-module .ctx=${ctx} .areaId=${area} compact></atrium-lights-module>`
        : html`<atrium-lights-module .ctx=${ctx} compact home></atrium-lights-module>`;
    },
  },
  {
    type: "scenes",
    group: "comfort",
    icon: WI.scenes,
    name: "module.scenes",
    description: "wd.scenes",
    size: "m",
    minLevel: "simple",
    available: (hass) => sceneEntities(hass).length > 0,
    render: (ctx, c) => html`<atrium-scenes-module .ctx=${ctx} .config=${c}></atrium-scenes-module>`,
  },
  {
    type: "waste",
    group: "household",
    icon: WI.waste,
    name: "module.waste",
    description: "wd.waste",
    size: "m",
    minLevel: "standard",
    available: (hass) => wastePickups(hass).length > 0,
    render: (ctx) => html`<atrium-waste-module .ctx=${ctx}></atrium-waste-module>`,
  },
  {
    type: "rooms",
    group: "overview",
    icon: WI.rooms,
    name: "module.rooms",
    description: "wd.rooms",
    size: "l",
    minLevel: "simple",
    available: (hass) => rooms(hass).length > 0,
    render: (ctx) => html`<atrium-rooms-module .ctx=${ctx}></atrium-rooms-module>`,
  },
];
