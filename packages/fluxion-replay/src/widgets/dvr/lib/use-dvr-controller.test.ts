/**
 * useDvrController — unit tests
 *
 * Verifies the combined controller composes useReplayDvr + usePlaybackRate +
 * useReplayPlayer + useScrubberControls + useReplayScrubber into one flat
 * object with a ready-to-spread scrubber bundle. Uses makeFakeSession so it
 * stays fast and deterministic (same approach as useScrubberControls tests).
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeSession } from "../../chart-replay/lib/chart-replay-fixtures";
import { useDvrController } from "./use-dvr-controller";

const LIVE = { earliest: 1_000_000, latest: 1_060_000 };

function fakeChange(value: number): React.ChangeEvent<HTMLInputElement> {
  return { target: { value: String(value) } } as React.ChangeEvent<HTMLInputElement>;
}

function setup(overrides?: { initialRate?: number; autoPlay?: boolean }) {
  const ses = makeFakeSession({ timeRange: LIVE });
  const { result } = renderHook(() =>
    useDvrController({
      session: ses.session,
      enterReplay: ses.enterReplay,
      exitReplay: ses.exitReplay,
      liveTimeRange: LIVE,
      autoPlay: overrides?.autoPlay ?? false,
      initialRate: overrides?.initialRate,
      recordingStartMs: LIVE.earliest,
    }),
  );
  return { ses, result };
}

describe("useDvrController", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("starts in live mode with a disabled-or-collapsed scrubber bundle", () => {
    const { result } = setup();
    expect(result.current.isLive).toBe(true);
    expect(result.current.isDvr).toBe(false);
    expect(result.current.isPlaying).toBe(false);
    // scrubber bundle is present and shaped for <DvrScrubber {...scrubber} />
    const s = result.current.scrubber;
    expect(typeof s.min).toBe("number");
    expect(typeof s.max).toBe("number");
    expect(typeof s.value).toBe("number");
    expect(typeof s.disabled).toBe("boolean");
    expect(typeof s.onChange).toBe("function");
    expect(typeof s.onCommit).toBe("function");
    expect(s.isLive).toBe(true);
  });

  it("exposes the raw dvr controller and effectiveTimeRange", () => {
    const { result } = setup();
    expect(result.current.dvr).toBeDefined();
    expect(typeof result.current.dvr.exit).toBe("function");
    // live mode echoes liveTimeRange
    expect(result.current.effectiveTimeRange).toEqual(LIVE);
  });

  it("passes through the initial rate and updates via setRate", () => {
    const { result } = setup({ initialRate: 2 });
    expect(result.current.rate).toBe(2);
    act(() => {
      result.current.setRate(4);
    });
    expect(result.current.rate).toBe(4);
  });

  it("enters DVR when the user scrubs back from the live edge", async () => {
    const { result } = setup();
    await act(async () => {
      // Drag back from the live edge → enters DVR mid-drag (paused preview).
      result.current.scrubber.onChange(fakeChange(LIVE.earliest + 10_000));
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    // Already in DVR after the drag — before release.
    expect(result.current.isDvr).toBe(true);

    await act(async () => {
      // Release → resumes playback from the drop point.
      result.current.scrubber.onCommit();
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    expect(result.current.isDvr).toBe(true);
    expect(result.current.isLive).toBe(false);
    expect(result.current.scrubber.isLive).toBe(false);
  });
});
