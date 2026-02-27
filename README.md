# ⚡ GateStack — 16-Bit Computer Simulator

A hybrid **Rust/WASM + React** simulator that lets you **learn how CPUs work** while running programs at **real speed**.

Originally based on a gate-level C# implementation (SimpleComputer), redesigned with a behavioral Rust core for performance and a React frontend for rich visualization.

## Architecture

```
┌─────────────────────────────────────────────────┐
│            React Frontend (TypeScript)            │
│  ┌────────┐ ┌────────┐ ┌─────┐ ┌────────────┐  │
│  │CPU View│ │Mem Hex │ │Video│ │ Assembly   │  │
│  │16 Regs │ │ 64 KB  │ │256² │ │ Editor     │  │
│  └────┬───┘ └────┬───┘ └──┬──┘ └─────┬──────┘  │
│       └──────────┴────────┴───────────┘          │
│                    │                              │
├────────────────────┼─────────────────────────────┤
│              wasm-bindgen bridge                  │
├────────────────────┼─────────────────────────────┤
│            Rust/WASM Core                        │
│  ┌─────┐ ┌─────┐ ┌──────┐ ┌───────┐            │
│  │ CPU │ │ ALU │ │64 KB │ │Control│            │
│  │16reg│ │33 op│ │ RAM  │ │decode │            │
│  └─────┘ └─────┘ └──────┘ └───────┘            │
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
wasm-pack build --target bundler --out-dir ../web/src/wasm --release

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

- **33-instruction ISA** — ALU ops (ADD, SUB, MUL, DIV, MOD, shifts, bitwise), memory access (LOAD, STORE, LDRI, STRI), jumps, conditionals, CALL/RET, I/O
- **16-bit architecture** — 16 registers, 64KB RAM, 256×256 4bpp video display
- **Dual engine** — Rust/WASM for speed, JavaScript fallback, switchable at runtime
- **Console I/O** — `OUT` prints to terminal, `IN` reads user input with auto-resume
- **Visual debugger** — step, run, pause, step-back (256-step undo), breakpoints
- **Assembler** — two-pass with labels, hex/binary/decimal/char literals, comments
- **Memory editor** — click any RAM cell to edit its value inline
- **Signal trace** — oscilloscope-style register history waveforms
- **Speed control** — 1 to MAX cycles/frame with time-budgeted execution
- **Sample programs** — from Hello World to Bubble Sort to Mandelbrot renderer
- **Export/Import** — save and load programs as JSON
- **Help panel** — press `?` for inline ISA reference and keyboard shortcuts
- **Desktop app** — Electron wrapper with native menus and keyboard shortcuts

See [REFERENCE.md](REFERENCE.md) for full ISA documentation.

## Project Structure

```
gatestack/
├── core/                    # Rust WASM simulation engine
│   ├── Cargo.toml
│   └── src/
│       └── lib.rs           # Complete 16-bit CPU: 16 regs, 64KB RAM, 33 opcodes
│
├── web/                     # React frontend
│   ├── src/
│   │   ├── main.tsx
│   │   ├── assembler.ts     # Two-pass assembler
│   │   ├── wasm-bridge.ts   # IComputer interface + JS engine + factory
│   │   ├── wasm-cpu.ts      # WASM engine wrapper
│   │   ├── wasm/            # wasm-pack output (generated)
│   │   ├── components/
│   │   │   ├── App.tsx      # Main dashboard layout + sample programs
│   │   │   ├── CpuView.tsx  # Register & flag display
│   │   │   ├── MemoryView.tsx # Hex dump with click-to-edit
│   │   │   ├── VideoDisplay.tsx # 256×256 4bpp video renderer
│   │   │   ├── AluView.tsx  # ALU gate diagram (animated SVG)
│   │   │   ├── BusView.tsx  # Bus data flow visualization
│   │   │   ├── Toolbar.tsx  # Step/Back/Run/Pause/Reset/Speed/Engine
│   │   │   ├── CodeEditor.tsx # Assembly editor + disassembly + breakpoints
│   │   │   ├── ConsoleView.tsx # Terminal-style I/O console
│   │   │   ├── SignalTrace.tsx # Register oscilloscope waveforms
│   │   │   └── HelpPanel.tsx  # Help overlay (ISA ref + shortcuts)
│   │   └── hooks/
│   │       └── useComputer.ts # React state management + engine switching
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

| C# Class           | Current Equivalent             | Notes                          |
|---------------------|-------------------------------|--------------------------------|
| `AndGate`           | `&` operator                  | Native bitwise AND             |
| `OrGate`            | `\|` operator                 | Native bitwise OR              |
| `XorGate`           | `^` operator                  | Native bitwise XOR             |
| `NotGate`           | `!` operator                  | Native bitwise NOT             |
| `NandGate`          | `!(a & b)`                    | Single expression              |
| `FullAdder`         | `+` with carry check          | One addition                   |
| `Adder8`            | `u32` add + mask              | 16-bit with overflow detect    |
| `ALU8`              | `run()` match block           | 33 operations                  |
| `Register8`         | `u16` field / `self.r[i]`     | 16-bit registers               |
| `ByteGate8`         | Not needed                    | Register = variable            |
| `MemGate`           | Not needed                    | No gate-level latches          |
| `Enabler8`          | If-statement in execution     | Conditional bus read           |
| `RAM256`            | `Vec<u8>` / `Uint8Array`      | 64KB                           |
| `RAMRegister8`      | Array index                   | `mem[addr]`                    |
| `Decoder4x16`       | Array index                   | `mem[addr as usize]`           |
| `Byte8`             | `u16` / `number`              | Native 16-bit type             |
| `ControlSection`    | `run()` loop                  | Inline decode + execute        |
| `Stepper7`          | Sequential execution          | No micro-steps in fast path    |
| `Clock`             | `requestAnimationFrame`       | UI-driven timing               |
| `Bus8_1`            | Variable assignment           | `r[ra] = result`              |

## Inspired By

GateStack stands on the shoulders of two outstanding educational works:

- **J. Clark Scott** — *[But How Do It Know?](http://www.buthowdoitknow.com/)* — A beautifully clear, first-principles explanation of how a simple computer works, building from NAND gates through registers, RAM, ALU, and a control unit. GateStack's architecture and instruction set draw directly from Scott's design.

- **Noam Nisan & Shimon Schocken** — *[nand2tetris.org](https://www.nand2tetris.org/)* — The landmark course and textbook (*The Elements of Computing Systems*) that guides you through building a complete computer system from NAND gates to a high-level language. Its philosophy of learning by building deeply influenced GateStack's hands-on, visual approach.

## License

MIT
