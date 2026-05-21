export interface Thumbnail {
  readonly t: number;
  readonly dataUrl: string;
}

export class ThumbnailStore {
  private readonly _store = new Map<number, string>();
  private _sortedKeys: number[] = [];

  set(t: number, dataUrl: string): void {
    if (!this._store.has(t)) {
      const i = this._lowerBound(t);
      this._sortedKeys.splice(i, 0, t);
    }
    this._store.set(t, dataUrl);
  }

  get(t: number): string | undefined {
    return this._store.get(t);
  }

  /** Returns the nearest thumbnail at or before t. */
  getNear(t: number): Thumbnail | null {
    let lo = 0;
    let hi = this._sortedKeys.length - 1;
    let best: number | null = null;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (this._sortedKeys[mid] <= t) {
        best = this._sortedKeys[mid];
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (best === null) return null;
    const dataUrl = this._store.get(best);
    return dataUrl !== undefined ? { t: best, dataUrl } : null;
  }

  clear(): void {
    this._store.clear();
    this._sortedKeys = [];
  }

  get size(): number {
    return this._store.size;
  }

  private _lowerBound(target: number): number {
    let lo = 0;
    let hi = this._sortedKeys.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this._sortedKeys[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}
