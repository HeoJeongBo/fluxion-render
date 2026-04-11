/**
 * Fixed-capacity ring buffer over a Float32Array.
 * Stores interleaved records of `stride` floats each (e.g. [x,y] stride=2).
 * Zero-allocation push; draw iterates from tail to head in chronological order.
 */
export class RingBuffer {
  readonly stride: number;
  readonly capacity: number;
  readonly data: Float32Array;
  private head = 0;
  private count = 0;

  constructor(capacity: number, stride: number) {
    this.capacity = capacity;
    this.stride = stride;
    this.data = new Float32Array(capacity * stride);
  }

  get length(): number {
    return this.count;
  }

  push(record: ArrayLike<number>): void {
    const base = this.head * this.stride;
    for (let i = 0; i < this.stride; i++) {
      this.data[base + i] = record[i];
    }
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  pushMany(records: Float32Array): void {
    const recCount = records.length / this.stride;
    for (let r = 0; r < recCount; r++) {
      const base = this.head * this.stride;
      const src = r * this.stride;
      for (let i = 0; i < this.stride; i++) {
        this.data[base + i] = records[src + i];
      }
      this.head = (this.head + 1) % this.capacity;
      if (this.count < this.capacity) this.count++;
    }
  }

  forEach(fn: (data: Float32Array, offset: number, index: number) => void): void {
    const start = this.count < this.capacity ? 0 : this.head;
    for (let i = 0; i < this.count; i++) {
      const slot = (start + i) % this.capacity;
      fn(this.data, slot * this.stride, i);
    }
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
  }
}
