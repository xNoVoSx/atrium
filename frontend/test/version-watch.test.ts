import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VersionWatch, loadedHash } from "../src/data/version-watch";
import { fakeHass } from "./fixtures";

const hassWithHash = (hash: string) =>
  fakeHass({ callWS: (async () => ({ version: "1.0.0", frontend_hash: hash })) as never });

describe("loadedHash", () => {
  it("reads the hash from the module URL", () => {
    expect(loadedHash("http://ha.local/atrium_static/atrium.js?v=abc123")).toBe("abc123");
    expect(loadedHash("http://ha.local/atrium_static/atrium.js")).toBeNull();
  });
});

describe("VersionWatch", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("does nothing while the served file is the loaded one", async () => {
    const reload = vi.fn();
    const watch = new VersionWatch(() => hassWithHash("same"), {
      ownHash: "same",
      isBusy: () => false,
      reload,
    });
    await watch.check();
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads when a different file is served", async () => {
    const reload = vi.fn();
    const watch = new VersionWatch(() => hassWithHash("new"), {
      ownHash: "old",
      isBusy: () => false,
      reload,
    });
    await watch.check();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("waits until the user is done before reloading", async () => {
    const reload = vi.fn();
    let busy = true;
    const watch = new VersionWatch(() => hassWithHash("new"), { ownHash: "old", isBusy: () => busy, reload });
    await watch.check();
    expect(reload).not.toHaveBeenCalled();
    busy = false;
    vi.advanceTimersByTime(2000);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe("VersionWatch lifecycle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const connection = {
    subscribeEvents: async () => () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };

  it("checks once on start (the update event may have passed already)", async () => {
    const reload = vi.fn();
    const hass = { ...hassWithHash("new"), connection } as never;
    const watch = new VersionWatch(() => hass, { ownHash: "old", isBusy: () => false, reload });
    await watch.start();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("a stopped watch drops a pending reload", async () => {
    const reload = vi.fn();
    const watch = new VersionWatch(() => hassWithHash("new"), { ownHash: "old", isBusy: () => true, reload });
    await watch.check();
    watch.stop();
    vi.advanceTimersByTime(10000);
    expect(reload).not.toHaveBeenCalled();
  });
});
