/**
 * useChartReplay — long-recording (~5 min) hydrate tests.
 *
 * Verifies that against a large (6000-frame / 5-minute) recording the chart
 * hydrates ONLY the visible window — not the whole recording — and that a deep
 * seek re-hydrates the correct new window. Uses the fake store/player/host from
 * chart-replay-fixtures (no real IDB); the fake store filters the supplied
 * frames by [from, to], so a window query returns exactly that slice.
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
import {
  buildRecording,
  ChartReplayProbe,
  makeFakeHost,
  makeFakePlayer,
  makeFakeStore,
} from "./chart-replay-fixtures";

const HZ = 20;
const STEP_MS = 1000 / HZ; // 50 ms
const DURATION_MS = 300_000; // 5 minutes
const WINDOW_MS = 5_000;
const FRAMES_PER_WINDOW = WINDOW_MS / STEP_MS; // 100

// 6000 frames, value === frame index === t / STEP_MS (deterministic & assertable).
const RECORDING = buildRecording({
  origin: 0,
  hz: HZ,
  durationMs: DURATION_MS,
  channelId: "signal",
  signalFn: (i) => i,
});

beforeAll(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterAll(() => vi.restoreAllMocks());

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

/**
 * The exact samples a window [fromAbs, toAbs] (both inclusive, 50 ms spacing)
 * must produce: t shifted host-relative by `timeOrigin`, y === absolute t / STEP_MS.
 * Lets tests assert the FULL sequence — no gaps, no dupes, no reordering — rather
 * than just a range.
 */
function expectedWindow(fromAbs: number, toAbs: number, timeOrigin = 0) {
  const out: { t: number; y: number }[] = [];
  for (let t = fromAbs; t <= toAbs; t += STEP_MS) {
    out.push({ t: t - timeOrigin, y: t / STEP_MS });
  }
  return out;
}

describe("useChartReplay — 5-minute recording", () => {
  beforeEach(() => vi.useRealTimers());
  afterEach(() => vi.useRealTimers());

  it("hydrates only the visible window deep in the recording, not all 6000 frames", async () => {
    const { host, batches, order } = makeFakeHost();
    const player = makeFakePlayer(150_000); // mounted deep into the 5-min recording
    const store = makeFakeStore({ signal: RECORDING });

    await act(async () => {
      render(
        <ChartReplayProbe
          host={host}
          player={player}
          store={store}
          windowMs={WINDOW_MS}
        />,
      );
      await settle();
    });

    // Query is the window [currentT - windowMs, currentT] widened by the ±3000ms
    // prefetch margin, NOT the whole span.
    expect(store.getFramesByChannel).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: "signal" }),
      150_000 - WINDOW_MS - 3000,
      150_000 + 3000,
    );
    expect(order[0]).toBe("reset:150000");

    // Exactly one window's worth of samples (101), not 6000 — and the FULL
    // sequence in order (no gaps / dupes / reordering), values == index.
    expect(batches).toHaveLength(1);
    expect(batches[0].samples).toHaveLength(FRAMES_PER_WINDOW + 1); // 101
    expect(batches[0].samples).toEqual(expectedWindow(145_000, 150_000));
  });

  it("re-hydrates the NEW window after a deep seek: exact sample sequence, reset before pushBatch", async () => {
    const { host, batches, order } = makeFakeHost();
    const player = makeFakePlayer(150_000);
    const store = makeFakeStore({ signal: RECORDING });

    await act(async () => {
      render(
        <ChartReplayProbe
          host={host}
          player={player}
          store={store}
          windowMs={WINDOW_MS}
        />,
      );
      await settle();
    });
    store.getFramesByChannel.mockClear();
    batches.length = 0;
    order.length = 0;

    await act(async () => {
      player.emitSeek(250_000); // jump deep forward
      await settle();
    });

    expect(store.getFramesByChannel).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: "signal" }),
      250_000 - WINDOW_MS - 3000,
      250_000 + 3000,
    );

    // Axis rewind (reset) MUST land before the data (pushBatch) — otherwise the
    // chart draws against the old axis and looks wrong.
    expect(order[0]).toBe("reset:250000");
    expect(order[1]).toBe(`pushBatch:${FRAMES_PER_WINDOW + 1}`); // 101

    // FULL sequence — every sample of the new window in order, none from 150k.
    expect(batches).toHaveLength(1);
    expect(batches[0].samples).toEqual(expectedWindow(245_000, 250_000));
  });

  it("round-trips back then forward: each window is exact, no leftovers from the previous one", async () => {
    const { host, batches } = makeFakeHost();
    const player = makeFakePlayer(150_000);
    const store = makeFakeStore({ signal: RECORDING });

    await act(async () => {
      render(
        <ChartReplayProbe
          host={host}
          player={player}
          store={store}
          windowMs={WINDOW_MS}
        />,
      );
      await settle();
    });

    // Jump deep into the PAST.
    batches.length = 0;
    await act(async () => {
      player.emitSeek(40_000);
      await settle();
    });
    expect(batches).toHaveLength(1);
    expect(batches[0].samples).toEqual(expectedWindow(35_000, 40_000));

    // Jump back FORWARD — the chart must show the new window only, no stale
    // samples from the 40k window.
    batches.length = 0;
    await act(async () => {
      player.emitSeek(260_000);
      await settle();
    });
    expect(batches).toHaveLength(1);
    expect(batches[0].samples).toEqual(expectedWindow(255_000, 260_000));
  });

  it("shifts samples host-relative by timeOrigin on a deep seek (chart x-axis aligns)", async () => {
    const TIME_ORIGIN = 100_000;
    const { host, batches, order } = makeFakeHost();
    const player = makeFakePlayer(150_000);
    const store = makeFakeStore({ signal: RECORDING });

    await act(async () => {
      render(
        <ChartReplayProbe
          host={host}
          player={player}
          store={store}
          windowMs={WINDOW_MS}
          timeOrigin={TIME_ORIGIN}
        />,
      );
      await settle();
    });
    batches.length = 0;
    order.length = 0;

    await act(async () => {
      player.emitSeek(250_000);
      await settle();
    });

    // Store query stays in ABSOLUTE time (widened by the ±3000ms margin)…
    expect(store.getFramesByChannel).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: "signal" }),
      250_000 - WINDOW_MS - 3000,
      250_000 + 3000,
    );
    // …but reset + samples are host-relative (absolute − timeOrigin). The chart's
    // right edge (last sample) sits at seekT − timeOrigin.
    expect(order[0]).toBe(`reset:${250_000 - TIME_ORIGIN}`); // 150000
    expect(batches[0].samples).toEqual(expectedWindow(245_000, 250_000, TIME_ORIGIN));
    expect(batches[0].samples.at(-1)!.t).toBe(250_000 - TIME_ORIGIN);
  });

  it("reuses the cache: a same-window re-seek skips the second IDB query", async () => {
    const { host } = makeFakeHost();
    const player = makeFakePlayer(150_000);
    const store = makeFakeStore({ signal: RECORDING });

    await act(async () => {
      render(
        <ChartReplayProbe
          host={host}
          player={player}
          store={store}
          windowMs={WINDOW_MS}
        />,
      );
      await settle();
    });
    expect(store.getFramesByChannel).toHaveBeenCalledTimes(1);

    await act(async () => {
      player.emitSeek(150_000); // same window → covered by cache
      await settle();
    });
    expect(store.getFramesByChannel).toHaveBeenCalledTimes(1); // no extra query
  });

  it("streams a live frame host-relative after a deep seek", async () => {
    const { host, pushes } = makeFakeHost();
    const player = makeFakePlayer(150_000);
    const store = makeFakeStore({ signal: RECORDING });

    await act(async () => {
      render(
        <ChartReplayProbe
          host={host}
          player={player}
          store={store}
          windowMs={WINDOW_MS}
          timeOrigin={100_000}
        />,
      );
      await settle();
    });
    pushes.length = 0;

    await act(async () => {
      player.emitFrame({ channelId: "signal", t: 151_000, data: { value: 3020 } });
      player.emitTick(151_000);
      await settle();
    });

    expect(pushes).toHaveLength(1);
    expect(pushes[0].sample).toEqual({ t: 151_000 - 100_000, y: 3020 }); // host-relative
  });
});
