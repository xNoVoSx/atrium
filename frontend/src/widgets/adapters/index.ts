// All adapters and their demo data, by key.

import type { HomeAssistant } from "../../types/hass";
import type { Adapter } from "../types";
import { DEMO as HOMELAB_DEMO, HOMELAB_ADAPTERS } from "./homelab";
import { HOUSE_ADAPTERS, HOUSE_DEMO } from "./house";

export const ADAPTERS: Record<string, Adapter> = { ...HOMELAB_ADAPTERS, ...HOUSE_ADAPTERS };
export const DEMO = { ...HOMELAB_DEMO, ...HOUSE_DEMO };

/** Does this house have anything for the adapter? */
export const adapterAvailable = (key: string, hass: HomeAssistant): boolean =>
  Boolean(ADAPTERS[key]?.(hass, { t: (k) => k, locale: "en", options: {} }));
