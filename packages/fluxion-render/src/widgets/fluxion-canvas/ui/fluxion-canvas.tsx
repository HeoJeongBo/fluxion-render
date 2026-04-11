import { type CSSProperties, forwardRef, useImperativeHandle } from "react";
import type { FluxionHost, FluxionHostOptions } from "../../../features/host";
import { type FluxionLayerSpec, useFluxionCanvas } from "../lib/use-fluxion-canvas";

export interface FluxionCanvasProps {
  layers: FluxionLayerSpec[];
  style?: CSSProperties;
  className?: string;
  hostOptions?: FluxionHostOptions;
  onReady?: (host: FluxionHost) => void;
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
  function FluxionCanvas({ layers, style, className, hostOptions, onReady }, ref) {
    const { containerRef, host } = useFluxionCanvas({
      layers,
      hostOptions,
      onReady,
    });

    useImperativeHandle(ref, () => ({ getHost: () => host }), [host]);

    return (
      <div
        ref={containerRef}
        className={className}
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          ...style,
        }}
      />
    );
  },
);
