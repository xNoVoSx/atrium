// Pre-release builds write one line per page load into the Home Assistant log,
// describing what this client sees. Only for admins, so a user's phone can be
// debugged from the server log without access to the device.

import type { HomeAssistant } from "../types/hass";

export const isPreRelease = (version: string) => version.includes("-");

export function reportClient(hass: HomeAssistant, version: string, extra: Record<string, unknown>): void {
  if (!isPreRelease(version) || !hass.user?.is_admin) return;
  const report = {
    version,
    ua: navigator.userAgent,
    external: Boolean(hass.auth.external),
    viewport: `${innerWidth}x${innerHeight}`,
    entities: Object.keys(hass.entities).length,
    ...extra,
  };
  hass
    .callService("system_log", "write", {
      message: `atrium-diag ${JSON.stringify(report)}`,
      level: "warning",
      logger: "custom_components.atrium.frontend",
    })
    .catch(() => undefined);
}
