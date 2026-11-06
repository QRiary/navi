/**
 * TAP-HOLD SETTINGS: flavor, tapping term, quick tap term and “hold when pressed” keys of one mod-tap / layer-tap
 * keycode. Every key with that keycode shares them (QMK's get_*() callbacks get the keycode, not the position).
 * The generator turns them into per-key hooks (core/qmk/tapHold.ts); the keymap itself keeps plain MT / LT.
 */
import type { AdvancedIssue } from '../features/advanced';
import { decode, toQmk } from '../keycodes/codec';
import type { KeycodeSpec } from '../keycodes/spec';
import { activeKeymap } from './ops';
import type { Project, TapHoldSetting } from './types';

export const TAP_HOLD_MAX = 256;
export const TAP_HOLD_TERM_MIN = 10;
export const TAP_HOLD_TERM_MAX = 5000;
export const HOLD_ON_KEYS_MAX = 32;
export const TAP_HOLD_FLAVORS = ['tap-preferred', 'balanced', 'hold-preferred'] as const;

/** Only mod-tap and layer-tap keys decide between a tap and a hold per key (LM, OSM, TD have their own logic). */
export function isTapHoldKeycode(spec: KeycodeSpec, value: number): boolean {
  const kind = decode(spec, value).kind;
  return kind === 'mod-tap' || kind === 'layer-tap';
}

/** How many keys (all layers of the active keymap, which the settings' layer numbers refer to) have this keycode. */
export function tapHoldUsage(project: Project, keycode: number): number {
  let n = 0;
  for (const layer of activeKeymap(project).layers) for (const v of layer.keys) if (v === keycode) n++;
  return n;
}

/** Settings the generator writes: a tap-hold keycode, the first setting per keycode. */
export function effectiveTapHolds(spec: KeycodeSpec, project: Project): TapHoldSetting[] {
  const seen = new Set<number>();
  return project.tapHolds.filter((s) => {
    if (seen.has(s.keycode) || !isTapHoldKeycode(spec, s.keycode)) return false;
    seen.add(s.keycode);
    return true;
  });
}

const intIn = (v: number, min: number, max: number) => Number.isInteger(v) && v >= min && v <= max;

export function checkTapHolds(spec: KeycodeSpec, project: Project): AdvancedIssue[] {
  const out: AdvancedIssue[] = [];
  const list = project.tapHolds;
  if (list.length > TAP_HOLD_MAX) {
    out.push({ level: 'error', where: 'tap-hold', message: { en: `At most ${TAP_HOLD_MAX} tap-hold settings.`, ru: `Не больше ${TAP_HOLD_MAX} настроек тап-холд.` } });
  }
  const seen = new Set<number>();
  list.forEach((s, i) => {
    const where = `tap-hold ${i + 1} · ${toQmk(spec, s.keycode)}`;
    const err = (en: string, ru: string) => out.push({ level: 'error', where, message: { en, ru } });
    if (!isTapHoldKeycode(spec, s.keycode)) {
      err('Pick a mod-tap (MT, LSFT_T…) or layer-tap (LT) key: only those decide between a tap and a hold.', 'Выберите клавишу mod-tap (MT, LSFT_T…) или layer-tap (LT): только они выбирают между нажатием и удержанием.');
    } else if (seen.has(s.keycode)) {
      err('This key already has a setting above; one key has one setting.', 'У этой клавиши уже есть настройка выше; одна клавиша — одна настройка.');
    } else if (tapHoldUsage(project, s.keycode) === 0) {
      out.push({ level: 'warning', where, message: { en: 'No key in the keymap has this keycode, so the setting does nothing.', ru: 'Ни одна клавиша в раскладке не имеет этого keycode, поэтому настройка ничего не делает.' } });
    }
    seen.add(s.keycode);
    if (s.flavor !== undefined && !TAP_HOLD_FLAVORS.includes(s.flavor)) err('Unknown flavor.', 'Неизвестный режим.');
    if (s.tappingTerm !== undefined && !intIn(s.tappingTerm, TAP_HOLD_TERM_MIN, TAP_HOLD_TERM_MAX)) {
      err(`Tapping term must be a whole number ${TAP_HOLD_TERM_MIN}…${TAP_HOLD_TERM_MAX} ms.`, `Время нажатия — целое число ${TAP_HOLD_TERM_MIN}…${TAP_HOLD_TERM_MAX} мс.`);
    }
    if (s.quickTapTerm !== undefined && !intIn(s.quickTapTerm, 0, TAP_HOLD_TERM_MAX)) {
      err(`Quick tap term must be a whole number 0…${TAP_HOLD_TERM_MAX} ms.`, `Quick tap — целое число 0…${TAP_HOLD_TERM_MAX} мс.`);
    }
    if (s.holdOnKeys && s.holdOnKeys.length > HOLD_ON_KEYS_MAX) {
      err(`At most ${HOLD_ON_KEYS_MAX} “hold when pressed” keys.`, `Не больше ${HOLD_ON_KEYS_MAX} клавиш «удержание при нажатии».`);
    }
  });
  return out;
}
