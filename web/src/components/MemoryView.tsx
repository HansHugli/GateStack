import React from 'react';

interface Props {
  memory: number[];
  currentAddress: number;
}

const hex = (n: number, pad = 2) => n.toString(16).padStart(pad, '0').toUpperCase();

export default function MemoryView({ memory, currentAddress }: Props) {
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

            return (
              <span key={i}
                title={`${hex(cellAddr)}: ${hex(val)} (${val}) ${val >= 32 && val < 127 ? `'${String.fromCharCode(val)}'` : ''}`}
                style={{
                  padding: '0 2px', borderRadius: 2,
                  background: isPC ? '#1e40af40' : 'transparent',
                  color: isPC ? '#93c5fd' : isNonZero ? 'var(--text-primary)' : 'var(--text-dim)',
                  border: isPC ? '1px solid #3b82f650' : '1px solid transparent',
                  fontWeight: isPC || isNonZero ? 600 : 400,
                  minWidth: 20, textAlign: 'center' as const,
                  fontSize: '0.68rem',
                  transition: 'all 0.1s',
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
    <div style={{ padding: '10px 8px', height: '100%', overflow: 'auto' }}>
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
        <span>{memory.filter(v => v !== 0).length} non-zero cells</span>
        <span style={{ margin: '0 8px', color: 'var(--border-default)' }}>·</span>
        <span>PC → {hex(currentAddress)}: {hex(memory[currentAddress] ?? 0)}</span>
      </div>
    </div>
  );
}
