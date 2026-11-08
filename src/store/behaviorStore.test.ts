// The baseline and the recomputed list: a write makes the project the baseline, an edit adds lines, undoing it takes them away.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { parseQmk } from '../core/keycodes/codec';
import { loadSpec } from '../core/keycodes/spec';
import { createBlankProject } from '../core/project/factory';
import { activeKeymap } from '../core/project/ops';
import type { Project } from '../core/project/types';
import { useBehaviorStore } from './behaviorStore';
import { useProjectStore } from './projectStore';

const spec = loadSpec('latest');
const kc = (s: string) => parseQmk(spec, s);

function board(): Project {
  const p = createBlankProject('Test board', 2, 4, false);
  const km = activeKeymap(p);
  km.layers[0]!.keys = ['KC_A', 'KC_B', 'KC_C', 'MO(1)', 'KC_D', 'KC_E', 'KC_TRNS', 'KC_NO'].map(kc);
  km.layers[1]!.keys = ['QK_LOCK', 'KC_ESC', 'KC_F', 'KC_TRNS', 'KC_G', 'KC_TRNS', 'KC_TRNS', 'KC_TRNS'].map(kc);
  return p;
}

beforeAll(() => vi.useFakeTimers());
afterAll(() => vi.useRealTimers());

describe('behaviorStore', () => {
  it('no baseline: no list; after a write the list follows the edits', async () => {
    const p = board();
    useProjectStore.setState({ project: p });
    await vi.advanceTimersByTimeAsync(300);
    expect(useBehaviorStore.getState().baseline).toBe(null);
    expect(useBehaviorStore.getState().changes).toBe(null);

    await useBehaviorStore.getState().record(p);
    await vi.advanceTimersByTimeAsync(300);
    expect(useBehaviorStore.getState().changes).toEqual([]);

    const edited = structuredClone(p);
    activeKeymap(edited).layers[1]!.keys[1] = kc('LALT_T(KC_ESC)');
    useProjectStore.setState({ project: edited });
    await vi.advanceTimersByTimeAsync(300);
    expect(useBehaviorStore.getState().changes?.map((c) => c.feature)).toEqual(['key-lock']);

    // Undo: back to what was written, the line is gone.
    useProjectStore.setState({ project: p });
    await vi.advanceTimersByTimeAsync(300);
    expect(useBehaviorStore.getState().changes).toEqual([]);

    // The next write empties it too.
    useProjectStore.setState({ project: edited });
    await useBehaviorStore.getState().record(edited);
    await vi.advanceTimersByTimeAsync(300);
    expect(useBehaviorStore.getState().changes).toEqual([]);
  });
});
