import { describe, expect, it } from "vitest";
import { DASH_PATTERNS, dashPatternFor } from "./dash-patterns";

describe("dashPatternFor", () => {
  it("returns solid (empty) for index 0", () => {
    expect(dashPatternFor(0)).toEqual([]);
  });

  it("matches each palette entry by index", () => {
    for (let i = 0; i < DASH_PATTERNS.length; i++) {
      expect(dashPatternFor(i)).toEqual([...DASH_PATTERNS[i]!]);
    }
  });

  it("cycles past the end of the palette", () => {
    expect(dashPatternFor(DASH_PATTERNS.length)).toEqual(dashPatternFor(0));
    expect(dashPatternFor(DASH_PATTERNS.length + 1)).toEqual(dashPatternFor(1));
  });

  it("returns a fresh copy (mutating the result does not affect the palette)", () => {
    const a = dashPatternFor(1);
    a.push(999);
    expect(dashPatternFor(1)).not.toContain(999);
  });
});
