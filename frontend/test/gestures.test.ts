import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClimateStepper, SEND_DELAY_MS } from "../src/data/climate-stepper";
import { attachSwipe } from "../src/util/swipe";
import { fakeHass, state } from "./fixtures";

function touch(type: string, x: number, y: number, target: HTMLElement) {
  const t = { clientX: x, clientY: y, identifier: 1, target } as unknown as Touch;
  const ev = new Event(type, { bubbles: true, composed: true }) as TouchEvent;
  Object.defineProperty(ev, "touches", { value: type === "touchend" ? [] : [t] });
  Object.defineProperty(ev, "changedTouches", { value: [t] });
  target.dispatchEvent(ev);
}

describe("attachSwipe", () => {
  function setup() {
    const el = document.createElement("div");
    const inner = document.createElement("div");
    el.append(inner);
    document.body.append(el);
    const onLeft = vi.fn();
    const onRight = vi.fn();
    attachSwipe(el, { onLeft, onRight });
    return { el, inner, onLeft, onRight };
  }

  it("a clear sideways swipe changes the room", () => {
    const { inner, onLeft, onRight } = setup();
    touch("touchstart", 300, 400, inner);
    touch("touchend", 150, 410, inner);
    expect(onLeft).toHaveBeenCalledTimes(1);
    touch("touchstart", 100, 400, inner);
    touch("touchend", 260, 395, inner);
    expect(onRight).toHaveBeenCalledTimes(1);
  });

  it("scrolling or a diagonal move does nothing", () => {
    const { inner, onLeft, onRight } = setup();
    touch("touchstart", 200, 600, inner);
    touch("touchend", 180, 200, inner);
    touch("touchstart", 300, 400, inner);
    touch("touchend", 220, 340, inner);
    expect(onLeft).not.toHaveBeenCalled();
    expect(onRight).not.toHaveBeenCalled();
  });

  it("swipes that start on a slider are left to the slider", () => {
    const { inner, onLeft } = setup();
    inner.classList.add("slider");
    touch("touchstart", 300, 400, inner);
    touch("touchend", 100, 400, inner);
    expect(onLeft).not.toHaveBeenCalled();
  });
});

describe("ClimateStepper", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("collects taps and sends one call; switches an off thermostat to heat", async () => {
    const callService = vi.fn(async () => undefined);
    const hass = fakeHass({
      states: {
        "climate.x": state("climate.x", "off", {
          temperature: 20,
          target_temp_step: 0.5,
          hvac_modes: ["off", "heat"],
        }),
      },
      callService,
    });
    const host = { addController: vi.fn(), requestUpdate: vi.fn() };
    const stepper = new ClimateStepper(host as never, () => hass);
    stepper.entityId = "climate.x";
    stepper.step(1);
    stepper.step(1);
    stepper.step(1);
    expect(stepper.pending).toBe(21.5);
    expect(callService).not.toHaveBeenCalled();
    vi.advanceTimersByTime(SEND_DELAY_MS);
    expect(callService).toHaveBeenCalledTimes(1);
    expect(callService).toHaveBeenCalledWith("climate", "set_temperature", {
      entity_id: "climate.x",
      temperature: 21.5,
      hvac_mode: "heat",
    });
  });

  it("sends what is pending before switching to another zone", () => {
    const callService = vi.fn(async () => undefined);
    const hass = fakeHass({
      states: {
        "climate.a": state("climate.a", "heat", { temperature: 20 }),
        "climate.b": state("climate.b", "heat", { temperature: 18 }),
      },
      callService,
    });
    const stepper = new ClimateStepper(
      { addController: vi.fn(), requestUpdate: vi.fn() } as never,
      () => hass,
    );
    stepper.entityId = "climate.a";
    stepper.step(-1);
    stepper.entityId = "climate.b";
    expect(callService).toHaveBeenCalledWith("climate", "set_temperature", {
      entity_id: "climate.a",
      temperature: 19.5,
    });
  });
});
