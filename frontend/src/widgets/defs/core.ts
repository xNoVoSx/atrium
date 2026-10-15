// The original home modules as widgets.

import { html } from "lit";
import { suggestEnergy } from "../../data/energy";
import { climateZones, lightEntities, rooms, sceneEntities, wastePickups } from "../../data/home";
import { WI } from "../icons";
import type { LightVariant } from "../../modules/lights-module";
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
    variants: [
      ["standard", "v.standard"],
      ["centered", "v.centered"],
      ["line", "v.line"],
      ["big", "v.big"],
    ],
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
    variants: [
      ["standard", "v.standard"],
      ["chips", "v.chips"],
      ["cards", "v.cards"],
    ],
    render: (ctx, c) =>
      html`<atrium-status-module .ctx=${ctx} .variant=${c.options?.variant}></atrium-status-module>`,
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
    variants: [
      ["card", "v.card"],
      ["tiles", "v.tiles"],
      ["list", "v.list"],
      ["chips", "v.chips"],
      ["dial", "v.dial"],
      ["minimal", "v.minimal"],
    ],
    render: (ctx, c) =>
      html`<atrium-climate-module
        .ctx=${ctx}
        .areaId=${areaOf(c.options)}
        .variant=${c.options?.variant}
      ></atrium-climate-module>`,
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
    variants: [
      ["standard", "v.standard"],
      ["big", "v.big"],
      ["ring", "v.ring"],
    ],
    render: (ctx, c) =>
      html`<atrium-solar-module .ctx=${ctx} .variant=${c.options?.variant}></atrium-solar-module>`,
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
    variants: [
      ["compact", "v.compact"],
      ["square", "v.square"],
      ["list", "v.list"],
      ["buttons", "v.buttons"],
      ["slider", "v.slider"],
    ],
    render: (ctx, c) => {
      const area = areaOf(c.options);
      const style = (c.options?.variant ?? c.options?.style) as LightVariant | undefined;
      return area
        ? html`<atrium-lights-module
            .ctx=${ctx}
            .areaId=${area}
            .variant=${style}
            compact
          ></atrium-lights-module>`
        : html`<atrium-lights-module .ctx=${ctx} .variant=${style} compact home></atrium-lights-module>`;
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
    variants: [
      ["grid", "v.grid"],
      ["list", "v.list"],
      ["big", "v.big"],
      ["chips", "v.chips"],
    ],
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
    variants: [
      ["standard", "v.standard"],
      ["list", "v.list"],
      ["next", "v.next"],
    ],
    render: (ctx, c) =>
      html`<atrium-waste-module .ctx=${ctx} .variant=${c.options?.variant}></atrium-waste-module>`,
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
    variants: [
      ["squares", "v.squares"],
      ["list", "v.list"],
      ["cards", "v.cards"],
      ["chips", "v.chips"],
    ],
    render: (ctx, c) =>
      html`<atrium-rooms-module .ctx=${ctx} .variant=${c.options?.variant}></atrium-rooms-module>`,
  },
];
