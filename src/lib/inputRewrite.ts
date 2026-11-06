/**
 * Rewriting a text box's value while it is typed in (capitals for keycodes and pins) without moving the caret.
 */
import { typingCase, type ParseContext } from '../core/keycodes/codec';
import type { KeycodeSpec } from '../core/keycodes/spec';

/**
 * Sets the box's text to `rewrite(text, caret)` (same length, so the caret and selection stay put) and returns it,
 * for the box's `onChange`. Setting the DOM value first keeps a controlled React input from jumping to the end.
 */
export function rewriteInput(el: HTMLInputElement, rewrite: (text: string, caret: number) => string): string {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? start;
  const next = rewrite(el.value, end);
  if (next !== el.value) {
    el.value = next;
    el.setSelectionRange(start, end);
  }
  return next;
}

/** A keycode box's text as it is typed: QMK names in their spelling (`typingCase`). */
export const keycodeInput = (el: HTMLInputElement, spec: KeycodeSpec, ctx: ParseContext): string =>
  rewriteInput(el, (text, caret) => typingCase(spec, text, caret, ctx.ownNames));

/** A pin box's text as it is typed: QMK's pin names are capitals only (GP1, B5, NO_PIN). */
export const pinInput = (el: HTMLInputElement): string => rewriteInput(el, (text) => text.toUpperCase());
