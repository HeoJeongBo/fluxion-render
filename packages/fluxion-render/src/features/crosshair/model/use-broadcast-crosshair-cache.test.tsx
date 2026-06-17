import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { lineLayer } from "../../../widgets/fluxion-canvas/lib/layer-specs";
import type { HoverDataCache } from "./hover-data-cache";
import {
  type UseBroadcastCrosshairCacheResult,
  useBroadcastCrosshairCache,
} from "./use-broadcast-crosshair-cache";

function Harness({
  onResult,
}: {
  onResult: (r: UseBroadcastCrosshairCacheResult) => void;
}) {
  const result = useBroadcastCrosshairCache({
    layers: [lineLayer("a", { color: "#f00" }), lineLayer("b", { color: "#0f0" })],
  });
  onResult(result);
  return null;
}

describe("useBroadcastCrosshairCache", () => {
  it("mirror() populates the auto-registered layers", () => {
    let last: UseBroadcastCrosshairCacheResult | null = null;
    render(<Harness onResult={(r) => (last = r)} />);
    const result = last as unknown as UseBroadcastCrosshairCacheResult;

    result.mirror(["a", "b"], new Float32Array([0, 1, 100, 2]));
    expect(result.cache.getPoints("a")).toEqual([
      { t: 0, y: 1 },
      { t: 100, y: 2 },
    ]);
    expect(result.cache.getPoints("b")).toEqual(result.cache.getPoints("a"));
  });

  it("returns a stable cache + mirror identity across renders", () => {
    const seen: UseBroadcastCrosshairCacheResult[] = [];
    const { rerender } = render(<Harness onResult={(r) => seen.push(r)} />);
    rerender(<Harness onResult={(r) => seen.push(r)} />);
    const caches = new Set<HoverDataCache>(seen.map((s) => s.cache));
    expect(caches.size).toBe(1);
    expect(seen[0]!.mirror).toBe(seen.at(-1)!.mirror);
  });
});
