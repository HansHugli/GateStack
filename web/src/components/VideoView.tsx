import React, { useState, useEffect, useRef } from 'react';

interface Props {
  memory: number[];
}

const GRID = 8;
const PAGE0_ADDR = 192; // RAM 192–255
const PAGE1_ADDR = 128; // RAM 128–191
const PAGE_SELECT = 127; // RAM[127]: 0=page0, nonzero=page1

export default function VideoView({ memory }: Props) {
  const [autoAnimate, setAutoAnimate] = useState(false);
  const [animPage, setAnimPage] = useState(0);
  const intervalRef = useRef<number | null>(null);

  // Page from RAM[127] (program-controlled)
  const ramPage = (memory[PAGE_SELECT] ?? 0) === 0 ? 0 : 1;

  // When auto-animate is on, cycle pages at ~4 FPS
  useEffect(() => {
    if (autoAnimate) {
      intervalRef.current = window.setInterval(() => {
        setAnimPage(p => (p === 0 ? 1 : 0));
      }, 250);
    } else {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, [autoAnimate]);

  // Active page: auto-animate overrides RAM page select
  const activePage = autoAnimate ? animPage : ramPage;
  const baseAddr = activePage === 0 ? PAGE0_ADDR : PAGE1_ADDR;

  const cellSize = 18;
  const gap = 1;

  // Check if either page has any nonzero pixels
  const page0HasContent = memory.slice(PAGE0_ADDR, PAGE0_ADDR + 64).some(v => v !== 0);
  const page1HasContent = memory.slice(PAGE1_ADDR, PAGE1_ADDR + 64).some(v => v !== 0);
  const hasAnyContent = page0HasContent || page1HasContent;

  return (
    <div style={{
      padding: '10px 12px', flexShrink: 0,
      borderTop: '1px solid var(--border-subtle)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 6,
      }}>
        <div style={{
          fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)',
          textTransform: 'uppercase' as const, letterSpacing: '1px',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <div style={{ width: 3, height: 12, borderRadius: 2, background: '#a855f7' }} />
          Video
          <span style={{
            fontSize: '0.58rem', color: 'var(--text-dim)', fontWeight: 400,
            fontFamily: 'var(--font-mono)',
          }}>
            8×8 · P{activePage}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {/* Page indicator chips */}
          {[0, 1].map(p => (
            <span key={p} style={{
              fontSize: '0.55rem', fontWeight: 600,
              padding: '1px 5px', borderRadius: 3,
              background: activePage === p ? 'rgba(168,85,247,0.15)' : 'transparent',
              color: activePage === p ? '#a855f7' : 'var(--text-dim)',
              border: `1px solid ${activePage === p ? 'rgba(168,85,247,0.4)' : 'var(--border-subtle)'}`,
              fontFamily: 'var(--font-mono)',
            }}>
              P{p}:{p === 0 ? '192' : '128'}
            </span>
          ))}

          {/* Auto-animate toggle */}
          <button
            onClick={() => setAutoAnimate(!autoAnimate)}
            style={{
              fontSize: '0.55rem', fontWeight: 600,
              padding: '1px 6px', borderRadius: 3, cursor: 'pointer',
              marginLeft: 4,
              background: autoAnimate ? 'rgba(168,85,247,0.15)' : 'transparent',
              color: autoAnimate ? '#a855f7' : 'var(--text-dim)',
              border: `1px solid ${autoAnimate ? 'rgba(168,85,247,0.4)' : 'var(--border-subtle)'}`,
              transition: 'all 0.2s',
            }}
            title={autoAnimate ? 'Stop auto-animate' : 'Auto-animate between pages'}
          >
            {autoAnimate ? '⏸' : '▶'} Anim
          </button>
        </div>
      </div>

      {/* Pixel grid */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${GRID}, ${cellSize}px)`,
          gridTemplateRows: `repeat(${GRID}, ${cellSize}px)`,
          gap: `${gap}px`,
          padding: gap,
          background: 'var(--bg-base, #06080f)',
          border: `1px solid ${autoAnimate ? 'rgba(168,85,247,0.4)' : 'var(--border-subtle)'}`,
          borderRadius: 'var(--radius-sm)',
          transition: 'border-color 0.2s',
        }}>
          {Array.from({ length: GRID * GRID }, (_, i) => {
            const addr = baseAddr + i;
            const val = memory[addr] ?? 0;
            const on = val !== 0;
            const brightness = on ? Math.min(255, Math.max(40, val)) : 0;
            return (
              <div
                key={i}
                title={`P${activePage}[${addr}] = 0x${val.toString(16).padStart(2, '0')} (${val})`}
                style={{
                  width: cellSize, height: cellSize,
                  background: on
                    ? `rgb(${brightness}, ${Math.floor(brightness * 0.95)}, ${Math.floor(brightness * 0.7)})`
                    : '#0a0c14',
                  borderRadius: 1,
                  transition: 'background 0.05s',
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Page status */}
      {hasAnyContent && (
        <div style={{
          fontSize: '0.55rem', color: 'var(--text-dim)',
          textAlign: 'center', marginTop: 4,
          fontFamily: 'var(--font-mono)',
        }}>
          RAM[{PAGE_SELECT}]={memory[PAGE_SELECT] ?? 0} → Page {ramPage}
          {autoAnimate && ' (anim override)'}
        </div>
      )}
    </div>
  );
}
