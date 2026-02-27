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
  return `; Bouncing Ball — 4bpp, 256×256 framebuffer
; Ball in 64×64 area at rows 0-63, cols 0-63
; Video RAM at 0x8000, 128 bytes/row (256px, 4bpp)
; 4bpp: high nibble = even col, low nibble = odd col
;
; R4=ballX  R5=ballY  R6=dx  R7=dy
; R12=0x8000  R13=128  R14=1  R15=0

; ── Init ──
        DATA R4, 20
        DATA R5, 3
        DATA R6, 1
        DATA R7, 1
        DATA R12, 0x8000
        DATA R13, 128
        DATA R14, 1
        DATA R15, 0

; ── Draw initial frame ──
        CALL clear_area
        CALL draw_border
        CALL draw_ball
        DATA R0, 0
        STORE R0, 0xDFFF

; ── MAIN LOOP ──
frame:
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
        CALL clear_area
        CALL draw_border
        CALL draw_ball
        DATA R0, 0
        STORE R0, 0xDFFF
        JMP  frame

; ── clear_area: zero 64 rows × 32 bytes ──
clear_area:
        PUSH R8
        PUSH R9
        PUSH R10
        DATA R8, 0
ca_row: DATA R9, 0
        ADD  R9, R8
        MUL  R9, R13
        ADD  R9, R12
        DATA R10, 0
ca_col: STRI R15, R9
        ADD  R9, R14
        ADD  R10, R14
        DATA R11, 32
        CMP  R10, R11
        JE   ca_nr
        JMP  ca_col
ca_nr:  ADD  R8, R14
        DATA R11, 64
        CMP  R8, R11
        JE   ca_dn
        JMP  ca_row
ca_dn:  POP  R10
        POP  R9
        POP  R8
        RET

; ── draw_border: color 5 (teal) ──
draw_border:
        PUSH R10
        DATA R10, 0
bt:     DATA R0, 5
        DATA R1, 0
        DATA R2, 0
        ADD  R2, R10
        CALL set_pixel
        ADD  R10, R14
        DATA R11, 64
        CMP  R10, R11
        JE   bb_i
        JMP  bt
bb_i:   DATA R10, 0
bb:     DATA R0, 5
        DATA R1, 63
        DATA R2, 0
        ADD  R2, R10
        CALL set_pixel
        ADD  R10, R14
        DATA R11, 64
        CMP  R10, R11
        JE   bl_i
        JMP  bb
bl_i:   DATA R10, 1
bl:     DATA R0, 5
        DATA R1, 0
        ADD  R1, R10
        DATA R2, 0
        CALL set_pixel
        ADD  R10, R14
        DATA R11, 63
        CMP  R10, R11
        JE   br_i
        JMP  bl
br_i:   DATA R10, 1
br:     DATA R0, 5
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

; ── draw_ball: 3×3 color 9 (yellow) ──
draw_ball:
        PUSH R3
        PUSH R10
        DATA R3, 0
dr:     DATA R10, 0
dc:     DATA R0, 9
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

; ── set_pixel: R0=color(0-15) R1=row R2=col ──
; byte = 0x8000 + row*128 + col/2
; even col = high nibble, odd col = low nibble
set_pixel:
        PUSH R0
        PUSH R1
        PUSH R2
        PUSH R3
        PUSH R9
        PUSH R11
        MUL  R1, R13
        DATA R9, 0
        ADD  R9, R2
        DATA R11, 2
        DIV  R9, R11
        ADD  R1, R9
        ADD  R1, R12
        LDRI R11, R1
        DATA R9, 0
        ADD  R9, R2
        DATA R3, 2
        MOD  R9, R3
        CMP  R9, R15
        JE   sp_even
        ; Odd col: low nibble
        DATA R3, 0xF0
        AND  R11, R3
        DATA R3, 0x0F
        AND  R0, R3
        OR   R11, R0
        JMP  sp_wr
sp_even:
        ; Even col: high nibble
        DATA R3, 0x0F
        AND  R11, R3
        DATA R3, 0x0F
        AND  R0, R3
        SHL  R0
        SHL  R0
        SHL  R0
        SHL  R0
        OR   R11, R0
sp_wr:  STRI R11, R1
        POP  R11
        POP  R9
        POP  R3
        POP  R2
        POP  R1
        POP  R0
        RET`;
}

// ── Mandelbrot Zoom + Color Cycling Animation ──────────────────────────
function generateMandelbrotAnim(): string {
  return `; Mandelbrot Zoom + Color Cycling Animation
; Renders fractal, cycles colors with delay, zooms toward
; Seahorse Valley (-0.75, 0.1), repeats.
; Best at 10M speed!
;
; 8.8 fixed-point: 1.0 = 256
; Zoom params at 0x7F00-0x7F09:
;   0x7F00-01: re_min  (16-bit LE)
;   0x7F02-03: im_min  (16-bit LE)
;   0x7F04-05: re_step (16-bit LE)
;   0x7F06-07: im_step (16-bit LE)
;   0x7F08:    zoom_count

; ── Init constants ──
        DATA R12, 0x8000
        DATA R13, 128
        DATA R14, 1
        DATA R15, 0

; ── Initial zoom: standard Mandelbrot view centered on (-0.745, 0.186) ──
; re_step = 6, im_step = 5  (standard ~3x2.5 unit view)
; re_min = 65345 - 6*128 = 64577 = 0xFC41
        DATA R0, 65
        STORE R0, 0x7F00
        DATA R0, 252
        STORE R0, 0x7F01
; im_min = 48 - 5*128 = -592 = 0xFDB0 (64944)
        DATA R0, 176
        STORE R0, 0x7F02
        DATA R0, 253
        STORE R0, 0x7F03
; re_step = 6
        DATA R0, 6
        STORE R0, 0x7F04
        DATA R0, 0
        STORE R0, 0x7F05
; im_step = 5
        DATA R0, 5
        STORE R0, 0x7F06
        DATA R0, 0
        STORE R0, 0x7F07
; zoom_count = 0
        DATA R0, 0
        STORE R0, 0x7F08

; ══════════════════════════════
; MAIN LOOP
; ══════════════════════════════
main_loop:
        CALL render_fractal
        ; CALL color_cycle   ; disabled for debugging
; Check if NEXT zoom would bring step to 1 or 0
; current_step * 7 / 8: if step <= 2, next would be <=1
        LOAD R0, 0x7F04
        DATA R11, 3
        CMP  R0, R11
        JA   do_zoom          ; step > 3: safe to zoom
        JMP  screensaver      ; step <= 3: stop (next zoom gives <=2 which loses detail)
do_zoom:
        CALL zoom_in
        JMP  main_loop

screensaver:
; Final zoom is done — halt on last good frame
        ; CALL color_cycle   ; disabled for debugging
        HALT

; ══════════════════════════════
; render_fractal — full 256x256 render
; ══════════════════════════════
render_fractal:
        PUSH R2
        PUSH R3
; Load im_min -> R7
        LOAD R0, 0x7F02
        LOAD R1, 0x7F03
        SHL8 R1
        MOV  R7, R1
        ADD  R7, R0

        DATA R5, 0          ; py = 0

rf_yloop:
        DATA R4, 0          ; px = 0
; Load re_min -> R6
        LOAD R0, 0x7F00
        LOAD R1, 0x7F01
        SHL8 R1
        MOV  R6, R1
        ADD  R6, R0

rf_xloop:
        DATA R8, 0          ; zr = 0
        DATA R9, 0          ; zi = 0
        DATA R10, 0         ; iter = 0

rf_iter:
        MOV  R0, R8
        MOV  R1, R8
        CALL fpmul
        MOV  R2, R0          ; R2 = zr^2

        MOV  R0, R9
        MOV  R1, R9
        CALL fpmul
        MOV  R3, R0          ; R3 = zi^2

        ADD  R0, R2           ; zr^2 + zi^2
        DATA R11, 1024
        CMP  R0, R11
        JA   rf_esc

        ADD  R10, R14
        DATA R11, 16
        CMP  R10, R11
        JE   rf_in

        MOV  R0, R8
        MOV  R1, R9
        CALL fpmul
        SHL  R0
        ADD  R0, R7           ; new_zi

        SUB  R2, R3
        ADD  R2, R6           ; new_zr

        MOV  R8, R2
        MOV  R9, R0
        JMP  rf_iter

rf_esc:
        MOV  R0, R10
        DATA R1, 15
        MOD  R0, R1
        ADD  R0, R14
        JMP  rf_plot

rf_in:  DATA R0, 0

rf_plot:
        PUSH R0
        MOV  R1, R5
        MUL  R1, R13
        MOV  R3, R4
        SHR  R3
        ADD  R1, R3
        ADD  R1, R12
        LDRI R11, R1
        MOV  R3, R4
        AND  R3, R14
        POP  R0
        CMP  R3, R15
        JE   rf_even
        DATA R3, 0xF0
        AND  R11, R3
        DATA R3, 0x0F
        AND  R0, R3
        OR   R11, R0
        JMP  rf_wr
rf_even:
        DATA R3, 0x0F
        AND  R11, R3
        AND  R0, R3
        SHL  R0
        SHL  R0
        SHL  R0
        SHL  R0
        OR   R11, R0
rf_wr:  STRI R11, R1

        ADD  R4, R14
; cr += re_step
        LOAD R0, 0x7F04
        LOAD R1, 0x7F05
        SHL8 R1
        OR   R0, R1
        ADD  R6, R0
        DATA R11, 256
        CMP  R4, R11
        JE   rf_nrow
        JMP  rf_xloop

rf_nrow:
        ADD  R5, R14
; ci += im_step
        LOAD R0, 0x7F06
        LOAD R1, 0x7F07
        SHL8 R1
        OR   R0, R1
        ADD  R7, R0
        DATA R11, 256
        CMP  R5, R11
        JE   rf_done
        DATA R0, 0
        STORE R0, 0xDFFF     ; vsync per row
        JMP  rf_yloop

rf_done:
        DATA R0, 0
        STORE R0, 0xDFFF
        POP  R3
        POP  R2
        RET

; ══════════════════════════════
; color_cycle — cycle palette 10 times with delay
; Delay loop burns ~250K cycles between frames.
; At 10M/s = ~50ms pause. At 1M/s = ~500ms pause.
; ══════════════════════════════
color_cycle:
        PUSH R2
        PUSH R3
        DATA R2, 0           ; cycle counter

cc_loop:
; ── Delay loop: ~250K cycles (250 * 100 * ~10 instr) ──
; At 10M/s = ~25ms pause, at 1M/s = ~250ms
        DATA R8, 0
cc_d1:  DATA R9, 0
cc_d2:  ADD  R9, R14
        DATA R11, 250
        CMP  R9, R11
        JE   cc_d3
        JMP  cc_d2
cc_d3:  ADD  R8, R14
        DATA R11, 100
        CMP  R8, R11
        JE   cc_go
        JMP  cc_d1

cc_go:
; ── Walk VRAM, increment non-zero nibbles ──
        DATA R0, 0x8000      ; VRAM pointer
        DATA R3, 0           ; byte counter

cc_byte:
        LDRI R8, R0
; High nibble
        MOV  R9, R8
        SHR  R9
        SHR  R9
        SHR  R9
        SHR  R9
        CMP  R9, R15
        JE   cc_lo
        ADD  R9, R14
        DATA R11, 16
        CMP  R9, R11
        JA   cc_hw
        JE   cc_hw
        JMP  cc_lo
cc_hw:  DATA R9, 1
cc_lo:
; Low nibble
        MOV  R10, R8
        DATA R11, 0x0F
        AND  R10, R11
        CMP  R10, R15
        JE   cc_comb
        ADD  R10, R14
        DATA R11, 16
        CMP  R10, R11
        JA   cc_lw
        JE   cc_lw
        JMP  cc_comb
cc_lw:  DATA R10, 1
cc_comb:
        SHL  R9
        SHL  R9
        SHL  R9
        SHL  R9
        OR   R9, R10
        STRI R9, R0

        ADD  R0, R14
        ADD  R3, R14
        DATA R11, 0x8000
        CMP  R3, R11
        JE   cc_frame
        JMP  cc_byte

cc_frame:
        DATA R0, 0
        STORE R0, 0xDFFF     ; vsync
        ADD  R2, R14
        DATA R11, 10
        CMP  R2, R11
        JE   cc_done
        JMP  cc_loop

cc_done:
        POP  R3
        POP  R2
        RET

; ══════════════════════════════
; zoom_in — shrink step by 7/8, recompute min from target center
; Target: (-0.745, 0.186) — edge of Seahorse Valley spiral
; In 8.8: target_re = -191 = 0xFF41 (65345), target_im = 48 = 0x0030
; Method: re_min = target_re - step * 128
;         im_min = target_im - step * 128
; This keeps the target perfectly centered at all zoom levels.
; ══════════════════════════════
zoom_in:
        PUSH R2
        PUSH R3

; ── Shrink re_step by 7/8 ──
        LOAD R0, 0x7F04
        LOAD R1, 0x7F05
        SHL8 R1
        OR   R0, R1           ; R0 = re_step
        DATA R1, 7
        MUL  R0, R1
        SHR  R0
        SHR  R0
        SHR  R0               ; R0 = new re_step
        MOV  R2, R0           ; R2 = new re_step (save)
        MOV  R1, R0
        DATA R11, 0xFF
        AND  R1, R11
        STORE R1, 0x7F04
        MOV  R1, R0
        SHR8 R1
        STORE R1, 0x7F05

; ── Shrink im_step by 7/8 ──
        LOAD R0, 0x7F06
        LOAD R1, 0x7F07
        SHL8 R1
        OR   R0, R1
        DATA R1, 7
        MUL  R0, R1
        SHR  R0
        SHR  R0
        SHR  R0               ; R0 = new im_step
        MOV  R3, R0           ; R3 = new im_step (save)
        MOV  R1, R0
        DATA R11, 0xFF
        AND  R1, R11
        STORE R1, 0x7F06
        MOV  R1, R0
        SHR8 R1
        STORE R1, 0x7F07

; ── Compute re_min = target_re - re_step * 128 ──
; target_re = -0.745 in 8.8 = -191 = 0xFF41 (65345 unsigned)
; half_width = re_step * 128
        MOV  R0, R2           ; re_step
        DATA R1, 128
        MUL  R0, R1           ; R0 = re_step * 128 (half width in 8.8)
        DATA R1, 65345        ; target_re = 0xFF41
        SUB  R1, R0           ; R1 = target_re - half_width = re_min
        MOV  R0, R1
        DATA R11, 0xFF
        AND  R0, R11
        STORE R0, 0x7F00
        MOV  R0, R1
        SHR8 R0
        STORE R0, 0x7F01

; ── Compute im_min = target_im - im_step * 128 ──
; target_im = 0.186 in 8.8 = 48 = 0x0030
        MOV  R0, R3           ; im_step
        DATA R1, 128
        MUL  R0, R1           ; R0 = im_step * 128 (half height in 8.8)
        DATA R1, 48           ; target_im = 0x0030
        SUB  R1, R0           ; R1 = target_im - half_height = im_min
        MOV  R0, R1
        DATA R11, 0xFF
        AND  R0, R11
        STORE R0, 0x7F02
        MOV  R0, R1
        SHR8 R0
        STORE R0, 0x7F03

; ── Increment zoom count ──
        LOAD R0, 0x7F08
        ADD  R0, R14
        STORE R0, 0x7F08

; ── Guard: if step = 0, force max zoom count ──
        CMP  R2, R15          ; re_step == 0?
        JE   zi_halt
        CMP  R3, R15          ; im_step == 0?
        JE   zi_halt

        POP  R3
        POP  R2
        RET

zi_halt:
        DATA R0, 20
        STORE R0, 0x7F08
        POP  R3
        POP  R2
        RET

; ══════════════════════════════
; fpmul: Signed 8.8 fixed-point multiply
; Input: R0, R1 (signed 8.8)
; Output: R0 = R0 * R1 in 8.8
fpmul:
        PUSH R2
        PUSH R3
        DATA R2, 0
        MOV  R3, R0
        DATA R11, 0x8000
        AND  R3, R11
        CMP  R3, R15
        JE   fp_r0pos
        NOT  R0
        ADD  R0, R14
        DATA R2, 1
fp_r0pos:
        MOV  R3, R1
        DATA R11, 0x8000
        AND  R3, R11
        CMP  R3, R15
        JE   fp_r1pos
        NOT  R1
        ADD  R1, R14
        XOR  R2, R14
fp_r1pos:
        MOV  R3, R0
        MULH R3, R1
        MUL  R0, R1
        SHR8 R0
        SHL8 R3
        OR   R0, R3
        CMP  R2, R15
        JE   fp_done
        NOT  R0
        ADD  R0, R14
fp_done:
        POP  R3
        POP  R2
        RET`;
}

// ── Mandelbrot assembly is inlined in SAMPLE_PROGRAMS below ──────────────
// Uses signed 8.8 fixed-point: 1.0 = 256, -2.0 = 65024 (0xFE00 unsigned)
// MULH instruction gives high 16 bits of 32-bit unsigned multiply
// Pre-computed constants:
//   RE_MIN  = (-2.0  × 256) & 0xFFFF = 65024   (0xFE00)
//   RE_STEP = round(2.7/256 × 256)   = 3
//   IM_MIN  = (-1.35 × 256) & 0xFFFF = 65191   (0xFEA7)
//   IM_STEP = round(2.7/256 × 256)   = 3
//   ESCAPE  = 4.0 × 256              = 1024
//   MAX_ITER                          = 16

// ── JS Fractal Zoom Renderer ────────────────────────────────────────────
// Renders Mandelbrot directly to VRAM with float64 precision.
// Returns a cleanup function to stop the animation.
function startFractalZoom(
  pokeRaw: (addr: number, val: number) => void,
  refresh: () => void,
): () => void {
  let running = true;
  const GRID = 256;
  const VIDEO_BASE = 0x8000;
  const MAX_ITER = 64;

  // 16-color palette indices (same as VideoView)
  // Color 0 = inside set (black), 1-15 = escape colors
  
  // Target: Seahorse Valley
  const TARGET_RE = -0.7453;
  const TARGET_IM = 0.1127;

  // Start with standard view
  let scale = 3.5;  // width in real coords
  const ZOOM_FACTOR = 0.965;  // 3.5% zoom per frame
  const MIN_SCALE = 0.0001;
  let colorOffset = 0;
  let frame = 0;

  function renderFrame() {
    if (!running) return;

    const halfW = scale / 2;
    const halfH = (scale * 0.8) / 2;  // slightly narrower height
    const reMin = TARGET_RE - halfW;
    const imMin = TARGET_IM - halfH;
    const reStep = scale / GRID;
    const imStep = (scale * 0.8) / GRID;

    // Render to VRAM
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

        // Color: 0 for inside, 1-15 for escaped with cycling
        let color = 0;
        if (iter < MAX_ITER) {
          color = ((iter + colorOffset) % 15) + 1;
        }

        // Write 4bpp pixel to VRAM
        const byteAddr = VIDEO_BASE + py * 128 + Math.floor(px / 2);
        const existing = 0; // We'll write full bytes for even pixels
        if ((px & 1) === 0) {
          // Even pixel: high nibble — store and wait for odd
          // Read-modify-write by processing pairs
          const cr2 = reMin + (px + 1) * reStep;
          let zr2 = 0, zi2 = 0, iter2 = 0;
          while (iter2 < MAX_ITER) {
            const a = zr2 * zr2;
            const b = zi2 * zi2;
            if (a + b > 4) break;
            zi2 = 2 * zr2 * zi2 + ci;
            zr2 = a - b + cr2;
            iter2++;
          }
          let color2 = 0;
          if (iter2 < MAX_ITER) {
            color2 = ((iter2 + colorOffset) % 15) + 1;
          }
          // Write both pixels as one byte: high nibble = even, low nibble = odd
          pokeRaw(byteAddr, ((color & 0x0F) << 4) | (color2 & 0x0F));
          px++; // skip odd pixel (already processed)
        }
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
  mandelbrot: {
    name: 'Mandelbrot', desc: 'Fractal (256×256)',
    code: `; Mandelbrot Set — 256x256, 4bpp, 8.8 fixed-point
; Video RAM at 0x8000, 128 bytes/row
; Uses MULH for 32-bit multiply (signed 8.8 fixed-point)
; Uses MOV, SHR8, SHL8 for fast register copy & barrel shift
; Set speed to max (1M) and wait — renders progressively!
;
; 8.8 fixed-point constants (1.0 = 256):
;   RE_MIN  = -2.0  -> 65024 (0xFE00)    IM_MIN  = -1.35 -> 65191 (0xFEA7)
;   RE_STEP = 3     (2.7/256 in 8.8)     IM_STEP = 3
;   ESCAPE  = 1024  (4.0 in 8.8)         MAX_ITER = 16
;
; Registers:
;   R4=px  R5=py  R6=cr  R7=ci
;   R8=zr  R9=zi  R10=iter  R11=scratch
;   R12=0x8000  R13=128  R14=1  R15=0

; -- Constants --
        DATA R12, 0x8000    ; video base
        DATA R13, 128       ; row stride
        DATA R14, 1
        DATA R15, 0

; -- Outer loops: py (R5) and px (R4) --
        DATA R5, 0          ; py = 0
        DATA R7, 65191      ; ci starts at im_min (-1.35)

yloop:  DATA R4, 0          ; px = 0
        DATA R6, 65024      ; cr starts at re_min (-2.0)

xloop:
        ; -- Init z = 0 --
        DATA R8, 0           ; zr = 0
        DATA R9, 0           ; zi = 0
        DATA R10, 0          ; iter = 0

iter_loop:
        ; zr^2 = fpmul(zr, zr)
        MOV  R0, R8
        MOV  R1, R8
        CALL fpmul           ; R0 = zr^2
        MOV  R2, R0          ; R2 = zr^2

        ; zi^2 = fpmul(zi, zi)
        MOV  R0, R9
        MOV  R1, R9
        CALL fpmul           ; R0 = zi^2
        MOV  R3, R0          ; R3 = zi^2

        ; Check escape: zr^2 + zi^2 > escape?
        ADD  R0, R2          ; R0 = zr^2 + zi^2
        DATA R11, 1024       ; escape threshold (4.0)
        CMP  R0, R11
        JA   escaped

        ; Max iterations check
        ADD  R10, R14
        DATA R11, 16         ; max iterations
        CMP  R10, R11
        JE   inside

        ; -- Compute new_zi = 2 * zr * zi + ci --
        MOV  R0, R8          ; R0 = zr
        MOV  R1, R9          ; R1 = zi
        CALL fpmul           ; R0 = zr*zi
        SHL  R0              ; 2*zr*zi
        ADD  R0, R7          ; + ci = new_zi

        ; -- Compute new_zr = zr^2 - zi^2 + cr --
        SUB  R2, R3          ; R2 = zr^2 - zi^2
        ADD  R2, R6          ; + cr = new_zr

        ; Set new values
        MOV  R8, R2          ; zr = new_zr
        MOV  R9, R0          ; zi = new_zi

        JMP  iter_loop

escaped:
        ; Color = (iter % 15) + 1
        MOV  R0, R10
        DATA R1, 15
        MOD  R0, R1
        ADD  R0, R14
        JMP  plot

inside:
        DATA R0, 0           ; color 0 = inside set

plot:
        ; Write pixel at (R5=row, R4=col) with color R0
        ; byte addr = 0x8000 + row*128 + col/2
        PUSH R0              ; save color
        MOV  R1, R5
        MUL  R1, R13         ; row * 128
        MOV  R3, R4
        SHR  R3              ; col / 2 (bit shift)
        ADD  R1, R3
        ADD  R1, R12         ; byte addr in R1
        ; Read current byte
        LDRI R11, R1
        ; Even or odd col?
        MOV  R3, R4
        AND  R3, R14         ; col & 1
        POP  R0              ; restore color
        CMP  R3, R15
        JE   px_even
        ; Odd col: low nibble
        DATA R3, 0xF0
        AND  R11, R3
        DATA R3, 0x0F
        AND  R0, R3
        OR   R11, R0
        JMP  px_wr
px_even:
        ; Even col: high nibble
        DATA R3, 0x0F
        AND  R11, R3
        AND  R0, R3          ; mask to 4 bits
        SHL  R0
        SHL  R0
        SHL  R0
        SHL  R0
        OR   R11, R0
px_wr:  STRI R11, R1

        ; Next pixel: px++, cr += re_step
        ADD  R4, R14
        DATA R11, 3           ; re_step
        ADD  R6, R11
        DATA R11, 256
        CMP  R4, R11
        JE   next_row
        JMP  xloop

next_row:
        ; py++, ci += im_step
        ADD  R5, R14
        DATA R11, 3           ; im_step
        ADD  R7, R11
        DATA R11, 256
        CMP  R5, R11
        JE   done
        ; vsync after each row for progressive display
        DATA R0, 0
        STORE R0, 0xDFFF
        JMP  yloop

done:   DATA R0, 0
        STORE R0, 0xDFFF
        HALT

; =====================================
; fpmul: Signed 8.8 fixed-point multiply
; Input: R0, R1 (signed 8.8)
; Output: R0 = R0 * R1 in 8.8
; Uses: R2, R3 (caller-save)
fpmul:
        PUSH R2
        PUSH R3
        DATA R2, 0           ; sign flag
        ; Check R0 sign (bit 15)
        MOV  R3, R0
        DATA R11, 0x8000
        AND  R3, R11
        CMP  R3, R15
        JE   fp_r0pos
        NOT  R0
        ADD  R0, R14
        DATA R2, 1
fp_r0pos:
        MOV  R3, R1
        DATA R11, 0x8000
        AND  R3, R11
        CMP  R3, R15
        JE   fp_r1pos
        NOT  R1
        ADD  R1, R14
        XOR  R2, R14
fp_r1pos:
        ; Unsigned multiply: hi:lo = R0 * R1
        MOV  R3, R0
        MULH R3, R1          ; R3 = high 16
        MUL  R0, R1          ; R0 = low 16
        ; Result = (hi << 8) | (lo >> 8)
        SHR8 R0              ; R0 >>= 8
        SHL8 R3              ; R3 <<= 8
        OR   R0, R3
        ; Apply sign
        CMP  R2, R15
        JE   fp_done
        NOT  R0
        ADD  R0, R14
fp_done:
        POP  R3
        POP  R2
        RET`,
    bytes: [], expect: 'Mandelbrot set in video RAM',
  },
  mandelbrot_anim: {
    name: 'Fractal Anim', desc: 'ASM zoom + color cycle',
    code: generateMandelbrotAnim(),
    bytes: [], expect: 'Animated Mandelbrot with zoom and color cycling',
  },
  fractal_zoom: {
    name: '🎬 Fractal Zoom', desc: 'JS-rendered smooth zoom (Seahorse Valley)',
    code: `; Fractal Zoom — JS-rendered Mandelbrot animation
; This demo uses native JavaScript to render directly to VRAM
; with float64 precision, enabling smooth continuous zoom.
; The CPU is idle — all rendering is done by the host.
;
; Target: Seahorse Valley (-0.745, 0.186)
; 200+ frames of smooth zoom with color cycling
HALT`,
    bytes: [], expect: 'JS-rendered fractal zoom animation',
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
  matrix: {
    name: 'Matrix', desc: '4×4 multiply',
    code: `; 4×4 Matrix Multiplication: C = A × B
; Stores matrices in RAM, computes C, prints result
; Uses LDRI/STRI for indexed access
;
; A = [1 2 3 4]  B = [2 0 1 0]
;     [5 6 7 8]      [0 1 0 2]
;     [1 0 1 0]      [1 0 2 0]
;     [0 1 0 1]      [0 1 0 2]
;
; Expected C:
;     [5  6  7 12]     row 0: 5 6 7 12
;     [17 14 19 28]    row 1: 17 14 19 28
;     [3  0  3  0]     row 2: 3 0 3 0
;     [0  2  0  4]     row 3: 0 2 0 4

; ── Memory layout ──
; 0x0300: Matrix A (16 bytes, row-major)
; 0x0310: Matrix B (16 bytes, row-major)
; 0x0320: Matrix C (16 bytes, result)

; ── Store Matrix A at 0x0300 ──
        DATA R0, 1
        STORE R0, 0x0300
        DATA R0, 2
        STORE R0, 0x0301
        DATA R0, 3
        STORE R0, 0x0302
        DATA R0, 4
        STORE R0, 0x0303
        DATA R0, 5
        STORE R0, 0x0304
        DATA R0, 6
        STORE R0, 0x0305
        DATA R0, 7
        STORE R0, 0x0306
        DATA R0, 8
        STORE R0, 0x0307
        DATA R0, 1
        STORE R0, 0x0308
        DATA R0, 0
        STORE R0, 0x0309
        DATA R0, 1
        STORE R0, 0x030A
        DATA R0, 0
        STORE R0, 0x030B
        DATA R0, 0
        STORE R0, 0x030C
        DATA R0, 1
        STORE R0, 0x030D
        DATA R0, 0
        STORE R0, 0x030E
        DATA R0, 1
        STORE R0, 0x030F

; ── Store Matrix B at 0x0310 ──
        DATA R0, 2
        STORE R0, 0x0310
        DATA R0, 0
        STORE R0, 0x0311
        DATA R0, 1
        STORE R0, 0x0312
        DATA R0, 0
        STORE R0, 0x0313
        DATA R0, 0
        STORE R0, 0x0314
        DATA R0, 1
        STORE R0, 0x0315
        DATA R0, 0
        STORE R0, 0x0316
        DATA R0, 2
        STORE R0, 0x0317
        DATA R0, 1
        STORE R0, 0x0318
        DATA R0, 0
        STORE R0, 0x0319
        DATA R0, 2
        STORE R0, 0x031A
        DATA R0, 0
        STORE R0, 0x031B
        DATA R0, 0
        STORE R0, 0x031C
        DATA R0, 1
        STORE R0, 0x031D
        DATA R0, 0
        STORE R0, 0x031E
        DATA R0, 2
        STORE R0, 0x031F

; ── Print header ──
        DATA R0, 67     ; 'C'
        OUT  R0
        DATA R0, 32     ; ' '
        OUT  R0
        DATA R0, 61     ; '='
        OUT  R0
        DATA R0, 32     ; ' '
        OUT  R0
        DATA R0, 65     ; 'A'
        OUT  R0
        DATA R0, 42     ; '*'
        OUT  R0
        DATA R0, 66     ; 'B'
        OUT  R0
        DATA R0, 10
        OUT  R0

; ── Triple loop: C[i][j] = sum(A[i][k] * B[k][j]) ──
; R4=i  R5=j  R6=k  R7=sum
; R8=addr scratch  R9=val scratch
; R10=4 (const)  R11=scratch
        DATA R10, 4
        DATA R4, 0          ; i = 0
iloop:  DATA R5, 0          ; j = 0
jloop:  DATA R7, 0          ; sum = 0
        DATA R6, 0          ; k = 0

kloop:
        ; Compute A[i][k] addr = 0x0300 + i*4 + k
        DATA R8, 0
        ADD  R8, R4
        MUL  R8, R10        ; i*4
        ADD  R8, R6          ; + k
        DATA R11, 0x0300
        ADD  R8, R11
        LDRI R9, R8          ; R9 = A[i][k]

        ; Compute B[k][j] addr = 0x0310 + k*4 + j
        DATA R8, 0
        ADD  R8, R6
        MUL  R8, R10        ; k*4
        ADD  R8, R5          ; + j
        DATA R11, 0x0310
        ADD  R8, R11
        LDRI R8, R8          ; R8 = B[k][j]

        ; sum += A[i][k] * B[k][j]
        MUL  R9, R8
        ADD  R7, R9

        ; k++
        DATA R11, 1
        ADD  R6, R11
        CMP  R6, R10
        JE   kend
        JMP  kloop

kend:
        ; Store C[i][j] = sum at 0x0320 + i*4 + j
        DATA R8, 0
        ADD  R8, R4
        MUL  R8, R10
        ADD  R8, R5
        DATA R11, 0x0320
        ADD  R8, R11
        STRI R7, R8

        ; Print the value
        PUSH R4
        PUSH R5
        DATA R0, 0
        ADD  R0, R7
        CALL print_r0

        ; Print separator
        DATA R0, 32     ; ' '
        OUT  R0
        POP  R5
        POP  R4

        ; j++
        DATA R11, 1
        ADD  R5, R11
        CMP  R5, R10
        JE   jend
        JMP  jloop

jend:
        ; Newline after each row
        DATA R0, 10
        OUT  R0
        ; i++
        DATA R11, 1
        ADD  R4, R11
        CMP  R4, R10
        JE   done
        JMP  iloop

done:   HALT

; ══════════════════════════════════════
; ── print_r0: print R0 as decimal ──
; Handles 0..255
print_r0:
        PUSH R1
        PUSH R2
        PUSH R3
        DATA R1, 100
        DATA R2, 10
        DATA R3, 0          ; leading zero flag

        ; Hundreds digit
        DATA R11, 0
        ADD  R11, R0
        DIV  R11, R1         ; R11 = R0 / 100
        DATA R9, 0
        CMP  R11, R9
        JE   tens
        DATA R3, 1           ; have leading digit
        DATA R9, 48
        ADD  R11, R9
        OUT  R11
        ; R0 = R0 mod 100
        MOD  R0, R1

tens:   DATA R11, 0
        ADD  R11, R0
        DIV  R11, R2         ; R11 = R0 / 10
        DATA R9, 0
        CMP  R11, R9
        JE   chk_tens
        DATA R3, 1
        JMP  pr_tens
chk_tens:
        CMP  R3, R9
        JE   ones            ; skip if no leading digit
pr_tens:
        DATA R9, 48
        ADD  R11, R9
        OUT  R11
        MOD  R0, R2

ones:   DATA R9, 48
        ADD  R0, R9
        OUT  R0

        POP  R3
        POP  R2
        POP  R1
        RET`,
    bytes: [], expect: '5 6 7 12 / 17 14 19 28 / 3 0 3 0 / 0 2 0 4',
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
          }}>v1.0 · 16-bit CPU</span>
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
