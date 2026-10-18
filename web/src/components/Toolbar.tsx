import React, { useState } from 'react';
import { ComputerHook } from '../hooks/useComputer';

interface Props {
  computer: ComputerHook;
  onStep: () => void;
  onRun: () => void;
  onReset: () => void;
  onWipe: () => void;
}

const SPEED_PRESETS = [
  { label: '1', value: 1 },
  { label: '100', value: 100 },
  { label: '10K', value: 10000 },
  { label: '100K', value: 100000 },
  { label: '1M', value: 1000000 },
  { label: '10M', value: 10000000 },
  { label: 'MAX', value: 100000000 },
];

export default function Toolbar({ computer, onStep, onRun, onReset, onWipe }: Props) {
  const [speed, setSpeed] = useState(100);

  const handleSpeedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pct = parseInt(e.target.value);
    const v = Math.round(Math.pow(10, pct / 12.5));  // 0-100 maps to 10^0 .. 10^8
    setSpeed(v);
    computer.setSpeed(v);
  };

  const setPreset = (v: number) => {
    setSpeed(v);
    computer.setSpeed(v);
  };

  const sliderPos = Math.round(12.5 * Math.log10(Math.max(1, speed)));
  const formatSpeed = (v: number) => {
    if (v >= 100000000) return 'MAX';
    if (v >= 1000000) return `${(v / 1000000).toFixed(v >= 10000000 ? 0 : 1)}M`;
    if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}K`;
    return v.toString();
  };

  const waiting = !!computer.waitingForInput;
  const halted = !!computer.state?.halted;
  const isWasm = computer.engineType === 'wasm';
  const engineTitle = isWasm
    ? 'Running on the Rust/WebAssembly engine. Click to switch to the JavaScript engine.'
    : computer.wasmAvailable
      ? 'Running on the JavaScript engine. Click to switch to the Rust/WebAssembly engine.'
      : `Running on the JavaScript engine: WebAssembly is unavailable because ${computer.engineNote ?? 'it did not load'}.`;

  return (
    <div role="toolbar" aria-label="Simulation controls" style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '5px 14px', borderBottom: '1px solid var(--border-subtle)',
      flexWrap: 'nowrap', overflow: 'hidden', whiteSpace: 'nowrap',
    }}>
      <ToolBtn icon="⏭" label="Step" color="#3b82f6" onClick={onStep}
        disabled={computer.isRunning || waiting || halted}
        title={halted ? 'The CPU has halted. Reset CPU to start again.' : 'Execute one instruction (S)'} />
      <ToolBtn icon="⏮" label="Back" color="#8b5cf6" onClick={computer.stepBack}
        disabled={computer.isRunning || !computer.canStepBack}
        title="Undo the last Step, or go back to where the last Run started (B)" />
      <ToolBtn
        icon={computer.isRunning ? '⏸' : '▶'}
        label={computer.isRunning ? 'Pause' : 'Run'}
        color={computer.isRunning ? '#ef4444' : '#22c55e'}
        onClick={computer.isRunning ? computer.pause : onRun}
        disabled={!computer.isRunning && (waiting || halted)}
        title={computer.isRunning ? 'Pause (P or Esc)' : 'Run continuously (R)'}
      />
      <ToolBtn icon="↺" label="Reset CPU" color="#eab308" onClick={onReset}
        title="Reset registers, flags, PC and SP. RAM and the loaded program stay. (F8 in the desktop app)" />
      <ToolBtn icon="⟲" label="Wipe RAM" color="#f87171" onClick={onWipe}
        title="Clear all 4 MB of RAM, including the program, and reset the CPU. Assemble again to reload the program." />

      <div style={{ width: 1, height: 20, background: 'var(--border-subtle)', margin: '0 4px' }} />

      <ClockIndicator
        cycle={computer.state?.cycle_count ?? 0}
        isRunning={computer.isRunning}
        halted={halted}
        cyclesPerSec={computer.cyclesPerSec}
      />

      <span id="speed-label" style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.8px', textTransform: 'uppercase' as const }}>
        Speed
      </span>

      {SPEED_PRESETS.map(p => (
        <button key={p.value} onClick={() => setPreset(p.value)}
          aria-label={`Speed ${p.label} instructions per frame`}
          aria-pressed={speed === p.value}
          style={{
            padding: '1px 5px', fontSize: '0.6875rem', fontFamily: 'var(--font-mono)',
            fontWeight: speed === p.value ? 700 : 400,
            borderRadius: 3, border: `1px solid ${speed === p.value ? 'var(--accent-blue)' : 'var(--border-default)'}`,
            background: speed === p.value ? 'var(--accent-blue-dim)' : 'transparent',
            color: speed === p.value ? 'var(--accent-blue)' : 'var(--text-muted)',
            cursor: 'pointer', transition: 'all 0.1s',
          }}>
          {p.label}
        </button>
      ))}

      <input type="range" min="0" max="100" value={sliderPos} onChange={handleSpeedChange}
        aria-labelledby="speed-label"
        aria-valuetext={`${formatSpeed(speed)} instructions per frame`}
        style={{ width: 70, accentColor: 'var(--accent-blue)', height: 12 }} />
      <span style={{
        fontSize: '0.6875rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)',
        fontWeight: 600, minWidth: 48,
      }} title="Instructions per animation frame">
        {formatSpeed(speed)}/f
      </span>

      {/* Engine: which one runs, and why if WASM is unavailable */}
      <button
        onClick={() => computer.wasmAvailable ? computer.switchEngine(isWasm ? 'js' : 'wasm') : undefined}
        title={engineTitle}
        aria-label={engineTitle}
        aria-disabled={!computer.wasmAvailable}
        style={{
          padding: '1px 6px', fontSize: '0.6875rem', fontFamily: 'var(--font-mono)',
          fontWeight: 600, borderRadius: 3, cursor: computer.wasmAvailable ? 'pointer' : 'help', transition: 'all 0.15s',
          marginLeft: 4,
          border: `1px solid ${isWasm ? '#22d3ee40' : computer.engineNote ? 'var(--accent-amber-dim)' : 'var(--border-default)'}`,
          background: isWasm ? 'rgba(34,211,238,0.1)' : 'transparent',
          color: isWasm ? '#22d3ee' : computer.engineNote ? 'var(--accent-amber)' : 'var(--text-muted)',
        }}
      >
        {isWasm ? '⚡ WASM engine' : computer.engineNote ? '📜 JS · no WASM' : '📜 JS engine'}
      </button>

      <div style={{ flex: 1 }} />

      {halted && (
        <span style={{
          fontSize: '0.6875rem', color: 'var(--accent-red)', fontWeight: 600,
          padding: '1px 6px', background: 'var(--accent-red-dim)', borderRadius: 3,
          border: '1px solid #7f1d1d40',
        }}>{computer.fault ? 'FAULT' : 'HALTED'}</span>
      )}

      {computer.breakpoints.size > 0 && (
        <button
          onClick={() => computer.clearBreakpoints()}
          style={{
            fontSize: '0.6875rem', color: '#f87171', fontWeight: 600,
            padding: '1px 6px', background: 'rgba(239,68,68,0.1)', borderRadius: 3,
            border: '1px solid rgba(239,68,68,0.2)',
            cursor: 'pointer', userSelect: 'none' as const,
          }}
          title="Clear all breakpoints"
          aria-label={`${computer.breakpoints.size} breakpoints. Click to clear all.`}
        >
          🔴 {computer.breakpoints.size} BP ✕
        </button>
      )}

      <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', minWidth: 0, flexShrink: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        S·Step B·Back R·Run P·Pause ?·Help
      </span>
    </div>
  );
}

function ToolBtn({ icon, label, color, onClick, disabled, title }: {
  icon: string; label: string; color: string;
  onClick: () => void; disabled?: boolean; title?: string;
}) {
  const [hover, setHover] = useState(false);
  const active = !disabled;
  return (
    <button
      onClick={onClick} disabled={disabled} title={title}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 3,
        padding: '4px 10px', borderRadius: 'var(--radius-md)',
        border: `1px solid ${active ? (hover ? color : color + '50') : 'var(--border-subtle)'}`,
        background: hover && active ? color + '25' : active ? color + '10' : 'var(--bg-elevated)',
        color: hover && active ? '#fff' : active ? color : 'var(--text-dim)',
        fontSize: '0.72rem', fontWeight: 600, cursor: active ? 'pointer' : 'not-allowed',
        opacity: active ? 1 : 0.45, transition: 'all 0.12s',
        whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden="true">{icon}</span> {label}
    </button>
  );
}

const CLOCK_STYLES = `
  @keyframes clockPulse {
    0%, 49% { background: #f59e0b; box-shadow: 0 0 6px #f59e0b80; }
    50%, 100% { background: #78350f; box-shadow: none; }
  }
`;

function ClockIndicator({ cycle, isRunning, halted, cyclesPerSec }: {
  cycle: number; isRunning: boolean; halted: boolean; cyclesPerSec: number;
}) {
  const isOdd = cycle % 2 === 1;
  const formatCps = (v: number) => {
    if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
    if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
    return v.toFixed(0);
  };
  return (
    <div title={`${cycle} instructions executed`} style={{
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '2px 8px', borderRadius: 'var(--radius-sm)',
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border-subtle)',
    }}>
      <style>{CLOCK_STYLES}</style>
      <div aria-hidden="true" style={{
        width: 7, height: 7, borderRadius: '50%',
        background: halted ? '#78350f' : isOdd ? '#f59e0b' : '#78350f',
        boxShadow: !halted && isOdd ? '0 0 6px #f59e0b80' : 'none',
        animation: isRunning && !halted ? 'clockPulse 0.3s ease-in-out infinite' : 'none',
        transition: isRunning ? 'none' : 'all 0.15s',
      }} />
      <span style={{
        fontSize: '0.6875rem', fontFamily: 'var(--font-mono)',
        color: '#f59e0b', fontWeight: 700, minWidth: 50,
      }}>
        {cycle >= 1e9 ? `${(cycle / 1e9).toFixed(1)}B`
         : cycle >= 1e6 ? `${(cycle / 1e6).toFixed(1)}M`
         : cycle >= 1e3 ? `${(cycle / 1e3).toFixed(1)}K`
         : cycle}
      </span>
      <span style={{
        fontSize: '0.6875rem', color: 'var(--text-muted)',
        fontWeight: 600, letterSpacing: '0.5px',
        textTransform: 'uppercase' as const,
      }}>
        CLK
      </span>
      {isRunning && cyclesPerSec > 0 && (
        <span style={{
          fontSize: '0.6875rem', fontFamily: 'var(--font-mono)',
          color: '#94a3b8', fontWeight: 600, marginLeft: 2,
        }}>
          {formatCps(cyclesPerSec)}/s
        </span>
      )}
    </div>
  );
}
