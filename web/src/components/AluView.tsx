import React from 'react';
import { CycleTrace } from '../wasm-bridge';

interface Props {
  trace: CycleTrace | null;
}

const hex = (n: number) => '0x' + n.toString(16).padStart(2, '0').toUpperCase();

export default function AluView({ trace }: Props) {
  // Find the ALU operation in the trace (if any)
  const aluStep = trace?.steps?.find(s => s.AluOperation);
  const alu = aluStep?.AluOperation;

  return (
    <div style={{ padding: '12px', borderBottom: '1px solid #1e293b' }}>
      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#a78bfa', marginBottom: '10px' }}>
        🔢 ALU
      </div>

      {/* ALU gate diagram (SVG) */}
      <svg viewBox="0 0 240 120" style={{ width: '100%', maxHeight: '120px' }}>
        {/* Input A */}
        <line x1="0" y1="30" x2="60" y2="30" stroke={alu ? '#60a5fa' : '#334155'} strokeWidth="2" />
        <text x="2" y="26" fill="#94a3b8" fontSize="10">A</text>
        <text x="20" y="44" fill={alu ? '#60a5fa' : '#475569'} fontSize="9" fontFamily="monospace">
          {alu ? hex(alu.input_a) : '----'}
        </text>

        {/* Input B */}
        <line x1="0" y1="90" x2="60" y2="90" stroke={alu ? '#60a5fa' : '#334155'} strokeWidth="2" />
        <text x="2" y="86" fill="#94a3b8" fontSize="10">B</text>
        <text x="20" y="104" fill={alu ? '#60a5fa' : '#475569'} fontSize="9" fontFamily="monospace">
          {alu ? hex(alu.input_b) : '----'}
        </text>

        {/* ALU trapezoid shape */}
        <polygon
          points="60,15 60,105 160,85 160,35"
          fill={alu ? '#2e1065' : '#1e293b'}
          stroke={alu ? '#a855f7' : '#334155'}
          strokeWidth="2"
        />
        <text x="85" y="55" fill={alu ? '#e9d5ff' : '#475569'} fontSize="13" fontWeight="bold">
          {alu ? alu.op : 'IDLE'}
        </text>

        {/* Output */}
        <line x1="160" y1="60" x2="240" y2="60" stroke={alu ? '#4ade80' : '#334155'} strokeWidth="2" />
        <text x="170" y="54" fill={alu ? '#4ade80' : '#475569'} fontSize="10" fontFamily="monospace" fontWeight="bold">
          {alu ? hex(alu.result.value) : '----'}
        </text>
        <text x="228" y="56" fill="#94a3b8" fontSize="10">→</text>

        {/* Carry out arrow */}
        <line x1="130" y1="35" x2="130" y2="8" stroke={alu?.result.carry ? '#fbbf24' : '#334155'} strokeWidth="1.5" />
        <text x="120" y="6" fill={alu?.result.carry ? '#fbbf24' : '#475569'} fontSize="8">
          C={alu?.result.carry ? '1' : '0'}
        </text>

        {/* Zero flag */}
        <text x="165" y="76" fill={alu?.result.zero ? '#4ade80' : '#475569'} fontSize="8">
          Z={alu?.result.zero ? '1' : '0'}
        </text>
      </svg>

      {/* Micro-steps log */}
      {trace && trace.steps.length > 0 && (
        <div style={{ marginTop: '8px' }}>
          <div style={{ fontSize: '0.68rem', color: '#475569', marginBottom: '4px' }}>MICRO-OPS</div>
          <div style={{ maxHeight: '80px', overflow: 'auto' }}>
            {trace.steps.map((step, i) => {
              let text = '';
              let color = '#64748b';
              if (step.BusTransfer) {
                const src = typeof step.BusTransfer.source === 'string'
                  ? step.BusTransfer.source
                  : 'Reg' in step.BusTransfer.source
                    ? step.BusTransfer.source.Reg
                    : `#${(step.BusTransfer.source as any).Immediate}`;
                text = `${src} → ${step.BusTransfer.dest} [${hex(step.BusTransfer.value)}]`;
                color = '#60a5fa';
              } else if (step.IncrementIAR) {
                text = `IAR++ → ${hex(step.IncrementIAR.new_value)}`;
                color = '#94a3b8';
              } else if (step.AluOperation) {
                text = `ALU: ${hex(step.AluOperation.input_a)} ${step.AluOperation.op} ${hex(step.AluOperation.input_b)} = ${hex(step.AluOperation.result.value)}`;
                color = '#a78bfa';
              } else if (step.Jump) {
                text = `JMP → ${hex(step.Jump.target)} ${step.Jump.taken ? '✓' : '✗'}`;
                color = step.Jump.taken ? '#4ade80' : '#f87171';
              } else if (step.FetchOperand) {
                text = `Fetch operand: ${hex(step.FetchOperand.value)}`;
                color = '#fbbf24';
              }
              return (
                <div key={i} style={{ fontSize: '0.68rem', color, fontFamily: 'monospace', marginBottom: '2px' }}>
                  {i + 1}. {text}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
