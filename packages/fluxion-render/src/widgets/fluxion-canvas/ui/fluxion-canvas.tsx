import { type CSSProperties, forwardRef, useImperativeHandle, useMemo, useRef } from "react";
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
   *
   * Axis canvases are rendered by the Worker in the same rAF cycle as the
   * main canvas — no Main-thread tick lag.
   */
  externalAxes?: boolean;
  /** ID of the axis-grid layer. Required when `externalAxes` is true. */
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
   * external tick computation. Only used when `externalAxes` is false (legacy path).
   */
  axisConfig?: Partial<AxisGridConfig>;
  /**
   * @deprecated No-op. Axis ticks are now computed in the Worker.
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
    },
    ref,
  ) {
    // Container divs for axis canvases — effect creates a fresh <canvas> each
    // mount so transferControlToOffscreen() is called on a new element every
    // time (StrictMode double-invoke safe).
    const xAxisContainerRef = useRef<HTMLDivElement>(null);
    const yAxisContainerRef = useRef<HTMLDivElement>(null);

    const axisStyle = useMemo(
      () => ({ color: axisColor, font: axisFont, tickSize: axisTickSize, tickMargin: axisTickMargin }),
      [axisColor, axisFont, axisTickSize, axisTickMargin],
    );

    const { containerRef, host } = useFluxionCanvas({
      layers,
      hostOptions: externalAxes
        ? { ...hostOptions, xAxisHeight, yAxisWidth, axisStyle }
        : hostOptions,
      onReady,
      xAxisContainerRef: externalAxes ? xAxisContainerRef : undefined,
      yAxisContainerRef: externalAxes ? yAxisContainerRef : undefined,
    });
    // Note: xAxisElement/yAxisElement are injected by useFluxionCanvas via the
    // container refs — do not pass them through hostOptions.

    useImperativeHandle(ref, () => ({ getHost: () => host }), [host]);

    // Legacy React-side axis rendering (externalAxes=false).
    // Always called (Rules of Hooks); produces nothing when tickLayers is empty.
    const tickLayers = useMemo(() => {
      if (externalAxes) return [];
      const base = layers;
      if (!axisConfig || !axisLayerId) return base;
      return base.map((l) =>
        l.id === axisLayerId && l.kind === "axis-grid"
          ? { ...l, config: { ...l.config, ...axisConfig } }
          : l,
      );
    }, [externalAxes, layers, axisLayerId, axisConfig]);

    // When externalAxes=true the Worker draws axes — pass null host so
    // useAxisTicks skips the onTickUpdate subscription entirely.
    const tickSet = useAxisTicks(tickLayers, axisLayerId, 16, externalAxes ? null : host);
    const legacyYCanvasRef = useYAxisCanvas(tickSet?.yTicks ?? [], axisStyle);
    const legacyXCanvasRef = useXAxisCanvas(xAxisHeight > 0 ? (tickSet?.xTicks ?? []) : [], axisStyle);

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

    // externalAxes=true — Worker renders both axis canvases.
    // legacyYCanvasRef / legacyXCanvasRef are unused here but must be
    // referenced in JSX to satisfy the linter in the branch above.
    void legacyYCanvasRef;
    void legacyXCanvasRef;

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
        {/* y-axis container — left column, top row. Effect injects a fresh canvas. */}
        <div
          ref={yAxisContainerRef}
          style={{ position: "relative", width: "100%", height: "100%", minWidth: 0, minHeight: 0 }}
        />
        {/* chart canvas — right column, top row */}
        <div
          ref={containerRef}
          style={{ position: "relative", width: "100%", height: "100%", minWidth: 0, minHeight: 0 }}
        />
        {xAxisHeight > 0 && (
          <>
            {/* corner spacer — left column, bottom row */}
            <div />
            {/* x-axis container — right column, bottom row. Effect injects a fresh canvas. */}
            <div
              ref={xAxisContainerRef}
              style={{ position: "relative", width: "100%", height: "100%", minWidth: 0, minHeight: 0 }}
            />
          </>
        )}
      </div>
    );
  },
);
