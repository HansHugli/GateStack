// ============================================================================
// cpu.rs — CPU: Registers, Flags, and Instruction Execution
// ============================================================================
// This combines and replaces several of your C# classes:
//   - Computer.cs (top-level wiring: registers, ALU, RAM, bus)
//   - ControlSection.cs (control signals, stepper, clock)
//   - Register8.cs (individual registers → now just u8 fields)
//   - Stepper7.cs (7-step cycle → enum StepPhase)
//   - Bus8_1.cs (bus multiplexer → handled in step logic)
//
// ARCHITECTURE (matches your C# design):
//   Registers: R0, R1, R2, R3 (general purpose)
//   Special:   ACC (accumulator), TMP, IAR (instruction address), IR (instruction)
//   Flags:     Carry, ALarger, Equal, Zero
//   Bus:       8-bit main bus connecting everything
//
// INSTRUCTION FORMAT (8-bit):
//   Bits 7-4: Opcode (what to do)
//   Bits 3-2: Register A (source/dest)
//   Bits 1-0: Register B (source)
// ============================================================================

use serde::{Deserialize, Serialize};
use crate::alu::{alu_execute, AluOp};
use crate::memory::Ram;
use crate::trace::{CycleTrace, MicroStep, BusSource};

// ---------------------------------------------------------------------------
// Instruction Set Definition
// ---------------------------------------------------------------------------

/// All instructions the CPU understands.
/// The opcode is the upper 4 bits of the instruction byte.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[repr(u8)]
pub enum Opcode {
    // ALU operations (0x0 - 0x7): use register A and B
    Add = 0x0,
    Shr = 0x1,
    Shl = 0x2,
    Not = 0x3,
    And = 0x4,
    Or  = 0x5,
    Xor = 0x6,
    Cmp = 0x7,

    // Load/Store (0x8 - 0x9)
    Load  = 0x8,  // Load from RAM[next_byte] into register
    Store = 0x9,  // Store register into RAM[next_byte]

    // Data movement (0xA - 0xB)
    Data = 0xA,   // Load immediate: next byte → register
    Jmpr = 0xB,   // Jump to address in register

    // Jumps (0xC - 0xF): conditional jumps using flags
    Jmp   = 0xC,  // Jump always
    Jc    = 0xD,  // Jump if carry
    Ja    = 0xE,  // Jump if A larger
    Je    = 0xF,  // Jump if equal
}

impl Opcode {
    pub fn from_bits(bits: u8) -> Option<Opcode> {
        match bits {
            0x0 => Some(Opcode::Add),
            0x1 => Some(Opcode::Shr),
            0x2 => Some(Opcode::Shl),
            0x3 => Some(Opcode::Not),
            0x4 => Some(Opcode::And),
            0x5 => Some(Opcode::Or),
            0x6 => Some(Opcode::Xor),
            0x7 => Some(Opcode::Cmp),
            0x8 => Some(Opcode::Load),
            0x9 => Some(Opcode::Store),
            0xA => Some(Opcode::Data),
            0xB => Some(Opcode::Jmpr),
            0xC => Some(Opcode::Jmp),
            0xD => Some(Opcode::Jc),
            0xE => Some(Opcode::Ja),
            0xF => Some(Opcode::Je),
            _ => None,
        }
    }

    /// Is this an ALU operation? (opcodes 0-7)
    pub fn is_alu(&self) -> bool {
        (*self as u8) <= 7
    }

    /// Convert ALU opcodes to AluOp (for the ALU module)
    pub fn to_alu_op(&self) -> Option<AluOp> {
        if self.is_alu() {
            AluOp::from_bits(*self as u8)
        } else {
            None
        }
    }

    pub fn name(&self) -> &'static str {
        match self {
            Opcode::Add => "ADD", Opcode::Shr => "SHR", Opcode::Shl => "SHL",
            Opcode::Not => "NOT", Opcode::And => "AND", Opcode::Or => "OR",
            Opcode::Xor => "XOR", Opcode::Cmp => "CMP", Opcode::Load => "LOAD",
            Opcode::Store => "STORE", Opcode::Data => "DATA", Opcode::Jmpr => "JMPR",
            Opcode::Jmp => "JMP", Opcode::Jc => "JC", Opcode::Ja => "JA",
            Opcode::Je => "JE",
        }
    }
}

// ---------------------------------------------------------------------------
// Flags Register
// ---------------------------------------------------------------------------

/// CPU flags — matches your C# ControlSection flags.
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
pub struct Flags {
    pub carry: bool,     // Carry/borrow from ALU
    pub a_larger: bool,  // A > B from comparator
    pub equal: bool,     // A == B from comparator
    pub zero: bool,      // Result was zero
}

// ---------------------------------------------------------------------------
// Register File
// ---------------------------------------------------------------------------

/// Which register (2-bit encoding from instruction bits 3-2 and 1-0)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[repr(u8)]
pub enum RegId {
    R0 = 0,
    R1 = 1,
    R2 = 2,
    R3 = 3,
}

impl RegId {
    pub fn from_bits(bits: u8) -> RegId {
        match bits & 0x03 {
            0 => RegId::R0,
            1 => RegId::R1,
            2 => RegId::R2,
            3 => RegId::R3,
            _ => unreachable!(),
        }
    }
}

// ---------------------------------------------------------------------------
// CPU State
// ---------------------------------------------------------------------------

/// The complete CPU state. Every field here was a Register8 object in your C#.
/// Now they're just u8 values — no gate objects, no string allocations.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Cpu {
    // General purpose registers (your C# _r0, _r1, _r2, _r3)
    pub r: [u8; 4],

    // Special registers
    pub acc: u8,    // Accumulator (ALU output register)
    pub tmp: u8,    // Temporary register (internal, holds second ALU operand)
    pub iar: u8,    // Instruction Address Register (program counter)
    pub ir: u8,     // Instruction Register (current instruction)

    // Flags (your C# ControlSection flags)
    pub flags: Flags,

    // Bus value (for visualization — what's currently on the main bus)
    pub bus: u8,

    // RAM
    pub ram: Ram,

    // Execution state
    pub halted: bool,
    pub cycle_count: u64,

    // Breakpoints (addresses where execution should pause)
    pub breakpoints: Vec<u8>,
}

impl Cpu {
    pub fn new() -> Self {
        Cpu {
            r: [0; 4],
            acc: 0,
            tmp: 0,
            iar: 0,
            ir: 0,
            flags: Flags::default(),
            bus: 0,
            ram: Ram::new(),
            halted: false,
            cycle_count: 0,
            breakpoints: Vec::new(),
        }
    }

    /// Read a general-purpose register
    pub fn get_reg(&self, id: RegId) -> u8 {
        self.r[id as usize]
    }

    /// Write a general-purpose register
    pub fn set_reg(&mut self, id: RegId, value: u8) {
        self.r[id as usize] = value;
    }

    /// Load a program into RAM and reset the CPU
    pub fn load_program(&mut self, program: &[u8]) {
        self.reset();
        self.ram.load_program(program);
    }

    /// Reset CPU to initial state (RAM is preserved)
    pub fn reset(&mut self) {
        self.r = [0; 4];
        self.acc = 0;
        self.tmp = 0;
        self.iar = 0;
        self.ir = 0;
        self.flags = Flags::default();
        self.bus = 0;
        self.halted = false;
        self.cycle_count = 0;
    }

    /// Full reset including RAM
    pub fn hard_reset(&mut self) {
        self.reset();
        self.ram.clear();
    }

    /// Execute one complete instruction cycle.
    /// Returns a CycleTrace that the UI can use to animate what happened.
    ///
    /// This replaces your C# ControlSection + Stepper7 + Clock:
    ///   Your Stepper7 had 7 steps per cycle.
    ///   Here we do Fetch → Decode → Execute as discrete phases,
    ///   but record every micro-operation for the UI to animate.
    pub fn step(&mut self) -> CycleTrace {
        if self.halted {
            return CycleTrace::halted(self.iar);
        }

        let mut trace = CycleTrace::new(self.iar);

        // ── FETCH (your Stepper7 steps 1-3) ──────────────────────────
        // Step 1: IAR → MAR (load program counter into memory address register)
        self.ram.set_mar(self.iar);
        self.bus = self.iar;
        trace.push(MicroStep::bus_transfer(BusSource::IAR, "MAR", self.bus));

        // Step 2: RAM[MAR] → IR (read instruction from memory into instruction register)
        self.ir = self.ram.read();
        self.bus = self.ir;
        trace.push(MicroStep::bus_transfer(BusSource::RAM, "IR", self.bus));

        // Check for HALT (0x00 = ADD R0,R0 used as halt sentinel)
        if self.ir == 0x00 {
            self.halted = true;
            trace.halted = true;
            trace.opcode = Some(Opcode::Add);
            return trace;
        }

        // Step 3: IAR + 1 → IAR (increment program counter)
        self.iar = self.iar.wrapping_add(1);
        trace.push(MicroStep::increment_iar(self.iar));

        // ── DECODE ────────────────────────────────────────────────────
        let opcode_bits = (self.ir >> 4) & 0x0F;
        let reg_a = RegId::from_bits((self.ir >> 2) & 0x03);
        let reg_b = RegId::from_bits(self.ir & 0x03);

        let opcode = match Opcode::from_bits(opcode_bits) {
            Some(op) => op,
            None => {
                trace.set_error("Invalid opcode");
                self.halted = true;
                return trace;
            }
        };
        trace.set_instruction(opcode, reg_a, reg_b);

        // ── EXECUTE (your Stepper7 steps 4-6) ────────────────────────
        match opcode {
            // ALU Operations — match explicitly
            Opcode::Add | Opcode::Shr | Opcode::Shl | Opcode::Not |
            Opcode::And | Opcode::Or  | Opcode::Xor | Opcode::Cmp => {
                let alu_op = opcode.to_alu_op().unwrap();

                // Load RegB → TMP
                self.tmp = self.get_reg(reg_b);
                self.bus = self.tmp;
                trace.push(MicroStep::bus_transfer(BusSource::Reg(reg_b), "TMP", self.bus));

                // Execute ALU: RegA op TMP → ACC
                let a_val = self.get_reg(reg_a);
                let result = alu_execute(a_val, self.tmp, alu_op, self.flags.carry);
                trace.push(MicroStep::alu_op(alu_op, a_val, self.tmp, result));

                // Store result in ACC
                self.acc = result.value;
                self.bus = self.acc;
                trace.push(MicroStep::bus_transfer(BusSource::ALU, "ACC", self.bus));

                // Update flags
                self.flags = Flags {
                    carry: result.carry,
                    a_larger: result.a_larger,
                    equal: result.equal,
                    zero: result.zero,
                };
                trace.set_flags(self.flags);

                // ACC → RegA (store result back) — but NOT for CMP
                if opcode != Opcode::Cmp {
                    self.set_reg(reg_a, self.acc);
                    trace.push(MicroStep::bus_transfer(BusSource::ACC, &format!("R{}", reg_a as u8), self.acc));
                }
            }

            // LOAD: RAM[next_byte] → RegA
            Opcode::Load => {
                // Fetch address from next byte in program
                self.ram.set_mar(self.iar);
                let addr = self.ram.read();
                self.iar = self.iar.wrapping_add(1);
                trace.push(MicroStep::fetch_operand(addr));

                // Read from that RAM address
                self.ram.set_mar(addr);
                let value = self.ram.read();
                self.set_reg(reg_a, value);
                self.bus = value;
                trace.push(MicroStep::bus_transfer(BusSource::RAM, &format!("R{}", reg_a as u8), self.bus));
            }

            // STORE: RegA → RAM[next_byte]
            Opcode::Store => {
                let addr = self.ram.read_next(&mut self.iar);
                trace.push(MicroStep::fetch_operand(addr));

                self.ram.set_mar(addr);
                let value = self.get_reg(reg_a);
                self.ram.write(value);
                self.bus = value;
                trace.push(MicroStep::bus_transfer(BusSource::Reg(reg_a), "RAM", self.bus));
            }

            // DATA: next_byte → RegA (load immediate value)
            Opcode::Data => {
                let value = self.ram.read_next(&mut self.iar);
                self.set_reg(reg_a, value);
                self.bus = value;
                trace.push(MicroStep::bus_transfer(BusSource::Immediate(value), &format!("R{}", reg_a as u8), self.bus));
            }

            // JMPR: Jump to address in RegA
            Opcode::Jmpr => {
                self.iar = self.get_reg(reg_a);
                trace.push(MicroStep::jump(self.iar, true));
            }

            // JMP: Jump always to next_byte
            Opcode::Jmp => {
                let addr = self.ram.read_next(&mut self.iar);
                self.iar = addr;
                trace.push(MicroStep::jump(addr, true));
            }

            // Conditional jumps
            Opcode::Jc => {
                let addr = self.ram.read_next(&mut self.iar);
                let taken = self.flags.carry;
                if taken { self.iar = addr; }
                trace.push(MicroStep::jump(addr, taken));
            }
            Opcode::Ja => {
                let addr = self.ram.read_next(&mut self.iar);
                let taken = self.flags.a_larger;
                if taken { self.iar = addr; }
                trace.push(MicroStep::jump(addr, taken));
            }
            Opcode::Je => {
                let addr = self.ram.read_next(&mut self.iar);
                let taken = self.flags.equal;
                if taken { self.iar = addr; }
                trace.push(MicroStep::jump(addr, taken));
            }
        }

        self.cycle_count += 1;
        trace.set_cycle(self.cycle_count);
        trace
    }

    /// Run multiple cycles (for "Run" mode in the UI).
    /// Uses fast execution without trace recording.
    /// Stops at breakpoints or after max_cycles.
    pub fn run(&mut self, max_cycles: u64) -> u64 {
        let mut executed = 0;
        for _ in 0..max_cycles {
            if self.halted {
                break;
            }
            self.step_fast();
            executed += 1;

            // Check breakpoints
            if self.breakpoints.contains(&self.iar) {
                break;
            }
        }
        executed
    }

    /// Fast execution without trace recording (for Run mode)
    fn step_fast(&mut self) {
        if self.halted { return; }

        // FETCH
        self.ram.set_mar(self.iar);
        self.ir = self.ram.read();
        self.iar = self.iar.wrapping_add(1);

        // Handle HALT (opcode 0x00 = ADD R0, R0 used as halt sentinel)
        if self.ir == 0x00 {
            self.halted = true;
            return;
        }

        // DECODE
        let opcode_bits = (self.ir >> 4) & 0x0F;
        let reg_a = RegId::from_bits((self.ir >> 2) & 0x03);
        let reg_b = RegId::from_bits(self.ir & 0x03);

        let opcode = match Opcode::from_bits(opcode_bits) {
            Some(op) => op,
            None => { self.halted = true; return; }
        };

        // EXECUTE
        match opcode {
            // ALU operations — match each explicitly to avoid guard issues
            Opcode::Add | Opcode::Shr | Opcode::Shl | Opcode::Not |
            Opcode::And | Opcode::Or  | Opcode::Xor | Opcode::Cmp => {
                let alu_op = opcode.to_alu_op().unwrap();
                self.tmp = self.get_reg(reg_b);
                let a_val = self.get_reg(reg_a);
                let result = alu_execute(a_val, self.tmp, alu_op, self.flags.carry);
                self.acc = result.value;
                self.flags = Flags {
                    carry: result.carry,
                    a_larger: result.a_larger,
                    equal: result.equal,
                    zero: result.zero,
                };
                if opcode != Opcode::Cmp {
                    self.set_reg(reg_a, self.acc);
                }
            }
            Opcode::Load => {
                self.ram.set_mar(self.iar);
                let addr = self.ram.read();
                self.iar = self.iar.wrapping_add(1);
                self.ram.set_mar(addr);
                self.set_reg(reg_a, self.ram.read());
            }
            Opcode::Store => {
                let addr = self.ram.read_next(&mut self.iar);
                self.ram.set_mar(addr);
                self.ram.write(self.get_reg(reg_a));
            }
            Opcode::Data => {
                let value = self.ram.read_next(&mut self.iar);
                self.set_reg(reg_a, value);
            }
            Opcode::Jmpr => {
                self.iar = self.get_reg(reg_a);
            }
            Opcode::Jmp => {
                self.iar = self.ram.read_next(&mut self.iar);
            }
            Opcode::Jc => {
                let addr = self.ram.read_next(&mut self.iar);
                if self.flags.carry { self.iar = addr; }
            }
            Opcode::Ja => {
                let addr = self.ram.read_next(&mut self.iar);
                if self.flags.a_larger { self.iar = addr; }
            }
            Opcode::Je => {
                let addr = self.ram.read_next(&mut self.iar);
                if self.flags.equal { self.iar = addr; }
            }
        }

        self.cycle_count += 1;
    }

    /// Add a breakpoint at the given address
    pub fn add_breakpoint(&mut self, addr: u8) {
        if !self.breakpoints.contains(&addr) {
            self.breakpoints.push(addr);
        }
    }

    /// Remove a breakpoint
    pub fn remove_breakpoint(&mut self, addr: u8) {
        self.breakpoints.retain(|&a| a != addr);
    }
}

// ============================================================================
// Tests
// ============================================================================
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_cpu() {
        let cpu = Cpu::new();
        assert_eq!(cpu.r, [0, 0, 0, 0]);
        assert_eq!(cpu.iar, 0);
        assert_eq!(cpu.acc, 0);
        assert!(!cpu.halted);
    }

    #[test]
    fn test_data_instruction() {
        let mut cpu = Cpu::new();
        // DATA R0, 42 → opcode 0xA, regA=0 → 0xA0, followed by 42
        cpu.load_program(&[0xA0, 42]);
        cpu.step();
        assert_eq!(cpu.get_reg(RegId::R0), 42);
        assert_eq!(cpu.iar, 2); // consumed 2 bytes
    }

    #[test]
    fn test_add_registers() {
        let mut cpu = Cpu::new();
        // DATA R0, 10  → 0xA0, 10
        // DATA R1, 20  → 0xA4, 20   (regA=1 → bits 3-2 = 01 → 0xA4)
        // ADD R0, R1   → 0x01        (opcode=0, regA=0, regB=1 → 0x01)
        cpu.load_program(&[0xA0, 10, 0xA4, 20, 0x01]);
        cpu.step(); // DATA R0, 10
        cpu.step(); // DATA R1, 20
        cpu.step(); // ADD R0, R1
        assert_eq!(cpu.get_reg(RegId::R0), 30); // 10 + 20
    }

    #[test]
    fn test_store_and_load() {
        let mut cpu = Cpu::new();
        // DATA R0, 99     → 0xA0, 99
        // STORE R0, [200]  → 0x90, 200  (opcode=9, regA=0)
        // DATA R0, 0       → 0xA0, 0    (clear R0)
        // LOAD R0, [200]   → 0x80, 200  (opcode=8, regA=0)
        cpu.load_program(&[0xA0, 99, 0x90, 200, 0xA0, 0, 0x80, 200]);
        cpu.step(); // DATA R0, 99
        cpu.step(); // STORE R0, [200]
        cpu.step(); // DATA R0, 0
        assert_eq!(cpu.get_reg(RegId::R0), 0);
        cpu.step(); // LOAD R0, [200]
        assert_eq!(cpu.get_reg(RegId::R0), 99);
    }

    #[test]
    fn test_jump() {
        let mut cpu = Cpu::new();
        // addr 0: JMP 4     → 0xC0, 4
        // addr 2: DATA R0, 1 → 0xA0, 1  (should be skipped!)
        // addr 4: DATA R0, 2 → 0xA0, 2  (should execute)
        cpu.load_program(&[0xC0, 4, 0xA0, 1, 0xA0, 2]);
        cpu.step(); // JMP 4
        assert_eq!(cpu.iar, 4);
        cpu.step(); // DATA R0, 2
        assert_eq!(cpu.get_reg(RegId::R0), 2); // 2, not 1
    }

    #[test]
    fn test_conditional_jump() {
        let mut cpu = Cpu::new();
        // DATA R0, 5    → 0xA0, 5
        // DATA R1, 5    → 0xA4, 5
        // CMP R0, R1    → 0x71 (opcode=7, regA=0, regB=1)
        // JE 10         → 0xF0, 10
        cpu.load_program(&[0xA0, 5, 0xA4, 5, 0x71, 0xF0, 10]);
        cpu.step(); // DATA R0, 5
        cpu.step(); // DATA R1, 5
        cpu.step(); // CMP R0, R1
        assert!(cpu.flags.equal);
        cpu.step(); // JE 10
        assert_eq!(cpu.iar, 10); // jumped because equal
    }

    #[test]
    fn test_run_with_breakpoint() {
        let mut cpu = Cpu::new();
        cpu.load_program(&[0xA0, 1, 0xA0, 2, 0xA0, 3]); // 3 DATA instructions
        cpu.add_breakpoint(4); // break before third instruction
        let executed = cpu.run(100);
        assert_eq!(executed, 2); // ran 2 instructions before breakpoint
        assert_eq!(cpu.iar, 4);
    }
}
