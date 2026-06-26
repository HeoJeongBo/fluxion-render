import { afterEach, describe, expect, it, vi } from "vitest";
import { _resetArityGuard, warnArityMismatch } from "./arity-guard";

describe("warnArityMismatch", () => {
  afterEach(() => {
    _resetArityGuard();
    vi.restoreAllMocks();
  });

  it("does not warn when actual matches expected", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnArityMismatch("a", 3, 3, "values");
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns once per id on mismatch, naming the id / expected / actual / what", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnArityMismatch("layer-x", 3, 2, "values per sample");
    warnArityMismatch("layer-x", 3, 5, "values per sample"); // same id → silent
    expect(warn).toHaveBeenCalledTimes(1);
    const msg = warn.mock.calls[0]![0] as string;
    expect(msg).toContain("layer-x");
    expect(msg).toContain("2");
    expect(msg).toContain("3");
    expect(msg).toContain("values per sample");
  });

  it("warns independently for different ids", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnArityMismatch("a", 3, 2, "v");
    warnArityMismatch("b", 3, 2, "v");
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("_resetArityGuard re-arms the warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnArityMismatch("a", 3, 2, "v");
    _resetArityGuard();
    warnArityMismatch("a", 3, 2, "v");
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
