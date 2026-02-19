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
    rows.push(
      <div key={addr} style={{ display: 'flex', alignItems: 'center', height: '22px', fontSize: '0.72rem' }}>
        {/* Address */}
        <span style={{
          width: '32px', color: '#475569', fontFamily: 'monospace',
          textAlign: 'right', marginRight: '8px', flexShrink: 0,
        }}>
          {hex(addr)}
        </span>

        {/* Hex values */}
        <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
          {cells.map((val, i) => {
            const cellAddr = addr + i;
            const isPC = cellAddr === currentAddress;
            const isNonZero = val !== 0;

            return (
              <span
                key={i}
                title={`[0x${hex(cellAddr)}] = ${val} (0b${val.toString(2).padStart(8, '0')})`}
                style={{
                  fontFamily: "'Cascadia Code', 'Fira Code', monospace",
                  padding: '1px 3px',
                  borderRadius: '3px',
                  background: isPC ? '#1e40af' : isNonZero ? '#1e293b' : 'transparent',
                  color: isPC ? '#60a5fa' : isNonZero ? '#e2e8f0' : '#334155',
                  border: isPC ? '1px solid #3b82f6' : '1px solid transparent',
                  fontWeight: isPC ? 700 : 400,
                  cursor: 'default',
                  minWidth: '22px',
                  textAlign: 'center' as const,
                }}
              >
                {hex(val)}
              </span>
            );
          })}
        </div>

        {/* ASCII */}
        <span style={{
          marginLeft: '6px', color: '#334155', fontFamily: 'monospace', fontSize: '0.68rem',
          flexShrink: 0, whiteSpace: 'nowrap',
        }}>
          {cells.map(v => (v >= 32 && v < 127) ? String.fromCharCode(v) : '.').join('')}
        </span>
      </div>
    );
  }

  return (
    <div style={{ padding: '12px', height: '100%', overflow: 'auto', overflowX: 'hidden' }}>
      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#14b8a6', marginBottom: '8px' }}>
        🧠 RAM · 256 Bytes
      </div>

      {/* Column headers */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px', fontSize: '0.65rem', color: '#475569' }}>
        <span style={{ width: '32px', textAlign: 'right', marginRight: '8px' }}>ADDR</span>
        <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
          {[0,1,2,3,4,5,6,7].map(i => (
            <span key={i} style={{ minWidth: '22px', textAlign: 'center' }}>+{i}</span>
          ))}
        </div>
        <span style={{ marginLeft: '8px', width: '60px' }}>ASCII</span>
      </div>

      {rows}

      {/* Stats */}
      <div style={{ marginTop: '12px', fontSize: '0.7rem', color: '#475569', borderTop: '1px solid #1e293b', paddingTop: '8px' }}>
        <div>Non-zero cells: {memory.filter(v => v !== 0).length}</div>
        <div>PC → 0x{hex(currentAddress)}: {hex(memory[currentAddress] ?? 0)}</div>
      </div>
    </div>
  );
}
