import { describe, expect, it } from 'vitest';
import { parseConfig } from '../config/configFile';
import { THEME_PRESETS, getPreset, setOwnPresets } from '../config/theme.config';
import { resolvePalette } from './applyTheme';
import { cleanName, effectsDiffer, idForName, parseTheme, schemeOf, serializeTheme, toPreset, uniqueName, type UserTheme } from './userThemes';

const midnight: UserTheme = {
  id: 'midnight',
  name: 'Midnight',
  palette: { ...THEME_PRESETS[0].palette, background: '#000000', accent: '#3b1c94' },
  effects: { scanlines: 0, noise: 0, vignette: 0, glow: 0, glitch: false, wires: false },
};

describe('theme files', () => {
  it('round-trip: name, scheme, all 13 colors and the effects', () => {
    const parsed = parseTheme(serializeTheme(midnight));
    expect(parsed).toEqual({ ok: true, name: 'Midnight', palette: midnight.palette, effects: midnight.effects });
  });

  it('a file without effects is fine and has none', () => {
    const data = JSON.parse(serializeTheme(midnight));
    delete data.effects;
    const parsed = parseTheme(JSON.stringify(data));
    expect(parsed.ok && parsed.effects).toBeUndefined();
  });

  it('rejects what is not a usable theme', () => {
    const base = JSON.parse(serializeTheme(midnight));
    const bad = [
      'not json',
      '[]',
      JSON.stringify({ ...base, format: 'other' }),
      JSON.stringify({ ...base, version: 2 }),
      JSON.stringify({ ...base, name: '  ' }),
      JSON.stringify({ ...base, colors: { ...base.colors, text: 'red' } }),
      JSON.stringify({ ...base, colors: { ...base.colors, danger: undefined } }),
      JSON.stringify({ ...base, colors: { ...base.colors, text: '#fff;}body{' } }),
      JSON.stringify({ ...base, effects: { ...base.effects, noise: 2 } }),
      JSON.stringify({ ...base, effects: { ...base.effects, glitch: 'yes' } }),
    ];
    for (const text of bad) expect(parseTheme(text).ok, text).toBe(false);
  });

  it('a missing scheme comes from the background', () => {
    const data = JSON.parse(serializeTheme(midnight));
    delete data.scheme;
    data.colors.background = '#f2efe8';
    const parsed = parseTheme(JSON.stringify(data));
    expect(parsed.ok && parsed.palette.scheme).toBe('light');
    expect(schemeOf('#000000')).toBe('dark');
  });
});

describe('names and ids', () => {
  it('names are one trimmed line of at most 40 characters', () => {
    expect(cleanName('  Mid\nnight  ')).toBe('Mid night');
    expect(cleanName('x'.repeat(60))).toHaveLength(40);
  });

  it('a used name gets (2), (3)…', () => {
    expect(uniqueName('Midnight', [])).toBe('Midnight');
    expect(uniqueName('Midnight', ['midnight', 'Midnight (2)'])).toBe('Midnight (3)');
  });

  it('ids are slugs, never a built-in palette id or a taken one', () => {
    expect(idForName('Midnight (2)', [])).toBe('midnight-2');
    expect(idForName('Mono', [])).toBe('mono-2');
    expect(idForName('Midnight', ['midnight'])).toBe('midnight-2');
    expect(idForName('Полночь', [])).toBe('theme');
  });
});

describe('own themes in the config', () => {
  it('"theme": an own id resolves once the theme is known; unknown is a warning, not a rejected config', () => {
    setOwnPresets([]);
    const before = parseConfig('{ "theme": "midnight" }');
    expect(before.settings?.theme).toBe('midnight');
    expect(before.issues.map((i) => i.level)).toEqual(['warning']);
    expect(resolvePalette(before.settings!).background).toBe(THEME_PRESETS[0].palette.background);

    setOwnPresets([toPreset(midnight)]);
    const after = parseConfig('{ "theme": "midnight" }');
    expect(after.issues).toEqual([]);
    expect(resolvePalette(after.settings!).background).toBe('#000000');
    expect(getPreset('midnight').own).toBe(true);
    setOwnPresets([]);
  });

  it('effects differ only when the theme has effects and one of them changed', () => {
    const fx = { ...midnight.effects!, animations: true };
    expect(effectsDiffer(midnight.effects, fx)).toBe(false);
    expect(effectsDiffer(midnight.effects, { ...fx, animations: false })).toBe(false);
    expect(effectsDiffer(midnight.effects, { ...fx, noise: 0.1 })).toBe(true);
    expect(effectsDiffer(undefined, { ...fx, noise: 0.1 })).toBe(false);
  });
});
