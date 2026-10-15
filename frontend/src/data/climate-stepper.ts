// Collects repeated +/- taps on a thermostat and sends one service call.
// Keeps the new target visible meanwhile, so the number never jumps back.

import type { ReactiveController, ReactiveControllerHost } from "lit";
import { stepTarget } from "./home";
import type { HomeAssistant } from "../types/hass";

export const SEND_DELAY_MS = 700;

export class ClimateStepper implements ReactiveController {
  /** Target waiting to be sent, or null. */
  pending: number | null = null;
  #entityId: string | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly host: ReactiveControllerHost,
    private readonly hass: () => HomeAssistant | undefined,
  ) {
    host.addController(this);
  }

  /** Switch to another thermostat; sends what is pending for the old one first. */
  set entityId(id: string | undefined) {
    if (id === this.#entityId) return;
    this.flush();
    this.#entityId = id;
  }

  get entityId(): string | undefined {
    return this.#entityId;
  }

  step(direction: 1 | -1): void {
    const s = this.#entityId ? this.hass()?.states[this.#entityId] : undefined;
    if (!s) return;
    const base = this.pending ?? Number(s.attributes.temperature ?? s.attributes.current_temperature ?? 20);
    this.pending = stepTarget(s, base, direction);
    this.host.requestUpdate();
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.flush(), SEND_DELAY_MS);
  }

  flush(): void {
    clearTimeout(this.#timer);
    const hass = this.hass();
    const id = this.#entityId;
    const target = this.pending;
    if (!hass || !id || target === null) return;
    const s = hass.states[id];
    const data: Record<string, unknown> = { entity_id: id, temperature: target };
    // A thermostat that is off would ignore the new target; switch it to heating.
    if (s?.state === "off" && (s.attributes.hvac_modes as string[] | undefined)?.includes("heat")) {
      data.hvac_mode = "heat";
    }
    void hass.callService("climate", "set_temperature", data).finally(() => {
      if (this.pending === target) {
        this.pending = null;
        this.host.requestUpdate();
      }
    });
  }

  hostDisconnected(): void {
    this.flush();
  }
}
