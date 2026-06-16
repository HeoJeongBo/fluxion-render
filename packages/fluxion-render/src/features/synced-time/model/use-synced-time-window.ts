import { useCallback, useMemo, useState } from "react";
import type { FluxionHost } from "../../host";

export interface UseSyncedTimeWindowResult {
  /** Current shared time window in ms. */
  windowMs: number;
  /** Update the shared time window. All hosts bound via `useLayerConfig` will reflect this. */
  setWindowMs: (ms: number) => void;
  /**
   * `Date.now()` captured at hook initialisation — stable for the component's lifetime.
   * Pass as `timeOrigin` to `axisGridLayer` so the chart's time window starts at mount.
   */
  timeOrigin: number;
  /**
   * Returns `{ timeWindowMs: windowMs, timeOrigin }` — spread this into `axisGridLayer`
   * config to keep multiple charts in sync with a shared time origin. When the hook
   * is created with `{ followClock: true }`, `followClock: true` is included too, so
   * the synced window scrolls with the wall clock even when no data arrives.
   *
   * ```tsx
   * const { windowMs, syncConfig } = useSyncedTimeWindow(5000, { followClock: true });
   * useLayerConfig(hostA, axisGridLayer("axis", { ...syncConfig(), xMode: "time" }));
   * useLayerConfig(hostB, axisGridLayer("axis", { ...syncConfig(), xMode: "time" }));
   * ```
   */
  syncConfig: () => {
    timeWindowMs: number;
    timeOrigin: number;
    followClock?: boolean;
  };
  /**
   * Imperatively bind a host by calling `host.configLayer(axisId, { timeWindowMs })`.
   * Use when the host is not managed via `useLayerConfig`.
   */
  bind: (host: FluxionHost | null, axisId?: string) => void;
}

/**
 * Shared time-window state for synchronising multiple `FluxionCanvas` panels.
 *
 * Pair with `useLayerConfig` for declarative binding, or call `bind(host)` imperatively.
 * `timeOrigin` is captured once at mount — pass it to `axisGridLayer` so the window
 * is anchored from the start rather than drifting as data accumulates.
 *
 * Pass `{ followClock: true }` to have `syncConfig()` also emit `followClock: true`,
 * so the shared window scrolls with the wall clock during data gaps. The caller
 * still sets `xMode: "time"` (without it, `followClock` is inert and the axis layer
 * warns once).
 */
export function useSyncedTimeWindow(
  initialMs = 5000,
  opts?: { followClock?: boolean },
): UseSyncedTimeWindowResult {
  const [windowMs, setWindowMs] = useState(initialMs);
  const timeOrigin = useMemo(() => Date.now(), []);
  const followClock = opts?.followClock ?? false;

  const syncConfig = useCallback(
    () => ({
      timeWindowMs: windowMs,
      timeOrigin,
      ...(followClock ? { followClock: true } : {}),
    }),
    [windowMs, timeOrigin, followClock],
  );

  const bind = useCallback(
    (host: FluxionHost | null, axisId = "axis") => {
      if (!host) return;
      host.configLayer(axisId, { timeWindowMs: windowMs });
    },
    [windowMs],
  );

  return { windowMs, setWindowMs, timeOrigin, syncConfig, bind };
}
