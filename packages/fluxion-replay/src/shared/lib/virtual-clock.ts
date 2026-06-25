export type VirtualClockListener = (currentT: number) => void;

export class VirtualClock {
  private _startWallMs = 0;
  private _startVirtualMs = 0;
  private _rate = 1.0;
  private _running = false;
  private _pausedByVisibility = false;
  private _rafId: number | null = null;
  private readonly _listeners = new Set<VirtualClockListener>();

  get currentT(): number {
    if (!this._running) return this._startVirtualMs;
    return this._startVirtualMs + (Date.now() - this._startWallMs) * this._rate;
  }

  get rate(): number {
    return this._rate;
  }

  get isRunning(): boolean {
    return this._running;
  }

  start(virtualStartMs: number, rate = 1.0): void {
    // Stop any existing loop before starting a new one to prevent a duplicate
    // RAF chain when start() is called while already running.
    if (this._running) {
      this._stopLoop();
    }
    this._startVirtualMs = virtualStartMs;
    this._startWallMs = Date.now();
    this._rate = rate;
    this._running = true;
    this._loop();
    this._attachVisibilityListener();
  }

  pause(): void {
    if (!this._running) return;
    this._startVirtualMs = this.currentT;
    this._startWallMs = Date.now();
    this._running = false;
    this._stopLoop();
    // Only detach when manually paused; visibility-driven pause keeps listener alive
    if (!this._pausedByVisibility) {
      this._detachVisibilityListener();
    }
  }

  resume(): void {
    if (this._running) return;
    this._startWallMs = Date.now();
    this._running = true;
    this._loop();
    this._attachVisibilityListener();
  }

  seek(virtualMs: number): void {
    this._startVirtualMs = virtualMs;
    this._startWallMs = Date.now();
  }

  setRate(rate: number): void {
    if (this._running) {
      this._startVirtualMs = this.currentT;
      this._startWallMs = Date.now();
    }
    this._rate = rate;
  }

  stop(): void {
    this._running = false;
    this._pausedByVisibility = false;
    this._startVirtualMs = 0;
    this._startWallMs = 0;
    this._stopLoop();
    this._detachVisibilityListener();
  }

  onTick(listener: VirtualClockListener): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  dispose(): void {
    this.stop();
    this._listeners.clear();
  }

  private _loop = (): void => {
    if (!this._running) return;
    const t = this.currentT;
    for (const listener of this._listeners) {
      // Isolate each listener so one throw can't skip the others — and, more
      // importantly, can't skip the reschedule below and permanently freeze
      // playback (the rAF re-arm sits after this loop).
      try {
        listener(t);
      } catch (err) {
        console.error("[fluxion-replay] clock listener error:", err);
      }
    }
    if (typeof requestAnimationFrame !== "undefined") {
      this._rafId = requestAnimationFrame(this._loop);
    } else {
      this._rafId = setTimeout(this._loop, 16) as unknown as number;
    }
  };

  private _stopLoop(): void {
    if (this._rafId != null) {
      if (typeof cancelAnimationFrame !== "undefined") {
        cancelAnimationFrame(this._rafId);
      } else {
        clearTimeout(this._rafId);
      }
      this._rafId = null;
    }
  }

  private _attachVisibilityListener(): void {
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this._onVisibilityChange);
      document.addEventListener("visibilitychange", this._onVisibilityChange);
    }
  }

  private _detachVisibilityListener(): void {
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this._onVisibilityChange);
    }
  }

  private _onVisibilityChange = (): void => {
    // Only registered when document exists, so it's always defined here.
    if (document.visibilityState === "hidden" && this._running) {
      this._pausedByVisibility = true;
      this.pause();
    } else if (document.visibilityState === "visible" && this._pausedByVisibility) {
      this._pausedByVisibility = false;
      this.resume();
    }
  };
}
