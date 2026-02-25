import React, { useState, useRef, useEffect, useMemo } from 'react';

interface Props {
  memory: number[];
  memoryVersion: number;
  currentAddress: number;
  onPoke: (addr: number, value: number) => void;
}

const hex8 = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
const hex16 = (n: number) => n.toString(16).padStart(4, '0').toUpperCase();

const PAGE_SIZE = 256;
const COLS = 16;
const ROWS = PAGE_SIZE / COLS;

const REGIONS = [
  { label: 'Code',  page: 0, color: '#3b82f6' },
  { label: 'Stack', page: Math.floor(0x9F00 / PAGE_SIZE), color: '#a855f7' },
  { label: 'Vid 0', page: Math.floor(0xA000 / PAGE_SIZE), color: '#a855f7' },
  { label: 'Vid 1', page: Math.floor(0xA400 / PAGE_SIZE), color: '#a855f7' },
  { label: 'PgSel', page: Math.floor(0xDF00 / PAGE_SIZE), color: '#ef4444' },
];

const toAscii = (b: number) => (b >= 0x20 && b <= 0x7E) ? String.fromCharCode(b) : '·';

function EditCell(props: {
  addr: number; value: number;
  onCommit: (addr: number, value: number) => void;
  onCancel: () => void;
  [k: string]: any;
}) {
  const { addr, value, onCommit, onCancel } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(hex8(value));

  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);

  const commit = () => {
    let val: number | null = null;
    const t = text.trim();
    if (/^0[xX][0-9a-fA-F]+$/.test(t)) val = parseInt(t, 16);
    else if (/^[0-9a-fA-F]{1,2}$/i.test(t) && !t.match(/^[0-9]+$/)) val = parseInt(t, 16);
    else if (/^\d+$/.test(t)) val = parseInt(t, 10);
    else if (t.length === 3 && t[0] === "'" && t[2] === "'") val = t.charCodeAt(1);
    else if (t.length === 1) val = t.charCodeAt(0);
    if (val !== null && val >= 0 && val <= 255) onCommit(addr, val);
    else onCancel();
  };

  return (
    <input ref={inputRef} value={text}
      onChange={e => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') onCancel(); if (e.key === 'Tab') { e.preventDefault(); commit(); } }}
      style={{
        width: 22, height: 15, padding: 0, margin: 0,
        fontFamily: 'var(--font-mono)', fontSize: '0.58rem',
        textAlign: 'center', border: '1px solid #3b82f6',
        borderRadius: 2, background: '#1e3a5f', color: '#93c5fd',
        outline: 'none',
      }}
    />
  );
}

export default function MemoryView({ memory, memoryVersion, currentAddress, onPoke }: Props) {
  const [page, setPage] = useState(0);
  const [editAddr, setEditAddr] = useState<number | null>(null);
  const totalPages = Math.ceil(65536 / PAGE_SIZE);
  const pcPage = Math.floor(currentAddress / PAGE_SIZE);

  const pageStart = page * PAGE_SIZE;
  const pageMemory = useMemo(
    () => memory.slice(pageStart, pageStart + PAGE_SIZE),
    [memoryVersion, pageStart]
  );

  return (
    <div style={{ padding: '10px 12px', flexShrink: 0, borderBottom: '1px solid var(--border-subtle)' }}>

      {/* ── Header row ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div style={{
          fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)',
          textTransform: 'uppercase' as const, letterSpacing: '1px',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <div style={{ width: 3, height: 12, borderRadius: 2, background: '#ef4444' }} />
          RAM
        </div>

        {/* Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <NavBtn onClick={() => setPage(0)} disabled={page === 0}>⏮</NavBtn>
          <NavBtn onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}>◀</NavBtn>
          <span style={{
            fontSize: '0.58rem', fontFamily: 'var(--font-mono)',
            color: 'var(--text-secondary)', minWidth: 36, textAlign: 'center',
          }}>{page}/{totalPages - 1}</span>
          <NavBtn onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}>▶</NavBtn>
          <NavBtn onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1}>⏭</NavBtn>
        </div>
      </div>

      {/* ── Address bar: hex + decimal ── */}
      <div style={{
        fontSize: '0.55rem', fontFamily: 'var(--font-mono)',
        color: 'var(--text-dim)', marginBottom: 4,
        display: 'flex', gap: 8,
      }}>
        <span>0x{hex16(pageStart)}–0x{hex16(pageStart + PAGE_SIZE - 1)}</span>
        <span style={{ color: 'var(--text-dim)' }}>({pageStart}–{pageStart + PAGE_SIZE - 1})</span>
        <span>64KB total</span>
      </div>

      {/* ── Quick-jump region buttons ── */}
      <div style={{ display: 'flex', gap: 3, marginBottom: 6, flexWrap: 'wrap' }}>
        <RegionBtn active={page === pcPage} color="#f59e0b" onClick={() => setPage(pcPage)}>
          PC:{hex16(currentAddress)}
        </RegionBtn>
        {REGIONS.map(r => (
          <RegionBtn key={r.label} active={page === r.page} color={r.color} onClick={() => setPage(r.page)}>
            {r.label}
          </RegionBtn>
        ))}
      </div>

      {/* ── Hex grid ── */}
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', lineHeight: '1.5' }}>

        {/* Column headers */}
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <span style={{ width: 52, flexShrink: 0 }} />
          {Array.from({ length: COLS }, (_, i) => (
            <span key={i} style={{
              width: 22, textAlign: 'center',
              color: i % 4 === 0 ? 'var(--text-muted)' : 'var(--text-dim)',
              fontSize: '0.5rem', fontWeight: i % 4 === 0 ? 600 : 400,
              marginLeft: i > 0 && i % 8 === 0 ? 4 : 0,
            }}>
              .{i.toString(16).toUpperCase()}
            </span>
          ))}
          <span style={{
            fontSize: '0.48rem', color: 'var(--text-dim)',
            paddingLeft: 10, letterSpacing: '0.5px',
          }}>ASCII</span>
        </div>

        {/* Data rows */}
        {Array.from({ length: ROWS }, (_, row) => {
          const rowAddr = pageStart + row * COLS;
          const isAlt = row % 2 === 1;

          return (
            <div key={row} style={{
              display: 'flex', alignItems: 'center',
              background: isAlt ? 'rgba(255,255,255,0.018)' : 'transparent',
              borderRadius: 2,
            }}>
              {/* Row address */}
              <span style={{
                width: 52, flexShrink: 0,
                color: 'var(--text-muted)', fontSize: '0.55rem',
                fontWeight: 500,
                paddingRight: 4,
              }}>{hex16(rowAddr)}</span>

              {/* Hex cells */}
              {Array.from({ length: COLS }, (_, col) => {
                const addr = rowAddr + col;
                const val = pageMemory[row * COLS + col] ?? 0;
                const isPC = addr === currentAddress;
                const isNonZero = val !== 0;
                const isEditing = editAddr === addr;

                if (isEditing) {
                  return <EditCell key={col} addr={addr} value={val}
                    onCommit={(a, v) => { onPoke(a, v); setEditAddr(null); }}
                    onCancel={() => setEditAddr(null)} />;
                }

                return (
                  <span key={col}
                    onClick={() => setEditAddr(addr)}
                    style={{
                      width: 22, textAlign: 'center', cursor: 'pointer',
                      color: isPC ? '#f59e0b' : isNonZero ? 'var(--text-secondary)' : 'var(--text-dim)',
                      background: isPC ? 'rgba(245,158,11,0.12)' : 'transparent',
                      borderRadius: 2,
                      fontWeight: isPC ? 700 : 400,
                      marginLeft: col > 0 && col % 8 === 0 ? 4 : 0,
                    }}
                    title={`[0x${hex16(addr)}] (${addr}) = ${val} (0x${hex8(val)})${val >= 32 && val < 127 ? " '" + String.fromCharCode(val) + "'" : ''}`}
                  >
                    {hex8(val)}
                  </span>
                );
              })}

              {/* ASCII sidebar */}
              <span style={{
                paddingLeft: 6, marginLeft: 4,
                borderLeft: '1px solid var(--border-subtle)',
                fontSize: '0.54rem',
                letterSpacing: '1px',
                whiteSpace: 'pre',
                userSelect: 'none',
              }}>
                {Array.from({ length: COLS }, (_, col) => {
                  const addr = rowAddr + col;
                  const val = pageMemory[row * COLS + col] ?? 0;
                  const isPC = addr === currentAddress;
                  const isPrintable = val >= 0x20 && val <= 0x7E;
                  return (
                    <span key={col} style={{
                      color: isPC ? '#f59e0b'
                           : isPrintable ? 'var(--text-muted)'
                           : 'var(--text-dim)',
                      fontWeight: isPC ? 700 : 400,
                    }}>{toAscii(val)}</span>
                  );
                })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function NavBtn(props: { onClick: () => void; disabled: boolean; children: any }) {
  const { onClick, disabled, children } = props;
  return (
    <button onClick={onClick} disabled={disabled} style={{
      fontSize: '0.6rem', padding: '2px 5px', borderRadius: 3,
      cursor: disabled ? 'default' : 'pointer',
      background: 'transparent',
      color: disabled ? 'var(--text-dim)' : 'var(--text-primary)',
      border: `1px solid ${disabled ? 'transparent' : 'var(--border-subtle)'}`,
      opacity: disabled ? 0.3 : 1,
      fontFamily: 'system-ui',
      lineHeight: 1,
    }}>{children}</button>
  );
}

function RegionBtn(props: { active: boolean; color: string; onClick: () => void; children: any; [k: string]: any }) {
  const { active, color, onClick, children } = props;
  return (
    <button onClick={onClick} style={{
      fontSize: '0.5rem', fontWeight: 600,
      padding: '2px 6px', borderRadius: 3, cursor: 'pointer',
      background: active ? `${color}18` : 'transparent',
      color: active ? color : 'var(--text-muted)',
      border: `1px solid ${active ? `${color}55` : 'var(--border-subtle)'}`,
      fontFamily: 'var(--font-mono)',
      lineHeight: 1.2,
    }}>{children}</button>
  );
}
