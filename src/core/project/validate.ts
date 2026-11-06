/**
 * CHECKING A PROJECT from a file (import, loading from disk).
 * The file is untrusted data: every field is read explicitly and checked (type, range, length).
 * Extra fields are dropped and objects are rebuilt — so “__proto__” and other surprises
 * do not get into the model. The result is a project + a list of remarks with the field path.
 */
import { FEATURE_BY_ID, type FeatureId, type FlagInfo } from '../features/registry';
import { listSpecVersions } from '../keycodes/spec';
import { newId } from '../layout/geometry';
import { allowedMakeVar, checkCustom, CUSTOM_FILES, CUSTOM_MAX, MAKE_VALUE_RE, PIPELINE_MAX_HEADERS, safeHeaderName, unsafeDefineValue, validCIdentifier } from '../qmk/customCode';
import { ALIAS_LABEL_MAX, KEY_ALIASES_MAX } from './aliases';
import { migrateProject } from './migrate';
import {
  PROJECT_FORMAT,
  PROJECT_SCHEMA_VERSION,
  type Combo,
  type ControlGeom,
  type CustomAction,
  type CustomKeycode,
  type KeyAlias,
  type LeaderSequence,
  type UnicodeEntry,
  type EncoderGeom,
  type Fact,
  type FirmwareConfig,
  type Geometry,
  type HardwareProfile,
  type KeyGeom,
  type KeyOverride,
  type Keymap,
  type Layer,
  type LightingConfig,
  type LightingState,
  type Macro,
  type MacroStep,
  type MatrixPos,
  type PinDefinition,
  type Project,
  type TapDance,
} from './types';

export interface ValidationIssue {
  level: 'error' | 'warning';
  path: string;
  message: string;
}

export const LIMITS = {
  maxRows: 32,
  maxCols: 32,
  maxLayers: 32,
  maxEncoders: 32,
  maxKeys: 1024,
  maxMacros: 256,
  maxMacroSteps: 2048,
  maxText: 4096,
  maxName: 120,
  maxGeometries: 32,
  maxKeymaps: 64,
  maxTapDances: 256,
  maxCombos: 512,
};

class Reader {
  issues: ValidationIssue[] = [];
  error(path: string, message: string) {
    this.issues.push({ level: 'error', path, message });
  }
  warn(path: string, message: string) {
    this.issues.push({ level: 'warning', path, message });
  }
  obj(v: unknown, path: string): Record<string, unknown> {
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) return v as Record<string, unknown>;
    this.error(path, 'expected an object');
    return {};
  }
  arr(v: unknown, path: string, max: number): unknown[] {
    if (!Array.isArray(v)) {
      if (v !== undefined) this.error(path, 'expected an array');
      return [];
    }
    if (v.length > max) {
      this.error(path, `too many items (${v.length} > ${max})`);
      return v.slice(0, max);
    }
    return v;
  }
  str(v: unknown, path: string, fallback = '', max = LIMITS.maxName): string {
    if (v === undefined || v === null) return fallback;
    if (typeof v !== 'string') {
      this.error(path, 'expected a string');
      return fallback;
    }
    if (v.length > max) {
      this.warn(path, `text truncated to ${max} characters`);
      return v.slice(0, max);
    }
    return v;
  }
  num(v: unknown, path: string, min: number, max: number, fallback: number, integer = true): number {
    if (v === undefined || v === null) return fallback;
    if (typeof v !== 'number' || !Number.isFinite(v) || (integer && !Number.isInteger(v))) {
      this.error(path, `expected ${integer ? 'an integer' : 'a number'}`);
      return fallback;
    }
    if (v < min || v > max) {
      this.error(path, `must be ${min}…${max}, got ${v}`);
      return Math.min(max, Math.max(min, v));
    }
    return v;
  }
  bool(v: unknown, path: string, fallback: boolean): boolean {
    if (v === undefined || v === null) return fallback;
    if (typeof v !== 'boolean') {
      this.error(path, 'expected true/false');
      return fallback;
    }
    return v;
  }
  oneOf<T extends string>(v: unknown, path: string, allowed: readonly T[], fallback: T): T {
    if (v === undefined || v === null) return fallback;
    if (typeof v === 'string' && (allowed as readonly string[]).includes(v)) return v as T;
    this.error(path, `must be one of: ${allowed.join(', ')}`);
    return fallback;
  }
  id(v: unknown, path: string, prefix: string): string {
    if (typeof v === 'string' && /^[\w.-]{1,80}$/.test(v)) return v;
    if (v !== undefined) this.warn(path, 'invalid id — a new one was generated');
    return newId(prefix);
  }
  keycode(v: unknown, path: string, fallback = 0): number {
    return this.num(v, path, 0, 0xffff, fallback);
  }
  matrix(v: unknown, path: string, rows: number, cols: number): MatrixPos | null {
    if (v === null || v === undefined) return null;
    if (!Array.isArray(v) || v.length !== 2) {
      this.error(path, 'expected [row, col]');
      return null;
    }
    const r = this.num(v[0], `${path}[0]`, 0, rows - 1, 0);
    const c = this.num(v[1], `${path}[1]`, 0, cols - 1, 0);
    return [r, c];
  }
  coord(v: unknown, path: string, fallback = 0): number {
    return this.num(v, path, -1000, 1000, fallback, false);
  }
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function readHardware(r: Reader, v: unknown): HardwareProfile {
  const o = r.obj(v, 'hardware');
  const usb = r.obj(o.usb ?? {}, 'hardware.usb');
  const matrix = r.obj(o.matrix, 'hardware.matrix');
  const split = r.obj(o.split ?? {}, 'hardware.split');
  const enc = r.obj(o.encoders ?? {}, 'hardware.encoders');
  const light = r.obj(o.lighting ?? {}, 'hardware.lighting');
  const pointing = r.obj(o.pointing ?? {}, 'hardware.pointing');
  const nullableNum = (x: unknown, path: string, max: number) => (x === null || x === undefined ? null : r.num(x, path, 0, max, 0));
  const nullableBool = (x: unknown, path: string) => (x === null || x === undefined ? null : r.bool(x, path, false));
  const nullableStr = (x: unknown, path: string) => (x === null || x === undefined ? null : r.str(x, path));
  const facts: Fact[] = r.arr(o.facts, 'hardware.facts', 200).map((f, i) => {
    const fo = r.obj(f, `hardware.facts[${i}]`);
    return {
      key: r.str(fo.key, `hardware.facts[${i}].key`),
      value: r.str(fo.value, `hardware.facts[${i}].value`, '', 500),
      evidence: r.oneOf(fo.evidence, `hardware.facts[${i}].evidence`, ['device', 'source', 'declared', 'default', 'heuristic'] as const, 'declared'),
      at: r.str(fo.at, `hardware.facts[${i}].at`, new Date().toISOString()),
      note: fo.note === undefined ? undefined : r.str(fo.note, `hardware.facts[${i}].note`, '', 500),
    };
  });
  return {
    name: r.str(o.name, 'hardware.name', 'Keyboard'),
    manufacturer: r.str(o.manufacturer, 'hardware.manufacturer'),
    usb: {
      vid: nullableNum(usb.vid, 'hardware.usb.vid', 0xffff),
      pid: nullableNum(usb.pid, 'hardware.usb.pid', 0xffff),
      manufacturer: usb.manufacturer === undefined ? undefined : r.str(usb.manufacturer, 'hardware.usb.manufacturer'),
      product: usb.product === undefined ? undefined : r.str(usb.product, 'hardware.usb.product'),
      deviceVersion: usb.deviceVersion === undefined ? undefined : r.str(usb.deviceVersion, 'hardware.usb.deviceVersion'),
    },
    matrix: {
      rows: r.num(matrix.rows, 'hardware.matrix.rows', 1, LIMITS.maxRows, 1),
      cols: r.num(matrix.cols, 'hardware.matrix.cols', 1, LIMITS.maxCols, 1),
    },
    split: {
      enabled: r.bool(split.enabled, 'hardware.split.enabled', false),
      transport: r.oneOf(split.transport, 'hardware.split.transport', ['serial', 'i2c', 'wireless', 'none', 'unknown'] as const, 'unknown'),
    },
    processor: nullableStr(o.processor, 'hardware.processor'),
    bootloader: nullableStr(o.bootloader, 'hardware.bootloader'),
    encoders: { count: nullableNum(enc.count, 'hardware.encoders.count', LIMITS.maxEncoders), withPress: nullableBool(enc.withPress, 'hardware.encoders.withPress') },
    lighting: {
      kind: r.oneOf(light.kind, 'hardware.lighting.kind', ['rgb_matrix', 'rgblight', 'led_matrix', 'backlight', 'none', 'unknown'] as const, 'unknown'),
      ledCount: nullableNum(light.ledCount, 'hardware.lighting.ledCount', 1024),
    },
    pointing: {
      kind: r.oneOf(pointing.kind, 'hardware.pointing.kind', ['none', 'cirque', 'trackball', 'trackpoint', 'other', 'unknown'] as const, 'unknown'),
      notes: pointing.notes === undefined ? undefined : r.str(pointing.notes, 'hardware.pointing.notes', '', 500),
    },
    extras: r.str(o.extras, 'hardware.extras', '', LIMITS.maxText),
    notes: r.str(o.notes, 'hardware.notes', '', LIMITS.maxText),
    facts,
    pins: readPins(r, o.pins),
  };
}

const PIN_RE = /^[A-Za-z0-9_]{1,12}$/;

function readPins(r: Reader, v: unknown): PinDefinition | null {
  if (v === null || v === undefined) return null;
  const o = r.obj(v, 'hardware.pins');
  const pinList = (x: unknown, path: string): string[] =>
    r.arr(x, path, 32).map((p, i) => {
      const s = r.str(p, `${path}[${i}]`, '', 12);
      if (!PIN_RE.test(s)) r.error(`${path}[${i}]`, 'pin name may contain only letters, digits and _');
      return s;
    });
  const pin = (x: unknown, path: string): string | undefined => {
    if (x === undefined || x === null || x === '') return undefined;
    const s = r.str(x, path, '', 12);
    if (!PIN_RE.test(s)) r.error(path, 'pin name may contain only letters, digits and _');
    return s;
  };
  const encList = (x: unknown, path: string) =>
    r.arr(x, path, 16).map((e, i) => {
      const eo = r.obj(e, `${path}[${i}]`);
      return { a: pin(eo.a, `${path}[${i}].a`) ?? '', b: pin(eo.b, `${path}[${i}].b`) ?? '' };
    });
  const target = r.str(o.target, 'hardware.pins.target', '', 120);
  if (target && !/^[a-z0-9_][a-z0-9_/]*$/.test(target)) r.error('hardware.pins.target', 'target folder may contain only lowercase letters, digits, _ and /');
  const ho = r.obj(o.handedness ?? { kind: 'master-left' }, 'hardware.pins.handedness');
  const handedness: PinDefinition['handedness'] =
    ho.kind === 'pin'
      ? { kind: 'pin', pin: pin(ho.pin, 'hardware.pins.handedness.pin') ?? '', lowIsLeft: r.bool(ho.lowIsLeft, 'hardware.pins.handedness.lowIsLeft', true) }
      : ho.kind === 'eeprom'
        ? { kind: 'eeprom' }
        : { kind: 'master-left' };
  return {
    target,
    board: o.board === undefined ? undefined : r.str(o.board, 'hardware.pins.board', '', 60),
    diodeDirection: r.oneOf(o.diodeDirection, 'hardware.pins.diodeDirection', ['COL2ROW', 'ROW2COL'] as const, 'COL2ROW'),
    rows: pinList(o.rows, 'hardware.pins.rows'),
    cols: pinList(o.cols, 'hardware.pins.cols'),
    rightRows: o.rightRows === undefined ? undefined : pinList(o.rightRows, 'hardware.pins.rightRows'),
    rightCols: o.rightCols === undefined ? undefined : pinList(o.rightCols, 'hardware.pins.rightCols'),
    serialPin: pin(o.serialPin, 'hardware.pins.serialPin'),
    handedness,
    encoders: encList(o.encoders, 'hardware.pins.encoders'),
    rightEncoders: o.rightEncoders === undefined ? undefined : encList(o.rightEncoders, 'hardware.pins.rightEncoders'),
    source: o.source === undefined ? undefined : r.str(o.source, 'hardware.pins.source', '', 300),
  };
}

function readGeometry(r: Reader, v: unknown, path: string, rows: number, cols: number): Geometry {
  const o = r.obj(v, path);
  const half = (x: unknown, p: string) => r.oneOf(x, p, ['left', 'right', 'center'] as const, 'center');
  const keys: KeyGeom[] = r.arr(o.keys, `${path}.keys`, LIMITS.maxKeys).map((k, i) => {
    const p = `${path}.keys[${i}]`;
    const ko = r.obj(k, p);
    const x = r.coord(ko.x, `${p}.x`);
    const y = r.coord(ko.y, `${p}.y`);
    return {
      id: r.id(ko.id, `${p}.id`, 'key'),
      matrix: r.matrix(ko.matrix, `${p}.matrix`, rows, cols),
      x,
      y,
      w: r.num(ko.w, `${p}.w`, 0.1, 20, 1, false),
      h: r.num(ko.h, `${p}.h`, 0.1, 20, 1, false),
      r: r.num(ko.r, `${p}.r`, -360, 360, 0, false),
      rx: r.coord(ko.rx, `${p}.rx`, x),
      ry: r.coord(ko.ry, `${p}.ry`, y),
      shape: r.oneOf(ko.shape, `${p}.shape`, ['rect', 'circle'] as const, 'rect'),
      half: half(ko.half, `${p}.half`),
      label: ko.label === undefined ? undefined : r.str(ko.label, `${p}.label`, '', 40),
      approximate: ko.approximate === undefined ? undefined : r.bool(ko.approximate, `${p}.approximate`, false),
    };
  });
  const encoders: EncoderGeom[] = r.arr(o.encoders, `${path}.encoders`, LIMITS.maxEncoders).map((e, i) => {
    const p = `${path}.encoders[${i}]`;
    const eo = r.obj(e, p);
    return {
      id: r.id(eo.id, `${p}.id`, 'enc'),
      index: r.num(eo.index, `${p}.index`, 0, LIMITS.maxEncoders - 1, i),
      x: r.coord(eo.x, `${p}.x`),
      y: r.coord(eo.y, `${p}.y`),
      d: r.num(eo.d, `${p}.d`, 0.2, 10, 1, false),
      half: half(eo.half, `${p}.half`),
      pressMatrix: r.matrix(eo.pressMatrix, `${p}.pressMatrix`, rows, cols),
      label: eo.label === undefined ? undefined : r.str(eo.label, `${p}.label`, '', 40),
      approximate: eo.approximate === undefined ? undefined : r.bool(eo.approximate, `${p}.approximate`, false),
    };
  });
  const controls: ControlGeom[] = r.arr(o.controls, `${path}.controls`, 64).map((c, i) => {
    const p = `${path}.controls[${i}]`;
    const co = r.obj(c, p);
    return {
      id: r.id(co.id, `${p}.id`, 'ctl'),
      kind: r.oneOf(co.kind, `${p}.kind`, ['trackpad', 'trackball', 'display', 'button', 'other'] as const, 'other'),
      x: r.coord(co.x, `${p}.x`),
      y: r.coord(co.y, `${p}.y`),
      w: r.num(co.w, `${p}.w`, 0.1, 40, 1, false),
      h: r.num(co.h, `${p}.h`, 0.1, 40, 1, false),
      shape: r.oneOf(co.shape, `${p}.shape`, ['rect', 'circle'] as const, 'rect'),
      half: half(co.half, `${p}.half`),
      label: r.str(co.label, `${p}.label`, '', 60),
      notes: co.notes === undefined ? undefined : r.str(co.notes, `${p}.notes`, '', 500),
      approximate: co.approximate === undefined ? undefined : r.bool(co.approximate, `${p}.approximate`, false),
    };
  });
  const src = r.obj(o.source ?? { kind: 'manual' }, `${path}.source`);
  return {
    id: r.id(o.id, `${path}.id`, 'geo'),
    name: r.str(o.name, `${path}.name`, 'Geometry'),
    keys,
    encoders,
    controls,
    source: {
      kind: r.oneOf(src.kind, `${path}.source.kind`, ['template', 'qmk', 'kle', 'via', 'manual'] as const, 'manual'),
      ref: src.ref === undefined ? undefined : r.str(src.ref, `${path}.source.ref`, '', 300),
      note: src.note === undefined ? undefined : r.str(src.note, `${path}.source.note`, '', 300),
    },
  };
}

function readKeymap(r: Reader, v: unknown, path: string, rows: number, cols: number): Keymap {
  const o = r.obj(v, path);
  const cNames = new Set<string>();
  const layers: Layer[] = r.arr(o.layers, `${path}.layers`, LIMITS.maxLayers).map((l, i) => {
    const p = `${path}.layers[${i}]`;
    const lo = r.obj(l, p);
    const rawKeys = r.arr(lo.keys, `${p}.keys`, LIMITS.maxRows * LIMITS.maxCols);
    const keys = new Array(rows * cols).fill(i === 0 ? 0 : 1);
    if (rawKeys.length !== rows * cols) r.warn(`${p}.keys`, `expected ${rows * cols} keycodes, got ${rawKeys.length} — padded/truncated`);
    rawKeys.slice(0, rows * cols).forEach((k, j) => (keys[j] = r.keycode(k, `${p}.keys[${j}]`)));
    const encoders = r.arr(lo.encoders, `${p}.encoders`, LIMITS.maxEncoders).map((e, j) => {
      const eo = r.obj(e, `${p}.encoders[${j}]`);
      return { ccw: r.keycode(eo.ccw, `${p}.encoders[${j}].ccw`), cw: r.keycode(eo.cw, `${p}.encoders[${j}].cw`) };
    });
    const color = lo.color === undefined ? undefined : r.str(lo.color, `${p}.color`, '');
    if (color && !HEX_COLOR.test(color)) r.warn(`${p}.color`, 'color must be #rrggbb — ignored');
    // C name: an invalid or repeated one is dropped (the layer gets its L_<NAME> again).
    let cName: string | undefined;
    if (lo.cName !== undefined && lo.cName !== '') {
      if (typeof lo.cName !== 'string' || !validCIdentifier(lo.cName)) r.warn(`${p}.cName`, 'layer C name must be a C identifier (not a keyword, up to 64 characters) — ignored');
      else if (cNames.has(lo.cName)) r.warn(`${p}.cName`, `layer C name “${lo.cName}” is used by another layer — ignored`);
      else cNames.add((cName = lo.cName));
    }
    return {
      id: r.id(lo.id, `${p}.id`, 'layer'),
      name: r.str(lo.name, `${p}.name`, `Layer ${i}`, 40),
      ...(cName ? { cName } : {}),
      color: color && HEX_COLOR.test(color) ? color : undefined,
      keys,
      encoders,
    };
  });
  if (layers.length === 0) r.error(`${path}.layers`, 'a keymap needs at least one layer');
  return {
    id: r.id(o.id, `${path}.id`, 'keymap'),
    name: r.str(o.name, `${path}.name`, 'keymap'),
    layers,
    defaultLayer: r.num(o.defaultLayer, `${path}.defaultLayer`, 0, Math.max(0, layers.length - 1), 0),
    notes: o.notes === undefined ? undefined : r.str(o.notes, `${path}.notes`, '', LIMITS.maxText),
  };
}

function readMacroStep(r: Reader, v: unknown, path: string): MacroStep | null {
  const o = r.obj(v, path);
  switch (o.type) {
    case 'text':
      return { type: 'text', text: r.str(o.text, `${path}.text`, '', LIMITS.maxText) };
    case 'tap':
    case 'down':
    case 'up':
      return { type: o.type, keycode: r.keycode(o.keycode, `${path}.keycode`) };
    case 'delay':
      return { type: 'delay', ms: r.num(o.ms, `${path}.ms`, 0, 60000, 0) };
    default:
      r.error(`${path}.type`, 'unknown macro step');
      return null;
  }
}

function readLightingState(r: Reader, v: unknown, path: string): LightingState | null {
  if (v === null || v === undefined) return null;
  const o = r.obj(v, path);
  return {
    brightness: r.num(o.brightness, `${path}.brightness`, 0, 255, 128),
    effect: r.num(o.effect, `${path}.effect`, 0, 255, 1),
    speed: r.num(o.speed, `${path}.speed`, 0, 255, 128),
    hue: r.num(o.hue, `${path}.hue`, 0, 255, 0),
    sat: r.num(o.sat, `${path}.sat`, 0, 255, 255),
  };
}

function readFlags(r: Reader, v: unknown, path: string): Partial<Record<FeatureId, FlagInfo>> {
  const o = r.obj(v ?? {}, path);
  const out: Partial<Record<FeatureId, FlagInfo>> = {};
  for (const [k, val] of Object.entries(o)) {
    if (!FEATURE_BY_ID.has(k as FeatureId)) {
      r.warn(`${path}.${k}`, 'unknown feature — skipped');
      continue;
    }
    const fo = r.obj(val, `${path}.${k}`);
    const note = fo.note === undefined ? undefined : r.obj(fo.note, `${path}.${k}.note`);
    out[k as FeatureId] = {
      state: r.oneOf(fo.state, `${path}.${k}.state`, ['on', 'off', 'unknown'] as const, 'unknown'),
      evidence: r.oneOf(fo.evidence, `${path}.${k}.evidence`, ['device', 'source', 'declared', 'default', 'heuristic'] as const, 'declared'),
      note: note ? { en: r.str(note.en, `${path}.${k}.note.en`, '', 500), ru: r.str(note.ru, `${path}.${k}.note.ru`, '', 500) } : undefined,
    };
  }
  return out;
}

function readFirmware(r: Reader, v: unknown): FirmwareConfig {
  const o = r.obj(v ?? {}, 'firmware');
  const keyboard = o.keyboard === null || o.keyboard === undefined ? null : r.str(o.keyboard, 'firmware.keyboard', '', 200);
  if (keyboard && !/^[a-z0-9_][a-z0-9_/.+-]*$/i.test(keyboard)) r.error('firmware.keyboard', 'keyboard target may contain only letters, digits, _ - / . +');
  const keymap = r.str(o.keymap, 'firmware.keymap', 'navi', 60);
  if (!/^[a-z0-9_][a-z0-9_-]*$/i.test(keymap)) r.error('firmware.keymap', 'keymap name may contain only letters, digits, _ and -');
  const specs = listSpecVersions();
  const keycodeSpec = typeof o.keycodeSpec === 'string' && specs.includes(o.keycodeSpec) ? o.keycodeSpec : specs[0];
  if (o.keycodeSpec !== undefined && keycodeSpec !== o.keycodeSpec) r.warn('firmware.keycodeSpec', `unknown keycode spec — using ${specs[0]}`);
  const bf = r.obj(o.buildFeatures ?? {}, 'firmware.buildFeatures');
  const buildFeatures: Partial<Record<FeatureId, boolean>> = {};
  for (const [k, val] of Object.entries(bf)) {
    if (FEATURE_BY_ID.has(k as FeatureId)) buildFeatures[k as FeatureId] = r.bool(val, `firmware.buildFeatures.${k}`, false);
  }
  const bc = r.obj(o.buildConfig ?? {}, 'firmware.buildConfig');
  const buildConfig: Record<string, string | number | boolean> = {};
  for (const [k, val] of Object.entries(bc)) {
    if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(k)) {
      r.error(`firmware.buildConfig.${k}`, 'config.h names must be UPPER_CASE identifiers');
      continue;
    }
    if (typeof val === 'number' && Number.isFinite(val)) buildConfig[k] = val;
    else if (typeof val === 'boolean') buildConfig[k] = val;
    else if (typeof val === 'string' && val.length <= 200 && !/[\r\n]/.test(val) && !unsafeDefineValue(val)) buildConfig[k] = val;
    else r.error(`firmware.buildConfig.${k}`, 'value must be a number, true/false or a one-line expression without { } ; \\ # asm');
  }
  const bo = o.build === undefined ? null : r.obj(o.build, 'firmware.build');
  let build: FirmwareConfig['build'];
  if (bo) {
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(r.obj(bo.env ?? {}, 'firmware.build.env'))) {
      if (!allowedMakeVar(k)) r.error(`firmware.build.env.${k}`, 'only feature flags and drivers (…_ENABLE, …_DRIVER, …_TYPE, CONVERT_TO…) are allowed');
      else if (k === 'SRC' || k === 'INTROSPECTION_KEYMAP_C' || typeof v !== 'string' || !MAKE_VALUE_RE.test(v)) r.error(`firmware.build.env.${k}`, 'value must be one word: letters, digits, _');
      else env[k] = v;
    }
    build = { parallel: bo.parallel === undefined ? undefined : r.num(bo.parallel, 'firmware.build.parallel', 1, 64, 1), env };
  }
  // Own lines are kept as they are (so work is not lost), but dangerous ones are marked:
  // with errors the files will not be written or built (generate.ts → issues).
  const co = o.custom === undefined ? null : r.obj(o.custom, 'firmware.custom');
  let custom: FirmwareConfig['custom'];
  if (co) {
    custom = {};
    for (const file of CUSTOM_FILES) {
      const v = co[file];
      if (v === undefined) continue;
      if (typeof v !== 'string' || v.length > CUSTOM_MAX) {
        r.error(`firmware.custom.${file}`, 'must be text up to 64 KB');
        continue;
      }
      custom[file] = v;
      const bad = checkCustom(file, v).filter((i) => i.level === 'error');
      if (bad.length) r.warn(`firmware.custom.${file}`, `contains forbidden lines (${bad.map((i) => i.line || '—').join(', ')}): writing and building are blocked until fixed`);
    }
  }
  const po = o.pipeline === undefined ? null : r.obj(o.pipeline, 'firmware.pipeline');
  let pipeline: FirmwareConfig['pipeline'];
  if (po) {
    const headers: string[] = [];
    r.arr(po.headers, 'firmware.pipeline.headers', PIPELINE_MAX_HEADERS).forEach((h, i) => {
      if (typeof h === 'string' && safeHeaderName(h)) headers.push(h);
      else r.error(`firmware.pipeline.headers[${i}]`, 'header must be a relative path inside the keymap folder (letters, digits, _ . / -; no “..”, no leading /) — dropped');
    });
    pipeline = { enabled: r.bool(po.enabled, 'firmware.pipeline.enabled', false), headers };
  }
  return {
    build,
    custom,
    customReview: custom && o.customReview === true ? true : undefined,
    pipeline,
    keyboard: keyboard || null,
    keymap,
    keycodeSpec,
    unicode: r.oneOf(o.unicode, 'firmware.unicode', ['unicode', 'unicodemap'] as const, 'unicode'),
    flags: readFlags(r, o.flags, 'firmware.flags'),
    buildFeatures,
    buildConfig,
  };
}

/**
 * Parses a project from a JSON object (already parsed). Migrations first, then the check.
 * project = null if there are errors that make the project impossible to open (no matrix, layers…).
 */
export function validateProject(input: unknown): { project: Project | null; issues: ValidationIssue[] } {
  const r = new Reader();
  const top = r.obj(input, '');
  if (top.format !== PROJECT_FORMAT) {
    r.error('format', `not a ${PROJECT_FORMAT} file`);
    return { project: null, issues: r.issues };
  }
  const migrated = migrateProject(top);
  if ('error' in migrated) {
    r.error('schemaVersion', migrated.error);
    return { project: null, issues: r.issues };
  }
  const o = migrated.data;
  const hardware = readHardware(r, o.hardware);
  const { rows, cols } = hardware.matrix;
  const geometries = r.arr(o.geometries, 'geometries', LIMITS.maxGeometries).map((g, i) => readGeometry(r, g, `geometries[${i}]`, rows, cols));
  const keymaps = r.arr(o.keymaps, 'keymaps', LIMITS.maxKeymaps).map((k, i) => readKeymap(r, k, `keymaps[${i}]`, rows, cols));
  if (geometries.length === 0) r.error('geometries', 'the project has no geometry');
  if (keymaps.length === 0) r.error('keymaps', 'the project has no keymap');

  const macros: Macro[] = r.arr(o.macros, 'macros', LIMITS.maxMacros).map((m, i) => {
    const mo = r.obj(m, `macros[${i}]`);
    return {
      id: r.id(mo.id, `macros[${i}].id`, 'macro'),
      index: r.num(mo.index, `macros[${i}].index`, 0, 127, i),
      name: r.str(mo.name, `macros[${i}].name`, `Macro ${i}`, 60),
      steps: r
        .arr(mo.steps, `macros[${i}].steps`, LIMITS.maxMacroSteps)
        .map((s, j) => readMacroStep(r, s, `macros[${i}].steps[${j}]`))
        .filter((s): s is MacroStep => s !== null),
    };
  });
  const tapDances: TapDance[] = r.arr(o.tapDances, 'tapDances', LIMITS.maxTapDances).map((t, i) => {
    const p = `tapDances[${i}]`;
    const to = r.obj(t, p);
    const name = r.str(to.name, `${p}.name`, `TD_${i}`, 64);
    if (!IDENT.test(name)) r.error(`${p}.name`, 'name must be a C identifier (letters, digits, _)');
    return {
      id: r.id(to.id, `${p}.id`, 'td'),
      index: r.num(to.index, `${p}.index`, 0, 255, i),
      name,
      tap: r.keycode(to.tap, `${p}.tap`),
      hold: r.keycode(to.hold, `${p}.hold`),
      doubleTap: r.keycode(to.doubleTap, `${p}.doubleTap`),
      tapHold: r.keycode(to.tapHold, `${p}.tapHold`),
      tappingTerm: to.tappingTerm === undefined ? undefined : r.num(to.tappingTerm, `${p}.tappingTerm`, 50, 2000, 200),
    };
  });
  const combos: Combo[] = r.arr(o.combos, 'combos', LIMITS.maxCombos).map((c, i) => {
    const p = `combos[${i}]`;
    const co = r.obj(c, p);
    const name = r.str(co.name, `${p}.name`, `combo_${i}`, 64);
    if (!IDENT.test(name)) r.error(`${p}.name`, 'name must be a C identifier');
    return {
      id: r.id(co.id, `${p}.id`, 'combo'),
      name,
      keys: r
        .arr(co.keys, `${p}.keys`, 16)
        .map((k, j) => r.matrix(k, `${p}.keys[${j}]`, rows, cols))
        .filter((k): k is MatrixPos => k !== null),
      result: r.keycode(co.result, `${p}.result`),
      term: co.term === undefined ? undefined : r.num(co.term, `${p}.term`, 10, 1000, 50),
      layers: co.layers === undefined ? undefined : r.arr(co.layers, `${p}.layers`, 32).map((l, j) => r.num(l, `${p}.layers[${j}]`, 0, 31, 0)),
    };
  });
  const keyOverrides: KeyOverride[] = r.arr(o.keyOverrides, 'keyOverrides', 256).map((k, i) => {
    const p = `keyOverrides[${i}]`;
    const ko = r.obj(k, p);
    const name = r.str(ko.name, `${p}.name`, `ko_${i}`, 64);
    if (!IDENT.test(name)) r.error(`${p}.name`, 'name must be a C identifier');
    return {
      id: r.id(ko.id, `${p}.id`, 'ko'),
      name,
      mods: r.num(ko.mods, `${p}.mods`, 1, 0x1f, 0x02),
      trigger: r.keycode(ko.trigger, `${p}.trigger`),
      replacement: r.keycode(ko.replacement, `${p}.replacement`),
      layers: ko.layers === undefined ? undefined : r.arr(ko.layers, `${p}.layers`, 32).map((l, j) => r.num(l, `${p}.layers[${j}]`, 0, 31, 0)),
    };
  });
  const customKeycodes: CustomKeycode[] = r.arr(o.customKeycodes, 'customKeycodes', 64).map((c, i) => {
    const p = `customKeycodes[${i}]`;
    const co = r.obj(c, p);
    const name = r.str(co.name, `${p}.name`, `CUSTOM_${i}`, 64);
    if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) r.error(`${p}.name`, 'name must be an UPPER_CASE C identifier');
    const ao = r.obj(co.action ?? { type: 'none' }, `${p}.action`);
    const action =
      ao.type === 'send-string'
        ? { type: 'send-string' as const, text: r.str(ao.text, `${p}.action.text`, '', 1000) }
        : ao.type === 'tap'
          ? { type: 'tap' as const, keycode: r.keycode(ao.keycode, `${p}.action.keycode`) }
          : { type: 'none' as const };
    return { id: r.id(co.id, `${p}.id`, 'ck'), name, description: r.str(co.description, `${p}.description`, '', 300), action };
  });
  const keyAliases: KeyAlias[] = r.arr(o.keyAliases ?? [], 'keyAliases', KEY_ALIASES_MAX).map((a, i) => {
    const p = `keyAliases[${i}]`;
    const ao = r.obj(a, p);
    return { id: r.id(ao.id, `${p}.id`, 'ka'), label: r.str(ao.label, `${p}.label`, '', ALIAS_LABEL_MAX), keycode: r.keycode(ao.keycode, `${p}.keycode`) };
  });
  const readAction = (v: unknown, p: string): CustomAction => {
    const ao = r.obj(v ?? { type: 'none' }, p);
    if (ao.type === 'send-string') return { type: 'send-string', text: r.str(ao.text, `${p}.text`, '', 1000) };
    if (ao.type === 'tap') return { type: 'tap', keycode: r.keycode(ao.keycode, `${p}.keycode`) };
    return { type: 'none' };
  };
  const leaderSequences: LeaderSequence[] = r.arr(o.leaderSequences ?? [], 'leaderSequences', 256).map((s, i) => {
    const p = `leaderSequences[${i}]`;
    const so = r.obj(s, p);
    const keys = r.arr(so.keys, `${p}.keys`, 5).map((k, j) => r.keycode(k, `${p}.keys[${j}]`));
    return { id: r.id(so.id, `${p}.id`, 'lead'), keys, action: readAction(so.action, `${p}.action`) };
  });
  const unicodeMap: UnicodeEntry[] = r.arr(o.unicodeMap ?? [], 'unicodeMap', 0x4000).map((u, i) => {
    const p = `unicodeMap[${i}]`;
    const uo = r.obj(u, p);
    const name = r.str(uo.name, `${p}.name`, `U_${i}`, 64);
    if (!IDENT.test(name)) r.error(`${p}.name`, 'name must be a C identifier');
    return { id: r.id(uo.id, `${p}.id`, 'uc'), name, codepoint: r.num(uo.codepoint, `${p}.codepoint`, 0, 0x10ffff, 0x3f) };
  });
  const lo = r.obj(o.lighting ?? {}, 'lighting');
  const lighting: LightingConfig = {
    rgbMatrix: readLightingState(r, lo.rgbMatrix, 'lighting.rgbMatrix'),
    rgblight: readLightingState(r, lo.rgblight, 'lighting.rgblight'),
    rgbMatrixEffects:
      lo.rgbMatrixEffects === null || lo.rgbMatrixEffects === undefined
        ? null
        : r.arr(lo.rgbMatrixEffects, 'lighting.rgbMatrixEffects', 256).map((e, i) => r.str(e, `lighting.rgbMatrixEffects[${i}]`, '', 60)),
    effectsEvidence:
      lo.effectsEvidence === undefined ? undefined : r.oneOf(lo.effectsEvidence, 'lighting.effectsEvidence', ['device', 'source', 'declared', 'default', 'heuristic'] as const, 'declared'),
  };
  const dev = o.device === null || o.device === undefined ? null : r.obj(o.device, 'device');

  const fatal = r.issues.some((i) => i.level === 'error' && /^(hardware\.matrix|geometries$|keymaps$|keymaps\[\d+\]\.layers$|format|schemaVersion)/.test(i.path));
  const activeGeometryId = geometries.some((g) => g.id === o.activeGeometryId) ? (o.activeGeometryId as string) : (geometries[0]?.id ?? '');
  const activeKeymapId = keymaps.some((k) => k.id === o.activeKeymapId) ? (o.activeKeymapId as string) : (keymaps[0]?.id ?? '');
  const project: Project = {
    format: PROJECT_FORMAT,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: r.id(o.id, 'id', 'prj'),
    name: r.str(o.name, 'name', 'Keyboard project'),
    createdAt: r.str(o.createdAt, 'createdAt', new Date().toISOString(), 40),
    updatedAt: r.str(o.updatedAt, 'updatedAt', new Date().toISOString(), 40),
    hardware,
    geometries,
    activeGeometryId,
    keymaps,
    activeKeymapId,
    macros,
    tapDances,
    combos,
    keyOverrides,
    customKeycodes,
    keyAliases,
    leaderSequences,
    unicodeMap,
    lighting,
    firmware: readFirmware(r, o.firmware),
    device: dev ? { vid: r.num(dev.vid, 'device.vid', 0, 0xffff, 0), pid: r.num(dev.pid, 'device.pid', 0, 0xffff, 0), product: dev.product === undefined ? undefined : r.str(dev.product, 'device.product') } : null,
  };
  return { project: fatal || geometries.length === 0 || keymaps.length === 0 ? null : project, issues: r.issues };
}

/** Parses the text of a project file. */
export function parseProjectText(text: string): { project: Project | null; issues: ValidationIssue[] } {
  if (text.length > 20 * 1024 * 1024) return { project: null, issues: [{ level: 'error', path: '', message: 'file is too large (> 20 MB)' }] };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    return { project: null, issues: [{ level: 'error', path: '', message: `not valid JSON: ${(err as Error).message}` }] };
  }
  return validateProject(json);
}

export function serializeProject(project: Project): string {
  return JSON.stringify(project, null, 1);
}
