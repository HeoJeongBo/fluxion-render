import { act, render } from "@testing-library/react";
import { bench, describe } from "vitest";
import {
  buildRecording,
  ChartReplayProbe,
  makeFakeHost,
  makeFakePlayer,
  makeFakeStore,
} from "./chart-replay-fixtures";

/**
 * useChartReplay performance benchmarks.
 *
 * Caveat: runs under happy-dom + a fake in-memory IDB (see src/test/setup.ts).
 * Numbers are useful for *relative* comparison across changes — not as
 * absolute production estimates. Real browser IDB has very different cost
 * curves around range queries, transactions, and structured-clone payloads.
 *
 * Run with:  pnpm --filter @heojeongbo/fluxion-replay test:bench
 */

const ORIGIN = 1_000_000;
const HZ = 20;
const SESSION_MS = 60_000;        // 60s recording
const WINDOW_MS = 5_000;          // 5s visible window
const SEEK_AT = ORIGIN + 30_000;  // seek to t = 30s
const SEEK_BACK = ORIGIN + 20_000; // re-seek another 10s back

// Built once per process — 1200 SerializedFrames. Each bench iteration reuses
// it as the store payload (read-only), so the build cost doesn't pollute the
// measurement.
const FRAMES = buildRecording({
  origin: ORIGIN,
  hz: HZ,
  durationMs: SESSION_MS,
});

describe("useChartReplay — 60s recording, seek to 30s", () => {
  bench(
    "cold mount: hydrate at t=30s (1200 frames in store, 5s window → ~100 samples)",
    async () => {
      const { host } = makeFakeHost();
      const player = makeFakePlayer(SEEK_AT);
      const store = makeFakeStore({ signal: FRAMES });

      let result: ReturnType<typeof render> | undefined;
      await act(async () => {
        result = render(
          <ChartReplayProbe
            host={host}
            player={player}
            store={store}
            windowMs={WINDOW_MS}
            timeOrigin={ORIGIN}
          />,
        );
        // Two microtask hops: first lets the hydrate Promise schedule,
        // second lets its .then continuation flush handle.reset + pushBatch.
        await Promise.resolve();
        await Promise.resolve();
      });
      result?.unmount();
    },
  );

  bench(
    "warm seek: mount + one seek round trip (two hydrate cycles)",
    async () => {
      const { host } = makeFakeHost();
      const player = makeFakePlayer(SEEK_AT);
      const store = makeFakeStore({ signal: FRAMES });

      let result: ReturnType<typeof render> | undefined;
      await act(async () => {
        result = render(
          <ChartReplayProbe
            host={host}
            player={player}
            store={store}
            windowMs={WINDOW_MS}
            timeOrigin={ORIGIN}
          />,
        );
        await Promise.resolve();
        await Promise.resolve();
      });

      await act(async () => {
        player.emitSeek(SEEK_BACK);
        await Promise.resolve();
        await Promise.resolve();
      });

      result?.unmount();
    },
  );
});
