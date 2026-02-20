import React from 'react';

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
    fontSize: '0.62rem', textTransform: 'uppercase' as const, letterSpacing: '0.5px',
  },
  td: {
    padding: '3px 8px', borderBottom: '1px solid var(--border-subtle, #1e293b)',
    fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
  },
  mono: { fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)', fontWeight: 600 },
  dim: { color: 'var(--text-dim)', fontSize: '0.68rem' },
  kbd: {
    display: 'inline-block', padding: '1px 5px', borderRadius: 3,
    background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
    fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 600,
    color: 'var(--text-secondary)',
  },
};

const ISA = [
  ['ADD rA, rB', '0x0', 'rA = rA + rB, set flags'],
  ['SHR rA, rB', '0x1', 'rA = rA >> 1 (shift right)'],
  ['SHL rA, rB', '0x2', 'rA = rA << 1 (shift left)'],
  ['NOT rA', '0x3', 'rA = ~rA (bitwise NOT)'],
  ['AND rA, rB', '0x4', 'rA = rA & rB'],
  ['OR rA, rB', '0x5', 'rA = rA | rB'],
  ['XOR rA, rB', '0x6', 'rA = rA ^ rB'],
  ['CMP rA, rB', '0x7', 'Compare — sets flags only, no write'],
  ['LOAD rA, [addr]', '0x8', 'rA = RAM[addr]'],
  ['STORE rA, [addr]', '0x9', 'RAM[addr] = rA'],
  ['DATA rA, imm', '0xA', 'rA = immediate value (0-255)'],
  ['JMPR rA', '0xB₀', 'Jump to address in rA'],
  ['OUT rA', '0xB₁', 'Print rA value to console'],
  ['IN rA', '0xB₂', 'Read user input into rA'],
  ['JMP label', '0xC', 'Unconditional jump'],
  ['JC label', '0xD', 'Jump if carry flag set'],
  ['JA label', '0xE', 'Jump if A > B (after CMP)'],
  ['JE label', '0xF', 'Jump if A == B (after CMP)'],
  ['HALT', '0x00', 'Stop execution'],
];

const KEYS = [
  ['S', 'Step one instruction'],
  ['B', 'Step back (undo)'],
  ['R', 'Run (continuous)'],
  ['P / Esc', 'Pause'],
  ['Ctrl+Enter', 'Assemble code'],
  ['F5', 'Run (Electron)'],
  ['F9', 'Step back (Electron)'],
  ['F10', 'Step (Electron)'],
];

export default function HelpPanel({ onClose }: Props) {
  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.panel} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ ...S.h2, margin: 0 }}>GateStack · Quick Reference</h2>
          <button onClick={onClose} style={{
            background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 4,
            color: 'var(--text-dim)', cursor: 'pointer', padding: '2px 8px', fontSize: '0.7rem',
          }}>✕ Close</button>
        </div>

        <p style={{ ...S.dim, marginBottom: 12, lineHeight: 1.5 }}>
          8-bit CPU emulator with 4 registers (R0–R3), 256 bytes of RAM, and {ISA.length} instructions.
          Write assembly in the editor, press Ctrl+Enter to assemble, then Step or Run.
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
            {ISA.map(([instr, op, desc], i) => (
              <tr key={i}>
                <td style={{ ...S.td, ...S.mono, whiteSpace: 'nowrap' }}>{instr}</td>
                <td style={{ ...S.td, color: 'var(--text-dim)', fontSize: '0.62rem' }}>{op}</td>
                <td style={{ ...S.td, color: 'var(--text-secondary)' }}>{desc}</td>
              </tr>
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
              <li>Click any <b>RAM cell</b> to edit its value directly</li>
              <li>Use <b>OUT rA</b> to print to the console panel</li>
              <li>Use <b>IN rA</b> to pause and read user input</li>
              <li>Labels: <span style={S.mono}>loop: JMP loop</span></li>
              <li>Numbers: decimal <span style={S.mono}>42</span>, hex <span style={S.mono}>0xFF</span>, binary <span style={S.mono}>0b1010</span>, char <span style={S.mono}>'A'</span></li>
              <li>Comments start with <span style={S.mono}>;</span></li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
