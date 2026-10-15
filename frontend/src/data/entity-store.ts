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
  /** The view components read: raw hass with Atrium-hidden entities/areas applied. */
  #hass: HomeAssistant | undefined;
  #raw: HomeAssistant | undefined;
  #hiddenEntities = new Set<string>();
  #hiddenAreas = new Set<string>();
  #applyHidden = true;
  // Memo so the derived maps keep their identity while nothing changes.
  #memo: {
    rawEntities?: HomeAssistant["entities"];
    rawAreas?: HomeAssistant["areas"];
    entities?: HomeAssistant["entities"];
    areas?: HomeAssistant["areas"];
  } = {};
  #entityListeners = new Map<string, Set<Listener>>();
  #structureListeners = new Set<Listener>();
  #anyListeners = new Set<Listener>();

  get hass(): HomeAssistant | undefined {
    return this.#hass;
  }

  /** Home Assistant's object without Atrium's own hiding. */
  get rawHass(): HomeAssistant | undefined {
    return this.#raw;
  }

  /**
   * Entities and areas hidden in Atrium. With apply=false (edit mode) they
   * stay visible so they can be brought back.
   */
  setHidden(entities: Set<string>, areas: Set<string>, apply: boolean): void {
    const same = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));
    if (
      same(entities, this.#hiddenEntities) &&
      same(areas, this.#hiddenAreas) &&
      apply === this.#applyHidden
    ) {
      return;
    }
    this.#hiddenEntities = new Set(entities);
    this.#hiddenAreas = new Set(areas);
    this.#applyHidden = apply;
    this.#memo = {};
    if (this.#raw) this.update(this.#raw);
  }

  #derive(raw: HomeAssistant): HomeAssistant {
    if (!this.#applyHidden || (!this.#hiddenEntities.size && !this.#hiddenAreas.size)) return raw;
    const memo = this.#memo;
    if (memo.rawEntities !== raw.entities || !memo.entities) {
      const entities = { ...raw.entities };
      for (const id of this.#hiddenEntities) {
        entities[id] = { ...(entities[id] ?? { entity_id: id, labels: [] }), hidden: true };
      }
      memo.rawEntities = raw.entities;
      memo.entities = entities;
    }
    if (memo.rawAreas !== raw.areas || !memo.areas) {
      memo.rawAreas = raw.areas;
      memo.areas = Object.fromEntries(Object.entries(raw.areas).filter(([id]) => !this.#hiddenAreas.has(id)));
    }
    return { ...raw, entities: memo.entities, areas: memo.areas };
  }

  update(raw: HomeAssistant): void {
    this.#raw = raw;
    const prev = this.#hass;
    const hass = this.#derive(raw);
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
    if (structureChanged || prev.states !== hass.states) this.#anyListeners.forEach((fn) => fn());
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

  /** Called on every change; pair with a selector that decides whether it matters. */
  subscribeAny(fn: Listener): () => void {
    this.#anyListeners.add(fn);
    return () => this.#anyListeners.delete(fn);
  }

  #notifyAll(): void {
    this.#anyListeners.forEach((fn) => fn());
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

/**
 * Derives a value from `hass` and re-renders its host only when that value
 * changes (compared as JSON). For modules that depend on many entities.
 */
export class SelectorController<T> implements ReactiveController {
  #unsubscribe: (() => void) | undefined;
  #value: T | undefined;
  #key = "";

  constructor(
    private readonly host: ReactiveControllerHost,
    private readonly store: () => EntityStore | undefined,
    private readonly select: (hass: HomeAssistant) => T,
  ) {
    host.addController(this);
  }

  get value(): T | undefined {
    return this.#value;
  }

  /** Call from the host's willUpdate once the store is known. */
  attach(): void {
    if (this.#unsubscribe) return;
    const store = this.store();
    if (!store) return;
    this.#unsubscribe = store.subscribeAny(() => this.#recompute(true));
    this.#recompute(false);
  }

  /** Recompute now, e.g. when inputs outside `hass` changed (settings, edit mode). */
  refresh(): void {
    if (this.#unsubscribe) this.#recompute(false);
  }

  #recompute(notify: boolean): void {
    const hass = this.store()?.hass;
    if (!hass) return;
    const value = this.select(hass);
    const key = JSON.stringify(value);
    if (key === this.#key) return;
    this.#key = key;
    this.#value = value;
    if (notify) this.host.requestUpdate();
  }

  hostDisconnected(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    this.#key = "";
  }
}
