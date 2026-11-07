import { describe, expect, it } from 'vitest';
import { parseQmk } from '../keycodes/codec';
import { loadSpec } from '../keycodes/spec';
import { createBlankProject } from '../project/factory';
import { activeKeymap } from '../project/ops';
import type { KeyOverride, Project } from '../project/types';
import { generateKeymap } from './generate';

const spec = loadSpec('latest');
const q = (s: string) => parseQmk(spec, s);
const gen = (p: Project) => generateKeymap({ project: p, keymap: activeKeymap(p), spec, via: false, encoderCount: 0 });
const keymapC = (p: Project) => gen(p).files.find((f) => f.name === 'keymap.c')!.text;
const rulesMk = (p: Project) => gen(p).files.find((f) => f.name === 'rules.mk')!.text;

describe('leader action = any keycode', () => {
  it('keys and keys with mods stay tap_code16; the rest is played as a tap with no source key; no error', () => {
    const p: Project = {
      ...createBlankProject('leader any', 4, 10, false),
      macros: [{ id: 'm', index: 0, name: 'hi', steps: [{ type: 'text', text: 'hi' }] }],
      leaderSequences: [
        { id: 'a', keys: [q('KC_A')], action: { type: 'tap', keycode: q('C(KC_A)') } },
        { id: 'b', keys: [q('KC_B')], action: { type: 'tap', keycode: q('TG(1)') } },
        { id: 'c', keys: [q('KC_C')], action: { type: 'tap', keycode: q('QK_MACRO_0') } },
      ],
    };
    const res = gen(p);
    const c = keymapC(p);
    expect(c).toContain('if (leader_sequence_one_key(KC_A)) {\n        tap_code16(LCTL(KC_A));');
    expect(c).toContain('} else if (leader_sequence_one_key(KC_B)) {\n        navi_play_tap(TG(L_LAYER_1), NULL);');
    expect(c).toContain('} else if (leader_sequence_one_key(KC_C)) {\n        navi_play_tap(MC_0, NULL);');
    expect(res.issues.filter((i) => i.where.startsWith('leader #'))).toEqual([]);
    expect(rulesMk(p)).toMatch(/REPEAT_KEY_ENABLE = yes/);
  });
});

describe('custom keycode “press a key” = any keycode', () => {
  const tap = (k: string) => ({ type: 'tap' as const, keycode: q(k) });
  const base = createBlankProject('custom any', 4, 10, false);
  it('played for the key’s own record; auto repeat has none (NULL); keys with mods stay tap_code16', () => {
    const p: Project = {
      ...base,
      macros: [{ id: 'm', index: 0, name: 'hi', steps: [{ type: 'text', text: 'hi' }] }],
      customKeycodes: [
        { id: 'a', name: 'MY_LAYER', description: '', action: tap('TG(1)') },
        { id: 'b', name: 'MY_CTRL', description: '', action: tap('C(KC_A)') },
        { id: 'c', name: 'MY_REP', description: '', action: tap('QK_MACRO_0'), repeat: true },
      ],
    };
    const c = keymapC(p);
    expect(c).toContain('case MY_LAYER: navi_play_tap(TG(L_LAYER_1), record); return false;');
    expect(c).toContain('case MY_CTRL: tap_code16(LCTL(KC_A)); return false;');
    expect(c).toContain('        case MY_REP:\n            navi_play_tap(MC_0, NULL);');
  });

  it('a language’s OS shortcut tap_code16 can’t send is played', () => {
    const langs = (shortcut: string): Project => ({
      ...base,
      macros: [{ id: 'm', index: 0, name: 'os', steps: [{ type: 'text', text: 'os' }] }],
      languages: [
        { id: 'en', name: 'English', code: 'en', plainKeys: true, osShortcut: q('LGUI(KC_SPC)') },
        { id: 'xx', name: 'Other', code: 'xx', plainKeys: true, osShortcut: q(shortcut) },
      ],
    });
    expect(keymapC(langs('LALT(KC_LSFT)'))).toContain('if (navi_lang_shortcuts[language] != KC_NO) tap_code16(navi_lang_shortcuts[language]);');
    expect(keymapC(langs('QK_MACRO_0'))).toContain('if (navi_lang_shortcuts[language] != KC_NO) navi_play_tap(navi_lang_shortcuts[language], NULL);');
  });

  it('a key that plays itself, straight or through a macro, is an error', () => {
    const p: Project = {
      ...base,
      macros: [{ id: 'm', index: 0, name: 'm', steps: [{ type: 'tap', keycode: q('QK_USER_1') }] }],
      customKeycodes: [
        { id: 'a', name: 'MY_SELF', description: '', action: tap('QK_USER_0') },
        { id: 'b', name: 'MY_LOOP', description: '', action: tap('QK_MACRO_0') },
        { id: 'c', name: 'MY_FINE', description: '', action: tap('QK_MACRO_0') },
      ],
    };
    const loops = gen(p).issues.filter((i) => i.message.en.includes('plays itself'));
    expect(loops.map((i) => i.where).sort()).toEqual(['MC_0', 'MY_LOOP', 'MY_SELF']);
  });
});

describe('key override replacement = any keycode', () => {
  const ko = (name: string, replacement: string, layers?: number[]): KeyOverride => ({ id: name, name, mods: 0x02, trigger: q('KC_E'), replacement: q(replacement), ...(layers ? { layers } : {}) });
  const project = (overrides: KeyOverride[]): Project => ({ ...createBlankProject('ko any', 4, 10, false), keyOverrides: overrides });

  it('keyboard keys and keys with mods stay QMK’s own replacement; nothing to play', () => {
    const p = project([ko('a', 'KC_X'), ko('b', 'C(KC_Z)')]);
    const c = keymapC(p);
    expect(c).toContain('const key_override_t a = ko_make_basic(MOD_MASK_SHIFT, KC_E, KC_X);');
    expect(c).toContain('const key_override_t b = ko_make_basic(MOD_MASK_SHIFT, KC_E, LCTL(KC_Z));');
    for (const s of ['navi_play', 'navi_send', 'navi_ko_play']) expect(c).not.toContain(s);
    expect(rulesMk(p)).not.toContain('REPEAT_KEY_ENABLE');
  });

  it('anything else: KC_NO + navi_ko_play holding the keycode, ko_make_with_layers’ fields, REPEAT_KEY_ENABLE', () => {
    const p = project([ko('lay', 'MO(1)'), ko('cw', 'CW_TOGG', [1])]);
    const c = keymapC(p);
    expect(c).toContain(
      'const key_override_t lay = {.trigger_mods = MOD_MASK_SHIFT, .layers = ~0, .suppressed_mods = MOD_MASK_SHIFT, .options = (ko_option_t)(ko_options_default | ko_option_no_unregister_on_other_key_down), .negative_mod_mask = 0, .custom_action = navi_ko_play, .context = (void *)(uintptr_t)(MO(L_LAYER_1)), .trigger = KC_E, .replacement = KC_NO, .enabled = NULL};',
    );
    expect(c).toContain('.layers = (1 << L_LAYER_1),');
    expect(c).toContain('.context = (void *)(uintptr_t)(CW_TOGG)');
    expect(c).toContain('static bool navi_ko_play(bool activated, void *context) {\n    navi_play((uint16_t)(uintptr_t)context, NULL, activated);');
    // navi_send, then navi_play, then the overrides.
    expect(c.indexOf('static void navi_send(')).toBeGreaterThan(0);
    expect(c.indexOf('static void navi_send(')).toBeLessThan(c.indexOf('static void navi_play('));
    expect(c.indexOf('static void navi_play(')).toBeLessThan(c.indexOf('navi_ko_play(bool'));
    expect(c).toContain('keyrecord_t none = {.event = MAKE_COMBOEVENT(pressed)};');
    expect(rulesMk(p)).toMatch(/REPEAT_KEY_ENABLE = yes/);
    expect(rulesMk(p)).toMatch(/CAPS_WORD_ENABLE = yes/); // the played keycode's own feature
    expect(gen(p).symbols.has('navi_ko_play')).toBe(true);
  });
});
