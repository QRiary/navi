/**
 * The user's own themes: a name + the palette colors + the look effects, one file each in <userData>/themes/<id>.navi-theme.json
 * (the browser build keeps them in localStorage). The same file format is used for export / import.
 * Pure functions only; the store is src/store/themesStore.ts.
 */
import { PALETTE_KEYS, THEME_PRESETS, completePalette, type AppSettings, type ColorScheme, type PaletteKey, type PresetPalette, type ThemePalette, type ThemePreset } from '../config/theme.config';
import { isHexColor, luminance } from './color';

/** Colors added after the format: a theme file without them takes its cell / border. */
const OPTIONAL_COLORS: readonly PaletteKey[] = ['card', 'key', 'keyBorder'];

export const THEME_FILE_FORMAT = 'navi.theme';
export const THEME_FILE_EXT = 'navi-theme.json';
export const THEME_FILTERS = [{ name: 'NAVI theme', extensions: ['json'] }];
/** Longest theme name (it is also shown on the card). */
export const THEME_NAME_MAX = 40;

/**
 * Look effects a theme carries (Midnight turns the scan lines, noise and top light off). "animations" is not one:
 * it is a motion preference of the person, not part of a look.
 */
export const THEME_EFFECT_KEYS = ['scanlines', 'noise', 'vignette', 'glow', 'glitch', 'wires'] as const;
export type ThemeEffectKey = (typeof THEME_EFFECT_KEYS)[number];
export type ThemeEffects = Pick<AppSettings['effects'], ThemeEffectKey>;
const NUMBER_EFFECTS = ['scanlines', 'noise', 'vignette', 'glow'] as const;

export interface UserTheme {
  /** File name without the extension and the value of "theme" in the config: lowercase letters, digits, "-". */
  id: string;
  name: string;
  palette: ThemePalette;
  /** Missing in a file without effects: picking the theme then leaves the effects as they are. */
  effects?: ThemeEffects;
}

export type ParseResult = { ok: true; name: string; palette: ThemePalette; effects?: ThemeEffects } | { ok: false; error: { en: string; ru: string } };

/** The file text of a theme (stable key order, so a saved file diffs cleanly). */
export function serializeTheme(theme: Pick<UserTheme, 'name' | 'palette' | 'effects'>): string {
  const colors: Record<string, string> = {};
  for (const key of PALETTE_KEYS) colors[key] = theme.palette[key].toLowerCase();
  const effects = theme.effects ? pickEffects(theme.effects) : undefined;
  return `${JSON.stringify({ format: THEME_FILE_FORMAT, version: 1, name: theme.name, scheme: theme.palette.scheme, colors, effects }, null, 2)}\n`;
}

/** Only the theme's effect keys, in their order. */
export function pickEffects(effects: ThemeEffects): ThemeEffects {
  const out = {} as Record<ThemeEffectKey, number | boolean>;
  for (const key of THEME_EFFECT_KEYS) out[key] = effects[key];
  return out as ThemeEffects;
}

/** True when the current effects differ from the theme's (a theme without effects never differs). */
export function effectsDiffer(theme: ThemeEffects | undefined, current: AppSettings['effects']): boolean {
  return !!theme && THEME_EFFECT_KEYS.some((k) => theme[k] !== current[k]);
}

/** Reads a theme file (own or someone else's). Every one of the 13 colors must be #rrggbb. */
export function parseTheme(text: string): ParseResult {
  const fail = (en: string, ru: string): ParseResult => ({ ok: false, error: { en, ru } });
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return fail('The file is not JSON.', 'Файл — не JSON.');
  }
  if (!isRecord(data) || data.format !== THEME_FILE_FORMAT) return fail('This is not a NAVI theme file.', 'Это не файл темы NAVI.');
  if (typeof data.version !== 'number' || data.version > 1) return fail('The theme is from a newer NAVI: update the app.', 'Тема из более новой версии NAVI: обновите приложение.');
  const name = typeof data.name === 'string' ? cleanName(data.name) : '';
  if (!name) return fail('The theme has no name.', 'У темы нет имени.');
  if (!isRecord(data.colors)) return fail('The theme has no colors.', 'В теме нет цветов.');
  const colors = data.colors;
  const bad = PALETTE_KEYS.filter((k) => !(OPTIONAL_COLORS.includes(k) && colors[k] === undefined) && (typeof colors[k] !== 'string' || !isHexColor(colors[k] as string)));
  if (bad.length) return fail(`Colors missing or not #rrggbb: ${bad.join(', ')}.`, `Цвета отсутствуют или не #rrggbb: ${bad.join(', ')}.`);
  const given = {} as PresetPalette;
  for (const key of PALETTE_KEYS) if (colors[key] !== undefined) given[key] = (colors[key] as string).toLowerCase();
  const palette = completePalette(given);
  palette.scheme = data.scheme === 'dark' || data.scheme === 'light' ? data.scheme : schemeOf(palette.background);
  if (data.effects === undefined) return { ok: true, name, palette };
  const fx = data.effects;
  if (!isRecord(fx)) return fail('The theme effects are not an object.', 'Эффекты темы — не объект.');
  const badFx = THEME_EFFECT_KEYS.filter((k) =>
    (NUMBER_EFFECTS as readonly string[]).includes(k) ? typeof fx[k] !== 'number' || !(Number(fx[k]) >= 0 && Number(fx[k]) <= 1) : typeof fx[k] !== 'boolean',
  );
  if (badFx.length) return fail(`Effects missing or out of range: ${badFx.join(', ')}.`, `Эффекты отсутствуют или вне диапазона: ${badFx.join(', ')}.`);
  return { ok: true, name, palette, effects: pickEffects(fx as unknown as ThemeEffects) };
}

/** Light or dark by the background, for a file that does not say. */
export function schemeOf(background: string): ColorScheme {
  return luminance(background) > 0.35 ? 'light' : 'dark';
}

/** One line, no control characters, at most THEME_NAME_MAX characters. */
export function cleanName(name: string): string {
  return name
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, THEME_NAME_MAX)
    .trim();
}

/** A name not used yet: "Midnight", then "Midnight (2)", "Midnight (3)"… (case-insensitive). */
export function uniqueName(name: string, taken: readonly string[]): string {
  const used = new Set(taken.map((n) => n.toLowerCase()));
  if (!used.has(name.toLowerCase())) return name;
  for (let i = 2; ; i++) {
    const candidate = `${name} (${i})`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}

/** The id for a name: "Midnight (2)" → "midnight-2"; never the id of a built-in palette or another theme. */
export function idForName(name: string, takenIds: readonly string[]): string {
  const base =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'theme';
  const used = new Set([...takenIds, ...THEME_PRESETS.map((p) => p.id)]);
  if (!used.has(base)) return base;
  for (let i = 2; ; i++) if (!used.has(`${base}-${i}`)) return `${base}-${i}`;
}

/** Valid id of a stored theme (also checked by the main process). */
export function isThemeId(id: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,59}$/.test(id);
}

export function toPreset(theme: UserTheme): ThemePreset {
  return { id: theme.id, name: theme.name, description: { en: 'your theme', ru: 'ваша тема' }, palette: theme.palette, own: true };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
