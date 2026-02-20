import React from 'react';
import { CpuState } from '../wasm-bridge';

interface Props {
  history: CpuState[];
}

const TRACE_COLORS = ['#38bdf8', '#34d399', '#fbbf24', '#f87171', '#a78bfa'];
const TRACE_LABELS = ['R0', 'R1', 'R2', 'R3', 'ACC'];

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
          color: 'var(--text-dim)', fontSize: '0.75rem', fontStyle: 'italic',
          padding: '20px 0', textAlign: 'center',
        }}>
          Step through to see register traces…
        </div>
      </div>
    );
  }

  const maxEntries = 40;
  const visible = history.slice(-maxEntries);

  // Chart dimensions — larger viewBox for readable text
  const W = 280;
  const H = 160;
  const padL = 36;
  const padR = 8;
  const padT = 8;
  const padB = 8;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const signals = TRACE_LABELS.map((label, i) => ({
    label,
    data: visible.map(s => i < 4 ? s.r[i] : s.acc),
  }));

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

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
        {/* Background */}
        <rect x={padL} y={padT} width={plotW} height={plotH} fill="var(--bg-elevated, #111628)" rx="3" />

        {/* Grid lines + Y-axis labels */}
        {[0, 0.25, 0.5, 0.75, 1].map(pct => {
          const y = padT + plotH * (1 - pct);
          return (
            <g key={pct}>
              <line x1={padL} y1={y} x2={W - padR} y2={y}
                stroke="var(--border-subtle)" strokeWidth={0.5}
                strokeDasharray={pct === 0 ? 'none' : '2 2'} />
              <text x={padL - 4} y={y + 4} textAnchor="end"
                fill="var(--text-muted)" fontSize="10" fontFamily="var(--font-mono)"
                fontWeight="600">
                {Math.round(maxVal * pct)}
              </text>
            </g>
          );
        })}

        {/* Signal lines */}
        {signals.map((sig, si) => {
          if (sig.data.every(v => v === 0)) return null;
          const color = TRACE_COLORS[si];
          const points = sig.data.map((val, i) => {
            const x = padL + i * xStep;
            const y = padT + plotH * (1 - val / maxVal);
            return `${x},${y}`;
          }).join(' ');

          const lastX = padL + (sig.data.length - 1) * xStep;
          const lastY = padT + plotH * (1 - sig.data[sig.data.length - 1] / maxVal);

          return (
            <g key={sig.label}>
              <polyline points={points} fill="none" stroke={color}
                strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
                opacity={0.85} />
              {/* End dot */}
              <circle cx={lastX} cy={lastY} r={3.5} fill={color} opacity={0.9} />
              {/* Inline label at end of line */}
              <text x={lastX + 6} y={lastY + 4}
                fill={color} fontSize="10" fontWeight="700"
                fontFamily="var(--font-mono)">
                {sig.label}
              </text>
            </g>
          );
        })}

        {/* Cycle count at bottom right */}
        <text x={W - padR} y={H - 1} textAnchor="end"
          fill="var(--text-dim)" fontSize="9" fontFamily="var(--font-mono)">
          {visible.length} cycles
        </text>
      </svg>

      {/* Legend with current values */}
      <div style={{
        display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap',
      }}>
        {signals.map((sig, si) => {
          const lastVal = sig.data[sig.data.length - 1] ?? 0;
          if (lastVal === 0 && sig.data.every(v => v === 0)) return null;
          return (
            <div key={sig.label} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: '0.75rem', fontFamily: 'var(--font-mono)',
            }}>
              <div style={{
                width: 10, height: 3, borderRadius: 1,
                background: TRACE_COLORS[si],
              }} />
              <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{sig.label}</span>
              <span style={{ color: TRACE_COLORS[si], fontWeight: 700 }}>{lastVal}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
