import React, { useRef, useEffect, useState } from 'react';
import { parseConsoleInput, InputMode } from '../hooks/consoleInput';

interface Props {
  output: number[];
  onClear: () => void;
  waitingForInput: { register: number } | null;
  onSubmitInput: (value: number, displayText?: string) => void;
  /** How typed input is read; Echo starts in character mode. */
  defaultInputMode?: InputMode;
}

export default function ConsoleView({ output, onClear, waitingForInput, onSubmitInput, defaultInputMode = 'number' }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'ascii' | 'hex' | 'dec'>('ascii');
  const [inputText, setInputText] = useState('');
  const [copied, setCopied] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>(defaultInputMode);
  const [inputError, setInputError] = useState<string | null>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [output, waitingForInput]);

  // Auto-focus input when waiting
  useEffect(() => {
    if (waitingForInput) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [waitingForInput]);

  const handleInputSubmit = () => {
    const parsed = parseConsoleInput(inputText, inputMode);
    if (!parsed.ok) {
      setInputError(parsed.error);
      return;
    }
    setInputError(null);
    onSubmitInput(parsed.value, inputMode === 'char' ? inputText : inputText.trim());
    setInputText('');
  };

  const renderOutput = () => {
    if (output.length === 0 && !waitingForInput) {
      return (
        <span style={{ color: 'var(--text-dim)', fontStyle: 'italic', fontSize: '0.72rem' }}>
          Use OUT R0 to print, IN R0 to read input…
        </span>
      );
    }

    if (mode === 'ascii') {
      const chars = output.map(v => {
        if (v === 10 || v === 13) return '\n';
        if (v >= 32 && v <= 126) return String.fromCharCode(v);
        return `\\x${v.toString(16).padStart(2, '0')}`;
      }).join('');
      return (
        <span style={{ color: 'var(--accent-green)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {chars}
        </span>
      );
    }

    if (mode === 'hex') {
      return (
        <span style={{ color: 'var(--accent-cyan)', wordBreak: 'break-all' }}>
          {output.map((v, i) => (
            <span key={i} style={{ marginRight: 6 }}>
              {v.toString(16).padStart(2, '0').toUpperCase()}
            </span>
          ))}
        </span>
      );
    }

    // decimal
    return (
      <span style={{ color: 'var(--accent-amber)', wordBreak: 'break-all' }}>
        {output.map((v, i) => (
          <span key={i} style={{ marginRight: 6 }}>{v}</span>
        ))}
      </span>
    );
  };

  return (
    <div style={{
      padding: '10px 12px', flex: 1, display: 'flex', flexDirection: 'column',
      borderTop: '1px solid var(--border-subtle)',
    }}>
      <style>{`
        @keyframes blink { 0%, 100% { opacity: 0.8; } 50% { opacity: 0; } }
        @keyframes inputPulse { 0%, 100% { border-color: rgba(59,130,246,0.5); } 50% { border-color: rgba(59,130,246,1); } }
      `}</style>

      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 6, flexShrink: 0,
      }}>
        <div style={{
          fontSize: '0.6875rem', fontWeight: 700, color: 'var(--text-muted)',
          textTransform: 'uppercase' as const, letterSpacing: '1px',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <div style={{ width: 3, height: 12, borderRadius: 2, background: 'var(--accent-cyan)' }} />
          Console
          {output.length > 0 && (
            <span style={{
              fontSize: '0.6875rem', color: 'var(--text-dim)', fontWeight: 400,
              fontFamily: 'var(--font-mono)',
            }}>
              {output.length}B
            </span>
          )}
          {waitingForInput && (
            <span style={{
              fontSize: '0.6875rem', color: '#3b82f6', fontWeight: 600,
              padding: '0 4px', background: 'rgba(59,130,246,0.1)',
              borderRadius: 3, border: '1px solid rgba(59,130,246,0.3)',
              animation: 'inputPulse 1.5s ease-in-out infinite',
            }}>
              ⌨ WAITING · R{waitingForInput.register}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {(['ascii', 'hex', 'dec'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} style={{
              fontSize: '0.6875rem', fontWeight: 600,
              padding: '1px 6px', borderRadius: 3, border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              background: mode === m ? 'var(--accent-blue)' : 'var(--bg-elevated)',
              color: mode === m ? '#fff' : 'var(--text-muted)',
              transition: 'all 0.1s',
            }}>{m.toUpperCase()}</button>
          ))}

          {output.length > 0 && (
            <>
              <button onClick={() => {
                const text = output.map(v => {
                  if (v === 10 || v === 13) return '\n';
                  if (v >= 32 && v <= 126) return String.fromCharCode(v);
                  return `\\x${v.toString(16).padStart(2, '0')}`;
                }).join('');
                navigator.clipboard?.writeText(text).catch(() => { /* clipboard blocked */ });
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }} style={{
                fontSize: '0.6875rem', fontWeight: 600, marginLeft: 4,
                padding: '1px 6px', borderRadius: 3, cursor: 'pointer',
                background: copied ? 'rgba(34,197,94,0.15)' : 'transparent',
                color: copied ? '#22c55e' : 'var(--text-dim)',
                border: `1px solid ${copied ? 'rgba(34,197,94,0.4)' : 'var(--border-subtle)'}`,
                transition: 'all 0.2s',
              }} title="Copy output to clipboard" aria-label="Copy output to clipboard">{copied ? '✓' : '⎘'}</button>
              <button onClick={onClear} style={{
                fontSize: '0.6875rem', fontWeight: 600,
                padding: '1px 6px', borderRadius: 3, cursor: 'pointer',
                background: 'transparent', color: 'var(--text-dim)',
                border: '1px solid var(--border-subtle)',
              }} title="Clear console" aria-label="Clear console">✕</button>
            </>
          )}
        </div>
      </div>

      {waitingForInput && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
          <span id="console-input-mode">Input as</span>
          <div role="radiogroup" aria-labelledby="console-input-mode" style={{ display: 'flex', gap: 2 }}>
            {(['number', 'char'] as const).map(m => (
              <button key={m} role="radio" aria-checked={inputMode === m}
                onClick={() => { setInputMode(m); setInputError(null); inputRef.current?.focus(); }}
                title={m === 'number' ? "Decimal (negative allowed), 0x hex, 0b binary or 'A'" : 'One character; its code goes into the register'}
                style={{
                  fontSize: '0.6875rem', fontWeight: 600, padding: '1px 6px', borderRadius: 3, cursor: 'pointer',
                  border: '1px solid var(--border-default)',
                  background: inputMode === m ? 'var(--accent-blue)' : 'var(--bg-elevated)',
                  color: inputMode === m ? '#fff' : 'var(--text-muted)',
                }}>{m === 'number' ? 'Number' : 'Character'}</button>
            ))}
          </div>
          <span>· Enter to send</span>
        </div>
      )}

      {/* Output area */}
      <div ref={scrollRef} style={{
        flex: 1, padding: '8px 10px',
        background: 'var(--bg-base, #06080f)',
        borderRadius: 'var(--radius-sm)',
        border: `1px solid ${waitingForInput ? 'rgba(59,130,246,0.4)' : 'var(--border-subtle)'}`,
        fontFamily: 'var(--font-mono)',
        fontSize: '0.82rem',
        lineHeight: '1.5',
        overflow: 'auto',
        minHeight: 40,
        transition: 'border-color 0.2s',
      }}
        onClick={() => { if (waitingForInput) inputRef.current?.focus(); }}
      >
        {renderOutput()}

        {/* Terminal-style input line when waiting */}
        {waitingForInput && (
          <span style={{ display: 'inline-flex', alignItems: 'center' }}>
            <input
              ref={inputRef}
              value={inputText}
              onChange={e => { setInputText(e.target.value); setInputError(null); }}
              aria-label={`Input for R${waitingForInput.register} (${inputMode === 'char' ? 'one character' : 'a number'})`}
              aria-invalid={!!inputError}
              onKeyDown={e => {
                if (e.key === 'Enter') handleInputSubmit();
              }}
              placeholder={inputMode === 'char' ? 'a character' : 'number, e.g. 42 or -7'}
              style={{
                background: 'transparent', border: 'none', outline: 'none',
                color: '#93c5fd', fontFamily: 'var(--font-mono)',
                fontSize: '0.82rem', width: 170, padding: 0,
                caretColor: '#3b82f6',
              }}
            />
            <span style={{
              display: 'inline-block', width: 7, height: 15,
              background: '#3b82f6', animation: 'blink 1s step-end infinite',
              marginLeft: -2,
            }} />
          </span>
        )}
        {waitingForInput && inputError && (
          <div role="alert" style={{ color: 'var(--accent-red)', fontSize: '0.75rem', marginTop: 2, fontFamily: 'var(--font-ui)' }}>
            {inputError}
          </div>
        )}

        {/* Blinking cursor when not waiting and has output */}
        {!waitingForInput && output.length > 0 && (
          <span style={{
            display: 'inline-block', width: 6, height: 14,
            background: 'var(--accent-green)', opacity: 0.6,
            animation: 'blink 1s step-end infinite',
            verticalAlign: 'text-bottom', marginLeft: 1,
          }} />
        )}
      </div>
    </div>
  );
}
