/**
 * THE OPEN PROJECT: the document, undo/redo, saving.
 *
 *  • Every change goes through apply(fn, label): fn is a pure function from core/project/ops.ts.
 *    The previous state goes to the history (undo Ctrl+Z / redo Ctrl+Y).
 *  • The draft is written to disk half a second after an edit — a restart loses nothing.
 *  • “Save” (Ctrl+S) fixes a version; the previous saved one goes to the version history on disk.
 *  • saved — the last saved version: unsaved changes are compared with it.
 */
import { create } from 'zustand';
import { sameContent } from '../core/project/diff';
import { parseProjectText, serializeProject, type ValidationIssue } from '../core/project/validate';
import type { Project } from '../core/project/types';
import { loadSpec, type KeycodeSpec } from '../core/keycodes/spec';
import { projectRepo } from '../platform/projectRepo';
import type { Revision, StoredSummary } from '../desktop/bridge';

const HISTORY_LIMIT = 200;
const COALESCE_MS = 900;
const LAST_PROJECT_KEY = 'navi.lastProject';

export interface ProjectState {
  list: StoredSummary[];
  project: Project | null;
  saved: Project | null;
  past: { project: Project; label: string }[];
  future: { project: Project; label: string }[];
  lastChange: { label: string; at: number; coalesce?: string } | null;
  status: 'empty' | 'loading' | 'ready' | 'error';
  saving: boolean;
  draftError: string | null;
  error: string | null;
  issues: ValidationIssue[];

  refreshList(): Promise<void>;
  open(id: string): Promise<boolean>;
  /** A new project (already built) — saved right away. */
  create(project: Project): Promise<void>;
  /** Change the document. coalesce — merge frequent edits (dragging) into one undo step. */
  apply(fn: (p: Project) => Project, label: string, opts?: { coalesce?: string }): void;
  undo(): void;
  redo(): void;
  save(label?: string): Promise<void>;
  revertToSaved(): void;
  remove(id: string): Promise<void>;
  close(): void;
  revisions(): Promise<Revision[]>;
  /** Open a previous version as the current state (a change that can be undone). */
  restoreRevision(file: string): Promise<ValidationIssue[]>;
}

let draftTimer: ReturnType<typeof setTimeout> | null = null;

function rememberLast(id: string | null) {
  try {
    if (id) localStorage.setItem(LAST_PROJECT_KEY, id);
    else localStorage.removeItem(LAST_PROJECT_KEY);
  } catch {
    // not available — no problem
  }
}

export function lastProjectId(): string | null {
  try {
    return localStorage.getItem(LAST_PROJECT_KEY);
  } catch {
    return null;
  }
}

export const useProjectStore = create<ProjectState>()((set, get) => {
  /** Draft to disk — with a delay, so it is not written on every keystroke. */
  const scheduleDraft = () => {
    if (draftTimer) clearTimeout(draftTimer);
    draftTimer = setTimeout(async () => {
      const { project, saved } = get();
      if (!project) return;
      try {
        if (saved && sameContent(project, saved)) await projectRepo.discardDraft(project.id);
        else await projectRepo.saveDraft(project.id, serializeProject(project));
        set({ draftError: null });
      } catch (err) {
        set({ draftError: (err as Error).message });
      }
    }, 500);
  };

  return {
    list: [],
    project: null,
    saved: null,
    past: [],
    future: [],
    lastChange: null,
    status: 'empty',
    saving: false,
    draftError: null,
    error: null,
    issues: [],

    async refreshList() {
      try {
        set({ list: await projectRepo.list() });
      } catch (err) {
        set({ error: (err as Error).message });
      }
    },

    async open(id) {
      set({ status: 'loading', error: null });
      try {
        const { saved, draft } = await projectRepo.read(id);
        const savedParsed = saved ? parseProjectText(saved) : null;
        const draftParsed = draft ? parseProjectText(draft) : null;
        const current = draftParsed?.project ?? savedParsed?.project ?? null;
        if (!current) {
          const issues = draftParsed?.issues ?? savedParsed?.issues ?? [];
          set({ status: 'error', error: issues.find((i) => i.level === 'error')?.message ?? 'cannot open project', issues });
          return false;
        }
        set({
          project: current,
          saved: savedParsed?.project ?? null,
          past: [],
          future: [],
          lastChange: null,
          status: 'ready',
          issues: [...(draftParsed?.issues ?? []), ...(savedParsed?.issues ?? [])],
        });
        rememberLast(id);
        return true;
      } catch (err) {
        set({ status: 'error', error: (err as Error).message });
        return false;
      }
    },

    async create(project) {
      await projectRepo.save(project.id, serializeProject(project), 'created');
      set({ project, saved: project, past: [], future: [], lastChange: null, status: 'ready', error: null, issues: [] });
      rememberLast(project.id);
      await get().refreshList();
    },

    apply(fn, label, opts = {}) {
      const { project, past, lastChange } = get();
      if (!project) return;
      const next = fn(project);
      if (next === project) return;
      const now = Date.now();
      const merge = opts.coalesce && lastChange?.coalesce === opts.coalesce && now - lastChange.at < COALESCE_MS && past.length > 0;
      const newPast = merge ? past : [...past, { project, label }].slice(-HISTORY_LIMIT);
      set({ project: next, past: newPast, future: [], lastChange: { label, at: now, coalesce: opts.coalesce } });
      scheduleDraft();
    },

    undo() {
      const { past, project, future } = get();
      if (!project || past.length === 0) return;
      const prev = past[past.length - 1];
      set({ project: prev.project, past: past.slice(0, -1), future: [{ project, label: prev.label }, ...future], lastChange: null });
      scheduleDraft();
    },

    redo() {
      const { past, project, future } = get();
      if (!project || future.length === 0) return;
      const next = future[0];
      set({ project: next.project, past: [...past, { project, label: next.label }], future: future.slice(1), lastChange: null });
      scheduleDraft();
    },

    async save(label) {
      const { project } = get();
      if (!project) return;
      set({ saving: true });
      try {
        if (draftTimer) clearTimeout(draftTimer);
        await projectRepo.save(project.id, serializeProject(project), label);
        set({ saved: project, saving: false, error: null });
        await get().refreshList();
      } catch (err) {
        set({ saving: false, error: (err as Error).message });
        throw err;
      }
    },

    revertToSaved() {
      const { saved } = get();
      if (!saved) return;
      get().apply(() => saved, 'revert to saved');
    },

    async remove(id) {
      await projectRepo.remove(id);
      if (get().project?.id === id) {
        set({ project: null, saved: null, past: [], future: [], status: 'empty' });
        rememberLast(null);
      }
      await get().refreshList();
    },

    close() {
      set({ project: null, saved: null, past: [], future: [], status: 'empty' });
    },

    async revisions() {
      const { project } = get();
      return project ? projectRepo.revisions(project.id) : [];
    },

    async restoreRevision(file) {
      const { project } = get();
      if (!project) return [];
      const text = await projectRepo.readRevision(project.id, file);
      const { project: old, issues } = parseProjectText(text);
      if (old) get().apply(() => ({ ...old, id: project.id }), 'restore version');
      return issues;
    },
  };
});

// ── Derived values ──────────────────────────────────────────────────────

/** Keycode spec the project is set up for (firmware version). */
export function useSpec(): KeycodeSpec {
  const version = useProjectStore((s) => s.project?.firmware.keycodeSpec ?? 'latest');
  return loadSpec(version);
}

export function isDirty(s: Pick<ProjectState, 'project' | 'saved'>): boolean {
  if (!s.project) return false;
  if (!s.saved) return true;
  return !sameContent(s.project, s.saved);
}
