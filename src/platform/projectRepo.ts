/**
 * PROJECT STORAGE for the interface.
 *  • In the desktop app — files in %APPDATA%\NAVI\projects (through window.navi, see electron/projects.cjs).
 *  • In a browser (npm run dev) — localStorage, so the interface can be viewed without Electron.
 */
import { navi, type Revision, type StoredSummary } from '../desktop/bridge';

export interface ProjectRepo {
  kind: 'desktop' | 'browser';
  list(): Promise<StoredSummary[]>;
  read(id: string): Promise<{ saved: string | null; draft: string | null }>;
  saveDraft(id: string, text: string): Promise<void>;
  discardDraft(id: string): Promise<void>;
  save(id: string, text: string, label?: string): Promise<void>;
  revisions(id: string): Promise<Revision[]>;
  readRevision(id: string, file: string): Promise<string>;
  remove(id: string): Promise<void>;
  /** Undo of `remove`: false when there is nothing to restore (or the id is taken again). */
  restore(id: string): Promise<boolean>;
  /** The project as NAVI last wrote its keymap files (null: never), the baseline of "behavior changes since the last build". */
  readBuilt(id: string): Promise<string | null>;
  saveBuilt(id: string, text: string): Promise<void>;
}

const LS_PREFIX = 'navi.project.';

function summarize(id: string, text: string, unsaved: boolean): StoredSummary {
  try {
    const p = JSON.parse(text);
    const km = p.keymaps?.find((k: { id: string }) => k.id === p.activeKeymapId) ?? p.keymaps?.[0];
    const geo = p.geometries?.find((g: { id: string }) => g.id === p.activeGeometryId) ?? p.geometries?.[0];
    return { id, name: p.name ?? id, updatedAt: p.updatedAt ?? '', keyboard: p.hardware?.name ?? '', layers: km?.layers?.length ?? 0, keys: geo?.keys?.length ?? 0, unsaved };
  } catch {
    return { id, name: id, updatedAt: '', keyboard: '?', layers: 0, keys: 0, unsaved, broken: true };
  }
}

function browserRepo(): ProjectRepo {
  const get = (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  };
  const set = (k: string, v: string) => localStorage.setItem(k, v);
  /** Deleted projects of this session, so “Undo” can bring one back. */
  const trash = new Map<string, Record<string, string>>();
  const ids = () => {
    const out = new Set<string>();
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) ?? '';
      const m = k.match(/^navi\.project\.(.+)\.(saved|draft)$/);
      if (m) out.add(m[1]);
    }
    return [...out];
  };
  return {
    kind: 'browser',
    async list() {
      return ids()
        .map((id) => {
          const draft = get(`${LS_PREFIX}${id}.draft`);
          const saved = get(`${LS_PREFIX}${id}.saved`);
          return summarize(id, (draft ?? saved)!, draft !== null);
        })
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async read(id) {
      return { saved: get(`${LS_PREFIX}${id}.saved`), draft: get(`${LS_PREFIX}${id}.draft`) };
    },
    async saveDraft(id, text) {
      set(`${LS_PREFIX}${id}.draft`, text);
    },
    async discardDraft(id) {
      localStorage.removeItem(`${LS_PREFIX}${id}.draft`);
    },
    async save(id, text) {
      const prev = get(`${LS_PREFIX}${id}.saved`);
      if (prev && prev !== text) set(`${LS_PREFIX}${id}.prev`, prev);
      set(`${LS_PREFIX}${id}.saved`, text);
      localStorage.removeItem(`${LS_PREFIX}${id}.draft`);
    },
    async revisions(id) {
      const prev = get(`${LS_PREFIX}${id}.prev`);
      return prev ? [{ file: 'prev', at: summarize(id, prev, false).updatedAt, label: null, size: prev.length }] : [];
    },
    async readRevision(id) {
      return get(`${LS_PREFIX}${id}.prev`) ?? '';
    },
    async remove(id) {
      const kept: Record<string, string> = {};
      for (const s of ['saved', 'draft', 'prev', 'built']) {
        const v = get(`${LS_PREFIX}${id}.${s}`);
        if (v !== null) kept[s] = v;
        localStorage.removeItem(`${LS_PREFIX}${id}.${s}`);
      }
      trash.set(id, kept);
    },
    async restore(id) {
      const kept = trash.get(id);
      if (!kept || get(`${LS_PREFIX}${id}.saved`) !== null || get(`${LS_PREFIX}${id}.draft`) !== null) return false;
      for (const [s, v] of Object.entries(kept)) set(`${LS_PREFIX}${id}.${s}`, v);
      trash.delete(id);
      return true;
    },
    async readBuilt(id) {
      return get(`${LS_PREFIX}${id}.built`);
    },
    async saveBuilt(id, text) {
      set(`${LS_PREFIX}${id}.built`, text);
    },
  };
}

export const projectRepo: ProjectRepo = navi ? { kind: 'desktop', ...navi.projects } : browserRepo();
