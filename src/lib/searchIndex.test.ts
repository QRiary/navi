/**
 * Search (ui-cleanup step 8): the filter match, the sections registry, and the global index and its ranking on a
 * project with the kinds of things the owner searches for.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { parseQmk } from '../core/keycodes/codec';
import { loadSpec } from '../core/keycodes/spec';
import { createDilemmaProject, KC_NO } from '../core/project/factory';
import { activeGeometry, activeKeymap, fillLayer, insertLayer, setKeycodes } from '../core/project/ops';
import type { Project } from '../core/project/types';
import { setLanguage } from '../i18n';
import { matchesQuery } from './find';
import { labelContext } from './projectContext';
import { buildSearchIndex, keyPlace, searchItems } from './searchIndex';
import { currentTab, defaultTab, SECTIONS, tabRoute } from './sections';
import { SETTING_ITEMS } from './settingsIndex';
import { parseHash } from './router';

const spec = loadSpec('latest');
const q = (s: string) => parseQmk(spec, s);

function project(): Project {
  let p = createDilemmaProject();
  let id = activeKeymap(p).id;
  while (activeKeymap(p).layers.length < 3) p = insertLayer(p, id, spec, 'L', activeKeymap(p).layers.length);
  id = activeKeymap(p).id;
  for (let l = 0; l < 3; l++) p = fillLayer(p, id, l, KC_NO);
  const km = activeKeymap(p);
  p = {
    ...p,
    keymaps: p.keymaps.map((k) => (k.id === id ? { ...k, layers: km.layers.map((l, n) => ({ ...l, name: ['Base', 'Nav', 'Num'][n] })) } : k)),
    combos: [{ id: 'c1', name: 'CM_J_K_ESC', keys: [[0, 1], [0, 2]], result: q('KC_ESC') }],
    tapDances: [{ id: 'td1', index: 0, name: 'TD_CAPS', tap: q('KC_LSFT'), hold: 0, doubleTap: q('KC_CAPS'), tapHold: 0 }],
    keyAliases: [{ id: 'a1', label: 'Copy', keycode: q('C(KC_C)') }],
    macros: [{ id: 'm1', index: 2, name: 'email', steps: [{ type: 'text', text: 'me@example.com' }] }],
  };
  p = setKeycodes(p, id, 0, [[0, 1]], q('KC_J'));
  p = setKeycodes(p, id, 0, [[0, 2]], q('KC_K'));
  p = setKeycodes(p, id, 1, [[0, 1]], q('KC_LEFT'));
  p = setKeycodes(p, id, 2, [[1, 0]], q('C(KC_C)'));
  return p;
}

const index = (p: Project = project()) => buildSearchIndex({ project: p, spec, ctx: labelContext(p, spec, { os: 'windows', hostLayout: 'none' }), projects: [] });

afterEach(() => setLanguage('en'));

describe('matchesQuery', () => {
  it('needs every word, in any field and order, ignoring case and ё', () => {
    expect(matchesQuery('', 'x')).toBe(true);
    expect(matchesQuery('esc j', 'J + K → Esc', 'CM_J')).toBe(true);
    expect(matchesQuery('esc tab', 'J + K → Esc')).toBe(false);
    expect(matchesQuery('ещё', 'Ещё')).toBe(true);
    expect(matchesQuery('еще', 'ещё')).toBe(true);
    expect(matchesQuery('0', 0)).toBe(true);
    expect(matchesQuery('x', undefined, null, false)).toBe(false);
  });
});

describe('sections registry', () => {
  it('routes every section and knows each default tab', () => {
    for (const s of SECTIONS) expect(parseHash(`#/${s.id}`).section).toBe(s.id);
    expect(defaultTab('advanced')).toBe('tapdance');
    expect(currentTab('advanced', 'nope')).toBe('tapdance');
    expect(currentTab('firmware', 'build')).toBe('build');
    expect(tabRoute('settings', 'quick')).toEqual({ section: 'settings' });
    expect(tabRoute('settings', 'config')).toEqual({ section: 'settings', tab: 'config' });
  });

  it('has unique tab ids per section and unique setting keys', () => {
    for (const s of SECTIONS) expect(new Set(s.tabs?.map((tab) => tab.id)).size).toBe(s.tabs?.length ?? 0);
    expect(new Set(SETTING_ITEMS.map((s) => s.key)).size).toBe(SETTING_ITEMS.length);
  });
});

describe('global search', () => {
  it('finds a key by its name and says where it is', () => {
    const hits = searchItems(index(), 'left');
    const key = hits.find((h) => h.kind === 'key');
    expect(key?.title).toBe('←');
    expect(key?.detail).toContain('Nav');
    expect(key?.keyboard).toEqual({ layer: 1, pos: [0, 1] });
  });

  it('finds a key by its alias and by its QMK expression', () => {
    const byAlias = searchItems(index(), 'copy').filter((h) => h.kind === 'key');
    expect(byAlias.map((h) => h.keyboard?.layer)).toEqual([2]);
    expect(searchItems(index(), 'KC_LEFT').some((h) => h.kind === 'key' && h.keyboard?.layer === 1)).toBe(true);
    expect(searchItems(index(), 'copy').some((h) => h.kind === 'alias' && h.findId === 'alias:a1')).toBe(true);
  });

  it('lists combos, tap dances, macros, layers with the item to land on', () => {
    const items = index();
    expect(searchItems(items, 'esc').find((h) => h.kind === 'combo')).toMatchObject({ title: 'J + K → Esc', findId: 'combo:c1', route: { section: 'advanced', tab: 'combos' } });
    expect(searchItems(items, 'td_caps')[0]).toMatchObject({ kind: 'tapdance', findId: 'tapdance:td1' });
    expect(searchItems(items, 'example.com')[0]).toMatchObject({ kind: 'macro', findId: 'macro:2', route: { section: 'macros' } });
    expect(searchItems(items, 'nav')[0]).toMatchObject({ kind: 'layer', keyboard: { layer: 1 } });
  });

  it('finds pages, settings and QMK params, also by the other language', () => {
    const items = index();
    expect(searchItems(items, 'combos')[0]).toMatchObject({ kind: 'page', route: { section: 'advanced', tab: 'combos' } });
    expect(searchItems(items, 'комбо').some((h) => h.kind === 'page')).toBe(true);
    expect(searchItems(items, 'tapping_term').some((h) => h.kind === 'param' && h.findId === 'cfg:TAPPING_TERM')).toBe(true);
    expect(searchItems(items, 'live write')[0]).toMatchObject({ kind: 'setting', findId: 'setting:device.liveWrite' });
    setLanguage('ru');
    expect(searchItems(index(), 'live write')[0]).toMatchObject({ kind: 'setting', title: 'Живая запись' });
  });

  it('shows the pages for an empty query and nothing for nonsense', () => {
    const empty = searchItems(index(), '  ');
    expect(empty.length).toBe(SECTIONS.length);
    expect(empty.every((h) => h.kind === 'page')).toBe(true);
    expect(searchItems(index(), 'zzqqxx')).toEqual([]);
  });

  it('ranks an exact title over a partial one', () => {
    const hits = searchItems(index(), 'layers');
    expect(hits[0]).toMatchObject({ kind: 'page', title: 'Layers' });
  });

  it('caps keys so one keycode on many layers does not push the rest out', () => {
    let p = project();
    const id = activeKeymap(p).id;
    for (let l = 0; l < 3; l++) p = fillLayer(p, id, l, q('KC_A'));
    const hits = searchItems(index(p), 'a', 200);
    expect(hits.filter((h) => h.kind === 'key').length).toBe(30);
  });

  it('names the half, row and column of a split board key', () => {
    const p = project();
    const geo = activeGeometry(p);
    const right = geo.keys.find((k) => k.half === 'right' && k.matrix)!;
    expect(keyPlace(p, right)).toMatch(/^right half, row \d, column \d+$/);
    const rows = p.hardware.matrix.rows;
    const row = Number(keyPlace(p, right).match(/row (\d)/)![1]);
    expect(row).toBeLessThanOrEqual(p.hardware.split.enabled ? rows / 2 : rows);
  });
});
