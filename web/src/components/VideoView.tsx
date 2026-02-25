import React, { useEffect, useRef } from 'react';

interface Props {
  memory: number[];
  memoryVersion: number;
  isRunning: boolean;
}

const GRID = 64;
const PIXELS = GRID * GRID;                 // 4096
const BYTES_PER_FRAME = PIXELS / 4;         // 1024 bytes, 2bpp packed

// Double buffer: page 0 at 0xA000, page 1 at 0xA400
// PAGE_SELECT (0xDFFF) tells which page to DISPLAY
const VIDEO_BASE = 0xA000;
const PAGE_SELECT = 0xDFFF;

const PALETTE = [
  '#0a0c14',             // 0: off
  'rgb(60, 57, 42)',     // 1: dim amber
  'rgb(160, 152, 112)',  // 2: mid amber
  'rgb(255, 242, 179)',  // 3: bright amber
];

export default function VideoView({ memory, memoryVersion, isRunning }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const displayPage = (memory[PAGE_SELECT] ?? 0) & 1;
  const displayBase = VIDEO_BASE + displayPage * BYTES_PER_FRAME;

  const hasContent = memory.slice(VIDEO_BASE, VIDEO_BASE + BYTES_PER_FRAME * 2).some(v => v !== 0);

  const render = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cellSize = 4;
    canvas.width = GRID * cellSize;
    canvas.height = GRID * cellSize;

    for (let i = 0; i < PIXELS; i++) {
      const byteIdx = Math.floor(i / 4);
      const bitShift = (3 - (i % 4)) * 2;
      const byteVal = memory[displayBase + byteIdx] ?? 0;
      const color = (byteVal >> bitShift) & 0x03;
      const row = Math.floor(i / GRID);
      const col = i % GRID;
      ctx.fillStyle = PALETTE[color];
      ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
    }
  };

  useEffect(() => {
    render();
  }, [memoryVersion]);

  return (
    <div style={{
      padding: '10px 12px', flexShrink: 0,
      borderTop: '1px solid var(--border-subtle)',
    }}>
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
            64×64 · 2bpp{isRunning ? ' · live' : ''}
          </span>
        </div>

        {isRunning && hasContent && (
          <span style={{
            fontSize: '0.52rem', padding: '1px 5px', borderRadius: 3,
            background: 'rgba(168,85,247,0.15)', color: '#a855f7',
            border: '1px solid rgba(168,85,247,0.4)',
            fontWeight: 600,
          }}>
            ● LIVE
          </span>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <canvas
          ref={canvasRef}
          style={{
            width: 256, height: 256,
            border: `1px solid ${isRunning && hasContent ? 'rgba(168,85,247,0.4)' : 'var(--border-subtle)'}`,
            borderRadius: 'var(--radius-sm)',
            imageRendering: 'pixelated',
            transition: 'border-color 0.2s',
          }}
        />
      </div>

      {hasContent && (
        <div style={{
          fontSize: '0.52rem', color: 'var(--text-dim)',
          textAlign: 'center', marginTop: 4,
          fontFamily: 'var(--font-mono)',
        }}>
          Video RAM @ 0x{displayBase.toString(16).toUpperCase()} · Page {displayPage}
        </div>
      )}
    </div>
  );
}
