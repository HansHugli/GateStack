# ⚡ GateStack — 32-Bit Computer Simulator

A hybrid **Rust/WASM + React** simulator that lets you **learn how CPUs work** while running programs at **real speed**.

Originally based on a gate-level C# implementation (SimpleComputer), redesigned with a behavioral Rust core for performance and a React frontend for rich visualization.

## Architecture

```
┌─────────────────────────────────────────────────┐
│            React Frontend (TypeScript)            │
│  ┌────────┐ ┌────────┐ ┌─────┐ ┌────────────┐  │
│  │CPU View│ │Mem Hex │ │Video│ │ Assembly   │  │
│  │16 Regs │ │  4 MB  │ │256² │ │ Editor     │  │
│  └────┬───┘ └────┬───┘ └──┬──┘ └─────┬──────┘  │
│       └──────────┴────────┴───────────┘          │
│                    │                              │
├────────────────────┼─────────────────────────────┤
│              wasm-bindgen bridge                  │
├────────────────────┼─────────────────────────────┤
│            Rust/WASM Core                        │
│  ┌─────┐ ┌─────┐ ┌──────┐ ┌───────┐            │
│  │ CPU │ │ ALU │ │ 4 MB │ │Control│            │
│  │16reg│ │44 op│ │ RAM  │ │decode │            │
│  └─────┘ └─────┘ └──────┘ └───────┘            │
└─────────────────────────────────────────────────┘
```

## Quick Start (JS Mode — No Rust Required)

```bash
cd web
npm install
npm run dev
# Open http://localhost:3000
```

The app runs with a built-in JavaScript engine that simulates the CPU in TypeScript. Once you're ready to switch to the real WASM core, follow the full setup below.

## Desktop App (Electron)

### Development Mode
```bash
cd web
npm install
npm run electron:dev
```

### Build Windows Installer
```bash
cd web
npm run electron:build:win
```

The installer (.exe) will be in `web/release/`.

### Menu Shortcuts (Electron)
| Action | Shortcut |
|--------|----------|
| Step | F10 |
| Step Back | F9 |
| Run | F5 |
| Pause | F6 |
| Reset | Ctrl+Shift+R |

## Full Setup (with Rust/WASM)

### Prerequisites
- **Node.js** 18+
- **Rust** — install from https://rustup.rs
- **wasm-pack** — `cargo install wasm-pack`

### Build & Run
```bash
# 1. Install Rust wasm target
rustup target add wasm32-unknown-unknown

# 2. Build the WASM core
cd core
wasm-pack build --target bundler --out-dir ../web/src/wasm --release

# 3. Install web dependencies & start
cd ../web
npm install
npm run dev
```

## Features (v2.0)

- **44-instruction ISA** — ALU ops, shifts (SHRN/SHLN), signed math (IDIV/IMOD), fixed-point multiply (FPMUL), memory access (byte and 32-bit), jumps, conditionals (JZ/JNZ), CALL/RET, I/O
- **32-bit architecture** — 16 registers (R0–R15), 4MB RAM, 22-bit address space
- **Double-buffered video** — 256×256 8bpp display, 256-color programmable palette, hardware page flip on vsync
- **Dual engine** — Rust/WASM for speed, JavaScript fallback, switchable at runtime
- **Console I/O** — `OUT` prints to terminal, `IN` reads user input with auto-resume
- **Visual debugger** — step, run, pause, step-back (64-step undo), breakpoints
- **Data bus visualization** — animated SVG showing data flow between CPU components
- **ALU visualization** — real-time display of ALU operations and flags
- **Assembler** — two-pass with labels, hex/binary/decimal/char literals, DB/DW/DD directives
- **Memory editor** — click any RAM cell to edit, quick-jump to Code/Stack/BackBuf/Video/Palette regions
- **Signal trace** — oscilloscope-style register history waveforms
- **Speed control** — 1 to MAX cycles/frame with time-budgeted execution
- **Categorized samples** — Basics, Arithmetic, Console I/O, Data Structures, Video (Mandelbrot, fractal zoom, bouncing ball)
- **Help panel** — press `?` for inline ISA reference and keyboard shortcuts
- **Desktop app** — Electron wrapper with native menus and keyboard shortcuts

## Memory Map

```
0x000000–0x3BFFFF  Program + Data + Stack (3,840 KB)  SP init: 0x3BFFFF
0x3C0000–0x3CFFFF  VRAM Back Buffer (64 KB)           Draw target
0x3D0000–0x3DFFFF  VRAM Front Buffer (64 KB)          Display source
0x3E0000–0x3E03FF  Palette RAM (1 KB)                 256 × RGBA
0x3E0400–0x3FFFFF  Reserved / IO                      Vsync: STORE to 0x3FFFFF
```

See [REFERENCE.md](REFERENCE.md) for full ISA documentation.

## Project Structure

```
gatestack/
├── core/                    # Rust WASM simulation engine
│   ├── Cargo.toml
│   └── src/
│       └── lib.rs           # 32-bit CPU: 16 regs, 4MB RAM, 44 opcodes
│
├── web/                     # React frontend
│   ├── src/
│   │   ├── main.tsx
│   │   ├── assembler.ts     # Two-pass assembler (v2.0 encoding)
│   │   ├── wasm-bridge.ts   # IComputer interface + JS engine + factory
│   │   ├── wasm-cpu.ts      # WASM engine wrapper
│   │   ├── wasm/            # wasm-pack output (generated)
│   │   ├── components/
│   │   │   ├── App.tsx      # Main layout + categorized sample programs
│   │   │   ├── CpuView.tsx  # Register & flag display (32-bit)
│   │   │   ├── MemoryView.tsx # Hex dump with 22-bit addresses
│   │   │   ├── VideoView.tsx  # 256×256 8bpp video (reads palette + front buffer)
│   │   │   ├── AluView.tsx  # ALU operation visualization
│   │   │   ├── BusView.tsx  # Data bus flow visualization
│   │   │   ├── Toolbar.tsx  # Controls + speed + engine toggle
│   │   │   ├── CodeEditor.tsx # Assembly editor + disassembly
│   │   │   ├── ConsoleView.tsx # Terminal-style I/O console
│   │   │   ├── SignalTrace.tsx # Register oscilloscope waveforms
│   │   │   └── HelpPanel.tsx  # Help overlay (ISA ref + shortcuts)
│   │   └── hooks/
│   │       └── useComputer.ts # React state management + engine switching
│   ├── electron/
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
│
├── scripts/
├── README.md                # This file
└── REFERENCE.md             # Full ISA reference documentation
```

## Inspired By

- **J. Clark Scott** — *[But How Do It Know?](http://www.buthowdoitknow.com/)* — A first-principles explanation of how a simple computer works, building from NAND gates up.
- **Noam Nisan & Shimon Schocken** — *[nand2tetris.org](https://www.nand2tetris.org/)* — Building a complete computer system from NAND gates to a high-level language.

## License

MIT