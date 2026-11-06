import { describe, expect, it } from 'vitest';
import { buildCatalog } from '../core/keycodes/catalog';
import { friendlyName } from '../core/keycodes/friendly';
import { keyLabel } from '../core/keycodes/labels';
import { loadSpec } from '../core/keycodes/spec';
import { createDilemmaProject } from '../core/project/factory';
import { addLanguage, languageKeycodes, patchLanguage } from '../core/project/languages';
import { catalogContext, labelContext } from './projectContext';

const spec = loadSpec('latest');

function project() {
  let p = addLanguage(createDilemmaProject());
  p = patchLanguage(p, p.languages[0].id, { name: 'English', code: 'en' });
  p = addLanguage(p);
  return patchLanguage(p, p.languages[1].id, { name: 'Russian', code: 'ru' });
}

describe('language keys in labels and the catalog', () => {
  const p = project();
  const ctx = labelContext(p, spec, { os: 'windows', hostLayout: 'none' });
  const ru = languageKeycodes(spec, 1);

  it('read as arrows with the language name; the QMK name is the C name', () => {
    expect(friendlyName(spec, ru.to, ctx)).toEqual({ text: '→ Russian', qmk: 'NAVI_TO_RU' });
    expect(friendlyName(spec, ru.toggle, ctx)).toEqual({ text: '⇄ Russian', qmk: 'NAVI_TOGGLE_RU' });
    expect(keyLabel(spec, ru.to, ctx)).toMatchObject({ main: '→RU', kind: 'custom', qmk: 'NAVI_TO_RU' });
  });

  it('the catalog has a Languages group with both keys of each language', () => {
    const items = buildCatalog(spec, catalogContext(p, spec, ctx)).filter((i) => i.category === 'languages');
    expect(items.map((i) => i.name)).toEqual(['NAVI_TO_EN', 'NAVI_TOGGLE_EN', 'NAVI_TO_RU', 'NAVI_TOGGLE_RU']);
  });

  it('no languages, no group', () => {
    const none = createDilemmaProject();
    const c = labelContext(none, spec, { os: 'windows', hostLayout: 'none' });
    expect(buildCatalog(spec, catalogContext(none, spec, c)).some((i) => i.category === 'languages')).toBe(false);
  });
});
