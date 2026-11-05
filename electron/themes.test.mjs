// Own themes on disk: one file per id in <userData>/themes, names checked, removed files kept in .trash.
import { describe, expect, it, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createThemeStore } = require('./themes.cjs');

let dir, store;

beforeEach(() => {
  dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'navi-themes-')), 'themes');
  store = createThemeStore(dir);
});

describe('theme store', () => {
  it('lists nothing before the folder exists, then the written themes by id', () => {
    expect(store.list()).toEqual([]);
    store.write('midnight', '{"a":1}');
    store.write('amber-2', '{"b":2}');
    expect(store.list()).toEqual([
      { id: 'amber-2', text: '{"b":2}' },
      { id: 'midnight', text: '{"a":1}' },
    ]);
  });

  it('rejects ids that are paths or not lowercase slugs', () => {
    for (const id of ['../evil', 'a/b', 'Midnight', '', '-x', 'a'.repeat(61), 5]) expect(() => store.write(id, '{}')).toThrow();
    expect(() => store.remove('..\\x')).toThrow();
  });

  it('skips other files, folders and files too big', () => {
    fs.mkdirSync(path.join(dir, 'sub.navi-theme.json'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'x');
    fs.writeFileSync(path.join(dir, 'Bad Name.navi-theme.json'), '{}');
    fs.writeFileSync(path.join(dir, 'huge.navi-theme.json'), 'x'.repeat(65 * 1024));
    store.write('ok', '{}');
    expect(store.list().map((t) => t.id)).toEqual(['ok']);
    expect(() => store.write('big', 'x'.repeat(65 * 1024))).toThrow();
  });

  it('remove moves the file to .trash and answers its text', () => {
    store.write('midnight', 'TEXT');
    expect(store.remove('midnight')).toBe('TEXT');
    expect(store.list()).toEqual([]);
    expect(fs.readFileSync(path.join(dir, '.trash', 'midnight.navi-theme.json'), 'utf8')).toBe('TEXT');
    expect(store.remove('midnight')).toBeNull();
  });
});
