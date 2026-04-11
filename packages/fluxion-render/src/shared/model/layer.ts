import type { Viewport } from "./viewport";

/**
 * Contract every renderable layer must implement. Lives in `shared` because it
 * is a cross-cutting interface used by entities (layer implementations) and
 * features (engine, layer-stack).
 *
 * `setData` receives the live `Viewport` so streaming layers can update
 * shared state (e.g. `viewport.latestT`) at the exact moment new data lands,
 * before the next draw frame fires.
 */
export interface Layer {
  readonly id: string;
  setConfig(config: unknown): void;
  setData(buffer: ArrayBuffer, length: number, viewport: Viewport): void;
  resize(viewport: Viewport): void;
  draw(ctx: OffscreenCanvasRenderingContext2D, viewport: Viewport): void;
  dispose(): void;
}
