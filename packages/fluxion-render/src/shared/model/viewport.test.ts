import { describe, expect, it } from "vitest";
import { Viewport } from "./viewport";

describe("Viewport", () => {
  it("initializes with unit bounds and zero size", () => {
    const v = new Viewport();
    expect(v.widthPx).toBe(0);
    expect(v.heightPx).toBe(0);
    expect(v.dpr).toBe(1);
    expect(v.bounds).toEqual({ xMin: -1, xMax: 1, yMin: -1, yMax: 1 });
    expect(v.latestT).toBe(0);
  });

  it("latestT is a mutable monotonic field", () => {
    const v = new Viewport();
    v.latestT = 1000;
    expect(v.latestT).toBe(1000);
    v.latestT = 2500;
    expect(v.latestT).toBe(2500);
  });

  it("setSize updates dimensions and dpr", () => {
    const v = new Viewport();
    v.setSize(800, 600, 2);
    expect(v.widthPx).toBe(800);
    expect(v.heightPx).toBe(600);
    expect(v.dpr).toBe(2);
  });

  it("xToPx maps world x linearly", () => {
    const v = new Viewport();
    v.setSize(100, 100, 1);
    v.setBounds({ xMin: 0, xMax: 10, yMin: 0, yMax: 10 });
    expect(v.xToPx(0)).toBeCloseTo(0);
    expect(v.xToPx(10)).toBeCloseTo(100);
    expect(v.xToPx(5)).toBeCloseTo(50);
  });

  it("yToPx flips Y axis (world up -> screen down)", () => {
    const v = new Viewport();
    v.setSize(100, 100, 1);
    v.setBounds({ xMin: 0, xMax: 10, yMin: 0, yMax: 10 });
    expect(v.yToPx(0)).toBeCloseTo(100);
    expect(v.yToPx(10)).toBeCloseTo(0);
    expect(v.yToPx(5)).toBeCloseTo(50);
  });

  it("handles negative world bounds", () => {
    const v = new Viewport();
    v.setSize(200, 200, 1);
    v.setBounds({ xMin: -10, xMax: 10, yMin: -10, yMax: 10 });
    expect(v.xToPx(-10)).toBeCloseTo(0);
    expect(v.xToPx(10)).toBeCloseTo(200);
    expect(v.xToPx(0)).toBeCloseTo(100);
    expect(v.yToPx(0)).toBeCloseTo(100);
  });
});
