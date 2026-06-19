/**
 * rAF-based render scheduler. Only calls `tick` on frames where dirty is set.
 * Uses the worker-global requestAnimationFrame when available; otherwise falls
 * back to setTimeout(16ms).
 */
export class Scheduler {
  private dirty = false;
  private continuous = false;
  private running = false;
  private raf: number | null = null;
  private readonly tick: (dirty: boolean) => void;

  /**
   * `tick` receives whether THIS frame was triggered by the dirty flag (a
   * one-shot redraw: data, config, resize, style) as opposed to a pure
   * continuous frame (a follow-clock scroll where only the time axis moves).
   * The engine uses this to skip redundant work — e.g. re-rendering the y-axis
   * canvas — on continuous frames where nothing y-related changed.
   */
  constructor(tick: (dirty: boolean) => void) {
    this.tick = tick;
  }

  /**
   * When true, `tick` fires on every frame regardless of the dirty flag. Used
   * for wall-clock-following time axes that must redraw to scroll even when no
   * data arrives. When false, returns to the default dirty-gated behavior.
   */
  setContinuous(on: boolean) {
    this.continuous = on;
    // Wake the loop immediately so the first continuous frame doesn't wait for
    // an external markDirty.
    if (on) this.dirty = true;
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
    if (this.continuous || this.dirty) {
      const wasDirty = this.dirty;
      this.dirty = false;
      this.tick(wasDirty);
    }
    if (typeof requestAnimationFrame !== "undefined") {
      this.raf = requestAnimationFrame(this.loop);
    } else {
      this.raf = setTimeout(this.loop, 16) as unknown as number;
    }
  };
}
