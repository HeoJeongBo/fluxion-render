import { useEffect, useMemo, useRef, useState } from "react";
import type { FluxionHost, LineLayerHandle, LineSample } from "@heojeongbo/fluxion-render";
import type { ReplayPlayer } from "../../../features/player/model/replay-player";
import type { ReplayStore } from "../../../features/store/model/replay-store";
import type { BaseChannel } from "../../../shared/model/base-channel";

export interface UseChartReplayOptions<T> {
  /** Host returned by `<FluxionCanvas onReady={setHost}>`. `null` while mounting. */
  host: FluxionHost | null;
  /**
   * Player from `session.enterReplay()`. `null` puts the hook in idle mode —
   * nothing is fetched or pushed. Setting it to a non-null player triggers an
   * immediate backfill at `player.currentT`.
   */
  player: ReplayPlayer | null;
  /** The store backing `player`. Used for the windowed channel-scoped query. */
  store: ReplayStore | null;
  /** Channel to read from. The hook subscribes to `player.onFrame` for this id. */
  channel: BaseChannel<T>;
  /** Target line layer id. Defaults to `channel.channelId`. */
  layerId?: string;
  /**
   * Visible window in ms. On mount and on every `player.seek(t)`, the hook
   * queries `[t - windowMs, t]` from the store and pushes that batch into
   * the chart so the seek point becomes the right edge of the time axis.
   */
  windowMs: number;
  /** Extract the chart y-value from a decoded frame. */
  pickValue: (data: T) => number;
  /**
   * Subtracted from every `t` before it's pushed to the chart layer. The chart's
   * wire format is `Float32` per `[t, y]` pair, so passing absolute ms-since-epoch
   * (~1.78e12) quantises 20Hz samples into a single bucket (~131,072ms precision)
   * — the chart degenerates into a vertical line.
   *
   * Pick a stable origin near "now" (e.g. `useMemo(() => Date.now(), [])` at the
   * page level) and pass the same value to `axisGridLayer({ timeOrigin })` so
   * tick labels still show wall-clock time. Store queries are unaffected — the
   * store holds absolute t, and only the in-memory chart push is shifted.
   *
   * Default `0` (push absolute t — only safe when t fits Float32 precision,
   * i.e. tests with small values or session-relative timelines).
   */
  timeOrigin?: number;
}

export interface UseChartReplayResult {
  /** True while a hydrate (backfill query + push) is in flight. */
  isHydrating: boolean;
  /** Sample count from the most recent hydrate (live `onFrame` pushes not counted). */
  hydratedCount: number;
}

/**
 * Bridge between `ReplayPlayer` and a `fluxion-render` streaming line layer.
 *
 * Lifecycle:
 *   - Mount (or `player` becomes non-null) → hydrate at `player.currentT`:
 *     query the store for `[currentT - windowMs, currentT]`, decode each
 *     frame's payload via `channel.decode`, then `handle.reset(currentT)` +
 *     `handle.pushBatch(...)` to make the seek point the right edge.
 *   - `player.seek(t)` → re-hydrate at the clamped t.
 *   - `player.onFrame(channelId)` → `handle.push({ t, y })` for live playback.
 *   - Unmount or deps change → unsubscribe and ignore any in-flight hydrate.
 *
 * Pair with an `axisGridLayer({ xMode: "time", timeWindowMs })` whose
 * `timeWindowMs` matches `windowMs` to keep the chart axis in lockstep.
 */
export function useChartReplay<T>(
  opts: UseChartReplayOptions<T>,
): UseChartReplayResult {
  const { host, player, store, channel, windowMs, pickValue } = opts;
  const layerId = opts.layerId ?? channel.channelId;
  const timeOrigin = opts.timeOrigin ?? 0;

  const [isHydrating, setIsHydrating] = useState(false);
  const [hydratedCount, setHydratedCount] = useState(0);

  // Capture pickValue in a ref so inline arrow functions don't reset the
  // effect on every render — only structural deps drive re-subscription.
  const pickRef = useRef(pickValue);
  pickRef.current = pickValue;

  const handle = useMemo<LineLayerHandle | null>(
    () => (host ? host.line(layerId) : null),
    [host, layerId],
  );

  useEffect(() => {
    if (!handle || !player || !store) return;

    let cancelled = false;

    const hydrate = async (t: number) => {
      setIsHydrating(true);
      try {
        // Store keeps absolute t; query in that space.
        const frames = await store.getFramesByChannel(channel.channelId, t - windowMs, t);
        if (cancelled) return;
        // Shift into the chart's host-relative timeline so the Float32 wire
        // format doesn't quantise away the resolution.
        const batch: LineSample[] = frames.map((f) => ({
          t: f.t - timeOrigin,
          y: pickRef.current(channel.decode(f.payload) as T),
        }));
        // 1) Drop stale data + force the worker-side axis to rewind to the
        //    seek point in host-relative space.
        // 2) Re-push backfill. The newest sample's t (≤ t - timeOrigin) bumps
        //    latestT back up via the layer's monotonic guard, settling the
        //    window at [t - windowMs - timeOrigin, t - timeOrigin] which
        //    exactly matches the visible range.
        handle.reset(t - timeOrigin);
        if (batch.length > 0) handle.pushBatch(batch);
        setHydratedCount(batch.length);
      } finally {
        if (!cancelled) setIsHydrating(false);
      }
    };

    void hydrate(player.currentT);

    const offSeek = player.onSeek((t) => {
      void hydrate(t);
    });

    const offFrame = player.onFrame((frame) => {
      if (frame.channelId !== channel.channelId) return;
      handle.push({ t: frame.t - timeOrigin, y: pickRef.current(frame.data as T) });
    });

    return () => {
      cancelled = true;
      offSeek();
      offFrame();
    };
  }, [handle, player, store, channel, windowMs, timeOrigin]);

  return { isHydrating, hydratedCount };
}
