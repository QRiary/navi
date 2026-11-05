import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseConfig, setConfigValue, stripJsonc } from './configFile';
import { DEFAULT_SETTINGS } from './theme.config';

const defaultText = readFileSync(fileURLToPath(new URL('./default.config.jsonc', import.meta.url)), 'utf8');

describe('config', () => {
  it('the default file matches DEFAULT_SETTINGS and has no remarks', () => {
    const result = parseConfig(defaultText);
    expect(result.issues).toEqual([]);
    expect(result.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('understands comments, trailing commas and // inside strings', () => {
    const text = `{
      // comment
      "brand": { "name": "A//B", "tagline": "x", }, /* block */
    }`;
    expect(JSON.parse(stripJsonc(text)).brand.name).toBe('A//B');
    expect(parseConfig(text).settings?.brand.name).toBe('A//B');
  });

  it('missing parameters take their defaults', () => {
    const s = parseConfig('{ "theme": "amber" }').settings!;
    expect(s.theme).toBe('amber');
    expect(s.layout).toEqual(DEFAULT_SETTINGS.layout);
  });

  it('reports the line number on a syntax error', () => {
    const result = parseConfig('{\n  "theme": "amber"\n  "layout": {}\n}');
    expect(result.settings).toBeNull();
    expect(result.issues[0].line).toBe(3);
  });

  it('checks types, options and ranges', () => {
    const result = parseConfig(`{
  "layout": { "density": "huge", "sidebar": "yes" },
  "effects": { "noise": 5 },
  "colors": { "accent": "red" }
}`);
    expect(result.settings).toBeNull();
    const messages = result.issues.map((i) => `${i.path}: ${i.message}`).join('\n');
    expect(messages).toContain('layout.density');
    expect(messages).toContain('layout.sidebar');
    expect(messages).toContain('effects.noise');
    expect(messages).toContain('colors.accent');
    expect(result.issues.find((i) => i.path === 'layout.density')?.line).toBe(2);
  });

  it('unknown parameters are only a warning', () => {
    const result = parseConfig('{ "foo": 1 }');
    expect(result.settings).not.toBeNull();
    expect(result.issues[0].level).toBe('warning');
  });

  it('accepts own colors and CSS variables', () => {
    const s = parseConfig('{ "colors": { "accent": "#ff0000", "text": null }, "vars": { "--x": "2px" } }').settings!;
    expect(s.colors).toEqual({ accent: '#ff0000' });
    expect(s.vars).toEqual({ '--x': '2px' });
  });

  it('an old palette name is accepted with a warning', () => {
    const result = parseConfig('{ "theme": "lanvoid" }');
    expect(result.settings?.theme).toBe('mono');
    expect(result.issues[0].level).toBe('warning');
  });

  it('changes a value in the text without touching comments', () => {
    const text = '{\n  // palette\n  "theme": "mono"\n}';
    expect(setConfigValue(text, 'theme', 'amber')).toBe('{\n  // palette\n  "theme": "amber"\n}');
  });

  it('a new parameter with a section is added inside the section (old configs without panel widths)', () => {
    const text = '{\n  "theme": "mono",\n  "layout": {\n    "sidebar": true\n  }\n}';
    const updated = setConfigValue(text, 'layout.sidebarWidth', 300);
    const result = parseConfig(updated);
    expect(result.issues).toEqual([]);
    expect(result.settings?.layout.sidebarWidth).toBe(300);
    expect(result.settings?.layout.sidebar).toBe(true);
    // Again — the existing line changes instead of a new one being added.
    const again = setConfigValue(updated, 'layout.sidebarWidth', 320);
    expect(again.match(/sidebarWidth/g)).toHaveLength(1);
    expect(parseConfig(again).settings?.layout.sidebarWidth).toBe(320);
  });

  it('null clears an override and keeps the comments', () => {
    const text = '{\n  "colors": {\n    "accent": "#ff0000", // active\n    "text": null\n  }\n}';
    const cleared = setConfigValue(text, 'colors.accent', null);
    expect(cleared).toBe('{\n  "colors": {\n    "accent": null, // active\n    "text": null\n  }\n}');
    expect(parseConfig(cleared).issues).toEqual([]);
    const set = setConfigValue(cleared, 'colors.accent', '#00ff00');
    expect(parseConfig(set).settings?.colors.accent).toBe('#00ff00');
    // not in the text yet: added as null
    expect(parseConfig(setConfigValue('{ "theme": "mono" }', 'colors.danger', null)).issues).toEqual([]);
  });

  it('no section — it is created', () => {
    const result = parseConfig(setConfigValue('{\n  "theme": "mono"\n}', 'layout.inspectorWidth', 400));
    expect(result.issues).toEqual([]);
    expect(result.settings?.layout.inspectorWidth).toBe(400);
  });

  it('panel widths are checked against the limits', () => {
    const result = parseConfig('{ "layout": { "sidebarWidth": 9000 } }');
    expect(result.settings).toBeNull();
    expect(result.issues[0].message).toContain('64');
  });
});
