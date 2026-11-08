import { describe, expect, it } from 'vitest';
import { parseQmk } from '../keycodes/codec';
import { loadSpec } from '../keycodes/spec';
import { createBlankProject } from './factory';
import { keyLockHolds, keyLockSkips } from './keyLock';
import { activeKeymap } from './ops';

const spec = loadSpec('latest');
const kc = (s: string) => parseQmk(spec, s);

describe('keyLockSkips', () => {
  const p = createBlankProject('t', 2, 4, false);
  const km = activeKeymap(p);
  km.layers[0]!.keys[0] = kc('QK_LOCK');

  it('a key above 0xFF on a layer with QK_LOCK', () => {
    expect(keyLockSkips(spec, km, 0, kc('LALT_T(KC_ESC)'))).toBe(true);
    expect(keyLockSkips(spec, km, 0, kc('S(KC_1)'))).toBe(true);
    expect(keyLockSkips(spec, km, 0, kc('MO(1)'))).toBe(true);
  });
  it('not for keys Key Lock holds, QK_LOCK itself, KC_NO / KC_TRNS', () => {
    for (const k of ['KC_ESC', 'KC_LSFT', 'OSM(MOD_LSFT)', 'QK_LOCK', 'KC_NO', 'KC_TRNS']) expect(keyLockSkips(spec, km, 0, kc(k))).toBe(false);
    expect(keyLockHolds(spec, kc('OSM(MOD_LSFT)'))).toBe(true);
  });
  it('not on a layer without QK_LOCK', () => {
    expect(keyLockSkips(spec, km, 1, kc('LALT_T(KC_ESC)'))).toBe(false);
  });
});
