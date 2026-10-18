import React, { useEffect, useRef, useId } from 'react';
import { APP_VERSION } from './Modal';

interface Props {
  onClose: () => void;
}

const S: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000,
  },
  panel: {
    background: 'var(--bg-surface, #0f1219)', border: '1px solid var(--border-default)',
    borderRadius: 8, padding: '20px 24px', maxWidth: 680, maxHeight: '85vh',
    overflow: 'auto', color: 'var(--text-primary)', fontFamily: 'var(--font-ui)',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
  },
  h2: { fontSize: '1rem', fontWeight: 700, marginBottom: 12, color: 'var(--accent-blue)' },
  h3: { fontSize: '0.78rem', fontWeight: 700, marginTop: 14, marginBottom: 6, color: 'var(--text-secondary)' },
  table: { width: '100%', fontSize: '0.72rem', borderCollapse: 'collapse' as const, marginBottom: 12 },
  th: {
    textAlign: 'left' as const, padding: '3px 8px', fontWeight: 700,
    borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)',
    fontSize: '0.6875rem', textTransform: 'uppercase' as const, letterSpacing: '0.5px',
  },
  td: {
    padding: '3px 8px', borderBottom: '1px solid var(--border-subtle, #1e293b)',
    fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
  },
  mono: { fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)', fontWeight: 600 },
  dim: { color: 'var(--text-dim)', fontSize: '0.6875rem' },
  kbd: {
    display: 'inline-block', padding: '1px 5px', borderRadius: 3,
    background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
    fontFamily: 'var(--font-mono)', fontSize: '0.6875rem', fontWeight: 600,
    color: 'var(--text-secondary)',
  },
};

const ISA_CATEGORIES: Array<{ label: string; rows: string[][] }> = [
  { label: 'Core', rows: [
    ['DATA rA, imm32', '0x12', 'rA = 32-bit immediate value'],
    ['MOV rA, rB', '0x0E', 'rA = rB (copy register)'],
    ['HALT', '0x00', 'Stop execution'],
  ]},
  { label: 'Arithmetic', rows: [
    ['ADD rA, rB', '0x01', 'rA = rA + rB'],
    ['SUB rA, rB', '0x02', 'rA = rA - rB'],
    ['MUL rA, rB', '0x03', 'rA = rA × rB (low 32 bits)'],
    ['DIV rA, rB', '0x04', 'rA = rA ÷ rB (unsigned)'],
    ['MOD rA, rB', '0x05', 'rA = rA % rB (unsigned)'],
    ['CMP rA, rB', '0x0C', 'Flags as for rA − rB, nothing stored: Z if rA = rB, C if rA < rB (unsigned), A if rA > rB, E if equal'],
  ]},
  { label: 'Bitwise & Shifts', rows: [
    ['NOT rA', '0x08', 'rA = ~rA'],
    ['AND rA, rB', '0x09', 'rA = rA & rB'],
    ['OR rA, rB', '0x0A', 'rA = rA | rB'],
    ['XOR rA, rB', '0x0B', 'rA = rA ^ rB'],
    ['SHR rA', '0x06', 'rA = rA >> 1'],
    ['SHL rA', '0x07', 'rA = rA << 1'],
  ]},
  { label: 'Jumps & Flow', rows: [
    ['JMP label', '0x18', 'Unconditional jump'],
    ['JE label', '0x1B', 'Jump if equal'],
    ['JA label', '0x1A', 'Jump if A > B'],
    ['JC label', '0x19', 'Jump if carry'],
    ['CALL label', '0x1D', 'Push return addr, jump'],
    ['RET', '0x1E', 'Pop return addr, jump back'],
  ]},
  { label: 'Memory & Stack', rows: [
    ['LOAD rA, [addr]', '0x10', 'rA = RAM[addr] (1 byte)'],
    ['STORE rA, [addr]', '0x11', 'RAM[addr] = rA (low byte)'],
    ['LDRI rA, rB', '0x15', 'rA = RAM[rB] (indirect byte)'],
    ['STRI rA, rB', '0x16', 'RAM[rB] = rA (indirect byte)'],
    ['PUSH rA', '0x13', 'SP -= 4, RAM[SP] = rA'],
    ['POP rA', '0x14', 'rA = RAM[SP], SP += 4'],
  ]},
  { label: 'I/O', rows: [
    ['OUT rA', '0x1F', 'Print rA (low byte) to console'],
    ['IN rA', '0x20', 'Read user input into rA'],
  ]},
  { label: 'Advanced Arithmetic', rows: [
    ['MULH rA, rB', '0x0D', 'rA = (rA × rB) >> 32 (high 32)'],
    ['IDIV rA, rB', '0x29', 'rA = rA ÷ rB (signed)'],
    ['IMOD rA, rB', '0x2A', 'rA = rA % rB (signed)'],
    ['FPMUL rA, rB', '0x2B', 'rA = (rA × rB) >> 8 (signed fixed-point 8.8)'],
    ['FPMUL16 rA, rB', '0x2C', 'rA = (rA × rB) >> 16 (signed fixed-point 16.16)'],
  ]},
  { label: 'Advanced Shifts', rows: [
    ['SHR8 rA', '0x0F', 'rA = rA >> 8'],
    ['SHL8 rA', '0x17', 'rA = rA << 8'],
    ['SHRN rA, rB', '0x21', 'rA = rA >> rB (variable shift right)'],
    ['SHLN rA, rB', '0x22', 'rA = rA << rB (variable shift left)'],
  ]},
  { label: 'Advanced Jumps', rows: [
    ['JZ label', '0x23', 'Jump if zero flag set'],
    ['JNZ label', '0x24', 'Jump if zero flag not set'],
    ['JMPR rA', '0x1C', 'Jump to address in rA'],
  ]},
  { label: '32-bit Memory', rows: [
    ['LOAD32 rA, [addr]', '0x25', 'rA = RAM[addr] (4 bytes LE)'],
    ['STORE32 rA, [addr]', '0x26', 'RAM[addr] = rA (4 bytes LE)'],
    ['LDRI32 rA, rB', '0x27', 'rA = RAM[rB] (indirect 32-bit)'],
    ['STRI32 rA, rB', '0x28', 'RAM[rB] = rA (indirect 32-bit)'],
  ]},
];

const TOTAL_INSTRUCTIONS = ISA_CATEGORIES.reduce((sum, cat) => sum + cat.rows.length, 0);

const KEYS = [
  ['S', 'Step one instruction'],
  ['B', 'Step back (undo)'],
  ['R', 'Run (continuous)'],
  ['P / Esc', 'Pause'],
  ['Ctrl+Enter', 'Assemble code'],
  ['Tab', 'Indent in the editor (Shift+Tab leaves it)'],
  ['F5 / F6', 'Run / Pause (desktop app)'],
  ['F8', 'Reset CPU (desktop app)'],
  ['F9 / F10', 'Step back / Step (desktop app)'],
];

export default function HelpPanel({ onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => { prev?.focus?.(); };
  }, []);
  return (
    // Closes only through the Close button or Escape, never on a backdrop click.
    <div style={S.overlay} onKeyDown={e => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if (e.key === 'Tab') { e.preventDefault(); closeRef.current?.focus(); }
    }}>
      <div style={S.panel} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h2 id={titleId} style={{ ...S.h2, margin: 0 }}>GateStack v{APP_VERSION} · Quick Reference</h2>
          <button ref={closeRef} onClick={onClose} style={{
            background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 4,
            color: 'var(--text-dim)', cursor: 'pointer', padding: '2px 8px', fontSize: '0.7rem',
          }}>✕ Close</button>
        </div>

        <p style={{ ...S.dim, marginBottom: 12, lineHeight: 1.5 }}>
          32-bit CPU (ISA v2) with 16 registers (R0–R15), 4MB RAM, stack, and {TOTAL_INSTRUCTIONS} instructions.
          Write assembly in the editor, press Ctrl+Enter to assemble, then Step or Run.
          Your edits are saved in this browser; the editor shows when they differ from the program in RAM.
        </p>

        <h3 style={S.h3}>Instruction Set</h3>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>Instruction</th>
              <th style={S.th}>Op</th>
              <th style={S.th}>Description</th>
            </tr>
          </thead>
          <tbody>
            {ISA_CATEGORIES.map((cat, ci) => (
              <React.Fragment key={ci}>
                <tr>
                  <td colSpan={3} style={{
                    padding: '6px 8px 2px', fontSize: '0.6875rem', fontWeight: 700,
                    color: 'var(--accent-blue)', textTransform: 'uppercase',
                    letterSpacing: '0.8px', borderBottom: '1px solid var(--border-subtle)',
                    background: 'rgba(59,130,246,0.05)',
                  }}>{cat.label}</td>
                </tr>
                {cat.rows.map(([instr, op, desc], i) => (
                  <tr key={`${ci}-${i}`}>
                    <td style={{ ...S.td, ...S.mono, whiteSpace: 'nowrap' }}>{instr}</td>
                    <td style={{ ...S.td, color: 'var(--text-dim)', fontSize: '0.6875rem' }}>{op}</td>
                    <td style={{ ...S.td, color: 'var(--text-secondary)' }}>{desc}</td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>

        <div style={{ display: 'flex', gap: 24 }}>
          <div style={{ flex: 1 }}>
            <h3 style={S.h3}>Keyboard Shortcuts</h3>
            <table style={S.table}>
              <tbody>
                {KEYS.map(([key, desc], i) => (
                  <tr key={i}>
                    <td style={{ ...S.td, whiteSpace: 'nowrap' }}><span style={S.kbd}>{key}</span></td>
                    <td style={{ ...S.td, color: 'var(--text-secondary)' }}>{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={S.h3}>Tips</h3>
            <ul style={{ ...S.dim, lineHeight: 1.8, paddingLeft: 16, margin: 0 }}>
              <li>Click the <b>gutter</b> (left of line numbers) to toggle breakpoints</li>
              <li>Click any <b>RAM cell</b> to edit it; values are hex (<span style={S.mono}>#65</span> decimal, <span style={S.mono}>'A'</span> char)</li>
              <li><b>Reset CPU</b> keeps RAM; <b>Wipe RAM</b> clears it, program included</li>
              <li>Use <b>OUT rA</b> to print to the console panel</li>
              <li>Use <b>IN rA</b> to pause and read user input</li>
              <li>Labels: <span style={S.mono}>loop: JMP loop</span></li>
              <li>Numbers: decimal <span style={S.mono}>42</span>, hex <span style={S.mono}>0xFF</span>, binary <span style={S.mono}>0b1010</span>, char <span style={S.mono}>'A'</span></li>
              <li>Comments start with <span style={S.mono}>;</span></li>
            </ul>
          </div>
        </div>

        {/* Attribution */}
        <div style={{
          marginTop: 16, paddingTop: 12,
          borderTop: '1px solid var(--border-subtle)',
          fontSize: '0.6875rem', color: 'var(--text-dim)', lineHeight: 1.7,
        }}>
          <span style={{ fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.5px', textTransform: 'uppercase' as const, fontSize: '0.6875rem' }}>
            Inspired by
          </span>
          <div style={{ marginTop: 4 }}>
            <span style={{ color: 'var(--text-secondary)' }}>J. Clark Scott</span> — <em>But How Do It Know?</em>, a first-principles explanation of how a simple computer works from logic gates up.
          </div>
          <div style={{ marginTop: 2 }}>
            <span style={{ color: 'var(--text-secondary)' }}>Noam Nisan &amp; Shimon Schocken</span> — <em>nand2tetris.org</em>, building a modern computer system from NAND gates through a complete software stack.
          </div>
        </div>
      </div>
    </div>
  );
}