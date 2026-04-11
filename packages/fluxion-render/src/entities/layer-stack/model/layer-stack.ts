import type { Layer } from "../../../shared/model/layer";
import type { Viewport } from "../../../shared/model/viewport";

export class LayerStack {
  private layers: Layer[] = [];
  private byId = new Map<string, Layer>();

  add(layer: Layer): void {
    this.layers.push(layer);
    this.byId.set(layer.id, layer);
  }

  remove(id: string): void {
    const layer = this.byId.get(id);
    if (!layer) return;
    this.byId.delete(id);
    const i = this.layers.indexOf(layer);
    if (i >= 0) this.layers.splice(i, 1);
    layer.dispose();
  }

  get(id: string): Layer | undefined {
    return this.byId.get(id);
  }

  resizeAll(viewport: Viewport): void {
    for (let i = 0; i < this.layers.length; i++) {
      this.layers[i].resize(viewport);
    }
  }

  drawAll(ctx: OffscreenCanvasRenderingContext2D, viewport: Viewport): void {
    for (let i = 0; i < this.layers.length; i++) {
      this.layers[i].draw(ctx, viewport);
    }
  }

  disposeAll(): void {
    for (let i = 0; i < this.layers.length; i++) {
      this.layers[i].dispose();
    }
    this.layers.length = 0;
    this.byId.clear();
  }
}
