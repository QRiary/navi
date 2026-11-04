/**
 * Per-key tap-hold settings (step 7a): written before the build, they are the spec.
 * A setting belongs to a keycode (every key with that MT / LT shares it), like QMK's own get_*() functions.
 */
import { describe, expect, it } from 'vitest';
import { parseQmk } from '../keycodes/codec';
import { loadSpec } from '../keycodes/spec';
import { generateKeymap } from '../qmk/generate';
import { createDilemmaProject } from './factory';
import { migrateProject } from './migrate';
import { activeKeymap, moveLayer, removeLayer, setKeycodes } from './ops';
import { checkTapHolds, isTapHoldKeycode, tapHoldUsage, TAP_HOLD_TERM_MAX, TAP_HOLD_TERM_MIN, HOLD_ON_KEYS_MAX } from './tapHolds';
import { PROJECT_SCHEMA_VERSION, type Project, type TapHoldSetting } from './types';
import { parseProjectText, serializeProject, validateProject } from './validate';

const spec = loadSpec('latest');
const q = (s: string) => parseQmk(spec, s);
const setting = (expr: string, extra: Partial<TapHoldSetting> = {}, id = expr.replace(/\W/g, '_')): TapHoldSetting => ({ id, keycode: q(expr), ...extra });

function base(): Project {
  let p = createDilemmaProject();
  const km = activeKeymap(p);
  p = setKeycodes(p, km.id, 0, [[1, 1]], q('LSFT_T(KC_F)'));
  p = setKeycodes(p, km.id, 0, [[1, 2]], q('LSFT_T(KC_F)'));
  p = setKeycodes(p, km.id, 0, [[4, 4]], q('LT(2, KC_SPC)'));
  p = setKeycodes(p, km.id, 1, [[1, 3]], q('LCTL_T(KC_D)'));
  return p;
}
const withSettings = (tapHolds: TapHoldSetting[], pipeline = false, p = base()): Project => ({
  ...p,
  tapHolds,
  firmware: { ...p.firmware, pipeline: pipeline ? { enabled: true, headers: [] } : undefined },
});
const gen = (p: Project) => generateKeymap({ project: p, keymap: activeKeymap(p), spec, via: false, encoderCount: 0 });
const file = (p: Project, name: string) => gen(p).files.find((f) => f.name === name)?.text ?? '';
const errors = (p: Project) => gen(p).issues.filter((i) => i.level === 'error');

describe('tap-hold settings: model', () => {
  it('schema 7: a format 6 file opens with no settings', () => {
    const v6 = JSON.parse(serializeProject(base()));
    v6.schemaVersion = 6;
    delete v6.tapHolds;
    expect(PROJECT_SCHEMA_VERSION).toBe(7);
    expect(migrateProject(v6)).toMatchObject({ from: 6, data: { schemaVersion: 7, tapHolds: [] } });
    const { project, issues } = validateProject(v6);
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(project?.tapHolds).toEqual([]);
  });

  it('new projects have none; settings survive a save and load', () => {
    expect(createDilemmaProject().tapHolds).toEqual([]);
    const p = withSettings([setting('LSFT_T(KC_F)', { flavor: 'hold-preferred', tappingTerm: 180, quickTapTerm: 0, holdOnKeys: [q('KC_SLSH'), q('KC_COMM')] })]);
    expect(parseProjectText(serializeProject(p)).project?.tapHolds).toEqual(p.tapHolds);
  });

  it('untrusted JSON: an unknown flavor and out-of-range terms are reported', () => {
    const raw = JSON.parse(serializeProject(base()));
    raw.tapHolds = [{ id: 'a', keycode: q('LSFT_T(KC_F)'), flavor: 'sometimes', tappingTerm: 'x' }];
    const { issues } = validateProject(raw);
    expect(issues.some((i) => i.path.startsWith('tapHolds[0]'))).toBe(true);
  });

  it('only mod-tap and layer-tap keycodes take settings', () => {
    expect(isTapHoldKeycode(spec, q('LSFT_T(KC_F)'))).toBe(true);
    expect(isTapHoldKeycode(spec, q('MT(MOD_LCTL | MOD_LALT, KC_A)'))).toBe(true);
    expect(isTapHoldKeycode(spec, q('LT(2, KC_SPC)'))).toBe(true);
    for (const s of ['KC_A', 'MO(1)', 'LM(1, MOD_LCTL)', 'C(KC_C)', 'TD(0)', 'OSM(MOD_LSFT)']) expect(isTapHoldKeycode(spec, q(s))).toBe(false);
  });

  it('usage counts every key with that keycode, on every layer', () => {
    const p = base();
    expect(tapHoldUsage(p, q('LSFT_T(KC_F)'))).toBe(2);
    expect(tapHoldUsage(p, q('LCTL_T(KC_D)'))).toBe(1);
    expect(tapHoldUsage(p, q('LALT_T(KC_S)'))).toBe(0);
  });
});

describe('tap-hold settings: checks', () => {
  const issuesOf = (list: TapHoldSetting[]) => checkTapHolds(spec, withSettings(list));

  it('a valid setting has no issues', () => {
    expect(issuesOf([setting('LSFT_T(KC_F)', { flavor: 'balanced', tappingTerm: 180, quickTapTerm: 0, holdOnKeys: [q('KC_SLSH')] })])).toEqual([]);
  });

  it('errors: not a tap-hold keycode, a second setting for the same keycode, terms out of range, too many hold keys', () => {
    expect(issuesOf([setting('KC_A')]).some((i) => i.level === 'error')).toBe(true);
    expect(issuesOf([setting('LSFT_T(KC_F)', {}, 'a'), setting('LSFT_T(KC_F)', {}, 'b')]).some((i) => i.level === 'error')).toBe(true);
    expect(issuesOf([setting('LSFT_T(KC_F)', { tappingTerm: TAP_HOLD_TERM_MIN - 1 })]).some((i) => i.level === 'error')).toBe(true);
    expect(issuesOf([setting('LSFT_T(KC_F)', { tappingTerm: TAP_HOLD_TERM_MAX + 1 })]).some((i) => i.level === 'error')).toBe(true);
    expect(issuesOf([setting('LSFT_T(KC_F)', { quickTapTerm: -1 })]).some((i) => i.level === 'error')).toBe(true);
    expect(issuesOf([setting('LSFT_T(KC_F)', { quickTapTerm: 0 })])).toEqual([]);
    const many = Array.from({ length: HOLD_ON_KEYS_MAX + 1 }, (_, i) => 4 + i);
    expect(issuesOf([setting('LSFT_T(KC_F)', { holdOnKeys: many })]).some((i) => i.level === 'error')).toBe(true);
  });

  it('warning: a setting for a keycode no key uses (it does nothing)', () => {
    const issues = issuesOf([setting('LALT_T(KC_S)', { tappingTerm: 180 })]);
    expect(issues.some((i) => i.level === 'warning')).toBe(true);
    expect(issues.some((i) => i.level === 'error')).toBe(false);
  });

  it('the generator reports the same issues', () => {
    expect(errors(withSettings([setting('KC_A', { tappingTerm: 180 })])).length).toBeGreaterThan(0);
  });
});

describe('tap-hold settings: generated C', () => {
  it('nothing is generated without settings (no per-key defines, no hooks)', () => {
    const p = withSettings([]);
    const c = file(p, 'keymap.c');
    const cfg = file(p, 'config.h');
    for (const s of ['get_quick_tap_term', 'get_hold_on_other_key_press', 'get_permissive_hold', 'pre_process_record_user']) expect(c).not.toContain(s);
    for (const d of ['QUICK_TAP_TERM_PER_KEY', 'HOLD_ON_OTHER_KEY_PRESS_PER_KEY', 'PERMISSIVE_HOLD_PER_KEY']) expect(cfg).not.toContain(d);
  });

  it('a setting with nothing set generates nothing either', () => {
    const c = file(withSettings([setting('LSFT_T(KC_F)')]), 'keymap.c');
    expect(c).not.toContain('get_tapping_term');
    expect(c).not.toContain('get_hold_on_other_key_press');
  });

  it('tapping term per key: one case per keycode, beside the tap dance terms', () => {
    const p = { ...withSettings([setting('LSFT_T(KC_F)', { tappingTerm: 180 }), setting('LT(2, KC_SPC)', { tappingTerm: 220 })]) };
    const withTd: Project = { ...p, tapDances: [{ id: 't', index: 0, name: 'TD_ESC', tap: q('KC_ESC'), hold: 0, doubleTap: q('KC_CAPS'), tapHold: 0, tappingTerm: 250 }] };
    const c = file(withTd, 'keymap.c');
    expect(c).toContain('uint16_t get_tapping_term(uint16_t keycode, keyrecord_t *record) {');
    expect(c).toContain('case LSFT_T(KC_F): return 180;');
    expect(c).toMatch(/case LT\(L_\w+, KC_SPC\): return 220;/);
    expect(c).toContain('case TD(TD_ESC): return 250;');
    expect(c.match(/get_tapping_term\(/g)?.length).toBe(1);
    expect(file(withTd, 'config.h')).toContain('#define TAPPING_TERM_PER_KEY');
  });

  it('tapping term per key alone (no tap dance) still turns on TAPPING_TERM_PER_KEY', () => {
    const p = withSettings([setting('LSFT_T(KC_F)', { tappingTerm: 180 })]);
    expect(file(p, 'config.h')).toContain('#define TAPPING_TERM_PER_KEY');
    expect(file(p, 'keymap.c')).toContain('default: return TAPPING_TERM;');
  });

  it('quick tap term per key, 0 allowed (tap then hold = hold)', () => {
    const p = withSettings([setting('LSFT_T(KC_F)', { quickTapTerm: 0 })]);
    const c = file(p, 'keymap.c');
    expect(c).toContain('uint16_t get_quick_tap_term(uint16_t keycode, keyrecord_t *record) {');
    expect(c).toContain('case LSFT_T(KC_F): return 0;');
    expect(c).toContain('return QUICK_TAP_TERM;');
    expect(file(p, 'config.h')).toContain('#define QUICK_TAP_TERM_PER_KEY');
  });

  it('flavors: hold-preferred = hold on other key press, balanced = permissive hold, tap-preferred = neither; unset keys follow the global defines', () => {
    const p = withSettings([
      setting('LSFT_T(KC_F)', { flavor: 'hold-preferred' }),
      setting('LCTL_T(KC_D)', { flavor: 'balanced' }),
      setting('LT(2, KC_SPC)', { flavor: 'tap-preferred' }),
    ]);
    const c = file(p, 'keymap.c');
    const cfg = file(p, 'config.h');
    expect(cfg).toContain('#define HOLD_ON_OTHER_KEY_PRESS_PER_KEY');
    expect(cfg).toContain('#define PERMISSIVE_HOLD_PER_KEY');
    const hookp = c.slice(c.indexOf('bool get_hold_on_other_key_press('), c.indexOf('}', c.indexOf('bool get_hold_on_other_key_press(')) + 200);
    expect(hookp).toContain('case LSFT_T(KC_F): return true;');
    expect(hookp).toContain('case LCTL_T(KC_D): return false;');
    expect(hookp).toMatch(/case LT\(L_\w+, KC_SPC\): return false;/);
    const perm = c.slice(c.indexOf('bool get_permissive_hold('));
    expect(perm).toContain('case LCTL_T(KC_D): return true;');
    expect(perm).toMatch(/case LT\(L_\w+, KC_SPC\): return false;/);
    // The *_PER_KEY define replaces the global one in QMK: the default branch keeps the global behavior.
    expect(c).toMatch(/#ifdef HOLD_ON_OTHER_KEY_PRESS\s+return true;\s+#else\s+return false;\s+#endif/);
    expect(c).toMatch(/#ifdef PERMISSIVE_HOLD\s+return true;\s+#else\s+return false;\s+#endif/);
  });

  it('hold keys: a hold as soon as one of them is pressed, from the key pressed last (pre_process_record)', () => {
    const p = withSettings([setting('LSFT_T(KC_F)', { holdOnKeys: [q('KC_SLSH'), q('KC_COMM')] })]);
    const c = file(p, 'keymap.c');
    expect(c).toContain('bool pre_process_record_user(uint16_t keycode, keyrecord_t *record) {');
    expect(c).toMatch(/navi_last_pressed = keycode;/);
    const hookp = c.slice(c.indexOf('bool get_hold_on_other_key_press('));
    expect(hookp).toContain('KC_SLSH');
    expect(hookp).toContain('KC_COMM');
    expect(file(p, 'config.h')).toContain('#define HOLD_ON_OTHER_KEY_PRESS_PER_KEY');
  });

  it('hold keys plus a flavor: a listed key forces the hold, any other key follows the flavor', () => {
    const p = withSettings([setting('LSFT_T(KC_F)', { flavor: 'tap-preferred', holdOnKeys: [q('KC_SLSH')] })]);
    const c = file(p, 'keymap.c');
    const hookp = c.slice(c.indexOf('bool get_hold_on_other_key_press('));
    const body = hookp.slice(0, hookp.indexOf('\n}\n'));
    expect(body).toContain('KC_SLSH');
    expect(body.indexOf('KC_SLSH')).toBeLessThan(body.lastIndexOf('return false;'));
  });

  it('no setting changes the keymap itself: keys stay plain MT / LT', () => {
    const before = file(withSettings([]), 'keymap.c');
    const after = file(withSettings([setting('LSFT_T(KC_F)', { tappingTerm: 180, flavor: 'balanced' })]), 'keymap.c');
    const keymapOf = (c: string) => c.slice(c.indexOf('const uint16_t PROGMEM keymaps'), c.indexOf('};', c.indexOf('const uint16_t PROGMEM keymaps')));
    expect(keymapOf(after)).toBe(keymapOf(before));
  });

  it('own code may not define the hooks NAVI generates', () => {
    const p = withSettings([setting('LSFT_T(KC_F)', { quickTapTerm: 0, flavor: 'balanced', holdOnKeys: [q('KC_SLSH')] })]);
    const symbols = gen(p).symbols;
    for (const s of ['get_quick_tap_term', 'get_hold_on_other_key_press', 'get_permissive_hold', 'pre_process_record_user']) expect(symbols.has(s)).toBe(true);
    const own: Project = { ...p, firmware: { ...p.firmware, custom: { 'keymap.c': 'uint16_t get_quick_tap_term(uint16_t keycode, keyrecord_t *record) { return 0; }' } } };
    expect(errors(own).length).toBeGreaterThan(0);
  });
});

describe('tap-hold settings: own pipeline', () => {
  it('*_navi versions, always defined (stubs when unused), declared in navi.h', () => {
    const none = withSettings([], true);
    const c = file(none, 'keymap.c');
    const h = file(none, 'navi.h');
    for (const fn of ['get_quick_tap_term_navi', 'get_hold_on_other_key_press_navi', 'get_permissive_hold_navi', 'pre_process_record_navi']) {
      expect(c).toContain(`${fn}(`);
      expect(h).toContain(`${fn}(`);
    }
    // A stub keeps QMK's behavior: the global defines decide.
    expect(c).toMatch(/uint16_t get_quick_tap_term_navi\(uint16_t keycode, keyrecord_t \*record\) \{\s+return QUICK_TAP_TERM;\s+\}/);
    expect(c).toMatch(/bool pre_process_record_navi\(uint16_t keycode, keyrecord_t \*record\) \{[\s\S]*?return true;\s+\}/);
  });

  it('the QMK hooks are the user\'s: no plain get_*() in keymap.c, a warning says which to forward', () => {
    const p = withSettings([setting('LSFT_T(KC_F)', { quickTapTerm: 0, flavor: 'balanced', holdOnKeys: [q('KC_SLSH')] })], true);
    const c = file(p, 'keymap.c');
    expect(c).not.toMatch(/\bget_quick_tap_term\(/);
    expect(c).not.toMatch(/\bget_hold_on_other_key_press\(/);
    expect(c).not.toMatch(/\bpre_process_record_user\(/);
    expect(c).toContain('case LSFT_T(KC_F): return 0;');
    const warnings = gen(p).issues.filter((i) => i.level === 'warning').map((i) => i.where);
    for (const hook of ['get_quick_tap_term', 'get_hold_on_other_key_press', 'get_permissive_hold', 'pre_process_record_user']) expect(warnings).toContain(`own pipeline: ${hook}()`);
  });
});

describe('tap-hold settings follow layer changes', () => {
  it('a layer reorder renumbers LT keycodes and the hold keys', () => {
    let p = withSettings([setting('LT(2, KC_SPC)', { tappingTerm: 220, holdOnKeys: [q('MO(2)')] })]);
    const km = activeKeymap(p);
    p = moveLayer(p, km.id, spec, 2, 1);
    expect(p.tapHolds[0].keycode).toBe(q('LT(1, KC_SPC)'));
    expect(p.tapHolds[0].holdOnKeys).toEqual([q('MO(1)')]);
  });

  it('deleting a layer drops the settings of its LT keys and the hold keys that point at it', () => {
    let p = withSettings([setting('LT(2, KC_SPC)', { tappingTerm: 220 }), setting('LSFT_T(KC_F)', { holdOnKeys: [q('MO(2)'), q('KC_SLSH')] })]);
    const km = activeKeymap(p);
    p = removeLayer(p, km.id, spec, 2);
    expect(p.tapHolds.map((t) => t.keycode)).toEqual([q('LSFT_T(KC_F)')]);
    expect(p.tapHolds[0].holdOnKeys).toEqual([q('KC_SLSH')]);
  });
});
