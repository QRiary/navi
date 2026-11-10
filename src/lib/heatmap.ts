/**
 * HEATMAP (step 17): the color scale, label ink and combo ranking behind the Keymap page's heatmap view. Pure.
 *
 * Scale: a used key's shade is half its log distance from the geometric mean of all used counts (±2σ, σ at least
 * 0.75 so one outlier can't set it) and half its rank among them.
 * A few keys (space, e) take most presses: on a linear or square-root scale a key pressed 30 times looked like one
 * pressed 300 times. Never pressed = no fill (outline only). The ramp: one hue (blue), dark → light in equal
 * lightness steps, interpolated in OKLab, fit to the near-black keys; light = more presses.
 */
import type { Combo } from '../core/project/types';
import { comboCountKey, type KeyCountsFile } from '../core/project/keyCounts';

/** The scale for one set of used counts: count → position 0..1 on the ramp (null = never pressed). */
export interface HeatScale {
  at(count: number): number | null;
  /** The least, middle (nearest the ramp's middle) and most used counts with their positions: the legend's marks. */
  marks: { count: number; t: number }[];
}

/** The scale over every used count of the keymap (zeros ignored). Equal counts share the average rank. */
export function heatScale(counts: number[]): HeatScale {
  const sorted = counts.filter((c) => c > 0).sort((a, b) => a - b);
  const n = sorted.length;
  const logs = sorted.map(Math.log);
  const mean = n ? logs.reduce((a, b) => a + b, 0) / n : 0;
  const sd = Math.max(n ? Math.sqrt(logs.reduce((a, b) => a + (b - mean) ** 2, 0) / n) : 0, 0.75);
  const memo = new Map<number, number>();
  const at = (c: number): number | null => {
    if (!(c > 0) || n === 0) return null;
    let t = memo.get(c);
    if (t === undefined) {
      const first = lowerBound(sorted, c);
      const last = lowerBound(sorted, c + 0.5) - 1; // counts are whole numbers
      // A count not in the set (it can't happen from the file) takes the rank it would have.
      const tRank = n === 1 ? 0.5 : Math.min(1, Math.max(0, (first + Math.max(first, last)) / 2 / (n - 1)));
      const tLog = Math.min(1, Math.max(0, 0.5 + (Math.log(c) - mean) / (4 * sd)));
      t = 0.5 * tLog + 0.5 * tRank;
      memo.set(c, t);
    }
    return t;
  };
  const marks: HeatScale['marks'] = [];
  if (n) {
    const lo = { count: sorted[0], t: at(sorted[0])! };
    const hi = { count: sorted[n - 1], t: at(sorted[n - 1])! };
    let mid = lo;
    for (const c of sorted) {
      const t = at(c)!;
      if (Math.abs(t - 0.5) < Math.abs(mid.t - 0.5)) mid = { count: c, t };
    }
    marks.push(lo);
    if (mid.count !== lo.count && mid.count !== hi.count) marks.push(mid);
    if (hi.count !== lo.count) marks.push(hi);
  }
  return { at, marks };
}

/** First index in an ascending list whose value is >= x. */
function lowerBound(a: number[], x: number): number {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (a[m] < x) lo = m + 1;
    else hi = m;
  }
  return lo;
}

/** The ramp in OKLCH (lightness, chroma, hue), low count first: equal lightness steps (NAVI's earlier blue ramp's ends). */
export const HEAT_RAMP: [number, number, number][] = [
  [0.311, 0.062, 252],
  [0.59, 0.137, 250],
  [0.869, 0.07, 243],
];

const hex = (c: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) as [number, number, number];

const toLab = ([L, C, h]: [number, number, number]) => {
  const r = (h * Math.PI) / 180;
  return [L, C * Math.cos(r), C * Math.sin(r)];
};

/** OKLab → sRGB hex, clamped to the gamut. */
function labHex([L, a, b]: number[]): string {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return `#${rgb
    .map((x) => {
      const v = Math.min(1, Math.max(0, x));
      return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055))
        .toString(16)
        .padStart(2, '0');
    })
    .join('')}`;
}

/** Fill at position t (0..1) of the ramp. */
export function heatFill(t: number): string {
  const p = Math.min(1, Math.max(0, t)) * (HEAT_RAMP.length - 1);
  const i = Math.min(HEAT_RAMP.length - 2, Math.floor(p));
  const f = p - i;
  const a = toLab(HEAT_RAMP[i]);
  const b = toLab(HEAT_RAMP[i + 1]);
  return labHex(a.map((x, k) => x + (b[k] - x) * f));
}

/** The legend bar's background: the ramp sampled in 9 steps (a CSS gradient blends in sRGB, so it needs the steps). */
export const heatGradient = (): string => `linear-gradient(90deg, ${Array.from({ length: 9 }, (_, i) => heatFill(i / 8)).join(', ')})`;

/** A legend label of at most 4 characters (978, 3.9k, 16k, 880k, 2.4M): full counts of 5+ digits run together.
 *  `k` is the thousands suffix in the UI language. */
export function shortCount(n: number, k = 'k'): string {
  if (n < 1000) return String(n);
  const [v, unit] = n < 999_500 ? [n / 1000, k] : [n / 1_000_000, 'M'];
  return `${v < 9.95 ? v.toFixed(1).replace(/\.0$/, '') : Math.round(v)}${unit}`;
}

const luminance = (c: string) => {
  const [r, g, b] = hex(c).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const contrastRatio = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** Label color on a fill: whichever of black and white reads better (only pure black / white clear 4.5:1 at the crossover
 *  of a continuous ramp; #050505 / #e8e8e8 dipped to 4.4 there). */
export function inkOn(fill: string, dark = '#000000', light = '#ffffff'): string {
  return contrastRatio(fill, dark) >= contrastRatio(fill, light) ? dark : light;
}

export interface ComboRow {
  combo: Combo;
  count: number;
}

/** Combos by times fired, never fired first (a combo with no entry counts 0), then the least used; ties by name. */
export function comboRows(combos: Combo[], file: KeyCountsFile | null): ComboRow[] {
  return combos
    .map((combo) => ({ combo, count: file?.combos[comboCountKey(combo)] ?? 0 }))
    .sort((a, b) => a.count - b.count || (a.combo.name || a.combo.id).localeCompare(b.combo.name || b.combo.id));
}

