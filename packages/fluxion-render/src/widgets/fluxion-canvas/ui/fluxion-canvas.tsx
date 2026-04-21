import { type CSSProperties, forwardRef, useImperativeHandle, useMemo } from "react";
import type { AxisGridConfig } from "../../../entities/axis-grid-layer";
import type { FluxionHost, FluxionHostOptions } from "../../../features/host";
import { useXAxisCanvas, useYAxisCanvas } from "../lib/use-axis-canvas";
import { useAxisTicks } from "../lib/use-axis-ticks";
import { type FluxionLayerSpec, useFluxionCanvas } from "../lib/use-fluxion-canvas";

export interface FluxionCanvasProps {
  layers: FluxionLayerSpec[];
  style?: CSSProperties;
  className?: string;
  hostOptions?: FluxionHostOptions;
  onReady?: (host: FluxionHost) => void;
  /**
   * When true, renders y-axis labels in a separate canvas to the LEFT
   * and x-axis labels in a separate canvas BELOW the chart — matching
   * Recharts' external-axis layout. Pair with `showXLabels: false,
   * showYLabels: false` on the axis-grid layer to avoid double-drawing.
   */
  externalAxes?: boolean;
  /** ID of the axis-grid layer used for tick computation. Required when `externalAxes` is true. */
  axisLayerId?: string;
  /** Width of the y-axis canvas in px. Default: 60 (Recharts YAxis default). */
  yAxisWidth?: number;
  /** Height of the x-axis canvas in px. Default: 30 (Recharts XAxis default). */
  xAxisHeight?: number;
  /** Tick label + tick mark color. Default: "#666" (Recharts CartesianAxis stroke). */
  axisColor?: string;
  /** Tick label font. Default: "11px sans-serif". */
  axisFont?: string;
  /** Length of tick marks in px. Default: 6 (Recharts tickSize). */
  axisTickSize?: number;
  /** Gap between tick mark and label in px. Default: 4. */
  axisTickMargin?: number;
  /**
   * Live config overrides merged on top of the axis-grid layer spec for
   * external tick computation. Use this to keep the external axis in sync
   * with dynamic values (e.g. `timeWindowMs`) that you also send to the
   * worker via `useLayerConfig` — since `layers` is captured on mount only.
   */
  axisConfig?: Partial<AxisGridConfig>;
  /**
   * `setInterval` period (ms) for external axis tick recomputation. Default 16 (≈ 60 fps).
   * For dense dashboards (20+ charts) set to 250–500 to reduce main-thread load —
   * axis labels will update less frequently but rendering stays at full fps in the worker.
   */
  axisRefreshMs?: number;
}

export interface FluxionCanvasHandle {
  getHost(): FluxionHost | null;
}

/**
 * Thin wrapper around {@link useFluxionCanvas}. Use this when you just want
 * a filled-container canvas; reach for the hook directly when you need to
 * control the wrapping DOM yourself.
 */
export const FluxionCanvas = forwardRef<FluxionCanvasHandle, FluxionCanvasProps>(
  function FluxionCanvas(
    {
      layers,
      style,
      className,
      hostOptions,
      onReady,
      externalAxes,
      axisLayerId = "",
      yAxisWidth = 60,
      xAxisHeight = 30,
      axisColor,
      axisFont,
      axisTickSize,
      axisTickMargin,
      axisConfig,
      axisRefreshMs,
    },
    ref,
  ) {
    const { containerRef, host } = useFluxionCanvas({ layers, hostOptions, onReady });
    useImperativeHandle(ref, () => ({ getHost: () => host }), [host]);

    const tickLayers = useMemo(() => {
      const base = externalAxes ? layers : [];
      if (!axisConfig || !axisLayerId) return base;
      return base.map((l) =>
        l.id === axisLayerId && l.kind === "axis-grid"
          ? { ...l, config: { ...l.config, ...axisConfig } }
          : l,
      );
    }, [externalAxes, layers, axisLayerId, axisConfig]);

    const tickSet = useAxisTicks(tickLayers, axisLayerId, axisRefreshMs ?? 16, host);
    const axisOpts = useMemo(
      () => ({ color: axisColor, font: axisFont, tickSize: axisTickSize, tickMargin: axisTickMargin }),
      [axisColor, axisFont, axisTickSize, axisTickMargin],
    );
    const yCanvasRef = useYAxisCanvas(tickSet?.yTicks ?? [], axisOpts);
    const xCanvasRef = useXAxisCanvas(xAxisHeight > 0 ? (tickSet?.xTicks ?? []) : [], axisOpts);

    if (!externalAxes) {
      return (
        <div
          ref={containerRef}
          className={className}
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            minWidth: 0,
            minHeight: 0,
            ...style,
          }}
        />
      );
    }

    return (
      <div
        className={className}
        style={{
          display: "grid",
          gridTemplateColumns: `${yAxisWidth}px 1fr`,
          gridTemplateRows: xAxisHeight > 0 ? `1fr ${xAxisHeight}px` : "1fr",
          width: "100%",
          height: "100%",
          minWidth: 0,
          minHeight: 0,
          ...style,
        }}
      >
        {/* y-axis canvas — left column, top row */}
        <canvas
          ref={yCanvasRef}
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            minWidth: 0,
            minHeight: 0,
          }}
        />
        {/* chart canvas — right column, top row */}
        <div
          ref={containerRef}
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            minWidth: 0,
            minHeight: 0,
          }}
        />
        {xAxisHeight > 0 && (
          <>
            {/* corner — left column, bottom row */}
            <div />
            {/* x-axis canvas — right column, bottom row */}
            <canvas
              ref={xCanvasRef}
              style={{
                display: "block",
                width: "100%",
                height: "100%",
                minWidth: 0,
                minHeight: 0,
              }}
            />
          </>
        )}
      </div>
    );
  },
);
