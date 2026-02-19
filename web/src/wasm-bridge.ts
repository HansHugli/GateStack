// ============================================================================
// wasm-bridge.ts — TypeScript interface to the Rust/WASM core
// ============================================================================
// This file provides a clean TypeScript API and type definitions.
// It includes a MOCK implementation so you can develop the React UI
// before the Rust core is compiled. Once WASM is ready, flip USE_MOCK.
// ============================================================================

// ── Type Definitions (match Rust's serde output) ─────────────────────────

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
  | 'IAR'
  | 'RAM'
  | 'ALU'
  | 'ACC'
  | { Reg: string }
  | { Immediate: number };

export interface MicroStep {
  BusTransfer?: { source: BusSource; dest: string; value: number };
  IncrementIAR?: { new_value: number };
  AluOperation?: { op: string; input_a: number; input_b: number; result: AluResult };
  FetchOperand?: { value: number };
  Jump?: { target: number; taken: boolean };
  Error?: { message: string };
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
  r: [number, number, number, number];
  acc: number;
  tmp: number;
  iar: number;
  ir: number;
  flags: Flags;
  bus: number;
  halted: boolean;
  cycle_count: number;
}

// ── Computer Interface ───────────────────────────────────────────────────

export interface IComputer {
  loadProgram(bytes: Uint8Array): void;
  step(): CycleTrace;
  run(maxCycles: number): number;
  getState(): CpuState;
  getMemory(start: number, len: number): number[];
  getAllMemory(): number[];
  reset(): void;
  hardReset(): void;
  addBreakpoint(addr: number): void;
  removeBreakpoint(addr: number): void;
  isHalted(): boolean;
  getPc(): number;
  getCycleCount(): number;
  getRegister(index: number): number;
  poke(address: number, value: number): void;
}

// ── Mock Implementation (for UI development) ─────────────────────────────

class MockComputer implements IComputer {
  private state: CpuState = {
    r: [0, 0, 0, 0],
    acc: 0, tmp: 0, iar: 0, ir: 0,
    flags: { carry: false, a_larger: false, equal: false, zero: true },
    bus: 0, halted: false, cycle_count: 0,
  };
  private memory = new Uint8Array(256);
  private breakpoints = new Set<number>();

  loadProgram(bytes: Uint8Array): void {
    this.hardReset();
    this.memory.set(bytes.slice(0, 256));
  }

  step(): CycleTrace {
    if (this.state.halted) {
      return { address: this.state.iar, opcode: null, reg_a: null, reg_b: null,
               steps: [], flags: null, cycle: this.state.cycle_count, halted: true, error: null };
    }

    const addr = this.state.iar;
    const instr = this.memory[addr] ?? 0;

    // HALT: 0x00 means stop (ADD R0,R0 with all zeros = no-op, used as halt sentinel)
    if (instr === 0x00) {
      this.state.halted = true;
      return { address: addr, opcode: 'HALT', reg_a: null, reg_b: null,
               steps: [], flags: { ...this.state.flags }, cycle: this.state.cycle_count, halted: true, error: null };
    }

    const opcodeNum = (instr >> 4) & 0x0F;
    const regA = (instr >> 2) & 0x03;
    const regB = instr & 0x03;

    const opcodeNames = ['ADD','SHR','SHL','NOT','AND','OR','XOR','CMP',
                         'LOAD','STORE','DATA','JMPR','JMP','JC','JA','JE'];
    const opName = opcodeNames[opcodeNum] ?? '???';

    const steps: MicroStep[] = [];

    // Simulate fetch
    steps.push({ BusTransfer: { source: 'IAR', dest: 'MAR', value: addr } });
    steps.push({ BusTransfer: { source: 'RAM', dest: 'IR', value: instr } });

    this.state.ir = instr;
    this.state.iar = (addr + 1) & 0xFF;
    steps.push({ IncrementIAR: { new_value: this.state.iar } });

    // Execute based on opcode
    if (opcodeNum <= 7) {
      // ALU ops
      const a = this.state.r[regA];
      const b = this.state.r[regB];
      let result = 0;
      switch (opcodeNum) {
        case 0: result = (a + b) & 0xFF; break; // ADD
        case 1: result = a >> 1; break; // SHR
        case 2: result = (a << 1) & 0xFF; break; // SHL
        case 3: result = (~a) & 0xFF; break; // NOT
        case 4: result = a & b; break; // AND
        case 5: result = a | b; break; // OR
        case 6: result = a ^ b; break; // XOR
        case 7: result = a ^ b; break; // CMP
      }

      const flags = { carry: (a + b) > 0xFF, a_larger: a > b, equal: a === b, zero: result === 0 };
      steps.push({ AluOperation: { op: opName, input_a: a, input_b: b,
        result: { value: result, ...flags } } });

      // CMP only sets flags — does NOT write result back to register
      if (opcodeNum !== 7) {
        this.state.r[regA] = result;
        this.state.acc = result;
      }
      this.state.flags = flags;
    } else if (opcodeNum === 0x8) {
      // LOAD: RAM[next_byte] → RegA
      const addr2 = this.memory[this.state.iar] ?? 0;
      this.state.iar = (this.state.iar + 1) & 0xFF;
      const value = this.memory[addr2] ?? 0;
      this.state.r[regA] = value;
      steps.push({ FetchOperand: { value: addr2 } });
      steps.push({ BusTransfer: { source: 'RAM', dest: `R${regA}`, value } });
    } else if (opcodeNum === 0x9) {
      // STORE: RegA → RAM[next_byte]
      const addr2 = this.memory[this.state.iar] ?? 0;
      this.state.iar = (this.state.iar + 1) & 0xFF;
      this.memory[addr2] = this.state.r[regA];
      steps.push({ FetchOperand: { value: addr2 } });
      steps.push({ BusTransfer: { source: { Reg: `R${regA}` }, dest: 'RAM', value: this.state.r[regA] } });
    } else if (opcodeNum === 0xA) {
      // DATA: load immediate
      const value = this.memory[this.state.iar] ?? 0;
      this.state.iar = (this.state.iar + 1) & 0xFF;
      this.state.r[regA] = value;
      steps.push({ BusTransfer: { source: { Immediate: value }, dest: `R${regA}`, value } });
    } else if (opcodeNum === 0xB) {
      // JMPR: jump to address in register
      const target = this.state.r[regA];
      this.state.iar = target;
      steps.push({ Jump: { target, taken: true } });
    } else if (opcodeNum === 0xC) {
      // JMP: unconditional jump
      const target = this.memory[this.state.iar] ?? 0;
      this.state.iar = target;
      steps.push({ Jump: { target, taken: true } });
    } else if (opcodeNum === 0xD) {
      // JC: jump if carry
      const target = this.memory[this.state.iar] ?? 0;
      this.state.iar = (this.state.iar + 1) & 0xFF;
      const taken = this.state.flags.carry;
      if (taken) this.state.iar = target;
      steps.push({ Jump: { target, taken } });
    } else if (opcodeNum === 0xE) {
      // JA: jump if A larger
      const target = this.memory[this.state.iar] ?? 0;
      this.state.iar = (this.state.iar + 1) & 0xFF;
      const taken = this.state.flags.a_larger;
      if (taken) this.state.iar = target;
      steps.push({ Jump: { target, taken } });
    } else if (opcodeNum === 0xF) {
      // JE: jump if equal
      const target = this.memory[this.state.iar] ?? 0;
      this.state.iar = (this.state.iar + 1) & 0xFF;
      const taken = this.state.flags.equal;
      if (taken) this.state.iar = target;
      steps.push({ Jump: { target, taken } });
    }

    this.state.cycle_count++;
    this.state.bus = this.state.r[regA];

    return {
      address: addr, opcode: opName, reg_a: `R${regA}`, reg_b: `R${regB}`,
      steps, flags: { ...this.state.flags }, cycle: this.state.cycle_count,
      halted: false, error: null,
    };
  }

  run(maxCycles: number): number {
    let executed = 0;
    for (let i = 0; i < maxCycles; i++) {
      if (this.state.halted || this.breakpoints.has(this.state.iar)) break;
      this.step();
      executed++;
    }
    return executed;
  }

  getState(): CpuState { return { ...this.state, r: [...this.state.r] as [number, number, number, number] }; }
  getMemory(start: number, len: number): number[] { return Array.from(this.memory.slice(start, start + len)); }
  getAllMemory(): number[] { return Array.from(this.memory); }
  reset(): void { this.state = { r: [0,0,0,0], acc: 0, tmp: 0, iar: 0, ir: 0, flags: { carry: false, a_larger: false, equal: false, zero: true }, bus: 0, halted: false, cycle_count: 0 }; }
  hardReset(): void { this.reset(); this.memory.fill(0); }
  addBreakpoint(addr: number): void { this.breakpoints.add(addr); }
  removeBreakpoint(addr: number): void { this.breakpoints.delete(addr); }
  isHalted(): boolean { return this.state.halted; }
  getPc(): number { return this.state.iar; }
  getCycleCount(): number { return this.state.cycle_count; }
  getRegister(index: number): number { return this.state.r[index] ?? 0; }
  poke(address: number, value: number): void { this.memory[address & 0xFF] = value & 0xFF; }
}

// ── Factory ──────────────────────────────────────────────────────────────

const USE_MOCK = true; // Set to false once WASM is compiled

export async function createComputer(): Promise<IComputer> {
  if (USE_MOCK) {
    console.log('🔧 Using mock computer (WASM not yet built)');
    return new MockComputer();
  }

  // When WASM is ready, this will load and wrap it:
  // const wasm = await import('./wasm/gatestack_core');
  // await wasm.default();
  // return new WasmComputer(new wasm.Computer());
  throw new Error('WASM not yet available');
}
