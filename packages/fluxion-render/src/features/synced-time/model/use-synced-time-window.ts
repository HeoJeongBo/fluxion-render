import { useCallback, useState } from "react";
import type { FluxionHost } from "../../host";

export interface UseSyncedTimeWindowResult {
  /** Current shared time window in ms. */
  windowMs: number;
  /** Update the shared time window. All hosts bound via `useLayerConfig` will reflect this. */
  setWindowMs: (ms: number) => void;
  /**
   * Returns `{ timeWindowMs: windowMs }` — spread this into `axisGridLayer` config
   * to keep multiple charts in sync.
   *
   * ```tsx
   * const { windowMs, syncConfig } = useSyncedTimeWindow(5000);
   * useLayerConfig(hostA, axisGridLayer("axis", syncConfig()));
   * useLayerConfig(hostB, axisGridLayer("axis", syncConfig()));
   * ```
   */
  syncConfig: () => { timeWindowMs: number };
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
 */
export function useSyncedTimeWindow(initialMs = 5000): UseSyncedTimeWindowResult {
  const [windowMs, setWindowMs] = useState(initialMs);

  const syncConfig = useCallback(() => ({ timeWindowMs: windowMs }), [windowMs]);

  const bind = useCallback(
    (host: FluxionHost | null, axisId = "axis") => {
      if (!host) return;
      host.configLayer(axisId, { timeWindowMs: windowMs });
    },
    [windowMs],
  );

  return { windowMs, setWindowMs, syncConfig, bind };
}
