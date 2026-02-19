// ============================================================================
// alu.rs — Arithmetic Logic Unit (8-bit)
// ============================================================================
// This is the behavioral equivalent of your C# ALU8 class.
// Instead of composing FullAdder → Adder8 → ALU8 from individual gates,
// we use Rust's native bitwise operators which compile to single CPU
// instructions. The RESULTS are identical — just millions of times faster.
//
// Your C# ALU8 supported 8 operations selected by a 3-bit opcode:
//   000 = ADD, 001 = SHR, 010 = SHL, 011 = NOT,
//   100 = AND, 101 = OR,  110 = XOR, 111 = CMP
// We preserve that exact encoding here.
// ============================================================================

use serde::{Deserialize, Serialize};

/// The 8 ALU operations, matching your C# Decoder3x8 opcode mapping.
/// In Rust, `#[repr(u8)]` means each variant is stored as a single byte.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[repr(u8)]
pub enum AluOp {
    Add = 0, // 000
    Shr = 1, // 001 — Shift Right
    Shl = 2, // 010 — Shift Left
    Not = 3, // 011
    And = 4, // 100
    Or  = 5, // 101
    Xor = 6, // 110
    Cmp = 7, // 111 — Compare (XOR + flag check)
}

impl AluOp {
    /// Convert a 3-bit opcode (0-7) to an AluOp.
    /// Returns None if the value is out of range.
    pub fn from_bits(bits: u8) -> Option<AluOp> {
        match bits & 0x07 {
            0 => Some(AluOp::Add),
            1 => Some(AluOp::Shr),
            2 => Some(AluOp::Shl),
            3 => Some(AluOp::Not),
            4 => Some(AluOp::And),
            5 => Some(AluOp::Or),
            6 => Some(AluOp::Xor),
            7 => Some(AluOp::Cmp),
            _ => None, // Can't happen due to & 0x07, but Rust wants exhaustive matching
        }
    }

    /// Human-readable name (matches your C# Operation() method)
    pub fn name(&self) -> &'static str {
        match self {
            AluOp::Add => "ADD",
            AluOp::Shr => "SHR",
            AluOp::Shl => "SHL",
            AluOp::Not => "NOT",
            AluOp::And => "AND",
            AluOp::Or  => "OR",
            AluOp::Xor => "XOR",
            AluOp::Cmp => "CMP",
        }
    }
}

/// The result of an ALU operation — all outputs in one struct.
/// This replaces your C# ALU8's multiple output properties
/// (Output, OCarry, IsALarger, IsEqual, IsZero).
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct AluResult {
    pub value: u8,       // The 8-bit result
    pub carry: bool,     // Carry/borrow output
    pub a_larger: bool,  // Comparator: A > B
    pub equal: bool,     // Comparator: A == B
    pub zero: bool,      // Is result zero? (your ZeroGate8)
}

/// Execute an ALU operation.
///
/// This single function replaces your entire ALU class hierarchy:
///   ALU8 → Adder8 → FullAdder → XorGate → NandGate...
///
/// # Arguments
/// * `a` - First operand (8-bit), from Register A
/// * `b` - Second operand (8-bit), from Register B
/// * `op` - Which operation to perform (3-bit selector)
/// * `carry_in` - Carry input flag
///
/// # Returns
/// An `AluResult` with the output value and all flags
pub fn alu_execute(a: u8, b: u8, op: AluOp, carry_in: bool) -> AluResult {
    // Carry input as a number (0 or 1) for arithmetic
    let ci = carry_in as u16;

    // Compute the result and carry based on the operation
    let (value, carry) = match op {
        AluOp::Add => {
            // Your C# Adder8: ripple-carry addition of 8 FullAdders
            // Here it's one addition. Result is identical.
            let sum = (a as u16) + (b as u16) + ci;
            (sum as u8, sum > 0xFF) // carry if sum exceeds 8 bits
        }
        AluOp::Shr => {
            // Your C# ShiftRight8: shift right, carry_in enters bit 7
            let carry_out = (a & 0x01) != 0; // bit 0 falls off
            let shifted = a >> 1;
            let result = if carry_in { shifted | 0x80 } else { shifted };
            (result, carry_out)
        }
        AluOp::Shl => {
            // Your C# ShiftLeft8: shift left, carry_in enters bit 0
            let carry_out = (a & 0x80) != 0; // bit 7 falls off
            let shifted = a << 1;
            let result = if carry_in { shifted | 0x01 } else { shifted };
            (result, carry_out)
        }
        AluOp::Not => {
            // Your C# NOTer8: invert all bits
            (!a, false)
        }
        AluOp::And => {
            // Your C# ANDer8: bitwise AND
            (a & b, false)
        }
        AluOp::Or => {
            // Your C# ORer8: bitwise OR
            (a | b, false)
        }
        AluOp::Xor => {
            // Your C# XORer8: bitwise XOR
            (a ^ b, false)
        }
        AluOp::Cmp => {
            // Your C# Comparator: XOR to detect differences,
            // but the primary outputs are the comparison flags
            (a ^ b, false)
        }
    };

    AluResult {
        value,
        carry,
        a_larger: a > b,  // Your C# _xorer.OALarger
        equal: a == b,     // Your C# _xorer.OEqual
        zero: value == 0,  // Your C# ZeroGate8 (chain of ORs + NOT)
    }
}

// ============================================================================
// Tests — these validate that our behavioral ALU matches your gate-level ALU
// ============================================================================
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add_basic() {
        let r = alu_execute(3, 5, AluOp::Add, false);
        assert_eq!(r.value, 8);
        assert!(!r.carry);
        assert!(!r.zero);
    }

    #[test]
    fn test_add_with_carry_in() {
        let r = alu_execute(3, 5, AluOp::Add, true);
        assert_eq!(r.value, 9); // 3 + 5 + 1
    }

    #[test]
    fn test_add_overflow() {
        let r = alu_execute(255, 1, AluOp::Add, false);
        assert_eq!(r.value, 0); // wraps around
        assert!(r.carry);       // carry set
        assert!(r.zero);        // result is zero
    }

    #[test]
    fn test_shr() {
        let r = alu_execute(0b10110100, 0, AluOp::Shr, false);
        assert_eq!(r.value, 0b01011010);
        assert!(!r.carry); // bit 0 was 0
    }

    #[test]
    fn test_shr_with_carry() {
        let r = alu_execute(0b00000011, 0, AluOp::Shr, true);
        assert_eq!(r.value, 0b10000001); // carry_in goes to bit 7
        assert!(r.carry); // bit 0 (was 1) shifted out
    }

    #[test]
    fn test_shl() {
        let r = alu_execute(0b01011010, 0, AluOp::Shl, false);
        assert_eq!(r.value, 0b10110100);
        assert!(!r.carry);
    }

    #[test]
    fn test_not() {
        let r = alu_execute(0b10101010, 0, AluOp::Not, false);
        assert_eq!(r.value, 0b01010101);
    }

    #[test]
    fn test_and() {
        let r = alu_execute(0b11110000, 0b10101010, AluOp::And, false);
        assert_eq!(r.value, 0b10100000);
    }

    #[test]
    fn test_or() {
        let r = alu_execute(0b11110000, 0b10101010, AluOp::Or, false);
        assert_eq!(r.value, 0b11111010);
    }

    #[test]
    fn test_xor() {
        let r = alu_execute(0b11110000, 0b10101010, AluOp::Xor, false);
        assert_eq!(r.value, 0b01011010);
    }

    #[test]
    fn test_cmp_equal() {
        let r = alu_execute(42, 42, AluOp::Cmp, false);
        assert!(r.equal);
        assert!(!r.a_larger);
        assert!(r.zero); // XOR of equal values = 0
    }

    #[test]
    fn test_cmp_a_larger() {
        let r = alu_execute(100, 50, AluOp::Cmp, false);
        assert!(!r.equal);
        assert!(r.a_larger);
    }

    #[test]
    fn test_zero_flag() {
        let r = alu_execute(0xFF, 0xFF, AluOp::Xor, false);
        assert_eq!(r.value, 0);
        assert!(r.zero);
    }

    #[test]
    fn test_all_ops_from_bits() {
        // Verify opcode encoding matches your C# decoder
        assert_eq!(AluOp::from_bits(0), Some(AluOp::Add));
        assert_eq!(AluOp::from_bits(1), Some(AluOp::Shr));
        assert_eq!(AluOp::from_bits(2), Some(AluOp::Shl));
        assert_eq!(AluOp::from_bits(3), Some(AluOp::Not));
        assert_eq!(AluOp::from_bits(4), Some(AluOp::And));
        assert_eq!(AluOp::from_bits(5), Some(AluOp::Or));
        assert_eq!(AluOp::from_bits(6), Some(AluOp::Xor));
        assert_eq!(AluOp::from_bits(7), Some(AluOp::Cmp));
    }
}
