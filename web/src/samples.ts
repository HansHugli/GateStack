// Sample programs shown in the Samples menu. Moved out of App.tsx so they can be
// tested on both engines without the UI.

export interface SampleProgram {
  name: string;
  desc: string;
  code: string;
  bytes: number[];
  expect: string;
}

// ── Sample Programs ──────────────────────────────────────────────────────

// ── Bouncing Ball Video Generator (v2.0) ─────────────────────────────────
function generateBouncingBall(): string {
  return `; Bouncing Ball — 8bpp, 256×256, double-buffered (v2.0)
; Back buffer at 0x3C0000, 256 bytes/row
; Erases old ball + draws new ball each frame (no full clear)
;
; R4=ballX  R5=ballY  R6=dx  R7=dy  R8=oldX  R9=oldY
; R12=back buffer base  R13=256 (stride)  R14=1  R15=0

; ── Init ──
        DATA R4, 30
        DATA R5, 30
        DATA R6, 2         ; dx = 2 pixels/frame
        DATA R7, 2         ; dy = 2 pixels/frame
        DATA R8, 30        ; oldX = initial X
        DATA R9, 30        ; oldY = initial Y
        DATA R12, 0x3C0000
        DATA R13, 256
        DATA R14, 1
        DATA R15, 0

; ── Initial frame: clear, border, ball, vsync ──
        CALL clear_screen
        CALL draw_border
        CALL draw_ball
        DATA R0, 0
        STORE R0, 0x3FFFFF

; ── MAIN LOOP ──
frame:
        ; Save old position
        MOV  R8, R4
        MOV  R9, R5

        ; Move ball
        ADD  R4, R6
        ADD  R5, R7

        ; Bounce X: keep within [2..251]
        DATA R11, 2
        CMP  R4, R11
        JA   cx_hi
        JMP  flip_x
cx_hi:  DATA R11, 251
        CMP  R4, R11
        JA   flip_x
        JMP  chk_y
flip_x: DATA R11, 0
        SUB  R11, R6
        MOV  R6, R11
        ADD  R4, R6
        ADD  R4, R6

        ; Bounce Y: keep within [2..251]
chk_y:  DATA R11, 2
        CMP  R5, R11
        JA   cy_hi
        JMP  flip_y
cy_hi:  DATA R11, 251
        CMP  R5, R11
        JA   flip_y
        JMP  do_draw
flip_y: DATA R11, 0
        SUB  R11, R7
        MOV  R7, R11
        ADD  R5, R7
        ADD  R5, R7

do_draw:
        ; Erase old ball (write color 0 at old position)
        CALL erase_ball
        ; Draw new ball
        CALL draw_ball
        DATA R0, 0
        STORE R0, 0x3FFFFF
        JMP  frame

; ── clear_screen: fill back buffer with color 0 (init only) ──
clear_screen:
        PUSH R8
        PUSH R9
        DATA R8, 0x3C0000
        DATA R9, 0x3D0000
cs_lp:  STRI32 R15, R8
        DATA R11, 4
        ADD  R8, R11
        CMP  R8, R9
        JE   cs_dn
        JMP  cs_lp
cs_dn:  POP  R9
        POP  R8
        RET

; ── draw_border: color 5 (teal) ──
draw_border:
        PUSH R10
        PUSH R8
        DATA R10, 0
bt_lp:  DATA R8, 0
        ADD  R8, R10
        ADD  R8, R12
        DATA R0, 5
        STRI R0, R8
        ADD  R10, R14
        CMP  R10, R13
        JE   bb_i
        JMP  bt_lp
bb_i:   DATA R10, 0
        DATA R8, 255
        MUL  R8, R13
bb_lp:  DATA R11, 0
        ADD  R11, R8
        ADD  R11, R10
        ADD  R11, R12
        DATA R0, 5
        STRI R0, R11
        ADD  R10, R14
        CMP  R10, R13
        JE   bl_i
        JMP  bb_lp
bl_i:   DATA R10, 1
bl_lp:  DATA R8, 0
        ADD  R8, R10
        MUL  R8, R13
        ADD  R8, R12
        DATA R0, 5
        STRI R0, R8
        ADD  R10, R14
        DATA R11, 255
        CMP  R10, R11
        JE   br_i
        JMP  bl_lp
br_i:   DATA R10, 1
br_lp:  DATA R8, 0
        ADD  R8, R10
        MUL  R8, R13
        DATA R11, 255
        ADD  R8, R11
        ADD  R8, R12
        DATA R0, 5
        STRI R0, R8
        ADD  R10, R14
        DATA R11, 255
        CMP  R10, R11
        JE   bdr_dn
        JMP  br_lp
bdr_dn: POP  R8
        POP  R10
        RET

; ── erase_ball: 4×4 block of color 0 at (R8=oldX, R9=oldY) ──
erase_ball:
        PUSH R3
        PUSH R10
        PUSH R0
        PUSH R1
        DATA R3, 0
eb_r:   DATA R10, 0
eb_c:   DATA R1, 0
        ADD  R1, R9
        ADD  R1, R3
        MUL  R1, R13
        ADD  R1, R8
        ADD  R1, R10
        ADD  R1, R12
        STRI R15, R1
        ADD  R10, R14
        DATA R11, 4
        CMP  R10, R11
        JE   eb_nr
        JMP  eb_c
eb_nr:  ADD  R3, R14
        DATA R11, 4
        CMP  R3, R11
        JE   eb_dn
        JMP  eb_r
eb_dn:  POP  R1
        POP  R0
        POP  R10
        POP  R3
        RET

; ── draw_ball: 4×4 block, color 9 (yellow) at (R4=ballX, R5=ballY) ──
draw_ball:
        PUSH R3
        PUSH R10
        PUSH R8
        DATA R3, 0
db_r:   DATA R10, 0
db_c:   DATA R8, 0
        ADD  R8, R5
        ADD  R8, R3
        MUL  R8, R13
        ADD  R8, R4
        ADD  R8, R10
        ADD  R8, R12
        DATA R0, 9
        STRI R0, R8
        ADD  R10, R14
        DATA R11, 4
        CMP  R10, R11
        JE   db_nr
        JMP  db_c
db_nr:  ADD  R3, R14
        DATA R11, 4
        CMP  R3, R11
        JE   db_dn
        JMP  db_r
db_dn:  POP  R8
        POP  R10
        POP  R3
        RET`;
}

// ── Mandelbrot Zoom + Color Cycling Animation ──────────────────────────
function generateMandelbrotAnim(): string {
  return `; Mandelbrot Zoom + Color Cycling (v2.0 optimized)
; Inlined fpmul for reduced overhead
; Back buffer at 0x3C0000, 8bpp, vsync at 0x3FFFFF
; Best at Ludicrous speed!
;
; R4=px  R5=py  R6=cr  R7=ci
; R8=zr  R9=zi  R10=iter  R11=scratch
; R12=back buffer  R13=256  R14=1  R15=0

        DATA R12, 0x3C0000
        DATA R13, 256
        DATA R14, 1
        DATA R15, 0

; ── Zoom params at 0x1000 ──
        DATA R0, 0xFFFFFC41   ; re_min = -959
        STORE32 R0, 0x1000
        DATA R0, 0xFFFFFDB0   ; im_min = -592
        STORE32 R0, 0x1004
        DATA R0, 6             ; re_step
        STORE32 R0, 0x1008
        DATA R0, 5             ; im_step
        STORE32 R0, 0x100C
        DATA R0, 0
        STORE32 R0, 0x1010    ; zoom_count

main_loop:
        CALL render_fractal
        CALL color_cycle
        LOAD32 R0, 0x1008
        DATA R11, 3
        CMP  R0, R11
        JA   do_zoom
        HALT
do_zoom:
        CALL zoom_in
        JMP  main_loop

; ══════════════════════════════════════════
; render_fractal — inlined fpmul, cardioid bailout
; ══════════════════════════════════════════
render_fractal:
        PUSH R2
        PUSH R3
        LOAD32 R7, 0x1004    ; ci = im_min
        DATA R5, 0

rf_yloop:
        DATA R4, 0
        LOAD32 R6, 0x1000    ; cr = re_min

rf_xloop:
        DATA R8, 0
        DATA R9, 0
        DATA R10, 0

rf_iter:
        ; zr² (inline)
        MOV  R0, R8
        MOV  R1, R8
        CALL fp_inline_mul
        MOV  R2, R0

        ; zi² (inline)
        MOV  R0, R9
        MOV  R1, R9
        CALL fp_inline_mul
        MOV  R3, R0

        ; escape check
        ADD  R0, R2
        DATA R11, 1024
        CMP  R0, R11
        JA   rf_esc

        ADD  R10, R14
        DATA R11, 32
        CMP  R10, R11
        JE   rf_in

        ; new_zi = 2*zr*zi + ci (inline)
        MOV  R0, R8
        MOV  R1, R9
        CALL fp_inline_mul
        SHL  R0
        ADD  R0, R7

        ; new_zr = zr² - zi² + cr
        SUB  R2, R3
        ADD  R2, R6

        MOV  R8, R2
        MOV  R9, R0
        JMP  rf_iter

rf_esc:
        MOV  R0, R10
        DATA R1, 31
        MOD  R0, R1
        ADD  R0, R14
        DATA R11, 16
        ADD  R0, R11
        JMP  rf_plot

rf_in:  DATA R0, 0

rf_plot:
        PUSH R0
        MOV  R1, R5
        MUL  R1, R13
        ADD  R1, R4
        ADD  R1, R12
        POP  R0
        STRI R0, R1

        ADD  R4, R14
        LOAD32 R0, 0x1008
        ADD  R6, R0
        DATA R11, 256
        CMP  R4, R11
        JE   rf_nrow
        JMP  rf_xloop

rf_nrow:
        ADD  R5, R14
        LOAD32 R0, 0x100C
        ADD  R7, R0
        DATA R11, 256
        CMP  R5, R11
        JE   rf_done
        DATA R0, 0
        STORE R0, 0x3FFFFF
        JMP  rf_yloop

rf_done:
        DATA R0, 0
        STORE R0, 0x3FFFFF
        POP  R3
        POP  R2
        RET

; ══════════════════════════════════════════
; fpmul — 8.8 signed fixed-point multiply
; Input: R0, R1   Output: R0 = R0 * R1 >> 8
; Preserves R2, R3 via PUSH/POP
; ══════════════════════════════════════════
fp_inline_mul:
fpmul:
        PUSH R2
        PUSH R3
        DATA R2, 0           ; sign flag
        MOV  R3, R0
        DATA R11, 0x80000000
        AND  R3, R11
        CMP  R3, R15
        JE   fpi_r0pos
        NOT  R0
        ADD  R0, R14
        DATA R2, 1
fpi_r0pos:
        MOV  R3, R1
        DATA R11, 0x80000000
        AND  R3, R11
        CMP  R3, R15
        JE   fpi_r1pos
        NOT  R1
        ADD  R1, R14
        XOR  R2, R14
fpi_r1pos:
        MOV  R3, R0
        MULH R3, R1
        MUL  R0, R1
        DATA R11, 8
        SHRN R0, R11
        DATA R11, 24
        SHLN R3, R11
        OR   R0, R3
        CMP  R2, R15
        JE   fpi_done
        NOT  R0
        ADD  R0, R14
fpi_done:
        POP  R3
        POP  R2
        RET

; ══════════════════════════════════════════
; color_cycle — cycle pixel values 8 times
; ══════════════════════════════════════════
color_cycle:
        PUSH R2
        PUSH R3
        DATA R2, 0

cc_loop:
        DATA R8, 0
cc_d1:  DATA R9, 0
cc_d2:  ADD  R9, R14
        DATA R11, 200
        CMP  R9, R11
        JE   cc_d3
        JMP  cc_d2
cc_d3:  ADD  R8, R14
        DATA R11, 100
        CMP  R8, R11
        JE   cc_go
        JMP  cc_d1

cc_go:
        DATA R0, 0x3C0000
        DATA R3, 0

cc_byte:
        LDRI R8, R0
        CMP  R8, R15
        JE   cc_next
        ADD  R8, R14
        DATA R11, 48
        CMP  R8, R11
        JA   cc_wrap
        JE   cc_wrap
        JMP  cc_store
cc_wrap:
        DATA R8, 17
cc_store:
        STRI R8, R0
cc_next:
        ADD  R0, R14
        ADD  R3, R14
        DATA R11, 0x10000
        CMP  R3, R11
        JE   cc_frame
        JMP  cc_byte

cc_frame:
        DATA R0, 0
        STORE R0, 0x3FFFFF
        ADD  R2, R14
        DATA R11, 8
        CMP  R2, R11
        JE   cc_done
        JMP  cc_loop

cc_done:
        POP  R3
        POP  R2
        RET

; ══════════════════════════════════════════
; zoom_in — shrink step by 7/8
; ══════════════════════════════════════════
zoom_in:
        PUSH R2
        PUSH R3

        LOAD32 R0, 0x1008
        DATA R1, 7
        MUL  R0, R1
        DATA R11, 3
        SHRN R0, R11
        MOV  R2, R0
        STORE32 R0, 0x1008

        LOAD32 R0, 0x100C
        DATA R1, 7
        MUL  R0, R1
        DATA R11, 3
        SHRN R0, R11
        MOV  R3, R0
        STORE32 R0, 0x100C

        MOV  R0, R2
        DATA R1, 128
        MUL  R0, R1
        DATA R1, 0xFFFFFF41
        SUB  R1, R0
        STORE32 R1, 0x1000

        MOV  R0, R3
        DATA R1, 128
        MUL  R0, R1
        DATA R1, 48
        SUB  R1, R0
        STORE32 R1, 0x1004

        LOAD32 R0, 0x1010
        ADD  R0, R14
        STORE32 R0, 0x1010

        CMP  R2, R15
        JE   zi_halt
        CMP  R3, R15
        JE   zi_halt
        POP  R3
        POP  R2
        RET

zi_halt:
        POP  R3
        POP  R2
        HALT`;
}

// ── Mandelbrot assembly is inlined in SAMPLE_PROGRAMS below ──────────────
// Uses signed 8.8 fixed-point: 1.0 = 256, -2.0 = 65024 (0xFE00 unsigned)
// MULH instruction gives high 32 bits of 64-bit unsigned multiply
// Pre-computed constants:
//   RE_MIN  = (-2.0  × 256) & 0xFFFF = 65024   (0xFE00)
//   RE_STEP = round(2.7/256 × 256)   = 3
//   IM_MIN  = (-1.35 × 256) & 0xFFFF = 65191   (0xFEA7)
//   IM_STEP = round(2.7/256 × 256)   = 3
//   ESCAPE  = 4.0 × 256              = 1024
//   MAX_ITER                          = 16

export const SAMPLE_PROGRAMS: Record<string, SampleProgram> = {
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
; With 32-bit we can go much higher!
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
; With 32-bit MUL this is trivial!
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
    code: `; Shift operations on 32-bit values
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
; With 32-bit MUL: factorials fit easily!
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
    name: 'Mandelbrot', desc: 'Fractal (256×256, 8bpp)',
    code: `; Mandelbrot Set — 256×256, 8bpp, 8.8 fixed-point (v2.0)
; Back buffer at 0x3C0000, 256 bytes/row (1 byte per pixel)
; Palette at 0x3E0000 (default 256-color palette)
; Vsync at 0x3FFFFF triggers page flip to front buffer
;
; 8.8 fixed-point: 1.0 = 256
;   RE_MIN  = -2.0  → 0xFFFFFE00 (signed -512 as u32)
;   RE_STEP = 3     (≈ 2.7/256 * 256)
;   IM_MIN  = -1.35 → 0xFFFFFEA7 (signed -345 as u32)
;   IM_STEP = 3
;   ESCAPE  = 1024  (4.0 in 8.8)
;   MAX_ITER = 32
;
; Registers:
;   R4=px  R5=py  R6=cr  R7=ci
;   R8=zr  R9=zi  R10=iter  R11=scratch
;   R12=back buffer  R13=256 (stride)  R14=1  R15=0

; ── Constants ──
        DATA R12, 0x3C0000  ; back buffer base
        DATA R13, 256       ; row stride (8bpp)
        DATA R14, 1
        DATA R15, 0

; ── Outer loops: py (R5) and px (R4) ──
        DATA R5, 0          ; py = 0
        DATA R7, 0xFFFFFEA7 ; ci = im_min (-1.35 in 8.8)

yloop:  DATA R4, 0          ; px = 0
        DATA R6, 0xFFFFFE00 ; cr = re_min (-2.0 in 8.8)

xloop:
        ; ── Init z = 0 ──
        DATA R8, 0           ; zr = 0
        DATA R9, 0           ; zi = 0
        DATA R10, 0          ; iter = 0

iter_loop:
        ; zr² = fpmul(zr, zr)
        MOV  R0, R8
        MOV  R1, R8
        CALL fpmul           ; R0 = zr²
        MOV  R2, R0          ; R2 = zr²

        ; zi² = fpmul(zi, zi)
        MOV  R0, R9
        MOV  R1, R9
        CALL fpmul           ; R0 = zi²
        MOV  R3, R0          ; R3 = zi²

        ; Check escape: zr² + zi² > 1024 (4.0)?
        ADD  R0, R2          ; R0 = zr² + zi²
        DATA R11, 1024
        CMP  R0, R11
        JA   escaped

        ; Max iterations check
        ADD  R10, R14
        DATA R11, 32
        CMP  R10, R11
        JE   inside

        ; ── new_zi = 2 * zr * zi + ci ──
        MOV  R0, R8
        MOV  R1, R9
        CALL fpmul           ; R0 = zr*zi
        SHL  R0              ; 2*zr*zi
        ADD  R0, R7          ; + ci

        ; ── new_zr = zr² - zi² + cr ──
        SUB  R2, R3          ; zr² - zi²
        ADD  R2, R6          ; + cr

        MOV  R8, R2          ; zr = new_zr
        MOV  R9, R0          ; zi = new_zi
        JMP  iter_loop

escaped:
        ; Color = (iter % 31) + 1  (use 31 colors, reserve 0 for inside)
        MOV  R0, R10
        DATA R1, 31
        MOD  R0, R1
        ADD  R0, R14         ; colors 1..31
        ; Shift into upper palette range for more vivid colors
        DATA R11, 16
        ADD  R0, R11         ; colors 17..47
        JMP  plot

inside:
        DATA R0, 0           ; color 0 = inside set

plot:
        ; ── Write 8bpp pixel to back buffer ──
        ; addr = 0x3C0000 + py * 256 + px
        PUSH R0
        MOV  R1, R5
        MUL  R1, R13         ; row * 256
        ADD  R1, R4          ; + col
        ADD  R1, R12         ; + back buffer base
        POP  R0
        STRI R0, R1          ; write color byte

        ; ── Next pixel ──
        ADD  R4, R14
        DATA R11, 3
        ADD  R6, R11         ; cr += re_step
        DATA R11, 256
        CMP  R4, R11
        JE   next_row
        JMP  xloop

next_row:
        ADD  R5, R14
        DATA R11, 3
        ADD  R7, R11         ; ci += im_step
        DATA R11, 256
        CMP  R5, R11
        JE   done
        ; Vsync after each row for progressive display
        DATA R0, 0
        STORE R0, 0x3FFFFF
        JMP  yloop

done:   DATA R0, 0
        STORE R0, 0x3FFFFF
        HALT

; ═══════════════════════════════════════
; fpmul: Signed 8.8 fixed-point multiply
; Input: R0, R1 (signed 8.8 in 32-bit)
; Output: R0 = R0 × R1 in 8.8
; Uses: R2, R3 (caller-save)
fpmul:
        PUSH R2
        PUSH R3
        DATA R2, 0           ; sign flag
        ; Check R0 sign (bit 31)
        MOV  R3, R0
        DATA R11, 0x80000000
        AND  R3, R11
        CMP  R3, R15
        JE   fp_r0pos
        ; Negate R0
        NOT  R0
        ADD  R0, R14
        DATA R2, 1
fp_r0pos:
        MOV  R3, R1
        DATA R11, 0x80000000
        AND  R3, R11
        CMP  R3, R15
        JE   fp_r1pos
        ; Negate R1
        NOT  R1
        ADD  R1, R14
        XOR  R2, R14
fp_r1pos:
        ; Unsigned multiply: hi:lo = R0 × R1
        MOV  R3, R0
        MULH R3, R1          ; R3 = high 32
        MUL  R0, R1          ; R0 = low 32
        ; Result = (hi << 24) | (lo >> 8)
        ; For 8.8: shift right by 8 to normalize
        SHRN R0, R14         ; shift R0 right by 1? No...
        ; Actually: result = (hi:lo) >> 8
        ; lo >> 8:
        DATA R11, 8
        SHRN R0, R11         ; R0 = lo >> 8
        ; hi << 24:
        DATA R11, 24
        SHLN R3, R11         ; R3 = hi << 24
        OR   R0, R3          ; R0 = combined result
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
  fractal_fast: {
    name: '⚡ Fractal Fast', desc: 'FPMUL opcode zoom (~5× faster)',
    code: `; Mandelbrot Zoom — using FPMUL hardware opcode (v2.0)
; FPMUL R0, R1 does signed 8.8 fixed-point multiply in one cycle
; ~5× faster than software fpmul — renders in ~1 second per frame
;
; R4=px  R5=py  R6=cr  R7=ci
; R8=zr  R9=zi  R10=iter  R11=scratch
; R12=back buffer  R13=256  R14=1  R15=0

        DATA R12, 0x3C0000
        DATA R13, 256
        DATA R14, 1
        DATA R15, 0

; ── Zoom params at 0x1000 ──
        DATA R0, 0xFFFFFC41   ; re_min = -959
        STORE32 R0, 0x1000
        DATA R0, 0xFFFFFDB0   ; im_min = -592
        STORE32 R0, 0x1004
        DATA R0, 6
        STORE32 R0, 0x1008    ; re_step
        DATA R0, 5
        STORE32 R0, 0x100C    ; im_step

ff_main:
        CALL ff_render
        CALL ff_cycle
        LOAD32 R0, 0x1008
        DATA R11, 3
        CMP  R0, R11
        JA   ff_zoom
        HALT
ff_zoom:
        CALL ff_zoomin
        JMP  ff_main

; ══════════════════════════════════════
; ff_render — uses FPMUL opcode
; ══════════════════════════════════════
ff_render:
        PUSH R2
        PUSH R3
        LOAD32 R7, 0x1004
        DATA R5, 0

ff_yloop:
        DATA R4, 0
        LOAD32 R6, 0x1000

ff_xloop:
        DATA R8, 0
        DATA R9, 0
        DATA R10, 0

ff_iter:
        MOV  R0, R8
        MOV  R1, R8
        FPMUL R0, R1          ; zr²
        MOV  R2, R0

        MOV  R0, R9
        MOV  R1, R9
        FPMUL R0, R1          ; zi²
        MOV  R3, R0

        ADD  R0, R2
        DATA R11, 1024
        CMP  R0, R11
        JA   ff_esc

        ADD  R10, R14
        DATA R11, 32
        CMP  R10, R11
        JE   ff_in

        MOV  R0, R8
        MOV  R1, R9
        FPMUL R0, R1          ; zr*zi
        SHL  R0               ; 2*zr*zi
        ADD  R0, R7           ; + ci

        SUB  R2, R3
        ADD  R2, R6           ; zr²-zi²+cr

        MOV  R8, R2
        MOV  R9, R0
        JMP  ff_iter

ff_esc:
        MOV  R0, R10
        DATA R1, 31
        MOD  R0, R1
        ADD  R0, R14
        DATA R11, 16
        ADD  R0, R11
        JMP  ff_plot

ff_in:  DATA R0, 0

ff_plot:
        PUSH R0
        MOV  R1, R5
        MUL  R1, R13
        ADD  R1, R4
        ADD  R1, R12
        POP  R0
        STRI R0, R1

        ADD  R4, R14
        LOAD32 R0, 0x1008
        ADD  R6, R0
        DATA R11, 256
        CMP  R4, R11
        JE   ff_nrow
        JMP  ff_xloop

ff_nrow:
        ADD  R5, R14
        LOAD32 R0, 0x100C
        ADD  R7, R0
        DATA R11, 256
        CMP  R5, R11
        JE   ff_rdone
        DATA R0, 0
        STORE R0, 0x3FFFFF
        JMP  ff_yloop

ff_rdone:
        DATA R0, 0
        STORE R0, 0x3FFFFF
        POP  R3
        POP  R2
        RET

; ══════════════════════════════════════
; ff_cycle — color cycle 8 frames
; ══════════════════════════════════════
ff_cycle:
        PUSH R2
        PUSH R3
        DATA R2, 0
ffc_loop:
        DATA R8, 0
ffc_d1: DATA R9, 0
ffc_d2: ADD  R9, R14
        DATA R11, 200
        CMP  R9, R11
        JE   ffc_d3
        JMP  ffc_d2
ffc_d3: ADD  R8, R14
        DATA R11, 100
        CMP  R8, R11
        JE   ffc_go
        JMP  ffc_d1
ffc_go:
        DATA R0, 0x3C0000
        DATA R3, 0
ffc_b:  LDRI R8, R0
        CMP  R8, R15
        JE   ffc_n
        ADD  R8, R14
        DATA R11, 48
        CMP  R8, R11
        JA   ffc_w
        JE   ffc_w
        JMP  ffc_s
ffc_w:  DATA R8, 17
ffc_s:  STRI R8, R0
ffc_n:  ADD  R0, R14
        ADD  R3, R14
        DATA R11, 0x10000
        CMP  R3, R11
        JE   ffc_f
        JMP  ffc_b
ffc_f:  DATA R0, 0
        STORE R0, 0x3FFFFF
        ADD  R2, R14
        DATA R11, 8
        CMP  R2, R11
        JE   ffc_dn
        JMP  ffc_loop
ffc_dn: POP  R3
        POP  R2
        RET

; ══════════════════════════════════════
; ff_zoomin
; ══════════════════════════════════════
ff_zoomin:
        PUSH R2
        PUSH R3
        LOAD32 R0, 0x1008
        DATA R1, 7
        MUL  R0, R1
        DATA R11, 3
        SHRN R0, R11
        MOV  R2, R0
        STORE32 R0, 0x1008
        LOAD32 R0, 0x100C
        DATA R1, 7
        MUL  R0, R1
        DATA R11, 3
        SHRN R0, R11
        MOV  R3, R0
        STORE32 R0, 0x100C
        MOV  R0, R2
        DATA R1, 128
        MUL  R0, R1
        DATA R1, 0xFFFFFF41
        SUB  R1, R0
        STORE32 R1, 0x1000
        MOV  R0, R3
        DATA R1, 128
        MUL  R0, R1
        DATA R1, 48
        SUB  R1, R0
        STORE32 R1, 0x1004
        CMP  R2, R15
        JE   ffz_h
        CMP  R3, R15
        JE   ffz_h
        POP  R3
        POP  R2
        RET
ffz_h:  POP  R3
        POP  R2
        HALT`,
    bytes: [], expect: 'Fast Mandelbrot using FPMUL opcode',
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
; 32-bit can hold up to 4294967295
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

// ── Sample categories ────────────────────────────────────────────────────

export const SAMPLE_CATEGORIES: Array<{ label: string; icon: string; keys: string[] }> = [
  { label: 'Basics',          icon: '📗', keys: ['add', 'count', 'shift', 'logic', 'flags'] },
  { label: 'Arithmetic',      icon: '📘', keys: ['multiply', 'divide', 'power', 'factorial', 'gcd', 'minmax'] },
  { label: 'Console I/O',     icon: '📙', keys: ['hello', 'echo', 'adder', 'calc', 'fibonacci', 'primes'] },
  { label: 'Data Structures',  icon: '📕', keys: ['stack', 'sort', 'matrix'] },
  { label: 'Video',           icon: '📺', keys: ['video', 'mandelbrot', 'mandelbrot_anim', 'fractal_fast', 'fractal_zoom'] },
];
