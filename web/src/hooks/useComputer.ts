// ============================================================================
// useComputer.ts — React hook for managing computer state
// ============================================================================

import { useState, useCallback, useRef, useEffect } from 'react';
import { createComputer, IComputer, CpuState, CycleTrace } from '../wasm-bridge';

export interface ComputerHook {
  // State
  state: CpuState | null;
  memory: number[];
  trace: CycleTrace | null;
  traceHistory: CpuState[];
  isRunning: boolean;
  isReady: boolean;

  // Actions
  loadProgram: (bytes: number[]) => void;
  step: () => void;
  run: () => void;
  pause: () => void;
  reset: () => void;
  hardReset: () => void;
  setSpeed: (cyclesPerFrame: number) => void;
  poke: (addr: number, value: number) => void;
  toggleBreakpoint: (addr: number) => void;
}

const HISTORY_SIZE = 128;

export function useComputer(initialProgram?: number[]): ComputerHook {
  const computerRef = useRef<IComputer | null>(null);
  const runningRef = useRef(false);
  const speedRef = useRef(100);
  const historyRef = useRef<CpuState[]>([]);

  const [state, setState] = useState<CpuState | null>(null);
  const [memory, setMemory] = useState<number[]>(new Array(256).fill(0));
  const [trace, setTrace] = useState<CycleTrace | null>(null);
  const [traceHistory, setTraceHistory] = useState<CpuState[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isReady, setIsReady] = useState(false);

  // Initialize the computer (loads WASM or mock)
  useEffect(() => {
    let cancelled = false;
    createComputer().then(computer => {
      if (cancelled) return; // React strict mode cleanup
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
    setMemory(c.getAllMemory());
    return s;
  }, []);

  const recordHistory = useCallback((s: CpuState) => {
    historyRef.current = [...historyRef.current.slice(-(HISTORY_SIZE - 1)), s];
    setTraceHistory([...historyRef.current]);
  }, []);

  const loadProgram = useCallback((bytes: number[]) => {
    const c = computerRef.current;
    if (!c) return;
    c.loadProgram(new Uint8Array(bytes));
    historyRef.current = [];
    setTraceHistory([]);
    refreshState();
  }, [refreshState]);

  const step = useCallback(() => {
    const c = computerRef.current;
    if (!c) return;
    const t = c.step();
    setTrace(t);
    const s = refreshState();
    if (s) recordHistory(s);
  }, [refreshState, recordHistory]);

  const run = useCallback(() => {
    const c = computerRef.current;
    if (!c || runningRef.current) return;

    runningRef.current = true;
    setIsRunning(true);

    const tick = () => {
      if (!runningRef.current || !computerRef.current) {
        runningRef.current = false;
        setIsRunning(false);
        return;
      }
      try {
        computerRef.current.run(speedRef.current);
        const s = refreshState();
        if (s) recordHistory(s);
        if (!computerRef.current.isHalted()) {
          requestAnimationFrame(tick);
        } else {
          runningRef.current = false;
          setIsRunning(false);
        }
      } catch (e) {
        console.error('Run tick error:', e);
        runningRef.current = false;
        setIsRunning(false);
      }
    };
    requestAnimationFrame(tick);
  }, [refreshState, recordHistory]);

  const pause = useCallback(() => {
    runningRef.current = false;
    setIsRunning(false);
  }, []);

  const reset = useCallback(() => {
    pause();
    computerRef.current?.reset();
    historyRef.current = [];
    setTraceHistory([]);
    refreshState();
    setTrace(null);
  }, [pause, refreshState]);

  const hardReset = useCallback(() => {
    pause();
    computerRef.current?.hardReset();
    historyRef.current = [];
    setTraceHistory([]);
    refreshState();
    setTrace(null);
  }, [pause, refreshState]);

  const setSpeed = useCallback((cyclesPerFrame: number) => {
    speedRef.current = cyclesPerFrame;
  }, []);

  const poke = useCallback((addr: number, value: number) => {
    computerRef.current?.poke(addr, value);
    refreshState();
  }, [refreshState]);

  const toggleBreakpoint = useCallback((addr: number) => {
    // For now, just add. A full implementation would track and toggle.
    computerRef.current?.addBreakpoint(addr);
  }, []);

  return {
    state, memory, trace, traceHistory, isRunning, isReady,
    loadProgram, step, run, pause, reset, hardReset, setSpeed, poke, toggleBreakpoint,
  };
}
