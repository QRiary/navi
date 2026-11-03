/**
 * QMK FIRMWARE FEATURE REGISTRY.
 *
 * Each feature is a build flag (rules.mk: MOUSEKEY_ENABLE = yes, or keyboard.json: "features": {"mousekey": true})
 * and sometimes hardware (LEDs, encoders, trackpad). Defaults are as in QMK
 * (builddefs/common_features.mk and data/mappings/info_defaults.hjson): almost everything is off,
 * except what QMK turns on itself (magic, space cadet, grave esc, one-shot).
 *
 * Here also lives the rule the app uses to decide whether a feature works (featureStatus).
 */

export interface Text {
  en: string;
  ru: string;
}

/** rgb-leds — addressable RGB LEDs (WS2812 etc.), mono-leds — single-color ones (PWM/LED Matrix driver). */
export type HardwareNeed = 'rgb-leds' | 'mono-leds' | 'encoders' | 'pointing' | 'audio' | 'haptic' | 'oled' | 'bluetooth' | 'split' | 'joystick';

export type FeatureId =
  | 'via'
  | 'dynamic_macro_via'
  | 'mousekey'
  | 'extrakey'
  | 'nkro'
  | 'bootmagic'
  | 'tap_dance'
  | 'combo'
  | 'leader'
  | 'caps_word'
  | 'auto_shift'
  | 'key_override'
  | 'unicode'
  | 'unicodemap'
  | 'ucis'
  | 'swap_hands'
  | 'magic'
  | 'rgb_matrix'
  | 'rgblight'
  | 'led_matrix'
  | 'backlight'
  | 'encoder'
  | 'encoder_map'
  | 'pointing_device'
  | 'dynamic_macro'
  | 'midi'
  | 'sequencer'
  | 'joystick'
  | 'programmable_button'
  | 'audio'
  | 'steno'
  | 'haptic'
  | 'key_lock'
  | 'secure'
  | 'dynamic_tapping_term'
  | 'autocorrect'
  | 'tri_layer'
  | 'repeat_key'
  | 'layer_lock'
  | 'grave_esc'
  | 'space_cadet'
  | 'velocikey'
  | 'bluetooth'
  | 'oneshot'
  | 'oled'
  | 'console';

export interface FeatureInfo {
  id: FeatureId;
  /** rules.mk variable (if any). */
  rules?: string;
  /** Key in keyboard.json "features" (if any). */
  jsonFeature?: string;
  /** QMK turns it on itself unless explicitly off. */
  defaultOn: boolean;
  hardware?: HardwareNeed;
  /** QMK docs page (docs.qmk.fm/<docs>). */
  docs?: string;
  title: Text;
  description: Text;
  /** Whether the settings of this feature can be changed “live” over VIA, without rebuilding. */
  liveViaVia?: boolean;
}

const F = (info: FeatureInfo) => info;

export const FEATURES: FeatureInfo[] = [
  F({ id: 'via', rules: 'VIA_ENABLE', jsonFeature: 'via', defaultOn: false, docs: 'features/dynamic_keymap', title: { en: 'VIA (dynamic keymap)', ru: 'VIA (раскладка без перепрошивки)' }, description: { en: 'Keymap, encoders, macros and lighting can be changed over USB without flashing.', ru: 'Раскладку, энкодеры, макросы и подсветку можно менять по USB без перепрошивки.' } }),
  F({ id: 'dynamic_macro_via', defaultOn: false, title: { en: 'VIA macros', ru: 'Макросы VIA' }, description: { en: 'Macros stored in the keyboard memory (MC_0 … MC_n), editable over USB.', ru: 'Макросы в памяти клавиатуры (MC_0 … MC_n), меняются по USB.' }, liveViaVia: true }),
  F({ id: 'mousekey', rules: 'MOUSEKEY_ENABLE', jsonFeature: 'mousekey', defaultOn: false, docs: 'features/mouse_keys', title: { en: 'Mouse keys', ru: 'Мышь с клавиатуры' }, description: { en: 'Cursor movement, mouse buttons and wheel from keys (MS_*).', ru: 'Курсор, кнопки и колесо мыши с клавиш (MS_*).' } }),
  F({ id: 'extrakey', rules: 'EXTRAKEY_ENABLE', jsonFeature: 'extrakey', defaultOn: false, docs: 'keycodes_basic', title: { en: 'Media & system keys', ru: 'Мультимедиа и системные клавиши' }, description: { en: 'Volume, playback, brightness, power/sleep (consumer and system control).', ru: 'Громкость, воспроизведение, яркость, питание/сон.' } }),
  F({ id: 'nkro', rules: 'NKRO_ENABLE', jsonFeature: 'nkro', defaultOn: false, docs: 'reference_glossary#n-key-rollover-nkro', title: { en: 'N-key rollover', ru: 'NKRO (много клавиш одновременно)' }, description: { en: 'Any number of simultaneous keys over USB.', ru: 'Любое число одновременно нажатых клавиш.' } }),
  F({ id: 'bootmagic', rules: 'BOOTMAGIC_ENABLE', jsonFeature: 'bootmagic', defaultOn: false, docs: 'features/bootmagic', title: { en: 'Bootmagic', ru: 'Bootmagic (вход в загрузчик)' }, description: { en: 'Hold a key while plugging in to enter the bootloader.', ru: 'Держите клавишу при подключении — клавиатура уйдёт в загрузчик.' } }),
  F({ id: 'tap_dance', rules: 'TAP_DANCE_ENABLE', jsonFeature: 'tap_dance', defaultOn: false, docs: 'features/tap_dance', title: { en: 'Tap Dance', ru: 'Tap Dance' }, description: { en: 'Different actions for single, double, … taps and holds (TD()). Defined in firmware source.', ru: 'Разные действия на одно, два… нажатия и удержание (TD()). Задаётся в исходниках прошивки.' } }),
  F({ id: 'combo', rules: 'COMBO_ENABLE', jsonFeature: 'combo', defaultOn: false, docs: 'features/combo', title: { en: 'Combos', ru: 'Комбо (аккорды)' }, description: { en: 'Pressing several keys together sends another key. Defined in firmware source.', ru: 'Одновременное нажатие нескольких клавиш даёт другую клавишу. Задаётся в исходниках.' } }),
  F({ id: 'leader', rules: 'LEADER_ENABLE', jsonFeature: 'leader', defaultOn: false, docs: 'features/leader_key', title: { en: 'Leader key', ru: 'Клавиша-лидер' }, description: { en: 'QK_LEAD followed by a sequence runs an action.', ru: 'QK_LEAD и последовательность клавиш запускают действие.' } }),
  F({ id: 'caps_word', rules: 'CAPS_WORD_ENABLE', jsonFeature: 'caps_word', defaultOn: false, docs: 'features/caps_word', title: { en: 'Caps Word', ru: 'Caps Word' }, description: { en: 'Capitalizes one word, then turns itself off (CW_TOGG).', ru: 'Пишет одно слово заглавными и выключается сам (CW_TOGG).' } }),
  F({ id: 'auto_shift', rules: 'AUTO_SHIFT_ENABLE', jsonFeature: 'auto_shift', defaultOn: false, docs: 'features/auto_shift', title: { en: 'Auto Shift', ru: 'Auto Shift' }, description: { en: 'Holding a key a bit longer types its shifted version.', ru: 'Чуть дольше держите клавишу — получится заглавная/верхний символ.' } }),
  F({ id: 'key_override', rules: 'KEY_OVERRIDE_ENABLE', jsonFeature: 'key_override', defaultOn: false, docs: 'features/key_overrides', title: { en: 'Key overrides', ru: 'Подмена сочетаний' }, description: { en: 'Change what a modifier + key sends (e.g. Shift+Bksp = Del).', ru: 'Меняет результат модификатор+клавиша (напр. Shift+Bksp = Del).' } }),
  F({ id: 'unicode', rules: 'UNICODE_ENABLE', jsonFeature: 'unicode', defaultOn: false, docs: 'features/unicode', title: { en: 'Unicode (UC)', ru: 'Юникод (UC)' }, description: { en: 'Type characters by code point, up to U+7FFF.', ru: 'Ввод символов по коду, до U+7FFF.' } }),
  F({ id: 'unicodemap', rules: 'UNICODEMAP_ENABLE', jsonFeature: 'unicodemap', defaultOn: false, docs: 'features/unicode', title: { en: 'Unicode map (UM/UP)', ru: 'Таблица юникода (UM/UP)' }, description: { en: 'Characters from a table in the firmware, any code point.', ru: 'Символы из таблицы в прошивке, любые коды.' } }),
  F({ id: 'ucis', rules: 'UCIS_ENABLE', jsonFeature: 'ucis', defaultOn: false, docs: 'features/unicode', title: { en: 'UCIS', ru: 'UCIS (ввод по имени)' }, description: { en: 'Type a mnemonic to insert a character.', ru: 'Ввод символа по короткому имени.' } }),
  F({ id: 'swap_hands', rules: 'SWAP_HANDS_ENABLE', jsonFeature: 'swap_hands', defaultOn: false, docs: 'features/swap_hands', title: { en: 'Swap hands', ru: 'Зеркало половин' }, description: { en: 'Mirror the keyboard halves (SH_*). Needs a hand swap table.', ru: 'Зеркально меняет половины (SH_*). Нужна таблица соответствия.' } }),
  F({ id: 'magic', rules: 'MAGIC_ENABLE', jsonFeature: 'magic', defaultOn: true, docs: 'keycodes_magic', title: { en: 'Magic keycodes', ru: 'Magic-клавиши' }, description: { en: 'Swap Ctrl/Caps, Alt/GUI, toggle NKRO… (stored in EEPROM).', ru: 'Поменять Ctrl/Caps, Alt/GUI, NKRO… (хранится в памяти).' } }),
  F({ id: 'rgb_matrix', rules: 'RGB_MATRIX_ENABLE', jsonFeature: 'rgb_matrix', defaultOn: false, hardware: 'rgb-leds', docs: 'features/rgb_matrix', title: { en: 'RGB Matrix', ru: 'RGB Matrix (подсветка клавиш)' }, description: { en: 'Per-key RGB lighting with effects.', ru: 'Попиксельная RGB-подсветка с эффектами.' }, liveViaVia: true }),
  F({ id: 'rgblight', rules: 'RGBLIGHT_ENABLE', jsonFeature: 'rgblight', defaultOn: false, hardware: 'rgb-leds', docs: 'features/rgblight', title: { en: 'RGB Lighting (underglow)', ru: 'RGB Lighting (подсветка снизу)' }, description: { en: 'Strip-style RGB lighting.', ru: 'RGB-подсветка «лентой».' }, liveViaVia: true }),
  F({ id: 'led_matrix', rules: 'LED_MATRIX_ENABLE', jsonFeature: 'led_matrix', defaultOn: false, hardware: 'mono-leds', docs: 'features/led_matrix', title: { en: 'LED Matrix', ru: 'LED Matrix (одноцветная)' }, description: { en: 'Per-key single-color lighting.', ru: 'Одноцветная подсветка каждой клавиши.' }, liveViaVia: true }),
  F({ id: 'backlight', rules: 'BACKLIGHT_ENABLE', jsonFeature: 'backlight', defaultOn: false, hardware: 'mono-leds', docs: 'features/backlight', title: { en: 'Backlight', ru: 'Подсветка (backlight)' }, description: { en: 'Single-color backlight with levels.', ru: 'Одноцветная подсветка с уровнями яркости.' }, liveViaVia: true }),
  F({ id: 'encoder', rules: 'ENCODER_ENABLE', jsonFeature: 'encoder', defaultOn: false, hardware: 'encoders', docs: 'features/encoders', title: { en: 'Encoders', ru: 'Энкодеры' }, description: { en: 'Rotary encoder support.', ru: 'Поддержка поворотных энкодеров.' } }),
  F({ id: 'encoder_map', rules: 'ENCODER_MAP_ENABLE', defaultOn: false, hardware: 'encoders', docs: 'features/encoders#encoder-map', title: { en: 'Encoder map', ru: 'Карта энкодеров' }, description: { en: 'Encoder actions per layer as keycodes; editable over VIA.', ru: 'Действия энкодеров по слоям как keycodes; меняются через VIA.' }, liveViaVia: true }),
  F({ id: 'pointing_device', rules: 'POINTING_DEVICE_ENABLE', jsonFeature: 'pointing_device', defaultOn: false, hardware: 'pointing', docs: 'features/pointing_device', title: { en: 'Pointing device', ru: 'Трекпад / трекбол' }, description: { en: 'Trackpad, trackball or other pointing sensor.', ru: 'Трекпад, трекбол или другой датчик.' } }),
  F({ id: 'dynamic_macro', rules: 'DYNAMIC_MACRO_ENABLE', jsonFeature: 'dynamic_macro', defaultOn: false, docs: 'features/dynamic_macros', title: { en: 'Dynamic macro recording', ru: 'Запись макросов на лету' }, description: { en: 'Record and replay key sequences (DM_*), lost on unplug.', ru: 'Запись и повтор нажатий (DM_*), пропадает при отключении.' } }),
  F({ id: 'midi', rules: 'MIDI_ENABLE', jsonFeature: 'midi', defaultOn: false, docs: 'features/midi', title: { en: 'MIDI', ru: 'MIDI' }, description: { en: 'Keyboard acts as a MIDI device.', ru: 'Клавиатура как MIDI-устройство.' } }),
  F({ id: 'sequencer', rules: 'SEQUENCER_ENABLE', jsonFeature: 'sequencer', defaultOn: false, docs: 'features/sequencer', title: { en: 'Sequencer', ru: 'Секвенсор' }, description: { en: 'Step sequencer for MIDI.', ru: 'Пошаговый секвенсор для MIDI.' } }),
  F({ id: 'joystick', rules: 'JOYSTICK_ENABLE', jsonFeature: 'joystick', defaultOn: false, docs: 'features/joystick', title: { en: 'Joystick', ru: 'Джойстик' }, description: { en: 'Game controller buttons and axes.', ru: 'Кнопки и оси игрового контроллера.' } }),
  F({ id: 'programmable_button', rules: 'PROGRAMMABLE_BUTTON_ENABLE', jsonFeature: 'programmable_button', defaultOn: false, docs: 'features/programmable_button', title: { en: 'Programmable buttons', ru: 'Программируемые кнопки' }, description: { en: '32 extra HID buttons (PB_*) for host-side tools.', ru: '32 дополнительные HID-кнопки (PB_*) для программ на компьютере.' } }),
  F({ id: 'audio', rules: 'AUDIO_ENABLE', jsonFeature: 'audio', defaultOn: false, hardware: 'audio', docs: 'features/audio', title: { en: 'Audio', ru: 'Звук' }, description: { en: 'Speaker/buzzer support.', ru: 'Пищалка/динамик.' }, liveViaVia: true }),
  F({ id: 'steno', rules: 'STENO_ENABLE', jsonFeature: 'stenography', defaultOn: false, docs: 'features/stenography', title: { en: 'Stenography', ru: 'Стенография' }, description: { en: 'Plover/steno protocols.', ru: 'Протоколы Plover/стенографии.' } }),
  F({ id: 'haptic', rules: 'HAPTIC_ENABLE', jsonFeature: 'haptic', defaultOn: false, hardware: 'haptic', docs: 'features/haptic_feedback', title: { en: 'Haptic feedback', ru: 'Вибро-отклик' }, description: { en: 'Vibration motor / solenoid.', ru: 'Вибромотор или соленоид.' } }),
  F({ id: 'key_lock', rules: 'KEY_LOCK_ENABLE', jsonFeature: 'key_lock', defaultOn: false, docs: 'features/key_lock', title: { en: 'Key lock', ru: 'Залипание клавиши' }, description: { en: 'QK_LOCK holds the next key down.', ru: 'QK_LOCK удерживает следующую клавишу.' } }),
  F({ id: 'secure', rules: 'SECURE_ENABLE', jsonFeature: 'secure', defaultOn: false, docs: 'features/secure', title: { en: 'Secure', ru: 'Защита (secure)' }, description: { en: 'Unlock sequence for sensitive VIA functions.', ru: 'Последовательность разблокировки для опасных функций VIA.' } }),
  F({ id: 'dynamic_tapping_term', rules: 'DYNAMIC_TAPPING_TERM_ENABLE', jsonFeature: 'dynamic_tapping_term', defaultOn: false, docs: 'tap_hold#dynamic-tapping-term', title: { en: 'Dynamic tapping term', ru: 'Тайминг tap/hold на лету' }, description: { en: 'Adjust tapping term from keys (DT_*).', ru: 'Меняйте время tap/hold клавишами (DT_*).' } }),
  F({ id: 'autocorrect', rules: 'AUTOCORRECT_ENABLE', jsonFeature: 'autocorrect', defaultOn: false, docs: 'features/autocorrect', title: { en: 'Autocorrect', ru: 'Автоисправление' }, description: { en: 'Fixes typos from a dictionary compiled into the firmware.', ru: 'Исправляет опечатки по словарю в прошивке.' } }),
  F({ id: 'tri_layer', rules: 'TRI_LAYER_ENABLE', jsonFeature: 'tri_layer', defaultOn: false, docs: 'features/tri_layer', title: { en: 'Tri layer', ru: 'Третий слой (tri layer)' }, description: { en: 'Lower + Upper = Adjust (TL_LOWR / TL_UPPR).', ru: 'Lower + Upper = Adjust (TL_LOWR / TL_UPPR).' } }),
  F({ id: 'repeat_key', rules: 'REPEAT_KEY_ENABLE', jsonFeature: 'repeat_key', defaultOn: false, docs: 'features/repeat_key', title: { en: 'Repeat key', ru: 'Повтор клавиши' }, description: { en: 'QK_REP repeats the last key.', ru: 'QK_REP повторяет последнюю клавишу.' } }),
  F({ id: 'layer_lock', rules: 'LAYER_LOCK_ENABLE', jsonFeature: 'layer_lock', defaultOn: false, docs: 'features/layer_lock', title: { en: 'Layer lock', ru: 'Фиксация слоя' }, description: { en: 'QK_LLCK keeps the current layer on.', ru: 'QK_LLCK фиксирует текущий слой.' } }),
  F({ id: 'grave_esc', rules: 'GRAVE_ESC_ENABLE', jsonFeature: 'grave_esc', defaultOn: true, docs: 'features/grave_esc', title: { en: 'Grave Escape', ru: 'Esc/` (grave escape)' }, description: { en: 'QK_GESC: Esc, or ` with Shift/GUI.', ru: 'QK_GESC: Esc, а с Shift/GUI — `.' } }),
  F({ id: 'space_cadet', rules: 'SPACE_CADET_ENABLE', jsonFeature: 'space_cadet', defaultOn: true, docs: 'features/space_cadet', title: { en: 'Space Cadet', ru: 'Space Cadet' }, description: { en: 'Shift/Ctrl/Alt that type parentheses when tapped.', ru: 'Shift/Ctrl/Alt, которые при нажатии печатают скобки.' } }),
  F({ id: 'velocikey', rules: 'VELOCIKEY_ENABLE', jsonFeature: 'velocikey', defaultOn: false, docs: 'features/velocikey', title: { en: 'Velocikey', ru: 'Velocikey' }, description: { en: 'Lighting speed follows typing speed.', ru: 'Скорость эффектов подсветки следует за скоростью набора.' } }),
  F({ id: 'bluetooth', rules: 'BLUETOOTH_ENABLE', jsonFeature: 'bluetooth', defaultOn: false, hardware: 'bluetooth', docs: 'features/bluetooth', title: { en: 'Bluetooth / outputs', ru: 'Bluetooth / выходы' }, description: { en: 'Wireless module and output switching (OU_*, BT_*).', ru: 'Беспроводной модуль и переключение выхода (OU_*, BT_*).' } }),
  F({ id: 'oneshot', defaultOn: true, docs: 'one_shot_keys', title: { en: 'One-shot keys', ru: 'Одноразовые клавиши (one-shot)' }, description: { en: 'OSM()/OSL(): the modifier or layer applies to the next key only. On unless NO_ACTION_ONESHOT.', ru: 'OSM()/OSL(): модификатор или слой действует на одну следующую клавишу. Включено, если нет NO_ACTION_ONESHOT.' } }),
  F({ id: 'oled', rules: 'OLED_ENABLE', jsonFeature: 'oled', defaultOn: false, hardware: 'oled', docs: 'features/oled_driver', title: { en: 'OLED display', ru: 'OLED-экран' }, description: { en: 'Small display driven by the firmware.', ru: 'Маленький экран, которым управляет прошивка.' } }),
  F({ id: 'console', rules: 'CONSOLE_ENABLE', jsonFeature: 'console', defaultOn: false, docs: 'faq_debug', title: { en: 'Debug console', ru: 'Отладочная консоль' }, description: { en: 'Debug output over USB (hid_listen / qmk console).', ru: 'Отладочный вывод по USB (hid_listen / qmk console).' } }),
];

export const FEATURE_BY_ID = new Map(FEATURES.map((f) => [f.id, f]));

// ── Feature state ─────────────────────────────────────────────────────

/** What is known about a flag in the firmware: on, off or unknown. */
export type FlagState = 'on' | 'off' | 'unknown';

/** Where it is known from. */
export type Evidence = 'device' | 'source' | 'declared' | 'default' | 'heuristic';

export interface FlagInfo {
  state: FlagState;
  evidence: Evidence;
  /** Explanation of why it was decided so. */
  note?: Text;
}

export type FeatureState = 'available' | 'needs-firmware' | 'unsupported' | 'unknown';

export interface FeatureStatus {
  state: FeatureState;
  reason: Text;
  /** “Works” by indirect signs, not confirmed. */
  likely?: boolean;
}

export interface HardwareFacts {
  rgbLeds: boolean | 'unknown';
  monoLeds: boolean | 'unknown';
  encoders: number | 'unknown';
  pointing: boolean | 'unknown';
  audio: boolean | 'unknown';
  haptic: boolean | 'unknown';
  oled: boolean | 'unknown';
  bluetooth: boolean | 'unknown';
  split: boolean;
}

function hasHardware(hw: HardwareFacts, need: HardwareNeed): boolean | 'unknown' {
  switch (need) {
    case 'rgb-leds':
      return hw.rgbLeds;
    case 'mono-leds':
      return hw.monoLeds;
    case 'encoders':
      return hw.encoders === 'unknown' ? 'unknown' : hw.encoders > 0;
    case 'pointing':
      return hw.pointing;
    case 'audio':
      return hw.audio;
    case 'haptic':
      return hw.haptic;
    case 'oled':
      return hw.oled;
    case 'bluetooth':
      return hw.bluetooth;
    case 'split':
      return hw.split;
    case 'joystick':
      return 'unknown';
  }
}

/**
 * Whether a feature works on the keyboard NOW (with the flashed firmware):
 *  • no hardware → unsupported;
 *  • the flag is on in the flashed firmware → available;
 *  • off → needs-firmware (enable it in the sources, build and flash);
 *  • unknown → unknown (with a hint on how to find out).
 */
export function featureStatus(id: FeatureId, flags: Partial<Record<FeatureId, FlagInfo>>, hw: HardwareFacts): FeatureStatus {
  const info = FEATURE_BY_ID.get(id);
  if (!info) return { state: 'unknown', reason: { en: 'Unknown feature', ru: 'Неизвестная функция' } };
  if (info.hardware) {
    const present = hasHardware(hw, info.hardware);
    if (present === false) {
      return {
        state: 'unsupported',
        reason: { en: 'The keyboard hardware has no such component.', ru: 'В железе клавиатуры этого нет.' },
      };
    }
  }
  const flag = flags[id];
  const state: FlagState = flag?.state ?? (info.defaultOn ? 'on' : 'unknown');
  if (state === 'on') {
    const how: Text =
      flag?.evidence === 'device'
        ? { en: 'Confirmed by the keyboard.', ru: 'Подтверждено клавиатурой.' }
        : flag?.evidence === 'source'
          ? { en: 'Enabled in the firmware source.', ru: 'Включено в исходниках прошивки.' }
          : flag?.evidence === 'heuristic'
            ? { en: 'Probably enabled (indirect signs).', ru: 'Вероятно, включено (по косвенным признакам).' }
            : flag?.evidence === 'declared'
              ? { en: 'Declared in the hardware profile.', ru: 'Указано в профиле железа.' }
              : { en: 'Enabled by default in QMK.', ru: 'В QMK включено по умолчанию.' };
    return { state: 'available', reason: flag?.note ?? how, likely: flag?.evidence === 'heuristic' };
  }
  if (state === 'off') {
    return {
      state: 'needs-firmware',
      reason: flag?.note ?? {
        en: 'Not in the current firmware: enable it in the source, build and flash.',
        ru: 'В текущей прошивке нет: включите в исходниках, соберите и прошейте.',
      },
    };
  }
  return {
    state: 'unknown',
    reason: flag?.note ?? {
      en: 'Not known whether the current firmware has it. Open the firmware source or check on the device.',
      ru: 'Неизвестно, есть ли это в текущей прошивке. Откройте исходники прошивки или проверьте на клавиатуре.',
    },
  };
}
