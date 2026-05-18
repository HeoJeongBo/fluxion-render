export interface CachedLayerOptions {
  capacity?: number;
  label?: string;
  color?: string;
}

interface CacheEntry {
  data: Float32Array;
  capacity: number;
  head: number;
  count: number;
  label: string;
  color: string;
}

export class HoverDataCache {
  private readonly _entries = new Map<string, CacheEntry>();
  private readonly _order: string[] = [];

  registerLayer(id: string, opts: CachedLayerOptions = {}): void {
    if (this._entries.has(id)) return;
    const capacity = opts.capacity ?? 2048;
    this._entries.set(id, {
      data: new Float32Array(capacity * 2),
      capacity,
      head: 0,
      count: 0,
      label: opts.label ?? id,
      color: opts.color ?? "#ffffff",
    });
    this._order.push(id);
  }

  push(id: string, t: number, y: number): void {
    const e = this._entries.get(id);
    if (!e) return;
    const base = e.head * 2;
    e.data[base] = t;
    e.data[base + 1] = y;
    e.head = (e.head + 1) % e.capacity;
    if (e.count < e.capacity) e.count++;
  }

  pushBatch(id: string, arr: Float32Array): void {
    const e = this._entries.get(id);
    if (!e) return;
    const recCount = Math.floor(arr.length / 2);
    for (let r = 0; r < recCount; r++) {
      const base = e.head * 2;
      e.data[base] = arr[r * 2]!;
      e.data[base + 1] = arr[r * 2 + 1]!;
      e.head = (e.head + 1) % e.capacity;
      if (e.count < e.capacity) e.count++;
    }
  }

  clear(id?: string): void {
    if (id !== undefined) {
      const e = this._entries.get(id);
      if (e) { e.head = 0; e.count = 0; }
    } else {
      for (const e of this._entries.values()) { e.head = 0; e.count = 0; }
    }
  }

  findNearest(id: string, targetT: number, xMin: number): { t: number; y: number } | null {
    const e = this._entries.get(id);
    if (!e || e.count === 0) return null;

    let bestT = 0;
    let bestY = 0;
    let bestDist = Infinity;
    const start = e.count < e.capacity ? 0 : e.head;

    for (let i = 0; i < e.count; i++) {
      const slot = (start + i) % e.capacity;
      const t = e.data[slot * 2]!;
      if (t < xMin) continue;
      const dist = Math.abs(t - targetT);
      if (dist < bestDist) {
        bestDist = dist;
        bestT = t;
        bestY = e.data[slot * 2 + 1]!;
      }
    }

    return bestDist === Infinity ? null : { t: bestT, y: bestY };
  }

  /** Returns the t value of the most recently pushed point across all registered layers. */
  getLatestT(): number {
    let latest = -Infinity;
    for (const e of this._entries.values()) {
      if (e.count === 0) continue;
      // head points to next write slot; (head - 1 + capacity) % capacity is the last written slot
      const lastSlot = (e.head - 1 + e.capacity) % e.capacity;
      const t = e.data[lastSlot * 2]!;
      if (t > latest) latest = t;
    }
    return latest === -Infinity ? 0 : latest;
  }

  getLayers(): ReadonlyArray<{ id: string; label: string; color: string }> {
    return this._order.map((id) => {
      const e = this._entries.get(id)!;
      return { id, label: e.label, color: e.color };
    });
  }
}
