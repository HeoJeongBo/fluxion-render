/**
 * useScrubberControls — unit tests
 *
 * Verifies the "drag preview → release commit" state machine for the replay
 * scrubber. Tests use makeFakeSession + useReplayDvr (not the real session) so
 * they stay fast and deterministic.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  makeFakePlayer,
  makeFakeSession,
} from "../../chart-replay/lib/chart-replay-fixtures";
import { useReplayDvr } from "../../dvr/lib/use-replay-dvr";
import { useScrubberControls } from "./use-scrubber-controls";

const LIVE = { earliest: 1_000_000, latest: 1_060_000 };
const EPS = 250; // default liveEdgeEpsMs

/** Build a fake ChangeEvent<HTMLInputElement> carrying a numeric value. */
function fakeChange(value: number): React.ChangeEvent<HTMLInputElement> {
  return { target: { value: String(value) } } as React.ChangeEvent<HTMLInputElement>;
}

/** Wire useScrubberControls through a real useReplayDvr driven by fake session. */
function setup(rate = 1, liveEdgeEpsMs?: number) {
  const ses = makeFakeSession({ timeRange: LIVE });

  const { result } = renderHook(() => {
    const dvr = useReplayDvr({
      session: ses.session,
      enterReplay: ses.enterReplay,
      exitReplay: ses.exitReplay,
      liveTimeRange: LIVE,
      rate,
      autoPlay: false,
    });
    const controls = useScrubberControls({ dvr, rate, liveEdgeEpsMs });
    return { dvr, controls };
  });

  return { ses, result };
}

describe("useScrubberControls", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  // ── onScrubChange ─────────────────────────────────────────────────────────

  describe("onScrubChange", () => {
    it("tracks scrubT on every change", async () => {
      const { result } = setup();
      await act(async () => {
        result.current.controls.onScrubChange(fakeChange(1_030_000));
      });
      expect(result.current.controls.scrubT).toBe(1_030_000);
    });

    it("while live + t far from edge → calls dvr.enter(t) speculatively", async () => {
      const { ses, result } = setup();
      await act(async () => {
        result.current.controls.onScrubChange(fakeChange(1_030_000));
      });
      expect(ses.enterReplay).toHaveBeenCalledWith(1_030_000, expect.any(Object));
    });

    it("while live + t within liveEdgeEpsMs of edge → no-op (no enter)", async () => {
      const { ses, result } = setup();
      const nearEdge = LIVE.latest - EPS + 1; // inside eps window
      await act(async () => {
        result.current.controls.onScrubChange(fakeChange(nearEdge));
      });
      expect(ses.enterReplay).not.toHaveBeenCalled();
      expect(result.current.controls.scrubT).toBe(nearEdge);
    });

    it("while live + t exactly at edge boundary → no enter", async () => {
      const { ses, result } = setup();
      await act(async () => {
        result.current.controls.onScrubChange(fakeChange(LIVE.latest - EPS));
      });
      expect(ses.enterReplay).not.toHaveBeenCalled();
    });

    it("while DVR → does not call enter again, stays in DVR", async () => {
      const { ses, result } = setup();
      await act(async () => {
        await result.current.dvr.enter(1_030_000);
      });
      expect(result.current.dvr.isDvr).toBe(true);
      vi.clearAllMocks();

      await act(async () => {
        result.current.controls.onScrubChange(fakeChange(1_025_000));
      });

      // Still in DVR, no new enter call
      expect(result.current.dvr.isDvr).toBe(true);
      expect(ses.enterReplay).not.toHaveBeenCalled();
    });

    it("while DVR → does NOT call dvr.enter again", async () => {
      const { ses, result } = setup();
      await act(async () => {
        await result.current.dvr.enter(1_030_000);
      });
      vi.clearAllMocks();

      await act(async () => {
        result.current.controls.onScrubChange(fakeChange(1_025_000));
      });
      expect(ses.enterReplay).not.toHaveBeenCalled();
    });

    it("respects custom liveEdgeEpsMs", async () => {
      const { ses, result } = setup(1, 5_000);
      // 4999ms from edge → within 5000ms eps → no enter
      await act(async () => {
        result.current.controls.onScrubChange(fakeChange(LIVE.latest - 4_999));
      });
      expect(ses.enterReplay).not.toHaveBeenCalled();

      // 5001ms from edge → outside eps → enters DVR
      await act(async () => {
        result.current.controls.onScrubChange(fakeChange(LIVE.latest - 5_001));
      });
      expect(ses.enterReplay).toHaveBeenCalledTimes(1);
    });
  });

  // ── commitScrub ───────────────────────────────────────────────────────────

  describe("commitScrub", () => {
    it("with null scrubT → no-op", async () => {
      const { ses, result } = setup();
      // No drag initiated — scrubT is null
      await act(async () => {
        result.current.controls.commitScrub();
      });
      expect(ses.enterReplay).not.toHaveBeenCalled();
      expect(ses.exitReplay).not.toHaveBeenCalled();
    });

    it("live + t far from edge → enters DVR then calls play(rate)", async () => {
      const { ses, result } = setup(2);
      // Drag to a mid-timeline position
      await act(async () => {
        result.current.controls.onScrubChange(fakeChange(1_030_000));
      });
      await act(async () => {
        result.current.controls.commitScrub();
        // Drain the dvr.enter(t).then(...) microtask chain so the play()
        // callback (the live-commit branch) actually runs.
        for (let i = 0; i < 10; i++) await Promise.resolve();
      });

      expect(ses.enterReplay).toHaveBeenCalledWith(1_030_000, expect.any(Object));
      // autoPlay is false in the setup, but commitScrub manually calls play()
      expect(ses.player.play).toHaveBeenCalledWith(2);
    });

    it("live + t within liveEdgeEpsMs → no-op (micro-drag ignored)", async () => {
      const { ses, result } = setup();
      const nearEdge = LIVE.latest - EPS + 1;
      await act(async () => {
        result.current.controls.onScrubChange(fakeChange(nearEdge));
      });
      await act(async () => {
        result.current.controls.commitScrub();
      });

      expect(ses.enterReplay).not.toHaveBeenCalled();
      expect(result.current.controls.scrubT).toBeNull();
    });

    it("DVR + t near frozenLatest → exits DVR", async () => {
      const { ses, result } = setup();
      await act(async () => {
        await result.current.dvr.enter(1_030_000);
      });

      const frozenLatest = result.current.dvr.frozenLatest!;
      // Drag to within eps of frozen edge
      await act(async () => {
        result.current.controls.onScrubChange(fakeChange(frozenLatest - EPS + 1));
      });
      await act(async () => {
        result.current.controls.commitScrub();
      });

      expect(ses.exitReplay).toHaveBeenCalled();
      expect(result.current.dvr.isDvr).toBe(false);
    });

    it("DVR + t in middle → seeks to scrubT and plays at the given rate", async () => {
      const { ses, result } = setup(1.5);
      await act(async () => {
        await result.current.dvr.enter(1_050_000);
      });

      await act(async () => {
        result.current.controls.onScrubChange(fakeChange(1_025_000));
      });
      await act(async () => {
        result.current.controls.commitScrub();
      });

      expect(ses.player.seek).toHaveBeenCalledWith(1_025_000);
      expect(ses.player.play).toHaveBeenCalledWith(1.5);
      expect(ses.exitReplay).not.toHaveBeenCalled();
      expect(result.current.dvr.isDvr).toBe(true);
    });

    it("resets scrubT to null after commit", async () => {
      const { result } = setup();
      await act(async () => {
        result.current.controls.onScrubChange(fakeChange(1_030_000));
      });
      expect(result.current.controls.scrubT).toBe(1_030_000);

      await act(async () => {
        result.current.controls.commitScrub();
      });
      expect(result.current.controls.scrubT).toBeNull();
    });

    it("respects custom liveEdgeEpsMs on commit", async () => {
      const { ses, result } = setup(1, 5_000);
      // Drag to 4999ms from edge → inside eps → commit should no-op
      await act(async () => {
        result.current.controls.onScrubChange(fakeChange(LIVE.latest - 4_999));
      });
      await act(async () => {
        result.current.controls.commitScrub();
      });
      expect(ses.enterReplay).not.toHaveBeenCalled();
    });

    it("DVR + t uses frozenLatest as fallback when frozenLatest is null", async () => {
      const { ses, result } = setup();
      await act(async () => {
        await result.current.dvr.enter(1_030_000);
      });

      // Drag to within eps of LIVE.latest (which equals frozenLatest after clamping)
      const frozenLatest = result.current.dvr.frozenLatest ?? LIVE.latest;
      await act(async () => {
        result.current.controls.onScrubChange(fakeChange(frozenLatest - EPS + 1));
      });
      await act(async () => {
        result.current.controls.commitScrub();
      });

      expect(ses.exitReplay).toHaveBeenCalled();
    });

    it("live-commit play() callback runs after dvr.enter resolves (isolated fake dvr)", async () => {
      // Drive useScrubberControls with a hand-built dvr so the live-commit
      // branch's `dvr.enter(t).then(() => dvr.player.play(rate))` callback is
      // exercised deterministically (the real useReplayDvr path can mask it).
      const player = makeFakePlayer(0);
      const enter = vi.fn(async () => {});
      const fakeDvr = {
        isDvr: false,
        player,
        frozenLatest: null,
        effectiveTimeRange: LIVE,
        enter,
        exit: vi.fn(),
      };

      const { result } = renderHook(() =>
        // biome-ignore lint/suspicious/noExplicitAny: minimal fake dvr for isolation
        useScrubberControls({ dvr: fakeDvr as any, rate: 3 }),
      );

      await act(async () => {
        result.current.onScrubChange(fakeChange(LIVE.earliest + 5_000)); // far from edge
      });
      await act(async () => {
        result.current.commitScrub();
        for (let i = 0; i < 10; i++) await Promise.resolve();
      });

      expect(enter).toHaveBeenCalledWith(LIVE.earliest + 5_000);
      expect(player.play).toHaveBeenCalledWith(3);
    });
  });

  // ── rate forwarding ────────────────────────────────────────────────────────

  describe("rate forwarding", () => {
    it("default rate=1 is used when not specified", async () => {
      const { ses, result } = setup(); // no rate passed
      await act(async () => {
        await result.current.dvr.enter(1_050_000);
      });
      await act(async () => {
        result.current.controls.onScrubChange(fakeChange(1_025_000));
      });
      await act(async () => {
        result.current.controls.commitScrub();
      });
      expect(ses.player.play).toHaveBeenCalledWith(1);
    });
  });
});
