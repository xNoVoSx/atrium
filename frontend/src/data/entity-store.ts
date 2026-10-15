// Fans out `hass` updates to exactly the components that care.
//
// Home Assistant hands the panel a new `hass` object on every state change in
// the house. Re-rendering the whole page each time is what makes dashboards
// lag on weak tablets. The store compares state objects by identity (HA keeps
// unchanged ones) and only notifies listeners of entities that changed.
// Registry changes (areas, devices, hidden flags) notify structure listeners.

import type { ReactiveController, ReactiveControllerHost } from "lit";
import type { HassEntity, HomeAssistant } from "../types/hass";

type Listener = () => void;

export class EntityStore {
  #hass: HomeAssistant | undefined;
  #entityListeners = new Map<string, Set<Listener>>();
  #structureListeners = new Set<Listener>();

  get hass(): HomeAssistant | undefined {
    return this.#hass;
  }

  update(hass: HomeAssistant): void {
    const prev = this.#hass;
    this.#hass = hass;
    if (!prev) {
      this.#notifyAll();
      return;
    }
    const structureChanged =
      prev.entities !== hass.entities || prev.devices !== hass.devices || prev.areas !== hass.areas;
    if (structureChanged || Object.keys(prev.states).length !== Object.keys(hass.states).length) {
      this.#structureListeners.forEach((fn) => fn());
    }
    for (const [entityId, listeners] of this.#entityListeners) {
      if (prev.states[entityId] !== hass.states[entityId]) listeners.forEach((fn) => fn());
    }
  }

  state(entityId: string): HassEntity | undefined {
    return this.#hass?.states[entityId];
  }

  subscribeEntity(entityId: string, fn: Listener): () => void {
    const set = this.#entityListeners.get(entityId) ?? new Set();
    set.add(fn);
    this.#entityListeners.set(entityId, set);
    return () => {
      set.delete(fn);
      if (!set.size) this.#entityListeners.delete(entityId);
    };
  }

  subscribeStructure(fn: Listener): () => void {
    this.#structureListeners.add(fn);
    return () => this.#structureListeners.delete(fn);
  }

  #notifyAll(): void {
    this.#structureListeners.forEach((fn) => fn());
    this.#entityListeners.forEach((set) => set.forEach((fn) => fn()));
  }
}

/** Re-renders its host when one entity changes. */
export class EntityController implements ReactiveController {
  #unsubscribe: (() => void) | undefined;
  #entityId: string | undefined;

  constructor(
    private readonly host: ReactiveControllerHost,
    private readonly store: () => EntityStore | undefined,
  ) {
    host.addController(this);
  }

  get state(): HassEntity | undefined {
    return this.#entityId ? this.store()?.state(this.#entityId) : undefined;
  }

  /** Call from the host's willUpdate with the current entity id. */
  track(entityId: string | undefined): void {
    if (entityId === this.#entityId && this.#unsubscribe) return;
    this.#unsubscribe?.();
    this.#entityId = entityId;
    const store = this.store();
    this.#unsubscribe =
      entityId && store ? store.subscribeEntity(entityId, () => this.host.requestUpdate()) : undefined;
  }

  hostDisconnected(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
  }
}

/** Re-renders its host when the registries or the set of entities change. */
export class StructureController implements ReactiveController {
  #unsubscribe: (() => void) | undefined;

  constructor(
    private readonly host: ReactiveControllerHost,
    private readonly store: () => EntityStore | undefined,
  ) {
    host.addController(this);
  }

  /** Call from the host's willUpdate once the store is known. */
  attach(): void {
    if (this.#unsubscribe) return;
    this.#unsubscribe = this.store()?.subscribeStructure(() => this.host.requestUpdate());
  }

  hostDisconnected(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
  }
}
