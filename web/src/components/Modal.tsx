// ============================================================================
// Modal.tsx — in-app dialog (never a native/system dialog)
// ============================================================================
// Hans's rules: text in a dialog must be selectable and copyable, and a dialog
// closes only through its own buttons, never on a backdrop click. Escape acts
// like the Cancel/Close button. Focus moves into the dialog, Tab stays inside
// it, and focus returns to where it was when the dialog closes.
// ============================================================================

import React, { useEffect, useRef, useId } from 'react';
import { version as pkgVersion } from '../../package.json';

/** The app version from web/package.json (kept in step by commit-and-tag-version). */
export const APP_VERSION: string = pkgVersion;

interface ModalProps {
  title: string;
  /** Called by Escape. Leave out for dialogs that must be answered with a button. */
  onEscape?: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export function Modal({ title, onEscape, children, footer, width = 460 }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    // Focus the first button in the footer (the safe choice comes first), else the panel.
    const first = panel?.querySelector<HTMLElement>('[data-autofocus]')
      ?? panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();
    return () => { previouslyFocused?.focus?.(); };
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Keep the app's single-key shortcuts from firing behind the dialog.
    e.stopPropagation();
    if (e.key === 'Escape' && onEscape) {
      e.preventDefault();
      onEscape();
      return;
    }
    if (e.key === 'Tab' && panelRef.current) {
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) { e.preventDefault(); return; }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstItem) { e.preventDefault(); lastItem.focus(); }
      else if (!e.shiftKey && document.activeElement === lastItem) { e.preventDefault(); firstItem.focus(); }
    }
  };

  return (
    // No onClick on the backdrop: a dialog closes only through its buttons.
    <div style={styles.overlay} onKeyDown={onKeyDown}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{ ...styles.panel, width, maxWidth: 'calc(100vw - 32px)' }}
      >
        <h2 id={titleId} style={styles.title}>{title}</h2>
        <div style={styles.body}>{children}</div>
        {footer && <div style={styles.footer}>{footer}</div>}
      </div>
    </div>
  );
}

export function ModalButton({ children, onClick, primary, danger, autoFocus }: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  danger?: boolean;
  autoFocus?: boolean;
}) {
  const color = danger ? 'var(--accent-red)' : primary ? 'var(--accent-blue)' : 'var(--text-secondary)';
  return (
    <button
      onClick={onClick}
      data-autofocus={autoFocus ? '' : undefined}
      style={{
        padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
        fontSize: '0.8rem', fontWeight: 600, fontFamily: 'var(--font-ui)',
        background: danger || primary ? `color-mix(in srgb, ${color} 18%, transparent)` : 'var(--bg-elevated)',
        color, border: `1px solid ${danger || primary ? color : 'var(--border-default)'}`,
      }}
    >
      {children}
    </button>
  );
}

/** Ask before throwing away edits. */
export function DiscardDialog({ sampleName, onDiscard, onCancel, action }: {
  sampleName: string;
  onDiscard: () => void;
  onCancel: () => void;
  /** What happens after discarding, e.g. "open Count". */
  action: string;
}) {
  return (
    <Modal
      title={`Discard your changes to ${sampleName}?`}
      onEscape={onCancel}
      footer={<>
        <ModalButton onClick={onCancel} autoFocus>Cancel</ModalButton>
        <ModalButton onClick={onDiscard} danger>Discard</ModalButton>
      </>}
    >
      <p style={{ margin: 0 }}>
        You have edited the {sampleName} program. Discarding throws your edits away
        and {action}. Use 💾 to save a copy as a .asm file first.
      </p>
    </Modal>
  );
}

export interface ElectronVersions { electron?: string; chrome?: string; node?: string }

export function AboutDialog({ onClose, engine, versions }: {
  onClose: () => void;
  engine: string;
  versions?: ElectronVersions | null;
}) {
  return (
    <Modal
      title="About GateStack"
      onEscape={onClose}
      footer={<ModalButton onClick={onClose} primary autoFocus>Close</ModalButton>}
    >
      <div style={{ userSelect: 'text', lineHeight: 1.6 }}>
        <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>GateStack v{APP_VERSION}</div>
        <div>A visual 32-bit computer simulator (ISA v2).</div>
        <div style={{ marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
          <div>Version: {APP_VERSION}</div>
          <div>CPU engine: {engine}</div>
          {versions?.electron && <div>Electron: {versions.electron}</div>}
          {versions?.chrome && <div>Chrome: {versions.chrome}</div>}
          {versions?.node && <div>Node: {versions.node}</div>}
        </div>
        <div style={{ marginTop: 8 }}>
          Built with React and TypeScript, with a Rust/WebAssembly CPU core and a JavaScript fallback.
        </div>
        <div style={{ marginTop: 8 }}>
          Inspired by J. Clark Scott's <em>But How Do It Know?</em> and nand2tetris.org by Nisan &amp; Schocken.
        </div>
      </div>
    </Modal>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 2000,
  },
  panel: {
    background: 'var(--bg-surface)', border: '1px solid var(--border-bright)',
    borderRadius: 8, padding: '18px 22px', maxHeight: '85vh', overflow: 'auto',
    color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)', fontSize: '0.85rem',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)', outline: 'none',
    userSelect: 'text',
  },
  title: { margin: '0 0 10px', fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' },
  body: { lineHeight: 1.5 },
  footer: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 },
};
