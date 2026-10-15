import { describe, expect, it } from "vitest";
import { translator } from "../src/i18n";

describe("translator", () => {
  it("uses German for de and regional variants", () => {
    expect(translator("de")("state.on")).toBe("An");
    expect(translator("de-AT")("state.on")).toBe("An");
  });

  it("falls back to English for unknown languages", () => {
    expect(translator("fr")("state.on")).toBe("On");
    expect(translator(undefined)("state.on")).toBe("On");
  });
});
