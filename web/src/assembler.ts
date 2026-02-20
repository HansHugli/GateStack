// ============================================================================
// assembler.ts — Two-pass assembler for GateStack 16-bit ISA
// ============================================================================
// Encoding:
//   ALU ops:   [opcode:8] [rA:4 | rB:4]               = 2 bytes
//   PUSH/POP:  [opcode:8] [rA:4 | 0:4]                = 2 bytes
//   OUT/IN:    [opcode:8] [rA:4 | 0:4]                = 2 bytes
//   JMPR:      [opcode:8] [rA:4 | 0:4]                = 2 bytes
//   RET/HALT:  [opcode:8] [0x00]                       = 2 bytes
//   JMP/JC/JA/JE/CALL: [opcode:8] [addr_lo:8] [addr_hi:8] = 3 bytes
//   LOAD/STORE: [opcode:8] [rA:4 | 0:4] [addr_lo:8] [addr_hi:8] = 4 bytes
//   DATA:      [opcode:8] [rA:4 | 0:4] [imm_lo:8] [imm_hi:8]   = 4 bytes
//   DB:        [byte:8]                                 = 1 byte
//   DW:        [lo:8] [hi:8]                            = 2 bytes
// ============================================================================

import { OP, instrSize } from './wasm-bridge';

export interface AssemblyResult {
  success: boolean;
  bytes: number[];
  errors: Array<{ line: number; message: string }>;
  addressMap: Map<number, number>;    // line → address
  addressToLine: Map<number, number>; // address → line (for CodeEditor)
  labelMap: Map<string, number>;      // label → address
  labels: Map<string, number>;        // alias for CodeEditor
  size: number;                       // byte count
}

interface ParsedLine {
  lineNum: number;
  label?: string;
  mnemonic?: string;
  args: string[];
  raw: string;
}

const REGISTERS: Record<string, number> = {
  R0: 0, R1: 1, R2: 2, R3: 3, R4: 4, R5: 5, R6: 6, R7: 7,
  R8: 8, R9: 9, R10: 10, R11: 11, R12: 12, R13: 13, R14: 14, R15: 15,
};

const MNEMONICS: Record<string, { opcode: number; type: string }> = {
  HALT:  { opcode: OP.HALT,  type: 'none' },
  ADD:   { opcode: OP.ADD,   type: 'alu' },
  SUB:   { opcode: OP.SUB,   type: 'alu' },
  MUL:   { opcode: OP.MUL,   type: 'alu' },
  DIV:   { opcode: OP.DIV,   type: 'alu' },
  MOD:   { opcode: OP.MOD,   type: 'alu' },
  SHR:   { opcode: OP.SHR,   type: 'alu' },
  SHL:   { opcode: OP.SHL,   type: 'alu' },
  NOT:   { opcode: OP.NOT,   type: 'alu' },
  AND:   { opcode: OP.AND,   type: 'alu' },
  OR:    { opcode: OP.OR,    type: 'alu' },
  XOR:   { opcode: OP.XOR,   type: 'alu' },
  CMP:   { opcode: OP.CMP,   type: 'alu' },
  LOAD:  { opcode: OP.LOAD,  type: 'mem' },
  STORE: { opcode: OP.STORE, type: 'mem' },
  DATA:  { opcode: OP.DATA,  type: 'imm' },
  PUSH:  { opcode: OP.PUSH,  type: 'reg1' },
  POP:   { opcode: OP.POP,   type: 'reg1' },
  LDRI:  { opcode: OP.LDRI,  type: 'alu' },
  STRI:  { opcode: OP.STRI,  type: 'alu' },
  JMP:   { opcode: OP.JMP,   type: 'jump' },
  JC:    { opcode: OP.JC,    type: 'jump' },
  JA:    { opcode: OP.JA,    type: 'jump' },
  JE:    { opcode: OP.JE,    type: 'jump' },
  JMPR:  { opcode: OP.JMPR,  type: 'reg1' },
  CALL:  { opcode: OP.CALL,  type: 'jump' },
  RET:   { opcode: OP.RET,   type: 'none' },
  OUT:   { opcode: OP.OUT,   type: 'reg1' },
  IN:    { opcode: OP.IN,    type: 'reg1' },
};

function parseNumber(s: string): number | null {
  s = s.trim();
  // Character literal: 'A' or 'A
  if (s.startsWith("'") && s.length >= 2) {
    return s.charCodeAt(1);
  }
  // Hex
  if (s.startsWith('0x') || s.startsWith('0X')) {
    const v = parseInt(s, 16);
    return isNaN(v) ? null : v & 0xFFFF;
  }
  // Binary
  if (s.startsWith('0b') || s.startsWith('0B')) {
    const v = parseInt(s.slice(2), 2);
    return isNaN(v) ? null : v & 0xFFFF;
  }
  // Decimal (possibly negative)
  const v = parseInt(s, 10);
  if (isNaN(v)) return null;
  return v < 0 ? (v + 65536) & 0xFFFF : v & 0xFFFF;
}

function parseLine(raw: string, lineNum: number): ParsedLine {
  // Strip comments
  const commentIdx = raw.indexOf(';');
  let code = commentIdx >= 0 ? raw.slice(0, commentIdx) : raw;
  code = code.trim();

  const result: ParsedLine = { lineNum, args: [], raw };
  if (!code) return result;

  // Check for label: "name:"
  const labelMatch = code.match(/^([a-zA-Z_]\w*):\s*(.*)/);
  if (labelMatch) {
    result.label = labelMatch[1];
    code = labelMatch[2].trim();
    if (!code) return result;
  }

  // Split mnemonic and args
  const parts = code.split(/[\s,]+/).filter(Boolean);
  if (parts.length > 0) {
    result.mnemonic = parts[0].toUpperCase();
    result.args = parts.slice(1).map(a => a.trim());
  }
  return result;
}

function instrSizeForType(type: string): number {
  switch (type) {
    case 'none':  return 2;
    case 'alu':   return 2;
    case 'reg1':  return 2;
    case 'mem':   return 4;
    case 'imm':   return 4;
    case 'jump':  return 3;
    case 'db':    return 1;
    case 'dw':    return 2;
    default:      return 2;
  }
}

export function assemble(source: string): AssemblyResult {
  const lines = source.split('\n');
  const errors: Array<{ line: number; message: string }> = [];
  const parsed: ParsedLine[] = lines.map((l, i) => parseLine(l, i + 1));

  // ── Pass 1: Calculate addresses and collect labels ──────────────────
  const labelMap = new Map<string, number>();
  const addressMap = new Map<number, number>();
  let pc = 0;

  for (const line of parsed) {
    if (line.label) {
      if (labelMap.has(line.label)) {
        errors.push({ line: line.lineNum, message: `duplicate label '${line.label}'` });
      }
      labelMap.set(line.label, pc);
    }

    addressMap.set(line.lineNum, pc);

    if (!line.mnemonic) continue;

    if (line.mnemonic === 'DB') {
      pc += 1;
    } else if (line.mnemonic === 'DW') {
      pc += 2;
    } else {
      const info = MNEMONICS[line.mnemonic];
      if (!info) {
        errors.push({ line: line.lineNum, message: `unknown mnemonic '${line.mnemonic}'` });
        continue;
      }
      pc += instrSizeForType(info.type);
    }
  }

  // Build reverse map: address → line
  const addressToLine = new Map<number, number>();
  addressMap.forEach((addr, lineNum) => addressToLine.set(addr, lineNum));

  if (errors.length > 0) {
    return { success: false, bytes: [], errors, addressMap, addressToLine, labelMap, labels: labelMap, size: 0 };
  }

  // ── Pass 2: Generate bytes ──────────────────────────────────────────
  const output: number[] = [];

  function resolveValue(s: string, lineNum: number): number {
    const upper = s.toUpperCase();
    if (labelMap.has(s)) return labelMap.get(s)!;
    if (labelMap.has(upper)) return labelMap.get(upper)!;
    const num = parseNumber(s);
    if (num === null) {
      errors.push({ line: lineNum, message: `cannot resolve '${s}'` });
      return 0;
    }
    return num;
  }

  function resolveReg(s: string, lineNum: number): number {
    const r = REGISTERS[s.toUpperCase()];
    if (r === undefined) {
      errors.push({ line: lineNum, message: `invalid register '${s}', expected R0-R15` });
      return 0;
    }
    return r;
  }

  function emit16(val: number): void {
    output.push(val & 0xFF);         // lo
    output.push((val >> 8) & 0xFF);  // hi
  }

  for (const line of parsed) {
    if (!line.mnemonic) continue;

    // DB: raw byte
    if (line.mnemonic === 'DB') {
      const val = resolveValue(line.args[0] ?? '0', line.lineNum);
      output.push(val & 0xFF);
      continue;
    }

    // DW: raw 16-bit word
    if (line.mnemonic === 'DW') {
      const val = resolveValue(line.args[0] ?? '0', line.lineNum);
      emit16(val);
      continue;
    }

    const info = MNEMONICS[line.mnemonic];
    if (!info) continue; // already errored in pass 1

    switch (info.type) {
      case 'none': // HALT, RET
        output.push(info.opcode);
        output.push(0x00);
        break;

      case 'alu': { // ADD R0, R1 — or NOT R0 (single operand)
        const rA = resolveReg(line.args[0] ?? 'R0', line.lineNum);
        const rB = line.args.length >= 2 ? resolveReg(line.args[1], line.lineNum) : rA;
        output.push(info.opcode);
        output.push((rA << 4) | rB);
        break;
      }

      case 'reg1': { // PUSH R0, POP R0, OUT R0, IN R0, JMPR R0
        const rA = resolveReg(line.args[0] ?? 'R0', line.lineNum);
        output.push(info.opcode);
        output.push((rA << 4) | 0);
        break;
      }

      case 'mem': { // LOAD R0, addr  |  STORE R0, addr
        const rA = resolveReg(line.args[0] ?? 'R0', line.lineNum);
        const addr = resolveValue(line.args[1] ?? '0', line.lineNum);
        output.push(info.opcode);
        output.push((rA << 4) | 0);
        emit16(addr);
        break;
      }

      case 'imm': { // DATA R0, value
        const rA = resolveReg(line.args[0] ?? 'R0', line.lineNum);
        const val = resolveValue(line.args[1] ?? '0', line.lineNum);
        output.push(info.opcode);
        output.push((rA << 4) | 0);
        emit16(val);
        break;
      }

      case 'jump': { // JMP label  |  CALL label
        const target = resolveValue(line.args[0] ?? '0', line.lineNum);
        output.push(info.opcode);
        emit16(target);
        break;
      }
    }
  }

  return {
    success: errors.length === 0,
    bytes: Array.from(output),
    errors,
    addressMap,
    addressToLine,
    labelMap,
    labels: labelMap,
    size: output.length,
  };
}

// ── Disassembler ────────────────────────────────────────────────────────

export function disassemble(memory: number[], startAddr: number, length: number): string[] {
  const lines: string[] = [];
  let pc = startAddr;
  const end = Math.min(startAddr + length, memory.length);

  while (pc < end) {
    const opcode = memory[pc];
    if (opcode === 0 && pc > 0) {
      // Likely past end of program
      lines.push(`${pc.toString(16).padStart(4, '0')}: 00          HALT`);
      pc += 2;
      continue;
    }

    const name = OP[opcode as keyof typeof OP] ? Object.entries(OP).find(([, v]) => v === opcode)?.[0] ?? '???' : '???';
    const size = instrSize(opcode);

    if (pc + size > end) break;

    const regByte = memory[pc + 1] ?? 0;
    const rA = (regByte >> 4) & 0x0F;
    const rB = regByte & 0x0F;

    let text = '';
    const addrStr = pc.toString(16).padStart(4, '0');

    if (opcode === 0x00) {
      text = `${addrStr}: ${hex8(opcode)} ${hex8(regByte)}      HALT`;
    } else if (opcode >= OP.ADD && opcode <= OP.CMP) {
      text = `${addrStr}: ${hex8(opcode)} ${hex8(regByte)}      ${name} R${rA}, R${rB}`;
    } else if (opcode === OP.LOAD || opcode === OP.STORE || opcode === OP.DATA) {
      const val = (memory[pc + 3] << 8) | memory[pc + 2];
      const bytes = `${hex8(opcode)} ${hex8(regByte)} ${hex8(memory[pc + 2])} ${hex8(memory[pc + 3])}`;
      if (opcode === OP.DATA) {
        text = `${addrStr}: ${bytes} DATA R${rA}, ${val}`;
      } else {
        text = `${addrStr}: ${bytes} ${name} R${rA}, [${val}]`;
      }
    } else if (opcode === OP.JMP || opcode === OP.JC || opcode === OP.JA || opcode === OP.JE || opcode === OP.CALL) {
      const target = (memory[pc + 2] << 8) | memory[pc + 1];
      text = `${addrStr}: ${hex8(opcode)} ${hex8(memory[pc + 1])} ${hex8(memory[pc + 2])}  ${name} ${target}`;
    } else if (opcode === OP.PUSH || opcode === OP.POP || opcode === OP.OUT || opcode === OP.IN || opcode === OP.JMPR) {
      text = `${addrStr}: ${hex8(opcode)} ${hex8(regByte)}      ${name} R${rA}`;
    } else if (opcode === OP.RET) {
      text = `${addrStr}: ${hex8(opcode)} ${hex8(regByte)}      RET`;
    } else {
      text = `${addrStr}: ${hex8(opcode)}          ???`;
    }

    lines.push(text);
    pc += size;
  }

  return lines;
}

function hex8(n: number): string {
  return n.toString(16).padStart(2, '0').toUpperCase();
}
