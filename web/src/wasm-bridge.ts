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
  ConsoleOutput?: { register: string; value: number };
  WaitingForInput?: { register: string };
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
  private consoleBuffer: number[] = [];
  private inputWaiting: { register: number; address: number } | null = null;

  loadProgram(bytes: Uint8Array): void {
    this.hardReset();
    this.memory.set(bytes.slice(0, 256));
  }

  step(): CycleTrace {
    // If waiting for input, don't execute anything
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
    let opName = opcodeNames[opcodeNum] ?? '???';
    if (opcodeNum === 0xB && regB === 1) opName = 'OUT';
    if (opcodeNum === 0xB && regB === 2) opName = 'IN';

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
      if (regB === 1) {
        // OUT: output register value to console
        const value = this.state.r[regA];
        this.consoleBuffer.push(value);
        steps.push({ ConsoleOutput: { register: `R${regA}`, value } });
      } else if (regB === 2) {
        // IN: wait for user input → store in register
        this.inputWaiting = { register: regA, address: addr };
        this.state.iar = addr; // rewind IAR to re-execute after input provided
        steps.push({ WaitingForInput: { register: `R${regA}` } });
        return {
          address: addr, opcode: 'IN', reg_a: `R${regA}`, reg_b: null,
          steps, flags: { ...this.state.flags }, cycle: this.state.cycle_count,
          halted: false, error: null,
        };
      } else {
        // JMPR: jump to address in register
        const target = this.state.r[regA];
        this.state.iar = target;
        steps.push({ Jump: { target, taken: true } });
      }
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
      if (this.state.halted || this.breakpoints.has(this.state.iar) || this.inputWaiting) break;
      this.step();
      executed++;
      if (this.inputWaiting) break; // IN was hit during step
    }
    return executed;
  }

  getState(): CpuState { return { ...this.state, r: [...this.state.r] as [number, number, number, number] }; }
  getMemory(start: number, len: number): number[] { return Array.from(this.memory.slice(start, start + len)); }
  getAllMemory(): number[] { return Array.from(this.memory); }
  reset(): void { this.state = { r: [0,0,0,0], acc: 0, tmp: 0, iar: 0, ir: 0, flags: { carry: false, a_larger: false, equal: false, zero: true }, bus: 0, halted: false, cycle_count: 0 }; this.consoleBuffer = []; this.inputWaiting = null; }
  hardReset(): void { this.reset(); this.memory.fill(0); }
  addBreakpoint(addr: number): void { this.breakpoints.add(addr); }
  removeBreakpoint(addr: number): void { this.breakpoints.delete(addr); }
  getBreakpoints(): Set<number> { return new Set(this.breakpoints); }
  isHalted(): boolean { return this.state.halted; }
  getPc(): number { return this.state.iar; }
  getCycleCount(): number { return this.state.cycle_count; }
  getRegister(index: number): number { return this.state.r[index] ?? 0; }
  poke(address: number, value: number): void { this.memory[address & 0xFF] = value & 0xFF; }
  getConsoleOutput(): number[] { return [...this.consoleBuffer]; }
  clearConsole(): void { this.consoleBuffer = []; }
  getSnapshot(): { state: CpuState; memory: number[]; console: number[] } {
    return {
      state: { ...this.state, r: [...this.state.r] as [number, number, number, number] },
      memory: Array.from(this.memory),
      console: [...this.consoleBuffer],
    };
  }
  restoreSnapshot(snap: { state: CpuState; memory: number[]; console: number[] }): void {
    this.state = { ...snap.state, r: [...snap.state.r] as [number, number, number, number] };
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
    this.state.r[this.inputWaiting.register] = value & 0xFF;
    // Advance IAR past the IN instruction (1 byte)
    this.state.iar = (this.inputWaiting.address + 1) & 0xFF;
    this.inputWaiting = null;
  }
  echoToConsole(text: string): void {
    for (let i = 0; i < text.length; i++) {
      this.consoleBuffer.push(text.charCodeAt(i));
    }
  }
}

// ── WASM Adapter (wraps the Rust Computer for the IComputer interface) ──

class WasmComputer implements IComputer {
  private wasm: any;
  private corrupted = false;

  constructor(wasmComputer: any) {
    this.wasm = wasmComputer;
  }

  private check(): boolean {
    if (this.corrupted) {
      console.warn('🦀 WASM object corrupted, operations will be no-ops');
      return false;
    }
    return true;
  }

  private markCorrupted(method: string, e: any): void {
    if (String(e).includes('recursive use') || String(e).includes('memory access out of bounds')) {
      console.error(`🦀 WASM object corrupted after ${method}() — need page reload`);
      this.corrupted = true;
    }
  }

  loadProgram(bytes: Uint8Array): void {
    if (!this.check()) return;
    try {
      this.wasm.load_program(bytes);
    } catch (e) {
      console.error('WASM loadProgram() error:', e);
      this.markCorrupted('loadProgram', e);
    }
  }

  step(): CycleTrace {
    if (!this.check()) return { address: 0, opcode: null, reg_a: null, reg_b: null,
             steps: [], flags: null, cycle: 0, halted: true, error: 'WASM corrupted' };
    try {
      const json = this.wasm.step();
      return JSON.parse(json);
    } catch (e) {
      console.error('WASM step() error:', e);
      this.markCorrupted('step', e);
      return { address: 0, opcode: null, reg_a: null, reg_b: null,
               steps: [], flags: null, cycle: 0, halted: true, error: String(e) };
    }
  }

  run(maxCycles: number): number {
    if (!this.check()) return 0;
    try {
      const result = this.wasm.run(maxCycles);
      return typeof result === 'bigint' ? Number(result) : result;
    } catch (e) {
      console.error('WASM run() error:', e);
      this.markCorrupted('run', e);
      return 0;
    }
  }

  getState(): CpuState {
    if (!this.check()) return {
      r: [0, 0, 0, 0], acc: 0, tmp: 0, iar: 0, ir: 0,
      flags: { carry: false, a_larger: false, equal: false, zero: true },
      bus: 0, halted: true, cycle_count: 0,
    };
    try {
      const json = this.wasm.get_state();
      const raw = JSON.parse(json);
      return {
        r: raw.r ?? [0, 0, 0, 0],
        acc: raw.acc ?? 0,
        tmp: raw.tmp ?? 0,
        iar: raw.iar ?? 0,
        ir: raw.ir ?? 0,
        flags: raw.flags ?? { carry: false, a_larger: false, equal: false, zero: true },
        bus: raw.bus ?? 0,
        halted: raw.halted ?? false,
        cycle_count: typeof raw.cycle_count === 'string' ? parseInt(raw.cycle_count) : (raw.cycle_count ?? 0),
      };
    } catch (e) {
      console.error('WASM getState() error:', e);
      this.markCorrupted('getState', e);
      return {
        r: [0, 0, 0, 0], acc: 0, tmp: 0, iar: 0, ir: 0,
        flags: { carry: false, a_larger: false, equal: false, zero: true },
        bus: 0, halted: true, cycle_count: 0,
      };
    }
  }

  getMemory(start: number, len: number): number[] {
    if (!this.check()) return new Array(len).fill(0);
    try {
      return JSON.parse(this.wasm.get_memory(start, len));
    } catch (e) {
      console.error('WASM getMemory() error:', e);
      this.markCorrupted('getMemory', e);
      return new Array(len).fill(0);
    }
  }

  getAllMemory(): number[] {
    if (!this.check()) return new Array(256).fill(0);
    try {
      return JSON.parse(this.wasm.get_all_memory());
    } catch (e) {
      console.error('WASM getAllMemory() error:', e);
      this.markCorrupted('getAllMemory', e);
      return new Array(256).fill(0);
    }
  }

  reset(): void { if (this.check()) try { this.wasm.reset(); } catch (e) { this.markCorrupted('reset', e); } }
  hardReset(): void { if (this.check()) try { this.wasm.hard_reset(); } catch (e) { this.markCorrupted('hardReset', e); } }
  addBreakpoint(addr: number): void { if (this.check()) try { this.wasm.add_breakpoint(addr); } catch (e) { this.markCorrupted('addBreakpoint', e); } }
  removeBreakpoint(addr: number): void { if (this.check()) try { this.wasm.remove_breakpoint(addr); } catch (e) { this.markCorrupted('removeBreakpoint', e); } }
  getBreakpoints(): Set<number> { return new Set(); } // WASM doesn't expose breakpoint set yet
  isHalted(): boolean { if (!this.check()) return true; try { return this.wasm.is_halted(); } catch (e) { this.markCorrupted('isHalted', e); return true; } }
  getPc(): number { if (!this.check()) return 0; try { return this.wasm.get_pc(); } catch (e) { this.markCorrupted('getPc', e); return 0; } }
  getCycleCount(): number { if (!this.check()) return 0; try { const v = this.wasm.get_cycle_count(); return typeof v === 'bigint' ? Number(v) : v; } catch (e) { this.markCorrupted('getCycleCount', e); return 0; } }
  getRegister(index: number): number { if (!this.check()) return 0; try { return this.wasm.get_register(index); } catch (e) { this.markCorrupted('getRegister', e); return 0; } }
  poke(address: number, value: number): void { if (this.check()) try { this.wasm.poke(address, value); } catch (e) { this.markCorrupted('poke', e); } }
  getConsoleOutput(): number[] { return []; } // WASM doesn't support OUT yet
  clearConsole(): void { }
  getSnapshot(): { state: CpuState; memory: number[]; console: number[] } {
    return { state: this.getState(), memory: this.getAllMemory(), console: [] };
  }
  restoreSnapshot(_snap: { state: CpuState; memory: number[]; console: number[] }): void { }
  isWaitingForInput(): boolean { return false; }
  getInputRequest(): { register: number } | null { return null; }
  provideInput(_value: number): void { }
  echoToConsole(_text: string): void { }
}

// ── Factory ──────────────────────────────────────────────────────────────

export async function createComputer(): Promise<IComputer> {
  // WASM core is compiled but has serialization issues — using mock for now.
  // To test WASM: uncomment the block below and run scripts\build-wasm.bat
  //
  // try {
  //   const wasm = await import('./wasm/gatestack_core');
  //   await wasm.default();
  //   console.log('🦀 Using Rust/WASM core');
  //   return new WasmComputer(new wasm.Computer());
  // } catch (e) {
  //   console.warn('WASM failed:', (e as Error).message);
  // }

  console.log('🔧 Using JavaScript computer engine');
  return new MockComputer();
}
