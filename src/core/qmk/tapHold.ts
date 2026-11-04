/**
 * Per-key tap-hold settings → C for keymap.c (settings: core/project/tapHolds.ts).
 *
 * QMK asks the keycode of the tap-hold key, so every key with that keycode shares a setting. The *_PER_KEY define
 * REPLACES the global flag (HOLD_ON_OTHER_KEY_PRESS, PERMISSIVE_HOLD) in QMK, so the default branch of each hook
 * repeats what the global flag would have said and keys without a flavor keep behaving as before.
 */
import type { TapHoldSetting } from '../project/types';

export interface TapHoldPlan {
  /** `case X: return N;` pieces, in setting order. */
  terms: { code: string; term: number }[];
  quick: { code: string; term: number }[];
  /** Flavor cases of get_hold_on_other_key_press: hold-preferred → true, else false; hold keys come first. */
  holdPress: { code: string; flavor?: TapHoldSetting['flavor']; holdKeys: string[] }[];
  permissive: { code: string; value: boolean }[];
}

export function planTapHolds(settings: TapHoldSetting[], kc: (v: number) => string): TapHoldPlan {
  const plan: TapHoldPlan = { terms: [], quick: [], holdPress: [], permissive: [] };
  for (const s of settings) {
    const code = kc(s.keycode);
    if (s.tappingTerm !== undefined) plan.terms.push({ code, term: s.tappingTerm });
    if (s.quickTapTerm !== undefined) plan.quick.push({ code, term: s.quickTapTerm });
    const holdKeys = (s.holdOnKeys ?? []).filter((k) => k > 1).map(kc);
    if (s.flavor !== undefined || holdKeys.length) plan.holdPress.push({ code, flavor: s.flavor, holdKeys });
    if (s.flavor !== undefined) plan.permissive.push({ code, value: s.flavor === 'balanced' });
  }
  return plan;
}

export const hasHoldKeys = (plan: TapHoldPlan) => plan.holdPress.some((h) => h.holdKeys.length > 0);

/** The key pressed last, seen before QMK's tapping logic (pre_process_record runs before action_tapping). */
export function lastPressedState(hook: string): string[] {
  return [
    '// The key pressed last: "hold when pressed" keys need it, and get_hold_on_other_key_press only gets the tap-hold key.',
    'static uint16_t navi_last_pressed = KC_NO;',
    '',
    `bool ${hook}(uint16_t keycode, keyrecord_t *record) {`,
    '    if (record->event.pressed) navi_last_pressed = keycode;',
    '    return true;',
    '}',
    '',
  ];
}

export function quickTapHook(name: string, plan: TapHoldPlan): string[] {
  return [
    `uint16_t ${name}(uint16_t keycode, keyrecord_t *record) {`,
    '    switch (keycode) {',
    ...plan.quick.map((q) => `        case ${q.code}: return ${q.term};`),
    '        default: return QUICK_TAP_TERM;',
    '    }',
    '}',
    '',
  ];
}

const GLOBAL_FLAG = (flag: string) => [`#ifdef ${flag}`, '    return true;', '#else', '    return false;', '#endif'];

export function holdOnOtherKeyPressHook(name: string, plan: TapHoldPlan): string[] {
  const cases = plan.holdPress.flatMap((h): string[] => {
    const answer = h.flavor === undefined ? undefined : h.flavor === 'hold-preferred' ? 'true' : 'false';
    if (!h.holdKeys.length) return answer === undefined ? [] : [`        case ${h.code}: return ${answer};`];
    return [
      `        case ${h.code}:`,
      `            if (${h.holdKeys.map((k) => `navi_last_pressed == ${k}`).join(' || ')}) return true;`,
      answer === undefined ? '            break;' : `            return ${answer};`,
    ];
  });
  return [`bool ${name}(uint16_t keycode, keyrecord_t *record) {`, '    switch (keycode) {', ...cases, '        default: break;', '    }', ...GLOBAL_FLAG('HOLD_ON_OTHER_KEY_PRESS'), '}', ''];
}

export function permissiveHoldHook(name: string, plan: TapHoldPlan): string[] {
  return [
    `bool ${name}(uint16_t keycode, keyrecord_t *record) {`,
    '    switch (keycode) {',
    ...plan.permissive.map((p) => `        case ${p.code}: return ${p.value};`),
    '        default: break;',
    '    }',
    ...GLOBAL_FLAG('PERMISSIVE_HOLD'),
    '}',
    '',
  ];
}

/** Pipeline stubs: QMK's own behavior (the global defines decide). */
export const holdOnOtherKeyPressStub = (name: string) => [`bool ${name}(uint16_t keycode, keyrecord_t *record) {`, ...GLOBAL_FLAG('HOLD_ON_OTHER_KEY_PRESS'), '}'];
export const permissiveHoldStub = (name: string) => [`bool ${name}(uint16_t keycode, keyrecord_t *record) {`, ...GLOBAL_FLAG('PERMISSIVE_HOLD'), '}'];
export const quickTapStub = (name: string) => [`uint16_t ${name}(uint16_t keycode, keyrecord_t *record) {`, '    return QUICK_TAP_TERM;', '}'];
export const preProcessStub = (name: string) => [`bool ${name}(uint16_t keycode, keyrecord_t *record) {`, '    return true;', '}'];
