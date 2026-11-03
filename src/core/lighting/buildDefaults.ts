/**
 * Lighting of your own build (pure QMK): RGB Matrix defaults in config.h.
 * Stored in firmware.buildConfig; the generator writes them to config.h (core/qmk/generate.ts).
 */
import { effectName } from './effects';
import type { LightingState } from '../project/types';

export const BUILD_LIGHTING_KEYS = ['RGB_MATRIX_DEFAULT_ON', 'RGB_MATRIX_DEFAULT_MODE', 'RGB_MATRIX_DEFAULT_HUE', 'RGB_MATRIX_DEFAULT_SAT', 'RGB_MATRIX_DEFAULT_VAL', 'RGB_MATRIX_DEFAULT_SPD'] as const;
export type BuildLightingKey = (typeof BUILD_LIGHTING_KEYS)[number];

/**
 * “Preset” state (effect number in the list of enabled ones) → config.h values.
 * An effect without a name is not carried over; brightness is clamped to the keyboard limit (if known).
 */
export function buildLightingFrom(state: LightingState, effects: string[] | null, maxBrightness: number | null = null): Partial<Record<BuildLightingKey, string | number | boolean>> {
  const name = effectName(effects, state.effect);
  const out: Partial<Record<BuildLightingKey, string | number | boolean>> = {
    RGB_MATRIX_DEFAULT_ON: state.effect !== 0,
    RGB_MATRIX_DEFAULT_HUE: state.hue,
    RGB_MATRIX_DEFAULT_SAT: state.sat,
    RGB_MATRIX_DEFAULT_VAL: maxBrightness === null ? state.brightness : Math.min(state.brightness, maxBrightness),
    RGB_MATRIX_DEFAULT_SPD: state.speed,
  };
  if (name && name !== 'OFF') out.RGB_MATRIX_DEFAULT_MODE = `RGB_MATRIX_${name}`;
  return out;
}

/** Lighting as the keyboard itself sets it (the target's keyboard.json / config.h). null — not set or unknown. */
export interface RgbTargetDefaults {
  /** The maker's brightness limit (it limits the LED current). */
  maxBrightness: number | null;
  val: number | null;
  speed: number | null;
  hue: number | null;
  sat: number | null;
}

/** QMK values when neither the keyboard nor the build sets them (quantum/rgb_matrix/rgb_matrix.h). */
export const QMK_RGB_DEFAULTS = { maxBrightness: 255, hue: 0, sat: 255, speed: 127 };

function byte(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\s*\d+\s*$/.test(v) ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 0 && n <= 255 ? n : null;
}

/** From the target info (core/qmk/sources.ts: merged keyboard.json and #define from config.h). */
export function rgbTargetDefaults(src: { info: Record<string, unknown>; config: Record<string, string | true> } | null | undefined): RgbTargetDefaults {
  const rm = (src?.info.rgb_matrix ?? {}) as { max_brightness?: unknown; default?: Record<string, unknown> };
  const def = rm.default ?? {};
  const cfg = src?.config ?? {};
  return {
    maxBrightness: byte(cfg.RGB_MATRIX_MAXIMUM_BRIGHTNESS) ?? byte(rm.max_brightness),
    val: byte(cfg.RGB_MATRIX_DEFAULT_VAL) ?? byte(def.val),
    speed: byte(cfg.RGB_MATRIX_DEFAULT_SPD) ?? byte(def.speed),
    hue: byte(cfg.RGB_MATRIX_DEFAULT_HUE) ?? byte(def.hue),
    sat: byte(cfg.RGB_MATRIX_DEFAULT_SAT) ?? byte(def.sat),
  };
}

/** The effective brightness limit: the lower of the keyboard limit and your own (if set in the build). */
export function effectiveMaxBrightness(target: RgbTargetDefaults, buildConfig: Record<string, string | number | boolean>): number | null {
  const own = byte(buildConfig.RGB_MATRIX_MAXIMUM_BRIGHTNESS);
  if (own !== null && target.maxBrightness !== null) return Math.min(own, target.maxBrightness);
  return own ?? target.maxBrightness;
}
