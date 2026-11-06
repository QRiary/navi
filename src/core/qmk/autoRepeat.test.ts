/**
 * Auto repeat (step 11a): a macro or a custom keycode ticked “repeat while held” runs its action again after the
 * delay, then every rate ms, until released; one key repeats at a time, the last pressed. The C is checked as text
 * here; tests/qmk-host plays it in QMK's test framework.
 */
import { describe, expect, it } from 'vitest';
import { parseQmk } from '../keycodes/codec';
import { loadSpec } from '../keycodes/spec';
import { AUTO_REPEAT_DEFAULT, createBlankProject } from '../project/factory';
import { migrateProject } from '../project/migrate';
import { activeKeymap, setKeycodes } from '../project/ops';
import { parseProjectText, serializeProject, validateProject } from '../project/validate';
import { PROJECT_SCHEMA_VERSION, type Project } from '../project/types';
import { generateKeymap } from './generate';

const spec = loadSpec('latest');
const q = (s: string) => parseQmk(spec, s);

/** MC_0 taps A (ticked), MC_1 taps B (not ticked), REP types "x" (ticked), NOREP types "y", IDLE has no action (ticked). */
function project(over: (p: Project) => Project = (p) => p): Project {
  let p = createBlankProject('repeat', 4, 6, false);
  const id = activeKeymap(p).id;
  p = setKeycodes(p, id, 0, [[0, 0]], q('QK_MACRO_0'));
  p = setKeycodes(p, id, 0, [[0, 1]], q('QK_MACRO_1'));
  p = setKeycodes(p, id, 0, [[0, 2]], q('QK_USER_0'));
  p = {
    ...p,
    macros: [
      { id: 'm0', index: 0, name: 'arrows', steps: [{ type: 'tap', keycode: q('KC_A') }], repeat: true },
      { id: 'm1', index: 1, name: 'plain', steps: [{ type: 'tap', keycode: q('KC_B') }] },
    ],
    customKeycodes: [
      { id: 'c0', name: 'REP', description: '', action: { type: 'send-string', text: 'x' }, repeat: true },
      { id: 'c1', name: 'NOREP', description: '', action: { type: 'send-string', text: 'y' } },
      { id: 'c2', name: 'IDLE', description: '', action: { type: 'none' }, repeat: true },
    ],
  };
  return over(p);
}
const gen = (p: Project, via = false) => generateKeymap({ project: p, keymap: activeKeymap(p), spec, via, encoderCount: 0 });
const file = (res: ReturnType<typeof gen>, name: string) => res.files.find((f) => f.name === name)!.text;
const generated = (res: ReturnType<typeof gen>) => file(res, 'keymap.c').split('// ── your own lines')[0];
/** The body of a C function, from its signature line to the closing brace at column 0. */
const body = (c: string, signature: string) => {
  const start = c.indexOf(signature);
  expect(start, signature).toBeGreaterThanOrEqual(0);
  return c.slice(start, c.indexOf('\n}', start) + 2);
};
const untick = (p: Project): Project => ({ ...p, macros: p.macros.map(({ repeat: _, ...m }) => m), customKeycodes: p.customKeycodes.map(({ repeat: _, ...c }) => c) });

describe('auto repeat: generated C', () => {
  it('no ticked key: no repeat code, no deferred exec, same output as before the setting', () => {
    const res = gen(untick(project()));
    const c = generated(res);
    for (const s of ['navi_repeat', 'defer_exec', 'deferred_token']) expect(c).not.toContain(s);
    expect(file(res, 'rules.mk')).not.toContain('DEFERRED_EXEC_ENABLE');
    // the delay and rate don't change the output while nothing repeats
    const other = untick(project((p) => ({ ...p, firmware: { ...p.firmware, autoRepeat: { delay: 300, rate: 50 } } })));
    expect(gen(other).files).toEqual(res.files);
  });

  it('a custom keycode with no action never repeats, even ticked', () => {
    const p = project((p) => ({ ...p, macros: [p.macros[1]], customKeycodes: [p.customKeycodes[2]] }));
    expect(generated(gen(p))).not.toContain('navi_repeat');
    expect(file(gen(p), 'rules.mk')).not.toContain('DEFERRED_EXEC_ENABLE');
  });

  it('ticked keys: deferred exec on, the action in navi_repeat_action, the delay and the rate from the setting', () => {
    const res = gen(project((p) => ({ ...p, firmware: { ...p.firmware, autoRepeat: { delay: 300, rate: 50 } } })));
    const c = generated(res);
    expect(file(res, 'rules.mk')).toContain('DEFERRED_EXEC_ENABLE = yes');
    const action = body(c, 'static void navi_repeat_action(uint16_t keycode) {');
    expect(action).toContain('case QK_MACRO_0:');
    expect(action).toContain('tap_code(0x04);');
    expect(action).toContain('case REP:');
    expect(action).toContain('SEND_STRING("x");');
    // not ticked, or no action: not in the repeat
    for (const s of ['QK_MACRO_1', 'NOREP', 'IDLE']) expect(action).not.toContain(s);
    expect(body(c, 'static uint32_t navi_repeat_cb(uint32_t trigger_time, void *cb_arg) {')).toContain('return 50;');
    const start = body(c, 'static void navi_repeat(uint16_t keycode, keyrecord_t *record) {');
    expect(start).toContain('defer_exec(300, navi_repeat_cb, NULL)');
    expect(start).toContain('cancel_deferred_exec(navi_repeat_token);');
    for (const s of ['navi_repeat', 'navi_repeat_action', 'navi_repeat_cb', 'navi_repeat_keycode', 'navi_repeat_token']) expect(res.symbols.has(s), s).toBe(true);
  });

  it('process_record_user: ticked keys go to navi_repeat on press and release, before the press-only switch', () => {
    const c = generated(gen(project()));
    const hook = body(c, 'bool process_record_user(uint16_t keycode, keyrecord_t *record) {');
    const repeat = hook.indexOf('navi_repeat(keycode, record);');
    const pressOnly = hook.indexOf('if (!record->event.pressed) return true;');
    expect(repeat).toBeGreaterThan(0);
    expect(pressOnly).toBeGreaterThan(repeat);
    expect(hook.slice(0, pressOnly)).toMatch(/case QK_MACRO_0:\n\s+case REP:\n\s+navi_repeat\(keycode, record\);\n\s+return false;/);
    // the plain ones keep their press case; the ticked ones have no second one
    const press = hook.slice(pressOnly);
    expect(press).toContain('case QK_MACRO_1:');
    expect(press).toContain('case NOREP: SEND_STRING("y"); return false;');
    expect(press).not.toContain('case QK_MACRO_0:');
    expect(press).not.toContain('case REP:');
  });

  it('only ticked keys: the press-only switch is gone, the repeat switch stays', () => {
    const c = generated(gen(project((p) => ({ ...p, macros: [p.macros[0]], customKeycodes: [p.customKeycodes[0]] }))));
    const hook = body(c, 'bool process_record_user(uint16_t keycode, keyrecord_t *record) {');
    expect(hook).toContain('navi_repeat(keycode, record);');
    expect(hook).not.toContain('if (!record->event.pressed) return true;');
  });

  it('VIA in the build: a ticked macro repeats through dynamic_keymap_macro_send, plain macros stay with VIA', () => {
    const c = generated(gen(project(), true));
    const action = body(c, 'static void navi_repeat_action(uint16_t keycode) {');
    expect(action).toContain('case QK_MACRO_0:');
    expect(action).toContain('dynamic_keymap_macro_send(0);');
    expect(action).not.toContain('tap_code(0x04);');
    const hook = body(c, 'bool process_record_user(uint16_t keycode, keyrecord_t *record) {');
    expect(hook).toContain('case QK_MACRO_0:');
    expect(hook).not.toContain('QK_MACRO_1');
  });

  it('own pipeline: the repeat goes into process_record_navi', () => {
    const p = project((p) => ({ ...p, firmware: { ...p.firmware, pipeline: { enabled: true, headers: [] } } }));
    const res = gen(p);
    const c = generated(res);
    expect(body(c, 'bool process_record_navi(uint16_t keycode, keyrecord_t *record) {')).toContain('navi_repeat(keycode, record);');
    expect(file(res, 'navi_rules.mk')).toContain('DEFERRED_EXEC_ENABLE = yes');
  });

  it('own lines defining a repeat symbol are reported', () => {
    const p = project((p) => ({ ...p, firmware: { ...p.firmware, custom: { 'keymap.c': 'static void navi_repeat(uint16_t keycode, keyrecord_t *record) {}' } } }));
    expect(gen(p).issues.some((i) => i.where.includes('keymap.c') && i.level === 'error' && i.message.en.includes('navi_repeat'))).toBe(true);
    // without a ticked key the name is free
    expect(gen(untick(p)).issues.some((i) => i.message.en.includes('navi_repeat'))).toBe(false);
  });
});

describe('auto repeat: project file', () => {
  it('new projects get the default delay and rate', () => {
    expect(AUTO_REPEAT_DEFAULT).toEqual({ delay: 500, rate: 25 });
    expect(createBlankProject('x', 4, 6, false).firmware.autoRepeat).toEqual(AUTO_REPEAT_DEFAULT);
  });

  it('the ticks, the delay and the rate survive a save and load', () => {
    const p = project((p) => ({ ...p, firmware: { ...p.firmware, autoRepeat: { delay: 300, rate: 50 } } }));
    const loaded = parseProjectText(serializeProject(p)).project!;
    expect(loaded.firmware.autoRepeat).toEqual({ delay: 300, rate: 50 });
    expect(loaded.macros.map((m) => m.repeat)).toEqual([true, undefined]);
    expect(loaded.customKeycodes.map((c) => c.repeat)).toEqual([true, undefined, true]);
  });

  it('a delay or rate out of range (delay 1…10000, rate 1…1000 ms) is clamped with an issue; a missing one is the default', () => {
    const raw = JSON.parse(serializeProject(project()));
    raw.firmware.autoRepeat = { delay: 0, rate: 5000 };
    const { project: loaded, issues } = validateProject(raw);
    expect(loaded!.firmware.autoRepeat).toEqual({ delay: 1, rate: 1000 });
    raw.firmware.autoRepeat = { rate: 40 };
    expect(validateProject(raw).project!.firmware.autoRepeat).toEqual({ delay: 500, rate: 40 });
    expect(issues.some((i) => i.path === 'firmware.autoRepeat.delay')).toBe(true);
    expect(issues.some((i) => i.path === 'firmware.autoRepeat.rate')).toBe(true);
  });

  it('a format 11 file opens with the default delay and rate and nothing ticked', () => {
    const raw = JSON.parse(serializeProject(untick(project())));
    raw.schemaVersion = 11;
    delete raw.firmware.autoRepeat;
    expect(PROJECT_SCHEMA_VERSION).toBe(12);
    expect(migrateProject(raw)).toMatchObject({ from: 11, data: { schemaVersion: 12, firmware: { autoRepeat: AUTO_REPEAT_DEFAULT } } });
    const { project: loaded, issues } = validateProject(raw);
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(loaded!.firmware.autoRepeat).toEqual(AUTO_REPEAT_DEFAULT);
    expect(loaded!.macros.some((m) => m.repeat)).toBe(false);
  });
});
