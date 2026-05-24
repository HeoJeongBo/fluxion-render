import { useEffect, useMemo, useRef } from "react";
import type { FluxionHost, LineLayerHandle, LineSample } from "@heojeongbo/fluxion-render";
import type { ReplayStore } from "../../../features/store/model/replay-store";
import type { BaseChannel } from "../../../shared/model/base-channel";

export interface UseChartLiveBackfillOptions<T> {
  /** Host returned by `<FluxionCanvas onReady={setHost}>`. `null` while mounting. */
  host: FluxionHost | null;
  /** Store backing the recorder. The hook flushes it before querying. */
  store: ReplayStore | null;
  /** Channel to read from. */
  channel: BaseChannel<T>;
  /** Target line layer id. Defaults to `channel.channelId`. */
  layerId?: string;
  /**
   * Visible window in ms. Backfill queries `[now - windowMs, now]` from
   * the store and pushes that batch into the chart.
   */
  windowMs: number;
  /** Extract the chart y-value from a decoded frame. */
  pickValue: (data: T) => number;
  /**
   * Subtracted from every `t` before pushing to the chart layer — same
   * meaning as `useChartReplay.timeOrigin`. Required to keep the Float32
   * wire format precise. Pass the same value the chart's `axisGridLayer`
   * uses for `timeOrigin`.
   */
  timeOrigin?: number;
  /**
   * When `true`, run one backfill on mount and again every time `active`
   * transitions from `false` → `true`. When `false`, no-op.
   *
   * In chart-replay this is wired to `isLive`: it fires on initial mount
   * (fills with whatever the store already has) and on every DVR→Live
   * transition so the chart picks up the data that accumulated during
   * time-travel without waiting for live `push()` to catch up.
   */
  active: boolean;
}

/**
 * Live-mode mirror of `useChartReplay`'s hydrate: on every transition
 * into live mode, flush the recorder's pending batch, query the most
 * recent `windowMs` of frames for `channel`, and reset+push the chart
 * layer so the user sees the just-recorded data immediately instead of
 * an empty axis until streaming `push()` catches up.
 *
 * Pair with `useFluxionStream` (which handles the ongoing live push)
 * and `useChartReplay` (which owns the chart during DVR). The three
 * hooks cover the full lifecycle: live → DVR enter (replay hydrate) →
 * DVR exit (this hook re-hydrates from recent live frames) → live.
 *
 * @example
 * useChartLiveBackfill({
 *   host, store: session?.store ?? null, channel,
 *   layerId: "line", windowMs: 5_000, timeOrigin,
 *   pickValue: (d) => d.value,
 *   active: !dvr.isDvr,
 * });
 */
export function useChartLiveBackfill<T>(
  opts: UseChartLiveBackfillOptions<T>,
): void {
  const { host, store, channel, windowMs, pickValue, active } = opts;
  const layerId = opts.layerId ?? channel.channelId;
  const timeOrigin = opts.timeOrigin ?? 0;

  // Capture pickValue in a ref so an inline-arrow callback doesn't churn
  // the effect on every render.
  const pickRef = useRef(pickValue);
  pickRef.current = pickValue;

  const handle = useMemo<LineLayerHandle | null>(
    () => (host ? host.line(layerId) : null),
    [host, layerId],
  );

  useEffect(() => {
    if (!active || !handle || !store) return;

    // SYNC immediate reset (Phase 16). Worker postMessage is FIFO, so this
    // reset lands AHEAD of any stale write that a just-disposed DVR
    // hydrate may still be flushing through the queue. Without this, the
    // exit-race can leave the chart blank: the async backfill chain
    // sometimes loses to a late-arriving stale `handle.reset(dvrT)` from
    // useChartReplay.
    handle.reset(Date.now() - timeOrigin);

    let cancelled = false;
    void (async () => {
      try {
        // Commit any in-memory frames so the query reflects everything the
        // recorder has accepted — including frames pushed during the DVR
        // session we're transitioning out of.
        await store.flush();
        if (cancelled) return;

        const now = Date.now();
        const frames = await store.getFramesByChannel(
          channel.channelId,
          now - windowMs,
          now,
        );
        if (cancelled) return;

        const batch: LineSample[] = frames.map((f) => ({
          t: f.t - timeOrigin,
          y: pickRef.current(channel.decode(f.payload) as T),
        }));
        // Re-reset to "now" — wall clock may have drifted ~10-50 ms during
        // the awaits. Subsequent pushBatch re-anchors the time axis at
        // `[now - windowMs, now]`.
        handle.reset(now - timeOrigin);
        if (batch.length > 0) handle.pushBatch(batch);
      } catch {
        // Store may have been disposed mid-flight; ignore.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [active, handle, store, channel, windowMs, timeOrigin]);
}
