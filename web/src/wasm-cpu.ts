// ============================================================================
// wasm-cpu.ts — WASM Computer Wrapper (v2.0)
// ============================================================================
// Wraps the Rust WASM module (WasmCpu) to implement the IComputer interface.
// The key advantage: the 4MB memory is a shared WASM linear memory buffer
// that both Rust and TypeScript can access without copying.
//
// v2.0: 4MB RAM, 32-bit registers, 22-bit addresses, 43 opcodes
//
// Build the WASM first:  scripts/build-wasm.bat
// ============================================================================

import type { IComputer, CpuState, CycleTrace, MicroStep, Snapshot } from './wasm-bridge';
import { OP, instrSize, getOpcodeName } from './wasm-bridge';

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
        error: null,
      };
    }

    this.refreshView();
    const addr = this.cpu.get_iar();
    const maskedAddr = addr & MEM_MASK;
    const opcode = this.memoryView[maskedAddr];
    const regByte = this.memoryView[(maskedAddr + 1) & MEM_MASK];
    const rA = (regByte >> 4) & 0x0F;
    const rB = regByte & 0x0F;
    const opName = getOpcodeName(opcode);

    // Capture pre-execution register values
    const preA = this.cpu.get_register(rA) >>> 0;
    const preB = this.cpu.get_register(rB) >>> 0;

    // Read addr24 helper (for trace, reads from WASM memory view)
    const readAddr24 = (offset: number) =>
      this.memoryView[offset & MEM_MASK]
      | (this.memoryView[(offset + 1) & MEM_MASK] << 8)
      | (this.memoryView[(offset + 2) & MEM_MASK] << 16);

    // Execute one instruction
    this.cpu.step();

    // Drain console output
    this.drainWasmConsole();

    // Build trace for UI
    const steps: MicroStep[] = [
      { FetchInstruction: { address: addr, value: opcode } },
      // Fetch cycle: IAR → MAR → RAM → IR
      { BusTransfer: { source: 'IAR', dest: 'MAR', value: addr } },
      { BusTransfer: { source: 'RAM', dest: 'IR', value: opcode } },
    ];

    const postA = this.cpu.get_register(rA) >>> 0;
    const flags = this.getFlagsObj();

    // ALU operations
    if ((opcode >= OP.ADD && opcode <= OP.SHR8) || opcode === OP.SHL8
        || opcode === OP.SHRN || opcode === OP.SHLN
        || opcode === OP.IDIV || opcode === OP.IMOD) {
      steps.push({ BusTransfer: { source: 'REGS', dest: 'TMP', value: preA } });
      steps.push({ BusTransfer: { source: 'REGS', dest: 'ACC', value: preB } });
      steps.push({
        AluOperation: {
          op: opName, input_a: preA, input_b: preB,
          result: { value: postA, carry: flags.carry, zero: flags.zero, a_larger: flags.a_larger, equal: flags.equal },
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
    // LOAD / LOAD32
    else if (opcode === OP.LOAD || opcode === OP.LOAD32) {
      const mAddr = readAddr24(maskedAddr + 2);
      steps.push({ BusTransfer: { source: { Immediate: mAddr }, dest: 'MAR', value: mAddr } });
      steps.push({ BusTransfer: { source: 'RAM', dest: 'REGS', value: postA } });
    }
    // STORE / STORE32
    else if (opcode === OP.STORE || opcode === OP.STORE32) {
      const mAddr = readAddr24(maskedAddr + 2);
      steps.push({ BusTransfer: { source: { Immediate: mAddr }, dest: 'MAR', value: mAddr } });
      steps.push({ BusTransfer: { source: 'REGS', dest: 'RAM', value: preA } });
    }
    // LDRI / LDRI32
    else if (opcode === OP.LDRI || opcode === OP.LDRI32) {
      steps.push({ BusTransfer: { source: 'REGS', dest: 'MAR', value: preB } });
      steps.push({ BusTransfer: { source: 'RAM', dest: 'REGS', value: postA } });
    }
    // STRI / STRI32
    else if (opcode === OP.STRI || opcode === OP.STRI32) {
      steps.push({ BusTransfer: { source: 'REGS', dest: 'MAR', value: preB } });
      steps.push({ BusTransfer: { source: 'REGS', dest: 'RAM', value: preA } });
    }
    // PUSH
    else if (opcode === OP.PUSH) {
      steps.push({ BusTransfer: { source: 'SP', dest: 'MAR', value: this.cpu.get_sp() } });
      steps.push({ BusTransfer: { source: 'REGS', dest: 'RAM', value: preA } });
    }
    // POP
    else if (opcode === OP.POP) {
      steps.push({ BusTransfer: { source: 'SP', dest: 'MAR', value: this.cpu.get_sp() - 4 } });
      steps.push({ BusTransfer: { source: 'RAM', dest: 'REGS', value: postA } });
    }
    // Jumps
    else if (opcode >= OP.JMP && opcode <= OP.JE || opcode === OP.JZ || opcode === OP.JNZ) {
      const target = readAddr24(maskedAddr + 1);
      steps.push({ BusTransfer: { source: { Immediate: target }, dest: 'IAR', value: target } });
    }
    else if (opcode === OP.JMPR) {
      steps.push({ BusTransfer: { source: 'REGS', dest: 'IAR', value: preA } });
    }
    else if (opcode === OP.CALL) {
      const target = readAddr24(maskedAddr + 1);
      steps.push({ BusTransfer: { source: 'SP', dest: 'MAR', value: this.cpu.get_sp() } });
      steps.push({ BusTransfer: { source: 'IAR', dest: 'RAM', value: addr + 4 } });
      steps.push({ BusTransfer: { source: { Immediate: target }, dest: 'IAR', value: target } });
    }
    else if (opcode === OP.RET) {
      steps.push({ BusTransfer: { source: 'SP', dest: 'MAR', value: this.cpu.get_sp() - 4 } });
      steps.push({ BusTransfer: { source: 'RAM', dest: 'IAR', value: this.cpu.get_iar() } });
    }
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
    const maskedIar = this.cpu.get_iar() & MEM_MASK;
    return {
      r,
      acc: 0,
      tmp: 0,
      iar: this.cpu.get_iar(),
      ir: this.memoryView[maskedIar] ?? 0,
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

  poke(address: number, value: number): void {
    this.cpu.poke(address & MEM_MASK, value & 0xFF);
  }

  getConsoleOutput(): number[] { return [...this.consoleBuffer]; }
  clearConsole(): void { this.consoleBuffer = []; }

  getSnapshot(): Snapshot {
    return {
      state: this.getState(),
      memory: this.getAllMemory(),
      console: [...this.consoleBuffer],
    };
  }

  restoreSnapshot(snap: Snapshot): void {
    this.cpu.hard_reset();
    this.refreshView();

    // Restore memory directly into WASM buffer
    this.memoryView.set(snap.memory);

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
