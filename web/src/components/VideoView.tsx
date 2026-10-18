import React, { useEffect, useRef, useState } from 'react';

interface Props {
  memory: number[];
  memoryVersion: number;
  isRunning: boolean;
  /** The Fractal Zoom host demo is drawing (JavaScript, not the CPU). */
  hostDemo?: boolean;
}

// ── v2.0 memory map ──
const GRID = 256;
const PIXELS = GRID * GRID;              // 65536 pixels
const VIDEO_BASE = 0x3D0000;             // Front buffer, 64KB, 8bpp
const PALETTE_BASE = 0x3E0000;           // 256 × 4 bytes (R, G, B, unused)
const VIDEO_END = 0x3DFFFF;
const LIVE_MS = 1000;                    // "LIVE" while the picture changed this recently

/**
 * Copy the front buffer and palette into `prev` if they differ from it.
 * Returns whether anything changed. Comparing 65 KB is far cheaper than
 * redrawing, and exact (no hash collisions).
 */
export function syncVideoMemory(memory: ArrayLike<number>, prev: Uint8Array): boolean {
  let changed = false;
  for (let i = 0; i < PIXELS; i++) {
    const v = memory[VIDEO_BASE + i] ?? 0;
    if (prev[i] !== v) { prev[i] = v; changed = true; }
  }
  for (let i = 0; i < 1024; i++) {
    const v = memory[PALETTE_BASE + i] ?? 0;
    if (prev[PIXELS + i] !== v) { prev[PIXELS + i] = v; changed = true; }
  }
  return changed;
}

export default function VideoView({ memory, memoryVersion, isRunning, hostDemo }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgDataRef = useRef<ImageData | null>(null);
  // Last drawn VRAM + palette; starts invalid so the first frame always draws.
  const shownRef = useRef<Uint8Array | null>(null);
  const lastChangeRef = useRef(0);
  const [hasContent, setHasContent] = useState(false);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || memory.length < PALETTE_BASE + 1024) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let first = false;
    if (!shownRef.current) {
      shownRef.current = new Uint8Array(PIXELS + 1024);
      first = true;
    }
    const changed = syncVideoMemory(memory, shownRef.current) || first;
    const now = performance.now();
    if (changed) lastChangeRef.current = now;
    setLive(isRunning && now - lastChangeRef.current < LIVE_MS);
    if (!changed) return;

    if (canvas.width !== GRID || canvas.height !== GRID) {
      canvas.width = GRID;
      canvas.height = GRID;
    }
    if (!imgDataRef.current) imgDataRef.current = ctx.createImageData(GRID, GRID);

    const shown = shownRef.current;
    const data = imgDataRef.current.data;
    let any = false;
    for (let i = 0; i < PIXELS; i++) {
      const colorIdx = shown[i];
      if (colorIdx !== 0) any = true;
      const palOff = PIXELS + colorIdx * 4;
      const off = i * 4;
      data[off] = shown[palOff];
      data[off + 1] = shown[palOff + 1];
      data[off + 2] = shown[palOff + 2];
      data[off + 3] = 255;
    }
    ctx.putImageData(imgDataRef.current, 0, 0);
    setHasContent(any);
  }, [memoryVersion, memory, isRunning]);

  return (
    <section aria-label="Video" style={{ padding: '10px 12px', flexShrink: 0, borderTop: '1px solid var(--border-subtle)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <h2 style={{
          fontSize: '0.6875rem', fontWeight: 700, color: 'var(--text-muted)', margin: 0,
          textTransform: 'uppercase' as const, letterSpacing: '1px',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <div style={{ width: 3, height: 12, borderRadius: 2, background: '#a855f7' }} />
          Video
          <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', fontWeight: 400, fontFamily: 'var(--font-mono)', textTransform: 'none' }}>
            256×256 · 8bpp · 256 colors
          </span>
        </h2>

        {live && (
          <span style={{
            fontSize: '0.6875rem', padding: '1px 5px', borderRadius: 3,
            background: 'rgba(168,85,247,0.15)', color: '#c4b5fd',
            border: '1px solid rgba(168,85,247,0.4)', fontWeight: 600,
          }} title="The picture is changing">
            ● LIVE
          </span>
        )}
      </div>

      {hostDemo && (
        <div style={{
          fontSize: '0.6875rem', color: 'var(--accent-amber)', marginBottom: 6,
          padding: '4px 8px', border: '1px solid var(--accent-amber-dim)', borderRadius: 4,
        }}>
          Host demo: JavaScript on your computer draws this zoom straight into VRAM.
          The simulated CPU is idle. Step, Run, Reset or loading a program stops it.
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Video output (front buffer)"
          style={{
            width: '100%', maxWidth: 460, aspectRatio: '1 / 1',
            border: `1px solid ${live ? 'rgba(168,85,247,0.4)' : 'var(--border-subtle)'}`,
            borderRadius: 'var(--radius-sm)',
            imageRendering: 'pixelated',
            transition: 'border-color 0.2s',
          }}
        />
      </div>

      {hasContent && (
        <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
          VRAM 0x{VIDEO_BASE.toString(16).toUpperCase()}–0x{VIDEO_END.toString(16).toUpperCase()} · 64KB
          {' · '}Palette 0x{PALETTE_BASE.toString(16).toUpperCase()}
        </div>
      )}
    </section>
  );
}
