import { describe, expect, it, vi } from "vitest";
import { createNoisyMetricProducer, createRandomLogProducer } from "./producers";

describe("createRandomLogProducer", () => {
  it("returns { level, message } drawn from the provided pools", () => {
    const produce = createRandomLogProducer({
      messages: ["only-message"],
      levels: ["warn"],
      rng: () => 0,
    });
    expect(produce(123)).toEqual({ level: "warn", message: "only-message" });
  });

  it("picks by index = floor(rng * len)", () => {
    // rng=0.5, 4 levels → index 2 ("warn"); 2 messages → index 1
    const produce = createRandomLogProducer({
      messages: ["a", "b"],
      levels: ["info", "info", "warn", "error"],
      rng: () => 0.5,
    });
    const out = produce(0);
    expect(out.level).toBe("warn");
    expect(out.message).toBe("b");
  });

  it("fires onEmit with the wallT and generated entry", () => {
    const onEmit = vi.fn();
    const produce = createRandomLogProducer({
      messages: ["m"],
      levels: ["info"],
      rng: () => 0,
      onEmit,
    });
    produce(999);
    expect(onEmit).toHaveBeenCalledWith({ t: 999, level: "info", message: "m" });
  });

  it("defaults to the info-weighted level set", () => {
    // index 0 and 1 both map to "info" with the default levels
    const produce = createRandomLogProducer({ messages: ["m"], rng: () => 0 });
    expect(produce(0).level).toBe("info");
  });
});

describe("createNoisyMetricProducer", () => {
  it("computes base + rng*amplitude rounded to digits", () => {
    const produce = createNoisyMetricProducer({
      name: "cpu",
      base: 30,
      amplitude: 50,
      rng: () => 0.5,
    });
    expect(produce(0)).toEqual({ name: "cpu", value: 55 }); // 30 + 0.5*50 = 55
  });

  it("respects the digits option", () => {
    const produce = createNoisyMetricProducer({
      name: "mem",
      base: 40,
      amplitude: 1,
      digits: 2,
      rng: () => 0.333,
    });
    expect(produce(0).value).toBeCloseTo(40.33, 2);
  });

  it("fires onEmit with the wallT and sample", () => {
    const onEmit = vi.fn();
    const produce = createNoisyMetricProducer({
      name: "cpu",
      base: 0,
      amplitude: 0,
      rng: () => 0,
      onEmit,
    });
    produce(42);
    expect(onEmit).toHaveBeenCalledWith({ t: 42, name: "cpu", value: 0 });
  });
});
