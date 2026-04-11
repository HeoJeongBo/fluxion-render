import { describe, expect, it } from "vitest";
import { formatClock, makeClockFormatter } from "./time-format";

function at(
  year: number,
  month: number,
  day: number,
  h: number,
  m: number,
  s: number,
  ms = 0,
): number {
  return new Date(year, month, day, h, m, s, ms).getTime();
}

describe("formatClock", () => {
  it("defaults: HH:mm:ss renders zero-padded", () => {
    const t = at(2026, 0, 1, 9, 7, 4);
    expect(formatClock(t, "HH:mm:ss")).toBe("09:07:04");
  });

  it("single-letter tokens are not padded", () => {
    const t = at(2026, 0, 1, 9, 7, 4);
    expect(formatClock(t, "H:m:s")).toBe("9:7:4");
  });

  it("SSS renders zero-padded milliseconds", () => {
    const t = at(2026, 0, 1, 12, 0, 0, 5);
    expect(formatClock(t, "HH:mm:ss.SSS")).toBe("12:00:00.005");
  });

  it("S renders the tenths digit", () => {
    const t = at(2026, 0, 1, 12, 0, 0, 480);
    expect(formatClock(t, "ss.S")).toBe("00.4");
  });

  it("non-token characters pass through as literals", () => {
    const t = at(2026, 0, 1, 14, 30, 45);
    // `:`, `.`, `/`, `T`, `Z` are not tokens and are preserved verbatim.
    expect(formatClock(t, "HH:mm:ss")).toBe("14:30:45");
    expect(formatClock(t, "HH/mm/ss")).toBe("14/30/45");
    expect(formatClock(t, "HH-mm-ss")).toBe("14-30-45");
  });

  it("token characters embedded in literal words get replaced (documented limitation)", () => {
    const t = at(2026, 0, 1, 14, 0, 0);
    // The `m` in "time" is a token and becomes minutes. This is documented;
    // use only non-token letters in literals.
    expect(formatClock(t, "time HH")).toBe("ti0e 14");
  });

  it("longest-token priority: HH over H, SSS over S", () => {
    const t = at(2026, 0, 1, 14, 30, 0, 789);
    expect(formatClock(t, "HH")).toBe("14");
    expect(formatClock(t, "SSS")).toBe("789");
  });

  it("makeClockFormatter returns a reusable function", () => {
    const fmt = makeClockFormatter("HH:mm");
    expect(fmt(at(2026, 0, 1, 14, 30, 0))).toBe("14:30");
    expect(fmt(at(2026, 0, 1, 8, 5, 0))).toBe("08:05");
  });
});
