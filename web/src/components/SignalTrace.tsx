import React from 'react';
import { CpuState } from '../wasm-bridge';

interface Props {
  history: CpuState[];
}

const TRACE_COLORS = ['#38bdf8', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#fb923c', '#e879f9', '#2dd4bf'];
const MAX_SIGNALS = 7;

export interface Signal { label: string; data: number[]; colorIdx: number; min: number; max: number }

/**
 * Registers that change in the visible window (up to 7). Each one is scaled
 * to its own min..max, like a lane on a logic analyser, so one register with
 * large values (an address, say) doesn't flatten all the others.
 */
export function activeSignals(history: CpuState[]): Signal[] {
  const signals: Signal[] = [];
  for (let i = 0; i < 16 && signals.length < MAX_SIGNALS; i++) {
    const data = history.map(s => s.r[i] >>> 0);
    let min = Infinity, max = -Infinity;
    for (const v of data) { if (v < min) min = v; if (v > max) max = v; }
    // A register that stays constant in the window carries no signal.
    if (min !== max) {
      signals.push({ label: `R${i}`, data, colorIdx: signals.length % TRACE_COLORS.length, min, max });
    }
  }
  return signals;
}

const title = (
  <h2 style={{
    fontSize: '0.6875rem', fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase' as const, letterSpacing: '1px',
    margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 6,
  }}>
    <div style={{ width: 3, height: 12, borderRadius: 2, background: 'var(--accent-green)' }} />
    Signal Trace
  </h2>
);

export default function SignalTrace({ history }: Props) {
  if (history.length < 2) {
    return (
      <section aria-label="Signal trace" style={{ padding: '10px 12px', flex: 1 }}>
        {title}
        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontStyle: 'italic', padding: '20px 0', textAlign: 'center' }}>
          Step through to see clock & register traces…
        </div>
      </section>
    );
  }

  const visible = history.slice(-40);
  const signals = activeSignals(visible);

  const W = 280;
  const padL = 34;
  const padR = 8;
  const padT = 4;
  const clockH = 24;
  const laneH = 24;
  const laneGap = 3;
  const lanesTop = padT + clockH + 6;
  const H = lanesTop + Math.max(1, signals.length) * (laneH + laneGap) + 2;
  const plotW = W - padL - padR;
  const xStep = plotW / Math.max(1, visible.length - 1);

  return (
    <section aria-label="Signal trace" style={{ padding: '10px 12px', flex: 1 }}>
      {title}
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }} role="img"
        aria-label={`Clock and ${signals.map(s => s.label).join(', ') || 'no'} register traces over the last ${visible.length} states`}>
        {/* Clock lane */}
        <rect x={padL} y={padT} width={plotW} height={clockH} fill="var(--bg-elevated, #111628)" rx="3" />
        <text x={padL - 4} y={padT + clockH / 2 + 4} textAnchor="end" fill="#f59e0b" fontSize="12" fontWeight="700" fontFamily="var(--font-mono)">CLK</text>
        {(() => {
          const hi = padT + 4;
          const lo = padT + clockH - 4;
          let path = '';
          for (let i = 0; i < visible.length; i++) {
            const x = padL + i * xStep;
            const y = i % 2 === 0 ? hi : lo;
            if (i === 0) path = `M ${x} ${y}`;
            else path += ` L ${x} ${(i - 1) % 2 === 0 ? hi : lo} L ${x} ${y}`;
          }
          return <path d={path} fill="none" stroke="#f59e0b" strokeWidth={1.8} opacity={0.9} strokeLinecap="round" />;
        })()}

        {/* One lane per register, each scaled to its own range */}
        {signals.map((sig, lane) => {
          const top = lanesTop + lane * (laneH + laneGap);
          const color = TRACE_COLORS[sig.colorIdx];
          const range = sig.max - sig.min;
          const yOf = (v: number) => range === 0 ? top + laneH / 2 : top + 3 + (laneH - 6) * (1 - (v - sig.min) / range);
          const points = sig.data.map((v, i) => `${padL + i * xStep},${yOf(v)}`).join(' ');
          return (
            <g key={sig.label}>
              <rect x={padL} y={top} width={plotW} height={laneH} fill="var(--bg-elevated, #111628)" rx="3" />
              <text x={padL - 4} y={top + laneH / 2 + 4} textAnchor="end" fill={color} fontSize="12" fontWeight="700" fontFamily="var(--font-mono)">{sig.label}</text>
              <polyline points={points} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" opacity={0.9} />
            </g>
          );
        })}
        {signals.length === 0 && (
          <text x={padL + plotW / 2} y={lanesTop + 16} textAnchor="middle" fill="#9aa8bc" fontSize="12" fontFamily="var(--font-mono)">no register changes yet</text>
        )}
      </svg>

      {/* Legend: current value and range of each lane */}
      <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        {signals.map(sig => {
          const color = TRACE_COLORS[sig.colorIdx];
          const lastVal = sig.data[sig.data.length - 1] ?? 0;
          return (
            <div key={sig.label} title={`${sig.label}: now ${lastVal}, range ${sig.min}..${sig.max} in this window`}
              style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.6875rem', fontFamily: 'var(--font-mono)' }}>
              <div style={{ width: 8, height: 3, borderRadius: 1, background: color }} />
              <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{sig.label}</span>
              <span style={{ color, fontWeight: 700 }}>{lastVal}</span>
            </div>
          );
        })}
        <span style={{ color: 'var(--text-muted)', fontSize: '0.6875rem' }}>
          · each lane scaled to its own range · {visible[visible.length - 1]?.cycle_count ?? 0} cycles
        </span>
      </div>
    </section>
  );
}
