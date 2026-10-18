// ============================================================================
// wasm-cpu.ts — WASM Computer Wrapper (v2.0)
// ============================================================================
// Wraps the Rust WASM module (WasmCpu) to implement the IComputer interface.
// The key advantage: the 4MB memory is a shared WASM linear memory buffer
// that both Rust and TypeScript can access without copying.
//
// v2.0: 4MB RAM, 32-bit registers, 22-bit addresses, 45 opcodes
//
// Build the WASM first:  cd web && npm run build:wasm
// ============================================================================

import type { IComputer, CpuState, CycleTrace, MicroStep, Snapshot } from './wasm-bridge';
import { buildStepTrace } from './wasm-bridge';

const MEM_SIZE = 4_194_304;  // 4MB
const MEM_MASK = 0x3FFFFF;   // 22-bit address mask

/**
 * WasmComputer wraps the Rust-compiled WASM CPU module.
 * Memory is shared via WASM linear memory — no copying for video reads.
 */
export class WasmComputer implements IComputer {
  private cpu: any;               // WasmCpu instance from Rust
  private wasmMemory: WebAssembly.Memory;  // WASM linear memory
  private memoryView: Uint8Array; // View into WASM memory (4MB slice)
  private breakpoints = new Set<number>();
  private consoleBuffer: number[] = [];
  private disposed = false;

  constructor(cpu: any, wasmMemory: WebAssembly.Memory) {
    this.cpu = cpu;
    this.wasmMemory = wasmMemory;
    // Create a view into the WASM memory at the CPU's memory pointer
    const ptr = cpu.memory_ptr();
    this.memoryView = new Uint8Array(wasmMemory.buffer, ptr, MEM_SIZE);
  }

  // Refresh memoryView if WASM memory grows (another WasmCpu was allocated)
  private refreshView(): void {
    if (this.memoryView.buffer !== this.wasmMemory.buffer) {
      const ptr = this.cpu.memory_ptr();
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
        flags: this.getFlagsObj(),
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
        error: this.getFault(),
      };
    }

    this.refreshView();
    const addr = this.cpu.get_iar() & MEM_MASK;
    const opcode = this.memoryView[addr];
    const regByte = this.memoryView[(addr + 1) & MEM_MASK];
    const rA = (regByte >> 4) & 0x0F;
    const rB = regByte & 0x0F;

    // Capture pre-execution register values
    const preA = this.cpu.get_register(rA) >>> 0;
    const preB = this.cpu.get_register(rB) >>> 0;

    // Execute one instruction (always, even on a breakpoint)
    this.cpu.step();
    this.drainWasmConsole();
    this.refreshView();

    const view = this.memoryView;
    return buildStepTrace(addr, opcode, rA, rB, preA, preB, {
      readAddr24: (o) => view[o & MEM_MASK] | (view[(o + 1) & MEM_MASK] << 8) | (view[(o + 2) & MEM_MASK] << 16),
      getRegister: (i) => this.cpu.get_register(i),
      getSp: () => this.cpu.get_sp(),
      getPc: () => this.cpu.get_iar(),
      getFlags: () => this.getFlagsObj(),
      getCycleCount: () => this.cpu.get_cycle_count(),
      isHalted: () => this.cpu.is_halted(),
    }, this.getFault());
  }

  run(maxCycles: number): number {
    this.refreshView();
    const executed = this.cpu.run(maxCycles);
    this.drainWasmConsole();
    return executed;
  }

  getState(): CpuState {
    this.refreshView();
    const r: number[] = [];
    for (let i = 0; i < 16; i++) {
      r.push(this.cpu.get_register(i));
    }
    const iar = this.cpu.get_iar();
    return {
      r,
      acc: 0,
      tmp: 0,
      iar,
      ir: this.memoryView[iar & MEM_MASK] ?? 0,
      sp: this.cpu.get_sp(),
      flags: this.getFlagsObj(),
      bus: 0,
      halted: this.cpu.is_halted(),
      cycle_count: this.cpu.get_cycle_count(),
    };
  }

  getMemory(start: number, len: number): number[] {
    this.refreshView();
    const result: number[] = [];
    for (let i = 0; i < len; i++) {
      result.push(this.memoryView[(start + i) & MEM_MASK]);
    }
    return result;
  }

  getAllMemory(): Uint8Array {
    this.refreshView();
    return new Uint8Array(this.memoryView);
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

  getFault(): string | null {
    const f: string = this.cpu.get_fault();
    return f ? f : null;
  }

  poke(address: number, value: number): void {
    this.cpu.poke(address & MEM_MASK, value & 0xFF);
  }

  getConsoleOutput(): number[] { return [...this.consoleBuffer]; }
  clearConsole(): void { this.consoleBuffer = []; }

  getSnapshot(): Snapshot {
    const resume: number = this.cpu.get_breakpoint_resume();
    return {
      state: this.getState(),
      memory: this.getAllMemory(),
      console: [...this.consoleBuffer],
      inputWaiting: this.cpu.is_input_waiting(),
      inputRegister: this.cpu.get_input_register(),
      fault: this.getFault(),
      breakpointResume: resume < 0 ? null : resume,
    };
  }

  restoreSnapshot(snap: Snapshot): void {
    this.cpu.hard_reset();
    this.refreshView();

    // Restore memory directly into WASM buffer
    this.memoryView.set(snap.memory);

    // Restore CPU state
    for (let i = 0; i < 16; i++) {
      this.cpu.set_register(i, (snap.state.r[i] ?? 0) >>> 0);
    }
    this.cpu.set_iar(snap.state.iar >>> 0);
    this.cpu.set_sp(snap.state.sp >>> 0);
    this.cpu.set_cycle_count(snap.state.cycle_count);
    this.cpu.set_halted(snap.state.halted);
    this.cpu.set_flags(
      snap.state.flags.carry,
      snap.state.flags.a_larger,
      snap.state.flags.equal,
      snap.state.flags.zero,
    );
    this.cpu.set_input_state(snap.inputWaiting ?? false, snap.inputRegister ?? 0);
    this.cpu.set_fault(snap.fault ?? '');
    this.cpu.set_breakpoint_resume(snap.breakpointResume ?? -1);

    this.consoleBuffer = [...snap.console];
  }

  isWaitingForInput(): boolean { return this.cpu.is_input_waiting(); }

  getInputRequest(): { register: number } | null {
    if (!this.cpu.is_input_waiting()) return null;
    return { register: this.cpu.get_input_register() };
  }

  provideInput(value: number): void {
    this.cpu.provide_input(value >>> 0);
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

  /** Frees the Rust CPU (its 4MB). The object must not be used afterwards. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cpu.free?.();
  }

  // ── Private helpers ────────────────────────────────────────────────────

  private getFlagsObj() {
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
    // Import the glue code and wasm module
    const bg_js = await import('./wasm/gatestack_core_bg.js');
    const bg_wasm = await import('./wasm/gatestack_core_bg.wasm');

    // If vite-plugin-wasm gave us the raw exports, wire them up manually
    if (bg_js.__wbg_set_wasm && bg_wasm) {
      // The wasm module might be the direct exports or wrapped
      const wasmExports = (bg_wasm as any).default || bg_wasm;
      bg_js.__wbg_set_wasm(wasmExports);
      // Call __wbindgen_start if it exists (initializes the module)
      if (wasmExports.__wbindgen_start) {
        wasmExports.__wbindgen_start();
      }
    }

    // Now WasmCpu should be available from the bg.js
    const { WasmCpu } = bg_js as any;
    if (!WasmCpu) {
      throw new Error('WasmCpu not found in WASM module');
    }

    const cpu = new WasmCpu();

    // Get WASM linear memory
    const wasmMemory: WebAssembly.Memory = (bg_wasm as any).memory
      || ((bg_wasm as any).default?.memory);

    if (!wasmMemory) {
      throw new Error('Could not access WASM linear memory');
    }

    console.log('🚀 GateStack v2.0 WASM engine loaded (4MB, 32-bit)');
    return new WasmComputer(cpu, wasmMemory);
  } catch (e) {
    // Fallback: try the main entry point (works with some bundler configs)
    try {
      const main = await import('./wasm/gatestack_core.js');
      const WasmCpu = (main as any).WasmCpu || (main as any).default?.WasmCpu;
      if (!WasmCpu) throw new Error('No WasmCpu export');

      const cpu = new WasmCpu();
      const bg = await import('./wasm/gatestack_core_bg.wasm');
      const wasmMemory: WebAssembly.Memory = (bg as any).memory
        || ((bg as any).default?.memory);

      if (!wasmMemory) throw new Error('No WASM memory');

      console.log('🚀 GateStack v2.0 WASM engine loaded (4MB, 32-bit) [fallback]');
      return new WasmComputer(cpu, wasmMemory);
    } catch (e2) {
      console.warn('⚠️ WASM not available, using JavaScript engine:', e2);
      return null;
    }
  }
}
