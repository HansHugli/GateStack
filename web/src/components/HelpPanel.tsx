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
  ['ADD rA, rB', '0x01', 'rA = rA + rB'],
  ['SUB rA, rB', '0x02', 'rA = rA - rB'],
  ['MUL rA, rB', '0x03', 'rA = rA × rB'],
  ['DIV rA, rB', '0x04', 'rA = rA ÷ rB (integer)'],
  ['MOD rA, rB', '0x05', 'rA = rA % rB (remainder)'],
  ['SHR rA', '0x06', 'rA = rA >> 1'],
  ['SHL rA', '0x07', 'rA = rA << 1'],
  ['NOT rA', '0x08', 'rA = ~rA (bitwise NOT)'],
  ['AND rA, rB', '0x09', 'rA = rA & rB'],
  ['OR rA, rB', '0x0A', 'rA = rA | rB'],
  ['XOR rA, rB', '0x0B', 'rA = rA ^ rB'],
  ['CMP rA, rB', '0x0C', 'Compare — sets flags only'],
  ['LOAD rA, [addr]', '0x10', 'rA = RAM[addr16]'],
  ['STORE rA, [addr]', '0x11', 'RAM[addr16] = rA (low byte)'],
  ['DATA rA, imm16', '0x12', 'rA = immediate (0-65535)'],
  ['PUSH rA', '0x13', 'Push rA onto stack'],
  ['POP rA', '0x14', 'Pop top of stack into rA'],
  ['LDRI rA, rB', '0x15', 'rA = RAM[rB] (indirect load)'],
  ['STRI rA, rB', '0x16', 'RAM[rB] = rA (indirect store)'],
  ['JMP label', '0x18', 'Unconditional jump'],
  ['JC label', '0x19', 'Jump if carry'],
  ['JA label', '0x1A', 'Jump if A > B'],
  ['JE label', '0x1B', 'Jump if A == B'],
  ['JMPR rA', '0x1C', 'Jump to address in rA'],
  ['CALL label', '0x1D', 'Push return addr, jump'],
  ['RET', '0x1E', 'Pop return addr, jump back'],
  ['OUT rA', '0x1F', 'Print rA (low byte) to console'],
  ['IN rA', '0x20', 'Read user input into rA'],
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
          16-bit CPU with 16 registers (R0–R15), 64KB RAM, stack, and {ISA.length} instructions.
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

        {/* Attribution */}
        <div style={{
          marginTop: 16, paddingTop: 12,
          borderTop: '1px solid var(--border-subtle)',
          fontSize: '0.68rem', color: 'var(--text-dim)', lineHeight: 1.7,
        }}>
          <span style={{ fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.5px', textTransform: 'uppercase' as const, fontSize: '0.6rem' }}>
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
