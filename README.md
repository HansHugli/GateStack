# GateStack v0.2.0

An 8-bit CPU emulator and assembly IDE — a visual, interactive environment for learning how computers execute instructions at the hardware level.

## Features

- **Full 8-bit CPU** — 4 registers (R0–R3), 256 bytes RAM, flags (carry, a_larger, equal, zero)
- **19-instruction ISA** — ALU ops, memory access, jumps, conditionals, I/O
- **Visual debugger** — step, run, pause, step-back (undo), breakpoints
- **Assembler** — labels, hex/binary/decimal/char literals, comments
- **Console I/O** — `OUT` prints to console, `IN` reads user input (terminal-style)
- **Memory editor** — click any RAM cell to edit its value
- **Signal trace** — oscilloscope-style register history visualization
- **20 sample programs** — from Hello World to Bubble Sort to interactive Adder
- **Breakpoints** — click the gutter to set/remove, run stops at breakpoints
- **Step-back** — rewind execution one step at a time (256-step history)
- **Export/Import** — save and load programs as JSON

## Quick Start

```bash
cd web
npm install
npm run dev          # browser mode at localhost:5173
npm run electron:dev # desktop app mode
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
| `F5` | Run (Electron) |
| `F9` | Step back (Electron) |
| `F10` | Step (Electron) |

## Instruction Set Architecture

### ALU Operations (1 byte)

| Mnemonic | Opcode | Description |
|----------|--------|-------------|
| `ADD rA, rB` | 0x0 | rA = rA + rB, updates all flags |
| `SHR rA, rB` | 0x1 | rA = rA >> 1 (logical shift right) |
| `SHL rA, rB` | 0x2 | rA = rA << 1 (shift left) |
| `NOT rA` | 0x3 | rA = ~rA (bitwise NOT) |
| `AND rA, rB` | 0x4 | rA = rA & rB |
| `OR rA, rB` | 0x5 | rA = rA \| rB |
| `XOR rA, rB` | 0x6 | rA = rA ^ rB |
| `CMP rA, rB` | 0x7 | Compare rA vs rB — sets flags only, no register write |

### Memory & Data (2 bytes)

| Mnemonic | Opcode | Description |
|----------|--------|-------------|
| `LOAD rA, [addr]` | 0x8 | rA = RAM[addr] |
| `STORE rA, [addr]` | 0x9 | RAM[addr] = rA |
| `DATA rA, value` | 0xA | rA = immediate value (0–255) |

### Jumps (2 bytes) & I/O (1 byte)

| Mnemonic | Opcode | Description |
|----------|--------|-------------|
| `JMPR rA` | 0xB₀ | Jump to address stored in rA |
| `OUT rA` | 0xB₁ | Output rA value to console |
| `IN rA` | 0xB₂ | Pause execution, read user input into rA |
| `JMP label` | 0xC | Unconditional jump |
| `JC label` | 0xD | Jump if carry flag is set |
| `JA label` | 0xE | Jump if A > B (after CMP) |
| `JE label` | 0xF | Jump if A == B (after CMP) |
| `HALT` | 0x00 | Stop execution |

### Instruction Encoding

```
Single byte: [4-bit opcode][2-bit regA][2-bit regB]
Two-byte:    [4-bit opcode][2-bit regA][2-bit 00] [8-bit operand]
```

Registers: R0=00, R1=01, R2=10, R3=11

### Flags (set by ALU operations and CMP)

| Flag | Set when |
|------|----------|
| `carry` | Addition result > 255 |
| `a_larger` | regA > regB |
| `equal` | regA == regB |
| `zero` | Result == 0 |

### Number Formats

| Format | Example | Value |
|--------|---------|-------|
| Decimal | `42` | 42 |
| Hex | `0xFF` | 255 |
| Binary | `0b1010` | 10 |
| Character | `'A'` | 65 |
| Negative | `-1` | 255 (two's complement) |

## Architecture

```
web/
├── src/
│   ├── assembler.ts         # Two-pass assembler
│   ├── wasm-bridge.ts       # CPU engine (Mock JS + WASM interface)
│   ├── hooks/useComputer.ts # React state management
│   └── components/
│       ├── App.tsx           # Main layout + samples
│       ├── Toolbar.tsx       # Controls + speed
│       ├── CodeEditor.tsx    # Editor + disassembly + breakpoints
│       ├── CpuView.tsx       # Register display
│       ├── AluView.tsx       # ALU operation visualization
│       ├── BusView.tsx       # Data bus animation
│       ├── MemoryView.tsx    # RAM grid with click-to-edit
│       ├── ConsoleView.tsx   # Terminal-style I/O
│       ├── SignalTrace.tsx   # Register oscilloscope
│       └── HelpPanel.tsx     # Help overlay
├── electron/                 # Desktop app shell
└── build/                    # Icons
core/                         # Rust WASM engine (optional)
```

## Building

### Browser dev
```bash
cd web && npm run dev
```

### Electron dev
```bash
cd web && npm run electron:dev
```

### Windows installer
```bash
cd web && npm run build && npx electron-builder --win
```

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

## License

MIT
