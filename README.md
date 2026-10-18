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
│  │16reg│ │45 in│ │ RAM  │ │decode │            │
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

Without a WASM build the app runs on its built-in JavaScript engine, which simulates the same CPU in TypeScript. To use the faster Rust/WASM core (the default when it is available), follow the full setup below. `web/src/wasm/` is generated and not checked in, so a fresh clone needs `npm run build:wasm` before `npm run build` or `tsc`.

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

# 2. Install web dependencies and build the WASM core
cd web
npm install
npm run build:wasm

# 3. Start
npm run dev
```

### Tests and releases

From the repository root:

```bash
npm install
npm test           # Rust core tests, WASM build, vitest (assembler, samples, both engines in lockstep), tsc
npm run release    # conventional-commit release: bumps the version, writes CHANGELOG.md, tags
npm run ship       # release, build the Windows installer, push with tags
```

Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:` …). One version number covers the repo, `web/package.json` and the Rust crate.

## Features (ISA v2)

- **45-instruction ISA** — ALU ops, shifts (SHRN/SHLN), signed math (IDIV/IMOD), fixed-point multiply in 8.8 (FPMUL) and 16.16 (FPMUL16), memory access (byte and 32-bit), jumps, conditionals (JZ/JNZ), CALL/RET, I/O
- **Faults** — an illegal opcode or a 32-bit access past the end of RAM halts the CPU with a clear message
- **32-bit architecture** — 16 registers (R0–R15), 4MB RAM, 22-bit address space
- **Double-buffered video** — 256×256 8bpp display, 256-color programmable palette, hardware page flip on vsync
- **Dual engine** — Rust/WASM for speed, JavaScript fallback, switchable at runtime; a lockstep test keeps their results identical
- **Console I/O** — `OUT` prints to terminal, `IN` reads user input with auto-resume
- **Visual debugger** — step, run, pause, step-back (64-step undo), breakpoints
- **Data bus visualization** — animated SVG showing data flow between CPU components
- **ALU visualization** — real-time display of ALU operations and flags
- **Assembler** — two-pass with labels, hex/binary/decimal/char literals, DB/DW/DD value lists and strings, range checks, and error messages that say what was expected
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
0x3E0000–0x3E03FF  Palette RAM (1 KB)                 256 × (R, G, B, unused)
0x3E0400–0x3FFFFF  Reserved / IO                      Vsync: STORE to 0x3FFFFF
```

See [REFERENCE.md](REFERENCE.md) for full ISA documentation.

## Project Structure

```
gatestack/
├── core/                    # Rust WASM simulation engine
│   ├── Cargo.toml
│   └── src/
│       └── lib.rs           # 32-bit CPU: 16 regs, 4MB RAM, 45 opcodes, tests
│
├── web/                     # React frontend
│   ├── src/
│   │   ├── main.tsx
│   │   ├── assembler.ts     # Two-pass assembler (ISA v2 encoding)
│   │   ├── samples.ts       # The sample programs and their categories
│   │   ├── wasm-bridge.ts   # IComputer interface + JS engine + factory
│   │   ├── wasm-cpu.ts      # WASM engine wrapper
│   │   ├── wasm/            # wasm-pack output (generated, not checked in)
│   │   ├── *.test.ts        # vitest: assembler, samples, engines in lockstep
│   │   ├── components/
│   │   │   ├── App.tsx      # Main layout
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