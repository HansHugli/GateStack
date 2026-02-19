import React from 'react';
import { CycleTrace } from '../wasm-bridge';

interface Props {
  trace: CycleTrace | null;
}

const hex = (n: number) => '0x' + n.toString(16).padStart(2, '0').toUpperCase();
const bin = (n: number) => n.toString(2).padStart(8, '0');

const ALU_STYLES = `
  @keyframes aluPulse {
    0% { fill: #2e1065; } 50% { fill: #4c1d95; } 100% { fill: #2e1065; }
  }
  @keyframes wirePulse {
    0% { stroke-dashoffset: 12; } 100% { stroke-dashoffset: 0; }
  }
  @keyframes resultFlash {
    0% { fill: #4ade80; } 100% { fill: #22c55e; }
  }
`;

export default function AluView({ trace }: Props) {
  const aluStep = trace?.steps?.find(s => s.AluOperation);
  const alu = aluStep?.AluOperation;
  const active = !!alu;

  return (
    <div style={{ padding: '12px', borderBottom: '1px solid #1e293b' }}>
      <style>{ALU_STYLES}</style>
      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#a78bfa', marginBottom: '8px' }}>
        🔢 ALU
      </div>

      {/* ALU SVG diagram */}
      <svg viewBox="0 0 260 110" style={{ width: '100%', maxHeight: '110px' }}>
        {/* Input A wire */}
        <line x1="0" y1="28" x2="65" y2="35"
          stroke={active ? '#60a5fa' : '#1e293b'}
          strokeWidth={active ? 2.5 : 1}
          strokeDasharray={active ? '4 4' : 'none'}
          style={active ? { animation: 'wirePulse 0.3s linear infinite' } : undefined} />
        <text x="4" y="22" fill="#64748b" fontSize="8">A</text>
        {alu && (
          <g>
            <text x="6" y="42" fill="#60a5fa" fontSize="9" fontFamily="monospace" fontWeight="bold">
              {hex(alu.input_a)} <tspan fill="#94a3b8">{alu.input_a}</tspan>
            </text>
            <text x="6" y="52" fill="#334155" fontSize="7" fontFamily="monospace">
              {bin(alu.input_a)}
            </text>
          </g>
        )}

        {/* Input B wire */}
        <line x1="0" y1="82" x2="65" y2="72"
          stroke={active ? '#60a5fa' : '#1e293b'}
          strokeWidth={active ? 2.5 : 1}
          strokeDasharray={active ? '4 4' : 'none'}
          style={active ? { animation: 'wirePulse 0.3s linear infinite' } : undefined} />
        <text x="4" y="76" fill="#64748b" fontSize="8">B</text>
        {alu && (
          <g>
            <text x="6" y="96" fill="#60a5fa" fontSize="9" fontFamily="monospace" fontWeight="bold">
              {hex(alu.input_b)} <tspan fill="#94a3b8">{alu.input_b}</tspan>
            </text>
            <text x="6" y="106" fill="#334155" fontSize="7" fontFamily="monospace">
              {bin(alu.input_b)}
            </text>
          </g>
        )}

        {/* ALU trapezoid body */}
        <polygon
          points="65,20 65,88 170,75 170,32"
          fill={active ? '#2e1065' : '#111827'}
          stroke={active ? '#a855f7' : '#1e293b'}
          strokeWidth={active ? 2.5 : 1}
          style={active ? { animation: 'aluPulse 0.8s ease-in-out' } : undefined}
        />

        {/* Operation label inside ALU */}
        <text x="110" y="50" textAnchor="middle"
          fill={active ? '#e9d5ff' : '#334155'}
          fontSize="14" fontWeight="bold">
          {alu ? alu.op : 'IDLE'}
        </text>
        {active && (
          <text x="110" y="64" textAnchor="middle" fill="#a78bfa" fontSize="8">
            {hex(alu!.input_a)} {alu!.op === 'ADD' ? '+' : alu!.op === 'AND' ? '&' : alu!.op === 'OR' ? '|' : alu!.op === 'XOR' ? '^' : alu!.op === 'NOT' ? '~' : alu!.op === 'SHL' ? '<<' : alu!.op === 'SHR' ? '>>' : '?'} {alu!.op === 'NOT' ? '' : hex(alu!.input_b)}
          </text>
        )}

        {/* Output wire */}
        <line x1="170" y1="53" x2="260" y2="53"
          stroke={active ? '#4ade80' : '#1e293b'}
          strokeWidth={active ? 2.5 : 1}
          strokeDasharray={active ? '4 4' : 'none'}
          style={active ? { animation: 'wirePulse 0.3s linear infinite' } : undefined} />

        {alu && (
          <g>
            <text x="195" y="47" fill="#4ade80" fontSize="11" fontFamily="monospace" fontWeight="bold"
              style={{ animation: 'resultFlash 0.5s ease-in-out' }}>
              {hex(alu.result.value)} <tspan fill="#94a3b8" fontSize="9">{alu.result.value}</tspan>
            </text>
            <text x="195" y="68" fill="#334155" fontSize="7" fontFamily="monospace">
              {bin(alu.result.value)}
            </text>
          </g>
        )}

        {/* Flag outputs */}
        {alu && (
          <g>
            <line x1="145" y1="32" x2="145" y2="10" stroke={alu.result.carry ? '#fbbf24' : '#1e293b'} strokeWidth="1.5" />
            <text x="130" y="8" fill={alu.result.carry ? '#fbbf24' : '#334155'} fontSize="7" fontWeight="bold">
              C={alu.result.carry ? '1' : '0'}
            </text>
            <text x="160" y="8" fill={alu.result.zero ? '#4ade80' : '#334155'} fontSize="7" fontWeight="bold">
              Z={alu.result.zero ? '1' : '0'}
            </text>
          </g>
        )}
      </svg>

      {/* Micro-operations timeline */}
      {trace && trace.steps.length > 0 && (
        <div style={{ marginTop: '8px' }}>
          <div style={{ fontSize: '0.68rem', color: '#475569', marginBottom: '4px', fontWeight: 600 }}>
            MICRO-OPS ({trace.steps.length} steps)
          </div>
          <div style={{ maxHeight: '100px', overflow: 'auto' }}>
            {trace.steps.map((step, i) => {
              let text = '';
              let color = '#64748b';
              let icon = '·';

              if (step.BusTransfer) {
                const src = typeof step.BusTransfer.source === 'string'
                  ? step.BusTransfer.source
                  : 'Reg' in step.BusTransfer.source
                    ? step.BusTransfer.source.Reg
                    : `#${(step.BusTransfer.source as any).Immediate}`;
                text = `${src} → ${step.BusTransfer.dest} [${hex(step.BusTransfer.value)} = ${step.BusTransfer.value}]`;
                color = '#60a5fa'; icon = '→';
              } else if (step.IncrementIAR) {
                text = `IAR++ = ${hex(step.IncrementIAR.new_value)} (${step.IncrementIAR.new_value})`;
                color = '#94a3b8'; icon = '+';
              } else if (step.AluOperation) {
                const r = step.AluOperation.result;
                text = `${step.AluOperation.input_a} ${step.AluOperation.op} ${step.AluOperation.input_b} = ${r.value} (${hex(r.value)})`;
                color = '#a78bfa'; icon = '⚡';
              } else if (step.Jump) {
                text = `JMP → ${hex(step.Jump.target)} (${step.Jump.target}) ${step.Jump.taken ? '✓ taken' : '✗ not taken'}`;
                color = step.Jump.taken ? '#4ade80' : '#f87171'; icon = step.Jump.taken ? '↗' : '↗';
              } else if (step.FetchOperand) {
                text = `Fetch operand: ${hex(step.FetchOperand.value)} (${step.FetchOperand.value})`;
                color = '#fbbf24'; icon = '📥';
              }

              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  fontSize: '0.68rem', color, fontFamily: 'monospace',
                  padding: '2px 0',
                  borderLeft: `2px solid ${color}33`,
                  paddingLeft: '8px',
                  marginBottom: '1px',
                }}>
                  <span style={{ opacity: 0.7, width: '14px', textAlign: 'center' }}>{icon}</span>
                  <span style={{ color: '#475569', width: '14px' }}>{i + 1}.</span>
                  <span>{text}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
