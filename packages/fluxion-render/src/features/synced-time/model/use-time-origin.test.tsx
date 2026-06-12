import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useTimeOrigin } from "./use-time-origin";

function Harness({ onResult }: { onResult: (v: number) => void }) {
  const origin = useTimeOrigin();
  onResult(origin);
  return null;
}

describe("useTimeOrigin", () => {
  it("returns a positive number close to Date.now()", () => {
    const before = Date.now();
    let result = 0;
    render(
      <Harness
        onResult={(v) => {
          result = v;
        }}
      />,
    );
    const after = Date.now();
    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after);
  });

  it("returns the same value on re-render", () => {
    const results: number[] = [];
    const { rerender } = render(
      <Harness
        onResult={(v) => {
          results.push(v);
        }}
      />,
    );
    rerender(
      <Harness
        onResult={(v) => {
          results.push(v);
        }}
      />,
    );
    expect(results).toHaveLength(2);
    expect(results[0]).toBe(results[1]);
  });

  it("two separate mounts return independent snapshots", () => {
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValueOnce(1000).mockReturnValueOnce(2000);

    let r1 = 0;
    let r2 = 0;
    render(
      <Harness
        onResult={(v) => {
          r1 = v;
        }}
      />,
    );
    render(
      <Harness
        onResult={(v) => {
          r2 = v;
        }}
      />,
    );

    expect(r1).toBe(1000);
    expect(r2).toBe(2000);
    nowSpy.mockRestore();
  });
});
