// The user's own C read for stand-in picking (qmk.cjs readOwnCode): every C-like file of the build folders, NAVI's
// own keymap.c / navi.h left out, read-only.
import { beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { readOwnCode } = require('./qmk.cjs');

let tmp, home, user;
const put = (file, text = 'x') => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'navi-owncode-'));
  home = path.join(tmp, 'qmk_firmware');
  user = path.join(tmp, 'qmk_userspace');
  fs.mkdirSync(path.join(home, 'quantum'), { recursive: true });
  put(path.join(home, 'keyboards', 'acme', 'split', 'keyboard.json'), '{}');
  put(path.join(user, 'qmk.json'), JSON.stringify({ userspace_version: '1.1', build_targets: [] }));
});

describe('readOwnCode', () => {
  it('reads the C-like files of the keymap folder and users/<keymap>, not NAVI’s keymap.c / navi.h', () => {
    const dir = path.join(user, 'keyboards', 'acme', 'split', 'keymaps', 'mine');
    put(path.join(dir, 'keymap.c'), 'generated');
    put(path.join(dir, 'navi.h'), 'generated');
    put(path.join(dir, 'config.h'), '#define A 1');
    put(path.join(dir, 'combos.def'), 'COMB(x, KC_F13, KC_A, KC_B)');
    put(path.join(dir, 'general', 'key_log.c'), 'case 0xC3:');
    put(path.join(dir, 'general', 'keymap.c'), 'a nested keymap.c is the user’s');
    put(path.join(dir, 'readme.md'), 'KC_F13');
    put(path.join(dir, 'rules.mk'), 'SRC += general/key_log.c');
    put(path.join(dir, '.git', 'x.c'), 'git');
    put(path.join(dir, 'blob.c'), 'a\0b');
    put(path.join(user, 'users', 'mine', 'mine.c'), 'user code');
    const files = readOwnCode(home, user, 'acme/split', 'mine');
    expect(files.map((f) => f.path).sort()).toEqual(['combos.def', 'config.h', 'general/key_log.c', 'general/keymap.c', 'users/mine/mine.c']);
    expect(files.find((f) => f.path === 'general/key_log.c').text).toBe('case 0xC3:');
  });

  it('a target without a keymap folder has no own code', () => {
    expect(readOwnCode(home, user, 'acme/split', 'none')).toEqual([]);
  });
});
