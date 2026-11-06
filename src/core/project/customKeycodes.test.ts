import { describe, expect, it } from 'vitest';
import { loadSpec } from '../keycodes/spec';
import { createDilemmaProject } from './factory';
import { activeKeymap, deleteCustomKeycode, setKeycodes } from './ops';
import type { Project } from './types';

const spec = loadSpec('latest');
// Literal values: QK_USER starts at 0x7E40 and ends at 0x7FFF; list position adds to the start.
const A = 0x7e40;
const B = 0x7e41;
const C = 0x7e42;
const LANG_TO = 0x7fff;

function sample(): Project {
  let p = createDilemmaProject();
  const km = activeKeymap(p);
  p = setKeycodes(p, km.id, 0, [[0, 0]], B);
  p = setKeycodes(p, km.id, 0, [[0, 1]], C);
  p = setKeycodes(p, km.id, 0, [[0, 2]], A);
  p = setKeycodes(p, km.id, 0, [[0, 3]], LANG_TO);
  return {
    ...p,
    customKeycodes: ['AAA', 'BBB', 'CCC'].map((name) => ({ id: name, name, description: '', action: { type: 'none' as const } })),
    languages: [{ id: 'lang1', name: 'One', code: 'one', plainKeys: true }],
    combos: [{ id: 'combo1', name: 'combo1', keys: [[0, 0], [0, 1]], result: C }],
    tapDances: [{ id: 'td1', index: 0, name: 'TD_ONE', tap: C, hold: A, doubleTap: 0, tapHold: 0 }],
    keyAliases: [
      { id: 'al1', label: 'Cee', keycode: C },
      { id: 'al2', label: 'Aye', keycode: A },
    ],
    macros: [{ id: 'm1', index: 0, name: 'M_ONE', steps: [{ type: 'tap', keycode: C }, { type: 'text', text: 'x' }, { type: 'down', keycode: A }] }],
  };
}

describe('deleteCustomKeycode', () => {
  it('later keycodes move down, the deleted one becomes KC_NO, its alias goes', () => {
    const p = sample();
    const { project, cleared } = deleteCustomKeycode(spec, p, 'AAA');
    const keys = activeKeymap(project).layers[0].keys;
    expect(keys.slice(0, 4)).toEqual([0x7e40, 0x7e41, 0, 0x7fff]);
    expect(project.customKeycodes.map((c) => c.name)).toEqual(['BBB', 'CCC']);
    expect(project.combos[0].result).toBe(0x7e41);
    expect(project.tapDances[0].tap).toBe(0x7e41);
    expect(project.tapDances[0].hold).toBe(0);
    expect(project.keyAliases).toEqual([{ id: 'al1', label: 'Cee', keycode: 0x7e41 }]);
    expect(project.languages).toEqual(p.languages);
    expect(project.macros[0].steps).toEqual([{ type: 'tap', keycode: 0x7e41 }, { type: 'text', text: 'x' }, { type: 'down', keycode: 0 }]);
    expect(cleared).toBe(4); // one key, one tap dance slot, one alias, one macro step
  });

  it('deleting the last one moves nothing', () => {
    const { project, cleared } = deleteCustomKeycode(spec, sample(), 'CCC');
    expect(activeKeymap(project).layers[0].keys.slice(0, 4)).toEqual([0x7e41, 0, 0x7e40, 0x7fff]);
    expect(project.combos[0].result).toBe(0);
    expect(project.tapDances[0].tap).toBe(0);
    expect(project.keyAliases.map((a) => a.id)).toEqual(['al2']);
    expect(cleared).toBe(5); // key, combo result, tap dance slot, alias, macro step
  });

  it('an unknown id changes nothing', () => {
    const p = sample();
    expect(deleteCustomKeycode(spec, p, 'nope')).toEqual({ project: p, cleared: 0 });
  });
});
