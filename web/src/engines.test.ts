// The JS engine (MockComputer) and the Rust/WASM engine (WasmComputer) must
// behave identically. Every sample program and every edge-case program runs on
// both, instruction by instruction and in UI-sized batches; any difference in
// PC, SP, registers, flags, cycles, halt, fault, console or memory fails.
// Needs the built WASM: `npm run build:wasm`.
import { describe, it, expect, beforeAll } from 'vitest';
import { assemble } from './assembler';
import { SAMPLE_PROGRAMS } from './samples';
import { MockComputer, OP, buildDefaultPalette, instrSize, getOpcodeName, type IComputer } from './wasm-bridge';
import { WasmComputer } from './wasm-cpu';
import { newJs, newWasm, loadWasm, lockstep, batched, allDiff, cpuDiff } from './test/engines';
import { TARGETED, type Targeted } from './test/targeted';
import { Asm } from './test/asm';

const LOCKSTEP_STEPS = 200_000;    // per sample
const BATCHED_STEPS = 20_000_000;  // per sample
const BATCH = 100_000;

// Inputs for the samples that read the console
const INPUTS: Record<string, number[]> = {
  echo: [72, 105, 33, 0], adder: [12, 30, 0], calc: [6, 42, 7, 100, 47, 7, 5, 45, 9, 0],
};

let js: MockComputer;
let wasm: WasmComputer;

beforeAll(async () => {
  js = newJs();
  wasm = await newWasm();
});

function sampleBytes(key: string): Uint8Array {
  const s = SAMPLE_PROGRAMS[key];
  if (s.bytes && s.bytes.length) return new Uint8Array(s.bytes);
  const r = assemble(s.code);
  expect(r.errors, `sample ${key} assembles`).toEqual([]);
  return new Uint8Array(r.bytes);
}

describe('samples run identically on both engines', () => {
  for (const key of Object.keys(SAMPLE_PROGRAMS)) {
    it(key, () => {
      const bytes = sampleBytes(key);
      const inputs = INPUTS[key] ?? [1, 2, 3, 0];
      const ls = lockstep(js, wasm, bytes, inputs, LOCKSTEP_STEPS);
      expect(ls.fault, `${key} faulted`).toBeNull();
      const bt = batched(js, wasm, bytes, inputs, BATCHED_STEPS, BATCH);
      expect(bt.fault, `${key} faulted`).toBeNull();
    });
  }
});

function checkExpect(name: string, t: Targeted, c: IComputer, engine: string) {
  const where = `${name} on ${engine}`;
  const s = c.getState();
  for (const [ri, v] of Object.entries(t.expect ?? {})) {
    expect(s.r[+ri] >>> 0, `${where}: R${ri}`).toBe(v >>> 0);
  }
  if (t.expectSp !== undefined) expect(s.sp >>> 0, `${where}: SP`).toBe(t.expectSp);
  if (t.expectPc !== undefined) expect(s.iar >>> 0, `${where}: PC`).toBe(t.expectPc);
  for (const [a, v] of t.expectMem ?? []) expect(c.getMemory(a, 1)[0], `${where}: mem[0x${a.toString(16)}]`).toBe(v);
  expect(c.getFault(), `${where}: fault`).toBe(t.expectFault ?? null);
  if (t.expectConsole) expect(c.getConsoleOutput(), `${where}: console`).toEqual(t.expectConsole);
  expect(c.isHalted(), `${where}: halted`).toBe(true);
}

describe('edge-case programs: both engines agree and match the spec', () => {
  for (const [name, t] of Object.entries(TARGETED)) {
    it(name, () => {
      const max = t.maxSteps ?? 100_000;
      // single steps (traces compared on every step)
      lockstep(js, wasm, t.bytes, t.inputs ?? [], max, { traceEvery: 1, memEvery: max > 10_000 ? 1000 : 1 });
      checkExpect(name, t, js, 'js (stepped)');
      checkExpect(name, t, wasm, 'wasm (stepped)');
      // UI-sized batches
      batched(js, wasm, t.bytes, t.inputs ?? [], max, 1000);
      checkExpect(name, t, js, 'js (batched)');
      checkExpect(name, t, wasm, 'wasm (batched)');
    });
  }
});

// ── Engine features, checked on both engines ──────────────────────────────

function both(): Array<[string, IComputer]> { return [['js', js], ['wasm', wasm]]; }

describe('engine features', () => {
  it('default palette is byte-identical (all 256 entries)', () => {
    const fresh: Array<[string, IComputer]> = [['js', new MockComputer()], ['wasm', wasm]];
    wasm.hardReset();
    const want = buildDefaultPalette();
    for (const [name, c] of fresh) expect(c.getMemory(0x3E0000, 1024), name).toEqual(want);
    expect(want.slice(16 * 4, 16 * 4 + 3)).toEqual([153, 23, 23]);
  });

  it('opcode table: FPMUL16 is 0x2C, 2 bytes', () => {
    expect(OP.FPMUL16).toBe(0x2C);
    expect(instrSize(OP.FPMUL16)).toBe(2);
    expect(getOpcodeName(0x2C)).toBe('FPMUL16');
    expect(getOpcodeName(0x2D)).toBe('???');
  });

  it('vsync flips on a single step and yields a batch after the STORE', () => {
    const p = new Asm().mem('STORE', 0, 0x3FFFFF).data(1, 1).halt().bytes();
    for (const [name, c] of both()) {
      c.loadProgram(p);
      c.poke(0x3C0000, 9);
      c.step();
      expect(c.getMemory(0x3D0000, 1)[0], name).toBe(9);
      c.loadProgram(p);
      c.poke(0x3C0000, 5);
      expect(c.run(100), name).toBe(1);
      expect(c.getMemory(0x3D0000, 1)[0], name).toBe(5);
      expect(c.getPc(), name).toBe(5);
    }
  });

  it('breakpoint on the first instruction stops, resumes once, and step() ignores it', () => {
    // loop: DATA R1,1 ; ADD R0,R1 ; JMP loop
    const p = new Asm().label('l').data(1, 1).rr('ADD', 0, 1).jump('JMP', 'l').bytes();
    for (const [name, c] of both()) {
      c.loadProgram(p);
      c.addBreakpoint(0);
      expect(c.run(100), name).toBe(0);
      expect(c.getPc(), name).toBe(0);
      expect(c.run(100), name).toBe(3);
      expect(c.getRegister(0), name).toBe(1);
      expect(c.run(100), name).toBe(3);
      c.step();
      expect(c.getPc(), name).toBe(6);
      c.addBreakpoint(6);
      c.step();
      expect(c.getPc(), name).toBe(8);
      c.removeBreakpoint(0);
      c.removeBreakpoint(6);
    }
  });

  it('a breakpoint reached at the end of a batch stops the next batch', () => {
    const p = new Asm().data(0, 1).data(1, 2).data(2, 3).halt().bytes();
    for (const [name, c] of both()) {
      c.loadProgram(p);
      c.addBreakpoint(6);
      expect(c.run(1), name).toBe(1);
      expect(c.run(100), name).toBe(0);
      expect(c.getRegister(1), name).toBe(0);
      c.removeBreakpoint(6);
    }
  });

  it('faults: message, halt, IAR on the instruction, cleared by reset and load', () => {
    const p = new Asm().data(0, 1).jump('JMP', 0x140).org(0x140).db(0x2D, 0).bytes();
    for (const [name, c] of both()) {
      expect(c.getFault(), name).toBeNull();
      c.loadProgram(p);
      expect(c.run(100), name).toBe(2);
      expect(c.getFault(), name).toBe('Illegal opcode 0x2D at 0x000140');
      expect(c.isHalted(), name).toBe(true);
      expect(c.getPc(), name).toBe(0x140);
      expect(c.getCycleCount(), name).toBe(2);
      const t = c.step();
      expect(t.halted && t.error, name).toBe('Illegal opcode 0x2D at 0x000140');
      c.reset();
      expect(c.getFault(), name).toBeNull();
      expect(c.isHalted(), name).toBe(false);
      c.loadProgram(new Asm().mem('STORE32', 0, 0x3FFFFE).halt().bytes());
      const tr = c.step();
      expect(tr.error, name).toBe('32-bit access at 0x3FFFFE runs past the end of RAM (0x3FFFFF)');
      c.loadProgram(new Asm().halt().bytes());
      expect(c.getFault(), name).toBeNull();
      c.loadProgram(p);
      c.run(100);
      c.hardReset();
      expect(c.getFault(), name).toBeNull();
    }
  });

  it('cycle counter passes 2^32 without wrapping, also across a switch', () => {
    const p = new Asm().label('l').data(0, 1).jump('JMP', 'l').bytes();
    js.loadProgram(p);
    const snap = js.getSnapshot();
    snap.state.cycle_count = 2 ** 32 - 2;
    for (const [name, c] of both()) {
      c.restoreSnapshot(snap);
      c.run(5);
      expect(c.getCycleCount(), name).toBe(2 ** 32 + 3);
      expect(c.getState().cycle_count, name).toBe(2 ** 32 + 3);
    }
    snap.state.cycle_count = 5_000_000_000;
    wasm.restoreSnapshot(snap);
    expect(wasm.getCycleCount()).toBe(5_000_000_000);
  });

  it('snapshots carry a pending IN, the fault and a breakpoint resume across engines', () => {
    const p = new Asm().data(1, 7).rr('IN', 3).rr('OUT', 3).halt().bytes();
    for (const [from, to] of [[js, wasm], [wasm, js]] as Array<[IComputer, IComputer]>) {
      from.loadProgram(p);
      from.run(10);
      expect(from.isWaitingForInput()).toBe(true);
      to.restoreSnapshot(from.getSnapshot());
      expect(to.isWaitingForInput()).toBe(true);
      expect(to.getInputRequest()).toEqual({ register: 3 });
      expect(to.run(10)).toBe(0);
      to.provideInput(0x41);
      to.run(10);
      expect(to.isHalted()).toBe(true);
      expect(to.getConsoleOutput()).toEqual([0x41]);
      expect(allDiff(from, to).length).toBeGreaterThan(0); // `from` is still waiting

      // fault
      from.loadProgram(new Asm().db(0xEE, 0).bytes());
      from.run(10);
      to.restoreSnapshot(from.getSnapshot());
      expect(to.getFault()).toBe('Illegal opcode 0xEE at 0x000000');
      expect(to.isHalted()).toBe(true);
      expect(allDiff(from, to)).toEqual([]);

      // stopped at a breakpoint: the other engine resumes past it
      const loop = new Asm().label('l').data(1, 1).rr('ADD', 0, 1).jump('JMP', 'l').bytes();
      from.loadProgram(loop);
      from.addBreakpoint(0); to.addBreakpoint(0);
      expect(from.run(100)).toBe(0);
      to.restoreSnapshot(from.getSnapshot());
      expect(to.run(100)).toBe(3);
      from.removeBreakpoint(0); to.removeBreakpoint(0);

      // old snapshots without the new fields still restore
      from.loadProgram(p);
      const old = from.getSnapshot();
      delete old.inputWaiting; delete old.inputRegister; delete old.fault; delete old.breakpointResume;
      to.restoreSnapshot(old);
      expect(cpuDiff(from, to)).toEqual([]);
    }
  });

  it('step() traces: FPMUL/FPMUL16 go through the ALU; STORE/STRI show the byte, STORE32/STRI32 the word', () => {
    const p = new Asm()
      .data(0, 0x1234).data(1, 0x20000).rr('FPMUL', 0, 1).rr('FPMUL16', 0, 1)
      .data(2, 0x11223344).mem('STORE', 2, 0x1000).mem('STORE32', 2, 0x1004)
      .data(3, 0x2000).rr('STRI', 2, 3).rr('STRI32', 2, 3)
      .rr('CMP', 2, 3).halt().bytes();
    const traces: Record<string, string[]> = {};
    for (const [name, c] of both()) {
      c.loadProgram(p);
      const list: string[] = [];
      for (let i = 0; i < 11; i++) {
        const t = c.step();
        list.push(JSON.stringify(t));
        const alu = t.steps.find(s => s.AluOperation)?.AluOperation;
        const toRam = t.steps.find(s => s.BusTransfer?.dest === 'RAM')?.BusTransfer?.value;
        if (t.opcode === 'FPMUL') expect(alu?.result.value, name).toBe((0x1234 * 0x20000) / 256);
        if (t.opcode === 'FPMUL16') expect(alu?.input_b, name).toBe(0x20000);
        if (t.opcode === 'STORE' || t.opcode === 'STRI') expect(toRam, `${name} ${t.opcode}`).toBe(0x44);
        if (t.opcode === 'STORE32' || t.opcode === 'STRI32') expect(toRam, `${name} ${t.opcode}`).toBe(0x11223344);
        if (t.opcode === 'CMP') expect(alu?.result.value, name).toBe((0x11223344 - 0x2000) >>> 0);
      }
      traces[name] = list;
    }
    expect(traces.wasm).toEqual(traces.js);
  });

  it('dispose() frees the WASM CPU; creating and disposing does not grow memory', async () => {
    const w = await loadWasm();
    const first = await newWasm();
    first.dispose();
    first.dispose(); // twice is harmless
    const before = w.memory.buffer.byteLength;
    for (let i = 0; i < 5; i++) (await newWasm()).dispose();
    expect(w.memory.buffer.byteLength).toBe(before);
    new MockComputer().dispose();
    // the shared engine still works after others were freed
    wasm.loadProgram(new Asm().data(0, 3).halt().bytes());
    wasm.run(10);
    expect(wasm.getRegister(0)).toBe(3);
  });
});
