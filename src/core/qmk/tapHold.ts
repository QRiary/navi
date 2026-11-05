/**
 * Per-key tap-hold settings → C for keymap.c (settings: core/project/tapHolds.ts).
 *
 * QMK asks the keycode of the tap-hold key, so every key with that keycode shares a setting. The *_PER_KEY define
 * REPLACES the global flag (HOLD_ON_OTHER_KEY_PRESS, PERMISSIVE_HOLD) in QMK, so the default branch of each hook
 * repeats what the global flag would have said and keys without a flavor keep behaving as before.
 */
import type { TapHoldSetting } from '../project/types';

export interface TapHoldPlan {
  /** `case X: return N;` pieces, in setting order. */
  terms: { code: string; term: number }[];
  quick: { code: string; term: number }[];
  /** Flavor cases of get_hold_on_other_key_press: hold-preferred → true, else false; hold keys come first. */
  holdPress: { code: string; flavor?: TapHoldSetting['flavor']; holdKeys: string[] }[];
  permissive: { code: string; value: boolean }[];
}

export function planTapHolds(settings: TapHoldSetting[], kc: (v: number) => string): TapHoldPlan {
  const plan: TapHoldPlan = { terms: [], quick: [], holdPress: [], permissive: [] };
  for (const s of settings) {
    const code = kc(s.keycode);
    if (s.tappingTerm !== undefined) plan.terms.push({ code, term: s.tappingTerm });
    if (s.quickTapTerm !== undefined) plan.quick.push({ code, term: s.quickTapTerm });
    const holdKeys = (s.holdOnKeys ?? []).filter((k) => k > 1).map(kc);
    if (s.flavor !== undefined || holdKeys.length) plan.holdPress.push({ code, flavor: s.flavor, holdKeys });
    if (s.flavor !== undefined) plan.permissive.push({ code, value: s.flavor === 'balanced' });
  }
  return plan;
}

export const hasHoldKeys = (plan: TapHoldPlan) => plan.holdPress.some((h) => h.holdKeys.length > 0);

/**
 * Keys whose settings say “hold when another key is pressed” (hold-preferred, or hold keys): QMK's replay trap
 * applies to them. QMK holds keys back while a tap-hold key is undecided and replays them later; a replayed
 * tap-hold key whose release is already in that buffer is decided as a tap (action_tapping.c,
 * waiting_buffer_scan_tap) without asking get_hold_on_other_key_press. Seen in a host test on qmk_firmware 180f394b48:
 * LT(1, KC_SPC) held, hold-preferred LSFT_T(KC_P) rolled over KC_C typed “pc”, not “C”.
 */
export const replayTracked = (plan: TapHoldPlan) => plan.holdPress.filter((h) => h.flavor === 'hold-preferred' || h.holdKeys.length > 0);

/**
 * pre_process_record (it sees real key events only, before QMK's tapping logic): the key pressed last for hold keys,
 * and the real key order for the replay fix.
 */
export function preProcessHook(hook: string, opts: { lastPressed: boolean; replay: boolean; interrupters: boolean }): string[] {
  const out: string[] = [];
  if (opts.lastPressed) {
    out.push('// The key pressed last: "hold when pressed" keys need it, and get_hold_on_other_key_press only gets the tap-hold key.');
    out.push('static uint16_t navi_last_pressed = KC_NO;', '');
  }
  if (opts.replay) {
    out.push(
      '// ── Tap-hold replay fix ──',
      '// QMK holds keys back while a tap-hold key is undecided and replays them later. A replayed tap-hold key whose',
      '// release is already waiting is decided as a tap without asking get_hold_on_other_key_press. NAVI watches the',
      '// real key order here and turns such a tap back into a hold for the keys set to hold when another key is pressed.',
      'static matrix_row_t navi_down[MATRIX_ROWS];        // keys down now',
      'static matrix_row_t navi_interrupted[MATRIX_ROWS]; // another key was pressed while this one was down',
    );
    if (opts.interrupters) out.push('static uint16_t     navi_interrupter[MATRIX_ROWS][MATRIX_COLS]; // the first key pressed while it was down');
    out.push(
      '',
      'static void navi_watch_presses(uint16_t keycode, keyrecord_t *record) {',
      '    if (!IS_KEYEVENT(record->event)) return;',
      '    uint8_t row = record->event.key.row;',
      '    uint8_t col = record->event.key.col;',
      '    if (row >= MATRIX_ROWS || col >= MATRIX_COLS) return;',
      '    matrix_row_t bit = (matrix_row_t)1 << col;',
      '    if (!record->event.pressed) {',
      '        navi_down[row] &= ~bit;',
      '        return;',
      '    }',
      '    for (uint8_t r = 0; r < MATRIX_ROWS; r++) {',
    );
    if (opts.interrupters) {
      out.push(
        '        matrix_row_t first = navi_down[r] & ~navi_interrupted[r];',
        '        for (uint8_t c = 0; first && c < MATRIX_COLS; c++) {',
        '            if (first & ((matrix_row_t)1 << c)) navi_interrupter[r][c] = keycode;',
        '        }',
      );
    }
    out.push('        navi_interrupted[r] |= navi_down[r];', '    }', '    navi_down[row] |= bit;', '    navi_interrupted[row] &= ~bit;', '}', '');
  }
  out.push(`bool ${hook}(uint16_t keycode, keyrecord_t *record) {`);
  if (opts.lastPressed) out.push('    if (record->event.pressed) navi_last_pressed = keycode;');
  if (opts.replay) out.push('    navi_watch_presses(keycode, record);');
  out.push('    return true;', '}', '');
  return out;
}

/** A 5-bit QMK mods value (MT, LM) as the 8-bit mask register_mods() takes. */
export const modMask = (mods: number) => `0x${(mods & 0x10 ? (mods & 0x0f) << 4 : mods & 0x0f).toString(16).toUpperCase().padStart(2, '0')}`;

export interface StandIn {
  /** C name of the stand-in keycode (NAVI_TH_n). */
  name: string;
  tap: string;
  hold: { type: 'mods'; mask: string } | { type: 'layer'; mask: string | null } | { type: 'key'; key: string };
}

/**
 * navi_is_stand_in() for the user's own C: code that reads the base key of an MT / LT (a key log, a library that
 * strips mod-taps to their tap key) asks it instead of guessing NAVI's codes, which can be real keys.
 */
export function standInCheckCode(names: string[]): string[] {
  const out = [
    '// Is this keycode a stand-in of a tap-hold key with actions (NAVI_TH_n)? Its base key is not what it taps: NAVI plays',
    '// the real tap as a key event of its own. For your own code that reads the base key of MT / LT keycodes.',
    'bool navi_is_stand_in(uint16_t keycode) {',
  ];
  if (!names.length) out.push('    (void)keycode;', '    return false;');
  else out.push('    switch (keycode) {', ...names.map((n) => `        case ${n}:`), '            return true;', '        default:', '            return false;', '    }');
  out.push('}', '');
  return out;
}

/**
 * The tap-hold code in process_record: the replay fix and the stand-ins' slots. QMK decides tap or hold on the
 * stand-in MT / LT as usual; the tap (and a key hold) is played as its own record (navi_send), the stand-in base key
 * is never sent. Needs record->keycode to be honored: REPEAT_KEY_ENABLE (rules.mk).
 */
/**
 * navi_send(): plays a keycode on the key position of a record as a key event of its own, like a key of the keymap
 * (stand-in slots, tap dances). taps > 0: as a tap (MT / LT / OSM do their tap side). Needs record->keycode
 * (REPEAT_KEY_ENABLE). flag: navi_sending, read by navi_tap_holds (the replay fix leaves played keys alone).
 * guard: only under #ifndef NO_ACTION_TAPPING (when only tap-hold keys use it).
 */
export function naviSendCode(o: { flag: boolean; guard: boolean }): string[] {
  const out: string[] = [];
  if (o.guard) out.push('#ifndef NO_ACTION_TAPPING');
  if (o.flag) out.push('static bool navi_sending = false; // navi_send is playing a key', '');
  out.push(
    '// Plays a keycode on the key position of the record, like a key of the keymap (taps > 0: as a tap).',
    'static void navi_send(uint16_t keycode, keyrecord_t *record, bool pressed, uint8_t taps) {',
    '    if (keycode == KC_NO) return;',
    '    keyrecord_t r   = *record;',
    '    r.keycode       = keycode;',
    '    r.event.pressed = pressed;',
    '#ifndef NO_ACTION_TAPPING',
    '    r.tap.count       = taps;',
    '    r.tap.interrupted = false;',
    '#else',
    '    (void)taps;',
    '#endif',
  );
  if (o.flag) out.push('    bool was     = navi_sending;', '    navi_sending = true;', '    process_record(&r);', '    navi_sending = was;');
  else out.push('    process_record(&r);');
  out.push('}');
  if (o.guard) out.push('#endif');
  out.push('');
  return out;
}

export function tapHoldsCode(o: {
  standIns: StandIn[];
  tracked: TapHoldPlan['holdPress'];
  interrupters: boolean;
  layerOff: string;
  /** navi_sending exists (navi_send is emitted with its flag). */
  sending: boolean;
}): string[] {
  const out: string[] = [];
  const replay = o.tracked.length > 0;
  out.push('#ifndef NO_ACTION_TAPPING');
  if (o.standIns.length) out.push('// ── Tap-hold keys with actions: NAVI_TH_n are stand-in MT / LT keycodes, QMK decides tap or hold on them ──', '');
  if (replay) {
    out.push('static matrix_row_t navi_held_tap[MATRIX_ROWS]; // a tap NAVI turned into a hold, until its release', '');
    const needGlobal = o.tracked.some((h) => h.flavor === undefined && h.holdKeys.length > 0);
    if (needGlobal) out.push('#ifdef HOLD_ON_OTHER_KEY_PRESS', '#    define NAVI_HOLD_ON_OTHER_KEY_PRESS true', '#else', '#    define NAVI_HOLD_ON_OTHER_KEY_PRESS false', '#endif', '');
    out.push(
      '// Would get_hold_on_other_key_press have said “hold” at the first key pressed while this one was down?',
      'static bool navi_forces_hold(uint16_t keycode, uint8_t row, uint8_t col) {',
      '#if defined(CHORDAL_HOLD) || defined(FLOW_TAP_TERM)',
      '    return false; // QMK may choose a tap on purpose there',
      '#else',
      '    if (!(navi_interrupted[row] & ((matrix_row_t)1 << col))) return false;',
      '    switch (keycode) {',
    );
    for (const h of o.tracked) {
      if (h.flavor === 'hold-preferred') {
        out.push(`        case ${h.code}: return true;`);
        continue;
      }
      const answer = h.flavor === undefined ? 'NAVI_HOLD_ON_OTHER_KEY_PRESS' : 'false';
      out.push(`        case ${h.code}:`, `            if (${h.holdKeys.map((k) => `navi_interrupter[row][col] == ${k}`).join(' || ')}) return true;`, `            return ${answer};`);
    }
    out.push('        default: return false;', '    }', '#endif', '}', '');
    // The hold side of a tap turned into a hold: stand-ins first, then what QMK does for MT / LT.
    const special = o.standIns.filter((s) => s.hold.type === 'key' || (s.hold.type === 'layer' && s.hold.mask));
    out.push('static void navi_hold(uint16_t keycode, keyrecord_t *record, bool pressed) {');
    if (special.length) {
      out.push('    switch (keycode) {');
      for (const s of special) {
        if (s.hold.type === 'key') out.push(`        case ${s.name}: navi_send(${s.hold.key}, record, pressed, 0); return;`);
        else if (s.hold.type === 'layer') out.push(`        case ${s.name}: if (pressed) register_mods(${s.hold.mask}); else unregister_mods(${s.hold.mask}); break;`);
      }
      out.push('    }');
    }
    out.push(
      '    if (IS_QK_MOD_TAP(keycode)) {',
      '        uint8_t m = QK_MOD_TAP_GET_MODS(keycode);',
      '        m         = m & 0x10 ? (m & 0x0F) << 4 : m;',
      '        if (pressed) register_mods(m); else unregister_mods(m);',
      '    } else if (IS_QK_LAYER_TAP(keycode)) {',
      '        uint8_t layer = QK_LAYER_TAP_GET_LAYER(keycode);',
      `        if (pressed) layer_on(layer); else ${o.layerOff}(layer);`,
      '    }',
      '}',
      '',
    );
  }
  out.push('static bool navi_tap_holds(uint16_t keycode, keyrecord_t *record) {');
  if (replay) {
    out.push(
      '    uint8_t row = record->event.key.row;',
      '    uint8_t col = record->event.key.col;',
      `    if (${o.sending ? '!navi_sending && ' : ''}IS_KEYEVENT(record->event) && row < MATRIX_ROWS && col < MATRIX_COLS) {`, // keys NAVI plays aren't real presses
      '        matrix_row_t bit = (matrix_row_t)1 << col;',
      '        if (record->event.pressed && record->tap.count == 1 && navi_forces_hold(keycode, row, col)) {',
      '            navi_held_tap[row] |= bit; // replay trap: QMK made it a tap',
      '            navi_hold(keycode, record, true);',
      '            return false;',
      '        }',
      '        if (!record->event.pressed && (navi_held_tap[row] & bit)) {',
      '            navi_held_tap[row] &= ~bit;',
      '            navi_hold(keycode, record, false);',
      '            return false;',
      '        }',
      '    }',
    );
  }
  if (o.standIns.length) {
    out.push('    switch (keycode) {');
    for (const s of o.standIns) {
      if (s.hold.type === 'key') {
        out.push(`        case ${s.name}: // tap ${s.tap}, hold ${s.hold.key}`, `            navi_send(record->tap.count ? ${s.tap} : ${s.hold.key}, record, record->event.pressed, 0);`, '            return false;');
        continue;
      }
      out.push(`        case ${s.name}: // tap ${s.tap}`, '            if (record->tap.count) {', `                navi_send(${s.tap}, record, record->event.pressed, 0);`, '                return false;', '            }');
      if (s.hold.type === 'layer' && s.hold.mask) out.push(`            if (record->event.pressed) register_mods(${s.hold.mask}); else unregister_mods(${s.hold.mask});`);
      out.push('            return true; // QMK holds the modifiers / the layer');
    }
    out.push('    }');
  }
  out.push('    return true;', '}', '#else', 'static bool navi_tap_holds(uint16_t keycode, keyrecord_t *record) {', '    return true;', '}', '#endif', '');
  return out;
}

export function quickTapHook(name: string, plan: TapHoldPlan): string[] {
  return [
    `uint16_t ${name}(uint16_t keycode, keyrecord_t *record) {`,
    '    switch (keycode) {',
    ...plan.quick.map((q) => `        case ${q.code}: return ${q.term};`),
    '        default: return QUICK_TAP_TERM;',
    '    }',
    '}',
    '',
  ];
}

const GLOBAL_FLAG = (flag: string) => [`#ifdef ${flag}`, '    return true;', '#else', '    return false;', '#endif'];

export function holdOnOtherKeyPressHook(name: string, plan: TapHoldPlan): string[] {
  const cases = plan.holdPress.flatMap((h): string[] => {
    const answer = h.flavor === undefined ? undefined : h.flavor === 'hold-preferred' ? 'true' : 'false';
    if (!h.holdKeys.length) return answer === undefined ? [] : [`        case ${h.code}: return ${answer};`];
    return [
      `        case ${h.code}:`,
      `            if (${h.holdKeys.map((k) => `navi_last_pressed == ${k}`).join(' || ')}) return true;`,
      answer === undefined ? '            break;' : `            return ${answer};`,
    ];
  });
  return [`bool ${name}(uint16_t keycode, keyrecord_t *record) {`, '    switch (keycode) {', ...cases, '        default: break;', '    }', ...GLOBAL_FLAG('HOLD_ON_OTHER_KEY_PRESS'), '}', ''];
}

export function permissiveHoldHook(name: string, plan: TapHoldPlan): string[] {
  return [
    `bool ${name}(uint16_t keycode, keyrecord_t *record) {`,
    '    switch (keycode) {',
    ...plan.permissive.map((p) => `        case ${p.code}: return ${p.value};`),
    '        default: break;',
    '    }',
    ...GLOBAL_FLAG('PERMISSIVE_HOLD'),
    '}',
    '',
  ];
}

/** Pipeline stubs: QMK's own behavior (the global defines decide). */
export const holdOnOtherKeyPressStub = (name: string) => [`bool ${name}(uint16_t keycode, keyrecord_t *record) {`, ...GLOBAL_FLAG('HOLD_ON_OTHER_KEY_PRESS'), '}'];
export const permissiveHoldStub = (name: string) => [`bool ${name}(uint16_t keycode, keyrecord_t *record) {`, ...GLOBAL_FLAG('PERMISSIVE_HOLD'), '}'];
export const quickTapStub = (name: string) => [`uint16_t ${name}(uint16_t keycode, keyrecord_t *record) {`, '    return QUICK_TAP_TERM;', '}'];
export const preProcessStub = (name: string) => [`bool ${name}(uint16_t keycode, keyrecord_t *record) {`, '    return true;', '}'];
