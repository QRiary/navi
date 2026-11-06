import type { KeycodeSpec } from '../core/keycodes/spec';
import { tryParseQmk, type ParseContext } from '../core/keycodes/codec';

/**
 * What leaving the encoder's inline expression field (blur) does: a valid expression is committed, the text
 * untouched since opening just closes, an invalid one stays open with its error (a stray click must not throw
 * away a half-typed expression). Esc is handled by the field and cancels.
 */
export type BlurResult = { action: 'commit'; value: number } | { action: 'close' } | { action: 'error'; error: string };

export function resolveBlur(spec: KeycodeSpec, text: string, current: number, ctx: ParseContext = {}): BlurResult {
  const r = tryParseQmk(spec, text, ctx);
  if ('error' in r) return { action: 'error', error: r.error };
  return r.value === current ? { action: 'close' } : { action: 'commit', value: r.value };
}
