/**
 * TAP-HOLD KEYS WITH ANY ACTION IN EACH SLOT (ZMK's hold-tap): a tap slot (any keycode) and a hold slot (modifiers,
 * a layer with optional modifiers, or any keycode held down).
 *
 * A key is stored as plain QMK MT() / LT() whenever that says the same thing (VIA, keymap.json and the codec need
 * QMK's 16-bit values). Anything else gets a TapHoldAction: the keys carry its stand-in keycode, an MT / LT with a
 * base key from STAND_IN_BASES (codes HID leaves unassigned, so no real key has them). QMK's tap-hold logic decides
 * on the stand-in like on any MT / LT (per-key settings in Advanced → Tap-hold apply to it too), and the generated
 * keymap.c plays the real actions (core/qmk/tapHold.ts).
 */
import type { AdvancedIssue } from '../features/advanced';
import { decode, encode, KeycodeError, toQmk } from '../keycodes/codec';
import type { KeycodeSpec } from '../keycodes/spec';
import { activeKeymap } from './ops';
import type { HoldAction, Project, TapHoldAction } from './types';

export const TAP_HOLD_ACTIONS_MAX = 256;
/**
 * Base keys of the stand-ins: the basic codes no QMK keycode version names (0x02, 0x03, 0xC3–0xCC). They must stay
 * at or below KC_RIGHT_GUI: QMK's is_tap_action() takes only KC_NO…KC_RIGHT_GUI as the tap of an MT / LT, a higher
 * base makes the key a plain hold with no tapping at all. NAVI never lets QMK send them.
 */
export const STAND_IN_BASES: readonly number[] = [0x02, 0x03, ...Array.from({ length: 10 }, (_, i) => 0xc3 + i)];
/**
 * Stand-in modifiers for “hold = a key”: NAVI plays both slots, QMK only decides. Alt / GUI first: Speculative Hold
 * presses Shift / Ctrl mod-taps early by default.
 */
const KEY_HOLD_STAND_IN_MODS = [0x18, 0x14, 0x1c, 0x08, 0x04, 0x0c, 0x1a, 0x16, 0x1e, 0x0a, 0x06, 0x0e];

const isStandInBase = (base: number) => STAND_IN_BASES.includes(base);

/** Why a keycode can't be a slot of a tap-hold key (null = it can). Nested tap-hold keys and tap dances can't. */
export function slotProblem(spec: KeycodeSpec, value: number, slot: 'tap' | 'hold'): { en: string; ru: string } | null {
  if (slot === 'hold' && value === 0) return { en: 'The hold key is empty.', ru: 'Клавиша удержания пустая.' };
  if (value === 1) return { en: 'A transparent key (KC_TRNS) can’t be a tap or a hold.', ru: 'Прозрачная клавиша (KC_TRNS) не может быть нажатием или удержанием.' };
  const d = decode(spec, value);
  const nested = d.kind === 'mod-tap' || d.kind === 'layer-tap' || d.kind === 'swap-hands-tap' || d.kind === 'tap-dance' || (d.kind === 'layer' && d.fn === 'TT');
  if (nested) return { en: 'A tap-hold key or tap dance can’t be inside another tap-hold key.', ru: 'Тап-холд клавиша или tap dance не может быть внутри другой тап-холд клавиши.' };
  if (d.kind === 'basic' && isStandInBase(value)) return { en: 'This code is not a key.', ru: 'Этот код — не клавиша.' };
  return null;
}

export const sameHold = (a: HoldAction, b: HoldAction): boolean =>
  a.type === b.type && (a.type === 'mods' ? a.mods === (b as typeof a).mods : a.type === 'layer' ? a.layer === (b as typeof a).layer && a.mods === (b as typeof a).mods : a.keycode === (b as typeof a).keycode);

/** The plain MT / LT value when QMK can say the same, else null. KC_NO / KC_TRNS taps are QMK's one-shot / tap toggle. */
export function plainTapHold(spec: KeycodeSpec, tap: number, hold: HoldAction): number | null {
  if (tap < 0x04 || tap > 0xe7 || isStandInBase(tap)) return null; // see STAND_IN_BASES: QMK taps only up to KC_RIGHT_GUI
  if (hold.type === 'mods' && (hold.mods & 0x0f) !== 0) return encode(spec, { kind: 'mod-tap', mods: hold.mods & 0x1f, base: tap });
  if (hold.type === 'layer' && hold.mods === 0 && hold.layer >= 0 && hold.layer <= 15) return encode(spec, { kind: 'layer-tap', layer: hold.layer, base: tap });
  return null;
}

/** Stand-in keycode → its action. */
export function tapHoldActionLookup(project: Project): Map<number, TapHoldAction> {
  const map = new Map<number, TapHoldAction>();
  for (const a of project.tapHoldActions) if (!map.has(a.keycode)) map.set(a.keycode, a);
  return map;
}

/** Every keycode the project refers to: keymaps, encoders, tap dances, combos, overrides, own keycodes, leader, aliases, tap-hold settings. */
export function projectKeycodeRefs(project: Project): Set<number> {
  const refs = new Set<number>();
  for (const k of project.keymaps) {
    for (const l of k.layers) {
      for (const v of l.keys) refs.add(v);
      for (const e of l.encoders) refs.add(e.ccw).add(e.cw);
    }
  }
  for (const t of project.tapDances) refs.add(t.tap).add(t.hold).add(t.doubleTap).add(t.tapHold);
  for (const c of project.combos) refs.add(c.result);
  for (const o of project.keyOverrides) refs.add(o.trigger).add(o.replacement);
  for (const c of project.customKeycodes) if (c.action.type === 'tap') refs.add(c.action.keycode);
  for (const s of project.leaderSequences) if (s.action.type === 'tap') refs.add(s.action.keycode);
  for (const a of project.keyAliases) refs.add(a.keycode);
  for (const s of project.tapHolds) {
    refs.add(s.keycode);
    for (const k of s.holdOnKeys ?? []) refs.add(k);
  }
  return refs;
}

/** Drops the actions no keycode in the project points at any more. */
export function pruneTapHoldActions(project: Project): Project {
  const refs = projectKeycodeRefs(project);
  const kept = project.tapHoldActions.filter((a) => refs.has(a.keycode));
  return kept.length === project.tapHoldActions.length ? project : { ...project, tapHoldActions: kept };
}

function standInCandidates(spec: KeycodeSpec, hold: HoldAction): number[] {
  if (hold.type === 'layer') return STAND_IN_BASES.map((base) => encode(spec, { kind: 'layer-tap', layer: hold.layer, base }));
  const mods = hold.type === 'mods' ? [hold.mods & 0x1f] : KEY_HOLD_STAND_IN_MODS;
  return mods.flatMap((m) => STAND_IN_BASES.map((base) => encode(spec, { kind: 'mod-tap', mods: m, base })));
}

function holdProblem(spec: KeycodeSpec, hold: HoldAction): { en: string; ru: string } | null {
  if (hold.type === 'mods') return (hold.mods & 0x0f) === 0 || hold.mods > 0x1f ? { en: 'Choose at least one modifier.', ru: 'Выберите хотя бы один модификатор.' } : null;
  if (hold.type === 'layer') {
    if (!Number.isInteger(hold.layer) || hold.layer < 0 || hold.layer > 15) return { en: 'A tap-hold key holds layers 0–15 only (QMK’s LT).', ru: 'Тап-холд клавиша удерживает только слои 0–15 (LT в QMK).' };
    return hold.mods < 0 || hold.mods > 0x1f || (hold.mods !== 0 && (hold.mods & 0x0f) === 0) ? { en: 'Invalid modifiers.', ru: 'Неверные модификаторы.' } : null;
  }
  return slotProblem(spec, hold.keycode, 'hold');
}

/**
 * The keycode for a tap-hold key: plain MT / LT, the stand-in of an existing action with the same slots, or a new
 * stand-in (the action is added to the project). Errors as KeycodeError (a slot that can't be, no stand-in left).
 */
export function ensureTapHold(spec: KeycodeSpec, input: Project, tap: number, hold: HoldAction): { project: Project; keycode: number } {
  // Actions left behind by keys overwritten elsewhere (paste, clear) go first, so they never fill the pool.
  const project = pruneTapHoldActions(input);
  const problem = slotProblem(spec, tap, 'tap') ?? holdProblem(spec, hold);
  if (problem) throw new KeycodeError(problem.en);
  const plain = plainTapHold(spec, tap, hold);
  if (plain !== null) return { project, keycode: plain };
  const same = project.tapHoldActions.find((a) => a.tap === tap && sameHold(a.hold, hold));
  if (same) return { project, keycode: same.keycode };
  if (project.tapHoldActions.length >= TAP_HOLD_ACTIONS_MAX) throw new KeycodeError(`At most ${TAP_HOLD_ACTIONS_MAX} tap-hold keys with actions.`);
  const taken = projectKeycodeRefs(project);
  for (const a of project.tapHoldActions) taken.add(a.keycode);
  const keycode = standInCandidates(spec, hold).find((v) => !taken.has(v));
  if (keycode === undefined) throw new KeycodeError('No stand-in keycode left for this hold: too many different taps with it.');
  const id = `tha-${keycode.toString(16)}-${Date.now().toString(36)}`;
  return { project: { ...project, tapHoldActions: [...project.tapHoldActions, { id, keycode, tap, hold }] }, keycode };
}

/** The slots of a key: its action, or what a plain MT / LT does. null = not a tap-hold key. */
export function tapHoldSlots(spec: KeycodeSpec, project: Project, value: number): { tap: number; hold: HoldAction } | null {
  const a = project.tapHoldActions.find((x) => x.keycode === value);
  if (a) return { tap: a.tap, hold: a.hold };
  const d = decode(spec, value);
  if (d.kind === 'mod-tap') return { tap: d.base, hold: { type: 'mods', mods: d.mods } };
  if (d.kind === 'layer-tap') return { tap: d.base, hold: { type: 'layer', layer: d.layer, mods: 0 } };
  return null;
}

/** Does the stand-in keycode match the hold (MT with the hold's mods, LT with its layer, any MT for a key)? */
function standInFits(spec: KeycodeSpec, a: TapHoldAction): boolean {
  const d = decode(spec, a.keycode);
  if (d.kind === 'layer-tap') return a.hold.type === 'layer' && d.layer === a.hold.layer && isStandInBase(d.base);
  if (d.kind === 'mod-tap') return (a.hold.type === 'key' || (a.hold.type === 'mods' && (a.hold.mods & 0x1f) === d.mods)) && isStandInBase(d.base);
  return false;
}

/** Actions the generator writes: valid ones that something in the project refers to, first one per stand-in. */
export function effectiveTapHoldActions(spec: KeycodeSpec, project: Project): TapHoldAction[] {
  const refs = projectKeycodeRefs(project);
  const seen = new Set<number>();
  return project.tapHoldActions.filter((a) => {
    if (seen.has(a.keycode) || !refs.has(a.keycode) || !standInFits(spec, a) || slotProblem(spec, a.tap, 'tap') || holdProblem(spec, a.hold)) return false;
    seen.add(a.keycode);
    return true;
  });
}

/** Does an action need QMK's own key handling for a keycode (record.keycode, REPEAT_KEY_ENABLE)? Every action does. */
export const needsKeyRecord = (actions: TapHoldAction[]) => actions.length > 0;

export function checkTapHoldActions(spec: KeycodeSpec, project: Project): AdvancedIssue[] {
  const out: AdvancedIssue[] = [];
  if (project.tapHoldActions.length > TAP_HOLD_ACTIONS_MAX) {
    out.push({ level: 'error', where: 'tap-hold keys', message: { en: `At most ${TAP_HOLD_ACTIONS_MAX} tap-hold keys with actions.`, ru: `Не больше ${TAP_HOLD_ACTIONS_MAX} тап-холд клавиш с действиями.` } });
  }
  const layers = activeKeymap(project).layers.length;
  const onKeysOnly = new Set<number>();
  for (const t of project.tapDances) [t.tap, t.hold, t.doubleTap, t.tapHold].forEach((v) => onKeysOnly.add(v));
  for (const c of project.combos) onKeysOnly.add(c.result);
  for (const o of project.keyOverrides) onKeysOnly.add(o.trigger).add(o.replacement);
  for (const c of project.customKeycodes) if (c.action.type === 'tap') onKeysOnly.add(c.action.keycode);
  for (const s of project.leaderSequences) if (s.action.type === 'tap') onKeysOnly.add(s.action.keycode);
  const seen = new Set<number>();
  project.tapHoldActions.forEach((a, i) => {
    const where = `tap-hold key ${i + 1} · ${toQmk(spec, a.tap)}`;
    const err = (m: { en: string; ru: string }) => out.push({ level: 'error', where, message: m });
    const problem = slotProblem(spec, a.tap, 'tap') ?? holdProblem(spec, a.hold);
    if (problem) err(problem);
    else if (!standInFits(spec, a)) err({ en: 'Its stand-in keycode doesn’t match the hold action (the file was edited by hand?).', ru: 'Его заменяющий keycode не подходит к действию удержания (файл правили вручную?).' });
    else if (seen.has(a.keycode)) err({ en: 'Two tap-hold keys share one stand-in keycode.', ru: 'Две тап-холд клавиши делят один заменяющий keycode.' });
    seen.add(a.keycode);
    if (a.hold.type === 'layer' && a.hold.layer >= layers && !problem) {
      out.push({ level: 'warning', where, message: { en: `Layer ${a.hold.layer} doesn’t exist in this keymap.`, ru: `Слоя ${a.hold.layer} нет в этой раскладке.` } });
    }
    if (onKeysOnly.has(a.keycode)) {
      err({ en: 'A tap-hold key with actions works only on keys of the keymap, not in tap dances, combos, overrides or leader / own keycode actions.', ru: 'Тап-холд клавиша с действиями работает только на клавишах раскладки, не в tap dance, комбо, подменах и действиях лидера / своих keycodes.' });
    }
  });
  return out;
}
