import React from 'react';
import { CpuState, CpuFlags, CycleTrace, getOpcodeName } from '../wasm-bridge';

const hex32 = (n: number) => '0x' + (n >>> 0).toString(16).padStart(8, '0').toUpperCase();
const hex8 = (n: number) => '0x' + (n & 0xFF).toString(16).padStart(2, '0').toUpperCase();

interface Props {
  state: CpuState | null;
  /** State before the last Step or Run; changed registers and flags are highlighted. */
  prevState: CpuState | null;
  trace: CycleTrace | null;
}

/** Indices of registers whose value differs between two states. */
export function changedRegisters(prev: CpuState | null, cur: CpuState | null): Set<number> {
  const out = new Set<number>();
  if (!prev || !cur) return out;
  for (let i = 0; i < cur.r.length; i++) if ((prev.r[i] >>> 0) !== (cur.r[i] >>> 0)) out.add(i);
  return out;
}

export function changedFlags(prev: CpuState | null, cur: CpuState | null): Set<keyof CpuFlags> {
  const out = new Set<keyof CpuFlags>();
  if (!prev || !cur) return out;
  (Object.keys(cur.flags) as Array<keyof CpuFlags>).forEach(k => {
    if (prev.flags[k] !== cur.flags[k]) out.add(k);
  });
  return out;
}

/** Value moved into `dest` during the traced instruction, if any. */
function transferTo(trace: CycleTrace | null, dest: string): number | undefined {
  const steps = trace?.steps ?? [];
  for (let i = steps.length - 1; i >= 0; i--) {
    const t = steps[i].BusTransfer;
    if (t && t.dest === dest && t.value !== undefined) return t.value;
  }
  return undefined;
}

const CHANGED_BG = 'rgba(251, 191, 36, 0.14)';
const CHANGED_BORDER = 'rgba(251, 191, 36, 0.45)';

export default function CpuView({ state, prevState, trace }: Props) {
  if (!state) return null;

  const changed = changedRegisters(prevState, state);
  const flagChanged = changedFlags(prevState, state);

  // IR holds the instruction that was just executed (until the next fetch).
  const executedOpcode = trace?.steps.find(s => s.FetchInstruction)?.FetchInstruction?.value;
  const special: Array<{ label: string; value: string; title: string }> = [
    { label: 'IAR', value: hex32(state.iar), title: 'Instruction Address Register (PC): address of the next instruction' },
    { label: 'SP', value: hex32(state.sp), title: 'Stack Pointer: top of the stack (grows down from 0x3BFFFF)' },
    {
      label: 'IR',
      value: executedOpcode !== undefined ? `${hex8(executedOpcode)} ${trace?.opcode ?? getOpcodeName(executedOpcode)}` : '—',
      title: 'Instruction Register: opcode of the instruction that was just executed (Step to fill it)',
    },
    { label: 'TMP', value: fmt(transferTo(trace, 'TMP')), title: 'TMP: first ALU operand (rA) of the last ALU instruction' },
    { label: 'ACC', value: fmt(transferTo(trace, 'ACC')), title: 'ACC: second ALU operand (rB) of the last ALU instruction' },
    { label: 'MAR', value: fmt(transferTo(trace, 'MAR')), title: 'Memory Address Register: last address put on the address bus' },
  ];

  return (
    <section aria-label="Registers" style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
      <h2 style={sectionTitle}>
        <div style={{ width: 3, height: 12, borderRadius: 2, background: 'var(--accent-amber)' }} />
        Registers
        {changed.size > 0 && (
          <span style={{ fontSize: '0.6875rem', fontWeight: 400, color: 'var(--accent-amber)', textTransform: 'none', letterSpacing: 0 }}>
            · changed in last {trace ? 'step' : 'run'}
          </span>
        )}
      </h2>

      {/* Column headers */}
      <div style={{ ...row, color: 'var(--text-muted)', fontSize: '0.6875rem', fontWeight: 600 }}>
        <span style={{ width: 28, flexShrink: 0 }}>Reg</span>
        <span style={{ flexShrink: 0, width: 82 }}>Hex</span>
        <span style={{ flex: 1, textAlign: 'right' as const }}>Unsigned</span>
        <span style={{ width: 22, textAlign: 'center' as const, flexShrink: 0 }} title="Low byte as an ASCII character">Chr</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {state.r.map((val, i) => {
          const name = `R${i}`;
          const isChanged = changed.has(i);
          const hasValue = val !== 0;
          const low = val & 0xFF;
          const ascii = low >= 32 && low < 127 ? String.fromCharCode(low) : '·';
          return (
            <div key={i} style={{
              ...row,
              background: isChanged ? CHANGED_BG : 'transparent',
              border: `1px solid ${isChanged ? CHANGED_BORDER : 'transparent'}`,
            }} title={isChanged && prevState ? `${name} was ${hex32(prevState.r[i])} (${prevState.r[i] >>> 0})` : undefined}>
              <span style={{
                fontSize: '0.6875rem', width: 28, flexShrink: 0, fontWeight: 700, fontFamily: 'var(--font-mono)',
                color: isChanged ? 'var(--accent-amber)' : hasValue ? 'var(--text-secondary)' : 'var(--text-dim)',
              }}>{name}</span>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.6875rem', fontWeight: 700, flexShrink: 0, width: 82,
                color: isChanged ? '#fde68a' : hasValue ? 'var(--text-primary)' : 'var(--text-dim)',
              }}>{hex32(val)}</span>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.6875rem',
                color: 'var(--text-muted)', flex: 1, textAlign: 'right' as const,
              }}>{val >>> 0}</span>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.6875rem',
                color: hasValue ? 'var(--accent-amber)' : 'var(--text-dim)',
                width: 22, textAlign: 'center' as const, flexShrink: 0,
              }}>{ascii}</span>
            </div>
          );
        })}
      </div>

      <h3 style={subTitle}>Special</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px 6px' }}>
        {special.map(({ label, value, title }) => (
          <div key={label} title={title} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 6px', gap: 4,
          }}>
            <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', fontWeight: 600, fontFamily: 'var(--font-mono)', minWidth: 28 }}>{label}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6875rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{value}</span>
          </div>
        ))}
      </div>

      <h3 style={subTitle}>Flags</h3>
      <div style={{ display: 'flex', gap: 3 }}>
        {([
          { key: 'carry', label: 'C', name: 'Carry' },
          { key: 'zero', label: 'Z', name: 'Zero' },
          { key: 'a_larger', label: 'A', name: 'A>B' },
          { key: 'equal', label: 'E', name: 'Equal' },
        ] as Array<{ key: keyof CpuFlags; label: string; name: string }>).map(({ key, label, name }) => {
          const value = state.flags[key];
          const isChanged = flagChanged.has(key);
          return (
            <div key={label} title={`${name}: ${value ? 'set' : 'clear'}${isChanged ? ' (changed)' : ''}`}
              aria-label={`${name} flag ${value ? 'set' : 'clear'}`}
              style={{
                padding: '2px 6px', borderRadius: 'var(--radius-sm)',
                fontSize: '0.6875rem', fontWeight: 700, fontFamily: 'var(--font-mono)',
                background: value ? 'var(--accent-green-dim)' : 'var(--bg-elevated)',
                color: value ? 'var(--accent-green)' : 'var(--text-dim)',
                border: `1px solid ${isChanged ? CHANGED_BORDER : value ? '#05966930' : 'var(--border-subtle)'}`,
                boxShadow: isChanged ? `0 0 0 1px ${CHANGED_BORDER}` : 'none',
                transition: 'all 0.15s', flex: 1, textAlign: 'center' as const,
              }}>
              {label}
            </div>
          );
        })}
      </div>

      {/* Last instruction */}
      {trace?.opcode && (
        <div style={{
          marginTop: 8, padding: '4px 6px',
          background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)',
          borderLeft: '2px solid var(--accent-purple)', fontSize: '0.6875rem',
        }}>
          <span style={{ color: 'var(--text-muted)' }}>Executed </span>
          <span style={{ color: 'var(--accent-purple)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
            {trace.opcode}
          </span>
          <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {' '}{operands(trace)}
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.6875rem', display: 'block', marginTop: 1, fontFamily: 'var(--font-mono)' }}>
            @{hex32(trace.address)} · cycle {trace.cycle}
          </span>
        </div>
      )}
    </section>
  );
}

function fmt(v: number | undefined): string {
  return v === undefined ? '—' : hex32(v);
}

/** Operand text for the traced instruction (single-register ops show one register). */
function operands(trace: CycleTrace): string {
  const one = new Set(['NOT', 'SHR', 'SHL', 'SHR8', 'SHL8', 'PUSH', 'POP', 'OUT', 'IN', 'JMPR']);
  const none = new Set(['HALT', 'RET', 'JMP', 'JC', 'JA', 'JE', 'JZ', 'JNZ', 'CALL']);
  const op = trace.opcode ?? '';
  if (none.has(op)) return '';
  if (one.has(op) || op === 'DATA' || op.startsWith('LOAD') || op.startsWith('STORE')) return trace.reg_a ?? '';
  return [trace.reg_a, trace.reg_b].filter(Boolean).join(', ');
}

const row: React.CSSProperties = {
  display: 'flex', alignItems: 'center', padding: '1px 6px',
  borderRadius: 'var(--radius-sm)', transition: 'all 0.15s', gap: 6,
  border: '1px solid transparent',
};

const sectionTitle: React.CSSProperties = {
  fontSize: '0.6875rem', fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 6px',
  display: 'flex', alignItems: 'center', gap: 6,
};

const subTitle: React.CSSProperties = {
  fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.8px', margin: '8px 0 3px',
};
