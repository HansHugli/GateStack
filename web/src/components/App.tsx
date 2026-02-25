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
    gridTemplateColumns: '280px 1fr 460px',
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

// ── Bouncing Ball Video Generator ────────────────────────────────────────
function generateBouncingBall(): string {
  return `; Bouncing Ball — 64×64 Double-buffered, tear-free
; Page 0 at 0xA000 (1024 bytes), Page 1 at 0xA400 (1024 bytes)
; PAGE_SELECT at 0xDFFF = which page to DISPLAY
; Each frame: clear back page → draw border → draw ball → flip
;
; R4=ballX  R5=ballY  R6=dx  R7=dy
; R10=loop  R11=temp  R12=back page base
; R13=const64  R14=const1  R15=const0

; ── Init constants ──
        DATA R4, 20
        DATA R5, 3
        DATA R6, 1
        DATA R7, 1
        DATA R13, 64
        DATA R14, 1
        DATA R15, 0

; ── Draw first frame on page 0, display it ──
        DATA R12, 0xA000
        CALL draw_border
        CALL draw_ball
        DATA R0, 0
        STORE R0, 0xDFFF

; ══════════════════════════════════════
; ── MAIN LOOP ──
frame:
        ; Move ball
        ADD  R4, R6
        ADD  R5, R7
        ; Bounce X
        CMP  R4, R14
        JA   cx_hi
        JMP  flip_x
cx_hi:  DATA R11, 60
        CMP  R4, R11
        JA   flip_x
        JMP  chk_y
flip_x: DATA R11, 0
        SUB  R11, R6
        DATA R6, 0
        ADD  R6, R11
        ADD  R4, R6
        ADD  R4, R6
chk_y:  CMP  R5, R14
        JA   cy_hi
        JMP  flip_y
cy_hi:  DATA R11, 60
        CMP  R5, R11
        JA   flip_y
        JMP  do_draw
flip_y: DATA R11, 0
        SUB  R11, R7
        DATA R7, 0
        ADD  R7, R11
        ADD  R5, R7
        ADD  R5, R7

do_draw:
        ; Pick back page (opposite of display)
        LOAD R0, 0xDFFF
        CMP  R0, R15
        JE   back1
        DATA R12, 0xA000
        JMP  do_clr
back1:  DATA R12, 0xA400

do_clr:
        ; Clear 1024 bytes of back page
        PUSH R8
        DATA R8, 0
        ADD  R8, R12
        DATA R10, 0
clr:    STRI R15, R8
        ADD  R8, R14
        ADD  R10, R14
        DATA R11, 1024
        CMP  R10, R11
        JE   clr_done
        JMP  clr
clr_done:
        POP  R8

        ; Draw border + ball on back page
        CALL draw_border
        CALL draw_ball

        ; Flip display
        LOAD R0, 0xDFFF
        CMP  R0, R15
        JE   show1
        DATA R0, 0
        STORE R0, 0xDFFF
        JMP  frame
show1:  DATA R0, 1
        STORE R0, 0xDFFF
        JMP  frame

; ══════════════════════════════════════
; ── draw_border on R12 ──
draw_border:
        PUSH R10
        ; Top row (row 0, cols 0..63)
        DATA R10, 0
bt:     DATA R0, 1
        DATA R1, 0
        DATA R2, 0
        ADD  R2, R10
        CALL set_pixel
        ADD  R10, R14
        CMP  R10, R13
        JE   bbi
        JMP  bt
        ; Bottom row (row 63, cols 0..63)
bbi:    DATA R10, 0
bb:     DATA R0, 1
        DATA R1, 63
        DATA R2, 0
        ADD  R2, R10
        CALL set_pixel
        ADD  R10, R14
        CMP  R10, R13
        JE   bli
        JMP  bb
        ; Left col (col 0, rows 1..62)
bli:    DATA R10, 1
bl:     DATA R0, 1
        DATA R1, 0
        ADD  R1, R10
        DATA R2, 0
        CALL set_pixel
        ADD  R10, R14
        DATA R11, 63
        CMP  R10, R11
        JE   bri
        JMP  bl
        ; Right col (col 63, rows 1..62)
bri:    DATA R10, 1
br:     DATA R0, 1
        DATA R1, 0
        ADD  R1, R10
        DATA R2, 63
        CALL set_pixel
        ADD  R10, R14
        DATA R11, 63
        CMP  R10, R11
        JE   bdn
        JMP  br
bdn:    POP  R10
        RET

; ── draw_ball: 3×3 bright at (R4,R5) on R12 ──
draw_ball:
        PUSH R3
        PUSH R10
        DATA R3, 0
dr:     DATA R10, 0
dc:     DATA R0, 3
        DATA R1, 0
        ADD  R1, R5
        ADD  R1, R3
        DATA R2, 0
        ADD  R2, R4
        ADD  R2, R10
        CALL set_pixel
        ADD  R10, R14
        DATA R11, 3
        CMP  R10, R11
        JE   dnr
        JMP  dc
dnr:    ADD  R3, R14
        DATA R11, 3
        CMP  R3, R11
        JE   ddn
        JMP  dr
ddn:    POP  R10
        POP  R3
        RET

; ══════════════════════════════════════
; ── set_pixel: R0=color R1=row R2=col R12=page ──
; pixel index = row*64 + col
; byte offset = index / 4, bit pos = (3 - index%4) * 2
set_pixel:
        PUSH R0
        PUSH R1
        PUSH R2
        PUSH R3
        PUSH R9
        PUSH R11
        MUL  R1, R13
        ADD  R1, R2
        DATA R9, 0
        ADD  R9, R1
        DATA R11, 4
        DIV  R9, R11
        ADD  R9, R12
        MOD  R1, R11
        DATA R3, 3
        SUB  R3, R1
        DATA R11, 2
        MUL  R3, R11
        LDRI R11, R9
        DATA R2, 3
        DATA R1, 0
        ADD  R1, R0
        CMP  R3, R15
        JE   sp_ok
        SHL  R1
        SHL  R2
        SUB  R3, R14
        CMP  R3, R15
        JE   sp_ok
        SHL  R1
        SHL  R2
        SUB  R3, R14
        CMP  R3, R15
        JE   sp_ok
        SHL  R1
        SHL  R2
        SUB  R3, R14
        CMP  R3, R15
        JE   sp_ok
        SHL  R1
        SHL  R2
        SUB  R3, R14
        CMP  R3, R15
        JE   sp_ok
        SHL  R1
        SHL  R2
        SUB  R3, R14
        CMP  R3, R15
        JE   sp_ok
        SHL  R1
        SHL  R2
sp_ok:  NOT  R2
        AND  R11, R2
        OR   R11, R1
        DATA R2, 0xFF
        AND  R11, R2
        STRI R11, R9
        POP  R11
        POP  R9
        POP  R3
        POP  R2
        POP  R1
        POP  R0
        RET`;
}

const SAMPLE_PROGRAMS: Record<string, { name: string; desc: string; code: string; bytes: number[]; expect: string }> = {
  add: {
    name: 'Add', desc: '15 + 27 = 42',
    code: `; Simple addition: 15 + 27 = 42
DATA R0, 15
DATA R1, 27
ADD  R0, R1
HALT`,
    bytes: [], expect: 'R0 = 42',
  },
  count: {
    name: 'Count', desc: 'Loop 0→10',
    code: `; Count from 0 to 10
        DATA R0, 0      ; counter
        DATA R1, 1      ; increment
        DATA R2, 10     ; limit
loop:   ADD  R0, R1
        CMP  R0, R2
        JE   done
        JMP  loop
done:   HALT`,
    bytes: [], expect: 'R0 = 10',
  },
  fibonacci: {
    name: 'Fibonacci', desc: 'Print 1..46368',
    code: `; Fibonacci: print each number to console
; With 16-bit we can go up to 46368!
; Uses CALL/RET for the print subroutine
        DATA R0, 1      ; current
        DATA R1, 0      ; previous
loop:   ; Save state and print current
        PUSH R0
        PUSH R1
        CALL print_r0
        POP  R1
        POP  R0
        ; Next: R2 = R0 + R1
        DATA R2, 0
        ADD  R2, R0
        ADD  R2, R1
        ; Check overflow (R2 < R0 means wrapped)
        CMP  R2, R0
        JA   ok
        JE   ok
        JMP  done
ok:     ; Shift: prev=current, current=new
        DATA R1, 0
        ADD  R1, R0
        DATA R0, 0
        ADD  R0, R2
        JMP  loop
done:   HALT

; ── Print R0 as decimal + newline ──
print_r0:
        PUSH R1
        PUSH R2
        PUSH R3
        DATA R3, 0
        DATA R1, 10000
        CALL pr_dig
        DATA R1, 1000
        CALL pr_dig
        DATA R1, 100
        CALL pr_dig
        DATA R1, 10
        CALL pr_dig
        DATA R1, 48
        ADD  R0, R1
        OUT  R0
        DATA R0, 10
        OUT  R0
        POP  R3
        POP  R2
        POP  R1
        RET
pr_dig: PUSH R0
        DIV  R0, R1
        DATA R2, 0
        CMP  R0, R2
        JA   pd_s
        CMP  R3, R2
        JA   pd_s
        POP  R0
        MOD  R0, R1
        RET
pd_s:   DATA R3, 1
        DATA R2, 48
        ADD  R0, R2
        OUT  R0
        POP  R0
        MOD  R0, R1
        RET`,
    bytes: [], expect: 'Fibonacci sequence',
  },
  hello: {
    name: 'Hello', desc: '"Hello World!"',
    code: `; Print "Hello World!" using OUT
        DATA R0, 72     ; 'H'
        OUT  R0
        DATA R0, 101    ; 'e'
        OUT  R0
        DATA R0, 108    ; 'l'
        OUT  R0
        OUT  R0
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
        DATA R0, 10
        OUT  R0
        HALT`,
    bytes: [], expect: 'Hello World!',
  },
  multiply: {
    name: 'Multiply', desc: '123 × 456',
    code: `; Multiply: 123 × 456 = 56088
; With 16-bit MUL this is trivial!
        DATA R0, 123
        DATA R1, 456
        MUL  R0, R1     ; R0 = 56088
        CALL print_r0
        HALT

; ── Print R0 as decimal + newline ──
print_r0:
        PUSH R1
        PUSH R2
        PUSH R3
        DATA R3, 0
        DATA R1, 10000
        CALL pr_dig
        DATA R1, 1000
        CALL pr_dig
        DATA R1, 100
        CALL pr_dig
        DATA R1, 10
        CALL pr_dig
        ; Ones: always print
        DATA R1, 48
        ADD  R0, R1
        OUT  R0
        DATA R0, 10
        OUT  R0
        POP  R3
        POP  R2
        POP  R1
        RET
pr_dig: PUSH R0
        DIV  R0, R1
        DATA R2, 0
        CMP  R0, R2
        JA   pd_show
        CMP  R3, R2
        JA   pd_show
        POP  R0
        MOD  R0, R1
        RET
pd_show:
        DATA R3, 1
        DATA R2, 48
        ADD  R0, R2
        OUT  R0
        POP  R0
        MOD  R0, R1
        RET`,
    bytes: [], expect: '56088',
  },
  divide: {
    name: 'Division', desc: '355 ÷ 113',
    code: `; Division with decimal places: 355 / 113 = 3.14159...
; Uses DIV and MOD natively!
        DATA R0, 355
        DATA R1, 113
        ; Integer part
        PUSH R0
        PUSH R1
        DIV  R0, R1     ; R0 = 3
        DATA R2, 48
        ADD  R0, R2
        OUT  R0         ; print '3'
        DATA R0, 46
        OUT  R0         ; print '.'
        POP  R1
        POP  R0
        ; Get remainder
        MOD  R0, R1     ; R0 = 355 % 113 = 16
        ; Fractional digits: remainder * 10 / divisor
        DATA R3, 8      ; print 8 digits
frac:   DATA R2, 10
        MUL  R0, R2     ; R0 = remainder * 10
        PUSH R0
        DIV  R0, R1     ; digit = (rem*10) / 113
        DATA R2, 48
        ADD  R0, R2
        OUT  R0         ; print digit
        POP  R0
        MOD  R0, R1     ; R0 = new remainder
        DATA R2, 1
        SUB  R3, R2
        DATA R2, 0
        CMP  R3, R2
        JE   done
        JMP  frac
done:   DATA R0, 10
        OUT  R0
        HALT
; Output: 3.14159292 (close to Pi!)`,
    bytes: [], expect: '3.14159292',
  },
  shift: {
    name: 'Shift', desc: 'SHL/SHR bits',
    code: `; Shift operations on 16-bit values
DATA R0, 1       ; 0000000000000001
SHL  R0          ; 0000000000000010 (2)
SHL  R0          ; 0000000000000100 (4)
SHL  R0          ; 0000000000001000 (8)
SHL  R0          ; 0000000000010000 (16)
SHL  R0          ; 0000000000100000 (32)
SHL  R0          ; 0000000001000000 (64)
SHL  R0          ; 0000000010000000 (128)
SHL  R0          ; 0000000100000000 (256)
SHR  R0          ; 0000000010000000 (128)
SHR  R0          ; 0000000001000000 (64)
HALT`,
    bytes: [], expect: 'R0 = 64',
  },
  logic: {
    name: 'Logic', desc: 'All 7 gates',
    code: `; Logic gates: AND OR XOR NOT + composites
DATA R0, 0xAAAA  ; 1010101010101010
DATA R1, 0x00FF  ; 0000000011111111
; Primary gates
AND  R0, R1      ; 0000000010101010 (0x00AA)
DATA R0, 0xAAAA
OR   R0, R1      ; 1010101011111111 (0xAAFF)
DATA R0, 0xAAAA
XOR  R0, R1      ; 1010101001010101 (0xAA55)
DATA R0, 0xAAAA
NOT  R0          ; 0101010101010101 (0x5555)
; NAND = NOT(AND)
DATA R0, 0xAAAA
AND  R0, R1
NOT  R0          ; NAND: 0xFFFF ^ 0x00AA = 0xFF55
; NOR = NOT(OR)
DATA R0, 0xAAAA
OR   R0, R1
NOT  R0          ; NOR: ~0xAAFF = 0x5500
; XNOR = NOT(XOR)
DATA R0, 0xAAAA
XOR  R0, R1
NOT  R0          ; XNOR: ~0xAA55 = 0x55AA
HALT
; All 7 gates from 4 instructions!`,
    bytes: [], expect: 'R0 = 0x55AA',
  },
  stack: {
    name: 'Stack', desc: 'PUSH/POP/CALL/RET',
    code: `; Demonstrate stack operations and subroutines
        DATA R0, 100
        DATA R1, 200
        PUSH R0         ; push 100
        PUSH R1         ; push 200
        DATA R0, 0
        DATA R1, 0      ; clear regs
        POP  R1         ; R1 = 200 (LIFO!)
        POP  R0         ; R0 = 100
        ; Call a subroutine
        CALL double
        ; R0 is now 200
        HALT

; Subroutine: double R0
double: ADD  R0, R0
        RET`,
    bytes: [], expect: 'R0 = 200',
  },
  gcd: {
    name: 'GCD', desc: 'gcd(252,105)=21',
    code: `; Euclidean GCD using MOD instruction
; gcd(252, 105) = 21
        DATA R0, 252
        DATA R1, 105
loop:   DATA R2, 0
        CMP  R1, R2
        JE   done
        ; R2 = R0 mod R1
        DATA R2, 0
        ADD  R2, R0
        MOD  R2, R1     ; R2 = R0 % R1
        ; R0 = R1, R1 = R2
        DATA R0, 0
        ADD  R0, R1
        DATA R1, 0
        ADD  R1, R2
        JMP  loop
done:   HALT
; R0 = 21`,
    bytes: [], expect: 'R0 = 21',
  },
  factorial: {
    name: 'Factorial', desc: '8! = 40320',
    code: `; Compute 8! = 40320 using CALL/RET
; With 16-bit MUL: 8! fits in 16 bits!
        DATA R0, 8
        CALL fact
        ; R0 = 40320
        HALT

; Factorial subroutine (iterative)
; Input: R0 = n, Output: R0 = n!
fact:   DATA R1, 1      ; accumulator
        DATA R2, 1      ; decrement
floop:  CMP  R0, R2
        JE   fdone
        MUL  R1, R0     ; acc *= n
        SUB  R0, R2     ; n--
        JMP  floop
fdone:  DATA R0, 0
        ADD  R0, R1     ; R0 = result
        RET`,
    bytes: [], expect: 'R0 = 40320',
  },
  echo: {
    name: 'Echo', desc: 'IN/OUT loop',
    code: `; Echo: reads input and prints it back
; Type values — they echo as ASCII. Enter 0 to quit.
loop:   DATA R0, 62     ; '>'
        OUT  R0
        DATA R0, 32     ; ' '
        OUT  R0
        IN   R0
        DATA R1, 0
        CMP  R0, R1
        JE   done
        OUT  R0
        DATA R1, 10
        OUT  R1
        JMP  loop
done:   DATA R0, 10
        OUT  R0
        HALT`,
    bytes: [], expect: 'Interactive echo',
  },
  adder: {
    name: 'Adder', desc: 'Add two inputs',
    code: `; Interactive adder with decimal output
; Uses DIV/MOD for digit extraction!
        DATA R0, 65     ; 'A'
        OUT  R0
        DATA R0, 61     ; '='
        OUT  R0
        IN   R0
        PUSH R0
        DATA R0, 10
        OUT  R0
        DATA R0, 66     ; 'B'
        OUT  R0
        DATA R0, 61
        OUT  R0
        IN   R1
        POP  R0
        ADD  R0, R1     ; sum
        PUSH R0
        DATA R0, 10
        OUT  R0
        DATA R0, 61
        OUT  R0
        POP  R0
        CALL print_r0
        HALT

; ── Print R0 decimal + newline ──
print_r0:
        PUSH R1
        PUSH R2
        PUSH R3
        DATA R3, 0
        DATA R1, 10000
        CALL pr_dig
        DATA R1, 1000
        CALL pr_dig
        DATA R1, 100
        CALL pr_dig
        DATA R1, 10
        CALL pr_dig
        ; Ones
        DATA R1, 48
        ADD  R0, R1
        OUT  R0
        DATA R0, 10
        OUT  R0
        POP  R3
        POP  R2
        POP  R1
        RET

pr_dig: PUSH R0
        DIV  R0, R1     ; digit
        DATA R2, 0
        CMP  R0, R2
        JA   pr_show
        CMP  R3, R2
        JA   pr_show
        ; Skip leading zero
        POP  R0
        MOD  R0, R1
        RET
pr_show:
        DATA R3, 1
        DATA R2, 48
        ADD  R0, R2
        OUT  R0
        POP  R0
        MOD  R0, R1
        RET`,
    bytes: [], expect: 'A+B decimal',
  },
  calc: {
    name: 'Calc', desc: 'A op B REPL',
    code: `; Calculator REPL with +, -, *, /
; Enter A, op (43=+ 45=- 42=* 47=/), B
loop:   DATA R0, 62     ; '>'
        OUT  R0
        IN   R0         ; A
        DATA R1, 0
        CMP  R0, R1
        JE   quit
        PUSH R0
        DATA R0, 63     ; '?'
        OUT  R0
        IN   R1         ; op
        PUSH R1
        DATA R0, 63
        OUT  R0
        IN   R2         ; B
        PUSH R2
        POP  R2         ; B
        POP  R1         ; op
        POP  R0         ; A
        ; Dispatch
        DATA R3, 45     ; '-'
        CMP  R1, R3
        JE   do_sub
        DATA R3, 42     ; '*'
        CMP  R1, R3
        JE   do_mul
        DATA R3, 47     ; '/'
        CMP  R1, R3
        JE   do_div
        ; Default: add
        ADD  R0, R2
        JMP  show
do_sub: SUB  R0, R2
        JMP  show
do_mul: MUL  R0, R2
        JMP  show
do_div: DIV  R0, R2
show:   PUSH R0
        DATA R0, 61     ; '='
        OUT  R0
        POP  R0
        CALL print_r0
        JMP  loop
quit:   HALT

; Print R0 decimal + newline (same subroutine)
print_r0:
        PUSH R1
        PUSH R2
        PUSH R3
        DATA R3, 0
        DATA R1, 10000
        CALL pr_dig
        DATA R1, 1000
        CALL pr_dig
        DATA R1, 100
        CALL pr_dig
        DATA R1, 10
        CALL pr_dig
        DATA R1, 48
        ADD  R0, R1
        OUT  R0
        DATA R0, 10
        OUT  R0
        POP  R3
        POP  R2
        POP  R1
        RET
pr_dig: PUSH R0
        DIV  R0, R1
        DATA R2, 0
        CMP  R0, R2
        JA   c_show
        CMP  R3, R2
        JA   c_show
        POP  R0
        MOD  R0, R1
        RET
c_show: DATA R3, 1
        DATA R2, 48
        ADD  R0, R2
        OUT  R0
        POP  R0
        MOD  R0, R1
        RET`,
    bytes: [], expect: 'Calculator +−×÷',
  },
  primes: {
    name: 'Primes', desc: 'Print primes',
    code: `; Find primes to 100 using trial division
; With DIV and MOD, this is now clean!
        ; Print 2 first
        DATA R0, 50     ; '2'
        OUT  R0
        DATA R0, 10
        OUT  R0
        DATA R0, 3
        STORE R0, 1000  ; candidate
main:   LOAD R0, 1000
        DATA R1, 3      ; divisor
trial:  CMP  R1, R0
        JE   prime
        JA   prime
        ; Check divisibility
        PUSH R0
        MOD  R0, R1     ; R0 = candidate % divisor
        DATA R2, 0
        CMP  R0, R2
        POP  R0
        JE   notpr      ; divisible → not prime
        ; Next odd divisor
        DATA R2, 2
        ADD  R1, R2
        JMP  trial
prime:  ; Print it
        LOAD R0, 1000
        CALL print_r0
notpr:  LOAD R0, 1000
        DATA R1, 2
        ADD  R0, R1
        STORE R0, 1000
        DATA R1, 100
        CMP  R0, R1
        JA   done
        JMP  main
done:   HALT

; ── Print decimal ──
print_r0:
        PUSH R1
        PUSH R2
        PUSH R3
        DATA R3, 0
        DATA R1, 10000
        CALL pr_dig
        DATA R1, 1000
        CALL pr_dig
        DATA R1, 100
        CALL pr_dig
        DATA R1, 10
        CALL pr_dig
        DATA R1, 48
        ADD  R0, R1
        OUT  R0
        DATA R0, 10
        OUT  R0
        POP  R3
        POP  R2
        POP  R1
        RET
pr_dig: PUSH R0
        DIV  R0, R1
        DATA R2, 0
        CMP  R0, R2
        JA   pd_s
        CMP  R3, R2
        JA   pd_s
        POP  R0
        MOD  R0, R1
        RET
pd_s:   DATA R3, 1
        DATA R2, 48
        ADD  R0, R2
        OUT  R0
        POP  R0
        MOD  R0, R1
        RET`,
    bytes: [], expect: 'Primes to 100',
  },
  video: {
    name: 'Video', desc: 'Bouncing ball (real-time)',
    code: generateBouncingBall(),
    bytes: [], expect: 'Real-time bouncing ball',
  },
  power: {
    name: 'Power', desc: '2^15 = 32768',
    code: `; Compute 2^15 = 32768 using MUL
; 16-bit can hold up to 65535
        DATA R0, 2
        DATA R1, 2
        MUL  R0, R1     ; 4
        MUL  R0, R1     ; 8
        MUL  R0, R1     ; 16
        MUL  R0, R1     ; 32
        MUL  R0, R1     ; 64
        MUL  R0, R1     ; 128
        MUL  R0, R1     ; 256
        MUL  R0, R1     ; 512
        MUL  R0, R1     ; 1024
        MUL  R0, R1     ; 2048
        MUL  R0, R1     ; 4096
        MUL  R0, R1     ; 8192
        MUL  R0, R1     ; 16384
        MUL  R0, R1     ; 32768
        HALT
; R0 = 32768 (0x8000)`,
    bytes: [], expect: 'R0 = 32768',
  },
  sort: {
    name: 'Sort', desc: 'Bubble sort',
    code: `; Bubble sort 5 values stored in RAM
; With SUB for comparison, much cleaner
; Store values at RAM 1000-1004
        DATA R0, 64
        STORE R0, 1000
        DATA R0, 25
        STORE R0, 1001
        DATA R0, 12
        STORE R0, 1002
        DATA R0, 89
        STORE R0, 1003
        DATA R0, 37
        STORE R0, 1004
; Bubble sort (4 passes)
        DATA R3, 4
pass:   ; Compare adjacent pairs
        LOAD R0, 1000
        LOAD R1, 1001
        CMP  R0, R1
        JA   sw01
        JMP  c12
sw01:   STORE R1, 1000
        STORE R0, 1001
c12:    LOAD R0, 1001
        LOAD R1, 1002
        CMP  R0, R1
        JA   sw12
        JMP  c23
sw12:   STORE R1, 1001
        STORE R0, 1002
c23:    LOAD R0, 1002
        LOAD R1, 1003
        CMP  R0, R1
        JA   sw23
        JMP  c34
sw23:   STORE R1, 1002
        STORE R0, 1003
c34:    LOAD R0, 1003
        LOAD R1, 1004
        CMP  R0, R1
        JA   sw34
        JMP  nxt
sw34:   STORE R1, 1003
        STORE R0, 1004
nxt:    DATA R0, 1
        SUB  R3, R0
        DATA R0, 0
        CMP  R3, R0
        JE   done
        JMP  pass
done:   ; Print sorted values
        LOAD R0, 1000
        CALL print_r0
        LOAD R0, 1001
        CALL print_r0
        LOAD R0, 1002
        CALL print_r0
        LOAD R0, 1003
        CALL print_r0
        LOAD R0, 1004
        CALL print_r0
        HALT

print_r0:
        PUSH R1
        PUSH R2
        PUSH R3
        DATA R3, 0
        DATA R1, 100
        CALL pr_d
        DATA R1, 10
        CALL pr_d
        DATA R1, 48
        ADD  R0, R1
        OUT  R0
        DATA R0, 10
        OUT  R0
        POP  R3
        POP  R2
        POP  R1
        RET
pr_d:   PUSH R0
        DIV  R0, R1
        DATA R2, 0
        CMP  R0, R2
        JA   pds
        CMP  R3, R2
        JA   pds
        POP  R0
        MOD  R0, R1
        RET
pds:    DATA R3, 1
        DATA R2, 48
        ADD  R0, R2
        OUT  R0
        POP  R0
        MOD  R0, R1
        RET`,
    bytes: [], expect: '12 25 37 64 89',
  },
  flags: {
    name: 'Flags', desc: 'Flag tests',
    code: `; Test all CPU flags
DATA R0, 100
DATA R1, 200
CMP  R0, R1     ; A<B: carry=1, a_larger=0, equal=0
DATA R0, 200
CMP  R0, R1     ; A==B: equal=1
DATA R0, 300
CMP  R0, R1     ; A>B: a_larger=1
DATA R0, 65535
DATA R1, 1
ADD  R0, R1     ; overflow → carry=1, R0=0, zero=1
HALT`,
    bytes: [], expect: 'Carry + Zero set',
  },
  minmax: {
    name: 'MinMax', desc: 'Find min & max',
    code: `; Find min and max of values in RAM
; Values: 42, 17, 88, 3, 65
        DATA R0, 42
        STORE R0, 1000
        DATA R0, 17
        STORE R0, 1001
        DATA R0, 88
        STORE R0, 1002
        DATA R0, 3
        STORE R0, 1003
        DATA R0, 65
        STORE R0, 1004
        ; R1 = min, R2 = max
        LOAD R1, 1000
        DATA R2, 0
        ADD  R2, R1     ; max = first value
        ; Check each
        LOAD R0, 1001
        CMP  R0, R1
        JA   sk1
        DATA R1, 0
        ADD  R1, R0     ; new min
sk1:    CMP  R0, R2
        JA   mx1
        JMP  n2
mx1:    DATA R2, 0
        ADD  R2, R0
n2:     LOAD R0, 1002
        CMP  R0, R1
        JA   sk2
        DATA R1, 0
        ADD  R1, R0
sk2:    CMP  R0, R2
        JA   mx2
        JMP  n3
mx2:    DATA R2, 0
        ADD  R2, R0
n3:     LOAD R0, 1003
        CMP  R0, R1
        JA   sk3
        DATA R1, 0
        ADD  R1, R0
sk3:    CMP  R0, R2
        JA   mx3
        JMP  n4
mx3:    DATA R2, 0
        ADD  R2, R0
n4:     LOAD R0, 1004
        CMP  R0, R1
        JA   sk4
        DATA R1, 0
        ADD  R1, R0
sk4:    CMP  R0, R2
        JA   mx4
        JMP  fin
mx4:    DATA R2, 0
        ADD  R2, R0
fin:    HALT
; R1 = 3 (min), R2 = 88 (max)`,
    bytes: [], expect: 'R1=3, R2=88',
  },
};

// ── Main App ─────────────────────────────────────────────────────────────

export default function App() {
  const computer = useComputer([]);
  const [activeProgram, setActiveProgram] = useState('add');
  const [editorCode, setEditorCode] = useState(SAMPLE_PROGRAMS.add.code);
  const [showHelp, setShowHelp] = useState(false);

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
