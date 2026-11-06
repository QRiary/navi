import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { createKeymapWrites } = require('./keymapWrites.cjs');
const { readKeymap, writeKeymap } = require('./qmk.cjs');

const tmp = [];
const scratch = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'navi-writes-'));
  tmp.push(d);
  return d;
};
afterEach(() => {
  for (const d of tmp.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('keymap writes log', () => {
  it('knows what NAVI wrote last and nothing else', () => {
    const dir = scratch();
    const log = createKeymapWrites(path.join(dir, 'keymap-writes.json'));
    const file = path.join(dir, 'keymap.c');
    expect(log.isNavis(file, 'a')).toBe(false);
    log.record(dir, [{ name: 'keymap.c', text: 'a' }]);
    expect(log.isNavis(file, 'a')).toBe(true);
    expect(log.isNavis(file, 'a\n// my edit')).toBe(false);
    log.record(dir, [{ name: 'keymap.c', text: 'b' }]);
    expect(log.isNavis(file, 'a')).toBe(false);
    expect(log.isNavis(file, 'b')).toBe(true);
  });

  it('a broken log file counts as nothing written', () => {
    const dir = scratch();
    fs.writeFileSync(path.join(dir, 'keymap-writes.json'), '{not json');
    const log = createKeymapWrites(path.join(dir, 'keymap-writes.json'));
    expect(log.isNavis(path.join(dir, 'keymap.c'), 'a')).toBe(false);
    log.record(dir, [{ name: 'keymap.c', text: 'a' }]);
    expect(log.isNavis(path.join(dir, 'keymap.c'), 'a')).toBe(true);
  });

  it('readKeymap marks the files NAVI wrote, an edit outside NAVI drops the mark', async () => {
    const home = scratch();
    const data = scratch();
    fs.mkdirSync(path.join(home, 'keyboards', 'kb', 'keymaps', 'km'), { recursive: true });
    fs.writeFileSync(path.join(home, 'keyboards', 'kb', 'keyboard.json'), '{}');
    const log = createKeymapWrites(path.join(data, 'keymap-writes.json'));
    const { dir } = writeKeymap(data, home, null, 'kb', 'km', [{ name: 'keymap.c', text: '// navi\n' }], log);
    fs.writeFileSync(path.join(dir, 'rules.mk'), 'MINE = yes\n');
    let read = await readKeymap(home, null, 'kb', 'km', log);
    expect(Object.fromEntries(read.files.map((f) => [f.name, f.navi]))).toEqual({ 'keymap.c': true, 'rules.mk': false });
    fs.appendFileSync(path.join(dir, 'keymap.c'), '// hand edit\n');
    read = await readKeymap(home, null, 'kb', 'km', log);
    expect(read.files.find((f) => f.name === 'keymap.c').navi).toBe(false);
  });
});
