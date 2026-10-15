// Homelab and system widgets. All render through atrium-data-widget with an
// adapter; each has demo data so the catalogue can show it before the
// integration is installed.

import { html } from "lit";
import { adapterAvailable } from "../adapters";
import { PLATFORMS } from "../adapters/homelab";
import { MORE_PLATFORMS } from "../adapters/more";
import { WI } from "../icons";
import type { WidgetDef, WidgetGroup } from "../types";
import type { MessageKey } from "../../i18n";
import type { Level } from "../../data/levels";
import type { WidgetSize } from "../../data/pages";

export function dataWidget(
  adapter: string,
  group: WidgetGroup,
  icon: string,
  integrations: readonly string[],
  size: WidgetSize = "m",
  minLevel: Level = "expert",
): WidgetDef {
  return {
    type: adapter,
    group,
    icon,
    name: `wn.${adapter}` as MessageKey,
    description: `wd.${adapter}` as MessageKey,
    size,
    minLevel,
    integrations: [...integrations],
    demo: true,
    available: (hass) => adapterAvailable(adapter, hass),
    render: (ctx, c, demo) =>
      html`<atrium-data-widget
        .ctx=${ctx}
        .config=${c}
        .adapter=${adapter}
        ?demo=${demo}
      ></atrium-data-widget>`,
  };
}

export const HOMELAB_WIDGETS: WidgetDef[] = [
  dataWidget("unifi", "network", WI.network, PLATFORMS.unifi, "l"),
  dataWidget("router", "network", WI.router, PLATFORMS.router),
  dataWidget("speedtest", "network", WI.speed, PLATFORMS.speedtest, "m", "standard"),
  dataWidget("dns", "network", WI.shield, PLATFORMS.dns),
  dataWidget("vpn", "network", WI.vpn, PLATFORMS.vpn),
  dataWidget("zigbee", "network", WI.zigbee, ["zigbee2mqtt"]),
  dataWidget("proxmox", "server", WI.proxmox, PLATFORMS.proxmox, "l"),
  dataWidget("nas", "server", WI.nas, PLATFORMS.nas),
  dataWidget("system", "server", WI.server, PLATFORMS.system),
  dataWidget("containers", "server", WI.container, PLATFORMS.containers),
  dataWidget("uptime", "server", WI.pulse, PLATFORMS.uptime),
  dataWidget("ups", "server", WI.ups, PLATFORMS.ups),
  dataWidget("printer", "household", WI.printer, PLATFORMS.printer, "m", "standard"),
  dataWidget("updates", "server", WI.update, ["update"]),
  dataWidget("backup", "server", WI.backup, ["backup"]),
  dataWidget("price", "energy", WI.energy, MORE_PLATFORMS.price, "m", "standard"),
  dataWidget("charger", "energy", WI.ups, MORE_PLATFORMS.charger, "m", "standard"),
  dataWidget("vehicle", "energy", WI.battery, MORE_PLATFORMS.vehicle, "m", "simple"),
  dataWidget("warnings", "info", WI.alarm, MORE_PLATFORMS.warnings, "m", "simple"),
  dataWidget("air", "comfort", WI.water, ["sensor"], "m", "standard"),
];
