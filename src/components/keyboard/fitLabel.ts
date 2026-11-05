/**
 * Fitting a key cap's text into its width without measuring the DOM: the drawing uses a monospace font
 * (JetBrains Mono, every glyph 0.6 em wide, Cyrillic too), so a character count is the width.
 */

/** Advance width of one character, in em. */
export const CHAR_EM = 0.6;

export interface FittedLabel {
  /** One or two lines; the last one ends with “…” only when nothing else fit. */
  lines: string[];
  /** Font size the lines fit at. */
  size: number;
}

/** Characters of a font size that fit into a width (at least 1). */
export function charsThatFit(width: number, size: number, letterSpacingEm = 0): number {
  return Math.max(1, Math.floor(width / (size * (CHAR_EM + letterSpacingEm))));
}

/** Cuts text to `max` characters, the last one becoming “…”. */
export function ellipsize(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length > max ? `${chars.slice(0, Math.max(1, max - 1)).join('')}…` : text;
}

/**
 * Fits a label: the first size (largest first) that holds it on one line; else two lines at the last (smallest)
 * size, broken at a space, `_`, `-`, `/` or `+` when one fits; the ellipsis only when two lines aren't enough.
 */
export function fitLabel(text: string, width: number, sizes: readonly number[], maxLines: 1 | 2 = 2, letterSpacingEm = 0): FittedLabel {
  const len = Array.from(text).length;
  for (const size of sizes) {
    if (len <= charsThatFit(width, size, letterSpacingEm)) return { lines: [text], size };
  }
  const size = sizes[sizes.length - 1];
  const n = charsThatFit(width, size, letterSpacingEm);
  if (maxLines === 1) return { lines: [ellipsize(text, n)], size };
  return { lines: splitTwo(text, n), size };
}

/** Two lines of at most n characters: the most even break whose both halves fit, else the latest one that fits line 1. */
function splitTwo(text: string, n: number): string[] {
  const chars = Array.from(text);
  let best: { a: string; b: string; score: number } | null = null;
  for (let i = 1; i < chars.length; i++) {
    const c = chars[i - 1];
    const next = chars[i];
    // break after a separator, or before a space (the space is dropped)
    if (!(/[_\-/+]/.test(c) || next === ' ' || c === ' ')) continue;
    const a = chars.slice(0, i).join('').trimEnd();
    const b = chars.slice(i).join('').trimStart();
    const la = Array.from(a).length;
    const lb = Array.from(b).length;
    if (!la || !lb || la > n) continue;
    // both fitting beats any cut; among those, the most even; else the longest first line
    const score = lb <= n ? 1000 - Math.abs(la - lb) : la;
    if (!best || score > best.score) best = { a, b, score };
  }
  if (best) return [best.a, ellipsize(best.b, n)];
  return [chars.slice(0, n).join(''), ellipsize(chars.slice(n).join(''), n)];
}
