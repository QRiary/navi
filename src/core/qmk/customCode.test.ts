import { describe, expect, it } from 'vitest';
import { loadSpec } from '../keycodes/spec';
import { createDilemmaProject } from '../project/factory';
import { activeKeymap, patchProject } from '../project/ops';
import { serializeProject, validateProject } from '../project/validate';
import type { Project } from '../project/types';
import { allowedMakeVar, checkCustom, NAVI_HOOKS, unsafeDefineValue } from './customCode';
import { generateKeymap } from './generate';

const spec = loadSpec('latest');
const errors = (file: Parameters<typeof checkCustom>[0], text: string, symbols?: Set<string>) => checkCustom(file, text, symbols).filter((i) => i.level === 'error');
const gen = (p: Project) => generateKeymap({ project: p, keymap: activeKeymap(p), spec, via: true, encoderCount: 2 });
const withCustom = (custom: Project['firmware']['custom'], extra: Partial<Project['firmware']> = {}) => {
  const p = createDilemmaProject();
  return patchProject(p, { firmware: { ...p.firmware, custom, ...extra } });
};

describe('own lines: rules.mk', () => {
  it('flags and drivers pass', () => {
    expect(errors('rules.mk', 'CONSOLE_ENABLE = yes\n# comment\nLTO_ENABLE := yes\nWS2812_DRIVER = vendor\nSRC += my_code.c lib/other.c\n')).toEqual([]);
  });

  it('anything that can run a command is forbidden', () => {
    for (const bad of [
      'X_ENABLE = $(shell calc)',
      'X_ENABLE != calc',
      'X_ENABLE = `calc`',
      '\tcalc',
      'all: ; calc',
      'include /etc/passwd',
      'export X_ENABLE = yes',
      'CC = powershell -enc AAAA',
      'SHELL = cmd',
      'PYTHON = calc',
      'OPT_DEFS += -include/etc/passwd',
      'EXTRAFLAGS += -fplugin=x',
      '.RECIPEPREFIX = >',
      'X_ENABLE = yes\\#$(shell calc)',
      'SRC += ../../../evil.c',
      'SRC += /abs/evil.c',
      'X_DRIVER = ../x',
    ]) {
      expect(errors('rules.mk', bad).length, bad).toBeGreaterThan(0);
    }
  });

  it('own pipeline: the include of navi_rules.mk next to the makefile passes, other includes do not', () => {
    expect(errors('rules.mk', 'include $(dir $(lastword $(MAKEFILE_LIST)))navi_rules.mk\nCOMBO_ENABLE = yes')).toEqual([]);
    for (const bad of [
      'include $(dir $(lastword $(MAKEFILE_LIST)))navi_rules.mk $(shell calc)',
      'include $(dir $(lastword $(MAKEFILE_LIST)))../navi_rules.mk',
      'include $(dir $(lastword $(MAKEFILE_LIST)))other.mk',
      '-include $(dir $(lastword $(MAKEFILE_LIST)))navi_rules.mk',
      'include $(shell calc)navi_rules.mk',
      'include navi_rules.mk',
    ]) {
      expect(errors('rules.mk', bad).length, bad).toBeGreaterThan(0);
    }
  });

  it('list of make variables', () => {
    expect(allowedMakeVar('RGB_MATRIX_ENABLE')).toBe(true);
    expect(allowedMakeVar('CONVERT_TO')).toBe(true);
    for (const v of ['CC', 'SHELL', 'MAKEFLAGS', 'CFLAGS', 'OPT_DEFS', 'QMK_BIN', 'ENABLE']) expect(allowedMakeVar(v), v).toBe(false);
  });
});

describe('own lines: config.h and keymap.c', () => {
  it('config.h: only #define/#undef/#if', () => {
    expect(errors('config.h', '#define PERMISSIVE_HOLD\n#undef TAPPING_TERM\n#define TAPPING_TERM 180 // fast\n#ifdef RGB_MATRIX_ENABLE\n#  define RGB_MATRIX_TIMEOUT 60000\n#endif\n/* note\n   more */')).toEqual([]);
    expect(errors('config.h', '#include "/etc/passwd"').length).toBe(1);
    expect(errors('config.h', 'int x = 1;').length).toBe(1);
    expect(errors('config.h', '#ifdef X\n#define Y').length).toBe(1);
  });

  it('keymap.c: QMK headers are fine, files of this computer are not', () => {
    expect(errors('keymap.c', '#include "print.h"\n#include QMK_KEYBOARD_H\nvoid keyboard_post_init_user(void) {}')).toEqual([]);
    for (const bad of ['#include "/etc/passwd"', '#include "../../../secret.h"', '#include_next "C:/x.h"', '#import "../x"', '#embed "/etc/passwd"', 'asm(".incbin \\"/etc/passwd\\"");', '# /* c */ include "/x"']) {
      expect(errors('keymap.c', bad).length, bad).toBeGreaterThan(0);
    }
  });

  it('keymap.c: check workarounds — strings with “/*”, “\\” line joining, the %: digraph, a comment inside a directive', () => {
    for (const bad of [
      'char *a = "/*";\n#include "/etc/passwd"\nchar *b = "*/";',
      'char *a = "/*";\n#/*\n*/include "/etc/passwd"\nchar *b = "*/";',
      '#inc\\\nlude "/etc/passwd"',
      '%:include "/etc/passwd"',
      '# /* c */ include "../x.h"',
      'const char *s = R"x(" /* )x";\n#include "/etc/passwd"\n// */',
      'asm(".inc" "bin \\"/etc/passwd\\"");',
      '#define P(a, b) a##b',
      'int x = __has_include("/etc/passwd");',
    ]) {
      expect(errors('keymap.c', bad).length, bad).toBeGreaterThan(0);
    }
    // while normal code with strings and comments gives no false errors
    expect(errors('keymap.c', 'const char *url = "http://example.com/*x*/"; // comment\n/* block\n   comment */\nvoid matrix_scan_user(void) {}')).toEqual([]);
  });

  it('config.h: strings and line joining do not hide #include', () => {
    expect(errors('config.h', '#define A "/*"\n#include "/etc/passwd"\n#define B "*/"').length).toBeGreaterThan(0);
    expect(errors('config.h', '#define LONG_VALUE 1 + \\\n  2').length).toBe(0);
    expect(errors('config.h', '%:include "x.h"').length).toBeGreaterThan(0);
  });

  it('keymap.c: a second definition of what the generator creates', () => {
    const code = 'bool process_record_user(uint16_t keycode, keyrecord_t *record) {\n    return true;\n}';
    expect(errors('keymap.c', code, new Set(['process_record_user'])).length).toBe(1);
    expect(errors('keymap.c', code, new Set(['keymaps']))).toEqual([]);
    expect(errors('keymap.c', '// process_record_user(keycode, record) {', new Set(['process_record_user']))).toEqual([]);
    expect(errors('keymap.c', 'void leader_end_user(void) {}', new Set(['leader_end_user'])).length).toBe(1);
    expect(errors('keymap.c', 'const uint32_t PROGMEM unicode_map[] = { 0x41 };', new Set(['unicode_map'])).length).toBe(1);
  });

  it('#define values from Advanced without code blocks', () => {
    expect(unsafeDefineValue('200')).toBe(false);
    expect(unsafeDefineValue('UNICODE_MODE_WINCOMPOSE')).toBe(false);
    expect(unsafeDefineValue('({ asm(".incbin x"); 200; })')).toBe(true);
  });
});

describe('own lines in the generated files', () => {
  it('are appended to the end of the files', () => {
    const res = gen(withCustom({ 'config.h': '#define PERMISSIVE_HOLD', 'rules.mk': 'CONSOLE_ENABLE = yes', 'keymap.c': 'void keyboard_post_init_user(void) {}' }));
    const file = (n: string) => res.files.find((f) => f.name === n)!.text;
    expect(file('config.h').trimEnd().split('\n').slice(-2)[0]).toBe('#define PERMISSIVE_HOLD');
    expect(file('rules.mk')).toMatch(/VIA_ENABLE = yes[\s\S]*CONSOLE_ENABLE = yes\n# ── end/);
    expect(file('keymap.c')).toMatch(/keyboard_post_init_user[\s\S]*end of your own lines ──\n$/);
    expect(res.issues.filter((i) => i.level === 'error')).toEqual([]);
  });

  it('a repeated #define without #undef is a warning', () => {
    const p = withCustom({ 'config.h': '#define TAPPING_TERM 150' });
    const res = gen(patchProject(p, { firmware: { ...p.firmware, buildConfig: { TAPPING_TERM: 200 } } }));
    expect(res.issues.some((i) => i.level === 'warning' && i.message.en.includes('TAPPING_TERM'))).toBe(true);
    const ok = gen(patchProject(p, { firmware: { ...p.firmware, buildConfig: { TAPPING_TERM: 200 }, custom: { 'config.h': '#undef TAPPING_TERM\n#define TAPPING_TERM 150' } } }));
    expect(ok.issues.some((i) => i.message.en.includes('TAPPING_TERM'))).toBe(false);
  });

  it('code from an imported file does not get into the files until allowed', () => {
    const p = withCustom({ 'keymap.c': 'void keyboard_post_init_user(void) {}' }, { customReview: true });
    const res = gen(p);
    expect(res.files.find((f) => f.name === 'keymap.c')!.text).not.toContain('keyboard_post_init_user');
    expect(res.issues.some((i) => i.level === 'error' && i.where === 'your own lines')).toBe(true);
  });

  it('project file: own code is kept, dangerous parts are marked, the review flag is kept', () => {
    const p = withCustom({ 'rules.mk': 'CC = calc' }, { customReview: true });
    const { project, issues } = validateProject(JSON.parse(serializeProject(p)));
    expect(project?.firmware.custom).toEqual({ 'rules.mk': 'CC = calc' });
    expect(project?.firmware.customReview).toBe(true);
    expect(issues.some((i) => i.path === 'firmware.custom.rules.mk')).toBe(true);
    expect(gen(project!).issues.some((i) => i.level === 'error')).toBe(true);
  });
});

describe('own lines: conflicts in each mode', () => {
  const prc = 'bool process_record_user(uint16_t keycode, keyrecord_t *record) { return true; }';
  const prcNavi = 'bool process_record_navi(uint16_t keycode, keyrecord_t *record) { return true; }';
  const combos = 'combo_t key_combos[] = { };';

  it('normal mode: a generated QMK hook is a conflict, *_navi names are not', () => {
    const normal = new Set(['keymaps', 'process_record_user', 'key_combos']);
    expect(errors('keymap.c', prc, normal).length).toBe(1);
    expect(errors('keymap.c', combos, normal).length).toBe(1);
    expect(errors('keymap.c', prcNavi, normal)).toEqual([]);
  });

  it('own pipeline: the QMK hooks are the user\'s; *_navi functions and NAVI arrays are conflicts', () => {
    const pipeline = new Set(['keymaps', 'key_combos', 'unicode_map', ...Object.values(NAVI_HOOKS)]);
    expect(errors('keymap.c', prc, pipeline)).toEqual([]);
    expect(errors('keymap.c', 'uint16_t get_combo_term(uint16_t i, combo_t *c) { return get_combo_term_navi(i, c); }', pipeline)).toEqual([]);
    expect(errors('keymap.c', prcNavi, pipeline).map((i) => i.message.en)).toEqual([expect.stringContaining('“process_record_navi” is generated by NAVI')]);
    expect(errors('keymap.c', 'void leader_end_navi(void) {}', pipeline).length).toBe(1);
    expect(errors('keymap.c', combos, pipeline).length).toBe(1);
    expect(errors('keymap.c', 'const uint32_t PROGMEM unicode_map[] = { 0x41 };', pipeline).length).toBe(1);
  });

  it('the generator passes the right set: a pipeline project may define process_record_user in its own lines', () => {
    const p = withCustom({ 'keymap.c': prc }, { pipeline: { enabled: true, headers: [] } });
    expect(gen(p).issues.filter((i) => i.level === 'error')).toEqual([]);
    const q = withCustom({ 'keymap.c': prcNavi }, { pipeline: { enabled: true, headers: [] } });
    expect(gen(q).issues.some((i) => i.level === 'error' && i.where.startsWith('keymap.c'))).toBe(true);
  });
});
