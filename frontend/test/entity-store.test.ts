import { describe, expect, it, vi } from "vitest";
import { EntityStore } from "../src/data/entity-store";
import { fakeHass, state } from "./fixtures";

describe("EntityStore", () => {
  it("notifies only listeners of entities whose state object changed", () => {
    const hass = fakeHass();
    const store = new EntityStore();
    store.update(hass);
    const hall = vi.fn();
    const group = vi.fn();
    store.subscribeEntity("light.hall", hall);
    store.subscribeEntity("light.group", group);

    store.update({ ...hass, states: { ...hass.states, "light.hall": state("light.hall", "on") } });

    expect(hall).toHaveBeenCalledTimes(1);
    expect(group).not.toHaveBeenCalled();
  });

  it("notifies structure listeners when a registry changes, not on state changes", () => {
    const hass = fakeHass();
    const store = new EntityStore();
    store.update(hass);
    const structure = vi.fn();
    store.subscribeStructure(structure);

    store.update({ ...hass, states: { ...hass.states, "light.hall": state("light.hall", "on") } });
    expect(structure).not.toHaveBeenCalled();

    store.update({ ...hass, entities: { ...hass.entities } });
    expect(structure).toHaveBeenCalledTimes(1);
  });

  it("notifies structure listeners when entities appear or disappear", () => {
    const hass = fakeHass();
    const store = new EntityStore();
    store.update(hass);
    const structure = vi.fn();
    store.subscribeStructure(structure);

    store.update({ ...hass, states: { ...hass.states, "light.new": state("light.new", "on") } });
    expect(structure).toHaveBeenCalledTimes(1);
  });

  it("stops notifying after unsubscribe", () => {
    const hass = fakeHass();
    const store = new EntityStore();
    store.update(hass);
    const fn = vi.fn();
    const unsubscribe = store.subscribeEntity("light.hall", fn);
    unsubscribe();
    store.update({ ...hass, states: { ...hass.states, "light.hall": state("light.hall", "on") } });
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("EntityStore hiding", () => {
  it("hides Atrium-hidden entities and areas, but not in edit mode", () => {
    const store = new EntityStore();
    store.update(fakeHass());
    const structure = vi.fn();
    store.subscribeStructure(structure);

    store.setHidden(new Set(["light.hall"]), new Set(["office"]), true);
    expect(store.hass?.entities["light.hall"]?.hidden).toBe(true);
    expect(store.hass?.areas.office).toBeUndefined();
    expect(store.rawHass?.entities["light.hall"]?.hidden).toBeUndefined();
    expect(structure).toHaveBeenCalled();

    store.setHidden(new Set(["light.hall"]), new Set(["office"]), false);
    expect(store.hass?.entities["light.hall"]?.hidden).toBeUndefined();
    expect(store.hass?.areas.office).toBeDefined();
  });

  it("keeps the derived maps stable across state-only updates", () => {
    const hass = fakeHass();
    const store = new EntityStore();
    store.update(hass);
    store.setHidden(new Set(["light.hall"]), new Set(), true);
    const entities = store.hass?.entities;
    const structure = vi.fn();
    store.subscribeStructure(structure);
    store.update({ ...hass, states: { ...hass.states, "light.group": state("light.group", "off") } });
    expect(store.hass?.entities).toBe(entities);
    expect(structure).not.toHaveBeenCalled();
  });
});
