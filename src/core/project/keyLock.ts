/**
 * QMK's Key Lock (quantum/process_keycode/process_key_lock.c): QK_LOCK holds the next key down, but only a keycode
 * of 0xFF or less (`IS_STANDARD_KEYCODE`), after a one-shot mod is turned back into its mod bits
 * (`translate_keycode`). Any other key (MT, LT, a key with mods, a macro…) ends the watch and works as if QK_LOCK
 * weren't pressed.
 */
import type { KeycodeSpec } from '../keycodes/spec';

/** Key Lock can hold this keycode (process_key_lock.c: translate_keycode, then IS_STANDARD_KEYCODE). */
export function keyLockHolds(spec: KeycodeSpec, v: number): boolean {
  const osm = spec.rangeByDefine.get('QK_ONE_SHOT_MOD');
  const translated = osm && v > osm.start && v <= osm.end ? v ^ osm.start : v;
  return translated <= 0xff;
}
