# ⚡ GateStack — 8-Bit Computer Simulator

A desktop application that lets you **learn how CPUs work** by stepping through instructions, watching registers change, and visualizing data flow — all on a simulated 8-bit processor with 256 bytes of RAM.

Built with **Electron + React + TypeScript** for the UI and an optional **Rust/WASM** core (currently experimental). Originally based on a gate-level C# implementation (SimpleComputer), redesigned for rich visualization and interactivity.

![Dark Theme](https://img.shields.io/badge/theme-dark-0a0e1a)
![Platform](https://img.shields.io/badge/platform-Windows-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

- **11 sample programs** — Add, Count, Fibonacci, Shift, Logic, Multiply, Division, String, Sort, Stack, Flags
- **Assembler with label support** — write assembly with labels like `loop:` and `JMP loop`
- **Step-by-step execution** — watch each instruction fetch, decode, and execute
- **Signal trace oscilloscope** — real-time register value graphs
- **Bus visualization** — animated SVG showing data flow between CPU components
- **ALU visualization** — see inputs, operation, and result with flag indicators
- **Memory hex dump** — 256-byte RAM with PC highlighting and ASCII display
- **Save/Load .asm files** — export and import assembly programs
- **Speed control** — logarithmic slider from 1 to 10,000 cycles per frame
- **Keyboard shortcuts** — S(tep), R(un), P(ause), Ctrl+Enter to assemble

## Architecture

```
┌──────────────────────────────────────────────────┐
│            Electron Desktop Shell                 │
│  ┌──────────────────────────────────────────┐    │
│  │         React Frontend (TypeScript)       │    │
│  │  ┌────────┐ ┌────────┐ ┌─────────────┐  │    │
│  │  │CPU View│ │Mem Hex │ │ Code Editor  │  │    │
│  │  │Regs/Flg│ │256-byte│ │ + Assembler  │  │    │
│  │  ├────────┤ ├────────┤ ├─────────────┤  │    │
│  │  │ALU View│ │Bus View│ │Signal Trace  │  │    │
│  │  └────┬───┘ └────┬───┘ └──────┬──────┘  │    │
│  │       └──────────┴────────────┘           │    │
│  │                   │ IComputer interface    │    │
│  │            ┌──────┴──────┐                │    │
│  │            │ wasm-bridge │                │    │
│  │       ┌────┴────┐ ┌─────┴─────┐         │    │
│  │       │  Mock JS │ │ Rust/WASM │         │    │
│  │       │ (active) │ │  (future) │         │    │
│  │       └─────────┘ └───────────┘         │    │
│  └──────────────────────────────────────────┘    │
└──────────────────────────────────────────────────┘
```

The **IComputer interface** in `wasm-bridge.ts` abstracts the execution engine. Currently the **MockComputer** (pure TypeScript) is active and fully functional. The Rust/WASM core compiles but has serialization issues (see [WASM Status](#wasm-core-status) below).

## Quick Start

```bash
cd web
npm install
npm run dev          # Browser at http://localhost:3000
# or
npm run electron:dev # Desktop window
```

No Rust required — the JavaScript engine handles everything.

## Desktop App (Electron)

### Development
```bash
cd web
npm install
npm run electron:dev
```
Or: `scripts\electron-dev.bat`

### Build Windows Installer
```bash
cd web
npm run build              # Vite production bundle
npm run electron:build:win # electron-builder → .exe
```
Or: `scripts\build.bat`

The installer will be in `web/release/`.

### Keyboard Shortcuts

| Action | Key | Electron Menu |
|--------|-----|---------------|
| Step | S | F10 |
| Run | R | F5 |
| Pause | P / Esc | F6 |
| Assemble | Ctrl+Enter | — |
| Reset | — | Ctrl+Shift+R |
| DevTools | — | Ctrl+Shift+I |

## Project Structure

```
gatestack/
├── core/                        # Rust WASM engine (experimental)
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs               # WASM entry + JS bindings
│       ├── alu.rs               # ALU: 8 operations
│       ├── cpu.rs               # CPU: registers, step(), step_fast()
│       ├── memory.rs            # RAM: Vec<u8> 256 bytes + MAR
│       └── trace.rs             # Signal trace recorder
│
├── web/                         # Electron + React frontend
│   ├── src/
│   │   ├── main.tsx
│   │   ├── wasm-bridge.ts       # IComputer interface + MockComputer + WasmComputer
│   │   ├── assembler.ts         # Assembler with label support
│   │   ├── components/
│   │   │   ├── App.tsx          # Main layout + sample programs
│   │   │   ├── CpuView.tsx      # Register & flag display
│   │   │   ├── MemoryView.tsx   # Hex dump with PC highlight
│   │   │   ├── AluView.tsx      # ALU SVG diagram
│   │   │   ├── BusView.tsx      # Bus data flow SVG
│   │   │   ├── Toolbar.tsx      # Controls + speed slider
│   │   │   ├── CodeEditor.tsx   # Assembly editor + save/load
│   │   │   └── SignalTrace.tsx  # Register value oscilloscope
│   │   └── hooks/
│   │       └── useComputer.ts   # React state management
│   ├── electron/
│   │   ├── main.mjs             # Electron main process
│   │   └── preload.mjs          # Preload script (file I/O)
│   ├── build/                   # App icons (.ico, .png, .svg)
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
│
├── scripts/
│   ├── setup.bat                # One-time Windows setup
│   ├── dev.bat                  # Start dev server
│   ├── build.bat                # Build installer
│   ├── build-wasm.bat           # Compile Rust → WASM
│   └── electron-dev.bat         # Electron dev mode
│
└── README.md
```

## Instruction Set

| Opcode | Mnemonic | Description                  | Format           |
|--------|----------|------------------------------|------------------|
| 0x0    | ADD      | Add RegA + RegB → RegA       | `ADD R0, R1`     |
| 0x1    | SHR      | Shift right                  | `SHR R0, R0`     |
| 0x2    | SHL      | Shift left                   | `SHL R0, R0`     |
| 0x3    | NOT      | Bitwise NOT                  | `NOT R0, R0`     |
| 0x4    | AND      | Bitwise AND                  | `AND R0, R1`     |
| 0x5    | OR       | Bitwise OR                   | `OR  R0, R1`     |
| 0x6    | XOR      | Bitwise XOR                  | `XOR R0, R1`     |
| 0x7    | CMP      | Compare (flags only)         | `CMP R0, R1`     |
| 0x8    | LOAD     | Load from RAM address        | `LOAD R0, addr`  |
| 0x9    | STORE    | Store to RAM address         | `STORE R0, addr` |
| 0xA    | DATA     | Load immediate value         | `DATA R0, 42`    |
| 0xB    | JMPR     | Jump to address in register  | `JMPR R0`        |
| 0xC    | JMP      | Jump always                  | `JMP label`      |
| 0xD    | JC       | Jump if carry flag set       | `JC label`       |
| 0xE    | JA       | Jump if A > B                | `JA label`       |
| 0xF    | JE       | Jump if equal                | `JE label`       |

**HALT convention:** instruction byte `0x00` (ADD R0, R0) is treated as HALT.

### Instruction Encoding (8-bit)

```
  7  6  5  4  3  2  1  0
 ┌──┬──┬──┬──┬──┬──┬──┬──┐
 │  OPCODE   │ REG_A │REG_B│
 └──┴──┴──┴──┴──┴──┴──┴──┘
  bits 7-4    bits 3-2  1-0
```

Two-byte instructions (LOAD, STORE, DATA, JMP, JC, JA, JE) have their operand in the next byte.

### Assembler Features

- **Labels** — `loop: ADD R0, R1` and `JMP loop`
- **Hex literals** — `DATA R0, 0xFF`
- **Comments** — `; this is a comment`
- **HALT pseudo-instruction** — assembles to `0x00`
- **Error reporting** — line numbers and descriptive messages

## WASM Core Status

The Rust core (`core/`) compiles to WASM via `wasm-pack` but is **currently disabled** in the app due to serialization issues between Rust's serde JSON output and the TypeScript frontend.

### What Works
- Rust compiles with `wasm-pack build --target web`
- CPU execution logic is correct (step, run, ALU, memory, flags)
- `step_fast()` provides zero-allocation execution for Run mode

### Known Issues

These are the problems encountered during WASM integration, documented here for future reference:

#### 1. Serde Array Limitation
**Problem:** `[u8; 256]` doesn't implement `Serialize`/`Deserialize` — serde only supports arrays up to 32 elements by default.
**Fix applied:** Changed `Ram.data` from `[u8; 256]` to `Vec<u8>`.

#### 2. wasm-bindgen Borrow Poisoning
**Problem:** If any `&mut self` method panics (e.g. hitting `unreachable!()`), wasm-bindgen permanently marks the object as "borrowed mutably." Every subsequent call fails with:
```
Error: recursive use of an object detected which would lead to unsafe aliasing in rust
```
The WASM `Computer` object becomes permanently unusable — no recovery without page reload.

**Lesson:** Never use `unreachable!()`, `panic!()`, or `.unwrap()` on fallible paths in WASM-facing code. Use graceful fallbacks instead.

**Fix applied:** Replaced all `unreachable!()` with explicit match arms. Added `corrupted` flag in `WasmComputer` JS adapter to detect and prevent cascading errors.

#### 3. Match Guard Exhaustiveness
**Problem:** Rust's `match` with guard patterns like `op if op.is_alu() => { ... }` doesn't satisfy the exhaustiveness checker, requiring a catch-all `_ => unreachable!()` arm. In WASM, this catch-all can actually be reached due to how wasm-bindgen handles enums.

**Fix applied:** Replaced guard-based matching with explicit enum variant listing:
```rust
// Bad — unreachable!() kills WASM permanently
match opcode {
    op if op.is_alu() => { /* ... */ }
    Opcode::Load => { /* ... */ }
    _ => unreachable!(),  // 💀 panics in WASM
}

// Good — explicit arms, no catch-all needed
match opcode {
    Opcode::Add | Opcode::Shr | Opcode::Shl | Opcode::Not |
    Opcode::And | Opcode::Or  | Opcode::Xor | Opcode::Cmp => { /* ... */ }
    Opcode::Load => { /* ... */ }
    // ... all variants listed
}
```

#### 4. u64 ↔ JavaScript Interop
**Problem:** Rust `u64` becomes JavaScript `BigInt` via wasm-bindgen. BigInt is not a regular number — `BigInt(100) + 1` throws. Functions accepting `u64` also require `BigInt` arguments.

**Fix applied:** Changed `run()` and `get_cycle_count()` return types from `u64` to `u32` in `lib.rs`.

#### 5. JSON Serialization Control Characters
**Problem:** `serde_json` output for Rust enums like `BusSource::Reg(RegId::R0)` may include characters that `JSON.parse()` rejects. The trace `CycleTrace` struct contains nested enums, Strings, and Vecs that serialize to complex JSON.

**Status:** Unresolved. Needs custom serialization or a simpler data transfer format (e.g. flat arrays instead of JSON).

#### 6. CMP Instruction Behavior
**Problem:** The CMP instruction was writing the ALU result (XOR) back to RegA. CMP should only update flags, not modify registers.

**Fix applied:** Added `if opcode != Opcode::Cmp` guard before register writeback in both `step()` and `step_fast()`.

#### 7. Windows Rust Toolchain Setup
**Problem:** Even when targeting `wasm32-unknown-unknown`, `proc-macro` crates (used by `serde`) compile for the host machine first, requiring a native linker.
- GNU toolchain → needs `dlltool.exe` (MinGW)
- MSVC toolchain → needs `link.exe` (Visual Studio)

**Solution:** Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the "Desktop development with C++" workload. Use the MSVC toolchain (`rustup default stable-x86_64-pc-windows-msvc`).

### Re-enabling WASM

To test the WASM core (experimental):

1. Install prerequisites: Rust, Visual Studio Build Tools (C++ workload), wasm-pack
2. Run `scripts\build-wasm.bat`
3. In `web/src/wasm-bridge.ts`, uncomment the WASM import block in `createComputer()`
4. Restart dev server

The remaining work to make WASM production-ready:
- Fix JSON serialization of `CycleTrace` (custom serde or switch to flat binary format)
- Write Rust unit tests that verify JSON output matches TypeScript `CpuState` / `CycleTrace` types
- Test all 11 sample programs through the WASM engine
- Add WASM-side integration tests with `wasm-bindgen-test`

## Mapping from Original C# Code

| C# Class           | GateStack Equivalent           | Notes                          |
|---------------------|-------------------------------|--------------------------------|
| `AndGate`           | `&` operator                  | Native bitwise AND             |
| `OrGate`            | `\|` operator                 | Native bitwise OR              |
| `XorGate`           | `^` operator                  | Native bitwise XOR             |
| `NotGate`           | `!` operator                  | Native bitwise NOT             |
| `FullAdder`         | `+` with carry check          | One addition                   |
| `Adder8`            | `(a as u16) + (b as u16)`     | One addition                   |
| `ALU8`              | `alu_execute()` / mock switch | ~20 lines, 8 operations       |
| `Register8`         | `u8` field                    | Just a number                  |
| `RAM256`            | `number[]` / `Vec<u8>`        | 256 bytes vs ~90K objects      |
| `ControlSection`    | `step()` method               | State machine                  |
| `Stepper7`          | Fetch/Decode/Execute phases   | Sequential logic               |
| `Clock`             | `requestAnimationFrame`       | UI-driven timing               |
| `Bus8_1`            | Variable assignment           | `bus = value`                  |

## Tech Stack

- **Electron** — desktop shell with native file dialogs
- **React 18** — UI components with inline styles
- **TypeScript** — type safety across the frontend
- **Vite** — fast dev server and production builds
- **electron-builder** — Windows/macOS/Linux packaging
- **Rust** (optional) — WASM core for future performance
- **wasm-pack** (optional) — Rust → WASM compilation

## License

MIT
