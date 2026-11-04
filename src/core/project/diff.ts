/**
 * COMPARISON of two project versions (current ⇄ saved, project ⇄ keyboard).
 * The result is a human-readable list of changes: “layer Base, [2,3]: KC_A → LCTL_T(KC_A)”.
 */
import type { Keymap, MatrixPos, Project } from './types';

export interface KeyChange {
  keymapId: string;
  layer: number;
  pos: MatrixPos;
  before: number;
  after: number;
}

export interface EncoderChange {
  keymapId: string;
  layer: number;
  encoder: number;
  dir: 'cw' | 'ccw';
  before: number;
  after: number;
}

export interface ProjectDiff {
  keys: KeyChange[];
  encoders: EncoderChange[];
  /** Other sections that differ (section names). */
  sections: string[];
  layersAdded: number;
  layersRemoved: number;
}

function keymapKeyChanges(a: Keymap, b: Keymap, cols: number, out: KeyChange[], enc: EncoderChange[]) {
  const n = Math.min(a.layers.length, b.layers.length);
  for (let l = 0; l < n; l++) {
    const ka = a.layers[l].keys;
    const kb = b.layers[l].keys;
    for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
      if (ka[i] !== kb[i]) out.push({ keymapId: b.id, layer: l, pos: [Math.floor(i / cols), i % cols], before: ka[i] ?? 0, after: kb[i] ?? 0 });
    }
    const ea = a.layers[l].encoders;
    const eb = b.layers[l].encoders;
    for (let e = 0; e < Math.max(ea.length, eb.length); e++) {
      for (const dir of ['cw', 'ccw'] as const) {
        const before = ea[e]?.[dir] ?? 0;
        const after = eb[e]?.[dir] ?? 0;
        if (before !== after) enc.push({ keymapId: b.id, layer: l, encoder: e, dir, before, after });
      }
    }
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function diffProjects(before: Project, after: Project): ProjectDiff {
  const keys: KeyChange[] = [];
  const encoders: EncoderChange[] = [];
  let layersAdded = 0;
  let layersRemoved = 0;
  const cols = after.hardware.matrix.cols;
  if (before.hardware.matrix.cols === cols && before.hardware.matrix.rows === after.hardware.matrix.rows) {
    for (const km of after.keymaps) {
      const old = before.keymaps.find((k) => k.id === km.id);
      if (!old) continue;
      keymapKeyChanges(old, km, cols, keys, encoders);
      layersAdded += Math.max(0, km.layers.length - old.layers.length);
      layersRemoved += Math.max(0, old.layers.length - km.layers.length);
    }
  }
  const sections: string[] = [];
  const check = (name: string, a: unknown, b: unknown) => {
    if (!same(a, b)) sections.push(name);
  };
  check('name', before.name, after.name);
  check('hardware', before.hardware, after.hardware);
  check('geometry', before.geometries, after.geometries);
  check('keymaps', before.keymaps.map((k) => [k.id, k.name, k.defaultLayer, k.layers.map((l) => [l.id, l.name, l.color])]), after.keymaps.map((k) => [k.id, k.name, k.defaultLayer, k.layers.map((l) => [l.id, l.name, l.color])]));
  check('macros', before.macros, after.macros);
  check('tapDances', before.tapDances, after.tapDances);
  check('combos', before.combos, after.combos);
  check('keyOverrides', before.keyOverrides, after.keyOverrides);
  check('customKeycodes', before.customKeycodes, after.customKeycodes);
  check('keyAliases', before.keyAliases, after.keyAliases);
  check('leaderSequences', before.leaderSequences, after.leaderSequences);
  check('unicodeMap', before.unicodeMap, after.unicodeMap);
  check('lighting', before.lighting, after.lighting);
  check('firmware', before.firmware, after.firmware);
  return { keys, encoders, sections, layersAdded, layersRemoved };
}

export function isEmptyDiff(d: ProjectDiff): boolean {
  return d.keys.length === 0 && d.encoders.length === 0 && d.sections.length === 0 && d.layersAdded === 0 && d.layersRemoved === 0;
}

/** Comparison ignoring the modification time. */
export function sameContent(a: Project, b: Project): boolean {
  return same({ ...a, updatedAt: '' }, { ...b, updatedAt: '' });
}
