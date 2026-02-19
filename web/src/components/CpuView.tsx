import React from 'react';
import { CpuState, CycleTrace, MicroStep } from '../wasm-bridge';

const hex = (n: number) => '0x' + n.toString(16).padStart(2, '0').toUpperCase();
const bin = (n: number) => n.toString(2).padStart(8, '0');

interface Props {
  state: CpuState | null;
  trace: CycleTrace | null;
}

export default function CpuView({ state, trace }: Props) {
  if (!state) return null;

  const regStyle = (isActive: boolean) => ({
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 10px',
    background: isActive ? '#1e3a5f' : '#0f172a',
    borderRadius: '6px',
    marginBottom: '4px',
    border: `1px solid ${isActive ? '#3b82f6' : '#1e293b'}`,
    transition: 'all 0.15s',
  });

  const labelStyle = { fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 as const };
  const valueStyle = (isActive: boolean) => ({
    fontFamily: "'Cascadia Code', 'Fira Code', monospace",
    fontSize: '0.82rem',
    color: isActive ? '#60a5fa' : '#e2e8f0',
    fontWeight: 700 as const,
  });

  // Determine which register was last written (from trace)
  const activeReg = [...(trace?.steps ?? [])].reverse().find(
    (s: MicroStep) => s.BusTransfer?.dest?.startsWith('R')
  )?.BusTransfer?.dest;

  return (
    <div style={{ padding: '12px', borderBottom: '1px solid #1e293b' }}>
      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#fcd34d', marginBottom: '10px' }}>
        📟 CPU Registers
      </div>

      {/* General Purpose Registers */}
      {state.r.map((val, i) => {
        const isActive = activeReg === `R${i}`;
        return (
          <div key={i} style={regStyle(isActive)}>
            <span style={labelStyle}>R{i}</span>
            <span style={valueStyle(isActive)}>
              {hex(val)} <span style={{ color: '#94a3b8', fontSize: '0.7rem' }}>{val}</span> <span style={{ color: '#475569', fontSize: '0.65rem' }}>{bin(val)}</span>
            </span>
          </div>
        );
      })}

      {/* Special Registers */}
      <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b', marginTop: '12px', marginBottom: '6px' }}>
        SPECIAL
      </div>

      {[
        { label: 'ACC', value: state.acc, desc: 'Accumulator' },
        { label: 'IAR', value: state.iar, desc: 'Instr. Address' },
        { label: 'IR', value: state.ir, desc: 'Instruction Reg' },
        { label: 'TMP', value: state.tmp, desc: 'Temporary' },
        { label: 'BUS', value: state.bus, desc: 'Main Bus' },
      ].map(({ label, value, desc }) => (
        <div key={label} style={regStyle(false)}>
          <div>
            <span style={labelStyle}>{label}</span>
            <span style={{ fontSize: '0.6rem', color: '#475569', marginLeft: '6px' }}>{desc}</span>
          </div>
          <span style={valueStyle(false)}>{hex(value)} <span style={{ color: '#94a3b8', fontSize: '0.7rem' }}>{value}</span></span>
        </div>
      ))}

      {/* Flags */}
      <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b', marginTop: '12px', marginBottom: '6px' }}>
        FLAGS
      </div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {[
          { label: 'C', value: state.flags.carry, name: 'Carry' },
          { label: 'Z', value: state.flags.zero, name: 'Zero' },
          { label: 'A', value: state.flags.a_larger, name: 'A>B' },
          { label: 'E', value: state.flags.equal, name: 'Equal' },
        ].map(({ label, value, name }) => (
          <div
            key={label}
            title={name}
            style={{
              padding: '3px 10px',
              borderRadius: '4px',
              fontSize: '0.75rem',
              fontWeight: 700,
              background: value ? '#065f46' : '#1e293b',
              color: value ? '#34d399' : '#475569',
              border: `1px solid ${value ? '#059669' : '#334155'}`,
            }}
          >
            {label}
          </div>
        ))}
      </div>

      {/* Last instruction info from trace */}
      {trace?.opcode && (
        <div style={{
          marginTop: '12px', padding: '8px 10px', background: '#1a1a2e',
          borderRadius: '6px', borderLeft: '3px solid #6366f1', fontSize: '0.75rem',
        }}>
          <span style={{ color: '#a78bfa', fontWeight: 700 }}>{trace.opcode}</span>
          <span style={{ color: '#64748b' }}> {trace.reg_a}, {trace.reg_b}</span>
          <span style={{ color: '#475569', display: 'block', marginTop: '2px' }}>
            @ 0x{trace.address.toString(16).padStart(2, '0').toUpperCase()} · Cycle {trace.cycle}
          </span>
        </div>
      )}
    </div>
  );
}
