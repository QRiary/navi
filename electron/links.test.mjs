// Projects linked to a file: the link lives only in NAVI's data, Save writes the file back, and a file changed outside
// NAVI (git pull, a hand edit) is never overwritten unless the user saw that version and chose to overwrite it.
import { describe, expect, it, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createLinkStore, hashText } = require('./links.cjs');

let tmp, store, storeFile, file;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'navi-links-'));
  storeFile = path.join(tmp, 'data', 'project-links.json');
  store = createLinkStore(storeFile);
  file = path.join(tmp, 'repo', 'board.navi.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'v1');
});

describe('link store', () => {
  it('is empty without a file, and a broken file means no links', () => {
    expect(store.state('prj_a')).toBeNull();
    fs.mkdirSync(path.dirname(storeFile), { recursive: true });
    fs.writeFileSync(storeFile, '{ not json');
    expect(store.get('prj_a')).toBeNull();
    fs.writeFileSync(storeFile, JSON.stringify({ links: { prj_a: { path: 'relative.json', hash: 'x' }, '../evil': { path: file, hash: 'x' } } }));
    expect(store.get('prj_a')).toBeNull();
    expect(store.get('prj_b')).toBeNull();
  });

  it('attach: the text it was read with is the known version', () => {
    store.attach('prj_a', file, 'v1');
    expect(store.state('prj_a')).toEqual({ path: file, exists: true, text: 'v1', hash: hashText('v1'), changed: false });
    fs.writeFileSync(file, 'v2');
    expect(store.state('prj_a')).toMatchObject({ exists: true, text: 'v2', changed: true });
  });

  it('only absolute files can be linked', () => {
    expect(() => store.attach('prj_a', 'board.navi.json', 'v1')).toThrow();
    expect(() => store.attach('../x', file, 'v1')).toThrow();
  });

  it('a missing file is reported, not recreated', () => {
    store.attach('prj_a', file, 'v1');
    fs.rmSync(file);
    expect(store.state('prj_a')).toMatchObject({ exists: false, text: null, changed: false });
    expect(store.write('prj_a', 'v2')).toEqual({ status: 'missing', path: file });
    expect(fs.existsSync(file)).toBe(false);
  });

  it('write: an unchanged file is overwritten and the new text is the known version', () => {
    store.attach('prj_a', file, 'v1');
    expect(store.write('prj_a', 'v2')).toEqual({ status: 'written', path: file });
    expect(fs.readFileSync(file, 'utf8')).toBe('v2');
    expect(store.state('prj_a')?.changed).toBe(false);
  });

  it('write: a file changed outside NAVI is refused with its text and version', () => {
    store.attach('prj_a', file, 'v1');
    fs.writeFileSync(file, 'pulled');
    expect(store.write('prj_a', 'mine')).toEqual({ status: 'conflict', path: file, text: 'pulled', hash: hashText('pulled') });
    expect(fs.readFileSync(file, 'utf8')).toBe('pulled');
  });

  it('write with the version the user saw overwrites it; a newer change is refused again', () => {
    store.attach('prj_a', file, 'v1');
    fs.writeFileSync(file, 'pulled');
    const seen = hashText('pulled');
    fs.writeFileSync(file, 'pulled again');
    expect(store.write('prj_a', 'mine', seen)).toMatchObject({ status: 'conflict', text: 'pulled again' });
    expect(store.write('prj_a', 'mine', hashText('pulled again'))).toMatchObject({ status: 'written' });
    expect(fs.readFileSync(file, 'utf8')).toBe('mine');
  });

  it('write: a file that already holds the same text is not a conflict', () => {
    store.attach('prj_a', file, 'v1');
    fs.writeFileSync(file, 'same');
    expect(store.write('prj_a', 'same')).toMatchObject({ status: 'written' });
    expect(store.state('prj_a')?.changed).toBe(false);
  });

  it('accept makes the version the user saw the known one', () => {
    store.attach('prj_a', file, 'v1');
    fs.writeFileSync(file, 'pulled');
    store.accept('prj_a', hashText('pulled'));
    expect(store.state('prj_a')?.changed).toBe(false);
    expect(() => store.accept('prj_a', 'not a hash')).toThrow();
  });

  it('relink keeps the known version, so a different file reads as changed', () => {
    store.attach('prj_a', file, 'v1');
    const moved = path.join(tmp, 'elsewhere', 'board.navi.json');
    fs.mkdirSync(path.dirname(moved), { recursive: true });
    fs.writeFileSync(moved, 'v1');
    store.relink('prj_a', moved);
    expect(store.state('prj_a')).toMatchObject({ path: moved, changed: false });
    fs.writeFileSync(moved, 'other');
    expect(store.state('prj_a')?.changed).toBe(true);
    expect(() => store.relink('prj_b', moved)).toThrow();
  });

  it('unlink forgets only that project', () => {
    store.attach('prj_a', file, 'v1');
    store.attach('prj_b', file, 'v1');
    store.unlink('prj_a');
    expect(store.get('prj_a')).toBeNull();
    expect(store.get('prj_b')).not.toBeNull();
    expect(() => store.write('prj_a', 'x')).toThrow();
  });

  it('the links are kept only in the store file, never in the project file', () => {
    store.attach('prj_a', file, 'v1');
    store.write('prj_a', '{"format":"navi.project"}\n');
    expect(fs.readFileSync(file, 'utf8')).toBe('{"format":"navi.project"}\n');
    expect(JSON.parse(fs.readFileSync(storeFile, 'utf8')).links.prj_a.path).toBe(file);
  });
});
