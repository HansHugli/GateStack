import React, { useState } from 'react';
import { ComputerHook } from '../hooks/useComputer';

interface Props {
  computer: ComputerHook;
}

export default function Toolbar({ computer }: Props) {
  const [speed, setSpeed] = useState(100);

  const btnStyle = (color: string, active = true) => ({
    display: 'flex', alignItems: 'center', gap: '4px',
    padding: '6px 14px', borderRadius: '6px', border: 'none',
    background: active ? color : '#1e293b',
    color: active ? '#fff' : '#475569',
    fontSize: '0.78rem', fontWeight: 600 as const,
    cursor: active ? 'pointer' : 'not-allowed',
    opacity: active ? 1 : 0.5,
  });

  const handleSpeedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.target.value);
    setSpeed(v);
    computer.setSpeed(v);
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      padding: '8px 16px', borderBottom: '1px solid #1e293b',
    }}>
      <button style={btnStyle('#2563eb')} onClick={computer.step} disabled={computer.isRunning}>
        ⏭ Step
      </button>
      <button
        style={btnStyle(computer.isRunning ? '#dc2626' : '#16a34a')}
        onClick={computer.isRunning ? computer.pause : computer.run}
      >
        {computer.isRunning ? '⏸ Pause' : '▶ Run'}
      </button>
      <button style={btnStyle('#d97706')} onClick={computer.reset}>
        ↺ Reset
      </button>
      <button style={btnStyle('#6b21a8')} onClick={computer.hardReset}>
        ⟲ Clear All
      </button>

      <div style={{ width: '1px', height: '24px', background: '#334155', margin: '0 8px' }} />

      {/* Speed slider */}
      <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Speed:</span>
      <input
        type="range"
        min="1"
        max="10000"
        value={speed}
        onChange={handleSpeedChange}
        style={{ width: '100px', accentColor: '#38bdf8' }}
      />
      <span style={{ fontSize: '0.72rem', color: '#94a3b8', minWidth: '80px' }}>
        {speed >= 1000 ? `${(speed / 1000).toFixed(1)}K` : speed} cyc/frame
      </span>

      <div style={{ flex: 1 }} />

      {/* Keyboard shortcut hints */}
      <span style={{ fontSize: '0.65rem', color: '#334155' }}>
        S=Step · R=Run · P=Pause
      </span>
    </div>
  );
}
