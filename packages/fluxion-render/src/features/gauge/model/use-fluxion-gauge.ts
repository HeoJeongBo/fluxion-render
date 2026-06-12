import { useEffect, useRef, useState } from "react";
import type { FluxionHost } from "../../host";

export interface UseFluxionGaugeOptions {
  host: FluxionHost | null;
  /**
   * Layer id whose latest y-value is tracked as the gauge value.
   * The hook reads `latestT` from `onBoundsChange` — the layer must push data
   * so the y bounds update (i.e. yMode:"auto" or the value changes).
   * For stable streaming layers, combine with a separate `onBoundsChange` listener.
   */
  layerId?: string;
  /** Initial value before any data arrives. Default 0. */
  initialValue?: number;
}

export interface UseFluxionGaugeResult {
  /** Latest y value reported by the host's bounds update. */
  value: number;
  /** Latest t reported by the host (host-relative ms). */
  latestT: number;
}

/**
 * Returns the latest y value from a fluxion host suitable for driving a gauge.
 *
 * Internally it subscribes to `host.onBoundsChange` and surfaces `yMax` as the
 * live value (correct for single-series charts where yMax ≈ current value).
 * For multi-series charts, use `cache.getLatestT()` + `cache.findNearest()`
 * instead and drive the gauge value manually.
 */
export function useFluxionGauge(opts: UseFluxionGaugeOptions): UseFluxionGaugeResult {
  const { host, initialValue = 0 } = opts;
  const [result, setResult] = useState<UseFluxionGaugeResult>({
    value: initialValue,
    latestT: 0,
  });

  // Keep a ref so the effect closure captures the latest opts without re-subscribing.
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    if (!host) return;
    return host.onBoundsChange((_yMin, yMax, latestT) => {
      setResult({ value: yMax, latestT });
    });
  }, [host]);

  return result;
}
