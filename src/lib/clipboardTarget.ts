/**
 * Who gets Ctrl+C / Ctrl+V / Ctrl+X / Ctrl+A: the selected text (native copy/paste/select all) or the selected keys.
 * Keys win only when nothing else could want the shortcut: no text is selected and focus is on nothing in particular
 * (the page itself) or inside the keyboard drawing / keycode picker.
 */

/** Where focus is, as far as the clipboard shortcuts care. */
export type FocusPlace = 'editable' | 'keys' | 'none' | 'other';

/**
 * Containers whose focus keeps the key shortcuts carry `data-key-shortcuts` (the keyboard drawing, which is
 * focusable so a click on a key moves focus into it, and the keycode picker).
 */
const KEY_SHORTCUT_SCOPE = 'data-key-shortcuts';

export function clipboardGoesToText(state: { selectedText: string; focus: FocusPlace }): boolean {
  if (state.selectedText.length > 0) return true;
  return state.focus === 'editable' || state.focus === 'other';
}

/** The DOM side: classifies the focused element (`document.activeElement`). */
export function focusPlace(active: Element | null, doc: Pick<Document, 'body' | 'documentElement'> = document): FocusPlace {
  // The main area is focusable (skip-link target), so a click on its empty space lands there: counts as nothing.
  if (!active || active === doc.body || active === doc.documentElement || active.id === 'main-content') return 'none';
  if (active.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return 'editable';
  if (active.closest(`[${KEY_SHORTCUT_SCOPE}]`)) return 'keys';
  return 'other';
}

/** True when Ctrl+C/V/X/A should do the native thing right now. */
export function nativeClipboardNow(): boolean {
  return clipboardGoesToText({ selectedText: window.getSelection()?.toString() ?? '', focus: focusPlace(document.activeElement) });
}
