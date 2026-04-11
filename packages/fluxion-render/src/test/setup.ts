/**
 * Global test environment stubs. Happy-DOM ships DOM + window but not the
 * browser graphics APIs that FluxionRender depends on (OffscreenCanvas,
 * transferControlToOffscreen, ResizeObserver). We patch enough of each to
 * exercise the host/worker/react surface without a real browser.
 */

export interface CtxCall {
  name: string;
  args: unknown[];
}

export interface FakeCtx {
  calls: CtxCall[];
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  font: string;
  textBaseline: string;
  setTransform(...args: unknown[]): void;
  fillRect(...args: unknown[]): void;
  rect(...args: unknown[]): void;
  beginPath(): void;
  moveTo(...args: unknown[]): void;
  lineTo(...args: unknown[]): void;
  stroke(): void;
  fill(): void;
  fillText(...args: unknown[]): void;
}

export function createFakeCtx(): FakeCtx {
  const calls: CtxCall[] = [];
  const rec =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push({ name, args });
    };
  return {
    calls,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    font: "",
    textBaseline: "",
    setTransform: rec("setTransform"),
    fillRect: rec("fillRect"),
    rect: rec("rect"),
    beginPath: rec("beginPath") as () => void,
    moveTo: rec("moveTo"),
    lineTo: rec("lineTo"),
    stroke: rec("stroke") as () => void,
    fill: rec("fill") as () => void,
    fillText: rec("fillText"),
  };
}

class FakeOffscreenCanvas {
  width: number;
  height: number;
  private ctx: FakeCtx | null = null;
  constructor(width = 0, height = 0) {
    this.width = width;
    this.height = height;
  }
  getContext(_type: string): FakeCtx {
    if (!this.ctx) this.ctx = createFakeCtx();
    return this.ctx;
  }
}

// biome-ignore lint: installing global stub
(globalThis as any).OffscreenCanvas = FakeOffscreenCanvas;

if (typeof HTMLCanvasElement !== "undefined") {
  // biome-ignore lint: installing global stub
  (HTMLCanvasElement.prototype as any).transferControlToOffscreen = function (
    this: HTMLCanvasElement,
  ) {
    return new FakeOffscreenCanvas(this.width || 300, this.height || 150);
  };
}

class FakeResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
// biome-ignore lint: installing global stub
(globalThis as any).ResizeObserver = FakeResizeObserver;
