// ============================================================================
// trace.rs — Signal Trace Recorder
// ============================================================================
// This is the SECRET SAUCE of the hybrid approach.
//
// The Rust core runs fast behavioral code, but records every micro-operation
// as a "trace" that the React frontend can play back as an animation.
//
// When you single-step in the UI, the frontend reads this trace and
// animates: "data flows from R1 → bus → ALU → ACC" with highlighted
// wires and gate animations — even though no actual gates exist.
//
// Each CycleTrace represents one complete instruction execution and
// contains a list of MicroSteps (the individual signal changes that
// your C# Stepper7 would have produced).
// ============================================================================

use serde::{Deserialize, Serialize};
use crate::alu::{AluOp, AluResult};
use crate::cpu::{Flags, Opcode, RegId};

/// Where data is coming from on the bus (for visualization)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum BusSource {
    IAR,             // Instruction Address Register
    RAM,             // RAM output
    ALU,             // ALU output
    ACC,             // Accumulator
    Reg(RegId),      // General register (R0-R3)
    Immediate(u8),   // Literal value from instruction stream
}

/// A single micro-operation within an instruction cycle.
/// The UI animates these one at a time in single-step mode.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MicroStep {
    /// Data transferred on the bus: source → destination
    BusTransfer {
        source: BusSource,
        dest: String,       // "MAR", "IR", "TMP", "ACC", "R0", "RAM", etc.
        value: u8,
    },

    /// IAR was incremented (program counter advance)
    IncrementIAR {
        new_value: u8,
    },

    /// ALU performed an operation
    AluOperation {
        op: AluOp,
        input_a: u8,
        input_b: u8,
        result: AluResult,
    },

    /// Fetched an operand byte (for 2-byte instructions)
    FetchOperand {
        value: u8,
    },

    /// Jump occurred (or was evaluated)
    Jump {
        target: u8,
        taken: bool,        // Did the jump actually happen?
    },

    /// An error occurred
    Error {
        message: String,
    },
}

// Convenience constructors for MicroStep
impl MicroStep {
    pub fn bus_transfer(source: BusSource, dest: &str, value: u8) -> Self {
        MicroStep::BusTransfer {
            source,
            dest: dest.to_string(),
            value,
        }
    }

    pub fn increment_iar(new_value: u8) -> Self {
        MicroStep::IncrementIAR { new_value }
    }

    pub fn alu_op(op: AluOp, input_a: u8, input_b: u8, result: AluResult) -> Self {
        MicroStep::AluOperation { op, input_a, input_b, result }
    }

    pub fn fetch_operand(value: u8) -> Self {
        MicroStep::FetchOperand { value }
    }

    pub fn jump(target: u8, taken: bool) -> Self {
        MicroStep::Jump { target, taken }
    }
}

/// The complete trace of one instruction execution.
/// Serialized to JSON and sent to the React frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CycleTrace {
    /// Address this instruction was at
    pub address: u8,

    /// The instruction that was executed
    pub opcode: Option<Opcode>,
    pub reg_a: Option<RegId>,
    pub reg_b: Option<RegId>,

    /// Sequence of micro-operations (for step-by-step animation)
    pub steps: Vec<MicroStep>,

    /// Flags after execution
    pub flags: Option<Flags>,

    /// Cycle number
    pub cycle: u64,

    /// Was CPU halted?
    pub halted: bool,

    /// Error message if something went wrong
    pub error: Option<String>,
}

impl CycleTrace {
    pub fn new(address: u8) -> Self {
        CycleTrace {
            address,
            opcode: None,
            reg_a: None,
            reg_b: None,
            steps: Vec::new(),
            flags: None,
            cycle: 0,
            halted: false,
            error: None,
        }
    }

    pub fn halted(address: u8) -> Self {
        let mut trace = CycleTrace::new(address);
        trace.halted = true;
        trace
    }

    pub fn push(&mut self, step: MicroStep) {
        self.steps.push(step);
    }

    pub fn set_instruction(&mut self, opcode: Opcode, reg_a: RegId, reg_b: RegId) {
        self.opcode = Some(opcode);
        self.reg_a = Some(reg_a);
        self.reg_b = Some(reg_b);
    }

    pub fn set_flags(&mut self, flags: Flags) {
        self.flags = Some(flags);
    }

    pub fn set_cycle(&mut self, cycle: u64) {
        self.cycle = cycle;
    }

    pub fn set_error(&mut self, msg: &str) {
        self.error = Some(msg.to_string());
    }
}
