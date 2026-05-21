import { describe, expect, it } from "vitest";
import { ThumbnailStore } from "./thumbnail-store";

describe("ThumbnailStore", () => {
  it("starts empty", () => {
    const store = new ThumbnailStore();
    expect(store.size).toBe(0);
    expect(store.getNear(0)).toBeNull();
  });

  it("set and get a thumbnail", () => {
    const store = new ThumbnailStore();
    store.set(1000, "data:image/png;base64,abc");
    expect(store.get(1000)).toBe("data:image/png;base64,abc");
  });

  it("getNear returns exact match", () => {
    const store = new ThumbnailStore();
    store.set(500, "url-500");
    expect(store.getNear(500)).toEqual({ t: 500, dataUrl: "url-500" });
  });

  it("getNear returns nearest thumbnail at or before t", () => {
    const store = new ThumbnailStore();
    store.set(100, "url-100");
    store.set(300, "url-300");
    store.set(500, "url-500");
    expect(store.getNear(400)).toEqual({ t: 300, dataUrl: "url-300" });
    expect(store.getNear(299)).toEqual({ t: 100, dataUrl: "url-100" });
  });

  it("getNear returns null when t is before all entries", () => {
    const store = new ThumbnailStore();
    store.set(500, "url-500");
    expect(store.getNear(100)).toBeNull();
  });

  it("getNear returns last entry when t is after all", () => {
    const store = new ThumbnailStore();
    store.set(100, "url-100");
    store.set(200, "url-200");
    expect(store.getNear(999)).toEqual({ t: 200, dataUrl: "url-200" });
  });

  it("set overwrites existing entry without duplicating keys", () => {
    const store = new ThumbnailStore();
    store.set(100, "url-v1");
    store.set(100, "url-v2");
    expect(store.size).toBe(1);
    expect(store.get(100)).toBe("url-v2");
  });

  it("set inserts in correct sorted order", () => {
    const store = new ThumbnailStore();
    store.set(500, "url-500");
    store.set(100, "url-100");
    store.set(300, "url-300");
    store.set(700, "url-700");
    store.set(200, "url-200");
    // All entries should be findable in sorted order
    expect(store.getNear(600)).toEqual({ t: 500, dataUrl: "url-500" });
    expect(store.getNear(250)).toEqual({ t: 200, dataUrl: "url-200" });
    expect(store.getNear(800)).toEqual({ t: 700, dataUrl: "url-700" });
  });

  it("clear resets the store", () => {
    const store = new ThumbnailStore();
    store.set(100, "url-100");
    store.set(200, "url-200");
    store.clear();
    expect(store.size).toBe(0);
    expect(store.getNear(150)).toBeNull();
  });
});
