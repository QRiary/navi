/**
 * How to reach a layer (ui-cleanup step 7): every route the walk finds, and that renumbering agrees with it.
 */
import { describe, expect, it } from 'vitest';
import { parseQmk } from '../keycodes/codec';
import { loadSpec } from '../keycodes/spec';
import { createDilemmaProject, KC_NO } from './factory';
import { keysLeadingTo, layerRefs, layerStacks, routesTo, type LayerRef } from './layerRefs';
import { activeKeymap, fillLayer, insertLayer, moveLayer, removeLayer, setEncoder, setKeycodes } from './ops';
import { ensureTapHold } from './tapHoldActions';
import type { MatrixPos, Project, TapDance } from './types';

const spec = loadSpec('latest');
const q = (s: string) => parseQmk(spec, s);
const td = (index: number, extra: Partial<TapDance> = {}): TapDance => ({ id: `td${index}`, index, name: `TD_${index}`, tap: 0, hold: 0, doubleTap: 0, tapHold: 0, ...extra });

/** 5 empty layers, then `keys` placed: [layer, pos, keycode]. */
function project(keys: [number, MatrixPos, number][] = [], extra: Partial<Project> = {}): Project {
  let p = createDilemmaProject();
  let id = activeKeymap(p).id;
  while (activeKeymap(p).layers.length < 5) p = insertLayer(p, id, spec, 'L', activeKeymap(p).layers.length);
  id = activeKeymap(p).id;
  for (let l = 0; l < 5; l++) p = fillLayer(p, id, l, KC_NO);
  p = { ...p, combos: [], tapDances: [], tapHoldActions: [], ...extra };
  for (const [l, pos, v] of keys) p = setKeycodes(p, id, l, [pos], v);
  return p;
}

/** A route as one comparable line. */
const line = (r: LayerRef) => {
  const s = r.source;
  const where = s.kind === 'key' ? `key L${s.layer} ${s.pos}` : s.kind === 'encoder' ? `enc L${s.layer} E${s.encoder} ${s.dir}` : `combo ${s.index}${s.layers ? ` on ${s.layers}` : ''}`;
  return `→L${r.layer} ${r.how}${r.mods ? `+${r.mods}` : ''} ${where}${r.via ? ` via ${r.via.kind}` : ''}${r.part !== undefined ? ` ${r.part}` : ''}`;
};
const lines = (p: Project) => layerRefs(p, spec).map(line).sort();

describe('layerRefs', () => {
  it('plain layer keys, every kind; a key leading to its own layer is left out', () => {
    const p = project([
      [0, [0, 0], q('MO(1)')],
      [0, [0, 1], q('LT(2, KC_SPC)')],
      [0, [0, 2], q('LM(3, MOD_LCTL)')],
      [1, [0, 3], q('TG(2)')],
      [1, [0, 0], q('MO(1)')],
      [2, [1, 0], q('TO(0)')],
      [2, [1, 1], q('OSL(4)')],
      [3, [1, 2], q('TT(4)')],
      [4, [1, 3], q('DF(1)')],
    ]);
    expect(lines(p)).toEqual(
      [
        '→L1 MO key L0 0,0',
        '→L2 LT key L0 0,1',
        '→L3 LM+1 key L0 0,2',
        '→L2 TG key L1 0,3',
        '→L0 TO key L2 1,0',
        '→L4 OSL key L2 1,1',
        '→L4 TT key L3 1,2',
        '→L1 DF key L4 1,3',
      ].sort(),
    );
  });

  it('tap dance slots and every-tap steps, only when the dance is on a key; own C says nothing', () => {
    const dances = [
      td(0, { tap: q('KC_A'), hold: q('MO(1)'), doubleTap: q('TG(3)') }),
      td(1, { kind: 'every-tap', steps: [{ none: [{ type: 'tap', keycode: q('KC_A') }] }, { none: [{ type: 'tap', keycode: q('MO(2)') }], shift: [{ type: 'tap', keycode: q('MO(2)') }] }] }),
      td(2, { kind: 'own-c', hold: q('MO(4)'), ownC: { onEachTap: 'f' } }),
      td(3, { hold: q('MO(4)') }), // not on any key
    ];
    const p = project(
      [
        [0, [0, 0], q('TD(0)')],
        [0, [0, 1], q('TD(1)')],
        [0, [0, 2], q('TD(2)')],
      ],
      { tapDances: dances },
    );
    expect(lines(p)).toEqual(['→L1 MO key L0 0,0 via tap-dance hold', '→L2 MO key L0 0,1 via tap-dance 2', '→L3 TG key L0 0,0 via tap-dance double-tap'].sort());
  });

  it('tap-hold actions: the tap and the hold slot, a layer hold with mods reads LM', () => {
    let p = project();
    const id = activeKeymap(p).id;
    // Placed one by one, as the key editor does (ensureTapHold drops actions no key carries).
    const put = (layer: number, pos: MatrixPos, tap: number, hold: Parameters<typeof ensureTapHold>[3]) => {
      const r = ensureTapHold(spec, p, tap, hold);
      p = setKeycodes(r.project, id, layer, [pos], r.keycode);
    };
    put(0, [0, 0], q('KC_SPC'), { type: 'layer', layer: 2, mods: 0x01 });
    put(0, [0, 1], q('TG(3)'), { type: 'mods', mods: 0x02 });
    put(1, [0, 2], q('KC_A'), { type: 'key', keycode: q('MO(4)') });
    expect(lines(p)).toEqual(['→L2 LM+1 key L0 0,0 via tap-hold hold', '→L3 TG key L0 0,1 via tap-hold tap', '→L4 MO key L1 0,2 via tap-hold hold'].sort());
  });

  it('combos (any layer or limited) and encoders', () => {
    let p = project([], {
      combos: [
        { id: 'c0', name: 'CM_A', keys: [[0, 0], [0, 1]], result: q('OSL(2)') },
        { id: 'c1', name: 'CM_B', keys: [[1, 0], [1, 1]], result: q('TG(3)'), layers: [1] },
        { id: 'c2', name: 'CM_C', keys: [[2, 0], [2, 1]], result: q('KC_ESC') },
      ],
    });
    p = setEncoder(p, activeKeymap(p).id, 0, 0, 'cw', q('TO(4)'));
    expect(lines(p)).toEqual(['→L2 OSL combo 0', '→L3 TG combo 1 on 1', '→L4 TO enc L0 E0 cw'].sort());
    const refs = layerRefs(p, spec);
    expect(routesTo(refs, 3)).toHaveLength(1);
    // Keys on the shown layer that lead to a layer: combo keys only where the combo works.
    expect(keysLeadingTo(refs, 3, 1)).toEqual([[1, 0], [1, 1]]);
    expect(keysLeadingTo(refs, 3, 0)).toEqual([]);
    expect(keysLeadingTo(refs, 2, 4)).toEqual([[0, 0], [0, 1]]);
  });

  it('keysLeadingTo: keys placed on the shown layer only', () => {
    const p = project([
      [0, [0, 0], q('MO(1)')],
      [2, [0, 3], q('MO(1)')],
    ]);
    const refs = layerRefs(p, spec);
    expect(keysLeadingTo(refs, 1, 0)).toEqual([[0, 0]]);
    expect(keysLeadingTo(refs, 1, 2)).toEqual([[0, 3]]);
    expect(keysLeadingTo(refs, 1, 3)).toEqual([]);
  });

  it('renumbering agrees with the walk: after a move every route follows its layers; after a delete the routes to it are gone', () => {
    let p = project(
      [
        [0, [0, 0], q('MO(1)')],
        [0, [0, 1], q('LT(2, KC_SPC)')],
        [1, [0, 3], q('TG(3)')],
        [2, [0, 0], q('TD(0)')],
      ],
      {
        tapDances: [td(0, { doubleTap: q('TO(4)') })],
        combos: [{ id: 'c0', name: 'CM_A', keys: [[0, 0], [0, 1]], result: q('OSL(3)'), layers: [1, 2] }],
      },
    );
    p = setEncoder(p, activeKeymap(p).id, 1, 0, 'ccw', q('MO(2)'));
    const id = activeKeymap(p).id;
    const order = [0, 2, 3, 1, 4]; // after moveLayer(1 → 3), the old layer numbers in their new places
    const to = (old: number) => order.indexOf(old);
    const moved = (r: LayerRef): LayerRef => ({
      ...r,
      layer: to(r.layer),
      source: r.source.kind === 'combo' ? { ...r.source, ...(r.source.layers ? { layers: r.source.layers.map(to) } : {}) } : { ...r.source, layer: to(r.source.layer) },
    });
    const before = layerRefs(p, spec).map(moved).map(line).sort();
    expect(before).toHaveLength(6);
    expect(lines(moveLayer(p, id, spec, 1, 3))).toEqual(before);
    const gone = removeLayer(p, id, spec, 3);
    expect(routesTo(layerRefs(gone, spec), 3).map(line)).toEqual(['→L3 TO key L2 0,0 via tap-dance double-tap']); // old L4, now L3
  });
});

describe('layerStacks', () => {
  const sorted = (s: number[][] | null) => s?.map((x) => x.join(',')).sort();

  it('the layers that can be on together, by the keys that are really reachable', () => {
    // L0: MO(1) at 0,0, TG(3) at 0,1. L1: MO(2) at 0,1 (hides TG(3)). L3 has KC_NO where MO(1) is.
    const p = project([
      [0, [0, 0], q('MO(1)')],
      [0, [0, 1], q('TG(3)')],
      [1, [0, 1], q('MO(2)')],
    ]);
    expect(sorted(layerStacks(p, spec))).toEqual(['0', '1,0', '2,0', '2,1,0', '3,0']);
  });

  it('layer keys on top: a lower layer turned on later hides the higher one', () => {
    // L0: TG(3) at 0,0; L3 transparent at 0,1, where L0 has MO(1): L1 turned on last hides L3.
    let p = project([
      [0, [0, 0], q('TG(3)')],
      [0, [0, 1], q('MO(1)')],
    ]);
    p = setKeycodes(p, activeKeymap(p).id, 3, [[0, 1]], 1);
    expect(sorted(layerStacks(p, spec))).toEqual(['0', '1,0', '3,0', '3,1,0']);
    expect(sorted(layerStacks({ ...p, firmware: { ...p.firmware, layerKeysOnTop: true } }, spec))).toEqual(['0', '1,0', '3,0']);
  });

  it('gives up (null) past its state limit', () => {
    // 13 layers toggled from L0, all transparent: every subset can be on (8192 states).
    let p = createDilemmaProject();
    const id = activeKeymap(p).id;
    while (activeKeymap(p).layers.length < 14) p = insertLayer(p, id, spec, 'L', activeKeymap(p).layers.length);
    for (let l = 1; l < 14; l++) p = setKeycodes(p, id, 0, [[Math.floor((l - 1) / 6), (l - 1) % 6]], q(`TG(${l})`));
    expect(layerStacks(p, spec)).toBeNull();
  });
});
