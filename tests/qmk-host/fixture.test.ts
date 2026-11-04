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
import type { HoldAction, Project } from '../../src/core/project/types';
import { generateKeymap } from '../../src/core/qmk/generate';

const out = process.env.NAVI_QMK_OUT;
const spec = loadSpec('latest');
const q = (s: string) => parseQmk(spec, s);

/** Row 0 of layer 0 (the test matrix is 4x10); qmk_host_test.cpp names the same positions. */
export function hostProject(): Project {
  let p = createBlankProject('qmk host test', 4, 10, false);
  const id = activeKeymap(p).id;
  const put = (layer: number, col: number, v: number) => (p = setKeycodes(p, id, layer, [[0, col]], v));
  const putTh = (col: number, tap: string, hold: HoldAction) => {
    const r = ensureTapHold(spec, p, q(tap), hold);
    p = r.project;
    put(0, col, r.keycode);
    return r.keycode;
  };
  put(0, 0, q('LT(1, KC_SPC)'));
  put(0, 1, q('LSFT_T(KC_P)'));
  put(0, 2, q('KC_C'));
  putTh(3, 'C(KC_Z)', { type: 'layer', layer: 2, mods: 0x01 });
  const altStandIn = putTh(4, 'S(KC_1)', { type: 'mods', mods: 0x04 });
  putTh(5, 'KC_A', { type: 'key', keycode: q('C(KC_X)') });
  put(0, 6, q('LCTL_T(KC_D)'));
  put(0, 7, q('KC_E'));
  put(2, 2, q('KC_V'));
  p = pruneTapHoldActions(p);
  return {
    ...p,
    tapHolds: [
      { id: 'th-p', keycode: q('LSFT_T(KC_P)'), flavor: 'hold-preferred' },
      { id: 'th-alt', keycode: altStandIn, flavor: 'hold-preferred' },
      { id: 'th-d', keycode: q('LCTL_T(KC_D)'), holdOnKeys: [q('KC_C')] },
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
