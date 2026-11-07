/**
 * ANY KEYCODE AS A KEY EVENT. tap_code16 / register_code16 (and QMK's own key override register) only send keyboard
 * keys and keys with mods (values up to 0x1FFF); anything above (a layer key, macro, tap dance, MT / LT, Caps Word, a
 * custom keycode, NAVI's language and task switcher keys…) does nothing there or sends a wrong key (the value is cut
 * to 8 bits: MO(1) taps KC_4). NAVI plays those through process_record with record->keycode (navi_send, needs
 * REPEAT_KEY_ENABLE), like a key of the keymap: key override replacements, leader actions, custom keycode actions,
 * language shortcuts, macro key steps. Keys up to 0x1FFF keep the cheap tap_code16 path (same output as before).
 */
import { ownActionKeycodes } from '../project/languageActions';
import type { Project } from '../project/types';

export const PLAY_SYMBOLS = ['navi_play', 'navi_play_tap', 'navi_ko_play'] as const;

/** Does NAVI play this keycode as a key event (tap_code16 can't send it)? */
export const playsAsKey = (v: number): boolean => (v & 0xffff) > 0x1fff;

/** Every keycode NAVI's code taps or presses for the project (a superset of what the generator writes). */
export function playedKeycodes(project: Project): number[] {
  const out: number[] = [];
  for (const o of project.keyOverrides) out.push(o.replacement);
  for (const s of project.leaderSequences) if (s.action.type === 'tap') out.push(s.action.keycode);
  for (const ck of project.customKeycodes) out.push(...ownActionKeycodes(ck.action));
  for (const l of project.languages) if (l.osShortcut !== undefined) out.push(l.osShortcut);
  // VIA plays its own macros (one byte per key); without VIA the macros are NAVI's C.
  if (project.firmware.buildFeatures.via !== true) {
    for (const m of project.macros) for (const s of m.steps) if (s.type === 'tap' || s.type === 'down' || s.type === 'up') out.push(s.keycode);
  }
  return out;
}

/** Does the generated C need navi_play (and REPEAT_KEY_ENABLE)? */
export const projectPlays = (project: Project): boolean => playedKeycodes(project).some(playsAsKey);

/**
 * navi_play / navi_play_tap, after navi_send. `unused`: the project may need only one of them (a per-language action
 * the generator leaves out, say), and an unused static function is an error under -Werror.
 */
export function playCode(): string[] {
  return [
    '// ── Any keycode as a key event (key overrides, leader, macros, own keycodes) ──',
    "// tap_code16 sends only keyboard keys and keys with mods: these play the rest (layer keys, macros, tap dances, MT / LT…)",
    '// like a key of the keymap, as a tap (MT / LT / OSM do their tap side). record: the key they are played for; NULL: none',
    "// (a combo event, QMK's event without a key position).",
    '__attribute__((unused)) static void navi_play(uint16_t keycode, keyrecord_t *record, bool pressed) {',
    '    if (record) {',
    '        navi_send(keycode, record, pressed, 1);',
    '        return;',
    '    }',
    '    keyrecord_t none = {.event = MAKE_COMBOEVENT(pressed)};',
    '    navi_send(keycode, &none, pressed, 1);',
    '}',
    '',
    '__attribute__((unused)) static void navi_play_tap(uint16_t keycode, keyrecord_t *record) {',
    '    navi_play(keycode, record, true);',
    '    wait_ms(TAP_CODE_DELAY);',
    '    navi_play(keycode, record, false);',
    '}',
    '',
  ];
}

/** A tap of `v` (its C expression `expr`) as a C statement; `record`: the C record it is played for, or NULL. */
export function tapStatement(v: number, expr: string, record: string): string {
  return playsAsKey(v) ? `navi_play_tap(${expr}, ${record});` : `tap_code16(${expr});`;
}

/**
 * Key overrides whose replacement QMK can't register: the override gets replacement KC_NO and navi_ko_play as its
 * custom action, which holds the keycode (context) down while the override is on. QMK calls it inside
 * process_key_override with the override already active, and the played key goes through process_key_override again:
 * these overrides set ko_option_no_unregister_on_other_key_down, or that press would end the override at once (and
 * release the key while it is being pressed). So another key pressed meanwhile doesn't end them either (a layer key
 * replacement keeps its layer while the trigger is held).
 */
export const KO_PLAY_CODE = [
  "// A key override's replacement QMK can't register itself (not a keyboard key): held while the override is on.",
  'static bool navi_ko_play(bool activated, void *context) {',
  '    navi_play((uint16_t)(uintptr_t)context, NULL, activated);',
  '    return false; // nothing more for QMK to register: the replacement is KC_NO',
  '}',
  '',
];

/** The key_override_t of an override played by navi_ko_play: ko_make_with_layers' fields, plus the custom action. */
export function playedOverride(o: { name: string; mask: string; trigger: string; replacement: string; layers: string }): string {
  return (
    `const key_override_t ${o.name} = {.trigger_mods = ${o.mask}, .layers = ${o.layers}, .suppressed_mods = ${o.mask}, ` +
    '.options = (ko_option_t)(ko_options_default | ko_option_no_unregister_on_other_key_down), .negative_mod_mask = 0, ' +
    `.custom_action = navi_ko_play, .context = (void *)(uintptr_t)(${o.replacement}), .trigger = ${o.trigger}, .replacement = KC_NO, .enabled = NULL};`
  );
}
