import { describe, expect, it } from 'vitest';
import { caseInsensitiveLookup, parseQmk, tryParseQmk, typingCase } from './codec';
import { parseKeySequence } from './sequence';
import { loadSpec } from './spec';

const spec = loadSpec('latest');

describe('typed keycodes: any case, KC_ optional, keymap.c paste', () => {
  it('names, functions and MOD_* constants in any case', () => {
    expect(parseQmk(spec, 'kc_a')).toBe(0x04);
    expect(parseQmk(spec, 'Kc_Esc')).toBe(0x29);
    expect(parseQmk(spec, 'lctl_t(kc_a)')).toBe(0x2104);
    expect(parseQmk(spec, 'mt(mod_lctl | mod_lsft, kc_a)')).toBe(0x2304);
    expect(parseQmk(spec, 'lt(2, kc_spc)')).toBe(0x422c);
    expect(parseQmk(spec, 'os_lsft')).toBe(0x52a2);
    expect(parseQmk(spec, 'kc_exlm')).toBe(parseQmk(spec, 'S(KC_1)'));
  });

  it('mixed-case QMK names: exact and in any case', () => {
    const aFlat = parseQmk(spec, 'MI_Ab');
    expect(parseQmk(spec, 'MI_AB')).toBe(aFlat);
    expect(parseQmk(spec, 'mi_ab')).toBe(aFlat);
    expect(parseQmk(spec, 'mi_as')).toBe(parseQmk(spec, 'MI_As'));
    expect(parseQmk(spec, 'mi_as')).not.toBe(aFlat);
  });

  it('KC_ may be left out; digits stay numbers', () => {
    expect(parseQmk(spec, 'a')).toBe(0x04);
    expect(parseQmk(spec, 'esc')).toBe(0x29);
    expect(parseQmk(spec, 'lctl(c)')).toBe(0x0106);
    expect(parseQmk(spec, 'lt(1, spc)')).toBe(0x412c);
    expect(parseQmk(spec, '1')).toBe(1);
    expect('error' in tryParseQmk(spec, 'kc_nonsense')).toBe(true);
    expect('error' in tryParseQmk(spec, 'nonsense')).toBe(true);
  });

  it('a trailing comma from keymap.c is ignored, a lone comma or two are not', () => {
    expect(parseQmk(spec, '  KC_A,  ')).toBe(0x04);
    expect(parseQmk(spec, 'LT(1, KC_SPC),')).toBe(0x412c);
    expect('error' in tryParseQmk(spec, ',')).toBe(true);
    expect('error' in tryParseQmk(spec, 'KC_A,,')).toBe(true);
  });

  it('own names: exact spelling first, one other-case match, two → an error naming both', () => {
    const layerByName = caseInsensitiveLookup<number>([['nav', 1], ['NAV', 2], ['Sym', 3]]);
    const ctx = { layerByName };
    expect(parseQmk(spec, 'MO(nav)', ctx)).toBe(parseQmk(spec, 'MO(1)'));
    expect(parseQmk(spec, 'MO(NAV)', ctx)).toBe(parseQmk(spec, 'MO(2)'));
    expect(parseQmk(spec, 'mo(sym)', ctx)).toBe(parseQmk(spec, 'MO(3)'));
    const r = tryParseQmk(spec, 'MO(Nav)', ctx);
    expect('error' in r && r.error).toMatch(/nav.*NAV/);
  });

  it('an own keycode wins over a QMK name only KC_ would make', () => {
    const customByName = caseInsensitiveLookup<number>([['Paste', 0x7e40]]);
    expect(parseQmk(spec, 'paste', { customByName })).toBe(0x7e40);
    expect(parseQmk(spec, 'KC_PASTE', { customByName })).not.toBe(0x7e40);
  });

  it('leader sequences take QMK names in any case', () => {
    expect(parseKeySequence(spec, 'f1 kc_ent esc')).toEqual({ keys: [0x3a, 0x28, 0x29] });
  });
});

describe('typingCase: what a keycode box shows while typed in', () => {
  const at = (text: string, own: string[] = []) => typingCase(spec, text, text.length, own);

  it('capitals as you type; numbers and the rest stay', () => {
    expect(at('kc_a')).toBe('KC_A');
    expect(at('lt(2, kc_spc')).toBe('LT(2, KC_SPC');
    expect(at('mt(mod_lctl | ')).toBe('MT(MOD_LCTL | ');
    expect(at('0x1f')).toBe('0x1f');
    expect(at('')).toBe('');
  });

  it('same length, so the caret never moves', () => {
    for (const s of ['lt(nav, kc_a)', 'mi_ab, 0xff', 'lctl(c)']) expect(typingCase(spec, s, 3, ['nav']).length).toBe(s.length);
  });

  it('a finished mixed-case QMK name gets its spelling; the one being typed stays in capitals', () => {
    expect(at('mi_ab')).toBe('MI_AB');
    expect(at('mi_ab ')).toBe('MI_Ab ');
    expect(typingCase(spec, 'lt(1, mi_ab)', 3)).toBe('LT(1, MI_Ab)');
  });

  it('own names with small letters: kept while they could still be one, spelled once finished', () => {
    expect(at('lt(na', ['nav'])).toBe('LT(na');
    expect(at('lt(nav', ['nav'])).toBe('LT(nav');
    expect(at('lt(NAV, ', ['nav'])).toBe('LT(nav, ');
    expect(at('lt(navy', ['nav'])).toBe('LT(NAVY');
    expect(at('lt(nav, ', ['nav', 'NAV'])).toBe('LT(nav, ');
    expect(at('lt(Nav, ', ['nav', 'NAV'])).toBe('LT(Nav, ');
    expect(at('lt(l_nav', ['L_NAV'])).toBe('LT(L_NAV');
  });
});
