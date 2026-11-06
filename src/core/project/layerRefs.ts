/**
 * HOW TO REACH A LAYER: every place in the project that switches a layer on, and how (MO, LT, TG…).
 * Read by the "how to get here" panels (Keyboard page, Layers page) and the layer-tab hover.
 *
 * Only what really switches a layer in QMK counts: keys and encoders of the active keymap, combo results, and the
 * slots of tap dances and tap-hold actions placed on them (NAVI plays those through `process_record`, so a TG()
 * in a slot works). Key override replacements and leader / own-keycode actions are left out on purpose: QMK sends
 * them with `register_code` / `tap_code16`, which can't switch a layer.
 *
 * Renumbering (ops.ts `remapAllLayerRefs`) and this walk read a keycode's layer the same way, through
 * `layerTarget`; a test moves layers and checks both still agree.
 */
import { decode, type LayerFn } from '../keycodes/codec';
import type { KeycodeSpec } from '../keycodes/spec';
import { tapDanceKind } from './tapDances';
import { TAP_DANCE_VARIANTS, type Keymap, type MatrixPos, type Project, type TapDance } from './types';

export type LayerHow = LayerFn | 'LT' | 'LM';

/** Which press of a tap dance or tap-hold action does it: a number is the every-tap count (tap n times). */
export type RoutePart = 'tap' | 'hold' | 'double-tap' | 'tap-hold' | number;

export type RouteSource =
  /** A key on `layer` (its matrix position). */
  | { kind: 'key'; layer: number; pos: MatrixPos }
  | { kind: 'encoder'; layer: number; encoder: number; dir: 'cw' | 'ccw' }
  /** A combo's result; `layers` undefined = works on every layer. */
  | { kind: 'combo'; index: number; keys: MatrixPos[]; layers?: number[] };

export interface LayerRef {
  /** The layer it leads to. */
  layer: number;
  how: LayerHow;
  /** Modifiers held with the layer (LM, a tap-hold action holding a layer with mods). */
  mods?: number;
  source: RouteSource;
  /** The keycode on the key / encoder / combo result. */
  keycode: number;
  /** Set when the layer key sits inside a tap dance or a tap-hold action. */
  via?: { kind: 'tap-dance'; index: number } | { kind: 'tap-hold'; keycode: number };
  part?: RoutePart;
}

/** The layer a keycode points at and how, or null. Shared with renumbering (ops.ts). */
export function layerTarget(spec: KeycodeSpec, value: number): { layer: number; how: LayerHow; mods?: number } | null {
  const d = decode(spec, value);
  if (d.kind === 'layer') return { layer: d.layer, how: d.fn };
  if (d.kind === 'layer-tap') return { layer: d.layer, how: 'LT' };
  if (d.kind === 'layer-mod') return { layer: d.layer, how: 'LM', mods: d.mods };
  return null;
}

type Found = Omit<LayerRef, 'source' | 'keycode'>;

const TD_SLOTS = [
  ['tap', 'tap'],
  ['hold', 'hold'],
  ['doubleTap', 'double-tap'],
  ['tapHold', 'tap-hold'],
] as const;

function tapDanceRefs(spec: KeycodeSpec, td: TapDance): Found[] {
  const out: Found[] = [];
  const via = { kind: 'tap-dance' as const, index: td.index };
  const add = (v: number, part: RoutePart) => {
    const t = layerTarget(spec, v);
    if (t) out.push({ ...t, via, part });
  };
  switch (tapDanceKind(td)) {
    case 'slots':
      for (const [field, part] of TD_SLOTS) add(td[field], part);
      break;
    case 'every-tap':
      (td.steps ?? []).forEach((st, i) => {
        const seen = new Set<number>();
        for (const variant of TAP_DANCE_VARIANTS)
          for (const s of st[variant] ?? []) if ((s.type === 'tap' || s.type === 'down') && !seen.has(s.keycode)) {
            seen.add(s.keycode);
            add(s.keycode, i + 1);
          }
      });
      break;
    case 'own-c':
      break; // the user's C: NAVI can't tell what it does
  }
  return out;
}

/** Every layer one keycode leads to: itself, or the slots of the tap dance / tap-hold action it stands for. */
function keycodeRefs(spec: KeycodeSpec, p: Project, value: number): Found[] {
  const th = p.tapHoldActions.find((a) => a.keycode === value);
  if (th) {
    const via = { kind: 'tap-hold' as const, keycode: value };
    const out: Found[] = [];
    const tap = layerTarget(spec, th.tap);
    if (tap) out.push({ ...tap, via, part: 'tap' });
    if (th.hold.type === 'layer') out.push({ layer: th.hold.layer, how: th.hold.mods ? 'LM' : 'LT', ...(th.hold.mods ? { mods: th.hold.mods } : {}), via, part: 'hold' });
    else if (th.hold.type === 'key') {
      const hold = layerTarget(spec, th.hold.keycode);
      if (hold) out.push({ ...hold, via, part: 'hold' });
    }
    return out;
  }
  const d = decode(spec, value);
  if (d.kind === 'tap-dance') {
    const td = p.tapDances.find((t) => t.index === d.index);
    return td ? tapDanceRefs(spec, td) : [];
  }
  const t = layerTarget(spec, value);
  return t ? [t] : [];
}

/**
 * Every route to every layer of the keymap (the active one by default). A key or encoder leading to its own layer
 * is left out: it can't bring you there.
 */
export function layerRefs(p: Project, spec: KeycodeSpec, keymap: Keymap = p.keymaps.find((k) => k.id === p.activeKeymapId) ?? p.keymaps[0]): LayerRef[] {
  const cols = p.hardware.matrix.cols;
  const cache = new Map<number, Found[]>();
  const refsOf = (v: number) => {
    let r = cache.get(v);
    if (!r) cache.set(v, (r = v > 1 ? keycodeRefs(spec, p, v) : []));
    return r;
  };
  const out: LayerRef[] = [];
  keymap.layers.forEach((l, li) => {
    l.keys.forEach((v, i) => {
      for (const f of refsOf(v)) if (f.layer !== li) out.push({ ...f, keycode: v, source: { kind: 'key', layer: li, pos: [Math.floor(i / cols), i % cols] } });
    });
    l.encoders.forEach((e, ei) => {
      for (const dir of ['ccw', 'cw'] as const) for (const f of refsOf(e[dir])) if (f.layer !== li) out.push({ ...f, keycode: e[dir], source: { kind: 'encoder', layer: li, encoder: ei, dir } });
    });
  });
  p.combos.forEach((c, ci) => {
    for (const f of refsOf(c.result))
      out.push({ ...f, keycode: c.result, source: { kind: 'combo', index: ci, keys: c.keys, ...(c.layers?.length ? { layers: c.layers } : {}) } });
  });
  return out;
}

/** More reachable layer states than this: layerStacks gives up (null). */
const STATE_LIMIT = 4096;

/**
 * Every set of layers the keyboard can show at once, highest first, the default layer included: the layer states
 * reachable through the routes above, walked from power-on (base layer 0, the keymap's default layer, or a PDF
 * target; the first language's layer on). A route counts only where its key is the one serving its spot (a higher
 * layer's key there hides it), an encoder's where no higher layer shows its own, a combo's on the layers it works on.
 * MO / LT / LM / TT / OSL / TG turn a layer on, TO leaves only its layer (and the language's), DF / PDF set the base,
 * and any layer on can go off again (a key let go, a toggle). With “layer keys bring their layer to the top”, a
 * layer turned on hides the ones above it. Language layers stay on under the others and swap with each other.
 * An over-approximation in what can go off (any layer, in any order), exact in what can come on.
 * null: more than STATE_LIMIT states (callers assume any layer can be under any other).
 */
export function layerStacks(p: Project, spec: KeycodeSpec, keymap: Keymap = p.keymaps.find((k) => k.id === p.activeKeymapId) ?? p.keymaps[0]): number[][] | null {
  const count = keymap.layers.length;
  const cols = p.hardware.matrix.cols;
  const onTop = p.firmware.layerKeysOnTop === true;
  const refs = layerRefs(p, spec, keymap).filter((r) => r.layer < count);
  const langs = [...new Set(p.languages.map((l) => l.layer).filter((l): l is number => l !== undefined && l < count))];
  const isLang = (l: number) => langs.includes(l);
  type State = { base: number; on: number[] };
  const stackOf = (s: State) => [...new Set([...s.on, s.base])].sort((a, b) => b - a);
  // The layer QMK takes a spot from (transparent falls through, nothing found: layer 0).
  const serving = (stack: number[], value: (l: number) => number) => stack.find((l) => value(l) !== 1) ?? 0;
  const works = (r: LayerRef, stack: number[]): boolean => {
    const src = r.source;
    if (src.kind === 'key') return serving(stack, (l) => keymap.layers[l]?.keys[src.pos[0] * cols + src.pos[1]] ?? 0) === src.layer;
    if (src.kind === 'encoder') return serving(stack, (l) => keymap.layers[l]?.encoders[src.encoder]?.[src.dir] ?? 0) === src.layer;
    return !src.layers || src.layers.includes(stack[0]);
  };
  const add = (s: State, layer: number): State => ({ base: s.base, on: [...s.on.filter((l) => l !== layer && (!onTop || l < layer || isLang(l))), layer] });
  const keyOf = (s: State) => `${s.base}|${[...s.on].sort((a, b) => a - b).join(',')}`;
  const bases = new Set([0, Math.min(keymap.defaultLayer, count - 1), ...refs.filter((r) => r.how === 'PDF').map((r) => r.layer)]);
  const seen = new Map<string, State>();
  const queue: State[] = [];
  const visit = (s: State) => {
    const k = keyOf(s);
    if (seen.has(k)) return;
    seen.set(k, s);
    queue.push(s);
  };
  for (const base of bases) visit({ base, on: langs.length && p.languages[0]?.layer !== undefined ? [p.languages[0].layer] : [] });
  while (queue.length) {
    if (seen.size > STATE_LIMIT) return null;
    const s = queue.shift()!;
    const stack = stackOf(s);
    for (const r of refs) {
      if (!works(r, stack)) continue;
      if (r.how === 'TO') visit({ base: s.base, on: [...s.on.filter(isLang).filter((l) => l !== r.layer), r.layer] });
      else if (r.how === 'DF' || r.how === 'PDF') visit({ base: r.layer, on: s.on });
      else visit(add(s, r.layer));
    }
    for (const l of s.on) visit({ base: s.base, on: s.on.filter((x) => x !== l) });
    for (const l of langs) visit({ base: s.base, on: [...s.on.filter((x) => !isLang(x)), l] });
  }
  const stacks = new Map<string, number[]>();
  for (const s of seen.values()) {
    const st = stackOf(s);
    stacks.set(st.join(','), st);
  }
  return [...stacks.values()];
}

/** The routes to one layer. */
export const routesTo = (refs: readonly LayerRef[], layer: number) => refs.filter((r) => r.layer === layer);

/** The keys on `shown` that lead to `target`: keys placed there, plus the keys of combos that work on `shown`. */
export function keysLeadingTo(refs: readonly LayerRef[], target: number, shown: number): MatrixPos[] {
  const out: MatrixPos[] = [];
  for (const r of refs) {
    if (r.layer !== target) continue;
    if (r.source.kind === 'key' && r.source.layer === shown) out.push(r.source.pos);
    else if (r.source.kind === 'combo' && (!r.source.layers || r.source.layers.includes(shown))) out.push(...r.source.keys);
  }
  return out;
}
