// ============================================================================
// useComputer.ts — React hook for managing computer state
// ============================================================================

import { useState, useCallback, useRef, useEffect } from 'react';
import { createComputer, IComputer, CpuState, CycleTrace, EngineType } from '../wasm-bridge';

interface Snapshot {
  state: CpuState;
  memory: Uint8Array;
  console: number[];
}

export interface ComputerHook {
  // State
  state: CpuState | null;
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
  engineType: EngineType;
  wasmAvailable: boolean;
  cyclesPerSec: number;

  // Actions
  loadProgram: (bytes: number[]) => void;
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

const HISTORY_SIZE = 64;

export function useComputer(initialProgram?: number[]): ComputerHook {
  const computerRef = useRef<IComputer | null>(null);
  const runningRef = useRef(false);
  const wasRunningRef = useRef(false); // track if run was active when input paused
  const speedRef = useRef(100);
  // Full snapshots for undo (CPU + memory + console)
  const snapshotHistory = useRef<Snapshot[]>([]);
  // Lightweight CPU-only history for signal trace
  const cpuHistory = useRef<CpuState[]>([]);

  const [state, setState] = useState<CpuState | null>(null);
  const memoryRef = useRef<number[]>(new Array(4_194_304).fill(0));
  const [memoryVersion, setMemoryVersion] = useState(0);
  const [trace, setTrace] = useState<CycleTrace | null>(null);
  const [traceHistory, setTraceHistory] = useState<CpuState[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [breakpoints, setBreakpoints] = useState<Set<number>>(new Set());
  const [consoleOutput, setConsoleOutput] = useState<number[]>([]);
  const [canStepBack, setCanStepBack] = useState(false);
  const [waitingForInput, setWaitingForInput] = useState<{ register: number } | null>(null);
  const [engineType, setEngineType] = useState<EngineType>('js');
  const [wasmAvailable, setWasmAvailable] = useState(false);
  const [cyclesPerSec, setCyclesPerSec] = useState(0);

  // Performance tracking
  const perfRef = useRef({ lastTime: 0, lastCycles: 0, cps: 0 });

  useEffect(() => {
    let cancelled = false;
    createComputer().then(result => {
      if (cancelled) return;
      computerRef.current = result.computer;
      setEngineType(result.engine);
      setWasmAvailable(result.wasmAvailable);
      if (initialProgram) {
        result.computer.loadProgram(new Uint8Array(initialProgram));
      }
      setIsReady(true);
      refreshState();
    });
    return () => { cancelled = true; };
  }, []);

  const refreshState = useCallback(() => {
    const c = computerRef.current;
    if (!c) return;
    const s = c.getState();
    setState(s);
    memoryRef.current = c.getRawMemory();
    setMemoryVersion(v => v + 1);
    setConsoleOutput(c.getConsoleOutput());
    setWaitingForInput(c.getInputRequest());
    return s;
  }, []);

  const saveSnapshot = useCallback(() => {
    const c = computerRef.current;
    if (!c) return;
    const snap = c.getSnapshot();
    snapshotHistory.current = [
      ...snapshotHistory.current.slice(-(HISTORY_SIZE - 1)),
      snap,
    ];
    setCanStepBack(true);
  }, []);

  const recordCpuHistory = useCallback((s: CpuState) => {
    cpuHistory.current = [...cpuHistory.current.slice(-(HISTORY_SIZE - 1)), s];
    setTraceHistory([...cpuHistory.current]);
  }, []);

  const clearHistory = useCallback(() => {
    snapshotHistory.current = [];
    cpuHistory.current = [];
    setTraceHistory([]);
    setCanStepBack(false);
  }, []);

  const loadProgram = useCallback((bytes: number[]) => {
    const c = computerRef.current;
    if (!c) return;
    c.loadProgram(new Uint8Array(bytes));
    c.clearConsole();
    clearHistory();
    refreshState();
  }, [refreshState, clearHistory]);

  const step = useCallback(() => {
    const c = computerRef.current;
    if (!c || c.isWaitingForInput()) return;
    saveSnapshot();
    const t = c.step();
    setTrace(t);
    const s = refreshState();
    if (s) recordCpuHistory(s);
  }, [refreshState, recordCpuHistory, saveSnapshot]);

  const stepBack = useCallback(() => {
    const c = computerRef.current;
    if (!c || snapshotHistory.current.length === 0) return;
    // Pop the most recent snapshot and restore it
    const snap = snapshotHistory.current.pop()!;
    c.restoreSnapshot(snap);
    // Also pop the CPU trace history
    cpuHistory.current.pop();
    setTraceHistory([...cpuHistory.current]);
    setCanStepBack(snapshotHistory.current.length > 0);
    refreshState();
    setTrace(null);
  }, [refreshState]);

  const run = useCallback(() => {
    const c = computerRef.current;
    if (!c || runningRef.current) return;

    runningRef.current = true;
    setIsRunning(true);
    setCyclesPerSec(0);
    perfRef.current = { lastTime: performance.now(), lastCycles: c.getCycleCount(), cps: 0 };

    // If sitting on a breakpoint, step past it first
    const currentPc = c.getPc();
    if (breakpoints.has(currentPc) && !c.isHalted()) {
      saveSnapshot();
      c.step();
    }

    const tick = () => {
      if (!runningRef.current || !computerRef.current) {
        runningRef.current = false;
        setIsRunning(false);
        return;
      }
      try {
        const speed = speedRef.current;
        let executed = 0;
        let halted = false;
        let hitBreakpoint = false;

        // Always respect vsync breaks for proper video rendering
        computerRef.current.setSkipVsync(false);

        // Save one snapshot per frame for undo during run
        saveSnapshot();

        if (speed <= 10) {
          for (let i = 0; i < speed; i++) {
            if (computerRef.current.isHalted()) { halted = true; break; }
            if (executed > 0 && breakpoints.has(computerRef.current.getPc())) { hitBreakpoint = true; break; }
            computerRef.current.step();
            executed++;
          }
          halted = halted || computerRef.current.isHalted();
        } else if (speed >= 10000000) {
          // Time-budgeted execution: run batches until ~14ms elapsed or vsync
          const BATCH = 5000000; // 5M per batch — check vsync/time between batches
          const deadline = performance.now() + 14; // 14ms budget (~60fps)
          while (performance.now() < deadline) {
            const n = computerRef.current.run(BATCH);
            executed += n;
            halted = computerRef.current.isHalted();
            hitBreakpoint = n < BATCH && !halted && breakpoints.has(computerRef.current.getPc());
            if (halted || hitBreakpoint || computerRef.current.isWaitingForInput()) break;
            // If run returned less than BATCH, it hit vsync — break to render frame
            if (n < BATCH) break;
          }
        } else {
          executed = computerRef.current.run(speed);
          halted = computerRef.current.isHalted();
          hitBreakpoint = executed < speed && !halted && breakpoints.has(computerRef.current.getPc());
        }

        const s = refreshState();
        if (s) recordCpuHistory(s);

        // Track cycles/sec (update every ~500ms)
        const now = performance.now();
        const currentCycles = computerRef.current.getCycleCount();
        const perf = perfRef.current;
        if (now - perf.lastTime >= 500) {
          const dt = (now - perf.lastTime) / 1000;
          const dc = currentCycles - perf.lastCycles;
          if (dt > 0 && dc >= 0) {
            perf.cps = dc / dt;
            setCyclesPerSec(perf.cps);
          }
          perf.lastTime = now;
          perf.lastCycles = currentCycles;
        }

        // Check stop conditions in priority order
        if (computerRef.current.isWaitingForInput()) {
          // Pause for input — remember we were running so we can resume
          runningRef.current = false;
          setIsRunning(false);
          wasRunningRef.current = true;
        } else if (halted || hitBreakpoint) {
          runningRef.current = false;
          setIsRunning(false);
        } else {
          requestAnimationFrame(tick);
        }
      } catch (e) {
        console.error('Run tick error:', e);
        runningRef.current = false;
        setIsRunning(false);
      }
    };
    requestAnimationFrame(tick);
  }, [refreshState, recordCpuHistory, breakpoints, saveSnapshot]);

  const pause = useCallback(() => {
    runningRef.current = false;
    setIsRunning(false);
  }, []);

  const reset = useCallback(() => {
    pause();
    computerRef.current?.reset();
    clearHistory();
    refreshState();
    setTrace(null);
  }, [pause, refreshState, clearHistory]);

  const hardReset = useCallback(() => {
    pause();
    computerRef.current?.hardReset();
    clearHistory();
    refreshState();
    setTrace(null);
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
  const refresh = useCallback(() => {
    refreshState();
  }, [refreshState]);

  const toggleBreakpoint = useCallback((addr: number) => {
    const c = computerRef.current;
    if (!c) return;
    setBreakpoints(prev => {
      const next = new Set(prev);
      if (next.has(addr)) {
        next.delete(addr);
        c.removeBreakpoint(addr);
      } else {
        next.add(addr);
        c.addBreakpoint(addr);
      }
      return next;
    });
  }, []);

  const clearBreakpoints = useCallback(() => {
    const c = computerRef.current;
    if (!c) return;
    breakpoints.forEach(addr => c.removeBreakpoint(addr));
    setBreakpoints(new Set());
  }, [breakpoints]);

  const clearConsole = useCallback(() => {
    computerRef.current?.clearConsole();
    setConsoleOutput([]);
  }, []);

  const submitInput = useCallback((value: number, displayText?: string) => {
    const c = computerRef.current;
    if (!c) return;
    // Echo the user's typed text to the console so it appears in the output stream
    const echo = displayText ?? value.toString();
    c.echoToConsole(echo);
    c.provideInput(value);
    refreshState();
    // If we were running before the input pause, resume
    if (wasRunningRef.current) {
      wasRunningRef.current = false;
      run();
    }
  }, [refreshState, run]);

  const switchEngine = useCallback((engine: EngineType) => {
    if (engine === engineType) return;

    // Pause if running
    runningRef.current = false;
    setIsRunning(false);

    // Save current state from old engine
    const oldComputer = computerRef.current;
    const snapshot = oldComputer?.getSnapshot();
    const oldBreakpoints = oldComputer?.getBreakpoints();

    // Create new engine
    createComputer(engine).then(result => {
      computerRef.current = result.computer;
      setEngineType(result.engine);
      console.log(`🔄 Switched to ${result.engine.toUpperCase()} engine`);

      // Restore full state into new engine (restoreSnapshot handles memory + CPU state)
      if (snapshot) {
        result.computer.restoreSnapshot(snapshot);
      }

      // Restore breakpoints
      if (oldBreakpoints) {
        oldBreakpoints.forEach(addr => result.computer.addBreakpoint(addr));
      }

      // Clear undo history (snapshots from old engine are incompatible)
      snapshotHistory.current = [];
      cpuHistory.current = [];
      setCanStepBack(false);

      refreshState();
    });
  }, [engineType, refreshState]);

  // Expose memory ref (no copy) + version for re-render triggers
  const memory = memoryRef.current;

  return {
    state, memory, memoryVersion, trace, traceHistory, isRunning, isReady,
    breakpoints, consoleOutput, canStepBack, waitingForInput,
    engineType, wasmAvailable, cyclesPerSec,
    loadProgram, step, stepBack, run, pause, reset, hardReset,
    setSpeed, poke, pokeRaw, refresh, toggleBreakpoint, clearBreakpoints, clearConsole,
    submitInput, switchEngine,
  };
}
