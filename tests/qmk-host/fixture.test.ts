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
  // Combos (positions 24…39): layer keys, then the keys of each scenario
  const combo = (n: number): [number, number] => [Math.floor(n / 10), n % 10];
  ([[30, 'MO(1)'], [31, 'MO(2)'], [32, 'KC_Q'], [33, 'KC_W'], [34, 'KC_R'], [35, 'KC_T'], [36, 'KC_Y'], [37, 'KC_U'], [38, 'KC_I'], [39, 'KC_O'],
    [24, 'LSFT_T(KC_A)'], [25, 'KC_K'], [26, 'KC_L'], [27, 'KC_F'], [28, 'KC_H']] as const).forEach(([n, k]) => put(0, n, q(k)));
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
  ];
  put(0, 13, q('KC_N'));
  put(1, 13, q('KC_A'));
  put(1, 14, q('KC_B'));
  put(0, 21, q('KC_LSFT'));
  const refs: Record<number, 'self'> = { 1: 'self', 2: 'self' };
  return {
    ...p,
    tapDances,
    customKeycodes: [{ id: 'ck-host', name: 'HOST_KEY', description: 'handled by the own lines', action: { type: 'none' } }],
    firmware: {
      ...p.firmware,
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
    ],
    tapHolds: [
      { id: 'th-p', keycode: q('LSFT_T(KC_P)'), flavor: 'hold-preferred' },
      { id: 'th-alt', keycode: altStandIn, flavor: 'hold-preferred' },
      { id: 'th-d', keycode: q('LCTL_T(KC_D)'), holdOnKeys: [q('KC_C')] },
      { id: 'th-a', keycode: q('LSFT_T(KC_A)'), holdOnKeys: [q('KC_Z')] },
    ],
  };
}

it.skipIf(!out)('writes the generated keymap files for the QMK host tests', () => {
  const p = hostProject();
  const res = generateKeymap({ project: p, keymap: activeKeymap(p), spec, via: false, encoderCount: 0 });
  const errors = res.issues.filter((i) => i.level === 'error');
  if (errors.length) throw new Error(JSON.stringify(errors));
  mkdirSync(out!, { recursive: true });
  for (const f of res.files) writeFileSync(join(out!, f.name), f.text);
});
