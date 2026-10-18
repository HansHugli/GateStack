// Test helpers: load the built WASM core in Node, and compare two engines.
// The WASM is built by `npm run build:wasm` (wasm-pack --target bundler).
import fs from 'node:fs';
import { MockComputer, type IComputer } from '../wasm-bridge';
import { WasmComputer } from '../wasm-cpu';
// @ts-ignore — generated JS glue without its own .d.ts
import * as bg from '../wasm/gatestack_core_bg.js';

let loaded: { WasmCpu: any; memory: WebAssembly.Memory } | null = null;

/** Instantiates the WASM module once (the bundler glue expects the host to do it). */
export async function loadWasm(): Promise<{ WasmCpu: any; memory: WebAssembly.Memory }> {
  if (loaded) return loaded;
  const bytes = fs.readFileSync(new URL('../wasm/gatestack_core_bg.wasm', import.meta.url));
  const { instance } = await WebAssembly.instantiate(bytes, { './gatestack_core_bg.js': bg as any });
  (bg as any).__wbg_set_wasm(instance.exports);
  (instance.exports as any).__wbindgen_start?.();
  loaded = { WasmCpu: (bg as any).WasmCpu, memory: instance.exports.memory as WebAssembly.Memory };
  return loaded;
}

export async function newWasm(): Promise<WasmComputer> {
  const w = await loadWasm();
  return new WasmComputer(new w.WasmCpu(), w.memory);
}

export function newJs(): MockComputer { return new MockComputer(); }

// ── Comparison ──────────────────────────────────────────────────────────────

export const REGIONS: Array<[string, number, number]> = [
  ['ram', 0, 0x3C0000], ['back', 0x3C0000, 0x3D0000], ['front', 0x3D0000, 0x3E0000],
  ['palette', 0x3E0000, 0x3E0400], ['io', 0x3E0400, 0x400000],
];

const hx = (n: number) => '0x' + (n >>> 0).toString(16).toUpperCase();

function raw(c: IComputer): Uint8Array { return c.getRawMemory() as unknown as Uint8Array; }

/** Differences in PC, SP, registers, flags, cycles, halt, input wait, fault and console length. */
export function cpuDiff(a: IComputer, b: IComputer): string[] {
  const sa = a.getState(), sb = b.getState(), d: string[] = [];
  if (sa.iar >>> 0 !== sb.iar >>> 0) d.push(`PC ${hx(sa.iar)} vs ${hx(sb.iar)}`);
  if (sa.sp >>> 0 !== sb.sp >>> 0) d.push(`SP ${hx(sa.sp)} vs ${hx(sb.sp)}`);
  if (sa.cycle_count !== sb.cycle_count) d.push(`cycles ${sa.cycle_count} vs ${sb.cycle_count}`);
  for (let i = 0; i < 16; i++) if (sa.r[i] >>> 0 !== sb.r[i] >>> 0) d.push(`R${i} ${hx(sa.r[i])} vs ${hx(sb.r[i])}`);
  const f = (s: typeof sa) => `${+s.flags.carry}${+s.flags.zero}${+s.flags.a_larger}${+s.flags.equal}`;
  if (f(sa) !== f(sb)) d.push(`flags(CZAE) ${f(sa)} vs ${f(sb)}`);
  if (sa.halted !== sb.halted) d.push(`halted ${sa.halted} vs ${sb.halted}`);
  if (a.isWaitingForInput() !== b.isWaitingForInput()) d.push(`input wait ${a.isWaitingForInput()} vs ${b.isWaitingForInput()}`);
  if (a.getFault() !== b.getFault()) d.push(`fault ${a.getFault()} vs ${b.getFault()}`);
  const ca = a.getConsoleOutput(), cb = b.getConsoleOutput();
  if (ca.length !== cb.length) d.push(`console length ${ca.length} vs ${cb.length}`);
  return d;
}

/** Differences in console text and the RAM / VRAM / palette regions. */
export function memDiff(a: IComputer, b: IComputer): string[] {
  const d: string[] = [];
  const ca = a.getConsoleOutput().join(','), cb = b.getConsoleOutput().join(',');
  if (ca !== cb) d.push(`console [${ca.slice(-60)}] vs [${cb.slice(-60)}]`);
  const ma = raw(a), mb = raw(b);
  for (const [name, lo, hi] of REGIONS) {
    const ba = Buffer.from(ma.buffer, ma.byteOffset + lo, hi - lo);
    const bb = Buffer.from(mb.buffer, mb.byteOffset + lo, hi - lo);
    if (!ba.equals(bb)) {
      let first = -1, count = 0;
      for (let i = 0; i < hi - lo; i++) if (ba[i] !== bb[i]) { if (first < 0) first = i; count++; }
      d.push(`mem.${name} first@${hx(lo + first)} ${hx(ba[first])} vs ${hx(bb[first])} (${count} bytes differ)`);
    }
  }
  return d;
}

export function allDiff(a: IComputer, b: IComputer): string[] {
  return [...cpuDiff(a, b), ...memDiff(a, b)];
}

/** Feeds the next input when the engine waits; false when inputs ran out. */
export function feed(c: IComputer, inputs: number[], idx: { i: number }): boolean {
  if (!c.isWaitingForInput()) return true;
  if (idx.i >= inputs.length) return false;
  c.provideInput(inputs[idx.i++]);
  return true;
}

export interface RunResult { steps: number; halted: boolean; fault: string | null; console: string }

/**
 * Runs both engines one instruction at a time (run(1), and step() every
 * `traceEvery` instructions with the traces compared) for up to `max`
 * instructions. Throws on the first divergence.
 */
export function lockstep(js: IComputer, wasm: IComputer, bytes: Uint8Array, inputs: number[], max: number,
  opts: { memEvery?: number; traceEvery?: number } = {}): RunResult {
  const memEvery = opts.memEvery ?? 5000, traceEvery = opts.traceEvery ?? 97;
  js.loadProgram(bytes); wasm.loadProgram(bytes);
  const ij = { i: 0 }, iw = { i: 0 };
  const fail = (step: number, pc: number, what: string[]) => {
    throw new Error(`lockstep diverged at step ${step} (pc ${hx(pc)}):\n  ${what.join('\n  ')}`);
  };
  let d = allDiff(js, wasm);
  if (d.length) fail(0, 0, d);
  let step = 0;
  for (; step < max; step++) {
    const okj = feed(js, inputs, ij), okw = feed(wasm, inputs, iw);
    if (!okj || !okw || js.isHalted()) break;
    const pc = js.getPc();
    if (step % traceEvery === 0) {
      const tj = JSON.stringify(js.step()), tw = JSON.stringify(wasm.step());
      if (tj !== tw) fail(step + 1, pc, [`trace js  : ${tj}`, `trace wasm: ${tw}`]);
    } else {
      const nj = js.run(1), nw = wasm.run(1);
      if (nj !== nw) fail(step + 1, pc, [`run(1) returned ${nj} vs ${nw}`]);
    }
    d = cpuDiff(js, wasm);
    if (d.length) fail(step + 1, pc, d.concat(memDiff(js, wasm)));
    if ((step + 1) % memEvery === 0) {
      d = memDiff(js, wasm);
      if (d.length) fail(step + 1, pc, d);
    }
  }
  d = allDiff(js, wasm);
  if (d.length) fail(step, js.getPc(), d);
  return { steps: step, halted: js.isHalted(), fault: js.getFault(), console: String.fromCharCode(...js.getConsoleOutput().slice(0, 400)) };
}

/** Runs both engines in run(batch) slices, like the UI, comparing after every slice. */
export function batched(js: IComputer, wasm: IComputer, bytes: Uint8Array, inputs: number[], max: number,
  batch = 100_000): RunResult & { calls: number; flips: number } {
  js.loadProgram(bytes); wasm.loadProgram(bytes);
  const ij = { i: 0 }, iw = { i: 0 };
  let total = 0, calls = 0, flips = 0;
  const front = () => Buffer.from(raw(js).buffer, raw(js).byteOffset + 0x3D0000, 0x10000).toString('base64');
  let lastFront = front();
  while (total < max) {
    const okj = feed(js, inputs, ij), okw = feed(wasm, inputs, iw);
    if (!okj || !okw || js.isHalted()) break;
    const pc = js.getPc();
    const nj = js.run(batch), nw = wasm.run(batch);
    calls++; total += nj;
    const d = cpuDiff(js, wasm);
    if (nj !== nw) d.push(`run() returned ${nj} vs ${nw}`);
    if (d.length || calls % 8 === 0 || js.isHalted()) d.push(...memDiff(js, wasm));
    if (d.length) throw new Error(`batched run diverged in call ${calls} (from pc ${hx(pc)}, ${total} instructions):\n  ${d.join('\n  ')}`);
    if (calls % 8 === 0) { const f = front(); if (f !== lastFront) { flips++; lastFront = f; } }
    if (nj === 0 && !js.isWaitingForInput()) break;
  }
  const d = allDiff(js, wasm);
  if (d.length) throw new Error(`batched run diverged at the end:\n  ${d.join('\n  ')}`);
  return { steps: total, calls, flips, halted: js.isHalted(), fault: js.getFault(), console: String.fromCharCode(...js.getConsoleOutput().slice(0, 400)) };
}
