import { describe, it, expect } from 'vitest';
import { UndoHistory } from './undoHistory';
import { RingBuffer } from './ringBuffer';
import { shortcutFor } from './shortcuts';
import { parseConsoleInput } from './consoleInput';
import { loadEdits, saveEdits, clearEdits } from './editorStorage';
import { parseCellValue, parseGotoAddress } from '../components/MemoryView';
import { instructionLines } from '../components/CodeEditor';
import { changedRegisters, changedFlags } from '../components/CpuView';
import { activeSignals } from '../components/SignalTrace';
import { syncVideoMemory } from '../components/VideoView';
import { statusFor } from '../components/App';
import { assemble } from '../assembler';
import { MockComputer, CpuState } from '../wasm-bridge';

const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}, tagName = 'BODY') => ({
  key: k, ctrlKey: false, metaKey: false, altKey: false, ...mods,
  target: { tagName, isContentEditable: false } as unknown as EventTarget,
});

describe('UndoHistory', () => {
  it('restores each earlier memory image exactly, keeping only one full copy', () => {
    const c = new MockComputer();
    c.loadProgram(new Uint8Array(assemble('DATA R0, 7\nSTORE R0, 0x100\nDATA R0, 9\nSTORE R0, 0x101\nHALT').bytes));
    const h = new UndoHistory(64);
    const images: Uint8Array[] = [];
    for (let i = 0; i < 4; i++) {
      const snap = c.getSnapshot();
      images.push(new Uint8Array(snap.memory));
      h.push(snap);
      c.step();
    }
    expect(c.getMemory(0x100, 2)).toEqual([7, 9]);
    for (let i = 3; i >= 0; i--) {
      const snap = h.pop()!;
      expect(snap).not.toBeNull();
      expect(Buffer.compare(Buffer.from(snap.memory), Buffer.from(images[i]))).toBe(0);
      c.restoreSnapshot(snap);
    }
    expect(h.pop()).toBeNull();
    expect(c.getMemory(0x100, 2)).toEqual([0, 0]);
    expect(c.getPc()).toBe(0);
  });

  it('drops the oldest entries beyond its capacity', () => {
    const c = new MockComputer();
    const h = new UndoHistory(3);
    for (let i = 0; i < 5; i++) { c.poke(i, i + 1); h.push(c.getSnapshot()); }
    expect(h.size).toBe(3);
    expect(Array.from(h.pop()!.memory.subarray(0, 5))).toEqual([1, 2, 3, 4, 5]);
    expect(Array.from(h.pop()!.memory.subarray(0, 5))).toEqual([1, 2, 3, 4, 0]);
    expect(Array.from(h.pop()!.memory.subarray(0, 5))).toEqual([1, 2, 3, 0, 0]);
    expect(h.size).toBe(0);
  });
});

describe('RingBuffer', () => {
  it('keeps the newest items in order', () => {
    const r = new RingBuffer<number>(3);
    [1, 2, 3, 4, 5].forEach(n => r.push(n));
    expect(r.toArray()).toEqual([3, 4, 5]);
    expect(r.pop()).toBe(5);
    expect(r.toArray()).toEqual([3, 4]);
    r.push(6);
    expect(r.toArray()).toEqual([3, 4, 6]);
  });
});

describe('shortcuts', () => {
  it('maps single keys', () => {
    expect(shortcutFor(key('s'))).toBe('step');
    expect(shortcutFor(key('R'))).toBe('run');
    expect(shortcutFor(key('Escape'))).toBe('pause');
    expect(shortcutFor(key('?'))).toBe('help');
  });
  it('ignores keys with Ctrl, Cmd or Alt, and keys typed into fields', () => {
    expect(shortcutFor(key('r', { ctrlKey: true }))).toBeNull();
    expect(shortcutFor(key('s', { metaKey: true }))).toBeNull();
    expect(shortcutFor(key('b', { altKey: true }))).toBeNull();
    expect(shortcutFor(key('s', {}, 'TEXTAREA'))).toBeNull();
    expect(shortcutFor(key('s', {}, 'INPUT'))).toBeNull();
  });
});

describe('console input', () => {
  it('accepts negative and full 32-bit numbers', () => {
    expect(parseConsoleInput('-1', 'number')).toEqual({ ok: true, value: 0xFFFFFFFF });
    expect(parseConsoleInput('4294967295', 'number')).toEqual({ ok: true, value: 4294967295 });
    expect(parseConsoleInput('0x2A', 'number')).toEqual({ ok: true, value: 42 });
    expect(parseConsoleInput('0b101', 'number')).toEqual({ ok: true, value: 5 });
    expect(parseConsoleInput("'A'", 'number')).toEqual({ ok: true, value: 65 });
    expect(parseConsoleInput('-2147483648', 'number')).toEqual({ ok: true, value: 0x80000000 });
  });
  it('rejects bad input with a message', () => {
    for (const t of ['12abc', '', '4294967296', '-2147483649', '0x1G']) {
      const r = parseConsoleInput(t, 'number');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(5);
    }
  });
  it('character mode takes exactly one character', () => {
    expect(parseConsoleInput('a', 'char')).toEqual({ ok: true, value: 97 });
    expect(parseConsoleInput(' ', 'char')).toEqual({ ok: true, value: 32 });
    expect(parseConsoleInput('ab', 'char').ok).toBe(false);
    expect(parseConsoleInput('', 'char').ok).toBe(false);
  });
});

describe('memory editor', () => {
  it('parses cell values as hex by default', () => {
    expect(parseCellValue('10')).toBe(0x10);
    expect(parseCellValue('ff')).toBe(255);
    expect(parseCellValue('0x7F')).toBe(127);
    expect(parseCellValue('#65')).toBe(65);
    expect(parseCellValue("'A'")).toBe(65);
    expect(parseCellValue('100')).toBeNull();
    expect(parseCellValue('#256')).toBeNull();
  });
  it('goes to a hex address or a label', () => {
    const labels = new Map([['main', 0x40]]);
    expect(parseGotoAddress('3C0000', labels)).toBe(0x3C0000);
    expect(parseGotoAddress('0x100', labels)).toBe(0x100);
    expect(parseGotoAddress('MAIN', labels)).toBe(0x40);
    expect(parseGotoAddress('nope', labels)).toBeNull();
    expect(parseGotoAddress('400000', labels)).toBeNull();
  });
});

describe('editor line map', () => {
  it('maps instruction addresses to 0-based lines from the assembler result', () => {
    const r = assemble('; comment\nloop:\n  DATA R0, 1\n  JMP loop\n; end');
    const m = instructionLines(r);
    expect(m.get(0)).toBe(2);
    expect(m.get(6)).toBe(3);
    expect([...m.keys()].every(a => a < r.size)).toBe(true);
  });
  it('is empty for a failed assembly', () => {
    expect(instructionLines(assemble('BOGUS R0')).size).toBe(0);
  });
});

describe('changed registers and flags', () => {
  const st = (r0: number, carry = false): CpuState => ({
    r: [r0, ...new Array(15).fill(0)], acc: 0, tmp: 0, iar: 0, ir: 0, sp: 0, bus: 0, halted: false, cycle_count: 0,
    flags: { carry, zero: false, a_larger: false, equal: false },
  });
  it('lists only what differs', () => {
    expect([...changedRegisters(st(1), st(2))]).toEqual([0]);
    expect(changedRegisters(st(1), st(1)).size).toBe(0);
    expect(changedRegisters(null, st(1)).size).toBe(0);
    expect([...changedFlags(st(0), st(0, true))]).toEqual(['carry']);
  });
  it('signal trace scales each register on its own and skips constant ones', () => {
    const hist = [0, 1, 2].map(i => ({ ...st(i * 1000000), r: [i * 1000000, i, 5, ...new Array(13).fill(0)] }));
    const sig = activeSignals(hist);
    expect(sig.map(s => s.label)).toEqual(['R0', 'R1']);
    expect(sig[1].max).toBe(2);
  });
});

describe('video change detection', () => {
  it('reports a change only when VRAM or the palette differ', () => {
    const mem = new Uint8Array(4_194_304);
    const shown = new Uint8Array(65536 + 1024);
    expect(syncVideoMemory(mem, shown)).toBe(false);
    mem[0x3D0010] = 5;
    expect(syncVideoMemory(mem, shown)).toBe(true);
    expect(syncVideoMemory(mem, shown)).toBe(false);
    mem[0x3E0004] = 9;
    expect(syncVideoMemory(mem, shown)).toBe(true);
    mem[0x3C0000] = 1; // back buffer: not shown
    expect(syncVideoMemory(mem, shown)).toBe(false);
  });
});

describe('status text', () => {
  const base = { isRunning: false, fault: null, stopReason: null, waitingForInput: null, state: null } as const;
  it('names faults, input waits, breakpoints and halts', () => {
    expect(statusFor({ ...base, fault: 'Illegal opcode 0x2D at 0x000140' }).text).toBe('Fault: Illegal opcode 0x2D at 0x000140');
    expect(statusFor({ ...base, waitingForInput: { register: 3 } }).text).toBe('Waiting for input (R3)');
    expect(statusFor({ ...base, state: { iar: 0x14, halted: false } as CpuState, stopReason: { kind: 'breakpoint', address: 0x14 } }).text)
      .toBe('Stopped at breakpoint 0x000014');
    expect(statusFor({ ...base, state: { iar: 0, halted: true } as CpuState }).text).toBe('Halted');
    expect(statusFor({ ...base, isRunning: true }).text).toBe('Running');
  });
});

describe('editor storage', () => {
  it('works (as a no-op) without localStorage', () => {
    expect(() => saveEdits('add', 'x', 'y')).not.toThrow();
    expect(loadEdits('add')).toBeNull();
    expect(() => clearEdits('add')).not.toThrow();
  });
  it('saves, restores and clears edits when storage exists', () => {
    const store = new Map<string, string>();
    (globalThis as any).window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, v); },
        removeItem: (k: string) => { store.delete(k); },
      },
    };
    try {
      saveEdits('add', 'edited', 'original');
      expect(loadEdits('add')).toBe('edited');
      saveEdits('add', 'original', 'original');
      expect(loadEdits('add')).toBeNull();
      (globalThis as any).window.localStorage.setItem = () => { throw new Error('QuotaExceeded'); };
      expect(() => saveEdits('add', 'big', 'original')).not.toThrow();
    } finally {
      delete (globalThis as any).window;
    }
  });
});
