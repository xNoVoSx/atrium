import { afterEach, describe, expect, it, vi } from "vitest";
import "../src/main";
import type { AtriumScreensaver } from "../src/components/screensaver";
import type { PanelContext } from "../src/context";
import { EntityStore } from "../src/data/entity-store";
import { translator } from "../src/i18n";
import { fakeHass } from "./fixtures";

function ctx(): PanelContext {
  const store = new EntityStore();
  store.update(fakeHass());
  return { store, t: translator("en"), locale: "en", level: "standard" } as unknown as PanelContext;
}

describe("screensaver", () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("appears after the idle time and a touch wakes it", async () => {
    vi.useFakeTimers();
    const el = document.createElement("atrium-screensaver") as AtriumScreensaver;
    el.ctx = ctx();
    el.minutes = 1;
    document.body.append(el);
    await el.updateComplete;
    vi.advanceTimersByTime(59_000);
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector(".saver")).toBeNull();
    vi.advanceTimersByTime(2_000);
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector(".saver")).not.toBeNull();
    window.dispatchEvent(new Event("pointerdown"));
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector(".saver")).toBeNull();
  });

  it("stays off when no time is set", async () => {
    vi.useFakeTimers();
    const el = document.createElement("atrium-screensaver") as AtriumScreensaver;
    el.ctx = ctx();
    document.body.append(el);
    vi.advanceTimersByTime(3_600_000);
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector(".saver")).toBeNull();
  });
});
