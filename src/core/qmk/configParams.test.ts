/** The config.h parameters shown in Advanced → QMK settings: every one is explained in both languages. */
import { describe, expect, it } from 'vitest';
import { configParams, groupTitle } from './configParams';

describe('configParams', () => {
  const params = configParams();

  it('has parameters', () => {
    expect(params.length).toBeGreaterThan(30);
  });

  it('every shown parameter has an English and a Russian hint', () => {
    const missing = params.filter((p) => !p.hint?.en.trim() || !p.hint?.ru.trim()).map((p) => p.define);
    expect(missing).toEqual([]);
  });

  it('every shown parameter has a Russian title that is not just its #define name', () => {
    const bad = params.filter((p) => !p.title.ru.trim() || p.title.ru === p.define).map((p) => p.define);
    expect(bad).toEqual([]);
  });

  it('docs links point at docs.qmk.fm', () => {
    const bad = params.filter((p) => p.docs !== undefined && !p.docs.startsWith('https://docs.qmk.fm/')).map((p) => p.define);
    expect(bad).toEqual([]);
  });

  it('group titles exist in both languages', () => {
    for (const g of new Set(params.map((p) => p.group))) {
      const t = groupTitle(g);
      expect(t.en && t.ru).toBeTruthy();
    }
  });
});
