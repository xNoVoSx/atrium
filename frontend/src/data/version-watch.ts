// Reloads the page when a newer Atrium frontend is installed.
//
// Screens that stay open for days (wall tablets) would otherwise keep running
// old code. The integration serves the file under ?v=<content hash>; when the
// panel is re-registered (update, entry reload) HA fires `panels_updated`, and
// after a restart the connection becomes ready again. In both cases we ask the
// integration for the current hash and reload if it differs from ours.

import { fetchInfo } from "./settings";
import type { HomeAssistant } from "../types/hass";

/** Hash this module was loaded with, from its own URL. */
export function loadedHash(moduleUrl: string): string | null {
  return new URL(moduleUrl).searchParams.get("v");
}

export interface VersionWatchOptions {
  ownHash: string | null;
  /** True while the user is in the middle of something (open dialog, drag). */
  isBusy: () => boolean;
  reload?: () => void;
}

export class VersionWatch {
  #unsubscribe: Array<() => void> = [];
  #pending = false;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #stopped = false;

  constructor(
    private readonly hass: () => HomeAssistant | undefined,
    private readonly options: VersionWatchOptions,
  ) {}

  async start(): Promise<void> {
    const hass = this.hass();
    if (!hass || !this.options.ownHash) return;
    this.#stopped = false;
    const unsubEvent = await hass.connection.subscribeEvents(() => void this.check(), "panels_updated");
    const onReady = () => void this.check();
    hass.connection.addEventListener("ready", onReady);
    const onVisible = () => document.visibilityState === "visible" && void this.check();
    document.addEventListener("visibilitychange", onVisible);
    this.#unsubscribe.push(
      () => void unsubEvent(),
      () => hass.connection.removeEventListener("ready", onReady),
      () => document.removeEventListener("visibilitychange", onVisible),
    );
    // HA re-creates the panel element when its module URL changes; the new
    // element subscribes after that event, so it has to look once by itself.
    await this.check();
  }

  stop(): void {
    this.#stopped = true;
    this.#unsubscribe.forEach((fn) => fn());
    this.#unsubscribe = [];
    // A detached panel must not keep a reload pending (it may never become idle).
    clearTimeout(this.#timer);
    this.#pending = false;
  }

  async check(): Promise<void> {
    const hass = this.hass();
    if (!hass || this.#pending || this.#stopped) return;
    let info;
    try {
      info = await fetchInfo(hass);
    } catch {
      return; // integration reloading; the next event will try again
    }
    if (this.#stopped || info.frontend_hash === this.options.ownHash) return;
    this.#pending = true;
    this.#reloadWhenIdle();
  }

  #reloadWhenIdle(): void {
    if (this.#stopped) return;
    if (this.options.isBusy()) {
      this.#timer = setTimeout(() => this.#reloadWhenIdle(), 2000);
      return;
    }
    (this.options.reload ?? (() => location.reload()))();
  }
}
