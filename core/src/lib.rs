// ============================================================================
// lib.rs — WASM Entry Point & JavaScript Bridge
// ============================================================================
// This is the main file that wasm-bindgen uses to generate JavaScript bindings.
// Each `#[wasm_bindgen]` function becomes callable from your React code:
//
//   import init, { Computer } from './gatestack_core';
//   await init();  // Load the WASM module
//   const computer = new Computer();
//   computer.load_program(new Uint8Array([0xA0, 42]));
//   const trace = computer.step();  // Returns JSON string
//
// ============================================================================

// Declare our modules (Rust's way of connecting files)
pub mod alu;
pub mod cpu;
pub mod memory;
pub mod trace;

// Only include wasm_bindgen bindings when building for WASM
// (This allows `cargo test` to work without the WASM target)
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

use cpu::Cpu;

/// The main Computer object exposed to JavaScript.
/// This wraps the Cpu and provides a clean API for the React frontend.
#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
pub struct Computer {
    cpu: Cpu,
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
impl Computer {
    /// Create a new computer (called with `new Computer()` in JS)
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(constructor))]
    pub fn new() -> Computer {
        Computer {
            cpu: Cpu::new(),
        }
    }

    /// Load a program into RAM. Pass a Uint8Array from JavaScript.
    ///
    /// Usage in JS:
    ///   computer.load_program(new Uint8Array([0xA0, 42, 0xA4, 10, 0x01]));
    pub fn load_program(&mut self, program: &[u8]) {
        self.cpu.load_program(program);
    }

    /// Execute one instruction and return a JSON trace for the UI.
    ///
    /// Usage in JS:
    ///   const traceJson = computer.step();
    ///   const trace = JSON.parse(traceJson);
    ///   // trace.steps[] contains micro-operations to animate
    pub fn step(&mut self) -> String {
        let trace = self.cpu.step();
        serde_json::to_string(&trace).unwrap_or_else(|_| "{}".to_string())
    }

    /// Run multiple cycles at full speed. Returns cycles executed.
    /// Stops at breakpoints or when halted.
    ///
    /// Usage in JS:
    ///   const cyclesRan = computer.run(10000); // Run up to 10K cycles
    pub fn run(&mut self, max_cycles: u32) -> u32 {
        self.cpu.run(max_cycles as u64) as u32
    }

    /// Get the full CPU state as JSON (for the dashboard display).
    ///
    /// Usage in JS:
    ///   const state = JSON.parse(computer.get_state());
    ///   console.log(state.r[0]); // R0 value
    pub fn get_state(&self) -> String {
        serde_json::to_string(&self.cpu).unwrap_or_else(|_| "{}".to_string())
    }

    /// Get a slice of RAM as a JavaScript-friendly byte array.
    /// Returns JSON array of numbers.
    pub fn get_memory(&self, start: u8, len: u8) -> String {
        let slice = self.cpu.ram.slice(start, len);
        serde_json::to_string(slice).unwrap_or_else(|_| "[]".to_string())
    }

    /// Get all 256 bytes of RAM as JSON array.
    pub fn get_all_memory(&self) -> String {
        serde_json::to_string(self.cpu.ram.data()).unwrap_or_else(|_| "[]".to_string())
    }

    /// Reset CPU (keep RAM contents)
    pub fn reset(&mut self) {
        self.cpu.reset();
    }

    /// Hard reset (clear everything including RAM)
    pub fn hard_reset(&mut self) {
        self.cpu.hard_reset();
    }

    /// Add a breakpoint at an address
    pub fn add_breakpoint(&mut self, addr: u8) {
        self.cpu.add_breakpoint(addr);
    }

    /// Remove a breakpoint
    pub fn remove_breakpoint(&mut self, addr: u8) {
        self.cpu.remove_breakpoint(addr);
    }

    /// Check if CPU is halted
    pub fn is_halted(&self) -> bool {
        self.cpu.halted
    }

    /// Get current program counter (IAR)
    pub fn get_pc(&self) -> u8 {
        self.cpu.iar
    }

    /// Get cycle count
    pub fn get_cycle_count(&self) -> u32 {
        self.cpu.cycle_count as u32
    }

    /// Get a specific register value (0-3)
    pub fn get_register(&self, index: u8) -> u8 {
        if index < 4 { self.cpu.r[index as usize] } else { 0 }
    }

    /// Write to a specific RAM address (for debugging/editing)
    pub fn poke(&mut self, address: u8, value: u8) {
        self.cpu.ram.set_mar(address);
        self.cpu.ram.write(value);
    }
}
