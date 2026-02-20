// ============================================================================
// assembler.ts — GateStack Two-Pass Assembler
// ============================================================================
// Converts assembly text → byte array.
// Supports labels (e.g. "loop:"), all 16 opcodes, comments, and DATA with
// character literals ('A').
// ============================================================================

export interface AssemblyError {
  line: number;      // 1-indexed line number
  column?: number;
  message: string;
}

export interface AssemblyResult {
  success: boolean;
  bytes: number[];
  errors: AssemblyError[];
  /** Map from byte address → source line number (1-indexed) */
  addressToLine: Map<number, number>;
  /** Map from label name → byte address */
  labels: Map<string, number>;
  /** Total bytes emitted */
  size: number;
}

// ── Instruction Definitions ─────────────────────────────────────────────

interface InstrDef {
  opcode: number;
  type: 'alu' | 'data' | 'load' | 'store' | 'jmp_reg' | 'jmp_addr' | 'jmp_cond' | 'halt' | 'out' | 'in';
}

const INSTRUCTIONS: Record<string, InstrDef> = {
  'ADD':   { opcode: 0x0, type: 'alu' },
  'SHR':   { opcode: 0x1, type: 'alu' },
  'SHL':   { opcode: 0x2, type: 'alu' },
  'NOT':   { opcode: 0x3, type: 'alu' },
  'AND':   { opcode: 0x4, type: 'alu' },
  'OR':    { opcode: 0x5, type: 'alu' },
  'XOR':   { opcode: 0x6, type: 'alu' },
  'CMP':   { opcode: 0x7, type: 'alu' },
  'LOAD':  { opcode: 0x8, type: 'load' },
  'STORE': { opcode: 0x9, type: 'store' },
  'DATA':  { opcode: 0xA, type: 'data' },
  'JMPR':  { opcode: 0xB, type: 'jmp_reg' },
  'OUT':   { opcode: 0xB, type: 'out' },
  'IN':    { opcode: 0xB, type: 'in' },
  'JMP':   { opcode: 0xC, type: 'jmp_addr' },
  'JC':    { opcode: 0xD, type: 'jmp_cond' },
  'JA':    { opcode: 0xE, type: 'jmp_cond' },
  'JE':    { opcode: 0xF, type: 'jmp_cond' },
  'HALT':  { opcode: -1,  type: 'halt' },
};

// ── Helpers ─────────────────────────────────────────────────────────────

function parseRegister(token: string): number | null {
  const match = token.toUpperCase().match(/^R([0-3])$/);
  return match ? parseInt(match[1]) : null;
}

function parseNumber(token: string): number | null {
  const t = token.trim();

  // Character literal: 'A' or 'a'
  if (t.length === 3 && t.startsWith("'") && t.endsWith("'")) {
    return t.charCodeAt(1);
  }

  // Hex: 0xFF or 0XFF
  if (/^0[xX][0-9a-fA-F]+$/.test(t)) {
    const val = parseInt(t, 16);
    return val >= 0 && val <= 255 ? val : null;
  }

  // Binary: 0b11001010
  if (/^0[bB][01]+$/.test(t)) {
    const val = parseInt(t.slice(2), 2);
    return val >= 0 && val <= 255 ? val : null;
  }

  // Decimal
  if (/^-?\d+$/.test(t)) {
    let val = parseInt(t, 10);
    // Allow negative for two's complement (-1 = 255)
    if (val < 0) val = (val + 256) & 0xFF;
    return val >= 0 && val <= 255 ? val : null;
  }

  return null;
}

/** Strip bracket notation: [200] → 200 */
function stripBrackets(token: string): string {
  const t = token.trim();
  if (t.startsWith('[') && t.endsWith(']')) {
    return t.slice(1, -1).trim();
  }
  return t;
}

// ── Assembler ───────────────────────────────────────────────────────────

export function assemble(source: string): AssemblyResult {
  const errors: AssemblyError[] = [];
  const labels = new Map<string, number>();
  const addressToLine = new Map<number, number>();
  const lines = source.split('\n');

  // ── PASS 1: Collect labels and calculate addresses ──────────────────

  let addr = 0;

  interface ParsedLine {
    lineNum: number;       // 1-indexed
    label?: string;
    mnemonic?: string;
    args: string[];
    addr: number;          // byte address at start of this instruction
  }

  const parsed: ParsedLine[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    let line = lines[i];

    // Strip comments
    const commentIdx = line.indexOf(';');
    if (commentIdx >= 0) line = line.substring(0, commentIdx);
    line = line.trim();

    if (!line) continue;

    let label: string | undefined;
    let rest = line;

    // Check for label: "name:" at the start
    const labelMatch = rest.match(/^([a-zA-Z_]\w*)\s*:\s*(.*)/);
    if (labelMatch) {
      label = labelMatch[1].toLowerCase();
      rest = labelMatch[2].trim();

      if (labels.has(label)) {
        errors.push({ line: lineNum, message: `Duplicate label: "${label}"` });
      } else {
        labels.set(label, addr);
      }
    }

    // If nothing left after label, it was just a label line
    if (!rest) {
      parsed.push({ lineNum, label, args: [], addr });
      continue;
    }

    // Tokenize: split on whitespace and commas, respecting bracket groups
    const tokens: string[] = [];
    let current = '';
    let inBracket = false;
    for (const ch of rest) {
      if (ch === '[') { inBracket = true; current += ch; }
      else if (ch === ']') { inBracket = false; current += ch; }
      else if (!inBracket && (ch === ' ' || ch === '\t' || ch === ',')) {
        if (current.trim()) tokens.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim()) tokens.push(current.trim());

    if (tokens.length === 0) {
      parsed.push({ lineNum, label, args: [], addr });
      continue;
    }

    const mnemonic = tokens[0].toUpperCase();
    const args = tokens.slice(1);

    const instrDef = INSTRUCTIONS[mnemonic];
    if (!instrDef) {
      errors.push({ line: lineNum, message: `Unknown instruction: "${mnemonic}"` });
      parsed.push({ lineNum, label, mnemonic, args, addr });
      addr += 1; // assume 1 byte to keep going
      continue;
    }

    parsed.push({ lineNum, label, mnemonic, args, addr });
    addressToLine.set(addr, lineNum);

    // Calculate instruction size
    switch (instrDef.type) {
      case 'halt':
        addr += 1;
        break;
      case 'alu':
      case 'jmp_reg':
      case 'out':
      case 'in':
        addr += 1;
        break;
      case 'data':
      case 'load':
      case 'store':
      case 'jmp_addr':
      case 'jmp_cond':
        addr += 2;
        break;
    }
  }

  // If Pass 1 had errors, still try Pass 2 for more error info
  if (addr > 256) {
    errors.push({ line: 0, message: `Program too large: ${addr} bytes (max 256)` });
  }

  // ── PASS 2: Emit bytes ─────────────────────────────────────────────

  const bytes: number[] = [];

  function encode(opcode: number, regA: number, regB: number): number {
    return ((opcode & 0xF) << 4) | ((regA & 0x3) << 2) | (regB & 0x3);
  }

  function resolveOperand(token: string, lineNum: number): number | null {
    // Try as label first
    const labelName = token.toLowerCase();
    if (labels.has(labelName)) {
      return labels.get(labelName)!;
    }

    // Try as number (with bracket stripping for LOAD/STORE)
    const stripped = stripBrackets(token);
    const num = parseNumber(stripped);
    if (num !== null) return num;

    // Unknown label?
    if (/^[a-zA-Z_]\w*$/.test(token)) {
      errors.push({ line: lineNum, message: `Undefined label: "${token}"` });
      return 0;
    }

    errors.push({ line: lineNum, message: `Invalid operand: "${token}"` });
    return null;
  }

  for (const p of parsed) {
    if (!p.mnemonic) continue;

    const instrDef = INSTRUCTIONS[p.mnemonic];
    if (!instrDef) continue; // already reported in pass 1

    switch (instrDef.type) {
      case 'halt':
        bytes.push(0x00);
        break;

      case 'alu': {
        // ALU ops: mnemonic RA, RB
        // NOT only needs RA (regB is ignored but usually same as regA)
        if (p.mnemonic === 'NOT') {
          if (p.args.length < 1) {
            errors.push({ line: p.lineNum, message: `${p.mnemonic} requires at least 1 register (e.g. NOT R0)` });
            bytes.push(0x00);
            break;
          }
          const rA = parseRegister(p.args[0]);
          const rB = p.args.length > 1 ? parseRegister(p.args[1]) : rA;
          if (rA === null) {
            errors.push({ line: p.lineNum, message: `Invalid register: "${p.args[0]}"` });
            bytes.push(0x00);
            break;
          }
          bytes.push(encode(instrDef.opcode, rA, rB ?? rA));
        } else {
          if (p.args.length < 2) {
            errors.push({ line: p.lineNum, message: `${p.mnemonic} requires 2 registers (e.g. ${p.mnemonic} R0, R1)` });
            bytes.push(0x00);
            break;
          }
          const rA = parseRegister(p.args[0]);
          const rB = parseRegister(p.args[1]);
          if (rA === null) {
            errors.push({ line: p.lineNum, message: `Invalid register: "${p.args[0]}"` });
            bytes.push(0x00);
            break;
          }
          if (rB === null) {
            errors.push({ line: p.lineNum, message: `Invalid register: "${p.args[1]}"` });
            bytes.push(0x00);
            break;
          }
          bytes.push(encode(instrDef.opcode, rA, rB));
        }
        break;
      }

      case 'data': {
        // DATA RA, value
        if (p.args.length < 2) {
          errors.push({ line: p.lineNum, message: `DATA requires register and value (e.g. DATA R0, 42)` });
          bytes.push(0x00, 0x00);
          break;
        }
        const rA = parseRegister(p.args[0]);
        if (rA === null) {
          errors.push({ line: p.lineNum, message: `Invalid register: "${p.args[0]}"` });
          bytes.push(0x00, 0x00);
          break;
        }
        const val = resolveOperand(p.args[1], p.lineNum);
        if (val === null) { bytes.push(0x00, 0x00); break; }
        bytes.push(encode(instrDef.opcode, rA, 0), val & 0xFF);
        break;
      }

      case 'load': {
        // LOAD RA, [addr] or LOAD RA, addr or LOAD RA, label
        if (p.args.length < 2) {
          errors.push({ line: p.lineNum, message: `LOAD requires register and address (e.g. LOAD R0, [200])` });
          bytes.push(0x00, 0x00);
          break;
        }
        const rA = parseRegister(p.args[0]);
        if (rA === null) {
          errors.push({ line: p.lineNum, message: `Invalid register: "${p.args[0]}"` });
          bytes.push(0x00, 0x00);
          break;
        }
        const addr2 = resolveOperand(p.args[1], p.lineNum);
        if (addr2 === null) { bytes.push(0x00, 0x00); break; }
        bytes.push(encode(instrDef.opcode, rA, 0), addr2 & 0xFF);
        break;
      }

      case 'store': {
        // STORE RA, [addr]
        if (p.args.length < 2) {
          errors.push({ line: p.lineNum, message: `STORE requires register and address (e.g. STORE R0, [200])` });
          bytes.push(0x00, 0x00);
          break;
        }
        const rA = parseRegister(p.args[0]);
        if (rA === null) {
          errors.push({ line: p.lineNum, message: `Invalid register: "${p.args[0]}"` });
          bytes.push(0x00, 0x00);
          break;
        }
        const addr2 = resolveOperand(p.args[1], p.lineNum);
        if (addr2 === null) { bytes.push(0x00, 0x00); break; }
        bytes.push(encode(instrDef.opcode, rA, 0), addr2 & 0xFF);
        break;
      }

      case 'jmp_reg': {
        // JMPR RA
        if (p.args.length < 1) {
          errors.push({ line: p.lineNum, message: `JMPR requires a register (e.g. JMPR R0)` });
          bytes.push(0x00);
          break;
        }
        const rA = parseRegister(p.args[0]);
        if (rA === null) {
          errors.push({ line: p.lineNum, message: `Invalid register: "${p.args[0]}"` });
          bytes.push(0x00);
          break;
        }
        bytes.push(encode(instrDef.opcode, rA, 0));
        break;
      }

      case 'out': {
        // OUT RA — output register value to console (opcode 0xB with regB=1)
        if (p.args.length < 1) {
          errors.push({ line: p.lineNum, message: `OUT requires a register (e.g. OUT R0)` });
          bytes.push(0x00);
          break;
        }
        const rA = parseRegister(p.args[0]);
        if (rA === null) {
          errors.push({ line: p.lineNum, message: `Invalid register: "${p.args[0]}"` });
          bytes.push(0x00);
          break;
        }
        bytes.push(encode(instrDef.opcode, rA, 1)); // regB=1 distinguishes OUT from JMPR
        break;
      }

      case 'in': {
        // IN RA — wait for user input, store in register (opcode 0xB with regB=2)
        if (p.args.length < 1) {
          errors.push({ line: p.lineNum, message: `IN requires a register (e.g. IN R0)` });
          bytes.push(0x00);
          break;
        }
        const rA = parseRegister(p.args[0]);
        if (rA === null) {
          errors.push({ line: p.lineNum, message: `Invalid register: "${p.args[0]}"` });
          bytes.push(0x00);
          break;
        }
        bytes.push(encode(instrDef.opcode, rA, 2)); // regB=2 distinguishes IN
        break;
      }

      case 'jmp_addr':
      case 'jmp_cond': {
        // JMP addr/label, JC addr/label, JA addr/label, JE addr/label
        if (p.args.length < 1) {
          errors.push({ line: p.lineNum, message: `${p.mnemonic} requires a target address or label` });
          bytes.push(0x00, 0x00);
          break;
        }
        const target = resolveOperand(p.args[0], p.lineNum);
        if (target === null) { bytes.push(0x00, 0x00); break; }
        bytes.push(encode(instrDef.opcode, 0, 0), target & 0xFF);
        break;
      }
    }
  }

  return {
    success: errors.length === 0,
    bytes,
    errors,
    addressToLine,
    labels,
    size: bytes.length,
  };
}
