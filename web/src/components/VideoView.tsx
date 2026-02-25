import React, { useEffect, useRef } from 'react';

interface Props {
  memory: number[];
  memoryVersion: number;
  isRunning: boolean;
}

const GRID = 256;
const PIXELS = GRID * GRID;                 // 65536
const BYTES_PER_FRAME = PIXELS / 2;         // 32768 bytes, 4bpp (2 pixels per byte)
const VIDEO_BASE = 0x8000;                   // video RAM at upper 32KB

// 16-color palette — rich gradient for fractals
const PALETTE: [number, number, number][] = [
  [10,  12,  20],   //  0: black (Mandelbrot interior / background)
  [25,  7,   80],   //  1: deep indigo
  [9,   1,  142],   //  2: indigo
  [4,   4,  200],   //  3: blue
  [0,   75, 220],   //  4: bright blue
  [5,  140, 190],   //  5: teal
  [10, 190, 120],   //  6: cyan-green
  [40, 220,  60],   //  7: green
  [120,230,  25],   //  8: yellow-green
  [220,220,  15],   //  9: yellow
  [255,180,   0],   // 10: orange
  [255,100,   0],   // 11: dark orange
  [220, 40,   5],   // 12: red
  [170, 15,  60],   // 13: crimson
  [100,  5,  80],   // 14: purple
  [50,   5,  50],   // 15: dark purple
];

export default function VideoView({ memory, memoryVersion, isRunning }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgDataRef = useRef<ImageData | null>(null);

  const hasContent = memory.slice(VIDEO_BASE, VIDEO_BASE + 256).some(v => v !== 0);

  const render = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = GRID;
    canvas.height = GRID;

    if (!imgDataRef.current || imgDataRef.current.width !== GRID) {
      imgDataRef.current = ctx.createImageData(GRID, GRID);
    }
    const data = imgDataRef.current.data;

    for (let i = 0; i < PIXELS; i++) {
      const byteIdx = Math.floor(i / 2);
      const byteVal = memory[VIDEO_BASE + byteIdx] ?? 0;
      // High nibble = left pixel (even i), low nibble = right pixel (odd i)
      const color = (i & 1) === 0 ? (byteVal >> 4) & 0x0F : byteVal & 0x0F;
      const [r, g, b] = PALETTE[color];
      const off = i * 4;
      data[off]     = r;
      data[off + 1] = g;
      data[off + 2] = b;
      data[off + 3] = 255;
    }

    ctx.putImageData(imgDataRef.current, 0, 0);
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
            256×256 · 4bpp · 16 colors{isRunning ? ' · live' : ''}
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
            width: 320, height: 320,
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
          Video RAM @ 0x{VIDEO_BASE.toString(16).toUpperCase()}–0x{(VIDEO_BASE + BYTES_PER_FRAME - 1).toString(16).toUpperCase()} · 32KB
        </div>
      )}
    </div>
  );
}
