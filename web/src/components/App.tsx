// ============================================================================
// App.tsx — GateStack Main Application
// ============================================================================
// Full dashboard layout with CPU view, memory hex dump, toolbar,
// code editor, ALU visualization, and signal trace display.
// ============================================================================

import React, { useState } from 'react';
import { useComputer } from '../hooks/useComputer';
import CpuView from './CpuView';
import MemoryView from './MemoryView';
import Toolbar from './Toolbar';
import CodeEditor from './CodeEditor';
import AluView from './AluView';
import BusView from './BusView';

// ── Styles ───────────────────────────────────────────────────────────────

const styles = {
  app: {
    minHeight: '100vh',
    background: '#0a0e1a',
    color: '#e2e8f0',
    fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
    display: 'flex',
    flexDirection: 'column' as const,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 20px',
    borderBottom: '1px solid #1e293b',
    background: '#0f1320',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  logoIcon: {
    fontSize: '1.5rem',
  },
  title: {
    fontSize: '1.2rem',
    fontWeight: 700,
    color: '#38bdf8',
    letterSpacing: '0.5px',
  },
  version: {
    fontSize: '0.7rem',
    color: '#475569',
    marginLeft: '8px',
  },
  main: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: '300px 1fr 420px',
    gridTemplateRows: 'auto 1fr',
    gap: '1px',
    background: '#1e293b',
    minHeight: 0,
  },
  toolbarRow: {
    gridColumn: '1 / -1',
    background: '#0f1320',
  },
  leftPanel: {
    background: '#0a0e1a',
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1px',
  },
  centerPanel: {
    background: '#0a0e1a',
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  rightPanel: {
    background: '#0a0e1a',
    overflow: 'auto',
  },
  statusBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 20px',
    borderTop: '1px solid #1e293b',
    background: '#0f1320',
    fontSize: '0.72rem',
    color: '#64748b',
  },
};

// ── Sample Programs ──────────────────────────────────────────────────────

const SAMPLE_PROGRAMS: Record<string, { name: string; code: string; bytes: number[] }> = {
  add: {
    name: 'Add Two Numbers',
    code: `; Add two numbers together
DATA R0, 15    ; R0 = 15
DATA R1, 27    ; R1 = 27
ADD  R0, R1    ; R0 = R0 + R1 = 42
; HALT         ; R0 now contains 42`,
    bytes: [0xA0, 15, 0xA4, 27, 0x01, 0x00],
  },
  count: {
    name: 'Count to 10',
    code: `; Count from 1 to 10 in R0
; addr 0: DATA R0, 0     ; R0 = counter
; addr 2: DATA R1, 1     ; R1 = increment
; addr 4: DATA R2, 10    ; R2 = target
; addr 6: ADD  R0, R1    ; R0 = R0 + 1
; addr 7: CMP  R0, R2    ; compare R0 with 10
; addr 8: JE   12        ; if equal, halt
; addr 10: JMP  6        ; loop back to ADD
; addr 12: HALT`,
    //              DATA R0,0  DATA R1,1  DATA R2,10  ADD R0,R1 CMP R0,R2  JE   12   JMP  6    HALT
    bytes: [0xA0, 0, 0xA4, 1, 0xA8, 10, 0x01,      0x72,      0xF0, 12, 0xC0, 6,   0x00],
  },
  fibonacci: {
    name: 'Fibonacci',
    code: `; Fibonacci sequence in R0
; 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233
; R0=current  R1=previous  R2=temp  R3=limit
; addr 0:  DATA R0, 1
; addr 2:  DATA R1, 0
; addr 4:  DATA R3, 200
; Loop:
; addr 6:  XOR  R2, R2    ; clear R2
; addr 7:  OR   R2, R0    ; R2 = copy of R0
; addr 8:  ADD  R0, R1    ; R0 = R0 + R1
; addr 9:  XOR  R1, R1    ; clear R1
; addr 10: OR   R1, R2    ; R1 = old R0
; addr 11: CMP  R0, R3    ; R0 vs 200?
; addr 12: JA   16        ; if R0 > 200, halt
; addr 14: JMP  6         ; loop
; addr 16: HALT           ; R0 = 233`,
    bytes: [0xA0, 0x01, 0xA4, 0x00, 0xAC, 0xC8,
            0x6A, 0x58, 0x01, 0x65, 0x56, 0x73,
            0xE0, 0x10, 0xC0, 0x06, 0x00],
  },
};

// ── App Component ────────────────────────────────────────────────────────

export default function App() {
  const computer = useComputer(SAMPLE_PROGRAMS.add.bytes);
  const [activeProgram, setActiveProgram] = useState('add');
  const [editorCode, setEditorCode] = useState(SAMPLE_PROGRAMS.add.code);

  const handleLoadProgram = (key: string) => {
    const prog = SAMPLE_PROGRAMS[key];
    if (prog) {
      setActiveProgram(key);
      setEditorCode(prog.code);
      computer.loadProgram(prog.bytes);
    }
  };

  const handleLoadBytes = (bytes: number[]) => {
    computer.loadProgram(bytes);
  };

  if (!computer.isReady) {
    return (
      <div style={{ ...styles.app, justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '16px' }}>⚡</div>
          <div style={{ color: '#38bdf8', fontSize: '1.2rem' }}>Loading GateStack...</div>
          <div style={{ color: '#475569', fontSize: '0.85rem', marginTop: '8px' }}>Initializing WASM core</div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.app}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.logo}>
          <span style={styles.logoIcon}>⚡</span>
          <span style={styles.title}>GateStack</span>
          <span style={styles.version}>v0.1.0 — 8-Bit Computer Simulator</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {Object.entries(SAMPLE_PROGRAMS).map(([key, prog]) => (
            <button
              key={key}
              onClick={() => handleLoadProgram(key)}
              style={{
                background: activeProgram === key ? '#1e40af' : '#1e293b',
                color: activeProgram === key ? '#fff' : '#94a3b8',
                border: '1px solid',
                borderColor: activeProgram === key ? '#3b82f6' : '#334155',
                borderRadius: '6px',
                padding: '4px 12px',
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              {prog.name}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div style={styles.main}>
        {/* Toolbar (full width) */}
        <div style={styles.toolbarRow}>
          <Toolbar computer={computer} />
        </div>

        {/* Left: CPU Registers + ALU */}
        <div style={styles.leftPanel}>
          <CpuView state={computer.state} trace={computer.trace} />
          <AluView trace={computer.trace} />
        </div>

        {/* Center: Code Editor + Bus Visualization */}
        <div style={styles.centerPanel}>
          <BusView state={computer.state} trace={computer.trace} />
          <CodeEditor
            code={editorCode}
            onChange={setEditorCode}
            currentAddress={computer.state?.iar ?? 0}
            onLoadBytes={handleLoadBytes}
          />
        </div>

        {/* Right: Memory View */}
        <div style={styles.rightPanel}>
          <MemoryView memory={computer.memory} currentAddress={computer.state?.iar ?? 0} />
        </div>
      </div>

      {/* Status Bar */}
      <div style={styles.statusBar}>
        <span>Cycle: {computer.state?.cycle_count ?? 0}</span>
        <span>PC: 0x{(computer.state?.iar ?? 0).toString(16).padStart(2, '0').toUpperCase()}</span>
        <span>Bus: 0x{(computer.state?.bus ?? 0).toString(16).padStart(2, '0').toUpperCase()}</span>
        <span>{computer.isRunning ? '🟢 Running' : computer.state?.halted ? '🔴 Halted' : '⏸️ Paused'}</span>
        <span>Mode: {computer.isRunning ? 'Continuous' : 'Step'}</span>
      </div>
    </div>
  );
}
