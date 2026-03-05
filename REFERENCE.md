# GateStack v2.0 — ISA Reference

## Architecture

- **Word size**: 32-bit registers, 8-bit memory cells
- **Registers**: R0–R15 (16 general-purpose 32-bit registers), IAR, SP
- **Flags**: Carry, Zero, A>B, Equal (set by ALU ops and CMP)
- **RAM**: 4MB (4,194,304 bytes), 22-bit address space, byte-addressable
- **Stack**: Grows downward from 0x3BFFFF

## Memory Map

| Address Range | Size | Description |
|---------------|------|-------------|
| 0x000000–0x3BFFFF | 3,840 KB | Program + Data + Stack (SP init: 0x3BFFFF) |
| 0x3C0000–0x3CFFFF | 64 KB | VRAM Back Buffer (draw target) |
| 0x3D0000–0x3DFFFF | 64 KB | VRAM Front Buffer (display source) |
| 0x3E0000–0x3E03FF | 1 KB | Palette RAM (256 entries × 4 bytes: R, G, B, _) |
| 0x3E0400–0x3FFFFF | ~128 KB | Reserved / IO |

**Vsync**: Any STORE to address 0x3FFFFF triggers a page flip (back buffer → front buffer) and yields to the renderer.

## Instruction Encoding

| Type | Format | Size | Instructions |
|------|--------|------|--------------|
| ALU / Register | `[opcode:8] [rA:4 \| rB:4]` | 2 bytes | ADD, SUB, MUL, MULH, DIV, MOD, IDIV, IMOD, FPMUL, SHR, SHL, SHR8, SHL8, SHRN, SHLN, NOT, AND, OR, XOR, CMP, MOV, LDRI, STRI, LDRI32, STRI32, PUSH, POP, OUT, IN, JMPR |
| HALT / RET | `[opcode:8] [0x00]` | 2 bytes | HALT, RET |
| Jump | `[opcode:8] [addr:24 LE]` | 4 bytes | JMP, JC, JA, JE, JZ, JNZ, CALL |
| Memory | `[opcode:8] [rA:4 \| 0:4] [addr:24 LE]` | 5 bytes | LOAD, STORE, LOAD32, STORE32 |
| Immediate | `[opcode:8] [rA:4 \| 0:4] [imm:32 LE]` | 6 bytes | DATA |
| Data directives | varies | 1–4 bytes | DB (1), DW (2), DD (4) |

## Instructions (44)

### Arithmetic (9)

| Opcode | Mnemonic | Operands | Description |
|--------|----------|----------|-------------|
| 0x01 | ADD | rA, rB | rA = rA + rB (sets carry on overflow) |
| 0x02 | SUB | rA, rB | rA = rA - rB (sets carry on underflow) |
| 0x03 | MUL | rA, rB | rA = (rA × rB) & 0xFFFFFFFF (low 32 bits) |
| 0x0D | MULH | rA, rB | rA = (rA × rB) >> 32 (high 32 bits of 64-bit product) |
| 0x04 | DIV | rA, rB | rA = rA ÷ rB (unsigned, 0 if rB=0) |
| 0x05 | MOD | rA, rB | rA = rA % rB (unsigned, 0 if rB=0) |
| 0x29 | IDIV | rA, rB | rA = rA ÷ rB (signed) |
| 0x2A | IMOD | rA, rB | rA = rA % rB (signed) |
| 0x2B | FPMUL | rA, rB | rA = (rA × rB) >> 8 (signed 8.8 fixed-point multiply) |

### Shifts (6)

| Opcode | Mnemonic | Operands | Description |
|--------|----------|----------|-------------|
| 0x06 | SHR | rA | rA = rA >> 1 (carry = bit 0) |
| 0x07 | SHL | rA | rA = rA << 1 (carry on overflow) |
| 0x0F | SHR8 | rA | rA = rA >> 8 |
| 0x17 | SHL8 | rA | rA = rA << 8 |
| 0x21 | SHRN | rA, rB | rA = rA >> (rB & 31) (variable shift right) |
| 0x22 | SHLN | rA, rB | rA = rA << (rB & 31) (variable shift left) |

### Bitwise & Compare (6)

| Opcode | Mnemonic | Operands | Description |
|--------|----------|----------|-------------|
| 0x08 | NOT | rA | rA = ~rA (bitwise NOT) |
| 0x09 | AND | rA, rB | rA = rA & rB |
| 0x0A | OR | rA, rB | rA = rA \| rB |
| 0x0B | XOR | rA, rB | rA = rA ^ rB |
| 0x0C | CMP | rA, rB | Compare only — sets flags, does not modify rA |
| 0x0E | MOV | rA, rB | rA = rB (copy register) |

### Memory — Byte (4)

| Opcode | Mnemonic | Operands | Description |
|--------|----------|----------|-------------|
| 0x10 | LOAD | rA, [addr24] | rA = RAM[addr] (1 byte, zero-extended to 32 bits) |
| 0x11 | STORE | rA, [addr24] | RAM[addr] = rA & 0xFF (low byte only) |
| 0x15 | LDRI | rA, rB | rA = RAM[rB] (indirect byte load) |
| 0x16 | STRI | rA, rB | RAM[rB] = rA & 0xFF (indirect byte store) |

### Memory — 32-bit (4)

| Opcode | Mnemonic | Operands | Description |
|--------|----------|----------|-------------|
| 0x25 | LOAD32 | rA, [addr24] | rA = RAM[addr..addr+3] (4 bytes, little-endian) |
| 0x26 | STORE32 | rA, [addr24] | RAM[addr..addr+3] = rA (4 bytes, little-endian) |
| 0x27 | LDRI32 | rA, rB | rA = RAM[rB..rB+3] (indirect 32-bit load) |
| 0x28 | STRI32 | rA, rB | RAM[rB..rB+3] = rA (indirect 32-bit store) |

### Immediate & Stack (3)

| Opcode | Mnemonic | Operands | Description |
|--------|----------|----------|-------------|
| 0x12 | DATA | rA, imm32 | rA = 32-bit immediate value |
| 0x13 | PUSH | rA | SP -= 4, write rA to RAM[SP] (32-bit) |
| 0x14 | POP | rA | Read 32 bits from RAM[SP] into rA, SP += 4 |

### Jumps (8)

| Opcode | Mnemonic | Operands | Description |
|--------|----------|----------|-------------|
| 0x18 | JMP | addr24 | Unconditional jump |
| 0x19 | JC | addr24 | Jump if carry flag set |
| 0x1A | JA | addr24 | Jump if A > B flag set |
| 0x1B | JE | addr24 | Jump if equal flag set |
| 0x23 | JZ | addr24 | Jump if zero flag set |
| 0x24 | JNZ | addr24 | Jump if zero flag not set |
| 0x1C | JMPR | rA | Jump to address in rA |
| 0x1D | CALL | addr24 | Push return address (SP -= 4), jump to addr |
| 0x1E | RET | — | Pop return address, jump back |

### I/O & Control (3)

| Opcode | Mnemonic | Operands | Description |
|--------|----------|----------|-------------|
| 0x1F | OUT | rA | Output rA & 0xFF to console |
| 0x20 | IN | rA | Pause and read user input into rA |
| 0x00 | HALT | — | Stop execution |

## Video Display

- **Resolution**: 256×256 pixels, 8 bits per pixel (1 byte per pixel)
- **Colors**: 256-color programmable palette at 0x3E0000 (4 bytes per entry: R, G, B, unused)
- **Default palette**: Colors 0–15 = v1.0 compatible, colors 16–255 = HSV rainbow gradient
- **Double buffering**: Programs draw to back buffer (0x3C0000), vsync copies to front buffer (0x3D0000)
- **Vsync trigger**: Any STORE/STRI/STORE32/STRI32 that writes to address 0x3FFFFF
- **Row stride**: 256 bytes per row (1 byte per pixel × 256 pixels)

## Assembly Syntax

```
label:  MNEMONIC  operand1, operand2  ; comment
```

- **Labels**: `name:` at start of line
- **Numbers**: decimal `42`, hex `0xFF`, binary `0b1010`, char `'A'`
- **Negative numbers**: `-10` (wraps to 32-bit unsigned)
- **Directives**: `DB value` (1 byte), `DW value` (2 bytes LE), `DD value` (4 bytes LE)
- **Comments**: `;` to end of line

## Flags

All ALU operations set flags. CMP sets flags without modifying the destination register.

| Flag | Condition |
|------|-----------|
| Carry (C) | Unsigned overflow/underflow |
| Zero (Z) | Result is zero |
| A>B | First operand > second operand (unsigned) |
| Equal (E) | First operand == second operand |