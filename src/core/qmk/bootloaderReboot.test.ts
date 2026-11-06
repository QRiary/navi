import { describe, expect, it } from 'vitest';
import { loadSpec } from '../keycodes/spec';
import { createDilemmaProject } from '../project/factory';
import { activeKeymap } from '../project/ops';
import { migrateProject } from '../project/migrate';
import { PROJECT_SCHEMA_VERSION, type Project } from '../project/types';
import { serializeProject, validateProject } from '../project/validate';
import { bootloaderPacket, rawUsageOf } from './bootloaderReboot';
import { generateKeymap } from './generate';

const spec = loadSpec('latest');

function gen(opts: { on: boolean; via: boolean; pipeline: boolean; custom?: string }) {
  const base = createDilemmaProject();
  const p: Project = {
    ...base,
    firmware: {
      ...base.firmware,
      bootloaderReboot: opts.on,
      pipeline: opts.pipeline ? { enabled: true, headers: [] } : undefined,
      custom: opts.custom ? { 'keymap.c': opts.custom } : base.firmware.custom,
    },
  };
  const res = generateKeymap({ project: p, keymap: activeKeymap(p), spec, via: opts.via, encoderCount: 0 });
  const text = (name: string) => res.files.find((f) => f.name === name)?.text ?? '';
  const rules = text(opts.pipeline ? 'navi_rules.mk' : 'rules.mk');
  return { res, c: text('keymap.c'), h: text('navi.h'), rules };
}
const warn = (res: ReturnType<typeof gen>['res']) => res.issues.filter((i) => i.where === 'own pipeline: raw_hid_receive()');

describe('bootloader reboot', () => {
  it('packet: 0x4E, BOOT, zeros', () => {
    const p = bootloaderPacket();
    expect(p.length).toBe(32);
    expect([...p.slice(0, 6)]).toEqual([0x4e, 0x42, 0x4f, 0x4f, 0x54, 0]);
  });

  it('rawUsageOf: defaults, hex/decimal, last wins, comments ignored', () => {
    expect(rawUsageOf([])).toEqual({ page: 0xff60, usage: 0x61 });
    expect(rawUsageOf(['#define RAW_USAGE_PAGE 0xFF71\n#define RAW_USAGE_ID 0x61'])).toEqual({ page: 0xff71, usage: 0x61 });
    expect(rawUsageOf(['#define RAW_USAGE_PAGE 65376', '#define RAW_USAGE_PAGE (0xFF72U) // x', '#define RAW_USAGE_ID 0x62'])).toEqual({ page: 0xff72, usage: 0x62 });
    expect(rawUsageOf(['// #define RAW_USAGE_PAGE 0xFF71\n/* #define RAW_USAGE_ID 0x70\n#define RAW_USAGE_PAGE 0xFF73 */'])).toEqual({ page: 0xff60, usage: 0x61 });
  });

  it('VIA off, normal: raw_hid_receive + RAW_ENABLE + include', () => {
    const { c, rules, res } = gen({ on: true, via: false, pipeline: false });
    expect(c).toContain('#include "raw_hid.h"');
    expect(c).toContain('static bool navi_bootloader_packet');
    expect(c).toContain('void raw_hid_receive(uint8_t *data, uint8_t length) {');
    expect(c).not.toContain('via_command_kb');
    expect(rules).toContain('RAW_ENABLE = yes');
    expect(warn(res)).toEqual([]);
  });

  it('VIA on, normal: via_command_kb, no RAW_ENABLE', () => {
    const { c, rules } = gen({ on: true, via: true, pipeline: false });
    expect(c).toContain('bool via_command_kb(uint8_t *data, uint8_t length) {');
    expect(c).not.toContain('raw_hid_receive');
    expect(rules).not.toContain('RAW_ENABLE');
  });

  it('VIA off, pipeline: navi_raw_hid_receive calls the helper, RAW_ENABLE, warning', () => {
    const { c, h, rules, res } = gen({ on: true, via: false, pipeline: true });
    expect(c).toMatch(/bool navi_raw_hid_receive\(uint8_t \*data, uint8_t length\) \{\n {4}return navi_bootloader_packet/);
    expect(c).not.toContain('void raw_hid_receive');
    expect(h).toContain('bool navi_raw_hid_receive(uint8_t *data, uint8_t length);');
    expect(rules).toContain('RAW_ENABLE = yes');
    expect(warn(res)).toHaveLength(1);
  });

  it("VIA off, pipeline: no warning once the user's own C calls navi_raw_hid_receive", () => {
    const base = createDilemmaProject();
    const p: Project = { ...base, firmware: { ...base.firmware, bootloaderReboot: true, pipeline: { enabled: true, headers: [] } } };
    const ownCode = [{ path: 'general/pc_link.c', text: 'void raw_hid_receive(uint8_t *data, uint8_t length) {\n    if (navi_raw_hid_receive(data, length)) return;\n}' }];
    const res = generateKeymap({ project: p, keymap: activeKeymap(p), spec, via: false, encoderCount: 0, ownCode });
    expect(warn(res)).toEqual([]);
  });

  it('VIA on, pipeline: via_command_kb, stub returns false, no warning', () => {
    const { c, rules, res } = gen({ on: true, via: true, pipeline: true });
    expect(c).toContain('bool via_command_kb(');
    expect(c).toMatch(/bool navi_raw_hid_receive\(uint8_t \*data, uint8_t length\) \{\n {4}return false;/);
    expect(rules).not.toContain('RAW_ENABLE');
    expect(warn(res)).toEqual([]);
  });

  it('tick off: nothing but the pipeline stub', () => {
    for (const via of [false, true]) {
      const n = gen({ on: false, via, pipeline: false });
      expect(n.c).not.toMatch(/raw_hid|via_command_kb|bootloader/);
      expect(n.rules).not.toContain('RAW_ENABLE');
      const p = gen({ on: false, via, pipeline: true });
      expect(p.c).toMatch(/bool navi_raw_hid_receive\(uint8_t \*data, uint8_t length\) \{\n {4}return false;/);
      expect(p.c).not.toMatch(/navi_bootloader_packet|via_command_kb/);
      expect(p.rules).not.toContain('RAW_ENABLE');
      expect(warn(p.res)).toEqual([]);
    }
  });

  it('own lines defining the generated hooks are reported', () => {
    const own = (name: string) => `void ${name}(uint8_t *data, uint8_t length) {}`;
    const issues = (r: ReturnType<typeof gen>['res']) => r.issues.filter((i) => i.where.startsWith('keymap.c'));
    expect(issues(gen({ on: true, via: false, pipeline: false, custom: own('raw_hid_receive') }).res).length).toBeGreaterThan(0);
    expect(issues(gen({ on: true, via: true, pipeline: false, custom: own('via_command_kb') }).res).length).toBeGreaterThan(0);
    expect(issues(gen({ on: true, via: true, pipeline: true, custom: own('via_command_kb') }).res).length).toBeGreaterThan(0);
    expect(issues(gen({ on: false, via: false, pipeline: true, custom: own('navi_raw_hid_receive') }).res).length).toBeGreaterThan(0);
  });

  it('schema 15: a format 14 file opens with the tick off; validate keeps it', () => {
    const p = createDilemmaProject();
    const v14 = JSON.parse(serializeProject(p));
    v14.schemaVersion = 14;
    delete v14.firmware.bootloaderReboot;
    expect(migrateProject(v14)).toMatchObject({ from: 14, data: { schemaVersion: PROJECT_SCHEMA_VERSION, firmware: { bootloaderReboot: false } } });
    expect(validateProject(v14).project?.firmware.bootloaderReboot).toBe(false);
    const on = JSON.parse(serializeProject({ ...p, firmware: { ...p.firmware, bootloaderReboot: true } }));
    expect(validateProject(on).project?.firmware.bootloaderReboot).toBe(true);
    expect(PROJECT_SCHEMA_VERSION).toBe(15);
  });
});
