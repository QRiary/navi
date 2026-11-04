// Trusted local folders: a keymap folder that holds the user's own C and make code may be built only after the user
// trusted it. Rules: trust is per absolute folder, kept only in NAVI's local data (never in a project file, never set
// by a file inside the folder), off by default, revocable. An untrusted folder must pass the same allowlist as the
// files NAVI writes (electron/safety.cjs unsafeSource), or the build is refused.
import { describe, expect, it, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createTrustStore, normalizeFolder, scanFolders, trustDialogDetail, trustRefusal } = require('./trust.cjs');
const { buildScanFolders, checkTrust } = require('./qmk.cjs');

let tmp, home, user, store, storeFile;

const put = (file, text = 'x') => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};
const kmDir = (root, kb, name) => path.join(root, 'keyboards', ...kb.split('/'), 'keymaps', name);
const stock = (dir) => {
  put(path.join(dir, 'keymap.c'), '#include QMK_KEYBOARD_H\n#include "features/x.h"\nconst uint16_t PROGMEM keymaps[][MATRIX_ROWS][MATRIX_COLS] = {};\n');
  put(path.join(dir, 'rules.mk'), 'COMBO_ENABLE = yes\nSRC += features/x.c\n');
  put(path.join(dir, 'config.h'), '#pragma once\n#define TAPPING_TERM 200\n');
  put(path.join(dir, 'features', 'x.c'), '#include "x.h"\nvoid x(void) {}\n');
  put(path.join(dir, 'features', 'x.h'), '#pragma once\nvoid x(void);\n');
};

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'navi-trust-'));
  home = path.join(tmp, 'qmk_firmware');
  user = path.join(tmp, 'qmk_userspace');
  fs.mkdirSync(path.join(home, 'quantum'), { recursive: true });
  put(path.join(home, 'keyboards', 'acme', 'split', 'keyboard.json'), '{}');
  put(path.join(user, 'qmk.json'), JSON.stringify({ userspace_version: '1.1', build_targets: [] }));
  storeFile = path.join(tmp, 'data', 'trusted-folders.json');
  store = createTrustStore(storeFile);
});

describe('trust store', () => {
  it('is empty by default (no file yet)', () => {
    expect(store.list()).toEqual([]);
    expect(store.isTrusted(tmp)).toBe(false);
  });

  it('grant persists to the file and a fresh store reads it back; revoke removes it', () => {
    const dir = path.join(tmp, 'mine');
    fs.mkdirSync(dir);
    store.grant(dir);
    expect(store.isTrusted(dir)).toBe(true);
    expect(createTrustStore(storeFile).isTrusted(dir)).toBe(true);
    store.revoke(dir);
    expect(store.isTrusted(dir)).toBe(false);
    expect(createTrustStore(storeFile).isTrusted(dir)).toBe(false);
  });

  it('is per folder: trusting a folder trusts neither its parent, nor its subfolders, nor a sibling with the same prefix', () => {
    const dir = path.join(tmp, 'mine');
    fs.mkdirSync(path.join(dir, 'sub'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'mine2'));
    store.grant(dir);
    expect(store.isTrusted(tmp)).toBe(false);
    expect(store.isTrusted(path.join(dir, 'sub'))).toBe(false);
    expect(store.isTrusted(path.join(tmp, 'mine2'))).toBe(false);
  });

  it('the same folder written differently is the same entry (trailing separator, ./ and ../ parts)', () => {
    const dir = path.join(tmp, 'mine');
    fs.mkdirSync(path.join(dir, 'sub'), { recursive: true });
    store.grant(dir + path.sep);
    expect(store.isTrusted(path.join(dir, 'sub', '..'))).toBe(true);
    expect(store.list()).toHaveLength(1);
    store.grant(path.join(dir, '.'));
    expect(store.list()).toHaveLength(1);
  });

  it('the list shows the folder as it was spelled (not case-folded), without a trailing separator', () => {
    const dir = path.join(tmp, 'Mixed_Case');
    fs.mkdirSync(dir);
    store.grant(dir + path.sep);
    expect(store.list()).toEqual([dir]);
  });

  it('only an existing absolute folder can be granted', () => {
    expect(() => store.grant('relative/dir')).toThrow();
    expect(() => store.grant(path.join(tmp, 'missing'))).toThrow();
    put(path.join(tmp, 'file.txt'));
    expect(() => store.grant(path.join(tmp, 'file.txt'))).toThrow();
    expect(store.list()).toEqual([]);
  });

  it('a broken or foreign store file means nothing is trusted (never a crash, never "trust everything")', () => {
    put(storeFile, '{not json');
    expect(createTrustStore(storeFile).list()).toEqual([]);
    put(storeFile, JSON.stringify({ folders: 'C:\\' }));
    expect(createTrustStore(storeFile).list()).toEqual([]);
    put(storeFile, JSON.stringify({ folders: [42, null, 'relative/x'] }));
    expect(createTrustStore(storeFile).list()).toEqual([]);
  });

  it.runIf(process.platform === 'win32')('Windows: drive paths ignore case; \\\\wsl$\\ and \\\\wsl.localhost\\ are the same host; Linux parts keep their case', () => {
    expect(normalizeFolder('C:\\Users\\Me\\QMK\\')).toBe(normalizeFolder('c:\\users\\me\\qmk'));
    expect(normalizeFolder('\\\\wsl$\\QMK\\home\\qmk\\km')).toBe(normalizeFolder('\\\\wsl.localhost\\QMK\\home\\qmk\\km'));
    expect(normalizeFolder('\\\\wsl.localhost\\QMK\\home\\qmk\\KM')).not.toBe(normalizeFolder('\\\\wsl.localhost\\QMK\\home\\qmk\\km'));
  });
});

describe('scanning a folder against the allowlist', () => {
  it('a stock keymap folder (flags, SRC, QMK headers, own .c/.h) passes', () => {
    const dir = kmDir(home, 'acme/split', 'mine');
    stock(dir);
    expect(scanFolders([dir])).toEqual([]);
  });

  it('make code in any .mk file fails: recipe lines, include, $(shell), tool variables', () => {
    const dir = kmDir(home, 'acme/split', 'mine');
    stock(dir);
    put(path.join(dir, 'rules.mk'), 'COMBO_ENABLE = yes\nall: gen\n\tpython3 gen.py\n');
    put(path.join(dir, 'extra', 'post_rules.mk'), 'include $(mkfile_dir)/x.mk\n');
    put(path.join(dir, 'other.mk'), 'CC = evil\n');
    const files = scanFolders([dir]).map((i) => path.relative(dir, i.file)).sort();
    expect(files).toEqual(['extra/post_rules.mk', 'other.mk', 'rules.mk'].map((f) => path.join(...f.split('/'))).sort());
  });

  it('C includes that leave the folder fail in every text file, nested ones and non-.c/.h ones too', () => {
    const dir = kmDir(home, 'acme/split', 'mine');
    stock(dir);
    put(path.join(dir, 'deep', 'er', 'inc.h'), '#include "/etc/passwd"\n');
    put(path.join(dir, 'combos.def'), '#include "../../secret.h"\n');
    put(path.join(dir, 'data.inc'), '__asm__(".incbin \\"key.bin\\"");\n');
    const files = scanFolders([dir]).map((i) => path.relative(dir, i.file)).sort();
    expect(files).toEqual(['combos.def', 'data.inc', path.join('deep', 'er', 'inc.h')].sort());
  });

  it('every issue names the file and a reason', () => {
    const dir = kmDir(home, 'acme/split', 'mine');
    put(path.join(dir, 'rules.mk'), 'all:\n\techo hi\n');
    const [issue] = scanFolders([dir]);
    expect(issue.file).toBe(path.join(dir, 'rules.mk'));
    expect(typeof issue.reason).toBe('string');
    expect(issue.reason.length).toBeGreaterThan(0);
  });

  it('binary files (images) are skipped, .git is skipped, a missing folder is fine', () => {
    const dir = kmDir(home, 'acme/split', 'mine');
    stock(dir);
    put(path.join(dir, 'layout.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x23, 0x0a]));
    put(path.join(dir, '.git', 'hooks', 'evil.mk'), 'CC = evil\n');
    expect(scanFolders([dir, path.join(tmp, 'missing')])).toEqual([]);
  });

  it('a NUL byte does not hide a text file from the check (only known binary types are skipped)', () => {
    const dir = kmDir(home, 'acme/split', 'mine');
    stock(dir);
    put(path.join(dir, 'evil.h'), Buffer.concat([Buffer.from('// \0\n#include "/etc/passwd"\n')]));
    expect(scanFolders([dir]).map((i) => i.file)).toEqual([path.join(dir, 'evil.h')]);
  });

  it('a file too big to check fails instead of being skipped', () => {
    const dir = kmDir(home, 'acme/split', 'mine');
    stock(dir);
    put(path.join(dir, 'big.h'), `// ${'x'.repeat(2 * 1024 * 1024)}\n`);
    expect(scanFolders([dir]).map((i) => i.file)).toEqual([path.join(dir, 'big.h')]);
  });

  it('a link inside the folder fails (make would follow it out of the folder)', () => {
    const dir = kmDir(home, 'acme/split', 'mine');
    stock(dir);
    const outside = path.join(tmp, 'outside');
    put(path.join(outside, 'evil.mk'), 'CC = evil\n');
    fs.symlinkSync(outside, path.join(dir, 'linked'), 'junction');
    expect(scanFolders([dir]).map((i) => i.file)).toEqual([path.join(dir, 'linked')]);
  });
});

describe('which folders a build scans', () => {
  it('the keymap folder QMK builds, plus users/<keymap> in either root when it exists', () => {
    const dir = kmDir(user, 'acme/split', 'mine');
    stock(dir);
    expect(buildScanFolders(home, user, 'acme/split', 'mine')).toEqual([dir]);
    put(path.join(user, 'users', 'mine', 'mine.c'), '// user code');
    put(path.join(home, 'users', 'mine', 'rules.mk'), 'SRC += mine.c\n');
    expect(buildScanFolders(home, user, 'acme/split', 'mine').sort()).toEqual([dir, path.join(user, 'users', 'mine'), path.join(home, 'users', 'mine')].sort());
  });
});

describe('the build gate', () => {
  it('no issues → no refusal, trusted or not', () => {
    expect(trustRefusal({ issues: [], trusted: false })).toBeNull();
    expect(trustRefusal({ issues: [], trusted: true })).toBeNull();
  });

  it('issues in a trusted folder → no refusal', () => {
    expect(trustRefusal({ issues: [{ file: 'rules.mk', reason: 'make recipe line' }], trusted: true })).toBeNull();
  });

  it('issues in an untrusted folder → a refusal naming the files, at most 5 listed plus a count', () => {
    const issues = Array.from({ length: 7 }, (_, i) => ({ file: `f${i}.mk`, reason: 'make recipe line' }));
    const text = trustRefusal({ issues, trusted: false });
    expect(text).toContain('f0.mk');
    expect(text).toContain('f4.mk');
    expect(text).not.toContain('f5.mk');
    expect(text).toContain('2');
  });

  it('checkTrust: an untrusted folder with make code is refused; after grant it builds; after revoke it is refused again', () => {
    const dir = kmDir(user, 'acme/split', 'mine');
    stock(dir);
    put(path.join(dir, 'rules.mk'), 'all:\n\tpython3 gen.py\n');
    expect(checkTrust(store, home, user, 'acme/split', 'mine')).toMatch(/rules\.mk/);
    store.grant(dir);
    expect(checkTrust(store, home, user, 'acme/split', 'mine')).toBeNull();
    store.revoke(dir);
    expect(checkTrust(store, home, user, 'acme/split', 'mine')).toMatch(/rules\.mk/);
  });

  it('checkTrust: trust on the keymap folder also covers its users/<keymap> folders; a clean folder needs no trust', () => {
    const dir = kmDir(user, 'acme/split', 'mine');
    stock(dir);
    expect(checkTrust(store, home, user, 'acme/split', 'mine')).toBeNull();
    put(path.join(user, 'users', 'mine', 'rules.mk'), 'all:\n\techo hi\n');
    expect(checkTrust(store, home, user, 'acme/split', 'mine')).toMatch(/rules\.mk/);
    store.grant(dir);
    expect(checkTrust(store, home, user, 'acme/split', 'mine')).toBeNull();
  });

  it('the grant dialog names every folder the trust covers: the keymap folder and its users/<keymap> folders', () => {
    const dir = kmDir(user, 'acme/split', 'mine');
    stock(dir);
    put(path.join(user, 'users', 'mine', 'mine.c'), '// user code');
    const folders = buildScanFolders(home, user, 'acme/split', 'mine');
    for (const ru of [false, true]) {
      const text = trustDialogDetail(folders, 'mine', ru);
      expect(text).toContain(dir);
      expect(text).toContain(path.join(user, 'users', 'mine'));
      expect(text).toContain('users/mine');
    }
    expect(trustDialogDetail([dir], 'mine', false)).toContain('(none right now)');
  });

  it('a file inside the folder cannot grant trust (only the store file in NAVI data counts)', () => {
    const dir = kmDir(user, 'acme/split', 'mine');
    stock(dir);
    put(path.join(dir, 'rules.mk'), 'all:\n\techo hi\n');
    put(path.join(dir, 'trusted-folders.json'), JSON.stringify({ folders: [dir] }));
    put(path.join(dir, '.navi-trust'), 'yes');
    expect(checkTrust(store, home, user, 'acme/split', 'mine')).toMatch(/rules\.mk/);
  });
});
