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
  // Render-rate cap. 0 = uncapped (render on every dirty/continuous frame, the
  // default). When > 0, renders are throttled to at most `1000 / minFrameMs`
  // per second; skipped frames keep the dirty flag latched so no data is lost.
  private minFrameMs = 0;
  private lastRenderMs = Number.NEGATIVE_INFINITY;

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

  /**
   * Cap the render rate to at most `fps` frames/sec. Useful when many engines
   * share a worker (e.g. a large chart grid): at 500 Hz the dirty flag is set
   * ~60×/sec, so an uncapped engine redraws 60 fps; capping to 30 roughly
   * halves worker scan+draw CPU and is visually indistinguishable for a
   * scrolling time window. `undefined`/`0`/negative restores uncapped.
   *
   * Throttling applies to the dirty path too (not just continuous), and a
   * frame skipped under the interval keeps `dirty` latched so the pending data
   * renders on the next eligible frame — nothing is dropped.
   */
  setMaxFps(fps: number | undefined) {
    this.minFrameMs = fps && fps > 0 ? 1000 / fps : 0;
  }

  // Whether this frame is allowed to render under the FPS cap. Uncapped: always
  // (no clock read, so the default path is unchanged). Capped: only once the
  // min frame interval has elapsed since the last render.
  private shouldRender(): boolean {
    if (this.minFrameMs === 0) return true;
    const now = performance.now();
    if (now - this.lastRenderMs < this.minFrameMs) return false;
    this.lastRenderMs = now;
    return true;
  }

  private loop = () => {
    if (!this.running) return;
    if ((this.continuous || this.dirty) && this.shouldRender()) {
      const wasDirty = this.dirty;
      this.dirty = false;
      try {
        this.tick(wasDirty);
      } catch (err) {
        // A render error must NOT kill the loop. Because the rAF reschedule
        // below sits after tick(), an uncaught throw here would permanently
        // stop this engine — freezing every chart that shares the worker and
        // leaving newly-mounted charts unable to draw their first frame. Log
        // and keep looping so a transient bad frame self-recovers.
        console.error("[fluxion] render error (frame skipped):", err);
      }
    }
    if (typeof requestAnimationFrame !== "undefined") {
      this.raf = requestAnimationFrame(this.loop);
    } else {
      this.raf = setTimeout(this.loop, 16) as unknown as number;
    }
  };
}
