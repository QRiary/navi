/**
 * BEHAVIOR CHANGES SINCE THE LAST BUILD (core/qmk/behaviorChanges.ts) for the open project.
 *
 * The baseline is the project as NAVI last wrote its keymap files (`record`, called after a write by Firmware →
 * Files and by “Build + flash”), kept per project beside it on disk (`projects/<id>/built.json`), never in the
 * project. The list is worked out again from the baseline and the project now (a quarter second after the last
 * edit), so undoing an edit takes its lines away and the next write empties it. Nothing here blocks anything.
 */
import { create } from 'zustand';
import { loadSpec } from '../core/keycodes/spec';
import { behaviorChanges, type BehaviorChange } from '../core/qmk/behaviorChanges';
import type { Project } from '../core/project/types';
import { parseProjectText, serializeProject } from '../core/project/validate';
import { projectRepo } from '../platform/projectRepo';
import { useProjectStore } from './projectStore';
import { useQmkStore } from './qmkStore';

interface BehaviorState {
  /** The project the baseline belongs to. */
  projectId: string | null;
  /** The project as last written: undefined while it is read, null when NAVI never wrote its files. */
  baseline: Project | null | undefined;
  /** The changes from the baseline to the project now (null: no baseline). */
  changes: BehaviorChange[] | null;
  /** The keymap files were written from `project`: it becomes the baseline. */
  record(project: Project): Promise<void>;
}

const DELAY_MS = 250;

export const useBehaviorStore = create<BehaviorState>((set) => ({
  projectId: null,
  baseline: undefined,
  changes: null,
  async record(project) {
    set({ projectId: project.id, baseline: project });
    schedule();
    try {
      await projectRepo.saveBuilt(project.id, serializeProject(project));
    } catch {
      // Only the list after a restart is lost: nothing to tell the user mid-build.
    }
  },
}));

let timer: ReturnType<typeof setTimeout> | null = null;

function compute(): void {
  timer = null;
  const { baseline, projectId } = useBehaviorStore.getState();
  const project = useProjectStore.getState().project;
  if (!project || !baseline || project.id !== projectId) {
    if (useBehaviorStore.getState().changes !== null) useBehaviorStore.setState({ changes: null });
    return;
  }
  const own = useQmkStore.getState().ownCode;
  const files = own && own.keyboard === project.firmware.keyboard && own.keymap === project.firmware.keymap ? own.files : null;
  try {
    useBehaviorStore.setState({ changes: behaviorChanges(loadSpec(project.firmware.keycodeSpec ?? 'latest'), baseline, project, files) });
  } catch {
    useBehaviorStore.setState({ changes: null });
  }
}

function schedule(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(compute, DELAY_MS);
}

/** The open project's baseline from disk (once per project opened). */
async function loadBaseline(id: string): Promise<void> {
  useBehaviorStore.setState({ projectId: id, baseline: undefined, changes: null });
  let baseline: Project | null = null;
  try {
    const text = await projectRepo.readBuilt(id);
    baseline = text ? (parseProjectText(text).project ?? null) : null;
  } catch {
    baseline = null;
  }
  if (useBehaviorStore.getState().projectId !== id) return; // another project was opened meanwhile
  // A write while it was read wins.
  if (useBehaviorStore.getState().baseline === undefined) useBehaviorStore.setState({ baseline });
  schedule();
}

useProjectStore.subscribe((state, prev) => {
  const id = state.project?.id ?? null;
  if (id !== useBehaviorStore.getState().projectId) {
    if (id) void loadBaseline(id);
    else useBehaviorStore.setState({ projectId: null, baseline: undefined, changes: null });
    return;
  }
  if (state.project !== prev.project) schedule();
});
useQmkStore.subscribe((state, prev) => {
  if (state.ownCode !== prev.ownCode) schedule();
});
// A project opened before this module was first imported.
const opened = useProjectStore.getState().project;
if (opened) void loadBaseline(opened.id);
