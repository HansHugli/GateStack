# GateStack: working notes for Claude

GateStack is an educational 32-bit computer simulator: a Rust/WASM CPU core (`core/`), a React + TypeScript UI with an assembler and a JS engine (`web/`), and an Electron wrapper. The ISA spec is `REFERENCE.md` and `DESIGN-32BIT.md`.

The knowledge for this project lives in **Synora** (the `synora` MCP server), shared by every machine and session. It is not kept in this file or in private memory.

- **Before any work:** call `synora_rules_for` with project `gatestack` and follow what it returns: "Skill: work on GateStack" (build, the WASM step, checks, gaps, review findings) and the studio rules and skills. Call it again in a long session, because rules and skills change while you work.
- **Accuracy first:** the Rust core and the JS engine must give the same result for every program, and both must match `REFERENCE.md`. When you change one engine, change the other and the docs in the same piece of work, and add a test that runs on both.
- **Build the WASM first:** `web/src/wasm/` is gitignored. Run `cd web && npm run build:wasm` in a fresh checkout before `tsc` or `npm run build`.
- **Write what you learn back:** append fixes, gaps and lessons to the GateStack skill (`synora_append`), and record decisions and plans as entries in project `gatestack`. Keep Claude memory to pointers.
- **Show, don't just tell:** attach screenshots with `synora_attach`, and draw datapaths, pipelines and state machines in Mermaid.
- **Taking a feature from another simulator or a real CPU:** follow "Skill: REA, Reverse Engineer Anything".
- **Work for the Mac** goes through Synora work units and messages to HANS-PRO-MACBOOK.
