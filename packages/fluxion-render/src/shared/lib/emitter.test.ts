import { describe, expect, it, vi } from "vitest";
import { Emitter } from "./emitter";

describe("Emitter", () => {
  it("delivers emit args to every subscriber in order", () => {
    const e = new Emitter<[a: number, b: string]>();
    const calls: Array<[number, string]> = [];
    e.subscribe((a, b) => calls.push([a, b]));
    e.subscribe((a, b) => calls.push([a * 2, `${b}!`]));
    e.emit(3, "x");
    expect(calls).toEqual([
      [3, "x"],
      [6, "x!"],
    ]);
  });

  it("stops calling a listener after it unsubscribes", () => {
    const e = new Emitter<[n: number]>();
    const fn = vi.fn();
    const off = e.subscribe(fn);
    e.emit(1);
    off();
    e.emit(2);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(1);
  });

  it("unsubscribe is idempotent (double-call is a no-op)", () => {
    const e = new Emitter<[]>();
    const fn = vi.fn();
    const off = e.subscribe(fn);
    off();
    expect(() => off()).not.toThrow();
    e.emit();
    expect(fn).not.toHaveBeenCalled();
  });

  it("size reflects the current listener count", () => {
    const e = new Emitter<[]>();
    expect(e.size).toBe(0);
    const off = e.subscribe(() => {});
    e.subscribe(() => {});
    expect(e.size).toBe(2);
    off();
    expect(e.size).toBe(1);
    e.clear();
    expect(e.size).toBe(0);
  });

  it("clear() drops all listeners", () => {
    const e = new Emitter<[n: number]>();
    const a = vi.fn();
    const b = vi.fn();
    e.subscribe(a);
    e.subscribe(b);
    e.clear();
    e.emit(1);
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  it("isolates a throwing listener: others still run and emit does not throw", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const e = new Emitter<[n: number]>();
    const after = vi.fn();
    e.subscribe(() => {
      throw new Error("listener boom");
    });
    e.subscribe(after);
    expect(() => e.emit(7)).not.toThrow(); // does not propagate to the caller
    expect(after).toHaveBeenCalledWith(7); // sibling still ran
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
