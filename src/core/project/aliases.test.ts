import { describe, expect, it } from 'vitest';
import { parseQmk } from '../keycodes/codec';
import { buildCatalog } from '../keycodes/catalog';
import { keyLabel } from '../keycodes/labels';
import { loadSpec } from '../keycodes/spec';
import { generateKeymap } from '../qmk/generate';
import { aliasCName, aliasLookup, checkKeyAliases } from './aliases';
import { createDilemmaProject } from './factory';
import { activeKeymap, addLayer, moveLayer, removeLayer, setKeycodes } from './ops';
import type { KeyAlias, Project } from './types';

const spec = loadSpec('latest');
const q = (s: string) => parseQmk(spec, s);
const alias = (label: string, expr: string, id = label): KeyAlias => ({ id, label, keycode: q(expr) });

function withAliases(aliases: KeyAlias[], pipeline = false): Project {
  let p = createDilemmaProject();
  const km = activeKeymap(p);
  p = setKeycodes(p, km.id, 0, [[0, 0]], q('C(KC_C)'));
  p = setKeycodes(p, km.id, 0, [[0, 1]], q('LT(1, KC_BSPC)'));
  return { ...p, keyAliases: aliases, firmware: { ...p.firmware, pipeline: pipeline ? { enabled: true, headers: [] } : undefined } };
}

const file = (p: Project, name: string) => {
  const res = generateKeymap({ project: p, keymap: activeKeymap(p), spec, via: false, encoderCount: 0 });
  return { text: res.files.find((f) => f.name === name)?.text ?? '', issues: res.issues };
};

describe('key alias C names', () => {
  it('NV_ + the label in upper case, other characters as _', () => {
    expect(aliasCName('Copy')).toBe('NV_COPY');
    expect(aliasCName('Copy line')).toBe('NV_COPY_LINE');
    expect(aliasCName('  copy!  ')).toBe('NV_COPY');
    expect(aliasCName('Ctrl+Shift+T')).toBe('NV_CTRL_SHIFT_T');
    expect(aliasCName('F5')).toBe('NV_F5');
  });

  it('Russian and Ukrainian letters are transliterated', () => {
    expect(aliasCName('Копировать')).toBe('NV_KOPIROVAT');
    expect(aliasCName('Щука')).toBe('NV_SHCHUKA');
    expect(aliasCName('Їжак')).toBe('NV_YIZHAK');
  });

  it('a label without letters or digits has no C name', () => {
    expect(aliasCName('')).toBeNull();
    expect(aliasCName('→ ←')).toBeNull();
  });
});

describe('key alias checks', () => {
  const issuesOf = (aliases: KeyAlias[]) => checkKeyAliases(withAliases(aliases), ['BASE', 'L_LOWER']);

  it('valid aliases become defines, in order', () => {
    const r = issuesOf([alias('Copy', 'C(KC_C)'), alias('Nav bksp', 'LT(1, KC_BSPC)')]);
    expect(r.issues).toEqual([]);
    expect(r.defines).toEqual([
      { cName: 'NV_COPY', keycode: 0x0106 },
      { cName: 'NV_NAV_BKSP', keycode: q('LT(1, KC_BSPC)') },
    ]);
  });

  it('errors: no label, no key, a taken C name; the bad ones are not defined', () => {
    const r = issuesOf([alias('', 'KC_A', 'a'), alias('Empty', 'KC_NO', 'b'), alias('Copy', 'C(KC_C)', 'c'), alias('copy!', 'C(KC_X)', 'd'), alias('?!', 'KC_B', 'e')]);
    expect(r.issues.map((i) => [i.where, i.level])).toEqual([
      ['alias 1', 'error'],
      ['alias 2 “Empty”', 'error'],
      ['alias 4 “copy!”', 'error'],
      ['alias 5 “?!”', 'error'],
    ]);
    expect(r.defines.map((d) => d.cName)).toEqual(['NV_COPY']);
    // keys show only the aliases that work: one per C name, none on KC_NO
    const shown = aliasLookup([alias('', 'KC_A', 'a'), alias('Empty', 'KC_NO', 'b'), alias('Copy', 'C(KC_C)', 'c'), alias('copy!', 'C(KC_X)', 'd')]);
    expect([...shown.values()].map((a) => a.label)).toEqual(['Copy']);
  });

  it('a C name taken by a layer, custom keycode or tap dance is an error', () => {
    const p = { ...withAliases([alias('Hello', 'KC_A'), alias('Lower', 'KC_B')]), customKeycodes: [{ id: 'x', name: 'NV_HELLO', description: '', action: { type: 'none' as const } }] };
    const r = checkKeyAliases(p, ['BASE', 'NV_LOWER']);
    expect(r.issues.filter((i) => i.level === 'error')).toHaveLength(2);
    expect(r.defines).toEqual([]);
  });

  it('a second alias of the same key is a warning; keys show the first', () => {
    const aliases = [alias('Copy', 'C(KC_C)'), alias('Copy 2', 'C(KC_C)')];
    const r = issuesOf(aliases);
    expect(r.issues.map((i) => i.level)).toEqual(['warning']);
    expect(r.defines.map((d) => d.cName)).toEqual(['NV_COPY', 'NV_COPY_2']);
    expect(aliasLookup(aliases).get(0x0106)).toEqual({ label: 'Copy', cName: 'NV_COPY' });
  });
});

describe('key aliases on keys', () => {
  const lookup = aliasLookup([alias('Copy', 'C(KC_C)'), alias('Nav bksp', 'LT(1, KC_BSPC)')]);
  const ctx = { alias: (v: number) => lookup.get(v) };

  it('the alias replaces the large label, the hold part stays, the tooltip names the C name', () => {
    expect(keyLabel(spec, q('C(KC_C)'), ctx)).toMatchObject({ main: 'Copy', top: undefined, kind: 'mod-combo', qmk: 'LCTL(KC_C)' });
    const lt = keyLabel(spec, q('LT(1, KC_BSPC)'), ctx);
    expect(lt).toMatchObject({ main: 'Nav bksp', hold: 'L1', kind: 'layer-tap' });
    expect(lt.description).toMatch(/^NV_NAV_BKSP/);
    expect(keyLabel(spec, q('C(KC_V)'), ctx).main).not.toBe('Copy');
  });

  it('the catalog has an Aliases group, found by the C name', () => {
    const items = buildCatalog(spec, { ...ctx, layerCount: 2, aliases: [...lookup].map(([value, a]) => ({ value, ...a })) });
    const group = items.filter((i) => i.category === 'aliases');
    expect(group.map((i) => [i.name, i.label, i.value])).toEqual([
      ['NV_COPY', 'Copy', 0x0106],
      ['NV_NAV_BKSP', 'Nav bksp', q('LT(1, KC_BSPC)')],
    ]);
    expect(group[0].search).toContain('nv_copy');
  });
});

describe('key aliases in the generated C', () => {
  it('own pipeline: #define in navi.h after the enums; keymap.c keeps the plain keycodes', () => {
    const p = withAliases([alias('Copy', 'C(KC_C)'), alias('Nav bksp', 'LT(1, KC_BSPC)')], true);
    const h = file(p, 'navi.h').text;
    const c = file(p, 'keymap.c').text;
    expect(h).toContain('#define NV_COPY LCTL(KC_C)\n#define NV_NAV_BKSP LT(L_LAYER_1, KC_BSPC)');
    expect(h.indexOf('#define NV_COPY')).toBeGreaterThan(h.indexOf('enum navi_layers'));
    expect(c).not.toContain('NV_');
    expect(c).toContain('LCTL(KC_C)');
  });

  it('without own pipeline: #define in keymap.c, before the keymap', () => {
    const p = withAliases([alias('Copy', 'C(KC_C)')]);
    const c = file(p, 'keymap.c').text;
    expect(c).toContain('#define NV_COPY LCTL(KC_C)');
    expect(c.indexOf('#define NV_COPY')).toBeLessThan(c.indexOf('const uint16_t PROGMEM keymaps'));
  });

  it('an alias with an error is reported and not written', () => {
    const p = withAliases([alias('', 'C(KC_C)')]);
    const r = file(p, 'keymap.c');
    expect(r.text).not.toContain('#define NV_');
    expect(r.issues.some((i) => i.level === 'error' && i.where === 'alias 1')).toBe(true);
  });
});

describe('key aliases follow layer changes', () => {
  it('a moved layer renumbers the alias; a deleted layer drops it', () => {
    let p = withAliases([alias('Num', 'TG(2)'), alias('Copy', 'C(KC_C)')]);
    const km = activeKeymap(p);
    p = moveLayer(p, km.id, spec, 2, 0);
    expect(p.keyAliases.map((a) => a.keycode)).toEqual([q('TG(0)'), 0x0106]);
    p = removeLayer(p, km.id, spec, 0);
    expect(p.keyAliases.map((a) => a.label)).toEqual(['Copy']);
    // adding a layer at the end changes nothing
    p = addLayer(p, km.id, 'Extra');
    expect(p.keyAliases.map((a) => a.label)).toEqual(['Copy']);
  });
});
