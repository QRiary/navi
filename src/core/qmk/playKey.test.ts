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
