import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, THEME_PRESETS, type AppSettings } from '../config/theme.config';
import { computeThemeAttributes, computeThemeVariables } from './applyTheme';
import { readableTextOn } from './color';

const withSettings = (patch: Partial<AppSettings>): AppSettings => ({ ...DEFAULT_SETTINGS, ...patch });

describe('computeThemeVariables', () => {
  it('takes colors from the chosen palette', () => {
    const vars = computeThemeVariables(withSettings({ theme: 'amber' }));
    expect(vars['--accent-color']).toBe(THEME_PRESETS.find((p) => p.id === 'amber')!.palette.accent);
  });

  it('own colors win over the palette, invalid ones are ignored', () => {
    const vars = computeThemeVariables(withSettings({ colors: { accent: '#ff0000', text: 'red' } }));
    expect(vars['--accent-color']).toBe('#ff0000');
    expect(vars['--text-primary']).toBe(THEME_PRESETS[0].palette.text);
  });

  it('key colors follow cell and border unless set', () => {
    const follow = computeThemeVariables(withSettings({ colors: { cell: '#111111', border: '#222222' } }));
    expect(follow['--key-background']).toBe('#111111');
    expect(follow['--key-border']).toBe('#222222');
    const own = computeThemeVariables(withSettings({ colors: { cell: '#111111', key: '#333333', keyBorder: '#444444' } }));
    expect(own['--key-background']).toBe('#333333');
    expect(own['--key-border']).toBe('#444444');
  });

  it('meters are a gradient of two colors', () => {
    const vars = computeThemeVariables(withSettings({ colors: { meterFrom: '#000001', meterTo: '#000002' } }));
    expect(vars['--meter-gradient']).toBe('linear-gradient(90deg, #000001, #000002)');
  });

  it('applies corner radii and density', () => {
    const vars = computeThemeVariables(
      withSettings({ shape: { panelRadius: 20, keyRadius: 6 }, layout: { ...DEFAULT_SETTINGS.layout, density: 'compact' } }),
    );
    expect(vars['--panel-radius']).toBe('20px');
    expect(vars['--key-radius']).toBe('6px');
    expect(vars['--row-height']).toBe('40px');
  });

  it('variables from "vars" override the computed ones', () => {
    const vars = computeThemeVariables(withSettings({ vars: { '--panel-radius': '3px', '--my-var': '1' } }));
    expect(vars['--panel-radius']).toBe('3px');
    expect(vars['--my-var']).toBe('1');
  });

  it('old palette ids work as aliases', () => {
    expect(computeThemeVariables(withSettings({ theme: 'red-room' }))['--accent-color']).toBe(
      THEME_PRESETS.find((p) => p.id === 'alert')!.palette.accent,
    );
  });

  it('an unknown palette is replaced with the default one', () => {
    expect(computeThemeVariables(withSettings({ theme: 'nope' }))['--app-background']).toBe(
      THEME_PRESETS[0].palette.background,
    );
  });
});

describe('computeThemeAttributes', () => {
  it('glitch only with animations on; scheme from the palette', () => {
    const effects = { ...DEFAULT_SETTINGS.effects, glitch: true, animations: false };
    expect(computeThemeAttributes(withSettings({ effects }))['data-glitch']).toBe('off');
    expect(computeThemeAttributes(withSettings({ theme: 'paper' }))['data-scheme']).toBe('light');
  });
});

describe('readableTextOn', () => {
  it('dark text on light, light text on dark', () => {
    expect(readableTextOn('#c6f432')).toBe('#0a0b0a');
    expect(readableTextOn('#101010')).toBe('#f7f7f5');
  });
});
