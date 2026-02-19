import React from 'react';
import { CpuState } from '../wasm-bridge';

interface Props {
  history: CpuState[];
}

const TRACE_COLORS = ['#38bdf8', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#22d3ee', '#fb923c', '#e879f9'];

export default function SignalTrace({ history }: Props) {
  if (history.length < 2) {
    return (
      <div style={{ padding: '10px 12px', flex: 1 }}>
        <div style={{
          fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)',
          textTransform: 'uppercase' as const, letterSpacing: '1px',
          marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <div style={{ width: 3, height: 12, borderRadius: 2, background: 'var(--accent-green)' }} />
          Signal Trace
        </div>
        <div style={{
          color: 'var(--text-dim)', fontSize: '0.65rem', fontStyle: 'italic',
          padding: '16px 0', textAlign: 'center',
        }}>
          Step through to see register traces…
        </div>
      </div>
    );
  }

  // Show last N entries that fit
  const maxEntries = 40;
  const visible = history.slice(-maxEntries);
  const W = 240;
  const H = 100;
  const padL = 28;
  const padR = 4;
  const padT = 4;
  const padB = 4;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  // Signals: R0-R3 + ACC
  const signals = [
    { label: 'R0', data: visible.map(s => s.r[0]) },
    { label: 'R1', data: visible.map(s => s.r[1]) },
    { label: 'R2', data: visible.map(s => s.r[2]) },
    { label: 'R3', data: visible.map(s => s.r[3]) },
    { label: 'ACC', data: visible.map(s => s.acc) },
  ];

  // Find global max for scaling
  const allVals = signals.flatMap(s => s.data);
  const maxVal = Math.max(1, ...allVals);

  const xStep = plotW / Math.max(1, visible.length - 1);

  return (
    <div style={{ padding: '10px 12px', flex: 1 }}>
      <div style={{
        fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)',
        textTransform: 'uppercase' as const, letterSpacing: '1px',
        marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <div style={{ width: 3, height: 12, borderRadius: 2, background: 'var(--accent-green)' }} />
        Signal Trace
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxHeight: H, display: 'block' }}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(pct => {
          const y = padT + plotH * (1 - pct);
          return (
            <g key={pct}>
              <line x1={padL} y1={y} x2={W - padR} y2={y}
                stroke="var(--border-subtle)" strokeWidth={0.5}
                strokeDasharray={pct === 0 ? "none" : "2 2"} />
              <text x={padL - 3} y={y + 3} textAnchor="end"
                fill="var(--text-dim)" fontSize="6" fontFamily="var(--font-mono)">
                {Math.round(maxVal * pct)}
              </text>
            </g>
          );
        })}

        {/* Signal lines */}
        {signals.map((sig, si) => {
          if (sig.data.every(v => v === 0)) return null;
          const color = TRACE_COLORS[si % TRACE_COLORS.length];
          const points = sig.data.map((val, i) => {
            const x = padL + i * xStep;
            const y = padT + plotH * (1 - val / maxVal);
            return `${x},${y}`;
          }).join(' ');

          return (
            <g key={sig.label}>
              <polyline points={points} fill="none" stroke={color}
                strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round"
                opacity={0.8} />
              {/* End dot */}
              {sig.data.length > 0 && (
                <circle
                  cx={padL + (sig.data.length - 1) * xStep}
                  cy={padT + plotH * (1 - sig.data[sig.data.length - 1] / maxVal)}
                  r={2.5} fill={color} opacity={0.9} />
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
        {signals.map((sig, si) => {
          const lastVal = sig.data[sig.data.length - 1] ?? 0;
          if (lastVal === 0 && sig.data.every(v => v === 0)) return null;
          return (
            <div key={sig.label} style={{
              display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.58rem',
              fontFamily: 'var(--font-mono)',
            }}>
              <div style={{
                width: 8, height: 2, borderRadius: 1,
                background: TRACE_COLORS[si % TRACE_COLORS.length],
              }} />
              <span style={{ color: 'var(--text-muted)' }}>{sig.label}</span>
              <span style={{ color: TRACE_COLORS[si % TRACE_COLORS.length], fontWeight: 600 }}>{lastVal}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
