/**
 * Held modifiers while NAVI types text (firmware.liftHeldMods, `heldMods` of a macro / send-string key): the real
 * mods (get_mods()) are cleared and sent before the text, restored and sent after, so a Shift you hold doesn't turn
 * `;` into `:`. One-shot and weak mods are not touched. A lift covers a whole macro, its key steps included.
 */
import type { HeldMods, Project } from '../project/types';

/** Static helpers in keymap.c (not for the user's code to define); navi_type_text is the language route's. */
export const LIFT_SYMBOLS = ['navi_lift_mods', 'navi_lower_mods', 'navi_type_text'] as const;

/** The project setting (unset in an old object = on). */
export const liftSetting = (project: Project): boolean => project.firmware.liftHeldMods !== false;

/** Does a macro / send-string key with this override lift? Unset follows the project setting. */
export const liftOf = (project: Project, own: HeldMods | undefined): boolean => (own ? own === 'lift' : liftSetting(project));

export const LIFT_HELPERS_C: string[] = [
  '// ── Held modifiers while NAVI types text: let go for the text, put back after ──',
  'static uint8_t navi_lift_mods(void) {',
  '    uint8_t held = get_mods();',
  '    if (held) {',
  '        clear_mods();',
  '        send_keyboard_report();',
  '    }',
  '    return held;',
  '}',
  '',
  'static void navi_lower_mods(uint8_t held) {',
  '    if (held) {',
  '        set_mods(held);',
  '        send_keyboard_report();',
  '    }',
  '}',
  '',
];

/** Statements as a block that lifts the held mods around them (unchanged when `on` is false). */
export function liftedBlock(stmts: string[], on: boolean): string[] {
  if (!on || !stmts.length) return stmts;
  return ['{', '    uint8_t navi_held = navi_lift_mods();', ...stmts.map((s) => `    ${s}`), '    navi_lower_mods(navi_held);', '}'];
}

/** One statement lifted on a single line (for `case X: ... return false;`). */
export function liftedLine(stmt: string, on: boolean): string {
  return on ? `{ uint8_t navi_held = navi_lift_mods(); ${stmt} navi_lower_mods(navi_held); }` : stmt;
}
