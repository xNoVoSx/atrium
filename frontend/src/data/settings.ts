// Client for the settings stored by the integration (see websocket.py).

import type { HomeAssistant } from "../types/hass";

export interface AtriumSettings {
  /** Shared overrides of the automatic layout; changed by admins. */
  layout: Record<string, unknown>;
  /** The current user's own preferences. */
  user: Record<string, unknown>;
}

export interface AtriumInfo {
  version: string;
  frontend_hash: string;
}

export const fetchInfo = (hass: HomeAssistant) => hass.callWS<AtriumInfo>({ type: "atrium/info" });

export function subscribeSettings(
  hass: HomeAssistant,
  onChange: (settings: AtriumSettings) => void,
): Promise<() => Promise<void>> {
  return hass.connection.subscribeMessage<AtriumSettings>(onChange, { type: "atrium/settings/subscribe" });
}

export const saveLayout = (hass: HomeAssistant, layout: Record<string, unknown>) =>
  hass.callWS<null>({ type: "atrium/settings/set_layout", layout });

export const saveUserSettings = (hass: HomeAssistant, settings: Record<string, unknown>) =>
  hass.callWS<null>({ type: "atrium/settings/set_user", settings });
