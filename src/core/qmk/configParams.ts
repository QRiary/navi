/**
 * config.h PARAMETERS — from the official QMK table data/mappings/info_config.hjson
 * (#define name ⇄ keyboard.json key + value type). Only what is safe to change
 * in a keymap: tap/hold behavior, combos, one-shot, leader, Caps Word, mouse, lighting, USB polling.
 */
import mappings from '../qmk-data/config-mappings.json';
import type { Text } from '../features/registry';

type ValueType = 'int' | 'flag' | 'bool' | 'hex' | 'str' | string;

interface MappingEntry {
  info_key: string;
  value_type?: ValueType;
  deprecated?: boolean;
  invalid?: boolean;
  to_c?: boolean;
}

const INFO_CONFIG = (mappings as unknown as { info_config: Record<string, MappingEntry> }).info_config;

export interface ConfigParam {
  define: string;
  infoKey: string;
  type: 'int' | 'flag' | 'bool';
  group: string;
  title: Text;
  hint?: Text;
  /** QMK default value (if known; for the hint). */
  qmkDefault?: number | boolean;
  min?: number;
  max?: number;
}

const GROUPS: Record<string, Text> = {
  tapping: { en: 'Tap / hold', ru: 'Нажатие / удержание' },
  combo: { en: 'Combos', ru: 'Комбо' },
  oneshot: { en: 'One-shot', ru: 'One-shot' },
  leader_key: { en: 'Leader key', ru: 'Клавиша-лидер' },
  caps_word: { en: 'Caps Word', ru: 'Caps Word' },
  mousekey: { en: 'Mouse keys', ru: 'Мышь с клавиатуры' },
  rgb_matrix: { en: 'RGB Matrix', ru: 'RGB Matrix' },
  dynamic_keymap: { en: 'Dynamic keymap (VIA)', ru: 'Динамическая раскладка (VIA)' },
  qmk: { en: 'General', ru: 'Общее' },
  usb: { en: 'USB', ru: 'USB' },
  debounce: { en: 'General', ru: 'Общее' },
};

/** Labels for the most useful parameters (the rest are shown by name). */
const DOCS: Record<string, { title: Text; hint?: Text; qmkDefault?: number | boolean; min?: number; max?: number }> = {
  TAPPING_TERM: { title: { en: 'Tapping term, ms', ru: 'Время tap/hold, мс' }, hint: { en: 'Shorter than this = tap, longer = hold (mod-tap, layer-tap, tap dance).', ru: 'Короче — нажатие, дольше — удержание (mod-tap, layer-tap, tap dance).' }, qmkDefault: 200, min: 50, max: 1000 },
  PERMISSIVE_HOLD: { title: { en: 'Permissive hold', ru: 'Permissive hold' }, hint: { en: 'Another key pressed and released while holding → hold, even before the tapping term.', ru: 'Другая клавиша нажата и отпущена во время удержания → удержание, даже раньше срока.' }, qmkDefault: false },
  HOLD_ON_OTHER_KEY_PRESS: { title: { en: 'Hold on other key press', ru: 'Удержание при нажатии другой клавиши' }, hint: { en: 'Any other key press while holding → hold immediately.', ru: 'Любая другая клавиша во время удержания → сразу удержание.' }, qmkDefault: false },
  CHORDAL_HOLD: { title: { en: 'Chordal hold', ru: 'Chordal hold' }, hint: { en: 'Same-hand chords resolve as taps (good for home row mods).', ru: 'Сочетания одной рукой считаются нажатиями (удобно для модификаторов на домашнем ряду).' }, qmkDefault: false },
  FLOW_TAP_TERM: { title: { en: 'Flow tap term, ms', ru: 'Flow tap, мс' }, hint: { en: 'While typing fast, tap-hold keys act as taps.', ru: 'При быстром наборе tap-hold клавиши работают как нажатия.' }, min: 0, max: 1000 },
  RETRO_TAPPING: { title: { en: 'Retro tapping', ru: 'Retro tapping' }, hint: { en: 'Held and released alone → still sends the tap key.', ru: 'Удержали и отпустили без других клавиш → всё равно отправит нажатие.' }, qmkDefault: false },
  TAPPING_TOGGLE: { title: { en: 'TT() taps to toggle', ru: 'TT(): нажатий для фиксации' }, qmkDefault: 5, min: 1, max: 20 },
  // *_PER_KEY: QMK asks a function in keymap.c. Its built-in fallback returns false for permissive hold,
  // hold on other key press and retro tapping, so without your own function they are off for every key.
  TAPPING_TERM_PER_KEY: { title: { en: 'Tapping term per key', ru: 'Время tap/hold для каждой клавиши' }, hint: { en: 'Your own get_tapping_term() in keymap.c sets the time per key; without it every key uses the tapping term. Turned on by itself for tap dances with their own time.', ru: 'Своя функция get_tapping_term() в keymap.c задаёт время для каждой клавиши; без неё у всех клавиш общее время. Для tap dance со своим временем включается сама.' } },
  PERMISSIVE_HOLD_PER_KEY: { title: { en: 'Permissive hold per key', ru: 'Permissive hold для отдельных клавиш' }, hint: { en: 'Needs your own get_permissive_hold() in keymap.c. Without it permissive hold is off for every key.', ru: 'Нужна своя функция get_permissive_hold() в keymap.c. Без неё permissive hold выключен для всех клавиш.' } },
  HOLD_ON_OTHER_KEY_PRESS_PER_KEY: { title: { en: 'Hold on other key press per key', ru: 'Удержание при нажатии другой клавиши — для отдельных клавиш' }, hint: { en: 'Needs your own get_hold_on_other_key_press() in keymap.c. Without it this is off for every key.', ru: 'Нужна своя функция get_hold_on_other_key_press() в keymap.c. Без неё это выключено для всех клавиш.' } },
  RETRO_TAPPING_PER_KEY: { title: { en: 'Retro tapping per key', ru: 'Retro tapping для отдельных клавиш' }, hint: { en: 'Needs your own get_retro_tapping() in keymap.c. Without it retro tapping is off for every key.', ru: 'Нужна своя функция get_retro_tapping() в keymap.c. Без неё retro tapping выключен для всех клавиш.' } },
  SPECULATIVE_HOLD: { title: { en: 'Speculative hold', ru: 'Speculative hold' }, hint: { en: 'Mod-tap presses Shift/Ctrl at once, before tap or hold is decided (Shift+click without lag). If it was a tap, the modifier is taken back.', ru: 'Mod-tap сразу зажимает Shift/Ctrl, ещё до решения «нажатие или удержание» (Shift+клик без задержки). Если это было нажатие, модификатор снимается.' }, qmkDefault: false },
  SPECULATIVE_HOLD_ONE_KEY: { title: { en: 'Speculative hold: one key at a time', ru: 'Speculative hold: только одна клавиша' }, hint: { en: 'Not applied while other modifiers are already held.', ru: 'Не срабатывает, если другие модификаторы уже зажаты.' } },
  SPECULATIVE_HOLD_FLOW_TERM: { title: { en: 'Speculative hold: off while typing fast, ms', ru: 'Speculative hold: не при быстром наборе, мс' }, hint: { en: 'Not applied if the key comes within this time after the previous key.', ru: 'Не срабатывает, если клавиша нажата быстрее этого времени после предыдущей.' }, min: 0, max: 1000 },
  COMBO_TERM: { title: { en: 'Combo term, ms', ru: 'Окно комбо, мс' }, hint: { en: 'All combo keys must be pressed within this time.', ru: 'Все клавиши комбо нужно нажать за это время.' }, qmkDefault: 50, min: 10, max: 500 },
  ONESHOT_TIMEOUT: { title: { en: 'One-shot timeout, ms', ru: 'Время one-shot, мс' }, qmkDefault: 5000, min: 0, max: 60000 },
  ONESHOT_TAP_TOGGLE: { title: { en: 'One-shot taps to lock', ru: 'One-shot: нажатий для фиксации' }, min: 0, max: 10 },
  LEADER_TIMEOUT: { title: { en: 'Leader timeout, ms', ru: 'Время лидера, мс' }, qmkDefault: 300, min: 50, max: 5000 },
  LEADER_PER_KEY_TIMING: { title: { en: 'Leader timeout restarts on each key', ru: 'Время лидера заново после каждой клавиши' }, hint: { en: 'Every key of the sequence gives you the full leader timeout again.', ru: 'Каждая клавиша последовательности снова даёт полное время лидера.' }, qmkDefault: false },
  LEADER_KEY_STRICT_KEY_PROCESSING: { title: { en: 'Leader: whole mod-tap / layer-tap keys', ru: 'Лидер: mod-tap и layer-tap целиком' }, hint: { en: 'The sequence records the whole MT()/LT() key, not only its tap key (KC_A).', ru: 'В последовательность попадает вся клавиша MT()/LT(), а не только её нажатие (KC_A).' }, qmkDefault: false },
  CAPS_WORD_IDLE_TIMEOUT: { title: { en: 'Caps Word idle timeout, ms', ru: 'Caps Word: отключение через, мс' }, qmkDefault: 5000, min: 0, max: 60000 },
  BOTH_SHIFTS_TURNS_ON_CAPS_WORD: { title: { en: 'Both Shifts turn on Caps Word', ru: 'Два Shift включают Caps Word' } },
  DOUBLE_TAP_SHIFT_TURNS_ON_CAPS_WORD: { title: { en: 'Double-tap Shift turns on Caps Word', ru: 'Двойное нажатие Shift включает Caps Word' } },
  CAPS_WORD_INVERT_ON_SHIFT: { title: { en: 'Shift inverts case in Caps Word', ru: 'Shift в Caps Word меняет регистр' }, hint: { en: 'Shift no longer ends Caps Word, it types lower case instead: PDF + Shift+S → PDFs.', ru: 'Shift больше не выключает Caps Word, а печатает строчные: PDF + Shift+S → PDFs.' }, qmkDefault: false },
  MOUSEKEY_DELAY: { title: { en: 'Mouse: delay before moving, ms', ru: 'Мышь: задержка перед движением, мс' }, min: 0, max: 1000 },
  MOUSEKEY_INTERVAL: { title: { en: 'Mouse: step interval, ms', ru: 'Мышь: интервал шагов, мс' }, min: 1, max: 100 },
  MOUSEKEY_MAX_SPEED: { title: { en: 'Mouse: max speed', ru: 'Мышь: максимальная скорость' }, min: 1, max: 100 },
  MOUSEKEY_TIME_TO_MAX: { title: { en: 'Mouse: steps to max speed', ru: 'Мышь: шагов до максимума' }, min: 0, max: 255 },
  MOUSEKEY_WHEEL_DELAY: { title: { en: 'Mouse wheel: delay, ms', ru: 'Колесо: задержка, мс' }, min: 0, max: 1000 },
  RGB_MATRIX_TIMEOUT: { title: { en: 'Lighting off after idle, ms (0 = never)', ru: 'Подсветка гаснет без нажатий через, мс (0 — никогда)' }, min: 0, max: 3600000 },
  RGB_MATRIX_SLEEP: { title: { en: 'Lighting off when the PC sleeps', ru: 'Гасить подсветку, когда компьютер спит' } },
  RGB_MATRIX_MAXIMUM_BRIGHTNESS: { title: { en: 'Max LED brightness (0–255)', ru: 'Максимальная яркость (0–255)' }, hint: { en: 'Limits current draw — do not raise above the keyboard maker’s value.', ru: 'Ограничивает ток — не поднимайте выше значения производителя.' }, min: 0, max: 255 },
  DYNAMIC_KEYMAP_LAYER_COUNT: { title: { en: 'Layers in the keyboard memory (VIA)', ru: 'Слоёв в памяти клавиатуры (VIA)' }, qmkDefault: 4, min: 1, max: 32 },
  DEBOUNCE: { title: { en: 'Debounce, ms', ru: 'Антидребезг, мс' }, qmkDefault: 5, min: 0, max: 50 },
  TAP_CODE_DELAY: { title: { en: 'Delay inside taps, ms', ru: 'Задержка внутри нажатия, мс' }, min: 0, max: 500 },
  TAP_HOLD_CAPS_DELAY: { title: { en: 'Caps Lock tap length, ms', ru: 'Длительность нажатия Caps Lock, мс' }, hint: { en: 'How long Caps Lock is held when LT()/MT() keys or macros send it. macOS ignores short Caps Lock taps — use 200 or more there.', ru: 'Сколько держится Caps Lock, когда его отправляют клавиши LT()/MT() или макросы. macOS не замечает короткие нажатия — там ставьте 200 и больше.' }, qmkDefault: 80, min: 0, max: 1000 },
  LOCKING_SUPPORT_ENABLE: { title: { en: 'Locking switch support', ru: 'Переключатели с фиксацией' }, hint: { en: 'For mechanical locking Caps/Num/Scroll Lock switches (KC_LCAP, KC_LNUM, KC_LSCR).', ru: 'Для механических переключателей Caps/Num/Scroll Lock с фиксацией (KC_LCAP, KC_LNUM, KC_LSCR).' } },
  LOCKING_RESYNC_ENABLE: { title: { en: 'Locking switches follow the Lock LEDs', ru: 'Переключатели с фиксацией сверяются с индикаторами' }, hint: { en: 'Keeps a locking switch in step with the Caps/Num/Scroll Lock state of the computer.', ru: 'Согласует положение переключателя с состоянием Caps/Num/Scroll Lock на компьютере.' } },
  USB_POLLING_INTERVAL_MS: { title: { en: 'USB polling interval, ms', ru: 'Интервал опроса USB, мс' }, qmkDefault: 1, min: 1, max: 10 },
  USB_MAX_POWER_CONSUMPTION: { title: { en: 'Max USB current, mA', ru: 'Максимальный ток USB, мА' }, hint: { en: 'The current the keyboard asks the computer for. USB 2.0 gives up to 500 mA.', ru: 'Ток, который клавиатура просит у компьютера. USB 2.0 даёт до 500 мА.' }, qmkDefault: 500, min: 0, max: 500 },
  USB_SUSPEND_WAKEUP_DELAY: { title: { en: 'Pause after waking the computer, ms', ru: 'Пауза после пробуждения компьютера, мс' }, hint: { en: 'Set 200 or more if the keyboard wakes up badly after the computer sleeps.', ru: 'Поставьте 200 и больше, если клавиатура плохо просыпается после сна компьютера.' }, qmkDefault: 0, min: 0, max: 5000 },
};

const ALLOWED_GROUPS = new Set(Object.keys(GROUPS));
const SKIP = new Set(['DYNAMIC_KEYMAP_EEPROM_MAX_ADDR', 'SECURE_UNLOCK_SEQUENCE']);

/** Parameters shown in Advanced → QMK settings. */
export function configParams(): ConfigParam[] {
  const out: ConfigParam[] = [];
  for (const [define, entry] of Object.entries(INFO_CONFIG)) {
    if (entry.deprecated || entry.invalid || SKIP.has(define)) continue;
    const group = entry.info_key.split('.')[0];
    if (!ALLOWED_GROUPS.has(group)) continue;
    if (group === 'rgb_matrix' && !(define in DOCS)) continue;
    const vt = entry.value_type ?? 'str';
    if (vt !== 'int' && vt !== 'flag' && vt !== 'bool') continue;
    const doc = DOCS[define];
    out.push({
      define,
      infoKey: entry.info_key,
      type: vt,
      group,
      title: doc?.title ?? { en: define, ru: define },
      hint: doc?.hint,
      qmkDefault: doc?.qmkDefault,
      min: doc?.min,
      max: doc?.max,
    });
  }
  return out.sort((a, b) => a.group.localeCompare(b.group) || (a.define in DOCS ? 0 : 1) - (b.define in DOCS ? 0 : 1) || a.define.localeCompare(b.define));
}

/** #define value type from the official QMK table (for all parameters, not only the shown ones). */
export function configValueType(define: string): 'int' | 'flag' | 'bool' | undefined {
  const vt = INFO_CONFIG[define]?.value_type;
  return vt === 'int' || vt === 'flag' || vt === 'bool' ? vt : undefined;
}

export function groupTitle(group: string): Text {
  return GROUPS[group] ?? { en: group, ru: group };
}
