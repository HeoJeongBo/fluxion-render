import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetEpochGuard, warnIfAbsoluteEpoch } from "./epoch-guard";

describe("warnIfAbsoluteEpoch", () => {
  beforeEach(() => {
    _resetEpochGuard();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not warn for host-relative timestamps", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnIfAbsoluteEpoch(0);
    warnIfAbsoluteEpoch(5_000);
    warnIfAbsoluteEpoch(999_999_999); // ~11.5 days relative, still fine
    expect(spy).not.toHaveBeenCalled();
  });

  it("warns once for an absolute epoch value, then stays quiet", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnIfAbsoluteEpoch(1.7e12); // Date.now()-ish
    warnIfAbsoluteEpoch(1.8e12);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0][0])).toContain("absolute epoch");
  });
});
