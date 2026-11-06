/**
 * The task switcher key (NAVI_TASK_SWITCH, keycodes/taskSwitcher.ts): NAVI's own C for keymap.c, emitted only when the
 * project uses the key.
 *
 * Windows' Ctrl+Alt+Tab opens the task switcher and keeps it open after the keys are let go; Tab / Shift+Tab move in
 * it, so do the arrows, Enter picks the window and Esc closes it. The key: a tap opens it, a tap while open moves one
 * window on (a held Shift, or a one-shot Shift, rides along: backwards). Esc or Enter pressed while open forgets it.
 *
 * Picking on the layer key's release: the key remembers the highest layer on when it is pressed (the one a held layer
 * key brought up) and housekeeping_task sends Enter once that layer is off. QMK keeps no count of the keys holding a
 * layer, so the layer going off is the release of the key that held it, whatever kind (MO, LT, LM, a tap-hold slot,
 * a tap dance's hold). The default layer never goes off, and a one-shot layer goes off with the key itself: no pick.
 * With “layer keys on top” a layer hidden by a newer one still counts as on (navi_wanted).
 */
import type { KeycodeSpec } from '../keycodes/spec';
import { TASK_SWITCHER_NAME, taskSwitcherKeycode } from '../keycodes/taskSwitcher';

export const TASK_SWITCHER_SYMBOLS = [TASK_SWITCHER_NAME, 'navi_switcher_open', 'navi_switcher_layer', 'navi_switcher_on', 'navi_switcher_closes', 'navi_switcher_key'];

/** The keycode's define (keymap.c, or navi.h in own pipeline mode). */
export function taskSwitcherDecl(spec: KeycodeSpec): string[] {
  const hex = `0x${taskSwitcherKeycode(spec).toString(16).toUpperCase()}`;
  return [`#define ${TASK_SWITCHER_NAME} ${hex} // Windows' task switcher (Ctrl+Alt+Tab); NAVI's own keycode`, ''];
}

/** State and the key's handler, above process_record_*; `layersOnTop`: navi_wanted exists. */
export function taskSwitcherCode(o: { layersOnTop: boolean }): string[] {
  const on = o.layersOnTop ? 'navi_wanted | layer_state' : 'layer_state';
  return [
    `// ── Task switcher key (${TASK_SWITCHER_NAME}): Windows' Ctrl+Alt+Tab switcher stays open until a window is picked ──`,
    '// A tap opens it, a tap while it is open moves one window on (Tab; with Shift held: back). Esc or Enter closes it;',
    "// letting go of the layer key that brought up the key's layer picks the window (Enter).",
    'static bool          navi_switcher_open  = false;',
    'static layer_state_t navi_switcher_layer = 0; // the layer the key was pressed on, until it goes off (0: none)',
    '',
    `// The layers on${o.layersOnTop ? ' (hidden ones included)' : ''} and the default layer.`,
    'static layer_state_t navi_switcher_on(void) {',
    `    layer_state_t on = ${on} | default_layer_state;`,
    '    return on ? on : 1; // nothing on at all: layer 0',
    '}',
    '',
    "// Esc or Enter, also as a mod-tap's or layer-tap's tap.",
    'static bool navi_switcher_closes(uint16_t keycode, keyrecord_t *record) {',
    '    uint16_t key = keycode;',
    '    if (IS_QK_MODS(keycode)) key = QK_MODS_GET_BASIC_KEYCODE(keycode);',
    '#ifndef NO_ACTION_TAPPING',
    '    if (IS_QK_MOD_TAP(keycode)) key = record->tap.count ? QK_MOD_TAP_GET_TAP_KEYCODE(keycode) : KC_NO;',
    '    if (IS_QK_LAYER_TAP(keycode)) key = record->tap.count ? QK_LAYER_TAP_GET_TAP_KEYCODE(keycode) : KC_NO;',
    '#else',
    '    (void)record;',
    '#endif',
    '    return key == KC_ESCAPE || key == KC_ENTER || key == KC_KP_ENTER;',
    '}',
    '',
    'static bool navi_switcher_key(uint16_t keycode, keyrecord_t *record) {',
    `    if (keycode != ${TASK_SWITCHER_NAME}) {`,
    '        if (navi_switcher_open && record->event.pressed && navi_switcher_closes(keycode, record)) {',
    '            navi_switcher_open  = false;',
    '            navi_switcher_layer = 0;',
    '        }',
    '        return true;',
    '    }',
    '    if (!record->event.pressed) return false;',
    '    // A held (or one-shot) Shift goes with the keys: Ctrl+Alt+Shift+Tab / Shift+Tab move backwards.',
    '    tap_code16(navi_switcher_open ? KC_TAB : LCTL(LALT(KC_TAB)));',
    '    navi_switcher_open  = true;',
    '    uint8_t top         = get_highest_layer(layer_state | default_layer_state);',
    '    navi_switcher_layer = (layer_state_t)1 << top;',
    '    // The default layer never goes off, and a one-shot layer goes off with this very key: no pick then.',
    '    if (default_layer_state & navi_switcher_layer) navi_switcher_layer = 0;',
    '#ifndef NO_ACTION_ONESHOT',
    '    if (is_oneshot_layer_active() && get_oneshot_layer() == top) navi_switcher_layer = 0;',
    '#endif',
    '    return false;',
    '}',
    '',
  ];
}

/** The line in process_record_*. */
export const TASK_SWITCHER_RECORD_LINE = '    if (!navi_switcher_key(keycode, record)) return false; // the task switcher key; Esc / Enter close the switcher';

/** The switcher's lines in housekeeping_task_user (pure QMK) or housekeeping_task_navi (own pipeline); generate.ts writes the function. */
export function taskSwitcherHousekeeping(): string[] {
  return [
    "    // The key's layer went off (its layer key let go): Enter picks the window.",
    '    if (navi_switcher_layer && !(navi_switcher_on() & navi_switcher_layer)) {',
    '        navi_switcher_layer = 0;',
    '        if (navi_switcher_open) {',
    '            navi_switcher_open = false;',
    '            tap_code(KC_ENTER);',
    '        }',
    '    }',
  ];
}
