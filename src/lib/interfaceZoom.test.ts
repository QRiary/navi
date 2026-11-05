import { describe, expect, it } from 'vitest';
import { parseConfig, setConfigValue, DEFAULT_CONFIG_TEXT } from '../config/configFile';
import { stepZoom } from './interfaceZoom';

describe('interface size', () => {
  it('steps by 10% on the grid and stays within 80…200%', () => {
    expect(stepZoom(1, 1)).toBe(1.1);
    expect(stepZoom(1.1, 1)).toBe(1.2);
    expect(stepZoom(1, -1)).toBe(0.9);
    expect(stepZoom(0.8, -1)).toBe(0.8);
    expect(stepZoom(2, 1)).toBe(2);
    expect(stepZoom(1.9, 1)).toBe(2);
    // a hand-written 1.25 snaps to the grid
    expect(stepZoom(1.25, 1)).toBe(1.4);
    expect(stepZoom(1.7, 0)).toBe(1);
    expect(stepZoom(Number.NaN, 1)).toBe(1.1);
  });

  it('lives in the config and is range-checked there', () => {
    expect(parseConfig(DEFAULT_CONFIG_TEXT).settings?.layout.zoom).toBe(1);
    const text = setConfigValue(DEFAULT_CONFIG_TEXT, 'layout.zoom', 1.3);
    expect(parseConfig(text).settings?.layout.zoom).toBe(1.3);
    const bad = parseConfig('{ "layout": { "zoom": 3 } }');
    expect(bad.settings).toBeNull(); // an error: the config is not applied
    expect(bad.issues.some((i) => i.path === 'layout.zoom')).toBe(true);
    // an old config without the line gets it added inside "layout"
    const old = setConfigValue('{\n  "layout": { "density": "compact" }\n}', 'layout.zoom', 1.5);
    expect(parseConfig(old).settings?.layout).toMatchObject({ density: 'compact', zoom: 1.5 });
  });
});
