import { describe, expect, it } from 'vitest';
import dilemmaMax from '../qmk-data/dilemma-max.keyboard.json';
import { parseKle, serializeKle } from './kle';
import {
  detectFileKind,
  exportQmkKeymapJson,
  exportViaBackup,
  importKle,
  importQmkKeymapJson,
  importQmkLayout,
  importViaBackup,
  importViaDefinition,
  layoutOrder,
  listQmkLayouts,
  stepsToViaMacro,
  viaMacroToSteps,
} from './formats';
import { parseQmk } from '../keycodes/codec';
import { analyzeKeyboard } from '../qmk/sources';
import { loadSpec } from '../keycodes/spec';
import { createDilemmaProject } from '../project/factory';
import { activeGeometry, activeKeymap, setEncoder, setKeycodes } from '../project/ops';

const spec = loadSpec('latest');
const q = (s: string) => parseQmk(spec, s);

describe('KLE', () => {
  it('positions, sizes and rotation like in kle-serial', () => {
    const { keys } = parseKle([
      { name: 'test' },
      ['a', { w: 2 }, 'b', 'c'],
      [{ y: 0.5, x: 1 }, 'd'],
      [{ r: 15, rx: 5, ry: 1 }, 'e', 'f'],
      ['g'],
    ]);
    expect(keys.map((k) => [k.labels[0], k.x, k.y, k.w])).toEqual([
      ['a', 0, 0, 1],
      ['b', 1, 0, 2],
      ['c', 3, 0, 1],
      ['d', 1, 1.5, 1],
      ['e', 5, 1, 1],
      ['f', 6, 1, 1],
      ['g', 5, 2, 1],
    ]);
    expect(keys[4]).toMatchObject({ r: 15, rx: 5, ry: 1 });
  });

  it('export → import keeps the geometry', () => {
    const src = [
      { x: 0, y: 0, w: 1, h: 1, r: 0, rx: 0, ry: 0, label: '0,0' },
      { x: 3.25, y: 1.5, w: 1.5, h: 1, r: -20, rx: 4, ry: 2, label: '1,2' },
    ];
    const { keys } = parseKle(serializeKle(src));
    expect(keys.map((k) => ({ x: k.x, y: k.y, w: k.w, h: k.h, r: k.r, rx: k.rx, ry: k.ry, label: k.labels[0] }))).toEqual(src);
  });

  it('“row,col” labels become matrix positions', () => {
    const res = importKle([['0,0', '0,1'], ['1,0', 'x']]);
    expect(res.geometry.keys.map((k) => k.matrix)).toEqual([[0, 0], [0, 1], [1, 0], null]);
    expect([res.rows, res.cols]).toEqual([2, 2]);
  });
});

describe('VIA definition', () => {
  it('matrix, VID/PID, layout options (variant 0 is taken)', () => {
    const def = {
      name: 'Test',
      vendorId: '0xAFC5',
      productId: '0xBFC5',
      matrix: { rows: 2, cols: 2 },
      layouts: {
        keymap: [
          ['0,0', '0,1\n\n\n\n\n\n\n\n0,0', { x: -1 }, '0,1\n\n\n\n\n\n\n\n0,1'],
          ['1,0', '1,1'],
        ],
      },
    };
    expect(detectFileKind(def)).toBe('via-definition');
    const res = importViaDefinition(def);
    expect(res).toMatchObject({ name: 'Test', vid: 0xafc5, pid: 0xbfc5, rows: 2, cols: 2 });
    expect(res.geometry.keys).toHaveLength(4);
    expect(res.issues.some((i) => /option/.test(i.message))).toBe(true);
  });
});

describe('QMK keyboard.json', () => {
  it('official Dilemma Max: 56 keys, 10×6 split, LAYOUT order', () => {
    const info = dilemmaMax as unknown as Record<string, unknown>;
    expect(detectFileKind(info)).toBe('qmk-info');
    expect(listQmkLayouts(info)).toEqual(['LAYOUT']);
    const res = importQmkLayout(info, 'LAYOUT', 'bastardkb/dilemma/4x6_4');
    expect(res.geometry.keys).toHaveLength(56);
    expect([res.rows, res.cols]).toEqual([10, 6]);
    expect(res.order[0]).toEqual([0, 0]);
    expect(res.order[6]).toEqual([5, 5]);
    expect(res.geometry.keys.filter((k) => k.half === 'left')).toHaveLength(28);
  });

  it('split board with direct pins: rows are the pins of one half × 2, not the layout rows × 2', () => {
    // Made-up 2×2 per half, wired direct; the layout already spans both halves (rows 0-1 left, 2-3 right).
    const layout = [
      [0, 0, 0, 0], [0, 1, 1, 0], [1, 0, 0, 1], [1, 1, 1, 1],
      [2, 0, 3, 0], [2, 1, 4, 0], [3, 0, 3, 1], [3, 1, 4, 1],
    ].map(([r, c, x, y]) => ({ matrix: [r, c], x, y }));
    const info = {
      keyboard_name: 'test split direct',
      split: { enabled: true },
      matrix_pins: { direct: [['GP0', 'GP1'], ['GP2', 'GP3']] },
      layouts: { LAYOUT: { layout } },
    };
    const res = importQmkLayout(info, 'LAYOUT');
    expect([res.rows, res.cols]).toEqual([4, 2]);
    expect(analyzeKeyboard([{ path: 'test/keyboard.json', text: JSON.stringify(info) }]).matrix).toEqual({ rows: 4, cols: 2 });
  });

  it('split board with neither pins nor matrix_size: rows come from the layout, not doubled', () => {
    const layout = [[0, 0], [1, 0], [2, 0], [3, 0]].map(([r, c], i) => ({ matrix: [r, c], x: i, y: 0 }));
    const res = importQmkLayout({ split: { enabled: true }, layouts: { LAYOUT: { layout } } }, 'LAYOUT');
    expect([res.rows, res.cols]).toEqual([4, 1]);
  });
});

describe('QMK keymap.json and VIA backup', () => {
  function project() {
    let p = createDilemmaProject();
    const km = activeKeymap(p);
    p = setKeycodes(p, km.id, 0, [[0, 0]], q('KC_ESC'));
    p = setKeycodes(p, km.id, 0, [[4, 4]], q('MO(1)'));
    p = setKeycodes(p, km.id, 1, [[1, 1]], q('LCTL_T(KC_Q)'));
    p = setEncoder(p, km.id, 0, 0, 'cw', q('KC_VOLU'));
    return p;
  }

  it('keymap.json: export → import in geometry order', () => {
    const p = project();
    const json = exportQmkKeymapJson(p, activeKeymap(p), spec, activeGeometry(p));
    expect(detectFileKind(json)).toBe('qmk-keymap');
    expect((json.layers as string[][])[0]).toContain('MO(1)');
    const back = importQmkKeymapJson(json, p, spec, layoutOrder(activeGeometry(p)));
    expect(back.issues.filter((i) => i.level === 'error')).toEqual([]);
    // Positions outside the LAYOUT macro are always KC_NO in QMK — only the layout keys are compared.
    const order = layoutOrder(activeGeometry(p));
    const at = (keys: number[]) => order.map(([r, c]) => keys[r * 6 + c]);
    expect(at(back.keymap.layers[1].keys)).toEqual(at(activeKeymap(p).layers[1].keys));
    expect(back.keymap.layers[1].keys[4 * 6 + 0]).toBe(0);
    expect(back.keymap.layers[0].encoders[0].cw).toBe(q('KC_VOLU'));
  });

  it('VIA backup: layers by matrix, macros as VIA text', () => {
    let p = project();
    p = { ...p, macros: [{ id: 'm', index: 1, name: 'copy', steps: [{ type: 'down', keycode: 0xe0 }, { type: 'tap', keycode: 0x06 }, { type: 'up', keycode: 0xe0 }, { type: 'delay', ms: 50 }, { type: 'text', text: 'ok' }] }] };
    const json = exportViaBackup(p, activeKeymap(p), spec, 16);
    expect(json.vendorProductId).toBe((0xafc5 << 16 | 0xbfc5) >>> 0);
    expect((json.macros as string[])[1]).toBe('{+KC_LCTL}{KC_C}{-KC_LCTL}{50}ok');
    expect(detectFileKind(json)).toBe('via-backup');
    const back = importViaBackup(json, p, spec);
    expect(back.keymap.layers[0].keys).toEqual(activeKeymap(p).layers[0].keys);
    expect(back.macros[0]).toEqual({ index: 1, steps: p.macros[0].steps });
  });

  it('chord {KC_LCTL,KC_C} = press both, release in reverse order', () => {
    const steps = viaMacroToSteps('{KC_LCTL,KC_C}', spec, []);
    expect(steps).toEqual([
      { type: 'down', keycode: 0xe0 },
      { type: 'down', keycode: 0x06 },
      { type: 'up', keycode: 0x06 },
      { type: 'up', keycode: 0xe0 },
    ]);
    expect(stepsToViaMacro([{ type: 'text', text: 'a{b}' }], spec)).toBe('ab');
  });
});

describe('VIA definition export', () => {
  it('VID/PID, matrix, RGB Matrix menu; importing it back gives the same matrix positions', async () => {
    const { exportViaDefinition } = await import('./formats');
    const p = createDilemmaProject();
    const geo = activeGeometry(p);
    const res = exportViaDefinition(p, geo, serializeKle);
    expect(res.json).toMatchObject({ vendorId: '0xAFC5', productId: '0xBFC5', matrix: { rows: 10, cols: 6 }, menus: ['qmk_rgb_matrix'] });
    const back = importViaDefinition(res.json!);
    expect(back.geometry.keys.map((k) => k.matrix)).toEqual(geo.keys.map((k) => k.matrix));
    expect(Math.min(...back.geometry.keys.map((k) => k.y))).toBeGreaterThanOrEqual(0);
    const noUsb = { ...p, device: null, hardware: { ...p.hardware, usb: { vid: null, pid: null } } };
    expect(exportViaDefinition(noUsb, geo, serializeKle).json).toBeNull();
  });
});
