// Assembler tests. Expected bytes are hand-encoded from REFERENCE.md (and the
// 2026-10-18 decision adding FPMUL16 = 0x2C), written before running.
import { describe, expect, it, test } from 'vitest';
import { assemble, type AssemblyResult } from './assembler';
import { OP } from './wasm-bridge';
import { SAMPLE_PROGRAMS } from './samples';

const hex = (b: number[]) => b.map(x => x.toString(16).padStart(2, '0').toUpperCase()).join(' ');
const msgs = (r: AssemblyResult) => r.errors.map(e => `L${e.line}: ${e.message}`);

function bytesOf(src: string): number[] {
  const r = assemble(src);
  expect(msgs(r)).toEqual([]);
  return r.bytes;
}

function errorsOf(src: string): string[] {
  const r = assemble(src);
  expect(r.success).toBe(false);
  expect(r.bytes).toEqual([]);
  return msgs(r);
}

// ── The review's 106 cases (scratchpad/review-asm/t/asm.test.ts) ──────────
// 'ERR' = must be an assembly error. The review's INFO cases now have
// concrete expectations.
type Exp = number[] | 'ERR' | { errors: string[] };
const reviewCases: Array<[string, string, Exp]> = [
  // --- every opcode, canonical forms ---
  ['HALT', 'HALT', [0x00, 0x00]],
  ['RET', 'RET', [0x1E, 0x00]],
  ['ADD', 'ADD R1, R2', [0x01, 0x12]],
  ['SUB', 'SUB R15, R0', [0x02, 0xF0]],
  ['MUL', 'MUL R3, R4', [0x03, 0x34]],
  ['DIV', 'DIV R3, R4', [0x04, 0x34]],
  ['MOD', 'MOD R3, R4', [0x05, 0x34]],
  ['MULH', 'MULH R3, R4', [0x0D, 0x34]],
  ['IDIV', 'IDIV R3, R4', [0x29, 0x34]],
  ['IMOD', 'IMOD R3, R4', [0x2A, 0x34]],
  ['FPMUL', 'FPMUL R3, R4', [0x2B, 0x34]],
  ['AND', 'AND R3, R4', [0x09, 0x34]],
  ['OR', 'OR R3, R4', [0x0A, 0x34]],
  ['XOR', 'XOR R3, R4', [0x0B, 0x34]],
  ['CMP', 'CMP R3, R4', [0x0C, 0x34]],
  ['MOV', 'MOV R3, R4', [0x0E, 0x34]],
  ['SHRN', 'SHRN R3, R4', [0x21, 0x34]],
  ['SHLN', 'SHLN R3, R4', [0x22, 0x34]],
  ['LDRI', 'LDRI R3, R4', [0x15, 0x34]],
  ['STRI', 'STRI R3, R4', [0x16, 0x34]],
  ['LDRI32', 'LDRI32 R3, R4', [0x27, 0x34]],
  ['STRI32', 'STRI32 R3, R4', [0x28, 0x34]],
  ['NOT 1-op (assembler copies rA to rB)', 'NOT R3', [0x08, 0x33]],
  ['SHR', 'SHR R3', [0x06, 0x33]],
  ['SHL', 'SHL R3', [0x07, 0x33]],
  ['SHR8', 'SHR8 R3', [0x0F, 0x33]],
  ['SHL8', 'SHL8 R3', [0x17, 0x33]],
  ['PUSH', 'PUSH R7', [0x13, 0x70]],
  ['POP', 'POP R7', [0x14, 0x70]],
  ['OUT', 'OUT R7', [0x1F, 0x70]],
  ['IN', 'IN R7', [0x20, 0x70]],
  ['JMPR', 'JMPR R7', [0x1C, 0x70]],
  ['JMP', 'JMP 0x123456', [0x18, 0x56, 0x34, 0x12]],
  ['JC', 'JC 0x10', [0x19, 0x10, 0, 0]],
  ['JA', 'JA 0x10', [0x1A, 0x10, 0, 0]],
  ['JE', 'JE 0x10', [0x1B, 0x10, 0, 0]],
  ['JZ', 'JZ 0x10', [0x23, 0x10, 0, 0]],
  ['JNZ', 'JNZ 0x10', [0x24, 0x10, 0, 0]],
  ['CALL', 'CALL 0x10', [0x1D, 0x10, 0, 0]],
  ['LOAD', 'LOAD R2, 0x3FFFFF', [0x10, 0x20, 0xFF, 0xFF, 0x3F]],
  ['STORE', 'STORE R2, 0x3FFFFF', [0x11, 0x20, 0xFF, 0xFF, 0x3F]],
  ['LOAD32', 'LOAD32 R2, 0x1000', [0x25, 0x20, 0x00, 0x10, 0x00]],
  ['STORE32', 'STORE32 R2, 0x1000', [0x26, 0x20, 0x00, 0x10, 0x00]],
  ['DATA hex', 'DATA R5, 0x12345678', [0x12, 0x50, 0x78, 0x56, 0x34, 0x12]],
  ['DATA max', 'DATA R5, 0xFFFFFFFF', [0x12, 0x50, 0xFF, 0xFF, 0xFF, 0xFF]],
  ['DATA -1', 'DATA R0, -1', [0x12, 0x00, 0xFF, 0xFF, 0xFF, 0xFF]],
  ['DATA -2147483648', 'DATA R0, -2147483648', [0x12, 0x00, 0, 0, 0, 0x80]],
  ['DATA binary', 'DATA R0, 0b1010', [0x12, 0x00, 10, 0, 0, 0]],
  ['DATA char', "DATA R0, 'A'", [0x12, 0x00, 65, 0, 0, 0]],
  ['lowercase', 'add r1, r2', [0x01, 0x12]],
  ['DB', 'DB 0x7F', [0x7F]],
  ['DB -1', 'DB -1', [0xFF]],
  ['DW LE', 'DW 0x1234', [0x34, 0x12]],
  ['DD LE', 'DD 0x12345678', [0x78, 0x56, 0x34, 0x12]],
  ['comment + tabs + CRLF', '\tADD\tR1,R2 ; c\r\n', [0x01, 0x12]],
  ['label fwd ref', 'JMP end\nend: HALT', [0x18, 4, 0, 0, 0, 0]],
  ['label as imm', 'DATA R1, msg\nmsg: DB 65', [0x12, 0x10, 6, 0, 0, 0, 65]],
  ['label on own line', 'start:\n  JMP start', [0x18, 0, 0, 0]],
  // --- numbers that do not fit / malformed ---
  ['DATA 2^32 overflow', 'DATA R0, 0x100000000', 'ERR'],
  ['DATA 4294967296 overflow', 'DATA R0, 4294967296', 'ERR'],
  ['DATA -4294967297 overflow', 'DATA R0, -4294967297', 'ERR'],
  ['DATA negative hex', 'DATA R0, -0x10', [0x12, 0x00, 0xF0, 0xFF, 0xFF, 0xFF]],
  ['DB 256 overflow', 'DB 256', 'ERR'],
  ['DB 300 overflow', 'DB 300', 'ERR'],
  ['DW 0x12345 overflow', 'DW 0x12345', 'ERR'],
  ['JMP addr >24 bit', 'JMP 0x1000000', 'ERR'],
  ['JMP negative', 'JMP -4', 'ERR'],
  ['LOAD addr > 4MB', 'LOAD R0, 0x400000', 'ERR'],
  ['trailing junk decimal', 'DATA R0, 12abc', 'ERR'],
  ['bad hex digit', 'DATA R0, 0x1G', 'ERR'],
  ['bad binary digit', 'DATA R0, 0b102', 'ERR'],
  ['fraction', 'DATA R0, 1.5', 'ERR'],
  ['multi-char literal', "DATA R0, 'AB'", 'ERR'],
  ['unterminated char', "DATA R0, 'A", 'ERR'],
  // --- char literals ---
  ["escape '\\n'", "DATA R0, '\\n'", [0x12, 0x00, 0x0A, 0, 0, 0]],
  ["escape '\\0'", "DATA R0, '\\0'", [0x12, 0x00, 0x00, 0, 0, 0]],
  ["space ' '", "DATA R0, ' '", [0x12, 0x00, 0x20, 0, 0, 0]],
  ["comma ','", "DATA R0, ','", [0x12, 0x00, 0x2C, 0, 0, 0]],
  ["semicolon ';'", "DATA R0, ';'", [0x12, 0x00, 0x3B, 0, 0, 0]],
  // --- operand count / kind ---
  ['ADD missing rB', 'ADD R1', 'ERR'],
  ['MOV missing rB', 'MOV R1', 'ERR'],
  ['JMP missing target', 'JMP', 'ERR'],
  ['DATA missing imm', 'DATA R1', 'ERR'],
  ['LOAD missing addr', 'LOAD R1', 'ERR'],
  ['PUSH missing reg', 'PUSH', 'ERR'],
  ['ADD extra operand', 'ADD R1, R2, R3', 'ERR'],
  ['NOT extra operand', 'NOT R1, R2', 'ERR'],
  ['HALT extra operand', 'HALT R1', 'ERR'],
  ['PUSH extra operand', 'PUSH R1, R2', 'ERR'],
  ['ADD with immediate', 'ADD R1, 5', 'ERR'],
  ['JMP to register', 'JMP R1', 'ERR'],
  ['DB multiple values', 'DB 1, 2, 3', [1, 2, 3]],
  ['DB string', 'DB "Hi"', [0x48, 0x69]],
  ['DB no value', 'DB', 'ERR'],
  // --- documented bracket syntax ---
  ['LOAD [addr] syntax', 'LOAD R0, [0x100]', [0x10, 0x00, 0x00, 0x01, 0x00]],
  ['LOAD [label] syntax', 'LOAD R0, [v]\nv: DB 1', [0x10, 0x00, 0x05, 0x00, 0x00, 0x01]],
  // --- labels ---
  ['label case: def lower, use UPPER', 'loop: JMP LOOP', [0x18, 0, 0, 0]],
  ['label case: def UPPER, use lower', 'LOOP: JMP loop', [0x18, 0, 0, 0]],
  ['label case: def Mixed, use lower', 'Loop: JMP loop', [0x18, 0, 0, 0]],
  ['undefined label', 'JMP nowhere', 'ERR'],
  ['duplicate label', 'a: HALT\na: HALT', 'ERR'],
  ['label named like register', 'R1: HALT\nDATA R0, R1', 'ERR'],
  ['label named like mnemonic', 'ADD: JMP ADD', { errors: ["L1: 'ADD' can't be a label: ADD is an instruction"] }],
  ['two errors reported (pass1 + pass2)', 'FOO\nADD R1, R99', {
    errors: [
      "L1: unknown mnemonic 'FOO' — if it is a label, add ':' (FOO:)",
      "L2: invalid register 'R99': registers are R0–R15",
    ],
  }],
  ['error line numbers', 'HALT\n\nJMP nowhere', { errors: ["L3: undefined label 'nowhere'"] }],
  ['label no colon', 'loop JMP loop', { errors: ["L1: unknown mnemonic 'LOOP' — missing ':' after a label?"] }],
];

describe('review cases', () => {
  it('has all 106 of them', () => expect(reviewCases.length).toBe(106));
  test.each(reviewCases)('%s: %j', (_name, src, exp) => {
    const r = assemble(src);
    if (exp === 'ERR') {
      expect(r.success).toBe(false);
      expect(r.errors.length).toBeGreaterThan(0);
    } else if (Array.isArray(exp)) {
      expect(msgs(r)).toEqual([]);
      expect(hex(r.bytes)).toBe(hex(exp));
    } else {
      expect(msgs(r)).toEqual(exp.errors);
    }
  });
});

// ── Golden encodings for every mnemonic ───────────────────────────────────
// R10/R5 give the nibbles A/5, so a swapped rA/rB shows.
const golden: Array<[string, number[]]> = [
  ['HALT', [0x00, 0x00]],
  ['ADD R10, R5', [0x01, 0xA5]],
  ['SUB R10, R5', [0x02, 0xA5]],
  ['MUL R10, R5', [0x03, 0xA5]],
  ['DIV R10, R5', [0x04, 0xA5]],
  ['MOD R10, R5', [0x05, 0xA5]],
  ['SHR R10', [0x06, 0xAA]],
  ['SHL R10', [0x07, 0xAA]],
  ['NOT R10', [0x08, 0xAA]],
  ['AND R10, R5', [0x09, 0xA5]],
  ['OR R10, R5', [0x0A, 0xA5]],
  ['XOR R10, R5', [0x0B, 0xA5]],
  ['CMP R10, R5', [0x0C, 0xA5]],
  ['MULH R10, R5', [0x0D, 0xA5]],
  ['MOV R10, R5', [0x0E, 0xA5]],
  ['SHR8 R10', [0x0F, 0xAA]],
  ['LOAD R10, 0x0ABCDE', [0x10, 0xA0, 0xDE, 0xBC, 0x0A]],
  ['STORE R10, [0x0ABCDE]', [0x11, 0xA0, 0xDE, 0xBC, 0x0A]],
  ['DATA R10, 0xCAFEBABE', [0x12, 0xA0, 0xBE, 0xBA, 0xFE, 0xCA]],
  ['PUSH R10', [0x13, 0xA0]],
  ['POP R10', [0x14, 0xA0]],
  ['LDRI R10, R5', [0x15, 0xA5]],
  ['STRI R10, R5', [0x16, 0xA5]],
  ['SHL8 R10', [0x17, 0xAA]],
  ['JMP 0x3A0102', [0x18, 0x02, 0x01, 0x3A]],
  ['JC 0x3A0102', [0x19, 0x02, 0x01, 0x3A]],
  ['JA 0x3A0102', [0x1A, 0x02, 0x01, 0x3A]],
  ['JE 0x3A0102', [0x1B, 0x02, 0x01, 0x3A]],
  ['JMPR R10', [0x1C, 0xA0]],
  ['CALL 0x3A0102', [0x1D, 0x02, 0x01, 0x3A]],
  ['RET', [0x1E, 0x00]],
  ['OUT R10', [0x1F, 0xA0]],
  ['IN R10', [0x20, 0xA0]],
  ['SHRN R10, R5', [0x21, 0xA5]],
  ['SHLN R10, R5', [0x22, 0xA5]],
  ['JZ 0x3A0102', [0x23, 0x02, 0x01, 0x3A]],
  ['JNZ 0x3A0102', [0x24, 0x02, 0x01, 0x3A]],
  ['LOAD32 R10, 0x0ABCDE', [0x25, 0xA0, 0xDE, 0xBC, 0x0A]],
  ['STORE32 R10, [0x0ABCDE]', [0x26, 0xA0, 0xDE, 0xBC, 0x0A]],
  ['LDRI32 R10, R5', [0x27, 0xA5]],
  ['STRI32 R10, R5', [0x28, 0xA5]],
  ['IDIV R10, R5', [0x29, 0xA5]],
  ['IMOD R10, R5', [0x2A, 0xA5]],
  ['FPMUL R10, R5', [0x2B, 0xA5]],
  ['FPMUL16 R10, R5', [0x2C, 0xA5]],
];

describe('golden encoding of every mnemonic', () => {
  test.each(golden)('%s', (src, exp) => expect(hex(bytesOf(src))).toBe(hex(exp)));

  it('covers every opcode in OP, including FPMUL16 = 0x2C', () => {
    const covered = new Set(golden.map(([, b]) => b[0]));
    for (const [name, code] of Object.entries(OP)) {
      expect(covered.has(code), name).toBe(true);
      expect(golden.some(([src, b]) => src.split(' ')[0] === name && b[0] === code), name).toBe(true);
    }
    expect(OP.FPMUL16).toBe(0x2C);
  });

  it('FPMUL16 is 2 bytes like FPMUL and takes two registers', () => {
    expect(bytesOf('FPMUL16 R1, R2\nend: HALT\nJMP end')).toEqual([0x2C, 0x12, 0x00, 0x00, 0x18, 0x02, 0x00, 0x00]);
    expect(errorsOf('FPMUL16 R1')).toEqual(['L1: FPMUL16 expects 2 operands (rA, rB), got 1']);
    expect(errorsOf('fpmul16: HALT')).toEqual(["L1: 'fpmul16' can't be a label: FPMUL16 is an instruction"]);
  });
});

// ── A1: range checks name the allowed range ──────────────────────────────
describe('A1 range checks', () => {
  it('accepts the edges', () => {
    expect(bytesOf('DATA R0, 4294967295')).toEqual([0x12, 0, 0xFF, 0xFF, 0xFF, 0xFF]);
    expect(bytesOf('DATA R0, -2147483648')).toEqual([0x12, 0, 0, 0, 0, 0x80]);
    expect(bytesOf('DB -128, 255')).toEqual([0x80, 0xFF]);
    expect(bytesOf('DW -32768, 65535')).toEqual([0x00, 0x80, 0xFF, 0xFF]);
    expect(bytesOf('DD -2147483648, 0xFFFFFFFF')).toEqual([0, 0, 0, 0x80, 0xFF, 0xFF, 0xFF, 0xFF]);
    expect(bytesOf('LOAD R0, 0x3FFFFF')).toEqual([0x10, 0, 0xFF, 0xFF, 0x3F]);
    expect(bytesOf('JMP 0x3FFFFF')).toEqual([0x18, 0xFF, 0xFF, 0x3F]);
    expect(bytesOf('JMP 0')).toEqual([0x18, 0, 0, 0]);
  });

  it('rejects values just outside, with the range in the message', () => {
    expect(errorsOf('DATA R0, 4294967296')).toEqual(["L1: DATA value 4294967296 doesn't fit in a 32-bit value (-2147483648…4294967295)"]);
    expect(errorsOf('DATA R0, -2147483649')).toEqual(["L1: DATA value -2147483649 doesn't fit in a 32-bit value (-2147483648…4294967295)"]);
    expect(errorsOf('DB 256')).toEqual(["L1: DB value 256 doesn't fit in a byte (-128…255)"]);
    expect(errorsOf('DB -129')).toEqual(["L1: DB value -129 doesn't fit in a byte (-128…255)"]);
    expect(errorsOf('DW 0x12345')).toEqual(["L1: DW value 0x12345 doesn't fit in a 16-bit word (-32768…65535)"]);
    expect(errorsOf('DW -32769')).toEqual(["L1: DW value -32769 doesn't fit in a 16-bit word (-32768…65535)"]);
    expect(errorsOf('DD 0x100000000')).toEqual(["L1: DD value 0x100000000 doesn't fit in a 32-bit value (-2147483648…4294967295)"]);
  });

  it('rejects addresses outside RAM', () => {
    expect(errorsOf('LOAD R0, 0x400000')).toEqual(['L1: address 0x400000 is outside RAM (0x000000–0x3FFFFF)']);
    expect(errorsOf('STORE32 R0, [0x400000]')).toEqual(['L1: address 0x400000 is outside RAM (0x000000–0x3FFFFF)']);
    expect(errorsOf('JMP far\nDB "' + 'a'.repeat(0x3FFFFC) + '"\nfar:')).toEqual([
      "L1: label 'far' is at 0x400000, which is outside RAM (0x000000–0x3FFFFF)",
    ]);
    expect(errorsOf('JMP 0x1000000')).toEqual(['L1: address 0x1000000 is outside RAM (0x000000–0x3FFFFF)']);
    expect(errorsOf('CALL -4')).toEqual(['L1: address -4 is outside RAM (0x000000–0x3FFFFF)']);
  });

  it('checks label values against the directive range', () => {
    // 'far' is at 0x100 = 256, which fits a word but not a byte
    const pad = 'DB ' + Array(256).fill('0').join(', ');
    expect(errorsOf(`${pad}\nfar: DB far`)).toEqual(["L2: DB value far doesn't fit in a byte (-128…255)"]);
    expect(bytesOf(`${pad}\nfar: DW far`).slice(256)).toEqual([0x00, 0x01]);
  });

  it('rejects registers outside R0–R15', () => {
    expect(errorsOf('ADD R1, R16')).toEqual(["L1: invalid register 'R16': registers are R0–R15"]);
    expect(errorsOf('PUSH R001')).toEqual(["L1: invalid register 'R001': registers are R0–R15"]);
  });
});

// ── A2/A3: strict numbers ─────────────────────────────────────────────────
describe('A2/A3 number parsing', () => {
  it('reads every documented form', () => {
    expect(bytesOf('DB 42, 0x2A, 0X2a, 0b101010, 0B101010, 042')).toEqual([42, 42, 42, 42, 42, 42]);
    expect(bytesOf('DATA R0, -0x10')).toEqual([0x12, 0, 0xF0, 0xFF, 0xFF, 0xFF]);
    expect(bytesOf('DATA R0, -0b1')).toEqual([0x12, 0, 0xFF, 0xFF, 0xFF, 0xFF]);
    expect(bytesOf('DB -0x80')).toEqual([0x80]);
  });

  it('names the bad token', () => {
    expect(errorsOf('DATA R0, 0x1G')).toEqual(["L1: invalid hex digit 'G' in 0x1G"]);
    expect(errorsOf('DATA R0, 0b102')).toEqual(["L1: invalid binary digit '2' in 0b102"]);
    expect(errorsOf('DATA R0, 12abc')).toEqual(["L1: invalid number '12abc' (unexpected 'a'); for hex write 0x12abc"]);
    expect(errorsOf('DATA R0, 12xyz')).toEqual(["L1: invalid number '12xyz' (unexpected 'x')"]);
    expect(errorsOf('DATA R0, 1.5')).toEqual(["L1: fractions aren't supported: '1.5' (whole numbers only)"]);
    expect(errorsOf('DATA R0, 0x')).toEqual(["L1: '0x' has no hex digits after 0x"]);
    expect(errorsOf('DATA R0, -')).toEqual(["L1: '-' must be followed by a number"]);
    expect(errorsOf('DATA R0, $10')).toEqual(["L1: unexpected operand '$10'"]);
  });
});

// ── A4: operand counts and kinds ──────────────────────────────────────────
describe('A4 operands', () => {
  it('reports the expected count', () => {
    expect(errorsOf('ADD R1')).toEqual(['L1: ADD expects 2 operands (rA, rB), got 1']);
    expect(errorsOf('ADD R1, R2, R3')).toEqual(['L1: ADD expects 2 operands (rA, rB), got 3']);
    expect(errorsOf('NOT R1, R2')).toEqual(['L1: NOT expects 1 operand (rA), got 2']);
    expect(errorsOf('SHL8')).toEqual(['L1: SHL8 expects 1 operand (rA), got 0']);
    expect(errorsOf('HALT R1')).toEqual(['L1: HALT takes no operands, got 1']);
    expect(errorsOf('RET 0')).toEqual(['L1: RET takes no operands, got 1']);
    expect(errorsOf('JMP')).toEqual(['L1: JMP expects 1 operand (label or address), got 0']);
    expect(errorsOf('LOAD R1')).toEqual(['L1: LOAD expects 2 operands (rA, [addr]), got 1']);
    expect(errorsOf('DATA R1')).toEqual(['L1: DATA expects 2 operands (rA, value), got 1']);
    expect(errorsOf('PUSH')).toEqual(['L1: PUSH expects 1 operand (rA), got 0']);
    expect(errorsOf('LDRI R1')).toEqual(['L1: LDRI expects 2 operands (rA, rB), got 1']);
    expect(errorsOf('ADD R1,, R2')).toEqual(["L1: empty operand (check for an extra ',')"]);
    expect(errorsOf('ADD R1 R2')).toEqual(["L1: missing ',' between 'R1' and 'R2'"]);
  });

  it('explains the wrong kind of operand', () => {
    expect(errorsOf('JMP R1')).toEqual(['L1: JMP takes a label or address; use JMPR R1 to jump to a register']);
    expect(errorsOf('JZ R1')).toEqual(['L1: JZ takes a label or address, not a register']);
    expect(errorsOf('ADD R1, 5')).toEqual(['L1: ADD needs two registers; load 5 first, e.g. DATA R2, 5 then ADD R1, R2']);
    expect(errorsOf('SUB R2, 5')).toEqual(['L1: SUB needs two registers; load 5 first, e.g. DATA R3, 5 then SUB R2, R3']);
    expect(errorsOf('ADD R1, [x]\nx: DB 1')).toEqual(['L1: ADD needs two registers; load [x] first, e.g. LOAD R2, [x] then ADD R1, R2']);
    expect(errorsOf('ADD 5, R1')).toEqual(["L1: ADD needs two registers; '5' is not a register (ADD rA, rB)"]);
    expect(errorsOf('LOAD R1, R2')).toEqual(['L1: LOAD takes an address or label; for an address held in a register use LDRI R1, R2']);
    expect(errorsOf('STORE32 R1, [R2]')).toEqual(['L1: STORE32 takes an address or label; for an address held in a register use STRI32 R1, R2']);
    expect(errorsOf('STORE 0x100, R1')).toEqual(["L1: STORE needs a register first: STORE rA, [addr]; '0x100' is not a register"]);
    expect(errorsOf('LDRI R1, 0x100')).toEqual(['L1: LDRI takes the address in a register (LDRI rA, rB); for a fixed address use LOAD R1, [0x100]']);
    expect(errorsOf('DATA R1, R2')).toEqual(['L1: DATA takes a number or label; to copy a register use MOV R1, R2']);
    expect(errorsOf('DATA R1, [5]')).toEqual(['L1: DATA takes a number or label, not a memory reference; to read memory use LOAD R1, [5]']);
    expect(errorsOf('DATA R1, "Hi"')).toEqual(['L1: DATA takes one value, not a string; put text in memory with DB "Hi"']);
    expect(errorsOf('JMPR loop\nloop: HALT')).toEqual(['L1: JMPR needs a register; to jump to a label or address use JMP loop']);
    expect(errorsOf('PUSH 5')).toEqual(["L1: PUSH needs a register (R0–R15), got '5'"]);
    expect(errorsOf('NOT x\nx: HALT')).toEqual(["L1: NOT needs a register (R0–R15), got 'x'"]);
    expect(errorsOf('DB R1')).toEqual(["L1: DB takes numbers, labels or strings, not registers ('R1')"]);
  });
});

// ── A5: [addr] / [label] ─────────────────────────────────────────────────
describe('A5 bracket addresses', () => {
  it('works for every memory instruction and for jumps', () => {
    expect(bytesOf('STORE R1, [buf]\nbuf: DD 0')).toEqual([0x11, 0x10, 0x05, 0, 0, 0, 0, 0, 0]);
    expect(bytesOf('LOAD32 R2, [ 0x10 ]')).toEqual([0x25, 0x20, 0x10, 0, 0]);
    expect(bytesOf('STORE32 R2, [0x3FFFFC]')).toEqual([0x26, 0x20, 0xFC, 0xFF, 0x3F]);
    expect(bytesOf('start: JMP [start]')).toEqual([0x18, 0, 0, 0]);
    expect(bytesOf('CALL [0x20]')).toEqual([0x1D, 0x20, 0, 0]);
  });

  it('reports malformed brackets', () => {
    expect(errorsOf('LOAD R0, [0x10')).toEqual(["L1: missing ']' in '[0x10'"]);
    expect(errorsOf('LOAD R0, 0x10]')).toEqual(["L1: missing '[' in '0x10]'"]);
    expect(errorsOf('LOAD R0, []')).toEqual(["L1: empty brackets '[]'; write an address or label inside, e.g. [0x1000]"]);
    expect(errorsOf('LOAD R0, [[1]]')).toEqual(["L1: brackets can't be nested: '[1]'"]);
  });

  it('round-trips the editor disassembly syntax', () => {
    // CodeEditor shows "LOAD R1, [0x000100]" and "JMP 0x000010"
    expect(bytesOf('LOAD R1, [0x000100]\nJMP 0x000010\nDATA R1, 4294967295')).toEqual([
      0x10, 0x10, 0x00, 0x01, 0x00, 0x18, 0x10, 0x00, 0x00, 0x12, 0x10, 0xFF, 0xFF, 0xFF, 0xFF,
    ]);
  });
});

// ── A6: char literals and quote-aware parsing ────────────────────────────
describe('A6 character literals', () => {
  it('decodes every escape', () => {
    expect(bytesOf("DB '\\n', '\\r', '\\t', '\\0', '\\\\', '\\'', '\\\"', '\"'")).toEqual([10, 13, 9, 0, 92, 39, 34, 34]);
    expect(bytesOf("DB 'é'")).toEqual([0xE9]);
  });

  it("handles ' ', ',' and ';' and comments after them", () => {
    expect(bytesOf("DB ';', 0 ; comment")).toEqual([0x3B, 0]);
    expect(bytesOf("DB ',', ' ', ':' ; a, b; c")).toEqual([0x2C, 0x20, 0x3A]);
    expect(bytesOf("DATA R0, ';' ; it's fine")).toEqual([0x12, 0, 0x3B, 0, 0, 0]);
    expect(bytesOf("x: DATA R0, ':'")).toEqual([0x12, 0, 0x3A, 0, 0, 0]);
  });

  it('reports bad literals', () => {
    expect(errorsOf("DATA R0, 'AB'")).toEqual(['L1: character literal \'AB\' must hold exactly one character; for text use DB "AB"']);
    expect(errorsOf("DATA R0, 'A")).toEqual(["L1: unterminated character literal 'A (missing closing ')"]);
    expect(errorsOf("DATA R0, ''")).toEqual(["L1: empty character literal ''; for a quote character write '\\''"]);
    expect(errorsOf("DATA R0, '\\q'")).toEqual(["L1: unknown escape '\\q' in character literal '\\q'; use \\n \\r \\t \\0 \\\\ \\' or \\\""]);
    expect(errorsOf("DATA R0, '€'")).toEqual(["L1: character '€' in character literal '€' doesn't fit in a byte (code 8364); only codes 0–255 can be used"]);
    expect(errorsOf("DATA R0, -'A'")).toEqual(["L1: a minus sign can't be used with a character literal (-'A')"]);
  });
});

// ── A7/A9: labels ────────────────────────────────────────────────────────
describe('A7/A9 labels', () => {
  it('matches labels case-insensitively and keeps the defined spelling', () => {
    const r = assemble('HALT\nLoop: JMP LOOP\nJMP loop');
    expect(msgs(r)).toEqual([]);
    expect(r.bytes).toEqual([0, 0, 0x18, 2, 0, 0, 0x18, 2, 0, 0]);
    expect([...r.labels]).toEqual([['Loop', 2]]);
    expect(r.labelMap).toBe(r.labels);
  });

  it('reports duplicates with the first line, ignoring case', () => {
    expect(errorsOf('HALT\nHALT\nloop: HALT\nLOOP: HALT')).toEqual(["L4: duplicate label 'LOOP' (first defined on line 3)"]);
    expect(errorsOf('a: b: HALT\nb: HALT')).toEqual(["L2: duplicate label 'b' (first defined on line 1)"]);
  });

  it('rejects names of registers, mnemonics and directives without cascading', () => {
    expect(errorsOf('R1: HALT')).toEqual(["L1: 'R1' can't be a label: it is named like a register"]);
    expect(errorsOf('r20: HALT')).toEqual(["L1: 'r20' can't be a label: it is named like a register"]);
    expect(errorsOf('add: HALT\nJMP add')).toEqual(["L1: 'add' can't be a label: ADD is an instruction"]);
    expect(errorsOf('db: HALT')).toEqual(["L1: 'db' can't be a label: DB is a directive"]);
    expect(errorsOf('1st: HALT')).toEqual(["L1: invalid label name '1st': labels start with a letter or '_' and contain only letters, digits and '_'"]);
  });

  it('suggests a close label for an undefined one', () => {
    expect(errorsOf('loop: HALT\nJMP lop')).toEqual(["L2: undefined label 'lop' — did you mean 'loop'?"]);
    expect(errorsOf('JMP nowhere')).toEqual(["L1: undefined label 'nowhere'"]);
  });

  it('allows several labels on one line and labels with underscores and digits', () => {
    expect(bytesOf('_a: b2: HALT\nJMP _a\nJMP B2')).toEqual([0, 0, 0x18, 0, 0, 0, 0x18, 0, 0, 0]);
  });
});

// ── A8: DB/DW/DD lists and strings ───────────────────────────────────────
describe('A8 data directives', () => {
  it('accepts lists and strings', () => {
    expect(bytesOf('DB "Hi", 0')).toEqual([0x48, 0x69, 0]);
    expect(bytesOf('DB "a,b;c"')).toEqual([0x61, 0x2C, 0x62, 0x3B, 0x63]);
    expect(bytesOf('DB "say \\"hi\\"\\n"')).toEqual([0x73, 0x61, 0x79, 0x20, 0x22, 0x68, 0x69, 0x22, 0x0A]);
    expect(bytesOf("DB 'A', 66, \"C\"")).toEqual([65, 66, 67]);
    expect(bytesOf('DW 1, 0x1234')).toEqual([1, 0, 0x34, 0x12]);
    expect(bytesOf('DW "AB"')).toEqual([0x41, 0, 0x42, 0]);
    expect(bytesOf('DD 1, -1')).toEqual([1, 0, 0, 0, 0xFF, 0xFF, 0xFF, 0xFF]);
    expect(bytesOf('DB ""\nx: DB x')).toEqual([0]);
  });

  it('sizes lists and strings the same in both passes', () => {
    expect(bytesOf('DB "Hi", 0\nend: HALT\nJMP end')).toEqual([0x48, 0x69, 0, 0, 0, 0x18, 3, 0, 0]);
    expect(bytesOf('DATA R1, after\nDW 1, 2, "ab"\nafter: HALT')).toEqual([
      0x12, 0x10, 14, 0, 0, 0, 1, 0, 2, 0, 0x61, 0, 0x62, 0, 0, 0,
    ]);
    // A bad value still takes its slot, so later labels don't move
    const r = assemble('DB 1, 0xZZ, 3\nend: HALT');
    expect(msgs(r)).toEqual(["L1: invalid hex digit 'Z' in 0xZZ"]);
    expect(r.labels.get('end')).toBe(3);
  });

  it('reports missing values and unterminated strings', () => {
    expect(errorsOf('DB')).toEqual(['L1: DB expects at least one value, e.g. DB 0x41 or DB "Hi", 0']);
    expect(errorsOf('DW')).toEqual(['L1: DW expects at least one value, e.g. DW 0x41']);
    expect(errorsOf('DB "Hi')).toEqual(['L1: unterminated string "Hi (missing closing ")']);
    expect(errorsOf('DB [5]')).toEqual(['L1: DB takes values, not memory references; write DB 5 instead of DB [5]']);
  });
});

// ── A10: all errors in one assemble ──────────────────────────────────────
describe('A10 error reporting', () => {
  it('reports errors from every line, sorted by line', () => {
    expect(errorsOf('FOO R1\nADD R1, R99\nJMP nowhere\nDB 300\nDATA R0, 0x1G')).toEqual([
      "L1: unknown mnemonic 'FOO'",
      "L2: invalid register 'R99': registers are R0–R15",
      "L3: undefined label 'nowhere'",
      "L4: DB value 300 doesn't fit in a byte (-128…255)",
      "L5: invalid hex digit 'G' in 0x1G",
    ]);
  });

  it("doesn't cascade from a bad line", () => {
    // the bad lines keep their size, so 'end' stays where it belongs
    expect(errorsOf('ADD R1\nJMP end\nend: HALT')).toEqual(['L1: ADD expects 2 operands (rA, rB), got 1']);
    expect(errorsOf('LOAD R1, [nowhere], 3\nJMP end\nend: HALT')).toEqual(['L1: LOAD expects 2 operands (rA, [addr]), got 3']);
    expect(errorsOf('loop JMP loop\nJMP loop')).toEqual(["L1: unknown mnemonic 'LOOP' — missing ':' after a label?"]);
  });

  it('keeps the {line, message} shape and points at the right line with CRLF', () => {
    const r = assemble('HALT\r\n; comment\r\n\r\n  ADD R1\r\n');
    expect(r.errors).toEqual([{ line: 4, message: 'ADD expects 2 operands (rA, rB), got 1' }]);
    expect(r.size).toBe(0);
  });

  it('reports a program that runs past the end of RAM', () => {
    const half = 'DB "' + 'a'.repeat(0x200000) + '"';
    expect(errorsOf(`${half}\n${half}\nDB 1`)).toEqual(['L3: the program is too large: it runs past the end of RAM (0x000000–0x3FFFFF)']);
  });
});

// ── Unknown mnemonics ────────────────────────────────────────────────────
describe('unknown mnemonics', () => {
  it('suggests the real one', () => {
    expect(errorsOf('JNE x\nx: HALT')).toEqual(["L1: unknown mnemonic 'JNE' — did you mean JNZ?"]);
    expect(errorsOf('LD R1, 5')).toEqual(["L1: unknown mnemonic 'LD' — did you mean LOAD?"]);
    expect(errorsOf('move R1, R2')).toEqual(["L1: unknown mnemonic 'MOVE' — did you mean MOV?"]);
    expect(errorsOf('ADDD R1, R2')).toEqual(["L1: unknown mnemonic 'ADDD' — did you mean ADD?"]);
    expect(errorsOf('HALTT')).toEqual(["L1: unknown mnemonic 'HALTT' — did you mean HALT?"]);
  });

  it('says INC, DEC and NOP do not exist and what to use', () => {
    expect(errorsOf('INC R1')).toEqual(["L1: unknown mnemonic 'INC': there is no INC instruction; keep 1 in a register and add it, e.g. DATA R2, 1 then ADD R1, R2"]);
    expect(errorsOf('DEC R1')).toEqual(["L1: unknown mnemonic 'DEC': there is no DEC instruction; keep 1 in a register and subtract it, e.g. DATA R2, 1 then SUB R1, R2"]);
    expect(errorsOf('NOP')).toEqual(["L1: unknown mnemonic 'NOP': there is no NOP instruction; MOV R0, R0 leaves every register unchanged (it may update the flags)"]);
  });

  it('spots a label missing its colon', () => {
    expect(errorsOf('loop JMP loop')).toEqual(["L1: unknown mnemonic 'LOOP' — missing ':' after a label?"]);
    expect(errorsOf('msg DB "Hi"\nDATA R0, msg')).toEqual(["L1: unknown mnemonic 'MSG' — missing ':' after a label?"]);
    expect(errorsOf('loop')).toEqual(["L1: unknown mnemonic 'LOOP' — if it is a label, add ':' (loop:)"]);
  });
});

// ── A11: address maps ────────────────────────────────────────────────────
describe('A11 address maps', () => {
  const src = [
    '; header',          // 1
    'start:',            // 2
    '  DATA R1, 5',      // 3  @0, 6 bytes
    '',                  // 4
    '  DB "Hi", 0',      // 5  @6, 3 bytes
    'loop: ADD R1, R1',  // 6  @9, 2 bytes
    '  JMP loop',        // 7  @11, 4 bytes
  ].join('\n');

  it('maps every emitted range to its line', () => {
    const r = assemble(src);
    expect(msgs(r)).toEqual([]);
    expect(r.size).toBe(15);
    expect([...r.addressToLine]).toEqual([[0, 3], [6, 5], [9, 6], [11, 7]]);
    expect(r.spans).toEqual([
      { line: 3, address: 0, size: 6, kind: 'code' },
      { line: 5, address: 6, size: 3, kind: 'data' },
      { line: 6, address: 9, size: 2, kind: 'code' },
      { line: 7, address: 11, size: 4, kind: 'code' },
    ]);
    expect(r.addressMap.get(2)).toBe(0);
    expect(r.addressMap.get(4)).toBe(6);
    expect(r.addressMap.get(6)).toBe(9);
    expect(r.addressMap.size).toBe(7);
  });

  it('keeps the maps even when there are errors', () => {
    const r = assemble('ADD R1\nHALT');
    expect(r.success).toBe(false);
    expect([...r.addressToLine]).toEqual([[0, 1], [2, 2]]);
  });
});

// ── Every sample program assembles ───────────────────────────────────────
// mandelbrot and mandelbrot_anim define a label 'fpmul:', which is now
// rejected because FPMUL is an instruction (A9). samples.ts belongs to the UX
// work; until it renames the label, apply that rename here. Once it does, this
// function changes nothing.
const pendingSampleFix = (code: string) =>
  code.replace(/^fpmul:/gm, 'fpmul_sw:').replace(/\bCALL(\s+)fpmul\b/g, 'CALL$1fpmul_sw');

describe('sample programs', () => {
  test.each(Object.entries(SAMPLE_PROGRAMS))('%s assembles without errors', (_key, p) => {
    const r = assemble(pendingSampleFix(p.code));
    expect(msgs(r)).toEqual([]);
    expect(r.bytes.length).toBeGreaterThan(0);

    // spans tile the program exactly, and addressToLine has one entry per span
    let next = 0;
    for (const s of r.spans) {
      expect(s.address).toBe(next);
      expect(r.addressToLine.get(s.address)).toBe(s.line);
      next += s.size;
    }
    expect(next).toBe(r.bytes.length);
    expect(r.addressToLine.size).toBe(r.spans.length);
  });
});
