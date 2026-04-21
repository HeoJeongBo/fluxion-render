import { useEffect, useMemo, useRef, useState } from "react";
import type { AxisGridConfig } from "../../../entities/axis-grid-layer";
import type { FluxionHost } from "../../../features/host";
import { type AxisTick, type AxisTickSet, computeAxisTicks } from "../../../shared/lib/axis-ticks";
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

function getAxisSpec(
  layers: FluxionLayerSpec[],
  axisLayerId: string,
): (FluxionLayerSpec & { kind: "axis-grid" }) | undefined {
  return layers.find(
    (l): l is FluxionLayerSpec & { kind: "axis-grid" } =>
      l.id === axisLayerId && l.kind === "axis-grid",
  );
}

function computeFromConfig(
  config: AxisGridConfig,
  now?: number,
  liveYMin?: number,
  liveYMax?: number,
): AxisTickSet {
  const xMode = config.xMode ?? "fixed";
  const timeWindowMs = config.timeWindowMs ?? 5000;
  const timeOrigin = config.timeOrigin ?? null;

  let xMin: number;
  let xMax: number;

  if (xMode === "time") {
    const latestT = now != null ? now - (timeOrigin ?? 0) : 0;
    xMax = latestT;
    xMin = latestT - timeWindowMs;
  } else {
    xMin = config.xRange?.[0] ?? -1;
    xMax = config.xRange?.[1] ?? 1;
  }

  const yMin = liveYMin ?? config.yRange?.[0] ?? -1;
  const yMax = liveYMax ?? config.yRange?.[1] ?? 1;

  return computeAxisTicks({
    xMin,
    xMax,
    yMin,
    yMax,
    targetTicks: config.targetTicks,
    xMode,
    timeOrigin,
    xTickFormat: config.xTickFormat,
    xTickIntervalMs: config.xTickIntervalMs,
  });
}

/**
 * Computes axis ticks for the given axis-grid layer spec.
 *
 * - `xMode: "fixed"` — computed once via useMemo
 * - `xMode: "time"` — x ticks recomputed at `xTickIntervalMs ?? 1000` ms interval
 *   (default 1 s); y ticks recomputed at `refreshMs` interval (default 16ms ≈ 1 frame).
 * - `yMode: "auto"` — subscribes to `host.onBoundsChange` and uses the
 *   worker's live y bounds for tick computation. Falls back to `yRange`
 *   until the first bounds message arrives.
 */
export function useAxisTicks(
  layers: FluxionLayerSpec[],
  axisLayerId: string,
  refreshMs = 16,
  host?: FluxionHost | null,
): AxisTickSet | null {
  const spec = getAxisSpec(layers, axisLayerId);
  const config = spec?.config;

  const isTimeMode = config?.xMode === "time";
  const isAutoY = config?.yMode === "auto";

  const [liveY, setLiveY] = useState<{ min: number; max: number } | null>(null);

  useEffect(() => {
    if (!isAutoY || !host) {
      setLiveY(null);
      return;
    }
    return host.onBoundsChange((yMin, yMax) => {
      setLiveY({ min: yMin, max: yMax });
    });
  }, [host, isAutoY]);

  const liveYMin = isAutoY && liveY ? liveY.min : undefined;
  const liveYMax = isAutoY && liveY ? liveY.max : undefined;

  const configRef = useRef(config);
  configRef.current = config;
  const liveYRef = useRef<{ min?: number; max?: number }>({});
  liveYRef.current = { min: liveYMin, max: liveYMax };

  const fixedTicks = useMemo(() => {
    if (!config || isTimeMode) return null;
    return computeFromConfig(config, undefined, liveYMin, liveYMax);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, isTimeMode, liveYMin, liveYMax]);

  const initialTicks = useMemo(() => {
    if (!config || !isTimeMode) return null;
    return computeFromConfig(config, Date.now(), liveYMin, liveYMax);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [xTimeTicks, setXTimeTicks] = useState<AxisTick[]>(() => initialTicks?.xTicks ?? []);
  const [yTimeTicks, setYTimeTicks] = useState<AxisTick[]>(() => initialTicks?.yTicks ?? []);

  // y ticks — refreshMs interval (must react to live bounds changes quickly)
  useEffect(() => {
    if (!isTimeMode) return;
    const id = setInterval(() => {
      const c = configRef.current;
      if (!c) return;
      const ly = liveYRef.current;
      const next = computeFromConfig(c, Date.now(), ly.min, ly.max);
      setYTimeTicks((prev) => (yTicksEqual(prev, next.yTicks) ? prev : next.yTicks));
    }, refreshMs);
    return () => clearInterval(id);
  }, [isTimeMode, refreshMs]);

  // x ticks — xTickIntervalMs interval (auto-optimised: no user config needed)
  useEffect(() => {
    if (!isTimeMode) return;
    const xRefreshMs = configRef.current?.xTickIntervalMs ?? 1000;
    const id = setInterval(() => {
      const c = configRef.current;
      if (!c) return;
      const ly = liveYRef.current;
      const next = computeFromConfig(c, Date.now(), ly.min, ly.max);
      setXTimeTicks((prev) => (xTicksEqual(prev, next.xTicks) ? prev : next.xTicks));
    }, xRefreshMs);
    return () => clearInterval(id);
  }, [isTimeMode, refreshMs]);

  // Force y re-render immediately when liveY changes (time mode).
  useEffect(() => {
    if (!isTimeMode || !config) return;
    const next = computeFromConfig(config, Date.now(), liveYMin, liveYMax);
    setYTimeTicks((prev) => (yTicksEqual(prev, next.yTicks) ? prev : next.yTicks));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveYMin, liveYMax]);

  const timeTicks = useMemo<AxisTickSet>(
    () => ({ xTicks: xTimeTicks, yTicks: yTimeTicks }),
    [xTimeTicks, yTimeTicks],
  );

  if (!config) return null;
  return isTimeMode ? timeTicks : fixedTicks;
}
