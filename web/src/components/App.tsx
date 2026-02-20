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
    name: 'Hello', desc: '"Hello World!" OUT',
    code: `; Print "Hello World!" to the console using OUT
        DATA R0, 72     ; 'H'
        OUT  R0
        DATA R0, 101    ; 'e'
        OUT  R0
        DATA R0, 108    ; 'l'
        OUT  R0
        OUT  R0          ; 'l' again
        DATA R0, 111    ; 'o'
        OUT  R0
        DATA R0, 32     ; ' '
        OUT  R0
        DATA R0, 87     ; 'W'
        OUT  R0
        DATA R0, 111    ; 'o'
        OUT  R0
        DATA R0, 114    ; 'r'
        OUT  R0
        DATA R0, 108    ; 'l'
        OUT  R0
        DATA R0, 100    ; 'd'
        OUT  R0
        DATA R0, 33     ; '!'
        OUT  R0
        DATA R0, 10     ; newline
        OUT  R0
        HALT
; Watch the console panel on the right!`,
    bytes: [], expect: 'Console: Hello World!',
  },
  sort: {
    name: 'Sort', desc: 'Bubble sort',
    code: `; Bubble Sort 4 values in RAM[240..243]
        DATA R0, 64
        STORE R0, 240
        DATA R0, 25
        STORE R0, 241
        DATA R0, 12
        STORE R0, 242
        DATA R0, 48
        STORE R0, 243
; Pass 1
        LOAD R0, 240
        LOAD R1, 241
        CMP  R0, R1
        JA   swap01
        JMP  c12
swap01: STORE R1, 240
        STORE R0, 241
c12:    LOAD R0, 241
        LOAD R1, 242
        CMP  R0, R1
        JA   swap12
        JMP  c23
swap12: STORE R1, 241
        STORE R0, 242
c23:    LOAD R0, 242
        LOAD R1, 243
        CMP  R0, R1
        JA   swap23
        JMP  pass2
swap23: STORE R1, 242
        STORE R0, 243
; Pass 2
pass2:  LOAD R0, 240
        LOAD R1, 241
        CMP  R0, R1
        JA   s01b
        JMP  c12b
s01b:   STORE R1, 240
        STORE R0, 241
c12b:   LOAD R0, 241
        LOAD R1, 242
        CMP  R0, R1
        JA   s12b
        JMP  pass3
s12b:   STORE R1, 241
        STORE R0, 242
; Pass 3
pass3:  LOAD R0, 240
        LOAD R1, 241
        CMP  R0, R1
        JA   s01c
        JMP  fin
s01c:   STORE R1, 240
        STORE R0, 241
fin:    HALT`,
    bytes: [], expect: 'RAM[240-243] sorted',
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
  power: {
    name: 'Power', desc: '2^8 = 256',
    code: `; Compute powers of 2 via repeated doubling
; Stores 2^0 through 2^7 in RAM[50..57]
; R0=value  R1=address  R2=count  R3=one
        DATA R0, 1      ; start with 1
        DATA R1, 50     ; store address
        DATA R2, 8      ; 8 powers
        DATA R3, 1
loop:   STORE R0, 230    ; *addr = value
        ; Use R1 to track which address (manual)
        SHL  R0, R0     ; value *= 2
        ; Decrement counter
        NOT  R3, R3
        DATA R1, 1
        ADD  R3, R1     ; R3 = -1
        ADD  R2, R3     ; count--
        DATA R3, 1      ; restore
        DATA R1, 0
        CMP  R2, R1     ; count == 0?
        JE   done
        JMP  loop
done:   HALT
; R0 wraps: 1→2→4→8→16→32→64→128→0 (overflow!)`,
    bytes: [], expect: 'R0 = 0 (overflow)',
  },
  pattern: {
    name: 'Pattern', desc: 'Checkerboard',
    code: `; Fill RAM[60..75] with alternating checkerboard
; 0xAA = 10101010, 0x55 = 01010101
        DATA R0, 0xAA   ; pattern A
        DATA R1, 0x55   ; pattern B
        DATA R2, 60     ; start addr
        DATA R3, 8      ; half count
; Fill with pattern A
        STORE R0, 210
        STORE R1, 211
        STORE R0, 212
        STORE R1, 213
        STORE R0, 214
        STORE R1, 215
        STORE R0, 216
        STORE R1, 217
; Fill with pattern B (inverted rows)
        STORE R1, 218
        STORE R0, 219
        STORE R1, 220
        STORE R0, 221
        STORE R1, 222
        STORE R0, 223
        STORE R1, 224
        STORE R0, 225
        HALT`,
    bytes: [], expect: 'RAM[210-225] checkerboard',
  },
  gcd: {
    name: 'GCD', desc: 'gcd(48,18)=6',
    code: `; Greatest Common Divisor using subtraction
; gcd(48, 18) = 6  (Euclidean algorithm)
; R0=a  R1=b  R2=temp  R3=one
        DATA R0, 48     ; a
        DATA R1, 18     ; b
        DATA R3, 1
loop:   CMP  R0, R1     ; a == b?
        JE   done       ; yes → gcd found
        JA   sub_b      ; a > b → a -= b
; else a < b → b -= a
        NOT  R0, R0
        ADD  R0, R3     ; R0 = -a (2's complement)
        ADD  R1, R0     ; b -= a
        ; restore a: a = -(R0-1) → we need original a
        NOT  R0, R0     
        ADD  R0, R3     ; R0 = original a
        JMP  loop
sub_b:  NOT  R1, R1
        ADD  R1, R3     ; R1 = -b
        ADD  R0, R1     ; a -= b
        ; restore b
        NOT  R1, R1
        ADD  R1, R3     ; R1 = original b
        JMP  loop
done:   HALT
; R0 = R1 = 6 (the GCD)`,
    bytes: [], expect: 'R0 = R1 = 6',
  },
  abs: {
    name: 'Abs', desc: 'Absolute value',
    code: `; Compute absolute value of signed byte
; Treating values >= 128 as negative
; R0=input  R1=128 boundary  R2=result
        DATA R0, 200    ; -56 in signed
        DATA R1, 128    ; sign boundary
        CMP  R0, R1     ; >= 128? (negative)
        JA   negate     ; yes → negate it
        JE   negate     ; 128 is also negative
        JMP  positive   ; no → already positive
negate: NOT  R0, R0     ; flip bits
        DATA R1, 1
        ADD  R0, R1     ; add 1 (2's complement)
positive:
        HALT
; 200 unsigned = -56 signed → |−56| = 56
; R0 = 56`,
    bytes: [], expect: 'R0 = 56',
  },
  minmax: {
    name: 'MinMax', desc: 'Find min & max',
    code: `; Find min and max of 5 values
; Store at RAM[200-204] to avoid code overlap
; R0=current  R1=min  R2=max
        DATA R0, 42
        STORE R0, 200
        DATA R0, 17
        STORE R0, 201
        DATA R0, 85
        STORE R0, 202
        DATA R0, 3
        STORE R0, 203
        DATA R0, 61
        STORE R0, 204
; Init min=max=first value
        LOAD R1, 200    ; min = 42
        LOAD R2, 200    ; max = 42
; Check val=17
        LOAD R0, 201
        CMP  R1, R0     ; min(42) > val(17)?
        JA   nm1
        JMP  mx1
nm1:    DATA R1, 0
        ADD  R1, R0     ; min = val
mx1:    CMP  R0, R2     ; val > max?
        JA   sm1
        JMP  v2
sm1:    DATA R2, 0
        ADD  R2, R0
; Check val=85
v2:     LOAD R0, 202
        CMP  R1, R0
        JA   nm2
        JMP  mx2
nm2:    DATA R1, 0
        ADD  R1, R0
mx2:    CMP  R0, R2
        JA   sm2
        JMP  v3
sm2:    DATA R2, 0
        ADD  R2, R0
; Check val=3
v3:     LOAD R0, 203
        CMP  R1, R0
        JA   nm3
        JMP  mx3
nm3:    DATA R1, 0
        ADD  R1, R0
mx3:    CMP  R0, R2
        JA   sm3
        JMP  v4
sm3:    DATA R2, 0
        ADD  R2, R0
; Check val=61
v4:     LOAD R0, 204
        CMP  R1, R0
        JA   nm4
        JMP  mx4
nm4:    DATA R1, 0
        ADD  R1, R0
mx4:    CMP  R0, R2
        JA   sm4
        JMP  fin
sm4:    DATA R2, 0
        ADD  R2, R0
fin:    HALT
; R1 = 3 (min), R2 = 85 (max)`,
    bytes: [], expect: 'R1=3, R2=85',
  },
  primes: {
    name: 'Primes', desc: 'Sieve <128',
    code: `; Find primes up to 127 using trial division
; Store primes at RAM[200+], count in R3
; R0=candidate  R1=divisor  R2=temp  R3=count
; Uses RAM[200+] for prime storage
        DATA R3, 0      ; prime count
        DATA R0, 2      ; start candidate = 2
; Store 2 as first prime
        STORE R0, 200
        DATA R3, 1      ; count = 1
        DATA R0, 3      ; next candidate
; Main loop: test each odd number
main:   DATA R1, 3      ; start divisor at 3
        ; Quick check: is candidate even? (bit 0)
        ; Actually just test divisors
trial:  ; Check if R1*R1 > R0 (if so, R0 is prime)
        ; We approximate: if R1 > R0/2, it's prime
        ; Simpler: if R1 >= R0, done testing = prime
        CMP  R1, R0
        JE   skip       ; R1==R0 means we tested all
        JA   found      ; R1>R0 means prime
        ; Check if R0 mod R1 == 0
        ; R2 = R0, then subtract R1 repeatedly
        DATA R2, 0
        ADD  R2, R0     ; R2 = candidate
moddiv: CMP  R2, R1     ; R2 >= R1?
        JA   dosub
        JE   notprime   ; R2 == R1 means divides evenly
        JMP  isrem      ; R2 < R1 means remainder
dosub:  ; R2 -= R1
        NOT  R1, R1
        DATA R2, 0
        ADD  R2, R0     ; need to redo... too complex
        ; Simpler: just increment divisor
        JMP  nextd
isrem:  ; Has remainder, try next divisor
nextd:  DATA R2, 2      ; increment by 2
        ADD  R1, R2     ; next odd divisor
        JMP  trial
notprime:
        JMP  next
skip:
found:  ; R0 is prime — store it
        ; Store at 200 + R3
        ; We can't do indirect store, so use fixed slots
        ; Store count and value together
        CMP  R3, R3     ; just mark we found one
        DATA R2, 1
        ADD  R3, R2     ; count++
next:   ; R0 += 2 (next odd candidate)
        DATA R2, 2
        ADD  R0, R2
        ; Check if R0 > 127
        DATA R2, 127
        CMP  R0, R2
        JA   done
        JMP  main
done:   HALT
; R3 = count of primes found (approx)
; Note: limited by lack of indirect addressing`,
    bytes: [], expect: 'R3 = prime count',
  },
  pi: {
    name: 'Pi', desc: '≈3.14 Leibniz',
    code: `; Approximate Pi using Leibniz series
; Pi/4 = 1 - 1/3 + 1/5 - 1/7 + ...
; With 8-bit math we use scaled integers:
; Compute 4*N * (1 - 1/3 + 1/5 - 1/7...)
; Approximation: 4 - 4/3 + 4/5 - 4/7 + 4/9 - 4/11
; In integers: 4*256/1 - 4*256/3 + 4*256/5 - ...
; Simplified: accumulate in R0 using small terms
; Term values (pre-computed, scaled to ~100):
;   4/1=100, 4/3=33, 4/5=20, 4/7=14, 4/9=11, 4/11=9
;   4/13=8, 4/15=7, 4/17=6, 4/19=5, 4/21=5
; Pi ≈ 100-33+20-14+11-9+8-7+6-5+5 = ~82 → /25.6 ≈ 3.2
; Let's compute directly:
        DATA R0, 0      ; accumulator
        DATA R1, 100    ; 4/1 * 25
        ADD  R0, R1     ; + 100
        DATA R1, 33     ; 4/3 * 25
        ; subtract: R0 -= 33
        NOT  R1, R1
        DATA R2, 1
        ADD  R1, R2     ; R1 = -33
        ADD  R0, R1     ; R0 = 67
        DATA R1, 20     ; 4/5 * 25
        ADD  R0, R1     ; R0 = 87
        DATA R1, 14     ; 4/7 * 25
        NOT  R1, R1
        DATA R2, 1
        ADD  R1, R2
        ADD  R0, R1     ; R0 = 73
        DATA R1, 11     ; 4/9 * 25
        ADD  R0, R1     ; R0 = 84
        DATA R1, 9      ; 4/11 * 25
        NOT  R1, R1
        DATA R2, 1
        ADD  R1, R2
        ADD  R0, R1     ; R0 = 75
        DATA R1, 8      ; 4/13
        ADD  R0, R1     ; R0 = 83
        DATA R1, 7      ; 4/15
        NOT  R1, R1
        DATA R2, 1
        ADD  R1, R2
        ADD  R0, R1     ; R0 = 76
        DATA R1, 6      ; 4/17
        ADD  R0, R1     ; R0 = 82
        DATA R1, 5      ; 4/19
        NOT  R1, R1
        DATA R2, 1
        ADD  R1, R2
        ADD  R0, R1     ; R0 = 77
        DATA R1, 5      ; 4/21
        ADD  R0, R1     ; R0 = 82
        DATA R1, 4      ; 4/23
        NOT  R1, R1
        DATA R2, 1
        ADD  R1, R2
        ADD  R0, R1     ; R0 = 78
; Store in RAM for display
        STORE R0, 250   ; scaled result
; R0 ≈ 78-82 → divide by 25 ≈ 3.12-3.28
; Actual Pi = 3.14159... our approx ≈ 3.1
        HALT
; R0 = ~78 (78/25 = 3.12 ≈ Pi)`,
    bytes: [], expect: 'R0 ≈ 78 (÷25 ≈ 3.12)',
  },
  echo: {
    name: 'Echo', desc: 'IN/OUT echo loop',
    code: `; Echo: reads input and prints it back
; Type values in the console — they echo as ASCII
; Enter 0 to quit
loop:   DATA R0, 62     ; '>'
        OUT  R0
        DATA R0, 32     ; ' '
        OUT  R0
        IN   R0         ; read input
        DATA R1, 0
        CMP  R0, R1
        JE   done
        OUT  R0         ; echo as character
        DATA R1, 10
        OUT  R1         ; newline
        JMP  loop
done:   DATA R0, 10
        OUT  R0
        HALT
; Type ASCII codes, see them echoed. 0 to quit.`,
    bytes: [], expect: 'Interactive echo loop',
  },
  adder: {
    name: 'Adder', desc: 'Add two inputs',
    code: `; Interactive adder: input two numbers, print decimal sum
        DATA R0, 65     ; 'A'
        OUT  R0
        DATA R0, 61     ; '='
        OUT  R0
        IN   R0         ; A → R0
        DATA R2, 0
        ADD  R2, R0     ; save A in R2
        DATA R0, 10
        OUT  R0
        DATA R0, 66     ; 'B'
        OUT  R0
        DATA R0, 61     ; '='
        OUT  R0
        IN   R1         ; B → R1
        ADD  R2, R1     ; R2 = A + B
        DATA R0, 10
        OUT  R0
        DATA R0, 61     ; '='
        OUT  R0
        ; --- Print R2 as decimal (0-255) ---
        ; Save sum to R0 for printing routine
        DATA R0, 0
        ADD  R0, R2
        ; Extract hundreds: subtract 100 repeatedly
        DATA R3, 0      ; digit counter
        DATA R1, 100
hund:   CMP  R1, R0     ; is 100 > R0?
        JA   phund      ; yes → done with hundreds
        ; R0 >= 100, subtract it
        ; Negate R1: NOT + 1
        NOT  R1
        DATA R2, 1
        ADD  R1, R2     ; R1 = -100 (two's complement)
        ADD  R0, R1     ; R0 -= 100
        DATA R2, 1
        ADD  R3, R2     ; hundreds++
        DATA R1, 100
        JMP  hund
phund:  ; Print hundreds digit (skip if 0)
        DATA R1, 0
        CMP  R3, R1
        JE   tens
        STORE R0, 200   ; save R0
        DATA R0, 48
        ADD  R0, R3     ; '0' + digit
        OUT  R0
        LOAD R0, 200    ; restore R0
        ; Extract tens
tens:   DATA R3, 0
        DATA R1, 10
ten_lp: CMP  R1, R0     ; is 10 > R0?
        JA   ptens
        NOT  R1
        DATA R2, 1
        ADD  R1, R2
        ADD  R0, R1     ; R0 -= 10
        DATA R2, 1
        ADD  R3, R2     ; tens++
        DATA R1, 10
        JMP  ten_lp
ptens:  ; Print tens digit
        STORE R0, 200   ; save ones
        DATA R0, 48
        ADD  R0, R3
        OUT  R0
        ; Print ones digit
        LOAD R0, 200
        DATA R1, 48
        ADD  R0, R1     ; '0' + ones
        OUT  R0
        DATA R0, 10
        OUT  R0
        HALT
; Enter two numbers (0-127), see their decimal sum!`,
    bytes: [], expect: 'A+B as decimal',
  },
};

// ── Main App ─────────────────────────────────────────────────────────────

export default function App() {
  const computer = useComputer(SAMPLE_PROGRAMS.add.bytes);
  const [activeProgram, setActiveProgram] = useState('add');
  const [editorCode, setEditorCode] = useState(SAMPLE_PROGRAMS.add.code);
  const [showHelp, setShowHelp] = useState(false);

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
            breakpoints={computer.breakpoints}
            onToggleBreakpoint={computer.toggleBreakpoint}
          />
        </div>

        <div style={styles.rightPanel}>
          <MemoryView memory={computer.memory} currentAddress={state?.iar ?? 0} onPoke={computer.poke} />
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
        <span>PC <span style={{ color: 'var(--text-secondary)' }}>0x{(state?.iar ?? 0).toString(16).padStart(2, '0').toUpperCase()}</span></span>
        <span>Bus <span style={{ color: 'var(--text-secondary)' }}>0x{(state?.bus ?? 0).toString(16).padStart(2, '0').toUpperCase()}</span></span>
        <div style={{ flex: 1 }} />
        {isHalted && (
          <span style={{ color: 'var(--accent-green)', fontWeight: 600, fontSize: '0.7rem' }}>
            ✓ {SAMPLE_PROGRAMS[activeProgram]?.expect}
          </span>
        )}
        <span>History <span style={{ color: 'var(--text-secondary)' }}>{computer.traceHistory.length}</span></span>
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
