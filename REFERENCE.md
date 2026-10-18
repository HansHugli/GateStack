# GateStack ISA v2 — Reference

This is the specification. Both engines (the Rust/WASM core in `core/src/lib.rs` and the JavaScript engine in `web/src/wasm-bridge.ts`) implement exactly this, and `web/src/engines.test.ts` checks that they agree. `DESIGN-32BIT.md` is the historical design plan, not the spec.

## Architecture

- **Word size**: 32-bit registers, 8-bit memory cells
- **Registers**: R0–R15 (16 general-purpose 32-bit registers), IAR (instruction address), SP (stack pointer)
- **Flags**: Carry (C), Zero (Z), A>B, Equal (E), set by ALU operations and CMP (see [Flags](#flags))
- **RAM**: 4 MB (4,194,304 bytes), 22-bit address space, byte-addressable, little-endian
- **Stack**: grows downward from 0x3BFFFF
- **Addresses** are 22 bits. IAR and SP always hold a value in 0x000000–0x3FFFFF; a register used as an address (LDRI, STRI, JMPR, …) is masked to 22 bits.

## Memory Map

| Address Range | Size | Description |
|---------------|------|-------------|
| 0x000000–0x3BFFFF | 3,840 KB | Program + Data + Stack (SP init: 0x3BFFFF) |
| 0x3C0000–0x3CFFFF | 64 KB | VRAM Back Buffer (draw target) |
| 0x3D0000–0x3DFFFF | 64 KB | VRAM Front Buffer (display source) |
| 0x3E0000–0x3E03FF | 1 KB | Palette RAM (256 entries × 4 bytes: R, G, B, unused) |
| 0x3E0400–0x3FFFFF | ~128 KB | Reserved / IO (0x3FFFFF: vsync) |

**Vsync**: any store (STORE, STRI, STORE32, STRI32) that writes address 0x3FFFFF copies the back buffer to the front buffer (a page flip) and ends the current run batch so the screen can be drawn. It happens when single-stepping too.

## Instruction Encoding

| Type | Format | Size | Instructions |
|------|--------|------|--------------|
| ALU / Register | `[opcode:8] [rA:4 \| rB:4]` | 2 bytes | ADD, SUB, MUL, MULH, DIV, MOD, IDIV, IMOD, FPMUL, FPMUL16, SHRN, SHLN, AND, OR, XOR, CMP, MOV, LDRI, STRI, LDRI32, STRI32 |
| One register | `[opcode:8] [rA:4 \| rA:4]` | 2 bytes | NOT, SHR, SHL, SHR8, SHL8 (the assembler repeats rA in the rB field) |
| One register | `[opcode:8] [rA:4 \| 0:4]` | 2 bytes | PUSH, POP, OUT, IN, JMPR |
| HALT / RET | `[opcode:8] [0x00]` | 2 bytes | HALT, RET |
| Jump | `[opcode:8] [addr:24 LE]` | 4 bytes | JMP, JC, JA, JE, JZ, JNZ, CALL |
| Memory | `[opcode:8] [rA:4 \| 0:4] [addr:24 LE]` | 5 bytes | LOAD, STORE, LOAD32, STORE32 |
| Immediate | `[opcode:8] [rA:4 \| 0:4] [imm:32 LE]` | 6 bytes | DATA |
| Data directives | values in order | 1, 2 or 4 bytes per value | DB, DW, DD |

## Instructions (45)

### Arithmetic (10)

| Opcode | Mnemonic | Operands | Description |
|--------|----------|----------|-------------|
| 0x01 | ADD | rA, rB | rA = rA + rB (C = the sum needed more than 32 bits) |
| 0x02 | SUB | rA, rB | rA = rA − rB (C = borrow, i.e. rA < rB unsigned) |
| 0x03 | MUL | rA, rB | rA = low 32 bits of rA × rB (C = the product needed more than 32 bits) |
| 0x0D | MULH | rA, rB | rA = high 32 bits of the 64-bit unsigned product |
| 0x04 | DIV | rA, rB | rA = rA ÷ rB, unsigned; 0 if rB = 0 |
| 0x05 | MOD | rA, rB | rA = rA mod rB, unsigned; 0 if rB = 0 |
| 0x29 | IDIV | rA, rB | rA = rA ÷ rB, signed, rounded toward zero; 0 if rB = 0; −2³¹ ÷ −1 = −2³¹ |
| 0x2A | IMOD | rA, rB | rA = remainder of IDIV (takes the sign of rA); 0 if rB = 0 |
| 0x2B | FPMUL | rA, rB | 8.8 fixed point: rA = (rA × rB) >> 8, signed, rounded down, low 32 bits kept |
| 0x2C | FPMUL16 | rA, rB | 16.16 fixed point: rA = (rA × rB) >> 16, signed, rounded down, low 32 bits kept |

In 8.8 fixed point 1.0 is 256 (0x100); in 16.16 it is 65,536 (0x10000). Negative values are two's complement, so −1.0 in 16.16 is 0xFFFF0000.

### Shifts (6)

| Opcode | Mnemonic | Operands | Description |
|--------|----------|----------|-------------|
| 0x06 | SHR | rA | rA = rA >> 1 (C = the bit shifted out, bit 0) |
| 0x07 | SHL | rA | rA = rA << 1 (C = the bit shifted out, bit 31) |
| 0x0F | SHR8 | rA | rA = rA >> 8 (C = bit 7, the last bit shifted out) |
| 0x17 | SHL8 | rA | rA = rA << 8 (C = any of bits 24–31 was set, i.e. bits were lost) |
| 0x21 | SHRN | rA, rB | rA = rA >> (rB & 31) (C = the last bit shifted out; 0 for a shift of 0) |
| 0x22 | SHLN | rA, rB | rA = rA << (rB & 31) (C = any bit was shifted out) |

Shift amounts are taken modulo 32, so SHRN/SHLN by 32 do nothing.

### Bitwise, Compare & Move (6)

| Opcode | Mnemonic | Operands | Description |
|--------|----------|----------|-------------|
| 0x08 | NOT | rA | rA = ~rA (all 32 bits) |
| 0x09 | AND | rA, rB | rA = rA & rB |
| 0x0A | OR | rA, rB | rA = rA \| rB |
| 0x0B | XOR | rA, rB | rA = rA ^ rB |
| 0x0C | CMP | rA, rB | Sets the flags as for rA − rB and stores nothing: Z = (rA == rB), C = (rA < rB, unsigned) |
| 0x0E | MOV | rA, rB | rA = rB |

### Memory — Byte (4)

| Opcode | Mnemonic | Operands | Description |
|--------|----------|----------|-------------|
| 0x10 | LOAD | rA, [addr] | rA = RAM[addr] (1 byte, zero-extended) |
| 0x11 | STORE | rA, [addr] | RAM[addr] = rA & 0xFF |
| 0x15 | LDRI | rA, rB | rA = RAM[rB] (indirect byte load) |
| 0x16 | STRI | rA, rB | RAM[rB] = rA & 0xFF (indirect byte store) |

### Memory — 32-bit (4)

| Opcode | Mnemonic | Operands | Description |
|--------|----------|----------|-------------|
| 0x25 | LOAD32 | rA, [addr] | rA = RAM[addr..addr+3] (little-endian, any alignment) |
| 0x26 | STORE32 | rA, [addr] | RAM[addr..addr+3] = rA |
| 0x27 | LDRI32 | rA, rB | rA = RAM[rB..rB+3] |
| 0x28 | STRI32 | rA, rB | RAM[rB..rB+3] = rA |

A 32-bit access whose four bytes would run past 0x3FFFFF (an address of 0x3FFFFD or higher) is a [fault](#faults).

### Immediate & Stack (3)

| Opcode | Mnemonic | Operands | Description |
|--------|----------|----------|-------------|
| 0x12 | DATA | rA, imm32 | rA = a 32-bit value |
| 0x13 | PUSH | rA | SP −= 4, then RAM[SP..SP+3] = rA |
| 0x14 | POP | rA | rA = RAM[SP..SP+3], then SP += 4 |

### Jumps (9)

| Opcode | Mnemonic | Operands | Description |
|--------|----------|----------|-------------|
| 0x18 | JMP | addr | Jump |
| 0x19 | JC | addr | Jump if C is set |
| 0x1A | JA | addr | Jump if A>B is set |
| 0x1B | JE | addr | Jump if E is set |
| 0x23 | JZ | addr | Jump if Z is set |
| 0x24 | JNZ | addr | Jump if Z is clear |
| 0x1C | JMPR | rA | Jump to the address in rA |
| 0x1D | CALL | addr | Push the return address (SP −= 4), jump to addr |
| 0x1E | RET | — | Pop the return address and jump to it |

After `CMP rA, rB`: JE or JZ jumps if rA == rB, JNZ if rA ≠ rB, JA if rA > rB, JC if rA < rB (all unsigned).

### I/O & Control (3)

| Opcode | Mnemonic | Operands | Description |
|--------|----------|----------|-------------|
| 0x1F | OUT | rA | Print the character rA & 0xFF on the console |
| 0x20 | IN | rA | Pause until the user enters a value; it is stored in rA (32 bits) |
| 0x00 | HALT | — | Stop |

## Flags

Every ALU operation (arithmetic, shifts, bitwise, CMP, MOV) sets all four flags. Memory, stack, jump and I/O instructions leave them unchanged.

| Flag | Meaning |
|------|---------|
| Carry (C) | As listed per instruction above. DIV, MOD, MULH, IDIV, IMOD, FPMUL, FPMUL16, NOT, AND, OR, XOR and MOV clear it. |
| Zero (Z) | The result is 0. For CMP, the result is rA − rB, so Z means rA == rB. |
| A>B | rA > rB (unsigned), comparing the values before the operation |
| Equal (E) | rA == rB, comparing the values before the operation |

For the one-register instructions (NOT, SHR, SHL, SHR8, SHL8) the rB field holds rA again, so E is always set and A>B always clear after them. MOV compares the old rA with rB before copying, so `CMP` followed by `MOV` and then a conditional jump tests the MOV, not the CMP.

## Faults

The CPU stops (halts) with a message, and the IAR stays on the instruction that caused it:

| Fault | Message |
|-------|---------|
| An undefined opcode (0x2D–0xFF) | `Illegal opcode 0x2D at 0x000140` |
| A 32-bit access that runs past 0x3FFFFF | `32-bit access at 0x3FFFFE runs past the end of RAM (0x3FFFFF)` |

Reset or loading a program clears the fault. A program that jumps into data usually ends this way, which makes the mistake easy to find.

## Video Display

- **Resolution**: 256×256 pixels, 8 bits per pixel (1 byte per pixel), 256 bytes per row
- **Colors**: a 256-color programmable palette at 0x3E0000 (4 bytes per entry: R, G, B, unused)
- **Default palette**: colors 0–15 are the v1 colors; colors 16–255 are an HSV rainbow (identical in both engines)
- **Double buffering**: programs draw to the back buffer (0x3C0000); vsync copies it to the front buffer (0x3D0000), which is what you see

## Assembly Syntax

```
label:  MNEMONIC  operand1, operand2  ; comment
```

- **Labels**: `name:` at the start of a line. Labels are not case-sensitive (`Loop` and `LOOP` are the same label) and may not be named like a register, an instruction or a directive.
- **Registers**: R0–R15.
- **Numbers**: decimal `42`, hex `0xFF`, binary `0b1010`, a character `'A'`, with an optional minus sign (`-10`, `-0x10`). Characters may use the escapes `\n`, `\r`, `\t`, `\0`, `\\` and `\'`.
- **Ranges**: DATA and DD take −2,147,483,648 to 4,294,967,295; DB −128 to 255; DW −32,768 to 65,535; addresses 0x000000 to 0x3FFFFF. Anything outside is an error, never silently cut off. Negative values are stored in two's complement.
- **Memory operands** may be written with or without brackets: `LOAD R0, [value]` and `LOAD R0, value` are the same.
- **Directives**: `DB`, `DW` and `DD` take a comma-separated list of values, and `DB` also takes strings: `msg: DB "Hi!", 10, 0`.
- **Comments**: `;` to the end of the line (a `;` inside quotes is part of the text).
- **Errors** name the line and say what was expected, for example `ADD expects 2 operands (rA, rB), got 1`. Every error in the program is reported at once.
