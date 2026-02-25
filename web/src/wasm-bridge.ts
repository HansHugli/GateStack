// ============================================================================
// wasm-bridge.ts — GateStack 16-bit Computer Engine
// ============================================================================
// Full 16-bit architecture: 16-bit registers, 64KB RAM, 25 instructions.
// Includes SUB, MUL, DIV, MOD, PUSH, POP, CALL, RET.
// ============================================================================

// ── Type Definitions ────────────────────────────────────────────────────

export interface AluResult {
  value: number;
  carry: boolean;
  a_larger: boolean;
  equal: boolean;
  zero: boolean;
}

export interface Flags {
  carry: boolean;
  a_larger: boolean;
  equal: boolean;
  zero: boolean;
}

export type BusSource =
  | 'IAR' | 'RAM' | 'ALU' | 'ACC' | 'SP'
  | { Reg: string }
  | { Immediate: number };

export interface MicroStep {
  BusTransfer?: { source: BusSource; dest: string; value: number };
  IncrementIAR?: { new_value: number };
  AluOperation?: { op: string; input_a: number; input_b: number; result: AluResult };
  FetchOperand?: { value: number };
  Jump?: { target: number; taken: boolean };
  Error?: { message: string };
  ConsoleOutput?: { register: string; value: number };
  WaitingForInput?: { register: string };
  StackOp?: { op: string; sp: number; value: number };
}

export interface CycleTrace {
  address: number;
  opcode: string | null;
  reg_a: string | null;
  reg_b: string | null;
  steps: MicroStep[];
  flags: Flags | null;
  cycle: number;
  halted: boolean;
  error: string | null;
}

export interface CpuState {
  r: number[];
  acc: number;
  tmp: number;
  iar: number;
  ir: number;
  sp: number;
  flags: Flags;
  bus: number;
  halted: boolean;
  cycle_count: number;
}

// ── Computer Interface ──────────────────────────────────────────────────

export interface IComputer {
  loadProgram(bytes: Uint8Array): void;
  step(): CycleTrace;
  run(maxCycles: number): number;
  getState(): CpuState;
  getMemory(start: number, len: number): number[];
  getAllMemory(): number[];
  getRawMemory(): number[];
  reset(): void;
  hardReset(): void;
  addBreakpoint(addr: number): void;
  removeBreakpoint(addr: number): void;
  getBreakpoints(): Set<number>;
  isHalted(): boolean;
  getPc(): number;
  getCycleCount(): number;
  getRegister(index: number): number;
  poke(address: number, value: number): void;
  getConsoleOutput(): number[];
  clearConsole(): void;
  getSnapshot(): { state: CpuState; memory: number[]; console: number[] };
  restoreSnapshot(snap: { state: CpuState; memory: number[]; console: number[] }): void;
  isWaitingForInput(): boolean;
  getInputRequest(): { register: number } | null;
  provideInput(value: number): void;
  echoToConsole(text: string): void;
}

// ── Opcodes ─────────────────────────────────────────────────────────────

export const OP = {
  HALT: 0x00,
  ADD:  0x01, SUB:  0x02, MUL:  0x03, DIV:  0x04, MOD:  0x05,
  SHR:  0x06, SHL:  0x07, NOT:  0x08,
  AND:  0x09, OR:   0x0A, XOR:  0x0B, CMP:  0x0C,
  MULH: 0x0D,  // High 16 bits of 32-bit multiply
  MOV:  0x0E,  // Copy rB to rA
  SHR8: 0x0F,  // Shift right 8 bits (byte swap low)
  SHL8: 0x17,  // Shift left 8 bits (byte swap high)
  LOAD: 0x10, STORE:0x11, DATA: 0x12,
  PUSH: 0x13, POP:  0x14, LDRI: 0x15, STRI: 0x16,
  JMP:  0x18, JC:   0x19, JA:   0x1A, JE:   0x1B,
  JMPR: 0x1C, CALL: 0x1D, RET:  0x1E,
  OUT:  0x1F, IN:   0x20,
} as const;

const OP_NAMES: Record<number, string> = {};
for (const [name, code] of Object.entries(OP)) OP_NAMES[code] = name;

// Instruction sizes: how many total bytes each instruction uses
function instrSize(opcode: number): number {
  // 2-byte: ALU ops, PUSH, POP, RET, OUT, IN, JMPR, HALT
  // 3-byte: JMP, JC, JA, JE, CALL (opcode + 16-bit address)
  // 4-byte: LOAD, STORE, DATA (opcode + reg byte + 16-bit operand)
  switch (opcode) {
    case OP.LOAD: case OP.STORE: case OP.DATA: return 4;
    case OP.JMP: case OP.JC: case OP.JA: case OP.JE: case OP.CALL: return 3;
    default: return 2; // ALU ops, PUSH, POP, RET, OUT, IN, JMPR, HALT
  }
}

// ── Memory Size ─────────────────────────────────────────────────────────

const MEM_SIZE = 65536;
const MASK16 = 0xFFFF;

// ── Mock Computer (16-bit) ──────────────────────────────────────────────

class MockComputer implements IComputer {
  private state: CpuState = {
    r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    acc: 0, tmp: 0, iar: 0, ir: 0, sp: 0x7FFF,
    flags: { carry: false, a_larger: false, equal: false, zero: true },
    bus: 0, halted: false, cycle_count: 0,
  };
  private memory = new Uint8Array(MEM_SIZE);
  private breakpoints = new Set<number>();
  private consoleBuffer: number[] = [];
  private inputWaiting: { register: number; address: number } | null = null;

  // Read 16-bit little-endian from memory
  private read16(addr: number): number {
    const lo = this.memory[addr & MASK16];
    const hi = this.memory[(addr + 1) & MASK16];
    return (hi << 8) | lo;
  }

  // Write 16-bit little-endian to memory
  private write16(addr: number, val: number): void {
    this.memory[addr & MASK16] = val & 0xFF;
    this.memory[(addr + 1) & MASK16] = (val >> 8) & 0xFF;
  }

  loadProgram(bytes: Uint8Array): void {
    this.hardReset();
    const len = Math.min(bytes.length, MEM_SIZE);
    this.memory.set(bytes.slice(0, len));
  }

  step(): CycleTrace {
    // If waiting for input, don't execute
    if (this.inputWaiting) {
      return {
        address: this.state.iar, opcode: 'IN', reg_a: `R${this.inputWaiting.register}`, reg_b: null,
        steps: [{ WaitingForInput: { register: `R${this.inputWaiting.register}` } }],
        flags: { ...this.state.flags }, cycle: this.state.cycle_count,
        halted: false, error: null,
      };
    }

    if (this.state.halted) {
      return { address: this.state.iar, opcode: null, reg_a: null, reg_b: null,
               steps: [], flags: null, cycle: this.state.cycle_count, halted: true, error: null };
    }

    const addr = this.state.iar;
    const opcode = this.memory[addr];
    const regByte = this.memory[(addr + 1) & MASK16];
    const regA = (regByte >> 4) & 0x0F;
    const regB = regByte & 0x0F;

    // Clamp register indices to 0-3
    const rA = regA & 0x0F;
    const rB = regB & 0x0F;

    const opName = OP_NAMES[opcode] ?? '???';
    const size = instrSize(opcode);
    const steps: MicroStep[] = [];

    // HALT
    if (opcode === OP.HALT) {
      this.state.halted = true;
      return { address: addr, opcode: 'HALT', reg_a: null, reg_b: null,
               steps: [], flags: { ...this.state.flags }, cycle: this.state.cycle_count, halted: true, error: null };
    }

    // Fetch trace
    this.state.ir = opcode;
    steps.push({ BusTransfer: { source: 'IAR', dest: 'MAR', value: addr } });
    steps.push({ BusTransfer: { source: 'RAM', dest: 'IR', value: opcode } });

    // Advance IAR past instruction
    this.state.iar = (addr + size) & MASK16;
    steps.push({ IncrementIAR: { new_value: this.state.iar } });

    // ── ALU operations (opcode 0x01–0x0F, 0x17) ──────────────────────────
    if ((opcode >= OP.ADD && opcode <= OP.SHR8) || opcode === OP.SHL8) {
      const a = this.state.r[rA];
      const b = this.state.r[rB];
      let result = 0;
      let carry = false;

      switch (opcode) {
        case OP.ADD: { const s = a + b; result = s & MASK16; carry = s > MASK16; break; }
        case OP.SUB: { const s = a - b; result = s & MASK16; carry = s < 0; break; }
        case OP.MUL: { const s = a * b; result = s & MASK16; carry = s > MASK16; break; }
        case OP.MULH: { const s = a * b; result = (s >>> 16) & MASK16; carry = false; break; }
        case OP.DIV: { result = b === 0 ? 0 : Math.floor(a / b) & MASK16; break; }
        case OP.MOD: { result = b === 0 ? 0 : (a % b) & MASK16; break; }
        case OP.SHR: { result = a >>> 1; carry = (a & 1) !== 0; break; }
        case OP.SHL: { const s = a << 1; result = s & MASK16; carry = s > MASK16; break; }
        case OP.NOT: { result = (~a) & MASK16; break; }
        case OP.AND: { result = a & b; break; }
        case OP.OR:  { result = a | b; break; }
        case OP.XOR: { result = a ^ b; break; }
        case OP.CMP: { result = a; break; } // CMP doesn't store result
        case OP.MOV: { result = b; break; }
        case OP.SHR8: { result = (a >>> 8) & 0xFF; carry = (a & 0x80) !== 0; break; }
        case OP.SHL8: { result = (a << 8) & MASK16; carry = (a & 0x80) !== 0; break; }
      }

      const flags: Flags = { carry, a_larger: a > b, equal: a === b, zero: result === 0 };
      steps.push({ AluOperation: { op: opName, input_a: a, input_b: b,
        result: { value: result, ...flags } } });

      if (opcode !== OP.CMP) {
        this.state.r[rA] = result;
        this.state.acc = result;
      }
      this.state.flags = flags;
    }

    // ── LOAD rA, [addr16] ──────────────────────────────────────────────
    else if (opcode === OP.LOAD) {
      const memAddr = this.read16(addr + 2);
      const value = this.memory[memAddr & MASK16];
      this.state.r[rA] = value;
      steps.push({ FetchOperand: { value: memAddr } });
      steps.push({ BusTransfer: { source: 'RAM', dest: `R${rA}`, value } });
    }

    // ── STORE rA, [addr16] ─────────────────────────────────────────────
    else if (opcode === OP.STORE) {
      const memAddr = this.read16(addr + 2);
      this.memory[memAddr & MASK16] = this.state.r[rA] & 0xFF;
      steps.push({ FetchOperand: { value: memAddr } });
      steps.push({ BusTransfer: { source: { Reg: `R${rA}` }, dest: 'RAM', value: this.state.r[rA] } });
    }

    // ── DATA rA, imm16 ─────────────────────────────────────────────────
    else if (opcode === OP.DATA) {
      const value = this.read16(addr + 2);
      this.state.r[rA] = value;
      steps.push({ BusTransfer: { source: { Immediate: value }, dest: `R${rA}`, value } });
    }

    // ── LDRI rA, rB ── Load rA from address in rB ───────────────────────
    else if (opcode === OP.LDRI) {
      const memAddr = this.state.r[rB] & MASK16;
      const value = this.memory[memAddr];
      this.state.r[rA] = value;
      steps.push({ BusTransfer: { source: 'RAM', dest: `R${rA}`, value } });
    }

    // ── STRI rA, rB ── Store rA to address in rB ───────────────────────
    else if (opcode === OP.STRI) {
      const memAddr = this.state.r[rB] & MASK16;
      this.memory[memAddr] = this.state.r[rA] & 0xFF;
      steps.push({ BusTransfer: { source: { Reg: `R${rA}` }, dest: 'RAM', value: this.state.r[rA] } });
    }

    // ── PUSH rA ─────────────────────────────────────────────────────────
    else if (opcode === OP.PUSH) {
      const val = this.state.r[rA];
      // Push: write hi byte at SP, lo byte at SP-1, then SP -= 2
      this.write16(this.state.sp - 1, val);
      this.state.sp = (this.state.sp - 2) & MASK16;
      steps.push({ StackOp: { op: 'PUSH', sp: this.state.sp, value: val } });
    }

    // ── POP rA ──────────────────────────────────────────────────────────
    else if (opcode === OP.POP) {
      // Pop: SP += 2, read 16-bit value at SP-1
      this.state.sp = (this.state.sp + 2) & MASK16;
      const val = this.read16(this.state.sp - 1);
      this.state.r[rA] = val;
      steps.push({ StackOp: { op: 'POP', sp: this.state.sp, value: val } });
    }

    // ── JMP addr16 ──────────────────────────────────────────────────────
    else if (opcode === OP.JMP) {
      const target = this.read16(addr + 1);
      this.state.iar = target;
      steps.push({ Jump: { target, taken: true } });
    }

    // ── Conditional jumps ───────────────────────────────────────────────
    else if (opcode === OP.JC || opcode === OP.JA || opcode === OP.JE) {
      const target = this.read16(addr + 1);
      let taken = false;
      if (opcode === OP.JC) taken = this.state.flags.carry;
      else if (opcode === OP.JA) taken = this.state.flags.a_larger;
      else if (opcode === OP.JE) taken = this.state.flags.equal;
      if (taken) this.state.iar = target;
      steps.push({ Jump: { target, taken } });
    }

    // ── JMPR rA ─────────────────────────────────────────────────────────
    else if (opcode === OP.JMPR) {
      const target = this.state.r[rA];
      this.state.iar = target;
      steps.push({ Jump: { target, taken: true } });
    }

    // ── CALL addr16 ─────────────────────────────────────────────────────
    else if (opcode === OP.CALL) {
      const target = this.read16(addr + 1);
      // Push return address (already advanced past CALL)
      const retAddr = this.state.iar;
      this.write16(this.state.sp - 1, retAddr);
      this.state.sp = (this.state.sp - 2) & MASK16;
      this.state.iar = target;
      steps.push({ StackOp: { op: 'CALL', sp: this.state.sp, value: retAddr } });
      steps.push({ Jump: { target, taken: true } });
    }

    // ── RET ──────────────────────────────────────────────────────────────
    else if (opcode === OP.RET) {
      this.state.sp = (this.state.sp + 2) & MASK16;
      const retAddr = this.read16(this.state.sp - 1);
      this.state.iar = retAddr;
      steps.push({ StackOp: { op: 'RET', sp: this.state.sp, value: retAddr } });
      steps.push({ Jump: { target: retAddr, taken: true } });
    }

    // ── OUT rA ──────────────────────────────────────────────────────────
    else if (opcode === OP.OUT) {
      const value = this.state.r[rA] & 0xFF; // Output low byte
      this.consoleBuffer.push(value);
      steps.push({ ConsoleOutput: { register: `R${rA}`, value } });
    }

    // ── IN rA ───────────────────────────────────────────────────────────
    else if (opcode === OP.IN) {
      this.inputWaiting = { register: rA, address: addr };
      this.state.iar = addr; // rewind to re-execute after input
      steps.push({ WaitingForInput: { register: `R${rA}` } });
      return {
        address: addr, opcode: 'IN', reg_a: `R${rA}`, reg_b: null,
        steps, flags: { ...this.state.flags }, cycle: this.state.cycle_count,
        halted: false, error: null,
      };
    }

    this.state.cycle_count++;
    this.state.bus = this.state.r[rA] ?? 0;

    return {
      address: addr, opcode: opName, reg_a: `R${rA}`, reg_b: `R${rB}`,
      steps, flags: { ...this.state.flags }, cycle: this.state.cycle_count,
      halted: false, error: null,
    };
  }

  run(maxCycles: number): number {
    // ── Fast-path batch execution — zero trace allocation ──
    const mem = this.memory;
    const r = this.state.r;
    const bp = this.breakpoints;
    let iar = this.state.iar;
    let sp = this.state.sp;
    let fCarry = this.state.flags.carry;
    let fALarger = this.state.flags.a_larger;
    let fEqual = this.state.flags.equal;
    let fZero = this.state.flags.zero;
    let executed = 0;

    for (let i = 0; i < maxCycles; i++) {
      if (this.state.halted || this.inputWaiting) break;
      if (bp.size > 0 && bp.has(iar) && executed > 0) break;

      const addr = iar;
      const opcode = mem[addr];
      const regByte = mem[(addr + 1) & 0xFFFF];
      const rA = (regByte >> 4) & 0x0F;
      const rB = regByte & 0x0F;

      // HALT
      if (opcode === 0x00) { this.state.halted = true; break; }

      // Compute instruction size
      let size: number;
      if (opcode === 0x10 || opcode === 0x11 || opcode === 0x12) size = 4;       // LOAD/STORE/DATA
      else if (opcode === 0x18 || opcode === 0x19 || opcode === 0x1A || opcode === 0x1B || opcode === 0x1D) size = 3; // JMP/JC/JA/JE/CALL
      else size = 2;

      // Advance IAR
      iar = (addr + size) & 0xFFFF;

      // ── ALU (0x01-0x0F, 0x17) ──
      if ((opcode >= 0x01 && opcode <= 0x0F) || opcode === 0x17) {
        const a = r[rA];
        const b = r[rB];
        let result = 0;
        let carry = false;

        switch (opcode) {
          case 0x01: { const s = a + b; result = s & 0xFFFF; carry = s > 0xFFFF; break; }       // ADD
          case 0x02: { const s = a - b; result = s & 0xFFFF; carry = s < 0; break; }             // SUB
          case 0x03: { const s = a * b; result = s & 0xFFFF; carry = s > 0xFFFF; break; }        // MUL
          case 0x0D: { const s = a * b; result = (s >>> 16) & 0xFFFF; carry = false; break; }    // MULH
          case 0x04: { result = b === 0 ? 0 : Math.floor(a / b) & 0xFFFF; break; }               // DIV
          case 0x05: { result = b === 0 ? 0 : (a % b) & 0xFFFF; break; }                         // MOD
          case 0x06: { result = a >>> 1; carry = (a & 1) !== 0; break; }                          // SHR
          case 0x07: { const s = a << 1; result = s & 0xFFFF; carry = s > 0xFFFF; break; }       // SHL
          case 0x08: { result = (~a) & 0xFFFF; break; }                                           // NOT
          case 0x09: { result = a & b; break; }                                                    // AND
          case 0x0A: { result = a | b; break; }                                                    // OR
          case 0x0B: { result = a ^ b; break; }                                                    // XOR
          case 0x0C: { result = a; break; }                                                        // CMP
          case 0x0E: { result = b; break; }                                                        // MOV
          case 0x0F: { result = (a >>> 8) & 0xFF; carry = (a & 0x80) !== 0; break; }              // SHR8
          case 0x17: { result = (a << 8) & 0xFFFF; carry = (a & 0x80) !== 0; break; }            // SHL8
        }

        fCarry = carry; fALarger = a > b; fEqual = a === b; fZero = result === 0;
        if (opcode !== 0x0C) r[rA] = result;  // CMP doesn't store
      }

      // ── LOAD rA, [addr16] ──
      else if (opcode === 0x10) {
        const mA = mem[(addr + 2) & 0xFFFF] | (mem[(addr + 3) & 0xFFFF] << 8);
        r[rA] = mem[mA & 0xFFFF];
      }

      // ── STORE rA, [addr16] ──
      else if (opcode === 0x11) {
        const mA = mem[(addr + 2) & 0xFFFF] | (mem[(addr + 3) & 0xFFFF] << 8);
        mem[mA & 0xFFFF] = r[rA] & 0xFF;
        // Vsync: break after frame flip
        if (mA === 0xDFFF && executed > 0) {
          this.state.cycle_count++;
          executed++;
          break;
        }
      }

      // ── DATA rA, imm16 ──
      else if (opcode === 0x12) {
        r[rA] = mem[(addr + 2) & 0xFFFF] | (mem[(addr + 3) & 0xFFFF] << 8);
      }

      // ── LDRI rA, rB ──
      else if (opcode === 0x15) {
        r[rA] = mem[r[rB] & 0xFFFF];
      }

      // ── STRI rA, rB ──
      else if (opcode === 0x16) {
        mem[r[rB] & 0xFFFF] = r[rA] & 0xFF;
      }

      // ── PUSH rA ──
      else if (opcode === 0x13) {
        const val = r[rA];
        const lo = sp - 1;
        mem[lo & 0xFFFF] = val & 0xFF;
        mem[(lo + 1) & 0xFFFF] = (val >> 8) & 0xFF;
        sp = (sp - 2) & 0xFFFF;
      }

      // ── POP rA ──
      else if (opcode === 0x14) {
        sp = (sp + 2) & 0xFFFF;
        const lo = sp - 1;
        r[rA] = mem[lo & 0xFFFF] | (mem[(lo + 1) & 0xFFFF] << 8);
      }

      // ── JMP ──
      else if (opcode === 0x18) {
        iar = mem[(addr + 1) & 0xFFFF] | (mem[(addr + 2) & 0xFFFF] << 8);
      }

      // ── JC ──
      else if (opcode === 0x19) {
        const target = mem[(addr + 1) & 0xFFFF] | (mem[(addr + 2) & 0xFFFF] << 8);
        if (fCarry) iar = target;
      }

      // ── JA ──
      else if (opcode === 0x1A) {
        const target = mem[(addr + 1) & 0xFFFF] | (mem[(addr + 2) & 0xFFFF] << 8);
        if (fALarger) iar = target;
      }

      // ── JE ──
      else if (opcode === 0x1B) {
        const target = mem[(addr + 1) & 0xFFFF] | (mem[(addr + 2) & 0xFFFF] << 8);
        if (fEqual) iar = target;
      }

      // ── JMPR rA ──
      else if (opcode === 0x1C) {
        iar = r[rA];
      }

      // ── CALL ──
      else if (opcode === 0x1D) {
        const target = mem[(addr + 1) & 0xFFFF] | (mem[(addr + 2) & 0xFFFF] << 8);
        const retAddr = iar;
        const lo = sp - 1;
        mem[lo & 0xFFFF] = retAddr & 0xFF;
        mem[(lo + 1) & 0xFFFF] = (retAddr >> 8) & 0xFF;
        sp = (sp - 2) & 0xFFFF;
        iar = target;
      }

      // ── RET ──
      else if (opcode === 0x1E) {
        sp = (sp + 2) & 0xFFFF;
        const lo = sp - 1;
        iar = mem[lo & 0xFFFF] | (mem[(lo + 1) & 0xFFFF] << 8);
      }

      // ── OUT rA ──
      else if (opcode === 0x1F) {
        this.consoleBuffer.push(r[rA] & 0xFF);
      }

      // ── IN rA ──
      else if (opcode === 0x20) {
        this.inputWaiting = { register: rA, address: addr };
        iar = addr; // rewind
        break;
      }

      this.state.cycle_count++;
      executed++;
    }

    // Write locals back to state
    this.state.iar = iar;
    this.state.sp = sp;
    this.state.flags.carry = fCarry;
    this.state.flags.a_larger = fALarger;
    this.state.flags.equal = fEqual;
    this.state.flags.zero = fZero;

    return executed;
  }

  getState(): CpuState {
    return { ...this.state, r: [...this.state.r]  };
  }
  getMemory(start: number, len: number): number[] {
    return Array.from(this.memory.slice(start, start + len));
  }
  getAllMemory(): number[] {
    return Array.from(this.memory.slice(0, MEM_SIZE));
  }
  getRawMemory(): number[] {
    return this.memory as unknown as number[];
  }
  reset(): void {
    this.state = {
      r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], acc: 0, tmp: 0, iar: 0, ir: 0, sp: 0x7FFF,
      flags: { carry: false, a_larger: false, equal: false, zero: true },
      bus: 0, halted: false, cycle_count: 0,
    };
    this.consoleBuffer = [];
    this.inputWaiting = null;
  }
  hardReset(): void {
    this.reset();
    this.memory.fill(0);
  }
  addBreakpoint(addr: number): void { this.breakpoints.add(addr); }
  removeBreakpoint(addr: number): void { this.breakpoints.delete(addr); }
  getBreakpoints(): Set<number> { return new Set(this.breakpoints); }
  isHalted(): boolean { return this.state.halted; }
  getPc(): number { return this.state.iar; }
  getCycleCount(): number { return this.state.cycle_count; }
  getRegister(index: number): number { return this.state.r[index] ?? 0; }
  poke(address: number, value: number): void { this.memory[address & MASK16] = value & 0xFF; }
  getConsoleOutput(): number[] { return [...this.consoleBuffer]; }
  clearConsole(): void { this.consoleBuffer = []; }
  getSnapshot(): { state: CpuState; memory: number[]; console: number[] } {
    return {
      state: { ...this.state, r: [...this.state.r]  },
      memory: Array.from(this.memory),
      console: [...this.consoleBuffer],
    };
  }
  restoreSnapshot(snap: { state: CpuState; memory: number[]; console: number[] }): void {
    this.state = { ...snap.state, r: [...snap.state.r]  };
    this.memory = new Uint8Array(snap.memory);
    this.consoleBuffer = [...snap.console];
    this.inputWaiting = null;
  }
  isWaitingForInput(): boolean { return this.inputWaiting !== null; }
  getInputRequest(): { register: number } | null {
    return this.inputWaiting ? { register: this.inputWaiting.register } : null;
  }
  provideInput(value: number): void {
    if (!this.inputWaiting) return;
    this.state.r[this.inputWaiting.register] = value & MASK16;
    this.state.iar = (this.inputWaiting.address + 2) & MASK16; // IN is 2 bytes
    this.inputWaiting = null;
  }
  echoToConsole(text: string): void {
    for (let i = 0; i < text.length; i++) {
      this.consoleBuffer.push(text.charCodeAt(i));
    }
  }
}

// ── Opcode name helper (exported for disassembly) ───────────────────────

export function getOpcodeName(code: number): string {
  return OP_NAMES[code] ?? '???';
}

export { instrSize };

// ── Factory ─────────────────────────────────────────────────────────────

export async function createComputer(): Promise<IComputer> {
  console.log('🔧 GateStack 16-bit engine (JavaScript)');
  return new MockComputer();
}
