import React from 'react';
import { CycleTrace } from '../wasm-bridge';

const hex = (n: number) => '0x' + (n >>> 0).toString(16).padStart(8, '0').toUpperCase();
const bin32 = (n: number) => (n >>> 0).toString(2).padStart(32, '0').replace(/(.{8})(?!$)/g, '$1 ');

const ALU_STYLES = `
  @keyframes aluPulse { 0% { fill: #2e1065; } 50% { fill: #4c1d95; } 100% { fill: #2e1065; } }
  @keyframes wirePulse { 0% { stroke-dashoffset: 12; } 100% { stroke-dashoffset: 0; } }
`;

interface Props { trace: CycleTrace | null; isRunning?: boolean; }

export default function AluView({ trace, isRunning }: Props) {
  const alu = trace?.steps?.find(s => s.AluOperation)?.AluOperation;
  const active = !!alu;
  const idleText = isRunning
    ? 'Running — Pause and Step to watch the ALU'
    : trace ? `${trace.opcode ?? 'This instruction'} does not use the ALU` : 'Step an ALU instruction to see it here';

  return (
    <section aria-label="ALU" style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
      <style>{ALU_STYLES}</style>
      <h2 style={{
        fontSize: '0.6875rem', fontWeight: 700, color: 'var(--text-muted)',
        textTransform: 'uppercase' as const, letterSpacing: '1px',
        margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <div style={{ width: 3, height: 12, borderRadius: 2, background: 'var(--accent-purple)' }} />
        ALU
      </h2>

      <svg viewBox="0 0 260 100" style={{ width: '100%', maxHeight: 100 }} aria-hidden="true">
        <text x="2" y="26" fill={active ? '#93c5fd' : '#7d899d'} fontSize="13" fontWeight="700" fontFamily="var(--font-mono)">A</text>
        <text x="2" y="80" fill={active ? '#93c5fd' : '#7d899d'} fontSize="13" fontWeight="700" fontFamily="var(--font-mono)">B</text>
        <line x1="14" y1="30" x2="74" y2="32"
          stroke={active ? '#93c5fd' : '#2a3a5c'} strokeWidth={active ? 2 : 1}
          strokeDasharray={active ? '6 3' : 'none'}
          style={active ? { animation: 'wirePulse 0.4s linear infinite' } : {}} />
        <line x1="14" y1="70" x2="74" y2="68"
          stroke={active ? '#93c5fd' : '#2a3a5c'} strokeWidth={active ? 2 : 1}
          strokeDasharray={active ? '6 3' : 'none'}
          style={active ? { animation: 'wirePulse 0.4s linear infinite' } : {}} />
        <polygon points="70,20 160,42 160,58 70,80 85,50"
          fill={active ? '#2e1065' : '#111628'}
          stroke={active ? '#7c3aed' : '#2a3a5c'} strokeWidth={1.5}
          style={active ? { animation: 'aluPulse 0.6s ease infinite' } : {}} />
        <text x="114" y="55" textAnchor="middle" fill={active ? '#c4b5fd' : '#7d899d'}
          fontSize="13" fontWeight="700" fontFamily="var(--font-mono)">
          {active ? alu!.op : '—'}
        </text>
        <line x1="160" y1="50" x2="240" y2="50"
          stroke={active ? '#6ee7b7' : '#2a3a5c'} strokeWidth={active ? 2 : 1}
          strokeDasharray={active ? '6 3' : 'none'}
          style={active ? { animation: 'wirePulse 0.4s linear infinite' } : {}} />
        <text x="246" y="55" fill={active ? '#6ee7b7' : '#7d899d'} fontSize="13" fontWeight="700" fontFamily="var(--font-mono)">=</text>
      </svg>

      {active && alu ? (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6875rem', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '1px 8px' }}>
          <span style={{ color: '#93c5fd', fontWeight: 700 }}>A</span>
          <span style={{ color: 'var(--text-secondary)' }}>{hex(alu.input_a)} ({alu.input_a >>> 0})</span>
          <span style={{ color: '#93c5fd', fontWeight: 700 }}>B</span>
          <span style={{ color: 'var(--text-secondary)' }}>{hex(alu.input_b)} ({alu.input_b >>> 0})</span>
          <span style={{ color: '#6ee7b7', fontWeight: 700 }}>=</span>
          <span style={{ color: '#6ee7b7', fontWeight: 700 }}>{hex(alu.result.value)} ({alu.result.value >>> 0})</span>
          <span />
          <span style={{ color: 'var(--text-muted)', letterSpacing: '-0.2px' }}>{bin32(alu.result.value)}</span>
        </div>
      ) : (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.6875rem', fontStyle: 'italic' }}>{idleText}</div>
      )}

      {active && alu && (
        <div style={{
          display: 'flex', gap: 8, marginTop: 4, fontSize: '0.6875rem',
          fontFamily: 'var(--font-mono)', color: 'var(--text-muted)',
        }}>
          <span>Flags:</span>
          {alu.result.carry && <span style={{ color: 'var(--accent-amber)' }}>CARRY</span>}
          {alu.result.zero && <span style={{ color: 'var(--accent-cyan)' }}>ZERO</span>}
          {alu.result.a_larger && <span style={{ color: 'var(--accent-green)' }}>A&gt;B</span>}
          {alu.result.equal && <span style={{ color: 'var(--accent-purple)' }}>EQ</span>}
          {!alu.result.carry && !alu.result.zero && !alu.result.a_larger && !alu.result.equal && <span>none</span>}
        </div>
      )}
    </section>
  );
}
