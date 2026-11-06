/**
 * Writes the keymap files the QMK host tests build (tests/qmk-host/README.md). Skipped unless NAVI_QMK_OUT names
 * the folder to write to: `npm run test:qmk` sets it.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { it } from 'vitest';
import { parseQmk } from '../../src/core/keycodes/codec';
import { loadSpec } from '../../src/core/keycodes/spec';
import { createBlankProject } from '../../src/core/project/factory';
import { languageKeycodes } from '../../src/core/project/languages';
import { activeKeymap, setKeycodes } from '../../src/core/project/ops';
import { ensureTapHold, pruneTapHoldActions } from '../../src/core/project/tapHoldActions';
import type { HoldAction, MacroStep, Project, TapDance } from '../../src/core/project/types';
import { generateKeymap } from '../../src/core/qmk/generate';

const out = process.env.NAVI_QMK_OUT;
const spec = loadSpec('latest');
const q = (s: string) => parseQmk(spec, s);

/** Keys of the test matrix (4x10, position n = row n / 10, column n % 10); qmk_host_test.cpp names the same positions. */
export function hostProject(): Project {
  let p = createBlankProject('qmk host test', 4, 10, false);
  const id = activeKeymap(p).id;
  // Position n = row n / 10, column n % 10.
  const put = (layer: number, n: number, v: number) => (p = setKeycodes(p, id, layer, [[Math.floor(n / 10), n % 10]], v));
  const putTh = (col: number, tap: string, hold: HoldAction) => {
    const r = ensureTapHold(spec, p, q(tap), hold);
    p = r.project;
    put(0, col, r.keycode);
    return r.keycode;
  };
  put(0, 0, q('LT(1, KC_SPC)'));
  put(0, 1, q('LSFT_T(KC_P)'));
  put(0, 2, q('KC_C'));
  const ctrlLayerStandIn = putTh(3, 'C(KC_Z)', { type: 'layer', layer: 2, mods: 0x01 });
  const altStandIn = putTh(4, 'S(KC_1)', { type: 'mods', mods: 0x04 });
  putTh(5, 'KC_A', { type: 'key', keycode: q('C(KC_X)') });
  put(0, 6, q('LCTL_T(KC_D)'));
  put(0, 7, q('KC_E'));
  // A stand-in on a real key: the 12 codes that are no key taken by the user's own code (ownCodeRefs).
  const noKey = new Set([0x02, 0x03, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xcb, 0xcc]);
  const r8 = ensureTapHold(spec, p, q('C(KC_C)'), { type: 'mods', mods: 0x01 }, noKey);
  p = r8.project;
  put(0, 8, r8.keycode);
  put(2, 2, q('KC_V'));
  // Auto repeat on layer 2 (hold 31): MC_0 and REP_KEY repeat, MC_1 doesn't.
  put(2, 5, q('QK_MACRO_0'));
  put(2, 6, q('QK_USER_1'));
  put(2, 7, q('QK_MACRO_1'));
  // Combos (positions 24…39): layer keys, then the keys of each scenario
  const combo = (n: number): [number, number] => [Math.floor(n / 10), n % 10];
  ([[30, 'MO(1)'], [31, 'MO(2)'], [32, 'KC_Q'], [33, 'KC_W'], [34, 'KC_R'], [35, 'KC_T'], [36, 'KC_Y'], [37, 'KC_U'], [38, 'KC_I'], [39, 'KC_O'],
    [24, 'LSFT_T(KC_A)'], [25, 'KC_K'], [26, 'KC_L'], [27, 'KC_F'], [28, 'KC_H'], [9, 'KC_J'], [29, 'KC_M']] as const).forEach(([n, k]) => put(0, n, q(k)));
  put(1, 32, q('KC_1'));
  put(1, 33, q('KC_2'));
  put(2, 34, q('KC_3')); // 35 stays transparent on layer 2
  p = pruneTapHoldActions(p);
  // Tap dances on rows 1 and 2 (positions 10…23, qmk_host_test.cpp names them).
  const td = (index: number, col: number, d: Partial<TapDance>): TapDance => {
    put(0, col, q(`TD(${index})`));
    return { id: `td-${index}`, index, name: `TD_H${index}`, tap: 0, hold: 0, doubleTap: 0, tapHold: 0, ...d };
  };
  const text = (s: string): MacroStep[] => [{ type: 'text', text: s }];
  const hostKey = q('QK_USER_0');
  const tapDances = [
    td(0, 10, { tap: q('C(KC_C)') }),
    td(1, 11, { tap: q('KC_Q'), hold: q('LM(1, MOD_LSFT)') }),
    td(2, 12, { tap: q('KC_SPC'), hold: q('KC_LSFT') }),
    td(3, 14, { tap: q('KC_T'), doubleTap: q('TG(1)') }),
    td(4, 15, { tap: q('LT(1, KC_X)') }),
    td(5, 16, { kind: 'every-tap', steps: [{ none: text('!'), shift: text('->') }, { none: text('=') }] }),
    td(6, 17, { kind: 'every-tap', steps: [{ none: text('a') }] }),
    td(7, 18, { kind: 'every-tap', steps: [{ none: text('a'), shift: [] }] }),
    td(8, 19, { kind: 'every-tap', steps: [{ none: [{ type: 'tap', keycode: hostKey }] }] }),
    td(9, 20, { kind: 'own-c', ownC: { onEachTap: 'host_each' } }),
    td(10, 22, { kind: 'every-tap', steps: [{ none: [{ type: 'tap', keycode: q('KC_A') }] }, { none: [{ type: 'tap', keycode: q('KC_B') }] }] }),
    td(11, 23, { tap: ctrlLayerStandIn, hold: altStandIn }),
    // Not on the keymap: only the result of the combo on 9 + 29
    { id: 'td-12', index: 12, name: 'TD_H12', tap: q('C(KC_C)'), hold: q('KC_LSFT'), doubleTap: 0, tapHold: 0 },
  ];
  put(0, 13, q('KC_N'));
  put(1, 13, q('KC_A'));
  put(1, 14, q('KC_B'));
  put(0, 21, q('KC_LSFT'));
  const refs: Record<number, 'self'> = { 1: 'self', 2: 'self' };
  return {
    ...p,
    tapDances,
    customKeycodes: [
      { id: 'ck-host', name: 'HOST_KEY', description: 'handled by the own lines', action: { type: 'none' } },
      { id: 'ck-rep', name: 'REP_KEY', description: 'repeats', action: { type: 'send-string', text: 'b' }, repeat: true },
    ],
    macros: [
      { id: 'mc-0', index: 0, name: 'repeats', steps: [{ type: 'tap', keycode: q('KC_A') }], repeat: true },
      { id: 'mc-1', index: 1, name: 'once', steps: [{ type: 'tap', keycode: q('KC_C') }] },
    ],
    firmware: {
      ...p.firmware,
      autoRepeat: { delay: 300, rate: 50 },
      custom: {
        'keymap.c': [
          'void post_process_record_user(uint16_t keycode, keyrecord_t *record) {',
          '    if (keycode == HOST_KEY && record->event.pressed) tap_code(KC_Z);',
          '}',
          'void host_each(tap_dance_state_t *state, void *user_data) {',
          '    if (state->count == 2) tap_code(KC_X);',
          '}',
        ].join('\n'),
      },
    },
    keymaps: p.keymaps.map((k) => (k.id !== id ? k : { ...k, layers: k.layers.map((l, i) => (refs[i] ? { ...l, comboRef: refs[i] } : l)) })),
    combos: [
      { id: 'c1', name: 'c1_self', keys: [combo(32), combo(33)], result: q('KC_ESC') },
      { id: 'c2', name: 'c2_fall', keys: [combo(34), combo(35)], result: q('KC_ENT') },
      { id: 'c3', name: 'c3_top', keys: [combo(36), combo(37)], result: q('KC_G'), layers: [1] },
      { id: 'c4a', name: 'c4_base', keys: [combo(38), combo(39)], result: q('KC_X'), layers: [0] },
      { id: 'c4b', name: 'c4_one', keys: [combo(38), combo(39)], result: q('KC_Y'), layers: [1] },
      { id: 'c5', name: 'c5_roll', keys: [combo(25), combo(26)], result: q('KC_Z') },
      { id: 'c6', name: 'c6_dance', keys: [combo(27), combo(28)], result: q('TD(5)') },
      { id: 'c7', name: 'c7_slots', keys: [combo(9), combo(29)], result: q('TD(12)') },
    ],
    tapHolds: [
      { id: 'th-p', keycodes: [q('LSFT_T(KC_P)')], flavor: 'hold-preferred' },
      { id: 'th-alt', keycodes: [altStandIn], flavor: 'hold-preferred' },
      { id: 'th-d', keycodes: [q('LCTL_T(KC_D)')], holdOnKeys: [q('KC_C')] },
      { id: 'th-a', keycodes: [q('LSFT_T(KC_A)')], holdOnKeys: [q('KC_Z')] },
    ],
  };
}

/**
 * The languages suite (languages/languages_test.cpp names the positions): English (plain keys) and Russian (through
 * the own-program route, layer 3), “layer keys on top” on. The own lines record what reaches the “program”.
 */
export function languageHostProject(): Project {
  let p = createBlankProject('qmk host languages', 4, 10, false);
  const id = activeKeymap(p).id;
  const put = (layer: number, n: number, v: number) => (p = setKeycodes(p, id, layer, [[Math.floor(n / 10), n % 10]], v));
  const ru = languageKeycodes(spec, 1);
  const en = languageKeycodes(spec, 0);
  put(0, 0, ru.to);
  put(0, 1, ru.toggle);
  put(0, 2, en.to);
  put(0, 3, q('MO(2)'));
  put(0, 4, q('KC_A'));
  put(0, 5, q('LSFT_T(KC_F)'));
  put(0, 6, q('KC_J'));
  put(0, 7, q('KC_P'));
  put(0, 8, q('KC_LSFT'));
  put(0, 9, q('KC_SCLN'));
  put(0, 20, q('QK_MACRO_0'));
  put(0, 21, q('QK_USER_0'));
  put(0, 22, q('TO(0)'));
  put(3, 4, q('KC_B')); // the Russian layer
  put(2, 4, q('KC_C')); // the symbols layer, under the Russian one by number
  put(2, 10, q('S(KC_1)'));
  put(2, 11, q('KC_SCLN'));
  put(2, 12, q('KC_1'));
  put(2, 13, q('C(KC_1)'));
  put(2, 14, q('KC_A'));
  return {
    ...p,
    languages: [
      { id: 'en', name: 'English', code: 'en', plainKeys: true },
      { id: 'ru', name: 'Russian', code: 'ru', plainKeys: false, layer: 3 },
    ],
    macros: [{ id: 'mc-0', index: 0, name: 'text', steps: [{ type: 'tap', keycode: q('KC_A') }, { type: 'text', text: 'hi' }, { type: 'tap', keycode: q('KC_B') }] }],
    customKeycodes: [{ id: 'ck', name: 'HELLO', description: '', action: { type: 'send-string', text: 'ok' } }],
    tapHolds: [
      {
        id: 'th',
        keycodes: [q('LSFT_T(KC_F)')],
        holdOnByLanguage: [
          { language: 'en', keys: [q('KC_J')] },
          { language: 'ru', keys: [q('KC_P')] },
        ],
      },
    ],
    firmware: {
      ...p.firmware,
      textRoute: 'own-program',
      layerKeysOnTop: true,
      autoRepeat: { delay: 300, rate: 50 },
      custom: {
        'keymap.c': [
          '// The “program”: what it was asked to type, and the languages it was asked to switch to.',
          'char    host_text[256];',
          'char    host_switches[16];',
          'void navi_type_text_user(const char *text) {',
          '    strncat(host_text, text, sizeof host_text - strlen(host_text) - 1);',
          '}',
          'void navi_switch_language_user(uint8_t language) {',
          "    char s[2] = {(char)('0' + language), 0};",
          '    strncat(host_switches, s, sizeof host_switches - strlen(host_switches) - 1);',
          '}',
        ].join('\n'),
      },
    },
  };
}

const write = (dir: string, p: Project) => {
  const res = generateKeymap({ project: p, keymap: activeKeymap(p), spec, via: false, encoderCount: 0 });
  const errors = res.issues.filter((i) => i.level === 'error');
  if (errors.length) throw new Error(JSON.stringify(errors));
  mkdirSync(dir, { recursive: true });
  for (const f of res.files) writeFileSync(join(dir, f.name), f.text);
};

it.skipIf(!out)('writes the generated keymap files for the QMK host tests', () => {
  write(out!, hostProject());
  write(join(out!, 'languages'), languageHostProject());
});
