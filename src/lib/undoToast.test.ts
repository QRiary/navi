// The Undo toast after a delete: undoes exactly that delete, and goes away when the history moved on.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createBlankProject } from '../core/project/factory';

let useProjectStore: typeof import('../store/projectStore').useProjectStore;
let useToastStore: typeof import('../store/toastStore').useToastStore;
let deletedToast: typeof import('./undoToast').deletedToast;

beforeAll(async () => {
  const mem = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size;
    },
  };
  (globalThis as Record<string, unknown>).window = {};
  ({ useProjectStore } = await import('../store/projectStore'));
  ({ useToastStore } = await import('../store/toastStore'));
  ({ deletedToast } = await import('./undoToast'));
});

const store = () => useProjectStore.getState();
const toasts = () => useToastStore.getState().toasts;
const rename = (name: string) => (p: ReturnType<typeof createBlankProject>) => ({ ...p, name });

beforeEach(async () => {
  await store().create(createBlankProject('Board', 2, 3, false));
});
afterEach(() => {
  for (const x of toasts()) useToastStore.getState().dismiss(x.id);
  store().close();
});

describe('deletedToast', () => {
  it('Undo brings the deleted thing back and closes the toast', () => {
    store().apply(rename('After delete'), 'delete');
    deletedToast('combo “A”');
    expect(toasts()).toHaveLength(1);
    expect(toasts()[0].message).toContain('combo “A”');
    toasts()[0].action!.run();
    expect(store().project!.name).toBe('Board');
    expect(toasts()).toHaveLength(0);
  });

  it('another change dismisses it and a stale action does nothing', () => {
    store().apply(rename('After delete'), 'delete');
    deletedToast('combo');
    const action = toasts()[0].action!;
    store().apply(rename('Later edit'), 'edit');
    expect(toasts()).toHaveLength(0);
    action.run();
    expect(store().project!.name).toBe('Later edit');
  });

  it('Ctrl+Z dismisses it', () => {
    store().apply(rename('After delete'), 'delete');
    deletedToast('combo');
    store().undo();
    expect(toasts()).toHaveLength(0);
    expect(store().project!.name).toBe('Board');
  });
});
