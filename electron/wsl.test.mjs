// QMK inside WSL (Windows): distro names, path conversion, the wsl.exe command line, runner choice, keyboard list.
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { validateDistro, parseWslList, toWslUnc, fromWslUnc, qmkCommand } = require('./runner.cjs');
const { chooseRunner, keyboardTargets, homeFromConfig, parseQmkConfig } = require('./qmk.cjs');
const { insideDir } = require('./safety.cjs');

/** What `wsl.exe -l -q` prints: UTF-16LE, CRLF line ends, sometimes a trailing blank line. */
const utf16 = (text) => Buffer.from(text, 'utf16le');

describe('WSL distro names', () => {
  it('letters, digits, . _ - only', () => {
    for (const ok of ['QMK', 'Ubuntu-24.04', 'my_distro', 'a']) expect(validateDistro(ok)).toBe(ok);
    for (const bad of ['', 'a b', "a'b", 'a;b', 'a/b', 'a\\b', '$(x)', '-d', 'x'.repeat(65), null, 42]) expect(() => validateDistro(bad)).toThrow();
  });

  it('wsl.exe -l -q output (UTF-16LE) becomes a list of names', () => {
    expect(parseWslList(utf16('Ubuntu\r\nQMK\r\n'))).toEqual(['Ubuntu', 'QMK']);
    expect(parseWslList(utf16('\ufeffUbuntu\r\n\r\nQMK\r\n\r\n'))).toEqual(['Ubuntu', 'QMK']);
    // With WSL_UTF8=1 set by the user, wsl.exe prints UTF-8 instead.
    expect(parseWslList(Buffer.from('Ubuntu\nQMK\n', 'utf8'))).toEqual(['Ubuntu', 'QMK']);
    expect(parseWslList(utf16(''))).toEqual([]);
  });

  it('names that are not valid are dropped from the list, not passed on', () => {
    expect(parseWslList(utf16("QMK\r\nbad name\r\nx'y\r\n"))).toEqual(['QMK']);
  });
});

describe('WSL paths', () => {
  it('Linux path → \\\\wsl.localhost\\<distro>\\...', () => {
    expect(toWslUnc('QMK', '/home/qmk/qmk_firmware')).toBe('\\\\wsl.localhost\\QMK\\home\\qmk\\qmk_firmware');
    expect(toWslUnc('QMK', '/')).toBe('\\\\wsl.localhost\\QMK\\');
    for (const bad of ['home/qmk', '', 'C:\\x', '/a/../b']) expect(() => toWslUnc('QMK', bad)).toThrow();
    expect(() => toWslUnc('bad name', '/home')).toThrow();
  });

  it('\\\\wsl.localhost and \\\\wsl$ paths → distro + Linux path; anything else → null', () => {
    expect(fromWslUnc('\\\\wsl.localhost\\QMK\\home\\qmk\\qmk_firmware')).toEqual({ distro: 'QMK', linuxPath: '/home/qmk/qmk_firmware' });
    expect(fromWslUnc('//wsl.localhost/QMK/home/qmk')).toEqual({ distro: 'QMK', linuxPath: '/home/qmk' });
    expect(fromWslUnc('\\\\WSL$\\QMK\\home')).toEqual({ distro: 'QMK', linuxPath: '/home' });
    expect(fromWslUnc('\\\\wsl.localhost\\QMK')).toEqual({ distro: 'QMK', linuxPath: '/' });
    for (const other of ['C:\\qmk_firmware', '\\\\server\\share\\x', '/home/qmk', '\\\\wsl.localhost\\bad name\\x', '']) expect(fromWslUnc(other)).toBeNull();
  });

  it('a round trip keeps the path', () => {
    const unc = toWslUnc('QMK', '/home/qmk/qmk_firmware/keyboards/a');
    expect(fromWslUnc(unc)).toEqual({ distro: 'QMK', linuxPath: '/home/qmk/qmk_firmware/keyboards/a' });
  });

  it('folder checks work on UNC paths (keymap writes and the built firmware stay inside qmk_firmware)', () => {
    const home = '\\\\wsl.localhost\\QMK\\home\\qmk\\qmk_firmware';
    expect(insideDir(home, `${home}\\keyboards\\a\\keymaps\\navi\\keymap.c`)).toBe(true);
    expect(insideDir(home, `${home}\\..\\.bashrc`)).toBe(false);
    expect(insideDir(home, '\\\\wsl.localhost\\Ubuntu\\home\\qmk\\qmk_firmware\\x')).toBe(false);
  });

  it('qmk config home: a Linux path from WSL becomes UNC, an MSYS path becomes a drive path', () => {
    expect(homeFromConfig('/home/qmk/qmk_firmware', { kind: 'wsl', distro: 'QMK' })).toBe('\\\\wsl.localhost\\QMK\\home\\qmk\\qmk_firmware');
    expect(homeFromConfig('/c/Users/x/qmk_firmware', { kind: 'msys' })).toBe('C:\\Users\\x\\qmk_firmware');
    expect(homeFromConfig('C:\\qmk', { kind: 'path' })).toBe('C:\\qmk');
    // A UNC path typed into settings is kept as it is.
    expect(homeFromConfig('\\\\wsl.localhost\\QMK\\home\\qmk\\qmk_firmware', { kind: 'wsl', distro: 'QMK' })).toBe('\\\\wsl.localhost\\QMK\\home\\qmk\\qmk_firmware');
  });

  it('qmk config output: QMK CLI 1.2 adds "(config)" after the value; a login banner may come first', () => {
    const banner = '\x1b[0;31mWelcome to QMK WSL!\x1b[0m\n  * Documentation:    https://docs.qmk.fm\n';
    expect(parseQmkConfig(`${banner}user.qmk_home=/home/qmk/qmk_firmware (config)\n`, 'user.qmk_home')).toBe('/home/qmk/qmk_firmware');
    expect(parseQmkConfig('user.qmk_home=C:/Users/x/qmk_firmware\r\n', 'user.qmk_home')).toBe('C:/Users/x/qmk_firmware');
    expect(parseQmkConfig('user.qmk_home=None\n', 'user.qmk_home')).toBeNull();
    expect(parseQmkConfig('nothing here\n', 'user.qmk_home')).toBeNull();
  });
});

describe('qmk inside WSL: the command line', () => {
  const r = { kind: 'wsl', distro: 'QMK' };

  it('runs wsl.exe without a Windows shell; qmk args single-quoted inside bash -lc', () => {
    const cmd = qmkCommand(r, ['compile', '-kb', 'a/b', '-km', 'navi'], { cwd: '\\\\wsl.localhost\\QMK\\home\\qmk\\qmk_firmware' });
    expect(cmd.command.toLowerCase()).toMatch(/(^|\\)wsl\.exe$/);
    expect(cmd.args).toEqual(['-d', 'QMK', '--cd', '/home/qmk/qmk_firmware', '--', 'bash', '-lc', "qmk 'compile' '-kb' 'a/b' '-km' 'navi'"]);
  });

  it('without a working folder: no --cd', () => {
    expect(qmkCommand(r, ['--version']).args).toEqual(['-d', 'QMK', '--', 'bash', '-lc', "qmk '--version'"]);
  });

  it('a working folder in another distro or outside WSL is refused (the build would run elsewhere)', () => {
    expect(() => qmkCommand(r, ['--version'], { cwd: '\\\\wsl.localhost\\Ubuntu\\home' })).toThrow();
    expect(() => qmkCommand(r, ['--version'], { cwd: 'C:\\qmk_firmware' })).toThrow();
  });

  it('nothing unchecked reaches the bash string', () => {
    for (const bad of ["a'b", 'a b', '$(x)', 'a;b', 'a`b']) expect(() => qmkCommand(r, ['compile', bad])).toThrow();
    expect(() => qmkCommand({ kind: 'wsl', distro: "x'; rm -rf ~; '" }, ['--version'])).toThrow();
  });
});

describe('which QMK is used', () => {
  const none = { msys: null, qmkOnPath: null, wsl: [] };
  const msysDefault = { dir: 'C:\\QMK_MSYS', bash: 'C:\\QMK_MSYS\\usr\\bin\\bash.exe' };
  const msysOwn = { dir: 'D:\\msys', bash: 'D:\\msys\\usr\\bin\\bash.exe' };
  const distros = [
    { name: 'Ubuntu', hasQmk: false },
    { name: 'QMK', hasQmk: true },
  ];

  it('nothing found → null', () => {
    expect(chooseRunner({}, none)).toBeNull();
    expect(chooseRunner({}, { ...none, wsl: [{ name: 'Ubuntu', hasQmk: false }] })).toBeNull();
  });

  it('automatic: MSYS, then qmk on PATH, then the first distro where qmk is found (not the first listed)', () => {
    expect(chooseRunner({}, { msys: msysDefault, qmkOnPath: 'C:\\bin\\qmk.exe', wsl: distros })).toMatchObject({ kind: 'msys' });
    expect(chooseRunner({}, { msys: null, qmkOnPath: 'C:\\bin\\qmk.exe', wsl: distros })).toMatchObject({ kind: 'path' });
    expect(chooseRunner({}, { ...none, wsl: distros })).toEqual({ kind: 'wsl', distro: 'QMK' });
  });

  it('a distro picked in settings wins over everything found automatically', () => {
    expect(chooseRunner({ wsl: 'QMK' }, { msys: msysDefault, qmkOnPath: 'C:\\bin\\qmk.exe', wsl: distros })).toEqual({ kind: 'wsl', distro: 'QMK' });
    // Even when qmk wasn't found there: the user chose it, detection then reports the error.
    expect(chooseRunner({ wsl: 'Ubuntu' }, { ...none, wsl: distros })).toEqual({ kind: 'wsl', distro: 'Ubuntu' });
  });

  it('an MSYS folder set in settings wins over a picked distro', () => {
    expect(chooseRunner({ msys: 'D:\\msys', wsl: 'QMK' }, { ...none, msys: msysOwn, wsl: distros })).toMatchObject({ kind: 'msys', dir: 'D:\\msys' });
    // The set folder doesn't exist, only the default one: the picked distro wins.
    expect(chooseRunner({ msys: 'D:\\gone', wsl: 'QMK' }, { ...none, msys: msysDefault, wsl: distros })).toEqual({ kind: 'wsl', distro: 'QMK' });
  });

  it('an invalid distro name in settings is not used', () => {
    expect(chooseRunner({ wsl: "x'y" }, { ...none, wsl: distros })).toEqual({ kind: 'wsl', distro: 'QMK' });
  });
});

describe('keyboard list from a file list (built inside WSL: a walk over \\\\wsl.localhost takes minutes)', () => {
  it('same targets as the folder walk: keyboard.json, or rules.mk + info.json/config.h without keyboard.json below', () => {
    const files = [
      'a/keyboard.json',
      'b/rules.mk',
      'b/info.json',
      'c/rules.mk',
      'c/config.h',
      'c/rev1/keyboard.json',
      'c/rev2/keyboard.json',
      'd/info.json',
      'e/f/g/keyboard.json',
      'h/rules.mk',
    ];
    expect(keyboardTargets(files)).toEqual(['a', 'b', 'c/rev1', 'c/rev2', 'e/f/g']);
  });

  it('keymaps folders, hidden folders and too-deep folders are skipped', () => {
    const files = ['a/keymaps/x/keyboard.json', '.git/keyboard.json', 'b/.hidden/keyboard.json', '1/2/3/4/5/6/keyboard.json', '1/2/3/4/5/6/7/keyboard.json'];
    expect(keyboardTargets(files)).toEqual(['1/2/3/4/5/6']);
  });

  it('Windows line ends and blank lines from find are ignored', () => {
    expect(keyboardTargets(['a/keyboard.json\r', '', 'b/keyboard.json'])).toEqual(['a', 'b']);
  });
});
