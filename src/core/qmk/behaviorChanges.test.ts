import { describe, expect, it } from 'vitest';
import { parseQmk } from '../keycodes/codec';
import { loadSpec } from '../keycodes/spec';
import { createBlankProject } from '../project/factory';
import { activeKeymap } from '../project/ops';
import type { Project } from '../project/types';
import { behaviorChanges, changesOfItem, changesOfKey, changesOfLayers, type BehaviorChange } from './behaviorChanges';

const spec = loadSpec('latest');
const kc = (s: string) => parseQmk(spec, s);

/** A made-up 2×4 board: layer 0 letters, a layer key (r0c3 → 1), a mod-tap, an LT (r1c1 → 2); layer 1 digits. */
function board(edit?: (p: Project) => void): Project {
  const p = createBlankProject('Test board', 2, 4, false);
  const km = activeKeymap(p);
  km.layers[0]!.keys = ['KC_A', 'KC_B', 'LSFT_T(KC_C)', 'MO(1)', 'KC_D', 'LT(2,KC_E)', 'KC_TRNS', 'KC_NO'].map(kc);
  km.layers[1]!.keys = ['KC_1', 'KC_2', 'KC_TRNS', 'KC_TRNS', 'S(KC_3)', 'KC_TRNS', 'KC_TRNS', 'KC_TRNS'].map(kc);
  km.layers[2]!.keys = ['KC_X', 'QK_BOOT', 'KC_TRNS', 'KC_TRNS', 'KC_TRNS', 'KC_TRNS', 'KC_TRNS', 'KC_TRNS'].map(kc);
  edit?.(p);
  return p;
}

/** A copy of `p` with one key set (structuredClone: the baseline is never touched). */
function withKey(p: Project, layer: number, index: number, key: string, edit?: (q: Project) => void): Project {
  const q = structuredClone(p);
  activeKeymap(q).layers[layer]!.keys[index] = kc(key);
  edit?.(q);
  return q;
}

const texts = (cs: BehaviorChange[]) => cs.map((c) => c.text?.en ?? '(other)');

describe('behaviorChanges', () => {
  it('nothing changed: nothing to say', () => {
    const p = board();
    expect(behaviorChanges(spec, p, structuredClone(p))).toEqual([]);
  });

  it("a key's own tap and hold on its own layer is no side effect", () => {
    const p = board();
    // r0c0 is not transparent anywhere: only its own tap (same) and its new hold change.
    expect(behaviorChanges(spec, p, withKey(p, 0, 0, 'LCTL_T(KC_A)'))).toEqual([]);
  });

  it('the same key showing through a transparent spot on another layer is one', () => {
    const p = board();
    const now = withKey(p, 0, 2, 'KC_Z');
    const cs = behaviorChanges(spec, p, now);
    expect(texts(cs)).toEqual(['The change at r0c2 on Base also shows on Layer 1, Layer 2, where r0c2 is transparent.']);
    expect(changesOfKey(cs, now, 0, [0, 2])).toHaveLength(1);
  });

  it('Key Lock: a key turned into a tap-hold is ignored, one sentence for all its tests', () => {
    const p = board((p) => {
      activeKeymap(p).layers[1]!.keys = ['QK_LOCK', 'KC_ESC', 'KC_F', 'KC_TRNS', 'KC_G', 'KC_TRNS', 'KC_TRNS', 'KC_TRNS'].map(kc);
    });
    const now = withKey(p, 1, 1, 'LALT_T(KC_ESC)');
    const cs = behaviorChanges(spec, p, now);
    expect(texts(cs)).toEqual(["Key Lock now ignores Esc (r0c1 on Layer 1): QMK's Key Lock holds only plain keys, and a tap-hold key isn't one."]);
    expect(cs[0].causes[0]).toEqual({ kind: 'key', layerId: activeKeymap(now).layers[1]!.id, pos: [0, 1] });
    // The tapped-twice test and the "QK_LOCK again" test (it moves to the next key) both sit under that sentence.
    expect(cs[0].cases.length).toBe(2);
    expect(cs[0].text!.ru).toMatch(/^Key Lock теперь пропускает Esc/);
    // And back: Key Lock holds it again.
    expect(texts(behaviorChanges(spec, now, p))[0]).toBe('Key Lock now holds Esc (r0c1 on Layer 1): it is a plain key now.');
  });

  it('a combo that stops firing on a layer, attributed to the key that changed', () => {
    const p = board((p) => {
      activeKeymap(p).layers[1]!.comboRef = 'self';
      p.combos = [{ id: 'c1', name: 'CB_AB', keys: [[0, 0], [0, 1]], result: kc('KC_ESC') }];
    });
    const now = withKey(p, 1, 1, 'KC_NO');
    const cs = behaviorChanges(spec, p, now);
    const combo = cs.find((c) => c.feature === 'combo')!;
    expect(combo.text!.en).toBe('Combo CB_AB no longer fires on Layer 1: r0c1 is KC_NO there.');
    expect(changesOfKey(cs, now, 1, [0, 1])).toContain(combo);
    // Editing the combo itself is its own behavior, not a side effect.
    const edited = structuredClone(p);
    edited.combos[0]!.result = kc('KC_TAB');
    expect(behaviorChanges(spec, p, edited)).toEqual([]);
    expect(changesOfItem(cs, 'combo', 'c1')).toEqual([]);
  });

  it('a key override that loses its modifier key', () => {
    const p = board((p) => {
      p.keyOverrides = [{ id: 'o1', name: 'KO_D', mods: 0x02, trigger: kc('KC_D'), replacement: kc('KC_DEL') }];
    });
    const now = withKey(p, 0, 2, 'KC_C');
    const ko = behaviorChanges(spec, p, now).find((c) => c.feature === 'key-override')!;
    expect(ko.text!.en).toBe("Key override KO_D is no longer tested: no layer the tests reach has both the trigger and a key holding its modifiers.");
    expect(ko.causes[0]).toEqual({ kind: 'key', layerId: activeKeymap(now).layers[0]!.id, pos: [0, 2] });
  });

  it('Caps Word: a key that now ends it', () => {
    const p = board((p) => {
      const km = activeKeymap(p);
      km.layers[0]!.keys = ['KC_A', 'KC_1', 'CW_TOGG', 'MO(2)', 'KC_MINS', 'KC_B', 'KC_TRNS', 'KC_NO'].map(kc);
    });
    const now = withKey(p, 0, 5, 'KC_SPC');
    const cw = behaviorChanges(spec, p, now).filter((c) => c.feature === 'caps-word');
    expect(texts(cw)).toEqual(['Caps Word now ends at Space (r1c1 on Base); before, it shifted it.']);
  });

  it('a layer that can no longer be reached, with its tests under it', () => {
    const p = board();
    const now = withKey(p, 0, 3, 'KC_F');
    const cs = behaviorChanges(spec, p, now);
    const layer = cs.find((c) => c.feature === 'layer')!;
    expect(layer.text!.en).toMatch(/^Layer Layer 1 can no longer be reached: .*\(before: holding r0c3 \(MO Layer 1\)\)\.$/);
    expect(layer.causes).toEqual([{ kind: 'key', layerId: activeKeymap(now).layers[0]!.id, pos: [0, 3] }]);
    expect(layer.cases.length).toBeGreaterThan(0);
    expect(layer.cases.every((c) => c.now === null)).toBe(true);
    expect(changesOfLayers(cs)).toContain(layer);
  });

  it('a change no explainer claims is still listed, under "other"', () => {
    const p = board((p) => {
      p.customKeycodes = [{ id: 'k1', name: 'MY_HI', description: '', action: { type: 'send-string', text: 'hi' } }];
      activeKeymap(p).layers[0]!.keys[4] = spec.rangeByDefine.get('QK_USER')!.start;
    });
    const now = structuredClone(p);
    now.customKeycodes[0]!.action = { type: 'send-string', text: 'ho' };
    const cs = behaviorChanges(spec, p, now);
    expect(cs).toHaveLength(1);
    expect(cs[0]).toMatchObject({ feature: 'other', text: null, causes: [{ kind: 'settings' }] });
    // On layer 0 and on layer 2, where r1c0 is transparent.
    expect(cs[0].cases).toEqual([
      { steps: 'r1c0', was: 'hi', now: 'ho' },
      { steps: '+r1c1 wait:250 r1c0 -r1c1', was: 'hi', now: 'ho' },
    ]);
  });
});
