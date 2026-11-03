/**
 * QMK KEYCODE SPEC — from the official files data/constants/keycodes/*.hjson.
 *
 * The files are stored in src/core/qmk-data/keycodes.json by version (0.0.1 … 0.0.9) — put there
 * by scripts/gen-qmk-data.mjs from the QMK sources. Here the versions are merged by the same rules
 * as in QMK (lib/python/qmk/keycodes.py + json_schema.merge_ordered_dicts/deep_update):
 *  • files are grouped by “fragment” (_, basic, quantum, lighting, …);
 *  • inside a group — merged by version: "!delete!" removes, "!reset!" replaces;
 *  • groups are layered with a deep update.
 * Nothing is added by hand: what is in QMK is what is in the catalog.
 */
import raw from '../qmk-data/keycodes.json';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

interface RawData {
  source: { repo: string; commit: string; commitDate: string; path: string };
  files: Record<string, JsonObject>;
  extras: Record<string, JsonObject>;
}

const DATA = raw as unknown as RawData;

export interface KeycodeDef {
  /** 16-bit value. */
  value: number;
  /** Main name: KC_A, QK_BOOT, UG_TOGG … */
  key: string;
  /** Label from QMK (may be missing). */
  label?: string;
  aliases: string[];
  /** Group from QMK: basic, modifiers, mouse, media, quantum, rgb_matrix … */
  group?: string;
}

export interface RangeDef {
  start: number;
  /** Last value of the range, inclusive. */
  end: number;
  define: string;
}

export interface KeycodeSpec {
  version: string;
  keycodes: KeycodeDef[];
  ranges: RangeDef[];
  byValue: Map<number, KeycodeDef>;
  /** Name or alias → definition. */
  byName: Map<string, KeycodeDef>;
  rangeByDefine: Map<string, RangeDef>;
}

// ── Merging by QMK rules ──────────────────────────────────────────────

function isObject(v: unknown): v is JsonObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** merge_ordered_dicts from qmk/json_schema.py. */
export function mergeOrderedDicts(dicts: JsonObject[]): JsonObject {
  const result: JsonObject = {};
  const addEntry = (target: JsonObject, k: string, v: Json) => {
    if (k in target && isObject(v)) {
      if ('!reset!' in v) target[k] = v;
      else target[k] = mergeOrderedDicts([target[k] as JsonObject, v]);
      const merged = target[k];
      if (isObject(merged) && '!reset!' in merged) delete merged['!reset!'];
    } else if (k in target && Array.isArray(v)) {
      if (v[0] === '!reset!') target[k] = v.slice(1);
      else target[k] = [...(target[k] as Json[]), ...v];
    } else if (v === '!delete!') {
      delete target[k];
    } else {
      target[k] = v;
    }
  };
  for (const d of dicts) for (const [k, v] of Object.entries(d)) addEntry(result, k, v);
  return result;
}

/** deep_update from qmk/json_schema.py. */
export function deepUpdate(orig: JsonObject, update: JsonObject): JsonObject {
  for (const [k, v] of Object.entries(update)) {
    if (isObject(v)) orig[k] = deepUpdate(isObject(orig[k]) ? (orig[k] as JsonObject) : {}, v);
    else orig[k] = v;
  }
  return orig;
}

const VERSION_RE = /^keycodes_(\d+\.\d+\.\d+)\.hjson$/;

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

/** Spec versions, newest first. */
export function listSpecVersions(): string[] {
  const versions: string[] = [];
  for (const name of Object.keys(DATA.files)) {
    const m = name.match(VERSION_RE);
    if (m) versions.push(m[1]);
  }
  return versions.sort((a, b) => compareVersions(b, a));
}

export const LATEST_SPEC_VERSION = listSpecVersions()[0];

/** Builds the “raw” spec object for a version (like load_spec in QMK). */
export function buildRawSpec(version: string): JsonObject {
  const all = listSpecVersions();
  if (!all.includes(version)) throw new Error(`Unknown keycode spec version ${version}`);
  const versions = all.filter((v) => compareVersions(v, version) <= 0).sort(compareVersions);
  // Grouping by fragment: "_" — the main version files, then fragments in order of appearance.
  const groups = new Map<string, JsonObject[]>([['_', []]]);
  const names = Object.keys(DATA.files).sort();
  for (const v of versions) {
    groups.get('_')!.push(DATA.files[`keycodes_${v}.hjson`] ?? {});
    for (const name of names) {
      const prefix = `keycodes_${v}_`;
      if (!name.startsWith(prefix)) continue;
      const fragment = name.slice(prefix.length).replace(/\.hjson$/, '');
      if (!groups.has(fragment)) groups.set(fragment, []);
      groups.get(fragment)!.push(DATA.files[name]);
    }
  }
  const spec: JsonObject = {};
  for (const list of groups.values()) deepUpdate(spec, mergeOrderedDicts(list.map((d) => structuredClone(d))));
  return spec;
}

function parseHex(s: string): number {
  return Number.parseInt(s, 16);
}

const cache = new Map<string, KeycodeSpec>();

/** Keycode spec of the given version ('latest' — the newest). */
export function loadSpec(version: string = 'latest'): KeycodeSpec {
  const v = version === 'latest' ? LATEST_SPEC_VERSION : version;
  const cached = cache.get(v);
  if (cached) return cached;
  const rawSpec = buildRawSpec(v);

  const keycodes: KeycodeDef[] = [];
  for (const [hex, entry] of Object.entries((rawSpec.keycodes ?? {}) as JsonObject)) {
    if (!isObject(entry) || typeof entry.key !== 'string') continue;
    keycodes.push({
      value: parseHex(hex),
      key: entry.key,
      label: typeof entry.label === 'string' ? entry.label : undefined,
      aliases: Array.isArray(entry.aliases) ? (entry.aliases.filter((a) => typeof a === 'string') as string[]) : [],
      group: typeof entry.group === 'string' ? entry.group : undefined,
    });
  }
  keycodes.sort((a, b) => a.value - b.value);

  const ranges: RangeDef[] = [];
  for (const [key, entry] of Object.entries((rawSpec.ranges ?? {}) as JsonObject)) {
    if (!isObject(entry) || typeof entry.define !== 'string') continue;
    const [start, size] = key.split('/').map(parseHex);
    ranges.push({ start, end: start + size, define: entry.define });
  }
  ranges.sort((a, b) => a.start - b.start);

  const byValue = new Map<number, KeycodeDef>();
  const byName = new Map<string, KeycodeDef>();
  for (const def of keycodes) {
    byValue.set(def.value, def);
    byName.set(def.key, def);
    for (const alias of def.aliases) byName.set(alias, def);
  }
  const rangeByDefine = new Map(ranges.map((r) => [r.define, r]));
  const spec: KeycodeSpec = { version: v, keycodes, ranges, byValue, byName, rangeByDefine };
  cache.set(v, spec);
  return spec;
}

/** The range a value falls into. */
export function rangeOf(spec: KeycodeSpec, value: number): RangeDef | undefined {
  return spec.ranges.find((r) => value >= r.start && value <= r.end);
}

// ── Layouts (extras): labels for languages, e.g. Russian ──────────────

export interface LanguageAlias {
  /** Base keycode, e.g. KC_Q or S(KC_1). */
  base: string;
  key: string;
  label?: string;
}

/** Available layouts: russian, german, us … */
export function listLanguages(): string[] {
  const set = new Set<string>();
  for (const name of Object.keys(DATA.extras)) {
    const m = name.match(/^keycodes_(.+)_(\d+\.\d+\.\d+)\.hjson$/);
    if (m) set.add(m[1]);
  }
  return [...set].sort();
}

const langCache = new Map<string, LanguageAlias[]>();

/** Layout aliases: which character a key produces (for key labels). */
export function loadLanguage(lang: string): LanguageAlias[] {
  const cached = langCache.get(lang);
  if (cached) return cached;
  // Exact name match: “russian” must not capture “russian_typewriter”.
  const re = new RegExp(`^keycodes_${lang.replace(/[^\w]/g, '')}_(\\d+\\.\\d+\\.\\d+)\\.hjson$`);
  const files = Object.keys(DATA.extras)
    .filter((n) => re.test(n))
    .sort();
  const merged = mergeOrderedDicts(files.map((f) => structuredClone(DATA.extras[f])));
  const out: LanguageAlias[] = [];
  for (const [base, entry] of Object.entries((merged.aliases ?? {}) as JsonObject)) {
    if (isObject(entry) && typeof entry.key === 'string') {
      out.push({ base, key: entry.key, label: typeof entry.label === 'string' ? entry.label : undefined });
    }
  }
  langCache.set(lang, out);
  return out;
}
