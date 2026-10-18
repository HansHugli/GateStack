// A tiny encoder for engine test programs. It writes the bytes directly, so the
// edge-case tests do not depend on what the assembler accepts (24-bit aliases,
// undefined opcodes, raw bytes).
import { OP } from '../wasm-bridge';

type Op = keyof typeof OP;
type Target = number | string | { label: string; or: number };

export class Asm {
  private out: number[] = [];
  private labels = new Map<string, number>();
  private fixups: Array<{ pos: number; size: 3 | 4; target: Target }> = [];

  get pc(): number { return this.out.length; }

  label(name: string): this { this.labels.set(name, this.out.length); return this; }

  /** Pads with zero bytes up to `addr`. */
  org(addr: number): this {
    if (addr < this.out.length) throw new Error(`org ${addr} is behind ${this.out.length}`);
    while (this.out.length < addr) this.out.push(0);
    return this;
  }

  db(...bytes: number[]): this { for (const b of bytes) this.out.push(b & 0xFF); return this; }

  dd(v: Target): this { this.fix(v, 4); return this; }

  /** Two-byte register instruction: opcode, rA<<4 | rB. */
  rr(op: Op, a = 0, b = 0): this { return this.db(OP[op], ((a & 15) << 4) | (b & 15)); }

  data(r: number, v: Target): this { this.db(OP.DATA, (r & 15) << 4); return this.fix(v, 4); }

  /** LOAD / STORE / LOAD32 / STORE32 rA, addr24 */
  mem(op: 'LOAD' | 'STORE' | 'LOAD32' | 'STORE32', r: number, addr: Target): this {
    this.db(OP[op], (r & 15) << 4);
    return this.fix(addr, 3);
  }

  /** JMP / JC / JA / JE / JZ / JNZ / CALL addr24 */
  jump(op: 'JMP' | 'JC' | 'JA' | 'JE' | 'JZ' | 'JNZ' | 'CALL', addr: Target): this {
    this.db(OP[op]);
    return this.fix(addr, 3);
  }

  halt(): this { return this.db(0, 0); }
  ret(): this { return this.rr('RET'); }

  bytes(): Uint8Array {
    const out = this.out.slice();
    for (const f of this.fixups) {
      let v: number;
      if (typeof f.target === 'number') v = f.target;
      else {
        const name = typeof f.target === 'string' ? f.target : f.target.label;
        const at = this.labels.get(name);
        if (at === undefined) throw new Error(`unknown label ${name}`);
        v = typeof f.target === 'string' ? at : (at | f.target.or);
      }
      for (let i = 0; i < f.size; i++) out[f.pos + i] = (v >>> (8 * i)) & 0xFF;
    }
    return new Uint8Array(out);
  }

  private fix(t: Target, size: 3 | 4): this {
    this.fixups.push({ pos: this.out.length, size, target: t });
    for (let i = 0; i < size; i++) this.out.push(0);
    return this;
  }
}
