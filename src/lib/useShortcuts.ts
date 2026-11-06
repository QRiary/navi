import { useEffect } from 'react';
import { clearSelection, copySelection, pasteToSelection } from './keymapActions';
import { activeKeymap } from '../core/project/ops';
import { useEditorStore } from '../store/editorStore';
import { saveProject, useProjectStore } from '../store/projectStore';
import type { Route } from './router';

/**
 * Shortcuts. The physical key is checked (e.code), so they work with a Russian layout too.
 *  Ctrl+S — save, Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z) — undo/redo;
 *  in the Keyboard section: Del/Backspace — empty, T — transparent, Ctrl+C/V, Esc — clear the selection,
 *  Alt+0…9 — layer, Ctrl+A — select all keys.
 */
export function useShortcuts(route: Route) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target?.closest('input, textarea, select, [contenteditable="true"]');
      const ctrl = e.ctrlKey || e.metaKey;
      const store = useProjectStore.getState();
      if (ctrl && e.code === 'KeyS') {
        e.preventDefault();
        if (store.project) void saveProject();
        return;
      }
      if (typing) return;
      if (ctrl && e.code === 'KeyZ' && !e.shiftKey) {
        e.preventDefault();
        store.undo();
        return;
      }
      if (ctrl && (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey))) {
        e.preventDefault();
        store.redo();
        return;
      }
      if (route.section !== 'keyboard' || !store.project) return;
      const editor = useEditorStore.getState();
      if (e.altKey && /^Digit\d$/.test(e.code)) {
        const n = Number(e.code.slice(5));
        if (n < activeKeymap(store.project).layers.length) {
          e.preventDefault();
          editor.setLayer(n);
        }
        return;
      }
      if (ctrl && e.code === 'KeyC') {
        if (copySelection()) e.preventDefault();
        return;
      }
      if (ctrl && e.code === 'KeyV') {
        if (pasteToSelection()) e.preventDefault();
        return;
      }
      if (ctrl && e.code === 'KeyA') {
        e.preventDefault();
        const geo = store.project.geometries.find((g) => g.id === store.project!.activeGeometryId);
        if (geo) editor.select(geo.keys.map((k) => k.id), 'replace');
        return;
      }
      if (ctrl || e.altKey) return;
      if (e.code === 'Escape') editor.clearSelection();
      else if ((e.code === 'Delete' || e.code === 'Backspace') && (editor.selection.length || editor.encoderTarget)) {
        e.preventDefault();
        clearSelection(false);
      } else if (e.code === 'KeyT' && (editor.selection.length || editor.encoderTarget)) {
        e.preventDefault();
        clearSelection(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [route.section]);
}
