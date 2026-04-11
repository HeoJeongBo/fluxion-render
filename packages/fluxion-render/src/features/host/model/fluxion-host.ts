import type { AxisGridConfig } from "../../../entities/axis-grid-layer";
import type { LidarScatterConfig } from "../../../entities/lidar-scatter-layer";
import type { LineChartConfig } from "../../../entities/line-chart-layer";
import type { LineChartStaticConfig } from "../../../entities/line-chart-static-layer";
import { Op, type DType, type HostMsg, type LayerKind } from "../../../shared/protocol";
import {
  LidarLayerHandle,
  type LidarStride,
  LineLayerHandle,
  LineStaticLayerHandle,
} from "./layer-handles";

/**
 * TypedArray flavors that FluxionRender accepts. `ArrayBufferView` is too
 * permissive (includes DataView), so we narrow to the specific types whose
 * layout matches the worker-side `wrapTypedArray` contract.
 */
export type FluxionTypedArray =
  | Float32Array
  | Uint8Array
  | Int16Array
  | Uint16Array
  | Int32Array;

export interface FluxionHostOptions {
  /**
   * Override the worker URL. Useful when bundlers don't support
   * `new Worker(new URL('./fluxion-worker.js', import.meta.url))`.
   * Pass a factory that returns a constructed Worker.
   */
  workerFactory?: () => Worker;
  /**
   * Canvas background color, applied every frame before layers draw.
   * Defaults to `"#0b0d12"` (dark) when omitted. Use `setBgColor` to change
   * it at runtime (e.g. for a theme toggle).
   */
  bgColor?: string;
}

function defaultWorkerFactory(): Worker {
  // Vite / modern bundlers resolve this to a separate worker chunk.
  return new Worker(new URL("./fluxion-worker.js", import.meta.url), {
    type: "module",
  });
}

function dtypeOf(arr: FluxionTypedArray): DType {
  if (arr instanceof Float32Array) return "f32";
  if (arr instanceof Uint8Array) return "u8";
  if (arr instanceof Int16Array) return "i16";
  if (arr instanceof Uint16Array) return "u16";
  if (arr instanceof Int32Array) return "i32";
  throw new Error("fluxion-render: unsupported TypedArray");
}

/**
 * Main-thread handle to a worker-hosted rendering engine.
 *
 * Lifecycle:
 *   const host = new FluxionHost(canvas);
 *   host.addLayer('chart', 'line', { color: '#0ff' });
 *   host.pushData('chart', float32);   // transfers ownership
 *   host.resize(w, h, dpr);
 *   host.dispose();
 */
export class FluxionHost {
  private worker: Worker;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, opts: FluxionHostOptions = {}) {
    this.worker = (opts.workerFactory ?? defaultWorkerFactory)();

    const offscreen = canvas.transferControlToOffscreen();
    const dpr = typeof devicePixelRatio === "number" ? devicePixelRatio : 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || canvas.width || 300;
    const height = rect.height || canvas.height || 150;

    this.post(
      {
        op: Op.INIT,
        canvas: offscreen,
        width,
        height,
        dpr,
        bgColor: opts.bgColor,
      },
      [offscreen],
    );
  }

  /**
   * Update the canvas background color at runtime. Takes effect on the next
   * rendered frame. Useful for theme toggles without tearing down the host.
   */
  setBgColor(color: string): void {
    this.post({ op: Op.SET_BG_COLOR, color });
  }

  /**
   * Typed `addLayer` overloads.
   *
   * Prefer the kind-specific helpers below (`addLineLayer`, `addAxisLayer`,
   * etc.) — they both type-check the config AND return a typed handle where
   * applicable. This overload is retained for cases where the kind is chosen
   * dynamically.
   */
  addLayer(id: string, kind: "line", config?: LineChartConfig): void;
  addLayer(id: string, kind: "line-static", config?: LineChartStaticConfig): void;
  addLayer(id: string, kind: "lidar", config?: LidarScatterConfig): void;
  addLayer(id: string, kind: "axis-grid", config?: AxisGridConfig): void;
  // Dynamic fallback for code paths that pass a runtime `LayerKind` (e.g.
  // `useFluxionCanvas({ layers: FluxionLayerSpec[] })`).
  addLayer(id: string, kind: LayerKind, config?: unknown): void;
  addLayer(id: string, kind: LayerKind, config?: unknown): void {
    this.post({ op: Op.ADD_LAYER, id, kind, config });
  }

  removeLayer(id: string): void {
    this.post({ op: Op.REMOVE_LAYER, id });
  }

  /**
   * Typed `configLayer` overloads — pick the config shape from the kind used
   * when the layer was created. There's no runtime tag check; the caller is
   * trusted to pass the right config for the right id.
   */
  configLayer(id: string, config: LineChartConfig): void;
  configLayer(id: string, config: LineChartStaticConfig): void;
  configLayer(id: string, config: LidarScatterConfig): void;
  configLayer(id: string, config: AxisGridConfig): void;
  // Dynamic fallback for helpers like `useLayerConfig` that carry an opaque
  // config alongside the layer id.
  configLayer(id: string, config: unknown): void;
  configLayer(id: string, config: unknown): void {
    this.post({ op: Op.CONFIG, id, config });
  }

  // ──────────────────────────────────────────────────────────────────────
  // Typed add-layer helpers: construct + return a typed handle in one call.
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Add a streaming line layer and return a handle that accepts structured
   * `{ t, y }` samples instead of raw Float32Array interleaved layout.
   */
  addLineLayer(id: string, config?: LineChartConfig): LineLayerHandle {
    this.addLayer(id, "line", config);
    return new LineLayerHandle(this, id);
  }

  /**
   * Add a static xy line layer and return a handle that accepts
   * `{ x, y }[]` or plain y-only arrays.
   */
  addLineStaticLayer(id: string, config?: LineChartStaticConfig): LineStaticLayerHandle {
    this.addLayer(id, "line-static", config);
    return new LineStaticLayerHandle(this, id);
  }

  /**
   * Add a LiDAR scatter layer and return a handle that accepts
   * `{ x, y, z?, intensity? }[]`. The handle's stride must match
   * `config.stride` (default 4).
   */
  addLidarLayer(id: string, config?: LidarScatterConfig): LidarLayerHandle {
    this.addLayer(id, "lidar", config);
    const stride = (config?.stride as LidarStride | undefined) ?? 4;
    return new LidarLayerHandle(this, id, stride);
  }

  /**
   * Add an axis/grid layer. Axis layers don't take data, so this returns
   * void — use `configLayer` to retune bounds / time window later.
   */
  addAxisLayer(id: string, config?: AxisGridConfig): void {
    this.addLayer(id, "axis-grid", config);
  }

  // ──────────────────────────────────────────────────────────────────────
  // Attach a typed handle to a layer that was added via another API path
  // (e.g. declaratively through `<FluxionCanvas layers={...}>` or
  // `useFluxionCanvas({ layers: [...] })`).
  // ──────────────────────────────────────────────────────────────────────

  line(id: string): LineLayerHandle {
    return new LineLayerHandle(this, id);
  }

  lineStatic(id: string): LineStaticLayerHandle {
    return new LineStaticLayerHandle(this, id);
  }

  lidar(id: string, stride: LidarStride = 4): LidarLayerHandle {
    return new LidarLayerHandle(this, id, stride);
  }

  /**
   * Push TypedArray data to a layer. Transfers the underlying ArrayBuffer —
   * the caller MUST NOT use `data` again afterwards.
   *
   * The TypedArray must start at byteOffset 0 because the worker reconstructs
   * the view at offset 0. Subviews would silently read from the wrong offset,
   * so they're rejected up-front. Use `data.slice()` to get a fresh buffer.
   */
  pushData(id: string, data: FluxionTypedArray): void {
    if (data.byteOffset !== 0) {
      throw new Error(
        `fluxion-render: TypedArray must start at byteOffset 0 (got ${data.byteOffset}). ` +
          `Call .slice() to copy into a fresh buffer before pushing.`,
      );
    }
    const buffer = data.buffer as ArrayBuffer;
    this.post(
      {
        op: Op.DATA,
        id,
        buffer,
        dtype: dtypeOf(data),
        length: data.length,
      },
      [buffer],
    );
  }

  resize(width: number, height: number, dpr: number): void {
    this.post({ op: Op.RESIZE, width, height, dpr });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.post({ op: Op.DISPOSE });
    } catch {
      // worker may already be gone
    }
    this.worker.terminate();
  }

  private post(msg: HostMsg, transfer?: Transferable[]): void {
    if (this.disposed) return;
    if (transfer && transfer.length) {
      this.worker.postMessage(msg, transfer);
    } else {
      this.worker.postMessage(msg);
    }
  }
}
