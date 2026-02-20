import React, { useState, useRef, useEffect } from 'react';

interface Props {
  memory: number[];
  currentAddress: number;
  onPoke: (addr: number, value: number) => void;
}

const hex = (n: number, pad = 2) => n.toString(16).padStart(pad, '0').toUpperCase();

function EditCell({ addr, value, onCommit, onCancel }: {
  addr: number; value: number;
  onCommit: (addr: number, value: number) => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(hex(value));

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const commit = () => {
    let val: number | null = null;
    const t = text.trim();
    if (/^0[xX][0-9a-fA-F]+$/.test(t)) val = parseInt(t, 16);
    else if (/^[0-9a-fA-F]{1,2}$/i.test(t) && !t.match(/^[0-9]+$/) ) val = parseInt(t, 16);
    else if (/^\d+$/.test(t)) val = parseInt(t, 10);
    else if (t.length === 3 && t[0] === "'" && t[2] === "'") val = t.charCodeAt(1);
    else if (t.length === 1) val = t.charCodeAt(0); // single char = ASCII

    if (val !== null && val >= 0 && val <= 255) {
      onCommit(addr, val);
    } else {
      onCancel();
    }
  };

  return (
    <input
      ref={inputRef}
      value={text}
      onChange={e => setText(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') onCancel();
        if (e.key === 'Tab') { e.preventDefault(); commit(); }
      }}
      onBlur={commit}
      style={{
        width: 28, height: 16, padding: '0 2px',
        background: '#1e40af', color: '#fff',
        border: '1px solid #3b82f6', borderRadius: 2,
        fontFamily: 'var(--font-mono)', fontSize: '0.68rem',
        textAlign: 'center', outline: 'none',
      }}
    />
  );
}

export default function MemoryView({ memory, currentAddress, onPoke }: Props) {
  const [editAddr, setEditAddr] = useState<number | null>(null);

  const handleCommit = (addr: number, value: number) => {
    onPoke(addr, value);
    // Move to next cell
    const nextAddr = (addr + 1) & 0xFF;
    setEditAddr(nextAddr);
  };

  const rows: React.ReactElement[] = [];

  for (let addr = 0; addr < 256; addr += 8) {
    const cells = memory.slice(addr, addr + 8);
    const hasData = cells.some(v => v !== 0);

    rows.push(
      <div key={addr} style={{
        display: 'flex', alignItems: 'center', height: 20,
        fontSize: '0.7rem', fontFamily: 'var(--font-mono)',
        background: hasData ? 'var(--bg-elevated)' : 'transparent',
        borderRadius: hasData ? 2 : 0,
        marginBottom: 1,
        paddingLeft: 2, paddingRight: 4,
      }}>
        {/* Address */}
        <span style={{
          width: 28, color: hasData ? 'var(--text-muted)' : 'var(--text-dim)',
          textAlign: 'right', marginRight: 6, flexShrink: 0,
          fontWeight: hasData ? 600 : 400, fontSize: '0.62rem',
        }}>
          {hex(addr)}
        </span>

        {/* Hex values */}
        <div style={{ display: 'flex', gap: 2, flex: 1 }}>
          {cells.map((val, i) => {
            const cellAddr = addr + i;
            const isPC = cellAddr === currentAddress;
            const isNonZero = val !== 0;
            const isEditing = editAddr === cellAddr;

            if (isEditing) {
              return (
                <EditCell
                  key={i}
                  addr={cellAddr}
                  value={val}
                  onCommit={handleCommit}
                  onCancel={() => setEditAddr(null)}
                />
              );
            }

            return (
              <span key={i}
                onClick={() => setEditAddr(cellAddr)}
                title={`Click to edit · ${hex(cellAddr)}: ${hex(val)} (${val})${val >= 32 && val < 127 ? ` '${String.fromCharCode(val)}'` : ''}`}
                style={{
                  padding: '0 2px', borderRadius: 2, cursor: 'pointer',
                  background: isPC ? '#1e40af40' : 'transparent',
                  color: isPC ? '#93c5fd' : isNonZero ? 'var(--text-primary)' : 'var(--text-dim)',
                  border: isPC ? '1px solid #3b82f650' : '1px solid transparent',
                  fontWeight: isPC || isNonZero ? 600 : 400,
                  minWidth: 20, textAlign: 'center' as const,
                  fontSize: '0.68rem',
                  transition: 'all 0.1s',
                }}
                onMouseEnter={e => {
                  if (!isPC) {
                    e.currentTarget.style.background = 'var(--bg-hover, #1e293b)';
                    e.currentTarget.style.borderColor = 'var(--border-default, #334155)';
                  }
                }}
                onMouseLeave={e => {
                  if (!isPC) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.borderColor = 'transparent';
                  }
                }}
              >
                {hex(val)}
              </span>
            );
          })}
        </div>

        {/* ASCII */}
        <span style={{
          marginLeft: 4, color: hasData ? 'var(--accent-green)' : 'var(--text-dim)',
          fontSize: '0.62rem', flexShrink: 0, whiteSpace: 'nowrap' as const,
          fontWeight: hasData ? 500 : 400, opacity: hasData ? 0.7 : 0.3,
        }}>
          {cells.map(v => (v >= 32 && v < 127) ? String.fromCharCode(v) : '·').join('')}
        </span>
      </div>
    );
  }

  return (
    <div style={{ padding: '10px 8px', flex: 1, overflow: 'auto' }}>
      {/* Header */}
      <div style={{
        fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)',
        textTransform: 'uppercase' as const, letterSpacing: '1px',
        marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <div style={{
          width: 3, height: 12, borderRadius: 2,
          background: 'var(--accent-cyan)',
        }} />
        RAM · 256 Bytes
        {editAddr !== null && (
          <span style={{
            fontSize: '0.58rem', fontWeight: 400, color: 'var(--accent-blue)',
            fontFamily: 'var(--font-mono)',
          }}>
            editing {hex(editAddr)}
          </span>
        )}
      </div>

      {/* Column headers */}
      <div style={{
        display: 'flex', alignItems: 'center', marginBottom: 4,
        fontSize: '0.55rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)',
        paddingLeft: 2,
      }}>
        <span style={{ width: 28, textAlign: 'right', marginRight: 6 }}></span>
        <div style={{ display: 'flex', gap: 2, flex: 1 }}>
          {[0,1,2,3,4,5,6,7].map(i => (
            <span key={i} style={{ minWidth: 20, textAlign: 'center' }}>+{i}</span>
          ))}
        </div>
        <span style={{ marginLeft: 4, fontSize: '0.55rem' }}>ASCII</span>
      </div>

      {rows}

      {/* Stats */}
      <div style={{
        marginTop: 8, fontSize: '0.62rem', color: 'var(--text-dim)',
        borderTop: '1px solid var(--border-subtle)', paddingTop: 6,
        fontFamily: 'var(--font-mono)',
      }}>
        <span>{memory.filter(v => v !== 0).length} non-zero</span>
        <span style={{ margin: '0 6px', color: 'var(--border-default)' }}>·</span>
        <span>PC:{hex(currentAddress)}</span>
        <span style={{ margin: '0 6px', color: 'var(--border-default)' }}>·</span>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.55rem' }}>Click cell to edit</span>
      </div>
    </div>
  );
}
