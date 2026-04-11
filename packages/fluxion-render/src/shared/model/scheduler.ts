/**
 * rAF-based render scheduler. Only calls `tick` on frames where dirty is set.
 * Uses the worker-global requestAnimationFrame when available; otherwise falls
 * back to setTimeout(16ms).
 */
export class Scheduler {
  private dirty = false;
  private running = false;
  private raf: number | null = null;
  private readonly tick: () => void;

  constructor(tick: () => void) {
    this.tick = tick;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.loop();
  }

  stop() {
    this.running = false;
    if (this.raf != null) {
      if (typeof cancelAnimationFrame !== "undefined") {
        cancelAnimationFrame(this.raf);
      } else {
        clearTimeout(this.raf);
      }
      this.raf = null;
    }
  }

  markDirty() {
    this.dirty = true;
  }

  private loop = () => {
    if (!this.running) return;
    if (this.dirty) {
      this.dirty = false;
      this.tick();
    }
    if (typeof requestAnimationFrame !== "undefined") {
      this.raf = requestAnimationFrame(this.loop);
    } else {
      this.raf = setTimeout(this.loop, 16) as unknown as number;
    }
  };
}
