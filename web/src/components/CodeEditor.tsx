import React, { useRef, useCallback } from 'react';

interface Props {
  code: string;
  onChange: (code: string) => void;
  currentAddress: number;
  onLoadBytes: (bytes: number[]) => void;
}

// Shared text styling so line numbers and code are pixel-perfect aligned
const FONT_FAMILY = "'Cascadia Code', 'Fira Code', 'Consolas', monospace";
const FONT_SIZE = '0.78rem';
const LINE_HEIGHT = '20px';
const PADDING_TOP = '10px';

export default function CodeEditor({ code, onChange, currentAddress }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  // Sync scroll between textarea and line numbers
  const handleScroll = useCallback(() => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  const lines = code.split('\n');

  return (
    <div style={{ flex: 1, padding: '12px', display: 'flex', flexDirection: 'column' }}>
      {/* Header with PC display */}
      <div style={{
        fontSize: '0.8rem', fontWeight: 700, color: '#22c55e', marginBottom: '8px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span>📝 Assembly Code</span>
        <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 400, fontFamily: FONT_FAMILY }}>
          PC → 0x{currentAddress.toString(16).padStart(2, '0').toUpperCase()}
          <span style={{ color: '#64748b' }}> ({currentAddress})</span>
        </span>
      </div>

      {/* Editor area */}
      <div style={{
        flex: 1, minHeight: '200px', background: '#0f172a',
        borderRadius: '8px', border: '1px solid #1e293b', overflow: 'hidden',
        display: 'flex',
      }}>
        {/* Line numbers gutter */}
        <div
          ref={lineNumbersRef}
          style={{
            paddingTop: PADDING_TOP,
            paddingRight: '8px',
            paddingLeft: '8px',
            background: '#0c1222',
            borderRight: '1px solid #1e293b',
            fontFamily: FONT_FAMILY,
            fontSize: FONT_SIZE,
            lineHeight: LINE_HEIGHT,
            color: '#334155',
            textAlign: 'right',
            userSelect: 'none',
            overflow: 'hidden',
            flexShrink: 0,
            minWidth: '36px',
          }}
        >
          {lines.map((_, i) => (
            <div key={i} style={{ height: LINE_HEIGHT }}>{i + 1}</div>
          ))}
        </div>

        {/* Code textarea */}
        <div style={{ flex: 1, position: 'relative' }}>
          <textarea
            ref={textareaRef}
            value={code}
            onChange={e => onChange(e.target.value)}
            onScroll={handleScroll}
            spellCheck={false}
            style={{
              width: '100%',
              height: '100%',
              paddingTop: PADDING_TOP,
              paddingLeft: '10px',
              paddingRight: '10px',
              paddingBottom: '10px',
              background: 'transparent',
              color: '#e2e8f0',
              border: 'none',
              fontFamily: FONT_FAMILY,
              fontSize: FONT_SIZE,
              lineHeight: LINE_HEIGHT,
              resize: 'none',
              outline: 'none',
              whiteSpace: 'pre',
              margin: 0,
              // Reset any browser defaults that could misalign
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      {/* Instruction reference */}
      <div style={{
        marginTop: '8px', padding: '8px', background: '#0f172a',
        borderRadius: '6px', fontSize: '0.65rem', color: '#475569',
        display: 'flex', flexWrap: 'wrap', gap: '8px',
      }}>
        {[
          'ADD r,r', 'SHR r,r', 'SHL r,r', 'NOT r,r',
          'AND r,r', 'OR r,r', 'XOR r,r', 'CMP r,r',
          'LOAD r,addr', 'STORE r,addr', 'DATA r,val',
          'JMP addr', 'JC addr', 'JA addr', 'JE addr', 'HALT (0x00)',
        ].map(instr => (
          <span key={instr} style={{ padding: '1px 4px', background: '#1e293b', borderRadius: '3px' }}>
            {instr}
          </span>
        ))}
      </div>
    </div>
  );
}
