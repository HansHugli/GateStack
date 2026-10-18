import React, { useState, useRef, useEffect, useMemo } from 'react';

interface Props {
  memory: number[];
  memoryVersion: number;
  currentAddress: number;
  onPoke: (addr: number, value: number) => void;
  /** Labels of the loaded program, for "Go to". */
  labels?: Map<string, number> | null;
}

const MEM_SIZE_BYTES = 4_194_304;

/**
 * A byte typed into a RAM cell. Cells show hex, so plain digits are hex too
 * ("10" is 0x10 = 16). Use #16 for decimal or 'c' for a character.
 */
export function parseCellValue(text: string): number | null {
  const t = text.trim();
  let v: number | null = null;
  if (/^(0x)?[0-9a-f]{1,2}$/i.test(t)) v = parseInt(t.replace(/^0x/i, ''), 16);
  else if (/^#\d{1,3}$/.test(t)) v = parseInt(t.slice(1), 10);
  else if (/^'.'$/.test(t)) v = t.charCodeAt(1);
  return v !== null && v >= 0 && v <= 255 ? v : null;
}

/** An address typed into "Go to": hex (0x optional) or a label of the loaded program. */
export function parseGotoAddress(text: string, labels?: Map<string, number> | null): number | null {
  const t = text.trim();
  if (!t) return null;
  if (labels) {
    for (const [name, addr] of labels) if (name.toLowerCase() === t.toLowerCase()) return addr;
  }
  if (/^(0x)?[0-9a-f]{1,6}$/i.test(t)) {
    const v = parseInt(t.replace(/^0x/i, ''), 16);
    return v < MEM_SIZE_BYTES ? v : null;
  }
  return null;
}

const hex8 = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
const hex24 = (n: number) => n.toString(16).padStart(6, '0').toUpperCase();

const MEM_SIZE = 4_194_304; // 4MB
const PAGE_SIZE = 256;
const COLS = 16;
const ROWS = PAGE_SIZE / COLS;

const REGIONS = [
  { label: 'Code',    page: 0, color: '#3b82f6' },
  { label: 'Stack',   page: Math.floor(0x3BFFFF / PAGE_SIZE), color: '#a855f7' },
  { label: 'BackBuf', page: Math.floor(0x3C0000 / PAGE_SIZE), color: '#f59e0b' },
  { label: 'Video',   page: Math.floor(0x3D0000 / PAGE_SIZE), color: '#ef4444' },
  { label: 'Palette', page: Math.floor(0x3E0000 / PAGE_SIZE), color: '#22c55e' },
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
    const val = parseCellValue(text);
    if (val !== null) onCommit(addr, val);
    else onCancel();
  };

  return (
    <input ref={inputRef} value={text}
      aria-label={`Byte at 0x${hex24(addr)} in hex`}
      title="Hex byte (00-FF). Use #65 for decimal or 'A' for a character."
      onChange={e => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') onCancel(); if (e.key === 'Tab') { e.preventDefault(); commit(); } }}
      style={{
        width: 20, height: 15, padding: 0, margin: 0,
        fontFamily: 'var(--font-mono)', fontSize: '0.6875rem',
        textAlign: 'center', border: '1px solid #3b82f6',
        borderRadius: 2, background: '#1e3a5f', color: '#93c5fd',
        outline: 'none',
      }}
    />
  );
}

export default function MemoryView({ memory, memoryVersion, currentAddress, onPoke, labels }: Props) {
  const [page, setPage] = useState(0);
  const [gotoText, setGotoText] = useState('');
  const [gotoError, setGotoError] = useState<string | null>(null);
  const [marked, setMarked] = useState<number | null>(null);
  const goTo = () => {
    const a = parseGotoAddress(gotoText, labels);
    if (a === null) {
      setGotoError(`Unknown address or label: ${gotoText.trim() || '(empty)'}`);
      return;
    }
    setGotoError(null);
    setPage(Math.floor(a / PAGE_SIZE));
    setMarked(a);
  };
  const [editAddr, setEditAddr] = useState<number | null>(null);
  const totalPages = Math.ceil(MEM_SIZE / PAGE_SIZE);
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
          fontSize: '0.6875rem', fontWeight: 700, color: 'var(--text-muted)',
          textTransform: 'uppercase' as const, letterSpacing: '1px',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <div style={{ width: 3, height: 12, borderRadius: 2, background: '#ef4444' }} />
          RAM
        </div>

        {/* Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <NavBtn onClick={() => setPage(0)} disabled={page === 0} label="First page">⏮</NavBtn>
          <NavBtn onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} label="Previous 256 bytes">◀</NavBtn>
          <input
            type="text"
            value={gotoText}
            placeholder="Go to 0x… or label"
            aria-label="Go to address (hex) or label"
            aria-invalid={!!gotoError}
            title="Hex address (0x optional) or a label of the loaded program; Enter to jump"
            onChange={e => { setGotoText(e.target.value); setGotoError(null); }}
            onKeyDown={e => { if (e.key === 'Enter') goTo(); }}
            style={{
              width: 128, fontSize: '0.6875rem', fontFamily: 'var(--font-mono)',
              color: 'var(--text-secondary)',
              background: 'var(--bg-elevated)', border: `1px solid ${gotoError ? 'var(--accent-red)' : 'var(--border-default)'}`,
              borderRadius: 3, padding: '1px 4px', outline: 'none',
            }}
          />
          <NavBtn onClick={goTo} disabled={!gotoText.trim()} label="Go to address">Go</NavBtn>
          <NavBtn onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} label="Next 256 bytes">▶</NavBtn>
          <NavBtn onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1} label="Last page">⏭</NavBtn>
        </div>
      </div>

      {/* ── Address bar: hex + decimal ── */}
      <div style={{
        fontSize: '0.6875rem', fontFamily: 'var(--font-mono)',
        color: 'var(--text-dim)', marginBottom: 4,
        display: 'flex', gap: 8,
      }}>
        <span>0x{hex24(pageStart)}–0x{hex24(pageStart + PAGE_SIZE - 1)}</span>
        <span style={{ color: 'var(--text-dim)' }}>({pageStart}–{pageStart + PAGE_SIZE - 1})</span>
        <span>4MB · click a byte to edit (hex)</span>
      </div>
      {gotoError && (
        <div role="alert" style={{ color: 'var(--accent-red)', fontSize: '0.6875rem', marginBottom: 4 }}>{gotoError}</div>
      )}

      {/* ── Quick-jump region buttons ── */}
      <div style={{ display: 'flex', gap: 3, marginBottom: 6, flexWrap: 'wrap' }}>
        <RegionBtn active={page === pcPage} color="#f59e0b" onClick={() => setPage(pcPage)}>
          PC:{hex24(currentAddress)}
        </RegionBtn>
        {REGIONS.map(r => (
          <RegionBtn key={r.label} active={page === r.page} color={r.color} onClick={() => setPage(r.page)}>
            {r.label}
          </RegionBtn>
        ))}
      </div>

      {/* ── Hex grid ── */}
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6875rem', lineHeight: '1.5' }}>

        {/* Column headers */}
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <span style={{ width: 50, flexShrink: 0, color: 'var(--text-muted)', fontWeight: 600 }}>Addr</span>
          {Array.from({ length: COLS }, (_, i) => (
            <span key={i} style={{
              width: 20, textAlign: 'center',
              color: i % 4 === 0 ? 'var(--text-muted)' : 'var(--text-dim)',
              fontSize: '0.6875rem', fontWeight: i % 4 === 0 ? 600 : 400,
              marginLeft: i > 0 && i % 8 === 0 ? 4 : 0,
            }}>
              .{i.toString(16).toUpperCase()}
            </span>
          ))}
          <span style={{
            fontSize: '0.6875rem',
            paddingLeft: 10, letterSpacing: '0.5px', color: 'var(--text-muted)', fontWeight: 600,
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
                width: 50, flexShrink: 0,
                color: 'var(--text-muted)', fontSize: '0.6875rem',
                fontWeight: 500,
                paddingRight: 4,
              }}>{hex24(rowAddr)}</span>

              {/* Hex cells */}
              {Array.from({ length: COLS }, (_, col) => {
                const addr = rowAddr + col;
                const val = pageMemory[row * COLS + col] ?? 0;
                const isPC = addr === currentAddress;
                const isMarked = addr === marked;
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
                      width: 20, textAlign: 'center', cursor: 'pointer',
                      color: isPC ? '#f59e0b' : isNonZero ? 'var(--text-secondary)' : 'var(--text-dim)',
                      background: isPC ? 'rgba(245,158,11,0.12)' : isMarked ? 'rgba(56,189,248,0.18)' : 'transparent',
                      outline: isMarked ? '1px solid var(--accent-blue)' : 'none',
                      borderRadius: 2,
                      fontWeight: isPC ? 700 : 400,
                      marginLeft: col > 0 && col % 8 === 0 ? 4 : 0,
                    }}
                    title={`[0x${hex24(addr)}] (${addr}) = ${val} (0x${hex8(val)})${val >= 32 && val < 127 ? " '" + String.fromCharCode(val) + "'" : ''}`}
                  >
                    {hex8(val)}
                  </span>
                );
              })}

              {/* ASCII sidebar */}
              <span style={{
                paddingLeft: 6, marginLeft: 4,
                borderLeft: '1px solid var(--border-subtle)',
                fontSize: '0.6875rem',
                letterSpacing: '0px',
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

function NavBtn(props: { onClick: () => void; disabled: boolean; children: any; label: string }) {
  const { onClick, disabled, children, label } = props;
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label} title={label} style={{
      fontSize: '0.6875rem', padding: '2px 5px', borderRadius: 3,
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
      fontSize: '0.6875rem', fontWeight: 600,
      padding: '2px 6px', borderRadius: 3, cursor: 'pointer',
      background: active ? `${color}18` : 'transparent',
      color: active ? color : 'var(--text-muted)',
      border: `1px solid ${active ? `${color}55` : 'var(--border-subtle)'}`,
      fontFamily: 'var(--font-mono)',
      lineHeight: 1.2,
    }}>{children}</button>
  );
}
