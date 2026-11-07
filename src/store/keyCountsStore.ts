/**
 * Key press counts of the open project, for the heatmap (step 17). The counts file comes from the route the project
 * picked (firmware.keyCounts): the board route's totals NAVI keeps per project, or the file the user's own program
 * writes. Contract between the heatmap view and the counting side: the view reads `file` / `status` / `error` and
 * calls `load`, `readNow` and `reset`; it never talks to the bridge itself.
 */
import { create } from 'zustand';
import type { KeyCountsFile } from '../core/project/keyCounts';

export type KeyCountsStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface KeyCountsState {
  /** null: nothing counted yet (no file), or not loaded. */
  file: KeyCountsFile | null;
  status: KeyCountsStatus;
  /** Why the last load / read / reset failed (shown as is). */
  error: string | null;
  /** The board route only: reading the keyboard's counts right now. */
  reading: boolean;
  /** Load the counts file of the open project's route. */
  load(): Promise<void>;
  /** The board route only: read (and zero) the keyboard's counts, add them to the totals, save. */
  readNow(): Promise<void>;
  /** Start counting over (the caller asks the user first). */
  reset(): Promise<void>;
}

export const useKeyCountsStore = create<KeyCountsState>((set) => ({
  file: null,
  status: 'idle',
  error: null,
  reading: false,
  // Wired to the bridge by the counting side (electron/keyCounts.cjs).
  load: async () => set({ status: 'ready' }),
  readNow: async () => {},
  reset: async () => set({ file: null }),
}));
