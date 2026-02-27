// ============================================================================
// wasm-cpu.ts — WASM Computer Wrapper
// ============================================================================
// Wraps the Rust WASM module (WasmCpu) to implement the IComputer interface.
// The key advantage: the 64KB memory is a shared WASM linear memory buffer
// that both Rust and TypeScript can access without copying.
//
// Build the WASM first:  scripts/build-wasm.bat
// ============================================================================

import type { IComputer, CpuState, CycleTrace, MicroStep } from './wasm-bridge';
import { OP, instrSize } from './wasm-bridge';

const MEM_SIZE = 65536;
const MASK16 = 0xFFFF;

// OP_NAMES lookup for trace generation
const OP_NAMES: Record<number, string> = {};
for (const [name, code] of Object.entries(OP)) {
  OP_NAMES[code] = name;
}

/**
 * WasmComputer wraps the Rust-compiled WASM CPU module.
 * Memory is shared via WASM linear memory — no copying for video reads.
 */
export class WasmComputer implements IComputer {
  private cpu: any;               // WasmCpu instance from Rust
  private wasmMemory: WebAssembly.Memory;  // WASM linear memory
  private memoryView: Uint8Array; // View into WASM memory (64KB slice)
  private breakpoints = new Set<number>();
  private consoleBuffer: number[] = [];

  constructor(cpu: any, wasmMemory: WebAssembly.Memory) {
    this.cpu = cpu;
    this.wasmMemory = wasmMemory;
    // Create a view into the WASM memory at the CPU's memory pointer
    const ptr = cpu.memory_ptr();
    this.memoryView = new Uint8Array(wasmMemory.buffer, ptr, MEM_SIZE);
  }

  // Refresh memoryView if WASM memory grows (shouldn't happen, but safety)
  private refreshView(): void {
    const ptr = this.cpu.memory_ptr();
    if (this.memoryView.buffer !== this.wasmMemory.buffer) {
      this.memoryView = new Uint8Array(this.wasmMemory.buffer, ptr, MEM_SIZE);
    }
  }

  loadProgram(bytes: Uint8Array): void {
    this.hardReset();
    this.cpu.load_program(bytes);
    this.refreshView();
  }

  step(): CycleTrace {
    // If waiting for input, return trace
    if (this.cpu.is_input_waiting()) {
      const reg = this.cpu.get_input_register();
      return {
        address: this.cpu.get_iar(),
        opcode: 'IN',
        reg_a: `R${reg}`,
        reg_b: null,
        steps: [{ WaitingForInput: { register: `R${reg}` } }] as MicroStep[],
        flags: this.getFlags(),
        cycle: this.cpu.get_cycle_count(),
        halted: false,
        error: null,
      };
    }

    if (this.cpu.is_halted()) {
      return {
        address: this.cpu.get_iar(),
        opcode: null,
        reg_a: null,
        reg_b: null,
        steps: [],
        flags: null,
        cycle: this.cpu.get_cycle_count(),
        halted: true,
        error: null,
      };
    }

    this.refreshView();
    const addr = this.cpu.get_iar();
    const opcode = this.memoryView[addr];
    const regByte = this.memoryView[(addr + 1) & MASK16];
    const rA = (regByte >> 4) & 0x0F;
    const rB = regByte & 0x0F;
    const opName = OP_NAMES[opcode] ?? '???';

    // Execute one instruction
    this.cpu.step();

    // Drain console output
    this.drainWasmConsole();

    // Build trace for UI
    const steps: MicroStep[] = [
      { FetchInstruction: { address: addr, value: opcode } },
    ];

    return {
      address: addr,
      opcode: opName,
      reg_a: `R${rA}`,
      reg_b: `R${rB}`,
      steps,
      flags: this.getFlags(),
      cycle: this.cpu.get_cycle_count(),
      halted: this.cpu.is_halted(),
      error: null,
    };
  }

  run(maxCycles: number): number {
    this.refreshView();
    const executed = this.cpu.run(maxCycles);
    this.drainWasmConsole();
    return executed;
  }

  getState(): CpuState {
    const r: number[] = [];
    for (let i = 0; i < 16; i++) {
      r.push(this.cpu.get_register(i));
    }
    return {
      r,
      acc: 0,
      tmp: 0,
      iar: this.cpu.get_iar(),
      ir: this.memoryView[this.cpu.get_iar()] ?? 0,
      sp: this.cpu.get_sp(),
      flags: this.getFlags(),
      bus: 0,
      halted: this.cpu.is_halted(),
      cycle_count: this.cpu.get_cycle_count(),
    };
  }

  getMemory(start: number, len: number): number[] {
    this.refreshView();
    const result: number[] = [];
    for (let i = 0; i < len; i++) {
      result.push(this.memoryView[(start + i) & MASK16]);
    }
    return result;
  }

  getAllMemory(): number[] {
    this.refreshView();
    return Array.from(this.memoryView);
  }

  getRawMemory(): number[] {
    this.refreshView();
    return this.memoryView as unknown as number[];
  }

  reset(): void {
    this.cpu.reset();
    this.consoleBuffer = [];
    this.refreshView();
  }

  hardReset(): void {
    this.cpu.hard_reset();
    this.consoleBuffer = [];
    this.refreshView();
  }

  addBreakpoint(addr: number): void {
    this.breakpoints.add(addr);
    this.cpu.add_breakpoint(addr);
  }

  removeBreakpoint(addr: number): void {
    this.breakpoints.delete(addr);
    this.cpu.remove_breakpoint(addr);
  }

  getBreakpoints(): Set<number> {
    return new Set(this.breakpoints);
  }

  isHalted(): boolean { return this.cpu.is_halted(); }
  getPc(): number { return this.cpu.get_iar(); }
  getCycleCount(): number { return this.cpu.get_cycle_count(); }
  getRegister(index: number): number { return this.cpu.get_register(index); }

  poke(address: number, value: number): void {
    this.cpu.poke(address & MASK16, value & 0xFF);
  }

  getConsoleOutput(): number[] { return [...this.consoleBuffer]; }
  clearConsole(): void { this.consoleBuffer = []; }

  getSnapshot(): { state: CpuState; memory: number[]; console: number[] } {
    return {
      state: this.getState(),
      memory: this.getAllMemory(),
      console: [...this.consoleBuffer],
    };
  }

  restoreSnapshot(snap: { state: CpuState; memory: number[]; console: number[] }): void {
    this.cpu.hard_reset();
    this.refreshView();

    // Restore memory directly into WASM buffer
    for (let i = 0; i < snap.memory.length && i < MEM_SIZE; i++) {
      this.memoryView[i] = snap.memory[i];
    }

    // Restore CPU state
    for (let i = 0; i < 16; i++) {
      this.cpu.set_register(i, snap.state.r[i] ?? 0);
    }
    this.cpu.set_iar(snap.state.iar);
    this.cpu.set_sp(snap.state.sp);
    this.cpu.set_cycle_count(snap.state.cycle_count);
    this.cpu.set_halted(snap.state.halted);
    this.cpu.set_flags(
      snap.state.flags.carry,
      snap.state.flags.a_larger,
      snap.state.flags.equal,
      snap.state.flags.zero,
    );

    this.consoleBuffer = [...snap.console];
  }

  isWaitingForInput(): boolean { return this.cpu.is_input_waiting(); }

  getInputRequest(): { register: number } | null {
    if (!this.cpu.is_input_waiting()) return null;
    return { register: this.cpu.get_input_register() };
  }

  provideInput(value: number): void {
    this.cpu.provide_input(value & MASK16);
    this.drainWasmConsole();
  }

  echoToConsole(text: string): void {
    for (let i = 0; i < text.length; i++) {
      this.consoleBuffer.push(text.charCodeAt(i));
    }
  }

  setSkipVsync(skip: boolean): void {
    this.cpu.set_skip_vsync(skip);
  }

  // ── Private helpers ────────────────────────────────────────────────────

  private getFlags() {
    return {
      carry: this.cpu.get_carry(),
      a_larger: this.cpu.get_a_larger(),
      equal: this.cpu.get_equal(),
      zero: this.cpu.get_zero(),
    };
  }

  private drainWasmConsole(): void {
    const bytes = this.cpu.drain_console();
    if (bytes && bytes.length > 0) {
      for (let i = 0; i < bytes.length; i++) {
        this.consoleBuffer.push(bytes[i]);
      }
    }
  }
}

/**
 * Try to initialize the WASM module. Returns a WasmComputer or null if WASM isn't available.
 */
export async function tryCreateWasmComputer(): Promise<IComputer | null> {
  try {
    // wasm-pack --target bundler + vite-plugin-wasm:
    // The main .js file auto-initializes the WASM module on import.
    // WasmCpu is directly available as a named export.
    const { WasmCpu } = await import('./wasm/gatestack_core.js');

    // Create the CPU — WASM is already initialized by the import
    const cpu = new WasmCpu();

    // Get WASM linear memory from the _bg.wasm module
    const bg = await import('./wasm/gatestack_core_bg.wasm');
    const wasmMemory: WebAssembly.Memory = (bg as any).memory;

    if (!wasmMemory) {
      throw new Error('Could not access WASM linear memory');
    }

    console.log('🚀 GateStack WASM engine loaded');
    return new WasmComputer(cpu, wasmMemory);
  } catch (e) {
    console.warn('⚠️ WASM not available, using JavaScript engine:', e);
    return null;
  }
}
