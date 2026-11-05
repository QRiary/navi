/**
 * Stand-ins past the 12 codes that are no key: rare real keys as bases, never one the user's own code names, and a
 * stand-in moves off a base when it has to (its key set again on a named base, or the plain MT / LT it would be).
 */
import { describe, expect, it } from 'vitest';
import { decode, parseQmk } from '../keycodes/codec';
import { loadSpec } from '../keycodes/spec';
import { generateKeymap } from '../qmk/generate';
import { createDilemmaProject } from './factory';
import { activeKeymap, setKeycodes } from './ops';
import { checkTapHoldActions, ensureTapHold, ownCodeRefs, projectOwnCodeRefs, pruneTapHoldActions, tapHoldSlots } from './tapHoldActions';
import type { HoldAction, Project } from './types';

const spec = loadSpec('latest');
const q = (s: string) => parseQmk(spec, s);
const ctrl: HoldAction = { type: 'mods', mods: 0x01 };
const baseOf = (v: number) => {
  const d = decode(spec, v);
  return d.kind === 'mod-tap' || d.kind === 'layer-tap' ? d.base : null;
};
/** The 12 codes no QMK keycode names, in the order NAVI takes them. */
const NO_KEY = [0x02, 0x03, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xcb, 0xcc];
/** 67 different modded taps (Ctrl + letters, then Ctrl+Shift + letters, then Ctrl + digits). */
const taps = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((l) => `C(KC_${l})`).concat([...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((l) => `C(S(KC_${l}))`), [...'123456789'].map((d) => `C(KC_${d})`), ['C(KC_0)', 'C(KC_ENT)', 'C(KC_TAB)', 'C(KC_SPC)', 'C(KC_ESC)', 'C(KC_BSPC)']);

/** Puts tap-hold keys on layer 0, row 0 onwards, the way the key editor does. */
function putAll(p: Project, list: string[], hold: HoldAction, reserved?: ReadonlySet<number>): { p: Project; keycodes: number[] } {
  const keycodes: number[] = [];
  const cols = p.hardware.matrix.cols;
  list.forEach((tap, i) => {
    const r = ensureTapHold(spec, p, q(tap), hold, reserved);
    p = pruneTapHoldActions(setKeycodes(r.project, activeKeymap(r.project).id, Math.floor(i / cols) % 2, [[Math.floor(i / cols / 2), i % cols]], r.keycode));
    keycodes.push(r.keycode);
  });
  return { p, keycodes };
}

describe('stand-ins past the 12 codes that are no key', () => {
  it('the 13th different tap of one hold gets a rare real key; 67 fit, the 68th is an error', () => {
    expect(taps.length).toBe(67);
    const { p, keycodes } = putAll(createDilemmaProject(), taps.slice(0, 13), ctrl);
    expect(keycodes.slice(0, 12).map(baseOf)).toEqual(NO_KEY);
    expect(baseOf(keycodes[12])).toBe(q('KC_ALTERNATE_ERASE'));
    expect(tapHoldSlots(spec, p, keycodes[12])).toEqual({ tap: q('C(KC_M)'), hold: ctrl });
    expect(checkTapHoldActions(spec, p)).toEqual([]);
    const all = putAll(createDilemmaProject(), taps, ctrl);
    const bases = all.keycodes.map(baseOf);
    expect(new Set(bases).size).toBe(67);
    // Never letters, digits, space, punctuation or modifiers (Flow Tap, user code reading the base).
    expect(bases.filter((b) => b! <= 0x67 || b! >= 0xe0)).toEqual(NO_KEY.filter((b) => b <= 0x67));
    expect(() => ensureTapHold(spec, all.p, q('C(KC_F1)'), ctrl)).toThrow('No stand-in keycode left');
  });

  it('a held key uses every stand-in modifier on the 12 codes before a real key', () => {
    const list = taps.slice(0, 13).flatMap((t) => [`${t}`, `S(${t})`]).slice(0, 25);
    const { keycodes } = putAll(createDilemmaProject(), list, { type: 'key', keycode: q('KC_LEFT') });
    expect(keycodes.slice(0, 24).every((v) => NO_KEY.includes(baseOf(v)!))).toBe(true);
    expect(decode(spec, keycodes[24])).toMatchObject({ kind: 'mod-tap', base: NO_KEY[0] });
  });

  it('a base the user’s code names is never taken', () => {
    const { keycodes } = putAll(createDilemmaProject(), taps.slice(0, 11), ctrl, new Set([0x02, 0xc5, q('KC_ALTERNATE_ERASE')]));
    expect(keycodes.map(baseOf)).toEqual([0x03, 0xc3, 0xc4, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xcb, 0xcc, q('KC_SYSTEM_REQUEST')]);
  });

  it('a stand-in on a named base moves when its key is set again, every key and setting with it', () => {
    let { p, keycodes } = putAll(createDilemmaProject(), ['C(KC_Z)', 'C(KC_Z)'], ctrl);
    expect(keycodes.map(baseOf)).toEqual([0x02, 0x02]);
    p = { ...p, tapHolds: [{ id: 's', keycode: keycodes[0], flavor: 'hold-preferred' }] };
    const r = ensureTapHold(spec, p, q('C(KC_Z)'), ctrl, new Set([0x02]));
    expect(baseOf(r.keycode)).toBe(0x03);
    expect(activeKeymap(r.project).layers[0].keys.filter((v) => v === r.keycode)).toHaveLength(2);
    expect(activeKeymap(r.project).layers[0].keys).not.toContain(keycodes[0]);
    expect(r.project.tapHolds[0].keycode).toBe(r.keycode);
    expect(r.project.tapHoldActions).toHaveLength(1);
  });

  it('a plain MT that is a stand-in’s keycode moves the stand-in away', () => {
    const { p, keycodes } = putAll(createDilemmaProject(), taps.slice(0, 13), ctrl);
    const standIn = keycodes[12];
    // Tap KC_ALTERNATE_ERASE, hold Ctrl: plain LCTL_T(KC_ALTERNATE_ERASE), the very value of the 13th stand-in.
    const r = ensureTapHold(spec, p, q('KC_ALTERNATE_ERASE'), ctrl);
    expect(r.keycode).toBe(standIn);
    const moved = r.project.tapHoldActions.find((a) => a.tap === q('C(KC_M)'))!;
    expect(baseOf(moved.keycode)).toBe(q('KC_SYSTEM_REQUEST'));
    expect(activeKeymap(r.project).layers.flatMap((l) => l.keys).filter((v) => v === moved.keycode)).toHaveLength(1);
    expect(r.project.tapHoldActions.some((a) => a.keycode === standIn)).toBe(false);
  });
});

describe('what the user’s own code names', () => {
  const file = (text: string) => [{ path: 'general/x.c', text }];

  it('key names anywhere, hex numbers only where code handles keycodes; comments and data tables don’t count', () => {
    const refs = ownCodeRefs(spec, [
      {
        path: 'a.c',
        text: [
          '// case 0xC3: a comment',
          '#define ST_FLAG 0x02',
          'static const uint8_t trie[] = { 0x03, 0xC7, 0x99, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06 };',
          '    case 0xC5:',
          'if (keycode == LCTL_T(0xC4)) return;',
          'if (keycode == 0x21C6) return; // MT(MOD_LCTL, 0xC6)',
          'tap_code(KC_F13);',
          'uint8_t flags = 0xCC;',
        ].join('\n'),
      },
    ]);
    expect([...refs.keys()].sort((a, b) => a - b)).toEqual([q('KC_F13'), 0xc4, 0xc5, 0xc6]);
    expect(refs.get(0xc5)).toEqual({ file: 'a.c', line: 4, name: '0xC5' });
    expect(refs.get(q('KC_F13'))).toEqual({ file: 'a.c', line: 7, name: 'KC_F13' });
  });

  it('a stand-in on a base the user’s code names gets a warning saying where', () => {
    const { p } = putAll(createDilemmaProject(), ['C(KC_Z)'], ctrl);
    const gen = (ownCode: { path: string; text: string }[]) => generateKeymap({ project: p, keymap: activeKeymap(p), spec, via: false, encoderCount: 0, ownCode }).issues;
    expect(gen([])).toEqual([]);
    const issues = gen(file('switch (keycode) {\n    case 0x02:\n}'));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ level: 'warning' });
    expect(issues[0].message.en).toContain('0x02 (general/x.c:2)');
    // The project's own lines count too.
    const own: Project = { ...p, firmware: { ...p.firmware, custom: { 'keymap.c': 'bool f(uint16_t keycode) { return keycode == LCTL_T(0x02); }' } } };
    expect(projectOwnCodeRefs(spec, own, null).get(0x02)).toMatchObject({ file: 'own lines of keymap.c', line: 1 });
  });
});

describe('navi_is_stand_in() for the user’s code', () => {
  const files = (p: Project) => generateKeymap({ project: p, keymap: activeKeymap(p), spec, via: false, encoderCount: 0 }).files;
  const text = (p: Project, name: string) => files(p).find((f) => f.name === name)?.text ?? '';

  it('lists the stand-ins', () => {
    const { p } = putAll(createDilemmaProject(), ['C(KC_Z)', 'C(KC_X)'], ctrl);
    expect(text(p, 'keymap.c')).toContain('bool navi_is_stand_in(uint16_t keycode) {\n    switch (keycode) {\n        case NAVI_TH_0:\n        case NAVI_TH_1:\n            return true;');
  });

  it('own pipeline: always there, declared in navi.h; plain keymap.c without stand-ins: not there', () => {
    const p0 = createDilemmaProject();
    expect(text(p0, 'keymap.c')).not.toContain('navi_is_stand_in');
    const p: Project = { ...p0, firmware: { ...p0.firmware, pipeline: { enabled: true, headers: [] } } };
    expect(text(p, 'navi.h')).toContain('bool navi_is_stand_in(uint16_t keycode);');
    expect(text(p, 'keymap.c')).toContain('bool navi_is_stand_in(uint16_t keycode) {\n    (void)keycode;\n    return false;\n}');
  });
});
