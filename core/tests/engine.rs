// Engine behaviour tests (public API only). Ported from the 2026-10-18 review
// tests and updated to Hans's decisions: CMP compares like rA − rB, faults halt
// with a message, IAR and SP are 22-bit.
use gatestack_core::WasmCpu;

// ── Tiny encoder ────────────────────────────────────────────────────────────
fn data(r: u8, v: u32) -> Vec<u8> { let b = v.to_le_bytes(); vec![0x12, r << 4, b[0], b[1], b[2], b[3]] }
fn mem_op(op: u8, r: u8, a: u32) -> Vec<u8> { vec![op, r << 4, a as u8, (a >> 8) as u8, (a >> 16) as u8] }
fn store(r: u8, a: u32) -> Vec<u8> { mem_op(0x11, r, a) }
fn jump(op: u8, a: u32) -> Vec<u8> { vec![op, a as u8, (a >> 8) as u8, (a >> 16) as u8] }
fn rr(op: u8, a: u8, b: u8) -> Vec<u8> { vec![op, (a << 4) | b] }
fn halt() -> Vec<u8> { vec![0, 0] }
fn prog(parts: &[Vec<u8>]) -> Vec<u8> { parts.concat() }
fn cpu_with(p: &[u8]) -> WasmCpu { let mut c = WasmCpu::new(); c.load_program(p); c }
fn flags(c: &WasmCpu) -> (bool, bool, bool, bool) { (c.get_carry(), c.get_zero(), c.get_a_larger(), c.get_equal()) }

const ADD: u8 = 0x01; const SUB: u8 = 0x02; const SHL8: u8 = 0x17; const CMP: u8 = 0x0C;
const FPMUL: u8 = 0x2B;
const STRI: u8 = 0x16; const STRI32: u8 = 0x28; const LDRI32: u8 = 0x27;
const LOAD32: u8 = 0x25; const STORE32: u8 = 0x26;
const PUSH: u8 = 0x13; const POP: u8 = 0x14; const IN: u8 = 0x20; const OUT: u8 = 0x1F;
const JMP: u8 = 0x18; const JC: u8 = 0x19; const JA: u8 = 0x1A; const JE: u8 = 0x1B;
const JZ: u8 = 0x23; const JNZ: u8 = 0x24; const JMPR: u8 = 0x1C; const CALL: u8 = 0x1D; const RET: u8 = 0x1E;

// ── Vsync ───────────────────────────────────────────────────────────────────

#[test]
fn vsync_flips_when_single_stepping() {
    let p = prog(&[data(0, 7), store(0, 0x3C0000), store(0, 0x3FFFFF), halt()]);
    let mut c = cpu_with(&p);
    c.step(); c.step(); c.step();
    assert_eq!(c.peek(0x3D0000), 7, "front buffer not updated by vsync during step()");
    assert_eq!(c.get_cycle_count(), 3.0);
}

#[test]
fn vsync_as_first_instruction_of_run_flips_and_yields() {
    let p = prog(&[store(0, 0x3FFFFF), data(1, 1), halt()]);
    let mut c = cpu_with(&p);
    c.poke(0x3C0000, 9);
    let n = c.run(100);
    assert_eq!(c.peek(0x3D0000), 9, "no page flip");
    assert_eq!(n, 1, "run() did not yield at vsync");
    assert_eq!(c.get_iar(), 5);
}

#[test]
fn vsync_alias_via_stri_flips() {
    // 0xFFFFFFFF masks to 0x3FFFFF: the byte lands there, so it is a vsync
    let p = prog(&[data(0, 1), data(1, 0xFFFF_FFFF), rr(STRI, 0, 1), data(2, 2), halt()]);
    let mut c = cpu_with(&p);
    c.poke(0x3C0000, 5);
    let n = c.run(100);
    assert_eq!(n, 3);
    assert_eq!(c.peek(0x3FFFFF), 1);
    assert_eq!(c.peek(0x3D0000), 5);
}

#[test]
fn vsync_alias_via_store_24bit_address_flips() {
    let p = prog(&[store(0, 0x7FFFFF), halt()]);
    let mut c = cpu_with(&p);
    c.poke(0x3C0010, 4);
    assert_eq!(c.run(100), 1);
    assert_eq!(c.peek(0x3D0010), 4);
}

#[test]
fn vsync_via_stri_and_stri32_when_stepping() {
    let p = prog(&[data(1, 0x3FFFFF), rr(STRI, 0, 1), data(2, 0x3FFFFC), rr(STRI32, 0, 2), halt()]);
    let mut c = cpu_with(&p);
    c.poke(0x3C0000, 1);
    c.step(); c.step();
    assert_eq!(c.peek(0x3D0000), 1, "STRI vsync");
    c.poke(0x3C0000, 2);
    c.step(); c.step();
    assert_eq!(c.peek(0x3D0000), 2, "STRI32 vsync");
}

#[test]
fn store32_vsync_flip_at_run() {
    let p = prog(&[data(0, 0), mem_op(STORE32, 0, 0x3FFFFC), data(1, 1), halt()]);
    let mut c = cpu_with(&p);
    c.poke(0x3CFFFF, 3);
    let n = c.run(100);
    assert_eq!(n, 2);
    assert_eq!(c.peek(0x3DFFFF), 3);
}

#[test]
fn skip_vsync_runs_through() {
    let p = prog(&[store(0, 0x3FFFFF), data(1, 1), halt()]);
    let mut c = cpu_with(&p);
    c.set_skip_vsync(true);
    c.poke(0x3C0000, 9);
    assert_eq!(c.run(100), 2);
    assert!(c.is_halted());
    assert_eq!(c.peek(0x3D0000), 0);
}

// ── Breakpoints ─────────────────────────────────────────────────────────────

#[test]
fn breakpoint_hit_at_batch_boundary() {
    let p = prog(&[data(0, 1), data(1, 2), data(2, 3), halt()]);
    let mut c = cpu_with(&p);
    c.add_breakpoint(6);
    c.run(1);                 // batch ends with iar == 6 (budget exhausted)
    assert_eq!(c.get_iar(), 6);
    assert_eq!(c.run(100), 0, "breakpoint at batch start was skipped");
    assert_eq!(c.get_iar(), 6);
    assert_eq!(c.get_register(1), 0);
}

#[test]
fn breakpoint_on_first_instruction_stops_then_resumes() {
    // loop: DATA R1,1 ; ADD R0,R1 ; JMP 0
    let p = prog(&[data(1, 1), rr(ADD, 0, 1), jump(JMP, 0)]);
    let mut c = cpu_with(&p);
    c.add_breakpoint(0);
    assert_eq!(c.run(100), 0, "must stop before executing the breakpoint");
    assert_eq!(c.get_breakpoint_resume(), 0);
    assert_eq!(c.run(100), 3, "resume executes the breakpoint once, then stops on it again");
    assert_eq!(c.get_iar(), 0);
    assert_eq!(c.get_register(0), 1);
    assert_eq!(c.run(100), 3);
    assert_eq!(c.get_register(0), 2);
}

#[test]
fn step_always_executes_even_on_a_breakpoint() {
    let p = prog(&[data(0, 1), data(1, 2), halt()]);
    let mut c = cpu_with(&p);
    c.add_breakpoint(0);
    c.add_breakpoint(6);
    c.step();
    assert_eq!(c.get_iar(), 6);
    c.step();
    assert_eq!(c.get_iar(), 12);
    assert_eq!(c.get_register(1), 2);
}

#[test]
fn breakpoint_resume_only_applies_at_its_address() {
    let p = prog(&[data(0, 1), data(1, 2), halt()]);
    let mut c = cpu_with(&p);
    c.add_breakpoint(0);
    assert_eq!(c.run(10), 0);
    c.set_iar(6); // moved away (e.g. a restore): the resume is dropped by the next run
    assert_eq!(c.run(10), 1);
    assert!(c.is_halted());
    assert_eq!(c.get_breakpoint_resume(), -1);
    // an explicit -1 cancels a pending resume
    let mut c = cpu_with(&p);
    c.add_breakpoint(0);
    assert_eq!(c.run(10), 0);
    c.set_breakpoint_resume(-1);
    assert_eq!(c.run(10), 0, "no resume pending, stops again");
    assert_eq!(c.run(10), 2);
    assert!(c.is_halted());
}

#[test]
fn reset_clears_breakpoint_resume() {
    let mut c = cpu_with(&prog(&[data(0, 1), halt()]));
    c.add_breakpoint(0);
    c.run(10);
    c.reset();
    assert_eq!(c.get_breakpoint_resume(), -1);
    assert_eq!(c.run(10), 0);
}

// ── ALU and flags ───────────────────────────────────────────────────────────

#[test]
fn cmp_sets_flags_as_subtraction() {
    // (a, b) -> (carry, zero, a_larger, equal)
    let cases: [(u32, u32, (bool, bool, bool, bool)); 6] = [
        (0, 1, (true, false, false, false)),
        (5, 5, (false, true, false, true)),
        (7, 3, (false, false, true, false)),
        (0, 0, (false, true, false, true)),
        (0xFFFF_FFFF, 0, (false, false, true, false)),
        (0, 0xFFFF_FFFF, (true, false, false, false)),
    ];
    for (a, b, f) in cases {
        let mut c = cpu_with(&prog(&[data(0, a), data(1, b), rr(CMP, 0, 1), halt()]));
        c.run(10);
        assert_eq!(flags(&c), f, "CMP {a:#x},{b:#x}");
        assert_eq!(c.get_register(0), a, "CMP must not store");
    }
}

#[test]
fn flag_matrix() {
    // op, a, b, expected result, (carry, zero, a_larger, equal)
    type Row = (u8, u32, u32, u32, (bool, bool, bool, bool));
    let rows: [Row; 18] = [
        (ADD, 0xFFFF_FFFF, 1, 0, (true, true, true, false)),
        (ADD, 2, 3, 5, (false, false, false, false)),
        (SUB, 0, 1, 0xFFFF_FFFF, (true, false, false, false)),
        (SUB, 4, 4, 0, (false, true, false, true)),
        (0x03, 0x10000, 0x10000, 0, (true, true, false, true)),         // MUL
        (0x0D, 0x10000, 0x10000, 1, (false, false, false, true)),       // MULH
        (0x04, 7, 0, 0, (false, true, true, false)),                    // DIV by 0
        (0x05, 7, 2, 1, (false, false, true, false)),                   // MOD
        (0x06, 3, 0, 1, (true, false, true, false)),                    // SHR (rB = R1)
        (0x07, 0x8000_0000, 0, 0, (true, true, true, false)),           // SHL
        (0x08, 0, 0, 0xFFFF_FFFF, (false, false, false, true)),         // NOT
        (0x09, 0xF0, 0x0F, 0, (false, true, true, false)),              // AND
        (0x0B, 9, 9, 0, (false, true, false, true)),                    // XOR
        (0x0E, 1, 0, 0, (false, true, true, false)),                    // MOV
        (0x0F, 0x80, 0, 0, (true, true, true, false)),                  // SHR8
        (SHL8, 0x0100_0000, 0, 0, (true, true, true, false)),           // SHL8 loses bit 24
        (0x21, 6, 1, 3, (false, false, true, false)),                   // SHRN
        (0x22, 0x8000_0001, 1, 2, (true, false, true, false)),          // SHLN
    ];
    for (op, a, b, res, f) in rows {
        let mut c = cpu_with(&prog(&[data(0, a), data(1, b), rr(op, 0, 1), halt()]));
        c.run(10);
        assert_eq!(c.get_register(0), res, "op {op:#04x} {a:#x},{b:#x}");
        assert_eq!(flags(&c), f, "flags of op {op:#04x} {a:#x},{b:#x}");
    }
}

#[test]
fn shl8_carry_is_any_bit_shifted_out() {
    for (a, carry) in [(0x0100_0000u32, true), (0x8000_0000, true), (0x0080_0000, false), (0xFF, false)] {
        let mut c = cpu_with(&prog(&[data(0, a), rr(SHL8, 0, 0), halt()]));
        c.run(10);
        assert_eq!(c.get_register(0), a << 8);
        assert_eq!(c.get_carry(), carry, "SHL8 {a:#x}");
    }
}

#[test]
fn signed_division_edges() {
    let cases: [(i32, i32, i32, i32); 5] = [(-7, 2, -3, -1), (7, -2, -3, 1), (i32::MIN, -1, i32::MIN, 0), (5, 0, 0, 0), (-1, 0, 0, 0)];
    for (a, b, q, r) in cases {
        let mut c = cpu_with(&prog(&[data(0, a as u32), data(1, b as u32), rr(0x0E, 2, 0), rr(0x29, 0, 1), rr(0x2A, 2, 1), halt()]));
        c.run(10);
        assert_eq!((c.get_register(0) as i32, c.get_register(2) as i32), (q, r), "{a}/{b}");
    }
}

#[test]
fn fpmul_is_signed_8_8_floor() {
    let mut c = cpu_with(&prog(&[data(0, (-384i32) as u32), data(1, 512), rr(FPMUL, 0, 1), data(2, (-1i32) as u32), data(3, 1), rr(FPMUL, 2, 3), halt()]));
    c.run(20);
    assert_eq!(c.get_register(0) as i32, -768);
    assert_eq!(c.get_register(2) as i32, -1);
}

#[test]
fn shift_amounts_masked_to_5_bits() {
    let mut c = cpu_with(&prog(&[data(0, 0x8000_0000), data(1, 32), rr(0x21, 0, 1), data(2, 1), data(3, 33), rr(0x22, 2, 3), halt()]));
    c.run(20);
    assert_eq!(c.get_register(0), 0x8000_0000);
    assert_eq!(c.get_register(2), 2);
}

// ── Jumps ───────────────────────────────────────────────────────────────────

/// Runs `setup ; Jcc 0x40 ; DATA R9,1 ; HALT` with `DATA R9,2 ; HALT` at 0x40; returns R9.
fn branch(setup: Vec<u8>, op: u8) -> u32 {
    let mut p = prog(&[setup, jump(op, 0x40), data(9, 1), halt()]);
    p.resize(0x40, 0);
    p.extend(prog(&[data(9, 2), halt()]));
    let mut c = cpu_with(&p);
    c.run(100);
    assert!(c.is_halted());
    c.get_register(9)
}

#[test]
fn conditional_jumps_taken_and_not_taken() {
    let cmp = |a: u32, b: u32| prog(&[data(0, a), data(1, b), rr(CMP, 0, 1)]);
    assert_eq!(branch(cmp(0, 1), JC), 2);
    assert_eq!(branch(cmp(1, 0), JC), 1);
    assert_eq!(branch(cmp(2, 1), JA), 2);
    assert_eq!(branch(cmp(1, 2), JA), 1);
    assert_eq!(branch(cmp(1, 1), JA), 1);
    assert_eq!(branch(cmp(3, 3), JE), 2);
    assert_eq!(branch(cmp(3, 4), JE), 1);
    assert_eq!(branch(cmp(3, 3), JZ), 2);
    assert_eq!(branch(cmp(0, 1), JZ), 1, "CMP 0,1 is not equal");
    assert_eq!(branch(cmp(0, 1), JNZ), 2);
    assert_eq!(branch(cmp(5, 5), JNZ), 1);
    assert_eq!(branch(vec![], JMP), 2);
}

#[test]
fn jmpr_masks_to_22_bits() {
    let mut p = prog(&[data(0, 0xC000_0040), rr(JMPR, 0, 0), halt()]);
    p.resize(0x40, 0);
    p.extend(prog(&[data(1, 5), halt()]));
    let mut c = cpu_with(&p);
    c.step(); c.step();
    assert_eq!(c.get_iar(), 0x40);
    c.run(10);
    assert_eq!(c.get_register(1), 5);
}

#[test]
fn iar_masked_after_jmp_to_24bit_alias() {
    // JMP 0x400004 -> 0x000004: CALL there pushes a 22-bit return address
    let mut p = prog(&[jump(JMP, 0x400004), jump(CALL, 0x10), halt()]);
    p.resize(0x10, 0);
    p.extend(prog(&[rr(POP, 7, 0), rr(PUSH, 7, 0), rr(RET, 0, 0)]));
    let mut c = cpu_with(&p);
    c.step();
    assert_eq!(c.get_iar(), 4);
    c.run(20);
    assert!(c.is_halted());
    assert_eq!(c.get_register(7), 8);
    assert_eq!(c.get_iar(), 8);
}

#[test]
fn sp_wraps_to_22_bits() {
    let mut c = cpu_with(&prog(&[rr(PUSH, 0, 0), rr(POP, 1, 0), rr(POP, 1, 0), halt()]));
    c.set_sp(0);
    c.step();
    assert_eq!(c.get_sp(), 0x3F_FFFC);
    c.step();
    assert_eq!(c.get_sp(), 0);
    c.set_sp(0x3F_FFFE);
    c.step();
    assert_eq!(c.get_sp(), 2);
    c.set_sp(0xFFFF_FFFF);
    assert_eq!(c.get_sp(), 0x3F_FFFF);
}

#[test]
fn push_at_init_sp_does_not_touch_vram() {
    let mut c = cpu_with(&prog(&[data(0, 0xFFFF_FFFF), rr(PUSH, 0, 0), halt()]));
    c.run(10);
    assert_eq!(c.get_sp(), 0x3B_FFFB);
    assert_eq!(c.peek(0x3C0000), 0);
    assert_eq!(c.peek(0x3BFFFF), 0);
    for a in 0x3BFFFB..0x3BFFFF { assert_eq!(c.peek(a), 0xFF); }
}

#[test]
fn call_ret_at_stack_top() {
    let mut c = cpu_with(&[0x1D, 0x08, 0, 0, 0, 0, 0, 0, 0x1E, 0x00]);
    c.run(10);
    assert!(c.is_halted());
    assert_eq!(c.get_iar(), 4);
    assert_eq!(c.get_sp(), 0x3BFFFF);
    assert_eq!([c.peek(0x3BFFFB), c.peek(0x3BFFFC), c.peek(0x3BFFFD), c.peek(0x3BFFFE)], [4, 0, 0, 0]);
}

// ── Memory ──────────────────────────────────────────────────────────────────

#[test]
fn unaligned_32bit_little_endian() {
    let mut c = cpu_with(&prog(&[data(0, 0x11223344), mem_op(STORE32, 0, 0x1001), mem_op(LOAD32, 1, 0x1001), mem_op(0x10, 2, 0x1001), halt()]));
    c.run(10);
    assert_eq!([c.peek(0x1001), c.peek(0x1002), c.peek(0x1003), c.peek(0x1004)], [0x44, 0x33, 0x22, 0x11]);
    assert_eq!(c.get_register(1), 0x11223344);
    assert_eq!(c.get_register(2), 0x44);
}

#[test]
fn word_access_at_last_word_is_fine() {
    let mut c = cpu_with(&prog(&[data(0, 0xA1B2C3D4), data(1, 0x3FFFFC), rr(STRI32, 0, 1), rr(LDRI32, 2, 1), mem_op(LOAD32, 3, 0x3FFFFC), halt()]));
    c.set_skip_vsync(true);
    c.run(20);
    assert!(c.get_fault().is_empty());
    assert_eq!(c.get_register(2), 0xA1B2C3D4);
    assert_eq!(c.get_register(3), 0xA1B2C3D4);
}

// ── Input / output ──────────────────────────────────────────────────────────

#[test]
fn in_waits_and_provide_input_resumes() {
    let p = prog(&[rr(IN, 3, 0), rr(OUT, 3, 0), rr(IN, 4, 0), halt()]);
    let mut c = cpu_with(&p);
    assert_eq!(c.run(10), 0);
    assert!(c.is_input_waiting());
    assert_eq!(c.get_input_register(), 3);
    assert_eq!(c.get_iar(), 0);
    c.run(10);
    assert_eq!(c.get_iar(), 0, "run while waiting does nothing");
    c.provide_input(0x141);
    assert!(!c.is_input_waiting());
    assert_eq!(c.get_iar(), 2);
    assert_eq!(c.get_cycle_count(), 1.0);
    c.run(10);
    assert_eq!(c.drain_console(), vec![0x41]);
    assert!(c.is_input_waiting());
    assert_eq!(c.get_input_register(), 4);
    c.provide_input(0xFFFF_FFFF);
    c.run(10);
    assert!(c.is_halted());
    assert_eq!(c.get_register(4), 0xFFFF_FFFF);
    assert_eq!(c.get_register(3), 0x141);
}

#[test]
fn input_state_can_be_restored() {
    let mut c = cpu_with(&prog(&[rr(IN, 5, 0), halt()]));
    c.set_input_state(true, 5);
    assert_eq!(c.run(10), 0);
    c.provide_input(9);
    assert_eq!(c.get_register(5), 9);
    c.run(10);
    assert!(c.is_halted());
}

// ── Faults ──────────────────────────────────────────────────────────────────

#[test]
fn undefined_opcode_faults() {
    let mut p = vec![0u8; 0x140];
    p[..6].copy_from_slice(&data(0, 1));
    p[6..10].copy_from_slice(&jump(JMP, 0x140));
    p.extend([0x2D, 0x00, 0x00, 0x00]);
    let mut c = cpu_with(&p);
    let n = c.run(100);
    assert_eq!(n, 2, "the illegal opcode is not executed");
    assert!(c.is_halted());
    assert_eq!(c.get_fault(), "Illegal opcode 0x2D at 0x000140");
    assert_eq!(c.get_iar(), 0x140, "IAR stays at the faulting instruction");
    assert_eq!(c.get_cycle_count(), 2.0);
    assert_eq!(c.run(100), 0, "stays halted");
}

#[test]
fn every_undefined_opcode_faults() {
    for op in 0x2Du8..=0xFF {
        let mut c = cpu_with(&[op, 0x00]);
        c.step();
        assert_eq!(c.get_fault(), format!("Illegal opcode 0x{op:02X} at 0x000000"));
    }
}

#[test]
fn word_access_past_end_faults() {
    let p = prog(&[data(0, 0xAABBCCDD), mem_op(STORE32, 0, 0x3FFFFE), halt()]);
    let mut c = cpu_with(&p);
    c.run(10);
    assert!(c.is_halted());
    assert_eq!(c.get_fault(), "32-bit access at 0x3FFFFE runs past the end of RAM (0x3FFFFF)");
    assert_eq!(c.get_iar(), 6);
    assert_eq!(c.peek(0), 0x12, "nothing written into address 0");
    assert_eq!(c.peek(0x3FFFFE), 0, "nothing written at all");
}

#[test]
fn every_32bit_access_past_end_faults() {
    for (addr, msg_addr) in [(0x3FFFFDu32, "3FFFFD"), (0x3FFFFE, "3FFFFE"), (0x3FFFFF, "3FFFFF"), (0x7FFFFE, "3FFFFE")] {
        for op in [LOAD32, STORE32] {
            let mut c = cpu_with(&prog(&[mem_op(op, 0, addr), halt()]));
            c.run(10);
            assert_eq!(c.get_fault(), format!("32-bit access at 0x{msg_addr} runs past the end of RAM (0x3FFFFF)"), "op {op:#x} @ {addr:#x}");
        }
        for op in [LDRI32, STRI32] {
            let mut c = cpu_with(&prog(&[data(1, addr | 0xC000_0000), rr(op, 0, 1), halt()]));
            c.run(10);
            assert_eq!(c.get_fault(), format!("32-bit access at 0x{msg_addr} runs past the end of RAM (0x3FFFFF)"), "op {op:#x} @ {addr:#x}");
            assert_eq!(c.get_iar(), 6);
        }
    }
}

#[test]
fn reset_and_load_clear_the_fault() {
    let mut c = cpu_with(&[0xFF, 0x00]);
    c.run(1);
    assert!(!c.get_fault().is_empty());
    c.reset();
    assert!(c.get_fault().is_empty() && !c.is_halted());
    c.run(1);
    c.hard_reset();
    assert!(c.get_fault().is_empty());
    c.load_program(&[0xFF, 0x00]);
    c.run(1);
    c.load_program(&prog(&[halt()]));
    assert!(c.get_fault().is_empty() && !c.is_halted());
    c.set_fault("x".into());
    assert_eq!(c.get_fault(), "x");
}

// ── Cycle counter ───────────────────────────────────────────────────────────

#[test]
fn cycle_count_passes_2_pow_32() {
    let mut c = cpu_with(&prog(&[data(0, 1), data(0, 1), data(0, 1), halt()]));
    c.set_cycle_count(4_294_967_294.0);
    c.run(10);
    assert!(c.is_halted());
    assert_eq!(c.get_cycle_count(), 4_294_967_297.0);
    c.set_cycle_count(5_000_000_000.0);
    assert_eq!(c.get_cycle_count(), 5_000_000_000.0);
    c.set_cycle_count(-1.0);
    assert_eq!(c.get_cycle_count(), 0.0);
}

// ── Palette ─────────────────────────────────────────────────────────────────

#[test]
fn default_palette_entries() {
    let c = WasmCpu::new();
    let entry = |i: u32| [c.peek(0x3E0000 + i * 4), c.peek(0x3E0001 + i * 4), c.peek(0x3E0002 + i * 4), c.peek(0x3E0003 + i * 4)];
    // Values from the JS engine's Math.round table
    assert_eq!(entry(0), [10, 12, 20, 0]);
    assert_eq!(entry(15), [50, 5, 50, 0]);
    assert_eq!(entry(16), [153, 23, 23, 0]);
    assert_eq!(entry(17), [154, 26, 23, 0]);
    assert_eq!(entry(56), [204, 204, 31, 0]);
    assert_eq!(entry(136), [38, 255, 255, 0]);
    assert_eq!(entry(255), [154, 23, 26, 0]);
}
