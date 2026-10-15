// All widgets Atrium knows, looked up by type.

import { levelAllows, type Level } from "../data/levels";
import type { WidgetInstance } from "../data/pages";
import type { HomeAssistant } from "../types/hass";
import { CORE_WIDGETS } from "./defs/core";
import { EXTRA_WIDGETS } from "./defs/extra";
import { HOMELAB_WIDGETS } from "./defs/homelab";
import type { WidgetDef } from "./types";

export const WIDGETS: readonly WidgetDef[] = [...CORE_WIDGETS, ...EXTRA_WIDGETS, ...HOMELAB_WIDGETS];

const BY_TYPE = new Map(WIDGETS.map((w) => [w.type, w]));

export const widgetDef = (type: string): WidgetDef | undefined => BY_TYPE.get(type);

/** Does this widget instance show for a user of this level? */
export function widgetVisible(config: WidgetInstance, level: Level): boolean {
  if (config.disabled) return false;
  const def = widgetDef(config.type);
  if (!def) return false;
  return levelAllows(level, config.minLevel ?? def.minLevel);
}

/** Widgets that fit this house (integration present), for suggestions. */
export const availableWidgets = (hass: HomeAssistant) => WIDGETS.filter((w) => w.available(hass));
