// ============================================================================
// undoHistory.ts — bounded undo stack for Step Back
// ============================================================================
// A full snapshot holds all 4 MB of RAM. Keeping 64 of them would pin 256 MB,
// so only the newest snapshot keeps its whole memory image. Every older entry
// keeps a patch: the bytes in which it differs from the entry after it. A
// manual step changes a handful of bytes, so a patch is tiny.
//
// push(): diff the new image against the newest one and store the old bytes as
//         a patch on the previous entry.
// pop():  hand back the newest snapshot with its full image, then rebuild the
//         image of the entry below it by applying its patch.
// ============================================================================

import type { Snapshot } from '../wasm-bridge';

interface Entry {
  state: Snapshot['state'];
  console: number[];
  /** Bytes (address, value) that turn the next entry's image into this one's. */
  patchAddrs: Uint32Array | null;
  patchVals: Uint8Array | null;
}

export class UndoHistory {
  private entries: Entry[] = [];
  /** Full memory image of the newest entry. */
  private top: Uint8Array | null = null;

  constructor(private readonly capacity: number) {}

  get size(): number { return this.entries.length; }

  clear(): void {
    this.entries = [];
    this.top = null;
  }

  push(snap: Snapshot): void {
    const mem = snap.memory;
    if (this.top && this.entries.length > 0 && this.top.length === mem.length) {
      const prev = this.entries[this.entries.length - 1];
      const [addrs, vals] = diff(this.top, mem);
      prev.patchAddrs = addrs;
      prev.patchVals = vals;
    } else if (this.entries.length > 0) {
      // Memory size changed (should not happen): older entries can't be rebuilt.
      this.entries = [];
    }
    this.entries.push({ state: snap.state, console: snap.console, patchAddrs: null, patchVals: null });
    this.top = mem;
    while (this.entries.length > this.capacity) this.entries.shift();
  }

  pop(): Snapshot | null {
    const entry = this.entries.pop();
    if (!entry || !this.top) return null;
    const snap: Snapshot = { state: entry.state, console: entry.console, memory: this.top };
    const below = this.entries[this.entries.length - 1];
    if (below && below.patchAddrs && below.patchVals) {
      // The caller's restoreSnapshot copies the image, so build a new one for `below`.
      const img = new Uint8Array(this.top);
      for (let i = 0; i < below.patchAddrs.length; i++) img[below.patchAddrs[i]] = below.patchVals[i];
      below.patchAddrs = null;
      below.patchVals = null;
      this.top = img;
    } else {
      this.top = below ? this.top : null;
    }
    return snap;
  }
}

/** Addresses where `older` and `newer` differ, with the values from `older`. */
function diff(older: Uint8Array, newer: Uint8Array): [Uint32Array, Uint8Array] {
  const addrs: number[] = [];
  const n = older.length;
  // Compare four bytes at a time when both images are 4-byte aligned.
  if (n % 4 === 0 && older.byteOffset % 4 === 0 && newer.byteOffset % 4 === 0) {
    const a = new Uint32Array(older.buffer, older.byteOffset, n / 4);
    const b = new Uint32Array(newer.buffer, newer.byteOffset, n / 4);
    for (let w = 0; w < a.length; w++) {
      if (a[w] !== b[w]) {
        const base = w * 4;
        for (let k = 0; k < 4; k++) if (older[base + k] !== newer[base + k]) addrs.push(base + k);
      }
    }
  } else {
    for (let i = 0; i < n; i++) if (older[i] !== newer[i]) addrs.push(i);
  }
  const vals = new Uint8Array(addrs.length);
  for (let i = 0; i < addrs.length; i++) vals[i] = older[addrs[i]];
  return [Uint32Array.from(addrs), vals];
}
