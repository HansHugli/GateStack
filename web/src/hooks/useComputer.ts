// ============================================================================
// useComputer.ts — React hook for managing computer state
// ============================================================================
// Undo (Step Back) keeps a snapshot before every manual Step and one when Run
// starts, so Back after a Run returns to where the Run began. Snapshots are
// stored as patches (see undoHistory.ts), never once per animation frame.
// ============================================================================

import { useState, useCallback, useRef, useEffect } from 'react';
import { createComputer, IComputer, CpuState, CycleTrace, EngineType } from '../wasm-bridge';
import { UndoHistory } from './undoHistory';
import { RingBuffer } from './ringBuffer';

/**
 * Methods from the shared engine contract that may not exist on every engine
 * build yet: `getFault` (why the CPU halted on a fault) and `dispose` (free the
 * WASM memory). Always call them with optional chaining.
 */
type EngineExtras = {
  getFault?: () => string | null;
  dispose?: () => void;
};
type Engine = IComputer & EngineExtras;

const engineFault = (c: Engine | null): string | null => {
  try { return c?.getFault?.() ?? null; } catch { return null; }
};
const disposeEngine = (c: Engine | null) => {
  try { c?.dispose?.(); } catch (e) { console.warn('dispose failed:', e); }
};

/** Why the CPU is not running. */
export type StopReason =
  | { kind: 'breakpoint'; address: number }
  | { kind: 'input'; register: number }
  | { kind: 'halt' }
  | { kind: 'fault'; message: string }
  | { kind: 'paused' }
  | null;

export interface ComputerHook {
  // State
  state: CpuState | null;
  /** CPU state before the last Step or Run (for "changed" highlights). */
  prevState: CpuState | null;
  memory: number[];
  memoryVersion: number;
  trace: CycleTrace | null;
  traceHistory: CpuState[];
  isRunning: boolean;
  isReady: boolean;
  breakpoints: Set<number>;
  consoleOutput: number[];
  canStepBack: boolean;
  waitingForInput: { register: number } | null;
  /** Fault message from the engine, e.g. "Illegal opcode 0x2D at 0x000140". */
  fault: string | null;
  stopReason: StopReason;
  engineType: EngineType;
  wasmAvailable: boolean;
  /** Why the JS engine is running instead of WASM, when that wasn't chosen. */
  engineNote: string | null;
  cyclesPerSec: number;

  // Actions
  loadProgram: (bytes: number[], opts?: { keepBreakpoints?: boolean }) => void;
  step: () => void;
  stepBack: () => void;
  run: () => void;
  pause: () => void;
  reset: () => void;
  hardReset: () => void;
  setSpeed: (cyclesPerFrame: number) => void;
  poke: (addr: number, value: number) => void;
  pokeRaw: (addr: number, value: number) => void;
  refresh: () => void;
  toggleBreakpoint: (addr: number) => void;
  clearBreakpoints: () => void;
  clearConsole: () => void;
  submitInput: (value: number, displayText?: string) => void;
  switchEngine: (engine: EngineType) => void;
}

export const HISTORY_SIZE = 64;
/** Console bytes kept for display; older output scrolls away. */
export const CONSOLE_DISPLAY_CAP = 64 * 1024;

/** Why WASM could not start, for the engine badge. */
async function wasmUnavailableReason(): Promise<string> {
  if (typeof WebAssembly === 'undefined') return 'this browser has no WebAssembly support';
  try {
    // The smallest valid module: "\0asm" + version 1.
    await WebAssembly.compile(new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]));
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (/unsafe-eval|Content Security Policy|CSP/i.test(msg)) {
      return "the page's Content Security Policy blocks WebAssembly (it needs 'wasm-unsafe-eval')";
    }
    return `WebAssembly failed: ${msg}`;
  }
  return 'the WASM module did not load (details in the developer console)';
}

export function useComputer(initialProgram?: number[]): ComputerHook {
  const computerRef = useRef<Engine | null>(null);
  const runningRef = useRef(false);
  const wasRunningRef = useRef(false); // run was active when IN paused it
  const speedRef = useRef(100);
  const undo = useRef(new UndoHistory(HISTORY_SIZE));
  const cpuHistory = useRef(new RingBuffer<CpuState>(HISTORY_SIZE));
  const breakpointsRef = useRef<Set<number>>(new Set());
  const switchingRef = useRef(false);

  const [state, setState] = useState<CpuState | null>(null);
  const [prevState, setPrevState] = useState<CpuState | null>(null);
  const memoryRef = useRef<number[]>(new Array(0));
  const [memoryVersion, setMemoryVersion] = useState(0);
  const [trace, setTrace] = useState<CycleTrace | null>(null);
  const [traceHistory, setTraceHistory] = useState<CpuState[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [breakpoints, setBreakpointsState] = useState<Set<number>>(new Set());
  const [consoleOutput, setConsoleOutput] = useState<number[]>([]);
  const [canStepBack, setCanStepBack] = useState(false);
  const [waitingForInput, setWaitingForInput] = useState<{ register: number } | null>(null);
  const [fault, setFault] = useState<string | null>(null);
  const [stopReason, setStopReason] = useState<StopReason>(null);
  const [engineType, setEngineType] = useState<EngineType>('js');
  const [wasmAvailable, setWasmAvailable] = useState(false);
  const [engineNote, setEngineNote] = useState<string | null>(null);
  const [cyclesPerSec, setCyclesPerSec] = useState(0);

  const perfRef = useRef({ lastTime: 0, lastCycles: 0, cps: 0 });
  const consoleSeenRef = useRef({ length: -1, last: -1 });

  const setBreakpoints = useCallback((next: Set<number>) => {
    breakpointsRef.current = next;
    setBreakpointsState(next);
  }, []);

  const refreshState = useCallback((forceConsole = false) => {
    const c = computerRef.current;
    if (!c) return null;
    const s = c.getState();
    setState(s);
    memoryRef.current = c.getRawMemory();
    setMemoryVersion(v => v + 1);
    const out = c.getConsoleOutput();
    const seen = consoleSeenRef.current;
    const last = out.length ? out[out.length - 1] : -1;
    if (forceConsole || out.length !== seen.length || last !== seen.last) {
      consoleSeenRef.current = { length: out.length, last };
      setConsoleOutput(out.length > CONSOLE_DISPLAY_CAP ? out.slice(-CONSOLE_DISPLAY_CAP) : out);
    }
    setWaitingForInput(c.getInputRequest());
    setFault(engineFault(c));
    return s;
  }, []);

  useEffect(() => {
    let cancelled = false;
    createComputer().then(async result => {
      if (cancelled) {
        // React StrictMode mounts twice in development: free the first engine.
        disposeEngine(result.computer as Engine);
        return;
      }
      computerRef.current = result.computer as Engine;
      setEngineType(result.engine);
      setWasmAvailable(result.wasmAvailable);
      if (initialProgram) result.computer.loadProgram(new Uint8Array(initialProgram));
      setIsReady(true);
      refreshState(true);
      if (result.engine !== 'wasm') {
        const why = await wasmUnavailableReason();
        if (!cancelled) setEngineNote(why);
      }
    });
    return () => {
      cancelled = true;
      runningRef.current = false;
    };
  }, []);

  const recordCpuHistory = useCallback((s: CpuState) => {
    cpuHistory.current.push(s);
    setTraceHistory(cpuHistory.current.toArray());
  }, []);

  const saveSnapshot = useCallback(() => {
    const c = computerRef.current;
    if (!c) return;
    undo.current.push(c.getSnapshot());
    setCanStepBack(true);
  }, []);

  const clearHistory = useCallback(() => {
    undo.current.clear();
    cpuHistory.current.clear();
    setTraceHistory([]);
    setCanStepBack(false);
    setPrevState(null);
  }, []);

  const loadProgram = useCallback((bytes: number[], opts?: { keepBreakpoints?: boolean }) => {
    const c = computerRef.current;
    if (!c) return;
    runningRef.current = false;
    wasRunningRef.current = false;
    setIsRunning(false);
    c.loadProgram(new Uint8Array(bytes));
    c.clearConsole();
    if (!opts?.keepBreakpoints) {
      breakpointsRef.current.forEach(a => c.removeBreakpoint(a));
      setBreakpoints(new Set());
    }
    clearHistory();
    setTrace(null);
    setStopReason(null);
    refreshState(true);
  }, [refreshState, clearHistory, setBreakpoints]);

  const step = useCallback(() => {
    const c = computerRef.current;
    if (!c || runningRef.current || c.isWaitingForInput() || c.isHalted()) return;
    const before = c.getState();
    saveSnapshot();
    const t = c.step();
    setTrace(t);
    setPrevState(before);
    const s = refreshState();
    if (s) recordCpuHistory(s);
    const f = engineFault(c);
    const req = c.getInputRequest();
    setStopReason(f ? { kind: 'fault', message: f }
      : req ? { kind: 'input', register: req.register }
      : c.isHalted() ? { kind: 'halt' }
      : null);
  }, [refreshState, recordCpuHistory, saveSnapshot]);

  const stepBack = useCallback(() => {
    const c = computerRef.current;
    if (!c || runningRef.current) return;
    const snap = undo.current.pop();
    if (!snap) return;
    c.restoreSnapshot(snap);
    cpuHistory.current.pop();
    setTraceHistory(cpuHistory.current.toArray());
    setCanStepBack(undo.current.size > 0);
    setPrevState(null);
    setTrace(null);
    setStopReason(null);
    refreshState(true);
  }, [refreshState]);

  const run = useCallback(() => {
    const c = computerRef.current;
    if (!c || runningRef.current || c.isHalted() || c.isWaitingForInput()) return;

    runningRef.current = true;
    setIsRunning(true);
    setCyclesPerSec(0);
    setStopReason(null);
    setTrace(null); // the views show the datapath only for single steps
    setPrevState(c.getState());
    perfRef.current = { lastTime: performance.now(), lastCycles: c.getCycleCount(), cps: 0 };

    // One snapshot per Run, so Back returns to where this Run started.
    saveSnapshot();

    // If sitting on a breakpoint, step past it first.
    if (breakpointsRef.current.has(c.getPc())) c.step();

    const stop = (reason: StopReason) => {
      runningRef.current = false;
      setIsRunning(false);
      setStopReason(reason);
      // Leave ALU/Bus idle instead of showing a trace from before the Run.
      setTrace(null);
    };

    const tick = () => {
      const cpu = computerRef.current;
      if (!runningRef.current || !cpu) {
        if (runningRef.current) stop({ kind: 'paused' });
        return;
      }
      try {
        const speed = speedRef.current;
        const bps = breakpointsRef.current; // read live, so toggling during Run works
        let executed = 0;

        // Always respect vsync breaks for proper video rendering
        cpu.setSkipVsync(false);

        if (speed <= 10) {
          for (let i = 0; i < speed; i++) {
            if (cpu.isHalted() || cpu.isWaitingForInput()) break;
            if (bps.has(cpu.getPc())) break;
            cpu.step();
            executed++;
          }
        } else if (speed >= 10000000) {
          // Time-budgeted execution: run batches until ~14ms elapsed or vsync
          const BATCH = 5000000;
          const deadline = performance.now() + 14;
          while (performance.now() < deadline) {
            const n = cpu.run(BATCH);
            executed += n;
            if (n < BATCH) break; // halt, breakpoint, input or vsync
          }
        } else {
          executed = cpu.run(speed);
        }

        const s = refreshState();
        if (s) cpuHistory.current.push(s);
        setTraceHistory(cpuHistory.current.toArray());

        // Track cycles/sec (update every ~500ms)
        const now = performance.now();
        const perf = perfRef.current;
        if (now - perf.lastTime >= 500) {
          const dt = (now - perf.lastTime) / 1000;
          const dc = cpu.getCycleCount() - perf.lastCycles;
          if (dt > 0 && dc >= 0) {
            perf.cps = dc / dt;
            setCyclesPerSec(perf.cps);
          }
          perf.lastTime = now;
          perf.lastCycles = cpu.getCycleCount();
        }

        const f = engineFault(cpu);
        const pc = cpu.getPc();
        const req = cpu.getInputRequest();
        if (req) {
          // Pause for input — remember we were running so we can resume
          wasRunningRef.current = true;
          stop({ kind: 'input', register: req.register });
        } else if (f) {
          stop({ kind: 'fault', message: f });
        } else if (cpu.isHalted()) {
          stop({ kind: 'halt' });
        } else if (bps.has(pc)) {
          stop({ kind: 'breakpoint', address: pc });
        } else {
          requestAnimationFrame(tick);
        }
      } catch (e) {
        console.error('Run tick error:', e);
        stop({ kind: 'fault', message: `Engine error: ${(e as Error)?.message ?? e}` });
      }
    };
    requestAnimationFrame(tick);
  }, [refreshState, saveSnapshot]);

  const pause = useCallback(() => {
    if (runningRef.current) {
      runningRef.current = false;
      setIsRunning(false);
      setStopReason({ kind: 'paused' });
      setTrace(null);
    }
    wasRunningRef.current = false;
  }, []);

  const reset = useCallback(() => {
    pause();
    computerRef.current?.reset();
    clearHistory();
    setStopReason(null);
    setTrace(null);
    refreshState(true);
  }, [pause, refreshState, clearHistory]);

  const hardReset = useCallback(() => {
    pause();
    computerRef.current?.hardReset();
    clearHistory();
    setStopReason(null);
    setTrace(null);
    refreshState(true);
  }, [pause, refreshState, clearHistory]);

  const setSpeed = useCallback((cyclesPerFrame: number) => {
    speedRef.current = cyclesPerFrame;
  }, []);

  const poke = useCallback((addr: number, value: number) => {
    computerRef.current?.poke(addr, value);
    refreshState();
  }, [refreshState]);

  // Bulk-friendly: write without triggering re-render
  const pokeRaw = useCallback((addr: number, value: number) => {
    computerRef.current?.poke(addr, value);
  }, []);

  // Manual refresh trigger (call after bulk pokeRaw)
  const refresh = useCallback(() => { refreshState(); }, [refreshState]);

  const toggleBreakpoint = useCallback((addr: number) => {
    const c = computerRef.current;
    if (!c) return;
    const next = new Set(breakpointsRef.current);
    if (next.has(addr)) {
      next.delete(addr);
      c.removeBreakpoint(addr);
    } else {
      next.add(addr);
      c.addBreakpoint(addr);
    }
    setBreakpoints(next);
  }, [setBreakpoints]);

  const clearBreakpoints = useCallback(() => {
    const c = computerRef.current;
    if (!c) return;
    breakpointsRef.current.forEach(addr => c.removeBreakpoint(addr));
    setBreakpoints(new Set());
  }, [setBreakpoints]);

  const clearConsole = useCallback(() => {
    computerRef.current?.clearConsole();
    consoleSeenRef.current = { length: 0, last: -1 };
    setConsoleOutput([]);
  }, []);

  const submitInput = useCallback((value: number, displayText?: string) => {
    const c = computerRef.current;
    if (!c || !c.isWaitingForInput()) return;
    // Echo the user's typed text to the console so it appears in the output stream
    c.echoToConsole(displayText ?? (value >>> 0).toString());
    c.provideInput(value >>> 0);
    setStopReason(null);
    refreshState();
    // If we were running before the input pause, resume
    if (wasRunningRef.current) {
      wasRunningRef.current = false;
      run();
    }
  }, [refreshState, run]);

  const switchEngine = useCallback((engine: EngineType) => {
    if (engine === engineType || switchingRef.current) return;
    switchingRef.current = true;

    runningRef.current = false;
    wasRunningRef.current = false;
    setIsRunning(false);

    const oldComputer = computerRef.current;
    const snapshot = oldComputer?.getSnapshot();
    const oldBreakpoints = new Set(breakpointsRef.current);

    createComputer(engine).then(result => {
      const next = result.computer as Engine;
      if (snapshot) next.restoreSnapshot(snapshot);
      oldBreakpoints.forEach(addr => next.addBreakpoint(addr));
      computerRef.current = next;
      disposeEngine(oldComputer);
      setEngineType(result.engine);
      if (engine === 'wasm' && result.engine !== 'wasm') {
        wasmUnavailableReason().then(setEngineNote);
      } else if (result.engine === 'wasm') {
        setEngineNote(null);
      }
      // Undo snapshots belong to the old engine's state; start fresh.
      clearHistory();
      setTrace(null);
      setStopReason(null);
      refreshState(true);
    }).finally(() => { switchingRef.current = false; });
  }, [engineType, refreshState, clearHistory]);

  // Expose memory ref (no copy) + version for re-render triggers
  const memory = memoryRef.current;

  return {
    state, prevState, memory, memoryVersion, trace, traceHistory, isRunning, isReady,
    breakpoints, consoleOutput, canStepBack, waitingForInput, fault, stopReason,
    engineType, wasmAvailable, engineNote, cyclesPerSec,
    loadProgram, step, stepBack, run, pause, reset, hardReset,
    setSpeed, poke, pokeRaw, refresh, toggleBreakpoint, clearBreakpoints, clearConsole,
    submitInput, switchEngine,
  };
}
