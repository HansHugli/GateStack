// ============================================================================
// App.tsx — GateStack Main Application
// ============================================================================
// Full dashboard layout with CPU view, memory hex dump, toolbar,
// code editor, ALU visualization, and signal trace display.
// ============================================================================

import React, { useState, useEffect } from 'react';
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

const SAMPLE_PROGRAMS: Record<string, { name: string; code: string; bytes: number[]; expect: string }> = {
  add: {
    name: 'Add',
    code: `; Add two numbers: 15 + 27 = 42
DATA R0, 15    ; R0 = 15
DATA R1, 27    ; R1 = 27
ADD  R0, R1    ; R0 = R0 + R1
HALT           ; R0 = 42`,
    bytes: [0xA0, 15, 0xA4, 27, 0x01, 0x00],
    expect: 'R0 = 42',
  },
  count: {
    name: 'Count',
    code: `; Count from 0 to 10 in R0
DATA R0, 0     ; counter = 0
DATA R1, 1     ; increment
DATA R2, 10    ; target
ADD  R0, R1    ; R0++
CMP  R0, R2    ; R0 == 10?
JE   12        ; yes → halt
JMP  6         ; no → loop
HALT           ; R0 = 10`,
    bytes: [0xA0, 0, 0xA4, 1, 0xA8, 10, 0x01, 0x72, 0xF0, 12, 0xC0, 6, 0x00],
    expect: 'R0 = 10',
  },
  fibonacci: {
    name: 'Fibonacci',
    code: `; Fibonacci: 1,1,2,3,5,8,13,21,34,55,89,144,233
; R0=current  R1=prev  R2=temp  R3=limit
DATA R0, 1     ; fib(1) = 1
DATA R1, 0     ; fib(0) = 0
DATA R3, 200   ; stop when > 200
XOR  R2, R2    ; clear temp
OR   R2, R0    ; temp = current
ADD  R0, R1    ; current += prev
XOR  R1, R1    ; clear prev
OR   R1, R2    ; prev = old current
CMP  R0, R3    ; current > limit?
JA   16        ; yes → halt
JMP  6         ; no → loop
HALT           ; R0 = 233`,
    bytes: [0xA0, 0x01, 0xA4, 0x00, 0xAC, 0xC8,
            0x6A, 0x58, 0x01, 0x65, 0x56, 0x73,
            0xE0, 0x10, 0xC0, 0x06, 0x00],
    expect: 'R0 = 233',
  },
  multiply: {
    name: 'Multiply',
    code: `; Multiply 7 × 8 = 56 (repeated addition)
; R0=result  R1=multiplicand  R2=counter  R3=temp
DATA R0, 0     ; result = 0
DATA R1, 7     ; multiplicand
DATA R2, 8     ; counter (multiplier)
ADD  R0, R1    ; result += 7
DATA R3, 1     ; for comparison
CMP  R2, R3    ; last iteration?
JE   17        ; yes → halt
DATA R3, 255   ; -1 (wrapping)
ADD  R2, R3    ; counter--
JMP  6         ; loop
HALT           ; R0 = 56`,
    bytes: [0xA0, 0x00, 0xA4, 0x07, 0xA8, 0x08,
            0x01, 0xAC, 0x01, 0x7B, 0xF0, 0x11,
            0xAC, 0xFF, 0x0B, 0xC0, 0x06, 0x00],
    expect: 'R0 = 56',
  },
  shift: {
    name: 'Shift',
    code: `; Multiply by 4 using bit shifts
; 13 × 4 = 52
DATA R0, 13    ; R0 = 13 (0b00001101)
SHL  R0, R0    ; R0 = 26 (0b00011010)
SHL  R0, R0    ; R0 = 52 (0b00110100)
HALT           ; R0 = 52`,
    bytes: [0xA0, 0x0D, 0x20, 0x20, 0x00],
    expect: 'R0 = 52',
  },
  swap: {
    name: 'Mem Swap',
    code: `; Store values to RAM, then load them back swapped
DATA R0, 42    ; R0 = 42
DATA R1, 99    ; R1 = 99
STORE R0, [200]; RAM[200] = 42
STORE R1, [201]; RAM[201] = 99
XOR  R0, R0    ; clear R0
XOR  R1, R1    ; clear R1
LOAD R0, [201] ; R0 = RAM[201] = 99
LOAD R1, [200] ; R1 = RAM[200] = 42
HALT           ; R0=99, R1=42 (swapped!)`,
    bytes: [0xA0, 0x2A, 0xA4, 0x63, 0x90, 0xC8, 0x94, 0xC9,
            0x60, 0x65, 0x80, 0xC9, 0x84, 0xC8, 0x00],
    expect: 'R0 = 99, R1 = 42',
  },
  bitwise: {
    name: 'Bitwise',
    code: `; Bitwise operations demo
; R0 = 0xAA (10101010), R1 = 0x0F (00001111)
DATA R0, 170   ; 0xAA = 10101010
DATA R1, 15    ; 0x0F = 00001111
XOR  R2, R2    ; clear R2
OR   R2, R0    ; R2 = 0xAA (copy)
AND  R2, R1    ; R2 = 0xAA & 0x0F = 0x0A
NOT  R0, R0    ; R0 = ~0xAA = 0x55
OR   R0, R1    ; R0 = 0x55 | 0x0F = 0x5F
HALT           ; R0=0x5F, R2=0x0A`,
    bytes: [0xA0, 0xAA, 0xA4, 0x0F, 0x6A, 0x58, 0x49, 0x30, 0x51, 0x00],
    expect: 'R0 = 0x5F, R2 = 0x0A',
  },
  hello: {
    name: 'Hello World',
    code: `; Stores "Hello World!" in RAM at addresses 200-211
; Each character is loaded into R0 then stored to RAM
; After running, check the ASCII column in the memory
; viewer — you'll see the message at row C8!
DATA R0, 72    ; 'H'
STORE R0, [200]
DATA R0, 101   ; 'e'
STORE R0, [201]
DATA R0, 108   ; 'l'
STORE R0, [202]
DATA R0, 108   ; 'l'
STORE R0, [203]
DATA R0, 111   ; 'o'
STORE R0, [204]
DATA R0, 32    ; ' '
STORE R0, [205]
DATA R0, 87    ; 'W'
STORE R0, [206]
DATA R0, 111   ; 'o'
STORE R0, [207]
DATA R0, 114   ; 'r'
STORE R0, [208]
DATA R0, 108   ; 'l'
STORE R0, [209]
DATA R0, 100   ; 'd'
STORE R0, [210]
DATA R0, 33    ; '!'
STORE R0, [211]
HALT           ; Check RAM[200-211] ASCII column!`,
    bytes: [
      0xA0, 0x48, 0x90, 0xC8, 0xA0, 0x65, 0x90, 0xC9,
      0xA0, 0x6C, 0x90, 0xCA, 0xA0, 0x6C, 0x90, 0xCB,
      0xA0, 0x6F, 0x90, 0xCC, 0xA0, 0x20, 0x90, 0xCD,
      0xA0, 0x57, 0x90, 0xCE, 0xA0, 0x6F, 0x90, 0xCF,
      0xA0, 0x72, 0x90, 0xD0, 0xA0, 0x6C, 0x90, 0xD1,
      0xA0, 0x64, 0x90, 0xD2, 0xA0, 0x21, 0x90, 0xD3,
      0x00,
    ],
    expect: 'RAM[200-211] = "Hello World!"',
  },
};

// ── App Component ────────────────────────────────────────────────────────

export default function App() {
  const computer = useComputer(SAMPLE_PROGRAMS.add.bytes);
  const [activeProgram, setActiveProgram] = useState('add');
  const [editorCode, setEditorCode] = useState(SAMPLE_PROGRAMS.add.code);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't trigger when typing in textarea
      if ((e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      switch (e.key.toLowerCase()) {
        case 's': computer.step(); break;
        case 'r': computer.run(); break;
        case 'p': computer.pause(); break;
        case 'escape': computer.pause(); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [computer]);

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
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
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
                padding: '4px 10px',
                fontSize: '0.7rem',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
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
        {computer.state?.halted && (
          <span style={{ color: '#4ade80' }}>✓ Expected: {SAMPLE_PROGRAMS[activeProgram]?.expect}</span>
        )}
        <span>Mode: {computer.isRunning ? 'Continuous' : 'Step'}</span>
      </div>
    </div>
  );
}
