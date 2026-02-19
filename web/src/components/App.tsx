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
import { assemble } from '../assembler';

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
    --text-secondary: #8b95a8;
    --text-muted: #4a5568;
    --text-dim: #2d3748;
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
    gridTemplateColumns: '280px 1fr 380px',
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

// ── Sample Programs ──────────────────────────────────────────────────────

const SAMPLE_PROGRAMS: Record<string, { name: string; desc: string; code: string; bytes: number[]; expect: string }> = {
  add: {
    name: 'Add', desc: '15 + 27 = 42',
    code: `; Add two numbers: 15 + 27 = 42
DATA R0, 15
DATA R1, 27
ADD  R0, R1
HALT`,
    bytes: [0xA0, 15, 0xA4, 27, 0x01, 0x00],
    expect: 'R0 = 42',
  },
  count: {
    name: 'Count', desc: 'Loop 0→10',
    code: `; Count from 0 to 10 in R0
        DATA R0, 0     ; counter
        DATA R1, 1     ; increment
        DATA R2, 10    ; target
loop:   ADD  R0, R1    ; R0++
        CMP  R0, R2    ; R0 == 10?
        JE   done      ; yes → halt
        JMP  loop      ; no → loop
done:   HALT`,
    bytes: [0xA0, 0, 0xA4, 1, 0xA8, 10, 0x01, 0x72, 0xF0, 12, 0xC0, 6, 0x00],
    expect: 'R0 = 10',
  },
  fibonacci: {
    name: 'Fibonacci', desc: '1,1,2,...,233',
    code: `; Fibonacci: 1,1,2,3,5,8,13,21,...,233
; R0=current  R1=prev  R2=temp  R3=limit
        DATA R0, 1     ; fib(1)
        DATA R1, 0     ; fib(0)
        DATA R3, 233   ; stop when we hit 233
loop:   ADD  R1, R0    ; R1 = R1 + R0 (next fib)
        CMP  R1, R3    ; reached limit?
        JE   done
        ; swap: R2=R1, R0=R2 (shift forward)
        DATA R2, 0
        ADD  R2, R1    ; R2 = R1 (new current)
        DATA R1, 0
        ADD  R1, R0    ; R1 = old R0 (new prev)
        DATA R0, 0
        ADD  R0, R2    ; R0 = R2 (current)
        JMP  loop
done:   HALT`,
    bytes: [], expect: 'R1 = 233',
  },
  shift: {
    name: 'Shift', desc: 'SHL/SHR bits',
    code: `; Shift left then right
DATA R0, 1     ; 00000001
SHL  R0, R0    ; 00000010 (2)
SHL  R0, R0    ; 00000100 (4)
SHL  R0, R0    ; 00001000 (8)
SHL  R0, R0    ; 00010000 (16)
SHR  R0, R0    ; 00001000 (8)
SHR  R0, R0    ; 00000100 (4)
HALT`,
    bytes: [0xA0, 1, 0x20, 0x20, 0x20, 0x20, 0x10, 0x10, 0x00],
    expect: 'R0 = 4',
  },
  logic: {
    name: 'Logic', desc: 'AND/OR/XOR/NOT',
    code: `; Logic gates demo
DATA R0, 0xAA   ; 10101010
DATA R1, 0x0F   ; 00001111
AND  R0, R1     ; 00001010 (0x0A)
DATA R2, 0xF0   ; 11110000
OR   R0, R2     ; 11111010 (0xFA)
NOT  R0, R0     ; 00000101 (0x05)
XOR  R0, R1     ; 00001010 (0x0A)
HALT`,
    bytes: [0xA0, 0xAA, 0xA4, 0x0F, 0x41, 0xA8, 0xF0, 0x52, 0x30, 0x61, 0x00],
    expect: 'R0 = 0x0A',
  },
  multiply: {
    name: 'Multiply', desc: '7 × 6 = 42',
    code: `; Multiply via repeated addition
; R0=result  R1=counter  R2=multiplicand  R3=one
        DATA R0, 0      ; result
        DATA R1, 6      ; counter (multiplier)
        DATA R2, 7      ; multiplicand
        DATA R3, 1      ; decrement value
loop:   ADD  R0, R2     ; result += 7
        CMP  R1, R3     ; counter == 1?
        JE   done       ; yes → done
        NOT  R3, R3
        DATA R2, 1
        ADD  R3, R2     ; R3 = -1
        ADD  R1, R3     ; R1 -= 1
        DATA R3, 1
        DATA R2, 7
        JMP  loop
done:   HALT`,
    bytes: [], expect: 'R0 = 42',
  },
  divide: {
    name: 'Division', desc: '100 ÷ 7',
    code: `; Division: 100 / 7
; R0=dividend  R1=divisor  R2=quotient  R3=one
        DATA R0, 100
        DATA R1, 7
        DATA R2, 0
        DATA R3, 1
loop:   CMP  R0, R1
        JA   subtract
        JE   subtract
        JMP  done
subtract:
        NOT  R1, R1
        ADD  R1, R3
        ADD  R0, R1
        ADD  R2, R3
        DATA R1, 7
        JMP  loop
done:   HALT
; R2=14 quotient, R0=2 remainder`,
    bytes: [], expect: 'R2=14, R0=2',
  },
  strcopy: {
    name: 'String', desc: 'Copy "Hi!"',
    code: `; Store string "Hi!" in RAM
        DATA R0, 72     ; 'H'
        STORE R0, 30
        DATA R0, 105    ; 'i'
        STORE R0, 31
        DATA R0, 33     ; '!'
        STORE R0, 32
        DATA R0, 0      ; null
        STORE R0, 33
        HALT`,
    bytes: [], expect: 'RAM[30-33] = "Hi!"',
  },
  sort: {
    name: 'Sort', desc: 'Bubble sort',
    code: `; Bubble Sort 4 values in RAM[40..43]
        DATA R0, 64
        STORE R0, 40
        DATA R0, 25
        STORE R0, 41
        DATA R0, 12
        STORE R0, 42
        DATA R0, 48
        STORE R0, 43
; Pass 1
        LOAD R0, 40
        LOAD R1, 41
        CMP  R0, R1
        JA   swap01
        JMP  c12
swap01: STORE R1, 40
        STORE R0, 41
c12:    LOAD R0, 41
        LOAD R1, 42
        CMP  R0, R1
        JA   swap12
        JMP  c23
swap12: STORE R1, 41
        STORE R0, 42
c23:    LOAD R0, 42
        LOAD R1, 43
        CMP  R0, R1
        JA   swap23
        JMP  pass2
swap23: STORE R1, 42
        STORE R0, 43
; Pass 2
pass2:  LOAD R0, 40
        LOAD R1, 41
        CMP  R0, R1
        JA   s01b
        JMP  c12b
s01b:   STORE R1, 40
        STORE R0, 41
c12b:   LOAD R0, 41
        LOAD R1, 42
        CMP  R0, R1
        JA   s12b
        JMP  pass3
s12b:   STORE R1, 41
        STORE R0, 42
; Pass 3
pass3:  LOAD R0, 40
        LOAD R1, 41
        CMP  R0, R1
        JA   s01c
        JMP  fin
s01c:   STORE R1, 40
        STORE R0, 41
fin:    HALT`,
    bytes: [], expect: 'RAM[40-43] = 12,25,48,64',
  },
  stack: {
    name: 'Stack', desc: 'Push/Pop',
    code: `; Stack using R3 as stack pointer
        DATA R3, 255    ; SP = top of RAM
; Push 42
        DATA R0, 42
        STORE R0, 255
        DATA R1, 1
        NOT  R1, R1
        DATA R2, 1
        ADD  R1, R2
        ADD  R3, R1     ; SP--
; Push 99
        DATA R0, 99
        STORE R0, 254
        ADD  R3, R1     ; SP--
; Pop → R0 (99)
        DATA R1, 1
        ADD  R3, R1     ; SP++
        LOAD R0, 254
; Pop → R1 (42)
        DATA R2, 1
        ADD  R3, R2     ; SP++
        LOAD R1, 255
        HALT`,
    bytes: [], expect: 'R0=99, R1=42',
  },
  flags: {
    name: 'Flags', desc: 'Flag tests',
    code: `; Flag demonstration
        DATA R0, 200
        DATA R1, 100
        ADD  R0, R1     ; 300→44+Carry
        DATA R0, 5
        DATA R1, 5
        CMP  R0, R1     ; Equal=1
        DATA R0, 10
        DATA R1, 3
        CMP  R0, R1     ; A_Larger=1
        DATA R0, 0
        DATA R1, 0
        ADD  R0, R1     ; Zero=1
        HALT`,
    bytes: [], expect: 'Zero=1',
  },
};

// ── Main App ─────────────────────────────────────────────────────────────

export default function App() {
  const computer = useComputer(SAMPLE_PROGRAMS.add.bytes);
  const [activeProgram, setActiveProgram] = useState('add');
  const [editorCode, setEditorCode] = useState(SAMPLE_PROGRAMS.add.code);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      switch (e.key.toLowerCase()) {
        case 's': computer.step(); break;
        case 'r': computer.run(); break;
        case 'p': case 'Escape': computer.pause(); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [computer]);

  const handleLoadProgram = (key: string) => {
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
          }}>v0.2 · 8-bit CPU</span>
        </div>

        {/* Program tabs */}
        <div style={{
          display: 'flex', alignItems: 'center', overflow: 'auto', maxWidth: '65vw',
        }}>
          {Object.entries(SAMPLE_PROGRAMS).map(([key, prog]) => (
            <button
              key={key}
              onClick={() => handleLoadProgram(key)}
              title={prog.desc}
              style={{
                background: activeProgram === key ? 'var(--bg-elevated)' : 'transparent',
                color: activeProgram === key ? 'var(--accent-blue)' : 'var(--text-muted)',
                border: 'none',
                borderBottom: activeProgram === key ? '2px solid var(--accent-blue)' : '2px solid transparent',
                padding: '6px 10px', fontSize: '0.7rem',
                fontWeight: activeProgram === key ? 700 : 500,
                cursor: 'pointer', fontFamily: 'var(--font-ui)',
                whiteSpace: 'nowrap', transition: 'all 0.15s',
              }}
            >
              {prog.name}
            </button>
          ))}
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
          />
        </div>

        <div style={styles.rightPanel}>
          <MemoryView memory={computer.memory} currentAddress={state?.iar ?? 0} />
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
        <span>PC <span style={{ color: 'var(--text-secondary)' }}>0x{(state?.iar ?? 0).toString(16).padStart(2, '0').toUpperCase()}</span></span>
        <span>Bus <span style={{ color: 'var(--text-secondary)' }}>0x{(state?.bus ?? 0).toString(16).padStart(2, '0').toUpperCase()}</span></span>
        <div style={{ flex: 1 }} />
        {isHalted && (
          <span style={{ color: 'var(--accent-green)', fontWeight: 600, fontSize: '0.7rem' }}>
            ✓ {SAMPLE_PROGRAMS[activeProgram]?.expect}
          </span>
        )}
        <span>History <span style={{ color: 'var(--text-secondary)' }}>{computer.traceHistory.length}</span></span>
      </div>
    </div>
  );
}
