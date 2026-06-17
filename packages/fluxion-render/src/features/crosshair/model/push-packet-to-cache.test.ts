import { describe, expect, it } from "vitest";
import { HoverDataCache } from "./hover-data-cache";
import { pushPacketToCache } from "./push-packet-to-cache";

describe("pushPacketToCache", () => {
  it("mirrors an interleaved packet into every registered layer", () => {
    const cache = new HoverDataCache();
    cache.registerLayer("a", { capacity: 8 });
    cache.registerLayer("b", { capacity: 8 });

    // Interleaved [t, y, t, y].
    const packet = new Float32Array([0, 1, 100, 2, 200, 3]);
    pushPacketToCache(cache, ["a", "b"], packet);

    expect(cache.getPoints("a")).toEqual([
      { t: 0, y: 1 },
      { t: 100, y: 2 },
      { t: 200, y: 3 },
    ]);
    expect(cache.getPoints("b")).toEqual(cache.getPoints("a"));
    // findNearest works off the mirrored data.
    expect(cache.findNearest("a", 110, 0)).toEqual({ t: 100, y: 2 });
  });

  it("silently skips unregistered ids", () => {
    const cache = new HoverDataCache();
    cache.registerLayer("known", { capacity: 4 });
    expect(() =>
      pushPacketToCache(cache, ["known", "ghost"], new Float32Array([0, 5])),
    ).not.toThrow();
    expect(cache.getPoints("known")).toEqual([{ t: 0, y: 5 }]);
    expect(cache.getPoints("ghost")).toEqual([]);
  });
});
