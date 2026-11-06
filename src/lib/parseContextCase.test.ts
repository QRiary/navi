import { describe, expect, it } from 'vitest';
import { parseQmk, tryParseQmk } from '../core/keycodes/codec';
import { loadSpec } from '../core/keycodes/spec';
import { createDilemmaProject } from '../core/project/factory';
import { activeKeymap } from '../core/project/ops';
import { parseContext } from './projectContext';

const spec = loadSpec('latest');

function project() {
  const p = createDilemmaProject();
  const layers = activeKeymap(p).layers;
  layers[1].cName = 'nav';
  layers[2].cName = 'NAV';
  layers[3].name = 'Sym';
  return p;
}

describe('a project\'s own names typed in a keycode box', () => {
  const ctx = parseContext(project(), spec);

  it('layers: exact spelling, other case when only one matches, an error when two do', () => {
    expect(parseQmk(spec, 'MO(nav)', ctx)).toBe(parseQmk(spec, 'MO(1)'));
    expect(parseQmk(spec, 'MO(NAV)', ctx)).toBe(parseQmk(spec, 'MO(2)'));
    expect(parseQmk(spec, 'lt(sym, a)', ctx)).toBe(parseQmk(spec, 'LT(3, KC_A)'));
    expect(parseQmk(spec, 'MO(l_sym)', ctx)).toBe(parseQmk(spec, 'MO(3)'));
    expect('error' in tryParseQmk(spec, 'MO(Nav)', ctx)).toBe(true);
  });

  it('lists the names for live typing', () => {
    expect(ctx.ownNames).toEqual(expect.arrayContaining(['nav', 'NAV', 'Sym', 'L_SYM']));
  });
});
