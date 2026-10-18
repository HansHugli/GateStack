# GateStack v2.0 — 32-bit Architecture Design Document

> **Historical document.** This is the plan written before the 32-bit redesign was built. [REFERENCE.md](REFERENCE.md) is the specification; where the two disagree, REFERENCE.md is right. The machine that was built differs from this plan in these ways:
>
> - **Memory**: 4 MB with 22-bit addresses (not 1 MB / 20-bit). VRAM is double-buffered: back buffer 0x3C0000, front buffer 0x3D0000, palette 0x3E0000 (programmable, not hardcoded), vsync at 0x3FFFFF, SP starts at 0x3BFFFF.
> - **Instructions**: 45, including JZ/JNZ, LOAD32/STORE32/LDRI32/STRI32, IDIV/IMOD, FPMUL (8.8) and FPMUL16 (16.16, added 2026-10-18). The open questions in section 7 have all been decided; see REFERENCE.md.
> - **Fixed point**: the Mandelbrot samples use 8.8 (FPMUL), plus a 16.16 sample using FPMUL16.
> - **Engines**: WASM is the default; the JS engine is the fallback, and both must give identical results.
> - **CMP** sets the flags as for rA − rB, and illegal opcodes or 32-bit accesses past the end of RAM halt with a fault (decided 2026-10-18).

## 1. Project Overview

GateStack is an educational computer simulator with a custom ISA, assembler, and visual debugger. v1.0 is a 16-bit CPU with 64KB RAM. v2.0 upgrades to 32-bit for deeper Mandelbrot zoom, richer graphics, and a more capable platform.

### Current State (v1.0)
- **CPU**: 16-bit registers (R0-R15), 33 opcodes, 8.8 fixed-point math
- **Memory**: 64KB (16-bit address), byte-addressable
- **Video**: 256×256, 4bpp (16 colors), 32KB VRAM at 0x8000-0xFFFF
- **Engines**: Dual JS/WASM with runtime toggle (JS default, WASM ~60% faster with unsafe optimization)
- **Stack**: Electron desktop app + Vite dev server, React UI, Rust WASM core
- **Samples**: Add, Count, Fibonacci, Primes, Bouncing Ball, Mandelbrot, Fractal Anim (ASM), Fractal Zoom (JS)

### Why 32-bit
The 8.8 fixed-point limits Mandelbrot zoom to ~6 levels before precision runs out. With 32-bit registers and 16.16 fixed-point, we get ~50+ zoom levels natively in assembly — matching what the JS renderer does.

---

## 2. Target Architecture

### 2.1 Registers
| Register | Width | Purpose |
|----------|-------|---------|
| R0-R15 | 32-bit | General purpose |
| IAR | 32-bit | Instruction Address Register (PC) |
| SP | 32-bit | Stack pointer (init: top of RAM - VRAM) |
| IR | 8-bit | Instruction register (current opcode) |
| Flags | 4-bit | Carry, Zero, A>B, Equal |

### 2.2 Memory
- **Size**: 1MB (20-bit address space, 0x00000-0xFFFFF)
- **Layout**:
  ```
  0x00000 - 0xBFFFF  Program + data + stack (768KB)
  0xC0000 - 0xFFFFF  Video RAM (256KB)
  ```
- **Byte-addressable**, little-endian for multi-byte values
- **Stack**: Grows downward from 0xBFFFF

### 2.3 Video Display
- **Resolution**: 256×256, 8 bits per pixel (256 colors)
- **VRAM**: 64KB at 0xC0000-0xCFFFF (256×256 bytes, 1 byte per pixel)
- **Palette**: 256 colors — first 16 match v1.0, remaining 240 form a rich gradient
- **Vsync**: STORE to 0xCFFFF triggers frame flip (same concept as v1.0's 0xDFFF)
- **Future expansion**: VRAM space allows up to 512×512 at 0xC0000-0xFFFFF

### 2.4 Instruction Set Architecture

#### Encoding Formats
| Type | Format | Size |
|------|--------|------|
| ALU ops | `[opcode:8] [rA:4 \| rB:4]` | 2 bytes |
| PUSH/POP/OUT/IN/JMPR/LDRI/STRI | `[opcode:8] [rA:4 \| rB:4]` | 2 bytes |
| HALT/RET | `[opcode:8] [0x00]` | 2 bytes |
| JMP/JC/JA/JE/JZ/CALL | `[opcode:8] [addr:24 LE]` | 4 bytes |
| LOAD/STORE | `[opcode:8] [rA:4 \| 0:4] [addr:24 LE]` | 5 bytes |
| DATA | `[opcode:8] [rA:4 \| 0:4] [imm:32 LE]` | 6 bytes |

Note: Addresses are 24-bit (supports up to 16MB, only 20 bits used for 1MB).
DATA is 6 bytes to accommodate full 32-bit immediates.

#### Opcode Table (35+ opcodes)
Keep all v1.0 opcodes, upgrade semantics to 32-bit, add new ones:

| Opcode | Mnemonic | Change from v1.0 |
|--------|----------|-------------------|
| 0x01 | ADD rA, rB | 32-bit addition |
| 0x02 | SUB rA, rB | 32-bit subtraction |
| 0x03 | MUL rA, rB | rA = low 32 bits of 64-bit product |
| 0x0D | MULH rA, rB | rA = high 32 bits of 64-bit product |
| 0x04 | DIV rA, rB | 32-bit unsigned divide |
| 0x05 | MOD rA, rB | 32-bit unsigned modulo |
| 0x06 | SHR rA | Shift right 1 bit |
| 0x07 | SHL rA | Shift left 1 bit |
| 0x0F | SHR8 rA | Shift right 8 bits |
| 0x17 | SHL8 rA | Shift left 8 bits |
| 0x08 | NOT rA | 32-bit bitwise NOT |
| 0x09 | AND rA, rB | 32-bit AND |
| 0x0A | OR rA, rB | 32-bit OR |
| 0x0B | XOR rA, rB | 32-bit XOR |
| 0x0C | CMP rA, rB | 32-bit compare |
| 0x0E | MOV rA, rB | 32-bit register copy |
| 0x10 | LOAD rA, [addr24] | Load 1 byte from memory (zero-extended to 32-bit) |
| 0x11 | STORE rA, [addr24] | Store low byte of rA to memory |
| 0x12 | DATA rA, imm32 | Load 32-bit immediate |
| 0x13 | PUSH rA | Push 32-bit value (SP -= 4) |
| 0x14 | POP rA | Pop 32-bit value (SP += 4) |
| 0x15 | LDRI rA, rB | Load byte from [rB] |
| 0x16 | STRI rA, rB | Store byte to [rB] |
| 0x18 | JMP addr24 | Jump to 24-bit address |
| 0x19 | JC addr24 | Jump if carry |
| 0x1A | JA addr24 | Jump if A > B |
| 0x1B | JE addr24 | Jump if equal |
| 0x1C | JMPR rA | Jump to address in rA |
| 0x1D | CALL addr24 | Push 32-bit return address, jump |
| 0x1E | RET | Pop return address, jump back |
| 0x1F | OUT rA | Output low byte to console |
| 0x20 | IN rA | Read input into rA |

**New opcodes to consider:**
| Opcode | Mnemonic | Description |
|--------|----------|-------------|
| 0x21 | SHRN rA, rB | Shift rA right by rB bits |
| 0x22 | SHLN rA, rB | Shift rA left by rB bits |
| 0x23 | JZ addr24 | Jump if zero flag set |
| 0x24 | JNZ addr24 | Jump if zero flag not set |
| 0x25 | LOAD32 rA, [addr24] | Load 4 bytes (32-bit word) |
| 0x26 | STORE32 rA, [addr24] | Store 4 bytes (32-bit word) |
| 0x27 | LDRI32 rA, rB | Load 32-bit word from [rB] |
| 0x28 | STRI32 rA, rB | Store 32-bit word to [rB] |

The LOAD32/STORE32 and LDRI32/STRI32 are important for efficiently reading/writing 32-bit values (e.g., 16.16 fixed-point numbers) from memory without 4 separate byte loads.

### 2.5 Fixed-Point Math
With 32-bit registers, 16.16 fixed-point is native:
- `MUL` gives low 32 bits, `MULH` gives high 32 bits of 64-bit product
- For 16.16 × 16.16: result = (MULH:MUL) >> 16 = (MULH << 16) | (MUL >> 16)
- This is the same pattern as v1.0's 8.8, just wider
- Precision: 1/65536 ≈ 0.000015 (vs v1.0's 1/256 ≈ 0.0039)
- Mandelbrot zoom: ~50 usable levels vs v1.0's ~6

---

## 3. File Structure

```
gatestack/
├── core/                     # Rust WASM core
│   ├── Cargo.toml
│   └── src/lib.rs            # 640 lines → ~700 lines (wider ops)
├── web/
│   ├── src/
│   │   ├── assembler.ts      # 354 lines — update for new encoding sizes
│   │   ├── wasm-bridge.ts    # 682 lines — IComputer interface + JS engine
│   │   ├── wasm-cpu.ts       # 307 lines — WASM wrapper
│   │   ├── hooks/
│   │   │   └── useComputer.ts # 391 lines — React hook (minimal changes)
│   │   └── components/
│   │       ├── App.tsx        # 2405 lines — main app + samples
│   │       ├── VideoView.tsx  # 134 lines — update palette to 256 colors
│   │       ├── CpuView.tsx    # Register display — show 32-bit hex
│   │       ├── MemoryView.tsx # Memory display — update address width
│   │       ├── Toolbar.tsx    # Speed controls
│   │       ├── CodeEditor.tsx # Assembler editor
│   │       └── ...
│   ├── electron/main.mjs
│   ├── package.json
│   └── vite.config.ts
├── scripts/                  # Build scripts (Windows .bat)
├── README.md
├── REFERENCE.md              # ISA reference — rewrite for 32-bit
└── DESIGN-32BIT.md           # This file
```

---

## 4. Implementation Plan

### Phase 1: Core Architecture (Rust + JS engines)
1. Update `core/src/lib.rs`:
   - `r: [u32; 16]` instead of `[u16; 16]`
   - `mem: Vec<u8>` size 1MB (1_048_576)
   - `iar: u32`, `sp: u32`
   - Update all opcode handlers for 32-bit arithmetic
   - Add new opcodes (SHRN, SHLN, JZ, JNZ, LOAD32, STORE32, LDRI32, STRI32)
   - Update instruction size calculation
   - Update unsafe run() loop
   - Vsync address: 0xCFFFF

2. Update `web/src/wasm-bridge.ts`:
   - JS MockComputer: same changes as Rust
   - Memory size constant: 1_048_576
   - Update all opcode handlers
   - 32-bit push/pop (4 bytes)
   - 24-bit address decoding for jumps
   - 32-bit immediate for DATA

3. Update `web/src/wasm-cpu.ts`:
   - WASM wrapper: memory view for 1MB
   - Register getters return 32-bit values

### Phase 2: Assembler
4. Update `web/src/assembler.ts`:
   - DATA emits 6 bytes (opcode + reg + 32-bit LE)
   - LOAD/STORE emit 5 bytes (opcode + reg + 24-bit LE address)
   - JMP/JC/JA/JE/JZ/JNZ/CALL emit 4 bytes (opcode + 24-bit LE)
   - Number parser: support values > 65535
   - Label resolution: 24-bit addresses
   - Add new mnemonics

### Phase 3: UI Updates
5. Update `web/src/components/VideoView.tsx`:
   - VIDEO_BASE = 0xC0000
   - 8bpp: 1 byte per pixel (no nibble packing)
   - 256-color palette
   - VSYNC_ADDR = 0xCFFFF

6. Update `web/src/components/CpuView.tsx`:
   - Display registers as 8-digit hex (32-bit)
   - IAR shows 6-digit hex (24-bit address)

7. Update `web/src/components/MemoryView.tsx`:
   - Address display: 5-6 hex digits
   - Navigate up to 0xFFFFF

### Phase 4: Sample Programs
8. Rewrite all samples for 32-bit:
   - DATA R0, values can now be 32-bit
   - Mandelbrot with 16.16 fixed-point (the main payoff)
   - Bouncing ball: trivial update (addresses change)
   - Fractal Anim: rewrite with 16.16 math for 50+ zoom levels
   - Keep JS Fractal Zoom as reference

### Phase 5: Polish
9. Update README.md, REFERENCE.md
10. Build and test WASM
11. Electron packaging

---

## 5. Key Learnings from v1.0

### Performance
- **JS engine outperforms WASM** with safe Rust (bounds-checked array access)
- **Unsafe Rust** with raw pointer access makes WASM ~60% faster than JS
- **V8 JIT** is extremely good at tight integer loops — near-native performance
- **Time-budgeted execution**: run batches per animation frame, not fixed cycle counts
- **Vsync pacing**: break on STORE to vsync address for proper video sync

### Architecture Decisions
- **Dual engine** (JS + WASM) with runtime toggle is educational and practical
- **JS as default** ensures the app works without Rust toolchain installed
- **skipVsync flag** was added then disabled — always respect vsync for correct rendering
- **Per-row vsync** in Mandelbrot enables progressive rendering (good UX)

### Fixed-Point Math
- 8.8 with MULH gives signed multiply via: make both positive, multiply unsigned, apply sign
- Pattern: `result = (MULH << 8) | (MUL >> 8)` for 8.8 × 8.8
- For 16.16: `result = (MULH << 16) | (MUL >> 16)` — same pattern, wider
- Signed handling: check sign bits, negate if needed, multiply unsigned, negate result if signs differ

### Video System
- 4bpp packed pixels require read-modify-write (slow in assembly)
- 8bpp (1 byte per pixel) is much simpler: direct byte write
- Color cycling: walk VRAM, increment non-zero pixels mod palette_size
- Vsync address write = frame complete signal

### Assembler
- Label-based addressing works well for educational purposes
- Supporting hex, decimal, binary, char literals is important
- DB/DW directives for raw data embedding

---

## 6. Migration Checklist

When starting the v2.0 implementation:

- [ ] Upload current gatestack.zip to new conversation
- [ ] Upload this DESIGN-32BIT.md
- [ ] Start with Phase 1 (Rust core) — get 32-bit opcodes working
- [ ] Phase 2 (assembler) — critical for testing
- [ ] Phase 3 (UI) — video system + register display
- [ ] Phase 4 (samples) — Mandelbrot 16.16 is the proof-of-concept
- [ ] Phase 5 (polish) — README, WASM build, Electron

### Files to modify (in order):
1. `core/src/lib.rs` — Rust CPU (WASM)
2. `web/src/wasm-bridge.ts` — JS CPU + interface
3. `web/src/assembler.ts` — instruction encoding
4. `web/src/wasm-cpu.ts` — WASM wrapper
5. `web/src/components/VideoView.tsx` — 8bpp renderer
6. `web/src/components/CpuView.tsx` — 32-bit register display
7. `web/src/components/MemoryView.tsx` — 20-bit addresses
8. `web/src/components/App.tsx` — sample programs
9. `REFERENCE.md` — ISA documentation

### Backward Compatibility
v2.0 is NOT backward compatible with v1.0 assembly. All sample programs must be rewritten. The overall structure and approach are the same, just wider.

---

## 7. Open Questions for v2.0

1. **LOAD semantics**: Should LOAD read 1 byte (zero-extend) or 4 bytes? Recommend: LOAD = 1 byte, LOAD32 = 4 bytes
2. **STORE semantics**: Should STORE write 1 byte or 4 bytes? Recommend: STORE = 1 byte, STORE32 = 4 bytes  
3. **Signed operations**: Add IDIV/IMOD for signed divide? Or keep everything unsigned?
4. **Shift by N**: SHRN rA, rB (shift rA by rB bits) — very useful for fixed-point
5. **Palette**: Hardcoded 256 colors or programmable palette RAM?
6. **Sound**: Future consideration — memory-mapped audio buffer?
