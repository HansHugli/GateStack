// ============================================================================
// wasm-bridge.ts — GateStack v2.0 JS Engine + Shared Interfaces
// ============================================================================
// This is the central module that defines:
//   - OP constants (opcode values matching core/src/lib.rs)
//   - instrSize() — instruction length lookup
//   - IComputer interface — the contract both JS and WASM engines implement
//   - CpuState, CycleTrace, MicroStep — shared state types
//   - buildStepTrace() — the step() trace both engines return
//   - MockComputer — pure JavaScript CPU implementation (default engine)
//   - createComputer() — factory that tries WASM first, falls back to JS
//   - getOpcodeName() — opcode → mnemonic lookup
//
// MockComputer and the Rust core (core/src/lib.rs) implement the same machine;
// src/engines.test.ts runs both in lockstep. Change both together.
//
// v2.0 changes from v1.0:
//   - 32-bit registers (u32), 4MB RAM, 22-bit address space
//   - 24-bit addresses in instructions, 32-bit immediates in DATA
//   - New opcodes: SHRN, SHLN, JZ, JNZ, LOAD32, STORE32, LDRI32, STRI32, IDIV, IMOD,
//     FPMUL (8.8), FPMUL16 (16.16)
//   - Programmable palette at 0x3E0000 (256 × 4 bytes), updated on vsync
//   - Instruction sizes: DATA=6, LOAD/STORE/LOAD32/STORE32=5, jumps=4, rest=2
//   - Faults: an undefined opcode, or a 32-bit access running past 0x3FFFFF,
//     halts the CPU with a message (getFault()).
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

/** Every opcode above this one is undefined and faults. */
const LAST_OPCODE = OP.FPMUL16;

// ── Instruction size lookup ──────────────────────────────────────────────

export function instrSize(opcode: number): number {
  switch (opcode) {
    case OP.DATA:                                              return 6; // opcode + reg + imm32
    case OP.LOAD: case OP.STORE:                               return 5; // opcode + reg + addr24
    case OP.LOAD32: case OP.STORE32:                           return 5; // opcode + reg + addr24
    case OP.JMP: case OP.JC: case OP.JA: case OP.JE:          return 4; // opcode + addr24
    case OP.JZ: case OP.JNZ: case OP.CALL:                    return 4;
    default:                                                   return 2; // opcode + reg byte (FPMUL16 too)
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

/** True for the opcodes that go through the ALU (and show ALU micro-steps). */
export function isAluOpcode(opcode: number): boolean {
  return (opcode >= OP.ADD && opcode <= OP.SHR8) || opcode === OP.SHL8
      || opcode === OP.SHRN || opcode === OP.SHLN
      || opcode === OP.IDIV || opcode === OP.IMOD
      || opcode === OP.FPMUL || opcode === OP.FPMUL16;
}

// ── Memory map constants ─────────────────────────────────────────────────

const MEM_SIZE    = 4_194_304;  // 4MB
const MEM_MASK    = 0x3FFFFF;   // 22-bit address mask
const LAST_WORD_ADDR = MEM_SIZE - 4; // highest start of a 32-bit access (0x3FFFFC)
const PALETTE_BASE = 0x3E0000;  // 256 × 4 bytes = 1024 bytes
const BACK_BUFFER  = 0x3C0000;  // Back buffer (draw target) 64KB
const FRONT_BUFFER = 0x3D0000;  // Front buffer (display) 64KB
const VIDEO_BASE   = 0x3D0000;  // Alias for front buffer
const VSYNC_ADDR   = 0x3FFFFF;  // triggers page flip
const INIT_SP      = 0x3BFFFF;  // top of program/data/stack (below back buffer)

// ── Fault messages (identical in core/src/lib.rs) ────────────────────────

const hex = (n: number, digits: number) => (n >>> 0).toString(16).toUpperCase().padStart(digits, '0');

export function illegalOpcodeMessage(opcode: number, addr: number): string {
  return `Illegal opcode 0x${hex(opcode, 2)} at 0x${hex(addr, 6)}`;
}

export function wordPastEndMessage(addr: number): string {
  return `32-bit access at 0x${hex(addr, 6)} runs past the end of RAM (0x3FFFFF)`;
}

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
  iar: number;          // 22-bit instruction address register
  ir: number;           // 8-bit current opcode
  sp: number;           // 22-bit stack pointer
  flags: CpuFlags;
  bus: number;          // not used in v2 but kept for UI compatibility
  halted: boolean;
  cycle_count: number;  // never wraps at 2^32 (exact up to 2^53)
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
  error: string | null;   // the fault message when this step faulted
}

export type EngineType = 'js' | 'wasm';

// ── Snapshot for undo ────────────────────────────────────────────────────

export interface Snapshot {
  state: CpuState;
  memory: Uint8Array;   // Efficient binary copy (not number[])
  console: number[];
  // Added 2026-10: optional so older snapshots still restore (defaults: not
  // waiting, no fault, no pending breakpoint resume).
  inputWaiting?: boolean;
  inputRegister?: number;
  fault?: string | null;
  /** Breakpoint address the next run() executes instead of stopping at. */
  breakpointResume?: number | null;
}

// ── IComputer interface ──────────────────────────────────────────────────

export interface IComputer {
  loadProgram(bytes: Uint8Array): void;
  /** Executes exactly one instruction, even when a breakpoint sits on it. */
  step(): CycleTrace;
  /**
   * Executes up to maxCycles instructions. Stops on HALT, a fault, IN, a
   * breakpoint (including one on the first instruction: the next run() then
   * executes it), or after a vsync STORE.
   */
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

  /** The fault that halted the CPU (e.g. "Illegal opcode 0x2D at 0x000140"), or null. */
  getFault(): string | null;

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

  /** Releases the engine's resources (WASM: frees the CPU). Don't use it afterwards. */
  dispose(): void;
}

// ── Default 256-color palette ────────────────────────────────────────────
// First 16: v1.0 compatible, remaining 240: HSV rainbow gradient
// Stored as flat array: [R0,G0,B0,_,R1,G1,B1,_,...] (1024 bytes)
// Rounded with Math.round, like core/src/lib.rs (.round()); no channel lies
// near .5, so both engines produce the same bytes (engines.test.ts checks).

export function buildDefaultPalette(): number[] {
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

// ── step() trace (shared by both engines) ────────────────────────────────

/** What buildStepTrace needs to know about the CPU after the instruction ran. */
export interface TraceProbe {
  readAddr24(offset: number): number;
  getRegister(index: number): number;
  getSp(): number;
  getPc(): number;
  getFlags(): CpuFlags;
  getCycleCount(): number;
  isHalted(): boolean;
}

/**
 * Builds the micro-step trace of one executed instruction. `addr`, `opcode`,
 * `rA`, `rB`, `preA` and `preB` are read before it ran; `probe` reads the CPU
 * after. `fault` is set when the instruction faulted (it did not execute).
 */
export function buildStepTrace(
  addr: number, opcode: number, rA: number, rB: number, preA: number, preB: number,
  probe: TraceProbe, fault: string | null,
): CycleTrace {
  const opName = getOpcodeName(opcode);
  const steps: MicroStep[] = [
    { FetchInstruction: { address: addr, value: opcode } },
    // Fetch cycle: IAR → MAR → RAM → IR
    { BusTransfer: { source: 'IAR', dest: 'MAR', value: addr } },
    { BusTransfer: { source: 'RAM', dest: 'IR', value: opcode } },
  ];

  const postA = probe.getRegister(rA) >>> 0;
  const flags = probe.getFlags();
  const sp = probe.getSp();

  if (fault) {
    // nothing executed
  }

  // ALU operations
  else if (isAluOpcode(opcode)) {
    // Bus: REGS → TMP (rA), REGS → ACC (rB)
    steps.push({ BusTransfer: { source: 'REGS', dest: 'TMP', value: preA } });
    steps.push({ BusTransfer: { source: 'REGS', dest: 'ACC', value: preB } });
    steps.push({
      AluOperation: {
        op: opName,
        input_a: preA,
        input_b: preB,
        result: {
          // CMP stores nothing: show the difference its flags come from
          value: opcode === OP.CMP ? ((preA - preB) >>> 0) : postA,
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
    steps.push({ BusTransfer: { source: { Immediate: postA }, dest: 'REGS', value: postA } });
  }

  // LOAD / LOAD32 rA, [addr24]
  else if (opcode === OP.LOAD || opcode === OP.LOAD32) {
    const mAddr = probe.readAddr24(addr + 2);
    steps.push({ BusTransfer: { source: { Immediate: mAddr }, dest: 'MAR', value: mAddr } });
    steps.push({ BusTransfer: { source: 'RAM', dest: 'REGS', value: postA } });
  }

  // STORE (the byte) / STORE32 (the word) rA, [addr24]
  else if (opcode === OP.STORE || opcode === OP.STORE32) {
    const mAddr = probe.readAddr24(addr + 2);
    steps.push({ BusTransfer: { source: { Immediate: mAddr }, dest: 'MAR', value: mAddr } });
    steps.push({ BusTransfer: { source: 'REGS', dest: 'RAM', value: opcode === OP.STORE ? preA & 0xFF : preA } });
  }

  // LDRI / LDRI32 rA, rB
  else if (opcode === OP.LDRI || opcode === OP.LDRI32) {
    steps.push({ BusTransfer: { source: 'REGS', dest: 'MAR', value: preB } });
    steps.push({ BusTransfer: { source: 'RAM', dest: 'REGS', value: postA } });
  }

  // STRI (the byte) / STRI32 (the word) rA, rB
  else if (opcode === OP.STRI || opcode === OP.STRI32) {
    steps.push({ BusTransfer: { source: 'REGS', dest: 'MAR', value: preB } });
    steps.push({ BusTransfer: { source: 'REGS', dest: 'RAM', value: opcode === OP.STRI ? preA & 0xFF : preA } });
  }

  // PUSH rA
  else if (opcode === OP.PUSH) {
    steps.push({ BusTransfer: { source: 'SP', dest: 'MAR', value: sp } });
    steps.push({ BusTransfer: { source: 'REGS', dest: 'RAM', value: preA } });
  }

  // POP rA
  else if (opcode === OP.POP) {
    steps.push({ BusTransfer: { source: 'SP', dest: 'MAR', value: (sp - 4) & MEM_MASK } });
    steps.push({ BusTransfer: { source: 'RAM', dest: 'REGS', value: postA } });
  }

  // JMP/JC/JA/JE/JZ/JNZ
  else if ((opcode >= OP.JMP && opcode <= OP.JE) || opcode === OP.JZ || opcode === OP.JNZ) {
    const target = probe.readAddr24(addr + 1) & MEM_MASK;
    steps.push({ BusTransfer: { source: { Immediate: target }, dest: 'IAR', value: target } });
  }

  // JMPR rA
  else if (opcode === OP.JMPR) {
    steps.push({ BusTransfer: { source: 'REGS', dest: 'IAR', value: preA & MEM_MASK } });
  }

  // CALL addr24
  else if (opcode === OP.CALL) {
    const target = probe.readAddr24(addr + 1) & MEM_MASK;
    steps.push({ BusTransfer: { source: 'SP', dest: 'MAR', value: sp } });
    steps.push({ BusTransfer: { source: 'IAR', dest: 'RAM', value: (addr + 4) & MEM_MASK } });
    steps.push({ BusTransfer: { source: { Immediate: target }, dest: 'IAR', value: target } });
  }

  // RET
  else if (opcode === OP.RET) {
    steps.push({ BusTransfer: { source: 'SP', dest: 'MAR', value: (sp - 4) & MEM_MASK } });
    steps.push({ BusTransfer: { source: 'RAM', dest: 'IAR', value: probe.getPc() } });
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
    cycle: probe.getCycleCount(),
    halted: probe.isHalted(),
    error: fault,
  };
}

// ── MockComputer — Pure JavaScript CPU engine ────────────────────────────

export class MockComputer implements IComputer {
  private mem: Uint8Array;
  private r: Uint32Array;         // 16 × 32-bit registers
  private iar: number = 0;        // always masked to 22 bits
  private sp: number = INIT_SP;   // always masked to 22 bits
  private cycleCount: number = 0; // a double: exact up to 2^53, never wraps

  // Flags
  private carry = false;
  private aLarger = false;
  private equal = false;
  private zero = true;

  // State
  private halted = false;
  private inputWaiting = false;
  private inputRegister = 0;
  private fault: string | null = null;

  // Console
  private consoleBuffer: number[] = [];

  // Breakpoints
  private breakpoints = new Set<number>();
  /** The breakpoint the last run() stopped at; the next run() starting there executes it. */
  private bpResume: number | null = null;

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

  /** 32-bit read; each byte address wraps (PUSH/POP/RET use it at any SP). */
  private read32(addr: number): number {
    const a = addr & MEM_MASK;
    return (this.mem[a]
         | (this.mem[(a + 1) & MEM_MASK] << 8)
         | (this.mem[(a + 2) & MEM_MASK] << 16)
         | (this.mem[(a + 3) & MEM_MASK] << 24)) >>> 0;
  }

  private write32(addr: number, val: number): void {
    const a = addr & MEM_MASK;
    this.mem[a]                  = val & 0xFF;
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
        error: this.fault,
      };
    }

    const addr = this.iar & MEM_MASK;
    const opcode = this.mem[addr];
    const regByte = this.mem[(addr + 1) & MEM_MASK];
    const rA = (regByte >> 4) & 0x0F;
    const rB = regByte & 0x0F;

    // Capture pre-execution state for trace generation
    const preA = this.r[rA] >>> 0;
    const preB = this.r[rB] >>> 0;

    // Execute one instruction, even on a breakpoint
    this.bpResume = addr;
    this.run(1);

    return buildStepTrace(addr, opcode, rA, rB, preA, preB, {
      readAddr24: (o) => this.readAddr24(o),
      getRegister: (i) => this.r[i],
      getSp: () => this.sp,
      getPc: () => this.iar,
      getFlags: () => this.getFlags(),
      getCycleCount: () => this.cycleCount,
      isHalted: () => this.halted,
    }, this.fault);
  }

  run(maxCycles: number): number {
    let executed = 0;
    const hasBp = this.breakpoints.size > 0;
    let skipBp = this.bpResume === this.iar;
    this.bpResume = null;

    for (let c = 0; c < maxCycles; c++) {
      if (this.halted || this.inputWaiting) break;
      if (hasBp && !skipBp && this.breakpoints.has(this.iar)) {
        this.bpResume = this.iar;
        break;
      }
      skipBp = false;

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

      // Undefined opcode: fault, IAR stays on it
      if (opcode > LAST_OPCODE) {
        this.fault = illegalOpcodeMessage(opcode, addr);
        this.halted = true;
        break;
      }

      // Instruction size
      const size = instrSize(opcode);
      this.iar = (this.iar + size) & MEM_MASK;

      // ── ALU operations ──
      if (isAluOpcode(opcode)) {
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
          case OP.CMP: {
            // Flags as for rA − rB; nothing is stored
            result = (a - b) >>> 0;
            carry = a < b;
            break;
          }
          case OP.MOV: { result = b; break; }
          case OP.SHR8: {
            result = a >>> 8;
            carry = (a & 0x80) !== 0;
            break;
          }
          case OP.SHL8: {
            result = (a << 8) >>> 0;
            carry = (a >>> 24) !== 0;  // any of the 8 bits shifted out
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
            const prod = BigInt(a | 0) * BigInt(b | 0);  // signed 64-bit product
            result = Number((prod >> 8n) & 0xFFFFFFFFn) >>> 0;
            break;
          }
          case OP.FPMUL16: {
            // Signed 16.16 fixed-point multiply: rA = (rA * rB) >> 16
            const prod = BigInt(a | 0) * BigInt(b | 0);
            result = Number((prod >> 16n) & 0xFFFFFFFFn) >>> 0;
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
        this.r[rA] = this.read8(this.readAddr24(addr + 2));
      }

      // ── STORE rA, [addr24] — store low byte ──
      else if (opcode === OP.STORE) {
        const m = this.readAddr24(addr + 2) & MEM_MASK;
        this.write8(m, this.r[rA]);
        if (m === VSYNC_ADDR && !this.skipVsync) {
          this.pageFlip();
          this.cycleCount++;
          executed++;
          break;
        }
      }

      // ── LOAD32 rA, [addr24] — load 4 bytes LE ──
      else if (opcode === OP.LOAD32) {
        const m = this.readAddr24(addr + 2) & MEM_MASK;
        if (m > LAST_WORD_ADDR) { this.wordFault(m, addr); break; }
        this.r[rA] = this.read32(m);
      }

      // ── STORE32 rA, [addr24] — store 4 bytes LE ──
      else if (opcode === OP.STORE32) {
        const m = this.readAddr24(addr + 2) & MEM_MASK;
        if (m > LAST_WORD_ADDR) { this.wordFault(m, addr); break; }
        this.write32(m, this.r[rA]);
        // The only word that covers 0x3FFFFF starts at 0x3FFFFC
        if (m === LAST_WORD_ADDR && !this.skipVsync) {
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
        const m = this.r[rB] & MEM_MASK;
        this.write8(m, this.r[rA]);
        if (m === VSYNC_ADDR && !this.skipVsync) {
          this.pageFlip();
          this.cycleCount++;
          executed++;
          break;
        }
      }

      // ── LDRI32 rA, rB — load 32-bit word from [rB] ──
      else if (opcode === OP.LDRI32) {
        const m = this.r[rB] & MEM_MASK;
        if (m > LAST_WORD_ADDR) { this.wordFault(m, addr); break; }
        this.r[rA] = this.read32(m);
      }

      // ── STRI32 rA, rB — store 32-bit word to [rB] ──
      else if (opcode === OP.STRI32) {
        const m = this.r[rB] & MEM_MASK;
        if (m > LAST_WORD_ADDR) { this.wordFault(m, addr); break; }
        this.write32(m, this.r[rA]);
        if (m === LAST_WORD_ADDR && !this.skipVsync) {
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
        this.r[rA] = this.read32(this.sp);
        this.sp = (this.sp + 4) & MEM_MASK;
      }

      // ── JMP addr24 ──
      else if (opcode === OP.JMP) {
        this.iar = this.readAddr24(addr + 1) & MEM_MASK;
      }

      // ── JC addr24 ──
      else if (opcode === OP.JC) {
        if (this.carry) this.iar = this.readAddr24(addr + 1) & MEM_MASK;
      }

      // ── JA addr24 ──
      else if (opcode === OP.JA) {
        if (this.aLarger) this.iar = this.readAddr24(addr + 1) & MEM_MASK;
      }

      // ── JE addr24 ──
      else if (opcode === OP.JE) {
        if (this.equal) this.iar = this.readAddr24(addr + 1) & MEM_MASK;
      }

      // ── JZ addr24 ──
      else if (opcode === OP.JZ) {
        if (this.zero) this.iar = this.readAddr24(addr + 1) & MEM_MASK;
      }

      // ── JNZ addr24 ──
      else if (opcode === OP.JNZ) {
        if (!this.zero) this.iar = this.readAddr24(addr + 1) & MEM_MASK;
      }

      // ── JMPR rA ──
      else if (opcode === OP.JMPR) {
        this.iar = this.r[rA] & MEM_MASK;
      }

      // ── CALL addr24 ──
      else if (opcode === OP.CALL) {
        const target = this.readAddr24(addr + 1) & MEM_MASK;
        const retAddr = this.iar;
        this.sp = (this.sp - 4) & MEM_MASK;
        this.write32(this.sp, retAddr);
        this.iar = target;
      }

      // ── RET ──
      else if (opcode === OP.RET) {
        this.iar = this.read32(this.sp) & MEM_MASK;
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
        this.iar = addr; // rewind: provideInput() moves past it
        break;
      }

      this.cycleCount++;
      executed++;
    }

    return executed;
  }

  /** A 32-bit access at `m` would run past 0x3FFFFF: halt, IAR back on the instruction. */
  private wordFault(m: number, addr: number): void {
    this.fault = wordPastEndMessage(m);
    this.halted = true;
    this.iar = addr;
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
    this.inputRegister = 0;
    this.fault = null;
    this.bpResume = null;
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

  getFault(): string | null { return this.fault; }

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
      inputWaiting: this.inputWaiting,
      inputRegister: this.inputRegister,
      fault: this.fault,
      breakpointResume: this.bpResume,
    };
  }

  restoreSnapshot(snap: Snapshot): void {
    // Restore memory
    this.mem.set(snap.memory);
    // Restore CPU state
    for (let i = 0; i < 16; i++) {
      this.r[i] = snap.state.r[i] ?? 0;
    }
    this.iar = snap.state.iar & MEM_MASK;
    this.sp = snap.state.sp & MEM_MASK;
    this.cycleCount = snap.state.cycle_count;
    this.halted = snap.state.halted;
    this.carry = snap.state.flags.carry;
    this.aLarger = snap.state.flags.a_larger;
    this.equal = snap.state.flags.equal;
    this.zero = snap.state.flags.zero;
    this.consoleBuffer = [...snap.console];
    this.inputWaiting = snap.inputWaiting ?? false;
    this.inputRegister = (snap.inputRegister ?? 0) & 0x0F;
    this.fault = snap.fault ?? null;
    this.bpResume = snap.breakpointResume ?? null;
  }

  setSkipVsync(skip: boolean): void { this.skipVsync = skip; }

  dispose(): void { /* nothing to free: the GC owns the memory */ }

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
