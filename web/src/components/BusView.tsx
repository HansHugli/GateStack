import React, { useMemo, useState, useCallback } from 'react';
import { CpuState, CycleTrace } from '../wasm-bridge';

interface Props {
  state: CpuState | null;
  trace: CycleTrace | null;
}

const hex = (n: number) => '0x' + (n >>> 0).toString(16).padStart(8, '0').toUpperCase();

const ANIM_STYLES = `
  @keyframes pulse { 0%,100% { opacity: 0.6; } 50% { opacity: 1; } }
  @keyframes flowDown { 0% { stroke-dashoffset: 16; } 100% { stroke-dashoffset: 0; } }
  @keyframes flowUp { 0% { stroke-dashoffset: -16; } 100% { stroke-dashoffset: 0; } }
  @keyframes fadeGlow { 0% { filter: drop-shadow(0 0 3px currentColor); } 100% { filter: drop-shadow(0 0 0px transparent); } }
`;

// Full descriptions for each component
const TOOLTIPS: Record<string, { full: string; desc: string }> = {
  'IAR': { full: 'Instruction Address Register', desc: 'Holds the address of the next instruction (Program Counter)' },
  'IR':  { full: 'Instruction Register', desc: 'Holds the instruction currently being decoded and executed' },
  'REGS': { full: 'Register File (R0–R15)', desc: '16 general-purpose 32-bit registers' },
  'MAR': { full: 'Memory Address Register', desc: 'Selects which RAM address to read or write (22-bit)' },
  'ALU': { full: 'Arithmetic Logic Unit', desc: 'Performs ADD, AND, OR, XOR, NOT, SHL, SHR, CMP operations' },
  'ACC': { full: 'Accumulator', desc: 'Stores the result of the last ALU operation' },
  'TMP': { full: 'Temporary Register', desc: 'Internal register holding the second ALU operand' },
  'RAM': { full: 'Random Access Memory', desc: '4MB of storage for programs, data, and video' },
  'SP':  { full: 'Stack Pointer', desc: 'Points to top of stack, starts at 0x3BFFFF, grows downward' },
};

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  id: string;
}

export default function BusView({ state, trace }: Props) {
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, y: 0, id: '' });

  const handleMouseEnter = useCallback((e: React.MouseEvent, id: string) => {
    const rect = (e.currentTarget as SVGElement).closest('svg')?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setTooltip({ visible: true, x, y, id });
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = (e.currentTarget as SVGElement).closest('svg')?.getBoundingClientRect();
    if (!rect) return;
    setTooltip(prev => ({ ...prev, x: e.clientX - rect.left, y: e.clientY - rect.top }));
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTooltip(prev => ({ ...prev, visible: false }));
  }, []);

  if (!state) return null;

  const activeTransfers = useMemo(() => {
    return trace?.steps?.filter(s => 'BusTransfer' in s)?.map(s => (s as any).BusTransfer!) ?? [];
  }, [trace]);

  // Derive display values from bus activity
  const regsValue = useMemo(() => {
    // Show the value from the last transfer involving REGS
    const t = [...activeTransfers].reverse().find(t => t.dest === 'REGS' || t.source === 'REGS');
    return t?.value ?? 0;
  }, [activeTransfers]);

  const marValue = useMemo(() => {
    const t = [...activeTransfers].reverse().find(t => t.dest === 'MAR');
    return t?.value ?? state.iar;
  }, [activeTransfers, state.iar]);

  const ramValue = useMemo(() => {
    const t = [...activeTransfers].reverse().find(t => t.dest === 'RAM' || t.source === 'RAM');
    return t?.value ?? 0;
  }, [activeTransfers]);

  const components = [
    { id: 'IAR', x: 10, y: 15, color: '#f59e0b', value: state.iar },
    { id: 'IR',  x: 140, y: 15, color: '#f59e0b', value: state.ir },
    { id: 'REGS', x: 270, y: 15, color: '#3b82f6', value: regsValue },
    { id: 'SP',  x: 400, y: 15, color: '#22c55e', value: state.sp },
    { id: 'MAR', x: 530, y: 15, color: '#ef4444', value: marValue },
    { id: 'ALU', x: 50,  y: 175, color: '#a855f7', value: state.acc },
    { id: 'ACC', x: 195, y: 175, color: '#14b8a6', value: state.acc },
    { id: 'TMP', x: 340, y: 175, color: '#64748b', value: state.tmp },
    { id: 'RAM', x: 490, y: 175, color: '#ef4444', value: ramValue },
  ];

  const isSource = (id: string) => activeTransfers.some(t => {
    const src = typeof t.source === 'string' ? t.source : ('Reg' in t.source ? t.source.Reg : '');
    return src === id;
  });
  const isDest = (id: string) => activeTransfers.some(t => t.dest === id);

  // Convert SVG viewBox coords to percentage for tooltip positioning
  const tipInfo = TOOLTIPS[tooltip.id];

  return (
    <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-subtle, #1e293b)', minHeight: '190px', position: 'relative' }}>
      <style>{ANIM_STYLES}</style>
      <div style={{
        fontSize: '0.68rem', fontWeight: 700, marginBottom: '6px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{
          color: 'var(--text-muted, #4a5568)', textTransform: 'uppercase' as const,
          letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <div style={{ width: 3, height: 12, borderRadius: 2, background: '#f59e0b' }} />
          Data Bus
        </div>
        {trace?.opcode && (
          <span style={{ fontWeight: 400, fontSize: '0.72rem' }}>
            <span style={{ color: '#a78bfa', fontWeight: 600 }}>{trace.opcode}</span>
            <span style={{ color: '#64748b' }}> {trace.reg_a},{trace.reg_b}</span>
            <span style={{ color: '#475569' }}> @ 0x{trace.address.toString(16).padStart(6, '0').toUpperCase()}</span>
          </span>
        )}
      </div>

      <div style={{ position: 'relative' }}>
        <svg viewBox="0 0 640 240" style={{ width: '100%', maxHeight: '240px' }}>
          {/* Main bus line */}
          <rect x="8" y="106" width="624" height="8" rx="4"
            fill="#1e293b" stroke="#334155" strokeWidth="0.5" />
          {activeTransfers.length > 0 && (
            <rect x="8" y="106" width="624" height="8" rx="4"
              fill="#ef4444" opacity="0.15"
              style={{ animation: 'pulse 0.8s ease-in-out infinite' }} />
          )}
          <text x="320" y="103" textAnchor="middle" fill="#8b95a8" fontSize="8">
            BUS
          </text>

          {/* Components */}
          {components.map(comp => {
            const src = isSource(comp.id);
            const dst = isDest(comp.id);
            const active = src || dst;
            const isTop = comp.y < 100;
            const cx = comp.x + 45;
            const busY = 110;

            return (
              <g key={comp.id}>
                {/* Connection line */}
                <line
                  x1={cx} y1={isTop ? comp.y + 40 : comp.y - 2}
                  x2={cx} y2={busY}
                  stroke={active ? comp.color : '#1e293b'}
                  strokeWidth={active ? 2.5 : 1.5}
                  strokeDasharray={active ? '4 4' : 'none'}
                  opacity={active ? 1 : 0.3}
                  style={active ? {
                    animation: `${src && isTop ? 'flowDown' : 'flowUp'} 0.4s linear infinite`,
                  } : undefined}
                />

                {src && (
                  <circle cx={cx} cy={busY} r="4" fill={comp.color}
                    style={{ animation: 'pulse 0.6s ease-in-out infinite' }} />
                )}
                {dst && (
                  <circle cx={cx} cy={isTop ? comp.y + 40 : comp.y - 2} r="4" fill={comp.color}
                    style={{ animation: 'pulse 0.6s ease-in-out infinite' }} />
                )}

                {/* Visible component box */}
                <rect
                  x={comp.x} y={comp.y} width="90" height="38" rx="6"
                  fill={active ? comp.color + '25' : '#111827'}
                  stroke={active ? comp.color : '#1e293b'}
                  strokeWidth={active ? 2 : 1}
                  style={active ? { animation: 'fadeGlow 0.8s ease-in-out' } : undefined}
                />

                {/* Invisible expanded hit area for tooltip — 6px padding around box */}
                <rect
                  x={comp.x - 6} y={comp.y - 6} width={102} height={50} rx="8"
                  fill="transparent"
                  style={{ cursor: 'help' }}
                  onMouseEnter={(e) => handleMouseEnter(e, comp.id)}
                  onMouseMove={handleMouseMove}
                  onMouseLeave={handleMouseLeave}
                />

                {/* Label */}
                <text x={cx} y={comp.y + 15} textAnchor="middle"
                  fill={active ? '#fff' : '#8b95a8'}
                  fontSize="11" fontWeight="bold" pointerEvents="none">
                  {comp.id}
                </text>

                {/* Value */}
                <text x={cx} y={comp.y + 30} textAnchor="middle"
                  fill={active ? comp.color : '#718096'}
                  fontSize="8" fontFamily="monospace" fontWeight="bold" pointerEvents="none">
                  {hex(comp.value)}
                </text>
              </g>
            );
          })}

          {/* Data flow label */}
          {activeTransfers.length > 0 && (
            <g>
              {activeTransfers.slice(-1).map((t, i) => {
                const srcName = typeof t.source === 'string' ? t.source
                  : 'Reg' in t.source ? t.source.Reg
                  : 'Immediate' in t.source ? `#${t.source.Immediate}` : '?';
                return (
                  <text key={i} x="320" y="228" textAnchor="middle"
                    fill="#94a3b8" fontSize="9" fontFamily="monospace">
                    {srcName} → {t.dest} [{hex(t.value)} = {t.value}]
                  </text>
                );
              })}
            </g>
          )}
        </svg>

        {/* Custom HTML tooltip — positioned below cursor */}
        {tooltip.visible && tipInfo && (
          <div style={{
            position: 'absolute',
            left: `${tooltip.x}px`,
            top: `${tooltip.y + 22}px`,
            transform: 'translateX(-50%)',
            background: '#1e293b',
            border: '1px solid #475569',
            borderRadius: '8px',
            padding: '8px 12px',
            zIndex: 100,
            pointerEvents: 'none',
            maxWidth: '220px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '3px' }}>
              {tooltip.id} — {tipInfo.full}
            </div>
            <div style={{ fontSize: '0.7rem', color: '#94a3b8', lineHeight: 1.4 }}>
              {tipInfo.desc}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
