import React, { useRef, useCallback, useMemo } from 'react';

interface Props {
  code: string;
  onChange: (code: string) => void;
  currentAddress: number;
  onLoadBytes: (bytes: number[]) => void;
}

const FONT_FAMILY = "'Cascadia Code', 'Fira Code', 'Consolas', monospace";
const FONT_SIZE = '0.78rem';
const LINE_HEIGHT = 20; // px, as number for calculations
const PADDING_TOP = 10; // px

const EDITOR_STYLES = `
  @keyframes highlightPulse {
    0%, 100% { background: rgba(250, 204, 21, 0.08); border-color: rgba(250, 204, 21, 0.25); }
    50% { background: rgba(250, 204, 21, 0.15); border-color: rgba(250, 204, 21, 0.45); }
  }
`;

// Instruction mnemonics that consume bytes (used to map lines → addresses)
const SINGLE_BYTE_OPS = ['ADD', 'SHR', 'SHL', 'NOT', 'AND', 'OR', 'XOR', 'CMP', 'JMPR', 'HALT', 'XOR'];
const TWO_BYTE_OPS = ['DATA', 'LOAD', 'STORE', 'JMP', 'JC', 'JA', 'JE'];

/**
 * Parse assembly lines to build a mapping of byte address → line index.
 * This lets us highlight the correct line for any PC value.
 */
function buildAddressToLineMap(code: string): Map<number, number> {
  const map = new Map<number, number>();
  const lines = code.split('\n');
  let addr = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Skip empty lines and comments
    if (!line || line.startsWith(';')) continue;

    // Extract the mnemonic (first word, ignoring leading comments)
    const stripped = line.split(';')[0].trim();
    if (!stripped) continue;
    const mnemonic = stripped.split(/\s+/)[0].toUpperCase();

    // Map this address to this line
    map.set(addr, i);

    // Advance address based on instruction size
    if (mnemonic === 'HALT') {
      addr += 1;
    } else if (TWO_BYTE_OPS.includes(mnemonic)) {
      addr += 2;
    } else if (SINGLE_BYTE_OPS.includes(mnemonic)) {
      addr += 1;
    } else {
      // Unknown — skip, might be a label or pseudo-op
      addr += 1;
    }
  }

  return map;
}

export default function CodeEditor({ code, onChange, currentAddress }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  // Build address→line map whenever code changes
  const addrToLine = useMemo(() => buildAddressToLineMap(code), [code]);
  const activeLine = addrToLine.get(currentAddress) ?? -1;

  const lines = code.split('\n');

  // Sync scroll between all three layers
  const handleScroll = useCallback(() => {
    const scrollTop = textareaRef.current?.scrollTop ?? 0;
    if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = scrollTop;
    if (highlightRef.current) highlightRef.current.scrollTop = scrollTop;
  }, []);

  return (
    <div style={{ flex: 1, padding: '12px', display: 'flex', flexDirection: 'column' }}>
      <style>{EDITOR_STYLES}</style>

      {/* Header */}
      <div style={{
        fontSize: '0.8rem', fontWeight: 700, color: '#22c55e', marginBottom: '8px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span>📝 Assembly Code</span>
        <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 400, fontFamily: FONT_FAMILY }}>
          PC → 0x{currentAddress.toString(16).padStart(2, '0').toUpperCase()}
          <span style={{ color: '#64748b' }}> ({currentAddress})</span>
          {activeLine >= 0 && (
            <span style={{ color: '#fcd34d' }}> — line {activeLine + 1}</span>
          )}
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
            paddingTop: `${PADDING_TOP}px`,
            paddingRight: '8px',
            paddingLeft: '8px',
            background: '#0c1222',
            borderRight: '1px solid #1e293b',
            fontFamily: FONT_FAMILY,
            fontSize: FONT_SIZE,
            lineHeight: `${LINE_HEIGHT}px`,
            color: '#334155',
            textAlign: 'right',
            userSelect: 'none',
            overflow: 'hidden',
            flexShrink: 0,
            minWidth: '36px',
          }}
        >
          {lines.map((_, i) => (
            <div key={i} style={{
              height: `${LINE_HEIGHT}px`,
              color: i === activeLine ? '#fcd34d' : '#334155',
              fontWeight: i === activeLine ? 700 : 400,
            }}>
              {i + 1}
            </div>
          ))}
        </div>

        {/* Code area with highlight overlay */}
        <div style={{ flex: 1, position: 'relative' }}>
          {/* Highlight layer (behind textarea) */}
          <div
            ref={highlightRef}
            style={{
              position: 'absolute',
              top: 0, left: 0, right: 0, bottom: 0,
              paddingTop: `${PADDING_TOP}px`,
              paddingLeft: '4px',
              paddingRight: '4px',
              overflow: 'hidden',
              pointerEvents: 'none',
            }}
          >
            {lines.map((_, i) => (
              <div key={i} style={{
                height: `${LINE_HEIGHT}px`,
                borderRadius: i === activeLine ? '6px' : '0',
                border: i === activeLine ? '1px solid rgba(250, 204, 21, 0.3)' : '1px solid transparent',
                marginLeft: '2px',
                marginRight: '2px',
                boxSizing: 'border-box',
                ...(i === activeLine ? {
                  animation: 'highlightPulse 1.5s ease-in-out infinite',
                } : {}),
              }} />
            ))}
          </div>

          {/* Textarea (on top, transparent background) */}
          <textarea
            ref={textareaRef}
            value={code}
            onChange={e => onChange(e.target.value)}
            onScroll={handleScroll}
            spellCheck={false}
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              paddingTop: `${PADDING_TOP}px`,
              paddingLeft: '10px',
              paddingRight: '10px',
              paddingBottom: '10px',
              background: 'transparent',
              color: '#e2e8f0',
              border: 'none',
              fontFamily: FONT_FAMILY,
              fontSize: FONT_SIZE,
              lineHeight: `${LINE_HEIGHT}px`,
              resize: 'none',
              outline: 'none',
              whiteSpace: 'pre',
              margin: 0,
              boxSizing: 'border-box',
              zIndex: 1,
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
