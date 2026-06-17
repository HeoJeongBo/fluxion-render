import { describe, expect, it } from "vitest";
import {
  buildGradientLut,
  buildLut,
  HOT_LUT,
  hexToRgb,
  lutFor,
  PLASMA_LUT,
  VIRIDIS_LUT,
} from "./colormap";

describe("colormap", () => {
  it("buildLut produces a 256*3 byte ramp between stops", () => {
    const lut = buildLut([
      [0, 0, 0, 0],
      [1, 255, 255, 255],
    ]);
    expect(lut.length).toBe(256 * 3);
    expect(lut[0]).toBe(0);
    expect(lut[255 * 3]).toBe(255);
    // midpoint is roughly grey
    expect(lut[128 * 3]).toBeGreaterThan(100);
    expect(lut[128 * 3]).toBeLessThan(160);
  });

  it("hexToRgb parses 6-digit and 3-digit hex", () => {
    expect(hexToRgb("#ff8800")).toEqual([255, 136, 0]);
    expect(hexToRgb("#f80")).toEqual([255, 136, 0]);
  });

  it("buildGradientLut interpolates two hex colors end-to-end", () => {
    const lut = buildGradientLut("#000000", "#ffffff");
    expect(lut.length).toBe(256 * 3);
    expect(lut[0]).toBe(0);
    expect(lut[255 * 3]).toBe(255);
    expect(lut[255 * 3 + 2]).toBe(255);
  });

  it("lutFor resolves names and defaults to viridis", () => {
    expect(lutFor("viridis")).toBe(VIRIDIS_LUT);
    expect(lutFor("plasma")).toBe(PLASMA_LUT);
    expect(lutFor("hot")).toBe(HOT_LUT);
    expect(lutFor(undefined)).toBe(VIRIDIS_LUT);
  });
});
