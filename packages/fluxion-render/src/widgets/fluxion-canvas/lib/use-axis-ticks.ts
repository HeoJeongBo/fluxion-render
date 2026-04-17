import { useEffect, useMemo, useRef, useState } from "react";
import type { AxisGridConfig } from "../../../entities/axis-grid-layer";
import { type AxisTickSet, computeAxisTicks } from "../../../shared/lib/axis-ticks";
import type { FluxionLayerSpec } from "./use-fluxion-canvas";

function getAxisSpec(
  layers: FluxionLayerSpec[],
  axisLayerId: string,
): (FluxionLayerSpec & { kind: "axis-grid" }) | undefined {
  return layers.find(
    (l): l is FluxionLayerSpec & { kind: "axis-grid" } =>
      l.id === axisLayerId && l.kind === "axis-grid",
  );
}

function computeFromConfig(config: AxisGridConfig, now?: number): AxisTickSet {
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
  });
}

/**
 * Computes axis ticks for the given axis-grid layer spec.
 *
 * - `xMode: "fixed"` — computed once via useMemo
 * - `xMode: "time"` — recomputed at `refreshMs` interval (default 100ms) using Date.now()
 * - `yMode: "auto"` — y bounds fall back to configured yRange (v1 limitation)
 */
export function useAxisTicks(
  layers: FluxionLayerSpec[],
  axisLayerId: string,
  refreshMs = 100,
): AxisTickSet | null {
  const spec = getAxisSpec(layers, axisLayerId);
  const config = spec?.config;

  const isTimeMode = config?.xMode === "time";

  const fixedTicks = useMemo(() => {
    if (!config || isTimeMode) return null;
    return computeFromConfig(config);
  }, [config, isTimeMode]);

  const [timeTicks, setTimeTicks] = useState<AxisTickSet | null>(() => {
    if (!config || !isTimeMode) return null;
    return computeFromConfig(config, Date.now());
  });

  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    if (!isTimeMode) return;
    const id = setInterval(() => {
      const c = configRef.current;
      if (!c) return;
      setTimeTicks(computeFromConfig(c, Date.now()));
    }, refreshMs);
    return () => clearInterval(id);
  }, [isTimeMode, refreshMs]);

  if (!config) return null;
  return isTimeMode ? timeTicks : fixedTicks;
}
