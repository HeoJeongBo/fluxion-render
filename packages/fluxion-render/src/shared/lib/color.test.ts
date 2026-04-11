import { describe, expect, it } from "vitest";
import { intensityLUT } from "./color";

describe("intensityLUT", () => {
  it("exposes 256-entry RGB ramps", () => {
    const lut = intensityLUT();
    expect(lut.size).toBe(256);
    expect(lut.r.length).toBe(256);
    expect(lut.g.length).toBe(256);
    expect(lut.b.length).toBe(256);
  });

  it("returns values within Uint8 range", () => {
    const lut = intensityLUT();
    for (let i = 0; i < lut.size; i++) {
      expect(lut.r[i]).toBeGreaterThanOrEqual(0);
      expect(lut.r[i]).toBeLessThanOrEqual(255);
      expect(lut.g[i]).toBeGreaterThanOrEqual(0);
      expect(lut.g[i]).toBeLessThanOrEqual(255);
      expect(lut.b[i]).toBeGreaterThanOrEqual(0);
      expect(lut.b[i]).toBeLessThanOrEqual(255);
    }
  });

  it("ends differ (ramp is non-trivial)", () => {
    const lut = intensityLUT();
    const first = [lut.r[0], lut.g[0], lut.b[0]];
    const last = [lut.r[255], lut.g[255], lut.b[255]];
    expect(first).not.toEqual(last);
  });

  it("returns a stable reference (precomputed)", () => {
    expect(intensityLUT()).toBe(intensityLUT());
  });
});
