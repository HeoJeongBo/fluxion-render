export class GenericRingBuffer<T> {
  private readonly _buf: (T | undefined)[];
  private _head = 0;
  private _count = 0;
  readonly capacity: number;

  constructor(capacity: number) {
    if (capacity < 1) throw new RangeError("capacity must be >= 1");
    this.capacity = capacity;
    this._buf = new Array<T | undefined>(capacity).fill(undefined);
  }

  get length(): number {
    return this._count;
  }

  push(item: T): void {
    this._buf[this._head] = item;
    this._head = (this._head + 1) % this.capacity;
    if (this._count < this.capacity) {
      this._count++;
    }
  }

  /** O(1) access by logical index (0 = oldest). */
  at(i: number): T | undefined {
    if (i < 0 || i >= this._count) return undefined;
    return this._buf[this._oldestSlot(i)];
  }

  /** Iterate from oldest to newest. */
  forEach(fn: (item: T, index: number) => void): void {
    for (let i = 0; i < this._count; i++) {
      const item = this._buf[this._oldestSlot(i)];
      if (item !== undefined) fn(item, i);
    }
  }

  /** Remove entries from the oldest end while predicate returns true. */
  evictWhile(predicate: (item: T) => boolean): void {
    while (this._count > 0) {
      const slot = this._oldestSlot(0);
      const item = this._buf[slot];
      if (item === undefined || !predicate(item)) break;
      this._buf[slot] = undefined;
      this._count--;
    }
  }

  private _oldestSlot(offset: number): number {
    // _head points to the next write position.
    // oldest item is at (_head - _count) mod capacity.
    return (this._head - this._count + offset + this.capacity * 2) % this.capacity;
  }

  /** Snapshot to plain array (oldest-first). O(n). */
  toArray(): T[] {
    const result: T[] = [];
    this.forEach((item) => result.push(item));
    return result;
  }

  clear(): void {
    this._buf.fill(undefined);
    this._head = 0;
    this._count = 0;
  }
}
