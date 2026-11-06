/**
 * THE OPEN PROJECT: the document, undo/redo, saving.
 *
 *  • Every change goes through apply(fn, label): fn is a pure function from core/project/ops.ts.
 *    The previous state goes to the history (undo Ctrl+Z / redo Ctrl+Y).
 *  • The draft is written to disk half a second after an edit — a restart loses nothing.
 *  • “Save” (Ctrl+S) fixes a version; the previous saved one goes to the version history on disk.
 *  • saved — the last saved version: unsaved changes are compared with it.
 *  • A project can be linked to a file the user picked (desktop only, electron/links.cjs): Save also writes that
 *    file; a file changed outside NAVI is loaded when there are no unsaved edits, otherwise the user picks
 *    (linkConflict → LinkConflictDialog). It is never overwritten without being shown first.
 */
import { create } from 'zustand';
import { sameContent } from '../core/project/diff';
import { fileMatchesSaved, linkedFileText, projectFromLinkedFile } from '../core/project/link';
import { parseProjectText, serializeProject, type ValidationIssue } from '../core/project/validate';
import type { Project } from '../core/project/types';
import { loadSpec, type KeycodeSpec } from '../core/keycodes/spec';
import { newId } from '../core/layout/geometry';
import { projectRepo } from '../platform/projectRepo';
import { navi, type LinkedFileState, type Revision, type StoredSummary } from '../desktop/bridge';
import { t } from '../i18n';
import { toast, toastError } from './toastStore';

const HISTORY_LIMIT = 200;
const COALESCE_MS = 900;
const LAST_PROJECT_KEY = 'navi.lastProject';

/** saved = NAVI's copy and the linked file (if any) are written; otherwise NAVI's copy is saved and the file is not. */
export type SaveResult = 'saved' | 'file-conflict' | 'file-missing';

/** The linked file changed outside NAVI. file = null: it cannot be read as a NAVI project (e.g. git conflict marks). */
export interface LinkConflict {
  /** save: found when saving (NAVI's copy is already saved); open: found on open with unsaved edits. */
  kind: 'save' | 'open';
  path: string;
  file: Project | null;
  fileError: string | null;
  hash: string;
}

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
  /** The file the open project is linked to; missing = not found there. */
  link: { path: string; missing: boolean } | null;
  linkConflict: LinkConflict | null;

  refreshList(): Promise<void>;
  open(id: string): Promise<boolean>;
  /** A new project (already built) — saved right away. */
  create(project: Project): Promise<void>;
  /** Change the document. coalesce — merge frequent edits (dragging) into one undo step. */
  apply(fn: (p: Project) => Project, label: string, opts?: { coalesce?: string }): void;
  undo(): void;
  redo(): void;
  save(label?: string): Promise<SaveResult>;
  /** Open dialog → a new project linked to the picked file; its issues, or null when canceled. */
  openLinkedFile(): Promise<ValidationIssue[] | null>;
  /** Save dialog → the saved version is written there and the project is linked; the path, or null. */
  linkToFile(): Promise<string | null>;
  relink(): Promise<void>;
  unlink(): Promise<void>;
  /** mine: my version wins (overwrite the file / keep my edits); file: load the file's version. */
  resolveLinkConflict(choice: 'mine' | 'file'): Promise<void>;
  /** Decide later: nothing is written; the next Save asks again. */
  dismissLinkConflict(): void;
  revertToSaved(): void;
  remove(id: string): Promise<void>;
  /** Undo of `remove`: the project is back in the list (not opened). false when it could not be brought back. */
  restoreRemoved(id: string): Promise<boolean>;
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

  /** The linked file's version becomes the saved one (an undoable change); unsaved edits go to the versions first. */
  const takeFile = async (file: Project, hash: string) => {
    const { project, past } = get();
    if (!project || !navi) return;
    if (draftTimer) clearTimeout(draftTimer);
    if (isDirty(get())) await projectRepo.save(project.id, serializeProject(project), 'before-file');
    await projectRepo.save(project.id, serializeProject(file), 'from-file');
    set({ project: file, saved: file, past: [...past, { project, label: t('load the linked file', 'загрузка связанного файла') }].slice(-HISTORY_LIMIT), future: [], lastChange: null, linkConflict: null });
    await navi.links.accept(project.id, hash);
    await get().refreshList();
  };

  /** The linked file against NAVI's saved copy (on open and relink): nothing to do, load it, or ask. */
  const checkLink = async (st: LinkedFileState | null) => {
    const { project, saved } = get();
    if (!navi || !project) return;
    if (!st) return set({ link: null });
    if (!st.exists || st.text === null || st.hash === null) return set({ link: { path: st.path, missing: true } });
    set({ link: { path: st.path, missing: false } });
    if (!st.changed) return;
    const { project: file, issues } = projectFromLinkedFile(st.text, project.id, saved);
    if (file && fileMatchesSaved(file, saved)) return navi.links.accept(project.id, st.hash);
    const fileError = file ? null : (issues.find((i) => i.level === 'error')?.message ?? 'cannot read');
    if (file && !isDirty(get())) {
      await takeFile(file, st.hash);
      toast(t('Loaded the linked file: it changed outside NAVI (the previous version is in “versions”)', 'Загружен связанный файл: он изменился вне NAVI (прошлая версия — в «версиях»)'));
      return;
    }
    set({ linkConflict: { kind: 'open', path: st.path, file, fileError, hash: st.hash } });
  };

  /** Save to the linked file (if any). expectHash: the file version the user saw and chose to overwrite. */
  const writeLink = async (project: Project, expectHash?: string): Promise<SaveResult> => {
    if (!navi || !get().link) return 'saved';
    const res = await navi.links.write(project.id, linkedFileText(project), expectHash);
    if (res.status === 'written') {
      set({ link: { path: res.path, missing: false } });
      return 'saved';
    }
    if (res.status === 'missing') {
      set({ link: { path: res.path, missing: true } });
      return 'file-missing';
    }
    const { project: file, issues } = projectFromLinkedFile(res.text, project.id, get().saved);
    const fileError = file ? null : (issues.find((i) => i.level === 'error')?.message ?? 'cannot read');
    set({ linkConflict: { kind: 'save', path: res.path, file, fileError, hash: res.hash } });
    return 'file-conflict';
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
    link: null,
    linkConflict: null,

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
          link: null,
          linkConflict: null,
        });
        rememberLast(id);
        if (navi) {
          try {
            await checkLink(await navi.links.state(id));
          } catch (err) {
            toastError(t('Couldn’t check the linked file. Open Projects → current to relink it.', 'Не удалось проверить связанный файл. Перепривяжите его в «Проекты → текущий».'), err);
          }
        }
        return true;
      } catch (err) {
        set({ status: 'error', error: (err as Error).message });
        return false;
      }
    },

    async create(project) {
      await projectRepo.save(project.id, serializeProject(project), 'created');
      set({ project, saved: project, past: [], future: [], lastChange: null, status: 'ready', error: null, issues: [], link: null, linkConflict: null });
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
      if (!project) return 'saved';
      set({ saving: true });
      try {
        if (draftTimer) clearTimeout(draftTimer);
        await projectRepo.save(project.id, serializeProject(project), label);
        set({ saved: project, error: null });
        const result = await writeLink(project);
        set({ saving: false });
        await get().refreshList();
        return result;
      } catch (err) {
        set({ saving: false, error: (err as Error).message });
        throw err;
      }
    },

    async openLinkedFile() {
      if (!navi) return null;
      const pick = await navi.links.open();
      if (!pick) return null;
      const parsed = parseProjectText(pick.text);
      if (!parsed.project) return parsed.issues;
      const own = parsed.project.id;
      const id = /^[A-Za-z0-9_-]{1,120}$/.test(own) && !get().list.some((p) => p.id === own) ? own : newId('prj');
      const { project, issues } = projectFromLinkedFile(pick.text, id, null);
      if (!project) return issues;
      await get().create(project);
      await navi.links.attach(pick.token, id);
      set({ link: { path: pick.path, missing: false } });
      return issues;
    },

    async linkToFile() {
      const { project, saved } = get();
      if (!navi || !project) return null;
      // The saved version goes to the file; unsaved edits stay a draft until the next Save.
      const path = await navi.links.create(project.id, project.name, linkedFileText(saved ?? project));
      if (path) set({ link: { path, missing: false } });
      return path;
    },

    async relink() {
      const { project } = get();
      if (!navi || !project) return;
      const st = await navi.links.relink(project.id);
      if (st) await checkLink(st);
    },

    async unlink() {
      const { project } = get();
      if (!navi || !project) return;
      await navi.links.unlink(project.id);
      set({ link: null, linkConflict: null });
    },

    async resolveLinkConflict(choice) {
      const { linkConflict: c, project, saved } = get();
      if (!c || !project || !navi) return;
      if (choice === 'file') {
        if (c.file) await takeFile(c.file, c.hash);
        return;
      }
      set({ linkConflict: null });
      if (c.kind === 'open') {
        // My edits win: this file version is known now, so the next Save overwrites it.
        await navi.links.accept(project.id, c.hash);
        return;
      }
      const result = await writeLink(saved ?? project, c.hash);
      if (result === 'saved') toast(t('Linked file overwritten', 'Связанный файл перезаписан'));
      else if (result === 'file-missing') toast(t('The linked file is not found: relink or unlink it in Projects → current', 'Связанный файл не найден: перепривяжите или отвяжите его в «Проекты → текущий»'), 'error');
    },

    dismissLinkConflict() {
      set({ linkConflict: null });
    },

    revertToSaved() {
      const { saved } = get();
      if (!saved) return;
      get().apply(() => saved, t('back to the saved version', 'возврат к сохранённой версии'));
    },

    async remove(id) {
      await projectRepo.remove(id);
      if (get().project?.id === id) {
        set({ project: null, saved: null, past: [], future: [], status: 'empty', link: null, linkConflict: null });
        rememberLast(null);
      }
      await get().refreshList();
    },

    async restoreRemoved(id) {
      const ok = await projectRepo.restore(id);
      await get().refreshList();
      return ok;
    },

    close() {
      set({ project: null, saved: null, past: [], future: [], status: 'empty', link: null, linkConflict: null });
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

/** Save (Ctrl+S, the save button) and say what happened to the linked file. */
/** Writes the draft right away instead of after the usual delay (the window is about to close). */
export async function flushDraft(): Promise<void> {
  if (draftTimer) clearTimeout(draftTimer);
  draftTimer = null;
  const { project, saved } = useProjectStore.getState();
  if (project && isDirty({ project, saved })) await projectRepo.saveDraft(project.id, serializeProject(project));
}

/** Save with a toast for the outcome; the result, or null when saving failed. */
export async function saveProject(): Promise<SaveResult | null> {
  try {
    const result = await useProjectStore.getState().save();
    if (result === 'saved') toast(t('Project saved', 'Проект сохранён'));
    else if (result === 'file-missing') toast(t('Saved in NAVI, but the linked file is not found: relink or unlink it in Projects → current', 'Сохранено в NAVI, но связанный файл не найден: перепривяжите или отвяжите его в «Проекты → текущий»'), 'error');
    else toast(t('Saved in NAVI. The linked file changed outside NAVI: choose which version to keep', 'Сохранено в NAVI. Связанный файл изменился вне NAVI: выберите, какую версию оставить'));
    return result;
  } catch (err) {
    toastError(t('Couldn’t save the project. Check the disk has space and try again.', 'Не удалось сохранить проект. Проверьте место на диске и повторите.'), err);
    return null;
  }
}

export function isDirty(s: Pick<ProjectState, 'project' | 'saved'>): boolean {
  if (!s.project) return false;
  if (!s.saved) return true;
  return !sameContent(s.project, s.saved);
}
