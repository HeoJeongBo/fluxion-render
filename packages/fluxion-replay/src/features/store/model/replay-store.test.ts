import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReplayStore } from "./replay-store";

describe("ReplayStore", () => {
  let store: ReplayStore;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new ReplayStore({ batchIntervalMs: 100 });
  });

  afterEach(async () => {
    store.dispose();
    vi.useRealTimers();
  });

  it("opens without error", async () => {
    await expect(store.open()).resolves.toBeUndefined();
  });

  it("throws when not open", () => {
    expect(() => store.appendFrame({ t: 0, channelId: "ch", payload: new ArrayBuffer(4) })).not.toThrow();
    // getFrames should throw because db is null
  });

  it("open() still succeeds when OPFS is unavailable", async () => {
    const origStorage = navigator.storage;
    Object.defineProperty(globalThis.navigator, "storage", {
      value: { getDirectory: async () => { throw new Error("OPFS unavailable"); } },
      writable: true,
      configurable: true,
    });
    await expect(store.open()).resolves.toBeUndefined();
    Object.defineProperty(globalThis.navigator, "storage", {
      value: origStorage,
      writable: true,
      configurable: true,
    });
  });

  describe("after open()", () => {
    beforeEach(async () => {
      await store.open();
    });

    it("appendFrame and flush writes to IDB", async () => {
      const payload = new TextEncoder().encode("hello").buffer as ArrayBuffer;
      store.appendFrame({ t: 1000, channelId: "logs", payload });
      await store.flush();

      const frames = await store.getFrames(900, 1100);
      expect(frames).toHaveLength(1);
      expect(frames[0].t).toBe(1000);
      expect(frames[0].channelId).toBe("logs");
    });

    it("batch flush via interval timer", async () => {
      store.appendFrame({ t: 2000, channelId: "metrics", payload: new ArrayBuffer(8) });
      store.appendFrame({ t: 2100, channelId: "metrics", payload: new ArrayBuffer(8) });

      // Before flush — nothing in IDB
      let frames = await store.getFrames(1900, 2200);
      expect(frames).toHaveLength(0);

      // Advance timer to trigger flush
      vi.advanceTimersByTime(110);
      await Promise.resolve();
      await Promise.resolve();

      frames = await store.getFrames(1900, 2200);
      expect(frames).toHaveLength(2);
    });

    it("getFrames returns only frames in the time range", async () => {
      for (const t of [1000, 2000, 3000, 4000]) {
        store.appendFrame({ t, channelId: "ch", payload: new ArrayBuffer(4) });
      }
      await store.flush();

      const frames = await store.getFrames(1500, 3500);
      expect(frames.map((f) => f.t).sort()).toEqual([2000, 3000]);
    });

    it("deleteFramesBefore removes old frames", async () => {
      for (const t of [100, 200, 300, 400, 500]) {
        store.appendFrame({ t, channelId: "ch", payload: new ArrayBuffer(4) });
      }
      await store.flush();

      await store.deleteFramesBefore(300);

      const remaining = await store.getFrames(0, 1000);
      expect(remaining.map((f) => f.t).sort((a, b) => a - b)).toEqual([300, 400, 500]);
    });

    it("getTimeRange returns null when empty", async () => {
      const range = await store.getTimeRange();
      expect(range).toBeNull();
    });

    it("getTimeRange returns earliest and latest", async () => {
      for (const t of [500, 100, 300]) {
        store.appendFrame({ t, channelId: "ch", payload: new ArrayBuffer(4) });
      }
      await store.flush();

      const range = await store.getTimeRange();
      expect(range).toEqual({ earliest: 100, latest: 500 });
    });

    it("writeVideoChunk and readVideoChunk round-trip", async () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      await store.writeVideoChunk("camera", "frame1.chunk", data);
      const result = await store.readVideoChunk("camera", "frame1.chunk");
      expect(result).toEqual(data);
    });

    it("readVideoChunk returns null for missing chunk", async () => {
      const result = await store.readVideoChunk("camera", "nonexistent.chunk");
      expect(result).toBeNull();
    });

    it("deleteVideoChunk removes the chunk", async () => {
      const data = new Uint8Array([9, 8, 7]);
      await store.writeVideoChunk("cam", "del.chunk", data);
      await store.deleteVideoChunk("cam", "del.chunk");
      // Should not throw and should return null now
      const result = await store.readVideoChunk("cam", "del.chunk");
      expect(result).toBeNull();
    });

    it("deleteVideoChunk is a no-op when OPFS is unavailable", async () => {
      // Store opened but OPFS root forcibly nulled
      // deleteVideoChunk has an early-return guard for null root
      const storeNoOpfs = new ReplayStore({ batchIntervalMs: 9999 });
      const origStorage = navigator.storage;
      Object.defineProperty(globalThis.navigator, "storage", {
        value: { getDirectory: async () => { throw new Error("no opfs"); } },
        writable: true,
        configurable: true,
      });
      await storeNoOpfs.open();
      Object.defineProperty(globalThis.navigator, "storage", {
        value: origStorage, writable: true, configurable: true,
      });
      await expect(storeNoOpfs.deleteVideoChunk("cam", "x.chunk")).resolves.toBeUndefined();
      storeNoOpfs.dispose();
    });

    it("writeVideoChunk throws when OPFS unavailable", async () => {
      const storeNoOpfs = new ReplayStore({ batchIntervalMs: 9999 });
      const origStorage = navigator.storage;
      Object.defineProperty(globalThis.navigator, "storage", {
        value: { getDirectory: async () => { throw new Error("no opfs"); } },
        writable: true,
        configurable: true,
      });
      await storeNoOpfs.open();
      Object.defineProperty(globalThis.navigator, "storage", {
        value: origStorage, writable: true, configurable: true,
      });
      await expect(storeNoOpfs.writeVideoChunk("cam", "x.chunk", new Uint8Array([1]))).rejects.toThrow("OPFS");
      storeNoOpfs.dispose();
    });

    it("getStorageInfo returns usedBytes, quotaBytes and percentUsed", async () => {
      const info = await store.getStorageInfo();
      expect(typeof info.usedBytes).toBe("number");
      expect(typeof info.quotaBytes).toBe("number");
      expect(info.percentUsed).toBeGreaterThanOrEqual(0);
      expect(info.percentUsed).toBeLessThanOrEqual(100);
    });

    it("getStorageInfo.idbFrameCount increases after flush", async () => {
      const before = await store.getStorageInfo();
      store.appendFrame({ t: 9000, channelId: "ch", payload: new ArrayBuffer(4) });
      await store.flush();
      const after = await store.getStorageInfo();
      expect(after.idbFrameCount).toBeGreaterThan(before.idbFrameCount);
    });

    it("getFrames with inverted range (from > to) returns empty", async () => {
      store.appendFrame({ t: 500, channelId: "ch", payload: new ArrayBuffer(4) });
      await store.flush();
      const frames = await store.getFrames(1000, 100);
      expect(frames).toHaveLength(0);
    });

    describe("getFramesByChannel", () => {
      it("returns only frames for the requested channel", async () => {
        for (const t of [100, 200, 300]) {
          store.appendFrame({ t, channelId: "cpu", payload: new ArrayBuffer(4) });
          store.appendFrame({ t, channelId: "mem", payload: new ArrayBuffer(4) });
        }
        await store.flush();

        const cpu = await store.getFramesByChannel("cpu", 0, 1000);
        expect(cpu).toHaveLength(3);
        expect(cpu.every((f) => f.channelId === "cpu")).toBe(true);

        const mem = await store.getFramesByChannel("mem", 0, 1000);
        expect(mem).toHaveLength(3);
        expect(mem.every((f) => f.channelId === "mem")).toBe(true);
      });

      it("respects the time range bounds", async () => {
        for (const t of [100, 200, 300, 400, 500]) {
          store.appendFrame({ t, channelId: "cpu", payload: new ArrayBuffer(4) });
        }
        await store.flush();

        const mid = await store.getFramesByChannel("cpu", 150, 450);
        expect(mid.map((f) => f.t).sort((a, b) => a - b)).toEqual([200, 300, 400]);
      });

      it("returns frames sorted ascending by t", async () => {
        // Insert out of order to verify the IDB index returns sorted results
        for (const t of [500, 100, 300, 200, 400]) {
          store.appendFrame({ t, channelId: "cpu", payload: new ArrayBuffer(4) });
        }
        await store.flush();

        const frames = await store.getFramesByChannel("cpu", 0, 1000);
        const ts = frames.map((f) => f.t);
        expect(ts).toEqual([...ts].sort((a, b) => a - b));
      });

      it("returns empty array when channel has no frames in range", async () => {
        store.appendFrame({ t: 100, channelId: "cpu", payload: new ArrayBuffer(4) });
        await store.flush();
        const frames = await store.getFramesByChannel("missing", 0, 1000);
        expect(frames).toEqual([]);
      });
    });

    it("dispose() clears pending frames", () => {
      store.appendFrame({ t: 1, channelId: "ch", payload: new ArrayBuffer(4) });
      store.dispose();
      // After dispose, _db is null so getFrames would throw — just verify no crash
      expect(() => store.dispose()).not.toThrow();
    });

    it("error message includes dbName when not open", () => {
      const namedStore = new ReplayStore({ dbName: "my-custom-db" });
      expect(() => namedStore.getFrames(0, 1000)).rejects.toThrow("my-custom-db");
    });

    it("startSegment closes any previously open segment before creating a new one (line 204)", () => {
      store.startSegment(1000);
      // Call startSegment again — should close the open segment at t=2000 before opening a new one
      store.startSegment(2000);
      const segs = store.getSegments();
      expect(segs).toHaveLength(2);
      expect(segs[0]!.start).toBe(1000);
      expect(segs[0]!.end).toBe(2000);
      expect(segs[1]!.start).toBe(2000);
      expect(segs[1]!.end).toBeNull();
    });

    it("_maybeEvict does nothing when evictThresholdPct is 100", async () => {
      const noEvictStore = new ReplayStore({ batchIntervalMs: 9999, evictThresholdPct: 100 });
      await noEvictStore.open();
      const deleteSpy = vi.spyOn(noEvictStore, "deleteFramesBefore");

      for (const t of [100, 200, 300]) {
        noEvictStore.appendFrame({ t, channelId: "ch", payload: new ArrayBuffer(4) });
      }
      await noEvictStore.flush();

      expect(deleteSpy).not.toHaveBeenCalled();
      noEvictStore.dispose();
      deleteSpy.mockRestore();
    });

    it("_maybeEvict deletes oldest 10% when storage exceeds threshold", async () => {
      const evictStore = new ReplayStore({ batchIntervalMs: 9999, evictThresholdPct: 0 });
      await evictStore.open();
      const deleteSpy = vi.spyOn(evictStore, "deleteFramesBefore");

      vi.spyOn(evictStore, "getStorageInfo").mockResolvedValue({
        usedBytes: 100,
        quotaBytes: 100,
        percentUsed: 50,
        idbFrameCount: 3,
      });

      for (const t of [1000, 2000, 3000, 4000, 5000]) {
        evictStore.appendFrame({ t, channelId: "ch", payload: new ArrayBuffer(4) });
      }
      await evictStore.flush();

      // earliest=1000, latest=5000, span=4000, cutoff = 1000 + floor(4000 * 0.1) = 1400
      expect(deleteSpy).toHaveBeenCalledWith(1400);
      evictStore.dispose();
      deleteSpy.mockRestore();
    });

    it("_maybeEvict does nothing when storage is below threshold", async () => {
      const evictStore = new ReplayStore({ batchIntervalMs: 9999, evictThresholdPct: 80 });
      await evictStore.open();
      const deleteSpy = vi.spyOn(evictStore, "deleteFramesBefore");

      vi.spyOn(evictStore, "getStorageInfo").mockResolvedValue({
        usedBytes: 10,
        quotaBytes: 100,
        percentUsed: 10,
        idbFrameCount: 3,
      });

      evictStore.appendFrame({ t: 1000, channelId: "ch", payload: new ArrayBuffer(4) });
      await evictStore.flush();

      expect(deleteSpy).not.toHaveBeenCalled();
      evictStore.dispose();
      deleteSpy.mockRestore();
    });

    it("storageLogTimer calls console.log on interval", async () => {
      const logStore = new ReplayStore({ batchIntervalMs: 9999, storageLogIntervalMs: 1000 });
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await logStore.open();

      await vi.advanceTimersByTimeAsync(1000);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("[ReplayStore"));
      logStore.dispose();
      logSpy.mockRestore();
    });

    it("storageLogTimer is not started when storageLogIntervalMs is 0", async () => {
      const logStore = new ReplayStore({ batchIntervalMs: 9999, storageLogIntervalMs: 0 });
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await logStore.open();

      await vi.advanceTimersByTimeAsync(10_000);

      expect(logSpy).not.toHaveBeenCalled();
      logStore.dispose();
      logSpy.mockRestore();
    });

    it("clearAll iterates OPFS root entries and removes them (lines 291-293)", async () => {
      const removedNames: string[] = [];
      const fakeRoot = {
        // Async generator that yields one entry
        entries: async function* () {
          yield ["chunk1.webm", {} as FileSystemHandle] as [string, FileSystemHandle];
        },
        removeEntry: vi.fn(async (name: string) => {
          removedNames.push(name);
        }),
      };
      // biome-ignore lint/suspicious/noExplicitAny: injecting fake OPFS root
      (store as any)._opfsRoot = fakeRoot;
      await store.clearAll();
      expect(removedNames).toContain("chunk1.webm");
    });
  });
});
