// Single-key shortcuts (S, B, R, P, Esc, ?) for the simulator.

export type ShortcutAction = 'step' | 'stepback' | 'run' | 'pause' | 'help';

interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  target: EventTarget | null;
}

/**
 * The action for a key press, or null when the app should leave it alone:
 * with Ctrl, Cmd or Alt held (so Ctrl+R, Ctrl+S, Alt+B... keep their usual
 * meaning), and while typing in a text field.
 */
export function shortcutFor(e: KeyLike): ShortcutAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.isContentEditable)) {
    return null;
  }
  switch (e.key) {
    case 's': case 'S': return 'step';
    case 'b': case 'B': return 'stepback';
    case 'r': case 'R': return 'run';
    case 'p': case 'P': case 'Escape': return 'pause';
    case '?': return 'help';
    default: return null;
  }
}
