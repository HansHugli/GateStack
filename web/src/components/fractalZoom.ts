// ============================================================================
// fractalZoom.ts — the "Fractal Zoom" host demo
// ============================================================================
// This is NOT a program for the simulated CPU. JavaScript on the host computes
// a Mandelbrot zoom with float64 maths and writes the pixels straight into the
// front buffer (VRAM at 0x3D0000); the simulated CPU sits idle on HALT. It
// shows what the display can do. The CPU-side fractals are "Mandelbrot",
// "Fractal Anim", "Fractal Fast" and "Mandelbrot 16.16".
//
// Returns a function that stops the animation. The app stops it on Reset,
// Wipe, Run, Step and whenever a program is loaded.
// ============================================================================

export function startFractalZoom(
  pokeRaw: (addr: number, val: number) => void,
  refresh: () => void,
): () => void {
  let running = true;
  const GRID = 256;
  const FRONT_BUFFER = 0x3D0000;
  const MAX_ITER = 128;

  // Zoom target, in Seahorse Valley (between the main cardioid and the period-2 bulb)
  const TARGET_RE = -0.7453;
  const TARGET_IM = 0.1127;

  let scale = 3.5;            // view width in the complex plane
  const ZOOM_FACTOR = 0.965;  // 3.5% zoom per frame
  const MIN_SCALE = 0.0000001;
  let colorOffset = 0;

  function renderFrame() {
    if (!running) return;

    const halfW = scale / 2;
    const halfH = (scale * 0.8) / 2;
    const reMin = TARGET_RE - halfW;
    const imMin = TARGET_IM - halfH;
    const reStep = scale / GRID;
    const imStep = (scale * 0.8) / GRID;

    // 8bpp: one palette index per pixel
    for (let py = 0; py < GRID; py++) {
      const ci = imMin + py * imStep;
      for (let px = 0; px < GRID; px++) {
        const cr = reMin + px * reStep;
        let zr = 0, zi = 0;
        let iter = 0;
        while (iter < MAX_ITER) {
          const zr2 = zr * zr;
          const zi2 = zi * zi;
          if (zr2 + zi2 > 4) break;
          zi = 2 * zr * zi + ci;
          zr = zr2 - zi2 + cr;
          iter++;
        }
        // 0 inside the set, 1..255 cycling outside
        const color = iter < MAX_ITER ? ((iter + colorOffset) % 255) + 1 : 0;
        pokeRaw(FRONT_BUFFER + py * 256 + px, color);
      }
    }

    refresh();
    if (scale > MIN_SCALE) scale *= ZOOM_FACTOR;
    colorOffset++;
    if (running) requestAnimationFrame(renderFrame);
  }

  requestAnimationFrame(renderFrame);
  return () => { running = false; };
}
