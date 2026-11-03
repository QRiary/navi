/**
 * KEYCODE CODEC: 16-bit value ⇄ structure ⇄ QMK expression.
 *
 * The formulas are exactly those of quantum/quantum_keycodes.h:
 *   LCTL(kc) = QK_LCTL | kc            MT(mod, kc) = QK_MOD_TAP | (mod & 0x1F) << 8 | (kc & 0xFF)
 *   LT(l, kc) = QK_LAYER_TAP | (l & 0xF) << 8 | (kc & 0xFF)
 *   LM(l, mod) = QK_LAYER_MOD | (l & 0xF) << 5 | (mod & 0x1F)
 *   MO/TO/DF/TG/OSL/TT/PDF(l) = base | (l & 0x1F)      OSM(mod) = QK_ONE_SHOT_MOD | (mod & 0x1F)
 *   TD(i) = QK_TAP_DANCE | (i & 0xFF)  SH_T(kc) = QK_SWAP_HANDS | (kc & 0xFF)
 *   UC(c) = QK_UNICODE | c (c ≤ 0x7FFF)  UM(i) = QK_UNICODEMAP | (i & 0x3FFF)  UP(i,j) = QK_UNICODEMAP_PAIR | i | j << 7
 * Range starts come from the spec (ranges), not from constants in the code.
 */
import type { KeycodeDef, KeycodeSpec, RangeDef } from './spec';
import { loadLanguage, rangeOf } from './spec';

// ── Modifiers (5 bits, like MOD_* in QMK) ─────────────────────────────

export const MOD_BITS = { CTRL: 0x01, SHIFT: 0x02, ALT: 0x04, GUI: 0x08, RIGHT: 0x10 } as const;

export const MOD_CONSTANTS: Record<string, number> = {
  MOD_LCTL: 0x01,
  MOD_LSFT: 0x02,
  MOD_LALT: 0x04,
  MOD_LGUI: 0x08,
  MOD_RCTL: 0x11,
  MOD_RSFT: 0x12,
  MOD_RALT: 0x14,
  MOD_RGUI: 0x18,
  MOD_HYPR: 0x0f,
  MOD_MEH: 0x07,
};

/** Modifiers as an expression: 0x03 → "MOD_LCTL | MOD_LSFT". */
export function modsToConstExpr(mods: number): string {
  const right = (mods & MOD_BITS.RIGHT) !== 0;
  const side = right ? 'R' : 'L';
  const parts: string[] = [];
  if (mods & MOD_BITS.CTRL) parts.push(`MOD_${side}CTL`);
  if (mods & MOD_BITS.SHIFT) parts.push(`MOD_${side}SFT`);
  if (mods & MOD_BITS.ALT) parts.push(`MOD_${side}ALT`);
  if (mods & MOD_BITS.GUI) parts.push(`MOD_${side}GUI`);
  return parts.length ? parts.join(' | ') : '0';
}

/** Names of the modifier wrapper functions (LCTL(kc), MEH(kc) …) from quantum_keycodes.h. */
const MOD_FUNCTIONS: Record<number, string> = {
  0x01: 'LCTL', 0x02: 'LSFT', 0x04: 'LALT', 0x08: 'LGUI',
  0x03: 'LCS', 0x05: 'LCA', 0x09: 'LCG', 0x06: 'LSA', 0x0a: 'LSG', 0x0c: 'LAG',
  0x0b: 'LCSG', 0x0d: 'LCAG', 0x0e: 'LSAG', 0x07: 'MEH', 0x0f: 'HYPR',
  0x11: 'RCTL', 0x12: 'RSFT', 0x14: 'RALT', 0x18: 'RGUI',
  0x13: 'RCS', 0x15: 'RCA', 0x19: 'RCG', 0x16: 'RSA', 0x1a: 'RSG', 0x1c: 'RAG',
  0x1b: 'RCSG', 0x1d: 'RCAG', 0x1e: 'RSAG',
};

/** Mod-tap names (LCTL_T(kc), MEH_T(kc) …). */
const MOD_TAP_FUNCTIONS: Record<number, string> = {
  0x01: 'LCTL_T', 0x02: 'LSFT_T', 0x04: 'LALT_T', 0x08: 'LGUI_T',
  0x03: 'LCS_T', 0x05: 'LCA_T', 0x09: 'LCG_T', 0x06: 'LSA_T', 0x0a: 'LSG_T', 0x0c: 'LAG_T',
  0x0b: 'LCSG_T', 0x0d: 'LCAG_T', 0x0e: 'LSAG_T', 0x07: 'MEH_T', 0x0f: 'HYPR_T',
  0x11: 'RCTL_T', 0x12: 'RSFT_T', 0x14: 'RALT_T', 0x18: 'RGUI_T',
  0x13: 'RCS_T', 0x15: 'RCA_T', 0x19: 'RCG_T', 0x16: 'RSA_T', 0x1a: 'RSG_T', 0x1c: 'RAG_T',
  0x1b: 'RCSG_T', 0x1d: 'RCAG_T', 0x1e: 'RSAG_T',
};

/** All modifier wrapper functions, including aliases (C(), S(), ALGR() …) → bits. */
const MOD_FUNCTION_INPUT: Record<string, number> = {
  ...Object.fromEntries(Object.entries(MOD_FUNCTIONS).map(([bits, name]) => [name, Number(bits)])),
  C: 0x01, S: 0x02, A: 0x04, G: 0x08, LOPT: 0x04, LCMD: 0x08, LWIN: 0x08,
  ALGR: 0x14, ROPT: 0x14, RCMD: 0x18, RWIN: 0x18,
};

const MOD_TAP_INPUT: Record<string, number> = {
  ...Object.fromEntries(Object.entries(MOD_TAP_FUNCTIONS).map(([bits, name]) => [name, Number(bits)])),
  CTL_T: 0x01, SFT_T: 0x02, ALT_T: 0x04, GUI_T: 0x08, LOPT_T: 0x04, LCMD_T: 0x08, LWIN_T: 0x08,
  OPT_T: 0x04, CMD_T: 0x08, WIN_T: 0x08, ROPT_T: 0x14, ALGR_T: 0x14, RCMD_T: 0x18, RWIN_T: 0x18, ALL_T: 0x0f,
};

/** OS_* from quantum_keycodes.h → modifier bits for OSM(). */
const ONE_SHOT_DEFINES: Record<string, number> = {
  OS_LCTL: 0x01, OS_LSFT: 0x02, OS_LALT: 0x04, OS_LGUI: 0x08, OS_LCS: 0x03, OS_LCA: 0x05, OS_LCG: 0x09,
  OS_LSA: 0x06, OS_LSG: 0x0a, OS_LAG: 0x0c, OS_LCSG: 0x0b, OS_LCAG: 0x0d, OS_LSAG: 0x0e,
  OS_RCTL: 0x11, OS_RSFT: 0x12, OS_RALT: 0x14, OS_RGUI: 0x18, OS_RCS: 0x13, OS_RCA: 0x15, OS_RCG: 0x19,
  OS_RSA: 0x16, OS_RSG: 0x1a, OS_RAG: 0x1c, OS_RCSG: 0x1b, OS_RCAG: 0x1d, OS_RSAG: 0x1e,
  OS_MEH: 0x07, OS_HYPR: 0x0f,
};

// ── Decoding a value ──────────────────────────────────────────────────

export type LayerFn = 'TO' | 'MO' | 'DF' | 'TG' | 'OSL' | 'TT' | 'PDF';

/** QMK range of each layer function. */
export const LAYER_FN_RANGES: Record<LayerFn, string> = {
  TO: 'QK_TO',
  MO: 'QK_MOMENTARY',
  DF: 'QK_DEF_LAYER',
  TG: 'QK_TOGGLE_LAYER',
  OSL: 'QK_ONE_SHOT_LAYER',
  TT: 'QK_LAYER_TAP_TOGGLE',
  PDF: 'QK_PERSISTENT_DEF_LAYER',
};

export type Decoded =
  | { kind: 'basic'; value: number; def?: KeycodeDef }
  | { kind: 'mods'; mods: number; base: number }
  | { kind: 'mod-tap'; mods: number; base: number }
  | { kind: 'layer-tap'; layer: number; base: number }
  | { kind: 'layer-mod'; layer: number; mods: number }
  | { kind: 'layer'; fn: LayerFn; layer: number }
  | { kind: 'one-shot-mod'; mods: number }
  | { kind: 'swap-hands-tap'; base: number }
  | { kind: 'tap-dance'; index: number }
  | { kind: 'unicode'; codepoint: number }
  | { kind: 'unicode-map'; index: number }
  | { kind: 'unicode-map-pair'; unshifted: number; shifted: number }
  | { kind: 'named'; def: KeycodeDef }
  | { kind: 'unknown'; value: number; range?: RangeDef };

export interface CodecOptions {
  /**
   * How to read 0x8000–0xFFFF: in QMK it is either UNICODE (UC) or UNICODEMAP (UM/UP) —
   * depending on what is enabled in the firmware.
   */
  unicode?: 'unicode' | 'unicodemap';
}

function inRange(spec: KeycodeSpec, define: string, value: number): boolean {
  const r = spec.rangeByDefine.get(define);
  return !!r && value >= r.start && value <= r.end;
}

function rangeStart(spec: KeycodeSpec, define: string): number {
  const r = spec.rangeByDefine.get(define);
  if (!r) throw new KeycodeError(`range ${define} is not in keycode spec ${spec.version}`);
  return r.start;
}

export class KeycodeError extends Error {}

/** Splits a 16-bit value into its parts. */
export function decode(spec: KeycodeSpec, value: number, options: CodecOptions = {}): Decoded {
  const v = value & 0xffff;
  if (v <= 0xff) return { kind: 'basic', value: v, def: spec.byValue.get(v) };
  const def = spec.byValue.get(v);
  if (def) return { kind: 'named', def };

  // Modifiers without a single Ctrl/Shift/Alt/GUI bit (only the “right” flag or 0) make no sense —
  // such values are shown as they are (unknown), so as not to invent a meaning for them.
  const validMods = (mods: number) => (mods & 0x0f) !== 0;
  const unknown = (): Decoded => ({ kind: 'unknown', value: v, range: rangeOf(spec, v) });

  if (inRange(spec, 'QK_MODS', v)) return validMods(v >> 8) ? { kind: 'mods', mods: (v >> 8) & 0x1f, base: v & 0xff } : unknown();
  if (inRange(spec, 'QK_MOD_TAP', v)) return validMods(v >> 8) ? { kind: 'mod-tap', mods: (v >> 8) & 0x1f, base: v & 0xff } : unknown();
  if (inRange(spec, 'QK_LAYER_TAP', v)) return { kind: 'layer-tap', layer: (v >> 8) & 0xf, base: v & 0xff };
  if (inRange(spec, 'QK_LAYER_MOD', v)) return validMods(v) ? { kind: 'layer-mod', layer: (v >> 5) & 0xf, mods: v & 0x1f } : unknown();
  for (const [fn, define] of Object.entries(LAYER_FN_RANGES) as [LayerFn, string][]) {
    if (inRange(spec, define, v)) return { kind: 'layer', fn, layer: v & 0x1f };
  }
  if (inRange(spec, 'QK_ONE_SHOT_MOD', v)) return validMods(v) ? { kind: 'one-shot-mod', mods: v & 0x1f } : unknown();
  if (inRange(spec, 'QK_SWAP_HANDS', v)) return { kind: 'swap-hands-tap', base: v & 0xff };
  if (inRange(spec, 'QK_TAP_DANCE', v)) return { kind: 'tap-dance', index: v & 0xff };

  if (v >= 0x8000) {
    if (options.unicode === 'unicodemap') {
      if (inRange(spec, 'QK_UNICODEMAP_PAIR', v)) return { kind: 'unicode-map-pair', unshifted: v & 0x7f, shifted: (v >> 7) & 0x7f };
      if (inRange(spec, 'QK_UNICODEMAP', v)) return { kind: 'unicode-map', index: v & 0x3fff };
    }
    if (inRange(spec, 'QK_UNICODE', v)) return { kind: 'unicode', codepoint: v & 0x7fff };
  }
  return { kind: 'unknown', value: v, range: rangeOf(spec, v) };
}

/** Builds a value from its parts. Invalid parameters → KeycodeError. */
export function encode(spec: KeycodeSpec, d: Decoded): number {
  const basic = (base: number, what: string) => {
    if (!Number.isInteger(base) || base < 0 || base > 0xff) {
      throw new KeycodeError(`${what}: tap keycode must be a basic keycode 0x00–0xFF (got 0x${base.toString(16)})`);
    }
    return base;
  };
  const mods5 = (mods: number) => {
    if (!Number.isInteger(mods) || mods <= 0 || mods > 0x1f || (mods & 0x0f) === 0) throw new KeycodeError(`invalid modifiers 0x${mods.toString(16)}`);
    return mods;
  };
  const layer = (n: number, max: number, what: string) => {
    if (!Number.isInteger(n) || n < 0 || n > max) throw new KeycodeError(`${what}: layer must be 0–${max} (got ${n})`);
    return n;
  };
  switch (d.kind) {
    case 'basic':
      return basic(d.value, 'basic');
    case 'named':
      return d.def.value;
    case 'mods':
      rangeStart(spec, 'QK_MODS');
      return (mods5(d.mods) << 8) | basic(d.base, 'mods');
    case 'mod-tap':
      return rangeStart(spec, 'QK_MOD_TAP') | (mods5(d.mods) << 8) | basic(d.base, 'MT');
    case 'layer-tap':
      return rangeStart(spec, 'QK_LAYER_TAP') | (layer(d.layer, 15, 'LT') << 8) | basic(d.base, 'LT');
    case 'layer-mod':
      return rangeStart(spec, 'QK_LAYER_MOD') | (layer(d.layer, 15, 'LM') << 5) | mods5(d.mods);
    case 'layer':
      return rangeStart(spec, LAYER_FN_RANGES[d.fn]) | layer(d.layer, 31, d.fn);
    case 'one-shot-mod':
      return rangeStart(spec, 'QK_ONE_SHOT_MOD') | mods5(d.mods);
    case 'swap-hands-tap':
      return rangeStart(spec, 'QK_SWAP_HANDS') | basic(d.base, 'SH_T');
    case 'tap-dance':
      if (!Number.isInteger(d.index) || d.index < 0 || d.index > 0xff) throw new KeycodeError('TD: index must be 0–255');
      return rangeStart(spec, 'QK_TAP_DANCE') | d.index;
    case 'unicode':
      if (!Number.isInteger(d.codepoint) || d.codepoint < 0 || d.codepoint > 0x7fff) {
        throw new KeycodeError('UC: code point must be ≤ 0x7FFF (use UNICODEMAP for larger ones)');
      }
      return rangeStart(spec, 'QK_UNICODE') | d.codepoint;
    case 'unicode-map':
      if (!Number.isInteger(d.index) || d.index < 0 || d.index > 0x3fff) throw new KeycodeError('UM: index must be 0–16383');
      return rangeStart(spec, 'QK_UNICODEMAP') | d.index;
    case 'unicode-map-pair':
      if (d.unshifted < 0 || d.unshifted > 0x7f || d.shifted < 0 || d.shifted > 0x7f) throw new KeycodeError('UP: indexes must be 0–127');
      return rangeStart(spec, 'QK_UNICODEMAP_PAIR') | d.unshifted | (d.shifted << 7);
    case 'unknown':
      return d.value & 0xffff;
  }
}

// ── Names ─────────────────────────────────────────────────────────────

const IDENT = /^[A-Z][A-Z0-9_]*$/;

/** Short “canonical” name: KC_ESCAPE → KC_ESC, QK_BOOTLOADER → QK_BOOT, KC_TRANSPARENT → KC_TRNS. */
export function preferredName(def: KeycodeDef): string {
  const candidates = [def.key, ...def.aliases].filter((n) => IDENT.test(n));
  if (def.key.startsWith('KC_')) {
    const kc = candidates.filter((n) => n.startsWith('KC_'));
    if (kc.length) return kc.reduce((a, b) => (b.length < a.length ? b : a));
  }
  return candidates.reduce((a, b) => (b.length < a.length ? b : a), def.key);
}

/** US layout (keymap_us.h, included by QMK by default): KC_EXLM ⇄ S(KC_1). */
let usAliases: { byKey: Map<string, string>; shiftedByBase: Map<string, string> } | null = null;
function us() {
  if (!usAliases) {
    usAliases = { byKey: new Map(), shiftedByBase: new Map() };
    for (const a of loadLanguage('us')) {
      usAliases.byKey.set(a.key, a.base);
      const m = a.base.match(/^S\((\w+)\)$/);
      if (m && !usAliases.shiftedByBase.has(m[1])) usAliases.shiftedByBase.set(m[1], a.key);
    }
  }
  return usAliases;
}

/** S(KC_1) → KC_EXLM; looked up by every name of the base key. */
function shiftedAlias(spec: KeycodeSpec, base: number): string | undefined {
  const def = spec.byValue.get(base);
  if (!def) return undefined;
  for (const name of [def.key, ...def.aliases]) {
    const alias = us().shiftedByBase.get(name);
    if (alias) return alias;
  }
  return undefined;
}

export interface NameContext {
  /** Layer name for keymap.c (enum) — otherwise the number. */
  layerName?: (layer: number) => string | undefined;
  /** Tap dance name (enum) — otherwise the number. */
  tapDanceName?: (index: number) => string | undefined;
  /** Name of an own keycode (enum) by value. */
  customName?: (value: number) => string | undefined;
}

function hex(n: number, width = 4): string {
  return `0x${n.toString(16).toUpperCase().padStart(width, '0')}`;
}

function basicName(spec: KeycodeSpec, base: number): string {
  const def = spec.byValue.get(base);
  return def ? preferredName(def) : hex(base, 2);
}

/** Value → QMK expression (for keymap.c and keymap.json): LT(1, KC_SPC), LCTL_T(KC_A), KC_EXLM … */
export function toQmk(spec: KeycodeSpec, value: number, ctx: NameContext = {}, options: CodecOptions = {}): string {
  const custom = ctx.customName?.(value & 0xffff);
  if (custom) return custom;
  const d = decode(spec, value, options);
  const layer = (n: number) => ctx.layerName?.(n) ?? String(n);
  switch (d.kind) {
    case 'basic':
      return d.def ? preferredName(d.def) : hex(d.value);
    case 'named':
      return preferredName(d.def);
    case 'mods': {
      if (d.mods === MOD_BITS.SHIFT) {
        const alias = shiftedAlias(spec, d.base);
        if (alias) return alias;
      }
      const fn = MOD_FUNCTIONS[d.mods];
      const inner = basicName(spec, d.base);
      if (fn) return `${fn}(${inner})`;
      return hex(d.base | (d.mods << 8));
    }
    case 'mod-tap': {
      const fn = MOD_TAP_FUNCTIONS[d.mods];
      const inner = basicName(spec, d.base);
      return fn ? `${fn}(${inner})` : `MT(${modsToConstExpr(d.mods)}, ${inner})`;
    }
    case 'layer-tap':
      return `LT(${layer(d.layer)}, ${basicName(spec, d.base)})`;
    case 'layer-mod':
      return `LM(${layer(d.layer)}, ${modsToConstExpr(d.mods)})`;
    case 'layer':
      return `${d.fn}(${layer(d.layer)})`;
    case 'one-shot-mod':
      return `OSM(${modsToConstExpr(d.mods)})`;
    case 'swap-hands-tap':
      return `SH_T(${basicName(spec, d.base)})`;
    case 'tap-dance':
      return `TD(${ctx.tapDanceName?.(d.index) ?? d.index})`;
    case 'unicode':
      return `UC(${hex(d.codepoint)})`;
    case 'unicode-map':
      return `UM(${d.index})`;
    case 'unicode-map-pair':
      return `UP(${d.unshifted}, ${d.shifted})`;
    case 'unknown':
      return hex(d.value);
  }
}

// ── Parsing a QMK expression ──────────────────────────────────────────

export interface ParseContext extends CodecOptions {
  /** Layer name (enum from keymap.c) → number. */
  layerByName?: (name: string) => number | undefined;
  tapDanceByName?: (name: string) => number | undefined;
  customByName?: (name: string) => number | undefined;
}

type Token = { t: 'ident' | 'num' | 'punct'; v: string };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (/[A-Za-z_]/.test(ch)) {
      let j = i + 1;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      out.push({ t: 'ident', v: src.slice(i, j) });
      i = j;
    } else if (/[0-9]/.test(ch)) {
      let j = i + 1;
      while (j < src.length && /[0-9A-Fa-fxX]/.test(src[j])) j++;
      out.push({ t: 'num', v: src.slice(i, j) });
      i = j;
    } else if ('(),|'.includes(ch)) {
      out.push({ t: 'punct', v: ch });
      i++;
    } else {
      throw new KeycodeError(`unexpected character “${ch}”`);
    }
  }
  return out;
}

function parseNumber(s: string): number {
  const n = /^0x[0-9a-f]+$/i.test(s) ? Number.parseInt(s, 16) : /^\d+$/.test(s) ? Number.parseInt(s, 10) : NaN;
  if (!Number.isFinite(n)) throw new KeycodeError(`not a number: ${s}`);
  return n;
}

/**
 * QMK expression → value. Understands names and aliases from the spec, KC_EXLM etc.,
 * the functions LCTL()/C()/MT()/LCTL_T()/LT()/LM()/MO()/TG()/TO()/TT()/OSL()/DF()/PDF()/OSM()/TD()/SH_T()/UC()/UM()/UP(),
 * MOD_* and OS_* constants, KC_HYPR/KC_MEH and numbers (0x…).
 */
export function parseQmk(spec: KeycodeSpec, source: string, ctx: ParseContext = {}): number {
  const tokens = tokenize(source.trim());
  let pos = 0;
  const peek = () => tokens[pos];
  const take = () => {
    const tok = tokens[pos++];
    if (!tok) throw new KeycodeError('unexpected end of expression');
    return tok;
  };
  const expect = (v: string) => {
    const tok = take();
    if (tok.v !== v) throw new KeycodeError(`expected “${v}”, got “${tok.v}”`);
  };

  const modsExpr = (): number => {
    let mods = 0;
    for (;;) {
      const tok = take();
      if (tok.t === 'num') mods |= parseNumber(tok.v);
      else if (tok.t === 'ident' && tok.v in MOD_CONSTANTS) mods |= MOD_CONSTANTS[tok.v];
      else throw new KeycodeError(`expected a MOD_* constant, got “${tok.v}”`);
      if (peek()?.v === '|') take();
      else break;
    }
    return mods;
  };

  const layerArg = (): number => {
    const tok = take();
    if (tok.t === 'num') return parseNumber(tok.v);
    const n = ctx.layerByName?.(tok.v);
    if (n === undefined) throw new KeycodeError(`unknown layer “${tok.v}”`);
    return n;
  };

  const indexArg = (byName?: (name: string) => number | undefined): number => {
    const tok = take();
    if (tok.t === 'num') return parseNumber(tok.v);
    const n = byName?.(tok.v);
    if (n === undefined) throw new KeycodeError(`unknown name “${tok.v}”`);
    return n;
  };

  const value = (): number => {
    const tok = take();
    if (tok.t === 'num') return parseNumber(tok.v);
    if (tok.t !== 'ident') throw new KeycodeError(`unexpected “${tok.v}”`);
    const name = tok.v;
    if (peek()?.v !== '(') {
      const def = spec.byName.get(name);
      if (def) return def.value;
      if (name === 'KC_HYPR') return encode(spec, { kind: 'mods', mods: 0x0f, base: 0 });
      if (name === 'KC_MEH') return encode(spec, { kind: 'mods', mods: 0x07, base: 0 });
      if (name in ONE_SHOT_DEFINES) return encode(spec, { kind: 'one-shot-mod', mods: ONE_SHOT_DEFINES[name] });
      const custom = ctx.customByName?.(name);
      if (custom !== undefined) return custom;
      const usBase = us().byKey.get(name);
      if (usBase) return parseQmk(spec, usBase, ctx);
      throw new KeycodeError(`unknown keycode “${name}”`);
    }
    take(); // (
    let result: number;
    if (name in MOD_FUNCTION_INPUT) {
      const inner = value();
      result = ((MOD_FUNCTION_INPUT[name] & 0x1f) << 8) | inner;
      // Nested LCTL(LSFT(kc)) are combined with OR, like in C.
      if (inner > 0x1fff) throw new KeycodeError(`${name}(): argument must be a basic keycode or another modifier wrapper`);
    } else if (name in MOD_TAP_INPUT) {
      const inner = value();
      result = encode(spec, { kind: 'mod-tap', mods: MOD_TAP_INPUT[name], base: inner });
    } else if (name === 'MT') {
      const mods = modsExpr();
      expect(',');
      result = encode(spec, { kind: 'mod-tap', mods, base: value() });
    } else if (name === 'LT') {
      const l = layerArg();
      expect(',');
      result = encode(spec, { kind: 'layer-tap', layer: l, base: value() });
    } else if (name === 'LM') {
      const l = layerArg();
      expect(',');
      result = encode(spec, { kind: 'layer-mod', layer: l, mods: modsExpr() });
    } else if (name in LAYER_FN_RANGES) {
      result = encode(spec, { kind: 'layer', fn: name as LayerFn, layer: layerArg() });
    } else if (name === 'OSM') {
      result = encode(spec, { kind: 'one-shot-mod', mods: modsExpr() });
    } else if (name === 'TD') {
      result = encode(spec, { kind: 'tap-dance', index: indexArg(ctx.tapDanceByName) });
    } else if (name === 'SH_T') {
      result = encode(spec, { kind: 'swap-hands-tap', base: value() });
    } else if (name === 'UC') {
      result = encode(spec, { kind: 'unicode', codepoint: indexArg() });
    } else if (name === 'UM') {
      result = encode(spec, { kind: 'unicode-map', index: indexArg() });
    } else if (name === 'UP') {
      const i = indexArg();
      expect(',');
      result = encode(spec, { kind: 'unicode-map-pair', unshifted: i, shifted: indexArg() });
    } else {
      throw new KeycodeError(`unknown function “${name}()”`);
    }
    expect(')');
    return result;
  };

  if (tokens.length === 0) throw new KeycodeError('empty expression');
  const result = value();
  if (pos !== tokens.length) throw new KeycodeError(`unexpected “${tokens[pos].v}” after the expression`);
  if (result < 0 || result > 0xffff) throw new KeycodeError('value is out of 16-bit range');
  return result;
}

/** Safe variant of parseQmk: { value } or { error }. */
export function tryParseQmk(spec: KeycodeSpec, source: string, ctx: ParseContext = {}): { value: number } | { error: string } {
  try {
    return { value: parseQmk(spec, source, ctx) };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export { hex as formatHex };
