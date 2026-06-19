import { describe, expect, it } from "vitest";
import { RingBuffer } from "../model/ring-buffer";
import { Viewport } from "../model/viewport";
import { pushSamples } from "./push-samples";

describe("pushSamples", () => {
  it("pushes a stride-2 batch and advances latestT to the newest t", () => {
    const ring = new RingBuffer(16, 2);
    const vp = new Viewport();
    vp.latestT = 0;
    // [t,y] records: (10,1), (20,2), (30,3) — newest t at length-2.
    const buf = new Float32Array([10, 1, 20, 2, 30, 3]).buffer;
    pushSamples(ring, buf, 6, vp, 2);
    expect(ring.length).toBe(3);
    expect(vp.latestT).toBe(30);
  });

  it("does not lower latestT when the batch is older", () => {
    const ring = new RingBuffer(16, 2);
    const vp = new Viewport();
    vp.latestT = 100;
    pushSamples(ring, new Float32Array([10, 1]).buffer, 2, vp, 2);
    expect(ring.length).toBe(1);
    expect(vp.latestT).toBe(100); // unchanged — 10 < 100
  });

  it("no-ops when length is shorter than one record", () => {
    const ring = new RingBuffer(16, 2);
    const vp = new Viewport();
    vp.latestT = 5;
    pushSamples(ring, new Float32Array([10]).buffer, 1, vp, 2);
    expect(ring.length).toBe(0);
    expect(vp.latestT).toBe(5);
  });
});
