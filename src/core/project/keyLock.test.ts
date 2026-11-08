import { describe, expect, it } from 'vitest';
import { parseQmk } from '../keycodes/codec';
import { loadSpec } from '../keycodes/spec';
import { keyLockHolds } from './keyLock';

const spec = loadSpec('latest');
const kc = (s: string) => parseQmk(spec, s);

describe('keyLockHolds', () => {
  it('keys above 0xFF are not held', () => {
    for (const k of ['LALT_T(KC_ESC)', 'S(KC_1)', 'MO(1)']) expect(keyLockHolds(spec, kc(k))).toBe(false);
  });
  it('plain keys, modifiers and one-shot mods (as their mod bits) are', () => {
    for (const k of ['KC_ESC', 'KC_LSFT', 'OSM(MOD_LSFT)']) expect(keyLockHolds(spec, kc(k))).toBe(true);
  });
});
