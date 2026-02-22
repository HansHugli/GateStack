// ============================================================================
// useComputer.ts — React hook for managing computer state
// ============================================================================

import { useState, useCallback, useRef, useEffect } from 'react';
import { createComputer, IComputer, CpuState, CycleTrace } from '../wasm-bridge';

interface Snapshot {
  state: CpuState;
  memory: number[];
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
  toggleBreakpoint: (addr: number) => void;
  clearBreakpoints: () => void;
  clearConsole: () => void;
  submitInput: (value: number, displayText?: string) => void;
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
  const memoryRef = useRef<number[]>(new Array(65536).fill(0));
  const [memoryVersion, setMemoryVersion] = useState(0);
  const [trace, setTrace] = useState<CycleTrace | null>(null);
  const [traceHistory, setTraceHistory] = useState<CpuState[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [breakpoints, setBreakpoints] = useState<Set<number>>(new Set());
  const [consoleOutput, setConsoleOutput] = useState<number[]>([]);
  const [canStepBack, setCanStepBack] = useState(false);
  const [waitingForInput, setWaitingForInput] = useState<{ register: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    createComputer().then(computer => {
      if (cancelled) return;
      computerRef.current = computer;
      if (initialProgram) {
        computer.loadProgram(new Uint8Array(initialProgram));
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
        } else {
          executed = computerRef.current.run(speed);
          halted = computerRef.current.isHalted();
          hitBreakpoint = executed < speed && !halted && breakpoints.has(computerRef.current.getPc());
        }

        const s = refreshState();
        if (s) recordCpuHistory(s);

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

  // Expose memory ref (no copy) + version for re-render triggers
  const memory = memoryRef.current;

  return {
    state, memory, memoryVersion, trace, traceHistory, isRunning, isReady,
    breakpoints, consoleOutput, canStepBack, waitingForInput,
    loadProgram, step, stepBack, run, pause, reset, hardReset,
    setSpeed, poke, toggleBreakpoint, clearBreakpoints, clearConsole,
    submitInput,
  };
}
