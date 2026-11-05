// Deleting a project and the Undo that brings it back (browser repo: localStorage).
import { beforeAll, describe, expect, it } from 'vitest';
import { createBlankProject } from '../core/project/factory';

let useProjectStore: typeof import('./projectStore').useProjectStore;
let isDirty: typeof import('./projectStore').isDirty;

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
  ({ useProjectStore, isDirty } = await import('./projectStore'));
});

const store = () => useProjectStore.getState();

describe('restoreRemoved', () => {
  it('a deleted project is back in the list after Undo', async () => {
    const project = createBlankProject('Board', 2, 3, false);
    await store().create(project);
    await store().remove(project.id);
    expect(store().list.some((p) => p.id === project.id)).toBe(false);
    expect(await store().restoreRemoved(project.id)).toBe(true);
    expect(store().list.some((p) => p.id === project.id)).toBe(true);
  });

  it('restoring twice, or a project never deleted, says false', async () => {
    const project = createBlankProject('Other', 2, 3, false);
    await store().create(project);
    expect(await store().restoreRemoved(project.id)).toBe(false);
    await store().remove(project.id);
    expect(await store().restoreRemoved(project.id)).toBe(true);
    expect(await store().restoreRemoved(project.id)).toBe(false);
  });
});

describe('revertToSaved', () => {
  it('drops the edits since the last save, and Undo brings them back', async () => {
    const project = createBlankProject('Revert', 2, 3, false);
    await store().create(project);
    store().apply((p) => ({ ...p, name: 'Edited' }), 'rename');
    expect(isDirty(store())).toBe(true);
    store().revertToSaved();
    expect(isDirty(store())).toBe(false);
    expect(store().project?.name).toBe('Revert');
    store().undo();
    expect(store().project?.name).toBe('Edited');
  });
});
