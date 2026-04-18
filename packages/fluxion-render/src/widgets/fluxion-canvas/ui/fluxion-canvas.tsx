import { type CSSProperties, forwardRef, useImperativeHandle } from "react";
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
    },
    ref,
  ) {
    const { containerRef, host } = useFluxionCanvas({ layers, hostOptions, onReady });
    useImperativeHandle(ref, () => ({ getHost: () => host }), [host]);

    const tickSet = useAxisTicks(externalAxes ? layers : [], axisLayerId, 100, host);
    const axisOpts = {
      color: axisColor,
      font: axisFont,
      tickSize: axisTickSize,
      tickMargin: axisTickMargin,
    };
    const yCanvasRef = useYAxisCanvas(tickSet?.yTicks ?? [], axisOpts);
    const xCanvasRef = useXAxisCanvas(tickSet?.xTicks ?? [], axisOpts);

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
          gridTemplateRows: `1fr ${xAxisHeight}px`,
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
      </div>
    );
  },
);
