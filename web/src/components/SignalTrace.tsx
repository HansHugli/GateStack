import React from 'react';
import { CpuState } from '../wasm-bridge';

interface Props {
  history: CpuState[];
}

const TRACE_COLORS = ['#38bdf8', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#fb923c', '#e879f9', '#2dd4bf'];

// Dynamically show registers that have been used (non-zero) plus ACC
function getActiveSignals(history: CpuState[]): Array<{ label: string; data: number[]; colorIdx: number }> {
  const signals: Array<{ label: string; data: number[]; colorIdx: number }> = [];
  // Check which registers have ever been non-zero
  for (let i = 0; i < 16; i++) {
    const data = history.map(s => s.r[i]);
    if (data.some(v => v !== 0)) {
      signals.push({ label: `R${i}`, data, colorIdx: signals.length % TRACE_COLORS.length });
    }
    if (signals.length >= 7) break; // Max 7 register traces to keep readable
  }
  // Always include ACC if active
  const accData = history.map(s => s.acc);
  if (accData.some(v => v !== 0) && signals.length < 8) {
    signals.push({ label: 'ACC', data: accData, colorIdx: signals.length % TRACE_COLORS.length });
  }
  return signals;
}

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
          Step through to see clock & register traces…
        </div>
      </div>
    );
  }

  const maxEntries = 40;
  const visible = history.slice(-maxEntries);

  // Chart dimensions
  const W = 280;
  const clockH = 28;   // height for clock lane
  const gapH = 4;
  const regH = 130;     // height for register traces
  const H = clockH + gapH + regH + 16;
  const padL = 36;
  const padR = 8;
  const padT = 4;

  const plotW = W - padL - padR;
  const xStep = plotW / Math.max(1, visible.length - 1);

  // Register signals (dynamic — only show active registers)
  const signals = getActiveSignals(visible);

  const allVals = signals.flatMap(s => s.data);
  const maxVal = Math.max(1, ...allVals);

  const regTop = padT + clockH + gapH;
  const regPlotH = regH;

  return (
    <div style={{ padding: '10px 12px', flex: 1 }}>
      <div style={{
        fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)',
        textTransform: 'uppercase' as const, letterSpacing: '1px',
        marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <div style={{ width: 3, height: 12, borderRadius: 2, background: 'var(--accent-green)' }} />
        Signal Trace
        <span style={{
          fontSize: '0.55rem', color: 'var(--text-dim)', fontWeight: 400,
          fontFamily: 'var(--font-mono)',
        }}>
          {visible[visible.length - 1]?.cycle_count ?? 0} cycles
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
        {/* ── Clock lane ── */}
        <rect x={padL} y={padT} width={plotW} height={clockH}
          fill="var(--bg-elevated, #111628)" rx="3" />

        {/* CLK label */}
        <text x={padL - 4} y={padT + clockH / 2 + 4} textAnchor="end"
          fill="#f59e0b" fontSize="9" fontWeight="700" fontFamily="var(--font-mono)">
          CLK
        </text>

        {/* Clock square wave */}
        {(() => {
          const hi = padT + 4;
          const lo = padT + clockH - 4;
          let path = '';
          for (let i = 0; i < visible.length; i++) {
            const x = padL + i * xStep;
            const isHigh = i % 2 === 0; // alternate high/low each cycle
            const y = isHigh ? hi : lo;
            if (i === 0) {
              path = `M ${x} ${y}`;
            } else {
              const prevY = (i - 1) % 2 === 0 ? hi : lo;
              // Vertical transition, then horizontal
              path += ` L ${x} ${prevY} L ${x} ${y}`;
            }
          }
          // Extend to end
          const lastX = padL + (visible.length - 1) * xStep;
          path += ` L ${lastX + xStep * 0.5} ${(visible.length - 1) % 2 === 0 ? hi : lo}`;

          return (
            <path d={path} fill="none" stroke="#f59e0b" strokeWidth={1.8}
              opacity={0.9} strokeLinecap="round" />
          );
        })()}

        {/* Tick marks on clock rising edges */}
        {visible.map((s, i) => {
          if (i % 2 !== 0) return null;
          const x = padL + i * xStep;
          return (
            <line key={i} x1={x} y1={padT + clockH - 2} x2={x} y2={padT + clockH + 1}
              stroke="#f59e0b33" strokeWidth={0.5} />
          );
        })}

        {/* ── Register trace area ── */}
        <rect x={padL} y={regTop} width={plotW} height={regPlotH}
          fill="var(--bg-elevated, #111628)" rx="3" />

        {/* Grid lines + Y-axis labels */}
        {[0, 0.25, 0.5, 0.75, 1].map(pct => {
          const y = regTop + regPlotH * (1 - pct);
          return (
            <g key={pct}>
              <line x1={padL} y1={y} x2={W - padR} y2={y}
                stroke="var(--border-subtle)" strokeWidth={0.5}
                strokeDasharray={pct === 0 ? 'none' : '2 2'} />
              <text x={padL - 4} y={y + 4} textAnchor="end"
                fill="var(--text-muted)" fontSize="9" fontFamily="var(--font-mono)"
                fontWeight="600">
                {Math.round(maxVal * pct)}
              </text>
            </g>
          );
        })}

        {/* Signal lines */}
        {signals.map((sig) => {
          if (sig.data.every(v => v === 0)) return null;
          const color = TRACE_COLORS[sig.colorIdx];
          const points = sig.data.map((val, i) => {
            const x = padL + i * xStep;
            const y = regTop + regPlotH * (1 - val / maxVal);
            return `${x},${y}`;
          }).join(' ');

          const lastX = padL + (sig.data.length - 1) * xStep;
          const lastY = regTop + regPlotH * (1 - sig.data[sig.data.length - 1] / maxVal);

          return (
            <g key={sig.label}>
              <polyline points={points} fill="none" stroke={color}
                strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round"
                opacity={0.85} />
              <circle cx={lastX} cy={lastY} r={3} fill={color} opacity={0.9} />
              <text x={lastX + 5} y={lastY + 3.5}
                fill={color} fontSize="9" fontWeight="700"
                fontFamily="var(--font-mono)">
                {sig.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div style={{
        display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap', alignItems: 'center',
      }}>
        {/* Clock legend */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          fontSize: '0.7rem', fontFamily: 'var(--font-mono)',
        }}>
          <div style={{ width: 10, height: 3, borderRadius: 1, background: '#f59e0b' }} />
          <span style={{ color: '#f59e0b', fontWeight: 700 }}>CLK</span>
        </div>

        <div style={{ width: 1, height: 12, background: 'var(--border-subtle)' }} />

        {/* Register legends */}
        {signals.map((sig) => {
          const lastVal = sig.data[sig.data.length - 1] ?? 0;
          if (lastVal === 0 && sig.data.every(v => v === 0)) return null;
          const color = TRACE_COLORS[sig.colorIdx];
          return (
            <div key={sig.label} style={{
              display: 'flex', alignItems: 'center', gap: 3,
              fontSize: '0.68rem', fontFamily: 'var(--font-mono)',
            }}>
              <div style={{ width: 8, height: 3, borderRadius: 1, background: color }} />
              <span style={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.62rem' }}>{sig.label}</span>
              <span style={{ color, fontWeight: 700, fontSize: '0.62rem' }}>{lastVal}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
