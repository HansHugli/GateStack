// ============================================================================
// assembler.ts — Two-pass assembler for the GateStack 32-bit ISA (REFERENCE.md)
// ============================================================================
// Encoding:
//   ALU (2 regs):  [opcode:8] [rA:4 | rB:4]                       = 2 bytes
//   ALU (1 reg):   NOT/SHR/SHL/SHR8/SHL8 encode rB = rA           = 2 bytes
//   PUSH/POP/OUT/IN/JMPR: [opcode:8] [rA:4 | 0:4]                 = 2 bytes
//   LDRI/STRI/LDRI32/STRI32: [opcode:8] [rA:4 | rB:4]             = 2 bytes
//   HALT/RET:      [opcode:8] [0x00]                              = 2 bytes
//   JMP/JC/JA/JE/JZ/JNZ/CALL: [opcode:8] [addr:24 LE]             = 4 bytes
//   LOAD/STORE/LOAD32/STORE32: [opcode:8] [rA:4|0:4] [addr:24 LE] = 5 bytes
//   DATA:          [opcode:8] [rA:4 | 0:4] [imm:32 LE]            = 6 bytes
//   DB / DW / DD:  1 / 2 / 4 bytes per value (lists and "strings" allowed)
//
// Syntax accepted:
//   label:  MNEMONIC operand, operand   ; comment
//   - numbers: 42, -10, 0xFF, -0x10, 0b1010, 'A', '\n' (escapes \n \r \t \0 \\ \' \")
//   - addresses: 0x1000, label, [0x1000], [label]
//   - labels are case-insensitive; they may not be named like a register,
//     an instruction or a directive
//   - every error in the program is reported in one go, with its line
// ============================================================================

import { OP } from './wasm-bridge';

export interface AssemblyError {
  line: number;    // 1-based source line
  message: string;
}

/** One emitted byte range: `size` bytes at `address` come from source `line`. */
export interface SourceSpan {
  line: number;    // 1-based source line
  address: number;
  size: number;
  kind: 'code' | 'data';
}

export interface AssemblyResult {
  success: boolean;
  bytes: number[];                    // empty when there are errors
  errors: AssemblyError[];            // sorted by line
  addressMap: Map<number, number>;    // line (1-based) → address of the next byte at that line (every line)
  addressToLine: Map<number, number>; // start address of every emitted instruction/directive → line (1-based)
  labelMap: Map<string, number>;      // label (as written at its definition) → address
  labels: Map<string, number>;        // alias of labelMap for CodeEditor
  size: number;                       // byte count
  spans: SourceSpan[];                // every emitted byte range, in address order
}

// ── Machine constants ────────────────────────────────────────────────────

const RAM_TOP = 0x3FFFFF;
const IMM_MIN = -0x80000000;
const IMM_MAX = 0xFFFFFFFF;

// ── Instruction table ────────────────────────────────────────────────────

type Kind = 'none' | 'alu2' | 'alu1' | 'reg1' | 'ind' | 'mem' | 'imm' | 'jump';
type DataKind = 'DB' | 'DW' | 'DD';

const KIND_SIZE: Record<Kind, number> = {
  none: 2, alu2: 2, alu1: 2, reg1: 2, ind: 2, mem: 5, imm: 6, jump: 4,
};

/** What each kind's operands are called in messages. */
const KIND_OPERANDS: Record<Kind, string[]> = {
  none: [],
  alu2: ['rA', 'rB'],
  alu1: ['rA'],
  reg1: ['rA'],
  ind: ['rA', 'rB'],
  mem: ['rA', '[addr]'],
  imm: ['rA', 'value'],
  jump: ['label or address'],
};

const MNEMONICS: Record<string, { opcode: number; kind: Kind }> = {
  HALT:    { opcode: OP.HALT,    kind: 'none' },
  RET:     { opcode: OP.RET,     kind: 'none' },
  ADD:     { opcode: OP.ADD,     kind: 'alu2' },
  SUB:     { opcode: OP.SUB,     kind: 'alu2' },
  MUL:     { opcode: OP.MUL,     kind: 'alu2' },
  MULH:    { opcode: OP.MULH,    kind: 'alu2' },
  DIV:     { opcode: OP.DIV,     kind: 'alu2' },
  MOD:     { opcode: OP.MOD,     kind: 'alu2' },
  IDIV:    { opcode: OP.IDIV,    kind: 'alu2' },
  IMOD:    { opcode: OP.IMOD,    kind: 'alu2' },
  FPMUL:   { opcode: OP.FPMUL,   kind: 'alu2' },
  FPMUL16: { opcode: OP.FPMUL16, kind: 'alu2' },
  SHRN:    { opcode: OP.SHRN,    kind: 'alu2' },
  SHLN:    { opcode: OP.SHLN,    kind: 'alu2' },
  AND:     { opcode: OP.AND,     kind: 'alu2' },
  OR:      { opcode: OP.OR,      kind: 'alu2' },
  XOR:     { opcode: OP.XOR,     kind: 'alu2' },
  CMP:     { opcode: OP.CMP,     kind: 'alu2' },
  MOV:     { opcode: OP.MOV,     kind: 'alu2' },
  NOT:     { opcode: OP.NOT,     kind: 'alu1' },
  SHR:     { opcode: OP.SHR,     kind: 'alu1' },
  SHL:     { opcode: OP.SHL,     kind: 'alu1' },
  SHR8:    { opcode: OP.SHR8,    kind: 'alu1' },
  SHL8:    { opcode: OP.SHL8,    kind: 'alu1' },
  LDRI:    { opcode: OP.LDRI,    kind: 'ind' },
  STRI:    { opcode: OP.STRI,    kind: 'ind' },
  LDRI32:  { opcode: OP.LDRI32,  kind: 'ind' },
  STRI32:  { opcode: OP.STRI32,  kind: 'ind' },
  LOAD:    { opcode: OP.LOAD,    kind: 'mem' },
  STORE:   { opcode: OP.STORE,   kind: 'mem' },
  LOAD32:  { opcode: OP.LOAD32,  kind: 'mem' },
  STORE32: { opcode: OP.STORE32, kind: 'mem' },
  DATA:    { opcode: OP.DATA,    kind: 'imm' },
  PUSH:    { opcode: OP.PUSH,    kind: 'reg1' },
  POP:     { opcode: OP.POP,     kind: 'reg1' },
  OUT:     { opcode: OP.OUT,     kind: 'reg1' },
  IN:      { opcode: OP.IN,      kind: 'reg1' },
  JMPR:    { opcode: OP.JMPR,    kind: 'reg1' },
  JMP:     { opcode: OP.JMP,     kind: 'jump' },
  JC:      { opcode: OP.JC,      kind: 'jump' },
  JA:      { opcode: OP.JA,      kind: 'jump' },
  JE:      { opcode: OP.JE,      kind: 'jump' },
  JZ:      { opcode: OP.JZ,      kind: 'jump' },
  JNZ:     { opcode: OP.JNZ,     kind: 'jump' },
  CALL:    { opcode: OP.CALL,    kind: 'jump' },
};

const DIRECTIVES: Record<DataKind, { unit: number; min: number; max: number; what: string }> = {
  DB: { unit: 1, min: -128, max: 255, what: 'a byte' },
  DW: { unit: 2, min: -32768, max: 65535, what: 'a 16-bit word' },
  DD: { unit: 4, min: IMM_MIN, max: IMM_MAX, what: 'a 32-bit value' },
};

/** Register-indirect counterpart of each memory instruction, and back. */
const INDIRECT_OF: Record<string, string> = { LOAD: 'LDRI', STORE: 'STRI', LOAD32: 'LDRI32', STORE32: 'STRI32' };
const DIRECT_OF: Record<string, string> = { LDRI: 'LOAD', STRI: 'STORE', LDRI32: 'LOAD32', STRI32: 'STORE32' };

/** Common mnemonics from other assemblers, mapped to ours. */
const ALIASES: Record<string, string> = {
  JNE: 'JNZ', BNE: 'JNZ', JEQ: 'JE', BEQ: 'JE', JGT: 'JA', JG: 'JA', JCS: 'JC', JB: 'JC',
  JUMP: 'JMP', BRA: 'JMP', B: 'JMP', JR: 'JMPR', JSR: 'CALL', BL: 'CALL', RETURN: 'RET', RTS: 'RET',
  LD: 'LOAD', LDA: 'LOAD', LDB: 'LOAD', ST: 'STORE', STA: 'STORE', STR: 'STORE', LDR: 'LDRI',
  LDI: 'DATA', LI: 'DATA', MVI: 'DATA', SET: 'DATA',
  MOVE: 'MOV', MV: 'MOV', COMPARE: 'CMP',
  LSR: 'SHR', LSL: 'SHL', SAL: 'SHL',
  MULT: 'MUL', DIVIDE: 'DIV', REM: 'MOD',
  PRINT: 'OUT', PUTC: 'OUT', OUTPUT: 'OUT', INPUT: 'IN', GETC: 'IN', READ: 'IN',
  HLT: 'HALT', STOP: 'HALT', END: 'HALT',
};

const MISSING: Record<string, string> = {
  INC: 'there is no INC instruction; keep 1 in a register and add it, e.g. DATA R2, 1 then ADD R1, R2',
  DEC: 'there is no DEC instruction; keep 1 in a register and subtract it, e.g. DATA R2, 1 then SUB R1, R2',
  NOP: 'there is no NOP instruction; MOV R0, R0 leaves every register unchanged (it may update the flags)',
};

// ── Operands ─────────────────────────────────────────────────────────────

type Value =
  | { kind: 'num'; value: number }
  | { kind: 'label'; name: string };

type Operand =
  | { kind: 'reg'; reg: number; text: string }
  | { kind: 'value'; value: Value; text: string }
  | { kind: 'mem'; inner: Operand; text: string }
  | { kind: 'string'; codes: number[]; text: string };

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T>(value: T): Parsed<T> => ({ ok: true, value });
const fail = <T>(error: string): Parsed<T> => ({ ok: false, error });

const ESCAPES: Record<string, number> = { n: 10, r: 13, t: 9, '0': 0, '\\': 92, "'": 39, '"': 34 };

/** Index just past the closing quote of the literal starting at `start`, or -1 if unterminated. */
function scanQuoted(s: string, start: number): number {
  const q = s[start];
  for (let i = start + 1; i < s.length; i++) {
    if (s[i] === '\\') { i++; continue; }
    if (s[i] === q) return i + 1;
  }
  return -1;
}

/** Remove a `;` comment, ignoring `;` inside quotes. */
function stripComment(raw: string): string {
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === "'" || c === '"') {
      const end = scanQuoted(raw, i);
      if (end < 0) return raw; // unterminated: the operand parser reports it
      i = end - 1;
    } else if (c === ';') {
      return raw.slice(0, i);
    }
  }
  return raw;
}

/** Split operands on commas that are outside quotes and brackets. */
function splitOperands(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'" || c === '"') {
      const end = scanQuoted(s, i);
      if (end < 0) break;
      i = end - 1;
    } else if (c === '[') depth++;
    else if (c === ']') depth = Math.max(0, depth - 1);
    else if (c === ',' && depth === 0) {
      parts.push(s.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(s.slice(start).trim());
  return parts;
}

/** Decode the body of a quoted literal into character codes 0–255. */
function decodeQuoted(body: string, what: string): Parsed<number[]> {
  const codes: number[] = [];
  const chars = Array.from(body);
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (c === '\\') {
      const e = chars[++i];
      if (e === undefined) return fail(`'\\' at the end of ${what}; write '\\\\' for a backslash`);
      if (!(e in ESCAPES)) {
        return fail(`unknown escape '\\${e}' in ${what}; use \\n \\r \\t \\0 \\\\ \\' or \\"`);
      }
      codes.push(ESCAPES[e]);
      continue;
    }
    const code = c.codePointAt(0)!;
    if (code > 255) {
      return fail(`character '${c}' in ${what} doesn't fit in a byte (code ${code}); only codes 0–255 can be used`);
    }
    codes.push(code);
  }
  return ok(codes);
}

function parseCharLiteral(t: string): Parsed<number> {
  const end = scanQuoted(t, 0);
  if (end < 0) return fail(`unterminated character literal ${t} (missing closing ')`);
  if (end !== t.length) return fail(`unexpected '${t.slice(end)}' after character literal ${t.slice(0, end)}`);
  const body = t.slice(1, -1);
  const d = decodeQuoted(body, `character literal ${t}`);
  if (!d.ok) return d;
  if (d.value.length === 0) return fail(`empty character literal ''; for a quote character write '\\''`);
  if (d.value.length > 1) {
    return fail(`character literal ${t} must hold exactly one character; for text use DB "${body}"`);
  }
  return ok(d.value[0]);
}

/** Strict whole-token number: [-]0x…, [-]0b…, [-]decimal, or a character literal. */
export function parseNumber(t: string): Parsed<number> {
  if (t.startsWith("'")) return parseCharLiteral(t);
  let s = t;
  const neg = s.startsWith('-');
  if (neg) s = s.slice(1);
  if (s === '') return fail(`'-' must be followed by a number`);
  if (s.startsWith("'")) return fail(`a minus sign can't be used with a character literal (${t})`);
  let v: number;
  if (/^0x/i.test(s)) {
    const digits = s.slice(2);
    if (!digits) return fail(`'${t}' has no hex digits after 0x`);
    const bad = digits.search(/[^0-9a-f]/i);
    if (bad >= 0) return fail(`invalid hex digit '${digits[bad]}' in ${t}`);
    v = parseInt(digits, 16);
  } else if (/^0b/i.test(s)) {
    const digits = s.slice(2);
    if (!digits) return fail(`'${t}' has no binary digits after 0b`);
    const bad = digits.search(/[^01]/);
    if (bad >= 0) return fail(`invalid binary digit '${digits[bad]}' in ${t}`);
    v = parseInt(digits, 2);
  } else if (/^[0-9]/.test(s)) {
    if (/^[0-9]+\.[0-9]*$/.test(s)) return fail(`fractions aren't supported: '${t}' (whole numbers only)`);
    const bad = s.search(/[^0-9]/);
    if (bad >= 0) {
      const hint = /^[0-9a-f]+$/i.test(s) ? `; for hex write 0x${s}` : '';
      return fail(`invalid number '${t}' (unexpected '${s[bad]}')${hint}`);
    }
    v = Number(s);
  } else {
    return fail(`'${t}' is not a number`);
  }
  return ok(neg ? -v : v);
}

function hasSpaceOutsideQuotes(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "'" || s[i] === '"') {
      const end = scanQuoted(s, i);
      if (end < 0) return false;
      i = end - 1;
    } else if (/\s/.test(s[i])) return true;
  }
  return false;
}

function parseOperand(t: string, allowBrackets = true): Parsed<Operand> {
  if (t === '') return fail(`empty operand (check for an extra ',')`);
  if (t.startsWith('[')) {
    if (!t.endsWith(']')) return fail(`missing ']' in '${t}'`);
    if (!allowBrackets) return fail(`brackets can't be nested: '${t}'`);
    const innerText = t.slice(1, -1).trim();
    if (!innerText) return fail(`empty brackets '[]'; write an address or label inside, e.g. [0x1000]`);
    const inner = parseOperand(innerText, false);
    if (!inner.ok) return inner;
    if (inner.value.kind === 'string') return fail(`a string can't be used as an address: '${t}'`);
    return ok({ kind: 'mem', inner: inner.value, text: t });
  }
  if (t.endsWith(']') && !/^['"]/.test(t)) return fail(`missing '[' in '${t}'`);
  if (t.startsWith('"')) {
    const end = scanQuoted(t, 0);
    if (end < 0) return fail(`unterminated string ${t} (missing closing ")`);
    if (end !== t.length) return fail(`unexpected '${t.slice(end)}' after string ${t.slice(0, end)}`);
    const d = decodeQuoted(t.slice(1, -1), `string ${t}`);
    if (!d.ok) return d;
    return ok({ kind: 'string', codes: d.value, text: t });
  }
  if (hasSpaceOutsideQuotes(t)) {
    const words = t.split(/\s+/);
    return fail(`missing ',' between '${words[0]}' and '${words[1]}'`);
  }
  const reg = /^R(\d+)$/i.exec(t);
  if (reg) {
    const n = Number(reg[1]);
    if (n > 15 || reg[1].length > 2) return fail(`invalid register '${t}': registers are R0–R15`);
    return ok({ kind: 'reg', reg: n, text: t });
  }
  if (/^[A-Za-z_]\w*$/.test(t)) return ok({ kind: 'value', value: { kind: 'label', name: t }, text: t });
  if (/^[-0-9']/.test(t)) {
    const n = parseNumber(t);
    if (!n.ok) return n;
    return ok({ kind: 'value', value: { kind: 'num', value: n.value }, text: t });
  }
  return fail(`unexpected operand '${t}'`);
}

// ── Helpers ──────────────────────────────────────────────────────────────

function editDistance(a: string, b: string): number {
  const d: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return d[b.length];
}

function closest(word: string, candidates: Iterable<string>): string | undefined {
  let best: string | undefined;
  let bestD = Infinity;
  for (const c of candidates) {
    const dist = editDistance(word.toUpperCase(), c.toUpperCase());
    if (dist < bestD) { bestD = dist; best = c; }
  }
  const limit = word.length <= 3 ? 1 : 2;
  return bestD <= limit && bestD < word.length ? best : undefined;
}

const hex6 = (n: number) => '0x' + n.toString(16).toUpperCase().padStart(6, '0');
const RAM_RANGE = `(${hex6(0)}–${hex6(RAM_TOP)})`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function isKnownWord(u: string): boolean {
  return u in MNEMONICS || u in DIRECTIVES;
}

/** Why `name` can't be a label, or null if it can. */
function labelProblem(name: string): string | null {
  const u = name.toUpperCase();
  if (!/^[A-Za-z_]\w*$/.test(name)) {
    return `invalid label name '${name}': labels start with a letter or '_' and contain only letters, digits and '_'`;
  }
  if (/^R\d+$/.test(u)) return `'${name}' can't be a label: it is named like a register`;
  if (u in MNEMONICS) return `'${name}' can't be a label: ${u} is an instruction`;
  if (u in DIRECTIVES) return `'${name}' can't be a label: ${u} is a directive`;
  return null;
}

function unknownMnemonicMessage(word: string, hasOperands: boolean): string {
  const u = word.toUpperCase();
  if (MISSING[u]) return `unknown mnemonic '${u}': ${MISSING[u]}`;
  // A lone word is more likely a label without ':' than a misspelt instruction
  // that needs operands, so only suggest operand-less instructions then.
  const candidates = Object.keys(MNEMONICS).filter(k => hasOperands || MNEMONICS[k].kind === 'none');
  if (hasOperands) candidates.push(...Object.keys(DIRECTIVES));
  const alias = ALIASES[u] ?? closest(u, candidates);
  if (alias) return `unknown mnemonic '${u}' — did you mean ${alias}?`;
  if (!hasOperands && /^[A-Za-z_]\w*$/.test(word)) {
    return `unknown mnemonic '${u}' — if it is a label, add ':' (${word}:)`;
  }
  return `unknown mnemonic '${u}'`;
}

// ── Source items ─────────────────────────────────────────────────────────

interface Item {
  line: number;
  mnemonic: string;          // upper case
  kind: Kind | 'data';
  opcode: number;
  operands: Operand[];
  size: number;
  address: number;
  bad: boolean;              // has an error already: emit filler, don't resolve
}

// ── Assembler ────────────────────────────────────────────────────────────

export function assemble(source: string): AssemblyResult {
  const lines = source.split('\n');
  const errors: AssemblyError[] = [];
  const err = (line: number, message: string) => { errors.push({ line, message }); };

  // label index: UPPER name → definition
  const labelIndex = new Map<string, { name: string; address: number; line: number }>();
  const rejectedLabels = new Set<string>(); // UPPER names reported as invalid (no cascades)
  const addressMap = new Map<number, number>();
  const items: Item[] = [];
  let pc = 0;
  let overflowReported = false;

  const defineLabel = (name: string, line: number) => {
    const problem = labelProblem(name);
    const u = name.toUpperCase();
    if (problem) {
      err(line, problem);
      rejectedLabels.add(u);
      return;
    }
    const prev = labelIndex.get(u);
    if (prev) {
      err(line, `duplicate label '${name}' (first defined on line ${prev.line})`);
      return;
    }
    labelIndex.set(u, { name, address: pc, line });
  };

  // ── Pass 1: parse, check operands, size, collect labels ─────────────
  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    let code = stripComment(lines[i]).trim();

    // Labels (several may share a line)
    for (;;) {
      const lm = /^([^\s:,;'"[\]]+)\s*:(.*)$/.exec(code);
      if (!lm) break;
      defineLabel(lm[1], lineNum);
      code = lm[2].trim();
    }
    addressMap.set(lineNum, pc);
    if (!code) continue;

    const m = /^(\S+)\s*(.*)$/.exec(code)!;
    let word = m[1];
    let rest = m[2];
    let upper = word.toUpperCase();

    if (!isKnownWord(upper)) {
      // "loop JMP loop": a label missing its ':'
      const next = /^([A-Za-z_]\w*)(\s+(.*))?$/.exec(rest);
      if (next && isKnownWord(next[1].toUpperCase()) && /^[A-Za-z_]\w*$/.test(word)) {
        err(lineNum, `unknown mnemonic '${upper}' — missing ':' after a label?`);
        defineLabel(word, lineNum);
        word = next[1];
        rest = next[3] ?? '';
        upper = word.toUpperCase();
      } else {
        err(lineNum, unknownMnemonicMessage(word, rest.trim() !== ''));
        continue;
      }
    }

    const operandTexts = rest.trim() === '' ? [] : splitOperands(rest);
    const operands: Operand[] = [];
    let bad = false;
    for (const t of operandTexts) {
      const p = parseOperand(t);
      if (p.ok) operands.push(p.value);
      else { err(lineNum, p.error); bad = true; }
    }

    let item: Item;
    if (upper in DIRECTIVES) {
      const dir = DIRECTIVES[upper as DataKind];
      let count = 0;
      if (!bad && operands.length === 0) {
        err(lineNum, `${upper} expects at least one value, e.g. ${upper} 0x41${upper === 'DB' ? ' or DB "Hi", 0' : ''}`);
        bad = true;
      }
      for (const op of operands) {
        if (op.kind === 'string') {
          count += op.codes.length;
        } else {
          count += 1;
          if (op.kind === 'reg') {
            err(lineNum, `${upper} takes numbers, labels or strings, not registers ('${op.text}')`);
            bad = true;
          } else if (op.kind === 'mem') {
            err(lineNum, `${upper} takes values, not memory references; write ${upper} ${op.text.slice(1, -1).trim()} instead of ${upper} ${op.text}`);
            bad = true;
          }
        }
      }
      // An operand that failed to parse still counts as one unit, so later addresses stay put
      count += operandTexts.length - operands.length;
      item = { line: lineNum, mnemonic: upper, kind: 'data', opcode: 0, operands, size: count * dir.unit, address: pc, bad };
    } else {
      const info = MNEMONICS[upper];
      item = { line: lineNum, mnemonic: upper, kind: info.kind, opcode: info.opcode, operands, size: KIND_SIZE[info.kind], address: pc, bad };
      if (!bad) {
        const problem = checkOperands(upper, info.kind, operands);
        if (problem) { err(lineNum, problem); item.bad = true; }
      }
    }

    items.push(item);
    pc += item.size;
    if (pc > RAM_TOP + 1 && !overflowReported) {
      err(lineNum, `the program is too large: it runs past the end of RAM ${RAM_RANGE}`);
      overflowReported = true;
    }
  }

  // ── Pass 2: resolve labels, range-check, emit (runs even after pass-1 errors) ──
  const output: number[] = [];
  const spans: SourceSpan[] = [];
  const addressToLine = new Map<number, number>();

  const resolve = (v: Value, text: string, line: number): number | null => {
    if (v.kind === 'num') return v.value;
    const u = v.name.toUpperCase();
    const def = labelIndex.get(u);
    if (def) return def.address;
    if (rejectedLabels.has(u)) return null; // already reported where it was defined
    const near = closest(v.name, Array.from(labelIndex.values(), d => d.name));
    err(line, `undefined label '${text}'${near ? ` — did you mean '${near}'?` : ''}`);
    return null;
  };

  const resolveAddress = (op: Operand, line: number): number | null => {
    const target = op.kind === 'mem' ? op.inner : op;
    if (target.kind !== 'value') return null;
    const a = resolve(target.value, target.text, line);
    if (a === null) return null;
    if (a < 0 || a > RAM_TOP) {
      const shown = target.value.kind === 'label'
        ? `label '${target.text}' is at ${hex6(a)}, which`
        : `address ${target.text}`;
      err(line, `${shown} is outside RAM ${RAM_RANGE}`);
      return null;
    }
    return a;
  };

  const inRange = (val: number, min: number, max: number, what: string, mnemonic: string, text: string, line: number): boolean => {
    if (val >= min && val <= max) return true;
    err(line, `${mnemonic} value ${text} doesn't fit in ${what} (${min}…${max})`);
    return false;
  };

  for (const item of items) {
    const start = output.length;
    const emit = (...b: number[]) => { for (const x of b) output.push(x & 0xFF); };
    const emit24 = (v: number) => emit(v, v >> 8, v >> 16);
    const emit32 = (v: number) => { const u = v >>> 0; emit(u, u >>> 8, u >>> 16, u >>> 24); };
    const ops = item.operands;
    const rA = ops[0]?.kind === 'reg' ? ops[0].reg : 0;

    if (!item.bad) {
      switch (item.kind) {
        case 'none':
          emit(item.opcode, 0x00);
          break;
        case 'alu2':
        case 'ind': {
          const rB = ops[1].kind === 'reg' ? ops[1].reg : 0;
          emit(item.opcode, (rA << 4) | rB);
          break;
        }
        case 'alu1':
          emit(item.opcode, (rA << 4) | rA);
          break;
        case 'reg1':
          emit(item.opcode, rA << 4);
          break;
        case 'mem': {
          const a = resolveAddress(ops[1], item.line);
          emit(item.opcode, rA << 4);
          emit24(a ?? 0);
          break;
        }
        case 'jump': {
          const a = resolveAddress(ops[0], item.line);
          emit(item.opcode);
          emit24(a ?? 0);
          break;
        }
        case 'imm': {
          const op = ops[1] as Extract<Operand, { kind: 'value' }>;
          let v = resolve(op.value, op.text, item.line);
          if (v !== null && !inRange(v, IMM_MIN, IMM_MAX, 'a 32-bit value', 'DATA', op.text, item.line)) v = null;
          emit(item.opcode, rA << 4);
          emit32(v ?? 0);
          break;
        }
        case 'data': {
          const dir = DIRECTIVES[item.mnemonic as DataKind];
          const put = (v: number) => {
            if (dir.unit === 1) emit(v);
            else if (dir.unit === 2) emit(v, v >> 8);
            else emit32(v);
          };
          for (const op of ops) {
            if (op.kind === 'string') {
              for (const c of op.codes) put(c);
            } else if (op.kind === 'value') {
              let v = resolve(op.value, op.text, item.line);
              if (v !== null && !inRange(v, dir.min, dir.max, dir.what, item.mnemonic, op.text, item.line)) v = null;
              put(v ?? 0);
            }
          }
          break;
        }
      }
    }

    // Keep the byte stream aligned with the pass-1 addresses
    const emitted = output.length - start;
    if (item.bad || emitted !== item.size) {
      if (!item.bad) err(item.line, `internal assembler error: sized ${item.size} bytes but emitted ${emitted}`);
      output.length = start;
      for (let k = 0; k < item.size; k++) output.push(0);
    }

    if (item.size > 0) {
      addressToLine.set(item.address, item.line);
      spans.push({ line: item.line, address: item.address, size: item.size, kind: item.kind === 'data' ? 'data' : 'code' });
    }
  }

  // Labels are exported under the spelling of their definition
  const labelMap = new Map<string, number>();
  labelIndex.forEach(d => labelMap.set(d.name, d.address));

  errors.sort((a, b) => a.line - b.line);
  const success = errors.length === 0;
  return {
    success,
    bytes: success ? output : [],
    errors,
    addressMap,
    addressToLine,
    labelMap,
    labels: labelMap,
    size: success ? output.length : 0,
    spans,
  };
}

/** Check operand count and kinds; returns a learner-facing message or null. */
function checkOperands(m: string, kind: Kind, ops: Operand[]): string | null {
  const names = KIND_OPERANDS[kind];
  if (ops.length !== names.length) {
    if (names.length === 0) return `${m} takes no operands, got ${ops.length}`;
    return `${m} expects ${plural(names.length, 'operand')} (${names.join(', ')}), got ${ops.length}`;
  }
  const [a, b] = ops;
  const notReg = (op: Operand) => op.kind !== 'reg';
  const desc = (op: Operand) => (op.kind === 'string' ? 'a string' : `'${op.text}'`);

  switch (kind) {
    case 'none':
      return null;

    case 'alu2': {
      if (notReg(a)) return `${m} needs two registers; ${desc(a)} is not a register (${m} rA, rB)`;
      if (notReg(b)) {
        const scratch = a.kind === 'reg' && a.reg === 2 ? 3 : 2;
        const then = `then ${m} ${a.text}, R${scratch}`;
        if (b.kind === 'value') return `${m} needs two registers; load ${b.text} first, e.g. DATA R${scratch}, ${b.text} ${then}`;
        if (b.kind === 'mem') return `${m} needs two registers; load ${b.text} first, e.g. LOAD R${scratch}, ${b.text} ${then}`;
        return `${m} needs two registers; ${desc(b)} is not a register`;
      }
      return null;
    }

    case 'ind': {
      if (notReg(a)) return `${m} needs a register first (${m} rA, rB); ${desc(a)} is not a register`;
      if (notReg(b)) {
        if (b.kind === 'value' || b.kind === 'mem') {
          const addr = b.kind === 'mem' ? b.text : `[${b.text}]`;
          return `${m} takes the address in a register (${m} rA, rB); for a fixed address use ${DIRECT_OF[m]} ${a.text}, ${addr}`;
        }
        return `${m} takes two registers; ${desc(b)} is not a register`;
      }
      return null;
    }

    case 'alu1':
    case 'reg1': {
      if (notReg(a)) {
        if (m === 'JMPR' && a.kind !== 'string') {
          const target = a.kind === 'mem' ? a.text.slice(1, -1).trim() : a.text;
          return `JMPR needs a register; to jump to a label or address use JMP ${target}`;
        }
        return `${m} needs a register (R0–R15), got ${desc(a)}`;
      }
      return null;
    }

    case 'mem': {
      if (notReg(a)) return `${m} needs a register first: ${m} rA, [addr]; ${desc(a)} is not a register`;
      const inner = b.kind === 'mem' ? b.inner : b;
      if (inner.kind === 'reg') {
        return `${m} takes an address or label; for an address held in a register use ${INDIRECT_OF[m]} ${a.text}, ${inner.text}`;
      }
      if (inner.kind !== 'value') return `${m} takes an address or label, not ${desc(b)}`;
      return null;
    }

    case 'imm': {
      if (notReg(a)) return `DATA needs a register first: DATA rA, value; ${desc(a)} is not a register`;
      if (b.kind === 'reg') return `DATA takes a number or label; to copy a register use MOV ${a.text}, ${b.text}`;
      if (b.kind === 'mem') return `DATA takes a number or label, not a memory reference; to read memory use LOAD ${a.text}, ${b.text}`;
      if (b.kind === 'string') return `DATA takes one value, not a string; put text in memory with DB ${b.text}`;
      return null;
    }

    case 'jump': {
      const inner = a.kind === 'mem' ? a.inner : a;
      if (inner.kind === 'reg') {
        return m === 'JMP'
          ? `JMP takes a label or address; use JMPR ${inner.text} to jump to a register`
          : `${m} takes a label or address, not a register`;
      }
      if (inner.kind !== 'value') return `${m} takes a label or address, not ${desc(a)}`;
      return null;
    }
  }
}
