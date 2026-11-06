/**
 * Auto repeat (firmware.autoRepeat): NAVI's own C for keymap.c. A macro or custom keycode ticked “repeat while held”
 * runs its action on press, again after `delay` ms, then every `rate` ms until released. One key repeats at a time:
 * the one pressed last. The release matches by keycode only, on purpose: a release position can differ for combo /
 * tap dance events, and a stuck repeat is worse.
 */

/** One repeating key: its C `case` label, an optional comment after it, and the statements that run the action. */
export interface RepeatCase {
  label: string;
  comment?: string;
  body: string[];
}

export const REPEAT_SYMBOLS = ['navi_repeat', 'navi_repeat_action', 'navi_repeat_cb', 'navi_repeat_keycode', 'navi_repeat_token'];

/** `fallback`: statements for any other keycode (Languages' symbol keys, typed from navi_symbol_text). */
export function autoRepeatCode({ delay, rate, cases, fallback }: { delay: number; rate: number; cases: RepeatCase[]; fallback?: string[] }): string[] {
  const out = [
    `// ── Auto repeat (NAVI additions): a held key runs its action again after ${delay} ms, then every ${rate} ms ──`,
    '// One key repeats at a time: the one pressed last. Releasing it stops the repeat.',
    'static uint16_t navi_repeat_keycode = KC_NO;',
    'static deferred_token navi_repeat_token = INVALID_DEFERRED_TOKEN;',
    '',
    'static void navi_repeat_action(uint16_t keycode) {',
    '    switch (keycode) {',
  ];
  for (const k of cases) {
    out.push(`        case ${k.label}:${k.comment ? ` // ${k.comment}` : ''}`);
    for (const st of k.body) out.push(`            ${st}`);
    out.push('            break;');
  }
  if (fallback) out.push('        default:', ...fallback.map((st) => `            ${st}`), '            break;');
  out.push(
    '    }',
    '}',
    '',
    'static uint32_t navi_repeat_cb(uint32_t trigger_time, void *cb_arg) {',
    '    (void)trigger_time;',
    '    (void)cb_arg;',
    '    navi_repeat_action(navi_repeat_keycode);',
    `    return ${rate};`,
    '}',
    '',
    "// A ticked key's press runs its action and starts the repeat (taking it over from any other key); the release of the repeating key stops it.",
    'static void navi_repeat(uint16_t keycode, keyrecord_t *record) {',
    '    if (record->event.pressed) {',
    '        cancel_deferred_exec(navi_repeat_token);',
    '        navi_repeat_keycode = keycode;',
    '        navi_repeat_action(keycode);',
    `        navi_repeat_token = defer_exec(${delay}, navi_repeat_cb, NULL);`,
    '    } else if (keycode == navi_repeat_keycode) {',
    '        cancel_deferred_exec(navi_repeat_token);',
    '        navi_repeat_token = INVALID_DEFERRED_TOKEN;',
    '        navi_repeat_keycode = KC_NO;',
    '    }',
    '}',
    '',
  );
  return out;
}
