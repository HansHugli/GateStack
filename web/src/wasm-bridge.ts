// ============================================================================
// wasm-bridge.ts — GateStack v2.0 JS Engine + Shared Interfaces
// ============================================================================
// This is the central module that defines:
//   - OP constants (opcode values matching core/src/lib.rs)
//   - instrSize() — instruction length lookup
//   - IComputer interface — the contract both JS and WASM engines implement
//   - CpuState, CycleTrace, MicroStep — shared state types
//   - MockComputer — pure JavaScript CPU implementation (default engine)
//   - createComputer() — factory that tries WASM first, falls back to JS
//   - getOpcodeName() — opcode → mnemonic lookup
//
// v2.0 changes from v1.0:
//   - 32-bit registers (u32), 4MB RAM, 22-bit address space
//   - 24-bit addresses in instructions, 32-bit immediates in DATA
//   - New opcodes: SHRN, SHLN, JZ, JNZ, LOAD32, STORE32, LDRI32, STRI32, IDIV, IMOD
//   - Programmable palette at 0x3E0000 (256 × 4 bytes), updated on vsync
//   - Instruction sizes: DATA=6, LOAD/STORE/LOAD32/STORE32=5, jumps=4, rest=2
// ============================================================================

// ── Opcodes (must match core/src/lib.rs exactly) ─────────────────────────

export const OP = {
  HALT:    0x00,
  ADD:     0x01,
  SUB:     0x02,
  MUL:     0x03,
  DIV:     0x04,
  MOD:     0x05,
  SHR:     0x06,
  SHL:     0x07,
  NOT:     0x08,
  AND:     0x09,
  OR:      0x0A,
  XOR:     0x0B,
  CMP:     0x0C,
  MULH:    0x0D,
  MOV:     0x0E,
  SHR8:    0x0F,
  LOAD:    0x10,
  STORE:   0x11,
  DATA:    0x12,
  PUSH:    0x13,
  POP:     0x14,
  LDRI:    0x15,
  STRI:    0x16,
  SHL8:    0x17,
  JMP:     0x18,
  JC:      0x19,
  JA:      0x1A,
  JE:      0x1B,
  JMPR:    0x1C,
  CALL:    0x1D,
  RET:     0x1E,
  OUT:     0x1F,
  IN:      0x20,
  // New v2.0 opcodes
  SHRN:    0x21,
  SHLN:    0x22,
  JZ:      0x23,
  JNZ:     0x24,
  LOAD32:  0x25,
  STORE32: 0x26,
  LDRI32:  0x27,
  STRI32:  0x28,
  IDIV:    0x29,
  IMOD:    0x2A,
  FPMUL:   0x2B,  // Signed 8.8 fixed-point multiply: rA = (rA * rB) >> 8
  FPMUL16: 0x2C,
} as const;

// ── Instruction size lookup ──────────────────────────────────────────────

export function instrSize(opcode: number): number {
  switch (opcode) {
    case OP.DATA:                                              return 6; // opcode + reg + imm32
    case OP.LOAD: case OP.STORE:                               return 5; // opcode + reg + addr24
    case OP.LOAD32: case OP.STORE32:                           return 5; // opcode + reg + addr24
    case OP.JMP: case OP.JC: case OP.JA: case OP.JE:          return 4; // opcode + addr24
    case OP.JZ: case OP.JNZ: case OP.CALL:                    return 4;
    default:                                                   return 2; // opcode + reg byte
  }
}

// ── Opcode name lookup ───────────────────────────────────────────────────

const OP_NAME_MAP: Record<number, string> = {};
for (const [name, code] of Object.entries(OP)) {
  OP_NAME_MAP[code] = name;
}

export function getOpcodeName(opcode: number): string {
  return OP_NAME_MAP[opcode] ?? '???';
}

// ── Memory map constants ─────────────────────────────────────────────────

const MEM_SIZE    = 4_194_304;  // 4MB
const MEM_MASK    = 0x3FFFFF;   // 22-bit address mask
const PALETTE_BASE = 0x3E0000;  // 256 × 4 bytes = 1024 bytes
const BACK_BUFFER  = 0x3C0000;  // Back buffer (draw target) 64KB
const FRONT_BUFFER = 0x3D0000;  // Front buffer (display) 64KB
const VIDEO_BASE   = 0x3D0000;  // Alias for front buffer
const VSYNC_ADDR   = 0x3FFFFF;  // triggers page flip
const INIT_SP      = 0x3BFFFF;  // top of program/data/stack (below back buffer)

// ── Shared types ─────────────────────────────────────────────────────────

export interface CpuFlags {
  carry: boolean;
  a_larger: boolean;
  equal: boolean;
  zero: boolean;
}

export interface CpuState {
  r: number[];          // 16 × 32-bit registers
  acc: number;          // not used in v2 but kept for UI compatibility
  tmp: number;          // not used in v2 but kept for UI compatibility
  iar: number;          // 32-bit instruction address register
  ir: number;           // 8-bit current opcode
  sp: number;           // 32-bit stack pointer
  flags: CpuFlags;
  bus: number;          // not used in v2 but kept for UI compatibility
  halted: boolean;
  cycle_count: number;
}

export type MicroStep = {
  FetchInstruction?: { address: number; value: number };
  DecodeRegister?: { byte: number; rA: number; rB: number };
  ReadMemory?: { address: number; value: number };
  WriteMemory?: { address: number; value: number };
  AluOperation?: {
    op: string;
    input_a: number;
    input_b: number;
    result: {
      value: number;
      carry: boolean;
      zero: boolean;
      a_larger: boolean;
      equal: boolean;
    };
  };
  UpdateFlags?: CpuFlags;
  Jump?: { target: number };
  WaitingForInput?: { register: string };
  Halt?: {};
  BusTransfer?: {
    source: string | { Reg: string } | { Immediate: number } | { Mem: number };
    dest: string;
    value?: number;
  };
};

export interface CycleTrace {
  address: number;
  opcode: string | null;
  reg_a: string | null;
  reg_b: string | null;
  steps: MicroStep[];
  flags: CpuFlags | null;
  cycle: number;
  halted: boolean;
  error: string | null;
}

export type EngineType = 'js' | 'wasm';

// ── Snapshot for undo ────────────────────────────────────────────────────

export interface Snapshot {
  state: CpuState;
  memory: Uint8Array;   // Efficient binary copy (not number[])
  console: number[];
}

// ── IComputer interface ──────────────────────────────────────────────────

export interface IComputer {
  loadProgram(bytes: Uint8Array): void;
  step(): CycleTrace;
  run(maxCycles: number): number;

  getState(): CpuState;
  getMemory(start: number, len: number): number[];
  getAllMemory(): Uint8Array;
  getRawMemory(): number[];

  reset(): void;
  hardReset(): void;

  addBreakpoint(addr: number): void;
  removeBreakpoint(addr: number): void;
  getBreakpoints(): Set<number>;

  isHalted(): boolean;
  isWaitingForInput(): boolean;
  getInputRequest(): { register: number } | null;
  provideInput(value: number): void;

  getPc(): number;
  getCycleCount(): number;
  getRegister(index: number): number;

  poke(address: number, value: number): void;

  getConsoleOutput(): number[];
  clearConsole(): void;
  echoToConsole(text: string): void;

  getSnapshot(): Snapshot;
  restoreSnapshot(snap: Snapshot): void;

  setSkipVsync(skip: boolean): void;
}

// ── Default 256-color palette ────────────────────────────────────────────
// First 16: v1.0 compatible, remaining 240: HSV rainbow gradient
// Stored as flat array: [R0,G0,B0,_,R1,G1,B1,_,...] (1024 bytes)

function buildDefaultPalette(): number[] {
  const pal = new Array(1024).fill(0);

  // v1.0 colors (16 entries)
  const v1: number[][] = [
    [10,12,20],[25,7,80],[9,1,142],[4,4,200],[0,75,220],[5,140,190],
    [10,190,120],[40,220,60],[120,230,25],[220,220,15],[255,180,0],
    [255,100,0],[220,40,5],[170,15,60],[100,5,80],[50,5,50],
  ];
  for (let i = 0; i < 16; i++) {
    pal[i * 4]     = v1[i][0];
    pal[i * 4 + 1] = v1[i][1];
    pal[i * 4 + 2] = v1[i][2];
    pal[i * 4 + 3] = 0;
  }

  // HSV rainbow gradient (240 entries, indices 16..255)
  for (let i = 0; i < 240; i++) {
    const h = (i / 240) * 360;
    const s = 0.85;
    const v = 0.6 + 0.4 * Math.sin((i / 240) * Math.PI);
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r1: number, g1: number, b1: number;
    if      (h < 60)  { r1 = c; g1 = x; b1 = 0; }
    else if (h < 120) { r1 = x; g1 = c; b1 = 0; }
    else if (h < 180) { r1 = 0; g1 = c; b1 = x; }
    else if (h < 240) { r1 = 0; g1 = x; b1 = c; }
    else if (h < 300) { r1 = x; g1 = 0; b1 = c; }
    else              { r1 = c; g1 = 0; b1 = x; }
    const idx = (16 + i) * 4;
    pal[idx]     = Math.round((r1 + m) * 255);
    pal[idx + 1] = Math.round((g1 + m) * 255);
    pal[idx + 2] = Math.round((b1 + m) * 255);
    pal[idx + 3] = 0;
  }

  return pal;
}

// ── MockComputer — Pure JavaScript CPU engine ────────────────────────────

export class MockComputer implements IComputer {
  private mem: Uint8Array;
  private r: Uint32Array;         // 16 × 32-bit registers
  private iar: number = 0;
  private sp: number = INIT_SP;
  private cycleCount: number = 0;

  // Flags
  private carry = false;
  private aLarger = false;
  private equal = false;
  private zero = true;

  // State
  private halted = false;
  private inputWaiting = false;
  private inputRegister = 0;

  // Console
  private consoleBuffer: number[] = [];

  // Breakpoints
  private breakpoints = new Set<number>();

  // Vsync
  private skipVsync = false;

  // Double buffering: copy back buffer → front buffer on vsync
  private pageFlip(): void {
    this.mem.copyWithin(FRONT_BUFFER, BACK_BUFFER, BACK_BUFFER + 0x10000);
  }

  constructor() {
    this.mem = new Uint8Array(MEM_SIZE);
    this.r = new Uint32Array(16);
    // Initialize default palette
    const pal = buildDefaultPalette();
    for (let i = 0; i < 1024; i++) {
      this.mem[PALETTE_BASE + i] = pal[i];
    }
  }

  // ── Memory helpers ───────────────────────────────────────────────────

  private read8(addr: number): number {
    return this.mem[addr & MEM_MASK];
  }

  private write8(addr: number, val: number): void {
    this.mem[addr & MEM_MASK] = val & 0xFF;
  }

  private read32(addr: number): number {
    const a = addr & MEM_MASK;
    return this.mem[a]
         | (this.mem[(a + 1) & MEM_MASK] << 8)
         | (this.mem[(a + 2) & MEM_MASK] << 16)
         | (this.mem[(a + 3) & MEM_MASK] << 24);
  }

  private write32(addr: number, val: number): void {
    const a = addr & MEM_MASK;
    this.mem[a]                      = val & 0xFF;
    this.mem[(a + 1) & MEM_MASK] = (val >>> 8) & 0xFF;
    this.mem[(a + 2) & MEM_MASK] = (val >>> 16) & 0xFF;
    this.mem[(a + 3) & MEM_MASK] = (val >>> 24) & 0xFF;
  }

  private readAddr24(offset: number): number {
    return this.mem[offset & MEM_MASK]
         | (this.mem[(offset + 1) & MEM_MASK] << 8)
         | (this.mem[(offset + 2) & MEM_MASK] << 16);
  }

  // ── IComputer implementation ─────────────────────────────────────────

  loadProgram(bytes: Uint8Array): void {
    this.hardReset();
    const len = Math.min(bytes.length, MEM_SIZE);
    this.mem.set(bytes.subarray(0, len));
  }

  step(): CycleTrace {
    if (this.inputWaiting) {
      return {
        address: this.iar,
        opcode: 'IN',
        reg_a: `R${this.inputRegister}`,
        reg_b: null,
        steps: [{ WaitingForInput: { register: `R${this.inputRegister}` } }],
        flags: this.getFlags(),
        cycle: this.cycleCount,
        halted: false,
        error: null,
      };
    }

    if (this.halted) {
      return {
        address: this.iar,
        opcode: null,
        reg_a: null,
        reg_b: null,
        steps: [],
        flags: null,
        cycle: this.cycleCount,
        halted: true,
        error: null,
      };
    }

    const addr = this.iar & MEM_MASK;
    const opcode = this.mem[addr];
    const regByte = this.mem[(addr + 1) & MEM_MASK];
    const rA = (regByte >> 4) & 0x0F;
    const rB = regByte & 0x0F;
    const opName = getOpcodeName(opcode);

    // Capture pre-execution state for trace generation
    const preA = this.r[rA] >>> 0;
    const preB = this.r[rB] >>> 0;

    const steps: MicroStep[] = [
      { FetchInstruction: { address: addr, value: opcode } },
      // Fetch cycle: IAR → MAR → RAM → IR
      { BusTransfer: { source: 'IAR', dest: 'MAR', value: addr } },
      { BusTransfer: { source: 'RAM', dest: 'IR', value: opcode } },
    ];

    // Execute one instruction
    this.run(1);

    // Generate detailed trace micro-steps based on opcode
    const postA = this.r[rA] >>> 0;
    const flags = this.getFlags();

    // ALU operations
    if ((opcode >= OP.ADD && opcode <= OP.SHR8) || opcode === OP.SHL8
        || opcode === OP.SHRN || opcode === OP.SHLN
        || opcode === OP.IDIV || opcode === OP.IMOD
        || opcode === OP.FPMUL) {
      // Bus: REGS → TMP (rA), REGS → ACC (rB)
      steps.push({ BusTransfer: { source: 'REGS', dest: 'TMP', value: preA } });
      steps.push({ BusTransfer: { source: 'REGS', dest: 'ACC', value: preB } });
      steps.push({
        AluOperation: {
          op: opName,
          input_a: preA,
          input_b: preB,
          result: {
            value: postA,
            carry: flags.carry,
            zero: flags.zero,
            a_larger: flags.a_larger,
            equal: flags.equal,
          },
        },
      });
      if (opcode !== OP.CMP) {
        steps.push({ BusTransfer: { source: 'ALU', dest: 'REGS', value: postA } });
      }
    }

    // DATA rA, imm32
    else if (opcode === OP.DATA) {
      const imm = postA;
      steps.push({ BusTransfer: { source: { Immediate: imm }, dest: 'REGS', value: imm } });
    }

    // LOAD rA, [addr24] — byte load
    else if (opcode === OP.LOAD) {
      const mAddr = this.readAddr24(addr + 2);
      steps.push({ BusTransfer: { source: { Immediate: mAddr }, dest: 'MAR', value: mAddr } });
      steps.push({ BusTransfer: { source: 'RAM', dest: 'REGS', value: postA } });
    }

    // STORE rA, [addr24] — byte store
    else if (opcode === OP.STORE) {
      const mAddr = this.readAddr24(addr + 2);
      steps.push({ BusTransfer: { source: { Immediate: mAddr }, dest: 'MAR', value: mAddr } });
      steps.push({ BusTransfer: { source: 'REGS', dest: 'RAM', value: preA & 0xFF } });
    }

    // LOAD32 rA, [addr24]
    else if (opcode === OP.LOAD32) {
      const mAddr = this.readAddr24(addr + 2);
      steps.push({ BusTransfer: { source: { Immediate: mAddr }, dest: 'MAR', value: mAddr } });
      steps.push({ BusTransfer: { source: 'RAM', dest: 'REGS', value: postA } });
    }

    // STORE32 rA, [addr24]
    else if (opcode === OP.STORE32) {
      const mAddr = this.readAddr24(addr + 2);
      steps.push({ BusTransfer: { source: { Immediate: mAddr }, dest: 'MAR', value: mAddr } });
      steps.push({ BusTransfer: { source: 'REGS', dest: 'RAM', value: preA } });
    }

    // LDRI rA, rB — byte load from [rB]
    else if (opcode === OP.LDRI) {
      steps.push({ BusTransfer: { source: 'REGS', dest: 'MAR', value: preB } });
      steps.push({ BusTransfer: { source: 'RAM', dest: 'REGS', value: postA } });
    }

    // STRI rA, rB — byte store to [rB]
    else if (opcode === OP.STRI) {
      steps.push({ BusTransfer: { source: 'REGS', dest: 'MAR', value: preB } });
      steps.push({ BusTransfer: { source: 'REGS', dest: 'RAM', value: preA & 0xFF } });
    }

    // LDRI32 rA, rB
    else if (opcode === OP.LDRI32) {
      steps.push({ BusTransfer: { source: 'REGS', dest: 'MAR', value: preB } });
      steps.push({ BusTransfer: { source: 'RAM', dest: 'REGS', value: postA } });
    }

    // STRI32 rA, rB
    else if (opcode === OP.STRI32) {
      steps.push({ BusTransfer: { source: 'REGS', dest: 'MAR', value: preB } });
      steps.push({ BusTransfer: { source: 'REGS', dest: 'RAM', value: preA } });
    }

    // PUSH rA
    else if (opcode === OP.PUSH) {
      steps.push({ BusTransfer: { source: 'SP', dest: 'MAR', value: this.sp } });
      steps.push({ BusTransfer: { source: 'REGS', dest: 'RAM', value: preA } });
    }

    // POP rA
    else if (opcode === OP.POP) {
      steps.push({ BusTransfer: { source: 'SP', dest: 'MAR', value: this.sp - 4 } });
      steps.push({ BusTransfer: { source: 'RAM', dest: 'REGS', value: postA } });
    }

    // JMP/JC/JA/JE/JZ/JNZ
    else if (opcode >= OP.JMP && opcode <= OP.JE
          || opcode === OP.JZ || opcode === OP.JNZ) {
      const target = this.readAddr24(addr + 1);
      steps.push({ BusTransfer: { source: { Immediate: target }, dest: 'IAR', value: target } });
    }

    // JMPR rA
    else if (opcode === OP.JMPR) {
      steps.push({ BusTransfer: { source: 'REGS', dest: 'IAR', value: preA } });
    }

    // CALL addr24
    else if (opcode === OP.CALL) {
      const target = this.readAddr24(addr + 1);
      steps.push({ BusTransfer: { source: 'SP', dest: 'MAR', value: this.sp } });
      steps.push({ BusTransfer: { source: 'IAR', dest: 'RAM', value: addr + 4 } });
      steps.push({ BusTransfer: { source: { Immediate: target }, dest: 'IAR', value: target } });
    }

    // RET
    else if (opcode === OP.RET) {
      steps.push({ BusTransfer: { source: 'SP', dest: 'MAR', value: this.sp - 4 } });
      steps.push({ BusTransfer: { source: 'RAM', dest: 'IAR', value: this.iar } });
    }

    // OUT rA
    else if (opcode === OP.OUT) {
      steps.push({ BusTransfer: { source: 'REGS', dest: 'RAM', value: preA & 0xFF } });
    }

    return {
      address: addr,
      opcode: opName,
      reg_a: `R${rA}`,
      reg_b: `R${rB}`,
      steps,
      flags,
      cycle: this.cycleCount,
      halted: this.halted,
      error: null,
    };
  }

  run(maxCycles: number): number {
    let executed = 0;
    const hasBp = this.breakpoints.size > 0;

    for (let c = 0; c < maxCycles; c++) {
      if (this.halted || this.inputWaiting) break;
      if (executed > 0 && hasBp && this.breakpoints.has(this.iar)) break;

      const addr = this.iar & MEM_MASK;
      const opcode = this.mem[addr];
      const regByte = this.mem[(addr + 1) & MEM_MASK];
      const rA = (regByte >> 4) & 0x0F;
      const rB = regByte & 0x0F;

      // HALT
      if (opcode === OP.HALT) {
        this.halted = true;
        break;
      }

      // Instruction size
      const size = instrSize(opcode);
      this.iar = (this.iar + size) & MEM_MASK;

      // ── ALU operations ──
      if ((opcode >= OP.ADD && opcode <= OP.SHR8) || opcode === OP.SHL8
          || opcode === OP.SHRN || opcode === OP.SHLN
          || opcode === OP.IDIV || opcode === OP.IMOD
          || opcode === OP.FPMUL) {
        const a = this.r[rA] >>> 0;
        const b = this.r[rB] >>> 0;
        let result = 0;
        let carry = false;

        switch (opcode) {
          case OP.ADD: {
            const s = a + b;
            result = s >>> 0;
            carry = s > 0xFFFFFFFF;
            break;
          }
          case OP.SUB: {
            result = (a - b) >>> 0;
            carry = a < b;
            break;
          }
          case OP.MUL: {
            // 32×32 → low 32 bits
            // Use BigInt for exact 64-bit product
            const prod = BigInt(a) * BigInt(b);
            result = Number(prod & 0xFFFFFFFFn) >>> 0;
            carry = prod > 0xFFFFFFFFn;
            break;
          }
          case OP.MULH: {
            // 32×32 → high 32 bits
            const prod = BigInt(a) * BigInt(b);
            result = Number((prod >> 32n) & 0xFFFFFFFFn) >>> 0;
            break;
          }
          case OP.DIV: {
            result = b === 0 ? 0 : (a / b) >>> 0;
            break;
          }
          case OP.MOD: {
            result = b === 0 ? 0 : (a % b) >>> 0;
            break;
          }
          case OP.IDIV: {
            const sa = a | 0;  // interpret as signed i32
            const sb = b | 0;
            result = sb === 0 ? 0 : ((sa / sb) | 0) >>> 0;
            break;
          }
          case OP.IMOD: {
            const sa = a | 0;
            const sb = b | 0;
            result = sb === 0 ? 0 : ((sa % sb) | 0) >>> 0;
            break;
          }
          case OP.SHR: {
            result = a >>> 1;
            carry = (a & 1) !== 0;
            break;
          }
          case OP.SHL: {
            const s = a * 2;  // avoid issues with JS signed shift
            result = s >>> 0;
            carry = s > 0xFFFFFFFF;
            break;
          }
          case OP.NOT: {
            result = (~a) >>> 0;
            break;
          }
          case OP.AND: { result = (a & b) >>> 0; break; }
          case OP.OR:  { result = (a | b) >>> 0; break; }
          case OP.XOR: { result = (a ^ b) >>> 0; break; }
          case OP.CMP: { result = a; break; }
          case OP.MOV: { result = b; break; }
          case OP.SHR8: {
            result = a >>> 8;
            carry = (a & 0x80) !== 0;
            break;
          }
          case OP.SHL8: {
            result = (a << 8) >>> 0;
            carry = (a & 0x00800000) !== 0;
            break;
          }
          case OP.SHRN: {
            const shift = b & 31;
            result = a >>> shift;
            carry = shift > 0 ? ((a >>> (shift - 1)) & 1) !== 0 : false;
            break;
          }
          case OP.SHLN: {
            const shift = b & 31;
            const s = BigInt(a) << BigInt(shift);
            result = Number(s & 0xFFFFFFFFn) >>> 0;
            carry = s > 0xFFFFFFFFn;
            break;
          }
          case OP.FPMUL: {
            // Signed 8.8 fixed-point multiply: rA = (rA * rB) >> 8
            const sa = a | 0;  // interpret as signed i32
            const sb = b | 0;
            const prod = BigInt(sa) * BigInt(sb);  // signed 64-bit product
            result = (Number((prod >> 8n) & 0xFFFFFFFFn)) >>> 0;
            break;
          }
        }

        this.carry = carry;
        this.aLarger = a > b;
        this.equal = a === b;
        this.zero = result === 0;

        if (opcode !== OP.CMP) {
          this.r[rA] = result >>> 0;
        }
      }

      // ── LOAD rA, [addr24] — load 1 byte, zero-extend ──
      else if (opcode === OP.LOAD) {
        const mAddr = this.readAddr24(addr + 2);
        this.r[rA] = this.read8(mAddr);
      }

      // ── STORE rA, [addr24] — store low byte ──
      else if (opcode === OP.STORE) {
        const mAddr = this.readAddr24(addr + 2);
        this.write8(mAddr, this.r[rA] & 0xFF);
        if (mAddr === VSYNC_ADDR && executed > 0 && !this.skipVsync) {
          this.pageFlip();
          this.cycleCount++;
          executed++;
          break;
        }
      }

      // ── LOAD32 rA, [addr24] — load 4 bytes LE ──
      else if (opcode === OP.LOAD32) {
        const mAddr = this.readAddr24(addr + 2);
        this.r[rA] = this.read32(mAddr) >>> 0;
      }

      // ── STORE32 rA, [addr24] — store 4 bytes LE ──
      else if (opcode === OP.STORE32) {
        const mAddr = this.readAddr24(addr + 2);
        this.write32(mAddr, this.r[rA]);
        if (mAddr <= VSYNC_ADDR && mAddr + 3 >= VSYNC_ADDR
            && executed > 0 && !this.skipVsync) {
          this.pageFlip();
          this.cycleCount++;
          executed++;
          break;
        }
      }

      // ── DATA rA, imm32 — 6-byte instruction ──
      else if (opcode === OP.DATA) {
        this.r[rA] = (
          this.mem[(addr + 2) & MEM_MASK]
          | (this.mem[(addr + 3) & MEM_MASK] << 8)
          | (this.mem[(addr + 4) & MEM_MASK] << 16)
          | (this.mem[(addr + 5) & MEM_MASK] << 24)
        ) >>> 0;
      }

      // ── LDRI rA, rB — load 1 byte from [rB] ──
      else if (opcode === OP.LDRI) {
        this.r[rA] = this.read8(this.r[rB]);
      }

      // ── STRI rA, rB — store low byte to [rB] ──
      else if (opcode === OP.STRI) {
        const mAddr = this.r[rB];
        this.write8(mAddr, this.r[rA] & 0xFF);
        if (mAddr === VSYNC_ADDR && executed > 0 && !this.skipVsync) {
          this.pageFlip();
          this.cycleCount++;
          executed++;
          break;
        }
      }

      // ── LDRI32 rA, rB — load 32-bit word from [rB] ──
      else if (opcode === OP.LDRI32) {
        this.r[rA] = this.read32(this.r[rB]) >>> 0;
      }

      // ── STRI32 rA, rB — store 32-bit word to [rB] ──
      else if (opcode === OP.STRI32) {
        const mAddr = this.r[rB];
        this.write32(mAddr, this.r[rA]);
        if (mAddr <= VSYNC_ADDR && mAddr + 3 >= VSYNC_ADDR
            && executed > 0 && !this.skipVsync) {
          this.pageFlip();
          this.cycleCount++;
          executed++;
          break;
        }
      }

      // ── PUSH rA — push 32-bit value (SP -= 4) ──
      else if (opcode === OP.PUSH) {
        this.sp = (this.sp - 4) & MEM_MASK;
        this.write32(this.sp, this.r[rA]);
      }

      // ── POP rA — pop 32-bit value (SP += 4) ──
      else if (opcode === OP.POP) {
        this.r[rA] = this.read32(this.sp) >>> 0;
        this.sp = (this.sp + 4) & MEM_MASK;
      }

      // ── JMP addr24 ──
      else if (opcode === OP.JMP) {
        this.iar = this.readAddr24(addr + 1);
      }

      // ── JC addr24 ──
      else if (opcode === OP.JC) {
        const target = this.readAddr24(addr + 1);
        if (this.carry) this.iar = target;
      }

      // ── JA addr24 ──
      else if (opcode === OP.JA) {
        const target = this.readAddr24(addr + 1);
        if (this.aLarger) this.iar = target;
      }

      // ── JE addr24 ──
      else if (opcode === OP.JE) {
        const target = this.readAddr24(addr + 1);
        if (this.equal) this.iar = target;
      }

      // ── JZ addr24 ──
      else if (opcode === OP.JZ) {
        const target = this.readAddr24(addr + 1);
        if (this.zero) this.iar = target;
      }

      // ── JNZ addr24 ──
      else if (opcode === OP.JNZ) {
        const target = this.readAddr24(addr + 1);
        if (!this.zero) this.iar = target;
      }

      // ── JMPR rA ──
      else if (opcode === OP.JMPR) {
        this.iar = this.r[rA];
      }

      // ── CALL addr24 ──
      else if (opcode === OP.CALL) {
        const target = this.readAddr24(addr + 1);
        const retAddr = this.iar;
        this.sp = (this.sp - 4) & MEM_MASK;
        this.write32(this.sp, retAddr);
        this.iar = target;
      }

      // ── RET ──
      else if (opcode === OP.RET) {
        this.iar = this.read32(this.sp) >>> 0;
        this.sp = (this.sp + 4) & MEM_MASK;
      }

      // ── OUT rA ──
      else if (opcode === OP.OUT) {
        this.consoleBuffer.push(this.r[rA] & 0xFF);
      }

      // ── IN rA ──
      else if (opcode === OP.IN) {
        this.inputWaiting = true;
        this.inputRegister = rA;
        this.iar = (this.iar - size) & MEM_MASK; // rewind
        break;
      }

      this.cycleCount++;
      executed++;
    }

    return executed;
  }

  getState(): CpuState {
    return {
      r: Array.from(this.r),
      acc: 0,
      tmp: 0,
      iar: this.iar,
      ir: this.mem[this.iar & MEM_MASK],
      sp: this.sp,
      flags: this.getFlags(),
      bus: 0,
      halted: this.halted,
      cycle_count: this.cycleCount,
    };
  }

  getMemory(start: number, len: number): number[] {
    const result: number[] = [];
    for (let i = 0; i < len; i++) {
      result.push(this.mem[(start + i) & MEM_MASK]);
    }
    return result;
  }

  getAllMemory(): Uint8Array {
    return new Uint8Array(this.mem);
  }

  getRawMemory(): number[] {
    return this.mem as unknown as number[];
  }

  reset(): void {
    this.r.fill(0);
    this.iar = 0;
    this.sp = INIT_SP;
    this.cycleCount = 0;
    this.carry = false;
    this.aLarger = false;
    this.equal = false;
    this.zero = true;
    this.halted = false;
    this.inputWaiting = false;
    this.consoleBuffer = [];
  }

  hardReset(): void {
    this.reset();
    this.mem.fill(0);
    // Re-initialize default palette
    const pal = buildDefaultPalette();
    for (let i = 0; i < 1024; i++) {
      this.mem[PALETTE_BASE + i] = pal[i];
    }
  }

  addBreakpoint(addr: number): void { this.breakpoints.add(addr); }
  removeBreakpoint(addr: number): void { this.breakpoints.delete(addr); }
  getBreakpoints(): Set<number> { return new Set(this.breakpoints); }

  isHalted(): boolean { return this.halted; }
  isWaitingForInput(): boolean { return this.inputWaiting; }

  getInputRequest(): { register: number } | null {
    if (!this.inputWaiting) return null;
    return { register: this.inputRegister };
  }

  provideInput(value: number): void {
    if (this.inputWaiting) {
      this.r[this.inputRegister] = value >>> 0;
      this.inputWaiting = false;
      this.iar = (this.iar + 2) & MEM_MASK; // advance past IN
      this.cycleCount++;
    }
  }

  getPc(): number { return this.iar; }
  getCycleCount(): number { return this.cycleCount; }
  getRegister(index: number): number { return this.r[index & 0x0F]; }

  poke(address: number, value: number): void {
    this.mem[address & MEM_MASK] = value & 0xFF;
  }

  getConsoleOutput(): number[] { return [...this.consoleBuffer]; }
  clearConsole(): void { this.consoleBuffer = []; }
  echoToConsole(text: string): void {
    for (let i = 0; i < text.length; i++) {
      this.consoleBuffer.push(text.charCodeAt(i));
    }
  }

  getSnapshot(): Snapshot {
    return {
      state: this.getState(),
      memory: new Uint8Array(this.mem),
      console: [...this.consoleBuffer],
    };
  }

  restoreSnapshot(snap: Snapshot): void {
    // Restore memory
    this.mem.set(snap.memory);
    // Restore CPU state
    for (let i = 0; i < 16; i++) {
      this.r[i] = snap.state.r[i] ?? 0;
    }
    this.iar = snap.state.iar;
    this.sp = snap.state.sp;
    this.cycleCount = snap.state.cycle_count;
    this.halted = snap.state.halted;
    this.carry = snap.state.flags.carry;
    this.aLarger = snap.state.flags.a_larger;
    this.equal = snap.state.flags.equal;
    this.zero = snap.state.flags.zero;
    this.consoleBuffer = [...snap.console];
    this.inputWaiting = false;
  }

  setSkipVsync(skip: boolean): void { this.skipVsync = skip; }

  // ── Private helpers ────────────────────────────────────────────────────

  private getFlags(): CpuFlags {
    return {
      carry: this.carry,
      a_larger: this.aLarger,
      equal: this.equal,
      zero: this.zero,
    };
  }
}

// ── Factory — createComputer() ───────────────────────────────────────────

export async function createComputer(preferredEngine?: EngineType): Promise<{
  computer: IComputer;
  engine: EngineType;
  wasmAvailable: boolean;
}> {
  // Try WASM if preferred or no preference
  if (preferredEngine !== 'js') {
    try {
      const { tryCreateWasmComputer } = await import('./wasm-cpu');
      const wasm = await tryCreateWasmComputer();
      if (wasm) {
        return { computer: wasm, engine: 'wasm', wasmAvailable: true };
      }
    } catch (e) {
      console.warn('WASM engine not available:', e);
    }
  }

  // Fall back to JavaScript engine
  console.log('🟢 GateStack JavaScript engine loaded');
  return {
    computer: new MockComputer(),
    engine: 'js',
    wasmAvailable: false,
  };
}
