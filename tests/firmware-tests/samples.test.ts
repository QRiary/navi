/**
 * Writes the sample keymap folders the firmware test runner's host check plays (scripts/firmware-tests-host.mjs):
 * NAVI-generated keymap files plus a hand-written navi_tests.txt each. Skipped unless NAVI_FW_TESTS_OUT names the folder
 * to write to: the script sets it.
 *
 *   plain     4 x 10: taps, a held mod-tap, a layer-tap hold, a combo, mouse / media / Ctrl keys, one wrong expectation
 *   pipeline  own pipeline: the user's rules.mk, config.h and own.c (turns KC_X into "y") compile with NAVI's files
 *   broken    own pipeline whose own.c calls an RGB Matrix function: the test build has no RGB Matrix, so it can't build
 *   split     the Dilemma template (a split board, RGB Matrix, bootloader reboot), the user's rules.mk turning
 *             SPLIT_KEYBOARD on and own lines asking which half they run on
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { it } from 'vitest';
import { parseQmk } from '../../src/core/keycodes/codec';
import { loadSpec } from '../../src/core/keycodes/spec';
import { createBlankProject, createDilemmaProject } from '../../src/core/project/factory';
import { activeKeymap, setKeycodes } from '../../src/core/project/ops';
import type { Project } from '../../src/core/project/types';
import { generateKeymap } from '../../src/core/qmk/generate';

const out = process.env.NAVI_FW_TESTS_OUT;
const spec = loadSpec('latest');
const q = (s: string) => parseQmk(spec, s);

function withKeys(p: Project, keys: [layer: number, row: number, col: number, keycode: string][]): Project {
  const id = activeKeymap(p).id;
  for (const [layer, row, col, k] of keys) p = setKeycodes(p, id, layer, [[row, col]], q(k));
  return p;
}

function write(dir: string, p: Project, tests: string[], own: Record<string, string> = {}) {
  const res = generateKeymap({ project: p, keymap: activeKeymap(p), spec, via: false, encoderCount: 0 });
  const errors = res.issues.filter((i) => i.level === 'error');
  if (errors.length) throw new Error(JSON.stringify(errors));
  mkdirSync(dir, { recursive: true });
  for (const f of res.files) writeFileSync(join(dir, f.name), f.text);
  for (const [name, text] of Object.entries(own)) writeFileSync(join(dir, name), text);
  const file = ['# navi_tests.txt: a hand-written sample for the firmware test runner.', '[keys]', '[not checked]', '[tests]', ...tests, ''];
  writeFileSync(join(dir, 'navi_tests.txt'), file.join('\n'));
}

/** The plain sample's scenarios; the last one expects the wrong letter on purpose (line 19 of the file). */
export const PLAIN_TESTS = [
  'r0c0 r0c1 => ab',
  'r0c0*3 => aaa',
  'r0c2 => c',
  'r0c2:300 => ⟨LSFT⟩',
  '+r0c2 wait:300 r0c0 -r0c2 => A',
  'r0c3 => d',
  '+r0c3 wait:300 r0c0 -r0c3 => 1',
  'r0c4+r0c5 => ⟨ESC⟩',
  'r0c4 r0c5 => ef',
  'r1c0 => ⟨BTN:1⟩',
  'r1c1 => ⟨VOLU⟩',
  'r1c2 => ⟨ENT⟩',
  'r1c3 => ⟨C-z⟩',
  'r1c4 => !',
  'r0c1 => x',
];

function plain(): Project {
  const p = withKeys(createBlankProject('fw tests plain', 4, 10, false), [
    [0, 0, 0, 'KC_A'],
    [0, 0, 1, 'KC_B'],
    [0, 0, 2, 'LSFT_T(KC_C)'],
    [0, 0, 3, 'LT(1, KC_D)'],
    [0, 0, 4, 'KC_E'],
    [0, 0, 5, 'KC_F'],
    [0, 1, 0, 'MS_BTN1'],
    [0, 1, 1, 'KC_VOLU'],
    [0, 1, 2, 'KC_ENT'],
    [0, 1, 3, 'C(KC_Z)'],
    [0, 1, 4, 'S(KC_1)'],
    [1, 0, 0, 'KC_1'],
  ]);
  return { ...p, combos: [{ id: 'esc', name: 'CM_ESC', keys: [[0, 4], [0, 5]], result: q('KC_ESC') }] };
}

const PIPELINE_RULES = ['include $(dir $(lastword $(MAKEFILE_LIST)))navi_rules.mk', 'SRC += own.c', ''].join('\n');
const PIPELINE_CONFIG = ['#pragma once', '#include "navi_config.h"', ''].join('\n');
const ownC = (extra: string[]) =>
  [
    '#include "navi.h"',
    '',
    'bool process_record_user(uint16_t keycode, keyrecord_t *record) {',
    '    if (!process_record_navi(keycode, record)) return false;',
    ...extra,
    '    if (keycode == KC_X) {',
    '        if (record->event.pressed) tap_code(KC_Y);',
    '        return false;',
    '    }',
    '    return true;',
    '}',
    '',
  ].join('\n');

function pipeline(name: string): Project {
  const p = withKeys(createBlankProject(name, 4, 10, false), [
    [0, 0, 0, 'KC_A'],
    [0, 0, 1, 'KC_X'],
    [0, 0, 2, 'LSFT_T(KC_C)'],
  ]);
  return { ...p, firmware: { ...p.firmware, pipeline: { enabled: true, headers: [] } } };
}

function split(): Project {
  const p = withKeys(createDilemmaProject('fw tests split'), [
    [0, 0, 1, 'KC_Q'],
    [0, 5, 1, 'KC_P'],
  ]);
  return {
    ...p,
    firmware: {
      ...p.firmware,
      bootloaderReboot: true,
      custom: {
        'keymap.c': ['bool sample_on_left_half(void) {', '    return is_keyboard_left();', '}'].join('\n'),
        'rules.mk': 'SPLIT_KEYBOARD = yes',
      },
    },
  };
}

it.skipIf(!out)('writes the sample keymap folders for the firmware test runner', () => {
  write(join(out!, 'plain'), plain(), PLAIN_TESTS);
  const own = (extra: string[]) => ({ 'rules.mk': PIPELINE_RULES, 'config.h': PIPELINE_CONFIG, 'own.c': ownC(extra) });
  write(join(out!, 'pipeline'), pipeline('fw tests pipeline'), ['r0c0 => a', 'r0c1 => y', 'r0c2:300 => ⟨LSFT⟩'], own([]));
  write(join(out!, 'broken'), pipeline('fw tests broken'), ['r0c0 => a'], own(['    if (record->event.pressed) rgb_matrix_set_color(0, 255, 0, 0);']));
  write(join(out!, 'split'), split(), ['r0c1 r5c1 => qp']);
  // NAVI's own navi_tests.txt (firmware.tests on): the generator's expectations must hold on the firmware it wrote.
  writeGenerated(join(out!, 'generated-plain'), plain());
  writeGenerated(join(out!, 'generated-split'), split());
});

function writeGenerated(dir: string, p: Project) {
  const on = { ...p, firmware: { ...p.firmware, tests: true } };
  const res = generateKeymap({ project: on, keymap: activeKeymap(on), spec, via: false, encoderCount: 0 });
  const errors = res.issues.filter((i) => i.level === 'error');
  if (errors.length) throw new Error(JSON.stringify(errors));
  if (!res.files.some((f) => f.name === 'navi_tests.txt')) throw new Error('no navi_tests.txt generated');
  mkdirSync(dir, { recursive: true });
  for (const f of res.files) writeFileSync(join(dir, f.name), f.text);
}
