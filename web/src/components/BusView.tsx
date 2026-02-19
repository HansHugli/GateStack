import React from 'react';
import { CpuState, CycleTrace } from '../wasm-bridge';

interface Props {
  state: CpuState | null;
  trace: CycleTrace | null;
}

const hex = (n: number) => '0x' + n.toString(16).padStart(2, '0').toUpperCase();

export default function BusView({ state, trace }: Props) {
  if (!state) return null;

  // Component positions for the bus diagram
  const components = [
    { id: 'IAR', x: 30, y: 20, color: '#f59e0b', value: state.iar },
    { id: 'IR', x: 130, y: 20, color: '#f59e0b', value: state.ir },
    { id: 'R0', x: 230, y: 20, color: '#3b82f6', value: state.r[0] },
    { id: 'R1', x: 310, y: 20, color: '#3b82f6', value: state.r[1] },
    { id: 'R2', x: 390, y: 20, color: '#3b82f6', value: state.r[2] },
    { id: 'R3', x: 470, y: 20, color: '#3b82f6', value: state.r[3] },
    { id: 'ALU', x: 90, y: 110, color: '#a855f7', value: state.acc },
    { id: 'ACC', x: 210, y: 110, color: '#14b8a6', value: state.acc },
    { id: 'TMP', x: 310, y: 110, color: '#64748b', value: state.tmp },
    { id: 'RAM', x: 430, y: 110, color: '#ef4444', value: 0 },
  ];

  // Determine active bus transfers from trace
  const activeTransfers = trace?.steps
    ?.filter(s => s.BusTransfer)
    ?.map(s => s.BusTransfer!) ?? [];

  return (
    <div style={{ padding: '12px', borderBottom: '1px solid #1e293b', minHeight: '180px' }}>
      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#ef4444', marginBottom: '8px' }}>
        🔌 Data Bus
        {trace?.opcode && (
          <span style={{ fontWeight: 400, color: '#64748b', marginLeft: '8px', fontSize: '0.72rem' }}>
            Executing: <span style={{ color: '#a78bfa' }}>{trace.opcode} {trace.reg_a},{trace.reg_b}</span>
          </span>
        )}
      </div>

      <svg viewBox="0 0 540 150" style={{ width: '100%', maxHeight: '150px' }}>
        {/* Main bus line */}
        <line x1="10" y1="70" x2="530" y2="70"
          stroke="#ef4444" strokeWidth="3" opacity="0.3" />
        <text x="265" y="66" textAnchor="middle" fill="#ef4444" fontSize="8" opacity="0.6">
          ═══ 8-BIT BUS ═══ {hex(state.bus)}
        </text>

        {/* Component boxes with bus connections */}
        {components.map(comp => {
          // Check if this component is active in current trace
          const isSource = activeTransfers.some(t => {
            const src = typeof t.source === 'string' ? t.source : '';
            return src === comp.id || (typeof t.source === 'object' && 'Reg' in t.source && t.source.Reg === comp.id);
          });
          const isDest = activeTransfers.some(t => t.dest === comp.id);
          const isActive = isSource || isDest;

          return (
            <g key={comp.id}>
              {/* Connection to bus */}
              <line
                x1={comp.x + 25} y1={comp.y + 30}
                x2={comp.x + 25} y2={70}
                stroke={isActive ? comp.color : '#1e293b'}
                strokeWidth={isActive ? 2 : 1}
                opacity={isActive ? 1 : 0.4}
              />

              {/* Direction arrow */}
              {isSource && (
                <polygon
                  points={`${comp.x + 22},${65} ${comp.x + 28},${65} ${comp.x + 25},${70}`}
                  fill={comp.color}
                />
              )}
              {isDest && (
                <polygon
                  points={`${comp.x + 22},${comp.y + 32} ${comp.x + 28},${comp.y + 32} ${comp.x + 25},${comp.y + 27}`}
                  fill={comp.color}
                />
              )}

              {/* Component box */}
              <rect
                x={comp.x} y={comp.y} width="50" height="30" rx="4"
                fill={isActive ? comp.color + '33' : '#1e293b'}
                stroke={isActive ? comp.color : '#334155'}
                strokeWidth={isActive ? 2 : 1}
              />
              <text
                x={comp.x + 25} y={comp.y + 14}
                textAnchor="middle" fill={isActive ? '#fff' : '#94a3b8'}
                fontSize="10" fontWeight="bold"
              >
                {comp.id}
              </text>
              <text
                x={comp.x + 25} y={comp.y + 25}
                textAnchor="middle" fill={isActive ? '#fff' : '#475569'}
                fontSize="8" fontFamily="monospace"
              >
                {hex(comp.value)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
