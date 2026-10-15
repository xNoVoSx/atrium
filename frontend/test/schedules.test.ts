import { describe, expect, it } from "vitest";
import { updatePayload } from "../src/widgets/elements/schedules";

describe("schedule editor", () => {
  it("sends all days, sorted, with seconds and without broken ranges", () => {
    const payload = updatePayload({
      id: "heat",
      name: "Heat",
      icon: "mdi:sofa",
      monday: [
        { from: "16:00", to: "22:00" },
        { from: "06:30:00", to: "08:00:00" },
      ],
      tuesday: [{ from: "10:00", to: "09:00" }],
    });
    expect(payload).toEqual({
      type: "schedule/update",
      schedule_id: "heat",
      name: "Heat",
      icon: "mdi:sofa",
      monday: [
        { from: "06:30:00", to: "08:00:00" },
        { from: "16:00:00", to: "22:00:00" },
      ],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
      saturday: [],
      sunday: [],
    });
  });
});

describe("schedules widget", () => {
  it("edits a day and saves through schedule/update", async () => {
    await import("../src/main");
    const { EntityStore } = await import("../src/data/entity-store");
    const { translator } = await import("../src/i18n");
    const { fakeHass, state } = await import("./fixtures");
    const sent: Array<Record<string, unknown>> = [];
    const base = fakeHass();
    const hass = {
      ...base,
      states: {
        ...base.states,
        "schedule.heat": state("schedule.heat", "on", {
          friendly_name: "Heat",
          next_event: "2026-10-15T19:00:00+02:00",
        }),
      },
      callWS: async <T>(msg: Record<string, unknown>): Promise<T> => {
        sent.push(msg);
        if (msg.type === "schedule/list")
          return [{ id: "heat", name: "Heat", monday: [{ from: "07:00:00", to: "19:00:00" }] }] as T;
        return null as T;
      },
    };
    const store = new EntityStore();
    store.update(hass);
    const el = document.createElement("atrium-schedules-widget") as HTMLElement & {
      ctx: unknown;
      config: unknown;
      updateComplete: Promise<boolean>;
    };
    el.ctx = { store, t: translator("en"), locale: "en", isAdmin: true, editing: false, level: "expert" };
    el.config = { id: "w1", type: "schedules" };
    document.body.append(el);
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;
    const root = el.shadowRoot as ShadowRoot;
    expect(root.querySelectorAll(".block").length).toBe(1);
    [...root.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Change")?.click();
    await el.updateComplete;
    const copy = [...root.querySelectorAll(".erow button")].find(
      (b) => b.textContent?.trim() === "to all days",
    ) as HTMLButtonElement;
    copy.click();
    await el.updateComplete;
    [...root.querySelectorAll(".eh button")]
      .find((b) => b.textContent?.trim() === "Save")
      ?.dispatchEvent(new MouseEvent("click"));
    await new Promise((r) => setTimeout(r, 0));
    const update = sent.find((m) => m.type === "schedule/update");
    expect(update?.schedule_id).toBe("heat");
    expect(update?.sunday).toEqual([{ from: "07:00:00", to: "19:00:00" }]);
    el.remove();
  });
});
