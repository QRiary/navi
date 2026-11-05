// Main process tests (without Electron): path safety, project storage, UF2, command arguments.
import { describe, expect, it, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { safeId, insideDir, joinInside, writeFileAtomic, safeFileName, unsafeSource, allowedBuildOption } = require('./safety.cjs');
const { createProjectStore } = require('./projects.cjs');
const { validateArg, validatePath, toMsysPath, qmkCommand } = require('./runner.cjs');
const { describeFirmware, scanUf2, archiveFirmware, listFirmware, firmwarePath, findBuiltFirmware } = require('./qmk.cjs');
const { checkUf2, UF2_FAMILIES, BOOTLOADERS, backupCurrentUf2 } = require('./flash.cjs');

let tmp;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'navi-test-'));
});

describe('path safety', () => {
  it('names: only letters, digits, _ . -', () => {
    expect(safeId('prj_abc-1.2')).toBe('prj_abc-1.2');
    for (const bad of ['..', '.', '../x', 'a/b', 'a\\b', 'x..y', '', 'C:x', 'a b']) expect(() => safeId(bad)).toThrow();
  });

  it('a path does not leave its folder', () => {
    expect(insideDir(tmp, path.join(tmp, 'a', 'b'))).toBe(true);
    expect(insideDir(tmp, path.join(tmp, '..', 'x'))).toBe(false);
    expect(() => joinInside(tmp, '..', 'evil')).toThrow();
    expect(safeFileName('a<b>:c?.json')).toBe('a_b__c_.json');
    expect(safeFileName('..\\..\\x')).toBe('_.._x');
  });

  it('atomic write leaves no temporary files', () => {
    const f = path.join(tmp, 'd', 'x.json');
    writeFileAtomic(f, 'one');
    writeFileAtomic(f, 'two');
    expect(fs.readFileSync(f, 'utf8')).toBe('two');
    expect(fs.readdirSync(path.dirname(f))).toEqual(['x.json']);
  });
});

describe('project storage', () => {
  const text = (name, updatedAt) => JSON.stringify({ format: 'navi.project', name, updatedAt, hardware: { name: 'kb' }, keymaps: [{ id: 'k', layers: [{}, {}] }], activeKeymapId: 'k', geometries: [{ id: 'g', keys: [{}, {}, {}] }], activeGeometryId: 'g' });

  it('draft, save, version history, delete to trash', () => {
    const store = createProjectStore(tmp);
    store.saveDraft('p1', text('A', '2026-01-01'));
    expect(store.list()).toMatchObject([{ id: 'p1', name: 'A', unsaved: true, layers: 2, keys: 3 }]);
    store.save('p1', text('A', '2026-01-02'));
    expect(store.read('p1')).toEqual({ saved: text('A', '2026-01-02'), draft: null });
    store.save('p1', text('B', '2026-01-03'), 'label_1');
    const revs = store.revisions('p1');
    expect(revs).toHaveLength(1);
    expect(revs[0].label).toBe('label_1');
    expect(store.readRevision('p1', revs[0].file)).toBe(text('A', '2026-01-02'));
    expect(() => store.readRevision('p1', '../project.json')).toThrow();
    store.remove('p1');
    expect(store.list()).toEqual([]);
    expect(fs.readdirSync(path.join(tmp, '.trash'))).toHaveLength(1);
  });

  it('restore brings the newest deleted copy back from .trash', () => {
    const store = createProjectStore(tmp);
    const text = (name) => JSON.stringify({ name, updatedAt: '2026-01-01' });
    expect(store.restore('p1')).toBe(false); // nothing deleted yet
    store.save('p1', text('A'));
    store.remove('p1');
    expect(store.list()).toEqual([]);
    expect(store.restore('p1')).toBe(true);
    expect(store.list().map((p) => p.name)).toEqual(['A']);
    expect(fs.readdirSync(path.join(tmp, '.trash'))).toHaveLength(0);
    // A taken id is not overwritten; another project's trash is not taken.
    store.save('p10', text('B'));
    store.remove('p10');
    expect(store.restore('p1')).toBe(false);
    store.save('p10', text('C'));
    expect(store.restore('p10')).toBe(false);
    expect(() => store.restore('../x')).toThrow();
  });

  it('history is limited to 50 versions', () => {
    const store = createProjectStore(tmp);
    for (let i = 0; i < 55; i++) store.save('p', text(`v${i}`, String(i)));
    expect(store.revisions('p').length).toBeLessThanOrEqual(50);
  });

  it('invalid ids and too large projects are rejected', () => {
    const store = createProjectStore(tmp);
    expect(() => store.saveDraft('../x', '{}')).toThrow();
    expect(() => store.saveDraft('p', 'x'.repeat(21 * 1024 * 1024))).toThrow(/too large/);
  });
});

describe('sources before writing to qmk_firmware', () => {
  it('rules.mk: only flags and drivers, nothing executable', () => {
    expect(unsafeSource('rules.mk', '# NAVI\nVIA_ENABLE = yes\nCONSOLE_ENABLE = yes\nSRC += extra.c\n')).toBeNull();
    expect(unsafeSource('rules.mk', 'include $(dir $(lastword $(MAKEFILE_LIST)))navi_rules.mk\nVIA_ENABLE = no\n')).toBeNull();
    for (const bad of ['include $(dir $(lastword $(MAKEFILE_LIST)))navi_rules.mk $(shell x)', 'include $(dir $(lastword $(MAKEFILE_LIST)))../navi_rules.mk']) {
      expect(unsafeSource('rules.mk', bad), bad).not.toBeNull();
    }
    for (const bad of ['X_ENABLE = $(shell calc)', 'X_ENABLE != calc', '\tcalc', 'all: ; calc', 'CC = powershell -enc AAAA', 'SHELL = cmd', 'include x.mk', 'SRC += ../x.c', 'X_ENABLE = yes\\#$(shell x)']) {
      expect(unsafeSource('rules.mk', bad), bad).not.toBeNull();
    }
  });

  it('C: only QMK headers, no files of this computer (and no workarounds)', () => {
    expect(unsafeSource('keymap.c', '#include QMK_KEYBOARD_H\n#include "print.h"\nconst char *u = "http://x/*y*/";\n')).toBeNull();
    for (const bad of [
      '#include "/etc/passwd"',
      'char *a = "/*";\n#include "C:/x.h"\nchar *b = "*/";',
      '#inc\\\nlude "/etc/passwd"',
      '%:include "../x.h"',
      '#/**/include "/x.h"',
      '#include_next <../x.h>',
      '#embed "/etc/passwd"',
      'asm(".incbin \\"/etc/passwd\\"");',
    ]) {
      expect(unsafeSource('keymap.c', bad), bad).not.toBeNull();
    }
  });

  it('qmk compile -e: only flags and drivers', () => {
    expect(allowedBuildOption('CONSOLE_ENABLE', 'yes')).toBe(true);
    expect(allowedBuildOption('CONVERT_TO', 'rp2040_ce')).toBe(true);
    for (const [k, v] of [['CC', 'powershell'], ['SHELL', 'cmd'], ['CONSOLE_ENABLE', 'yes;calc'], ['SRC', 'x.c'], ['PYTHON', 'calc']]) {
      expect(allowedBuildOption(k, v), `${k}=${v}`).toBe(false);
    }
  });
});

describe('command arguments', () => {
  it('only safe characters', () => {
    expect(validateArg('bastardkb/dilemma/4x6_4')).toBe('bastardkb/dilemma/4x6_4');
    expect(validateArg('KEY=VALUE')).toBe('KEY=VALUE');
    for (const bad of ['a b', "a'b", 'a;b', 'a|b', '$(x)', 'a`b', 'a&b', '']) expect(() => validateArg(bad)).toThrow();
    expect(() => validatePath("C:\\a'b")).toThrow();
    expect(toMsysPath('C:\\Users\\x\\qmk')).toBe('/c/Users/x/qmk');
  });

  it('qmk in MSYS runs through bash with quoted arguments', () => {
    const cmd = qmkCommand({ kind: 'msys', bash: 'C:\\QMK_MSYS\\usr\\bin\\bash.exe' }, ['compile', '-kb', 'a/b', '-km', 'navi']);
    expect(cmd.args).toEqual(['--login', '-c', "qmk 'compile' '-kb' 'a/b' '-km' 'navi'"]);
    expect(cmd.env).toMatchObject({ MSYSTEM: 'MINGW64' });
  });
});

/** Minimal UF2: one 512-byte block with the familyID flag. */
function uf2(family) {
  const b = Buffer.alloc(512);
  b.writeUInt32LE(0x0a324655, 0);
  b.writeUInt32LE(0x9e5d5157, 4);
  b.writeUInt32LE(0x2000, 8); // flag: has familyID
  b.writeUInt32LE(0x10000000, 12);
  b.writeUInt32LE(256, 16);
  b.writeUInt32LE(0, 20);
  b.writeUInt32LE(1, 24);
  b.writeUInt32LE(family >>> 0, 28);
  b.writeUInt32LE(0x0ab16f30, 508);
  return b;
}

describe('firmware', () => {
  it('UF2 format and family are detected from the content', () => {
    const f = path.join(tmp, 'a.uf2');
    fs.writeFileSync(f, uf2(0xe48bff56));
    expect(describeFirmware(f)).toMatchObject({ format: 'uf2', uf2Family: 0xe48bff56 });
    const hex = path.join(tmp, 'b.hex');
    fs.writeFileSync(hex, ':100000000C9434000C9446000C9446000C9446006A\n');
    expect(describeFirmware(hex).format).toBe('hex');
  });

  it('UF2 for another chip is not written to an RP2040 drive', () => {
    const rp2040 = path.join(tmp, 'ok.uf2');
    const rp2350 = path.join(tmp, 'bad.uf2');
    fs.writeFileSync(rp2040, uf2(0xe48bff56));
    fs.writeFileSync(rp2350, uf2(0xe48bff59));
    const drive = { boardId: 'RPI-RP2' };
    expect(checkUf2(rp2040, drive)).toMatchObject({ ok: true });
    expect(checkUf2(rp2350, drive)).toMatchObject({ ok: false, reason: 'family-mismatch' });
    expect(checkUf2(rp2040, { boardId: 'SOME-BOARD' })).toMatchObject({ ok: true, unverified: true });
    const notUf2 = path.join(tmp, 'x.uf2');
    fs.writeFileSync(notUf2, 'hello');
    expect(checkUf2(notUf2, drive)).toMatchObject({ ok: false, reason: 'not-uf2' });
    expect(UF2_FAMILIES['RPI-RP2']).toEqual([0xe48bff56]);
    expect(BOOTLOADERS.some(([type, vid, pid]) => type === 'stm32-dfu' && vid === '0483' && pid === 'df11')).toBe(true);
  });

  it('archive: copy with sha256, list, paths only inside the archive', () => {
    const src = path.join(tmp, 'built.uf2');
    fs.writeFileSync(src, uf2(0xe48bff56));
    const dir = path.join(tmp, 'fw');
    const info = archiveFirmware(dir, src, { source: 'build', keyboard: 'a/b', keymap: 'navi' });
    expect(info).toMatchObject({ format: 'uf2', size: 512, keyboard: 'a/b' });
    expect(info.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(listFirmware(dir).map((x) => x.id)).toEqual([info.id]);
    expect(firmwarePath(dir, info.id)).toBe(path.join(dir, info.id, 'built.uf2'));
    expect(() => firmwarePath(dir, '../x')).toThrow();
    expect(() => archiveFirmware(dir, path.join(tmp, 'x.exe'), {})).toThrow();
  });

  it('the build file is found from the qmk compile output', () => {
    fs.writeFileSync(path.join(tmp, 'a_b_navi.uf2'), 'x');
    expect(findBuiltFirmware({ home: tmp, userspace: null, kb: 'a/b', km: 'navi', output: 'Copying a_b_navi.uf2 to qmk_firmware folder', before: {} })).toBe(path.join(tmp, 'a_b_navi.uf2'));
    expect(findBuiltFirmware({ home: tmp, userspace: null, kb: 'a/b', km: 'other', output: '', before: {} })).toBeNull();
  });

  it('UF2 is parsed over all blocks: addresses, size, family; a broken file — null', () => {
    const blocks = [0, 1, 2].map((i) => {
      const b = uf2(0xe48bff56);
      b.writeUInt32LE(0x10000000 + i * 256, 12);
      return b;
    });
    const f = path.join(tmp, 'three.uf2');
    fs.writeFileSync(f, Buffer.concat(blocks));
    expect(scanUf2(f)).toEqual({ blocks: 3, family: 0xe48bff56, mixedFamily: false, start: 0x10000000, end: 0x10000300, bytes: 768 });
    const broken = Buffer.concat(blocks);
    broken.writeUInt32LE(0, 512 + 508);
    fs.writeFileSync(f, broken);
    expect(scanUf2(f)).toBeNull();
    fs.writeFileSync(f, Buffer.concat(blocks).subarray(0, 700));
    expect(scanUf2(f)).toBeNull();
  });

  it('current firmware backup: CURRENT.UF2 from the bootloader drive goes to the archive, nothing is written to the “drive”', async () => {
    const drive = path.join(tmp, 'drive');
    fs.mkdirSync(drive);
    const noFamily = (addr) => {
      const b = uf2(0);
      b.writeUInt32LE(0, 8); // no family — this happens with backups
      b.writeUInt32LE(addr, 12);
      return b;
    };
    fs.writeFileSync(path.join(drive, 'CURRENT.UF2'), Buffer.concat([noFamily(0x10000000), noFamily(0x10000100)]));
    fs.writeFileSync(path.join(drive, 'INFO_UF2.TXT'), 'UF2 Bootloader v3.0\nModel: Raspberry Pi RP2\nBoard-ID: RPI-RP2\n');
    const before = fs.readdirSync(drive).sort();
    const dir = path.join(tmp, 'fw');
    const seen = [];
    const info = await backupCurrentUf2({ root: drive, boardId: 'RPI-RP2', model: 'Raspberry Pi RP2' }, dir, (done, total) => seen.push([done, total]));
    expect(info).toMatchObject({ source: 'backup', boardId: 'RPI-RP2', format: 'uf2', size: 1024, flash: { start: 0x10000000, end: 0x10000200, bytes: 512, blocks: 2 } });
    expect(info.file).toMatch(/^backup-\d{4}-\d\d-\d\d-RPI-RP2\.uf2$/);
    expect(seen.at(-1)).toEqual([1024, 1024]);
    expect(fs.readdirSync(drive).sort()).toEqual(before);
    // A backup can be restored to a bootloader of the same type even though the family is not in the blocks.
    const file = firmwarePath(dir, info.id);
    expect(checkUf2(file, { boardId: 'RPI-RP2' }, info)).toMatchObject({ ok: true, backup: true });
    expect(checkUf2(file, { boardId: 'RPI-RP2' }, { ...info, source: 'import' })).toMatchObject({ ok: false, reason: 'family-mismatch' });
    expect(checkUf2(file, { boardId: 'RP2350' }, info)).toMatchObject({ ok: false });
    // A broken CURRENT.UF2 is not saved.
    fs.writeFileSync(path.join(drive, 'CURRENT.UF2'), 'not uf2');
    await expect(backupCurrentUf2({ root: drive, boardId: 'RPI-RP2' }, dir)).rejects.toThrow(/not a valid UF2/);
    fs.rmSync(path.join(drive, 'CURRENT.UF2'));
    await expect(backupCurrentUf2({ root: drive, boardId: 'RPI-RP2' }, dir)).rejects.toThrow(/no CURRENT\.UF2/);
    expect(listFirmware(dir)).toHaveLength(1);
  });
});

describe('main process files', () => {
  it('every .cjs is syntactically valid (otherwise the app does not start)', async () => {
    const vm = await import('node:vm');
    const dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.cjs'))) {
      const code = fs.readFileSync(path.join(dir, f), 'utf8');
      expect(() => new vm.Script(`(function (exports, require, module, __filename, __dirname) {${code}\n})`, { filename: f }), f).not.toThrow();
    }
  });

  it('the interface page is served with a strict CSP', () => {
    const dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
    const main = fs.readFileSync(path.join(dir, 'main.cjs'), 'utf8');
    expect(main).toContain("headers.set('Content-Security-Policy', CSP)");
    expect(main).toContain(`"script-src 'self'"`);
    expect(main).toContain(`"object-src 'none'"`);
    expect(main).not.toMatch(/unsafe-eval/);
  });
});
