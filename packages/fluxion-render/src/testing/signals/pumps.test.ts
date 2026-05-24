import { describe, expect, it } from "vitest";
import { createLinearRamp, createSineSynth } from "./pumps";

describe("createSineSynth", () => {
  it("returns a callable that produces finite numbers", () => {
    const f = createSineSynth();
    for (let i = 0; i < 100; i++) {
      const v = f(i * 50);
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("stays within the amplitude envelope when noise / drift are disabled", () => {
    const amp = 0.5;
    const f = createSineSynth({ amplitude: amp, drift: false, noise: 0 });
    // Sum of carrier (±amp) and harmonic (±amp*0.4) — bounded by 1.4 * amp.
    const bound = amp * (1 + 0.4) + 1e-6;
    for (let i = 0; i < 10_000; i++) {
      const v = f(i * 3);
      expect(Math.abs(v)).toBeLessThanOrEqual(bound);
    }
  });

  it("noiseSeed gives reproducible noise across instances", () => {
    const a = createSineSynth({ noiseSeed: 12345 });
    const b = createSineSynth({ noiseSeed: 12345 });
    for (let i = 0; i < 20; i++) {
      expect(a(i * 10)).toBe(b(i * 10));
    }
  });

  it("seriesOffset shifts the phase — two synths with different offsets disagree", () => {
    const a = createSineSynth({ seriesOffset: 0, noise: 0 });
    const b = createSineSynth({ seriesOffset: Math.PI / 2, noise: 0 });
    expect(a(100)).not.toBe(b(100));
  });
});

describe("createLinearRamp", () => {
  it("baseT anchors the ramp — value at baseT equals intercept", () => {
    const baseT = 1_000;
    const f = createLinearRamp({ slope: 2, intercept: 5, baseT });
    expect(f(baseT)).toBe(5);
  });

  it("each second of t increments the value by slope", () => {
    const f = createLinearRamp({ slope: 0.5, baseT: 0 });
    expect(f(0)).toBe(0);
    expect(f(1000)).toBe(0.5);
    expect(f(2000)).toBe(1);
    expect(f(60_000)).toBe(30);
  });

  it("default options produce a 1 unit/sec ramp from origin", () => {
    const f = createLinearRamp();
    expect(f(0)).toBe(0);
    expect(f(1000)).toBe(1);
  });

  it("negative t (relative to baseT) returns negative values", () => {
    const f = createLinearRamp({ slope: 1, baseT: 5_000 });
    expect(f(3_000)).toBe(-2);
  });
});
