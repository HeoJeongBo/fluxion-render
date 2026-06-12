/**
 * useChartReplay — prefetch margin (instant scrub/seek).
 *
 * The hydrate fetches + caches a ±prefetchMarginMs (default 3000) WIDER range
 * than the visible window `[t - windowMs, t]`, but renders ONLY the visible
 * window. A re-seek within the margin is then a pure cache hit (no IDB query).
 *
 * Kept in its own file so the large use-chart-replay.test.tsx doesn't grow past
 * the vitest fork worker's heap budget.
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
  ChartReplayProbe,
  makeFakeHost,
  makeFakePlayer,
  makeFakeStore,
  metricFrame,
} from "./chart-replay-fixtures";

beforeAll(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterAll(() => vi.restoreAllMocks());

const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("useChartReplay — prefetch margin", () => {
  beforeEach(() => vi.useRealTimers());
  afterEach(() => vi.useRealTimers());

  it("fetches a ±marginMs wider range than the visible window", async () => {
    const { host } = makeFakeHost();
    const player = makeFakePlayer(10_000);
    const store = makeFakeStore({ signal: [metricFrame("signal", 9000, 0.5)] });

    await act(async () => {
      render(
        <ChartReplayProbe host={host} player={player} store={store} windowMs={2000} />,
      );
      await settle();
    });

    // Visible window [8000, 10000], widened by ±3000 → [5000, 13000].
    expect(store.getFramesByChannel).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: "signal" }),
      5000,
      13000,
    );
  });

  it("a seek within marginMs of the previous seek is a cache hit (no 2nd query)", async () => {
    const { host, resets } = makeFakeHost();
    const player = makeFakePlayer(10_000);
    const store = makeFakeStore({
      signal: [
        metricFrame("signal", 8500, 0.1),
        metricFrame("signal", 9500, 0.2),
        metricFrame("signal", 10_500, 0.3),
        metricFrame("signal", 11_000, 0.4),
      ],
    });

    await act(async () => {
      render(
        <ChartReplayProbe host={host} player={player} store={store} windowMs={2000} />,
      );
      await settle();
    });
    // One query on mount: cached [5000, 13000].
    expect(store.getFramesByChannel).toHaveBeenCalledTimes(1);

    // Seek to 11_500: visibleFrom 9_500 >= 5000 and 11_500 <= 13_000 → cache hit.
    await act(async () => {
      player.emitSeek(11_500);
      await settle();
    });

    // No second IDB query — served from cache…
    expect(store.getFramesByChannel).toHaveBeenCalledTimes(1);
    // …but it still re-rendered: a fresh reset at the new seek point fired.
    expect(resets.at(-1)).toEqual({ id: "signal", latestT: 11_500 });
  });

  it("pushes ONLY the visible window despite the wider fetch", async () => {
    const { host, batches } = makeFakeHost();
    const player = makeFakePlayer(10_000);
    // Frames spanning the wider fetch [5000,13000]; visible window is [8000,10000].
    const store = makeFakeStore({
      signal: [
        metricFrame("signal", 6000, 1), // margin (below) — must NOT be pushed
        metricFrame("signal", 8500, 2), // visible
        metricFrame("signal", 9500, 3), // visible
        metricFrame("signal", 11_000, 4), // margin (above) — must NOT be pushed
      ],
    });

    await act(async () => {
      render(
        <ChartReplayProbe host={host} player={player} store={store} windowMs={2000} />,
      );
      await settle();
    });

    expect(store.getFramesByChannel).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: "signal" }),
      5000,
      13000,
    );
    expect(batches).toHaveLength(1);
    expect(batches[0].samples).toEqual([
      { t: 8500, y: 2 },
      { t: 9500, y: 3 },
    ]);
  });
});
