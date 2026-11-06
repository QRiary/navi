// QMK External Userspace: where a keymap lives, which folder a build really uses, which firmware file is fresh.
// QMK's own rules (qmk_firmware 0.34, lib/python/qmk/keymap.py locate_keymap and build_targets.py):
// qmk_firmware is searched first and a match there is returned; the userspace only when qmk_firmware has none.
// Inside one root the deepest keyboard folder wins. A keymap folder counts only with keymap.c or keymap.json.
import { describe, expect, it, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { parseQmkEnv, isUserspace, keymapDir, readKeyboard, readKeymap, writeKeymap, checkBuildFolder, firmwareSnapshot, findBuiltFirmware } = require('./qmk.cjs');

let tmp, home, user, data;

const put = (file, text = 'x') => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};
const km = (root, kb, name, file = 'keymap.c') => put(path.join(root, 'keyboards', ...kb.split('/'), 'keymaps', name, file), '// km');
const kmDir = (root, kb, name) => path.join(root, 'keyboards', ...kb.split('/'), 'keymaps', name);

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'navi-us-'));
  home = path.join(tmp, 'qmk_firmware');
  user = path.join(tmp, 'qmk_userspace');
  data = path.join(tmp, 'data');
  fs.mkdirSync(path.join(home, 'quantum'), { recursive: true });
  put(path.join(home, 'keyboards', 'acme', 'split', 'keyboard.json'), '{}');
  put(path.join(user, 'qmk.json'), JSON.stringify({ userspace_version: '1.1', build_targets: [] }));
  fs.mkdirSync(path.join(user, 'keyboards'), { recursive: true });
});

describe('finding the userspace', () => {
  it('QMK_USERSPACE is read from `qmk env`, past any shell banner; absent → null', async () => {
    const out = 'Welcome to QMK WSL!\n  * Docs\nQMK_HOME="/home/qmk/qmk_firmware"\nQMK_USERSPACE="/home/qmk/qmk_userspace"\nQMK_COLOR="True"\n';
    expect(parseQmkEnv(out, 'QMK_USERSPACE')).toBe('/home/qmk/qmk_userspace');
    expect(parseQmkEnv(out, 'QMK_HOME')).toBe('/home/qmk/qmk_firmware');
    expect(parseQmkEnv('QMK_HOME="/x"\r\nQMK_COLOR="True"\r\n', 'QMK_USERSPACE')).toBeNull();
    expect(parseQmkEnv('QMK_USERSPACE=""\n', 'QMK_USERSPACE')).toBeNull();
  });

  it('a userspace is a folder with a qmk.json that has userspace_version', async () => {
    expect(isUserspace(user)).toBe(true);
    put(path.join(tmp, 'other', 'qmk.json'), '{"build_targets": []}');
    expect(isUserspace(path.join(tmp, 'other'))).toBe(false);
    put(path.join(tmp, 'broken', 'qmk.json'), '{not json');
    expect(isUserspace(path.join(tmp, 'broken'))).toBe(false);
    expect(isUserspace(path.join(tmp, 'missing'))).toBe(false);
  });
});

describe('which keymap folder QMK uses', () => {
  it('only in the userspace → the userspace one', async () => {
    km(user, 'acme/split', 'mine');
    expect(keymapDir(home, user, 'acme/split', 'mine')).toEqual({ dir: kmDir(user, 'acme/split', 'mine'), exists: true, root: 'userspace' });
  });

  it('in both → the qmk_firmware one (QMK returns the first root with a match)', async () => {
    km(user, 'acme/split', 'mine');
    km(home, 'acme/split', 'mine', 'keymap.json');
    expect(keymapDir(home, user, 'acme/split', 'mine')).toEqual({ dir: kmDir(home, 'acme/split', 'mine'), exists: true, root: 'firmware' });
  });

  it('inside one root the deepest keyboard folder wins', async () => {
    km(user, 'acme', 'mine');
    km(user, 'acme/split', 'mine');
    expect(keymapDir(home, user, 'acme/split', 'mine').dir).toBe(kmDir(user, 'acme/split', 'mine'));
    km(home, 'acme', 'shared');
    expect(keymapDir(home, user, 'acme/split', 'shared')).toEqual({ dir: kmDir(home, 'acme', 'shared'), exists: true, root: 'firmware' });
  });

  it('a folder without keymap.c or keymap.json does not count', async () => {
    put(path.join(kmDir(home, 'acme/split', 'mine'), 'rules.mk'), 'X = yes');
    km(user, 'acme/split', 'mine');
    expect(keymapDir(home, user, 'acme/split', 'mine').root).toBe('userspace');
  });

  it('a new keymap goes to the userspace when there is one, otherwise to qmk_firmware', async () => {
    expect(keymapDir(home, user, 'acme/split', 'fresh')).toEqual({ dir: kmDir(user, 'acme/split', 'fresh'), exists: false, root: 'userspace' });
    expect(keymapDir(home, null, 'acme/split', 'fresh')).toEqual({ dir: kmDir(home, 'acme/split', 'fresh'), exists: false, root: 'firmware' });
  });

  it('no userspace → qmk_firmware only, as before', async () => {
    km(home, 'acme/split', 'mine');
    expect(keymapDir(home, null, 'acme/split', 'mine')).toEqual({ dir: kmDir(home, 'acme/split', 'mine'), exists: true, root: 'firmware' });
  });

  it('names that climb out are refused', async () => {
    expect(() => keymapDir(home, user, '../x', 'mine')).toThrow();
    expect(() => keymapDir(home, user, 'acme/split', '../mine')).toThrow();
  });
});

describe('reading and writing keymaps in the userspace', () => {
  it('the keyboard lists keymaps of both roots, each with its root', async () => {
    km(home, 'acme/split', 'default', 'keymap.json');
    km(user, 'acme/split', 'mine');
    const { keymaps } = await readKeyboard(home, user, 'acme/split');
    expect(keymaps).toEqual(
      expect.arrayContaining([
        { name: 'default', at: 'acme/split', root: 'firmware', files: ['keymap.json'] },
        { name: 'mine', at: 'acme/split', root: 'userspace', files: ['keymap.c'] },
      ]),
    );
    expect(keymaps).toHaveLength(2);
  });

  // Sync fs over \\wsl.localhost in the main process froze the whole window (clicks and scrolling) while it ran.
  it('readKeyboard and readKeymap read asynchronously, never blocking the main process', async () => {
    km(user, 'acme/split', 'mine');
    const reads = [readKeyboard(home, user, 'acme/split'), readKeymap(home, user, 'acme/split', 'mine')];
    for (const r of reads) expect(r).toBeInstanceOf(Promise);
    await Promise.all(reads);
  });

  it('a keyboard defined only in qmk_firmware still reads with an empty userspace', async () => {
    expect((await readKeyboard(home, user, 'acme/split')).files.map((f) => f.path)).toContain('acme/split/keyboard.json');
  });

  it('readKeymap and writeKeymap use the folder QMK builds, with a backup', async () => {
    km(user, 'acme/split', 'mine');
    const r = await readKeymap(home, user, 'acme/split', 'mine');
    expect(r).toMatchObject({ dir: kmDir(user, 'acme/split', 'mine'), exists: true, root: 'userspace' });
    expect(r.files.map((f) => f.name)).toEqual(['keymap.c']);
    const w = writeKeymap(data, home, user, 'acme/split', 'mine', [{ name: 'keymap.c', text: '// new' }]);
    expect(w.dir).toBe(kmDir(user, 'acme/split', 'mine'));
    expect(fs.readFileSync(path.join(w.dir, 'keymap.c'), 'utf8')).toBe('// new');
    expect(fs.readFileSync(path.join(w.backup, 'keymap.c'), 'utf8')).toBe('// km');
    expect(fs.existsSync(kmDir(home, 'acme/split', 'mine'))).toBe(false);
  });

  it('a new keymap is created in the userspace', async () => {
    const w = writeKeymap(data, home, user, 'acme/split', 'fresh', [{ name: 'keymap.c', text: '// k' }]);
    expect(w.dir).toBe(kmDir(user, 'acme/split', 'fresh'));
    expect(w.backup).toBeNull();
  });
});

describe('the build uses the folder on screen, or it does not start', () => {
  // What `qmk compile -n` prints (one line): the make command. MAIN_KEYMAP_PATH_* only when the keymap is in the userspace.
  const dry = (userspace, keymapPath) =>
    `Ψ Compiling keymap with gmake -r -R -f builddefs/build_keyboard.mk KEYBOARD=acme/split KEYMAP=mine VERBOSE=false${userspace ? ` QMK_USERSPACE=${userspace}` : ''}${keymapPath ? [1, 2, 3, 4, 5].map((i) => ` MAIN_KEYMAP_PATH_${i}=${keymapPath}`).join('') : ''}\n`;
  const id = (p) => p;

  it('userspace keymap: QMK names the same folder → go', async () => {
    const expected = { dir: kmDir(user, 'acme/split', 'mine'), exists: true, root: 'userspace' };
    expect(checkBuildFolder({ output: dry(user, expected.dir), expected, shown: expected.dir, userspace: user, toLocal: id })).toBeNull();
  });

  it('QMK paths are converted before comparing (a Linux path from WSL)', async () => {
    const expected = { dir: '\\\\wsl.localhost\\QMK\\home\\qmk\\qmk_userspace\\keyboards\\acme\\split\\keymaps\\mine', exists: true, root: 'userspace' };
    const toLocal = (p) => `\\\\wsl.localhost\\QMK${p.replace(/\//g, '\\')}`;
    const out = dry('/home/qmk/qmk_userspace', '/home/qmk/qmk_userspace/keyboards/acme/split/keymaps/mine');
    expect(checkBuildFolder({ output: out, expected, shown: expected.dir, userspace: '\\\\wsl.localhost\\QMK\\home\\qmk\\qmk_userspace', toLocal })).toBeNull();
  });

  it('qmk_firmware keymap: no MAIN_KEYMAP_PATH from QMK → go', async () => {
    const expected = { dir: kmDir(home, 'acme/split', 'mine'), exists: true, root: 'firmware' };
    expect(checkBuildFolder({ output: dry(user, null), expected, shown: expected.dir, userspace: user, toLocal: id })).toBeNull();
    expect(checkBuildFolder({ output: dry(null, null), expected, shown: expected.dir, userspace: null, toLocal: id })).toBeNull();
  });

  it('QMK would build another folder → refused, naming both', async () => {
    const expected = { dir: kmDir(user, 'acme/split', 'mine'), exists: true, root: 'userspace' };
    const msg = checkBuildFolder({ output: dry(user, null), expected, shown: expected.dir, userspace: user, toLocal: id });
    expect(msg).toEqual(expect.stringContaining(expected.dir));
    const other = kmDir(path.join(tmp, 'elsewhere'), 'acme/split', 'mine');
    expect(checkBuildFolder({ output: dry(user, other), expected, shown: expected.dir, userspace: user, toLocal: id })).toEqual(expect.stringContaining(other));
  });

  it('the folder on screen is not the one NAVI resolves now → refused', async () => {
    const expected = { dir: kmDir(user, 'acme/split', 'mine'), exists: true, root: 'userspace' };
    expect(checkBuildFolder({ output: dry(user, expected.dir), expected, shown: kmDir(home, 'acme/split', 'mine'), userspace: user, toLocal: id })).toEqual(expect.any(String));
  });

  it('QMK sees another userspace (or none) than NAVI → refused', async () => {
    const expected = { dir: kmDir(home, 'acme/split', 'mine'), exists: true, root: 'firmware' };
    expect(checkBuildFolder({ output: dry(path.join(tmp, 'x'), null), expected, shown: expected.dir, userspace: user, toLocal: id })).toEqual(expect.any(String));
    expect(checkBuildFolder({ output: dry(null, null), expected, shown: expected.dir, userspace: user, toLocal: id })).toEqual(expect.any(String));
    expect(checkBuildFolder({ output: dry(user, null), expected, shown: expected.dir, userspace: null, toLocal: id })).toEqual(expect.any(String));
  });

  it('a dry run that printed no make command → refused', async () => {
    const expected = { dir: kmDir(home, 'acme/split', 'mine'), exists: true, root: 'firmware' };
    expect(checkBuildFolder({ output: '☒ Invalid keymap argument.\n', expected, shown: expected.dir, userspace: null, toLocal: id })).toEqual(expect.any(String));
  });
});

describe('the built firmware file is the one this build made', () => {
  const at = (file, ms) => fs.utimesSync(file, new Date(ms), new Date(ms));

  it('the userspace copy is taken when the build says it copied it there', async () => {
    const before = firmwareSnapshot(home, user, 'acme/split', 'mine');
    put(path.join(home, 'acme_split_mine.uf2'));
    put(path.join(user, 'acme_split_mine.uf2'));
    const out = 'Copying acme_split_mine.uf2 to qmk_firmware folder [OK]\nCopying acme_split_mine.uf2 to userspace folder [OK]\n';
    expect(findBuiltFirmware({ home, userspace: user, kb: 'acme/split', km: 'mine', output: out, before })).toBe(path.join(user, 'acme_split_mine.uf2'));
  });

  it('a file left from an earlier build (unchanged since before the build) is not taken', async () => {
    const file = path.join(user, 'acme_split_mine.uf2');
    put(file);
    at(file, Date.now() - 3600_000);
    const before = firmwareSnapshot(home, user, 'acme/split', 'mine');
    const out = 'Copying acme_split_mine.uf2 to userspace folder [OK]\n';
    expect(findBuiltFirmware({ home, userspace: user, kb: 'acme/split', km: 'mine', output: out, before })).toBeNull();
    at(file, Date.now());
    expect(findBuiltFirmware({ home, userspace: user, kb: 'acme/split', km: 'mine', output: out, before })).toBe(file);
  });

  it('no userspace: the qmk_firmware copy, as before', async () => {
    const before = firmwareSnapshot(home, null, 'acme/split', 'mine');
    put(path.join(home, 'acme_split_mine.uf2'));
    expect(findBuiltFirmware({ home, userspace: null, kb: 'acme/split', km: 'mine', output: 'Copying acme_split_mine.uf2 to qmk_firmware folder', before })).toBe(path.join(home, 'acme_split_mine.uf2'));
    expect(findBuiltFirmware({ home, userspace: null, kb: 'acme/split', km: 'other', output: '', before })).toBeNull();
  });

  it('a file name from the output that climbs out of its folder is ignored', async () => {
    const before = firmwareSnapshot(home, user, 'acme/split', 'mine');
    put(path.join(tmp, 'evil.uf2'));
    expect(findBuiltFirmware({ home, userspace: user, kb: 'acme/split', km: 'mine', output: 'Copying ../evil.uf2 to userspace folder', before })).toBeNull();
  });
});
