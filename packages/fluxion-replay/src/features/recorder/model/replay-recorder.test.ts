import { describe, expect, it, vi } from "vitest";
import { LogChannel } from "../../../entities/log-channel/log-channel";
import { MetricChannel } from "../../../entities/metric-channel/metric-channel";
import { ReplayStore } from "../../store/model/replay-store";
import { ReplayRecorder, UnknownChannelError } from "./replay-recorder";

function makeStore(): ReplayStore {
  const store = new ReplayStore({ batchIntervalMs: 9999 });
  return store;
}

describe("ReplayRecorder", () => {
  it("does not record when not started", () => {
    const store = makeStore();
    const spy = vi.spyOn(store, "appendFrame");
    const recorder = new ReplayRecorder({
      channels: [new LogChannel("logs")],
      store,
    });
    recorder.record("logs", { level: "info" as const, message: "test" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("records after start()", () => {
    const store = makeStore();
    const spy = vi.spyOn(store, "appendFrame");
    const recorder = new ReplayRecorder({
      channels: [new LogChannel("logs")],
      store,
    });
    recorder.start();
    recorder.record("logs", { level: "info" as const, message: "hello" });
    expect(spy).toHaveBeenCalledOnce();
    expect(recorder.isRecording).toBe(true);
  });

  it("stops recording after stop()", () => {
    const store = makeStore();
    const spy = vi.spyOn(store, "appendFrame");
    const recorder = new ReplayRecorder({
      channels: [new LogChannel("logs")],
      store,
    });
    recorder.start();
    recorder.stop();
    recorder.record("logs", { level: "info" as const, message: "ignored" });
    expect(spy).not.toHaveBeenCalled();
    expect(recorder.isRecording).toBe(false);
  });

  it("throws for unknown channelId", () => {
    const store = makeStore();
    const recorder = new ReplayRecorder({ channels: [], store });
    recorder.start();
    expect(() => recorder.record("nonexistent", {})).toThrow("Unknown channel");
  });

  // Phase 20-A-4: typed error class so callers can `instanceof` rather than
  // grep the message.
  it("throws UnknownChannelError with channelId + availableChannelIds populated", () => {
    const store = makeStore();
    const recorder = new ReplayRecorder({
      channels: [new MetricChannel("cpu"), new MetricChannel("mem")],
      store,
    });
    recorder.start();
    let caught: unknown = null;
    try {
      recorder.record("cpuu", { name: "cpuu", value: 1 });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(UnknownChannelError);
    const err = caught as UnknownChannelError;
    expect(err.channelId).toBe("cpuu");
    expect(err.availableChannelIds).toEqual(["cpu", "mem"]);
    expect(err.message).toContain("cpuu");
    expect(err.message).toContain("cpu, mem");
  });

  it("uses provided timestamp", () => {
    const store = makeStore();
    const spy = vi.spyOn(store, "appendFrame");
    const recorder = new ReplayRecorder({
      channels: [new MetricChannel("cpu")],
      store,
    });
    recorder.start();
    recorder.record("cpu", { name: "cpu", value: 50 }, 12345);
    const frame = spy.mock.calls[0][0];
    expect(frame.t).toBe(12345);
  });

  it("uses Date.now() when timestamp not provided", () => {
    vi.useFakeTimers();
    vi.setSystemTime(99000);
    const store = makeStore();
    const spy = vi.spyOn(store, "appendFrame");
    const recorder = new ReplayRecorder({
      channels: [new MetricChannel("cpu")],
      store,
    });
    recorder.start();
    recorder.record("cpu", { name: "cpu", value: 10 });
    expect(spy.mock.calls[0][0].t).toBe(99000);
    vi.useRealTimers();
  });

  it("getRecentFrames returns frames in the time range", () => {
    const store = makeStore();
    const recorder = new ReplayRecorder({
      channels: [new MetricChannel("cpu")],
      store,
    });
    recorder.start();
    recorder.record("cpu", { name: "cpu", value: 1 }, 1000);
    recorder.record("cpu", { name: "cpu", value: 2 }, 2000);
    recorder.record("cpu", { name: "cpu", value: 3 }, 3000);

    const frames = recorder.getRecentFrames("cpu", 1500, 2500);
    expect(frames).toHaveLength(1);
    expect(frames[0].t).toBe(2000);
  });

  it("getRecentFrames filters by channelId", () => {
    const store = makeStore();
    const recorder = new ReplayRecorder({
      channels: [new MetricChannel("cpu"), new MetricChannel("mem")],
      store,
    });
    recorder.start();
    recorder.record("cpu", { name: "cpu", value: 1 }, 1000);
    recorder.record("mem", { name: "mem", value: 2 }, 1000);

    const frames = recorder.getRecentFrames("cpu", 0, 9999);
    expect(frames).toHaveLength(1);
    expect(frames[0].channelId).toBe("cpu");
  });

  it("evicts frames older than retentionMs", () => {
    const store = makeStore();
    const recorder = new ReplayRecorder({
      channels: [new MetricChannel("cpu")],
      store,
      retentionMs: 1000,
    });
    recorder.start();
    recorder.record("cpu", { name: "cpu", value: 1 }, 0);
    recorder.record("cpu", { name: "cpu", value: 2 }, 500);
    recorder.record("cpu", { name: "cpu", value: 3 }, 1001); // t=0 gets evicted (0 < 1001 - 1000 = 1)

    const frames = recorder.getRecentFrames("cpu", 0, 9999);
    expect(frames.some((f) => f.t === 0)).toBe(false);
    expect(frames.some((f) => f.t === 500)).toBe(true);
  });

  it("inserts into timeline index at indexIntervalMs intervals", () => {
    const store = makeStore();
    const recorder = new ReplayRecorder({
      channels: [new MetricChannel("cpu")],
      store,
      indexIntervalMs: 1000,
    });
    recorder.start();
    recorder.record("cpu", { name: "cpu", value: 1 }, 0);
    recorder.record("cpu", { name: "cpu", value: 2 }, 500); // within interval, not indexed
    recorder.record("cpu", { name: "cpu", value: 3 }, 1001); // beyond interval, indexed

    const indexed = recorder.index.range(0, 9999);
    expect(indexed).toContain(0);
    expect(indexed).not.toContain(500);
    expect(indexed).toContain(1001);
  });

  it("clear resets memory buffer and index", () => {
    const store = makeStore();
    const recorder = new ReplayRecorder({
      channels: [new MetricChannel("cpu")],
      store,
    });
    recorder.start();
    recorder.record("cpu", { name: "cpu", value: 1 }, 1000);
    recorder.clear();

    expect(recorder.getRecentFrames("cpu", 0, 9999)).toHaveLength(0);
    expect(recorder.index.earliest).toBeNull();
  });

  it("record() to multiple channels simultaneously", () => {
    const store = makeStore();
    const spy = vi.spyOn(store, "appendFrame");
    const recorder = new ReplayRecorder({
      channels: [new MetricChannel("cpu"), new LogChannel("logs")],
      store,
    });
    recorder.start();
    recorder.record("cpu", { name: "cpu", value: 10 }, 100);
    recorder.record("logs", { level: "info" as const, message: "hello" }, 100);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("record() with duplicate timestamps stores both frames", () => {
    const store = makeStore();
    const spy = vi.spyOn(store, "appendFrame");
    const recorder = new ReplayRecorder({
      channels: [new MetricChannel("cpu")],
      store,
    });
    recorder.start();
    recorder.record("cpu", { name: "cpu", value: 1 }, 500);
    recorder.record("cpu", { name: "cpu", value: 2 }, 500);
    expect(spy).toHaveBeenCalledTimes(2);
    const frames = recorder.getRecentFrames("cpu", 0, 9999);
    expect(frames).toHaveLength(2);
  });

  it("getRecentFrames() with empty buffer returns empty array", () => {
    const store = makeStore();
    const recorder = new ReplayRecorder({
      channels: [new MetricChannel("cpu")],
      store,
    });
    recorder.start();
    expect(recorder.getRecentFrames("cpu", 0, 9999)).toHaveLength(0);
  });

  it("record() unknown channel error includes available channels list", () => {
    const store = makeStore();
    const recorder = new ReplayRecorder({
      channels: [new MetricChannel("cpu"), new LogChannel("logs")],
      store,
    });
    recorder.start();
    expect(() => recorder.record("unknown", {})).toThrow(/cpu.*logs|logs.*cpu/);
  });
});
