import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type FakePlayer,
  makeFakePlayer,
  makeFakeSession,
} from "../../chart-replay/lib/chart-replay-fixtures";
import { useReplayDvr, type UseReplayDvrOptions } from "./use-replay-dvr";

// Tight wrapper to drive useReplayDvr through renderHook. Lets us swap props
// (liveTimeRange, autoPlay, etc.) and re-render without rebuilding the harness.
function setup(initial: UseReplayDvrOptions) {
  return renderHook((props: UseReplayDvrOptions) => useReplayDvr(props), {
    initialProps: initial,
  });
}

const LIVE = { earliest: 1_000_000, latest: 1_060_000 };

describe("useReplayDvr", () => {
  beforeEach(() => vi.useRealTimers());
  afterEach(() => vi.useRealTimers());

  it("enter() calls enterReplay, sets isDvr, freezes latest, autoplays", async () => {
    const ses = makeFakeSession({ timeRange: LIVE });
    const { result } = setup({
      session: ses.session,
      enterReplay: ses.enterReplay,
      exitReplay: ses.exitReplay,
      liveTimeRange: LIVE,
    });

    expect(result.current.isDvr).toBe(false);
    expect(result.current.player).toBeNull();

    await act(async () => {
      await result.current.enter(1_030_000);
    });

    expect(ses.enterReplay).toHaveBeenCalledWith(1_030_000, {
      timeRange: { earliest: LIVE.earliest, latest: LIVE.latest },
    });
    expect(result.current.isDvr).toBe(true);
    expect(result.current.player).toBe(ses.player as unknown);
    expect(result.current.frozenLatest).toBe(LIVE.latest);
    expect(ses.player.play).toHaveBeenCalledTimes(1);
    expect(ses.player.play).toHaveBeenCalledWith(1);
  });

  it("enter() RESOLVES with the fresh player on success (Bug 1 contract)", async () => {
    // useScrubberControls' autoplay-on-commit relies on enter() returning the
    // player, because reading dvr.player after enter() gives the stale (null)
    // live-render value.
    const ses = makeFakeSession({ fresh: true, timeRange: LIVE });
    const { result } = setup({
      session: ses.session,
      enterReplay: ses.enterReplay,
      exitReplay: ses.exitReplay,
      liveTimeRange: LIVE,
      autoPlay: false,
    });
    let returned: unknown;
    await act(async () => {
      returned = await result.current.enter(1_030_000);
    });
    expect(returned).not.toBeNull();
    // It's the active player the hook now exposes — and the caller can play it.
    expect(returned).toBe(result.current.player as unknown);
  });

  it("enter() resolves with null when liveTimeRange is not seeded (no-op)", async () => {
    const ses = makeFakeSession({ timeRange: LIVE });
    const { result } = setup({
      session: ses.session,
      enterReplay: ses.enterReplay,
      exitReplay: ses.exitReplay,
      liveTimeRange: null, // not seeded yet
    });
    let returned: unknown = "sentinel";
    await act(async () => {
      returned = await result.current.enter(1_030_000);
    });
    expect(returned).toBeNull();
    expect(ses.enterReplay).not.toHaveBeenCalled();
    expect(result.current.isDvr).toBe(false);
  });

  it("enter() still engages DVR when liveTimeRange.latest slightly trails seekT (Bug 2 robustness)", async () => {
    // Under high-rate recording the polled liveTimeRange can lag real time, so a
    // dragged seekT may sit just past `latest`. enterReplay clamps into the IDB
    // range; entry must still succeed (not collapse to an instant-end player).
    const LAGGING = { earliest: 1_000_000, latest: 1_040_000 };
    const ses = makeFakeSession({ timeRange: LAGGING });
    const { result } = setup({
      session: ses.session,
      enterReplay: ses.enterReplay,
      exitReplay: ses.exitReplay,
      liveTimeRange: LAGGING,
    });
    await act(async () => {
      await result.current.enter(1_045_000); // 5s past the lagging latest
    });
    expect(ses.enterReplay).toHaveBeenCalled();
    expect(result.current.isDvr).toBe(true);
    expect(result.current.player).not.toBeNull();
  });

  it("enter() with no seekT defaults to liveTimeRange.earliest", async () => {
    const ses = makeFakeSession({ timeRange: LIVE });
    const { result } = setup({
      session: ses.session,
      enterReplay: ses.enterReplay,
      exitReplay: ses.exitReplay,
      liveTimeRange: LIVE,
    });
    await act(async () => {
      await result.current.enter();
    });
    expect(ses.enterReplay).toHaveBeenCalledWith(LIVE.earliest, {
      timeRange: { earliest: LIVE.earliest, latest: LIVE.latest },
    });
  });

  it("enter() respects custom rate", async () => {
    const ses = makeFakeSession({ timeRange: LIVE });
    const { result } = setup({
      session: ses.session,
      enterReplay: ses.enterReplay,
      exitReplay: ses.exitReplay,
      liveTimeRange: LIVE,
      rate: 2.5,
    });
    await act(async () => {
      await result.current.enter();
    });
    expect(ses.player.play).toHaveBeenCalledWith(2.5);
  });

  it("autoPlay: false skips the play() call", async () => {
    const ses = makeFakeSession({ timeRange: LIVE });
    const { result } = setup({
      session: ses.session,
      enterReplay: ses.enterReplay,
      exitReplay: ses.exitReplay,
      liveTimeRange: LIVE,
      autoPlay: false,
    });
    await act(async () => {
      await result.current.enter(LIVE.earliest);
    });
    expect(ses.player.play).not.toHaveBeenCalled();
    expect(result.current.isDvr).toBe(true);
  });

  it("autoExitToLive registers an onEnd handler on the player", async () => {
    const ses = makeFakeSession({ timeRange: LIVE });
    const { result } = setup({
      session: ses.session,
      enterReplay: ses.enterReplay,
      exitReplay: ses.exitReplay,
      liveTimeRange: LIVE,
    });
    await act(async () => { await result.current.enter(); });
    expect(ses.player.onEnd).toHaveBeenCalledTimes(1);
    expect(ses.player.endListenerCount()).toBe(1);
  });

  it("autoExitToLive: false skips the onEnd registration", async () => {
    const ses = makeFakeSession({ timeRange: LIVE });
    const { result } = setup({
      session: ses.session,
      enterReplay: ses.enterReplay,
      exitReplay: ses.exitReplay,
      liveTimeRange: LIVE,
      autoExitToLive: false,
    });
    await act(async () => { await result.current.enter(); });
    expect(ses.player.onEnd).not.toHaveBeenCalled();

    // Even if the player fires onEnd somehow, no listener is registered → no exit.
    await act(async () => { ses.player.emitEnd(); });
    expect(ses.exitReplay).not.toHaveBeenCalled();
    expect(result.current.isDvr).toBe(true);
  });

  it("exit() stops the player, calls exitReplay, and resets state", async () => {
    const ses = makeFakeSession({ timeRange: LIVE });
    const { result } = setup({
      session: ses.session,
      enterReplay: ses.enterReplay,
      exitReplay: ses.exitReplay,
      liveTimeRange: LIVE,
    });
    await act(async () => { await result.current.enter(); });

    await act(async () => { result.current.exit(); });

    expect(ses.player.dispose).toHaveBeenCalledTimes(1);
    expect(ses.exitReplay).toHaveBeenCalledTimes(1);
    expect(result.current.isDvr).toBe(false);
    expect(result.current.player).toBeNull();
    expect(result.current.frozenLatest).toBeNull();
  });

  it("a second enter() drops the previous onEnd handler", async () => {
    // Use a fresh-player fake so each enter returns a different instance —
    // this is the realistic shape (ReplaySession.enterReplay disposes the
    // old player and creates a new one).
    const ses = makeFakeSession({ fresh: true });
    const { result } = setup({
      session: ses.session,
      enterReplay: ses.enterReplay,
      exitReplay: ses.exitReplay,
      liveTimeRange: LIVE,
    });

    let firstPlayer: FakePlayer | null = null;
    await act(async () => { await result.current.enter(1_010_000); });
    firstPlayer = ses.player;
    expect(firstPlayer.endListenerCount()).toBe(1);

    await act(async () => { await result.current.enter(1_020_000); });
    // The first player's listener was unsubscribed before the second enter
    // installed its own.
    expect(firstPlayer.endListenerCount()).toBe(0);
    expect(ses.player.endListenerCount()).toBe(1);
  });

  it("effectiveTimeRange equals liveTimeRange in live mode", () => {
    const ses = makeFakeSession({ timeRange: LIVE });
    const { result } = setup({
      session: ses.session,
      enterReplay: ses.enterReplay,
      exitReplay: ses.exitReplay,
      liveTimeRange: LIVE,
    });
    expect(result.current.effectiveTimeRange).toEqual(LIVE);
  });

  it("effectiveTimeRange caps latest at frozenLatest while in DVR even if liveTimeRange.latest grows", async () => {
    const ses = makeFakeSession({ timeRange: LIVE });
    const { result, rerender } = setup({
      session: ses.session,
      enterReplay: ses.enterReplay,
      exitReplay: ses.exitReplay,
      liveTimeRange: LIVE,
    });
    await act(async () => { await result.current.enter(); });
    expect(result.current.effectiveTimeRange).toEqual({
      earliest: LIVE.earliest,
      latest: LIVE.latest,
    });

    // Live recording keeps advancing while user time-travels — re-render
    // with a newer latest. The scrubber must NOT jump forward.
    const advanced = { earliest: LIVE.earliest, latest: LIVE.latest + 30_000 };
    rerender({
      session: ses.session,
      enterReplay: ses.enterReplay,
      exitReplay: ses.exitReplay,
      liveTimeRange: advanced,
    });
    expect(result.current.effectiveTimeRange).toEqual({
      earliest: LIVE.earliest,
      latest: LIVE.latest, // frozen
    });
  });

  it("enter() is a no-op when liveTimeRange is null (not yet seeded)", async () => {
    // Both liveTimeRange AND getTimeRange() must be absent for enter() to no-op.
    // liveTimeRange null alone is not sufficient: if IDB already has data,
    // enter() uses it as a fallback so time-travel works even before the first
    // useLiveTimeRange poll resolves.
    const ses = makeFakeSession({ timeRange: null });
    const { result } = setup({
      session: ses.session,
      enterReplay: ses.enterReplay,
      exitReplay: ses.exitReplay,
      liveTimeRange: null,
    });
    await act(async () => { await result.current.enter(); });
    expect(ses.enterReplay).not.toHaveBeenCalled();
    expect(result.current.isDvr).toBe(false);
  });

  it("enter() is a no-op when session is null", async () => {
    const ses = makeFakeSession({ timeRange: LIVE });
    const { result } = setup({
      session: null,
      enterReplay: ses.enterReplay,
      exitReplay: ses.exitReplay,
      liveTimeRange: LIVE,
    });
    await act(async () => { await result.current.enter(); });
    expect(ses.enterReplay).not.toHaveBeenCalled();
  });

  // ── Scenario: 60s recording, user time-travels to t=30s ───────────────────
  // Matches the user-facing flow that drove this hook's design.

  describe("scenario: 60s recording, time-travel to t=30s", () => {
    const LIVE_60S = { earliest: 1_000_000, latest: 1_060_000 };

    it("auto-plays from the seek point and auto-returns to live when the player ends", async () => {
      // Pre-build the player so we can assert against the exact instance the
      // hook receives from enterReplay.
      const player = makeFakePlayer(0);
      const ses = makeFakeSession({ player });
      const { result } = setup({
        session: ses.session,
        enterReplay: ses.enterReplay,
        exitReplay: ses.exitReplay,
        liveTimeRange: LIVE_60S,
      });

      // 1) User clicks the scrubber at the 30s mark.
      await act(async () => {
        await result.current.enter(1_030_000);
      });

      expect(ses.enterReplay).toHaveBeenCalledWith(1_030_000, {
        timeRange: { earliest: 1_000_000, latest: 1_060_000 },
      });
      expect(result.current.isDvr).toBe(true);
      expect(result.current.frozenLatest).toBe(1_060_000);
      // Scrubber max is locked to where live was when DVR opened.
      expect(result.current.effectiveTimeRange).toEqual({
        earliest: 1_000_000,
        latest: 1_060_000,
      });
      // Auto-play kicked in.
      expect(player.play).toHaveBeenCalledWith(1);
      // Auto-exit hook installed.
      expect(player.endListenerCount()).toBe(1);

      // 2) Live recording keeps growing. The scrubber stays put.
      // (Skipped explicit rerender — covered by the dedicated test above.)

      // 3) Playback reaches the frozen edge → player fires onEnd.
      await act(async () => {
        player.emitEnd();
      });

      // 4) Hook automatically tore down DVR and returned to live.
      expect(ses.exitReplay).toHaveBeenCalledTimes(1);
      expect(player.dispose).toHaveBeenCalledTimes(1);
      expect(result.current.isDvr).toBe(false);
      expect(result.current.player).toBeNull();
      expect(result.current.frozenLatest).toBeNull();
      // Back to the (still-current) live range.
      expect(result.current.effectiveTimeRange).toEqual(LIVE_60S);
    });

    it("rapid scrubber drag: a burst of enter() calls leaves only the final cycle alive", async () => {
      // Simulates the chart-replay scrubber pattern where each onChange fires
      // enter(t). The hook should drop every previous onEnd handler so only
      // the most recent player ends up registered for auto-exit.
      const ses = makeFakeSession({ fresh: true });
      const { result } = setup({
        session: ses.session,
        enterReplay: ses.enterReplay,
        exitReplay: ses.exitReplay,
        liveTimeRange: LIVE_60S,
      });

      const playersSeen: FakePlayer[] = [];
      // Five rapid drags across [25s, 5s].
      for (const seekT of [1_025_000, 1_020_000, 1_015_000, 1_010_000, 1_005_000]) {
        await act(async () => { await result.current.enter(seekT); });
        playersSeen.push(ses.player);
      }

      // Every intermediate player had its listener torn off — only the last
      // one still holds an active onEnd subscription.
      const final = playersSeen[playersSeen.length - 1]!;
      expect(final.endListenerCount()).toBe(1);
      for (const p of playersSeen.slice(0, -1)) {
        expect(p.endListenerCount()).toBe(0);
      }

      // And only the final player is the one the consumer sees.
      expect(result.current.player).toBe(final);
      expect(result.current.isDvr).toBe(true);

      // Firing onEnd on a stale player must NOT exit DVR — its listener is gone.
      await act(async () => { playersSeen[0]!.emitEnd(); });
      expect(ses.exitReplay).not.toHaveBeenCalled();
      expect(result.current.isDvr).toBe(true);

      // Firing onEnd on the live player still drops back to live.
      await act(async () => { final.emitEnd(); });
      expect(ses.exitReplay).toHaveBeenCalledTimes(1);
      expect(result.current.isDvr).toBe(false);
    });

    it("explicit exit() works the same way as the auto-exit path", async () => {
      const player = makeFakePlayer(0);
      const ses = makeFakeSession({ player });
      const { result } = setup({
        session: ses.session,
        enterReplay: ses.enterReplay,
        exitReplay: ses.exitReplay,
        liveTimeRange: LIVE_60S,
      });
      await act(async () => { await result.current.enter(1_030_000); });

      await act(async () => { result.current.exit(); });

      expect(ses.exitReplay).toHaveBeenCalledTimes(1);
      expect(player.dispose).toHaveBeenCalledTimes(1);
      expect(result.current.isDvr).toBe(false);
    });
  });

  // ── enter() cancellation: simulates the scrubber-drag race that causes the
  // "cursor stuck at B~B" bug. Multiple in-flight enters can resolve out of
  // order, exit() can land between an enter()'s await and setPlayer, and the
  // hook must end up with exactly one consistent player (the last enter, or
  // null if exit won).

  describe("enter() cancellation under concurrent calls", () => {
    it("burst of enters without await: only the last enter's player ends up active, all others are disposed", async () => {
      const ses = makeFakeSession({ fresh: true });
      const { result } = setup({
        session: ses.session,
        enterReplay: ses.enterReplay,
        exitReplay: ses.exitReplay,
        liveTimeRange: LIVE,
      });

      ses.holdEnter();
      // Fire 4 enters back-to-back without awaiting any.
      const seekTs = [1_010_000, 1_020_000, 1_030_000, 1_040_000];
      await act(async () => {
        for (const t of seekTs) void result.current.enter(t);
      });
      expect(ses.pendingEnterCount()).toBe(4);

      // Release in arrival order (normal case).
      await act(async () => {
        await ses.releaseEnter();
        await Promise.resolve();
        await Promise.resolve();
      });

      // Only the last seekT's player should be live — the rest must be
      // disposed so they don't leak rAF loops / listeners.
      const allPlayers = (ses.enterReplay as unknown as { mock: { results: { value: Promise<FakePlayer> }[] } }).mock.results;
      const players = await Promise.all(allPlayers.map((r) => r.value));
      expect(result.current.player).toBe(players[players.length - 1]);
      // The 3 stale players should be disposed.
      for (const p of players.slice(0, -1)) {
        expect(p.dispose).toHaveBeenCalledTimes(1);
      }
      // Final player: NOT disposed.
      expect(players[players.length - 1]!.dispose).not.toHaveBeenCalled();
      expect(result.current.isDvr).toBe(true);

      result.current.exit();
    });

    it("stale enter resolves AFTER fresh enter — stale player is disposed, fresh player wins", async () => {
      const ses = makeFakeSession({ fresh: true, timeRange: LIVE });
      const { result } = setup({
        session: ses.session,
        enterReplay: ses.enterReplay,
        exitReplay: ses.exitReplay,
        liveTimeRange: LIVE,
      });

      ses.holdEnter();
      await act(async () => {
        void result.current.enter(1_010_000);
        void result.current.enter(1_020_000);
      });

      // Resolve in REVERSE — fresh enter resolves first, stale resolves second.
      await act(async () => {
        await ses.releaseEnterReverse();
        await Promise.resolve();
        await Promise.resolve();
      });

      const allPlayers = (ses.enterReplay as unknown as { mock: { results: { value: Promise<FakePlayer> }[] } }).mock.results;
      const [stalePlayer, freshPlayer] = await Promise.all(allPlayers.map((r) => r.value));
      // Fresh wins regardless of resolution order.
      expect(result.current.player).toBe(freshPlayer);
      // Stale is disposed, not silently kept alive.
      expect(stalePlayer!.dispose).toHaveBeenCalledTimes(1);

      result.current.exit();
    });

    it("exit() lands while an enter() is in-flight — stale enter must NOT re-enter DVR", async () => {
      const ses = makeFakeSession({ fresh: true });
      const { result } = setup({
        session: ses.session,
        enterReplay: ses.enterReplay,
        exitReplay: ses.exitReplay,
        liveTimeRange: LIVE,
      });

      // Establish DVR with a quick enter so exit() has something to clean up.
      await act(async () => { await result.current.enter(1_005_000); });
      expect(result.current.isDvr).toBe(true);

      ses.holdEnter();
      let enterPromise: ReturnType<typeof result.current.enter>;
      await act(async () => {
        enterPromise = result.current.enter(1_020_000);
      });
      expect(ses.pendingEnterCount()).toBe(1);

      // User decides to bail before the in-flight enter resolves.
      await act(async () => { result.current.exit(); });
      expect(result.current.isDvr).toBe(false);

      // Now the stale enter resolves.
      await act(async () => {
        await ses.releaseEnter();
        await enterPromise;
        await Promise.resolve();
      });

      // The hook must remain in live mode — stale enter's player is disposed.
      expect(result.current.isDvr).toBe(false);
      expect(result.current.player).toBeNull();
      const allPlayers = (ses.enterReplay as unknown as { mock: { results: { value: Promise<FakePlayer> }[] } }).mock.results;
      const stalePlayer = await allPlayers[allPlayers.length - 1]!.value;
      expect(stalePlayer.dispose).toHaveBeenCalledTimes(1);
    });

    it("exit() during an in-flight enter re-syncs the session when the stale enter resolves", async () => {
      // The session-level enterReplay completes AFTER exitReplay() already ran,
      // leaving session._mode = "replay" (and useReplaySession.mode = "replay")
      // while the UI is live. The gen-mismatch path must call exitReplay()
      // again to re-sync — otherwise apps rendering off the session mode show
      // replay UI intermittently after a cancelled scrub (same bug class as
      // the "dot jumps left after returning to live" race).
      const ses = makeFakeSession({ fresh: true, timeRange: LIVE });
      const { result } = setup({
        session: ses.session,
        enterReplay: ses.enterReplay,
        exitReplay: ses.exitReplay,
        liveTimeRange: LIVE,
      });

      ses.holdEnter();
      let enterPromise: ReturnType<typeof result.current.enter>;
      await act(async () => {
        enterPromise = result.current.enter(1_020_000);
      });

      await act(async () => {
        result.current.exit();
      });
      expect(ses.exitReplay).toHaveBeenCalledTimes(1);

      await act(async () => {
        await ses.releaseEnter();
        await enterPromise;
        await Promise.resolve();
      });

      // Re-synced: a second exitReplay after the cancelled enter resolved.
      expect(ses.exitReplay).toHaveBeenCalledTimes(2);
      expect(result.current.isDvr).toBe(false);
      expect(result.current.player).toBeNull();
      expect(ses.player.dispose).toHaveBeenCalledTimes(1);
    });

    it("a stale enter superseded by a NEWER enter does not call exitReplay", async () => {
      // The re-sync must only fire when the gen bump RETURNED TO LIVE. When a
      // newer enter() superseded the stale one, calling exitReplay() would
      // tear down the newer call's session player mid-flight.
      const ses = makeFakeSession({ fresh: true, timeRange: LIVE });
      const { result } = setup({
        session: ses.session,
        enterReplay: ses.enterReplay,
        exitReplay: ses.exitReplay,
        liveTimeRange: LIVE,
      });

      ses.holdEnter();
      await act(async () => {
        void result.current.enter(1_010_000); // stale
      });
      await act(async () => {
        result.current.exit(); // bump #1: to live
      });
      await act(async () => {
        void result.current.enter(1_020_000); // newer enter resets the flag
      });

      await act(async () => {
        await ses.releaseEnter(); // resolve both in arrival order
        await Promise.resolve();
        await Promise.resolve();
      });

      // Only the explicit exit() called exitReplay — the stale enter's
      // resolution yielded to the newer enter instead of re-syncing.
      expect(ses.exitReplay).toHaveBeenCalledTimes(1);
      expect(result.current.isDvr).toBe(true);
      const allPlayers = (ses.enterReplay as unknown as { mock: { results: { value: Promise<FakePlayer> }[] } }).mock.results;
      const [stalePlayer, freshPlayer] = await Promise.all(allPlayers.map((r) => r.value));
      expect(result.current.player).toBe(freshPlayer);
      expect(stalePlayer!.dispose).toHaveBeenCalledTimes(1);
      expect(freshPlayer!.dispose).not.toHaveBeenCalled();

      result.current.exit();
    });
  });

  // Callback identity guard — see Phase 10 bug class.
  it("returned callbacks (enter, exit) have stable identity across re-renders with the same liveTimeRange", () => {
    const ses = makeFakeSession({ timeRange: LIVE });
    const { result, rerender } = setup({
      session: ses.session,
      enterReplay: ses.enterReplay,
      exitReplay: ses.exitReplay,
      liveTimeRange: LIVE,
    });
    const r0 = { enter: result.current.enter, exit: result.current.exit };
    rerender({
      session: ses.session,
      enterReplay: ses.enterReplay,
      exitReplay: ses.exitReplay,
      liveTimeRange: LIVE,
    });
    expect(result.current.enter).toBe(r0.enter);
    expect(result.current.exit).toBe(r0.exit);
  });

  // Phase 13: enter() must propagate the liveTimeRange snapshot as
  // enterReplay's opts.timeRange. Without this, the player ends at the
  // store's IDB latest (which can differ from what the UI scrubber froze),
  // creating a dead-time gap where the cursor looks stuck at the right edge
  // before onEnd finally fires.
  describe("Phase 13: frozen timeRange propagation", () => {
    it("forwards liveTimeRange as opts.timeRange to enterReplay", async () => {
      const ses = makeFakeSession({ timeRange: LIVE });
      const live = { earliest: 1_000_000, latest: 1_045_000 };
      const { result } = setup({
        session: ses.session,
        enterReplay: ses.enterReplay,
        exitReplay: ses.exitReplay,
        liveTimeRange: live,
      });
      await act(async () => { await result.current.enter(1_020_000); });
      expect(ses.enterReplay).toHaveBeenCalledWith(1_020_000, {
        timeRange: { earliest: live.earliest, latest: live.latest },
      });
    });

    it("frozenLatest matches the liveTimeRange.latest captured at enter() time", async () => {
      const ses = makeFakeSession({ timeRange: LIVE });
      const liveAtClick = { earliest: 1_000_000, latest: 1_045_000 };
      const { result, rerender } = setup({
        session: ses.session,
        enterReplay: ses.enterReplay,
        exitReplay: ses.exitReplay,
        liveTimeRange: liveAtClick,
      });
      await act(async () => { await result.current.enter(1_020_000); });
      expect(result.current.frozenLatest).toBe(liveAtClick.latest);

      // liveTimeRange keeps growing in the background — must NOT shift frozen.
      const grew = { earliest: 1_000_000, latest: 1_060_000 };
      rerender({
        session: ses.session,
        enterReplay: ses.enterReplay,
        exitReplay: ses.exitReplay,
        liveTimeRange: grew,
      });
      expect(result.current.frozenLatest).toBe(liveAtClick.latest);
    });

    it("a no-seekT enter still passes the full liveTimeRange as opts.timeRange", async () => {
      const ses = makeFakeSession({ timeRange: LIVE });
      const live = { earliest: 500_000, latest: 800_000 };
      const { result } = setup({
        session: ses.session,
        enterReplay: ses.enterReplay,
        exitReplay: ses.exitReplay,
        liveTimeRange: live,
      });
      await act(async () => { await result.current.enter(); });
      expect(ses.enterReplay).toHaveBeenCalledWith(live.earliest, {
        timeRange: { earliest: live.earliest, latest: live.latest },
      });
    });
  });

  // ── Unmount cleanup ────────────────────────────────────────────────────────
  it("unmounting while DVR is active calls offEnd cleanup (lines 192-193)", async () => {
    const ses = makeFakeSession({ timeRange: LIVE });
    const { result, unmount } = setup({
      session: ses.session,
      enterReplay: ses.enterReplay,
      exitReplay: ses.exitReplay,
      liveTimeRange: LIVE,
      autoExitToLive: true,
    });

    // Enter DVR — this registers an onEnd listener (sets offEndRef.current)
    await act(async () => { await result.current.enter(1_030_000); });
    expect(ses.player.endListenerCount()).toBe(1);

    // Unmount without calling exit() — the useEffect cleanup should call
    // offEndRef.current?.() which removes the onEnd listener
    unmount();
    expect(ses.player.endListenerCount()).toBe(0);
  });

  it("enter() is a no-op when enterReplay returns null", async () => {
    const ses = makeFakeSession({ timeRange: LIVE });
    // Override enterReplay to return null (simulates session not ready)
    const enterReplayNull = vi.fn(async () => null as unknown as ReturnType<typeof ses.enterReplay> extends Promise<infer T> ? T : never);
    const { result } = setup({
      session: ses.session,
      enterReplay: enterReplayNull as typeof ses.enterReplay,
      exitReplay: ses.exitReplay,
      liveTimeRange: LIVE,
    });

    await act(async () => {
      await result.current.enter(1_030_000);
    });

    // isDvr stays false because enterReplay returned null
    expect(result.current.isDvr).toBe(false);
    expect(result.current.player).toBeNull();
  });
});
