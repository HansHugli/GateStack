// Edge-case programs with the values REFERENCE.md and the 2026-10-18 decisions
// expect. Every engine must produce them (engines.test.ts). Ported from the
// review's differential harness (targeted.ts), written with the test encoder.
import { Asm } from './asm';

export interface Targeted {
  bytes: Uint8Array;
  inputs?: number[];
  /** register index → expected value after the run */
  expect?: Record<number, number>;
  expectSp?: number;
  expectPc?: number;
  expectMem?: Array<[number, number]>; // [addr, byte]
  expectFault?: string | null;          // default: null (no fault)
  expectConsole?: number[];
  maxSteps?: number;
}

const u = (n: number) => n >>> 0;
const big = (a: bigint) => Number(a & 0xFFFFFFFFn);

function build(f: (a: Asm) => void): Uint8Array { const a = new Asm(); f(a); return a.bytes(); }

export const TARGETED: Record<string, Targeted> = {
  add_sub_carry: {
    bytes: build(a => a
      .data(0, 0xFFFFFFFF).data(1, 1).rr('ADD', 0, 1)
      .data(2, 0).rr('SUB', 2, 1)
      .data(3, 0x80000000).rr('ADD', 3, 3)
      .data(4, 5).data(5, 3).rr('SUB', 4, 5)
      .halt()),
    expect: { 0: 0, 2: 0xFFFFFFFF, 3: 0, 4: 2 },
  },

  mul_div: {
    bytes: build(a => a
      .data(0, 0x12345678).data(1, 0x9ABCDEF0).rr('MOV', 2, 0)
      .rr('MUL', 0, 1).rr('MULH', 2, 1)
      .data(3, 100).data(4, 0).rr('MOV', 5, 3).rr('DIV', 3, 4).rr('MOD', 5, 4)
      .data(6, 0xFFFFFFFF).data(7, 7).rr('MOV', 8, 6).rr('DIV', 6, 7).rr('MOD', 8, 7)
      .halt()),
    expect: { 0: big(0x12345678n * 0x9ABCDEF0n), 2: Number((0x12345678n * 0x9ABCDEF0n) >> 32n), 3: 0, 5: 0, 6: 613566756, 8: 3 },
  },

  idiv_imod: {
    bytes: build(a => a
      .data(0, u(-10)).data(1, 3).rr('IDIV', 0, 1)
      .data(2, 10).data(3, u(-3)).rr('IDIV', 2, 3)
      .data(4, u(-10)).data(5, u(-3)).rr('IDIV', 4, 5)
      .data(6, u(-10)).rr('IMOD', 6, 1)
      .data(7, 10).rr('IMOD', 7, 3)
      .data(8, 0x80000000).data(9, u(-1)).rr('MOV', 10, 8).rr('IDIV', 8, 9).rr('IMOD', 10, 9)
      .data(11, u(-7)).data(12, 0).rr('MOV', 13, 11).rr('IDIV', 11, 12).rr('IMOD', 13, 12)
      .halt()),
    expect: { 0: u(-3), 2: u(-3), 4: 3, 6: u(-1), 7: 1, 8: 0x80000000, 10: 0, 11: 0, 13: 0 },
  },

  fpmul_8_8: {
    bytes: build(a => a
      .data(0, u(-384)).data(1, 512).rr('FPMUL', 0, 1)            // -1.5 * 2 = -3
      .data(2, u(-256)).data(3, u(-256)).rr('FPMUL', 2, 3)        // -1 * -1 = 1
      .data(4, 0x7FFFFFFF).data(5, 0x7FFFFFFF).rr('FPMUL', 4, 5)
      .data(6, u(-1)).data(7, 1).rr('FPMUL', 6, 7)                // floors to -1
      .halt()),
    expect: { 0: u(-768), 2: 256, 4: big((0x7FFFFFFFn * 0x7FFFFFFFn) >> 8n), 6: 0xFFFFFFFF },
  },

  fpmul16_16_16: {
    bytes: build(a => a
      .data(0, 0x18000).data(1, 0x20000).rr('FPMUL16', 0, 1)      // 1.5 * 2 = 3
      .data(2, u(-0x18000)).data(3, 0x20000).rr('FPMUL16', 2, 3)  // -1.5 * 2 = -3
      .data(4, u(-0x10000)).data(5, u(-0x10000)).rr('FPMUL16', 4, 5) // -1 * -1 = 1
      .data(6, u(-1)).data(7, 1).rr('FPMUL16', 6, 7)              // floors to -1
      .data(8, 0x7FFFFFFF).data(9, 0x7FFFFFFF).rr('FPMUL16', 8, 9) // overflow, low 32 bits
      .data(10, 0x80000000).data(11, 0x7FFFFFFF).rr('FPMUL16', 10, 11)
      .data(12, 0x8000).data(13, 0x8000).rr('FPMUL16', 12, 13)    // 0.5 * 0.5 = 0.25
      .data(14, 1).data(15, 1).rr('FPMUL16', 14, 15)              // 0 (zero flag)
      .halt()),
    expect: {
      0: 0x30000, 2: u(-0x30000), 4: 0x10000, 6: 0xFFFFFFFF,
      8: big((0x7FFFFFFFn * 0x7FFFFFFFn) >> 16n), 10: big((-0x80000000n * 0x7FFFFFFFn) >> 16n),
      12: 0x4000, 14: 0,
    },
  },

  shifts: {
    bytes: build(a => a
      .data(0, 0x80000001)
      .rr('MOV', 1, 0).rr('SHR', 1)
      .rr('MOV', 2, 0).rr('SHL', 2)
      .rr('MOV', 3, 0).rr('SHR8', 3)
      .rr('MOV', 4, 0).rr('SHL8', 4)
      .data(15, 0).rr('MOV', 5, 0).rr('SHRN', 5, 15)
      .data(15, 31).rr('MOV', 6, 0).rr('SHRN', 6, 15).rr('MOV', 7, 0).rr('SHLN', 7, 15)
      .data(15, 32).rr('MOV', 8, 0).rr('SHRN', 8, 15).rr('MOV', 9, 0).rr('SHLN', 9, 15)
      .data(15, 33).rr('MOV', 10, 0).rr('SHRN', 10, 15).rr('MOV', 11, 0).rr('SHLN', 11, 15)
      .halt()),
    expect: { 1: 0x40000000, 2: 2, 3: 0x00800000, 4: 0x00000100, 5: 0x80000001, 6: 1, 7: 0x80000000, 8: 0x80000001, 9: 0x80000001, 10: 0x40000000, 11: 2 },
  },

  flags_logic: {
    bytes: build(a => a
      .data(0, 0xF0F0F0F0).data(1, 0x0FF00FF0)
      .rr('MOV', 2, 0).rr('AND', 2, 1)
      .rr('MOV', 3, 0).rr('OR', 3, 1)
      .rr('MOV', 4, 0).rr('XOR', 4, 1)
      .rr('MOV', 5, 0).rr('NOT', 5)
      .rr('CMP', 0, 1).jump('JA', 'ok1').data(6, 99)
      .label('ok1').rr('CMP', 1, 0).jump('JA', 'bad').rr('CMP', 0, 0).jump('JE', 'ok2')
      .label('bad').data(7, 99)
      .label('ok2').data(8, 0).data(9, 0).rr('ADD', 8, 9).jump('JZ', 'ok3').data(10, 99)
      .label('ok3').jump('JNZ', 'bad2').jump('JMP', 'ok4')
      .label('bad2').data(11, 99)
      .label('ok4').halt()),
    expect: { 2: 0x00F000F0, 3: 0xFFF0FFF0, 4: 0xFF00FF00, 5: 0x0F0F0F0F, 6: 0, 7: 0, 10: 0, 11: 0 },
  },

  // CMP sets flags as for rA − rB: Z = equal, C = rA < rB (unsigned)
  cmp_branches: {
    bytes: build(a => a
      .data(0, 0).data(1, 1)
      .rr('CMP', 0, 1).jump('JZ', 'bad')          // 0 vs 1: not zero
      .jump('JC', 'c1').data(9, 99)               // 0 < 1: carry
      .label('c1').rr('CMP', 1, 0).jump('JC', 'bad')
      .jump('JNZ', 'c2').data(9, 98)
      .label('c2').rr('CMP', 1, 1).jump('JNZ', 'bad')
      .jump('JZ', 'c3').data(9, 97)
      .label('c3').data(2, 0xFFFFFFFF).rr('CMP', 0, 2).jump('JA', 'bad') // unsigned: 0 < 0xFFFFFFFF
      .jump('JC', 'c4').data(9, 96)
      .label('c4').data(8, 1).halt()
      .label('bad').data(8, 2).halt()),
    expect: { 0: 0, 1: 1, 8: 1, 9: 0 },
  },

  mem_byte_word: {
    bytes: build(a => a
      .data(0, 0x1234ABCD)
      .mem('STORE', 0, 0x100000).mem('LOAD', 1, 0x100000)
      .mem('STORE32', 0, 0x100011).mem('LOAD32', 2, 0x100011).mem('LOAD', 3, 0x100012)
      .data(4, 0x100013).rr('LDRI32', 5, 4)
      .data(6, 0x55).data(7, 0x100020).rr('STRI', 6, 7).rr('LDRI', 8, 7)
      .data(9, 0xDEADBEEF).rr('STRI32', 9, 7).rr('LDRI32', 10, 7)
      .mem('LOAD', 11, 0x500000)                   // 24-bit alias of 0x100000
      .data(12, 0xC0100011).rr('LDRI32', 13, 12)   // 32-bit register alias of 0x100011
      .halt()),
    expect: { 1: 0xCD, 2: 0x1234ABCD, 3: 0xAB, 5: 0x1234, 8: 0x55, 10: 0xDEADBEEF, 11: 0xCD, 13: 0x1234ABCD },
  },

  // The last word of RAM is fine; one byte further is a fault, and nothing is written
  mem_last_word: {
    bytes: build(a => a
      .data(0, 0xA1B2C3D4).data(1, 0x3FFFFC)
      .rr('STRI32', 0, 1)                          // also a vsync (covers 0x3FFFFF)
      .rr('LDRI32', 2, 1).mem('LOAD32', 3, 0x3FFFFC)
      .data(1, 0x3FFFFE).rr('STRI32', 0, 1)        // fault at 0x00001B
      .data(4, 1).halt()),
    expect: { 2: 0xA1B2C3D4, 3: 0xA1B2C3D4, 4: 0 },
    expectMem: [[0x3FFFFC, 0xD4], [0x3FFFFF, 0xA1], [0, 0x12], [1, 0x00], [0x3FFFFE, 0xB2]],
    expectFault: '32-bit access at 0x3FFFFE runs past the end of RAM (0x3FFFFF)',
    expectPc: 0x1B,
  },

  store32_past_end: {
    bytes: build(a => a.data(0, 0xAABBCCDD).mem('STORE32', 0, 0x3FFFFD).halt()),
    expectFault: '32-bit access at 0x3FFFFD runs past the end of RAM (0x3FFFFF)',
    expectPc: 6,
    expectMem: [[0x3FFFFD, 0], [0, 0x12]],
  },

  load32_past_end_alias: {
    bytes: build(a => a.mem('LOAD32', 0, 0x7FFFFF).halt()),
    expectFault: '32-bit access at 0x3FFFFF runs past the end of RAM (0x3FFFFF)',
    expectPc: 0,
  },

  call_nesting: {
    bytes: build(a => a
      .data(0, 0).jump('CALL', 'f1').data(15, 0x77).halt()
      .label('f1').data(1, 1).rr('ADD', 0, 1).jump('CALL', 'f2').rr('ADD', 0, 1).ret()
      .label('f2').data(2, 10).rr('ADD', 0, 2).jump('CALL', 'f3').ret()
      .label('f3').rr('PUSH', 0).data(0, 100).rr('POP', 3).ret()),
    expect: { 0: 101, 3: 11, 15: 0x77 },
    expectSp: 0x3BFFFF,
  },

  stack_top: {
    bytes: build(a => a
      .rr('POP', 0)                                // reads 0x3BFFFF..0x3C0002 (straddles VRAM)
      .rr('PUSH', 0).data(1, 0x11223344).rr('PUSH', 1).rr('POP', 2).rr('POP', 3).rr('POP', 4)
      .halt()),
    expect: { 2: 0x11223344 },
    expectSp: 0x3C0007,
  },

  // POP until SP passes 0x3FFFFF: SP wraps to 22 bits (0x3BFFFF + 4 * 0x10001 = 0x400003 → 0x000003)
  stack_overrun_top: {
    bytes: build(a => a
      .data(1, 1).data(2, 0x10001)
      .label('loop').rr('POP', 0).rr('SUB', 2, 1).jump('JNZ', 'loop')
      .halt()),
    expectSp: 0x000003,
    maxSteps: 400_000,
  },

  // Vsync flips on the STORE itself, in single steps too, for every store kind and alias
  vsync_store: {
    bytes: build(a => a
      .data(0, 7).mem('STORE', 0, 0x3C0000)
      .data(1, 0x3C0001).data(2, 9).rr('STRI', 2, 1)
      .mem('STORE', 0, 0x3FFFFF)                   // flip: front[0]=7, front[1]=9
      .data(0, 3).mem('STORE', 0, 0x3C0002)
      .data(3, 0x3FFFFF).rr('STRI', 0, 3)          // flip via STRI
      .data(0, 4).mem('STORE', 0, 0x3C0003)
      .mem('STORE32', 0, 0x3FFFFC)                 // flip via STORE32 covering 0x3FFFFF
      .data(0, 5).mem('STORE', 0, 0x3C0004)
      .data(3, 0xFFFFFFFC).rr('STRI32', 0, 3)      // flip via STRI32 (masked to 0x3FFFFC)
      .data(0, 6).mem('STORE', 0, 0x3C0005)
      .mem('STORE', 0, 0x7FFFFF)                   // 24-bit alias of 0x3FFFFF: flips
      .data(0, 8).mem('STORE', 0, 0x3C0006)        // drawn after the last flip: not shown
      .halt()),
    expectMem: [[0x3D0000, 7], [0x3D0001, 9], [0x3D0002, 3], [0x3D0003, 4], [0x3D0004, 5], [0x3D0005, 6], [0x3D0006, 0]],
  },

  palette: {
    bytes: build(a => a
      .mem('LOAD', 0, 0x3E0000).mem('LOAD', 1, 0x3E0040).mem('LOAD', 2, 0x3E0041).mem('LOAD', 3, 0x3E0042)
      .mem('LOAD32', 4, 0x3E0080)
      .data(5, 0x00FF8040).mem('STORE32', 5, 0x3E03FC).mem('LOAD32', 6, 0x3E03FC)
      .halt()),
    expect: { 0: 10, 1: 153, 2: 23, 3: 23, 6: 0x00FF8040 },
  },

  in_out: {
    bytes: build(a => a
      .rr('IN', 3).rr('OUT', 3).rr('IN', 4).rr('MOV', 5, 4).rr('OUT', 5).rr('IN', 15).halt()),
    inputs: [0x1FF, 0xFFFFFFFF, 0x41],
    expect: { 3: 0x1FF, 4: 0xFFFFFFFF, 15: 0x41 },
    expectConsole: [0xFF, 0xFF],
  },

  // 0x2C is FPMUL16 now; 0xFF is undefined and faults with the IAR on it
  unknown_opcodes: {
    bytes: build(a => a.db(0x2C, 0x11, 0xFF, 0x00).data(0, 1).halt()),
    expect: { 0: 0 },
    expectPc: 2,
    expectFault: 'Illegal opcode 0xFF at 0x000002',
  },

  illegal_opcode_0x2d: {
    bytes: build(a => a.data(0, 1).jump('JMP', 0x140).org(0x140).db(0x2D, 0x00)),
    expect: { 0: 1 },
    expectPc: 0x140,
    expectFault: 'Illegal opcode 0x2D at 0x000140',
  },

  // JMP to the 24-bit alias 0x400000+X runs the code at X; CALL pushes a 22-bit return address
  iar_alias_call: {
    bytes: build(a => a
      .jump('JMP', { label: 'entry', or: 0x400000 })
      .label('entry').data(0, 1).jump('CALL', 'sub').data(1, 2).halt()
      .label('sub').rr('POP', 7).rr('PUSH', 7).ret()),
    expect: { 0: 1, 1: 2, 7: 0x0E },
    expectSp: 0x3BFFFF,
  },

  // JMPR to a 32-bit register value above 4MB: masked to 22 bits
  jmpr_high: {
    bytes: build(a => a
      .data(0, { label: 'target', or: 0xC0000000 }).rr('JMPR', 0).halt()
      .label('target').data(1, 5).halt()),
    expect: { 1: 5 },
    expectPc: 0x10,
  },

  // Conditional jumps taken and not taken, to 24-bit aliases (masked)
  cond_jump_alias: {
    bytes: build(a => a
      .data(0, 2).data(1, 1).rr('CMP', 0, 1)
      .jump('JA', { label: 't1', or: 0x800000 }).data(9, 99)
      .label('t1').jump('JE', 'bad').jump('JC', 'bad')
      .rr('CMP', 1, 0).jump('JC', { label: 't2', or: 0xC00000 }).data(9, 98)
      .label('t2').data(8, 1).halt()
      .label('bad').data(8, 2).halt()),
    expect: { 8: 1, 9: 0 },
  },
};
