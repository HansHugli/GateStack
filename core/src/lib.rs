// ============================================================================
// GateStack WASM Core — 16-bit CPU with 16 registers, 64KB RAM
// ============================================================================
// Exposes memory as a shared buffer so TypeScript can read video RAM directly.
// The `run()` method is the hot path — no allocations, pure computation.
//
// Build:
//   cd core
//   wasm-pack build --target web --out-dir ../web/src/wasm
//
// Usage in TypeScript:
//   import init, { WasmCpu } from './wasm/gatestack_core';
//   await init();
//   const cpu = new WasmCpu();
//   cpu.load_program(bytes);
//   cpu.run(1_000_000);
//   const ptr = cpu.memory_ptr();  // Direct access to 64KB
// ============================================================================

use wasm_bindgen::prelude::*;

const MEM_SIZE: usize = 65536;

// Opcodes — must match wasm-bridge.ts exactly
const HALT:  u8 = 0x00;
const ADD:   u8 = 0x01;
const SUB:   u8 = 0x02;
const MUL:   u8 = 0x03;
const DIV:   u8 = 0x04;
const MOD:   u8 = 0x05;
const SHR:   u8 = 0x06;
const SHL:   u8 = 0x07;
const NOT:   u8 = 0x08;
const AND:   u8 = 0x09;
const OR:    u8 = 0x0A;
const XOR:   u8 = 0x0B;
const CMP:   u8 = 0x0C;
const MULH:  u8 = 0x0D;
const MOV:   u8 = 0x0E;
const SHR8:  u8 = 0x0F;
const LOAD:  u8 = 0x10;
const STORE: u8 = 0x11;
const DATA:  u8 = 0x12;
const PUSH:  u8 = 0x13;
const POP:   u8 = 0x14;
const LDRI:  u8 = 0x15;
const STRI:  u8 = 0x16;
const SHL8:  u8 = 0x17;
const JMP:   u8 = 0x18;
const JC:    u8 = 0x19;
const JA:    u8 = 0x1A;
const JE:    u8 = 0x1B;
const JMPR:  u8 = 0x1C;
const CALL:  u8 = 0x1D;
const RET:   u8 = 0x1E;
const OUT:   u8 = 0x1F;
const IN:    u8 = 0x20;

const VSYNC_ADDR: u16 = 0xDFFF;
const INIT_SP: u16 = 0x7FFF;

#[wasm_bindgen]
pub struct WasmCpu {
    mem: Vec<u8>,
    r: [u16; 16],
    iar: u16,
    sp: u16,
    cycle_count: u32,
    // Flags
    carry: bool,
    a_larger: bool,
    equal: bool,
    zero: bool,
    // State
    halted: bool,
    input_waiting: bool,
    input_register: u8,
    // Console output buffer (read and cleared by JS)
    console_buf: Vec<u8>,
    // Breakpoints (up to 64)
    breakpoints: Vec<u16>,
    num_breakpoints: usize,
    // When true, STORE to 0xDFFF does not break execution
    skip_vsync: bool,
}

#[wasm_bindgen]
impl WasmCpu {
    #[wasm_bindgen(constructor)]
    pub fn new() -> WasmCpu {
        WasmCpu {
            mem: vec![0u8; MEM_SIZE],
            r: [0u16; 16],
            iar: 0,
            sp: INIT_SP,
            cycle_count: 0,
            carry: false,
            a_larger: false,
            equal: false,
            zero: true,
            halted: false,
            input_waiting: false,
            input_register: 0,
            console_buf: Vec::with_capacity(256),
            breakpoints: Vec::with_capacity(64),
            num_breakpoints: 0,
            skip_vsync: false,
        }
    }

    // ── Memory access ────────────────────────────────────────────────────

    /// Pointer to the 64KB memory buffer (for zero-copy access from JS)
    #[wasm_bindgen]
    pub fn memory_ptr(&self) -> *const u8 {
        self.mem.as_ptr()
    }

    /// Size of memory (always 65536)
    #[wasm_bindgen]
    pub fn memory_size(&self) -> usize {
        MEM_SIZE
    }

    /// Load a program into memory at address 0
    #[wasm_bindgen]
    pub fn load_program(&mut self, program: &[u8]) {
        let len = program.len().min(MEM_SIZE);
        self.mem[..len].copy_from_slice(&program[..len]);
    }

    /// Write a single byte to memory
    #[wasm_bindgen]
    pub fn poke(&mut self, addr: u16, value: u8) {
        self.mem[addr as usize] = value;
    }

    /// Read a single byte from memory
    #[wasm_bindgen]
    pub fn peek(&self, addr: u16) -> u8 {
        self.mem[addr as usize]
    }

    // ── State access ─────────────────────────────────────────────────────

    #[wasm_bindgen]
    pub fn get_iar(&self) -> u16 { self.iar }

    #[wasm_bindgen]
    pub fn get_sp(&self) -> u16 { self.sp }

    #[wasm_bindgen]
    pub fn get_cycle_count(&self) -> u32 { self.cycle_count }

    #[wasm_bindgen]
    pub fn is_halted(&self) -> bool { self.halted }

    #[wasm_bindgen]
    pub fn is_input_waiting(&self) -> bool { self.input_waiting }

    #[wasm_bindgen]
    pub fn get_input_register(&self) -> u8 { self.input_register }

    #[wasm_bindgen]
    pub fn get_register(&self, i: u8) -> u16 {
        self.r[(i & 0x0F) as usize]
    }

    #[wasm_bindgen]
    pub fn get_carry(&self) -> bool { self.carry }
    #[wasm_bindgen]
    pub fn get_a_larger(&self) -> bool { self.a_larger }
    #[wasm_bindgen]
    pub fn get_equal(&self) -> bool { self.equal }
    #[wasm_bindgen]
    pub fn get_zero(&self) -> bool { self.zero }

    // ── State setters (for snapshot restore) ────────────────────────────

    #[wasm_bindgen]
    pub fn set_register(&mut self, i: u8, val: u16) {
        self.r[(i & 0x0F) as usize] = val;
    }

    #[wasm_bindgen]
    pub fn set_iar(&mut self, val: u16) { self.iar = val; }

    #[wasm_bindgen]
    pub fn set_sp(&mut self, val: u16) { self.sp = val; }

    #[wasm_bindgen]
    pub fn set_cycle_count(&mut self, val: u32) { self.cycle_count = val; }

    #[wasm_bindgen]
    pub fn set_halted(&mut self, val: bool) { self.halted = val; }

    #[wasm_bindgen]
    pub fn set_flags(&mut self, carry: bool, a_larger: bool, equal: bool, zero: bool) {
        self.carry = carry;
        self.a_larger = a_larger;
        self.equal = equal;
        self.zero = zero;
    }

    /// Provide input value (resume from IN instruction)
    #[wasm_bindgen]
    pub fn provide_input(&mut self, value: u16) {
        if self.input_waiting {
            self.r[self.input_register as usize] = value;
            self.input_waiting = false;
            // Advance past the IN instruction
            self.iar = self.iar.wrapping_add(2);
            self.cycle_count += 1;
        }
    }

    // ── Console ──────────────────────────────────────────────────────────

    /// Get console output and clear buffer
    #[wasm_bindgen]
    pub fn drain_console(&mut self) -> Vec<u8> {
        let out = self.console_buf.clone();
        self.console_buf.clear();
        out
    }

    #[wasm_bindgen]
    pub fn console_len(&self) -> usize {
        self.console_buf.len()
    }

    // ── Breakpoints ──────────────────────────────────────────────────────

    #[wasm_bindgen]
    pub fn add_breakpoint(&mut self, addr: u16) {
        if !self.breakpoints.contains(&addr) {
            self.breakpoints.push(addr);
            self.num_breakpoints = self.breakpoints.len();
        }
    }

    #[wasm_bindgen]
    pub fn remove_breakpoint(&mut self, addr: u16) {
        self.breakpoints.retain(|&a| a != addr);
        self.num_breakpoints = self.breakpoints.len();
    }

    #[wasm_bindgen]
    pub fn clear_breakpoints(&mut self) {
        self.breakpoints.clear();
        self.num_breakpoints = 0;
    }

    #[wasm_bindgen]
    pub fn set_skip_vsync(&mut self, skip: bool) {
        self.skip_vsync = skip;
    }

    // ── Reset ────────────────────────────────────────────────────────────

    #[wasm_bindgen]
    pub fn reset(&mut self) {
        self.r = [0u16; 16];
        self.iar = 0;
        self.sp = INIT_SP;
        self.cycle_count = 0;
        self.carry = false;
        self.a_larger = false;
        self.equal = false;
        self.zero = true;
        self.halted = false;
        self.input_waiting = false;
        self.console_buf.clear();
    }

    #[wasm_bindgen]
    pub fn hard_reset(&mut self) {
        self.reset();
        for b in self.mem.iter_mut() { *b = 0; }
    }

    // ── Execution — the hot path (unsafe-optimized) ──────────────────────

    /// Execute up to max_cycles instructions. Returns number actually executed.
    /// Stops on: HALT, breakpoint, vsync (STORE to 0xDFFF), or IN.
    ///
    /// SAFETY: Uses unsafe pointer access to skip bounds checks.
    /// All memory accesses use u16 indices into a 65536-byte buffer.
    /// All register accesses use (x & 0x0F) indices into a 16-element array.
    /// These are guaranteed in-bounds by the type system.
    #[wasm_bindgen]
    pub fn run(&mut self, max_cycles: u32) -> u32 {
        // Raw pointers for zero-overhead memory access
        let mem = self.mem.as_mut_ptr();
        let r = self.r.as_mut_ptr();

        let mut iar = self.iar;
        let mut sp = self.sp;
        let mut f_carry = self.carry;
        let mut f_a_larger = self.a_larger;
        let mut f_equal = self.equal;
        let mut f_zero = self.zero;
        let mut executed: u32 = 0;
        let mut console_out: Vec<u8> = Vec::new();

        // Cache breakpoint state
        let has_bp = self.num_breakpoints > 0;

        unsafe {
        for _ in 0..max_cycles {
            if self.halted || self.input_waiting { break; }
            if executed > 0 && has_bp && self.breakpoints.contains(&iar) { break; }

            let addr = iar as usize;
            let opcode = *mem.add(addr);
            let reg_byte = *mem.add((addr + 1) & 0xFFFF);
            let ra = ((reg_byte >> 4) & 0x0F) as usize;
            let rb = (reg_byte & 0x0F) as usize;

            // HALT
            if opcode == HALT {
                self.halted = true;
                break;
            }

            // Instruction size
            let size: u16 = match opcode {
                LOAD | STORE | DATA => 4,
                JMP | JC | JA | JE | CALL => 3,
                _ => 2,
            };
            iar = iar.wrapping_add(size);

            // ── ALU (0x01-0x0F, 0x17) ──
            if (opcode >= ADD && opcode <= SHR8) || opcode == SHL8 {
                let a = *r.add(ra) as u32;
                let b = *r.add(rb) as u32;
                let mut result: u32 = 0;
                let mut carry = false;

                match opcode {
                    ADD  => { let s = a + b; result = s & 0xFFFF; carry = s > 0xFFFF; }
                    SUB  => { result = a.wrapping_sub(b) & 0xFFFF; carry = a < b; }
                    MUL  => { let s = a * b; result = s & 0xFFFF; carry = s > 0xFFFF; }
                    MULH => { result = ((a * b) >> 16) & 0xFFFF; }
                    DIV  => { result = if b == 0 { 0 } else { (a / b) & 0xFFFF }; }
                    MOD  => { result = if b == 0 { 0 } else { (a % b) & 0xFFFF }; }
                    SHR  => { result = a >> 1; carry = (a & 1) != 0; }
                    SHL  => { let s = a << 1; result = s & 0xFFFF; carry = s > 0xFFFF; }
                    NOT  => { result = (!a) & 0xFFFF; }
                    AND  => { result = a & b; }
                    OR   => { result = a | b; }
                    XOR  => { result = a ^ b; }
                    CMP  => { result = a; }
                    MOV  => { result = b; }
                    SHR8 => { result = (a >> 8) & 0xFF; carry = (a & 0x80) != 0; }
                    SHL8 => { result = (a << 8) & 0xFFFF; carry = (a & 0x80) != 0; }
                    _    => {}
                }

                f_carry = carry;
                f_a_larger = a > b;
                f_equal = a == b;
                f_zero = (result & 0xFFFF) == 0;

                if opcode != CMP {
                    *r.add(ra) = result as u16;
                }
            }

            // ── LOAD rA, [addr16] ──
            else if opcode == LOAD {
                let m_addr = *mem.add((addr + 2) & 0xFFFF) as u16
                           | ((*mem.add((addr + 3) & 0xFFFF) as u16) << 8);
                *r.add(ra) = *mem.add(m_addr as usize) as u16;
            }

            // ── STORE rA, [addr16] ──
            else if opcode == STORE {
                let m_addr = *mem.add((addr + 2) & 0xFFFF) as u16
                           | ((*mem.add((addr + 3) & 0xFFFF) as u16) << 8);
                *mem.add(m_addr as usize) = (*r.add(ra) & 0xFF) as u8;
                if m_addr == VSYNC_ADDR && executed > 0 && !self.skip_vsync {
                    self.cycle_count += 1;
                    executed += 1;
                    break;
                }
            }

            // ── DATA rA, imm16 ──
            else if opcode == DATA {
                *r.add(ra) = *mem.add((addr + 2) & 0xFFFF) as u16
                           | ((*mem.add((addr + 3) & 0xFFFF) as u16) << 8);
            }

            // ── LDRI rA, rB ──
            else if opcode == LDRI {
                *r.add(ra) = *mem.add(*r.add(rb) as usize) as u16;
            }

            // ── STRI rA, rB ──
            else if opcode == STRI {
                *mem.add(*r.add(rb) as usize) = (*r.add(ra) & 0xFF) as u8;
            }

            // ── PUSH rA ──
            else if opcode == PUSH {
                let val = *r.add(ra);
                let lo = sp.wrapping_sub(1) as usize;
                *mem.add(lo & 0xFFFF) = (val & 0xFF) as u8;
                *mem.add((lo + 1) & 0xFFFF) = ((val >> 8) & 0xFF) as u8;
                sp = sp.wrapping_sub(2);
            }

            // ── POP rA ──
            else if opcode == POP {
                sp = sp.wrapping_add(2);
                let lo = sp.wrapping_sub(1) as usize;
                *r.add(ra) = *mem.add(lo & 0xFFFF) as u16
                           | ((*mem.add((lo + 1) & 0xFFFF) as u16) << 8);
            }

            // ── JMP ──
            else if opcode == JMP {
                iar = *mem.add((addr + 1) & 0xFFFF) as u16
                    | ((*mem.add((addr + 2) & 0xFFFF) as u16) << 8);
            }

            // ── JC ──
            else if opcode == JC {
                let target = *mem.add((addr + 1) & 0xFFFF) as u16
                           | ((*mem.add((addr + 2) & 0xFFFF) as u16) << 8);
                if f_carry { iar = target; }
            }

            // ── JA ──
            else if opcode == JA {
                let target = *mem.add((addr + 1) & 0xFFFF) as u16
                           | ((*mem.add((addr + 2) & 0xFFFF) as u16) << 8);
                if f_a_larger { iar = target; }
            }

            // ── JE ──
            else if opcode == JE {
                let target = *mem.add((addr + 1) & 0xFFFF) as u16
                           | ((*mem.add((addr + 2) & 0xFFFF) as u16) << 8);
                if f_equal { iar = target; }
            }

            // ── JMPR rA ──
            else if opcode == JMPR {
                iar = *r.add(ra);
            }

            // ── CALL ──
            else if opcode == CALL {
                let target = *mem.add((addr + 1) & 0xFFFF) as u16
                           | ((*mem.add((addr + 2) & 0xFFFF) as u16) << 8);
                let ret_addr = iar;
                let lo = sp.wrapping_sub(1) as usize;
                *mem.add(lo & 0xFFFF) = (ret_addr & 0xFF) as u8;
                *mem.add((lo + 1) & 0xFFFF) = ((ret_addr >> 8) & 0xFF) as u8;
                sp = sp.wrapping_sub(2);
                iar = target;
            }

            // ── RET ──
            else if opcode == RET {
                sp = sp.wrapping_add(2);
                let lo = sp.wrapping_sub(1) as usize;
                iar = *mem.add(lo & 0xFFFF) as u16
                    | ((*mem.add((lo + 1) & 0xFFFF) as u16) << 8);
            }

            // ── OUT rA ──
            else if opcode == OUT {
                console_out.push((*r.add(ra) & 0xFF) as u8);
            }

            // ── IN rA ──
            else if opcode == IN {
                self.input_waiting = true;
                self.input_register = ra as u8;
                iar = iar.wrapping_sub(size); // rewind
                break;
            }

            self.cycle_count += 1;
            executed += 1;
        }
        } // unsafe

        // Write locals back
        self.iar = iar;
        self.sp = sp;
        self.carry = f_carry;
        self.a_larger = f_a_larger;
        self.equal = f_equal;
        self.zero = f_zero;
        self.console_buf.extend_from_slice(&console_out);

        executed
    }

    /// Execute a single instruction (for step mode).
    /// Returns the opcode that was executed (0 if halted/waiting).
    #[wasm_bindgen]
    pub fn step(&mut self) -> u8 {
        if self.halted || self.input_waiting { return 0; }
        let opcode = self.mem[self.iar as usize];
        self.run(1);
        opcode
    }
}

// ── Tests ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add() {
        let mut cpu = WasmCpu::new();
        // DATA R0, 15  →  [0x12, 0x00, 0x0F, 0x00]
        // DATA R1, 27  →  [0x12, 0x10, 0x1B, 0x00]
        // ADD  R0, R1  →  [0x01, 0x01]
        // HALT         →  [0x00, 0x00]
        cpu.load_program(&[
            0x12, 0x00, 0x0F, 0x00,  // DATA R0, 15
            0x12, 0x10, 0x1B, 0x00,  // DATA R1, 27
            0x01, 0x01,              // ADD R0, R1
            0x00, 0x00,              // HALT
        ]);
        cpu.run(10);
        assert_eq!(cpu.r[0], 42);
        assert!(cpu.halted);
    }

    #[test]
    fn test_push_pop() {
        let mut cpu = WasmCpu::new();
        // DATA R0, 0x1234  →  [0x12, 0x00, 0x34, 0x12]
        // PUSH R0          →  [0x13, 0x00]
        // DATA R0, 0       →  [0x12, 0x00, 0x00, 0x00]
        // POP  R1          →  [0x14, 0x10]
        // HALT             →  [0x00, 0x00]
        cpu.load_program(&[
            0x12, 0x00, 0x34, 0x12,
            0x13, 0x00,
            0x12, 0x00, 0x00, 0x00,
            0x14, 0x10,
            0x00, 0x00,
        ]);
        cpu.run(10);
        assert_eq!(cpu.r[1], 0x1234);
    }

    #[test]
    fn test_mov() {
        let mut cpu = WasmCpu::new();
        // DATA R5, 999  →  [0x12, 0x50, 0xE7, 0x03]
        // MOV  R0, R5   →  [0x0E, 0x05]
        // HALT          →  [0x00, 0x00]
        cpu.load_program(&[
            0x12, 0x50, 0xE7, 0x03,
            0x0E, 0x05,
            0x00, 0x00,
        ]);
        cpu.run(10);
        assert_eq!(cpu.r[0], 999);
    }

    #[test]
    fn test_shr8_shl8() {
        let mut cpu = WasmCpu::new();
        // DATA R0, 0xABCD →  [0x12, 0x00, 0xCD, 0xAB]
        // SHR8 R0         →  [0x0F, 0x00]  → R0 = 0x00AB
        // HALT
        cpu.load_program(&[
            0x12, 0x00, 0xCD, 0xAB,
            0x0F, 0x00,
            0x00, 0x00,
        ]);
        cpu.run(10);
        assert_eq!(cpu.r[0], 0x00AB);

        let mut cpu2 = WasmCpu::new();
        // DATA R0, 0x00CD →  [0x12, 0x00, 0xCD, 0x00]
        // SHL8 R0         →  [0x17, 0x00]  → R0 = 0xCD00
        // HALT
        cpu2.load_program(&[
            0x12, 0x00, 0xCD, 0x00,
            0x17, 0x00,
            0x00, 0x00,
        ]);
        cpu2.run(10);
        assert_eq!(cpu2.r[0], 0xCD00);
    }

    #[test]
    fn test_mulh() {
        let mut cpu = WasmCpu::new();
        // DATA R0, 256   →  [0x12, 0x00, 0x00, 0x01]
        // DATA R1, 256   →  [0x12, 0x10, 0x00, 0x01]
        // MULH R0, R1    →  [0x0D, 0x01]  → 256*256=65536, high16=1
        // HALT
        cpu.load_program(&[
            0x12, 0x00, 0x00, 0x01,
            0x12, 0x10, 0x00, 0x01,
            0x0D, 0x01,
            0x00, 0x00,
        ]);
        cpu.run(10);
        assert_eq!(cpu.r[0], 1); // 65536 >> 16 = 1
    }

    #[test]
    fn test_call_ret() {
        let mut cpu = WasmCpu::new();
        // 0x00: DATA R0, 5     [0x12, 0x00, 0x05, 0x00]
        // 0x04: CALL 0x000A    [0x1D, 0x0A, 0x00]
        // 0x07: HALT           [0x00, 0x00]
        // 0x09: (padding)
        // 0x0A: DATA R1, 10   [0x12, 0x10, 0x0A, 0x00]  (the subroutine)
        // 0x0E: RET            [0x1E, 0x00]
        cpu.load_program(&[
            0x12, 0x00, 0x05, 0x00,  // DATA R0, 5
            0x1D, 0x0A, 0x00,        // CALL 0x000A
            0x00, 0x00,              // HALT
            0x00,                    // padding
            0x12, 0x10, 0x0A, 0x00,  // DATA R1, 10
            0x1E, 0x00,              // RET
        ]);
        cpu.run(20);
        assert_eq!(cpu.r[0], 5);
        assert_eq!(cpu.r[1], 10);
        assert!(cpu.halted);
    }
}
