import { describe, expect, it } from 'vitest';
import { parseQmk } from '../core/keycodes/codec';
import { loadSpec } from '../core/keycodes/spec';
import { resolveBlur } from './encoderEdit';

const spec = loadSpec('latest');
const KC_A = parseQmk(spec, 'KC_A');
const KC_B = parseQmk(spec, 'KC_B');

describe('encoder inline edit on blur', () => {
  it('commits a valid, changed expression', () => {
    expect(resolveBlur(spec, 'KC_B', KC_A)).toEqual({ action: 'commit', value: KC_B });
  });

  it('just closes when the text means the same key', () => {
    expect(resolveBlur(spec, 'KC_A', KC_A)).toEqual({ action: 'close' });
  });

  it('keeps a half-typed expression open with its error', () => {
    const r = resolveBlur(spec, 'LT(1,', KC_A);
    expect(r.action).toBe('error');
    expect(r.action === 'error' && r.error.length > 0).toBe(true);
  });
});
