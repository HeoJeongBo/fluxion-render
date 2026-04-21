import { useEffect, useMemo, useRef, useState } from "react";
import type { AxisGridConfig } from "../../../entities/axis-grid-layer";
import type { FluxionHost } from "../../../features/host";
import { type AxisTickSet, computeAxisTicks } from "../../../shared/lib/axis-ticks";
import type { FluxionLayerSpec } from "./use-fluxion-canvas";

function tickSetsEqual(a: AxisTickSet, b: AxisTickSet): boolean {
  if (a.xTicks.length !== b.xTicks.length || a.yTicks.length !== b.yTicks.length) return false;
  for (let i = 0; i < a.xTicks.length; i++) {
    if (a.xTicks[i].label !== b.xTicks[i].label || a.xTicks[i].fraction !== b.xTicks[i].fraction) return false;
  }
  for (let i = 0; i < a.yTicks.length; i++) {
    if (a.yTicks[i].label !== b.yTicks[i].label || a.yTicks[i].fraction !== b.yTicks[i].fraction) return false;
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

  // When yMode:"auto" and the worker has sent live bounds, use those.
  // Otherwise fall back to the configured yRange.
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
  });
}

/**
 * Computes axis ticks for the given axis-grid layer spec.
 *
 * - `xMode: "fixed"` — computed once via useMemo
 * - `xMode: "time"` — recomputed at `refreshMs` interval (default 100ms)
 * - `yMode: "auto"` — subscribes to `host.onBoundsChange` and uses the
 *   worker's live y bounds for tick computation. Falls back to `yRange`
 *   until the first bounds message arrives.
 */
export function useAxisTicks(
  layers: FluxionLayerSpec[],
  axisLayerId: string,
  refreshMs = 100,
  host?: FluxionHost | null,
): AxisTickSet | null {
  const spec = getAxisSpec(layers, axisLayerId);
  const config = spec?.config;

  const isTimeMode = config?.xMode === "time";
  const isAutoY = config?.yMode === "auto";

  // Live y bounds from the worker (yMode:"auto" only).
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

  const [timeTicks, setTimeTicks] = useState<AxisTickSet | null>(() => {
    if (!config || !isTimeMode) return null;
    return computeFromConfig(config, Date.now(), liveYMin, liveYMax);
  });

  useEffect(() => {
    if (!isTimeMode) return;
    const id = setInterval(() => {
      const c = configRef.current;
      if (!c) return;
      const ly = liveYRef.current;
      const next = computeFromConfig(c, Date.now(), ly.min, ly.max);
      setTimeTicks((prev) => {
        if (prev && tickSetsEqual(prev, next)) return prev;
        return next;
      });
    }, refreshMs);
    return () => clearInterval(id);
  }, [isTimeMode, refreshMs]);

  // Force a timeTicks re-render when liveY changes (for time mode).
  useEffect(() => {
    if (!isTimeMode || !config) return;
    setTimeTicks(computeFromConfig(config, Date.now(), liveYMin, liveYMax));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveYMin, liveYMax]);

  if (!config) return null;
  return isTimeMode ? timeTicks : fixedTicks;
}
