// Parsing what the user types for an IN instruction.

export type InputMode = 'number' | 'char';

export type ParsedInput = { ok: true; value: number } | { ok: false; error: string };

/**
 * Number mode: decimal (negative allowed), 0x hex, 0b binary or a 'c' char
 * literal; any 32-bit value from -2147483648 to 4294967295. Negative numbers
 * are stored as two's complement. Char mode: exactly one character, stored as
 * its character code.
 */
export function parseConsoleInput(text: string, mode: InputMode): ParsedInput {
  if (mode === 'char') {
    const chars = Array.from(text);
    if (chars.length !== 1) {
      return { ok: false, error: chars.length === 0 ? 'Type one character.' : 'Type just one character (or switch to Number).' };
    }
    return { ok: true, value: chars[0].codePointAt(0)! >>> 0 };
  }

  const t = text.trim();
  if (t === '') return { ok: false, error: 'Type a number, e.g. 42, -7, 0x2A or \'A\'.' };
  let v: number | null = null;
  if (/^'.'$/u.test(t)) v = Array.from(t)[1].codePointAt(0)!;
  else if (/^-?0[xX][0-9a-fA-F]+$/.test(t)) v = (t.startsWith('-') ? -1 : 1) * parseInt(t.replace(/^-?0[xX]/, ''), 16);
  else if (/^-?0[bB][01]+$/.test(t)) v = (t.startsWith('-') ? -1 : 1) * parseInt(t.replace(/^-?0[bB]/, ''), 2);
  else if (/^[-+]?\d+$/.test(t)) v = parseInt(t, 10);
  if (v === null || !Number.isFinite(v)) {
    return { ok: false, error: `"${t}" is not a number. Use 42, -7, 0x2A, 0b101 or 'A'.` };
  }
  if (v < -2147483648 || v > 4294967295) {
    return { ok: false, error: `${t} does not fit in 32 bits (-2147483648 to 4294967295).` };
  }
  return { ok: true, value: v >>> 0 };
}
