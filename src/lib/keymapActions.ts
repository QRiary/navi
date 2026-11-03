/**
 * KEYMAP ACTIONS — shared by the mouse, shortcuts, menus and the catalog.
 * Every action = one project change (one undo step).
 */
import { keyCenter } from '../core/layout/geometry';
import { KC_NO, KC_TRNS } from '../core/project/factory';
import { activeGeometry, activeKeymap, posIndex, setEncoder, setKeycodeMap, setKeycodes, swapKeycodes } from '../core/project/ops';
import type { KeyGeom, MatrixPos } from '../core/project/types';
import { toQmk } from '../core/keycodes/codec';
import { loadSpec } from '../core/keycodes/spec';
import { t } from '../i18n';
import { useEditorStore, type ClipboardEntry } from '../store/editorStore';
import { useProjectStore } from '../store/projectStore';
import { toast } from '../store/toastStore';

function ctx() {
  const project = useProjectStore.getState().project;
  if (!project) return null;
  const editor = useEditorStore.getState();
  const geometry = activeGeometry(project);
  const keymap = activeKeymap(project);
  const selected = geometry.keys.filter((k) => editor.selection.includes(k.id));
  return { project, editor, geometry, keymap, selected, layer: Math.min(editor.layer, keymap.layers.length - 1) };
}

function wired(keys: KeyGeom[]): MatrixPos[] {
  return keys.map((k) => k.matrix).filter((m): m is MatrixPos => m !== null);
}

/** Assign a keycode to the selected keys (or to the encoder, if it is selected). */
export function assignToSelection(keycode: number): boolean {
  const c = ctx();
  if (!c) return false;
  const spec = loadSpec(c.project.firmware.keycodeSpec);
  if (c.editor.encoderTarget) {
    const { index, dir } = c.editor.encoderTarget;
    useProjectStore.getState().apply((p) => setEncoder(p, c.keymap.id, c.layer, index, dir, keycode), `E${index} ${dir} = ${toQmk(spec, keycode)}`);
    return true;
  }
  const positions = wired(c.selected);
  if (positions.length === 0) {
    toast(t('Select a key on the keyboard first', 'Сначала выберите клавишу на схеме'));
    return false;
  }
  useProjectStore.getState().apply((p) => setKeycodes(p, c.keymap.id, c.layer, positions, keycode), `${positions.length}× ${toQmk(spec, keycode)}`);
  return true;
}

export function assignToKey(key: KeyGeom, keycode: number) {
  const c = ctx();
  if (!c || !key.matrix) return;
  const spec = loadSpec(c.project.firmware.keycodeSpec);
  useProjectStore.getState().apply((p) => setKeycodes(p, c.keymap.id, c.layer, [key.matrix!], keycode), `${toQmk(spec, keycode)}`);
}

export function swapKeys(a: KeyGeom, b: KeyGeom) {
  const c = ctx();
  if (!c || !a.matrix || !b.matrix) return;
  useProjectStore.getState().apply((p) => swapKeycodes(p, c.keymap.id, c.layer, a.matrix!, b.matrix!), t('swap keys', 'обмен клавиш'));
}

export function clearSelection(transparent: boolean) {
  assignToSelection(transparent ? KC_TRNS : KC_NO);
}

/** Copy: keycodes of the selected keys together with their relative placement. */
export function copySelection(): number {
  const c = ctx();
  if (!c || c.selected.length === 0) return 0;
  const sorted = [...c.selected].filter((k) => k.matrix).sort((a, b) => keyCenter(a).y - keyCenter(b).y || keyCenter(a).x - keyCenter(b).x);
  if (!sorted.length) return 0;
  const origin = keyCenter(sorted[0]);
  const layer = c.keymap.layers[c.layer];
  const entries: ClipboardEntry[] = sorted.map((k) => {
    const center = keyCenter(k);
    return { dx: center.x - origin.x, dy: center.y - origin.y, keycode: layer.keys[posIndex(c.project, k.matrix!)] };
  });
  useEditorStore.getState().setClipboard(entries);
  // To the system clipboard — QMK expressions (can be pasted into keymap.c).
  const spec = loadSpec(c.project.firmware.keycodeSpec);
  void navigator.clipboard?.writeText(entries.map((e) => toQmk(spec, e.keycode)).join(', ')).catch(() => undefined);
  return entries.length;
}

/**
 * Paste: one key in the clipboard — into all selected; several — keeping the placement
 * relative to the first selected one (the nearest key is found for each point).
 */
export function pasteToSelection(): number {
  const c = ctx();
  const clip = useEditorStore.getState().clipboard;
  if (!c || !clip?.length || c.selected.length === 0) return 0;
  if (clip.length === 1) {
    assignToSelection(clip[0].keycode);
    return c.selected.length;
  }
  const anchor = [...c.selected].sort((a, b) => keyCenter(a).y - keyCenter(b).y || keyCenter(a).x - keyCenter(b).x)[0];
  const origin = keyCenter(anchor);
  const changes: { pos: MatrixPos; keycode: number }[] = [];
  for (const e of clip) {
    const target = { x: origin.x + e.dx, y: origin.y + e.dy };
    let best: KeyGeom | null = null;
    let bestD = 0.45;
    for (const k of c.geometry.keys) {
      if (!k.matrix) continue;
      const kc = keyCenter(k);
      const d = Math.hypot(kc.x - target.x, kc.y - target.y);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    if (best?.matrix) changes.push({ pos: best.matrix, keycode: e.keycode });
  }
  if (changes.length) useProjectStore.getState().apply((p) => setKeycodeMap(p, c.keymap.id, c.layer, changes), t(`paste ${changes.length}`, `вставка ${changes.length}`));
  return changes.length;
}

/** Where on the current layer (or on all) a keycode is assigned. */
export function findKeycode(keycode: number, allLayers = false): { layer: number; pos: MatrixPos }[] {
  const c = ctx();
  if (!c) return [];
  const out: { layer: number; pos: MatrixPos }[] = [];
  const cols = c.project.hardware.matrix.cols;
  c.keymap.layers.forEach((l, li) => {
    if (!allLayers && li !== c.layer) return;
    l.keys.forEach((v, i) => {
      if (v === keycode) out.push({ layer: li, pos: [Math.floor(i / cols), i % cols] });
    });
  });
  return out;
}

/** Select keys with the given positions on the drawing. */
export function selectPositions(positions: MatrixPos[]) {
  const c = ctx();
  if (!c) return;
  const set = new Set(positions.map((p) => `${p[0]},${p[1]}`));
  const ids = c.geometry.keys.filter((k) => k.matrix && set.has(`${k.matrix[0]},${k.matrix[1]}`)).map((k) => k.id);
  useEditorStore.getState().select(ids, 'replace');
}
