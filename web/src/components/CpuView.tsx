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

  // Determine which register was last written (from trace)
  const activeReg = [...(trace?.steps ?? [])].reverse().find(
    (s: MicroStep) => s.BusTransfer?.dest?.startsWith('R')
  )?.BusTransfer?.dest;

  return (
    <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
      {/* Section header */}
      <div style={{
        fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)',
        textTransform: 'uppercase' as const, letterSpacing: '1px',
        marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <div style={{
          width: 3, height: 12, borderRadius: 2,
          background: 'var(--accent-amber)',
        }} />
        Registers
      </div>

      {/* General Purpose Registers */}
      {state.r.map((val, i) => {
        const name = `R${i}`;
        const isActive = activeReg === name;
        return (
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '4px 8px', marginBottom: 2,
            background: isActive ? 'var(--accent-blue-dim)' : 'var(--bg-elevated)',
            borderRadius: 'var(--radius-sm)',
            border: `1px solid ${isActive ? '#2563eb40' : 'var(--border-subtle)'}`,
            transition: 'all 0.15s',
          }}>
            <span style={{
              fontSize: '0.72rem', color: isActive ? 'var(--accent-blue)' : 'var(--text-secondary)',
              fontWeight: 700, fontFamily: 'var(--font-mono)', minWidth: 24,
            }}>{name}</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.78rem',
                color: isActive ? '#93c5fd' : 'var(--text-primary)',
                fontWeight: 700,
              }}>{hex(val)}</span>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
                color: 'var(--text-muted)',
              }}>{val}</span>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.58rem',
                color: 'var(--text-muted)', letterSpacing: '0.5px',
              }}>{bin(val)}</span>
            </div>
          </div>
        );
      })}

      {/* Special Registers */}
      <div style={{
        fontSize: '0.62rem', fontWeight: 600, color: 'var(--text-muted)',
        textTransform: 'uppercase' as const, letterSpacing: '0.8px',
        marginTop: 10, marginBottom: 4,
      }}>
        Special
      </div>

      {[
        { label: 'ACC', value: state.acc },
        { label: 'IAR', value: state.iar },
        { label: 'IR',  value: state.ir  },
        { label: 'TMP', value: state.tmp },
        { label: 'BUS', value: state.bus },
      ].map(({ label, value }) => (
        <div key={label} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '3px 8px', marginBottom: 1,
          borderRadius: 'var(--radius-sm)',
        }}>
          <span style={{
            fontSize: '0.68rem', color: 'var(--text-muted)',
            fontWeight: 600, fontFamily: 'var(--font-mono)', minWidth: 28,
          }}>{label}</span>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
            color: 'var(--text-secondary)',
          }}>{hex(value)} <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{value}</span></span>
        </div>
      ))}

      {/* Flags */}
      <div style={{
        fontSize: '0.62rem', fontWeight: 600, color: 'var(--text-muted)',
        textTransform: 'uppercase' as const, letterSpacing: '0.8px',
        marginTop: 10, marginBottom: 6,
      }}>
        Flags
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
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
              padding: '2px 8px', borderRadius: 'var(--radius-sm)',
              fontSize: '0.68rem', fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              background: value ? 'var(--accent-green-dim)' : 'var(--bg-elevated)',
              color: value ? 'var(--accent-green)' : 'var(--text-dim)',
              border: `1px solid ${value ? '#05966930' : 'var(--border-subtle)'}`,
              transition: 'all 0.15s',
              flex: 1, textAlign: 'center' as const,
            }}
          >
            {label}
          </div>
        ))}
      </div>

      {/* Last instruction */}
      {trace?.opcode && (
        <div style={{
          marginTop: 10, padding: '6px 8px',
          background: 'var(--bg-elevated)',
          borderRadius: 'var(--radius-sm)',
          borderLeft: '2px solid var(--accent-purple)',
          fontSize: '0.7rem',
        }}>
          <span style={{ color: 'var(--accent-purple)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
            {trace.opcode}
          </span>
          <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {' '}{trace.reg_a}, {trace.reg_b}
          </span>
          <span style={{ color: 'var(--text-dim)', fontSize: '0.6rem', display: 'block', marginTop: 1, fontFamily: 'var(--font-mono)' }}>
            @{hex(trace.address)} · cycle {trace.cycle}
          </span>
        </div>
      )}
    </div>
  );
}
