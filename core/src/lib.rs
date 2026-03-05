// ============================================================================
// GateStack v2.0 WASM Core — 32-bit CPU with 16 registers, 4MB RAM
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
//   const ptr = cpu.memory_ptr();  // Direct access to 4MB
// ============================================================================

use wasm_bindgen::prelude::*;

const MEM_SIZE: usize = 4_194_304; // 4MB
const MEM_MASK: usize = 0x3FFFFF;  // 22-bit address mask

// Memory map
const PALETTE_BASE: u32 = 0x3E0000;
const _PALETTE_END: u32 = 0x3E03FF;  // 256 × 4 bytes
const BACK_BUFFER: u32  = 0x3C0000;  // Back buffer (draw target) 64KB
const FRONT_BUFFER: u32 = 0x3D0000;  // Front buffer (display) 64KB
const _VIDEO_BASE: u32  = 0x3D0000;
const VSYNC_ADDR: u32   = 0x3FFFFF;
const INIT_SP: u32      = 0x3BFFFF;  // Below back buffer

// Opcodes — must match wasm-bridge.ts exactly
const HALT:    u8 = 0x00;
const ADD:     u8 = 0x01;
const SUB:     u8 = 0x02;
const MUL:     u8 = 0x03;
const DIV:     u8 = 0x04;
const MOD:     u8 = 0x05;
const SHR:     u8 = 0x06;
const SHL:     u8 = 0x07;
const NOT:     u8 = 0x08;
const AND:     u8 = 0x09;
const OR:      u8 = 0x0A;
const XOR:     u8 = 0x0B;
const CMP:     u8 = 0x0C;
const MULH:    u8 = 0x0D;
const MOV:     u8 = 0x0E;
const SHR8:    u8 = 0x0F;
const LOAD:    u8 = 0x10;
const STORE:   u8 = 0x11;
const DATA:    u8 = 0x12;
const PUSH:    u8 = 0x13;
const POP:     u8 = 0x14;
const LDRI:    u8 = 0x15;
const STRI:    u8 = 0x16;
const SHL8:    u8 = 0x17;
const JMP:     u8 = 0x18;
const JC:      u8 = 0x19;
const JA:      u8 = 0x1A;
const JE:      u8 = 0x1B;
const JMPR:    u8 = 0x1C;
const CALL:    u8 = 0x1D;
const RET:     u8 = 0x1E;
const OUT:     u8 = 0x1F;
const IN:      u8 = 0x20;
// New v2.0 opcodes
const SHRN:    u8 = 0x21;
const SHLN:    u8 = 0x22;
const JZ:      u8 = 0x23;
const JNZ:     u8 = 0x24;
const LOAD32:  u8 = 0x25;
const STORE32: u8 = 0x26;
const LDRI32:  u8 = 0x27;
const STRI32:  u8 = 0x28;
const IDIV:    u8 = 0x29;
const IMOD:    u8 = 0x2A;
const FPMUL:   u8 = 0x2B;  // Signed 8.8 fixed-point multiply

#[wasm_bindgen]
pub struct WasmCpu {
    mem: Vec<u8>,
    r: [u32; 16],
    iar: u32,
    sp: u32,
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
    breakpoints: Vec<u32>,
    num_breakpoints: usize,
    // When true, STORE to VSYNC_ADDR does not break execution
    skip_vsync: bool,
}

// ── Default 256-color palette ──────────────────────────────────────────────
// First 16: v1.0 compatible, remaining 240: HSV rainbow gradient
fn build_default_palette() -> [u8; 1024] {
    let mut pal = [0u8; 1024];

    // v1.0 colors (16 entries)
    let v1: [[u8; 3]; 16] = [
        [10,12,20],[25,7,80],[9,1,142],[4,4,200],[0,75,220],[5,140,190],
        [10,190,120],[40,220,60],[120,230,25],[220,220,15],[255,180,0],
        [255,100,0],[220,40,5],[170,15,60],[100,5,80],[50,5,50],
    ];
    for (i, rgb) in v1.iter().enumerate() {
        pal[i * 4]     = rgb[0];
        pal[i * 4 + 1] = rgb[1];
        pal[i * 4 + 2] = rgb[2];
        pal[i * 4 + 3] = 0;
    }

    // HSV rainbow gradient (240 entries, indices 16..255)
    for i in 0..240u32 {
        let h = (i as f64 / 240.0) * 360.0;
        let s: f64 = 0.85;
        let v: f64 = 0.6 + 0.4 * (i as f64 / 240.0 * std::f64::consts::PI).sin();

        let c = v * s;
        let x = c * (1.0 - ((h / 60.0) % 2.0 - 1.0).abs());
        let m = v - c;

        let (r1, g1, b1) = if h < 60.0 { (c, x, 0.0) }
            else if h < 120.0 { (x, c, 0.0) }
            else if h < 180.0 { (0.0, c, x) }
            else if h < 240.0 { (0.0, x, c) }
            else if h < 300.0 { (x, 0.0, c) }
            else               { (c, 0.0, x) };

        let idx = (16 + i as usize) * 4;
        pal[idx]     = ((r1 + m) * 255.0) as u8;
        pal[idx + 1] = ((g1 + m) * 255.0) as u8;
        pal[idx + 2] = ((b1 + m) * 255.0) as u8;
        pal[idx + 3] = 0;
    }

    pal
}

#[wasm_bindgen]
impl WasmCpu {
    #[wasm_bindgen(constructor)]
    pub fn new() -> WasmCpu {
        let mut mem = vec![0u8; MEM_SIZE];
        // Initialize palette RAM with default palette
        let pal = build_default_palette();
        let base = PALETTE_BASE as usize;
        mem[base..base + 1024].copy_from_slice(&pal);

        WasmCpu {
            mem,
            r: [0u32; 16],
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

    /// Pointer to the 4MB memory buffer (for zero-copy access from JS)
    #[wasm_bindgen]
    pub fn memory_ptr(&self) -> *const u8 {
        self.mem.as_ptr()
    }

    /// Size of memory
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
    pub fn poke(&mut self, addr: u32, value: u8) {
        self.mem[(addr as usize) & MEM_MASK] = value;
    }

    /// Read a single byte from memory
    #[wasm_bindgen]
    pub fn peek(&self, addr: u32) -> u8 {
        self.mem[(addr as usize) & MEM_MASK]
    }

    // ── State access ─────────────────────────────────────────────────────

    #[wasm_bindgen]
    pub fn get_iar(&self) -> u32 { self.iar }

    #[wasm_bindgen]
    pub fn get_sp(&self) -> u32 { self.sp }

    #[wasm_bindgen]
    pub fn get_cycle_count(&self) -> u32 { self.cycle_count }

    #[wasm_bindgen]
    pub fn is_halted(&self) -> bool { self.halted }

    #[wasm_bindgen]
    pub fn is_input_waiting(&self) -> bool { self.input_waiting }

    #[wasm_bindgen]
    pub fn get_input_register(&self) -> u8 { self.input_register }

    #[wasm_bindgen]
    pub fn get_register(&self, i: u8) -> u32 {
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
    pub fn set_register(&mut self, i: u8, val: u32) {
        self.r[(i & 0x0F) as usize] = val;
    }

    #[wasm_bindgen]
    pub fn set_iar(&mut self, val: u32) { self.iar = val; }

    #[wasm_bindgen]
    pub fn set_sp(&mut self, val: u32) { self.sp = val; }

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
    pub fn provide_input(&mut self, value: u32) {
        if self.input_waiting {
            self.r[self.input_register as usize] = value;
            self.input_waiting = false;
            // Advance past the IN instruction (2 bytes)
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
    pub fn add_breakpoint(&mut self, addr: u32) {
        if !self.breakpoints.contains(&addr) {
            self.breakpoints.push(addr);
            self.num_breakpoints = self.breakpoints.len();
        }
    }

    #[wasm_bindgen]
    pub fn remove_breakpoint(&mut self, addr: u32) {
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
        self.r = [0u32; 16];
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
        // Re-initialize default palette
        let pal = build_default_palette();
        let base = PALETTE_BASE as usize;
        self.mem[base..base + 1024].copy_from_slice(&pal);
    }

    // ── Execution — the hot path (unsafe-optimized) ──────────────────────

    /// Execute up to max_cycles instructions. Returns number actually executed.
    /// Stops on: HALT, breakpoint, vsync (STORE to VSYNC_ADDR), or IN.
    ///
    /// SAFETY: Uses unsafe pointer access to skip bounds checks.
    /// All memory accesses are masked to MEM_MASK (22-bit).
    /// All register accesses use (x & 0x0F) indices into a 16-element array.
    #[wasm_bindgen]
    pub fn run(&mut self, max_cycles: u32) -> u32 {
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

        let has_bp = self.num_breakpoints > 0;

        unsafe {
        for _ in 0..max_cycles {
            if self.halted || self.input_waiting { break; }
            if executed > 0 && has_bp && self.breakpoints.contains(&iar) { break; }

            let addr = (iar as usize) & MEM_MASK;
            let opcode = *mem.add(addr);
            let reg_byte = *mem.add((addr + 1) & MEM_MASK);
            let ra = ((reg_byte >> 4) & 0x0F) as usize;
            let rb = (reg_byte & 0x0F) as usize;

            // HALT
            if opcode == HALT {
                self.halted = true;
                break;
            }

            // Instruction size (v2.0 encoding)
            let size: u32 = match opcode {
                DATA => 6,                                                       // opcode + reg + imm32
                LOAD | STORE | LOAD32 | STORE32 => 5,                           // opcode + reg + addr24
                JMP | JC | JA | JE | JZ | JNZ | CALL => 4,                     // opcode + addr24
                _ => 2,                                                          // opcode + reg byte
            };
            iar = iar.wrapping_add(size);

            // ── Helper: read 24-bit LE address from memory ──
            macro_rules! read_addr24_at {
                ($offset:expr) => {
                    *mem.add(($offset) & MEM_MASK) as u32
                    | ((*mem.add(($offset + 1) & MEM_MASK) as u32) << 8)
                    | ((*mem.add(($offset + 2) & MEM_MASK) as u32) << 16)
                }
            }

            // ── ALU (0x01-0x0F, 0x17, 0x21, 0x22, 0x29, 0x2A) ──
            if (opcode >= ADD && opcode <= SHR8) || opcode == SHL8
                || opcode == SHRN || opcode == SHLN
                || opcode == IDIV || opcode == IMOD
                || opcode == FPMUL {
                let a = *r.add(ra);
                let b = *r.add(rb);
                let mut result: u32 = 0;
                let mut carry = false;

                match opcode {
                    ADD  => { let s = (a as u64) + (b as u64); result = s as u32; carry = s > 0xFFFF_FFFF; }
                    SUB  => { result = a.wrapping_sub(b); carry = a < b; }
                    MUL  => { let s = (a as u64) * (b as u64); result = s as u32; carry = s > 0xFFFF_FFFF; }
                    MULH => { let s = (a as u64) * (b as u64); result = (s >> 32) as u32; }
                    DIV  => { result = if b == 0 { 0 } else { a / b }; }
                    MOD  => { result = if b == 0 { 0 } else { a % b }; }
                    IDIV => {
                        let sa = a as i32;
                        let sb = b as i32;
                        result = if sb == 0 { 0 } else { sa.wrapping_div(sb) as u32 };
                    }
                    IMOD => {
                        let sa = a as i32;
                        let sb = b as i32;
                        result = if sb == 0 { 0 } else { sa.wrapping_rem(sb) as u32 };
                    }
                    FPMUL => {
                        // Signed 8.8 fixed-point multiply: rA = (rA * rB) >> 8
                        let sa = a as i32 as i64;
                        let sb = b as i32 as i64;
                        let prod = sa * sb;
                        result = ((prod >> 8) & 0xFFFF_FFFF) as u32;
                    }
                    SHR  => { result = a >> 1; carry = (a & 1) != 0; }
                    SHL  => { let s = (a as u64) << 1; result = s as u32; carry = s > 0xFFFF_FFFF; }
                    NOT  => { result = !a; }
                    AND  => { result = a & b; }
                    OR   => { result = a | b; }
                    XOR  => { result = a ^ b; }
                    CMP  => { result = a; }
                    MOV  => { result = b; }
                    SHR8 => { result = a >> 8; carry = (a & 0x80) != 0; }
                    SHL8 => { result = a << 8; carry = (a & 0x0080_0000) != 0; }
                    SHRN => { let shift = b & 31; result = a >> shift; carry = if shift > 0 { (a >> (shift - 1)) & 1 != 0 } else { false }; }
                    SHLN => { let shift = b & 31; let s = (a as u64) << shift; result = s as u32; carry = s > 0xFFFF_FFFF; }
                    _    => {}
                }

                f_carry = carry;
                f_a_larger = a > b;
                f_equal = a == b;
                f_zero = result == 0;

                if opcode != CMP {
                    *r.add(ra) = result;
                }
            }

            // ── LOAD rA, [addr24] — load 1 byte, zero-extend ──
            else if opcode == LOAD {
                let m_addr = read_addr24_at!(addr + 2);
                *r.add(ra) = *mem.add((m_addr as usize) & MEM_MASK) as u32;
            }

            // ── STORE rA, [addr24] — store low byte ──
            else if opcode == STORE {
                let m_addr = read_addr24_at!(addr + 2);
                let masked = (m_addr as usize) & MEM_MASK;
                *mem.add(masked) = (*r.add(ra) & 0xFF) as u8;
                if m_addr == VSYNC_ADDR && executed > 0 && !self.skip_vsync {
                    // Page flip: copy back buffer → front buffer (64KB)
                    std::ptr::copy_nonoverlapping(
                        mem.add(BACK_BUFFER as usize),
                        mem.add(FRONT_BUFFER as usize),
                        0x10000,
                    );
                    self.cycle_count += 1;
                    executed += 1;
                    break;
                }
            }

            // ── LOAD32 rA, [addr24] — load 4 bytes LE ──
            else if opcode == LOAD32 {
                let m_addr = read_addr24_at!(addr + 2) as usize;
                *r.add(ra) = *mem.add(m_addr & MEM_MASK) as u32
                           | ((*mem.add((m_addr + 1) & MEM_MASK) as u32) << 8)
                           | ((*mem.add((m_addr + 2) & MEM_MASK) as u32) << 16)
                           | ((*mem.add((m_addr + 3) & MEM_MASK) as u32) << 24);
            }

            // ── STORE32 rA, [addr24] — store 4 bytes LE ──
            else if opcode == STORE32 {
                let m_addr = read_addr24_at!(addr + 2) as usize;
                let val = *r.add(ra);
                *mem.add(m_addr & MEM_MASK) = (val & 0xFF) as u8;
                *mem.add((m_addr + 1) & MEM_MASK) = ((val >> 8) & 0xFF) as u8;
                *mem.add((m_addr + 2) & MEM_MASK) = ((val >> 16) & 0xFF) as u8;
                *mem.add((m_addr + 3) & MEM_MASK) = ((val >> 24) & 0xFF) as u8;
                // Check if any byte hits vsync
                let m32 = m_addr as u32;
                if m32 <= VSYNC_ADDR && m32 + 3 >= VSYNC_ADDR
                   && executed > 0 && !self.skip_vsync {
                    std::ptr::copy_nonoverlapping(
                        mem.add(BACK_BUFFER as usize),
                        mem.add(FRONT_BUFFER as usize),
                        0x10000,
                    );
                    self.cycle_count += 1;
                    executed += 1;
                    break;
                }
            }

            // ── DATA rA, imm32 — 6-byte instruction ──
            else if opcode == DATA {
                *r.add(ra) = *mem.add((addr + 2) & MEM_MASK) as u32
                           | ((*mem.add((addr + 3) & MEM_MASK) as u32) << 8)
                           | ((*mem.add((addr + 4) & MEM_MASK) as u32) << 16)
                           | ((*mem.add((addr + 5) & MEM_MASK) as u32) << 24);
            }

            // ── LDRI rA, rB — load 1 byte from [rB] ──
            else if opcode == LDRI {
                *r.add(ra) = *mem.add((*r.add(rb) as usize) & MEM_MASK) as u32;
            }

            // ── STRI rA, rB — store low byte to [rB] ──
            else if opcode == STRI {
                let m_addr = *r.add(rb);
                let masked = (m_addr as usize) & MEM_MASK;
                *mem.add(masked) = (*r.add(ra) & 0xFF) as u8;
                if m_addr == VSYNC_ADDR && executed > 0 && !self.skip_vsync {
                    std::ptr::copy_nonoverlapping(
                        mem.add(BACK_BUFFER as usize),
                        mem.add(FRONT_BUFFER as usize),
                        0x10000,
                    );
                    self.cycle_count += 1;
                    executed += 1;
                    break;
                }
            }

            // ── LDRI32 rA, rB — load 32-bit word from [rB] ──
            else if opcode == LDRI32 {
                let m_addr = (*r.add(rb) as usize) & MEM_MASK;
                *r.add(ra) = *mem.add(m_addr) as u32
                           | ((*mem.add((m_addr + 1) & MEM_MASK) as u32) << 8)
                           | ((*mem.add((m_addr + 2) & MEM_MASK) as u32) << 16)
                           | ((*mem.add((m_addr + 3) & MEM_MASK) as u32) << 24);
            }

            // ── STRI32 rA, rB — store 32-bit word to [rB] ──
            else if opcode == STRI32 {
                let m_addr = *r.add(rb);
                let masked = (m_addr as usize) & MEM_MASK;
                let val = *r.add(ra);
                *mem.add(masked) = (val & 0xFF) as u8;
                *mem.add((masked + 1) & MEM_MASK) = ((val >> 8) & 0xFF) as u8;
                *mem.add((masked + 2) & MEM_MASK) = ((val >> 16) & 0xFF) as u8;
                *mem.add((masked + 3) & MEM_MASK) = ((val >> 24) & 0xFF) as u8;
                // Check vsync
                if m_addr <= VSYNC_ADDR && m_addr + 3 >= VSYNC_ADDR
                   && executed > 0 && !self.skip_vsync {
                    std::ptr::copy_nonoverlapping(
                        mem.add(BACK_BUFFER as usize),
                        mem.add(FRONT_BUFFER as usize),
                        0x10000,
                    );
                    self.cycle_count += 1;
                    executed += 1;
                    break;
                }
            }

            // ── PUSH rA — push 32-bit value (SP -= 4) ──
            else if opcode == PUSH {
                let val = *r.add(ra);
                sp = sp.wrapping_sub(4);
                let base = (sp as usize) & MEM_MASK;
                *mem.add(base) = (val & 0xFF) as u8;
                *mem.add((base + 1) & MEM_MASK) = ((val >> 8) & 0xFF) as u8;
                *mem.add((base + 2) & MEM_MASK) = ((val >> 16) & 0xFF) as u8;
                *mem.add((base + 3) & MEM_MASK) = ((val >> 24) & 0xFF) as u8;
            }

            // ── POP rA — pop 32-bit value (SP += 4) ──
            else if opcode == POP {
                let base = (sp as usize) & MEM_MASK;
                *r.add(ra) = *mem.add(base) as u32
                           | ((*mem.add((base + 1) & MEM_MASK) as u32) << 8)
                           | ((*mem.add((base + 2) & MEM_MASK) as u32) << 16)
                           | ((*mem.add((base + 3) & MEM_MASK) as u32) << 24);
                sp = sp.wrapping_add(4);
            }

            // ── JMP addr24 ──
            else if opcode == JMP {
                iar = read_addr24_at!(addr + 1);
            }

            // ── JC addr24 ──
            else if opcode == JC {
                let target = read_addr24_at!(addr + 1);
                if f_carry { iar = target; }
            }

            // ── JA addr24 ──
            else if opcode == JA {
                let target = read_addr24_at!(addr + 1);
                if f_a_larger { iar = target; }
            }

            // ── JE addr24 ──
            else if opcode == JE {
                let target = read_addr24_at!(addr + 1);
                if f_equal { iar = target; }
            }

            // ── JZ addr24 ──
            else if opcode == JZ {
                let target = read_addr24_at!(addr + 1);
                if f_zero { iar = target; }
            }

            // ── JNZ addr24 ──
            else if opcode == JNZ {
                let target = read_addr24_at!(addr + 1);
                if !f_zero { iar = target; }
            }

            // ── JMPR rA ──
            else if opcode == JMPR {
                iar = *r.add(ra);
            }

            // ── CALL addr24 ──
            else if opcode == CALL {
                let target = read_addr24_at!(addr + 1);
                let ret_addr = iar;
                sp = sp.wrapping_sub(4);
                let base = (sp as usize) & MEM_MASK;
                *mem.add(base) = (ret_addr & 0xFF) as u8;
                *mem.add((base + 1) & MEM_MASK) = ((ret_addr >> 8) & 0xFF) as u8;
                *mem.add((base + 2) & MEM_MASK) = ((ret_addr >> 16) & 0xFF) as u8;
                *mem.add((base + 3) & MEM_MASK) = ((ret_addr >> 24) & 0xFF) as u8;
                iar = target;
            }

            // ── RET ──
            else if opcode == RET {
                let base = (sp as usize) & MEM_MASK;
                iar = *mem.add(base) as u32
                    | ((*mem.add((base + 1) & MEM_MASK) as u32) << 8)
                    | ((*mem.add((base + 2) & MEM_MASK) as u32) << 16)
                    | ((*mem.add((base + 3) & MEM_MASK) as u32) << 24);
                sp = sp.wrapping_add(4);
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
        let opcode = self.mem[(self.iar as usize) & MEM_MASK];
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
        cpu.load_program(&[
            0x12, 0x00, 0x0F, 0x00, 0x00, 0x00,  // DATA R0, 15
            0x12, 0x10, 0x1B, 0x00, 0x00, 0x00,  // DATA R1, 27
            0x01, 0x01,                            // ADD R0, R1
            0x00, 0x00,                            // HALT
        ]);
        cpu.run(10);
        assert_eq!(cpu.r[0], 42);
        assert!(cpu.halted);
    }

    #[test]
    fn test_push_pop_32bit() {
        let mut cpu = WasmCpu::new();
        cpu.load_program(&[
            0x12, 0x00, 0xEF, 0xBE, 0xAD, 0xDE,  // DATA R0, 0xDEADBEEF
            0x13, 0x00,                            // PUSH R0
            0x12, 0x00, 0x00, 0x00, 0x00, 0x00,  // DATA R0, 0
            0x14, 0x10,                            // POP R1
            0x00, 0x00,                            // HALT
        ]);
        cpu.run(10);
        assert_eq!(cpu.r[1], 0xDEADBEEF);
    }

    #[test]
    fn test_data_32bit() {
        let mut cpu = WasmCpu::new();
        cpu.load_program(&[
            0x12, 0x00, 0x78, 0x56, 0x34, 0x12,  // DATA R0, 0x12345678
            0x00, 0x00,                            // HALT
        ]);
        cpu.run(10);
        assert_eq!(cpu.r[0], 0x12345678);
    }

    #[test]
    fn test_mulh_32bit() {
        let mut cpu = WasmCpu::new();
        // 65536 * 65536 = 0x1_0000_0000, high32 = 1
        cpu.load_program(&[
            0x12, 0x00, 0x00, 0x00, 0x01, 0x00,  // DATA R0, 0x10000
            0x12, 0x10, 0x00, 0x00, 0x01, 0x00,  // DATA R1, 0x10000
            0x0D, 0x01,                            // MULH R0, R1
            0x00, 0x00,                            // HALT
        ]);
        cpu.run(10);
        assert_eq!(cpu.r[0], 1);
    }

    #[test]
    fn test_shrn_shln() {
        let mut cpu = WasmCpu::new();
        cpu.load_program(&[
            0x12, 0x00, 0x00, 0xFF, 0x00, 0x00,  // DATA R0, 0xFF00
            0x12, 0x10, 0x08, 0x00, 0x00, 0x00,  // DATA R1, 8
            0x21, 0x01,                            // SHRN R0, R1
            0x00, 0x00,                            // HALT
        ]);
        cpu.run(10);
        assert_eq!(cpu.r[0], 0xFF);
    }

    #[test]
    fn test_load32_store32() {
        let mut cpu = WasmCpu::new();
        cpu.load_program(&[
            0x12, 0x00, 0xBE, 0xBA, 0xFE, 0xCA,  // DATA R0, 0xCAFEBABE
            0x26, 0x00, 0x00, 0x10, 0x00,          // STORE32 R0, [0x001000]
            0x12, 0x00, 0x00, 0x00, 0x00, 0x00,  // DATA R0, 0
            0x25, 0x10, 0x00, 0x10, 0x00,          // LOAD32 R1, [0x001000]
            0x00, 0x00,                            // HALT
        ]);
        cpu.run(10);
        assert_eq!(cpu.r[1], 0xCAFEBABE);
    }

    #[test]
    fn test_call_ret_32bit() {
        let mut cpu = WasmCpu::new();
        // 0x00: DATA R0, 5         (6 bytes)
        // 0x06: CALL 0x00000E      (4 bytes)
        // 0x0A: HALT               (2 bytes)
        // 0x0C: padding            (2 bytes)
        // 0x0E: DATA R1, 10        (6 bytes)
        // 0x14: RET                (2 bytes)
        cpu.load_program(&[
            0x12, 0x00, 0x05, 0x00, 0x00, 0x00,  // DATA R0, 5
            0x1D, 0x0E, 0x00, 0x00,              // CALL 0x00000E
            0x00, 0x00,                            // HALT
            0x00, 0x00,                            // padding
            0x12, 0x10, 0x0A, 0x00, 0x00, 0x00,  // DATA R1, 10
            0x1E, 0x00,                            // RET
        ]);
        cpu.run(20);
        assert_eq!(cpu.r[0], 5);
        assert_eq!(cpu.r[1], 10);
        assert!(cpu.halted);
    }

    #[test]
    fn test_jz_jnz() {
        let mut cpu = WasmCpu::new();
        cpu.load_program(&[
            0x12, 0x00, 0x00, 0x00, 0x00, 0x00,  // 0x00: DATA R0, 0
            0x12, 0x10, 0x00, 0x00, 0x00, 0x00,  // 0x06: DATA R1, 0
            0x0C, 0x01,                            // 0x0C: CMP R0, R1
            0x23, 0x1C, 0x00, 0x00,              // 0x0E: JZ 0x00001C
            0x12, 0x20, 0x63, 0x00, 0x00, 0x00,  // 0x12: DATA R2, 99 (skipped)
            0x00, 0x00,                            // 0x18: HALT
            0x00, 0x00,                            // 0x1A: padding
            0x12, 0x20, 0x2A, 0x00, 0x00, 0x00,  // 0x1C: DATA R2, 42
            0x00, 0x00,                            // 0x22: HALT
        ]);
        cpu.run(20);
        assert_eq!(cpu.r[2], 42);
    }

    #[test]
    fn test_idiv_imod() {
        let mut cpu = WasmCpu::new();
        cpu.load_program(&[
            0x12, 0x00, 0xF6, 0xFF, 0xFF, 0xFF,  // DATA R0, 0xFFFFFFF6 (-10)
            0x12, 0x10, 0x03, 0x00, 0x00, 0x00,  // DATA R1, 3
            0x0E, 0x20,                            // MOV R2, R0
            0x29, 0x01,                            // IDIV R0, R1
            0x2A, 0x21,                            // IMOD R2, R1
            0x00, 0x00,                            // HALT
        ]);
        cpu.run(20);
        assert_eq!(cpu.r[0] as i32, -3);
        assert_eq!(cpu.r[2] as i32, -1);
    }

    #[test]
    fn test_palette_initialized() {
        let cpu = WasmCpu::new();
        let base = PALETTE_BASE as usize;
        // Color 0 should be [10, 12, 20, 0]
        assert_eq!(cpu.mem[base], 10);
        assert_eq!(cpu.mem[base + 1], 12);
        assert_eq!(cpu.mem[base + 2], 20);
        assert_eq!(cpu.mem[base + 3], 0);
    }
}
