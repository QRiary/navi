/** Readable key names on the owner's kinds of keys (stand-ins, TD(), LT, mod-taps, aliases, own keycodes). */
import { describe, expect, it } from 'vitest';
import { labelContext, customKeycodeValue } from '../../lib/projectContext';
import { createDilemmaProject } from '../project/factory';
import { activeKeymap } from '../project/ops';
import type { Project } from '../project/types';
import { parseQmk } from './codec';
import { friendlyName } from './friendly';
import { loadSpec } from './spec';

const spec = loadSpec('latest');
const q = (s: string) => parseQmk(spec, s);

function project(): Project {
  const p = createDilemmaProject();
  const km = activeKeymap(p);
  km.layers[1].name = 'Num';
  km.layers[2].name = 'Navigation';
  p.tapDances = [{ id: 'td', index: 0, name: 'TDI_EXLM', tap: q('KC_1'), hold: 0 } as Project['tapDances'][number]];
  p.customKeycodes = [{ id: 'c', name: 'LANG', description: '', action: { type: 'none' } } as unknown as Project['customKeycodes'][number]];
  p.keyAliases = [{ id: 'a', label: 'Copy', keycode: q('C(KC_C)') }];
  p.tapHoldActions = [
    { id: 't1', keycode: q('LT(1, 0xC3)'), tap: q('KC_SPC'), hold: { type: 'layer', layer: 1, mods: 0 } },
    { id: 't2', keycode: q('LGUI_T(0x02)'), tap: q('S(KC_1)'), hold: { type: 'mods', mods: 0x08 } },
    { id: 't3', keycode: q('LALT_T(0x03)'), tap: 0, hold: { type: 'key', keycode: q('C(KC_C)') } },
  ];
  return p;
}

const ctx = labelContext(project(), spec, { os: 'windows', hostLayout: 'none' });
const name = (expr: string | number) => friendlyName(spec, typeof expr === 'number' ? expr : q(expr), ctx);

describe('friendlyName', () => {
  it('a stand-in reads as its tap and hold, the raw code stays the stand-in', () => {
    expect(name('LT(1, 0xC3)')).toEqual({ text: 'Space · hold Num', qmk: 'LT(Num, 0xC3)' });
    expect(name('LGUI_T(0x02)').text).toBe('! · hold Win');
    // A key hold uses the hold key's own name (its alias here); no tap = only the hold.
    expect(name('LALT_T(0x03)').text).toBe('hold Copy');
  });

  it('a tap dance reads as its name', () => {
    expect(name('TD(0)')).toEqual({ text: 'TDI_EXLM', qmk: 'TD(TDI_EXLM)' });
    expect(name('TD(5)').text).toBe('TD 5');
  });

  it('plain LT and mod-taps: tap · hold, with the full layer name', () => {
    expect(name('LT(1, KC_SPC)').text).toBe('Space · hold Num');
    expect(name('LT(2, KC_A)').text).toBe('A · hold Navigation');
    expect(name('LCTL_T(KC_A)')).toEqual({ text: 'A · hold Ctrl', qmk: 'LCTL_T(KC_A)' });
    expect(name('MO(2)').text).toBe('MO Navigation');
  });

  it('an alias wins over the key itself; the raw code is the real expression', () => {
    expect(name('C(KC_C)')).toEqual({ text: 'Copy', qmk: 'LCTL(KC_C)' });
    expect(name('C(KC_V)').text).toBe('Ctrl+V');
  });

  it('an own keycode reads as its name', () => {
    expect(name(customKeycodeValue(spec, 0)).text).toBe('LANG');
  });

  it('plain keys use the key label; empty, transparent and unknown values fall back to the raw code', () => {
    expect(name('KC_ENTER').text).toBe('Enter');
    expect(name('S(KC_1)').text).toBe('!');
    expect(name('KC_KP_1').text).toBe('Num 1');
    expect(name('KC_NO').text).toBe('KC_NO');
    expect(name('KC_TRNS').text).toBe('KC_TRNS');
    const unknown = name(0x7f7f);
    expect(unknown.text).toBe(unknown.qmk);
  });

  it('works without a project context', () => {
    expect(friendlyName(spec, q('LT(1, KC_SPC)')).text).toBe('Space · hold 1');
  });
});
