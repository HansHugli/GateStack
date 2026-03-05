import React from 'react';
import { CpuState, CycleTrace, MicroStep } from '../wasm-bridge';

const hex32 = (n: number) => '0x' + (n >>> 0).toString(16).padStart(8, '0').toUpperCase();
const hex8 = (n: number) => '0x' + (n & 0xFF).toString(16).padStart(2, '0').toUpperCase();

interface Props {
  state: CpuState | null;
  trace: CycleTrace | null;
}

export default function CpuView({ state, trace }: Props) {
  if (!state) return null;

  const activeReg = [...(trace?.steps ?? [])].reverse().find(
    (s: MicroStep) => 'BusTransfer' in s && (s as any).BusTransfer?.dest?.startsWith('R')
  );
  const activeRegDest = activeReg && 'BusTransfer' in activeReg ? (activeReg as any).BusTransfer?.dest : undefined;

  // Split into two columns: R0-R7 and R8-R15
  const leftRegs = state.r.slice(0, 8);
  const rightRegs = state.r.slice(8, 16);

  return (
    <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{
        fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)',
        textTransform: 'uppercase' as const, letterSpacing: '1px',
        marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <div style={{ width: 3, height: 12, borderRadius: 2, background: 'var(--accent-amber)' }} />
        Registers
      </div>

      {/* Single-column register list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {state.r.map((val, i) => {
          const name = `R${i}`;
          const isActive = activeRegDest === name;
          const hasValue = val !== 0;
          const ascii = (val & 0xFF) >= 32 && (val & 0xFF) < 127 ? String.fromCharCode(val & 0xFF) : '·';
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center',
              padding: '1px 6px',
              background: isActive ? 'var(--accent-blue-dim)' : 'transparent',
              borderRadius: 'var(--radius-sm)',
              border: `1px solid ${isActive ? '#2563eb40' : 'transparent'}`,
              transition: 'all 0.15s',
              gap: 6,
            }}>
              <span style={{
                fontSize: '0.62rem',
                color: isActive ? 'var(--accent-blue)' : hasValue ? 'var(--text-secondary)' : 'var(--text-dim)',
                fontWeight: 700, fontFamily: 'var(--font-mono)',
                width: 24,
                flexShrink: 0,
              }}>{name}</span>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
                color: isActive ? '#93c5fd' : hasValue ? 'var(--text-primary)' : 'var(--text-dim)',
                fontWeight: 700, flexShrink: 0,
              }}>{hex32(val)}</span>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
                color: 'var(--text-muted)', flex: 1, textAlign: 'right' as const,
              }}>{val}</span>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
                color: isActive ? '#93c5fd' : hasValue ? 'var(--accent-amber)' : 'var(--text-dim)',
                width: 10, textAlign: 'center' as const, flexShrink: 0,
              }}>{ascii}</span>
            </div>
          );
        })}
      </div>

      {/* Special Registers */}
      <div style={{
        fontSize: '0.58rem', fontWeight: 600, color: 'var(--text-muted)',
        textTransform: 'uppercase' as const, letterSpacing: '0.8px',
        marginTop: 8, marginBottom: 3,
      }}>
        Special
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px 6px' }}>
        {[
          { label: 'ACC', value: state.acc },
          { label: 'SP',  value: state.sp  },
          { label: 'IAR', value: state.iar },
          { label: 'IR',  value: state.ir  },
          { label: 'TMP', value: state.tmp },
          { label: 'BUS', value: state.bus },
        ].map(({ label, value }) => (
          <div key={label} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '2px 6px',
          }}>
            <span style={{
              fontSize: '0.58rem', color: 'var(--text-muted)',
              fontWeight: 600, fontFamily: 'var(--font-mono)', minWidth: 28,
            }}>{label}</span>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
              color: 'var(--text-secondary)',
            }}>{label === 'IR' ? hex8(value) : hex32(value)}</span>
          </div>
        ))}
      </div>

      {/* Flags */}
      <div style={{
        fontSize: '0.58rem', fontWeight: 600, color: 'var(--text-muted)',
        textTransform: 'uppercase' as const, letterSpacing: '0.8px',
        marginTop: 8, marginBottom: 4,
      }}>
        Flags
      </div>
      <div style={{ display: 'flex', gap: 3 }}>
        {[
          { label: 'C', value: state.flags.carry, name: 'Carry' },
          { label: 'Z', value: state.flags.zero, name: 'Zero' },
          { label: 'A', value: state.flags.a_larger, name: 'A>B' },
          { label: 'E', value: state.flags.equal, name: 'Equal' },
        ].map(({ label, value, name }) => (
          <div key={label} title={name} style={{
            padding: '2px 6px', borderRadius: 'var(--radius-sm)',
            fontSize: '0.62rem', fontWeight: 700, fontFamily: 'var(--font-mono)',
            background: value ? 'var(--accent-green-dim)' : 'var(--bg-elevated)',
            color: value ? 'var(--accent-green)' : 'var(--text-dim)',
            border: `1px solid ${value ? '#05966930' : 'var(--border-subtle)'}`,
            transition: 'all 0.15s', flex: 1, textAlign: 'center' as const,
          }}>
            {label}
          </div>
        ))}
      </div>

      {/* Last instruction */}
      {trace?.opcode && (
        <div style={{
          marginTop: 8, padding: '4px 6px',
          background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)',
          borderLeft: '2px solid var(--accent-purple)', fontSize: '0.65rem',
        }}>
          <span style={{ color: 'var(--accent-purple)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
            {trace.opcode}
          </span>
          <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {' '}{trace.reg_a}, {trace.reg_b}
          </span>
          <span style={{ color: 'var(--text-dim)', fontSize: '0.55rem', display: 'block', marginTop: 1, fontFamily: 'var(--font-mono)' }}>
            @{hex32(trace.address)} · cycle {trace.cycle}
          </span>
        </div>
      )}
    </div>
  );
}
