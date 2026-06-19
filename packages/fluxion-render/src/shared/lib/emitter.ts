/**
 * Minimal synchronous multi-listener event source. Replaces the
 * push / indexOf / splice subscribe boilerplate that listener APIs
 * (e.g. `onBoundsChange`, `onTickUpdate`) repeat verbatim.
 *
 * `Args` is the listener's parameter tuple, so `emit(...args)` is checked
 * against the exact listener signature:
 *
 * ```ts
 * const bounds = new Emitter<[yMin: number, yMax: number, latestT: number]>();
 * const off = bounds.subscribe((yMin, yMax, latestT) => { ... });
 * bounds.emit(0, 1, 1234); // type-checked: exactly three numbers
 * off();                    // unsubscribe
 * ```
 */
export class Emitter<Args extends unknown[]> {
  private readonly listeners: Array<(...args: Args) => void> = [];

  /** Register a listener. Returns an idempotent unsubscribe function. */
  subscribe(listener: (...args: Args) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  /** Invoke every current listener with `args`, in subscription order. */
  emit(...args: Args): void {
    for (const fn of this.listeners) fn(...args);
  }

  /** Current listener count — lets owners gate shared resources (e.g. a timer). */
  get size(): number {
    return this.listeners.length;
  }

  /** Drop all listeners (e.g. on dispose). */
  clear(): void {
    this.listeners.length = 0;
  }
}
