/**
 * QMK's Key Lock (quantum/process_keycode/process_key_lock.c): QK_LOCK holds the next key down, but only a keycode
 * of 0xFF or less (`IS_STANDARD_KEYCODE`), after a one-shot mod is turned back into its mod bits
 * (`translate_keycode`). Any other key (MT, LT, a key with mods, a macro…) ends the watch and works as if QK_LOCK
 * weren't pressed.
 */
import type { KeycodeSpec } from '../keycodes/spec';
import type { Keymap } from './types';

/** QK_LOCK's value in this spec, or undefined when the spec has none. */
export const keyLockValue = (spec: KeycodeSpec): number | undefined => spec.byName.get('QK_LOCK')?.value;

/** Key Lock can hold this keycode (process_key_lock.c: translate_keycode, then IS_STANDARD_KEYCODE). */
export function keyLockHolds(spec: KeycodeSpec, v: number): boolean {
  const osm = spec.rangeByDefine.get('QK_ONE_SHOT_MOD');
  const translated = osm && v > osm.start && v <= osm.end ? v ^ osm.start : v;
  return translated <= 0xff;
}

/** The layer has a QK_LOCK key of its own. */
export function layerHasKeyLock(spec: KeycodeSpec, keymap: Keymap, layer: number): boolean {
  const lock = keyLockValue(spec);
  return lock !== undefined && !!keymap.layers[layer]?.keys.includes(lock);
}

/** True when the layer has a QK_LOCK key and `value` is a key it can't hold (not QK_LOCK, KC_NO or KC_TRNS). */
export function keyLockSkips(spec: KeycodeSpec, keymap: Keymap, layer: number, value: number): boolean {
  if (value === 0 || value === 1 || value === keyLockValue(spec)) return false;
  return !keyLockHolds(spec, value) && layerHasKeyLock(spec, keymap, layer);
}
