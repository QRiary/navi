/**
 * RGB MATRIX EFFECTS: effect number in the firmware → name.
 * In QMK the number = the position among the effects ENABLED at build time in rgb_matrix_effects.inc order
 * (SOLID_COLOR = 1, then only the enabled ones). So without the list of enabled effects the number
 * cannot honestly be turned into a name. The order comes from the QMK sources (qmk-data/rgb-matrix-effects.json).
 */
import data from '../qmk-data/rgb-matrix-effects.json';
import dilemmaMax from '../qmk-data/dilemma-max.keyboard.json';

export interface EffectInfo {
  id: string;
  enable: string | null;
  framebuffer: boolean;
  reactive: boolean;
}

export const RGB_MATRIX_EFFECTS: EffectInfo[] = (data as { effects: EffectInfo[] }).effects;

/** Enabled effects from keyboard.json "rgb_matrix": { "animations": { "breathing": true, … } }. */
export function effectListFromAnimations(animations: Record<string, boolean>): string[] {
  const on = new Set(Object.entries(animations).filter(([, v]) => v).map(([k]) => k.toUpperCase()));
  return RGB_MATRIX_EFFECTS.filter((e) => e.id === 'SOLID_COLOR' || on.has(e.id)).map((e) => e.id);
}

/** Effects of the official Dilemma Max (QMK bastardkb/dilemma/4x6_4) — 44 of them. */
export const DILEMMA_MAX_EFFECTS: string[] = effectListFromAnimations(
  ((dilemmaMax as unknown as { rgb_matrix: { animations: Record<string, boolean> } }).rgb_matrix.animations) ?? {},
);

/** Effect name by number (0 — off). null — the number is outside the list. */
export function effectName(list: string[] | null, value: number): string | null {
  if (value === 0) return 'OFF';
  if (!list) return null;
  return list[value - 1] ?? null;
}

export function humanEffect(id: string): string {
  return id
    .toLowerCase()
    .split('_')
    .map((w, i) => (i === 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}
