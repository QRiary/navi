/**
 * OWN QMK TARGET: keyboard.json (+ config.h) for a keyboard that is not in qmk_firmware.
 * Built from the project: hardware profile (controller, bootloader, USB ID, split), board pins
 * (hardware.pins) and geometry (the LAYOUT macro with matrix positions).
 * Format — per the QMK schema data/schemas/keyboard.jsonschema.
 *
 * RGB Matrix lighting is not included: it needs the LED order on the board, which the project does not know.
 */
import type { Text } from '../features/registry';
import { FEATURE_BY_ID } from '../features/registry';
import type { Geometry, PinDefinition, Project } from '../project/types';
import type { KeyboardSourceInfo } from './sources';

export interface TargetIssue {
  level: 'error' | 'warning';
  message: Text;
}

/** Pin name format by controller family (as QMK writes it). */
export function pinPattern(processor: string | null): { re: RegExp; example: string } | null {
  const p = (processor ?? '').toLowerCase();
  if (/^rp2040$|^rp2350/.test(p)) return { re: /^GP([0-9]|[12][0-9])$/, example: 'GP0 … GP29' };
  if (/^at(mega|90usb)/.test(p)) return { re: /^[A-F][0-7]$/, example: 'B0 … F7' };
  if (/^(stm32|wb32|gd32|at32|apm32)/.test(p)) return { re: /^[A-K](1[0-5]|[0-9])$/, example: 'A0 … B15' };
  return null;
}

export function checkPins(project: Project): TargetIssue[] {
  const issues: TargetIssue[] = [];
  const pins = project.hardware.pins;
  const hw = project.hardware;
  if (!pins) return [{ level: 'error', message: { en: 'Board pins are not described (Hardware → pins).', ru: 'Выводы платы не описаны (Железо → выводы).' } }];
  if (!pins.target || !/^[a-z0-9_][a-z0-9_/]*$/.test(pins.target)) issues.push({ level: 'error', message: { en: 'Target folder: lowercase letters, digits, _ and /, e.g. navi/dilemma_4x6.', ru: 'Папка target: строчные буквы, цифры, _ и /, например navi/dilemma_4x6.' } });
  if (!hw.processor) issues.push({ level: 'error', message: { en: 'Microcontroller is unknown.', ru: 'Неизвестен микроконтроллер.' } });
  if (!hw.bootloader) issues.push({ level: 'error', message: { en: 'Bootloader is unknown.', ru: 'Неизвестен загрузчик.' } });
  if (hw.usb.vid === null || hw.usb.pid === null) issues.push({ level: 'error', message: { en: 'USB VID/PID are unknown.', ru: 'Неизвестны USB VID/PID.' } });
  const halves = hw.split.enabled ? 2 : 1;
  const rowsPerHalf = hw.matrix.rows / halves;
  if (!Number.isInteger(rowsPerHalf)) issues.push({ level: 'error', message: { en: 'A split keyboard needs an even number of matrix rows.', ru: 'У сплита число строк матрицы должно быть чётным.' } });
  if (pins.rows.length !== rowsPerHalf) issues.push({ level: 'error', message: { en: `Row pins: ${pins.rows.length}, needed ${rowsPerHalf}.`, ru: `Пинов строк: ${pins.rows.length}, нужно ${rowsPerHalf}.` } });
  if (pins.cols.length !== hw.matrix.cols) issues.push({ level: 'error', message: { en: `Column pins: ${pins.cols.length}, needed ${hw.matrix.cols}.`, ru: `Пинов столбцов: ${pins.cols.length}, нужно ${hw.matrix.cols}.` } });
  if (pins.rightRows && pins.rightRows.length !== rowsPerHalf) issues.push({ level: 'error', message: { en: 'Right half: wrong number of row pins.', ru: 'Правая половина: неверное число пинов строк.' } });
  if (pins.rightCols && pins.rightCols.length !== hw.matrix.cols) issues.push({ level: 'error', message: { en: 'Right half: wrong number of column pins.', ru: 'Правая половина: неверное число пинов столбцов.' } });
  const pat = pinPattern(hw.processor);
  const all = [...pins.rows, ...pins.cols, pins.serialPin, pins.handedness.kind === 'pin' ? pins.handedness.pin : undefined, ...pins.encoders.flatMap((e) => [e.a, e.b])].filter((x): x is string => !!x);
  if (pat) {
    const bad = [...new Set([...all, ...(pins.rightRows ?? []), ...(pins.rightCols ?? []), ...(pins.rightEncoders ?? []).flatMap((e) => [e.a, e.b])])].filter((p) => !pat.re.test(p));
    if (bad.length) issues.push({ level: 'error', message: { en: `Pins not valid for ${hw.processor} (${pat.example}): ${bad.join(', ')}`, ru: `Пины не подходят для ${hw.processor} (${pat.example}): ${bad.join(', ')}` } });
  } else {
    issues.push({ level: 'warning', message: { en: 'Unknown microcontroller family — pin names are not checked.', ru: 'Неизвестное семейство контроллера — имена пинов не проверяются.' } });
  }
  const dup = all.filter((p, i) => all.indexOf(p) !== i);
  if (dup.length) issues.push({ level: 'error', message: { en: `The same pin is used twice: ${[...new Set(dup)].join(', ')}`, ru: `Один пин использован дважды: ${[...new Set(dup)].join(', ')}` } });
  if (hw.split.enabled && !pins.serialPin) issues.push({ level: 'error', message: { en: 'Split: the pin that links the halves (serial) is not set.', ru: 'Сплит: не указан пин связи половин (serial).' } });
  if (pins.handedness.kind === 'pin' && !pins.handedness.pin) issues.push({ level: 'error', message: { en: 'Handedness pin is not set.', ru: 'Не указан пин определения стороны.' } });
  if (pins.encoders.some((e) => !e.a || !e.b)) issues.push({ level: 'error', message: { en: 'Each encoder needs two pins (A and B).', ru: 'У каждого энкодера два пина (A и B).' } });
  if (pins.source) issues.push({ level: 'warning', message: { en: `Pins: ${pins.source}`, ru: `Пины: ${pins.source}` } });
  return issues;
}

function layoutFromGeometry(geometry: Geometry) {
  const keys = geometry.keys.filter((k) => k.matrix);
  const minX = Math.min(0, ...keys.map((k) => Math.min(k.x, k.rx)));
  const minY = Math.min(0, ...keys.map((k) => Math.min(k.y, k.ry)));
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  return keys.map((k) => {
    const item: Record<string, unknown> = { matrix: k.matrix, x: r3(k.x - minX), y: r3(k.y - minY) };
    if (k.w !== 1) item.w = r3(k.w);
    if (k.h !== 1) item.h = r3(k.h);
    if (k.r) {
      item.r = r3(k.r);
      item.rx = r3(k.rx - minX);
      item.ry = r3(k.ry - minY);
    }
    if (k.label) item.label = k.label;
    return item;
  });
}

export function generateKeyboardTarget(project: Project, geometry: Geometry): { files: { name: 'keyboard.json' | 'config.h' | 'readme.md'; text: string }[]; issues: TargetIssue[] } {
  const issues = checkPins(project);
  const hw = project.hardware;
  const pins = hw.pins;
  if (!pins) return { files: [], issues };
  const hex = (n: number | null) => `0x${(n ?? 0).toString(16).toUpperCase().padStart(4, '0')}`;
  const features: Record<string, boolean> = { bootmagic: true, extrakey: true, mousekey: true, nkro: true };
  for (const [f, on] of Object.entries(project.firmware.buildFeatures)) {
    const key = FEATURE_BY_ID.get(f as never)?.jsonFeature;
    if (key && key !== 'via') features[key] = !!on;
  }
  if (pins.encoders.length) features.encoder = true;
  const json: Record<string, unknown> = {
    manufacturer: hw.manufacturer || 'NAVI',
    keyboard_name: hw.name,
    maintainer: 'navi',
    processor: hw.processor,
    bootloader: hw.bootloader,
    usb: { vid: hex(hw.usb.vid), pid: hex(hw.usb.pid), device_version: '1.0.0' },
    diode_direction: pins.diodeDirection,
    matrix_pins: { rows: pins.rows, cols: pins.cols },
    features,
    layouts: { LAYOUT: { layout: layoutFromGeometry(geometry) } },
  };
  if (pins.board) json.board = pins.board;
  if (pins.encoders.length) json.encoder = { rotary: pins.encoders.map((e) => ({ pin_a: e.a, pin_b: e.b })) };
  if (hw.split.enabled) {
    const split: Record<string, unknown> = { enabled: true, serial: { pin: pins.serialPin } };
    if (pins.rightRows || pins.rightCols) split.matrix_pins = { right: { rows: pins.rightRows ?? pins.rows, cols: pins.rightCols ?? pins.cols } };
    if (pins.handedness.kind === 'pin') split.handedness = { pin: pins.handedness.pin };
    if (pins.rightEncoders) split.encoder = { right: { rotary: pins.rightEncoders.map((e) => ({ pin_a: e.a, pin_b: e.b })) } };
    split.transport = { sync: { matrix_state: true } };
    json.split = split;
  }
  const cfg = ['// Generated by NAVI.', '#pragma once', ''];
  if (pins.handedness.kind === 'pin' && pins.handedness.lowIsLeft) cfg.push('#define SPLIT_HAND_PIN_LOW_IS_LEFT');
  if (pins.handedness.kind === 'eeprom') cfg.push('#define EE_HANDS');
  if (hw.lighting.kind === 'rgb_matrix' || hw.lighting.kind === 'rgblight') {
    issues.push({
      level: 'warning',
      message: {
        en: 'Lighting is not included: QMK needs the LED order and positions on the board (rgb_matrix.layout), which the project does not know.',
        ru: 'Подсветка не включена: QMK нужен порядок и места светодиодов на плате (rgb_matrix.layout), которых проект не знает.',
      },
    });
  }
  const readme = [
    `# ${hw.name}`,
    '',
    'Generated by NAVI from the project description.',
    '',
    `* Matrix: ${hw.matrix.rows}×${hw.matrix.cols}${hw.split.enabled ? ' (split)' : ''}`,
    `* Controller: ${hw.processor ?? '?'}, bootloader: ${hw.bootloader ?? '?'}`,
    pins.source ? `* Pins: ${pins.source}` : '* Pins: described by the user',
    '',
    `Build: \`qmk compile -kb ${pins.target} -km ${project.firmware.keymap}\``,
    '',
  ].join('\n');
  return {
    files: [
      { name: 'keyboard.json', text: `${JSON.stringify(json, null, 4)}\n` },
      { name: 'config.h', text: `${cfg.join('\n')}\n` },
      { name: 'readme.md', text: readme },
    ],
    issues,
  };
}

/** Pins from the sources of an existing target (to start from; for a clone it is a guess). */
export function pinsFromSources(keyboard: string, info: KeyboardSourceInfo, target: string): PinDefinition | null {
  const mp = info.info.matrix_pins as Record<string, unknown> | undefined;
  if (!mp || !Array.isArray(mp.rows) || !Array.isArray(mp.cols)) return null;
  const split = (info.info.split ?? {}) as Record<string, unknown>;
  const serial = (split.serial ?? {}) as Record<string, unknown>;
  const enc = (info.info.encoder ?? {}) as Record<string, unknown>;
  const handPin = typeof info.config.SPLIT_HAND_PIN === 'string' ? info.config.SPLIT_HAND_PIN : (split.handedness as Record<string, unknown> | undefined)?.pin;
  const right = ((split.matrix_pins as Record<string, unknown> | undefined)?.right ?? null) as Record<string, unknown> | null;
  return {
    target,
    board: typeof info.info.board === 'string' ? info.info.board : undefined,
    diodeDirection: info.info.diode_direction === 'ROW2COL' ? 'ROW2COL' : 'COL2ROW',
    rows: (mp.rows as unknown[]).map(String),
    cols: (mp.cols as unknown[]).map(String),
    rightRows: right && Array.isArray(right.rows) ? right.rows.map(String) : undefined,
    rightCols: right && Array.isArray(right.cols) ? right.cols.map(String) : undefined,
    serialPin: typeof serial.pin === 'string' ? serial.pin : undefined,
    handedness: typeof handPin === 'string' ? { kind: 'pin', pin: handPin, lowIsLeft: 'SPLIT_HAND_PIN_LOW_IS_LEFT' in info.config } : info.config.EE_HANDS ? { kind: 'eeprom' } : { kind: 'master-left' },
    encoders: Array.isArray(enc.rotary) ? (enc.rotary as Record<string, unknown>[]).map((e) => ({ a: String(e.pin_a ?? ''), b: String(e.pin_b ?? '') })) : [],
    source: `copied from ${keyboard}`,
  };
}
