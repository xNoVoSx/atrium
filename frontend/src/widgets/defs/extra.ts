// Information, household, security, media and general-purpose widgets.

import { html } from "lit";
import { suggestEnergy } from "../../data/energy";
import { mediaPlayers } from "../../data/home";

const energyConfigured = (hass: HomeAssistant) =>
  suggestEnergy(hass).acPower || suggestEnergy(hass).pvPower?.length;
import type { Level } from "../../data/levels";
import type { WidgetInstance, WidgetSize } from "../../data/pages";
import type { MessageKey } from "../../i18n";
import type { HomeAssistant } from "../../types/hass";
import type { PanelContext } from "../../context";
import { visibleIds } from "../adapters/house";
import { WI } from "../icons";
import type { OptionField, WidgetDef, WidgetGroup } from "../types";
import { dataWidget } from "./homelab";

const has = (domains: string[]) => (hass: HomeAssistant) => visibleIds(hass, domains).length > 0;

const ENTITIES = (domains: string[]): OptionField => ({
  key: "entities",
  label: "wo.entities",
  kind: "entities",
  domains,
});
const AREA: OptionField = { key: "area", label: "wo.area", kind: "area" };

function el(
  type: string,
  tag: (ctx: PanelContext, c: WidgetInstance, demo: boolean) => ReturnType<typeof html>,
  group: WidgetGroup,
  icon: string,
  available: (hass: HomeAssistant) => boolean,
  extra: {
    size?: WidgetSize;
    minLevel?: Level;
    options?: OptionField[];
    integrations?: string[];
    demo?: boolean;
  } = {},
): WidgetDef {
  return {
    type,
    group,
    icon,
    name: `wn.${type}` as MessageKey,
    description: `wd.${type}` as MessageKey,
    size: extra.size ?? "m",
    minLevel: extra.minLevel ?? "standard",
    demo: extra.demo ?? true,
    available,
    ...(extra.options ? { options: extra.options } : {}),
    ...(extra.integrations ? { integrations: extra.integrations } : {}),
    render: tag,
  };
}

export const EXTRA_WIDGETS: WidgetDef[] = [
  // info
  el(
    "weather",
    (ctx, c, d) => html`<atrium-weather-widget .ctx=${ctx} .config=${c} ?demo=${d}></atrium-weather-widget>`,
    "info",
    WI.weather,
    has(["weather"]),
    {
      minLevel: "simple",
      options: [
        { key: "entity", label: "wo.entity", kind: "entity", domains: ["weather"] },
        {
          key: "forecast",
          label: "wo.forecast",
          kind: "select",
          choices: [
            ["daily", "wo.daily"],
            ["hourly", "wo.hourly"],
          ],
        },
      ],
    },
  ),
  el(
    "calendar",
    (ctx, c, d) =>
      html`<atrium-calendar-widget .ctx=${ctx} .config=${c} ?demo=${d}></atrium-calendar-widget>`,
    "info",
    WI.calendar,
    has(["calendar"]),
    {
      minLevel: "simple",
      options: [
        ENTITIES(["calendar"]),
        { key: "days", label: "wo.days", kind: "number", min: 1, max: 31 },
        { key: "max", label: "wo.max", kind: "number", min: 1, max: 30 },
      ],
    },
  ),
  el(
    "todo",
    (ctx, c, d) => html`<atrium-todo-widget .ctx=${ctx} .config=${c} ?demo=${d}></atrium-todo-widget>`,
    "info",
    WI.todo,
    has(["todo"]),
    {
      minLevel: "simple",
      options: [{ key: "entity", label: "wo.entity", kind: "entity", domains: ["todo"] }],
    },
  ),
  el(
    "persons",
    (ctx, c, d) => html`<atrium-persons-widget .ctx=${ctx} .config=${c} ?demo=${d}></atrium-persons-widget>`,
    "info",
    WI.person,
    has(["person"]),
    { minLevel: "simple" },
  ),
  el(
    "clock",
    (ctx, c, d) => html`<atrium-clock-widget .ctx=${ctx} .config=${c} ?demo=${d}></atrium-clock-widget>`,
    "info",
    WI.clock,
    () => true,
    {
      minLevel: "simple",
      options: [{ key: "seconds", label: "wo.seconds", kind: "boolean" }],
    },
  ),
  el(
    "sun",
    (ctx, c, d) => html`<atrium-sun-widget .ctx=${ctx} .config=${c} ?demo=${d}></atrium-sun-widget>`,
    "info",
    WI.sun,
    (hass) => "sun.sun" in hass.states,
    { size: "s" },
  ),
  el(
    "notifications",
    (ctx, c, d) =>
      html`<atrium-notifications-widget .ctx=${ctx} .config=${c} ?demo=${d}></atrium-notifications-widget>`,
    "info",
    WI.bell,
    () => true,
    {
      minLevel: "standard",
    },
  ),

  el(
    "activity",
    (ctx, c, d) =>
      html`<atrium-activity-widget .ctx=${ctx} .config=${c} ?demo=${d}></atrium-activity-widget>`,
    "info",
    WI.pulse,
    () => true,
    {
      options: [
        { key: "hours", label: "wo.hours", kind: "number", min: 1, max: 72 },
        { key: "max", label: "wo.max", kind: "number", min: 3, max: 30 },
      ],
    },
  ),
  el(
    "room",
    (ctx, c, d) =>
      html`<atrium-room-card-widget .ctx=${ctx} .config=${c} ?demo=${d}></atrium-room-card-widget>`,
    "overview",
    WI.rooms,
    (hass) => Object.keys(hass.areas).length > 0,
    {
      minLevel: "simple",
      options: [AREA],
    },
  ),

  el(
    "floorplan",
    (ctx, c, d) =>
      html`<atrium-floorplan-widget .ctx=${ctx} .config=${c} ?demo=${d}></atrium-floorplan-widget>`,
    "overview",
    WI.rooms,
    () => true,
    {
      size: "l",
      minLevel: "simple",
      options: [
        { key: "image", label: "wo.image", kind: "url", placeholder: "/local/floorplan.png" },
        { key: "ratio", label: "wo.ratio", kind: "number", min: 0.5, max: 4 },
      ],
    },
  ),

  el(
    "schedules",
    (ctx, c, d) =>
      html`<atrium-schedules-widget .ctx=${ctx} .config=${c} ?demo=${d}></atrium-schedules-widget>`,
    "comfort",
    WI.timer,
    (hass) => Object.keys(hass.states).some((id) => id.startsWith("schedule.")),
    {
      size: "l",
    },
  ),

  // household
  el(
    "covers",
    (ctx, c, d) => html`<atrium-covers-widget .ctx=${ctx} .config=${c} ?demo=${d}></atrium-covers-widget>`,
    "household",
    WI.cover,
    has(["cover"]),
    {
      minLevel: "simple",
      options: [AREA, ENTITIES(["cover"])],
    },
  ),
  el(
    "fans",
    (ctx, c, d) => html`<atrium-fans-widget .ctx=${ctx} .config=${c} ?demo=${d}></atrium-fans-widget>`,
    "comfort",
    WI.fan,
    has(["fan"]),
    { options: [AREA, ENTITIES(["fan"])] },
  ),
  el(
    "vacuum",
    (ctx, c, d) => html`<atrium-vacuum-widget .ctx=${ctx} .config=${c} ?demo=${d}></atrium-vacuum-widget>`,
    "household",
    WI.vacuum,
    has(["vacuum", "lawn_mower"]),
    {
      options: [ENTITIES(["vacuum", "lawn_mower"])],
    },
  ),
  el(
    "appliances",
    (ctx, c, d) =>
      html`<atrium-appliances-widget .ctx=${ctx} .config=${c} ?demo=${d}></atrium-appliances-widget>`,
    "household",
    WI.appliance,
    () => true,
    {
      options: [
        ENTITIES(["sensor"]),
        { key: "threshold", label: "wo.threshold", kind: "number", min: 1, max: 500 },
      ],
    },
  ),
  el(
    "timers",
    (ctx, c, d) => html`<atrium-timers-widget .ctx=${ctx} .config=${c} ?demo=${d}></atrium-timers-widget>`,
    "household",
    WI.timer,
    has(["timer"]),
    { options: [ENTITIES(["timer"])] },
  ),
  el(
    "switches",
    (ctx, c, d) =>
      html`<atrium-switches-widget .ctx=${ctx} .config=${c} ?demo=${d}></atrium-switches-widget>`,
    "household",
    WI.toggle,
    has(["switch", "input_boolean"]),
    {
      options: [
        AREA,
        ENTITIES(["switch", "input_boolean"]),
        { key: "max", label: "wo.max", kind: "number", min: 1, max: 40 },
      ],
    },
  ),
  el(
    "scripts",
    (ctx, c, d) => html`<atrium-scripts-widget .ctx=${ctx} .config=${c} ?demo=${d}></atrium-scripts-widget>`,
    "household",
    WI.script,
    has(["script", "automation"]),
    {
      minLevel: "expert",
      options: [
        {
          key: "kind",
          label: "wo.kind",
          kind: "select",
          choices: [
            ["script", "wo.scripts"],
            ["automation", "wo.automations"],
            ["both", "wo.both"],
          ],
        },
        ENTITIES(["script", "automation"]),
      ],
    },
  ),
  dataWidget("plants", "household", WI.plant, ["plant"], "m", "standard"),

  // security
  dataWidget("security", "security", WI.shield, ["binary_sensor", "lock"], "m", "simple"),
  el(
    "locks",
    (ctx, c, d) => html`<atrium-locks-widget .ctx=${ctx} .config=${c} ?demo=${d}></atrium-locks-widget>`,
    "security",
    WI.lock,
    has(["lock"]),
    {
      minLevel: "simple",
      options: [ENTITIES(["lock"])],
    },
  ),
  el(
    "alarm",
    (ctx, c, d) => html`<atrium-alarm-widget .ctx=${ctx} .config=${c} ?demo=${d}></atrium-alarm-widget>`,
    "security",
    WI.alarm,
    has(["alarm_control_panel"]),
    {
      minLevel: "simple",
      options: [ENTITIES(["alarm_control_panel"])],
    },
  ),
  el(
    "cameras",
    (ctx, c, d) => html`<atrium-cameras-widget .ctx=${ctx} .config=${c} ?demo=${d}></atrium-cameras-widget>`,
    "security",
    WI.camera,
    has(["camera"]),
    {
      size: "l",
      options: [ENTITIES(["camera"]), { key: "max", label: "wo.max", kind: "number", min: 1, max: 12 }],
    },
  ),

  // energy
  el(
    "energyflow",
    (ctx, c, d) =>
      html`<atrium-energy-flow-widget .ctx=${ctx} .config=${c} ?demo=${d}></atrium-energy-flow-widget>`,
    "energy",
    WI.energy,
    (hass) => Boolean(energyConfigured(hass)),
    {
      size: "l",
    },
  ),
  dataWidget("batteries", "energy", WI.battery, ["sensor"], "m", "standard"),

  // media
  el(
    "media",
    (ctx, c, d) => html`<atrium-media-widget .ctx=${ctx} .config=${c} ?demo=${d}></atrium-media-widget>`,
    "media",
    WI.media,
    (hass) => mediaPlayers(hass).length > 0,
    {
      demo: false,
      options: [ENTITIES(["media_player"]), { key: "all", label: "wo.all_players", kind: "boolean" }],
    },
  ),

  // general purpose
  el(
    "entities",
    (ctx, c, d) =>
      html`<atrium-entities-widget .ctx=${ctx} .config=${c} ?demo=${d}></atrium-entities-widget>`,
    "custom",
    WI.entities,
    () => true,
    {
      minLevel: "simple",
      demo: false,
      options: [ENTITIES([])],
    },
  ),
  el(
    "graph",
    (ctx, c, d) => html`<atrium-graph-widget .ctx=${ctx} .config=${c} ?demo=${d}></atrium-graph-widget>`,
    "custom",
    WI.graph,
    () => true,
    {
      options: [
        { key: "entity", label: "wo.entity", kind: "entity", domains: ["sensor", "input_number", "number"] },
        { key: "hours", label: "wo.hours", kind: "number", min: 1, max: 168 },
      ],
    },
  ),
  el(
    "gauge",
    (ctx, c, d) => html`<atrium-gauge-widget .ctx=${ctx} .config=${c} ?demo=${d}></atrium-gauge-widget>`,
    "custom",
    WI.gauge,
    () => true,
    {
      size: "s",
      options: [
        { key: "entity", label: "wo.entity", kind: "entity", domains: ["sensor", "input_number", "number"] },
        { key: "min", label: "wo.min", kind: "number" },
        { key: "max", label: "wo.max_value", kind: "number" },
        { key: "warn", label: "wo.warn", kind: "number" },
      ],
    },
  ),
  el(
    "note",
    (ctx, c, d) => html`<atrium-note-widget .ctx=${ctx} .config=${c} ?demo=${d}></atrium-note-widget>`,
    "custom",
    WI.note,
    () => true,
    {
      minLevel: "simple",
      options: [{ key: "text", label: "wo.text", kind: "text" }],
    },
  ),
  el(
    "links",
    (ctx, c, d) => html`<atrium-links-widget .ctx=${ctx} .config=${c} ?demo=${d}></atrium-links-widget>`,
    "custom",
    WI.link,
    () => true,
    {
      options: [{ key: "links", label: "wo.links", kind: "text", placeholder: "Energie | /energy" }],
    },
  ),
  el(
    "web",
    (ctx, c, d) => html`<atrium-web-widget .ctx=${ctx} .config=${c} ?demo=${d}></atrium-web-widget>`,
    "custom",
    WI.web,
    () => true,
    {
      minLevel: "expert",
      size: "l",
      options: [
        { key: "url", label: "wo.url", kind: "url" },
        { key: "height", label: "wo.height", kind: "number", min: 120, max: 2000 },
      ],
    },
  ),
];
