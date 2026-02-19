// ============================================================================
// memory.rs — RAM (256 bytes) + MAR (Memory Address Register)
// ============================================================================
// This replaces your C# RAM256 class which contained:
//   - 256 RAMRegister8 objects (each with a Register8, ByteGate8, Enabler8...)
//   - 2 Decoder4x16 objects
//   - A ByteGate8 MAR
//
// Your C# RAM256 created ~90,000+ gate objects at startup.
// This version: one [u8; 256] array = 256 bytes. Same behavior.
//
// HOW IT MAPS TO YOUR C# CODE:
//   RAM256.MAR          → self.mar
//   RAM256.Registers[n] → self.data[n]
//   RAM256.Update(bus, sa, set, enable)
//     → if set: self.write(value)
//     → if enable: self.read() returns value to bus
//   The Decoder4x16 pair → simply self.data[self.mar as usize]
// ============================================================================

use serde::{Deserialize, Serialize};

/// The complete RAM module: 256 bytes of memory + MAR.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ram {
    /// 256 bytes of RAM — replaces your 256 RAMRegister8 objects
    data: Vec<u8>,

    /// Memory Address Register — selects which byte to read/write.
    /// In your C#, this was a ByteGate8 inside RAM256.
    pub mar: u8,
}

impl Ram {
    /// Create a new RAM with all zeros (like your C# constructor)
    pub fn new() -> Self {
        Ram {
            data: vec![0u8; 256],
            mar: 0,
        }
    }

    /// Read the byte at the address stored in MAR.
    ///
    /// This replaces your C# RAM256's decoder logic:
    ///   _decoder[0].Update(MAR bits 0-3)
    ///   _decoder[1].Update(MAR bits 4-7)
    ///   → finds the one register where both decoders output true
    ///   → reads that register
    ///
    /// Behavioral equivalent: just index into the array.
    pub fn read(&self) -> u8 {
        self.data[self.mar as usize]
    }

    /// Write a byte to the address stored in MAR.
    ///
    /// In your C#: sets the selected RAMRegister8 via the bus.
    /// Here: just assign to the array slot.
    pub fn write(&mut self, value: u8) {
        self.data[self.mar as usize] = value;
    }

    /// Set the MAR (Memory Address Register).
    ///
    /// In your C#: MAR.Update(bus, set=true)
    /// The MAR determines which of the 256 RAM cells is selected.
    pub fn set_mar(&mut self, address: u8) {
        self.mar = address;
    }

    /// Load a program (array of bytes) into RAM starting at address 0.
    /// This is how we'll load assembled programs.
    pub fn load_program(&mut self, program: &[u8]) {
        // Only load up to 256 bytes (our RAM size)
        let len = program.len().min(256);
        self.data[..len].copy_from_slice(&program[..len]);
    }

    /// Get a reference to the entire RAM contents (for the UI to display).
    pub fn data(&self) -> &[u8] {
        &self.data
    }

    /// Read the byte at the given address and advance it (for fetching operands).
    pub fn read_next(&self, iar: &mut u8) -> u8 {
        let val = self.data[*iar as usize];
        *iar = iar.wrapping_add(1);
        val
    }

    /// Get a slice of RAM (for partial UI updates — more efficient).
    pub fn slice(&self, start: u8, len: u8) -> &[u8] {
        let s = start as usize;
        let e = (s + len as usize).min(256);
        &self.data[s..e]
    }

    /// Clear all RAM to zeros
    pub fn clear(&mut self) {
        self.data.fill(0);
        self.mar = 0;
    }
}

// ============================================================================
// Tests
// ============================================================================
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_ram_is_zeroed() {
        let ram = Ram::new();
        assert!(ram.data().iter().all(|&b| b == 0));
        assert_eq!(ram.mar, 0);
    }

    #[test]
    fn test_read_write() {
        let mut ram = Ram::new();
        ram.set_mar(42);
        ram.write(0xAB);
        assert_eq!(ram.read(), 0xAB);
    }

    #[test]
    fn test_different_addresses() {
        let mut ram = Ram::new();

        ram.set_mar(0);
        ram.write(0x11);

        ram.set_mar(255);
        ram.write(0xFF);

        ram.set_mar(0);
        assert_eq!(ram.read(), 0x11);

        ram.set_mar(255);
        assert_eq!(ram.read(), 0xFF);
    }

    #[test]
    fn test_load_program() {
        let mut ram = Ram::new();
        let program = vec![0x01, 0x02, 0x03, 0x04];
        ram.load_program(&program);

        ram.set_mar(0);
        assert_eq!(ram.read(), 0x01);
        ram.set_mar(3);
        assert_eq!(ram.read(), 0x04);
        ram.set_mar(4);
        assert_eq!(ram.read(), 0x00); // not part of program
    }

    #[test]
    fn test_slice() {
        let mut ram = Ram::new();
        ram.load_program(&[10, 20, 30, 40, 50]);
        let s = ram.slice(1, 3);
        assert_eq!(s, &[20, 30, 40]);
    }

    #[test]
    fn test_clear() {
        let mut ram = Ram::new();
        ram.set_mar(100);
        ram.write(0xFF);
        ram.clear();
        ram.set_mar(100);
        assert_eq!(ram.read(), 0);
    }
}
