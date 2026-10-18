// Fixed-capacity ring buffer: push is O(1) and never copies the contents.

export class RingBuffer<T> {
  private buf: T[];
  private start = 0;
  private count = 0;

  constructor(private readonly capacity: number) {
    this.buf = new Array(capacity);
  }

  get size(): number { return this.count; }

  push(item: T): void {
    const end = (this.start + this.count) % this.capacity;
    this.buf[end] = item;
    if (this.count < this.capacity) this.count++;
    else this.start = (this.start + 1) % this.capacity;
  }

  /** Remove and return the newest item. */
  pop(): T | undefined {
    if (this.count === 0) return undefined;
    const idx = (this.start + this.count - 1) % this.capacity;
    const item = this.buf[idx];
    this.buf[idx] = undefined as unknown as T;
    this.count--;
    return item;
  }

  clear(): void {
    this.buf = new Array(this.capacity);
    this.start = 0;
    this.count = 0;
  }

  /** Oldest first. */
  toArray(): T[] {
    const out = new Array<T>(this.count);
    for (let i = 0; i < this.count; i++) out[i] = this.buf[(this.start + i) % this.capacity];
    return out;
  }
}
