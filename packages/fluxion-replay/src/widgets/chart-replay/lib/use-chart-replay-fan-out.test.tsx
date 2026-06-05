import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MetricChannel } from "../../../entities/metric-channel/metric-channel";
import { makeFakePlayer, makeFakeStore, metricFrame } from "./chart-replay-fixtures";
import {
  type ReplayFanOutSource,
  useChartReplayFanOut,
} from "./use-chart-replay-fan-out";

const CHANNEL = new MetricChannel("snap");

interface HandleCall {
  hostId: string;
  layerId: string;
  kind: "line" | "scatter";
  op: "push" | "pushBatch" | "reset";
  arg: unknown;
}

/**
 * Fake host whose `.line(id)` / `.scatter(id)` lazily create per-id spy handles
 * recording into a shared `calls` log. Distinct from the shared makeFakeHost
 * fixture (which only has `.line` returning one handle).
 */
function makeFanOutHost(hostId: string) {
  const calls: HandleCall[] = [];
  const cache = new Map<string, unknown>();
  const handleFor = (layerId: string, kind: "line" | "scatter") => {
    const key = `${kind}:${layerId}`;
    const existing = cache.get(key);
    if (existing) return existing;
    const handle = {
      push: vi.fn((s: unknown) =>
        calls.push({ hostId, layerId, kind, op: "push", arg: s }),
      ),
      pushBatch: vi.fn((b: unknown) =>
        calls.push({ hostId, layerId, kind, op: "pushBatch", arg: b }),
      ),
      reset: vi.fn((t: unknown) =>
        calls.push({ hostId, layerId, kind, op: "reset", arg: t }),
      ),
    };
    cache.set(key, handle);
    return handle;
  };
  const host = {
    hostId,
    line: vi.fn((id: string) => handleFor(id, "line")),
    scatter: vi.fn((id: string) => handleFor(id, "scatter")),
  };
  return { host, calls };
}

interface ProbeProps<T> {
  player: ReturnType<typeof makeFakePlayer> | null;
  store: ReturnType<typeof makeFakeStore> | null;
  windowMs?: number;
  timeOrigin?: number;
  getSources: () => ReplayFanOutSource<T>[];
  isHostLive?: (host: { hostId: string }) => boolean;
}

function FanOutProbe<T>(props: ProbeProps<T>) {
  useChartReplayFanOut<T>({
    player: props.player as never,
    store: props.store as never,
    channel: CHANNEL as never,
    windowMs: props.windowMs ?? 5_000,
    timeOrigin: props.timeOrigin,
    getSources: props.getSources,
    isHostLive: props.isHostLive as never,
  });
  return null;
}

/** Build N snap frames whose decoded `value` carries the sample. */
function snapFrames(...vals: { t: number; value: number }[]) {
  return vals.map(({ t, value }) => metricFrame("snap", t, value));
}

async function flushMicrotasks() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

describe("useChartReplayFanOut", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ── hydrate / fan-out ───────────────────────────────────────────────────

  it("hydrates on mount, fanning the single query across 2 sources × 2 lines", async () => {
    const a = makeFanOutHost("A");
    const b = makeFanOutHost("B");
    const store = makeFakeStore({
      snap: snapFrames({ t: 990, value: 10 }, { t: 1000, value: 20 }),
    });
    const player = makeFakePlayer(1000);

    const getSources = (): ReplayFanOutSource<{ value: number }>[] => [
      {
        host: a.host as never,
        lines: [
          { layerId: "L1", pick: (d) => d.value },
          { layerId: "L2", type: "scatter", pick: (d) => d.value },
        ],
      },
      {
        host: b.host as never,
        lines: [
          { layerId: "L3", pick: (d) => d.value },
          { layerId: "L4", pick: (d) => d.value },
        ],
      },
    ];

    await act(async () => {
      render(<FanOutProbe player={player} store={store} getSources={getSources} />);
      await flushMicrotasks();
    });

    // Visible window [1000-5000, 1000] widened by the ±3000ms prefetch margin.
    expect(store.getFramesByChannel).toHaveBeenCalledWith(CHANNEL, 1000 - 5000 - 3000, 1000 + 3000);
    // 4 handles each got reset(1000) then a pushBatch.
    for (const h of [a, b]) {
      for (const op of ["reset", "pushBatch"]) {
        expect(h.calls.filter((c) => c.op === op).length).toBe(2);
      }
    }
    // scatter used for L2, line for the others.
    expect(a.host.scatter).toHaveBeenCalledWith("L2");
    expect(a.host.line).toHaveBeenCalledWith("L1");
    expect(b.host.line).toHaveBeenCalledWith("L3");
  });

  it("extracts a distinct field per line via pick", async () => {
    const a = makeFanOutHost("A");
    const store = makeFakeStore({ snap: snapFrames({ t: 1000, value: 7 }) });
    const player = makeFakePlayer(1000);

    const getSources = (): ReplayFanOutSource<{ value: number }>[] => [
      {
        host: a.host as never,
        lines: [
          { layerId: "raw", pick: (d) => d.value },
          { layerId: "scaled", pick: (d) => d.value * 10 },
        ],
      },
    ];

    await act(async () => {
      render(<FanOutProbe player={player} store={store} getSources={getSources} />);
      await flushMicrotasks();
    });

    const raw = a.calls.find((c) => c.layerId === "raw" && c.op === "pushBatch")!.arg as {
      y: number;
    }[];
    const scaled = a.calls.find((c) => c.layerId === "scaled" && c.op === "pushBatch")!
      .arg as { y: number }[];
    expect(raw[0]!.y).toBe(7);
    expect(scaled[0]!.y).toBe(70);
  });

  it("filters null / non-finite pick results (hydrate batch)", async () => {
    const a = makeFanOutHost("A");
    const store = makeFakeStore({
      snap: snapFrames({ t: 998, value: 1 }, { t: 999, value: 2 }, { t: 1000, value: 3 }),
    });
    const player = makeFakePlayer(1000);

    const getSources = (): ReplayFanOutSource<{ value: number }>[] => [
      {
        host: a.host as never,
        lines: [
          // skip value 2 (null) and value 3 (NaN); keep value 1.
          {
            layerId: "sparse",
            pick: (d) => (d.value === 2 ? null : d.value === 3 ? Number.NaN : d.value),
          },
          { layerId: "dense", pick: (d) => d.value },
        ],
      },
    ];

    await act(async () => {
      render(<FanOutProbe player={player} store={store} getSources={getSources} />);
      await flushMicrotasks();
    });

    const sparse = a.calls.find((c) => c.layerId === "sparse" && c.op === "pushBatch")!
      .arg as { y: number }[];
    const dense = a.calls.find((c) => c.layerId === "dense" && c.op === "pushBatch")!
      .arg as { y: number }[];
    expect(sparse.map((s) => s.y)).toEqual([1]);
    expect(dense.map((s) => s.y)).toEqual([1, 2, 3]);
  });

  it("resets even when a line's batch is empty (no pushBatch)", async () => {
    const a = makeFanOutHost("A");
    const store = makeFakeStore({ snap: snapFrames({ t: 1000, value: 5 }) });
    const player = makeFakePlayer(1000);

    const getSources = (): ReplayFanOutSource<{ value: number }>[] => [
      { host: a.host as never, lines: [{ layerId: "empty", pick: () => null }] },
    ];

    await act(async () => {
      render(<FanOutProbe player={player} store={store} getSources={getSources} />);
      await flushMicrotasks();
    });

    expect(a.calls.some((c) => c.layerId === "empty" && c.op === "reset")).toBe(true);
    expect(a.calls.some((c) => c.layerId === "empty" && c.op === "pushBatch")).toBe(
      false,
    );
  });

  it("skips stale hosts via isHostLive and null-host sources", async () => {
    const a = makeFanOutHost("A");
    const b = makeFanOutHost("B");
    const store = makeFakeStore({ snap: snapFrames({ t: 1000, value: 1 }) });
    const player = makeFakePlayer(1000);

    const getSources = (): ReplayFanOutSource<{ value: number }>[] => [
      { host: a.host as never, lines: [{ layerId: "L1", pick: (d) => d.value }] },
      { host: b.host as never, lines: [{ layerId: "L2", pick: (d) => d.value }] },
      { host: null, lines: [{ layerId: "L3", pick: (d) => d.value }] }, // null host → skipped
    ];

    await act(async () => {
      render(
        <FanOutProbe
          player={player}
          store={store}
          getSources={getSources}
          isHostLive={(h) => h.hostId === "A"} // B is stale
        />,
      );
      await flushMicrotasks();
    });

    expect(a.calls.length).toBeGreaterThan(0);
    expect(b.calls.length).toBe(0); // stale host got nothing
    expect(b.host.line).not.toHaveBeenCalled();
  });

  // ── seek / live ──────────────────────────────────────────────────────────

  it("re-hydrates on player.onSeek(t)", async () => {
    const a = makeFanOutHost("A");
    const store = makeFakeStore({
      snap: snapFrames({ t: 1000, value: 1 }, { t: 3000, value: 2 }),
    });
    // Mount far from the seek target so the seek lands OUTSIDE the mount's
    // cached ±3000ms span and genuinely re-queries (a near seek would be a
    // cache hit — covered by its own test below).
    const player = makeFakePlayer(20_000);
    const getSources = (): ReplayFanOutSource<{ value: number }>[] => [
      { host: a.host as never, lines: [{ layerId: "L", pick: (d) => d.value }] },
    ];

    await act(async () => {
      render(<FanOutProbe player={player} store={store} getSources={getSources} />);
      await flushMicrotasks();
    });
    store.getFramesByChannel.mockClear();
    a.calls.length = 0;

    await act(async () => {
      player.emitSeek(3000);
      await flushMicrotasks();
    });

    expect(store.getFramesByChannel).toHaveBeenCalledWith(CHANNEL, 3000 - 5000 - 3000, 3000 + 3000);
    const resets = a.calls.filter((c) => c.op === "reset");
    expect(resets[0]!.arg).toBe(3000);
  });

  it("fans live onFrame events across all lines on tick drain", async () => {
    const a = makeFanOutHost("A");
    const store = makeFakeStore({ snap: [] });
    const player = makeFakePlayer(1000);
    const getSources = (): ReplayFanOutSource<{ value: number }>[] => [
      {
        host: a.host as never,
        lines: [
          { layerId: "L1", pick: (d) => d.value },
          { layerId: "L2", pick: (d) => d.value },
        ],
      },
    ];

    await act(async () => {
      render(<FanOutProbe player={player} store={store} getSources={getSources} />);
      await flushMicrotasks();
    });
    a.calls.length = 0;

    await act(async () => {
      player.emitFrame({ channelId: "snap", t: 1100, data: { value: 42 } });
      player.emitTick(1100);
      await flushMicrotasks();
    });

    const pushes = a.calls.filter((c) => c.op === "push");
    expect(pushes).toHaveLength(2); // L1 + L2
    expect(pushes[0]!.arg as { t: number; y: number }).toEqual({ t: 1100, y: 42 });
    expect(a.calls.some((c) => c.op === "reset")).toBe(false);
  });

  it("live fan-out skips stale/null hosts and null/non-finite picks", async () => {
    const a = makeFanOutHost("A");
    const b = makeFanOutHost("B");
    const store = makeFakeStore({ snap: [] });
    const player = makeFakePlayer(1000);
    const getSources = (): ReplayFanOutSource<{ value: number }>[] => [
      {
        host: a.host as never,
        lines: [
          { layerId: "keep", pick: (d) => d.value },
          { layerId: "drop", pick: () => null }, // live pick null → skipped
        ],
      },
      { host: b.host as never, lines: [{ layerId: "stale", pick: (d) => d.value }] }, // host stale
      { host: null, lines: [{ layerId: "nohost", pick: (d) => d.value }] }, // null host
    ];

    await act(async () => {
      render(
        <FanOutProbe
          player={player}
          store={store}
          getSources={getSources}
          isHostLive={(h) => h.hostId === "A"}
        />,
      );
      await flushMicrotasks();
    });
    a.calls.length = 0;
    b.calls.length = 0;

    await act(async () => {
      player.emitFrame({ channelId: "snap", t: 1100, data: { value: 7 } });
      player.emitTick(1100);
      await flushMicrotasks();
    });

    const pushes = a.calls.filter((c) => c.op === "push");
    expect(pushes).toHaveLength(1); // only "keep"
    expect(pushes[0]!.layerId).toBe("keep");
    expect(b.calls).toHaveLength(0); // stale host got nothing
  });

  it("drains 2+ buffered frames in arrival order; empty-buffer tick is a no-op", async () => {
    const a = makeFanOutHost("A");
    const store = makeFakeStore({ snap: [] });
    const player = makeFakePlayer(1000);
    const getSources = (): ReplayFanOutSource<{ value: number }>[] => [
      { host: a.host as never, lines: [{ layerId: "L", pick: (d) => d.value }] },
    ];

    await act(async () => {
      render(<FanOutProbe player={player} store={store} getSources={getSources} />);
      await flushMicrotasks();
    });
    a.calls.length = 0;

    await act(async () => {
      player.emitTick(1050); // empty buffer → no-op
      player.emitFrame({ channelId: "snap", t: 1100, data: { value: 1 } });
      player.emitFrame({ channelId: "snap", t: 1200, data: { value: 2 } });
      player.emitTick(1200);
      await flushMicrotasks();
    });

    const ys = a.calls
      .filter((c) => c.op === "push")
      .map((c) => (c.arg as { y: number }).y);
    expect(ys).toEqual([1, 2]);
  });

  it("ignores frames for other channels", async () => {
    const a = makeFanOutHost("A");
    const store = makeFakeStore({ snap: [] });
    const player = makeFakePlayer(1000);
    const getSources = (): ReplayFanOutSource<{ value: number }>[] => [
      { host: a.host as never, lines: [{ layerId: "L", pick: (d) => d.value }] },
    ];

    await act(async () => {
      render(<FanOutProbe player={player} store={store} getSources={getSources} />);
      await flushMicrotasks();
    });
    a.calls.length = 0;

    await act(async () => {
      player.emitFrame({ channelId: "other", t: 1100, data: { value: 99 } });
      player.emitTick(1100);
      await flushMicrotasks();
    });

    expect(a.calls.filter((c) => c.op === "push")).toHaveLength(0);
  });

  // ── races ────────────────────────────────────────────────────────────────

  it("parks live frames during hydrate, then flushes only post-seek ones", async () => {
    const a = makeFanOutHost("A");
    const store = makeFakeStore({ snap: snapFrames({ t: 1000, value: 1 }) });
    const player = makeFakePlayer(1000);
    const getSources = (): ReplayFanOutSource<{ value: number }>[] => [
      { host: a.host as never, lines: [{ layerId: "L", pick: (d) => d.value }] },
    ];

    store.hold();
    await act(async () => {
      render(<FanOutProbe player={player} store={store} getSources={getSources} />);
      await flushMicrotasks();
    });
    // Effect + onFrame listener are registered and the hydrate is parked on the
    // held store query (hydratingT set). Now stream frames + release.
    await act(async () => {
      // frame during hydrate: t=900 (<= seek 1000 → dropped), t=1100 (> seek → flushed)
      player.emitFrame({ channelId: "snap", t: 900, data: { value: 8 } });
      player.emitFrame({ channelId: "snap", t: 1100, data: { value: 9 } });
      await store.release();
      await flushMicrotasks();
    });

    // order: reset → pushBatch → live push (only the t=1100 frame)
    const ops = a.calls.map((c) => c.op);
    expect(ops).toEqual(["reset", "pushBatch", "push"]);
    expect(a.calls.at(-1)!.arg as { t: number; y: number }).toEqual({ t: 1100, y: 9 });
  });

  it("collapses a seek burst to the last t (queue)", async () => {
    const a = makeFanOutHost("A");
    const store = makeFakeStore({
      snap: snapFrames(
        { t: 1000, value: 1 },
        { t: 2000, value: 2 },
        { t: 3000, value: 3 },
      ),
    });
    const player = makeFakePlayer(1000);
    const getSources = (): ReplayFanOutSource<{ value: number }>[] => [
      { host: a.host as never, lines: [{ layerId: "L", pick: (d) => d.value }] },
    ];

    await act(async () => {
      render(<FanOutProbe player={player} store={store} getSources={getSources} />);
      await flushMicrotasks();
    });
    store.getFramesByChannel.mockClear();
    a.calls.length = 0;

    store.hold();
    await act(async () => {
      player.emitSeek(2000);
      player.emitSeek(2500);
      player.emitSeek(3000);
      await store.release();
      await flushMicrotasks();
      await store.release();
      await flushMicrotasks();
    });

    // First (2000) + collapsed last (3000) → 2 rounds, final reset at 3000.
    expect(store.getFramesByChannel.mock.calls.length).toBeLessThanOrEqual(2);
    const resets = a.calls.filter((c) => c.op === "reset");
    expect(resets.at(-1)!.arg).toBe(3000);
  });

  it("does not write to charts when unmounted mid-hydrate", async () => {
    const a = makeFanOutHost("A");
    const store = makeFakeStore({ snap: snapFrames({ t: 1000, value: 1 }) });
    const player = makeFakePlayer(1000);
    const getSources = (): ReplayFanOutSource<{ value: number }>[] => [
      { host: a.host as never, lines: [{ layerId: "L", pick: (d) => d.value }] },
    ];

    store.hold();
    let unmount!: () => void;
    await act(async () => {
      const r = render(
        <FanOutProbe player={player} store={store} getSources={getSources} />,
      );
      unmount = r.unmount;
      await flushMicrotasks();
    });
    await act(async () => {
      unmount();
      await store.release();
      await flushMicrotasks();
    });

    expect(a.calls).toHaveLength(0);
  });

  it("unsubscribes on unmount", async () => {
    const a = makeFanOutHost("A");
    const store = makeFakeStore({ snap: [] });
    const player = makeFakePlayer(1000);
    const getSources = (): ReplayFanOutSource<{ value: number }>[] => [
      { host: a.host as never, lines: [{ layerId: "L", pick: (d) => d.value }] },
    ];

    let unmount!: () => void;
    await act(async () => {
      const r = render(
        <FanOutProbe player={player} store={store} getSources={getSources} />,
      );
      unmount = r.unmount;
      await flushMicrotasks();
    });
    expect(player.frameListenerCount()).toBe(1);
    expect(player.seekListenerCount()).toBe(1);
    expect(player.tickListenerCount()).toBe(1);

    await act(async () => {
      unmount();
    });
    expect(player.frameListenerCount()).toBe(0);
    expect(player.seekListenerCount()).toBe(0);
    expect(player.tickListenerCount()).toBe(0);
  });

  // ── idle / defaults ────────────────────────────────────────────────────

  it("is a no-op when player is null", async () => {
    const store = makeFakeStore({ snap: snapFrames({ t: 1000, value: 1 }) });
    await act(async () => {
      render(
        <FanOutProbe
          player={null}
          store={store}
          getSources={() => [] as ReplayFanOutSource<{ value: number }>[]}
        />,
      );
      await flushMicrotasks();
    });
    expect(store.getFramesByChannel).not.toHaveBeenCalled();
  });

  it("is a no-op when store is null", async () => {
    const player = makeFakePlayer(1000);
    await act(async () => {
      render(
        <FanOutProbe
          player={player}
          store={null}
          getSources={() => [] as ReplayFanOutSource<{ value: number }>[]}
        />,
      );
      await flushMicrotasks();
    });
    expect(player.frameListenerCount()).toBe(0);
  });

  it("defaults type to 'line' and isHostLive to always-true", async () => {
    const a = makeFanOutHost("A");
    const store = makeFakeStore({ snap: snapFrames({ t: 1000, value: 1 }) });
    const player = makeFakePlayer(1000);
    const getSources = (): ReplayFanOutSource<{ value: number }>[] => [
      { host: a.host as never, lines: [{ layerId: "L", pick: (d) => d.value }] }, // no type, no isHostLive
    ];

    await act(async () => {
      render(<FanOutProbe player={player} store={store} getSources={getSources} />);
      await flushMicrotasks();
    });

    expect(a.host.line).toHaveBeenCalledWith("L"); // default "line"
    expect(a.host.scatter).not.toHaveBeenCalled();
    expect(a.calls.length).toBeGreaterThan(0); // default isHostLive → pushed
  });

  it("defaults timeOrigin to 0 (absolute t pushed)", async () => {
    const a = makeFanOutHost("A");
    const store = makeFakeStore({ snap: snapFrames({ t: 1000, value: 5 }) });
    const player = makeFakePlayer(1000);
    const getSources = (): ReplayFanOutSource<{ value: number }>[] => [
      { host: a.host as never, lines: [{ layerId: "L", pick: (d) => d.value }] },
    ];

    await act(async () => {
      render(<FanOutProbe player={player} store={store} getSources={getSources} />);
      await flushMicrotasks();
    });

    const reset = a.calls.find((c) => c.op === "reset")!;
    expect(reset.arg).toBe(1000); // no shift
  });

  it("subtracts timeOrigin from hydrate samples, reset latestT, and live pushes", async () => {
    const a = makeFanOutHost("A");
    const store = makeFakeStore({ snap: snapFrames({ t: 1000, value: 5 }) });
    const player = makeFakePlayer(1000);
    const getSources = (): ReplayFanOutSource<{ value: number }>[] => [
      { host: a.host as never, lines: [{ layerId: "L", pick: (d) => d.value }] },
    ];

    await act(async () => {
      render(
        <FanOutProbe
          player={player}
          store={store}
          getSources={getSources}
          timeOrigin={500}
        />,
      );
      await flushMicrotasks();
    });

    // store query stays absolute (widened by ±3000 margin); reset + batch shifted by 500.
    expect(store.getFramesByChannel).toHaveBeenCalledWith(CHANNEL, 1000 - 5000 - 3000, 1000 + 3000);
    const reset = a.calls.find((c) => c.op === "reset")!;
    expect(reset.arg).toBe(500); // 1000 - 500
    const batch = a.calls.find((c) => c.op === "pushBatch")!.arg as { t: number }[];
    expect(batch[0]!.t).toBe(500); // 1000 - 500

    a.calls.length = 0;
    await act(async () => {
      player.emitFrame({ channelId: "snap", t: 1200, data: { value: 9 } });
      player.emitTick(1200);
      await flushMicrotasks();
    });
    const push = a.calls.find((c) => c.op === "push")!.arg as { t: number };
    expect(push.t).toBe(700); // 1200 - 500
  });

  it("reuses the cache: same-window re-seek skips the IDB query", async () => {
    const a = makeFanOutHost("A");
    const store = makeFakeStore({ snap: snapFrames({ t: 1000, value: 1 }) });
    const player = makeFakePlayer(1000);
    const getSources = (): ReplayFanOutSource<{ value: number }>[] => [
      { host: a.host as never, lines: [{ layerId: "L", pick: (d) => d.value }] },
    ];

    await act(async () => {
      render(<FanOutProbe player={player} store={store} getSources={getSources} />);
      await flushMicrotasks();
    });
    expect(store.getFramesByChannel).toHaveBeenCalledTimes(1);

    // Re-seek to the SAME t → window [t-5000, t] is covered by the cache.
    await act(async () => {
      player.emitSeek(1000);
      await flushMicrotasks();
    });
    expect(store.getFramesByChannel).toHaveBeenCalledTimes(1); // no extra query
    // But the chart still re-rendered (reset fired again).
    expect(a.calls.filter((c) => c.op === "reset").length).toBeGreaterThanOrEqual(2);
  });

  it("throws when windowMs is not a positive finite number", () => {
    const store = makeFakeStore({ snap: [] });
    const player = makeFakePlayer(1000);
    const getSources = () => [] as ReplayFanOutSource<{ value: number }>[];
    const bad = (windowMs: number) =>
      render(
        <FanOutProbe
          player={player}
          store={store}
          windowMs={windowMs}
          getSources={getSources}
        />,
      );

    expect(() => bad(Number.NaN)).toThrow(/windowMs/);
    expect(() => bad(0)).toThrow(/windowMs/);
    expect(() => bad(-100)).toThrow(/windowMs/);
  });

  // ── prefetch margin (instant scrub/seek) ───────────────────────────────────
  describe("prefetch margin", () => {
    it("fetches a ±marginMs wider range than the visible window", async () => {
      const a = makeFanOutHost("A");
      const store = makeFakeStore({ snap: snapFrames({ t: 1000, value: 1 }) });
      const player = makeFakePlayer(1000);
      const getSources = (): ReplayFanOutSource<{ value: number }>[] => [
        { host: a.host as never, lines: [{ layerId: "L", pick: (d) => d.value }] },
      ];

      await act(async () => {
        render(<FanOutProbe player={player} store={store} getSources={getSources} />);
        await flushMicrotasks();
      });

      // Visible [1000-5000, 1000] widened by ±3000 → [-7000, 4000].
      expect(store.getFramesByChannel).toHaveBeenCalledWith(CHANNEL, -7000, 4000);
    });

    it("a seek within marginMs is a cache hit (no 2nd query) but still re-renders", async () => {
      const a = makeFanOutHost("A");
      const store = makeFakeStore({
        snap: snapFrames(
          { t: -1000, value: 1 },
          { t: 1000, value: 2 },
          { t: 2500, value: 3 },
        ),
      });
      const player = makeFakePlayer(1000);
      const getSources = (): ReplayFanOutSource<{ value: number }>[] => [
        { host: a.host as never, lines: [{ layerId: "L", pick: (d) => d.value }] },
      ];

      await act(async () => {
        render(<FanOutProbe player={player} store={store} getSources={getSources} />);
        await flushMicrotasks();
      });
      expect(store.getFramesByChannel).toHaveBeenCalledTimes(1); // cached [-7000, 4000]
      a.calls.length = 0;

      // Seek to 2500: visibleFrom -2500 >= -7000 and 2500 <= 4000 → cache hit.
      await act(async () => {
        player.emitSeek(2500);
        await flushMicrotasks();
      });

      expect(store.getFramesByChannel).toHaveBeenCalledTimes(1); // no 2nd query
      const reset = a.calls.find((c) => c.op === "reset");
      expect(reset!.arg).toBe(2500); // still re-rendered from cache
    });

    it("pushes ONLY the visible window despite the wider fetch", async () => {
      const a = makeFanOutHost("A");
      // Frames spanning the wide fetch [-7000,4000]; visible window is [-4000,1000].
      const store = makeFakeStore({
        snap: snapFrames(
          { t: -6000, value: 1 }, // margin (below) — NOT pushed
          { t: 0, value: 2 }, // visible
          { t: 1000, value: 3 }, // visible
          { t: 3000, value: 4 }, // margin (above) — NOT pushed
        ),
      });
      const player = makeFakePlayer(1000);
      const getSources = (): ReplayFanOutSource<{ value: number }>[] => [
        { host: a.host as never, lines: [{ layerId: "L", pick: (d) => d.value }] },
      ];

      await act(async () => {
        render(<FanOutProbe player={player} store={store} getSources={getSources} />);
        await flushMicrotasks();
      });

      expect(store.getFramesByChannel).toHaveBeenCalledWith(CHANNEL, -7000, 4000);
      const batch = a.calls.find((c) => c.op === "pushBatch");
      expect(batch!.arg).toEqual([
        { t: 0, y: 2 },
        { t: 1000, y: 3 },
      ]);
    });
  });
});
