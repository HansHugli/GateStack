// Every sample assembles, uses no instruction or register name as a label,
// and the deterministic ones produce what their `expect` text promises on the
// JavaScript engine.

import { describe, it, expect } from 'vitest';
import { assemble } from './assembler';
import { MockComputer, OP } from './wasm-bridge';
import { SAMPLE_PROGRAMS, SAMPLE_CATEGORIES, HOST_DEMOS } from './samples';

const FPMUL16_SAMPLES = new Set(['mandelbrot_1616']);
const fpmul16Supported =
  assemble('FPMUL16 R0, R1\nHALT').success && (OP as Record<string, number>).FPMUL16 !== undefined;

/** Samples that read input or run forever: assemble only. */
const INTERACTIVE = new Set(['echo', 'adder', 'calc']);
const ENDLESS = new Set(['video']);

const RESERVED = new Set([
  ...Object.keys(OP), 'FPMUL16', 'DB', 'DW', 'DD',
  ...Array.from({ length: 16 }, (_, i) => `R${i}`),
]);

function runToHalt(bytes: number[], budget = 200_000_000) {
  const c = new MockComputer();
  c.loadProgram(new Uint8Array(bytes));
  c.setSkipVsync(true);
  let total = 0;
  while (!c.isHalted() && !c.isWaitingForInput() && total < budget) {
    const n = c.run(1_000_000);
    total += n;
    if (n === 0 && !c.isHalted()) break;
  }
  return c;
}

const consoleText = (c: MockComputer) => String.fromCharCode(...c.getConsoleOutput());

/** Output lines, trimmed and whitespace-collapsed, joined the way `expect` writes them. */
function normalize(out: string, joiner: string): string {
  return out.split('\n').map(l => l.trim().replace(/\s+/g, ' ')).filter(Boolean).join(joiner);
}

describe('samples', () => {
  it('every sample is in a menu category exactly once', () => {
    const listed = SAMPLE_CATEGORIES.flatMap(c => c.keys);
    expect(new Set(listed).size).toBe(listed.length);
    expect(listed.sort()).toEqual(Object.keys(SAMPLE_PROGRAMS).sort());
  });

  for (const [key, prog] of Object.entries(SAMPLE_PROGRAMS)) {
    const needsFpmul16 = FPMUL16_SAMPLES.has(key);

    it.skipIf(needsFpmul16 && !fpmul16Supported)(`${key} assembles without errors`, () => {
      const r = assemble(prog.code);
      expect(r.errors).toEqual([]);
      expect(r.success).toBe(true);
      expect(r.bytes.length).toBeGreaterThan(0);
    });

    it.skipIf(needsFpmul16 && !fpmul16Supported)(`${key} uses no instruction or register name as a label`, () => {
      const r = assemble(prog.code);
      const bad = [...r.labels.keys()].filter(l => RESERVED.has(l.toUpperCase()));
      expect(bad).toEqual([]);
    });
  }
});

describe('console samples print their expected output (JS engine)', () => {
  const consoleSamples = ['hello', 'fibonacci', 'multiply', 'divide', 'primes', 'sort', 'matrix'];
  for (const key of consoleSamples) {
    it(key, () => {
      const prog = SAMPLE_PROGRAMS[key];
      const r = assemble(prog.code);
      expect(r.success).toBe(true);
      const c = runToHalt(r.bytes);
      expect(c.isHalted()).toBe(true);
      const exp = prog.expect;
      const out = normalize(consoleText(c), exp.includes(' / ') ? ' / ' : ' ');
      if (exp.includes(' … ')) {
        const [head, tail] = exp.split(' … ');
        expect(out.startsWith(head)).toBe(true);
        expect(out.endsWith(tail)).toBe(true);
      } else {
        expect(out).toContain(exp);
      }
    });
  }

  it('fibonacci prints all 47 terms that fit in 32 bits', () => {
    const r = assemble(SAMPLE_PROGRAMS.fibonacci.code);
    const c = runToHalt(r.bytes);
    const nums = consoleText(c).trim().split('\n').map(Number);
    const fib = [1, 1];
    while (fib.length < 47) fib.push(fib[fib.length - 1] + fib[fib.length - 2]);
    expect(nums).toEqual(fib);
  });
});

describe('register samples end with the values in their expect text (JS engine)', () => {
  const registerSamples = Object.entries(SAMPLE_PROGRAMS).filter(([, p]) => /^R\d+ ?= ?/.test(p.expect));
  for (const [key, prog] of registerSamples) {
    it(`${key}: ${prog.expect}`, () => {
      const r = assemble(prog.code);
      const c = runToHalt(r.bytes);
      expect(c.isHalted()).toBe(true);
      for (const m of prog.expect.matchAll(/R(\d+) ?= ?(0x[0-9A-Fa-f]+|\d+)/g)) {
        expect(c.getRegister(Number(m[1])) >>> 0).toBe(Number(m[2]) >>> 0);
      }
    });
  }

  it('flags: the final ADD leaves carry and zero set', () => {
    const c = runToHalt(assemble(SAMPLE_PROGRAMS.flags.code).bytes);
    const s = c.getState();
    expect(s.flags.carry).toBe(true);
    expect(s.flags.zero).toBe(true);
    expect(s.r[0]).toBe(0);
  });
});

describe('interactive samples', () => {
  const feed = (key: string, inputs: number[]) => {
    const c = new MockComputer();
    c.loadProgram(new Uint8Array(assemble(SAMPLE_PROGRAMS[key].code).bytes));
    for (let guard = 0; guard < 100 && !c.isHalted(); guard++) {
      c.run(10_000_000);
      if (c.isWaitingForInput()) {
        if (inputs.length === 0) break;
        c.provideInput(inputs.shift()! >>> 0);
      }
    }
    return consoleText(c);
  };

  it('adder adds full 32-bit numbers', () => {
    expect(feed('adder', [3000000000, 1234567890])).toContain('=4234567890');
  });

  it('calc prints negative results', () => {
    expect(feed('calc', [7, '-'.charCodeAt(0), 10, 0])).toContain('=-3');
    expect(feed('calc', [-7, '*'.charCodeAt(0), 3, 0])).toContain('=-21');
    expect(feed('calc', [-21, '/'.charCodeAt(0), 3, 0])).toContain('=-7');
  });

  it('echo prints the character back', () => {
    expect(feed('echo', ['A'.charCodeAt(0), 0])).toContain('> A');
  });
});

describe('video samples', () => {
  it.skipIf(!fpmul16Supported)('mandelbrot_1616 halts and draws the set', () => {
    const r = assemble(SAMPLE_PROGRAMS.mandelbrot_1616.code);
    const c = runToHalt(r.bytes, 100_000_000);
    expect(c.isHalted()).toBe(true);
    const fault = (c as unknown as { getFault?: () => string | null }).getFault?.() ?? null;
    expect(fault).toBeNull();
    // runToHalt skips vsync, so the picture is in the back buffer. About a quarter of the
    // pixels are inside the set (colour 0); the rest use the rainbow colours 16–255.
    const vram = c.getMemory(0x3C0000, 65536);
    const inside = vram.filter(v => v === 0).length;
    expect(inside).toBeGreaterThan(10000);
    expect(inside).toBeLessThan(25000);
    expect(vram.every(v => v === 0 || (v >= 16 && v <= 255))).toBe(true);
  });

  it('host demos are marked as such', () => {
    for (const key of HOST_DEMOS) {
      expect(SAMPLE_PROGRAMS[key].name).toMatch(/host/i);
      expect(SAMPLE_PROGRAMS[key].code).toMatch(/HOST demo/);
    }
  });

  for (const key of ['mandelbrot', 'mandelbrot_anim', 'fractal_fast']) {
    it.skipIf(ENDLESS.has(key) || INTERACTIVE.has(key))(`${key} draws without faults in its first 2M instructions`, () => {
      const c = new MockComputer();
      c.loadProgram(new Uint8Array(assemble(SAMPLE_PROGRAMS[key].code).bytes));
      c.setSkipVsync(true);
      c.run(2_000_000);
      const fault = (c as unknown as { getFault?: () => string | null }).getFault?.() ?? null;
      expect(fault).toBeNull();
    });
  }
});
