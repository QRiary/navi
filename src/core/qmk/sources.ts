/**
 * QMK KEYBOARD SOURCES: merging info.json/keyboard.json along the folder chain (as QMK does),
 * parsing rules.mk and config.h, deriving “what is enabled in the firmware” (evidence = source).
 */
import { deepUpdate } from '../keycodes/spec';
import { FEATURES, type FeatureId, type FlagInfo } from '../features/registry';

export interface SourceFile {
  path: string;
  text: string;
}

type Json = Record<string, unknown>;

/** Parses rules.mk: KEY = value / ?= / += (the last value wins; ?= only if not set). */
export function parseRulesMk(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const m = line.match(/^([A-Z][A-Z0-9_]*)\s*(\?=|\+=|:=|=)\s*(.*)$/);
    if (!m) continue;
    const [, key, op, value] = m;
    if (op === '?=' && key in out) continue;
    out[key] = op === '+=' && out[key] ? `${out[key]} ${value.trim()}` : value.trim();
  }
  return out;
}

/** Parses config.h: #define NAME [value] and #undef NAME (conditional blocks are not evaluated). */
export function parseConfigH(text: string): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  const noComments = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const raw of noComments.split(/\r?\n/)) {
    const line = raw.trim();
    const d = line.match(/^#\s*define\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+(.+))?$/);
    if (d) {
      out[d[1]] = d[2] ? d[2].trim() : true;
      continue;
    }
    const u = line.match(/^#\s*undef\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (u) delete out[u[1]];
  }
  return out;
}

function parseJson(text: string): Json | null {
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null;
  } catch {
    return null;
  }
}

export interface KeyboardSourceInfo {
  info: Json;
  rules: Record<string, string>;
  config: Record<string, string | true>;
  matrix: { rows: number; cols: number } | null;
  processor: string | null;
  bootloader: string | null;
  split: boolean;
  encoders: number | null;
  layouts: string[];
  flags: Partial<Record<FeatureId, FlagInfo>>;
  warnings: string[];
}

/**
 * Collect info about the keyboard from the chain files (keyboards/a/info.json, a/b/keyboard.json, …,
 * rules.mk, config.h) and, optionally, the keymap files (the keymap's rules.mk/config.h).
 */
export function analyzeKeyboard(files: SourceFile[], keymapFiles: SourceFile[] = []): KeyboardSourceInfo {
  const warnings: string[] = [];
  const depth = (p: string) => p.split('/').length;
  const sorted = [...files].sort((a, b) => depth(a.path) - depth(b.path));
  const info: Json = {};
  let rules: Record<string, string> = {};
  let config: Record<string, string | true> = {};
  for (const f of sorted) {
    const name = f.path.split('/').pop();
    if (name === 'info.json' || name === 'keyboard.json') {
      const j = parseJson(f.text);
      if (j) deepUpdate(info as never, j as never);
      else warnings.push(`${f.path}: not valid JSON`);
    } else if (name === 'rules.mk') rules = { ...rules, ...parseRulesMk(f.text) };
    else if (name === 'config.h') config = { ...config, ...parseConfigH(f.text) };
  }
  for (const f of keymapFiles) {
    if (f.path.endsWith('rules.mk')) rules = { ...rules, ...parseRulesMk(f.text) };
    else if (f.path.endsWith('config.h')) config = { ...config, ...parseConfigH(f.text) };
  }

  const pins = info.matrix_pins as Json | undefined;
  const size = info.matrix_size as Json | undefined;
  const split = !!(info.split as Json | undefined)?.enabled || rules.SPLIT_KEYBOARD === 'yes';
  let matrix: KeyboardSourceInfo['matrix'] = null;
  if (size && typeof size.rows === 'number' && typeof size.cols === 'number') matrix = { rows: size.rows, cols: size.cols };
  else if (pins && Array.isArray(pins.rows) && Array.isArray(pins.cols)) matrix = { rows: pins.rows.length * (split ? 2 : 1), cols: pins.cols.length };
  else if (pins && Array.isArray(pins.direct)) matrix = { rows: pins.direct.length * (split ? 2 : 1), cols: Math.max(0, ...(pins.direct as unknown[][]).map((r) => r.length)) };

  const encoder = info.encoder as Json | undefined;
  let encoders: number | null = null;
  if (encoder && Array.isArray(encoder.rotary)) {
    const right = ((info.split as Json | undefined)?.encoder as Json | undefined)?.right as Json | undefined;
    encoders = encoder.rotary.length + (split ? (right && Array.isArray(right.rotary) ? right.rotary.length : encoder.rotary.length) : 0);
  }

  // Features: keyboard.json "features" + rules.mk *_ENABLE (the keymap's rules.mk last).
  const features = (info.features as Record<string, boolean> | undefined) ?? {};
  const flags: Partial<Record<FeatureId, FlagInfo>> = {};
  for (const f of FEATURES) {
    let state: boolean | undefined;
    if (f.jsonFeature && f.jsonFeature in features) state = !!features[f.jsonFeature];
    if (f.rules && f.rules in rules) state = /^(yes|true|1)$/i.test(rules[f.rules]);
    if (f.id === 'encoder' && encoders) state = state ?? true;
    if (f.id === 'oneshot' && 'NO_ACTION_ONESHOT' in config) state = false;
    if (state !== undefined) flags[f.id] = { state: state ? 'on' : 'off', evidence: 'source' };
    else if (f.defaultOn) flags[f.id] = { state: 'on', evidence: 'default' };
  }
  const layouts = info.layouts && typeof info.layouts === 'object' ? Object.keys(info.layouts as Json) : [];
  return {
    info,
    rules,
    config,
    matrix,
    processor: typeof info.processor === 'string' ? info.processor : (rules.MCU ?? null),
    bootloader: typeof info.bootloader === 'string' ? info.bootloader : (rules.BOOTLOADER ?? null),
    split,
    encoders,
    layouts,
    flags,
    warnings,
  };
}
