/**
 * useChartReplayFanOut — long-recording (~5 min) hydrate test.
 *
 * Verifies that one 5-minute "snapshot" channel fans out to N lines correctly:
 * a single windowed query deep in the recording feeds every line from the same
 * correct window slice (not the whole 6000-frame recording).
 */
import { act, render } from "@testing-library/react";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { MetricChannel } from "../../../entities/metric-channel/metric-channel";
import { makeFakePlayer, makeFakeStore, metricFrame } from "./chart-replay-fixtures";
import {
  type ReplayFanOutSource,
  useChartReplayFanOut,
} from "./use-chart-replay-fan-out";

const CHANNEL = new MetricChannel("snap");

const HZ = 20;
const STEP_MS = 1000 / HZ; // 50 ms
const DURATION_MS = 300_000; // 5 minutes
const WINDOW_MS = 5_000;
const FRAMES_PER_WINDOW = WINDOW_MS / STEP_MS; // 100

// 6000 snapshot frames; decoded `value === frame index === t / STEP_MS`.
const RECORDING = Array.from({ length: DURATION_MS / STEP_MS }, (_, i) =>
  metricFrame("snap", i * STEP_MS, i),
);

interface HandleCall {
  layerId: string;
  op: "push" | "pushBatch" | "reset";
  arg: unknown;
}

function makeFanOutHost(hostId: string) {
  const calls: HandleCall[] = [];
  const cache = new Map<string, unknown>();
  const handleFor = (layerId: string) => {
    const existing = cache.get(layerId);
    if (existing) return existing;
    const handle = {
      push: vi.fn((s: unknown) => calls.push({ layerId, op: "push", arg: s })),
      pushBatch: vi.fn((b: unknown) => calls.push({ layerId, op: "pushBatch", arg: b })),
      reset: vi.fn((t: unknown) => calls.push({ layerId, op: "reset", arg: t })),
    };
    cache.set(layerId, handle);
    return handle;
  };
  const host = {
    hostId,
    line: vi.fn((id: string) => handleFor(id)),
    scatter: vi.fn((id: string) => handleFor(id)),
  };
  return { host, calls };
}

function FanOutProbe<T>(props: {
  player: ReturnType<typeof makeFakePlayer> | null;
  store: ReturnType<typeof makeFakeStore> | null;
  getSources: () => ReplayFanOutSource<T>[];
}) {
  useChartReplayFanOut<T>({
    player: props.player as never,
    store: props.store as never,
    channel: CHANNEL as never,
    windowMs: WINDOW_MS,
    getSources: props.getSources,
  });
  return null;
}

beforeAll(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterAll(() => vi.restoreAllMocks());

async function settle() {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

describe("useChartReplayFanOut — 5-minute recording", () => {
  beforeEach(() => vi.useRealTimers());
  afterEach(() => vi.useRealTimers());

  it("fans one window slice deep in the recording across N lines", async () => {
    const a = makeFanOutHost("A");
    const store = makeFakeStore({ snap: RECORDING });
    const player = makeFakePlayer(150_000); // deep into the 5-min recording

    const getSources = (): ReplayFanOutSource<{ value: number }>[] => [
      {
        host: a.host as never,
        lines: [
          { layerId: "raw", pick: (d) => d.value },
          { layerId: "scaled", type: "scatter", pick: (d) => d.value * 2 },
        ],
      },
    ];

    await act(async () => {
      render(<FanOutProbe player={player} store={store} getSources={getSources} />);
      await settle();
    });

    // Single windowed query [currentT - windowMs, currentT] widened by the
    // ±3000ms prefetch margin, shared by all lines.
    expect(store.getFramesByChannel).toHaveBeenCalledTimes(1);
    expect(store.getFramesByChannel).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: "snap" }),
      150_000 - WINDOW_MS - 3000,
      150_000 + 3000,
    );

    // Each line reset(150000) then pushBatch from the SAME window slice.
    for (const layerId of ["raw", "scaled"]) {
      const reset = a.calls.find((c) => c.layerId === layerId && c.op === "reset")!;
      expect(reset.arg).toBe(150_000);
      const batch = a.calls.find((c) => c.layerId === layerId && c.op === "pushBatch")!
        .arg as { t: number; y: number }[];
      expect(batch.length).toBeLessThanOrEqual(FRAMES_PER_WINDOW + 1);
      expect(batch.length).toBeGreaterThanOrEqual(FRAMES_PER_WINDOW - 1);
      expect(batch.at(-1)!.t).toBe(150_000);
      for (const s of batch) {
        expect(s.t).toBeGreaterThanOrEqual(150_000 - WINDOW_MS);
      }
    }

    // The two lines picked different fields from the same window.
    const raw = a.calls.find((c) => c.layerId === "raw" && c.op === "pushBatch")!.arg as {
      t: number;
      y: number;
    }[];
    const scaled = a.calls.find((c) => c.layerId === "scaled" && c.op === "pushBatch")!
      .arg as { t: number; y: number }[];
    expect(scaled[0]!.y).toBe(raw[0]!.y * 2);
    expect(raw.at(-1)!.y).toBe(150_000 / STEP_MS); // value === index at t=150_000
  });
});
