import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LogChannel } from "../../../entities/log-channel/log-channel";
import { MetricChannel } from "../../../entities/metric-channel/metric-channel";
import { createReplaySession } from "../lib/create-replay-session";
import { ReplaySession } from "./replay-session";

describe("ReplaySession", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("createReplaySession returns a ReplaySession", () => {
    const session = createReplaySession({ channels: [] });
    expect(session).toBeInstanceOf(ReplaySession);
    session.dispose();
  });

  it("starts in live mode", () => {
    const session = new ReplaySession({ channels: [] });
    expect(session.mode).toBe("live");
    session.dispose();
  });

  it("open() resolves without error", async () => {
    const session = new ReplaySession({ channels: [] });
    await expect(session.open()).resolves.toBeUndefined();
    session.dispose();
  });

  it("startRecording enables recording", async () => {
    const session = new ReplaySession({ channels: [new MetricChannel("cpu")] });
    await session.open();
    await session.startRecording();
    expect(session.recorder.isRecording).toBe(true);
    session.dispose();
  });

  it("stopRecording disables recording", async () => {
    const session = new ReplaySession({ channels: [new MetricChannel("cpu")] });
    await session.open();
    await session.startRecording();
    session.stopRecording();
    expect(session.recorder.isRecording).toBe(false);
    session.dispose();
  });

  it("record() delegates to recorder", async () => {
    const session = new ReplaySession({ channels: [new LogChannel("logs")] });
    await session.open();
    await session.startRecording();
    const spy = vi.spyOn(session.recorder, "record");
    session.record("logs", { level: "info" as const, message: "test" });
    expect(spy).toHaveBeenCalledOnce();
    session.dispose();
  });

  it("enterReplay() returns a ReplayPlayer and switches to replay mode", async () => {
    const session = new ReplaySession({ channels: [] });
    await session.open();
    const player = await session.enterReplay();
    expect(session.mode).toBe("replay");
    expect(session.player).toBe(player);
    session.dispose();
  });

  it("exitReplay() returns to live mode", async () => {
    const session = new ReplaySession({ channels: [] });
    await session.open();
    await session.enterReplay();
    session.exitReplay();
    expect(session.mode).toBe("live");
    expect(session.player).toBeNull();
    session.dispose();
  });

  it("getTimeRange() returns null when no data", async () => {
    const session = new ReplaySession({ channels: [] });
    await session.open();
    const range = await session.getTimeRange();
    expect(range).toBeNull();
    session.dispose();
  });

  it("enterReplay() with timestamp seeks to that position", async () => {
    const session = new ReplaySession({ channels: [] });
    await session.open();
    const player = await session.enterReplay(5000);
    expect(session.mode).toBe("replay");
    expect(player).not.toBeNull();
    session.dispose();
  });

  it("enterReplay() clamps a caller-supplied timeRange into the IDB range", async () => {
    const session = new ReplaySession({ channels: [new MetricChannel("cpu")] });
    await session.open();
    await session.startRecording();
    // Record so IDB has a real [1000, 3000] range.
    session.record("cpu", { name: "cpu", value: 1 }, 1000);
    session.record("cpu", { name: "cpu", value: 2 }, 3000);
    await session.store.flush();

    // Caller asks for [0, 5000] — wider than IDB; should clamp to [1000, 3000].
    const player = await session.enterReplay(2000, {
      timeRange: { earliest: 0, latest: 5000 },
    });
    expect(player.timeRange.earliest).toBe(1000);
    expect(player.timeRange.latest).toBe(3000);
    session.dispose();
  });

  it("enterReplay() uses the caller timeRange directly when IDB is empty", async () => {
    const session = new ReplaySession({ channels: [new MetricChannel("cpu")] });
    await session.open();
    // No frames → getTimeRange() is null → the `idbRange ? … : opts.timeRange`
    // false branch uses the caller range as-is.
    const player = await session.enterReplay(1500, {
      timeRange: { earliest: 1000, latest: 2000 },
    });
    expect(player.timeRange.earliest).toBe(1000);
    expect(player.timeRange.latest).toBe(2000);
    session.dispose();
  });

  it("dispose() stops recording and disposes player", async () => {
    const session = new ReplaySession({ channels: [] });
    await session.open();
    await session.startRecording();
    await session.enterReplay();
    const stopSpy = vi.spyOn(session.recorder, "stop");
    session.dispose();
    expect(stopSpy).toHaveBeenCalled();
    expect(session.player).toBeNull();
  });

  it("record() continues working after enterReplay()", async () => {
    const session = new ReplaySession({ channels: [new LogChannel("logs")] });
    await session.open();
    await session.startRecording();
    await session.enterReplay();
    // record() should still forward to the recorder, not crash
    expect(() =>
      session.record("logs", { level: "info" as const, message: "hello" }),
    ).not.toThrow();
    session.dispose();
  });

  it("getStorageInfo() returns StorageInfo with numeric fields", async () => {
    const session = new ReplaySession({ channels: [] });
    await session.open();
    const info = await session.getStorageInfo();
    expect(typeof info.usedBytes).toBe("number");
    expect(typeof info.quotaBytes).toBe("number");
    expect(typeof info.percentUsed).toBe("number");
    expect(typeof info.idbFrameCount).toBe("number");
    session.dispose();
  });

  it("getSegments() returns empty array before recording starts", async () => {
    const session = new ReplaySession({ channels: [] });
    await session.open();
    expect(session.getSegments()).toEqual([]);
    session.dispose();
  });

  it("getSegments() reflects started segment during recording", async () => {
    const session = new ReplaySession({ channels: [] });
    await session.open();
    await session.startRecording();
    const segs = session.getSegments();
    expect(segs.length).toBeGreaterThanOrEqual(1);
    expect(segs[0]).toHaveProperty("start");
    session.dispose();
  });

  // Phase 13: enterReplay must flush the recorder's pending batch before
  // computing the player's timeRange — otherwise the last ~500ms of just-
  // recorded frames are invisible to the player and the chart shows a tail
  // gap right at the moment the user entered DVR.
  describe("Phase 13: enterReplay flush + opts.timeRange", () => {
    it("flushes the store before reading getTimeRange", async () => {
      const session = new ReplaySession({
        channels: [new MetricChannel("cpu")],
        // Big interval so the auto-flush timer doesn't race us — we want to
        // assert the explicit flush enterReplay performs.
        storeOptions: { batchIntervalMs: 99_999 },
      });
      await session.open();
      await session.startRecording();
      // Record some frames; they live in store._pending only until flushed.
      session.record("cpu", { name: "cpu", value: 1 }, 1_000);
      session.record("cpu", { name: "cpu", value: 2 }, 2_000);
      session.record("cpu", { name: "cpu", value: 3 }, 3_000);

      // Before enterReplay, IDB is empty (pending hasn't flushed).
      expect(await session.getTimeRange()).toBeNull();

      const flushSpy = vi.spyOn(session.store, "flush");
      await session.enterReplay();
      expect(flushSpy).toHaveBeenCalled();

      // After enterReplay, frames are in IDB and the time range is queryable.
      const range = await session.getTimeRange();
      expect(range).toEqual({ earliest: 1_000, latest: 3_000 });

      session.dispose();
    });

    it("uses opts.timeRange when provided (clamped into IDB's actual range)", async () => {
      const session = new ReplaySession({
        channels: [new MetricChannel("cpu")],
        storeOptions: { batchIntervalMs: 99_999 },
      });
      await session.open();
      await session.startRecording();
      session.record("cpu", { name: "cpu", value: 0 }, 1_000);
      session.record("cpu", { name: "cpu", value: 1 }, 5_000);

      // Caller asks for a frozen latest at 4_000 (mid-recording).
      const player = await session.enterReplay(undefined, {
        timeRange: { earliest: 1_500, latest: 4_000 },
      });
      // earliest clamped up to caller's 1_500 (>= IDB 1_000),
      // latest clamped down to caller's 4_000 (<= IDB 5_000).
      expect(player.timeRange).toEqual({ earliest: 1_500, latest: 4_000 });

      session.dispose();
    });

    it("falls back to IDB range when opts.timeRange is zero-width", async () => {
      const session = new ReplaySession({
        channels: [new MetricChannel("cpu")],
        storeOptions: { batchIntervalMs: 99_999 },
      });
      await session.open();
      await session.startRecording();
      session.record("cpu", { name: "cpu", value: 0 }, 1_000);
      session.record("cpu", { name: "cpu", value: 1 }, 3_000);

      // Mimic a freshly-seeded liveTimeRange — { now, now } before first poll.
      const seededT = 2_500;
      const player = await session.enterReplay(undefined, {
        timeRange: { earliest: seededT, latest: seededT },
      });
      // Should fall back to IDB range so the player has something to play.
      expect(player.timeRange).toEqual({ earliest: 1_000, latest: 3_000 });

      session.dispose();
    });

    it("falls back to IDB range when opts.timeRange does not overlap IDB", async () => {
      const session = new ReplaySession({
        channels: [new MetricChannel("cpu")],
        storeOptions: { batchIntervalMs: 99_999 },
      });
      await session.open();
      await session.startRecording();
      session.record("cpu", { name: "cpu", value: 0 }, 10_000);
      session.record("cpu", { name: "cpu", value: 1 }, 20_000);

      // Caller's range is entirely below IDB's earliest — clamp collapses.
      const player = await session.enterReplay(undefined, {
        timeRange: { earliest: 1, latest: 100 },
      });
      expect(player.timeRange).toEqual({ earliest: 10_000, latest: 20_000 });

      session.dispose();
    });

    it("falls back to fabricated range when IDB is empty AND opts.timeRange is invalid", async () => {
      const session = new ReplaySession({ channels: [new MetricChannel("cpu")] });
      await session.open();
      // No frames recorded → IDB empty.
      const player = await session.enterReplay(undefined, {
        timeRange: { earliest: 100, latest: 100 }, // zero-width
      });
      expect(player.timeRange.latest).toBeGreaterThan(player.timeRange.earliest);
      session.dispose();
    });
  });

  describe("concurrent enterReplay generation guard", () => {
    it("a stale enter resolving AFTER a newer enter does not overwrite the newer player", async () => {
      const session = new ReplaySession({ channels: [new MetricChannel("cpu")] });
      await session.open();

      // Park enter A inside its store.flush() await; enter B flushes normally.
      let releaseA!: () => void;
      const flushSpy = vi
        .spyOn(session.store, "flush")
        .mockImplementationOnce(
          () =>
            new Promise<void>((resolve) => {
              releaseA = resolve;
            }),
        )
        .mockImplementation(async () => {});

      const pA = session.enterReplay(1000); // parked
      const playerB = await session.enterReplay(2000); // resolves first
      expect(session.player).toBe(playerB);
      expect(session.mode).toBe("replay");

      releaseA();
      const playerA = await pA; // stale — resolves last
      expect(playerA).not.toBe(playerB);
      // B stays installed; A's player came back already disposed.
      expect(session.player).toBe(playerB);
      expect(session.mode).toBe("replay");
      expect(() => playerA.dispose()).not.toThrow(); // double dispose is safe

      flushSpy.mockRestore();
      session.dispose();
    });

    it("exitReplay during an in-flight enterReplay keeps the session live", async () => {
      const session = new ReplaySession({ channels: [new MetricChannel("cpu")] });
      await session.open();

      let release!: () => void;
      const flushSpy = vi.spyOn(session.store, "flush").mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      );

      const pending = session.enterReplay(1000); // parked
      session.exitReplay(); // user bails before the enter resolves
      expect(session.mode).toBe("live");

      release();
      await pending; // stale enter must not resurrect a player
      expect(session.mode).toBe("live");
      expect(session.player).toBeNull();

      flushSpy.mockRestore();
      session.dispose();
    });

    it("dispose during an in-flight enterReplay does not resurrect a player", async () => {
      const session = new ReplaySession({ channels: [new MetricChannel("cpu")] });
      await session.open();

      let release!: () => void;
      const flushSpy = vi.spyOn(session.store, "flush").mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      );

      const pending = session.enterReplay(1000);
      session.dispose();

      release();
      await pending;
      expect(session.player).toBeNull();

      flushSpy.mockRestore();
    });
  });
});
