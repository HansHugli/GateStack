# ⚡ GateStack — 8-Bit Computer Simulator

A hybrid **Rust/WASM + React** simulator that lets you **learn how CPUs work** while running programs at **real speed**.

Originally based on a gate-level C# implementation (SimpleComputer), redesigned with a behavioral Rust core for performance and a React frontend for rich visualization.

## Architecture

```
┌─────────────────────────────────────────────────┐
│            React Frontend (TypeScript)            │
│  ┌────────┐ ┌────────┐ ┌─────┐ ┌────────────┐  │
│  │CPU View│ │Mem Hex │ │ ALU │ │ Assembly   │  │
│  │Regs/Flg│ │256-byte│ │ SVG │ │ Editor     │  │
│  └────┬───┘ └────┬───┘ └──┬──┘ └─────┬──────┘  │
│       └──────────┴────────┴───────────┘          │
│                    │ JSON                         │
├────────────────────┼─────────────────────────────┤
│              wasm-bindgen bridge                  │
├────────────────────┼─────────────────────────────┤
│            Rust/WASM Core                        │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌───────┐ ┌───────┐  │
│  │ CPU │ │ ALU │ │ RAM │ │Control│ │ Trace │  │
│  │regs │ │8 ops│ │256B │ │decode │ │recorder│  │
│  └─────┘ └─────┘ └─────┘ └───────┘ └───────┘  │
└─────────────────────────────────────────────────┘
```

## Quick Start (Mock Mode — No Rust Required)

You can start developing the UI immediately without installing Rust:

```bash
cd web
npm install
npm run dev
# Open http://localhost:3000
```

The app runs with a built-in mock computer that simulates the CPU in TypeScript. Once you're ready to switch to the real WASM core, follow the full setup below.

## Desktop App (Electron)

### Development Mode
Run Vite dev server + Electron window together:
```bash
cd web
npm install
npm run electron:dev
```
Or use the script: `scripts\electron-dev.bat`

### Build Windows Installer
```bash
cd web
npm run build              # Build Vite production bundle
npm run electron:build:win # Package with electron-builder
```
Or use the script: `scripts\build.bat`

The installer (.exe) will be in `web/release/`.

### Build for Other Platforms
```bash
npm run electron:build:mac    # macOS .dmg
npm run electron:build:linux  # Linux AppImage
```

### Menu Shortcuts (Electron)
| Action | Shortcut |
|--------|----------|
| Step | F10 |
| Run | F5 |
| Pause | F6 |
| Reset | Ctrl+Shift+R |
| DevTools | Ctrl+Shift+I |
| Zoom In/Out | Ctrl+ / Ctrl- |

## Full Setup (with Rust/WASM)

### Prerequisites
- **Node.js** 18+ (you have this)
- **Rust** — install from https://rustup.rs
- **wasm-pack** — `cargo install wasm-pack`

### Windows (one-time setup)
```batch
scripts\setup.bat
```

### Manual Setup
```bash
# 1. Install Rust wasm target
rustup target add wasm32-unknown-unknown

# 2. Build the WASM core
cd core
wasm-pack build --target web --out-dir ../web/src/wasm

# 3. Install web dependencies
cd ../web
npm install

# 4. Start dev server
npm run dev
```

### Daily Development
```batch
scripts\dev.bat
```
This rebuilds WASM and starts the dev server.

## Project Structure

```
gatestack/
├── core/                    # Rust simulation engine
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs           # WASM entry + JS bindings
│       ├── alu.rs           # ALU: ADD, SHR, SHL, NOT, AND, OR, XOR, CMP
│       ├── cpu.rs           # CPU: registers, flags, instruction execution
│       ├── memory.rs        # RAM [u8; 256] + MAR
│       └── trace.rs         # Signal trace recorder for UI animation
│
├── web/                     # React frontend
│   ├── src/
│   │   ├── main.tsx
│   │   ├── wasm-bridge.ts   # TypeScript types + mock computer
│   │   ├── components/
│   │   │   ├── App.tsx      # Main dashboard layout
│   │   │   ├── CpuView.tsx  # Register & flag display
│   │   │   ├── MemoryView.tsx # Hex dump with highlighting
│   │   │   ├── AluView.tsx  # ALU gate diagram (animated SVG)
│   │   │   ├── BusView.tsx  # Bus data flow visualization
│   │   │   ├── Toolbar.tsx  # Step/Run/Pause/Reset/Speed
│   │   │   └── CodeEditor.tsx # Assembly editor
│   │   └── hooks/
│   │       └── useComputer.ts # React state management
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
│
├── scripts/
│   ├── setup.bat            # One-time Windows setup
│   ├── dev.bat              # Build WASM + start dev server
│   └── quickstart.bat       # Start in mock mode (no Rust)
│
└── README.md
```

## Instruction Set

| Opcode | Mnemonic | Description                  | Format          |
|--------|----------|------------------------------|-----------------|
| 0x0    | ADD      | Add RegA + RegB → RegA       | `ADD R0, R1`    |
| 0x1    | SHR      | Shift right                  | `SHR R0, R0`    |
| 0x2    | SHL      | Shift left                   | `SHL R0, R0`    |
| 0x3    | NOT      | Bitwise NOT                  | `NOT R0, R0`    |
| 0x4    | AND      | Bitwise AND                  | `AND R0, R1`    |
| 0x5    | OR       | Bitwise OR                   | `OR  R0, R1`    |
| 0x6    | XOR      | Bitwise XOR                  | `XOR R0, R1`    |
| 0x7    | CMP      | Compare (set flags)          | `CMP R0, R1`    |
| 0x8    | LOAD     | Load from RAM address        | `LOAD R0, addr` |
| 0x9    | STORE    | Store to RAM address         | `STORE R0, addr`|
| 0xA    | DATA     | Load immediate value         | `DATA R0, 42`   |
| 0xB    | JMPR     | Jump to address in register  | `JMPR R0`       |
| 0xC    | JMP      | Jump always                  | `JMP addr`      |
| 0xD    | JC       | Jump if carry flag set       | `JC addr`       |
| 0xE    | JA       | Jump if A > B                | `JA addr`       |
| 0xF    | JE       | Jump if equal                | `JE addr`       |

### Instruction Encoding (8-bit)

```
  7  6  5  4  3  2  1  0
 ┌──┬──┬──┬──┬──┬──┬──┬──┐
 │  OPCODE   │ REG_A │REG_B│
 └──┴──┴──┴──┴──┴──┴──┴──┘
  bits 7-4    bits 3-2  1-0
```

## Mapping from Original C# Code

| C# Class           | Rust Equivalent              | Notes                          |
|---------------------|------------------------------|--------------------------------|
| `AndGate`           | `&` operator                 | Native bitwise AND             |
| `OrGate`            | `\|` operator                | Native bitwise OR              |
| `XorGate`           | `^` operator                 | Native bitwise XOR             |
| `NotGate`           | `!` operator                 | Native bitwise NOT             |
| `NandGate`          | `!(a & b)`                   | Single expression              |
| `FullAdder`         | `+` with carry check         | One addition                   |
| `Adder8`            | `(a as u16) + (b as u16)`    | One addition                   |
| `ALU8`              | `alu.rs: alu_execute()`      | ~20 lines, 8 operations       |
| `Register8`         | `u8` field on CPU struct     | Just a number                  |
| `ByteGate8`         | Not needed                   | Register = byte variable       |
| `MemGate`           | Not needed                   | No gate-level latches          |
| `Enabler8`          | If-statement in step logic   | Conditional bus read           |
| `RAM256`            | `[u8; 256]`                  | 256 bytes vs ~90K objects      |
| `RAMRegister8`      | Array index                  | `ram[addr]`                    |
| `Decoder4x16`       | Array index                  | `ram[mar as usize]`            |
| `Byte8`             | `u8`                         | Native 8-bit type              |
| `ControlSection`    | `cpu.rs: step()` method      | State machine                  |
| `Stepper7`          | Fetch/Decode/Execute phases  | Sequential logic               |
| `Clock`             | `requestAnimationFrame`      | UI-driven timing               |
| `Bus8_1`            | Variable assignment           | `bus = value`                  |

## License

MIT
