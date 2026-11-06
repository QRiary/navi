/**
 * Tap dance kinds (step 8a): which keycodes a tap dance refers to, and what its generated C needs.
 * Generator: core/qmk/tapDance.ts; checks: core/features/advanced.ts (checkTapDances).
 */
import type { MacroStep, TapDance, TapDanceKind, TapDanceStep } from './types';
import { TAP_DANCE_VARIANTS } from './types';

export const tapDanceKind = (t: TapDance): TapDanceKind => t.kind ?? 'slots';

/** A slots dance with no double tap and no tap-then-hold: a tap fires on release, the next press is a new dance. */
export const tapOnlyDance = (t: TapDance) => tapDanceKind(t) === 'slots' && !t.doubleTap && !t.tapHold;

const stepKeycodes = (steps: readonly MacroStep[] | undefined): number[] => (steps ?? []).flatMap((s) => (s.type === 'tap' || s.type === 'down' || s.type === 'up' ? [s.keycode] : []));

/** Keycodes of an every-tap step, in every variant. */
export const everyTapKeycodes = (steps: readonly TapDanceStep[] | undefined): number[] => (steps ?? []).flatMap((st) => TAP_DANCE_VARIANTS.flatMap((v) => stepKeycodes(st[v])));

/** Every keycode the dance stores, whatever its kind (the other kinds' fields are kept for switching back). */
export const tapDanceKeycodes = (t: TapDance): number[] => [t.tap, t.hold, t.doubleTap, t.tapHold, ...everyTapKeycodes(t.steps)];

/** The keycodes the generated C plays: only those of the dance's kind. */
export function activeTapDanceKeycodes(t: TapDance): number[] {
  switch (tapDanceKind(t)) {
    case 'slots':
      return [t.tap, t.hold, t.doubleTap, t.tapHold];
    case 'every-tap':
      return everyTapKeycodes(t.steps);
    case 'own-c':
      return [];
  }
}

const mapSteps = (steps: MacroStep[], f: (v: number) => number): MacroStep[] => steps.map((s) => (s.type === 'tap' || s.type === 'down' || s.type === 'up' ? { ...s, keycode: f(s.keycode) } : s));

/** The dance with every keycode it stores passed through f (layer renumbering, a stand-in that moves). */
export function mapTapDanceKeycodes(t: TapDance, f: (v: number) => number): TapDance {
  const out: TapDance = { ...t, tap: f(t.tap), hold: f(t.hold), doubleTap: f(t.doubleTap), tapHold: f(t.tapHold) };
  if (t.steps) {
    out.steps = t.steps.map((st) => {
      const next: TapDanceStep = {};
      for (const v of TAP_DANCE_VARIANTS) if (st[v]) next[v] = mapSteps(st[v]!, f);
      return next;
    });
  }
  return out;
}

/** Does the generated C play keycodes as key events (navi_send)? Slots always do; every-tap only with key steps. */
export const tapDanceSends = (t: TapDance) => tapDanceKind(t) === 'slots' || (tapDanceKind(t) === 'every-tap' && everyTapKeycodes(t.steps).length > 0);
