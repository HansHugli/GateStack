import React from 'react';
import { CycleTrace } from '../wasm-bridge';

const hex = (n: number) => '0x' + n.toString(16).padStart(2, '0').toUpperCase();
const bin = (n: number) => n.toString(2).padStart(8, '0');

const ALU_STYLES = `
  @keyframes aluPulse { 0% { fill: #2e1065; } 50% { fill: #4c1d95; } 100% { fill: #2e1065; } }
  @keyframes wirePulse { 0% { stroke-dashoffset: 12; } 100% { stroke-dashoffset: 0; } }
`;

interface Props { trace: CycleTrace | null; }

export default function AluView({ trace }: Props) {
  const aluStep = trace?.steps?.find(s => s.AluOperation);
  const alu = aluStep?.AluOperation;
  const active = !!alu;

  return (
    <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
      <style>{ALU_STYLES}</style>
      <div style={{
        fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)',
        textTransform: 'uppercase' as const, letterSpacing: '1px',
        marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <div style={{ width: 3, height: 12, borderRadius: 2, background: 'var(--accent-purple)' }} />
        ALU
      </div>

      {/* ALU SVG */}
      <svg viewBox="0 0 260 100" style={{ width: '100%', maxHeight: 100 }}>
        {/* Input A wire */}
        <line x1="0" y1="28" x2="65" y2="35"
          stroke={active ? '#60a5fa' : '#1e2a42'} strokeWidth={active ? 2 : 1}
          strokeDasharray={active ? "6 3" : "none"}
          style={active ? { animation: 'wirePulse 0.4s linear infinite' } : {}} />
        {/* Input B wire */}
        <line x1="0" y1="72" x2="65" y2="65"
          stroke={active ? '#60a5fa' : '#1e2a42'} strokeWidth={active ? 2 : 1}
          strokeDasharray={active ? "6 3" : "none"}
          style={active ? { animation: 'wirePulse 0.4s linear infinite' } : {}} />

        {/* ALU shape */}
        <polygon points="70,20 160,42 160,58 70,80 85,50"
          fill={active ? '#2e1065' : '#111628'}
          stroke={active ? '#7c3aed' : '#1e2a42'} strokeWidth={1.5}
          style={active ? { animation: 'aluPulse 0.6s ease infinite' } : {}} />

        {/* Operation label */}
        <text x="105" y="54" textAnchor="middle" fill={active ? '#c4b5fd' : '#4a5568'}
          fontSize="12" fontWeight="700" fontFamily="var(--font-mono)">
          {active ? alu!.op : '—'}
        </text>

        {/* Output wire */}
        <line x1="160" y1="50" x2="260" y2="50"
          stroke={active ? '#34d399' : '#1e2a42'} strokeWidth={active ? 2 : 1}
          strokeDasharray={active ? "6 3" : "none"}
          style={active ? { animation: 'wirePulse 0.4s linear infinite' } : {}} />

        {/* Input labels */}
        {active && alu && (
          <>
            <text x="4" y="25" fill="#93c5fd" fontSize="9" fontFamily="var(--font-mono)" fontWeight="600">
              A: {hex(alu.input_a)}
            </text>
            <text x="4" y="80" fill="#93c5fd" fontSize="9" fontFamily="var(--font-mono)" fontWeight="600">
              B: {hex(alu.input_b)}
            </text>
            <text x="180" y="45" fill="#6ee7b7" fontSize="9" fontFamily="var(--font-mono)" fontWeight="600">
              = {hex(alu.result.value)}
            </text>
            <text x="180" y="58" fill="#4a5568" fontSize="7" fontFamily="var(--font-mono)">
              {bin(alu.result.value)}
            </text>
          </>
        )}
      </svg>

      {/* Flags from ALU result */}
      {active && alu && (
        <div style={{
          display: 'flex', gap: 6, marginTop: 4, fontSize: '0.6rem',
          fontFamily: 'var(--font-mono)', color: 'var(--text-dim)',
        }}>
          {alu.result.carry && <span style={{ color: 'var(--accent-amber)' }}>CARRY</span>}
          {alu.result.zero && <span style={{ color: 'var(--accent-cyan)' }}>ZERO</span>}
          {alu.result.a_larger && <span style={{ color: 'var(--accent-green)' }}>A&gt;B</span>}
          {alu.result.equal && <span style={{ color: 'var(--accent-purple)' }}>EQ</span>}
        </div>
      )}
    </div>
  );
}
