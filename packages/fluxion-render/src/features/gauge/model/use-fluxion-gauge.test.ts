import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FluxionHost } from "../../host";
import { useFluxionGauge } from "./use-fluxion-gauge";

function makeMockHost() {
  let cb: ((yMin: number, yMax: number, latestT: number) => void) | null = null;
  const unsubscribe = vi.fn(() => { cb = null; });
  const onBoundsChange = vi.fn((listener: (yMin: number, yMax: number, latestT: number) => void) => {
    cb = listener;
    return unsubscribe;
  });
  const fireBounds = (yMin: number, yMax: number, latestT: number) => cb?.(yMin, yMax, latestT);
  return {
    host: { onBoundsChange } as unknown as FluxionHost,
    fireBounds,
    unsubscribe,
  };
}

describe("useFluxionGauge", () => {
  it("returns initial value and latestT=0 before any bounds event", () => {
    const { result } = renderHook(() =>
      useFluxionGauge({ host: null, initialValue: 42 }),
    );
    expect(result.current.value).toBe(42);
    expect(result.current.latestT).toBe(0);
  });

  it("defaults initialValue to 0 when not provided", () => {
    const { result } = renderHook(() =>
      useFluxionGauge({ host: null }),
    );
    expect(result.current.value).toBe(0);
    expect(result.current.latestT).toBe(0);
  });

  it("does not subscribe when host is null", () => {
    const { host } = makeMockHost();
    renderHook(() => useFluxionGauge({ host: null }));
    expect(host.onBoundsChange).not.toHaveBeenCalled();
  });

  it("subscribes to onBoundsChange when host is provided", () => {
    const { host } = makeMockHost();
    renderHook(() => useFluxionGauge({ host }));
    expect(host.onBoundsChange).toHaveBeenCalledTimes(1);
  });

  it("updates value and latestT when host fires bounds event", () => {
    const { host, fireBounds } = makeMockHost();
    const { result } = renderHook(() => useFluxionGauge({ host }));

    act(() => {
      fireBounds(-5, 99, 1234);
    });

    expect(result.current.value).toBe(99);
    expect(result.current.latestT).toBe(1234);
  });

  it("reflects multiple successive bounds events", () => {
    const { host, fireBounds } = makeMockHost();
    const { result } = renderHook(() => useFluxionGauge({ host }));

    act(() => { fireBounds(0, 10, 100); });
    expect(result.current.value).toBe(10);
    expect(result.current.latestT).toBe(100);

    act(() => { fireBounds(0, 20, 200); });
    expect(result.current.value).toBe(20);
    expect(result.current.latestT).toBe(200);
  });

  it("unsubscribes from onBoundsChange on unmount", () => {
    const { host, unsubscribe } = makeMockHost();
    const { unmount } = renderHook(() => useFluxionGauge({ host }));
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("value stays at initialValue if host never fires", () => {
    const { host } = makeMockHost();
    const { result } = renderHook(() =>
      useFluxionGauge({ host, initialValue: 7 }),
    );
    expect(result.current.value).toBe(7);
    expect(host.onBoundsChange).toHaveBeenCalledTimes(1);
  });

  it("does not throw when host changes from null to a real host", () => {
    const { host, fireBounds } = makeMockHost();
    const { result, rerender } = renderHook(
      (props: { host: FluxionHost | null }) => useFluxionGauge({ host: props.host }),
      { initialProps: { host: null } },
    );

    expect(result.current.value).toBe(0);

    rerender({ host });

    act(() => { fireBounds(-1, 55, 999); });

    expect(result.current.value).toBe(55);
    expect(result.current.latestT).toBe(999);
  });

  it("unsubscribes previous host when host prop changes", () => {
    const first = makeMockHost();
    const second = makeMockHost();

    const { rerender } = renderHook(
      (props: { host: FluxionHost | null }) => useFluxionGauge({ host: props.host }),
      { initialProps: { host: first.host } },
    );

    expect(first.host.onBoundsChange).toHaveBeenCalledTimes(1);

    rerender({ host: second.host });

    expect(first.unsubscribe).toHaveBeenCalledTimes(1);
    expect(second.host.onBoundsChange).toHaveBeenCalledTimes(1);
  });
});
