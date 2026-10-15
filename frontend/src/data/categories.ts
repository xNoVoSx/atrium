// The category pages: title, line below, icon, and who sees them.

import type { MessageKey } from "../i18n";
import { WI } from "../widgets/icons";
import type { Level } from "./levels";

export interface CategoryInfo {
  id: string;
  title: MessageKey;
  sub: MessageKey;
  icon: string;
  minLevel: Level;
}

export const CATEGORY_INFO: readonly CategoryInfo[] = [
  { id: "light", title: "section.lights", sub: "categories.lights", icon: WI.light, minLevel: "standard" },
  {
    id: "climate",
    title: "section.heating",
    sub: "categories.heating",
    icon: WI.climate,
    minLevel: "standard",
  },
  { id: "energy", title: "energy.title", sub: "energy.sub", icon: WI.energy, minLevel: "standard" },
  { id: "security", title: "security.title", sub: "security.sub", icon: WI.shield, minLevel: "standard" },
  { id: "media", title: "media.title", sub: "media.sub", icon: WI.media, minLevel: "standard" },
  {
    id: "batteries",
    title: "categories.batteries",
    sub: "categories.batteries_sub",
    icon: WI.battery,
    minLevel: "standard",
  },
  {
    id: "homelab",
    title: "categories.homelab",
    sub: "categories.homelab_sub",
    icon: WI.server,
    minLevel: "expert",
  },
];

export const categoryInfo = (id: string) => CATEGORY_INFO.find((c) => c.id === id);
