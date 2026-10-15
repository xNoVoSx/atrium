import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LONG_PRESS_MS, attachPress } from "../src/util/press";

function setup() {
  const el = document.createElement("button");
  document.body.append(el);
  const onTap = vi.fn();
  const onLongPress = vi.fn();
  attachPress(el, { onTap, onLongPress });
  return { el, onTap, onLongPress };
}

const pointer = (type: string, button = 0) =>
  new PointerEvent(type, { button, clientX: 10, clientY: 10, bubbles: true });

describe("attachPress", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("a short press is a tap", () => {
    const { el, onTap, onLongPress } = setup();
    el.dispatchEvent(pointer("pointerdown"));
    vi.advanceTimersByTime(100);
    el.dispatchEvent(pointer("pointerup"));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("holding is a long press and the following click is swallowed", () => {
    const { el, onTap, onLongPress } = setup();
    el.dispatchEvent(pointer("pointerdown"));
    vi.advanceTimersByTime(LONG_PRESS_MS + 10);
    el.dispatchEvent(pointer("pointerup"));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onTap).not.toHaveBeenCalled();
  });

  it("the touch context menu after a long press does not open twice", () => {
    const { el, onLongPress } = setup();
    el.dispatchEvent(pointer("pointerdown"));
    vi.advanceTimersByTime(LONG_PRESS_MS + 10);
    el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it("every right click opens the control, not just the first", () => {
    const { el, onLongPress } = setup();
    for (let i = 0; i < 3; i++) {
      el.dispatchEvent(pointer("pointerdown", 2));
      el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    }
    expect(onLongPress).toHaveBeenCalledTimes(3);
  });
});
