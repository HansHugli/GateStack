# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [4.1.0](https://github.com/HansHugli/GateStack/compare/v4.0.0...v4.1.0) (2026-10-18)

### Features

* **asm:** add the FPMUL16 mnemonic (opcode 0x2C) ([59bd1fc](https://github.com/HansHugli/GateStack/commit/59bd1fcd4c43322a7ea6701bae67e509f15b8a52))
* **core:** FPMUL16, a signed 16.16 fixed-point multiply (0x2C) ([189dd51](https://github.com/HansHugli/GateStack/commit/189dd5134e4f2a9233a92d9c79505181a9381be2))
* **samples:** Mandelbrot 16.16 using FPMUL16 ([b0c62db](https://github.com/HansHugli/GateStack/commit/b0c62db9b0ac9734356af86c78186a2676b917aa))

### Bug Fixes

* **asm:** strict, learner-friendly parsing with every error reported ([6ffda22](https://github.com/HansHugli/GateStack/commit/6ffda220eda5b3a54f425aeab1c32d9f7dbbf317))
* **core:** vsync, breakpoints, CMP, SHL8, 22-bit IAR/SP, faults and a 64-bit cycle counter ([22652cb](https://github.com/HansHugli/GateStack/commit/22652cb9e9ef7c23b05f59d48f27ff92293c0aef))
* **electron:** load the WASM engine, menu keys fire once, in-app About ([73cb862](https://github.com/HansHugli/GateStack/commit/73cb862c384d22c30ef466535dbf1a9949bae89d))
* **samples:** full 32-bit printing, correct comments and expected results ([87332c4](https://github.com/HansHugli/GateStack/commit/87332c4b2e83bf40bacfb40052c90e167d729c0a))
* **web:** JS engine matches the core; traces, snapshots and dispose() ([0d05ff4](https://github.com/HansHugli/GateStack/commit/0d05ff4b108de574667a97c5ab6a16fc5cf3269d))
* **web:** stale-code protection, autosave, run loop and accessibility ([bd09f67](https://github.com/HansHugli/GateStack/commit/bd09f670821464a944e14d0027d9a354804b3fda))
* **web:** the status bar counts undo steps, not trace samples ([be6d621](https://github.com/HansHugli/GateStack/commit/be6d621c1ea5a2472f61f9d3bf57c0dbb85ccccf))

### Refactoring

* **web:** move the sample programs out of App.tsx ([5d1d5a4](https://github.com/HansHugli/GateStack/commit/5d1d5a45f25469d98cba9c158dc4dd390e01a748))

### Documentation

* make REFERENCE.md the complete spec and mark DESIGN-32BIT.md historical ([377dabe](https://github.com/HansHugli/GateStack/commit/377dabea787d8c13fe0e9d80d3c10dfe1739e3c1))
* the stack at the edges of memory, and the real keyboard shortcuts ([63795cb](https://github.com/HansHugli/GateStack/commit/63795cb289df5201dc445b734a548964473e164c))

### Build System

* conventional releases, vitest, and the WASM target the app imports ([e0a4c7e](https://github.com/HansHugli/GateStack/commit/e0a4c7e0b56955f78dbc991a9a8335a21fd25005))
