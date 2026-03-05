import React, { useEffect, useRef } from 'react';

interface Props {
  memory: number[];
  memoryVersion: number;
  isRunning: boolean;
}

// ── v2.0 memory map ──
const GRID = 256;
const PIXELS = GRID * GRID;              // 65536 pixels
const VIDEO_BASE = 0x3D0000;             // Front buffer, 64KB, 8bpp
const PALETTE_BASE = 0x3E0000;           // 256 × 4 bytes (R, G, B, _)
const VIDEO_END = 0x3DFFFF;

export default function VideoView({ memory, memoryVersion, isRunning }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgDataRef = useRef<ImageData | null>(null);
  // Cache the palette so we don't re-read 1024 bytes every pixel
  const paletteRef = useRef<Uint8Array>(new Uint8Array(1024));

  const hasContent = memory.slice != null && (() => {
    // Quick check: scan first 256 bytes of VRAM for any non-zero
    for (let i = 0; i < 256; i++) {
      if ((memory[VIDEO_BASE + i] ?? 0) !== 0) return true;
    }
    return false;
  })();

  const render = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Only set canvas size once (avoids clearing on every frame = tearing)
    if (canvas.width !== GRID || canvas.height !== GRID) {
      canvas.width = GRID;
      canvas.height = GRID;
    }

    if (!imgDataRef.current || imgDataRef.current.width !== GRID) {
      imgDataRef.current = ctx.createImageData(GRID, GRID);
    }

    // Read palette from memory (256 entries × 4 bytes = 1024 bytes)
    const pal = paletteRef.current;
    for (let i = 0; i < 1024; i++) {
      pal[i] = memory[PALETTE_BASE + i] ?? 0;
    }

    const data = imgDataRef.current.data;

    // 8bpp: each pixel is 1 byte index into the 256-color palette
    for (let i = 0; i < PIXELS; i++) {
      const colorIdx = memory[VIDEO_BASE + i] ?? 0;
      const palOff = colorIdx * 4;
      const off = i * 4;
      data[off]     = pal[palOff];      // R
      data[off + 1] = pal[palOff + 1];  // G
      data[off + 2] = pal[palOff + 2];  // B
      data[off + 3] = 255;              // A
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
            256×256 · 8bpp · 256 colors{isRunning ? ' · live' : ''}
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
            width: '100%', maxWidth: 460, aspectRatio: '1 / 1',
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
          VRAM 0x{VIDEO_BASE.toString(16).toUpperCase()}–0x{VIDEO_END.toString(16).toUpperCase()} · 64KB
          {' · '}Palette 0x{PALETTE_BASE.toString(16).toUpperCase()}
        </div>
      )}
    </div>
  );
}
