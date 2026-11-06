/**
 * Caps Word key rules (step 12, NAVI additions): which keys keep Caps Word on and which of them it shifts, on every
 * layer or only on some. Unset = QMK's own list (no generated code). The C is checked as text here; tests/qmk-host
 * plays it in QMK's test framework.
 */
import { describe, expect, it } from 'vitest';
import { parseQmk } from '../keycodes/codec';
import { loadSpec } from '../keycodes/spec';
import { CAPS_WORD_QMK_DEFAULT, checkCapsWordRules } from '../project/capsWord';
import { createBlankProject } from '../project/factory';
import { migrateProject } from '../project/migrate';
import { activeKeymap, addLayer, mapProjectKeycodes, moveLayer, removeLayer } from '../project/ops';
import { removeKeyList } from '../project/tapHolds';
import { parseProjectText, serializeProject, validateProject } from '../project/validate';
import { PROJECT_SCHEMA_VERSION, type CapsWordRule, type Project } from '../project/types';
import { generateKeymap } from './generate';

const spec = loadSpec('latest');
const q = (s: string) => parseQmk(spec, s);
const keys = (...names: string[]) => names.map(q);

/** Three layers: BASE (0), CYR (1, C name CYR), FN (2). */
function project(rules?: CapsWordRule[], over: (p: Project) => Project = (p) => p): Project {
  let p = createBlankProject('caps word', 4, 6, false);
  const id = activeKeymap(p).id;
  p = addLayer(p, id, 'CYR');
  p = addLayer(p, id, 'FN');
  p = { ...p, keymaps: p.keymaps.map((k) => ({ ...k, layers: k.layers.map((l, i) => (i === 1 ? { ...l, cName: 'CYR' } : l)) })) };
  p = { ...p, firmware: { ...p.firmware, ...(rules ? { capsWordRules: rules } : {}) } };
  return over(p);
}
const gen = (p: Project) => generateKeymap({ project: p, keymap: activeKeymap(p), spec, via: false, encoderCount: 0 });
const file = (res: ReturnType<typeof gen>, name: string) => res.files.find((f) => f.name === name)!.text;
const keymapC = (res: ReturnType<typeof gen>) => file(res, 'keymap.c').split('// ── your own lines')[0];
/** The body of a C function, from its signature line to the closing brace at column 0. */
const body = (c: string, signature: string) => {
  const start = c.indexOf(signature);
  expect(start, signature).toBeGreaterThanOrEqual(0);
  return c.slice(start, c.indexOf('\n}', start) + 2);
};
const pipeline = (p: Project): Project => ({ ...p, firmware: { ...p.firmware, pipeline: { enabled: true, headers: [] } } });

const letters = keys(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l) => `KC_${l}`));
/** The user's case: letters shifted, digits / backspace / delete keep it on, five punctuation keys are letters on CYR. */
const qriaryLike: CapsWordRule[] = [
  { id: 'r1', keys: letters, shift: true },
  { id: 'r2', keys: [...keys('KC_1', 'KC_2', 'KC_3', 'KC_4', 'KC_5', 'KC_6', 'KC_7', 'KC_8', 'KC_9', 'KC_0'), ...keys('KC_BSPC', 'KC_DEL')], shift: false },
  { id: 'r3', keys: keys('KC_DOT', 'KC_COMM', 'KC_LBRC', 'KC_RBRC'), shift: true, layers: [1] },
];

describe('caps word rules: the QMK default', () => {
  it('is QMK’s own list: letters and minus shifted; digits, backspace, delete, underscore keep it on', () => {
    expect(CAPS_WORD_QMK_DEFAULT.map((r) => ({ keys: [...r.keys].sort((a, b) => a - b), shift: r.shift, layers: r.layers }))).toEqual([
      { keys: [...letters, q('KC_MINS')].sort((a, b) => a - b), shift: true, layers: undefined },
      { keys: keys('KC_1', 'KC_2', 'KC_3', 'KC_4', 'KC_5', 'KC_6', 'KC_7', 'KC_8', 'KC_9', 'KC_0', 'KC_BSPC', 'KC_DEL', 'KC_UNDS').sort((a, b) => a - b), shift: false, layers: undefined },
    ]);
  });
});

describe('caps word rules: generated C', () => {
  it('unset: no callback, nothing in rules.mk, same output as a project from before the setting', () => {
    const res = gen(project());
    expect(keymapC(res)).not.toContain('caps_word_press');
    expect(file(res, 'rules.mk')).not.toContain('CAPS_WORD_ENABLE');
  });

  it('rules: caps_word_press_user with ranges, shifted keys, kept keys, any other key ends it; Caps Word turned on', () => {
    const res = gen(project(qriaryLike));
    const c = body(keymapC(res), 'bool caps_word_press_user(uint16_t keycode) {');
    expect(c).toContain('case KC_A ... KC_Z:');
    expect(c).toContain('case KC_1 ... KC_0:');
    expect(c).toMatch(/case KC_A \.\.\. KC_Z:\n\s+add_weak_mods\(MOD_BIT\(KC_LSFT\)\);\n\s+return true;/);
    expect(c).toMatch(/case KC_DEL(ETE)?:\n\s+return true;/);
    expect(c).toMatch(/default:\n\s+return false;/);
    expect(file(res, 'rules.mk')).toContain('CAPS_WORD_ENABLE = yes');
    expect(res.issues.filter((i) => i.level === 'error')).toEqual([]);
  });

  it('a rule for some layers tests the top layer by its C name; elsewhere the key ends Caps Word', () => {
    const c = body(keymapC(gen(project(qriaryLike))), 'bool caps_word_press_user(uint16_t keycode) {');
    expect(c).toContain('layer_state_t top = (layer_state_t)1 << get_highest_layer(layer_state | default_layer_state);');
    expect(c).toMatch(/case KC_DOT:[\s\S]*?if \(top & \(\(layer_state_t\)1 << CYR\)\) \{\n\s+add_weak_mods\(MOD_BIT\(KC_LSFT\)\);\n\s+return true;\n\s+\}\n\s+return false;/);
  });

  it('no layer rule: no top-layer variable (no unused variable under -Werror)', () => {
    const c = body(keymapC(gen(project([{ id: 'a', keys: letters, shift: true }]))), 'bool caps_word_press_user(uint16_t keycode) {');
    expect(c).not.toContain('layer_state_t top');
  });

  it('a key in a layer rule and an every-layer rule: the layer rule first, then the every-layer one; one case label', () => {
    const rules: CapsWordRule[] = [
      { id: 'all', keys: keys('KC_SCLN'), shift: false },
      { id: 'cyr', keys: keys('KC_SCLN'), shift: true, layers: [1] },
    ];
    const c = body(keymapC(gen(project(rules))), 'bool caps_word_press_user(uint16_t keycode) {');
    expect(c.match(/case KC_SCLN|case KC_SEMICOLON/g)).toHaveLength(1);
    expect(c).toMatch(/case KC_(SCLN|SEMICOLON):\n\s+if \(top & \(\(layer_state_t\)1 << CYR\)\) \{\n\s+add_weak_mods\(MOD_BIT\(KC_LSFT\)\);\n\s+return true;\n\s+\}\n\s+return true;/);
  });

  it('key lists: their keys count like the rule’s own keys', () => {
    const p = project([{ id: 'r', keys: [], lists: ['l1'], shift: false }], (p) => ({ ...p, keyLists: [{ id: 'l1', name: 'nums', keys: keys('KC_P1', 'KC_P2') }] }));
    const c = body(keymapC(gen(p)), 'bool caps_word_press_user(uint16_t keycode) {');
    expect(c).toMatch(/KC_(P1|KP_1)/);
    expect(c).toMatch(/KC_(P2|KP_2)/);
  });

  it('a tap dance keycode keeps Caps Word on (QMK passes TD(n) as it is)', () => {
    const p = project([{ id: 'r', keys: [q('TD(0)')], shift: false }], (p) => ({
      ...p,
      tapDances: [{ id: 'td', index: 0, name: 'TD_UNDS', tap: q('KC_UNDS'), hold: 0, doubleTap: 0, tapHold: 0 }],
    }));
    expect(body(keymapC(gen(p)), 'bool caps_word_press_user(uint16_t keycode) {')).toMatch(/case TD\((0|TD_UNDS)\):\n\s+return true;/);
  });

  it('own pipeline: caps_word_press_navi, its prototype in navi.h, a forwarding warning; no caps_word_press_user', () => {
    const res = gen(pipeline(project(qriaryLike)));
    const c = keymapC(res);
    expect(c).toContain('bool caps_word_press_navi(uint16_t keycode) {');
    expect(c).not.toContain('bool caps_word_press_user(');
    expect(file(res, 'navi.h')).toContain('bool caps_word_press_navi(uint16_t keycode);');
    expect(res.issues.map((i) => i.where)).toContain('own pipeline: caps_word_press_user()');
  });

  it('own pipeline without rules: caps_word_press_navi is still there, with QMK’s own list (hooks are always defined)', () => {
    const res = gen(pipeline(project()));
    const c = body(keymapC(res), 'bool caps_word_press_navi(uint16_t keycode) {');
    expect(c).toMatch(/case KC_A \.\.\. KC_Z:\n\s+case KC_(MINS|MINUS):\n\s+add_weak_mods/);
    expect(c).toContain('case KC_1 ... KC_0:');
    expect(file(res, 'navi_rules.mk')).not.toContain('CAPS_WORD_ENABLE');
    expect(res.issues.map((i) => i.where)).not.toContain('own pipeline: caps_word_press_user()');
  });

  it('the user’s own C defining caps_word_press_user next to NAVI’s rules is an error', () => {
    const p = project(qriaryLike, (p) => ({ ...p, firmware: { ...p.firmware, custom: { 'keymap.c': 'bool caps_word_press_user(uint16_t keycode) { return false; }' } } }));
    expect(gen(p).issues.some((i) => i.level === 'error' && i.message.en.includes('caps_word_press_user'))).toBe(true);
  });
});

describe('caps word rules: checks', () => {
  it('a rule with no keys does nothing; a missing key list; a key on the same layers in two rules', () => {
    const rules: CapsWordRule[] = [
      { id: 'empty', keys: [], shift: true },
      { id: 'gone', keys: [], lists: ['nope'], shift: true },
      { id: 'a1', keys: keys('KC_A'), shift: true },
      { id: 'a2', keys: keys('KC_A'), shift: false },
      { id: 'b1', keys: keys('KC_B'), shift: true, layers: [1] },
      { id: 'b2', keys: keys('KC_B'), shift: false, layers: [1, 2] },
      { id: 'ok', keys: keys('KC_C'), shift: true, layers: [1] },
      { id: 'ok2', keys: keys('KC_C'), shift: false },
    ];
    const issues = checkCapsWordRules(project(rules));
    const text = issues.map((i) => i.message.en).join('\n');
    expect(issues.filter((i) => i.level === 'warning').length).toBeGreaterThanOrEqual(3);
    expect(text).toMatch(/no keys/i);
    expect(text).toMatch(/key list that no longer exists/i);
    expect(issues.filter((i) => /two rules|already/i.test(i.message.en))).toHaveLength(2); // A (every layer), B (layer CYR)
    expect(checkCapsWordRules(project(qriaryLike))).toEqual([]);
  });
});

describe('caps word rules: project file and layer changes', () => {
  it('format 13 → 14: no rules (QMK’s list)', () => {
    const raw = JSON.parse(serializeProject(project()));
    raw.schemaVersion = 13;
    delete raw.firmware.capsWordRules;
    expect(PROJECT_SCHEMA_VERSION).toBe(14);
    expect(migrateProject(raw)).toMatchObject({ from: 13, data: { schemaVersion: 14 } });
    const { project: loaded, issues } = validateProject(raw);
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(loaded!.firmware.capsWordRules).toBeUndefined();
  });

  it('round trip keeps the rules; bad entries are dropped with a warning', () => {
    const p = project(qriaryLike);
    const back = parseProjectText(serializeProject(p));
    expect('project' in back && back.project?.firmware.capsWordRules).toEqual(qriaryLike);
    const raw = JSON.parse(serializeProject(p));
    raw.firmware.capsWordRules.push({ id: 'bad', keys: 'nope', shift: 1 }, { id: 'badlayer', keys: [4], shift: true, layers: [99] });
    const { project: loaded, issues } = validateProject(raw);
    expect(loaded!.firmware.capsWordRules).toHaveLength(qriaryLike.length + 1);
    expect(loaded!.firmware.capsWordRules!.at(-1)!.layers ?? []).not.toContain(99);
    expect(issues.some((i) => i.path.startsWith('firmware.capsWordRules') && i.level === 'warning')).toBe(true);
  });

  it('layers move with their rule; a rule whose every layer is deleted goes away (it must not become every-layer)', () => {
    const p = project([...qriaryLike, { id: 'fn', keys: keys('KC_X'), shift: true, layers: [2] }]);
    const id = activeKeymap(p).id;
    const moved = moveLayer(p, id, spec, 1, 2);
    expect(moved.firmware.capsWordRules!.find((r) => r.id === 'r3')!.layers).toEqual([2]);
    expect(moved.firmware.capsWordRules!.find((r) => r.id === 'fn')!.layers).toEqual([1]);
    const removed = removeLayer(p, id, spec, 2);
    expect(removed.firmware.capsWordRules!.map((r) => r.id)).toEqual(['r1', 'r2', 'r3']);
  });

  it('keycodes follow mapProjectKeycodes; a key that becomes KC_NO is dropped', () => {
    const p = project([{ id: 'r', keys: keys('KC_A', 'KC_B'), shift: true }]);
    const mapped = mapProjectKeycodes(p, (v) => (v === q('KC_A') ? q('KC_C') : v === q('KC_B') ? 0 : v));
    expect(mapped.firmware.capsWordRules![0].keys).toEqual(keys('KC_C'));
  });

  it('deleting a key list takes it out of the rules', () => {
    const p = project([{ id: 'r', keys: [], lists: ['l1', 'l2'], shift: false }], (p) => ({
      ...p,
      keyLists: [
        { id: 'l1', name: 'a', keys: keys('KC_A') },
        { id: 'l2', name: 'b', keys: keys('KC_B') },
      ],
    }));
    expect(removeKeyList(p, 'l1').firmware.capsWordRules![0].lists).toEqual(['l2']);
  });
});
