import React, { useRef, useCallback, useMemo, useState, useEffect } from 'react';
import { assemble, AssemblyError, AssemblyResult } from '../assembler';

interface Props {
  code: string;
  onChange: (code: string) => void;
  currentAddress: number;
  onLoadBytes: (bytes: number[]) => void;
  breakpoints: Set<number>;
  onToggleBreakpoint: (addr: number) => void;
}

const FONT_FAMILY = "'Cascadia Code', 'Fira Code', 'Consolas', monospace";
const FONT_SIZE = '0.78rem';
const LINE_HEIGHT = 20;
const PADDING_TOP = 10;

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

// Instruction mnemonics for address mapping (same logic as assembler pass 1)
const TWO_BYTE_OPS = ['DATA', 'LOAD', 'STORE', 'JMP', 'JC', 'JA', 'JE'];

function buildAddressToLineMap(code: string): Map<number, number> {
  const map = new Map<number, number>();
  const lines = code.split('\n');
  let addr = 0;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const ci = line.indexOf(';');
    if (ci >= 0) line = line.substring(0, ci);
    line = line.trim();
    if (!line) continue;
    // Strip label
    const lm = line.match(/^[a-zA-Z_]\w*\s*:\s*(.*)/);
    const rest = lm ? lm[1].trim() : line;
    if (!rest) continue;
    const mnemonic = rest.split(/[\s,]+/)[0].toUpperCase();
    map.set(addr, i);
    if (mnemonic === 'HALT') addr += 1;
    else if (TWO_BYTE_OPS.includes(mnemonic)) addr += 2;
    else addr += 1;
  }
  return map;
}

// ── Disassembly View ────────────────────────────────────────────────────

const OPCODE_NAMES: Record<number, string> = {
  0x0: 'ADD', 0x1: 'SHR', 0x2: 'SHL', 0x3: 'NOT',
  0x4: 'AND', 0x5: 'OR',  0x6: 'XOR', 0x7: 'CMP',
  0x8: 'LOAD', 0x9: 'STORE', 0xA: 'DATA', 0xB: 'JMPR',
  0xC: 'JMP', 0xD: 'JC', 0xE: 'JA', 0xF: 'JE',
};

function disassemble(bytes: number[], labels: Map<string, number>): Array<{
  addr: number; hex: string; decoded: string; size: number; label?: string;
}> {
  // Reverse label map: addr → name
  const addrToLabel = new Map<number, string>();
  labels.forEach((addr, name) => addrToLabel.set(addr, name));

  const result: Array<{ addr: number; hex: string; decoded: string; size: number; label?: string }> = [];
  let i = 0;

  while (i < bytes.length) {
    const addr = i;
    const b = bytes[i];
    const label = addrToLabel.get(addr);

    if (b === 0x00) {
      result.push({ addr, hex: '00', decoded: 'HALT', size: 1, label });
      i += 1;
      continue;
    }

    const op = (b >> 4) & 0xF;
    const rA = (b >> 2) & 0x3;
    const rB = b & 0x3;
    const name = OPCODE_NAMES[op] ?? '???';

    if (op <= 0x7) {
      // ALU: 1 byte
      if (op === 0x3) { // NOT
        result.push({ addr, hex: h2(b), decoded: `${name} R${rA}`, size: 1, label });
      } else {
        result.push({ addr, hex: h2(b), decoded: `${name} R${rA}, R${rB}`, size: 1, label });
      }
      i += 1;
    } else if (op === 0xB) {
      // JMPR or OUT: 1 byte, distinguished by regB
      if (rB === 1) {
        result.push({ addr, hex: h2(b), decoded: `OUT R${rA}`, size: 1, label });
      } else if (rB === 2) {
        result.push({ addr, hex: h2(b), decoded: `IN R${rA}`, size: 1, label });
      } else {
        result.push({ addr, hex: h2(b), decoded: `JMPR R${rA}`, size: 1, label });
      }
      i += 1;
    } else {
      // 2-byte instructions
      const operand = i + 1 < bytes.length ? bytes[i + 1] : 0;
      const hexStr = h2(b) + ' ' + h2(operand);
      const targetLabel = addrToLabel.get(operand);

      if (op === 0xA) {
        // DATA
        const ascii = (operand >= 32 && operand < 127) ? ` '${String.fromCharCode(operand)}'` : '';
        result.push({ addr, hex: hexStr, decoded: `DATA R${rA}, ${operand}${ascii}`, size: 2, label });
      } else if (op === 0x8) {
        result.push({ addr, hex: hexStr, decoded: `LOAD R${rA}, [${operand}]`, size: 2, label });
      } else if (op === 0x9) {
        result.push({ addr, hex: hexStr, decoded: `STORE R${rA}, [${operand}]`, size: 2, label });
      } else {
        // JMP, JC, JA, JE
        const target = targetLabel ? targetLabel : operand.toString();
        result.push({ addr, hex: hexStr, decoded: `${name} ${target}`, size: 2, label });
      }
      i += 2;
    }
  }
  return result;
}

function h2(n: number) { return n.toString(16).padStart(2, '0').toUpperCase(); }

function DisassemblyView({ bytes, addressToLine, labels, currentAddress }: {
  bytes: number[];
  addressToLine: Map<number, number>;
  labels: Map<string, number>;
  currentAddress: number;
}) {
  const listing = useMemo(() => disassemble(bytes, labels), [bytes, labels]);

  return (
    <div style={{ fontFamily: FONT_FAMILY, fontSize: '0.68rem' }}>
      {/* Header */}
      <div style={{
        display: 'grid', gridTemplateColumns: '48px 54px 1fr',
        gap: '8px', padding: '2px 0', marginBottom: '4px',
        borderBottom: '1px solid #1e293b', color: '#475569', fontWeight: 600,
      }}>
        <span>Addr</span>
        <span>Hex</span>
        <span>Instruction</span>
      </div>

      {listing.map((entry, i) => {
        const isPC = entry.addr === currentAddress;
        return (
          <div key={i}>
            {/* Label line */}
            {entry.label && (
              <div style={{ color: '#c084fc', fontWeight: 600, padding: '2px 0 0 0' }}>
                {entry.label}:
              </div>
            )}
            {/* Instruction line */}
            <div style={{
              display: 'grid', gridTemplateColumns: '48px 54px 1fr',
              gap: '8px', padding: '1px 4px',
              borderRadius: isPC ? '4px' : '0',
              background: isPC ? 'rgba(250, 204, 21, 0.1)' : 'transparent',
              borderLeft: isPC ? '2px solid #fcd34d' : '2px solid transparent',
            }}>
              <span style={{ color: isPC ? '#fcd34d' : '#475569' }}>
                {h2(entry.addr)}
              </span>
              <span style={{ color: isPC ? '#e2e8f0' : '#64748b' }}>
                {entry.hex}
              </span>
              <span style={{ color: isPC ? '#fcd34d' : '#94a3b8' }}>
                {entry.decoded}
              </span>
            </div>
          </div>
        );
      })}

      {/* Raw hex dump */}
      <div style={{
        marginTop: '6px', paddingTop: '6px', borderTop: '1px solid #1e293b',
        color: '#334155', wordBreak: 'break-all',
      }}>
        {bytes.map(b => h2(b)).join(' ')}
      </div>
    </div>
  );
}

export default function CodeEditor({ code, onChange, currentAddress, onLoadBytes, breakpoints, onToggleBreakpoint }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  const [lastResult, setLastResult] = useState<AssemblyResult | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showBytes, setShowBytes] = useState(true);
  const [scrollTop, setScrollTop] = useState(0);
  const [editorFlex, setEditorFlex] = useState(3); // flex ratio for editor vs output
  const dragRef = useRef<{ startY: number; startFlex: number } | null>(null);

  // Clear assembler state when code changes externally
  const prevCodeRef = useRef(code);
  useEffect(() => {
    if (code !== prevCodeRef.current) {
      prevCodeRef.current = code;
      setLastResult(null);
      setShowSuccess(false);
    }
  }, [code]);

  const addrToLine = useMemo(() => buildAddressToLineMap(code), [code]);
  const lineToAddr = useMemo(() => {
    const m = new Map<number, number>();
    addrToLine.forEach((line, addr) => m.set(line, addr));
    return m;
  }, [addrToLine]);
  const activeLine = addrToLine.get(currentAddress) ?? -1;
  const lines = code.split('\n');

  // Which lines have breakpoints?
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
        if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = target;
        setScrollTop(target);
      }
    }
  }, [activeLine]);

  // Error line numbers (1-indexed from assembler, convert to 0-indexed)
  const errorLines = useMemo(() => {
    const set = new Set<number>();
    lastResult?.errors?.forEach(e => { if (e.line > 0) set.add(e.line - 1); });
    return set;
  }, [lastResult]);

  const handleScroll = useCallback(() => {
    const st = textareaRef.current?.scrollTop ?? 0;
    if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = st;
    setScrollTop(st);
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAssemble = useCallback(() => {
    const result = assemble(code);
    setLastResult(result);
    if (result.success) {
      onLoadBytes(result.bytes);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 1200);
    }
  }, [code, onLoadBytes]);

  const handleSave = useCallback(() => {
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'program.asm';
    a.click();
    URL.revokeObjectURL(url);
  }, [code]);

  const handleLoad = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      onChange(text);
      setLastResult(null);
    };
    reader.readAsText(file);
    // Reset input so same file can be loaded again
    e.target.value = '';
  }, [onChange]);

  return (
    <div style={{ flex: 1, padding: '10px 12px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{EDITOR_STYLES}</style>

      {/* Header with Assemble button */}
      <div style={{
        fontSize: '0.68rem', fontWeight: 700, color: 'var(--accent-green, #22c55e)',
        marginBottom: '6px', flexShrink: 0,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <div style={{
            fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted, #4a5568)',
            textTransform: 'uppercase', letterSpacing: '1px',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <div style={{ width: 3, height: 12, borderRadius: 2, background: 'var(--accent-green, #22c55e)' }} />
            Assembly
          </div>
          <button
            onClick={handleAssemble}
            style={{
              background: '#16a34a',
              color: '#fff',
              border: '1px solid #22c55e',
              borderRadius: '6px',
              padding: '3px 12px',
              fontSize: '0.68rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#15803d'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#16a34a'; }}
            title="Assemble code and load into RAM (Ctrl+Enter)"
          >
            ▶ Assemble
          </button>
          <button onClick={handleSave} style={{
            background: 'transparent', color: 'var(--text-muted, #64748b)',
            border: '1px solid var(--border-default, #334155)', borderRadius: '6px',
            padding: '3px 8px', fontSize: '0.62rem', fontWeight: 600, cursor: 'pointer',
          }} title="Save .asm">💾</button>
          <button onClick={handleLoad} style={{
            background: 'transparent', color: 'var(--text-muted, #64748b)',
            border: '1px solid var(--border-default, #334155)', borderRadius: '6px',
            padding: '3px 8px', fontSize: '0.62rem', fontWeight: 600, cursor: 'pointer',
          }} title="Open .asm">📂</button>
          <input ref={fileInputRef} type="file" accept=".asm,.txt,.s" onChange={handleFileChange} style={{ display: 'none' }} />
          {lastResult && (
            <span style={{
              fontSize: '0.62rem',
              color: lastResult.success ? '#4ade80' : '#f87171',
              fontWeight: 600,
              ...(showSuccess ? { animation: 'successFlash 1.2s ease-out' } : {}),
            }}>
              {lastResult.success
                ? `✓ ${lastResult.size}B`
                : `✗ ${lastResult.errors.length} err`
              }
            </span>
          )}
        </div>
        <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary, #94a3b8)', fontWeight: 400, fontFamily: FONT_FAMILY }}>
          PC:{currentAddress.toString(16).padStart(2, '0').toUpperCase()}
          {activeLine >= 0 && <span style={{ color: 'var(--accent-amber, #fcd34d)' }}> L{activeLine + 1}</span>}
        </span>
      </div>

      {/* Editor area — resizable */}
      <div style={{
        flex: `${editorFlex} 1 0`, minHeight: '80px', background: 'var(--bg-elevated, #0f172a)',
        borderRadius: '6px', border: '1px solid var(--border-subtle, #1e293b)', overflow: 'hidden',
        display: 'flex',
      }}>
        {/* Line numbers gutter — click to toggle breakpoints */}
        <div
          ref={lineNumbersRef}
          style={{
            paddingTop: `${PADDING_TOP}px`,
            background: '#0c1222',
            borderRight: '1px solid #1e293b',
            fontFamily: FONT_FAMILY,
            fontSize: FONT_SIZE,
            lineHeight: `${LINE_HEIGHT}px`,
            color: '#334155',
            userSelect: 'none' as const,
            overflow: 'hidden',
            flexShrink: 0,
            minWidth: '52px',
            cursor: 'pointer',
          }}
        >
          {lines.map((_, i) => {
            const hasBreakpoint = breakpointLines.has(i);
            const isActive = i === activeLine;
            const isError = errorLines.has(i);
            const hasAddr = lineToAddr.has(i); // only instruction lines are clickable
            return (
              <div key={i} style={{
                height: `${LINE_HEIGHT}px`,
                display: 'flex', alignItems: 'center',
                paddingLeft: '4px', paddingRight: '6px',
                gap: '4px',
              }}
              onClick={() => {
                if (hasAddr) {
                  onToggleBreakpoint(lineToAddr.get(i)!);
                }
              }}
              title={hasAddr ? `Click to ${hasBreakpoint ? 'remove' : 'set'} breakpoint at 0x${(lineToAddr.get(i) ?? 0).toString(16).toUpperCase().padStart(2, '0')}` : undefined}
              >
                {/* Breakpoint dot area */}
                <span style={{
                  width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: hasBreakpoint ? '#ef4444' : 'transparent',
                  border: hasBreakpoint ? '1px solid #f87171' : (hasAddr ? '1px solid transparent' : 'none'),
                  boxShadow: hasBreakpoint ? '0 0 4px rgba(239,68,68,0.5)' : 'none',
                  transition: 'all 0.15s',
                }} />
                {/* Line number */}
                <span style={{
                  flex: 1, textAlign: 'right',
                  color: isError ? '#f87171' : isActive ? '#fcd34d' : hasBreakpoint ? '#fca5a5' : '#4a5568',
                  fontWeight: (isActive || isError) ? 700 : 400,
                  fontSize: '0.72rem',
                }}>
                  {i + 1}
                </span>
              </div>
            );
          })}
        </div>

        {/* Code area with highlight overlay */}
        <div style={{ flex: 1, position: 'relative' }}>
          {/* Highlight layer — synced to textarea scroll via transform */}
          <div
            style={{
              position: 'absolute',
              top: 0, left: 0, right: 0, bottom: 0,
              overflow: 'hidden',
              pointerEvents: 'none',
            }}
          >
            <div style={{
              paddingTop: `${PADDING_TOP}px`,
              paddingLeft: '4px',
              paddingRight: '4px',
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
                  marginLeft: '2px',
                  marginRight: '2px',
                  boxSizing: 'border-box',
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

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={code}
            onChange={e => { onChange(e.target.value); setLastResult(null); }}
            onScroll={handleScroll}
            onKeyDown={e => {
              // Ctrl+Enter to assemble
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleAssemble();
              }
            }}
            spellCheck={false}
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              paddingTop: `${PADDING_TOP}px`,
              paddingLeft: '10px',
              paddingRight: '10px',
              paddingBottom: '10px',
              background: 'transparent',
              color: '#e2e8f0',
              border: 'none',
              fontFamily: FONT_FAMILY,
              fontSize: FONT_SIZE,
              lineHeight: `${LINE_HEIGHT}px`,
              resize: 'none',
              outline: 'none',
              whiteSpace: 'pre',
              margin: 0,
              boxSizing: 'border-box',
              zIndex: 1,
            }}
          />
        </div>
      </div>

      {/* Drag handle to resize editor vs output */}
      <div
        style={{
          height: 6, cursor: 'row-resize', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '1px 0',
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          dragRef.current = { startY: e.clientY, startFlex: editorFlex };
          const onMove = (ev: MouseEvent) => {
            if (!dragRef.current) return;
            const delta = ev.clientY - dragRef.current.startY;
            const newFlex = Math.max(1, Math.min(8, dragRef.current.startFlex + delta / 60));
            setEditorFlex(newFlex);
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
        <div style={{
          width: 40, height: 3, borderRadius: 2,
          background: 'var(--border-default, #1e2a42)',
          transition: 'background 0.15s',
        }} />
      </div>

      {/* Error panel */}
      {lastResult && lastResult.errors.length > 0 && (
        <div style={{
          marginTop: '6px', padding: '8px', background: '#1c1017',
          borderRadius: '6px', border: '1px solid #7f1d1d',
          maxHeight: '80px', overflow: 'auto',
        }}>
          {lastResult.errors.map((err, i) => (
            <div key={i} style={{
              fontSize: '0.68rem', color: '#fca5a5', fontFamily: FONT_FAMILY,
              padding: '2px 0',
              display: 'flex', gap: '8px',
            }}>
              {err.line > 0 && (
                <span style={{ color: '#f87171', fontWeight: 700, flexShrink: 0 }}>
                  Line {err.line}:
                </span>
              )}
              <span>{err.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Assembled output panel */}
      {lastResult && lastResult.success && (
        <div style={{ flex: 1, minHeight: '60px', overflow: 'auto', display: 'flex', flexDirection: 'column' as const }}>
          <div
            onClick={() => setShowBytes(!showBytes)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '4px 8px', background: 'var(--bg-elevated, #0f172a)', borderRadius: 'var(--radius-sm, 4px)',
              cursor: 'pointer', userSelect: 'none' as const,
              border: '1px solid var(--border-subtle, #1e293b)',
            }}
          >
            <span style={{ fontSize: '0.62rem', color: 'var(--text-dim, #475569)', transition: 'transform 0.2s',
              transform: showBytes ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
            <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-secondary, #94a3b8)' }}>
              Output
            </span>
            <span style={{ fontSize: '0.62rem', color: 'var(--text-dim, #475569)' }}>
              {lastResult.size}B
              {lastResult.labels.size > 0 && ` · ${lastResult.labels.size} labels`}
            </span>
          </div>

          {showBytes && (
            <div style={{
              marginTop: '3px', padding: '6px', background: 'var(--bg-base, #0c1222)',
              borderRadius: 'var(--radius-sm, 4px)', border: '1px solid var(--border-subtle, #1e293b)',
              flex: 1, overflow: 'auto',
            }}>
              {/* Labels summary */}
              {lastResult.labels.size > 0 && (
                <div style={{
                  display: 'flex', flexWrap: 'wrap', gap: '8px',
                  marginBottom: '6px', paddingBottom: '6px',
                  borderBottom: '1px solid #1e293b',
                }}>
                  {Array.from(lastResult.labels.entries()).map(([name, addr]) => (
                    <span key={name} style={{
                      fontSize: '0.65rem', fontFamily: FONT_FAMILY,
                      padding: '1px 6px', background: '#1e293b', borderRadius: '3px',
                    }}>
                      <span style={{ color: '#c084fc' }}>{name}</span>
                      <span style={{ color: '#475569' }}> = </span>
                      <span style={{ color: '#94a3b8' }}>0x{addr.toString(16).padStart(2, '0').toUpperCase()} ({addr})</span>
                    </span>
                  ))}
                </div>
              )}

              {/* Disassembly listing */}
              <DisassemblyView bytes={lastResult.bytes} addressToLine={lastResult.addressToLine} labels={lastResult.labels} currentAddress={currentAddress} />
            </div>
          )}
        </div>
      )}

      {/* Instruction reference */}
      <div style={{
        marginTop: '4px', padding: '6px 8px', background: 'var(--bg-elevated, #111628)',
        borderRadius: 'var(--radius-sm, 4px)', fontSize: '0.58rem',
        color: 'var(--text-muted, #718096)', fontFamily: 'var(--font-mono)',
        display: 'flex', flexWrap: 'wrap' as const, gap: '4px', flexShrink: 0,
        border: '1px solid var(--border-subtle, #1e293b)',
      }}>
        {[
          'ADD r,r', 'SHR r,r', 'SHL r,r', 'NOT r', 'AND r,r', 'OR r,r', 'XOR r,r', 'CMP r,r',
          'LOAD r,[addr]', 'STORE r,[addr]', 'DATA r,val',
          'JMP lbl', 'JC lbl', 'JA lbl', 'JE lbl', 'JMPR r', 'OUT r', 'IN r', 'HALT',
        ].map(instr => (
          <span key={instr} style={{
            padding: '1px 5px', background: 'var(--bg-hover, #161d33)', borderRadius: 3,
            border: '1px solid var(--border-subtle, #1e293b)',
          }}>
            {instr}
          </span>
        ))}
      </div>
    </div>
  );
}
