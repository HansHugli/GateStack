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

  // ALU polygon: left edge at x=70, top-left at y=20, bottom-left at y=80
  // Input A connects at roughly y=35 (between y=20 and y=50 indent)
  // Input B connects at roughly y=65 (between y=50 indent and y=80)
  // The polygon notch is at (85,50), so wires should meet the left edge
  // Left edge top segment: from (70,20) to (85,50) → at y=35, x ≈ 75.6
  // Left edge bot segment: from (85,50) to (70,80) → at y=65, x ≈ 75.6

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

      <svg viewBox="0 0 260 100" style={{ width: '100%', maxHeight: 100 }}>
        {/* Input A wire — connects to left edge of polygon at y=32 */}
        <line x1="0" y1="30" x2="74" y2="32"
          stroke={active ? '#93c5fd' : '#2a3a5c'} strokeWidth={active ? 2 : 1}
          strokeDasharray={active ? "6 3" : "none"}
          style={active ? { animation: 'wirePulse 0.4s linear infinite' } : {}} />
        {/* Input B wire — connects to left edge at y=68 */}
        <line x1="0" y1="70" x2="74" y2="68"
          stroke={active ? '#93c5fd' : '#2a3a5c'} strokeWidth={active ? 2 : 1}
          strokeDasharray={active ? "6 3" : "none"}
          style={active ? { animation: 'wirePulse 0.4s linear infinite' } : {}} />

        {/* ALU trapezoid shape */}
        <polygon points="70,20 160,42 160,58 70,80 85,50"
          fill={active ? '#2e1065' : '#111628'}
          stroke={active ? '#7c3aed' : '#2a3a5c'} strokeWidth={1.5}
          style={active ? { animation: 'aluPulse 0.6s ease infinite' } : {}} />

        {/* Operation label */}
        <text x="108" y="54" textAnchor="middle" fill={active ? '#c4b5fd' : '#718096'}
          fontSize="12" fontWeight="700" fontFamily="var(--font-mono)">
          {active ? alu!.op : '—'}
        </text>

        {/* Output wire */}
        <line x1="160" y1="50" x2="260" y2="50"
          stroke={active ? '#6ee7b7' : '#2a3a5c'} strokeWidth={active ? 2 : 1}
          strokeDasharray={active ? "6 3" : "none"}
          style={active ? { animation: 'wirePulse 0.4s linear infinite' } : {}} />

        {/* Input/output values */}
        {active && alu && (
          <>
            <text x="4" y="24" fill="#93c5fd" fontSize="9" fontFamily="var(--font-mono)" fontWeight="600">
              A: {hex(alu.input_a)} ({alu.input_a})
            </text>
            <text x="4" y="86" fill="#93c5fd" fontSize="9" fontFamily="var(--font-mono)" fontWeight="600">
              B: {hex(alu.input_b)} ({alu.input_b})
            </text>
            <text x="175" y="44" fill="#6ee7b7" fontSize="9" fontFamily="var(--font-mono)" fontWeight="700">
              = {hex(alu.result.value)} ({alu.result.value})
            </text>
            <text x="175" y="58" fill="#718096" fontSize="7" fontFamily="var(--font-mono)">
              {bin(alu.result.value)}
            </text>
          </>
        )}
      </svg>

      {/* Flags from ALU result */}
      {active && alu && (
        <div style={{
          display: 'flex', gap: 8, marginTop: 4, fontSize: '0.68rem',
          fontFamily: 'var(--font-mono)', color: 'var(--text-muted)',
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
