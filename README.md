# ⚡ GateStack — 16-Bit Computer Simulator

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
# Open http://localhost:5173
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
| Step Back | F9 |
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

## Features (v1.0)

- **19-instruction ISA** — ALU ops, memory access, jumps, conditionals, I/O
- **Console I/O** — `OUT` prints to terminal, `IN` reads user input with auto-resume
- **Visual debugger** — step, run, pause, step-back (256-step undo), breakpoints
- **Assembler** — two-pass with labels, hex/binary/decimal/char literals, comments
- **Memory editor** — click any RAM cell to edit its value inline
- **Signal trace** — oscilloscope-style register history waveforms
- **18 sample programs** — from Hello World to Bubble Sort to interactive Adder
- **Export/Import** — save and load programs as JSON
- **Help panel** — press `?` for inline ISA reference and keyboard shortcuts

See [REFERENCE.md](REFERENCE.md) for full ISA documentation.

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
│   │   ├── assembler.ts     # Two-pass assembler
│   │   ├── wasm-bridge.ts   # TypeScript types + mock computer
│   │   ├── components/
│   │   │   ├── App.tsx      # Main dashboard layout + 18 samples
│   │   │   ├── CpuView.tsx  # Register & flag display
│   │   │   ├── MemoryView.tsx # Hex dump with click-to-edit
│   │   │   ├── AluView.tsx  # ALU gate diagram (animated SVG)
│   │   │   ├── BusView.tsx  # Bus data flow visualization
│   │   │   ├── Toolbar.tsx  # Step/Back/Run/Pause/Reset/Speed
│   │   │   ├── CodeEditor.tsx # Assembly editor + disassembly + breakpoints
│   │   │   ├── ConsoleView.tsx # Terminal-style I/O console
│   │   │   ├── SignalTrace.tsx # Register oscilloscope waveforms
│   │   │   └── HelpPanel.tsx  # Help overlay (ISA ref + shortcuts)
│   │   └── hooks/
│   │       └── useComputer.ts # React state management
│   ├── electron/
│   │   ├── main.mjs         # Electron main process
│   │   └── preload.cjs      # Context bridge for IPC
│   ├── build/               # App icons (ico, png, svg)
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
│
├── scripts/
│   ├── setup.bat            # One-time Windows setup
│   ├── dev.bat              # Build WASM + start dev server
│   ├── build.bat            # Build Windows installer
│   ├── electron-dev.bat     # Start Electron dev mode
│   └── build-wasm.bat       # Compile Rust WASM core
│
├── README.md                # This file
└── REFERENCE.md             # ISA reference documentation
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
| `RAM256`            | `[u8; 256]`                  | 64KB vs ~90K objects      |
| `RAMRegister8`      | Array index                  | `ram[addr]`                    |
| `Decoder4x16`       | Array index                  | `ram[mar as usize]`            |
| `Byte8`             | `u8`                         | Native 16-bit type              |
| `ControlSection`    | `cpu.rs: step()` method      | State machine                  |
| `Stepper7`          | Fetch/Decode/Execute phases  | Sequential logic               |
| `Clock`             | `requestAnimationFrame`      | UI-driven timing               |
| `Bus8_1`            | Variable assignment           | `bus = value`                  |

## Inspired By

GateStack stands on the shoulders of two outstanding educational works:

- **J. Clark Scott** — *[But How Do It Know?](http://www.buthowdoitknow.com/)* — A beautifully clear, first-principles explanation of how a simple computer works, building from NAND gates through registers, RAM, ALU, and a control unit. GateStack's architecture and instruction set draw directly from Scott's design.

- **Noam Nisan & Shimon Schocken** — *[nand2tetris.org](https://www.nand2tetris.org/)* — The landmark course and textbook (*The Elements of Computing Systems*) that guides you through building a complete computer system from NAND gates to a high-level language. Its philosophy of learning by building deeply influenced GateStack's hands-on, visual approach.

## License

MIT
