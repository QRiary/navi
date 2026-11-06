/**
 * A sequence of basic keys as text: “d d”, “g h”, “KC_F1 x” ⇄ keycodes 0x04–0xFF.
 * For the leader key: QMK compares exactly the basic keycodes (US layout — as printed on the key).
 */
import { tryParseQmk } from './codec';
import type { KeycodeSpec } from './spec';

const PUNCT: Record<string, number> = { '-': 0x2d, '=': 0x2e, '[': 0x2f, ']': 0x30, '\\': 0x31, ';': 0x33, "'": 0x34, '`': 0x35, ',': 0x36, '.': 0x37, '/': 0x38 };
const PUNCT_BACK = new Map(Object.entries(PUNCT).map(([ch, v]) => [v, ch]));

function charKey(ch: string): number | null {
  const c = ch.toLowerCase();
  if (c >= 'a' && c <= 'z') return 0x04 + c.charCodeAt(0) - 97;
  if (c >= '1' && c <= '9') return 0x1e + c.charCodeAt(0) - 49;
  if (c === '0') return 0x27;
  return PUNCT[c] ?? null;
}

export function parseKeySequence(spec: KeycodeSpec, text: string, max = 5): { keys: number[] } | { error: { en: string; ru: string } } {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return { error: { en: 'Type 1–5 keys separated by spaces, e.g. “d d”.', ru: 'Введите 1–5 клавиш через пробел, например «d d».' } };
  if (tokens.length > max) return { error: { en: `At most ${max} keys.`, ru: `Не больше ${max} клавиш.` } };
  const keys: number[] = [];
  for (const tok of tokens) {
    let v = tok.length === 1 ? charKey(tok) : null;
    if (v === null) {
      const r = tryParseQmk(spec, tok);
      v = 'error' in r ? null : r.value;
    }
    if (v === null) return { error: { en: `Unknown key “${tok}” — use Latin letters, digits or QMK names (KC_F1).`, ru: `Неизвестная клавиша «${tok}» — латинские буквы, цифры или имена QMK (KC_F1).` } };
    if (v < 0x04 || v > 0xff) return { error: { en: `“${tok}” is not a plain key.`, ru: `«${tok}» — не простая клавиша.` } };
    keys.push(v);
  }
  return { keys };
}

export function sequenceText(spec: KeycodeSpec, keys: number[]): string {
  return keys
    .map((v) => {
      if (v >= 0x04 && v <= 0x1d) return String.fromCharCode(97 + v - 0x04);
      if (v >= 0x1e && v <= 0x26) return String(v - 0x1e + 1);
      if (v === 0x27) return '0';
      return PUNCT_BACK.get(v) ?? spec.byValue.get(v)?.key ?? `0x${v.toString(16)}`;
    })
    .join(' ');
}
