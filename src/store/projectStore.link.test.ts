// A project linked to a file, through the store: Save writes the file; a file changed outside NAVI is loaded when there
// are no unsaved edits, otherwise the user picks; it is never overwritten before the user saw it.
// The link store is the real one (electron/links.cjs) on a temp folder; NAVI's own project store is in memory.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createBlankProject } from '../core/project/factory';
import { linkedFileText } from '../core/project/link';
import { parseProjectText, serializeProject } from '../core/project/validate';
import type { Project } from '../core/project/types';

const require = createRequire(import.meta.url);
const { createLinkStore } = require('../../electron/links.cjs');

type Stored = { saved: string | null; draft: string | null; history: { label?: string; text: string }[] };
const disk = new Map<string, Stored>();
let tmp: string;
let links: ReturnType<typeof createLinkStore>;
let pickPath = '';

const entry = (id: string) => disk.get(id) ?? (disk.set(id, { saved: null, draft: null, history: [] }), disk.get(id)!);
const fakeNavi = {
  projects: {
    list: async () => [...disk.keys()].map((id) => ({ id, name: id, updatedAt: '', keyboard: '', layers: 0, keys: 0, unsaved: !!disk.get(id)!.draft })),
    read: async (id: string) => ({ saved: entry(id).saved, draft: entry(id).draft }),
    saveDraft: async (id: string, text: string) => void (entry(id).draft = text),
    discardDraft: async (id: string) => void (entry(id).draft = null),
    save: async (id: string, text: string, label?: string) => {
      const e = entry(id);
      if (e.saved !== null && e.saved !== text) e.history.push({ label, text: e.saved });
      e.saved = text;
      e.draft = null;
    },
    revisions: async () => [],
    readRevision: async () => '',
    remove: async (id: string) => void disk.delete(id),
  },
  links: {
    state: async (id: string) => links.state(id),
    open: async () => ({ token: 'tok', name: path.basename(pickPath), path: pickPath, text: fs.readFileSync(pickPath, 'utf8') }),
    attach: async (_token: string, id: string) => (links.attach(id, pickPath, fs.readFileSync(pickPath, 'utf8')), pickPath),
    create: async (id: string, _name: string, text: string) => (fs.writeFileSync(pickPath, text), links.attach(id, pickPath, text), pickPath),
    relink: async (id: string) => (links.relink(id, pickPath), links.state(id)),
    accept: async (id: string, hash: string) => links.accept(id, hash),
    write: async (id: string, text: string, expectHash?: string) => links.write(id, text, expectHash),
    unlink: async (id: string) => links.unlink(id),
  },
};

let useProjectStore: typeof import('./projectStore').useProjectStore;

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
  (globalThis as Record<string, unknown>).window = { navi: fakeNavi };
  ({ useProjectStore } = await import('./projectStore'));
});

let base: Project;
beforeEach(() => {
  disk.clear();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'navi-store-link-'));
  links = createLinkStore(path.join(tmp, 'project-links.json'));
  pickPath = path.join(tmp, 'repo', 'board.navi.json');
  fs.mkdirSync(path.dirname(pickPath), { recursive: true });
  base = parseProjectText(serializeProject(createBlankProject('Linked board', 2, 3, false))).project!;
  useProjectStore.getState().close();
});

const store = () => useProjectStore.getState();
const fileProject = () => parseProjectText(fs.readFileSync(pickPath, 'utf8')).project!;
/** A linked project whose file holds the saved version. */
const linked = async () => {
  fs.writeFileSync(pickPath, linkedFileText(base));
  await store().openLinkedFile();
  return store().project!.id;
};
const editOutside = (fn: (p: Project) => Project) => fs.writeFileSync(pickPath, linkedFileText(fn(fileProject())));
const flushDraft = () => new Promise((r) => setTimeout(r, 600));

describe('project linked to a file', () => {
  it('open a file (linked) creates a project tied to it', async () => {
    const id = await linked();
    expect(store().link).toEqual({ path: pickPath, missing: false });
    expect(id).toBe(base.id);
    expect(disk.get(id)?.saved).not.toBeNull();
  });

  it('a file whose project id is taken gets a new id', async () => {
    await linked();
    const again = await store().openLinkedFile();
    expect(again).not.toBeNull();
    expect(store().project!.id).not.toBe(base.id);
  });

  it('Save writes NAVI’s copy and the linked file', async () => {
    await linked();
    store().apply((p) => ({ ...p, name: 'Renamed' }), 'rename');
    expect(await store().save()).toBe('saved');
    expect(fileProject().name).toBe('Renamed');
    expect(fs.readFileSync(pickPath, 'utf8')).toBe(linkedFileText(store().project!));
  });

  it('a file changed outside NAVI with no unsaved edits is loaded on open; the old version goes to versions', async () => {
    const id = await linked();
    editOutside((p) => ({ ...p, name: 'Pulled' }));
    await store().open(id);
    expect(store().project!.name).toBe('Pulled');
    expect(store().saved!.name).toBe('Pulled');
    expect(store().linkConflict).toBeNull();
    expect(disk.get(id)!.history.at(-1)?.label).toBe('from-file');
    expect(parseProjectText(disk.get(id)!.history.at(-1)!.text).project!.name).toBe('Linked board');
    expect(links.state(id).changed).toBe(false);
  });

  it('a file that only got reformatted is not a change', async () => {
    const id = await linked();
    fs.writeFileSync(pickPath, JSON.stringify(JSON.parse(fs.readFileSync(pickPath, 'utf8')), null, 4));
    await store().open(id);
    expect(store().linkConflict).toBeNull();
    expect(disk.get(id)!.history).toHaveLength(0);
    expect(links.state(id).changed).toBe(false);
  });

  it('changed file + unsaved edits: the user picks; keep my edits → the next Save overwrites the file', async () => {
    const id = await linked();
    store().apply((p) => ({ ...p, name: 'Mine' }), 'rename');
    await flushDraft();
    editOutside((p) => ({ ...p, name: 'Pulled' }));
    await store().open(id);
    expect(store().linkConflict?.kind).toBe('open');
    expect(store().project!.name).toBe('Mine');
    await store().resolveLinkConflict('mine');
    expect(store().linkConflict).toBeNull();
    expect(await store().save()).toBe('saved');
    expect(fileProject().name).toBe('Mine');
  });

  it('changed file + unsaved edits: take the file → my edits are kept in versions', async () => {
    const id = await linked();
    store().apply((p) => ({ ...p, name: 'Mine' }), 'rename');
    await flushDraft();
    editOutside((p) => ({ ...p, name: 'Pulled' }));
    await store().open(id);
    await store().resolveLinkConflict('file');
    expect(store().project!.name).toBe('Pulled');
    expect(store().saved!.name).toBe('Pulled');
    expect(disk.get(id)!.history.map((h) => parseProjectText(h.text).project!.name)).toContain('Mine');
  });

  it('Save over a file changed outside NAVI asks first; overwrite writes my version', async () => {
    await linked();
    editOutside((p) => ({ ...p, name: 'Pulled' }));
    store().apply((p) => ({ ...p, name: 'Mine' }), 'rename');
    expect(await store().save()).toBe('file-conflict');
    expect(fileProject().name).toBe('Pulled');
    expect(store().linkConflict).toMatchObject({ kind: 'save', path: pickPath });
    expect(store().linkConflict!.file!.name).toBe('Pulled');
    await store().resolveLinkConflict('mine');
    expect(fileProject().name).toBe('Mine');
  });

  it('Save over a changed file: load the file’s version instead', async () => {
    await linked();
    editOutside((p) => ({ ...p, name: 'Pulled' }));
    store().apply((p) => ({ ...p, name: 'Mine' }), 'rename');
    await store().save();
    await store().resolveLinkConflict('file');
    expect(store().project!.name).toBe('Pulled');
    expect(fileProject().name).toBe('Pulled');
  });

  it('decide later writes nothing and the next Save asks again', async () => {
    await linked();
    editOutside((p) => ({ ...p, name: 'Pulled' }));
    store().apply((p) => ({ ...p, name: 'Mine' }), 'rename');
    await store().save();
    store().dismissLinkConflict();
    expect(await store().save()).toBe('file-conflict');
    expect(fileProject().name).toBe('Pulled');
  });

  it('a file NAVI cannot read (git conflict marks) can only be overwritten', async () => {
    await linked();
    fs.writeFileSync(pickPath, '<<<<<<< HEAD\n{}\n=======\n{}\n>>>>>>> theirs\n');
    store().apply((p) => ({ ...p, name: 'Mine' }), 'rename');
    expect(await store().save()).toBe('file-conflict');
    expect(store().linkConflict!.file).toBeNull();
    expect(store().linkConflict!.fileError).toBeTruthy();
    await store().resolveLinkConflict('mine');
    expect(fileProject().name).toBe('Mine');
  });

  it('own code changed outside NAVI waits for “allow” after loading', async () => {
    const id = await linked();
    editOutside((p) => ({ ...p, firmware: { ...p.firmware, custom: { 'keymap.c': 'void pulled(void) {}' }, customReview: false } }));
    await store().open(id);
    expect(store().project!.firmware.customReview).toBe(true);
  });

  it('a missing file: NAVI’s copy opens, Save reports it and does not recreate the file', async () => {
    const id = await linked();
    fs.rmSync(pickPath);
    await store().open(id);
    expect(store().link).toEqual({ path: pickPath, missing: true });
    store().apply((p) => ({ ...p, name: 'Mine' }), 'rename');
    expect(await store().save()).toBe('file-missing');
    expect(fs.existsSync(pickPath)).toBe(false);
    expect(store().saved!.name).toBe('Mine');
  });

  it('link to a file writes the saved version; unsaved edits stay a draft', async () => {
    await store().create(base);
    store().apply((p) => ({ ...p, name: 'Unsaved' }), 'rename');
    expect(await store().linkToFile()).toBe(pickPath);
    expect(fileProject().name).toBe('Linked board');
    expect(store().project!.name).toBe('Unsaved');
    await store().save();
    expect(fileProject().name).toBe('Unsaved');
  });

  it('unlink: Save no longer touches the file', async () => {
    await linked();
    await store().unlink();
    store().apply((p) => ({ ...p, name: 'Mine' }), 'rename');
    expect(await store().save()).toBe('saved');
    expect(fileProject().name).toBe('Linked board');
    expect(store().link).toBeNull();
  });
});
