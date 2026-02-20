import React, { useState } from 'react';
import { ComputerHook } from '../hooks/useComputer';

interface Props {
  computer: ComputerHook;
}

const SPEED_PRESETS = [
  { label: '1', value: 1 },
  { label: '100', value: 100 },
  { label: '10K', value: 10000 },
  { label: '100K', value: 100000 },
  { label: '1M', value: 1000000 },
];

export default function Toolbar({ computer }: Props) {
  const [speed, setSpeed] = useState(100);

  const handleSpeedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pct = parseInt(e.target.value);
    const v = Math.round(Math.pow(10, pct / 16.67));  // 0-100 maps to 10^0 .. 10^6
    setSpeed(v);
    computer.setSpeed(v);
  };

  const setPreset = (v: number) => {
    setSpeed(v);
    computer.setSpeed(v);
  };

  const sliderPos = Math.round(16.67 * Math.log10(Math.max(1, speed)));
  const formatSpeed = (v: number) => {
    if (v >= 1000000) return `${(v / 1000000).toFixed(v >= 10000000 ? 0 : 1)}M`;
    if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}K`;
    return v.toString();
  };

  const btnStyle = (color: string, active: boolean, hover: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 4,
    padding: '4px 10px', borderRadius: 'var(--radius-md)',
    border: `1px solid ${active ? (hover ? color : color + '60') : 'var(--border-subtle)'}`,
    background: active ? (hover ? color + '30' : color + '12') : 'var(--bg-elevated)',
    color: active ? (hover ? '#fff' : color) : 'var(--text-dim)',
    fontSize: '0.72rem', fontWeight: 600,
    cursor: active ? 'pointer' : 'not-allowed',
    opacity: active ? 1 : 0.35,
    transition: 'all 0.12s ease',
    fontFamily: 'var(--font-ui)',
  });

  const waiting = !!computer.waitingForInput;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '5px 14px', borderBottom: '1px solid var(--border-subtle)',
    }}>
      <ToolBtn icon="⏭" label="Step" color="#3b82f6" onClick={computer.step} disabled={computer.isRunning || waiting} />
      <ToolBtn icon="⏮" label="Back" color="#8b5cf6" onClick={computer.stepBack} disabled={computer.isRunning || !computer.canStepBack || waiting} />
      <ToolBtn
        icon={computer.isRunning ? '⏸' : '▶'}
        label={computer.isRunning ? 'Pause' : 'Run'}
        color={computer.isRunning ? '#ef4444' : '#22c55e'}
        onClick={computer.isRunning ? computer.pause : computer.run}
        disabled={waiting && !computer.isRunning}
      />
      <ToolBtn icon="↺" label="Reset" color="#eab308" onClick={computer.reset} />
      <ToolBtn icon="⟲" label="Clear" color="#8b5cf6" onClick={computer.hardReset} />

      <div style={{ width: 1, height: 20, background: 'var(--border-subtle)', margin: '0 4px' }} />

      {/* Clock indicator */}
      <ClockIndicator cycle={computer.state?.cycle_count ?? 0} isRunning={computer.isRunning} halted={computer.state?.halted ?? false} />

      {/* Speed */}
      <span style={{ fontSize: '0.62rem', color: 'var(--text-dim)', fontWeight: 600, letterSpacing: '0.8px', textTransform: 'uppercase' as const }}>
        Speed
      </span>

      {SPEED_PRESETS.map(p => (
        <button key={p.value} onClick={() => setPreset(p.value)} style={{
          padding: '1px 5px', fontSize: '0.58rem', fontFamily: 'var(--font-mono)',
          fontWeight: speed === p.value ? 700 : 400,
          borderRadius: 3, border: `1px solid ${speed === p.value ? 'var(--accent-blue)' : 'var(--border-subtle)'}`,
          background: speed === p.value ? 'var(--accent-blue-dim)' : 'transparent',
          color: speed === p.value ? 'var(--accent-blue)' : 'var(--text-dim)',
          cursor: 'pointer', transition: 'all 0.1s',
        }}>
          {p.label}
        </button>
      ))}

      <input type="range" min="0" max="100" value={sliderPos} onChange={handleSpeedChange}
        style={{ width: 70, accentColor: 'var(--accent-blue)', height: 12 }} />
      <span style={{
        fontSize: '0.65rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)',
        fontWeight: 600, minWidth: 48,
      }}>
        {formatSpeed(speed)}/f
      </span>

      <div style={{ flex: 1 }} />

      {computer.state?.halted && (
        <span style={{
          fontSize: '0.62rem', color: 'var(--accent-red)', fontWeight: 600,
          padding: '1px 6px', background: 'var(--accent-red-dim)', borderRadius: 3,
          border: '1px solid #7f1d1d40',
        }}>HALTED</span>
      )}

      {computer.breakpoints.size > 0 && (
        <span
          onClick={() => computer.clearBreakpoints()}
          style={{
            fontSize: '0.62rem', color: '#f87171', fontWeight: 600,
            padding: '1px 6px', background: 'rgba(239,68,68,0.1)', borderRadius: 3,
            border: '1px solid rgba(239,68,68,0.2)',
            cursor: 'pointer', userSelect: 'none' as const,
          }}
          title="Click to clear all breakpoints"
        >
          🔴 {computer.breakpoints.size} BP
        </span>
      )}

      <span style={{ fontSize: '0.55rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
        S·Step  B·Back  R·Run  P·Pause  Ctrl+Enter·Assemble
      </span>
    </div>
  );
}

function ToolBtn({ icon, label, color, onClick, disabled }: {
  icon: string; label: string; color: string;
  onClick: () => void; disabled?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const active = !disabled;
  return (
    <button
      onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 3,
        padding: '4px 10px', borderRadius: 'var(--radius-md)',
        border: `1px solid ${active ? (hover ? color : color + '50') : 'var(--border-subtle)'}`,
        background: hover && active ? color + '25' : active ? color + '10' : 'var(--bg-elevated)',
        color: hover && active ? '#fff' : active ? color : 'var(--text-dim)',
        fontSize: '0.72rem', fontWeight: 600, cursor: active ? 'pointer' : 'not-allowed',
        opacity: active ? 1 : 0.35, transition: 'all 0.12s',
      }}
    >
      {icon} {label}
    </button>
  );
}

const CLOCK_STYLES = `
  @keyframes clockPulse {
    0%, 49% { background: #f59e0b; box-shadow: 0 0 6px #f59e0b80; }
    50%, 100% { background: #78350f; box-shadow: none; }
  }
  @keyframes clockSpin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

function ClockIndicator({ cycle, isRunning, halted }: {
  cycle: number; isRunning: boolean; halted: boolean;
}) {
  const isOdd = cycle % 2 === 1;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '2px 8px', borderRadius: 'var(--radius-sm)',
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border-subtle)',
    }}>
      <style>{CLOCK_STYLES}</style>
      {/* Pulse dot */}
      <div style={{
        width: 7, height: 7, borderRadius: '50%',
        background: halted ? '#78350f' : isOdd ? '#f59e0b' : '#78350f',
        boxShadow: !halted && isOdd ? '0 0 6px #f59e0b80' : 'none',
        animation: isRunning && !halted ? 'clockPulse 0.3s ease-in-out infinite' : 'none',
        transition: isRunning ? 'none' : 'all 0.15s',
      }} />
      {/* Cycle count */}
      <span style={{
        fontSize: '0.6rem', fontFamily: 'var(--font-mono)',
        color: '#f59e0b', fontWeight: 700, minWidth: 30,
      }}>
        {cycle >= 1000 ? `${(cycle / 1000).toFixed(1)}K` : cycle}
      </span>
      <span style={{
        fontSize: '0.48rem', color: 'var(--text-dim)',
        fontWeight: 600, letterSpacing: '0.5px',
        textTransform: 'uppercase' as const,
      }}>
        CLK
      </span>
    </div>
  );
}
