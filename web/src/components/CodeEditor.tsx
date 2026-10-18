import React, { useRef, useCallback, useMemo, useState, useEffect } from 'react';
import type { AssemblyResult } from '../assembler';
import { OP, getOpcodeName, instrSize } from '../wasm-bridge';

interface Props {
  code: string;
  onChange: (code: string) => void;
  /** Assemble the editor text and load it into RAM. */
  onAssemble: () => AssemblyResult;
  /** Assembly of the program that is in RAM (drives PC highlight and breakpoints). */
  loadedResult: AssemblyResult | null;
  /** Result of the last Assemble press, cleared on the next edit. */
  lastAssembly: AssemblyResult | null;
  /** Is the editor text the program in RAM? */
  status: 'loaded' | 'modified' | 'not-loaded';
  currentAddress: number;
  breakpoints: Set<number>;
  onToggleBreakpoint: (addr: number) => void;
  sampleName: string;
  canRevert: boolean;
  onRevert: () => void;
}

const FONT_FAMILY = "'Cascadia Code', 'Fira Code', 'Consolas', monospace";
const FONT_SIZE = '0.78rem';
const LINE_HEIGHT = 20;
const PADDING_TOP = 10;
const PADDING_BOTTOM = 10;
const TAB_STOP = 8;

// FPMUL16 (16.16 fixed point) is new in the shared engine contract.
const OP_FPMUL16: number = (OP as Record<string, number>).FPMUL16 ?? 0x2C;
const opName = (opcode: number) => {
  const n = getOpcodeName(opcode);
  return n === '???' && opcode === OP_FPMUL16 ? 'FPMUL16' : n;
};

const EDITOR_STYLES = `
  @keyframes highlightPulse {
    0%, 100% { background: rgba(250, 204, 21, 0.08); border-color: rgba(250, 204, 21, 0.25); }
    50% { background: rgba(250, 204, 21, 0.15); border-color: rgba(250, 204, 21, 0.45); }
  }
  @keyframes errorPulse {
    0%, 100% { background: rgba(239, 68, 68, 0.06); border-color: rgba(239, 68, 68, 0.2); }
    50% { background: rgba(239, 68, 68, 0.12); border-color: rgba(239, 68, 68, 0.4); }
  }
  @keyframes successFlash {
    0% { background: rgba(74, 222, 128, 0.3); } 100% { background: transparent; }
  }
  .gutter-line:hover .bp-dot-area {
    border-color: rgba(239, 68, 68, 0.4) !important;
    background: rgba(239, 68, 68, 0.15) !important;
  }
`;

/**
 * 0-based editor line for each instruction address, from the assembler's own
 * map (which numbers lines from 1). Only addresses inside the program count.
 */
export function instructionLines(result: AssemblyResult | null): Map<number, number> {
  const map = new Map<number, number>();
  if (!result?.success) return map;
  const size = result.size ?? result.bytes.length;
  result.addressToLine?.forEach((line, addr) => {
    if (addr < size && line > 0) map.set(addr, line - 1);
  });
  return map;
}

// ── Disassembly View ────────────────────────────────────────────────────

function disassemble(bytes: number[], labels: Map<string, number>): Array<{
  addr: number; hex: string; decoded: string; size: number; label?: string;
}> {
  const addrToLabel = new Map<number, string>();
  labels.forEach((addr, name) => addrToLabel.set(addr, name));

  const result: Array<{ addr: number; hex: string; decoded: string; size: number; label?: string }> = [];
  let i = 0;

  while (i < bytes.length) {
    const addr = i;
    const opcode = bytes[i];
    const label = addrToLabel.get(addr);
    const size = instrSize(opcode);
    const name = opName(opcode);

    if (i + size > bytes.length) break;

    const hexBytes = bytes.slice(i, i + size).map(b => h2(b)).join(' ');
    const regByte = bytes[i + 1] ?? 0;
    const rA = (regByte >> 4) & 0x0F;
    const rB = regByte & 0x0F;

    let decoded = '';

    if (opcode === OP.HALT) {
      decoded = 'HALT';
    } else if (opcode === OP.RET) {
      decoded = 'RET';
    } else if (opcode === OP.DATA) {
      const val = (bytes[i + 2] | (bytes[i + 3] << 8) | (bytes[i + 4] << 16) | (bytes[i + 5] << 24)) >>> 0;
      decoded = `DATA R${rA}, ${val}`;
    } else if (opcode === OP.LOAD || opcode === OP.STORE || opcode === OP.LOAD32 || opcode === OP.STORE32) {
      const memAddr = bytes[i + 2] | (bytes[i + 3] << 8) | (bytes[i + 4] << 16);
      const targetLabel = addrToLabel.get(memAddr);
      decoded = `${name} R${rA}, [${targetLabel ?? ('0x' + h6(memAddr))}]`;
    } else if (opcode === OP.JMP || opcode === OP.JC || opcode === OP.JA || opcode === OP.JE
            || opcode === OP.JZ || opcode === OP.JNZ || opcode === OP.CALL) {
      const target = bytes[i + 1] | (bytes[i + 2] << 8) | (bytes[i + 3] << 16);
      const targetLabel = addrToLabel.get(target);
      decoded = `${name} ${targetLabel ?? ('0x' + h6(target))}`;
    } else if (opcode === OP.PUSH || opcode === OP.POP || opcode === OP.OUT || opcode === OP.IN || opcode === OP.JMPR) {
      decoded = `${name} R${rA}`;
    } else if ((opcode >= OP.ADD && opcode <= OP.SHR8) || opcode === OP.SHL8
            || opcode === OP.SHRN || opcode === OP.SHLN
            || opcode === OP.IDIV || opcode === OP.IMOD
            || opcode === OP.FPMUL || opcode === OP_FPMUL16
            || opcode === OP.LDRI || opcode === OP.STRI
            || opcode === OP.LDRI32 || opcode === OP.STRI32) {
      if (opcode === OP.NOT || opcode === OP.SHR || opcode === OP.SHL
          || opcode === OP.SHR8 || opcode === OP.SHL8) {
        decoded = `${name} R${rA}`;
      } else {
        decoded = `${name} R${rA}, R${rB}`;
      }
    } else {
      decoded = `??? (0x${h2(opcode)})`;
    }

    result.push({ addr, hex: hexBytes, decoded, size, label });
    i += size;
  }
  return result;
}

function h2(n: number) { return (n & 0xFF).toString(16).padStart(2, '0').toUpperCase(); }
function h6(n: number) { return (n >>> 0).toString(16).padStart(6, '0').toUpperCase(); }

function DisassemblyView({ bytes, labels, currentAddress }: {
  bytes: number[];
  labels: Map<string, number>;
  currentAddress: number;
}) {
  const listing = useMemo(() => disassemble(bytes, labels), [bytes, labels]);

  return (
    <div style={{ fontFamily: FONT_FAMILY, fontSize: '0.6875rem' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '56px 120px 1fr',
        gap: '8px', padding: '2px 0', marginBottom: '4px',
        borderBottom: '1px solid #1e293b', color: 'var(--text-muted)', fontWeight: 600,
      }}>
        <span>Addr</span>
        <span>Hex</span>
        <span>Instruction</span>
      </div>

      {listing.map((entry, i) => {
        const isPC = entry.addr === currentAddress;
        return (
          <div key={i}>
            {entry.label && (
              <div style={{ color: '#c084fc', fontWeight: 600, padding: '2px 0 0 0' }}>
                {entry.label}:
              </div>
            )}
            <div style={{
              display: 'grid', gridTemplateColumns: '56px 120px 1fr',
              gap: '8px', padding: '1px 4px',
              borderRadius: isPC ? '4px' : '0',
              background: isPC ? 'rgba(250, 204, 21, 0.1)' : 'transparent',
              borderLeft: isPC ? '2px solid #fcd34d' : '2px solid transparent',
            }}>
              <span style={{ color: isPC ? '#fcd34d' : 'var(--text-dim)' }}>{h6(entry.addr)}</span>
              <span style={{ color: isPC ? '#e2e8f0' : 'var(--text-muted)' }}>{entry.hex}</span>
              <span style={{ color: isPC ? '#fcd34d' : 'var(--text-secondary)' }}>{entry.decoded}</span>
            </div>
          </div>
        );
      })}

      <div style={{
        marginTop: '6px', paddingTop: '6px', borderTop: '1px solid #1e293b',
        color: 'var(--text-dim)', wordBreak: 'break-all',
      }}>
        {bytes.map(b => h2(b)).join(' ')}
      </div>
    </div>
  );
}

/** Insert spaces up to the next tab stop at the caret (keeps native undo where possible). */
function insertTab(ta: HTMLTextAreaElement, onChange: (s: string) => void) {
  const { selectionStart: start, selectionEnd: end, value } = ta;
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const col = start - lineStart;
  const spaces = ' '.repeat(TAB_STOP - (col % TAB_STOP));
  ta.focus();
  // execCommand keeps the browser's undo stack and fires the input event React listens to.
  const ok = typeof document.execCommand === 'function' && document.execCommand('insertText', false, spaces);
  if (!ok) {
    const next = value.slice(0, start) + spaces + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + spaces.length; });
  }
}

export default function CodeEditor({
  code, onChange, onAssemble, loadedResult, lastAssembly, status,
  currentAddress, breakpoints, onToggleBreakpoint, sampleName, canRevert, onRevert,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showBytes, setShowBytes] = useState(true);
  const [scrollTop, setScrollTop] = useState(0);
  const [editorFlex, setEditorFlex] = useState(3);
  const dragRef = useRef<{ startY: number; startFlex: number } | null>(null);
  const successTimer = useRef<number | undefined>(undefined);

  const isLoaded = status === 'loaded';
  // The PC highlight and breakpoints describe the program in RAM; they only
  // line up with the editor while the editor holds exactly that program.
  const addrToLine = useMemo(
    () => (isLoaded ? instructionLines(loadedResult) : new Map<number, number>()),
    [loadedResult, isLoaded],
  );
  const lineToAddr = useMemo(() => {
    const m = new Map<number, number>();
    addrToLine.forEach((line, addr) => m.set(line, addr));
    return m;
  }, [addrToLine]);
  const activeLine = addrToLine.get(currentAddress) ?? -1;
  const lines = code.split('\n');

  const breakpointLines = useMemo(() => {
    const s = new Set<number>();
    breakpoints.forEach(addr => {
      const line = addrToLine.get(addr);
      if (line !== undefined) s.add(line);
    });
    return s;
  }, [breakpoints, addrToLine]);

  // Auto-scroll to keep active line visible
  useEffect(() => {
    if (activeLine >= 0 && textareaRef.current) {
      const lineTop = PADDING_TOP + activeLine * LINE_HEIGHT;
      const ta = textareaRef.current;
      const viewTop = ta.scrollTop;
      const viewBottom = viewTop + ta.clientHeight;
      if (lineTop < viewTop + LINE_HEIGHT || lineTop > viewBottom - LINE_HEIGHT * 2) {
        const target = Math.max(0, lineTop - ta.clientHeight / 3);
        ta.scrollTop = target;
        setScrollTop(ta.scrollTop);
      }
    }
  }, [activeLine]);

  const failed = lastAssembly && !lastAssembly.success ? lastAssembly : null;
  const errorLines = useMemo(() => {
    const set = new Set<number>();
    failed?.errors?.forEach(e => { if (e.line > 0) set.add(e.line - 1); });
    return set;
  }, [failed]);

  const handleScroll = useCallback(() => {
    setScrollTop(textareaRef.current?.scrollTop ?? 0);
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAssemble = useCallback(() => {
    const result = onAssemble();
    if (result.success) {
      setShowSuccess(true);
      window.clearTimeout(successTimer.current);
      successTimer.current = window.setTimeout(() => setShowSuccess(false), 1200);
    }
  }, [onAssemble]);

  useEffect(() => () => window.clearTimeout(successTimer.current), []);

  const handleSave = useCallback(() => {
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sampleName.replace(/[^\w.-]+/g, '_') || 'program'}.asm`;
    a.click();
    URL.revokeObjectURL(url);
  }, [code, sampleName]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result as string);
    reader.readAsText(file);
    e.target.value = ''; // so the same file can be opened again
  }, [onChange]);

  const smallBtn: React.CSSProperties = {
    background: 'transparent', color: 'var(--text-muted)',
    border: '1px solid var(--border-default)', borderRadius: '6px',
    padding: '3px 8px', fontSize: '0.6875rem', fontWeight: 600, cursor: 'pointer',
  };

  return (
    <div style={{ flex: 1, padding: '10px 12px', display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
      <style>{EDITOR_STYLES}</style>

      {/* Header */}
      <div style={{
        fontSize: '0.6875rem', fontWeight: 700,
        marginBottom: '6px', flexShrink: 0,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <h2 style={{
            fontSize: '0.6875rem', fontWeight: 700, color: 'var(--text-muted)', margin: 0,
            textTransform: 'uppercase', letterSpacing: '1px',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <div style={{ width: 3, height: 12, borderRadius: 2, background: 'var(--accent-green)' }} />
            Assembly
          </h2>
          <button
            onClick={handleAssemble}
            style={{
              background: '#16a34a', color: '#fff', border: '1px solid #22c55e',
              borderRadius: '6px', padding: '3px 12px', fontSize: '0.6875rem', fontWeight: 700,
              cursor: 'pointer', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#15803d'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#16a34a'; }}
            title="Assemble the code and load it into RAM (Ctrl+Enter)"
          >
            ▶ Assemble
          </button>
          <button onClick={handleSave} style={smallBtn} title="Save as .asm file" aria-label="Save as .asm file">💾</button>
          <button onClick={() => fileInputRef.current?.click()} style={smallBtn} title="Open .asm file" aria-label="Open .asm file">📂</button>
          {canRevert && (
            <button onClick={onRevert} style={smallBtn} title={`Throw away your edits and restore the original ${sampleName} program`}>
              ↶ Revert to original
            </button>
          )}
          <input ref={fileInputRef} type="file" accept=".asm,.txt,.s" onChange={handleFileChange} style={{ display: 'none' }} aria-hidden="true" tabIndex={-1} />

          {failed ? (
            <span style={{ fontSize: '0.6875rem', color: '#f87171', fontWeight: 600 }}>
              ✗ {failed.errors.length} error{failed.errors.length === 1 ? '' : 's'} — RAM still holds the previous program
            </span>
          ) : status === 'modified' ? (
            <span role="status" style={badge('var(--accent-amber)')}
              title="The editor no longer matches the program in RAM. Step and Run use the program in RAM.">
              ● modified — Ctrl+Enter to assemble
            </span>
          ) : status === 'not-loaded' ? (
            <span role="status" style={badge('var(--accent-amber)')} title="RAM holds no assembled program">
              ● not loaded — Ctrl+Enter to assemble
            </span>
          ) : loadedResult && (
            <span style={{
              fontSize: '0.6875rem', color: '#4ade80', fontWeight: 600,
              ...(showSuccess ? { animation: 'successFlash 1.2s ease-out' } : {}),
            }} title="The editor matches the program in RAM">
              ✓ loaded · {loadedResult.size ?? loadedResult.bytes.length} B
            </span>
          )}
        </div>
        <span style={{ fontSize: '0.6875rem', color: 'var(--text-secondary)', fontWeight: 400, fontFamily: FONT_FAMILY, whiteSpace: 'nowrap' }}>
          PC:{h6(currentAddress)}
          {activeLine >= 0 && <span style={{ color: 'var(--accent-amber)' }}> L{activeLine + 1}</span>}
        </span>
      </div>

      {/* Editor area — resizable */}
      <div style={{
        flex: `${editorFlex} 1 0`, minHeight: '80px', background: 'var(--bg-elevated)',
        borderRadius: '6px', border: `1px solid ${status === 'loaded' ? 'var(--border-subtle)' : 'var(--accent-amber-dim)'}`,
        overflow: 'hidden', display: 'flex',
      }}>
        {/* Line-number gutter; click to toggle breakpoints. It moves with the
            textarea through a transform, so it can't drift at the bottom. */}
        <div
          aria-hidden="true"
          style={{
            background: '#0c1222', borderRight: '1px solid #1e293b',
            fontFamily: FONT_FAMILY, fontSize: FONT_SIZE, lineHeight: `${LINE_HEIGHT}px`,
            userSelect: 'none' as const, overflow: 'hidden', flexShrink: 0,
            minWidth: '52px', position: 'relative',
          }}
        >
          <div style={{ paddingTop: PADDING_TOP, paddingBottom: PADDING_BOTTOM, transform: `translateY(-${scrollTop}px)` }}>
            {lines.map((_, i) => {
              const hasBreakpoint = breakpointLines.has(i);
              const isActive = i === activeLine;
              const isError = errorLines.has(i);
              const addr = lineToAddr.get(i);
              const hasAddr = addr !== undefined;
              return (
                <div key={i} className="gutter-line" style={{
                  height: `${LINE_HEIGHT}px`, display: 'flex', alignItems: 'center',
                  paddingLeft: '4px', paddingRight: '6px', gap: '4px',
                  cursor: hasAddr ? 'pointer' : 'default',
                }}
                onClick={() => { if (hasAddr) onToggleBreakpoint(addr!); }}
                title={hasAddr
                  ? `Click to ${hasBreakpoint ? 'remove' : 'set'} breakpoint at 0x${h6(addr!)}`
                  : status !== 'loaded' ? 'Assemble (Ctrl+Enter) to set breakpoints' : undefined}
                >
                  <span className={hasAddr && !hasBreakpoint ? 'bp-dot-area' : undefined} style={{
                    width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    background: hasBreakpoint ? '#ef4444' : 'transparent',
                    border: hasBreakpoint ? '1px solid #f87171' : (hasAddr ? '1px solid transparent' : 'none'),
                    boxShadow: hasBreakpoint ? '0 0 4px rgba(239,68,68,0.5)' : 'none',
                    transition: 'all 0.15s',
                  }} />
                  <span style={{
                    flex: 1, textAlign: 'right',
                    color: isError ? '#f87171' : isActive ? '#fcd34d' : hasBreakpoint ? '#fca5a5' : 'var(--text-dim)',
                    fontWeight: (isActive || isError) ? 700 : 400,
                    fontSize: '0.72rem',
                  }}>
                    {i + 1}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Code area with highlight overlay */}
        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
            <div style={{
              paddingTop: `${PADDING_TOP}px`, paddingLeft: '4px', paddingRight: '4px',
              transform: `translateY(-${scrollTop}px)`,
            }}>
              {lines.map((_, i) => {
                const isActive = i === activeLine;
                const isError = errorLines.has(i);
                const isBp = breakpointLines.has(i);
                return (
                  <div key={i} style={{
                    height: `${LINE_HEIGHT}px`,
                    borderRadius: (isActive || isError || isBp) ? '6px' : '0',
                    border: isError
                      ? '1px solid rgba(239, 68, 68, 0.3)'
                      : isActive
                      ? '1px solid rgba(250, 204, 21, 0.3)'
                      : isBp
                      ? '1px solid rgba(239, 68, 68, 0.15)'
                      : '1px solid transparent',
                    background: isBp && !isActive ? 'rgba(239, 68, 68, 0.06)' : undefined,
                    marginLeft: '2px', marginRight: '2px', boxSizing: 'border-box',
                    ...(isError
                      ? { animation: 'errorPulse 1.5s ease-in-out infinite' }
                      : isActive
                      ? { animation: 'highlightPulse 1.5s ease-in-out infinite' }
                      : {}),
                  }} />
                );
              })}
            </div>
          </div>

          <textarea
            ref={textareaRef}
            value={code}
            aria-label="Assembly source"
            onChange={e => onChange(e.target.value)}
            onScroll={handleScroll}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleAssemble();
              } else if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
                // Tab indents; Shift+Tab still moves focus out of the editor.
                e.preventDefault();
                insertTab(e.currentTarget, onChange);
              }
            }}
            spellCheck={false}
            style={{
              position: 'relative', width: '100%', height: '100%',
              paddingTop: `${PADDING_TOP}px`, paddingLeft: '10px', paddingRight: '10px',
              paddingBottom: `${PADDING_BOTTOM}px`,
              background: 'transparent', color: '#e2e8f0', border: 'none',
              fontFamily: FONT_FAMILY, fontSize: FONT_SIZE, lineHeight: `${LINE_HEIGHT}px`,
              resize: 'none', outline: 'none', whiteSpace: 'pre', margin: 0,
              boxSizing: 'border-box', zIndex: 1, tabSize: TAB_STOP,
            }}
          />
        </div>
      </div>

      {/* Drag handle to resize editor vs output */}
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize editor"
        style={{
          height: 6, cursor: 'row-resize', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '1px 0',
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          dragRef.current = { startY: e.clientY, startFlex: editorFlex };
          const onMove = (ev: MouseEvent) => {
            if (!dragRef.current) return;
            const delta = ev.clientY - dragRef.current.startY;
            setEditorFlex(Math.max(1, Math.min(8, dragRef.current.startFlex + delta / 60)));
          };
          const onUp = () => {
            dragRef.current = null;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
          };
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        }}
      >
        <div style={{ width: 40, height: 3, borderRadius: 2, background: 'var(--border-default)' }} />
      </div>

      {/* Error panel */}
      {failed && (
        <div role="alert" style={{
          marginTop: '6px', padding: '8px', background: '#1c1017',
          borderRadius: '6px', border: '1px solid #7f1d1d',
          maxHeight: '96px', overflow: 'auto', flexShrink: 0, userSelect: 'text',
        }}>
          {failed.errors.map((err, i) => (
            <div key={i} style={{
              fontSize: '0.6875rem', color: '#fca5a5', fontFamily: FONT_FAMILY,
              padding: '2px 0', display: 'flex', gap: '8px',
            }}>
              {err.line > 0 && (
                <span style={{ color: '#f87171', fontWeight: 700, flexShrink: 0 }}>Line {err.line}:</span>
              )}
              <span>{err.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* The program in RAM */}
      {loadedResult && loadedResult.success && (
        <div style={{ flex: 1, minHeight: '60px', overflow: 'auto', display: 'flex', flexDirection: 'column' as const }}>
          <button
            onClick={() => setShowBytes(!showBytes)}
            aria-expanded={showBytes}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px', textAlign: 'left',
              padding: '4px 8px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)',
              cursor: 'pointer', userSelect: 'none' as const, border: '1px solid var(--border-subtle)',
            }}
          >
            <span aria-hidden="true" style={{ fontSize: '0.6875rem', color: 'var(--text-dim)', transition: 'transform 0.2s',
              transform: showBytes ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
            <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Program in RAM
            </span>
            <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
              {loadedResult.size ?? loadedResult.bytes?.length ?? 0} B
              {(loadedResult.labels?.size ?? 0) > 0 && ` · ${loadedResult.labels.size} labels`}
              {status === 'modified' && ' · differs from the editor'}
            </span>
          </button>

          {showBytes && (
            <div style={{
              marginTop: '3px', padding: '6px', background: 'var(--bg-base)',
              borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)',
              flex: 1, overflow: 'auto',
            }}>
              {(loadedResult.labels?.size ?? 0) > 0 && (
                <div style={{
                  display: 'flex', flexWrap: 'wrap', gap: '8px',
                  marginBottom: '6px', paddingBottom: '6px', borderBottom: '1px solid #1e293b',
                }}>
                  {Array.from(loadedResult.labels.entries()).map(([name, addr]) => (
                    <span key={name} style={{
                      fontSize: '0.6875rem', fontFamily: FONT_FAMILY,
                      padding: '1px 6px', background: '#1e293b', borderRadius: '3px',
                    }}>
                      <span style={{ color: '#c084fc' }}>{name}</span>
                      <span style={{ color: 'var(--text-dim)' }}> = </span>
                      <span style={{ color: 'var(--text-secondary)' }}>0x{h6(addr)} ({addr})</span>
                    </span>
                  ))}
                </div>
              )}
              <DisassemblyView bytes={loadedResult.bytes ?? []} labels={loadedResult.labels ?? new Map()} currentAddress={currentAddress} />
            </div>
          )}
        </div>
      )}

      {/* Instruction reference (press ? for the full list) */}
      <div style={{
        marginTop: '4px', padding: '6px 8px', background: 'var(--bg-elevated)',
        borderRadius: 'var(--radius-sm)', fontSize: '0.6875rem',
        color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
        display: 'flex', flexWrap: 'wrap' as const, gap: '4px', flexShrink: 0,
        border: '1px solid var(--border-subtle)',
      }}>
        {[
          'ADD r,r', 'SUB r,r', 'MUL r,r', 'DIV r,r', 'CMP r,r', 'MOV r,r', 'AND r,r', 'OR r,r', 'XOR r,r',
          'NOT r', 'SHL r', 'SHR r', 'DATA r,val', 'LOAD r,addr', 'STORE r,addr', 'LDRI r,r', 'STRI r,r',
          'PUSH r', 'POP r', 'JMP lbl', 'JE/JA/JC/JZ/JNZ lbl', 'CALL lbl', 'RET', 'OUT r', 'IN r', 'HALT', '? = all',
        ].map(instr => (
          <span key={instr} style={{
            padding: '1px 5px', background: 'var(--bg-hover)', borderRadius: 3,
            border: '1px solid var(--border-subtle)',
          }}>
            {instr}
          </span>
        ))}
      </div>
    </div>
  );
}

function badge(color: string): React.CSSProperties {
  return {
    fontSize: '0.6875rem', fontWeight: 700, color,
    padding: '1px 6px', borderRadius: 3,
    border: `1px solid color-mix(in srgb, ${color} 45%, transparent)`,
    background: `color-mix(in srgb, ${color} 10%, transparent)`,
  };
}
