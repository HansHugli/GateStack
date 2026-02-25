# GateStack v1.0 — ISA Reference

## Architecture

- **Word size**: 16-bit registers, 8-bit memory cells
- **Registers**: R0–R15 (16 general-purpose 16-bit registers), IAR, IR, ACC, TMP, MAR, SP
- **RAM**: 64KB (65536 bytes), byte-addressable
- **Stack**: Grows downward from 0x9FFF (below video RAM)
- **Flags**: Carry, Zero, A>B, Equal (set by ALU ops and CMP)

## Instruction Encoding

| Type | Format | Size |
|------|--------|------|
| ALU ops | `[opcode:8] [rA:4 \| rB:4]` | 2 bytes |
| PUSH/POP/OUT/IN/JMPR/LDRI/STRI | `[opcode:8] [rA:4 \| rB:4]` | 2 bytes |
| HALT/RET | `[opcode:8] [0x00]` | 2 bytes |
| JMP/JC/JA/JE/CALL | `[opcode:8] [addr_lo:8] [addr_hi:8]` | 3 bytes |
| LOAD/STORE/DATA | `[opcode:8] [rA:4 \| 0:4] [val_lo:8] [val_hi:8]` | 4 bytes |

## Instructions (27)

| Opcode | Mnemonic | Operands | Description |
|--------|----------|----------|-------------|
| 0x00 | HALT | — | Stop execution |
| 0x01 | ADD | rA, rB | rA = rA + rB |
| 0x02 | SUB | rA, rB | rA = rA - rB |
| 0x03 | MUL | rA, rB | rA = rA × rB |
| 0x04 | DIV | rA, rB | rA = rA ÷ rB (integer) |
| 0x05 | MOD | rA, rB | rA = rA % rB |
| 0x06 | SHR | rA | rA = rA >> 1 |
| 0x07 | SHL | rA | rA = rA << 1 |
| 0x08 | NOT | rA | rA = ~rA |
| 0x09 | AND | rA, rB | rA = rA & rB |
| 0x0A | OR | rA, rB | rA = rA \| rB |
| 0x0B | XOR | rA, rB | rA = rA ^ rB |
| 0x0C | CMP | rA, rB | Compare (flags only) |
| 0x10 | LOAD | rA, [addr16] | rA = RAM[addr] |
| 0x11 | STORE | rA, [addr16] | RAM[addr] = rA (low byte) |
| 0x12 | DATA | rA, imm16 | rA = immediate value |
| 0x13 | PUSH | rA | Push rA onto stack |
| 0x14 | POP | rA | Pop stack into rA |
| 0x15 | LDRI | rA, rB | rA = RAM[rB] (indirect load) |
| 0x16 | STRI | rA, rB | RAM[rB] = rA (indirect store) |
| 0x18 | JMP | addr16 | Unconditional jump |
| 0x19 | JC | addr16 | Jump if carry |
| 0x1A | JA | addr16 | Jump if A > B |
| 0x1B | JE | addr16 | Jump if equal |
| 0x1C | JMPR | rA | Jump to address in rA |
| 0x1D | CALL | addr16 | Push return address, jump |
| 0x1E | RET | — | Pop return address, jump back |
| 0x1F | OUT | rA | Output rA (low byte) to console |
| 0x20 | IN | rA | Read user input into rA |

## Video Display

- **Resolution**: 64×64 pixels, 4 colors, 2 bits per pixel (packed)
- **Pixel format**: 4 pixels per byte, MSB first (bits 7-6 = pixel 0)
- **Double buffer**: Page 0 at 0xA000–0xA3FF, Page 1 at 0xA400–0xA7FF (1024 bytes each)
- **PAGE_SELECT**: Write 0 or 1 to address 0xDFFF to swap the display page
- **Colors**: 0 = off, 1 = dim, 2 = mid, 3 = bright
- **Rendering**: Draw to back page, then flip PAGE_SELECT for tear-free animation

## Assembly Syntax

```
label:  MNEMONIC  operand1, operand2  ; comment
```

- Labels: `name:` at start of line
- Numbers: decimal `42`, hex `0xFF`, binary `0b1010`, char `'A'`
- Directives: `DB value` (raw byte), `DW value` (raw 16-bit word)
