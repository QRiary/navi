import { describe, expect, it } from 'vitest';
import { charsThatFit, ellipsize, fitLabel } from './fitLabel';

// A 1u cap at the default key size: S = 54, room = 54 - 4 × 3.24 ≈ 41 px.
const S = 54;
const room = 41;
const sizes = [S * 0.21, S * 0.17];

describe('fitLabel', () => {
  it('keeps the first size that holds the text on one line', () => {
    expect(fitLabel('Space', room, sizes)).toEqual({ lines: ['Space'], size: S * 0.21 });
  });

  it('shrinks to the floor before wrapping', () => {
    // 7 chars: too wide at 0.21 (7 × 6.8 > 41), fits at 0.17 (7 × 5.5)
    expect(fitLabel('Numpad1', room, sizes)).toEqual({ lines: ['Numpad1'], size: S * 0.17 });
  });

  it('wraps at a space, then at an underscore', () => {
    expect(fitLabel('US Colemak', room, sizes).lines).toEqual(['US', 'Colemak']);
    expect(fitLabel('HK_UNDO2', room, sizes).lines).toEqual(['HK_', 'UNDO2']);
  });

  it('picks the most even break when both halves fit', () => {
    expect(fitLabel('Cut Copy Paste', 60, sizes).lines).toEqual(['Cut Copy', 'Paste']);
  });

  it('cuts a word with no break point and ellipsizes only the second line', () => {
    const n = charsThatFit(room, S * 0.17);
    const { lines } = fitLabel('Supercalifragilistic', room, sizes);
    expect(lines[0]).toBe('Supercalifragilistic'.slice(0, n));
    expect(lines[1].endsWith('…')).toBe(true);
    expect(Array.from(lines[1]).length).toBe(n);
  });

  it('ellipsizes on one line when two are not allowed', () => {
    const { lines } = fitLabel('Very long label', room, sizes, 1);
    expect(lines).toHaveLength(1);
    expect(lines[0].endsWith('…')).toBe(true);
  });

  it('counts letter spacing', () => {
    expect(charsThatFit(41, 8.1, 0.08)).toBeLessThan(charsThatFit(41, 8.1));
  });
});

describe('ellipsize', () => {
  it('leaves short text alone and counts code points', () => {
    expect(ellipsize('abc', 3)).toBe('abc');
    expect(ellipsize('abcd', 3)).toBe('ab…');
    expect(ellipsize('😀😀😀😀', 3)).toBe('😀😀…');
  });
});
