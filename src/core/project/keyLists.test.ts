/**
 * Key lists and multi-keycode tap-hold settings (schema 11): hold keys several settings share live in one named list,
 * and one setting can list several MT / LT keycodes.
 */
import { describe, expect, it } from 'vitest';
import { parseQmk } from '../keycodes/codec';
import { loadSpec } from '../keycodes/spec';
import { generateKeymap } from '../qmk/generate';
import { createDilemmaProject } from './factory';
import { migrateProject } from './migrate';
import { activeKeymap, removeLayer, setKeycodes } from './ops';
import { checkTapHolds, effectiveTapHolds, keyListCNames, keyListUsage, removeKeyList } from './tapHolds';
import { PROJECT_SCHEMA_VERSION, type KeyList, type Project, type TapHoldSetting } from './types';
import { parseProjectText, serializeProject, validateProject } from './validate';

const spec = loadSpec('latest');
const q = (s: string) => parseQmk(spec, s);

function base(tapHolds: TapHoldSetting[] = [], keyLists: KeyList[] = []): Project {
  let p = createDilemmaProject();
  const km = activeKeymap(p);
  p = setKeycodes(p, km.id, 0, [[1, 1]], q('LSFT_T(KC_F)'));
  p = setKeycodes(p, km.id, 0, [[1, 2]], q('LSFT_T(KC_J)'));
  p = setKeycodes(p, km.id, 0, [[4, 4]], q('LT(2, KC_SPC)'));
  return { ...p, tapHolds, keyLists };
}
const symbols: KeyList = { id: 'kl_sym', name: 'Symbols', keys: [q('KC_EXLM'), q('KC_EQL')] };
const shifts: TapHoldSetting = { id: 'th_s', keycodes: [q('LSFT_T(KC_F)'), q('LSFT_T(KC_J)')], tappingTerm: 180, holdOnKeys: [q('KC_SLSH')], holdOnLists: ['kl_sym'] };
const gen = (p: Project) => generateKeymap({ project: p, keymap: activeKeymap(p), spec, via: false, encoderCount: 0 });
const keymapC = (p: Project) => gen(p).files.find((f) => f.name === 'keymap.c')?.text ?? '';
const hookOf = (c: string, name: string) => {
  const from = c.indexOf(`${name}(uint16_t keycode`);
  return c.slice(from, c.indexOf('\n}\n', from));
};

describe('schema 11', () => {
  it('a format 10 file: each setting keycode becomes keycodes, no key lists', () => {
    const v10 = JSON.parse(serializeProject(base()));
    v10.schemaVersion = 10;
    delete v10.keyLists;
    v10.tapHolds = [{ id: 'a', keycode: q('LSFT_T(KC_F)'), tappingTerm: 180, holdOnKeys: [q('KC_SLSH')] }];
    expect(PROJECT_SCHEMA_VERSION).toBe(11);
    expect(migrateProject(v10)).toMatchObject({ from: 10, data: { schemaVersion: 11, keyLists: [] } });
    const { project, issues } = validateProject(v10);
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(project!.tapHolds).toEqual([{ id: 'a', keycodes: [q('LSFT_T(KC_F)')], tappingTerm: 180, holdOnKeys: [q('KC_SLSH')] }]);
    expect(project!.keyLists).toEqual([]);
  });

  it('lists and multi-keycode settings survive a save and load', () => {
    const p = base([shifts], [symbols]);
    const back = parseProjectText(serializeProject(p)).project!;
    expect(back.tapHolds).toEqual(p.tapHolds);
    expect(back.keyLists).toEqual(p.keyLists);
  });

  it('untrusted JSON: a pointer to a missing list is dropped with a warning', () => {
    const raw = JSON.parse(serializeProject(base([{ ...shifts, holdOnLists: ['kl_sym', 'kl_gone'] }], [symbols])));
    const { project, issues } = validateProject(raw);
    expect(project!.tapHolds[0].holdOnLists).toEqual(['kl_sym']);
    expect(issues.some((i) => i.level === 'warning' && i.path === 'tapHolds[0].holdOnLists[1]')).toBe(true);
  });
});

describe('checks', () => {
  it('a keycode in two settings is an error; the generator uses the first', () => {
    const p = base([shifts, { id: 'th_2', keycodes: [q('LSFT_T(KC_J)')], tappingTerm: 300 }], [symbols]);
    expect(checkTapHolds(spec, p).some((i) => i.level === 'error')).toBe(true);
    expect(effectiveTapHolds(spec, p).map((s) => s.keycodes)).toEqual([[q('LSFT_T(KC_F)'), q('LSFT_T(KC_J)')]]);
  });

  it('a list needs a unique name', () => {
    expect(checkTapHolds(spec, base([], [{ ...symbols, name: '' }])).some((i) => i.level === 'error')).toBe(true);
    expect(checkTapHolds(spec, base([], [symbols, { ...symbols, id: 'kl_2', name: 'symbols' }])).some((i) => i.level === 'error')).toBe(true);
    expect(checkTapHolds(spec, base([shifts], [symbols]))).toEqual([]);
  });
});

describe('edits', () => {
  it('deleting a list removes it from every setting that used it', () => {
    const p = base([shifts, { id: 'th_l', keycodes: [q('LT(2, KC_SPC)')], holdOnLists: ['kl_sym'] }], [symbols]);
    expect(keyListUsage(p, 'kl_sym')).toBe(2);
    const after = removeKeyList(p, 'kl_sym');
    expect(after.keyLists).toEqual([]);
    expect(after.tapHolds[0].holdOnLists).toBeUndefined();
    expect(after.tapHolds[0].holdOnKeys).toEqual([q('KC_SLSH')]);
    expect('holdOnLists' in after.tapHolds[1]).toBe(false);
  });

  it('deleting a layer drops its LT keycodes from settings and its keys from lists', () => {
    const p = base([{ id: 'th_l', keycodes: [q('LT(2, KC_SPC)'), q('LSFT_T(KC_F)')], tappingTerm: 200 }], [{ ...symbols, keys: [q('MO(2)'), q('KC_EXLM')] }]);
    const after = removeLayer(p, activeKeymap(p).id, spec, 2);
    expect(after.tapHolds[0].keycodes).toEqual([q('LSFT_T(KC_F)')]);
    expect(after.keyLists[0].keys).toEqual([q('KC_EXLM')]);
  });

  it('C names: navi_keys_<name>, unique', () => {
    const names = keyListCNames([symbols, { ...symbols, id: 'b', name: 'Symbols!' }, { ...symbols, id: 'c', name: '' }]);
    expect([...names.values()]).toEqual(['navi_keys_symbols', 'navi_keys_symbols_2', 'navi_keys_3']);
  });
});

describe('generated C', () => {
  it('several keycodes share one case body', () => {
    const c = keymapC(base([shifts], [symbols]));
    expect(hookOf(c, 'get_tapping_term')).toContain('        case LSFT_T(KC_F):\n        case LSFT_T(KC_J): return 180;');
  });

  it('a list is one static array; the hold test looks it up next to the single keys', () => {
    const c = keymapC(base([shifts], [symbols]));
    expect(c).toContain('static const uint16_t navi_keys_symbols[] = { KC_EXLM, KC_EQL };');
    expect(c.match(/navi_keys_symbols\[\] =/g)).toHaveLength(1);
    const hook = hookOf(c, 'get_hold_on_other_key_press');
    expect(hook).toContain('case LSFT_T(KC_F):\n        case LSFT_T(KC_J):');
    expect(hook).toContain('if (navi_last_pressed == KC_SLSH || NAVI_IN_KEYS(navi_keys_symbols, navi_last_pressed)) return true;');
    // The replay fix asks the same question about the first interrupter.
    expect(c).toContain('NAVI_IN_KEYS(navi_keys_symbols, navi_interrupter[row][col])');
    // Defined before its first use.
    expect(c.indexOf('navi_keys_symbols[] =')).toBeLessThan(c.indexOf('NAVI_IN_KEYS(navi_keys_symbols'));
  });

  it('a list alone (no single keys) still turns on the hold tracking', () => {
    const c = keymapC(base([{ id: 'a', keycodes: [q('LSFT_T(KC_F)')], holdOnLists: ['kl_sym'] }], [symbols]));
    expect(c).toContain('navi_last_pressed = keycode;');
    expect(hookOf(c, 'get_hold_on_other_key_press')).toContain('if (NAVI_IN_KEYS(navi_keys_symbols, navi_last_pressed)) return true;');
  });

  it('unused and empty lists write no C (an unused static array fails QMK\'s -Werror)', () => {
    const unused = keymapC(base([{ id: 'a', keycodes: [q('LSFT_T(KC_F)')], tappingTerm: 180 }], [symbols]));
    expect(unused).not.toContain('navi_keys_');
    expect(unused).not.toContain('navi_in_keys');
    const empty = keymapC(base([{ id: 'a', keycodes: [q('LSFT_T(KC_F)')], holdOnLists: ['kl_sym'] }], [{ ...symbols, keys: [] }]));
    expect(empty).not.toContain('navi_keys_');
    expect(empty).not.toContain('get_hold_on_other_key_press');
  });

  it('own code may not reuse the list names', () => {
    const p = base([shifts], [symbols]);
    expect(gen(p).symbols.has('navi_keys_symbols')).toBe(true);
    expect(gen(p).symbols.has('navi_in_keys')).toBe(true);
    const own: Project = { ...p, firmware: { ...p.firmware, custom: { 'keymap.c': 'static const uint16_t navi_keys_symbols[] = { KC_A };' } } };
    expect(gen(own).issues.some((i) => i.level === 'error' && /navi_keys_symbols/.test(i.message.en))).toBe(true);
  });
});
