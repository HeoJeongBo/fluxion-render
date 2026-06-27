import { describe, expect, it, vi } from "vitest";
import type { FluxionWorkerPool } from "../../worker-pool";
import type { FluxionHost } from "./fluxion-host";
import { createHostRecyclePool, type HostBundle } from "./host-recycle-pool";

type FakeBundle = HostBundle & { host: { dispose: ReturnType<typeof vi.fn> } };

function makeBundle(key: string): FakeBundle {
  return {
    host: { dispose: vi.fn() } as unknown as FluxionHost,
    canvas: {} as HTMLCanvasElement,
    key,
  } as FakeBundle;
}

const fakePool = () => ({}) as unknown as FluxionWorkerPool;

describe("createHostRecyclePool", () => {
  describe("keyFor", () => {
    it("is stable for identical params and differs for axis presence / render options", () => {
      const pool = createHostRecyclePool();
      const base = { hostOptions: {}, hasXAxis: false, hasYAxis: false };
      expect(pool.keyFor(base)).toBe(pool.keyFor({ ...base }));
      expect(pool.keyFor(base)).not.toBe(pool.keyFor({ ...base, hasXAxis: true }));
      expect(pool.keyFor(base)).not.toBe(pool.keyFor({ ...base, hasYAxis: true }));
      expect(pool.keyFor(base)).not.toBe(
        pool.keyFor({ ...base, hostOptions: { transparent: true } }),
      );
      expect(pool.keyFor(base)).not.toBe(
        pool.keyFor({ ...base, hostOptions: { maxFps: 30 } }),
      );
      expect(pool.keyFor(base)).not.toBe(
        pool.keyFor({ ...base, hostOptions: { emitBounds: false } }),
      );
      expect(pool.keyFor(base)).not.toBe(
        pool.keyFor({ ...base, hostOptions: { emitTicks: false } }),
      );
    });

    it("separates distinct worker pools / factories but is stable per object", () => {
      const pool = createHostRecyclePool();
      const poolA = fakePool();
      const poolB = fakePool();
      const kA = pool.keyFor({
        hostOptions: { pool: poolA },
        hasXAxis: false,
        hasYAxis: false,
      });
      const kB = pool.keyFor({
        hostOptions: { pool: poolB },
        hasXAxis: false,
        hasYAxis: false,
      });
      expect(kA).not.toBe(kB);
      expect(
        pool.keyFor({ hostOptions: { pool: poolA }, hasXAxis: false, hasYAxis: false }),
      ).toBe(kA);

      const fac = (() => undefined) as unknown as () => Worker;
      const kFac = pool.keyFor({
        hostOptions: { workerFactory: fac },
        hasXAxis: false,
        hasYAxis: false,
      });
      expect(kFac).not.toBe(kA);
    });

    it("an explicit recycleKey overrides the derived key", () => {
      const pool = createHostRecyclePool();
      expect(
        pool.keyFor({
          hostOptions: { maxFps: 30 },
          hasXAxis: true,
          hasYAxis: false,
          recycleKey: "mini",
        }),
      ).toBe("mini");
    });

    it("derives a key with no hostOptions (default backing)", () => {
      const pool = createHostRecyclePool();
      expect(pool.keyFor({ hasXAxis: false, hasYAxis: false })).toContain("default");
    });
  });

  it("returns null when empty, then reuses released bundles LIFO", () => {
    const pool = createHostRecyclePool();
    const params = { hostOptions: {}, hasXAxis: false, hasYAxis: false };
    const key = pool.keyFor(params);
    expect(pool.acquire(params)).toBeNull();

    const b1 = makeBundle(key);
    const b2 = makeBundle(key);
    pool.release(b1);
    pool.release(b2);
    expect(pool.size).toBe(2);
    // LIFO: last released returns first.
    expect(pool.acquire(params)).toBe(b2);
    expect(pool.acquire(params)).toBe(b1);
    expect(pool.acquire(params)).toBeNull();
    expect(pool.stats.recycled).toBe(2);
    expect(pool.size).toBe(0);
  });

  it("never reuses across keys — an axis mismatch falls back to a cold create", () => {
    const pool = createHostRecyclePool();
    const noAxis = { hostOptions: {}, hasXAxis: false, hasYAxis: false };
    const withAxis = { hostOptions: {}, hasXAxis: true, hasYAxis: true };
    pool.release(makeBundle(pool.keyFor(noAxis)));
    expect(pool.acquire(withAxis)).toBeNull(); // incompatible → cold
    expect(pool.acquire(noAxis)).not.toBeNull(); // compatible → reuse
  });

  it("disposes a released bundle when its bucket is already at max", () => {
    const pool = createHostRecyclePool({ max: 2 });
    const b1 = makeBundle("k");
    const b2 = makeBundle("k");
    const b3 = makeBundle("k");
    pool.release(b1);
    pool.release(b2);
    pool.release(b3); // bucket full → disposed instead of parked
    expect(b3.host.dispose).toHaveBeenCalledTimes(1);
    expect(b1.host.dispose).not.toHaveBeenCalled();
    expect(pool.size).toBe(2);
  });

  it("markCreated increments stats.created", () => {
    const pool = createHostRecyclePool();
    expect(pool.stats.created).toBe(0);
    pool.markCreated();
    pool.markCreated();
    expect(pool.stats.created).toBe(2);
  });

  it("dispose tears down every parked host and refuses further reuse (idempotent)", () => {
    const pool = createHostRecyclePool();
    const key = pool.keyFor({ hostOptions: {}, hasXAxis: false, hasYAxis: false });
    const b1 = makeBundle(key);
    const b2 = makeBundle(key);
    pool.release(b1);
    pool.release(b2);

    pool.dispose();
    expect(b1.host.dispose).toHaveBeenCalledTimes(1);
    expect(b2.host.dispose).toHaveBeenCalledTimes(1);
    expect(pool.isDisposed).toBe(true);
    expect(pool.size).toBe(0);

    // After dispose: acquire is always cold; release disposes immediately.
    expect(
      pool.acquire({ hostOptions: {}, hasXAxis: false, hasYAxis: false }),
    ).toBeNull();
    const b3 = makeBundle(key);
    pool.release(b3);
    expect(b3.host.dispose).toHaveBeenCalledTimes(1);

    pool.dispose(); // idempotent — no throw, no double-dispose
    expect(b1.host.dispose).toHaveBeenCalledTimes(1);
  });
});
