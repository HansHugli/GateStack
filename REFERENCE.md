# GateStack ISA Reference

Complete instruction set and architecture reference for GateStack v0.2.0.

## Registers

| Register | Encoding | Description |
|----------|----------|-------------|
| R0 | `00` | General purpose |
| R1 | `01` | General purpose |
| R2 | `10` | General purpose |
| R3 | `11` | General purpose |
| ACC | — | Accumulator (internal, holds ALU result) |
| TMP | — | Temporary (internal, holds second operand) |
| IAR | — | Instruction Address Register (program counter) |
| IR | — | Instruction Register (current instruction) |

## Flags

Set by all ALU operations and CMP.

| Flag | Set when |
|------|----------|
| `carry` | Addition result > 255 (unsigned overflow) |
| `a_larger` | regA > regB (unsigned comparison) |
| `equal` | regA == regB |
| `zero` | Result == 0 |

## Instruction Encoding

```
Single byte:  [4-bit opcode][2-bit regA][2-bit regB]
Two-byte:     [4-bit opcode][2-bit regA][2-bit 00] [8-bit operand]

  7  6  5  4  3  2  1  0
 ┌──┬──┬──┬──┬──┬──┬──┬──┐
 │  OPCODE   │ REG_A │REG_B│
 └──┴──┴──┴──┴──┴──┴──┴──┘
  bits 7-4    bits 3-2  1-0
```

## Instructions

### ALU Operations (1 byte)

All ALU ops store the result in regA (except CMP) and update all flags.

| Mnemonic | Opcode | Description |
|----------|--------|-------------|
| `ADD rA, rB` | 0x0 | rA = rA + rB |
| `SHR rA, rB` | 0x1 | rA = rA >> 1 (logical shift right, ignores rB) |
| `SHL rA, rB` | 0x2 | rA = rA << 1 (shift left, ignores rB) |
| `NOT rA` | 0x3 | rA = ~rA (bitwise NOT) |
| `AND rA, rB` | 0x4 | rA = rA & rB |
| `OR rA, rB` | 0x5 | rA = rA \| rB |
| `XOR rA, rB` | 0x6 | rA = rA ^ rB |
| `CMP rA, rB` | 0x7 | Sets flags based on rA vs rB. Does NOT modify any register. |

### Memory & Data (2 bytes)

| Mnemonic | Opcode | Description |
|----------|--------|-------------|
| `LOAD rA, [addr]` | 0x8 | rA = RAM[addr] |
| `STORE rA, [addr]` | 0x9 | RAM[addr] = rA |
| `DATA rA, value` | 0xA | rA = immediate value (0–255) |

### I/O (1 byte, opcode 0xB variants)

Opcode 0xB is shared between JMPR, OUT, and IN, distinguished by the regB field.

| Mnemonic | Opcode | regB | Description |
|----------|--------|------|-------------|
| `JMPR rA` | 0xB | 0 | Jump to address stored in rA |
| `OUT rA` | 0xB | 1 | Output rA value to console |
| `IN rA` | 0xB | 2 | Pause execution, read user input into rA |

**IN behavior:** Execution pauses and the console shows a `>` input prompt. The user can enter:
- A decimal number: `42`
- A hex number: `0xFF`
- A single character: `A` (stored as ASCII code 65)
- A character literal: `'A'`

After the user presses Enter, the value (0–255) is stored in rA and execution resumes automatically if the program was running.

### Jumps (2 bytes)

| Mnemonic | Opcode | Description |
|----------|--------|-------------|
| `JMP label` | 0xC | Unconditional jump |
| `JC label` | 0xD | Jump if carry flag is set |
| `JA label` | 0xE | Jump if a_larger flag is set (rA > rB after CMP) |
| `JE label` | 0xF | Jump if equal flag is set (rA == rB after CMP) |

### Special

| Mnemonic | Opcode | Description |
|----------|--------|-------------|
| `HALT` | 0x00 | Stop execution |

Note: HALT is encoded as `ADD R0, R0` (all zeros). Since adding R0 to itself is a no-op in practice, address 0x00 containing 0x00 acts as a halt sentinel.

## Assembly Syntax

### Labels
```asm
loop:   ADD  R0, R1
        JMP  loop
```

### Number Formats
| Format | Example | Value |
|--------|---------|-------|
| Decimal | `42` | 42 |
| Hex | `0xFF` | 255 |
| Binary | `0b1010` | 10 |
| Character | `'A'` | 65 |
| Negative | `-1` | 255 (two's complement) |

### Comments
```asm
        DATA R0, 42     ; this is a comment
; this entire line is a comment
```

### Data Directives
```asm
        DB 0xFF         ; place raw byte at current address
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `S` | Step one instruction |
| `B` | Step back (undo) |
| `R` | Run (continuous) |
| `P` / `Esc` | Pause |
| `Ctrl+Enter` | Assemble code |
| `?` | Toggle help panel |

### Electron-only
| Key | Action |
|-----|--------|
| `F5` | Run |
| `F9` | Step back |
| `F10` | Step |
| `F6` | Pause |

## Debugger Features

### Breakpoints
Click the gutter (left of line numbers) in the code editor to toggle breakpoints. A red dot marks the breakpoint. During Run mode, execution pauses when the program counter reaches a breakpoint address.

### Step-Back (Undo)
Press `B` or click ⏮ Back to rewind one instruction. Full CPU state, RAM, and console output are restored. Up to 256 steps of history are retained.

### Memory Editor
Click any cell in the RAM hex view to edit its value. Accepts hex (`FF`, `0xFF`), decimal (`255`), or character literals (`'A'`). Press Tab to advance to the next cell.

### Console I/O
The console panel supports three display modes (switchable via chips):
- **ASCII** — text output with blinking cursor
- **HEX** — raw byte values in hexadecimal
- **DEC** — raw byte values in decimal

## Sample Programs

| # | Name | Description |
|---|------|-------------|
| 1 | Add | Basic addition: 15 + 27 = 42 |
| 2 | Count | Loop from 0 to 10 |
| 3 | Fibonacci | Generate sequence up to 233 |
| 4 | Shift | SHL/SHR bit manipulation |
| 5 | Logic | AND, OR, XOR, NOT demonstrations |
| 6 | Multiply | 7 × 6 = 42 via repeated addition |
| 7 | Division | 100 ÷ 7 with quotient and remainder |
| 8 | Hello | Print "Hello World!" to console using OUT |
| 9 | Sort | Bubble sort 4 values in RAM |
| 10 | Stack | Push/Pop with simulated stack pointer |
| 11 | Flags | Flag behavior demonstrations |
| 12 | Power | Compute 2^8 (overflows to 0) |
| 13 | Pattern | Checkerboard pattern in RAM |
| 14 | GCD | Greatest common divisor of 48 and 18 |
| 15 | Abs | Absolute value using two's complement |
| 16 | MinMax | Find min and max of 5 values |
| 17 | Primes | Trial division sieve for primes < 128 |
| 18 | Pi | Leibniz series approximation of π |
| 19 | Echo | Interactive echo loop (IN/OUT) |
| 20 | Adder | Add two user inputs, print decimal result |
