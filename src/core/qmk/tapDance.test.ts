/**
 * Tap dance kinds (step 8a): slots with any keycode, every-tap steps, own C functions. The C itself is played in
 * real QMK by tests/qmk-host; here: what gets generated, the checks, the model.
 */
import { describe, expect, it } from 'vitest';
import { parseQmk } from '../keycodes/codec';
import { loadSpec } from '../keycodes/spec';
import { checkTapDances } from '../features/advanced';
import { requiredFeatures } from '../features/required';
import { createDilemmaProject } from '../project/factory';
import { migrateProject } from '../project/migrate';
import { activeKeymap, removeLayer } from '../project/ops';
import { PROJECT_SCHEMA_VERSION, type Language, type MacroStep, type Project, type TapDance, type TextRoute } from '../project/types';
import { serializeProject, validateProject } from '../project/validate';
import { generateKeymap } from './generate';

const spec = loadSpec('latest');
const q = (s: string) => parseQmk(spec, s);
const tap = (k: string): MacroStep => ({ type: 'tap', keycode: q(k) });

const td = (index: number, name: string, extra: Partial<TapDance> = {}): TapDance => ({ id: `td${index}`, index, name, tap: 0, hold: 0, doubleTap: 0, tapHold: 0, ...extra });
const slots = td(0, 'TD_A', { tap: q('C(KC_C)'), hold: q('LM(1, MOD_LSFT)') });
const tapOnly = td(1, 'TD_B', { tap: q('KC_SPC'), hold: q('KC_LSFT') });
const everyText = td(2, 'TD_C', { kind: 'every-tap', steps: [{ none: [{ type: 'text', text: '!' }], shift: [{ type: 'text', text: '->' }] }, { none: [{ type: 'text', text: '=' }] }] });
const everyKeys = td(3, 'TD_D', { kind: 'every-tap', steps: [{ none: [tap('KC_A')] }, { none: [tap('MO(2)')], ctrl: [] }] });
const ownC = td(4, 'TD_E', { kind: 'own-c', ownC: { onEachTap: 'my_each', onReset: 'my_reset' } });

function project(tds: TapDance[], opts: { pipeline?: boolean; own?: string } = {}): Project {
  const p = createDilemmaProject();
  const km = activeKeymap(p);
  const keys = km.layers[0].keys.slice();
  tds.forEach((t, i) => (keys[i] = q(`TD(${t.index})`)));
  return {
    ...p,
    tapDances: tds,
    keymaps: p.keymaps.map((k) => (k.id === km.id ? { ...k, layers: k.layers.map((l, i) => (i === 0 ? { ...l, keys } : l)) } : k)),
    firmware: { ...p.firmware, ...(opts.pipeline ? { pipeline: { enabled: true, headers: [] } } : {}), ...(opts.own ? { custom: { 'keymap.c': opts.own } } : {}) },
  };
}
const gen = (p: Project) => generateKeymap({ project: p, keymap: activeKeymap(p), spec, via: false, encoderCount: 0 });
const file = (p: Project, name: string) => gen(p).files.find((f) => f.name === name)?.text ?? '';
const errors = (p: Project) => gen(p).issues.filter((i) => i.level === 'error');

describe('tap dance kinds: generator', () => {
  it('slots: any keycode through navi_send, tap-only dances end on release; nothing unused', () => {
    const c = file(project([slots, tapOnly]), 'keymap.c');
    expect(c).toContain('[TD_A] = { LCTL(KC_C), LM(L_LAYER_1, MOD_LSFT), KC_NO, KC_NO },');
    expect(c).toContain('.on_each_release = navi_td_each_release');
    expect(c).toMatch(/static void navi_send\(uint16_t keycode, keyrecord_t \*record, bool pressed, uint8_t taps\)/);
    expect(c).toContain('navi_td_keys[QK_TAP_DANCE_GET_INDEX(keycode)] = record->event;');
    expect(c).toContain('MAKE_EVENT(at.key.row, at.key.col, pressed, IS_COMBOEVENT(at) ? COMBO_EVENT : KEY_EVENT)');
    expect(c).not.toContain('navi_td_every_tap');
    expect(c).not.toContain('navi_td_mods');
    // no tap-only dance (one with a double tap): no on_each_release helper
    expect(file(project([{ ...slots, doubleTap: q('KC_X') }]), 'keymap.c')).not.toContain('navi_td_each_release');
    expect(errors(project([slots, tapOnly]))).toEqual([]);
  });

  it('every-tap: text steps alone need no navi_send; a variant plays without Shift / Ctrl; empty = nothing', () => {
    const c = file(project([everyText]), 'keymap.c');
    expect(c).toContain('.on_each_tap = navi_td_every_tap');
    expect(c).toContain('switch ((state->count - 1) % 2)');
    expect(c).toContain('send_string("->")');
    expect(c).toContain('navi_td_mods_off(MOD_MASK_CSAG)'); // a version with text: all mods off
    expect(c).toContain('navi_td_mods_off(MOD_MASK_CSAG)'); // no mods' version with text: Shift / Ctrl lifted too (liftHeldMods)
    expect(c).not.toContain('navi_send');
    expect(c).not.toContain('navi_td_keys');
    const k = file(project([everyKeys]), 'keymap.c');
    expect(k).toContain('navi_td_tap(state->index, KC_A)');
    expect(k).toContain('navi_td_tap(state->index, MO(L_LAYER_2))');
    expect(k).toMatch(/state->finished +=  ?false;/);
    // the empty Ctrl variant: no helpers to switch mods off, just nothing
    expect(k).toMatch(/if \(.*MOD_MASK_CTRL.*\) break;/);
    expect(k).not.toContain('navi_td_mods_off');
    expect(errors(project([everyText, everyKeys]))).toEqual([]);
  });

  it('own C: ACTION_TAP_DANCE_FN_ADVANCED with NULL gaps; prototypes before the table (normal) or in navi.h (pipeline)', () => {
    const own = 'void my_each(tap_dance_state_t *state, void *user_data) {}\nvoid my_reset(tap_dance_state_t *state, void *user_data) {}';
    const normal = project([ownC], { own });
    const c = file(normal, 'keymap.c');
    expect(c).toContain('[TD_E] = ACTION_TAP_DANCE_FN_ADVANCED(my_each, NULL, my_reset)');
    expect(c.indexOf('void my_each(tap_dance_state_t *state, void *user_data);')).toBeLessThan(c.indexOf('tap_dance_actions[]'));
    expect(gen(normal).issues).toEqual([]);
    const pipe = project([ownC], { pipeline: true });
    expect(file(pipe, 'navi.h')).toContain('void my_reset(tap_dance_state_t *state, void *user_data);');
    expect(file(pipe, 'keymap.c')).not.toContain('void my_reset(tap_dance_state_t *state, void *user_data);');
    expect(errors(pipe)).toEqual([]);
  });

  it('own C in normal mode without own lines: a warning to define the functions', () => {
    const w = gen(project([ownC])).issues.filter((i) => i.level === 'warning');
    expect(w.some((i) => i.message.en.startsWith('Define these functions in your own lines'))).toBe(true);
  });

  it('all three kinds in both modes: no errors, every helper used, REPEAT_KEY_ENABLE for navi_send', () => {
    for (const pipeline of [false, true]) {
      const p = project([slots, tapOnly, everyText, everyKeys, ownC], { pipeline, own: pipeline ? undefined : 'void my_each(tap_dance_state_t *s, void *u) {}\nvoid my_reset(tap_dance_state_t *s, void *u) {}' });
      expect(errors(p)).toEqual([]);
      const c = file(p, 'keymap.c');
      for (const fn of [...c.matchAll(/^static (?:void|bool|uint8_t|uint16_t) (\w+)\(/gm)].map((m) => m[1])) {
        expect(c.split(new RegExp(`\\b${fn}\\b`)).length - 1, fn).toBeGreaterThan(1);
      }
      expect(file(p, pipeline ? 'navi_rules.mk' : 'rules.mk')).toMatch(/REPEAT_KEY_ENABLE = yes/);
      expect(requiredFeatures(p, activeKeymap(p), spec).has('repeat_key')).toBe(true);
    }
    const noSend = project([everyText, ownC]);
    expect(requiredFeatures(noSend, activeKeymap(noSend), spec).has('repeat_key')).toBe(false);
  });
});

describe('tap dance kinds: checks', () => {
  const issues = (t: TapDance, reserved?: Set<string>) => checkTapDances(spec, [t], reserved).filter((i) => i.level === 'error');
  it('a tap dance inside a slot or a step is an error; other keycodes are fine', () => {
    expect(issues(td(0, 'X', { tap: q('TD(0)') }))).toHaveLength(1);
    expect(issues(td(0, 'X', { kind: 'every-tap', steps: [{ shift: [tap('TD(1)')] }] }))).toHaveLength(1);
    expect(issues(td(0, 'X', { tap: q('LT(1, KC_X)'), hold: q('QK_BOOT') }))).toEqual([]);
  });
  it('every-tap with 0 or 7 steps; 6 is fine', () => {
    const n = (length: number) => td(0, 'X', { kind: 'every-tap', steps: Array.from({ length }, () => ({ none: [tap('KC_A')] })) });
    expect(issues(n(0))).toHaveLength(1);
    expect(issues(n(7))).toHaveLength(1);
    expect(issues(n(6))).toEqual([]);
  });
  it('own C: none named, not an identifier, a name NAVI generates', () => {
    expect(issues(td(0, 'X', { kind: 'own-c', ownC: {} }))).toHaveLength(1);
    expect(issues(td(0, 'X', { kind: 'own-c', ownC: { onFinished: '1bad' } }))).toHaveLength(1);
    expect(issues(td(0, 'X', { kind: 'own-c', ownC: { onFinished: 'int' } }))).toHaveLength(1);
    expect(issues(td(0, 'X', { kind: 'own-c', ownC: { onFinished: 'X' } }))).toHaveLength(1);
    expect(issues(td(0, 'X', { kind: 'own-c', ownC: { onFinished: 'navi_send' } }), new Set(['navi_send']))).toHaveLength(1);
    // through the generator: NAVI's own names and layer names are reserved
    expect(errors(project([td(0, 'X', { kind: 'own-c', ownC: { onFinished: 'navi_td_finished' } })], { pipeline: true })).length).toBeGreaterThan(0);
    expect(errors(project([td(0, 'X', { kind: 'own-c', ownC: { onFinished: 'L_LAYER_1' } })], { pipeline: true })).length).toBeGreaterThan(0);
  });
});

describe('tap dance kinds: model', () => {
  it('schema 9: a format 8 file opens unchanged (no kind = slots)', () => {
    const v8 = JSON.parse(serializeProject(project([slots])));
    v8.schemaVersion = 8;
    expect(migrateProject(v8)).toMatchObject({ from: 8, data: { schemaVersion: PROJECT_SCHEMA_VERSION } });
    const { project: p, issues } = validateProject(v8);
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(p?.tapDances[0]).toMatchObject({ name: 'TD_A', tap: q('C(KC_C)') });
    expect(p?.tapDances[0].kind).toBeUndefined();
  });

  it('the new kinds round-trip; bad shapes are rejected', () => {
    const p = project([everyText, everyKeys, ownC]);
    expect(validateProject(JSON.parse(serializeProject(p))).project?.tapDances).toEqual(p.tapDances);
    const bad = (t: object) => {
      const d = JSON.parse(serializeProject(p));
      d.tapDances = [{ ...d.tapDances[0], ...t }];
      return validateProject(d).issues.filter((i) => i.level === 'error').length;
    };
    expect(bad({ kind: 'sometimes' })).toBeGreaterThan(0);
    expect(bad({ steps: [] })).toBeGreaterThan(0);
    expect(bad({ steps: Array.from({ length: 7 }, () => ({})) })).toBeGreaterThan(0);
    expect(bad({ steps: [{ none: 'a' }] })).toBeGreaterThan(0);
    expect(bad({ steps: [{ none: [{ type: 'run', cmd: 'x' }] }] })).toBeGreaterThan(0);
    expect(bad({ kind: 'own-c', ownC: { onFinished: 'a b' } })).toBeGreaterThan(0);
    expect(bad({ kind: 'own-c', ownC: { onFinished: 'x); system("y' } })).toBeGreaterThan(0);
  });

  it('removing a layer renumbers layer keys inside every-tap steps; the removed layer becomes nothing', () => {
    const t = td(0, 'TD_F', { kind: 'every-tap', steps: [{ none: [tap('MO(2)')], shift: [{ type: 'down', keycode: q('TG(1)') }] }] });
    const p0 = project([t]);
    const p = removeLayer(p0, activeKeymap(p0).id, spec, 1);
    expect(p.tapDances[0].steps).toEqual([{ none: [tap('MO(1)')], shift: [{ type: 'down', keycode: 0 }] }]);
  });
});

describe('every-tap text in the language (step 14)', () => {
  const EN: Language = { id: 'en', name: 'English', code: 'en', plainKeys: true };
  const RU: Language = { id: 'ru', name: 'Russian', code: 'ru', plainKeys: false };
  const withLanguages = (tds: TapDance[], route: TextRoute) => {
    const p = project(tds);
    return { ...p, languages: [EN, RU], firmware: { ...p.firmware, textRoute: route } };
  };
  const text = (t: string): MacroStep => ({ type: 'text', text: t });
  // tap X (the keyboard's), "ab", Left, Shift+Home (a key with modifiers), right Ctrl+A down / up, 10 ms, "c"
  const mixed = td(0, 'TD_M', {
    kind: 'every-tap',
    steps: [
      {
        none: [tap('KC_X'), text('ab'), tap('KC_LEFT'), tap('S(KC_HOME)'), { type: 'down', keycode: q('RCTL(KC_A)') }, { type: 'up', keycode: q('RCTL(KC_A)') }, { type: 'delay', ms: 10 }, text('c')],
        shift: [text('->'), tap('KC_END')],
      },
    ],
  });

  it('own program: from the first text on, text and keys go to the program as one stream, split at delays', () => {
    const c = file(withLanguages([mixed], 'own-program'), 'keymap.c');
    expect(c).toContain(
      [
        '                        navi_td_tap(state->index, KC_X);',
        '                        navi_send_text("ab" "\\001\\001\\120" "\\001\\002\\341" "\\001\\001\\112" "\\001\\003\\341" "\\001\\002\\344" "\\001\\002\\004" "\\001\\003\\004" "\\001\\003\\344");',
        '                        wait_ms(10);',
        '                        navi_send_text("c");',
      ].join('\n'),
    );
    expect(c).toContain('navi_td_held_t held = navi_td_mods_off(MOD_MASK_CSAG);\n                        navi_send_text("->" "\\001\\001\\115");\n                        navi_td_mods_on(held);');
    expect(errors(withLanguages([mixed], 'own-program'))).toEqual([]);
  });

  it('own program, every key in the stream: no key helpers left unused', () => {
    const p = withLanguages([td(0, 'TD_S', { kind: 'every-tap', steps: [{ none: [text('a'), tap('KC_LEFT')] }] })], 'own-program');
    const c = file(p, 'keymap.c');
    expect(c).toContain('navi_send_text("a" "\\001\\001\\120");');
    for (const fn of [...c.matchAll(/^static (?:void|bool|uint8_t|uint16_t|keypos_t) (\w+)[([]/gm)].map((m) => m[1])) {
      expect(c.split(new RegExp(`\\b${fn}\\b`)).length - 1, fn).toBeGreaterThan(1);
    }
    expect(c).not.toContain('navi_td_tap');
    expect(c).not.toContain('state->finished    = false;');
  });

  it('own program: a key the stream cannot carry is played by the keyboard after the text so far, with a warning', () => {
    const p = withLanguages([td(0, 'TD_L', { kind: 'every-tap', steps: [{ none: [text('a'), tap('MO(2)'), text('b')] }] })], 'own-program');
    const c = file(p, 'keymap.c');
    expect(c).toContain('navi_send_text("a");\n                        navi_td_tap(state->index, MO(L_LAYER_2));\n                        navi_send_text("b");');
    const w = gen(p).issues.filter((i) => i.level === 'warning' && i.where.includes('TD_L'));
    expect(w).toHaveLength(1);
    expect(w[0].message.en).toContain('MO(L_LAYER_2)');
  });

  it('Unicode route: text through navi_send_text, keys played by the keyboard', () => {
    const c = file(withLanguages([mixed], 'wincompose'), 'keymap.c');
    expect(c).toContain('navi_send_text("ab");\n                        navi_td_tap(state->index, KC_LEFT);');
    expect(c).toContain('navi_send_text("->");');
    expect(c).not.toContain('send_string("ab")');
  });

  it('no languages, or only plain-keys ones: send_string as before', () => {
    expect(file(project([mixed]), 'keymap.c')).toContain('send_string("ab");');
    const plain = { ...withLanguages([mixed], 'own-program'), languages: [EN] };
    expect(file(plain, 'keymap.c')).toContain('send_string("ab");');
  });

  it('6 steps cycle by 6 and round-trip', () => {
    const six = td(0, 'TD_6', { kind: 'every-tap', steps: Array.from({ length: 6 }, (_, i) => ({ none: [text(String(i))] })) });
    const p = project([six]);
    const c = file(p, 'keymap.c');
    expect(c).toContain('switch ((state->count - 1) % 6)');
    expect(c).toContain('send_string("5");');
    expect(validateProject(JSON.parse(serializeProject(p))).project?.tapDances).toEqual(p.tapDances);
  });
});
