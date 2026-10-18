// ============================================================================
// App.tsx — GateStack Main Application (Polished UI)
// ============================================================================

import React, { useState, useEffect } from 'react';
import { useComputer } from '../hooks/useComputer';
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
import { assemble } from '../assembler';
import { SAMPLE_PROGRAMS, SAMPLE_CATEGORIES } from '../samples';

// ── CSS Variables & Global Styles ─────────────────────────────────────

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
    --text-secondary: #a0aec0;
    --text-muted: #718096;
    --text-dim: #4a5568;
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
  body { margin: 0; overflow: hidden; }
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
    fontSize: '0.68rem',
    fontFamily: "var(--font-mono)",
    color: 'var(--text-muted)',
    flexShrink: 0,
  },
};

// ── JS Fractal Zoom Renderer ────────────────────────────────────────────
// Renders Mandelbrot directly to VRAM with float64 precision.
// v2.0: 8bpp, 256 colors
// JS-rendered: writes directly to front buffer (no tearing — JS is single-threaded)
// Returns a cleanup function to stop the animation.
function startFractalZoom(
  pokeRaw: (addr: number, val: number) => void,
  refresh: () => void,
): () => void {
  let running = true;
  const GRID = 256;
  const FRONT_BUFFER = 0x3D0000;
  const MAX_ITER = 128;

  // Target: Seahorse Valley
  const TARGET_RE = -0.7453;
  const TARGET_IM = 0.1127;

  // Start with standard view
  let scale = 3.5;  // width in real coords
  const ZOOM_FACTOR = 0.965;  // 3.5% zoom per frame
  const MIN_SCALE = 0.0000001;
  let colorOffset = 0;
  let frame = 0;

  function renderFrame() {
    if (!running) return;

    const halfW = scale / 2;
    const halfH = (scale * 0.8) / 2;
    const reMin = TARGET_RE - halfW;
    const imMin = TARGET_IM - halfH;
    const reStep = scale / GRID;
    const imStep = (scale * 0.8) / GRID;

    // Render to VRAM — 8bpp: one byte per pixel
    for (let py = 0; py < GRID; py++) {
      const ci = imMin + py * imStep;
      for (let px = 0; px < GRID; px++) {
        const cr = reMin + px * reStep;

        // Mandelbrot iteration
        let zr = 0, zi = 0;
        let iter = 0;
        while (iter < MAX_ITER) {
          const zr2 = zr * zr;
          const zi2 = zi * zi;
          if (zr2 + zi2 > 4) break;
          zi = 2 * zr * zi + ci;
          zr = zr2 - zi2 + cr;
          iter++;
        }

        // Color: 0 for inside, 1-255 for escaped with cycling
        let color = 0;
        if (iter < MAX_ITER) {
          color = ((iter + colorOffset) % 255) + 1;
        }

        // 8bpp: one byte per pixel — write to front buffer
        const addr = FRONT_BUFFER + py * 256 + px;
        pokeRaw(addr, color & 0xFF);
      }
    }

    refresh();

    // Advance animation
    if (scale > MIN_SCALE) {
      scale *= ZOOM_FACTOR;
    }
    colorOffset++;
    frame++;

    // Schedule next frame
    if (running) {
      requestAnimationFrame(renderFrame);
    }
  }

  // Start
  requestAnimationFrame(renderFrame);

  // Return cleanup
  return () => { running = false; };
}


// ── Main App ─────────────────────────────────────────────────────────────


function SampleDropdown({ activeProgram, onSelect }: {
  activeProgram: string;
  onSelect: (key: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Close on click outside
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const activeName = SAMPLE_PROGRAMS[activeProgram]?.name ?? 'Select';

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(!open)}
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
        <span style={{ fontSize: '0.55rem', color: 'var(--text-dim)', marginLeft: 2 }}>▼</span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4,
          background: 'var(--bg-surface, #1a1a2e)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 8, padding: '6px 0',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          zIndex: 1000, minWidth: 240, maxHeight: '70vh', overflowY: 'auto',
        }}>
          {SAMPLE_CATEGORIES.map(cat => (
            <div key={cat.label}>
              {/* Category header */}
              <div style={{
                padding: '6px 14px 3px',
                fontSize: '0.6rem', fontWeight: 700,
                color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.8px',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span>{cat.icon}</span> {cat.label}
              </div>
              {/* Items */}
              {cat.keys.map(key => {
                const prog = SAMPLE_PROGRAMS[key];
                if (!prog) return null;
                const isActive = key === activeProgram;
                return (
                  <button
                    key={key}
                    onClick={() => { onSelect(key); setOpen(false); }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      width: '100%', padding: '5px 14px 5px 28px',
                      background: isActive ? 'var(--accent-blue-dim, rgba(59,130,246,0.1))' : 'transparent',
                      border: 'none', cursor: 'pointer',
                      transition: 'background 0.1s',
                      textAlign: 'left',
                    }}
                    onMouseEnter={e => { if (!isActive) (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; }}
                    onMouseLeave={e => { if (!isActive) (e.target as HTMLElement).style.background = 'transparent'; }}
                  >
                    <span style={{
                      fontSize: '0.72rem', fontWeight: isActive ? 700 : 500,
                      color: isActive ? 'var(--accent-blue)' : 'var(--text-secondary)',
                      fontFamily: 'var(--font-ui)',
                    }}>{prog.name}</span>
                    <span style={{
                      fontSize: '0.58rem', color: 'var(--text-dim)',
                      fontFamily: 'var(--font-mono)', marginLeft: 12,
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

export default function App() {
  const computer = useComputer([]);
  const [activeProgram, setActiveProgram] = useState('add');
  const [editorCode, setEditorCode] = useState(SAMPLE_PROGRAMS.add.code);
  const [showHelp, setShowHelp] = useState(false);
  const fractalCleanupRef = React.useRef<(() => void) | null>(null);

  // Auto-assemble the initial program once computer is ready
  useEffect(() => {
    if (computer.isReady) {
      const result = assemble(SAMPLE_PROGRAMS.add.code);
      if (result.success) computer.loadProgram(result.bytes);
    }
  }, [computer.isReady]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      switch (e.key.toLowerCase()) {
        case 's': computer.step(); break;
        case 'b': computer.stepBack(); break;
        case 'r': computer.run(); break;
        case 'p': computer.pause(); break;
        case 'escape': computer.pause(); setShowHelp(false); break;
        case '?': setShowHelp(v => !v); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [computer]);

  // Electron menu commands (F5/F6/F10)
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (api?.onMenuCommand) {
      api.onMenuCommand((cmd: string) => {
        switch (cmd) {
          case 'step': computer.step(); break;
          case 'stepback': computer.stepBack(); break;
          case 'run': computer.run(); break;
          case 'pause': computer.pause(); break;
          case 'reset': computer.reset(); break;
        }
      });
    }
  }, [computer]);

  const handleLoadProgram = (key: string) => {
    // Stop any running fractal zoom animation
    if (fractalCleanupRef.current) {
      fractalCleanupRef.current();
      fractalCleanupRef.current = null;
    }
    computer.pause();

    const prog = SAMPLE_PROGRAMS[key];
    if (!prog) return;
    setActiveProgram(key);
    setEditorCode(prog.code);
    if (prog.bytes.length > 0) {
      computer.loadProgram(prog.bytes);
    } else {
      const result = assemble(prog.code);
      if (result.success) computer.loadProgram(result.bytes);
    }

    // Special: start JS fractal zoom animation
    if (key === 'fractal_zoom') {
      fractalCleanupRef.current = startFractalZoom(computer.pokeRaw, computer.refresh);
    }
  };

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
  const isRunning = computer.isRunning;
  const statusColor = isRunning ? 'var(--accent-green)' : isHalted ? 'var(--accent-red)' : 'var(--accent-amber)';
  const statusText = isRunning ? 'Running' : isHalted ? 'Halted' : 'Ready';

  return (
    <div style={styles.app}>
      <style>{GLOBAL_CSS}</style>

      {/* Header */}
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 26, height: 26, borderRadius: 6,
            background: 'linear-gradient(135deg, #38bdf8, #818cf8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 800, color: '#fff',
            boxShadow: '0 0 16px rgba(56,189,248,0.2)',
          }}>GS</div>
          <span style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>
            Gate<span style={{ color: 'var(--accent-blue)', fontWeight: 800 }}>Stack</span>
          </span>
          <span style={{
            fontSize: '0.6rem', color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)', marginLeft: 2,
          }}>v2.0 · 32-bit CPU</span>
        </div>

        {/* Program selector dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)',
            fontFamily: 'var(--font-ui)',
          }}>Samples:</span>
          <SampleDropdown
            activeProgram={activeProgram}
            onSelect={handleLoadProgram}
          />
        </div>
      </div>

      {/* Main */}
      <div style={styles.main}>
        <div style={styles.toolbarRow}>
          <Toolbar computer={computer} />
        </div>

        <div style={styles.leftPanel}>
          <CpuView state={state} trace={computer.trace} />
          <AluView trace={computer.trace} />
          <SignalTrace history={computer.traceHistory} />
        </div>

        <div style={styles.centerPanel}>
          <BusView state={state} trace={computer.trace} />
          <CodeEditor
            code={editorCode}
            onChange={setEditorCode}
            currentAddress={state?.iar ?? 0}
            onLoadBytes={(bytes: number[]) => computer.loadProgram(bytes)}
            breakpoints={computer.breakpoints}
            onToggleBreakpoint={computer.toggleBreakpoint}
          />
        </div>

        <div style={styles.rightPanel}>
          <MemoryView memory={computer.memory} memoryVersion={computer.memoryVersion} currentAddress={state?.iar ?? 0} onPoke={computer.poke} />
          <VideoView memory={computer.memory} memoryVersion={computer.memoryVersion} isRunning={computer.isRunning} />
          <ConsoleView
            output={computer.consoleOutput}
            onClear={computer.clearConsole}
            waitingForInput={computer.waitingForInput}
            onSubmitInput={computer.submitInput}
          />
        </div>
      </div>

      {/* Status Bar */}
      <div style={styles.statusBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: statusColor,
            boxShadow: `0 0 6px color-mix(in srgb, ${statusColor} 60%, transparent)`,
          }} />
          <span style={{ color: statusColor, fontWeight: 600 }}>{statusText}</span>
        </div>
        <span>Cycle <span style={{ color: 'var(--text-secondary)' }}>{state?.cycle_count ?? 0}</span></span>
        <span>PC <span style={{ color: 'var(--text-secondary)' }}>0x{(state?.iar ?? 0).toString(16).padStart(6, '0').toUpperCase()}</span></span>
        <span>SP <span style={{ color: 'var(--text-secondary)' }}>0x{(state?.sp ?? 0).toString(16).padStart(6, '0').toUpperCase()}</span></span>
        <div style={{ flex: 1 }} />
        {isHalted && (
          <span style={{ color: 'var(--accent-green)', fontWeight: 600, fontSize: '0.7rem' }}>
            ✓ {SAMPLE_PROGRAMS[activeProgram]?.expect}
          </span>
        )}
        <span>Steps <span style={{ color: 'var(--text-secondary)' }}>{computer.traceHistory.length}/64</span></span>
        <button onClick={() => setShowHelp(true)} style={{
          background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 4,
          color: 'var(--text-muted)', cursor: 'pointer', padding: '0 6px', fontSize: '0.7rem',
          fontWeight: 700, fontFamily: 'var(--font-ui)', lineHeight: '18px',
        }} title="Help & ISA Reference">?</button>
      </div>

      {showHelp && <HelpPanel onClose={() => setShowHelp(false)} />}
    </div>
  );
}
