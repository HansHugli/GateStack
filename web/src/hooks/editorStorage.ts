// ============================================================================
// editorStorage.ts — autosave the editor text per sample in localStorage
// ============================================================================
// Every access is wrapped in try/catch: storage can be missing or throw in
// private windows, with blocked site data, or when the quota is full. The app
// then simply works without autosave.
// ============================================================================

const PREFIX = 'gatestack.edits.';
const ACTIVE_KEY = 'gatestack.activeSample';

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** The saved edits for a sample, or null when there are none. */
export function loadEdits(sampleKey: string): string | null {
  try {
    return storage()?.getItem(PREFIX + sampleKey) ?? null;
  } catch {
    return null;
  }
}

/** Save edits; text equal to the original sample removes the saved copy. */
export function saveEdits(sampleKey: string, text: string, original: string): void {
  try {
    const s = storage();
    if (!s) return;
    if (text === original) s.removeItem(PREFIX + sampleKey);
    else s.setItem(PREFIX + sampleKey, text);
  } catch {
    // Quota full or storage blocked: keep working without autosave.
  }
}

export function clearEdits(sampleKey: string): void {
  try {
    storage()?.removeItem(PREFIX + sampleKey);
  } catch {
    /* ignore */
  }
}

export function loadActiveSample(): string | null {
  try {
    return storage()?.getItem(ACTIVE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function saveActiveSample(sampleKey: string): void {
  try {
    storage()?.setItem(ACTIVE_KEY, sampleKey);
  } catch {
    /* ignore */
  }
}
