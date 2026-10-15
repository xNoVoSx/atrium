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
