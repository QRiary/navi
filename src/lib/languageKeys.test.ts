import { describe, expect, it } from 'vitest';
import { buildCatalog } from '../core/keycodes/catalog';
import { parseQmk, toQmk, tryParseQmk } from '../core/keycodes/codec';
import { friendlyName } from '../core/keycodes/friendly';
import { keyLabel } from '../core/keycodes/labels';
import { loadSpec } from '../core/keycodes/spec';
import { createDilemmaProject } from '../core/project/factory';
import { addLanguage, isTypingLayer, languageKeycodes, patchLanguage, setLayerTypingTick } from '../core/project/languages';
import { setLayerTyping } from '../core/project/ops';
import type { Project } from '../core/project/types';
import { layerIdentifiers } from '../core/qmk/generate';
import { catalogContext, customKeycodeValue, labelContext, parseContext } from './projectContext';

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

describe('typing a key by name into a keycode box', () => {
  const p0 = project();
  const km = p0.keymaps[0];
  const p: Project = {
    ...p0,
    customKeycodes: [{ id: 'c1', name: 'MY_KEY', description: '', action: { type: 'none' } } as Project['customKeycodes'][number]],
    tapDances: [{ id: 't1', index: 0, name: 'TD_ESC' } as Project['tapDances'][number]],
  };
  const label = labelContext(p, spec, { os: 'windows', hostLayout: 'none' });
  const ctx = parseContext(p, spec);
  const ru = languageKeycodes(spec, 1);
  const mo1 = parseQmk(spec, 'MO(1)');

  it('reads language keys, own keycodes, tap dances and layers by name', () => {
    expect(tryParseQmk(spec, 'NAVI_TO_RU', ctx)).toEqual({ value: ru.to });
    expect(tryParseQmk(spec, 'NAVI_TOGGLE_RU', ctx)).toEqual({ value: ru.toggle });
    expect(tryParseQmk(spec, 'MY_KEY', ctx)).toEqual({ value: customKeycodeValue(spec, 0) });
    expect(tryParseQmk(spec, 'TD(TD_ESC)', ctx)).toEqual({ value: parseQmk(spec, 'TD(0)') });
    expect(tryParseQmk(spec, `MO(${layerIdentifiers(km)[1]})`, ctx)).toEqual({ value: mo1 });
  });

  it('the text a box shows reads back as the same key', () => {
    for (const v of [ru.to, ru.toggle, languageKeycodes(spec, 0).to, customKeycodeValue(spec, 0), mo1, parseQmk(spec, 'TD(0)')]) {
      expect(tryParseQmk(spec, friendlyName(spec, v, label).qmk, ctx)).toEqual({ value: v });
    }
    expect(tryParseQmk(spec, toQmk(spec, mo1, label), ctx)).toEqual({ value: mo1 });
  });
});

describe('the typing-layer tick', () => {
  it('ticked back to the default value, the layer follows the default again', () => {
    const p = project();
    const id = p.keymaps[0].id;
    const off = setLayerTypingTick(p, id, 0, false);
    expect(off.keymaps[0].layers[0].typing).toBe(false);
    const back = setLayerTypingTick(off, id, 0, true);
    expect(back.keymaps[0].layers[0].typing).toBeUndefined();
    expect(isTypingLayer(back, back.keymaps[0], 0)).toBe(true);
    expect(setLayerTypingTick(p, id, 1, true).keymaps[0].layers[1].typing).toBe(true);
    // An old pinned value equal to the default is cleared by the next tick that lands on the default.
    const pinned = setLayerTyping(p, id, 0, true);
    expect(setLayerTypingTick(setLayerTypingTick(pinned, id, 0, false), id, 0, true).keymaps[0].layers[0].typing).toBeUndefined();
  });
});
