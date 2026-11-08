/**
 * BEHAVIOR CHANGES SINCE THE LAST BUILD: the firmware-test model (firmwareTests.ts) run on the project as NAVI last
 * wrote the keymap files (the baseline) and on the project now; every test whose result differs is explained by
 * what it is about, one sentence per cause ("Key Lock now ignores Esc (r3c0 on Game): …"), with the tests behind it.
 *
 * - A test is matched across the two projects by its scenario id (layer ids, item ids, spots), never by its text;
 *   only a different result (or a test that is there on one side only) counts, not different steps.
 * - The cause is what the test reads that differs: its key, the item it tests (combo, tap dance, key override,
 *   tap-hold setting), the other keys it reads, the keys of the way to its layer; nothing of that → the layer list or
 *   the layer settings when they differ, else another project setting.
 * - Not shown: the edited thing's own behavior (a changed key's own tap and hold on its own layer, an edited combo's,
 *   tap dance's, key override's or tap-hold setting's own tests).
 * - A change no explainer claims is still listed (feature 'other', no sentence: its tests' was / now).
 */
import { decode } from '../keycodes/codec';
import { friendlyName } from '../keycodes/friendly';
import type { KeycodeSpec } from '../keycodes/spec';
import { activeKeymap } from '../project/ops';
import { tapHoldActionLookup, type OwnCodeFile } from '../project/tapHoldActions';
import type { MatrixPos, Project } from '../project/types';
import { t, withLanguage } from '../../i18n';
import { firmwareTestModel, type Cell, type FirmwareTestModel, type Scenario } from './firmwareTests';

export type ChangeCause =
  | { kind: 'key'; layerId: string; pos: MatrixPos }
  | { kind: 'combo' | 'tap-dance' | 'key-override' | 'tap-hold'; id: string }
  /** The layer list or a layer setting (order, layers on top, languages…). */
  | { kind: 'layers' }
  /** Any other project setting. */
  | { kind: 'settings' };

export type ChangeFeature = 'key-lock' | 'combo' | 'key-override' | 'caps-word' | 'tap-dance' | 'hold-spot' | 'layer' | 'transparent' | 'other';

/** One test behind a change: its steps (as the file writes them) and its result before and now (null: not tested). */
export interface ChangeCase {
  steps: string;
  was: string | null;
  now: string | null;
}

export interface BehaviorChange {
  feature: ChangeFeature;
  /** The sentence; null for 'other' (shown as its cases). */
  text: { en: string; ru: string } | null;
  /** What caused it, the main cause first. */
  causes: ChangeCause[];
  cases: ChangeCase[];
}

export const causeKey = (c: ChangeCause): string => (c.kind === 'key' ? `key:${c.layerId}:r${c.pos[0]}c${c.pos[1]}` : 'id' in c ? `${c.kind}:${c.id}` : c.kind);

const spotName = ([r, col]: MatrixPos) => `r${r}c${col}`;

// ── the model of a project, kept per project object (projects are never changed in place) ──

const models = new WeakMap<Project, { own: readonly OwnCodeFile[] | null | undefined; model: FirmwareTestModel }>();

export function testModelOf(project: Project, spec: KeycodeSpec, ownCode?: readonly OwnCodeFile[] | null): FirmwareTestModel {
  const hit = models.get(project);
  if (hit && hit.own === ownCode) return hit.model;
  const model = firmwareTestModel(project, spec, ownCode);
  models.set(project, { own: ownCode, model });
  return model;
}

// ── one side of the comparison ──

interface Side {
  project: Project;
  model: FirmwareTestModel;
  layers: Project['keymaps'][number]['layers'];
  cols: number;
  byId: Map<string, Scenario>;
}

function side(project: Project, model: FirmwareTestModel): Side {
  const km = activeKeymap(project);
  const byId = new Map<string, Scenario>();
  for (const s of model.scenarios) if (!byId.has(s.id)) byId.set(s.id, s);
  return { project, model, layers: km.layers, cols: project.hardware.matrix.cols, byId };
}

const layerId = (s: Side, l: number) => s.layers[l]?.id ?? `#${l}`;
const layerTitle = (s: Side, l: number) => s.layers[l]?.name || t(`layer ${l}`, `слой ${l}`);
const valueAt = (s: Side, id: string, [r, col]: MatrixPos): number | undefined => s.layers.find((l) => l.id === id)?.keys[r * s.cols + col];

function itemOf(p: Project, item: string): unknown {
  const [kind, id] = [item.slice(0, item.indexOf(':')), item.slice(item.indexOf(':') + 1)];
  const list = kind === 'combo' ? p.combos : kind === 'tap-dance' ? p.tapDances : kind === 'key-override' ? p.keyOverrides : kind === 'tap-hold' ? p.tapHolds : [];
  return (list as { id: string }[]).find((x) => x.id === id);
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function layersDiffer(a: Project, b: Project): boolean {
  const view = (p: Project) => ({
    layers: activeKeymap(p).layers.map((l) => [l.id, l.cName ?? l.name, l.comboRef, l.typing]),
    onTop: p.firmware.layerKeysOnTop,
    languages: p.languages.map((l) => [l.layer, l.plainKeys]),
  });
  return !same(view(a), view(b));
}

// ── causes ──

function causesOf(B: Side, N: Side, b: Scenario | undefined, n: Scenario | undefined, extraCells: [Side, Cell][] = []): ChangeCause[] {
  const out: ChangeCause[] = [];
  const seen = new Set<string>();
  const add = (c: ChangeCause) => {
    const k = causeKey(c);
    if (!seen.has(k)) seen.add(k), out.push(c);
  };
  const cell = (s: Side, c: Cell | undefined) => {
    if (!c) return;
    const id = layerId(s, c.layer);
    if (valueAt(B, id, c.pos) !== valueAt(N, id, c.pos)) add({ kind: 'key', layerId: id, pos: c.pos });
  };
  const path = (s: Side, sc: Scenario | undefined) => {
    for (const st of (sc && s.model.routes.get(sc.layer)?.path) ?? []) cell(s, st.cell);
  };
  cell(B, b?.subject);
  cell(N, n?.subject);
  for (const item of new Set([b?.item, n?.item])) {
    if (item && !same(itemOf(B.project, item), itemOf(N.project, item))) {
      const i = item.indexOf(':');
      add({ kind: item.slice(0, i) as 'combo', id: item.slice(i + 1) });
    }
  }
  for (const c of b?.cells ?? []) cell(B, c);
  for (const c of n?.cells ?? []) cell(N, c);
  for (const [s, c] of extraCells) cell(s, c);
  path(B, b);
  path(N, n);
  // A tap-hold setting of a keycode the test plays.
  const values = [b?.value, n?.value].filter((v): v is number => v !== undefined);
  for (const v of new Set(values)) {
    const sb = B.project.tapHolds.find((x) => x.keycodes.includes(v));
    const sn = N.project.tapHolds.find((x) => x.keycodes.includes(v));
    if (!same(sb, sn)) add({ kind: 'tap-hold', id: (sn ?? sb)!.id });
  }
  if (!out.length) add(layersDiffer(B.project, N.project) ? { kind: 'layers' } : { kind: 'settings' });
  return out;
}

// ── names in sentences ──

/** The key's name for a sentence: its tap side for a tap-hold key ("Esc", not "Esc · hold Alt"). */
function keyName(spec: KeycodeSpec, s: Side, v: number | undefined): string {
  if (v === undefined) return '?';
  const th = tapHoldActionLookup(s.project).get(v);
  const d = decode(spec, v);
  const tap = th ? th.tap : d.kind === 'mod-tap' || d.kind === 'layer-tap' ? d.base : v;
  return friendlyName(spec, tap === 0 ? v : tap, { layerName: (l) => s.layers[l]?.name }).text;
}

function itemName(p: Project, item: string | undefined): string {
  const x = item ? (itemOf(p, item) as { name?: string } | undefined) : undefined;
  return x?.name || '?';
}

const list = (xs: string[]) => [...new Set(xs)].join(', ');

/** Why Key Lock can't hold a key, after "and" (process_key_lock.c: only keycodes up to 0xFF). */
function lockReason(spec: KeycodeSpec, s: Side, v: number): string {
  const d = decode(spec, v);
  if (tapHoldActionLookup(s.project).has(v) || d.kind === 'mod-tap' || d.kind === 'layer-tap') return t("a tap-hold key isn't one", 'клавиша с удержанием к ним не относится');
  if (d.kind === 'mods') return t("a key with modifiers isn't one", 'клавиша с модификаторами к ним не относится');
  return t(`${friendlyName(spec, v).qmk} isn't one`, `${friendlyName(spec, v).qmk} к ним не относится`);
}

// ── grouping ──

interface Pair {
  b?: Scenario;
  n?: Scenario;
  causes: ChangeCause[];
}

interface Group {
  feature: ChangeFeature;
  pairs: Pair[];
  causes: ChangeCause[];
  /** The sentence in the current language (called once per language). */
  say: ((pairs: Pair[]) => string) | null;
}

const caseOf = (p: Pair): ChangeCase => ({ steps: (p.n ?? p.b)!.steps, was: p.b?.output ?? null, now: p.n?.output ?? null });

const OWN_FEATURES = new Set(['tap', 'hold', 'one-shot', 'switcher']);

/**
 * The behavior changes from `before` (the project as last written) to `now`. `ownCode`: the user's own C on disk
 * (firmwareTestsFile's argument), the same for both sides.
 */
export function behaviorChanges(spec: KeycodeSpec, before: Project, now: Project, ownCode?: readonly OwnCodeFile[] | null): BehaviorChange[] {
  const B = side(before, testModelOf(before, spec, ownCode));
  const N = side(now, testModelOf(now, spec, ownCode));
  const groups = new Map<string, Group>();
  const group = (key: string, feature: ChangeFeature, say: Group['say'], pair: Pair) => {
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { feature, pairs: [], causes: [], say }));
    g.pairs.push(pair);
    for (const c of pair.causes) if (!g.causes.some((x) => causeKey(x) === causeKey(c))) g.causes.push(c);
  };

  // The scenarios whose result differs, or that are there on one side only.
  const pairs: Pair[] = [];
  for (const id of new Set([...B.byId.keys(), ...N.byId.keys()])) {
    const b = B.byId.get(id);
    const n = N.byId.get(id);
    if (b && n && b.output === n.output) continue;
    pairs.push({ b, n, causes: causesOf(B, N, b, n) });
  }

  // Layer reach: a layer reached by another way, or not at all any more (or now). Its tests go with it.
  const routeSig = (s: Side, l: number) => {
    const r = s.model.routes.get(l);
    return r ? r.path.map((st) => `${st.how}:${layerId(s, st.cell.layer)}:${spotName(st.cell.pos)}`).join(' ') : null;
  };
  const indexOf = (s: Side, id: string) => s.layers.findIndex((l) => l.id === id);
  const movedLayers = new Set<string>();
  for (const id of new Set([...B.layers.map((l) => l.id), ...N.layers.map((l) => l.id)])) {
    const lb = indexOf(B, id);
    const ln = indexOf(N, id);
    if (lb < 0 || ln < 0) continue; // a layer added or deleted: its tests come and go with it (layers cause)
    const sb = routeSig(B, lb);
    const sn = routeSig(N, ln);
    if (sb === sn) continue;
    movedLayers.add(id);
    const extra: [Side, Cell][] = [...(B.model.routes.get(lb)?.path ?? []).map((st) => [B, st.cell] as [Side, Cell]), ...(N.model.routes.get(ln)?.path ?? []).map((st) => [N, st.cell] as [Side, Cell])];
    const causes = causesOf(B, N, undefined, undefined, extra);
    const say = () => {
      const name = layerTitle(N, ln);
      const how = (s: Side, l: number) => routeText(spec, s, l);
      if (sn === null) return t(`Layer ${name} can no longer be reached: no key the tests can hold or tap turns it on from the layers on at power-on (before: ${how(B, lb)}).`, `Слой ${name} больше не включается: ни одна клавиша, которую тесты могут удержать или нажать, не включает его от слоёв, включённых при старте (раньше: ${how(B, lb)}).`);
      if (sb === null) return t(`Layer ${name} can now be reached: ${how(N, ln)}.`, `Слой ${name} теперь включается: ${how(N, ln)}.`);
      return t(`Layer ${name} is now reached another way: ${how(N, ln)} (before: ${how(B, lb)}).`, `Слой ${name} теперь включается по-другому: ${how(N, ln)} (раньше: ${how(B, lb)}).`);
    };
    groups.set(`layer:${id}`, { feature: 'layer', pairs: [], causes, say });
  }

  const againPairs: Pair[] = [];
  for (const p of pairs) {
    const s = (p.n ?? p.b)!;
    const S = p.n ? N : B;
    const lid = layerId(S, s.layer);
    if (movedLayers.has(lid)) {
      groups.get(`layer:${lid}`)!.pairs.push(p);
      continue;
    }
    const subjectChanged = !!s.subject && p.causes.some((c) => c.kind === 'key' && c.layerId === layerId(S, s.subject!.layer) && spotName(c.pos) === spotName(s.subject!.pos));
    const itemChanged = !!s.item && p.causes.some((c) => 'id' in c && `${c.kind}:${c.id}` === s.item);
    const main = p.causes[0];
    const spot = s.subject ? spotName(s.subject.pos) : '';

    if (OWN_FEATURES.has(s.feature)) {
      if (subjectChanged) {
        // The key's own tap and hold on its own layer: not a side effect. On a layer where the spot is transparent: one.
        if (layerId(S, s.subject!.layer) === lid) continue;
        const cell = `${layerId(S, s.subject!.layer)}:${spot}`;
        group(`transparent:${cell}`, 'transparent', (ps) => {
          const on = list(ps.map((q) => layerTitle(q.n ? N : B, (q.n ?? q.b)!.layer)));
          return t(`The change at ${spot} on ${layerTitle(S, s.subject!.layer)} also shows on ${on}, where ${spot} is transparent.`, `Изменение ${spot} на слое ${layerTitle(S, s.subject!.layer)} видно и на слоях ${on}: там ${spot} прозрачная.`);
        }, p);
        continue;
      }
      // A tap-hold setting's own keys held for another term: the setting's own behavior.
      if (p.causes.every((c) => c.kind === 'tap-hold')) continue;
      group(`other:${causeKey(main)}`, 'other', null, p);
      continue;
    }

    if (s.feature === 'key-lock') {
      if (s.id.endsWith(':on')) {
        if (subjectChanged) continue; // the lock key itself: its own tests
        group(`other:${causeKey(main)}`, 'other', null, p);
        continue;
      }
      if (s.id.endsWith(':again')) {
        againPairs.push(p);
        continue;
      }
      // Key Lock added to or taken off a layer: one sentence for the layer.
      const lockCell = (s.cells[0] && p.causes.find((c) => c.kind === 'key' && c.layerId === layerId(S, s.cells[0].layer) && spotName(c.pos) === spotName(s.cells[0].pos))) as ChangeCause | undefined;
      if (lockCell && !subjectChanged && (!p.b || !p.n)) {
        group(`key-lock-layer:${lid}:${p.n ? 'on' : 'off'}`, 'key-lock', (ps) => {
          const name = layerTitle(S, s.layer);
          if (!p.n) return t(`Key Lock is no longer on ${name}, so the tests stop checking keys after it there.`, `На слое ${name} больше нет Key Lock: тесты перестали проверять клавиши после него.`);
          const ignored = ps.filter((q) => q.n && !q.n.keyLockHolds).map((q) => `${keyName(spec, N, q.n!.value)} (${spotName(q.n!.subject!.pos)})`);
          return ignored.length
            ? t(`Key Lock on ${name} holds plain keys only: it ignores ${list(ignored)}.`, `Key Lock на слое ${name} удерживает только простые клавиши: ${list(ignored)} он пропускает.`)
            : t(`Key Lock on ${name} holds every key the tests press after it.`, `Key Lock на слое ${name} удерживает каждую клавишу, которую тесты нажимают после него.`);
        }, p);
        continue;
      }
      group(`key-lock:${lid}:${spot}`, 'key-lock', () => {
        const where = `${spot} ${t('on', 'на слое')} ${layerTitle(S, s.layer)}`;
        const { b, n } = p;
        if (b && n && b.keyLockHolds && !n.keyLockHolds)
          return t(`Key Lock now ignores ${keyName(spec, B, b.value)} (${where}): QMK's Key Lock holds only plain keys, and ${lockReason(spec, N, n.value!)}.`, `Key Lock теперь пропускает ${keyName(spec, B, b.value)} (${where}): Key Lock в QMK удерживает только простые клавиши, а ${lockReason(spec, N, n.value!)}.`);
        if (b && n && !b.keyLockHolds && n.keyLockHolds)
          return t(`Key Lock now holds ${keyName(spec, N, n.value)} (${where}): it is a plain key now.`, `Key Lock теперь удерживает ${keyName(spec, N, n.value)} (${where}): теперь это простая клавиша.`);
        if (b && !n) {
          const why = N.model.why.get(`key-lock:${lid}:${spot}`) ?? N.model.why.get(`key:${layerId(B, b.subject!.layer)}:${spot}`);
          return t(`Key Lock on ${layerTitle(B, b.layer)} is no longer tested with ${spot}${why ? `: ${why}` : ''}.`, `Key Lock на слое ${layerTitle(B, b.layer)} больше не проверяется с ${spot}${why ? `: ${why}` : ''}.`);
        }
        if (n && !b)
          return n.keyLockHolds
            ? t(`Key Lock on ${layerTitle(N, n.layer)} is now tested with ${keyName(spec, N, n.value)} (${spot}) and holds it.`, `Key Lock на слое ${layerTitle(N, n.layer)} теперь проверяется с ${keyName(spec, N, n.value)} (${spot}) и удерживает её.`)
            : t(`Key Lock on ${layerTitle(N, n.layer)} is now tested with ${keyName(spec, N, n.value)} (${spot}) and ignores it: QMK's Key Lock holds only plain keys, and ${lockReason(spec, N, n.value!)}.`, `Key Lock на слое ${layerTitle(N, n.layer)} теперь проверяется с ${keyName(spec, N, n.value)} (${spot}) и пропускает её: Key Lock в QMK удерживает только простые клавиши, а ${lockReason(spec, N, n.value!)}.`);
        return t(`With Key Lock on ${layerTitle(N, n!.layer)}, ${spot} now gives ${n!.output} (before: ${b!.output}).`, `С Key Lock на слое ${layerTitle(N, n!.layer)} ${spot} теперь даёт ${n!.output} (раньше: ${b!.output}).`);
      }, p);
      continue;
    }

    if (itemChanged) continue; // an edited combo's, tap dance's, key override's or tap-hold setting's own tests

    if (s.feature === 'combo') {
      const kind = p.b && p.n ? 'result' : p.b ? 'stops' : 'starts';
      const item = s.item!;
      group(`combo:${item}:${kind}:${causeKey(main)}`, 'combo', (ps) => {
        const name = itemName(N.project, item) === '?' ? itemName(B.project, item) : itemName(N.project, item);
        const on = list(ps.map((q) => (q.n ? layerTitle(N, q.n.layer) : layerTitle(B, q.b!.layer))));
        if (kind === 'stops') {
          const id = item.slice(item.indexOf(':') + 1);
          const q = ps[0].b!;
          const why = N.model.why.get(`combo:${id}:${layerId(B, q.layer)}`) ?? N.model.why.get(`combo:${id}`);
          return t(`Combo ${name} no longer fires on ${on}${why ? `: ${why}` : ''}.`, `Комбо ${name} больше не срабатывает на слоях ${on}${why ? `: ${why}` : ''}.`);
        }
        if (kind === 'starts') return t(`Combo ${name} now fires on ${on}.`, `Комбо ${name} теперь срабатывает на слоях ${on}.`);
        return t(`Combo ${name} now gives ${ps[0].n!.output} on ${on} (before: ${ps[0].b!.output}).`, `Комбо ${name} теперь даёт ${ps[0].n!.output} на слоях ${on} (раньше: ${ps[0].b!.output}).`);
      }, p);
      continue;
    }

    if (s.feature === 'key-override') {
      group(`key-override:${s.item}`, 'key-override', () => {
        const name = itemName(p.n ? N.project : B.project, s.item);
        if (!p.n) {
          const why = N.model.why.get(s.item!);
          return t(`Key override ${name} is no longer tested${why ? `: ${why}` : ''}.`, `Замена клавиш ${name} больше не проверяется${why ? `: ${why}` : ''}.`);
        }
        if (!p.b) return t(`Key override ${name} is now tested: ${p.n.steps} gives ${p.n.output}.`, `Замена клавиш ${name} теперь проверяется: ${p.n.steps} даёт ${p.n.output}.`);
        return t(`Key override ${name} now gives ${p.n.output} (before: ${p.b.output}).`, `Замена клавиш ${name} теперь даёт ${p.n.output} (раньше: ${p.b.output}).`);
      }, p);
      continue;
    }

    if (s.feature === 'caps-word') {
      const { b, n } = p;
      if (subjectChanged || !b || !n || b.capsWord !== n.capsWord) {
        group(`caps-word:${spot}`, 'caps-word', () => {
          const where = (sd: Side, sc: Scenario) => `${spot} ${t('on', 'на слое')} ${layerTitle(sd, sc.subject!.layer)}`;
          if (b && n) return t(`Caps Word now ${capsNow(n.capsWord!, keyName(spec, N, n.value))} (${where(N, n)}); before, it ${capsWas(b.capsWord!)}.`, `Caps Word теперь ${capsNow(n.capsWord!, keyName(spec, N, n.value))} (${where(N, n)}); раньше ${capsWas(b.capsWord!)}.`);
          if (b) {
            const v = valueAt(N, layerId(B, b.subject!.layer), b.subject!.pos);
            return t(`Caps Word is no longer tested with ${spot}${v !== undefined ? `: it is ${friendlyName(spec, v).text} now` : ''}.`, `Caps Word больше не проверяется с ${spot}${v !== undefined ? `: теперь это ${friendlyName(spec, v).text}` : ''}.`);
          }
          return t(`Caps Word is now tested with ${keyName(spec, N, n!.value)} (${where(N, n!)}): it ${capsNow(n!.capsWord!, t('it', 'её'))}.`, `Caps Word теперь проверяется с ${keyName(spec, N, n!.value)} (${where(N, n!)}): он ${capsNow(n!.capsWord!, t('it', 'её'))}.`);
        }, p);
        continue;
      }
      group(`other:${causeKey(main)}`, 'other', null, p);
      continue;
    }

    if (s.feature === 'tap-dance') {
      const slot = s.id.slice(s.id.lastIndexOf(':') + 1);
      group(`tap-dance:${s.id}`, 'tap-dance', () => {
        const name = itemName(p.n ? N.project : B.project, s.item);
        if (!p.n) return t(`Tap dance ${name}, ${slot}: no longer tested.`, `Тап-дэнс ${name}, ${slot}: больше не проверяется.`);
        if (!p.b) return t(`Tap dance ${name}, ${slot}: now tested, gives ${p.n.output}.`, `Тап-дэнс ${name}, ${slot}: теперь проверяется, даёт ${p.n.output}.`);
        return t(`Tap dance ${name}, ${slot}: now gives ${p.n.output} (before: ${p.b.output}).`, `Тап-дэнс ${name}, ${slot}: теперь даёт ${p.n.output} (раньше: ${p.b.output}).`);
      }, p);
      continue;
    }

    if (s.feature === 'hold-spot') {
      group(`hold-spot:${s.id}`, 'hold-spot', () => {
        const holder = s.cells[0];
        const thName = holder ? friendlyName(spec, S.layers[holder.layer]?.keys[holder.pos[0] * S.cols + holder.pos[1]] ?? 0).text : '?';
        if (!p.n) return t(`Holding ${thName} and pressing ${spot} is no longer tested.`, `Удержание ${thName} с нажатием ${spot} больше не проверяется.`);
        if (!p.b) return t(`Holding ${thName} and pressing ${spot} is now tested: ${p.n.output}.`, `Удержание ${thName} с нажатием ${spot} теперь проверяется: ${p.n.output}.`);
        return t(`Holding ${thName} and pressing ${spot} now gives ${p.n.output} (before: ${p.b.output}).`, `Удержание ${thName} с нажатием ${spot} теперь даёт ${p.n.output} (раньше: ${p.b.output}).`);
      }, p);
      continue;
    }

    group(`other:${causeKey(main)}`, 'other', null, p);
  }

  // Key Lock's "QK_LOCK again" test moves to the first key it can run on: it goes with that key's sentence.
  for (const p of againPairs) {
    const s = (p.n ?? p.b)!;
    const lid = layerId(p.n ? N : B, s.layer);
    const spots = [p.b, p.n].filter((x): x is Scenario => !!x?.subject).map((x) => spotName(x.subject!.pos));
    const key = spots.map((sp) => `key-lock:${lid}:${sp}`).find((k) => groups.has(k));
    if (key) groups.get(key)!.pairs.push(p);
    else group(`other:${causeKey(p.causes[0])}`, 'other', null, p);
  }

  const out: BehaviorChange[] = [];
  for (const g of groups.values()) {
    if (!g.say && !g.pairs.length) continue;
    const say = g.say;
    out.push({
      feature: g.feature,
      text: say ? { en: withLanguage('en', () => say(g.pairs)), ru: withLanguage('ru', () => say(g.pairs)) } : null,
      causes: g.causes,
      cases: g.pairs.map(caseOf),
    });
  }
  return out;
}

const capsNow = (o: 'shift' | 'keep' | 'end', name: string) =>
  o === 'shift' ? t(`shifts ${name}`, `нажимает ${name} с Shift`) : o === 'keep' ? t(`goes on through ${name} without shifting it`, `не выключается на ${name} и не добавляет Shift`) : t(`ends at ${name}`, `выключается на ${name}`);
const capsWas = (o: 'shift' | 'keep' | 'end') =>
  o === 'shift' ? t('shifted it', 'он нажимал её с Shift') : o === 'keep' ? t('went on through it', 'он не выключался на ней') : t('ended there', 'он выключался на ней');

/** How the tests reach a layer, in words: "holding r3c4 (Nav)", "tapping r0c0 (TG Game)". */
function routeText(spec: KeycodeSpec, s: Side, l: number): string {
  const path = s.model.routes.get(l)?.path;
  if (!path) return t('not reachable', 'не включался');
  if (!path.length) return t('on at power-on', 'включён при старте');
  return path
    .map((st) => {
      const key = `${spotName(st.cell.pos)} (${friendlyName(spec, st.value, { layerName: (x) => s.layers[x]?.name }).text})`;
      return st.how === 'hold' ? t(`holding ${key}`, `удержание ${key}`) : st.how === 'tap' ? t(`tapping ${key}`, `нажатие ${key}`) : t(`tapping ${key} while holding`, `нажатие ${key} при удержании`);
    })
    .join(t(', then ', ', затем '));
}

/** The changes caused by a key (layer index + spot in `project`), also those landing on other keys. */
export function changesOfKey(changes: readonly BehaviorChange[], project: Project, layer: number, pos: MatrixPos): BehaviorChange[] {
  const id = activeKeymap(project).layers[layer]?.id;
  return changes.filter((c) => c.causes.some((x) => x.kind === 'key' && x.layerId === id && x.pos[0] === pos[0] && x.pos[1] === pos[1]));
}

/** The changes caused by a project item (`combo`, `tap-dance`, `key-override`, `tap-hold` + its id). */
export function changesOfItem(changes: readonly BehaviorChange[], kind: 'combo' | 'tap-dance' | 'key-override' | 'tap-hold', id: string): BehaviorChange[] {
  return changes.filter((c) => c.causes.some((x) => x.kind === kind && x.id === id));
}

/** The changes caused by the layer list or layer settings, and layers reached differently. */
export function changesOfLayers(changes: readonly BehaviorChange[]): BehaviorChange[] {
  return changes.filter((c) => c.feature === 'layer' || c.causes.some((x) => x.kind === 'layers'));
}
