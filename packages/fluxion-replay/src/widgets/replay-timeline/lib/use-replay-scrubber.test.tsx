import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { type UseReplayScrubberOptions, useReplayScrubber } from "./use-replay-scrubber";

function setup(initial: UseReplayScrubberOptions) {
  return renderHook((p: UseReplayScrubberOptions) => useReplayScrubber(p), {
    initialProps: initial,
  });
}

describe("useReplayScrubber", () => {
  it("null effectiveTimeRange → min=max=0, value=0, disabled=true", () => {
    const { result } = setup({
      effectiveTimeRange: null,
      liveTimeRange: null,
      isDvr: false,
      replayPlayerT: 0,
      scrubT: null,
    });
    expect(result.current).toEqual({ min: 0, max: 0, value: 0, disabled: true });
  });

  it("mount-time seeded range { now, now }: bar widens to default 60s, value at snapped now", () => {
    const now = 1_700_000_000_000; // multiple of 1000 → snap is identity
    const { result } = setup({
      effectiveTimeRange: { earliest: now, latest: now },
      liveTimeRange: { earliest: now, latest: now },
      isDvr: false,
      replayPlayerT: 0,
      scrubT: null,
    });
    expect(result.current.max - result.current.min).toBe(60_000);
    expect(result.current.value).toBe(now);
    expect(result.current.disabled).toBe(false);
  });

  it("30s of recording — bar still 60s wide (min-span dominates)", () => {
    const now = 1_700_000_000_000;
    const { result } = setup({
      effectiveTimeRange: { earliest: now, latest: now + 30_000 },
      liveTimeRange: { earliest: now, latest: now + 30_000 },
      isDvr: false,
      replayPlayerT: 0,
      scrubT: null,
    });
    expect(result.current.max - result.current.min).toBe(60_000);
  });

  it("90s of recording — bar grows to actual range (min-span no longer constrains)", () => {
    const now = 1_700_000_000_000;
    const { result } = setup({
      effectiveTimeRange: { earliest: now, latest: now + 90_000 },
      liveTimeRange: { earliest: now, latest: now + 90_000 },
      isDvr: false,
      replayPlayerT: 0,
      scrubT: null,
    });
    expect(result.current.max - result.current.min).toBe(90_000);
  });

  it("custom minSpanMs option overrides the 60s default", () => {
    const now = 1_700_000_000_000;
    const { result } = setup({
      effectiveTimeRange: { earliest: now, latest: now },
      liveTimeRange: { earliest: now, latest: now },
      isDvr: false,
      replayPlayerT: 0,
      scrubT: null,
      minSpanMs: 30_000,
    });
    expect(result.current.max - result.current.min).toBe(30_000);
  });

  it("snaps min/max/value to the snapMs grid (default 1s)", () => {
    const base = 1_700_000_000_000;
    const { result } = setup({
      effectiveTimeRange: { earliest: base + 123, latest: base + 90_456 },
      liveTimeRange: { earliest: base + 123, latest: base + 90_456 },
      isDvr: false,
      replayPlayerT: 0,
      scrubT: null,
    });
    expect(result.current.min % 1_000).toBe(0);
    expect(result.current.max % 1_000).toBe(0);
    expect(result.current.value % 1_000).toBe(0);
    expect(result.current.max).toBe(base + 90_000); // round-down from 90_456
  });

  it("custom snapMs (5000) snaps every output to 5s boundaries", () => {
    const base = 1_700_000_000_000;
    const { result } = setup({
      effectiveTimeRange: { earliest: base, latest: base + 17_999 },
      liveTimeRange: { earliest: base, latest: base + 17_999 },
      isDvr: false,
      replayPlayerT: 0,
      scrubT: null,
      snapMs: 5_000,
    });
    expect(result.current.min % 5_000).toBe(0);
    expect(result.current.max % 5_000).toBe(0);
    expect(result.current.max).toBe(base + 15_000); // snap down by 5s
  });

  it("live mode: value tracks liveTimeRange.latest (snapped)", () => {
    const now = 1_700_000_000_000;
    const { result } = setup({
      effectiveTimeRange: { earliest: now, latest: now + 5_000 },
      liveTimeRange: { earliest: now, latest: now + 5_321 },
      isDvr: false,
      replayPlayerT: 0,
      scrubT: null,
    });
    expect(result.current.value).toBe(now + 5_000); // snap(5321)→5000
  });

  it("DVR mode: value tracks replayPlayerT (snapped)", () => {
    const now = 1_700_000_000_000;
    const { result } = setup({
      effectiveTimeRange: { earliest: now, latest: now + 90_000 },
      liveTimeRange: { earliest: now, latest: now + 90_000 },
      isDvr: true,
      replayPlayerT: now + 42_777,
      scrubT: null,
    });
    expect(result.current.value).toBe(now + 42_000);
  });

  it("drag-preview scrubT overrides both live and DVR values", () => {
    const now = 1_700_000_000_000;
    const { result } = setup({
      effectiveTimeRange: { earliest: now, latest: now + 90_000 },
      liveTimeRange: { earliest: now, latest: now + 90_000 },
      isDvr: true,
      replayPlayerT: now + 80_000, // ignored while dragging
      scrubT: now + 12_500,
    });
    expect(result.current.value).toBe(now + 12_000);
  });

  it("live-mode polling jitter ≤ 1s does NOT change snapped outputs", () => {
    const now = 1_700_000_000_000;
    const { result, rerender } = setup({
      effectiveTimeRange: { earliest: now, latest: now + 5_100 },
      liveTimeRange: { earliest: now, latest: now + 5_100 },
      isDvr: false,
      replayPlayerT: 0,
      scrubT: null,
    });
    const before = { ...result.current };
    // Polling bumps latest by 400ms — sub-second jitter under the snap floor.
    rerender({
      effectiveTimeRange: { earliest: now, latest: now + 5_500 },
      liveTimeRange: { earliest: now, latest: now + 5_500 },
      isDvr: false,
      replayPlayerT: 0,
      scrubT: null,
    });
    // Snapped numeric outputs are unchanged across sub-second jitter.
    expect(result.current.value).toBe(before.value);
    expect(result.current.max).toBe(before.max);
    expect(result.current.min).toBe(before.min);
    expect(result.current.disabled).toBe(before.disabled);
  });

  it("identical input references produce a stable result reference (useMemo)", () => {
    const now = 1_700_000_000_000;
    const effective = { earliest: now, latest: now + 5_500 };
    const live = effective;
    const initial = {
      effectiveTimeRange: effective,
      liveTimeRange: live,
      isDvr: false,
      replayPlayerT: 0,
      scrubT: null,
    };
    const { result, rerender } = setup(initial);
    const before = result.current;
    rerender(initial);
    expect(result.current).toBe(before);
  });

  it("crossing a snap boundary DOES update the snapped outputs", () => {
    const now = 1_700_000_000_000;
    const { result, rerender } = setup({
      effectiveTimeRange: { earliest: now, latest: now + 5_500 },
      liveTimeRange: { earliest: now, latest: now + 5_500 },
      isDvr: false,
      replayPlayerT: 0,
      scrubT: null,
    });
    expect(result.current.value).toBe(now + 5_000);
    // Cross the 6s boundary.
    rerender({
      effectiveTimeRange: { earliest: now, latest: now + 6_010 },
      liveTimeRange: { earliest: now, latest: now + 6_010 },
      isDvr: false,
      replayPlayerT: 0,
      scrubT: null,
    });
    expect(result.current.value).toBe(now + 6_000);
  });

  // ── Phase 17 — recordingStartMs freezes the bar's left edge ────────────
  describe("recordingStartMs anchor", () => {
    it("pins min to recordingStartMs across DVR enter/exit and polling drift", () => {
      const recStart = 1_700_000_000_000;
      // Live mode (no DVR yet), liveTimeRange has earliest equal to recStart.
      const { result, rerender } = setup({
        effectiveTimeRange: { earliest: recStart, latest: recStart + 90_000 },
        liveTimeRange: { earliest: recStart, latest: recStart + 90_000 },
        isDvr: false,
        replayPlayerT: 0,
        scrubT: null,
        recordingStartMs: recStart,
      });
      expect(result.current.min).toBe(recStart);

      // Retention has evicted older frames — liveTimeRange.earliest moved up.
      rerender({
        effectiveTimeRange: { earliest: recStart + 60_000, latest: recStart + 120_000 },
        liveTimeRange: { earliest: recStart + 60_000, latest: recStart + 120_000 },
        isDvr: false,
        replayPlayerT: 0,
        scrubT: null,
        recordingStartMs: recStart,
      });
      // Left edge stays anchored at recStart, NOT at the new earliest.
      expect(result.current.min).toBe(recStart);

      // DVR enter — effectiveTimeRange.latest freezes, earliest may follow
      // liveTimeRange but recordingStartMs still wins.
      rerender({
        effectiveTimeRange: { earliest: recStart + 60_000, latest: recStart + 120_000 },
        liveTimeRange: { earliest: recStart + 60_000, latest: recStart + 130_000 },
        isDvr: true,
        replayPlayerT: recStart + 90_000,
        scrubT: null,
        recordingStartMs: recStart,
      });
      expect(result.current.min).toBe(recStart);
    });

    it("recordingStartMs takes precedence even when minSpanMs would otherwise widen further", () => {
      const recStart = 1_700_000_000_000;
      const { result } = setup({
        effectiveTimeRange: { earliest: recStart + 30_000, latest: recStart + 40_000 },
        liveTimeRange: { earliest: recStart + 30_000, latest: recStart + 40_000 },
        isDvr: false,
        replayPlayerT: 0,
        scrubT: null,
        recordingStartMs: recStart, // 40s before the max
        minSpanMs: 10_000, // only 10s — but recordingStartMs is 40s back
      });
      // Math.min(recStart, max - 10s) = Math.min(recStart, recStart + 30s) = recStart.
      expect(result.current.min).toBe(recStart);
    });

    it("without recordingStartMs (back-compat) falls back to effectiveTimeRange.earliest", () => {
      const now = 1_700_000_000_000;
      const { result } = setup({
        effectiveTimeRange: { earliest: now, latest: now + 90_000 },
        liveTimeRange: { earliest: now, latest: now + 90_000 },
        isDvr: false,
        replayPlayerT: 0,
        scrubT: null,
        // recordingStartMs omitted
      });
      expect(result.current.min).toBe(now);
    });

    // Phase 18-A: regression for the "first 60s slide" bug. Even when
    // `rawMax - minSpanMs` is SMALLER than recordingStartMs (which is the
    // normal state for the first minute of a fresh recording), the bar's
    // left edge must NOT be yanked to that smaller value. recordingStartMs
    // is an absolute anchor — no Math.min widening.
    it("Phase 18-A: min stays at recordingStartMs through the first minSpanMs of recording", () => {
      const recStart = 1_700_000_000_000;

      // t=0: rawMax === recStart (seeded). Pre-fix this would yield
      // min === recStart - 60_000.
      const { result, rerender } = setup({
        effectiveTimeRange: { earliest: recStart, latest: recStart },
        liveTimeRange: { earliest: recStart, latest: recStart },
        isDvr: false,
        replayPlayerT: 0,
        scrubT: null,
        recordingStartMs: recStart,
      });
      expect(result.current.min).toBe(recStart);

      // t=30s: rawMax === recStart + 30s. Pre-fix → min === recStart - 30_000.
      rerender({
        effectiveTimeRange: { earliest: recStart, latest: recStart + 30_000 },
        liveTimeRange: { earliest: recStart, latest: recStart + 30_000 },
        isDvr: false,
        replayPlayerT: 0,
        scrubT: null,
        recordingStartMs: recStart,
      });
      expect(result.current.min).toBe(recStart);

      // t=60s: rawMax === recStart + 60s. Pre-fix → min === recStart (only
      // here it stabilises). With the fix, it's recStart from the start.
      rerender({
        effectiveTimeRange: { earliest: recStart, latest: recStart + 60_000 },
        liveTimeRange: { earliest: recStart, latest: recStart + 60_000 },
        isDvr: false,
        replayPlayerT: 0,
        scrubT: null,
        recordingStartMs: recStart,
      });
      expect(result.current.min).toBe(recStart);

      // Sanity: max keeps growing.
      expect(result.current.max).toBe(recStart + 60_000);
    });
  });

  it("value falls back to rawMax when liveTimeRange is null, scrubT is null, isDvr is false", () => {
    const now = 1_700_000_000_000;
    const { result } = setup({
      effectiveTimeRange: { earliest: now, latest: now + 90_000 },
      liveTimeRange: null,
      isDvr: false,
      replayPlayerT: 0,
      scrubT: null,
    });
    // resolved = scrubT ?? (isDvr? replayPlayerT : liveTimeRange?.latest ?? rawMax)
    // = null ?? (false ? 0 : null ?? rawMax)
    // = rawMax = now + 90_000
    expect(result.current.value).toBe(now + 90_000);
  });
});
