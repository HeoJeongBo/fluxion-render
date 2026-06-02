import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReplayPlayer } from "../../../features/player/model/replay-player";
import type { ReplaySession } from "../../../features/session/model/replay-session";

export interface UseReplayDvrOptions {
  /** Session from `useReplaySession`. */
  session: ReplaySession | null;
  /** `enterReplay` callback returned by `useReplaySession`. */
  enterReplay: (
    t?: number,
    opts?: { timeRange?: { earliest: number; latest: number } },
  ) => Promise<ReplayPlayer | null>;
  /** `exitReplay` callback returned by `useReplaySession`. */
  exitReplay: () => void;
  /**
   * Live time range — typically `useLiveTimeRange(session).timeRange`. Used
   * to (1) pick a default seek target when `enter()` is called without an
   * explicit time and (2) freeze the scrubber upper bound to the recording's
   * latest at the moment of DVR entry so it doesn't drift forward with new
   * live frames while the user is scrubbing.
   */
  liveTimeRange: { earliest: number; latest: number } | null;
  /**
   * Call `player.play(rate)` immediately after entering DVR. Most apps want
   * "jump back in time → start playing forward from that point" without an
   * extra click. Set false if you need the user to press Play themselves.
   * Default `true`.
   */
  autoPlay?: boolean;
  /**
   * When the player reaches the frozen latest (the live edge at the moment
   * of DVR entry), automatically call `exit()` so the UI snaps back to live.
   * Hooks `player.onEnd` for the cycle. Default `true`.
   */
  autoExitToLive?: boolean;
  /** Initial playback rate forwarded to `player.play()`. Default `1`. */
  rate?: number;
}

export interface UseReplayDvrResult {
  /** True while a DVR player exists. */
  isDvr: boolean;
  /** The active `ReplayPlayer`, or null in live mode. */
  player: ReplayPlayer | null;
  /** Frozen live-latest captured when `enter()` ran. Null in live mode. */
  frozenLatest: number | null;
  /**
   * `liveTimeRange` in live mode; `{ earliest: liveTimeRange.earliest, latest:
   * frozenLatest }` in DVR mode. Wire this into the scrubber so its upper
   * bound stays put while the user time-travels.
   */
  effectiveTimeRange: { earliest: number; latest: number } | null;
  /**
   * Enter DVR mode. If `seekT` is omitted, seeks to `liveTimeRange.earliest`
   * (the start of the recording).
   *
   * No-op if `session` is null or `liveTimeRange` hasn't seeded yet.
   */
  enter: (seekT?: number) => Promise<void>;
  /** Stop the player, exit replay mode, and reset all DVR state. */
  exit: () => void;
}

/**
 * High-level DVR controller that bundles the live↔replay state machine most
 * apps end up writing by hand: freeze the live edge on entry, autoplay,
 * register an `onEnd` handler that returns to live, and expose an
 * `effectiveTimeRange` for the scrubber UI.
 *
 * The hook stays channel-agnostic — channel-specific bridges like
 * `useChartReplay` or `useVideoReplayer` consume `dvr.player` independently.
 *
 * @example
 * const { session, enterReplay, exitReplay } = useReplaySession({ channels });
 * const { timeRange: liveTimeRange } = useLiveTimeRange(session);
 * const dvr = useReplayDvr({ session, enterReplay, exitReplay, liveTimeRange });
 *
 * <button onClick={() => dvr.enter()}>Enter DVR</button>
 * <button onClick={dvr.exit}>Go Live</button>
 */
export function useReplayDvr(opts: UseReplayDvrOptions): UseReplayDvrResult {
  const {
    session,
    enterReplay,
    exitReplay,
    liveTimeRange,
    autoPlay = true,
    autoExitToLive = true,
    rate = 1,
  } = opts;

  const [player, setPlayer] = useState<ReplayPlayer | null>(null);
  const [frozenLatest, setFrozenLatest] = useState<number | null>(null);
  // Ref mirror of frozenLatest so enter() can read it synchronously without
  // listing it as a useCallback dep (which would recreate enter on every DVR
  // state change).
  const frozenLatestRef = useRef<number | null>(null);
  // Cached IDB latest fetched after the previous DVR exit. enter() uses this
  // to detect a stale liveTimeRange without an extra async getTimeRange() call
  // inside the hot enter() path, which would shift test timing.
  const postExitIdbLatestRef = useRef<number | null>(null);

  // Keep the latest scalar options in refs so the `enter` callback identity
  // is stable across re-renders while still seeing the freshest values.
  const autoPlayRef = useRef(autoPlay);
  const autoExitRef = useRef(autoExitToLive);
  const rateRef = useRef(rate);
  autoPlayRef.current = autoPlay;
  autoExitRef.current = autoExitToLive;
  rateRef.current = rate;

  // liveTimeRange in a ref so enter() can read it without listing it as a
  // useCallback dep — avoids recreating enter() on every poll tick while
  // still allowing enter() to see the latest value when it runs.
  const liveTimeRangeRef = useRef(liveTimeRange);
  liveTimeRangeRef.current = liveTimeRange;

  // Track the onEnd unsubscribe so a second enter() (without an exit first)
  // doesn't leak a stale listener on a now-disposed player.
  const offEndRef = useRef<(() => void) | null>(null);

  // Monotonic counter — bumped on every enter() AND exit(). Each enter()
  // captures the value on entry; if it doesn't match after the async
  // enterReplay() resolves, this call lost the race (a newer enter() or
  // exit() landed first) and must dispose the returned player without
  // touching React state. Without this, a scrubber drag that fires N
  // onChanges would call enter() N times — they'd all setPlayer in
  // arbitrary resolution order and leak (N - 1) parallel rAF loops.
  const enterGenRef = useRef(0);

  const exit = useCallback(() => {
    // Invalidate every in-flight enter() so its post-await body bails.
    enterGenRef.current++;
    offEndRef.current?.();
    offEndRef.current = null;
    setPlayer((current) => {
      current?.dispose();
      return null;
    });
    frozenLatestRef.current = null;
    setFrozenLatest(null);
    exitReplay();
    // Prefetch the current IDB latest so the next enter() can detect a stale
    // liveTimeRange without adding an async getTimeRange() to the hot path.
    postExitIdbLatestRef.current = session?.recorder?.index?.latest ?? null;
  }, [exitReplay, session]);

  const enter = useCallback(
    async (seekT?: number) => {
      if (!session) return;

      const myGen = ++enterGenRef.current;

      // Clean up a previous DVR cycle's onEnd before installing a new one.
      offEndRef.current?.();
      offEndRef.current = null;

      const live = liveTimeRangeRef.current;
      if (!live) return;

      // liveTimeRange polls every 500 ms via useLiveTimeRange. After a DVR
      // auto-exit (player.onEnd fires), the prop may still hold the previous
      // frozenLatest for up to 500 ms. exit() kicks off a background
      // getTimeRange() whose result is parked in postExitIdbLatestRef; we read
      // it synchronously here — no extra async await in the hot path — to
      // detect whether liveTimeRange is stale and, if so, use the IDB-fresh
      // value as the new frozen upper bound.
      const frozenPrev = frozenLatestRef.current;
      const postExitLatest = postExitIdbLatestRef.current;
      const isStale =
        frozenPrev !== null &&
        live.latest === frozenPrev &&
        postExitLatest !== null &&
        postExitLatest > live.latest;

      const frozen = isStale ? postExitLatest : live.latest;
      const target = seekT ?? live.earliest;

      // Pass the frozen range to enterReplay so player._timeRange.latest is
      // exactly `frozen` (after clamping into IDB's actual range). Without
      // this, the player ends at IDB-latest (which can be > `frozen` by up
      // to a recorder batch interval), creating a dead window where the UI
      // cursor visually clamps at the scrubber's right edge while onEnd
      // hasn't fired yet — the user reads it as "stuck".
      const p = await enterReplay(target, {
        timeRange: { earliest: live.earliest, latest: frozen },
      });
      if (!p) return;

      // A newer enter() (or exit()) ran while we awaited. Drop this player
      // — without dispose, its rAF loop / event listeners would leak even
      // though we never expose it via React state.
      if (myGen !== enterGenRef.current) {
        p.dispose();
        return;
      }

      frozenLatestRef.current = frozen;
      setFrozenLatest(frozen);
      setPlayer(p);

      if (autoExitRef.current) {
        offEndRef.current = p.onEnd(() => {
          // Inline rather than calling `exit` to avoid the closure capturing
          // a stale `exit` from when this `enter` ran. Also bump the gen so
          // any concurrent enter() that resolved between play() and onEnd
          // doesn't re-enter DVR.
          enterGenRef.current++;
          offEndRef.current = null;
          p.dispose();
          setPlayer(null);
          frozenLatestRef.current = null;
          setFrozenLatest(null);
          exitReplay();
          // Capture the recorder's in-memory latest for the next enter() staleness check.
          postExitIdbLatestRef.current = session?.recorder?.index?.latest ?? null;
        });
      }

      if (autoPlayRef.current) {
        p.play(rateRef.current);
      }
    },
    [session, enterReplay, exitReplay],
  );

  // Cleanup on unmount: drop the onEnd handler. We deliberately do NOT call
  // exitReplay here — the session might outlive this hook (it's owned by the
  // caller's useReplaySession). Stopping the player is enough.
  useEffect(() => {
    return () => {
      offEndRef.current?.();
      offEndRef.current = null;
    };
  }, []);

  // Memoised so consumers that put `effectiveTimeRange` in useEffect deps
  // don't re-fire on every parent render. Same (player, frozenLatest,
  // liveTimeRange) → identical reference.
  const effectiveTimeRange = useMemo(
    () =>
      player && frozenLatest != null && liveTimeRange
        ? { earliest: liveTimeRange.earliest, latest: frozenLatest }
        : liveTimeRange,
    [player, frozenLatest, liveTimeRange],
  );

  return {
    isDvr: player !== null,
    player,
    frozenLatest,
    effectiveTimeRange,
    enter,
    exit,
  };
}
