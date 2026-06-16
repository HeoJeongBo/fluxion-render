import { useEffect, useMemo, useRef, useState } from "react";
import type { AxisGridConfig } from "../../../entities/axis-grid-layer";
import type { FluxionHost } from "../../../features/host";
import {
  type AxisTick,
  type AxisTickSet,
  computeAxisTicks,
} from "../../../shared/lib/axis-ticks";
import { getAxisSpec } from "../../../shared/lib/get-axis-spec";
import type { SerializedTick } from "../../../shared/protocol";
import type { FluxionLayerSpec } from "./use-fluxion-canvas";

function xTicksEqual(a: AxisTick[], b: AxisTick[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.label !== b[i]!.label || a[i]!.fraction !== b[i]!.fraction) return false;
  }
  return true;
}

function yTicksEqual(a: AxisTick[], b: AxisTick[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.label !== b[i]!.label || a[i]!.fraction !== b[i]!.fraction) return false;
  }
  return true;
}

function computeFromConfig(config: AxisGridConfig, now = Date.now()): AxisTickSet {
  const xMode = config.xMode ?? "fixed";
  const timeWindowMs = config.timeWindowMs ?? 5000;
  const timeOrigin = config.timeOrigin ?? null;

  let xMin: number;
  let xMax: number;

  if (xMode === "time") {
    const latestT = now - (timeOrigin ?? 0);
    xMax = latestT;
    xMin = latestT - timeWindowMs;
  } else {
    xMin = config.xRange?.[0] ?? -1;
    xMax = config.xRange?.[1] ?? 1;
  }

  const yMin = config.yRange?.[0] ?? -1;
  const yMax = config.yRange?.[1] ?? 1;

  return computeAxisTicks({
    xMin,
    xMax,
    yMin,
    yMax,
    targetTicks: config.targetTicks,
    xMode,
    timeOrigin,
    xTickFormat: config.xTickFormat,
    yTickFormat: config.yTickFormat,
    xTickIntervalMs: config.xTickIntervalMs,
  });
}

/**
 * Computes axis ticks for the given axis-grid layer spec.
 *
 * - `xMode: "fixed"` — computed once via useMemo.
 * - `xMode: "time"` — subscribes to `host.onTickUpdate` so tick computation
 *   runs in the worker (no main-thread setInterval). Falls back to an
 *   initial `computeAxisTicks` snapshot until the first worker message arrives.
 *   When `xTickFormat` is a function the worker sends raw x values and the
 *   main thread applies the function before updating state.
 *
 * @param _refreshMs
 *   @deprecated Ignored — tick refresh is worker-driven (time mode) or
 *   memoized (fixed mode). Kept only so existing 4-arg call sites with a
 *   positional `host` don't break. Pass `undefined`.
 */
export function useAxisTicks(
  layers: FluxionLayerSpec[],
  axisLayerId: string,
  /** @deprecated Ignored. Kept for positional API compatibility. */
  _refreshMs = 16,
  host?: FluxionHost | null,
): AxisTickSet | null {
  const spec = getAxisSpec(layers, axisLayerId);
  const config = spec?.config;
  const isTimeMode = config?.xMode === "time";

  // Keep the xTickFormat function in a ref so the subscription closure always
  // sees the latest value without needing to re-subscribe.
  const xTickFormatFnRef = useRef<((v: number) => string) | null>(null);
  xTickFormatFnRef.current =
    typeof config?.xTickFormat === "function" ? config.xTickFormat : null;
  const yTickFormatFnRef = useRef<((v: number) => string) | null>(null);
  yTickFormatFnRef.current =
    typeof config?.yTickFormat === "function" ? config.yTickFormat : null;

  // Worker-driven ticks (time mode only).
  const [workerTicks, setWorkerTicks] = useState<AxisTickSet | null>(null);

  useEffect(() => {
    if (!host || !isTimeMode) {
      setWorkerTicks(null);
      return;
    }
    let active = true;
    const unsub = host.onTickUpdate((rawX: SerializedTick[], rawY: SerializedTick[]) => {
      if (!active) return;
      const fn = xTickFormatFnRef.current;
      const xTicks: AxisTick[] = fn
        ? rawX.map((t) => ({ value: t.value, label: fn(t.value), fraction: t.fraction }))
        : (rawX as AxisTick[]);
      const yFn = yTickFormatFnRef.current;
      const yTicks: AxisTick[] = yFn
        ? rawY.map((t) => ({ value: t.value, label: yFn(t.value), fraction: t.fraction }))
        : (rawY as AxisTick[]);
      setWorkerTicks((prev) => {
        if (prev && xTicksEqual(prev.xTicks, xTicks) && yTicksEqual(prev.yTicks, yTicks))
          return prev;
        return { xTicks, yTicks };
      });
    });
    return () => {
      active = false;
      unsub();
    };
  }, [host, isTimeMode]);

  // Fixed mode: memoised, recomputed only when config or range changes.
  const fixedTicks = useMemo(() => {
    if (!config || isTimeMode) return null;
    return computeFromConfig(config);
  }, [config, isTimeMode]);

  // Time mode fallback: a snapshot computed once on mount, shown until the
  // first TICK_UPDATE arrives from the worker.
  const initialTicks = useMemo(() => {
    if (!config || !isTimeMode) return null;
    return computeFromConfig(config, Date.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!config) return null;
  if (!isTimeMode) return fixedTicks;
  return workerTicks ?? initialTicks;
}
