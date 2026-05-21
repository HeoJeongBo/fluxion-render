import { describe, expect, it } from "vitest";
import { MetricChannel } from "./metric-channel";

describe("MetricChannel", () => {
  const channel = new MetricChannel("cpu-usage");

  it("has correct channelId and kind", () => {
    expect(channel.channelId).toBe("cpu-usage");
    expect(channel.kind).toBe("metric");
  });

  it("round-trips a metric without unit", () => {
    const sample = { name: "cpu", value: 72.4 };
    const decoded = channel.decode(channel.encode(sample));
    expect(decoded.name).toBe("cpu");
    expect(decoded.value).toBeCloseTo(72.4);
    expect(decoded.unit).toBeUndefined();
  });

  it("round-trips a metric with unit", () => {
    const sample = { name: "temperature", value: 36.6, unit: "°C" };
    const decoded = channel.decode(channel.encode(sample));
    expect(decoded).toEqual(sample);
  });

  it("encodes f64 value correctly (byte-level check)", () => {
    const sample = { name: "x", value: 1.0 };
    const buf = channel.encode(sample);
    const view = new DataView(buf);
    // f64 little-endian for 1.0 = 0x3FF0000000000000
    expect(view.getFloat64(0, true)).toBe(1.0);
  });

  it("handles integer value", () => {
    const sample = { name: "count", value: 100 };
    expect(channel.decode(channel.encode(sample)).value).toBe(100);
  });

  it("handles negative value", () => {
    const sample = { name: "diff", value: -42.5 };
    expect(channel.decode(channel.encode(sample)).value).toBeCloseTo(-42.5);
  });

  it("handles unicode name", () => {
    const sample = { name: "온도", value: 25.0, unit: "℃" };
    expect(channel.decode(channel.encode(sample))).toEqual(sample);
  });
});
