/**
 * EDITOR STATE (not saved into the project): the selected layer and keys, the clipboard,
 * drawing zoom, view mode, catalog category. Part of it is in localStorage for convenience.
 */
import { create } from 'zustand';
import type { CategoryId } from '../core/keycodes/catalog';
import type { MatrixPos } from '../core/project/types';

export type ViewMode = 'assign' | 'effective';
export type CompareMode = 'none' | 'saved' | 'device' | 'layer';

export interface ClipboardEntry {
  /** Offset of a key relative to the first selected one (by centers, in u). */
  dx: number;
  dy: number;
  keycode: number;
}

export interface EditorState {
  layer: number;
  /** Key ids of the active geometry. */
  selection: string[];
  /** The selected encoder (index) and direction — for assigning from the catalog. */
  encoderTarget: { index: number; dir: 'cw' | 'ccw' } | null;
  clipboard: ClipboardEntry[] | null;
  zoom: number;
  pan: { x: number; y: number };
  view: ViewMode;
  /** Layers considered “on” in the effective mode (besides the current one). */
  heldLayers: number[];
  compare: CompareMode;
  compareLayer: number;
  pickerCategory: CategoryId;
  pickerQuery: string;
  /** Keys pressed right now (key tester over VIA). */
  pressed: Set<string>;
  /** Highlighted positions (result of the “where is it assigned” search). */
  highlight: MatrixPos[];

  setLayer(layer: number): void;
  select(ids: string[], mode?: 'replace' | 'toggle' | 'add'): void;
  clearSelection(): void;
  setEncoderTarget(t: EditorState['encoderTarget']): void;
  setClipboard(c: ClipboardEntry[] | null): void;
  setZoom(zoom: number, pan?: { x: number; y: number }): void;
  setPan(pan: { x: number; y: number }): void;
  setView(view: ViewMode): void;
  setHeldLayers(layers: number[]): void;
  setCompare(mode: CompareMode, layer?: number): void;
  setPicker(category: CategoryId, query?: string): void;
  setQuery(query: string): void;
  setPressed(p: Set<string>): void;
  setHighlight(h: MatrixPos[]): void;
}

const PICKER_KEY = 'navi.editor.picker';

function loadPicker(): CategoryId {
  try {
    return (localStorage.getItem(PICKER_KEY) as CategoryId) || 'basic';
  } catch {
    return 'basic';
  }
}

export const useEditorStore = create<EditorState>()((set, get) => ({
  layer: 0,
  selection: [],
  encoderTarget: null,
  clipboard: null,
  zoom: 1,
  pan: { x: 0, y: 0 },
  view: 'assign',
  heldLayers: [],
  compare: 'none',
  compareLayer: 0,
  pickerCategory: loadPicker(),
  pickerQuery: '',
  pressed: new Set(),
  highlight: [],

  setLayer: (layer) => set({ layer, highlight: [] }),
  select: (ids, mode = 'replace') => {
    const cur = get().selection;
    if (mode === 'replace') set({ selection: ids, encoderTarget: null });
    else if (mode === 'add') set({ selection: [...new Set([...cur, ...ids])], encoderTarget: null });
    else {
      const s = new Set(cur);
      for (const id of ids) {
        if (s.has(id)) s.delete(id);
        else s.add(id);
      }
      set({ selection: [...s], encoderTarget: null });
    }
  },
  clearSelection: () => set({ selection: [], encoderTarget: null }),
  setEncoderTarget: (encoderTarget) => set({ encoderTarget, selection: encoderTarget ? [] : get().selection }),
  setClipboard: (clipboard) => set({ clipboard }),
  setZoom: (zoom, pan) => set({ zoom: Math.min(4, Math.max(0.3, zoom)), ...(pan ? { pan } : {}) }),
  setPan: (pan) => set({ pan }),
  setView: (view) => set({ view }),
  setHeldLayers: (heldLayers) => set({ heldLayers }),
  setCompare: (compare, layer) => set({ compare, compareLayer: layer ?? get().compareLayer }),
  setPicker: (pickerCategory, query) => {
    try {
      localStorage.setItem(PICKER_KEY, pickerCategory);
    } catch {
      // no storage — no problem
    }
    set({ pickerCategory, ...(query !== undefined ? { pickerQuery: query } : {}) });
  },
  setQuery: (pickerQuery) => set({ pickerQuery }),
  setPressed: (pressed) => set({ pressed }),
  setHighlight: (highlight) => set({ highlight }),
}));
