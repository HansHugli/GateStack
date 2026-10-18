// ============================================================================
// App.tsx — GateStack Main Application
// ============================================================================
// The editor text and the program in RAM are tracked separately: `loaded` is
// the source that was last assembled into RAM, with its assembly result. When
// the editor differs, the editor says so and the PC highlight, breakpoints and
// expected-result line (all of which describe the loaded program) step aside.
// ============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useComputer, ComputerHook } from '../hooks/useComputer';
import { shortcutFor } from '../hooks/shortcuts';
import { loadEdits, saveEdits, clearEdits, loadActiveSample, saveActiveSample } from '../hooks/editorStorage';
import CpuView from './CpuView';
import MemoryView from './MemoryView';
import Toolbar from './Toolbar';
import CodeEditor from './CodeEditor';
import AluView from './AluView';
import BusView from './BusView';
import SignalTrace from './SignalTrace';
import ConsoleView from './ConsoleView';
import HelpPanel from './HelpPanel';
import VideoView from './VideoView';
import { AboutDialog, DiscardDialog, APP_VERSION, ElectronVersions } from './Modal';
import { startFractalZoom } from './fractalZoom';
import { assemble, AssemblyResult } from '../assembler';
import { SAMPLE_PROGRAMS, SAMPLE_CATEGORIES, HOST_DEMOS } from '../samples';

// ── CSS Variables & Global Styles ─────────────────────────────────────
// Text colours are chosen for at least 4.5:1 contrast on --bg-base and
// --bg-elevated (WCAG AA); nothing in the UI is smaller than 11px.

const GLOBAL_CSS = `
  :root {
    --bg-base: #06080f;
    --bg-surface: #0b0f1a;
    --bg-elevated: #111628;
    --bg-hover: #161d33;
    --border-subtle: #1a2035;
    --border-default: #1e2a42;
    --border-bright: #2a3a5c;
    --text-primary: #e2e8f0;
    --text-secondary: #b8c4d4;
    --text-muted: #9aa8bc;
    --text-dim: #7d899d;
    --accent-blue: #38bdf8;
    --accent-blue-dim: #0c4a6e;
    --accent-green: #34d399;
    --accent-green-dim: #064e3b;
    --accent-amber: #fbbf24;
    --accent-amber-dim: #78350f;
    --accent-red: #f87171;
    --accent-red-dim: #7f1d1d;
    --accent-purple: #a78bfa;
    --accent-purple-dim: #3b0764;
    --accent-cyan: #22d3ee;
    --font-mono: 'Cascadia Code', 'JetBrains Mono', 'Fira Code', 'SF Mono', monospace;
    --font-ui: 'Segoe UI', system-ui, -apple-system, sans-serif;
    --radius-sm: 4px;
    --radius-md: 6px;
    --radius-lg: 8px;
    --glow-blue: 0 0 12px rgba(56, 189, 248, 0.15);
    --glow-green: 0 0 12px rgba(52, 211, 153, 0.15);
  }
  * { box-sizing: border-box; }
  body { margin: 0; overflow: hidden; background: var(--bg-base); }
  button:focus-visible, input:focus-visible, textarea:focus-visible, [tabindex]:focus-visible {
    outline: 2px solid var(--accent-blue); outline-offset: 1px;
  }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: var(--bg-base); }
  ::-webkit-scrollbar-thumb { background: var(--border-default); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--border-bright); }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  @keyframes pulseGlow { 0%, 100% { box-shadow: none; } 50% { box-shadow: var(--glow-blue); } }
`;

// ── Styles ───────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  app: {
    height: '100vh',
    background: 'var(--bg-base)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-ui)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px',
    borderBottom: '1px solid var(--border-subtle)',
    background: 'var(--bg-surface)',
    flexShrink: 0,
    zIndex: 10,
  },
  main: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: '295px 1fr 460px',
    gridTemplateRows: 'auto 1fr',
    gap: '1px',
    background: 'var(--border-subtle)',
    minHeight: 0,
    overflow: 'hidden',
  },
  toolbarRow: {
    gridColumn: '1 / -1',
    background: 'var(--bg-surface)',
  },
  leftPanel: {
    background: 'var(--bg-base)',
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
  },
  centerPanel: {
    background: 'var(--bg-base)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  rightPanel: {
    background: 'var(--bg-base)',
    overflow: 'auto',
  },
  statusBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '3px 16px',
    borderTop: '1px solid var(--border-subtle)',
    background: 'var(--bg-surface)',
    fontSize: '0.6875rem',
    fontFamily: "var(--font-mono)",
    color: 'var(--text-muted)',
    flexShrink: 0,
    minWidth: 0,
  },
};

const hex6 = (n: number) => '0x' + (n >>> 0).toString(16).padStart(6, '0').toUpperCase();

// ── Sample menu ──────────────────────────────────────────────────────────

function SampleDropdown({ activeProgram, onSelect }: {
  activeProgram: string;
  onSelect: (key: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Close on click outside (a menu, not a dialog)
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const activeName = SAMPLE_PROGRAMS[activeProgram]?.name ?? 'Select';

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Sample program: ${activeName}`}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
          padding: '5px 12px', borderRadius: 6, width: 400,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          color: 'var(--text-primary)', cursor: 'pointer',
          fontSize: '0.75rem', fontWeight: 600, fontFamily: 'var(--font-ui)',
          transition: 'all 0.15s',
        }}
      >
        <span style={{ color: 'var(--accent-blue)' }}>{activeName}</span>
        <span aria-hidden="true" style={{ fontSize: '0.6875rem', color: 'var(--text-dim)', marginLeft: 2 }}>▼</span>
      </button>

      {open && (
        <div role="menu" style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 4,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 8, padding: '6px 0',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          zIndex: 1000, minWidth: 400, maxHeight: '75vh', overflowY: 'auto',
        }}>
          {SAMPLE_CATEGORIES.map(cat => (
            <div key={cat.label}>
              <div style={{
                padding: '6px 14px 3px',
                fontSize: '0.6875rem', fontWeight: 700,
                color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.8px',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span aria-hidden="true">{cat.icon}</span> {cat.label}
              </div>
              {cat.keys.map(key => {
                const prog = SAMPLE_PROGRAMS[key];
                if (!prog) return null;
                const isActive = key === activeProgram;
                const isHost = HOST_DEMOS.has(key);
                return (
                  <button
                    key={key}
                    role="menuitem"
                    onClick={() => { setOpen(false); onSelect(key); }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      width: '100%', padding: '5px 14px 5px 28px',
                      background: isActive ? 'var(--accent-blue-dim)' : 'transparent',
                      border: 'none', cursor: 'pointer',
                      transition: 'background 0.1s',
                      textAlign: 'left',
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span style={{
                      fontSize: '0.75rem', fontWeight: isActive ? 700 : 500,
                      color: isActive ? 'var(--accent-blue)' : 'var(--text-secondary)',
                      fontFamily: 'var(--font-ui)', display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      {prog.name}
                      {isHost && (
                        <span style={{
                          fontSize: '0.6875rem', fontWeight: 700, color: 'var(--accent-amber)',
                          border: '1px solid var(--accent-amber-dim)', borderRadius: 3, padding: '0 4px',
                        }} title="Drawn by JavaScript on the host, not by the simulated CPU">HOST JS</span>
                      )}
                    </span>
                    <span style={{
                      fontSize: '0.6875rem', color: 'var(--text-muted)',
                      fontFamily: 'var(--font-mono)', marginLeft: 12, textAlign: 'right',
                    }}>{prog.desc}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Status text ──────────────────────────────────────────────────────────

export function statusFor(computer: Pick<ComputerHook, 'isRunning' | 'fault' | 'stopReason' | 'waitingForInput' | 'state'>): {
  text: string; color: string;
} {
  const fault = computer.fault ?? (computer.stopReason?.kind === 'fault' ? computer.stopReason.message : null);
  if (computer.isRunning) return { text: 'Running', color: 'var(--accent-green)' };
  if (fault) return { text: `Fault: ${fault}`, color: 'var(--accent-red)' };
  if (computer.waitingForInput) return { text: `Waiting for input (R${computer.waitingForInput.register})`, color: 'var(--accent-blue)' };
  if (computer.state?.halted) return { text: 'Halted', color: 'var(--accent-red)' };
  const r = computer.stopReason;
  if (r?.kind === 'breakpoint' && computer.state?.iar === r.address) {
    return { text: `Stopped at breakpoint ${hex6(r.address)}`, color: 'var(--accent-red)' };
  }
  if (r?.kind === 'paused') return { text: 'Paused', color: 'var(--accent-amber)' };
  return { text: 'Ready', color: 'var(--accent-amber)' };
}

function sameBytes(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

type Pending = { kind: 'sample'; key: string } | { kind: 'revert' };

// ── Main App ─────────────────────────────────────────────────────────────

export default function App() {
  const computer = useComputer([]);

  // Restore the last sample and its autosaved edits.
  const [initial] = useState(() => {
    const saved = loadActiveSample();
    const key = saved && SAMPLE_PROGRAMS[saved] ? saved : 'add';
    return { key, code: loadEdits(key) ?? SAMPLE_PROGRAMS[key].code };
  });
  const [activeProgram, setActiveProgram] = useState(initial.key);
  const [editorCode, setEditorCode] = useState(initial.code);
  /** The source that is in RAM, with its assembly result. */
  const [loaded, setLoaded] = useState<{ source: string; result: AssemblyResult } | null>(null);
  /** The result of the last Assemble press (errors stay until the next edit). */
  const [lastAssembly, setLastAssembly] = useState<AssemblyResult | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [hostDemo, setHostDemo] = useState(false);
  const [electronVersions, setElectronVersions] = useState<ElectronVersions | null>(null);
  const fractalCleanupRef = useRef<(() => void) | null>(null);
  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;

  const original = SAMPLE_PROGRAMS[activeProgram]?.code ?? '';
  const hasEdits = editorCode !== original;
  const editorStatus: 'loaded' | 'modified' | 'not-loaded' =
    !loaded ? 'not-loaded' : loaded.source === editorCode ? 'loaded' : 'modified';

  const stopHostDemo = useCallback(() => {
    if (fractalCleanupRef.current) {
      fractalCleanupRef.current();
      fractalCleanupRef.current = null;
    }
    setHostDemo(false);
  }, []);

  const startHostDemoIfAny = useCallback((key: string) => {
    if (key === 'fractal_zoom') {
      fractalCleanupRef.current = startFractalZoom(computer.pokeRaw, computer.refresh);
      setHostDemo(true);
    }
  }, [computer.pokeRaw, computer.refresh]);

  /** Assemble `code` and load it into RAM. Breakpoints survive only a reload of the same bytes. */
  const assembleAndLoad = useCallback((code: string): AssemblyResult => {
    const result = assemble(code);
    setLastAssembly(result);
    if (!result.success) return result;
    stopHostDemo();
    const prev = loadedRef.current;
    const same = !!prev && sameBytes(prev.result.bytes, result.bytes);
    computer.loadProgram(result.bytes, { keepBreakpoints: same });
    setLoaded({ source: code, result });
    return result;
  }, [computer.loadProgram, stopHostDemo]);

  // Load the initial program once the engine is ready.
  useEffect(() => {
    if (!computer.isReady) return;
    const r = assembleAndLoad(initial.code);
    if (!r.success && initial.code !== SAMPLE_PROGRAMS[initial.key].code) {
      // The restored edits don't assemble: run the original, keep the edits in the editor.
      const orig = SAMPLE_PROGRAMS[initial.key].code;
      const ok = assemble(orig);
      if (ok.success) {
        computer.loadProgram(ok.bytes);
        setLoaded({ source: orig, result: ok });
      }
    } else if (r.success && initial.code === SAMPLE_PROGRAMS[initial.key].code) {
      startHostDemoIfAny(initial.key);
    }
  }, [computer.isReady]);

  useEffect(() => () => stopHostDemo(), [stopHostDemo]);

  const onEditorChange = useCallback((text: string) => {
    setEditorCode(text);
    setLastAssembly(null);
    saveEdits(activeProgram, text, SAMPLE_PROGRAMS[activeProgram]?.code ?? '');
  }, [activeProgram]);

  const openSample = useCallback((key: string) => {
    const prog = SAMPLE_PROGRAMS[key];
    if (!prog) return;
    stopHostDemo();
    computer.pause();
    clearEdits(activeProgram);
    clearEdits(key);
    setActiveProgram(key);
    saveActiveSample(key);
    setEditorCode(prog.code);
    const r = assembleAndLoad(prog.code);
    if (r.success) startHostDemoIfAny(key);
  }, [activeProgram, assembleAndLoad, computer.pause, stopHostDemo, startHostDemoIfAny]);

  const requestSample = useCallback((key: string) => {
    if (hasEdits) setPending({ kind: 'sample', key });
    else openSample(key);
  }, [hasEdits, openSample]);

  const revert = useCallback(() => {
    clearEdits(activeProgram);
    setEditorCode(original);
    assembleAndLoad(original);
  }, [activeProgram, original, assembleAndLoad]);

  const confirmPending = () => {
    const p = pending;
    setPending(null);
    if (!p) return;
    if (p.kind === 'sample') openSample(p.key);
    else revert();
  };

  // Actions that end the host demo first.
  const doStep = useCallback(() => { stopHostDemo(); computer.step(); }, [computer.step, stopHostDemo]);
  const doRun = useCallback(() => { stopHostDemo(); computer.run(); }, [computer.run, stopHostDemo]);
  const doReset = useCallback(() => { stopHostDemo(); computer.reset(); }, [computer.reset, stopHostDemo]);
  const doWipe = useCallback(() => {
    stopHostDemo();
    computer.hardReset();
    computer.clearBreakpoints();
    setLoaded(null); // the program is gone from RAM
  }, [computer.hardReset, computer.clearBreakpoints, stopHostDemo]);

  const modalOpen = showHelp || showAbout || !!pending;

  // Handlers read through a ref so the key and menu listeners register once.
  const handlersRef = useRef<Record<string, () => void>>({});
  handlersRef.current = {
    step: doStep,
    stepback: computer.stepBack,
    run: doRun,
    pause: computer.pause,
    reset: doReset,
    wipe: doWipe,
    help: () => setShowHelp(true),
    about: () => setShowAbout(true),
  };
  const modalOpenRef = useRef(modalOpen);
  modalOpenRef.current = modalOpen;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (modalOpenRef.current) return;
      const action = shortcutFor(e);
      if (!action) return;
      if (action === 'help') {
        e.preventDefault();
        setShowHelp(true);
        return;
      }
      handlersRef.current[action]?.();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Electron menu commands (F5/F6/F8/F9/F10, About). Registered once.
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api) return;
    try { setElectronVersions(api.getVersions?.() ?? null); } catch { /* older preload */ }
    const off = api.onMenuCommand?.((cmd: string) => {
      if (modalOpenRef.current && cmd !== 'about') return;
      handlersRef.current[cmd]?.();
    });
    return () => { if (typeof off === 'function') off(); };
  }, []);

  if (!computer.isReady) {
    return (
      <div style={{ ...styles.app, justifyContent: 'center', alignItems: 'center' }}>
        <style>{GLOBAL_CSS}</style>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, #38bdf8, #818cf8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 800, color: '#fff', margin: '0 auto 12px',
          }}>GS</div>
          <div style={{ color: 'var(--accent-blue)', fontSize: '0.9rem', fontWeight: 600 }}>Loading…</div>
        </div>
      </div>
    );
  }

  const state = computer.state;
  const isHalted = state?.halted ?? false;
  const status = statusFor(computer);
  const sample = SAMPLE_PROGRAMS[activeProgram];
  const showExpect = isHalted && !computer.fault && editorStatus === 'loaded' && loaded?.source === sample?.code;
  const engineLabel = computer.engineType === 'wasm' ? 'WASM (Rust)' : 'JavaScript';

  return (
    <div style={styles.app}>
      <style>{GLOBAL_CSS}</style>

      {/* Header */}
      <header style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div aria-hidden="true" style={{
            width: 26, height: 26, borderRadius: 6,
            background: 'linear-gradient(135deg, #38bdf8, #818cf8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 800, color: '#fff',
            boxShadow: '0 0 16px rgba(56,189,248,0.2)',
          }}>GS</div>
          <h1 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff', margin: 0 }}>
            Gate<span style={{ color: 'var(--accent-blue)', fontWeight: 800 }}>Stack</span>
          </h1>
          <span style={{
            fontSize: '0.6875rem', color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)', marginLeft: 2,
          }}>v{APP_VERSION} · ISA v2 · 32-bit CPU</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)',
            fontFamily: 'var(--font-ui)',
          }}>Samples:</span>
          <SampleDropdown activeProgram={activeProgram} onSelect={requestSample} />
        </div>
      </header>

      {/* Main */}
      <main style={styles.main}>
        <div style={styles.toolbarRow}>
          <Toolbar
            computer={computer}
            onStep={doStep}
            onRun={doRun}
            onReset={doReset}
            onWipe={doWipe}
          />
        </div>

        <div style={styles.leftPanel}>
          <CpuView state={state} prevState={computer.prevState} trace={computer.trace} />
          <AluView trace={computer.trace} isRunning={computer.isRunning} />
          <SignalTrace history={computer.traceHistory} />
        </div>

        <div style={styles.centerPanel}>
          <BusView state={state} trace={computer.trace} />
          <CodeEditor
            code={editorCode}
            onChange={onEditorChange}
            onAssemble={() => assembleAndLoad(editorCode)}
            loadedResult={loaded?.result ?? null}
            lastAssembly={lastAssembly}
            status={editorStatus}
            currentAddress={state?.iar ?? 0}
            breakpoints={computer.breakpoints}
            onToggleBreakpoint={computer.toggleBreakpoint}
            sampleName={sample?.name ?? 'this sample'}
            canRevert={hasEdits}
            onRevert={() => setPending({ kind: 'revert' })}
          />
        </div>

        <div style={styles.rightPanel}>
          <MemoryView
            memory={computer.memory}
            memoryVersion={computer.memoryVersion}
            currentAddress={state?.iar ?? 0}
            onPoke={computer.poke}
            labels={loaded?.result.labels ?? null}
          />
          <VideoView
            memory={computer.memory}
            memoryVersion={computer.memoryVersion}
            isRunning={computer.isRunning || hostDemo}
            hostDemo={hostDemo}
          />
          <ConsoleView
            key={activeProgram}
            output={computer.consoleOutput}
            onClear={computer.clearConsole}
            waitingForInput={computer.waitingForInput}
            onSubmitInput={computer.submitInput}
            defaultInputMode={activeProgram === 'echo' ? 'char' : 'number'}
          />
        </div>
      </main>

      {/* Status Bar */}
      <footer style={styles.statusBar} role="status" aria-live="polite">
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
          <div aria-hidden="true" style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: status.color,
            boxShadow: `0 0 6px color-mix(in srgb, ${status.color} 60%, transparent)`,
          }} />
          <span style={{
            color: status.color, fontWeight: 600,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', userSelect: 'text',
          }} title={status.text}>{status.text}</span>
        </div>
        <span>Cycle <span style={{ color: 'var(--text-secondary)' }}>{state?.cycle_count ?? 0}</span></span>
        <span>PC <span style={{ color: 'var(--text-secondary)' }}>{hex6(state?.iar ?? 0)}</span></span>
        <span>SP <span style={{ color: 'var(--text-secondary)' }}>{hex6(state?.sp ?? 0)}</span></span>
        <span title={computer.engineNote ? `JavaScript engine because ${computer.engineNote}` : undefined}>
          Engine <span style={{ color: computer.engineNote ? 'var(--accent-amber)' : 'var(--text-secondary)' }}>
            {engineLabel}{computer.engineNote ? ' (WASM unavailable)' : ''}
          </span>
        </span>
        <div style={{ flex: 1 }} />
        {showExpect && sample?.expect && (
          <span style={{ color: 'var(--accent-green)', fontWeight: 600, whiteSpace: 'nowrap' }}>
            Expected: {sample.expect}
          </span>
        )}
        <span title="Undo history (Step Back)">History <span style={{ color: 'var(--text-secondary)' }}>{computer.traceHistory.length}/64</span></span>
        <button onClick={() => setShowAbout(true)} aria-label="About GateStack" title="About GateStack" style={statusBtn}>i</button>
        <button onClick={() => setShowHelp(true)} aria-label="Help and ISA reference" title="Help & ISA Reference (?)" style={statusBtn}>?</button>
      </footer>

      {showHelp && <HelpPanel onClose={() => setShowHelp(false)} />}
      {showAbout && (
        <AboutDialog
          onClose={() => setShowAbout(false)}
          engine={computer.engineNote ? `${engineLabel} (WASM unavailable: ${computer.engineNote})` : engineLabel}
          versions={electronVersions}
        />
      )}
      {pending && (
        <DiscardDialog
          sampleName={sample?.name ?? 'this sample'}
          action={pending.kind === 'sample'
            ? `opens ${SAMPLE_PROGRAMS[pending.key]?.name ?? 'the sample'}`
            : 'puts the original program back'}
          onDiscard={confirmPending}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}

const statusBtn: React.CSSProperties = {
  background: 'none', border: '1px solid var(--border-default)', borderRadius: 4,
  color: 'var(--text-muted)', cursor: 'pointer', padding: '0 6px', fontSize: '0.7rem',
  fontWeight: 700, fontFamily: 'var(--font-ui)', lineHeight: '18px',
};
